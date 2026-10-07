import type { AiProvider } from '../../domain/ai-provider.js'

/**
 * Escopos independentes de consentimento. Registrar credencial não autoriza conteúdo e vice-versa.
 */
export type AiConsentScope = 'CREDENTIAL' | 'CONTENT'

/**
 * Vínculo do consentimento: origem de destino, provedor, base efetiva e revisão da configuração
 * vigentes no momento da autorização. No escopo de conteúdo o vínculo carrega também o
 * `requestId` da preparação, de modo que autorizar uma prévia não autoriza outra.
 */
export interface AiConsentBinding {
  origin: string
  provider: AiProvider
  apiBase: string
  configRevision: string
  requestId?: string | undefined
}

export interface AiConsentRecord {
  scope: AiConsentScope
  binding: AiConsentBinding
}

function sameBinding(left: AiConsentBinding, right: AiConsentBinding): boolean {
  return (
    left.origin === right.origin &&
    left.provider === right.provider &&
    left.apiBase === right.apiBase &&
    left.configRevision === right.configRevision &&
    left.requestId === right.requestId
  )
}

/**
 * Consentimentos por documento, somente em memória. Sem persistência: uma sessão nova começa sem
 * autorização, e trocar origem/configuração deixa os registros antigos sem efeito por vínculo.
 * A limpeza é explícita em invalidar sessão, salvar/remover configuração e sair.
 */
export class AiConsentRegistry {
  readonly #documents = new Map<string, Map<AiConsentScope, AiConsentBinding>>()

  /** Registra o consentimento de um escopo, substituindo o anterior do mesmo documento. */
  grant(documentKey: string, scope: AiConsentScope, binding: AiConsentBinding): void {
    const record = this.#documents.get(documentKey) ?? new Map<AiConsentScope, AiConsentBinding>()
    record.set(scope, { ...binding })
    this.#documents.set(documentKey, record)
  }

  /** Vínculo exato vigente: para `CONTENT` o `requestId` também precisa coincidir. */
  has(documentKey: string, scope: AiConsentScope, binding: AiConsentBinding): boolean {
    const record = this.#documents.get(documentKey)?.get(scope)
    return record !== undefined && sameBinding(record, binding)
  }

  /**
   * Existe algum consentimento de conteúdo para a origem/configuração informada, sem exigir o
   * `requestId` (usado no resumo da área de provedores, não para autorizar envio).
   */
  hasContentForConfig(documentKey: string, binding: Omit<AiConsentBinding, 'requestId'>): boolean {
    const record = this.#documents.get(documentKey)?.get('CONTENT')
    return (
      record !== undefined &&
      record.origin === binding.origin &&
      record.provider === binding.provider &&
      record.apiBase === binding.apiBase &&
      record.configRevision === binding.configRevision
    )
  }

  /** Descarta os escopos de um documento (reload, fechamento, crash ou troca de configuração). */
  clearDocument(documentKey: string): void {
    this.#documents.delete(documentKey)
  }

  /** Descarta todos os consentimentos (sair, salvar/remover configuração). */
  clearAll(): void {
    this.#documents.clear()
  }

  /** Quantidade de documentos com algum consentimento, para diagnóstico de teste. */
  get size(): number {
    return this.#documents.size
  }
}
