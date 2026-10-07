import { entryFailure, parseCaptureAckRequest, parseCaptureAckResult, parseCaptureDiscardRequest, parseCaptureResult,
  parseEntryAck, parseEntryRequest, parsePendingCaptureResult, parseSetShortcutRequest, parseShortcutEditingRequest, parseShortcutSettingsResult } from '../../contracts/capture-shortcuts.js'
import type { CaptureAckResult, CaptureResult, EntryAck, PendingCaptureResult, ShortcutSettingsResult } from '../../contracts/capture-shortcuts.js'
import { surfaceAllows } from '../../contracts/surface-catalog.js'
import type { SurfaceOperation } from '../../contracts/surface-catalog.js'
import type { SurfaceRole, CaptureInbox, CaptureOwner } from '../../application/capture/capture-ports.js'
import type { ClipboardCaptureReader } from '../../application/capture/clipboard-reader.js'
import type { ShortcutController } from '../../application/shortcuts/shortcut-controller.js'
import type { DocumentSessions, DocumentTicket, InvocationLike } from './document-sessions.js'

export interface EntryIpcOptions {
  product: DocumentSessions
  control: DocumentSessions
  inbox: CaptureInbox
  clipboard: ClipboardCaptureReader
  shortcuts: ShortcutController
  open(role: SurfaceRole): void
  focused(contentsId: number): boolean
  reference(role: SurfaceRole, capture: { id: string; sequence: string; replaced: boolean }): void
}
/** Guardas das novas intenções antes de efeitos; saídas validadas antes da entrega. */
export class EntryIpcService {
  readonly #dispose: () => void
  constructor(readonly options: EntryIpcOptions) {
    this.#dispose = options.control.onInvalidated(key => { options.inbox.forgetDocument(key); options.shortcuts.releaseEditing(key) })
  }
  #admit(event: InvocationLike, operation: SurfaceOperation): { product: DocumentTicket; control: DocumentTicket; owner: CaptureOwner } | null {
    const product = this.options.product.authorize(event)
    if (!product || !surfaceAllows(product.role, operation)) return null
    const control = this.options.control.authorize(event)
    if (!control || control.role !== product.role) return null
    return { product, control, owner: { role: product.role, documentId: control.key, sessionId: product.key } }
  }
  #current(ticket: { product: DocumentTicket; control: DocumentTicket }): boolean {
    return this.options.product.isCurrent(ticket.product) && this.options.control.isCurrent(ticket.control)
  }
  async open(event: InvocationLike, request: unknown, role: SurfaceRole): Promise<EntryAck> {
    const ticket = this.#admit(event, role === 'QUICK_ADD' ? 'openQuickAdd' : 'openTaskManager')
    if (!ticket) return entryFailure('UNAUTHORIZED')
    if (!parseEntryRequest(request)) return entryFailure('INVALID_REQUEST')
    try { this.options.open(role) } catch { return entryFailure('UNAVAILABLE') }
    return this.#current(ticket) ? parseEntryAck({ version: 1, status: 'ok' }) ?? entryFailure('RESOURCE_LIMIT') : entryFailure('SESSION_CLOSED')
  }
  async capture(event: InvocationLike, request: unknown): Promise<CaptureResult> {
    const ticket = this.#admit(event, 'captureClipboard')
    if (!ticket) return entryFailure('UNAUTHORIZED')
    if (!parseEntryRequest(request)) return entryFailure('INVALID_REQUEST')
    const result = await this.options.clipboard.read(() => this.#current(ticket))
    if (!this.#current(ticket)) return entryFailure('SESSION_CLOSED')
    if (!result.ok) return entryFailure(result.code)
    const capture = this.options.inbox.stage(ticket.owner.role, result.draft)
    if (!capture) return entryFailure('RESOURCE_LIMIT')
    this.options.reference(ticket.owner.role, capture)
    return parseCaptureResult({ version: 1, status: 'ok', reference: { id: capture.id, sequence: capture.sequence }, replaced: capture.replaced }) ?? entryFailure('RESOURCE_LIMIT')
  }
  async pending(event: InvocationLike, request: unknown): Promise<PendingCaptureResult> {
    const ticket = this.#admit(event, 'getPendingCapture')
    if (!ticket) return entryFailure('UNAUTHORIZED')
    if (!parseEntryRequest(request)) return entryFailure('INVALID_REQUEST')
    return parsePendingCaptureResult({ version: 1, status: 'ok', inbox: this.options.inbox.get(ticket.owner) }) ?? entryFailure('RESOURCE_LIMIT')
  }
  async acknowledge(event: InvocationLike, request: unknown, discard = false): Promise<CaptureAckResult> {
    const ticket = this.#admit(event, discard ? 'discardCapture' : 'acknowledgeCapture')
    if (!ticket) return entryFailure('UNAUTHORIZED')
    const parsed = parseCaptureAckRequest(request)
    const discardRequest = discard ? parseCaptureDiscardRequest(request) : null
    if (discard ? !discardRequest : !parsed) return entryFailure('INVALID_REQUEST')
    const result = discardRequest ? this.options.inbox.discard(ticket.owner, discardRequest) :
      parsed ? this.options.inbox.acknowledge(ticket.owner, parsed, parsed.disposition) : undefined
    if (!result) return entryFailure('INVALID_REQUEST')
    return result.ok ? parseCaptureAckResult({ version: 1, status: 'ok', receipt: result.receipt }) ?? entryFailure('RESOURCE_LIMIT') : entryFailure(result.code)
  }
  async settings(event: InvocationLike, request: unknown): Promise<ShortcutSettingsResult> {
    const ticket = this.#admit(event, 'getShortcutSettings')
    if (!ticket) return entryFailure('UNAUTHORIZED')
    if (!parseEntryRequest(request)) return entryFailure('INVALID_REQUEST')
    const result = await this.options.shortcuts.settings()
    return this.#current(ticket) ? parseShortcutSettingsResult(result) ?? entryFailure('RESOURCE_LIMIT') : entryFailure('SESSION_CLOSED')
  }
  async setShortcut(event: InvocationLike, request: unknown): Promise<ShortcutSettingsResult> {
    const ticket = this.#admit(event, 'setShortcut')
    if (!ticket) return entryFailure('UNAUTHORIZED')
    const parsed = parseSetShortcutRequest(request)
    if (!parsed) return entryFailure('INVALID_REQUEST')
    const result = await this.options.shortcuts.set(parsed, () => this.#current(ticket))
    return this.#current(ticket) ? parseShortcutSettingsResult(result) ?? entryFailure('RESOURCE_LIMIT') : entryFailure('SESSION_CLOSED')
  }
  async editing(event: InvocationLike, request: unknown): Promise<EntryAck> {
    const ticket = this.#admit(event, 'setShortcutEditing')
    if (!ticket) return entryFailure('UNAUTHORIZED')
    const parsed = parseShortcutEditingRequest(request)
    if (!parsed) return entryFailure('INVALID_REQUEST')
    if (parsed.editing && !this.options.focused(ticket.product.contentsId)) return entryFailure('UNAUTHORIZED')
    this.options.shortcuts.setEditing(ticket.control.key, parsed.editing)
    return { version: 1, status: 'ok' }
  }
  dispose(): void { this.#dispose() }
}
