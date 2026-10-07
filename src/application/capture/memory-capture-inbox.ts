import { serializedBytes } from '../../contracts/record.js'
import type { CapturedDraft } from '../../domain/clipboard-capture.js'
import { CAPTURE_ENVELOPE_BYTES, CAPTURE_TTL_MS } from './capture-ports.js'
import type { CaptureClock, CaptureEnvelope, CaptureIds, CaptureInbox, CaptureInboxAck, CaptureInboxRead, CaptureOwner, CaptureReceipt, CaptureReference, SurfaceRole } from './capture-ports.js'

interface Slot { capture: CaptureEnvelope; expiresAt: number; documentId?: string }
function matches(a: CaptureReference, b: CaptureReference): boolean { return a.id === b.id && a.sequence === b.sequence }
function copy(capture: CaptureEnvelope): CaptureEnvelope {
  return { ...capture, draft: { ...capture.draft, flags: { ...capture.draft.flags } } }
}
/** Dois slots mapeados, sem raw/history; um último recibo por documento registrado (máximo8). */
export class MemoryCaptureInbox implements CaptureInbox {
  readonly #slots = new Map<SurfaceRole, Slot>()
  readonly #expired = new Set<SurfaceRole>()
  readonly #sequences: Record<SurfaceRole, bigint> = { MANAGER: 0n, QUICK_ADD: 0n }
  readonly #receipts = new Map<string, { role: SurfaceRole; receipt: CaptureReceipt }>()
  constructor(readonly clock: Pick<CaptureClock, 'monotonic'>, readonly ids: CaptureIds) {}

  stage(role: SurfaceRole, draft: CapturedDraft): CaptureEnvelope | undefined {
    this.#expire(role)
    const next = this.#sequences[role] + 1n
    if (next.toString().length > 32) return undefined
    const capture: CaptureEnvelope = { id: this.ids.next(), sequence: next.toString(), draft, replaced: this.#slots.has(role) }
    // Inclui envelope/get/recibo máximo: nunca retém um draft que não possa ser consultado.
    const receipt = { id: capture.id, sequence: '9'.repeat(32), disposition: 'discarded' }
    if ((serializedBytes({ version: 1, status: 'ok', inbox: { state: 'staged', capture, receipt } }) ?? Infinity) > CAPTURE_ENVELOPE_BYTES) return undefined
    this.#sequences[role] = next
    this.#slots.set(role, { capture: copy(capture), expiresAt: this.clock.monotonic() + CAPTURE_TTL_MS })
    this.#expired.delete(role)
    return copy(capture)
  }
  get(owner: CaptureOwner): CaptureInboxRead {
    this.#expire(owner.role)
    const slot = this.#slots.get(owner.role)
    const previous = this.#receipts.get(owner.documentId)
    const receipt = previous?.role === owner.role ? { receipt: { ...previous.receipt } } : {}
    if (!slot || (slot.documentId !== undefined && slot.documentId !== owner.documentId)) {
      return { state: this.#expired.has(owner.role) ? 'expired' : 'none', ...receipt }
    }
    return { state: slot.documentId === undefined ? 'staged' : 'held', capture: copy(slot.capture), ...receipt }
  }
  acknowledge(owner: CaptureOwner, reference: CaptureReference, disposition: 'presented' | 'applied'): CaptureInboxAck {
    return this.#ack(owner, reference, disposition)
  }
  discard(owner: CaptureOwner, reference: CaptureReference): CaptureInboxAck { return this.#ack(owner, reference, 'discarded') }
  #ack(owner: CaptureOwner, reference: CaptureReference, disposition: CaptureReceipt['disposition']): CaptureInboxAck {
    this.#expire(owner.role)
    const slot = this.#slots.get(owner.role)
    const previous = this.#receipts.get(owner.documentId)
    // Um recibo antigo nunca consome nem reconhece uma captura substituta.
    if (slot && !matches(slot.capture, reference)) return { ok: false, code: 'STALE_CAPTURE' }
    if (previous?.role === owner.role && matches(previous.receipt, reference)) {
      if (previous.receipt.disposition === disposition || previous.receipt.disposition === 'applied' || previous.receipt.disposition === 'discarded') {
        return { ok: true, receipt: { ...previous.receipt } }
      }
    }
    if (!slot || (slot.documentId !== undefined && slot.documentId !== owner.documentId) ||
      (disposition === 'applied' && slot.documentId === undefined)) return { ok: false, code: 'STALE_CAPTURE' }
    if (!this.#receipts.has(owner.documentId) && this.#receipts.size >= 8) return { ok: false, code: 'RESOURCE_LIMIT' }
    const receipt: CaptureReceipt = { id: reference.id, sequence: reference.sequence, disposition }
    this.#receipts.set(owner.documentId, { role: owner.role, receipt })
    if (disposition === 'presented') slot.documentId = owner.documentId
    else this.#slots.delete(owner.role)
    return { ok: true, receipt: { ...receipt } }
  }
  forgetDocument(documentId: string): void {
    for (const [role, slot] of this.#slots) if (slot.documentId === documentId) this.#slots.delete(role)
    this.#receipts.delete(documentId)
  }
  clear(): void { this.#slots.clear(); this.#receipts.clear(); this.#expired.clear() }
  #expire(role: SurfaceRole): void {
    const slot = this.#slots.get(role)
    if (slot && slot.documentId === undefined && this.clock.monotonic() >= slot.expiresAt) {
      this.#slots.delete(role); this.#expired.add(role)
    }
  }
}
