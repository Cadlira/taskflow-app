import {
  DESKTOP_EVENT_CHANNEL, desktopFailure, parseActivationRequest, parseDesktopRequest, parseStartupRequest,
  type ActivationResult, type DesktopAck, type DesktopEvent, type DesktopFailure, type DesktopStatus,
  type DesktopStatusResult, type StartupResult,
} from '../../contracts/desktop.js'
import type { DocumentSessions, DocumentTicket, InvocationLike } from './document-sessions.js'
import type { StorageCoordinator } from '../storage/coordinator.js'
import type { ReminderService } from '../../application/reminders/reminder-service.js'
import { classifyReminderOccurrence } from '../../domain/task-reminders.js'
import { projectTaskReminders, reminderTag } from '../reminders/projection.js'

export interface DesktopIpcOptions {
  control: DocumentSessions
  product: DocumentSessions
  storage: StorageCoordinator
  reminders(): ReminderService | undefined
  status(): DesktopStatus
  startup(desired: boolean, current: () => boolean): Promise<StartupResult>
  quit(): void
}

/** Controle continua vivo ao hide, sem conceder sessão nem mutação ao produto. */
export class DesktopIpcService {
  readonly #subscriptions = new Map<number, DocumentTicket>()
  #sequence = 1
  #pendingLocate: string | undefined
  readonly #removeInvalidated: () => void
  constructor(readonly options: DesktopIpcOptions) {
    this.#removeInvalidated = options.control.onInvalidated((key) => {
      for (const [id, ticket] of this.#subscriptions) if (ticket.key === key) this.#subscriptions.delete(id)
    })
  }
  get sequence(): number { return this.#sequence }
  get subscribers(): number { return this.#subscriptions.size }
  #status(): DesktopStatusResult { return { version: 1, status: 'ok', desktop: { ...this.options.status(), surfaceSequence: this.#sequence } } }
  async status(event: InvocationLike, request: unknown): Promise<DesktopStatusResult> {
    if (this.options.control.authorize(event) === null) return desktopFailure('UNAUTHORIZED')
    return parseDesktopRequest(request) === null ? desktopFailure('INVALID_REQUEST') : this.#status()
  }
  async subscribe(event: InvocationLike, request: unknown): Promise<DesktopStatusResult> {
    const ticket = this.options.control.authorize(event)
    if (ticket === null) return desktopFailure('UNAUTHORIZED')
    if (parseDesktopRequest(request) === null) return desktopFailure('INVALID_REQUEST')
    this.#subscriptions.set(ticket.contentsId, ticket)
    const result = this.#status()
    if (this.#pendingLocate !== undefined) {
      const tag = this.#pendingLocate
      this.emit(result.status === 'ok' && result.desktop.visibility === 'VISIBLE' && result.desktop.recovery === 'ACTIVE' ? 'surface-active' : 'surface-suspended')
      this.locate(tag)
    }
    return result
  }
  async unsubscribe(event: InvocationLike, request: unknown): Promise<DesktopAck | DesktopFailure> {
    const ticket = this.options.control.authorize(event)
    if (ticket === null) return desktopFailure('UNAUTHORIZED')
    if (parseDesktopRequest(request) === null) return desktopFailure('INVALID_REQUEST')
    this.#subscriptions.delete(ticket.contentsId)
    return { version: 1, status: 'ok' }
  }
  async startup(event: InvocationLike, request: unknown): Promise<StartupResult> {
    const ticket = this.options.product.authorize(event)
    if (ticket === null) return desktopFailure('UNAUTHORIZED')
    const parsed = parseStartupRequest(request)
    if (parsed === null) return desktopFailure('INVALID_REQUEST')
    try {
      const result = await this.options.startup(parsed.desired, () => this.options.product.isCurrent(ticket))
      if (!this.options.product.isCurrent(ticket)) return desktopFailure('SESSION_CLOSED')
      this.emit('desktop-status-changed')
      return result
    } catch { return desktopFailure('NATIVE_OPERATION_FAILED') }
  }
  async quit(event: InvocationLike, request: unknown): Promise<DesktopAck | DesktopFailure> {
    if (this.options.product.authorize(event) === null) return desktopFailure('UNAUTHORIZED')
    if (parseDesktopRequest(request) === null) return desktopFailure('INVALID_REQUEST')
    setImmediate(() => this.options.quit())
    return { version: 1, status: 'ok' }
  }
  async resolve(event: InvocationLike, request: unknown): Promise<ActivationResult> {
    const ticket = this.options.product.authorize(event)
    if (ticket === null) return desktopFailure('UNAUTHORIZED')
    const parsed = parseActivationRequest(request)
    if (parsed === null) return desktopFailure('INVALID_REQUEST')
    const service = this.options.reminders()
    if (service?.status !== 'READY') return desktopFailure('BUSY')
    const key = service.resolve(parsed.tag)
    if (key === undefined) return desktopFailure('NOT_AVAILABLE')
    const result = await this.options.storage.read((reader) => {
      const stored = reader.getTask(key.taskId)
      if (stored === undefined || classifyReminderOccurrence(stored.task, key, new Date()) !== 'INAPPLICABLE') return undefined
      // Marker corrente e correspondência única são relidos; o índice nunca é autoridade.
      const matches = projectTaskReminders(stored.task, new Date()).filter(item => item.tag === parsed.tag && !item.pending)
      if (matches.length !== 1 || reminderTag(key) !== parsed.tag) return undefined
      let ordinal = 0
      for (const row of reader.iterateTasks(undefined)) {
        if (row.task.id === key.taskId) return ordinal
        ordinal += 1
      }
      return undefined
    }, { owner: ticket.key, admit: () => this.options.product.isCurrent(ticket) })
    if (!this.options.product.isCurrent(ticket)) return desktopFailure('SESSION_CLOSED')
    if (!result.ok) return desktopFailure(result.reason === 'QUEUE_FULL' || result.reason === 'WAIT_TIMEOUT' || result.reason === 'LOCKED' ? 'BUSY' : 'UNAVAILABLE')
    return result.value === undefined ? desktopFailure('NOT_AVAILABLE') : { version: 1, status: 'ok', revision: result.revision.toString(), taskOrdinal: result.value }
  }
  emit(kind: Exclude<DesktopEvent['kind'], 'locate-reminder'>): void { this.#send({ version: 1, sequence: ++this.#sequence, kind }) }
  locate(tag: string): void {
    this.#pendingLocate = tag
    if (this.#send({ version: 1, sequence: ++this.#sequence, kind: 'locate-reminder', tag })) this.#pendingLocate = undefined
  }
  #send(event: DesktopEvent): boolean {
    let delivered = false
    for (const [id, ticket] of this.#subscriptions) {
      const frame = this.options.control.currentFrame(ticket)
      if (frame === null) { this.#subscriptions.delete(id); continue }
      try { frame.send(DESKTOP_EVENT_CHANNEL, event); delivered = true } catch { this.#subscriptions.delete(id) }
    }
    return delivered
  }
  dispose(): void { this.#subscriptions.clear(); this.#pendingLocate = undefined; this.#removeInvalidated() }
}
