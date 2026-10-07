/**
 * Registro dos pedidos em voo, no máximo um por documento. Vive no main e é somente memória:
 * fechar, recarregar, cair, suspender/sair ou salvar/remover configuração aborta o controller do
 * documento correspondente, e o serviço descarta qualquer resposta depois do `await`.
 */
import { createAiAbortController, type AiAbortSignal } from './ai-abort.js'

export interface AiRequestTicket {
  readonly documentKey: string
  /** Presente na sugestão; ausente na verificação de conexão. */
  readonly requestId?: string | undefined
  /** Revisão da configuração capturada no início do pedido. */
  readonly configRevision: string
  /** Sinal externo somado ao timeout próprio do executor. */
  readonly signal: AiAbortSignal
  cancelled: boolean
}

export class AiRequestRegistry {
  readonly #documents = new Map<string, { ticket: AiRequestTicket; controller: { signal: AiAbortSignal; abort(): void } }>()

  /**
   * Abre um pedido para o documento. Devolve `undefined` quando já existe um em voo: um segundo
   * acionamento responde como ocupado sem iniciar outra requisição.
   */
  begin(documentKey: string, input: { requestId?: string | undefined; configRevision: string }): AiRequestTicket | undefined {
    if (this.#documents.has(documentKey)) {
      return undefined
    }

    const controller = createAiAbortController()
    const ticket: AiRequestTicket = {
      documentKey,
      ...(input.requestId !== undefined && { requestId: input.requestId }),
      configRevision: input.configRevision,
      signal: controller.signal,
      cancelled: false,
    }
    this.#documents.set(documentKey, { ticket, controller })
    return ticket
  }

  /** Cancela somente um pedido do próprio documento e do `requestId` informado. */
  cancel(documentKey: string, requestId: string): boolean {
    const active = this.#documents.get(documentKey)

    if (active === undefined || active.ticket.requestId !== requestId) {
      return false
    }

    active.ticket.cancelled = true
    active.controller.abort()
    this.#documents.delete(documentKey)
    return true
  }

  /** Aborta o pedido do documento (invalidação de sessão, saída, suspensão recomendada). */
  abortDocument(documentKey: string): void {
    const active = this.#documents.get(documentKey)

    if (active === undefined) {
      return
    }

    active.controller.abort()
    this.#documents.delete(documentKey)
  }

  /** Aborta todos os pedidos (salvar/remover configuração, sair). */
  abortAll(): void {
    for (const [documentKey, active] of [...this.#documents]) {
      active.controller.abort()
      this.#documents.delete(documentKey)
    }
  }

  /** Um pedido é corrente quando ainda é o do documento e não foi cancelado nem abortado. */
  isCurrent(ticket: AiRequestTicket): boolean {
    const active = this.#documents.get(ticket.documentKey)
    return active !== undefined && active.ticket === ticket && !ticket.cancelled && !ticket.signal.aborted
  }

  /** Encerra o pedido admitido; chamado no `finally` do serviço. */
  finish(ticket: AiRequestTicket): void {
    const active = this.#documents.get(ticket.documentKey)
    if (active !== undefined && active.ticket === ticket) {
      this.#documents.delete(ticket.documentKey)
    }
  }

  /** Quantidade de pedidos em voo, para diagnóstico de teste. */
  get size(): number {
    return this.#documents.size
  }
}
