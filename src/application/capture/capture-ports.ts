import type { CapturedDraft } from '../../domain/clipboard-capture.js'

export const CAPTURE_TTL_MS = 600000
export const CLIPBOARD_TIMEOUT_MS = 5000
export const CLIPBOARD_RAW_BYTES = 1024 * 1024
export const CAPTURE_ENVELOPE_BYTES = 64 * 1024
export type SurfaceRole = 'MANAGER' | 'QUICK_ADD'
export interface ClipboardTextReader { readText(): Promise<string> }
export interface CaptureReference { id: string; sequence: string }
export interface CaptureEnvelope extends CaptureReference { draft: CapturedDraft; replaced: boolean }
/** documentId permanece estável ao ocultar; sessionId muda em cada admissão. Ambos vêm do main. */
export interface CaptureOwner { role: SurfaceRole; documentId: string; sessionId: string }
export interface CaptureClock {
  monotonic(): number
  arm(delayMs: number, callback: () => void): () => void
}
export interface CaptureIds { next(): string }
export interface CaptureReceipt extends CaptureReference { disposition: 'presented' | 'applied' | 'discarded' }
export type CaptureInboxRead =
  | { state: 'staged' | 'held'; capture: CaptureEnvelope; receipt?: CaptureReceipt }
  | { state: 'none' | 'expired'; receipt?: CaptureReceipt }
export type CaptureInboxAck = { ok: true; receipt: CaptureReceipt } | { ok: false; code: 'STALE_CAPTURE' | 'RESOURCE_LIMIT' }
export interface CaptureInbox {
  stage(role: SurfaceRole, draft: CapturedDraft): CaptureEnvelope | undefined
  get(owner: CaptureOwner): CaptureInboxRead
  acknowledge(owner: CaptureOwner, reference: CaptureReference, disposition: 'presented' | 'applied'): CaptureInboxAck
  discard(owner: CaptureOwner, reference: CaptureReference): CaptureInboxAck
  /** Reload/crash retira held/recibos do documento; hidden conserva a instância viva. */
  forgetDocument(documentId: string): void
  clear(): void
}
