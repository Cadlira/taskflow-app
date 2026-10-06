import { canDeliverReminder, type ReminderOccurrenceKey } from '../../domain/task-reminders.js'
import { ReminderIndex, REMINDER_INDEX_BYTES, type ReminderProjection } from './reminder-index.js'
import type { ReminderReservation, ReminderServicePorts, ReminderServiceStatus } from './reminder-ports.js'

export const REMINDER_RUNTIME_LIMITS = {
  page: 128, fallbackMs: 60_000, capacity: 16, submissionMs: 10_000,
  capacityRecheckMs: 1_000, maxDelayMs: 2_147_483_647, restarts: 3, sliceMs: 10,
} as const
interface PendingSubmission {
  key: ReminderOccurrenceKey
  deadline: number
  close: ((cancel: boolean) => void) | undefined
  released: boolean
}

/** Projeção descartável portátil. Relógio/estado persistido continuam sendo autoridade. */
export class ReminderService {
  readonly #dirty = new Set<string>()
  readonly #submissions = new Set<PendingSubmission>()
  #index: ReminderIndex | undefined
  #cancelAgenda: (() => void) | undefined
  #status: ReminderServiceStatus = 'RECOVERING'
  #epoch = 0
  #reset = 0
  #needRebuild = true
  #busy = false
  #stopped = false
  #suspended = false
  #fallbackAt = 0
  #journalCharge = 0
  constructor(readonly ports: ReminderServicePorts, readonly memoryLimit = REMINDER_INDEX_BYTES) {}
  get epoch(): number { return this.#epoch }
  get status(): ReminderServiceStatus { return this.#status }
  get pendingSubmissions(): number { return this.#submissions.size }
  get charge(): number { return (this.#index?.charge ?? 0) + this.#journalCharge }
  get occurrences(): number { return this.#index?.size ?? 0 }
  get busy(): boolean { return this.#busy }
  ready(): boolean { return !this.#stopped && !this.#suspended && this.ports.ready() }
  resolve(tag: string): ReminderOccurrenceKey | undefined {
    return this.#status === 'READY' ? this.#index?.resolve(tag) : undefined
  }

  /** Conclusão in-memory: não lê, agenda SQL nem chama notifier. */
  dirty(ids: readonly string[]): void {
    this.#epoch += 1
    for (const id of ids) {
      if (!this.#dirty.has(id)) { this.#dirty.add(id); this.#journalCharge += 128 + 2 * id.length }
    }
    if (this.charge > this.memoryLimit) {
      this.#needRebuild = true
      this.#reset += 1
      this.#index = undefined
      this.#dirty.clear(); this.#journalCharge = 0
      this.#setStatus('RESOURCE_LIMIT')
    }
  }
  /** Backup APPLIED/UNCHANGED/empty e storage-recovered também chamam esta barreira. */
  reset(): void {
    this.#epoch += 1; this.#reset += 1; this.#needRebuild = true
  }
  consumed(key: ReminderOccurrenceKey): void { this.#index?.consume(key) }
  suspend(): void {
    this.#suspended = true; this.#epoch += 1
    this.#cancelAgenda?.(); this.#cancelAgenda = undefined
    this.#setStatus('SUSPENDED')
  }
  resume(): void { this.#suspended = false; this.reset(); this.wake() }
  stop(): void {
    this.#stopped = true; this.#epoch += 1
    this.#cancelAgenda?.(); this.#cancelAgenda = undefined
    for (const pending of [...this.#submissions]) this.#release(pending, true)
    this.#dirty.clear(); this.#journalCharge = 0; this.#index = undefined
    this.#setStatus('STOPPED')
  }

  /** Composição chama fora da unidade; a agenda única coalesce todos os produtores. */
  wake(): void {
    if (!this.ready() || this.#busy) return
    this.#arm(0)
  }
  async recover(): Promise<boolean> {
    if (!this.ready() || this.#busy) return false
    this.#cancelAgenda?.(); this.#cancelAgenda = undefined
    this.#busy = true
    let recovered = false
    try { recovered = await this.#rebuild(); return recovered }
    finally { this.#busy = false; this.#scheduleNext(recovered ? 0 : REMINDER_RUNTIME_LIMITS.fallbackMs) }
  }
  #setStatus(status: ReminderServiceStatus): void {
    if (this.#status === status) return
    this.#status = status; this.ports.statusChanged(status)
  }
  #arm(delayMs: number): void {
    this.#cancelAgenda?.()
    this.#cancelAgenda = this.ports.arm(Math.max(0, Math.min(delayMs, REMINDER_RUNTIME_LIMITS.maxDelayMs)), () => {
      this.#cancelAgenda = undefined
      void this.#tick()
    })
  }
  #release(pending: PendingSubmission, cancel = false): void {
    if (pending.released) return
    pending.released = true
    this.#submissions.delete(pending)
    try { pending.close?.(cancel) } catch { /* Cancelamento disponível é melhor esforço. */ }
    if (!this.#busy && this.ready()) this.wake()
  }
  #reserve(key: ReminderOccurrenceKey): ReminderReservation | undefined {
    if (this.#submissions.size >= REMINDER_RUNTIME_LIMITS.capacity) return undefined
    const pending: PendingSubmission = {
      key, deadline: this.ports.monotonic() + REMINDER_RUNTIME_LIMITS.submissionMs,
      close: undefined, released: false,
    }
    this.#submissions.add(pending)
    return {
      valid: () => !pending.released && this.ready(),
      release: () => this.#release(pending),
      submit: (candidate) => {
        const close = this.ports.submit(candidate, () => this.#release(pending))
        pending.close = close
        // Callback síncrono pode ter liberado antes de submit retornar seu disposer.
        if (pending.released) { try { close(false) } catch { /* Sem retry. */ } }
      },
    }
  }
  #takeDirty(): string[] {
    const ids: string[] = []
    for (const id of this.#dirty) {
      ids.push(id); this.#dirty.delete(id); this.#journalCharge -= 128 + 2 * id.length
      if (ids.length === REMINDER_RUNTIME_LIMITS.page) break
    }
    return ids
  }
  #replace(index: ReminderIndex, id: string, reminders: readonly ReminderProjection[]): boolean {
    if (!index.replace(id, reminders) || index.charge + this.#journalCharge > this.memoryLimit) {
      this.#index = undefined; this.#needRebuild = true; this.#setStatus('RESOURCE_LIMIT')
      return false
    }
    return true
  }
  async #flushDirty(index: ReminderIndex): Promise<boolean> {
    // Fatia finita: alterações adicionais permanecem journalizadas para o próximo macrotask.
    const ids = this.#takeDirty()
    if (ids.length === 0) return true
    for (const pending of [...this.#submissions]) {
      if (ids.includes(pending.key.taskId)) this.#release(pending, true)
    }
    const result = await this.ports.tasks(ids)
    if (!result.ok) { this.dirty(ids); this.#setStatus('UNAVAILABLE'); return false }
    for (const task of result.value) if (!this.#replace(index, task.id, task.reminders)) return false
    return true
  }
  async #rebuild(): Promise<boolean> {
    this.#setStatus('RECOVERING')
    // Solta a projeção anterior antes de alocar a nova: orçamento não duplica no rebuild.
    this.#index = undefined
    for (let attempt = 0; attempt < REMINDER_RUNTIME_LIMITS.restarts; attempt += 1) {
      const reset = this.#reset
      const index = new ReminderIndex(this.memoryLimit)
      let afterId: string | undefined
      let complete = false
      while (!complete && this.ready() && reset === this.#reset) {
        const page = await this.ports.page(afterId)
        if (!page.ok) { this.#setStatus('UNAVAILABLE'); return false }
        let slice = this.ports.monotonic()
        for (const task of page.value.tasks) {
          if (!this.#replace(index, task.id, task.reminders)) return false
          if (this.ports.monotonic() - slice >= REMINDER_RUNTIME_LIMITS.sliceMs) {
            await this.ports.yield(); slice = this.ports.monotonic()
          }
        }
        afterId = page.value.afterId; complete = page.value.complete
        await this.ports.yield()
      }
      if (!this.ready()) return false
      if (reset !== this.#reset) continue
      // O journal é finito por recursos; três passagens de churn, depois BUSY.
      for (let wave = 0; this.#dirty.size > 0 && wave < REMINDER_RUNTIME_LIMITS.restarts; wave += 1) {
        const count = Math.ceil(this.#dirty.size / REMINDER_RUNTIME_LIMITS.page)
        for (let page = 0; page < count; page += 1) {
          if (!await this.#flushDirty(index)) return false
          await this.ports.yield()
          if (!this.ready() || reset !== this.#reset) break
        }
      }
      if (!this.ready()) return false
      if (reset !== this.#reset || this.#dirty.size > 0) continue
      this.#index = index; this.#needRebuild = false
      this.#fallbackAt = this.ports.monotonic() + REMINDER_RUNTIME_LIMITS.fallbackMs
      this.#setStatus('READY')
      return true
    }
    this.#setStatus('BUSY'); return false
  }
  async #tick(): Promise<void> {
    if (this.#busy || !this.ready()) return
    this.#busy = true
    let retryMs = 0
    try {
      for (const pending of [...this.#submissions]) {
        if (pending.deadline <= this.ports.monotonic()) this.#release(pending)
      }
      if (this.#needRebuild || this.ports.monotonic() >= this.#fallbackAt) {
        if (!await this.#rebuild()) { retryMs = REMINDER_RUNTIME_LIMITS.fallbackMs; return }
      }
      const index = this.#index
      if (index === undefined || !this.ready()) return
      if (!await this.#flushDirty(index)) { retryMs = REMINDER_RUNTIME_LIMITS.fallbackMs; return }
      if (this.#dirty.size > 0) return
      this.#setStatus('READY')
      const key = index.first
      if (key === undefined || key.triggerAt > this.ports.now().getTime()) return
      const eligible = canDeliverReminder(key.triggerISO, this.ports.now())
      const reservation = eligible ? this.#reserve(key) : undefined
      if (eligible && reservation === undefined) { retryMs = REMINDER_RUNTIME_LIMITS.capacityRecheckMs; return }
      const result = await this.ports.process(key, reservation)
      if (!result.ok) {
        reservation?.release(); this.#setStatus('UNAVAILABLE')
        retryMs = REMINDER_RUNTIME_LIMITS.capacityRecheckMs; return
      }
      switch (result.value.status) {
        case 'CLAIMED': case 'EXPIRED': index.consume(key); break
        case 'INAPPLICABLE': this.dirty([key.taskId]); break
        case 'DEFERRED': retryMs = REMINDER_RUNTIME_LIMITS.capacityRecheckMs; break
        case 'FUTURE': break
      }
    } catch {
      this.#setStatus('UNAVAILABLE'); this.#needRebuild = true
      retryMs = REMINDER_RUNTIME_LIMITS.fallbackMs
    } finally {
      this.#busy = false; this.#scheduleNext(retryMs)
    }
  }
  #scheduleNext(retryMs = 0): void {
    if (!this.ready()) return
    if (retryMs > 0) { this.#arm(retryMs); return }
    const monotonic = this.ports.monotonic()
    let delay = Math.max(0, this.#fallbackAt - monotonic)
    const first = this.#index?.first
    if (first !== undefined) delay = Math.min(delay, Math.max(0, first.triggerAt - this.ports.now().getTime()))
    if (this.#dirty.size > 0 || this.#needRebuild) delay = 0
    for (const pending of this.#submissions) delay = Math.min(delay, Math.max(0, pending.deadline - monotonic))
    this.#arm(Math.min(REMINDER_RUNTIME_LIMITS.fallbackMs, delay))
  }
}
