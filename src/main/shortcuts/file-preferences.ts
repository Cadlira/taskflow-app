import { open, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { defaultShortcutActions, isShortcutPreferences, sameShortcut, SHORTCUT_ACTIONS } from '../../domain/global-shortcuts.js'
import type { ShortcutPreferences } from '../../domain/global-shortcuts.js'
import { SHORTCUT_PREFERENCES_BYTES } from '../../application/shortcuts/shortcut-ports.js'
import type { ShortcutPreferencesRead, ShortcutPreferencesStore, ShortcutPreferencesWrite } from '../../application/shortcuts/shortcut-ports.js'

export type PreferencesFaultPoint = 'read:before' | 'temp:open' | 'temp:write' | 'temp:flush' | 'temp:readback' |
  'previous:write' | 'previous:readback' | 'publication:before' | 'publication:after' | 'publication:readback' | 'cleanup:before'
export interface PreferencesFaults { at?(point: PreferencesFaultPoint): void | Promise<void> }
type FileRead = { missing: true } | { missing: false; bytes: Buffer; preferences: ShortcutPreferences }
function missing(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT' }
function same(a: ShortcutPreferences, b: ShortcutPreferences): boolean {
  return a.revision === b.revision && SHORTCUT_ACTIONS.every(action => sameShortcut(a.actions[action], b.actions[action]))
}
function defaults(): ShortcutPreferences { return { version: 1, revision: '0', actions: defaultShortcutActions() } }

/** Paths constantes main; nunca lê/reescreve backup, SQL, HKCU ou um destino recebido do renderer. */
export class FileShortcutPreferences implements ShortcutPreferencesStore {
  readonly file: string
  readonly temporary: string
  readonly previous: string
  #uncertain = false
  #active = false
  constructor(userData: string, readonly faults: PreferencesFaults = {}) {
    this.file = path.join(userData, 'shortcuts.json')
    this.temporary = path.join(userData, 'shortcuts.json.temporary')
    this.previous = path.join(userData, 'shortcuts.json.previous')
  }
  get uncertain(): boolean { return this.#uncertain }
  async #readFile(file: string): Promise<FileRead> {
    let handle: FileHandle | undefined
    try {
      handle = await open(file, 'r')
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > SHORTCUT_PREFERENCES_BYTES) throw new Error('PREFERENCES_INVALID')
      const buffer = Buffer.alloc(SHORTCUT_PREFERENCES_BYTES + 1)
      let count = 0
      for (;;) {
        const read = await handle.read(buffer, count, buffer.length - count, count)
        if (read.bytesRead === 0) break
        count += read.bytesRead
        if (count > SHORTCUT_PREFERENCES_BYTES) throw new Error('PREFERENCES_INVALID')
      }
      const bytes = buffer.subarray(0, count)
      const text = bytes.toString('utf8')
      if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('PREFERENCES_INVALID')
      const value: unknown = JSON.parse(text)
      if (!isShortcutPreferences(value)) throw new Error('PREFERENCES_INVALID')
      // Reconstruir ordem canônica, sem depender da ordem de chaves no JSON externo.
      const preferences: ShortcutPreferences = { version: 1, revision: value.revision, actions: {
        QUICK_ADD: value.actions.QUICK_ADD, OPEN_TASK_MANAGER: value.actions.OPEN_TASK_MANAGER, CAPTURE_CLIPBOARD: value.actions.CAPTURE_CLIPBOARD,
      } }
      return { missing: false, bytes: Buffer.from(bytes), preferences }
    } catch (error) {
      if (handle === undefined && missing(error)) return { missing: true }
      throw error
    } finally { await handle?.close() }
  }
  async read(): Promise<ShortcutPreferencesRead> {
    if (this.#uncertain) return { ok: false, code: 'UNKNOWN' }
    try {
      await this.faults.at?.('read:before')
      const result = await this.#readFile(this.file)
      return { ok: true, preferences: result.missing ? defaults() : result.preferences, missing: result.missing }
    } catch { return { ok: false, code: 'PREFERENCES_INVALID' } }
  }
  async #write(handle: FileHandle, bytes: Buffer): Promise<void> {
    let offset = 0
    while (offset < bytes.length) {
      const written = await handle.write(bytes, offset, bytes.length - offset)
      if (written.bytesWritten <= 0) throw new Error('PREFERENCES_WRITE_FAILED')
      offset += written.bytesWritten
    }
  }
  async publish(expected: ShortcutPreferences, next: ShortcutPreferences): Promise<ShortcutPreferencesWrite> {
    if (this.#uncertain) return { ok: false, code: 'UNKNOWN' }
    if (this.#active) return { ok: false, code: 'UNAVAILABLE' }
    if (!isShortcutPreferences(expected) || !isShortcutPreferences(next)) return { ok: false, code: 'PREFERENCES_INVALID' }
    const bytes = Buffer.from(JSON.stringify(next), 'utf8')
    if (bytes.length > SHORTCUT_PREFERENCES_BYTES) return { ok: false, code: 'RESOURCE_LIMIT' }
    this.#active = true
    try {
      const result = await this.#publishUnit(expected, next, bytes)
      return this.#uncertain ? { ok: false, code: 'UNKNOWN' } : result
    } finally { this.#active = false }
  }
  async #publishUnit(expected: ShortcutPreferences, next: ShortcutPreferences, bytes: Buffer): Promise<ShortcutPreferencesWrite> {
    let ownTemporary = false, attemptedPublication = false
    let handle: FileHandle | undefined
    try {
      await this.faults.at?.('read:before')
      const original = await this.#readFile(this.file)
      const current = original.missing ? defaults() : original.preferences
      if (!same(current, expected)) return { ok: false, code: 'STALE_SETTINGS' }
      if (same(current, next)) return { ok: true, preferences: current }
      if (BigInt(next.revision) !== BigInt(current.revision) + 1n) return { ok: false, code: 'STALE_SETTINGS' }
      await this.faults.at?.('temp:open')
      // Um único temporário; órfão anterior é preservado e bloqueia, nunca é sobrescrito.
      handle = await open(this.temporary, 'wx', 0o600); ownTemporary = true
      await this.faults.at?.('temp:write'); await this.#write(handle, bytes)
      await this.faults.at?.('temp:flush'); await handle.sync(); await handle.close(); handle = undefined
      await this.faults.at?.('temp:readback')
      const temporary = await this.#readFile(this.temporary)
      if (temporary.missing || !temporary.bytes.equals(bytes)) throw new Error('PREFERENCES_WRITE_FAILED')
      if (!original.missing) {
        await this.faults.at?.('previous:write')
        handle = await open(this.previous, 'w', 0o600)
        await this.#write(handle, original.bytes); await handle.sync(); await handle.close(); handle = undefined
        await this.faults.at?.('previous:readback')
        const previous = await this.#readFile(this.previous)
        if (previous.missing || !previous.bytes.equals(original.bytes)) throw new Error('PREFERENCES_WRITE_FAILED')
      }
      await this.faults.at?.('publication:before')
      const rechecked = await this.#readFile(this.file)
      if (original.missing !== rechecked.missing || (!original.missing && !rechecked.missing && !original.bytes.equals(rechecked.bytes))) {
        return { ok: false, code: 'STALE_SETTINGS' }
      }
      attemptedPublication = true
      await rename(this.temporary, this.file); ownTemporary = false
      await this.faults.at?.('publication:after'); await this.faults.at?.('publication:readback')
      const confirmed = await this.#readFile(this.file)
      if (confirmed.missing || !confirmed.bytes.equals(bytes)) throw new Error('PREFERENCES_UNKNOWN')
      return { ok: true, preferences: confirmed.preferences }
    } catch (error) {
      if (attemptedPublication || (!ownTemporary && typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) {
        this.#uncertain = true; return { ok: false, code: 'UNKNOWN' }
      }
      return { ok: false, code: 'UNAVAILABLE' }
    } finally {
      try { await handle?.close() } catch { this.#uncertain = true }
      if (ownTemporary && !this.#uncertain) {
        try { await this.faults.at?.('cleanup:before'); await unlink(this.temporary) } catch { this.#uncertain = true }
      }
    }
  }
  async reconcile(): Promise<ShortcutPreferencesRead> {
    if (this.#active) return { ok: false, code: 'UNKNOWN' }
    try {
      const result = await this.#readFile(this.file)
      // Nunca restaura previous nem aplica temporary. Gesto explícito descarta somente temp próprio.
      try { await unlink(this.temporary) } catch (error) { if (!missing(error)) throw error }
      this.#uncertain = false
      return { ok: true, preferences: result.missing ? defaults() : result.preferences, missing: result.missing }
    } catch { return { ok: false, code: 'PREFERENCES_INVALID' } }
  }
}
