import type { CaptureEnvelope, CaptureReference } from './capture-ports.js'
import type { CapturedDraft } from '../../domain/clipboard-capture.js'
import type { TaskFlowDesktopApi } from '../../contracts/desktop-api.js'

type CaptureApi = Pick<TaskFlowDesktopApi, 'getPendingCapture' | 'acknowledgeCapture' | 'discardCapture' | 'captureClipboard'>
export interface CaptureOffer { capture: CaptureEnvelope; held: boolean; applied: boolean; automatic: boolean; generation: number }
export interface CaptureReviewOptions {
  api: CaptureApi
  active(): boolean
  epoch(): number
  generation(): number
  safe(): boolean
  apply(draft: CapturedDraft): void
  changed(): void
}
function same(a: CaptureReference | undefined, b: CaptureReference): boolean { return a?.id === b.id && a.sequence === b.sequence }
/** Uma cópia provisória/oferta; somente recibo confirmado permite aplicação local uma vez. */
export class CaptureReview {
  offer: CaptureOffer | undefined
  busy = false
  message = ''
  #reference: CaptureReference | undefined
  #queued = false
  #disposed = false
  constructor(readonly options: CaptureReviewOptions) {}
  #notify(): void { if (!this.#disposed) this.options.changed() }
  #current(epoch: number): boolean { return !this.#disposed && this.options.active() && epoch === this.options.epoch() }
  reference(reference: CaptureReference): void {
    if (this.#reference && !same(this.#reference, reference)) this.message = 'Uma captura mais nova substituiu a pendência anterior.'
    this.#reference = { ...reference }
    void this.refresh()
  }
  async capture(): Promise<void> {
    if (this.busy || !this.options.active() || this.#disposed) return
    this.busy = true; this.message = ''; this.#notify()
    const epoch = this.options.epoch()
    try {
      const result = await this.options.api.captureClipboard({ version: 1 })
      if (!this.#current(epoch)) return
      if (result.status === 'error') this.message = this.#error(result.code)
      else this.#reference = result.reference
    } catch { this.message = 'A leitura não foi confirmada. Tente novamente por uma ação explícita.' }
    finally { this.busy = false; this.#notify() }
    if (this.#current(epoch)) await this.refresh()
  }
  async refresh(): Promise<void> {
    if (this.#disposed || !this.options.active()) return
    if (this.busy) { this.#queued = true; return }
    this.busy = true; this.#notify()
    const epoch = this.options.epoch()
    try {
      const result = await this.options.api.getPendingCapture({ version: 1 })
      if (!this.#current(epoch)) return
      if (result.status === 'error') { this.message = this.#error(result.code); return }
      const inbox = result.inbox
      if (inbox.state === 'none' || inbox.state === 'expired') {
        if (this.offer && same(inbox.receipt, this.offer.capture) && inbox.receipt?.disposition === 'applied') {
          this.offer.applied = true; this.offer.automatic = false
          this.message = 'Captura confirmada; revise a cópia conservada antes de preencher.'
        } else if (this.offer?.applied !== true) {
          this.offer = undefined
          if (inbox.state === 'expired') this.message = 'A captura expirou antes da apresentação.'
        }
        return
      }
      if (!('capture' in inbox)) return
      const capture = inbox.capture
      // Evento mais recente vence resposta de consulta que chegou fora de ordem.
      if (this.#reference && BigInt(capture.sequence) < BigInt(this.#reference.sequence)) { this.#queued = true; return }
      const existing = this.offer && same(this.offer.capture, capture)
      this.#reference = { id: capture.id, sequence: capture.sequence }
      if (!existing) {
        this.offer = { capture, held: inbox.state === 'held', applied: false, automatic: this.options.safe(), generation: this.options.generation() }
        if (capture.replaced) this.message = 'Uma captura mais nova substituiu a pendência anterior.'
      } else if (inbox.state === 'held' && this.offer) this.offer.held = true
      const offer = this.offer
      if (!offer) return
      if (!offer.held) {
        // A cópia provisória já pertence à apresentação local antes de confirmar o held.
        // Busy impede Revisar/Descartar até a resposta e a revalidação de geração/epoch.
        this.#notify()
        const ack = await this.options.api.acknowledgeCapture({ version: 1, id: capture.id, sequence: capture.sequence, disposition: 'presented' })
        if (!this.#current(epoch) || !same(this.#reference, capture)) return
        if (ack.status === 'error') {
          offer.automatic = false
          if (ack.code === 'STALE_CAPTURE') this.offer = undefined
          this.message = this.#error(ack.code); return
        }
        offer.held = true
      }
      if (offer.automatic && offer.generation === this.options.generation() && this.options.safe()) await this.#apply(offer, epoch)
      else offer.automatic = false
    } catch { if (this.#current(epoch)) { if (this.offer) this.offer.automatic = false; this.message = 'Confirmação incerta; consulte a captura antes de revisar.' } }
    finally { this.busy = false; this.#notify(); if (this.#queued) { this.#queued = false; void this.refresh() } }
  }
  async review(): Promise<void> {
    if (this.busy || !this.offer || !this.options.active() || !this.options.safe()) return
    if (!this.offer.held && !this.offer.applied) { await this.refresh(); return }
    this.busy = true; this.#notify()
    try { await this.#apply(this.offer, this.options.epoch()) }
    catch { this.message = 'Aplicação incerta; os campos foram conservados. Consulte antes de revisar.' }
    finally { this.busy = false; this.#notify(); if (this.#queued) { this.#queued = false; void this.refresh() } }
  }
  async #apply(offer: CaptureOffer, epoch: number): Promise<void> {
    if (!this.options.safe() || !this.#current(epoch)) return
    const generation = this.options.generation()
    offer.automatic = false
    if (!offer.applied) {
      const ack = await this.options.api.acknowledgeCapture({ version: 1, id: offer.capture.id, sequence: offer.capture.sequence, disposition: 'applied' })
      if (ack.status === 'error') { this.message = this.#error(ack.code); return }
      offer.applied = true
    }
    if (!this.#current(epoch)) return
    if (!same(this.#reference, offer.capture)) { this.message = 'A captura mais nova prevaleceu; o formulário atual foi conservado.'; return }
    if (generation !== this.options.generation() || !this.options.safe()) {
      this.message = 'O formulário mudou durante a confirmação. A captura está disponível para revisão.'; return
    }
    this.options.apply(offer.capture.draft)
    if (this.offer === offer) this.offer = undefined
    const flags = offer.capture.draft.flags
    this.message = flags.titleTruncated || flags.descriptionTruncated ? 'Captura preenchida com corte de texto. Revise os campos antes de salvar.' :
      flags.sourceOpeningLimited ? 'Origem longa preservada; a abertura externa não estará disponível.' : 'Captura preenchida. Revise os campos antes de salvar.'
  }
  async discard(): Promise<void> {
    if (this.busy || !this.offer || !this.options.active()) return
    const offer = this.offer, epoch = this.options.epoch()
    this.busy = true; this.#notify()
    try {
      const result = offer.applied ? { status: 'ok' } : await this.options.api.discardCapture({ version: 1, id: offer.capture.id, sequence: offer.capture.sequence })
      if (!this.#current(epoch)) return
      if (result.status === 'ok') { if (this.offer === offer) this.offer = undefined; this.message = 'Captura descartada. Nenhuma tarefa foi salva.' }
      else this.message = 'O descarte não foi confirmado; consulte a captura.'
    } catch { this.message = 'O descarte não foi confirmado; consulte a captura.' }
    finally { this.busy = false; this.#notify() }
  }
  #error(code: string): string {
    const messages: Record<string, string> = { EMPTY: 'Não há texto copiado.', BUSY: 'Uma leitura já está em andamento.',
      TIMEOUT: 'A leitura excedeu o tempo. A tentativa tardia não será aplicada.', INVALID_TEXT: 'O texto copiado é inválido.',
      UNSUPPORTED: 'A origem copiada não é um endereço HTTP ou HTTPS válido.', RESOURCE_LIMIT: 'A captura excede o limite permitido.',
      STALE_CAPTURE: 'Esta captura expirou ou foi substituída.', SESSION_CLOSED: 'A janela mudou; consulte a captura ao reabrir.' }
    return messages[code] ?? 'Captura indisponível; os campos atuais foram conservados.'
  }
  dispose(): void { this.#disposed = true; this.#queued = false; this.offer = undefined }
}
