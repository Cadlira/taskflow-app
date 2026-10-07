import { defaultShortcutActions, hasDuplicateShortcuts, isShortcutAction, isShortcutCombination, sameShortcut, SHORTCUT_ACTIONS } from '../../domain/global-shortcuts.js'
import type { ShortcutAction, ShortcutCombination, ShortcutPreferences } from '../../domain/global-shortcuts.js'
import { entryFailure } from '../../contracts/capture-shortcuts.js'
import type { EntryErrorCode, SetShortcutRequest, ShortcutSettings, ShortcutSettingsResult } from '../../contracts/capture-shortcuts.js'
import type { ShortcutClock, ShortcutObservation, ShortcutPreferencesStore, ShortcutReason, ShortcutRegistry } from './shortcut-ports.js'

interface Owned { action: ShortcutAction; combination: ShortcutCombination; active: boolean }
interface Job { request: SetShortcutRequest; current(): boolean; resolve(result: ShortcutSettingsResult): void; cancel(): void }
export interface ShortcutControllerOptions {
  registry: ShortcutRegistry
  preferences: ShortcutPreferencesStore
  clock: ShortcutClock
  nativeEnabled: boolean
  invoke(action: ShortcutAction): void
  changed?(): void
}
/** Fila distinta do SQL, preferências CAS e callbacks gated até confirmação nativa/durável. */
export class ShortcutController {
  #preferences: ShortcutPreferences = { version: 1, revision: '0', actions: defaultShortcutActions() }
  readonly #owned: Owned[] = []
  readonly #unavailable = new Map<ShortcutAction, ShortcutReason>()
  readonly #unknown = new Set<ShortcutAction>()
  readonly #queue: Job[] = []
  #fileUnknown = false
  #fileInvalid = false
  #running = false
  #suspended = false
  #quitting = false
  #lease: string | undefined
  #sequence = 1n
  readonly #idle = new Set<() => void>()
  constructor(readonly options: ShortcutControllerOptions) {}
  get editing(): boolean { return this.#lease !== undefined }
  async start(): Promise<void> {
    const read = await this.options.preferences.read()
    if (!read.ok) { this.#fileInvalid = read.code === 'PREFERENCES_INVALID'; this.#fileUnknown = read.code === 'UNKNOWN'; this.#publish(); return }
    this.#preferences = read.preferences
    for (const action of SHORTCUT_ACTIONS) {
      const combo = this.#preferences.actions[action]
      if (combo === null) continue
      if (!this.options.nativeEnabled) { this.#unavailable.set(action, 'PROFILE_DISABLED'); continue }
      const result = this.#register(action, combo)
      if (result.ok) result.owned.active = true
    }
    this.#publish()
  }
  #publish(): void {
    if (this.#sequence.toString().length >= 32 && this.#sequence === BigInt('9'.repeat(32))) {
      this.#quitting = true
    } else this.#sequence += 1n
    this.options.changed?.()
  }
  #settings(): ShortcutSettings {
    const actions = SHORTCUT_ACTIONS.map((action): ShortcutObservation => {
      const desired = this.#fileInvalid ? null : this.#preferences.actions[action]
      const base = { action, desired: desired === null ? null : { ...desired } }
      if (this.#fileUnknown || this.#unknown.has(action)) return { ...base, observed: 'UNKNOWN' }
      if (this.#fileInvalid) return { ...base, observed: 'UNAVAILABLE', reason: 'PREFERENCES_INVALID' }
      if (desired === null) return { ...base, observed: 'NONE' }
      if (this.#suspended || this.editing) return { ...base, observed: 'UNAVAILABLE', reason: 'SUSPENDED' }
      const active = this.#owned.find(item => item.action === action && item.active && sameShortcut(item.combination, desired))
      if (active) {
        try { if (this.options.registry.isRegistered(active.combination)) return { ...base, observed: 'REGISTERED' } }
        catch { this.#unknown.add(action); active.active = false; return { ...base, observed: 'UNKNOWN' } }
      }
      return { ...base, observed: 'UNAVAILABLE', reason: this.#unavailable.get(action) ?? 'NATIVE_FAILURE' }
    })
    return { configRevision: this.#preferences.revision, statusSequence: this.#sequence.toString(), actions,
      editing: this.editing, settersBlocked: this.#fileInvalid || this.#fileUnknown || this.#quitting }
  }
  async settings(): Promise<ShortcutSettingsResult> {
    if (!this.#running && !this.#fileUnknown) {
      const sequence = this.#sequence
      const read = await this.options.preferences.read()
      // Uma consulta iniciada antes de rebind/lease não pode regredir a configuração confirmada.
      if (this.#running || sequence !== this.#sequence) return { version: 1, status: 'ok', settings: this.#settings() }
      if (!read.ok) { this.#fileInvalid = read.code === 'PREFERENCES_INVALID'; this.#fileUnknown = read.code === 'UNKNOWN' }
      else { this.#fileInvalid = false; this.#sync(read.preferences) }
    }
    return { version: 1, status: 'ok', settings: this.#settings() }
  }
  #sync(preferences: ShortcutPreferences): void {
    for (const action of SHORTCUT_ACTIONS) {
      if (!sameShortcut(this.#preferences.actions[action], preferences.actions[action])) {
        this.#gate(action); this.#unknown.add(action)
      }
    }
    this.#preferences = preferences
  }
  set(request: SetShortcutRequest, current: () => boolean): Promise<ShortcutSettingsResult> {
    if (this.#quitting || !current()) return Promise.resolve(entryFailure('SESSION_CLOSED'))
    if (this.#queue.length >= 8) return Promise.resolve(entryFailure('BUSY'))
    return new Promise(resolve => {
      const job: Job = { request, current, resolve, cancel: () => undefined }
      job.cancel = this.options.clock.arm(2000, () => {
        const index = this.#queue.indexOf(job)
        if (index >= 0) { this.#queue.splice(index, 1); resolve(entryFailure('BUSY')) }
      })
      this.#queue.push(job)
      void this.#drain()
    })
  }
  async #drain(): Promise<void> {
    if (this.#running) return
    this.#running = true
    try {
      for (;;) {
        const job = this.#queue.shift()
        if (!job) break
        job.cancel()
        try { job.resolve(await this.#set(job.request, job.current)) }
        catch { this.#fileUnknown = true; this.#gate(job.request.action); this.#publish(); job.resolve(entryFailure('UNKNOWN')) }
      }
    } finally { this.#running = false; for (const resolve of this.#idle) resolve(); this.#idle.clear() }
  }
  async #set(request: SetShortcutRequest, current: () => boolean): Promise<ShortcutSettingsResult> {
    if (!current() || this.#quitting) return entryFailure('SESSION_CLOSED')
    if (!isShortcutAction(request.action) || (request.combination !== null && !isShortcutCombination(request.combination))) return entryFailure('INVALID_REQUEST')
    // Mesmo setter no-op é gesto explícito de reconciliação; nunca replay automático do setter perdido.
    if (this.#fileUnknown && !sameShortcut(this.#preferences.actions[request.action], request.combination)) return entryFailure('UNKNOWN')
    const read = this.#fileUnknown ? await this.options.preferences.reconcile() : await this.options.preferences.read()
    if (!read.ok) { this.#fileInvalid = read.code === 'PREFERENCES_INVALID'; this.#fileUnknown = read.code === 'UNKNOWN'; this.#publish(); return entryFailure(read.code) }
    this.#fileInvalid = false; this.#fileUnknown = false; this.#sync(read.preferences)
    if (!current() || this.#quitting) return entryFailure('SESSION_CLOSED')
    if (request.expectedConfigRevision !== this.#preferences.revision) return entryFailure('STALE_SETTINGS')
    const action = request.action, desired = request.combination
    const nextActions = { ...this.#preferences.actions, [action]: desired }
    if (hasDuplicateShortcuts(nextActions) || this.#owned.some(item => item.action !== action && sameShortcut(item.combination, desired))) return entryFailure('INVALID_REQUEST')
    const old = this.#preferences.actions[action]
    const noOp = sameShortcut(old, desired)
    if (noOp && !this.#unknown.has(action)) {
      const active = this.#owned.find(item => item.action === action && item.active && sameShortcut(item.combination, desired))
      if (desired === null && !this.#owned.some(item => item.action === action)) return { version: 1, status: 'ok', settings: this.#settings() }
      if (active) {
        try {
          if (this.options.registry.isRegistered(active.combination)) return { version: 1, status: 'ok', settings: this.#settings() }
        } catch { this.#gate(action) }
        this.#unknown.add(action)
      }
    }
    if (noOp || this.#unknown.has(action)) {
      if (!noOp) return entryFailure('UNKNOWN')
      if (!this.#cleanup(action)) { this.#unknown.add(action); this.#publish(); return entryFailure('UNKNOWN') }
      this.#unknown.delete(action)
      if (desired !== null) {
        if (!this.options.nativeEnabled) this.#unavailable.set(action, 'PROFILE_DISABLED')
        else {
          const registration = this.#register(action, desired)
          if (!registration.ok) { this.#publish(); return entryFailure(registration.code) }
          registration.owned.active = true
        }
      }
      this.#publish(); return { version: 1, status: 'ok', settings: this.#settings() }
    }
    if (BigInt(this.#preferences.revision) + 1n >= 10n ** 32n) return entryFailure('RESOURCE_LIMIT')
    let provisional: Owned | undefined
    if (desired !== null) {
      if (!this.options.nativeEnabled) return entryFailure('UNAVAILABLE')
      const registration = this.#register(action, desired)
      if (!registration.ok) { this.#publish(); return entryFailure(registration.code) }
      provisional = registration.owned
    }
    if (desired === null) this.#gate(action)
    const previous = this.#preferences
    const next: ShortcutPreferences = { version: 1, revision: (BigInt(previous.revision) + 1n).toString(), actions: nextActions }
    const written = await this.options.preferences.publish(previous, next)
    if (!written.ok) {
      if (written.code === 'UNKNOWN') { this.#fileUnknown = true; this.#gate(action) }
      else {
        const cleaned = !provisional || this.#remove(provisional)
        if (!cleaned || !this.#restore(action, old)) this.#unknown.add(action)
      }
      this.#publish(); return entryFailure(this.#fileUnknown || this.#unknown.has(action) ? 'UNKNOWN' : written.code)
    }
    this.#preferences = written.preferences
    if (provisional) provisional.active = !this.#quitting
    const cleaned = this.#cleanup(action, provisional)
    if (!cleaned) { this.#gate(action); this.#unknown.add(action); this.#publish(); return entryFailure('UNKNOWN') }
    this.#unknown.delete(action); this.#unavailable.delete(action); this.#publish()
    return { version: 1, status: 'ok', settings: this.#settings() }
  }
  #register(action: ShortcutAction, combination: ShortcutCombination): { ok: true; owned: Owned } | { ok: false; code: EntryErrorCode } {
    const owned: Owned = { action, combination: { ...combination }, active: false }
    this.#owned.push(owned)
    let reason: ShortcutReason = 'CONFLICT'
    try {
      const registered = this.options.registry.register(owned.combination, () => {
        if (owned.active && !this.#quitting && !this.#suspended && !this.editing && !this.#fileInvalid && !this.#fileUnknown && !this.#unknown.has(action)) {
          this.options.invoke(action)
        }
      })
      if (registered && this.options.registry.isRegistered(owned.combination)) return { ok: true, owned }
      if (registered) reason = 'NATIVE_FAILURE'
    } catch { reason = 'NATIVE_FAILURE' }
    this.#unavailable.set(action, reason)
    if (!this.#remove(owned)) { this.#gate(action); this.#unknown.add(action); return { ok: false, code: 'UNKNOWN' } }
    return { ok: false, code: 'UNAVAILABLE' }
  }
  #gate(action: ShortcutAction): void { for (const item of this.#owned) if (item.action === action) item.active = false }
  #restore(action: ShortcutAction, old: ShortcutCombination | null): boolean {
    if (old === null) return true
    const previous = this.#owned.find(item => item.action === action && sameShortcut(item.combination, old))
    if (!previous) return this.#unavailable.has(action)
    try { previous.active = this.options.registry.isRegistered(previous.combination); return previous.active }
    catch { previous.active = false; return false }
  }
  #remove(owned: Owned): boolean {
    owned.active = false
    try { this.options.registry.unregister(owned.combination) } catch { /* Releitura própria é autoridade do cleanup. */ }
    try {
      if (this.options.registry.isRegistered(owned.combination)) return false
      const index = this.#owned.indexOf(owned)
      if (index >= 0) this.#owned.splice(index, 1)
      return true
    } catch { return false }
  }
  #cleanup(action: ShortcutAction, keep?: Owned): boolean {
    let complete = true
    for (const item of [...this.#owned]) if (item.action === action && item !== keep && !this.#remove(item)) complete = false
    return complete
  }
  setEditing(documentId: string, editing: boolean): void {
    if (editing) this.#lease = documentId
    else if (this.#lease === documentId) this.#lease = undefined
    this.#publish()
  }
  releaseEditing(documentId: string): void { if (this.#lease === documentId) { this.#lease = undefined; this.#publish() } }
  releaseAllEditing(): void { if (this.#lease !== undefined) { this.#lease = undefined; this.#publish() } }
  suspend(suspended: boolean): void { this.#suspended = suspended; if (suspended) this.#lease = undefined; this.#publish() }
  async stop(): Promise<void> {
    this.#quitting = true; this.#lease = undefined
    for (const job of this.#queue.splice(0)) { job.cancel(); job.resolve(entryFailure('SESSION_CLOSED')) }
    if (this.#running) await new Promise<void>(resolve => this.#idle.add(resolve))
    for (const item of [...this.#owned]) this.#remove(item)
    this.#publish()
  }
}
