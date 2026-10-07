import {
  aiFailure,
  parseAiAuthorizeRequest,
  parseAiAuthorizeResult,
  parseAiCancelSuggestionResult,
  parseAiPrepareSuggestionRequest,
  parseAiPrepareSuggestionResult,
  parseAiProviderStatusResult,
  parseAiRemoveConfigRequest,
  parseAiRemoveConfigResult,
  parseAiRequestIdRequest,
  parseAiSaveConfigRequest,
  parseAiSaveConfigResult,
  parseAiStatusRequest,
  parseAiSuggestSubtasksResult,
  parseAiTestConnectionRequest,
  parseAiTestConnectionResult,
  type AiAuthorizeResult,
  type AiBlockCode,
  type AiCancelSuggestionResult,
  type AiFailure,
  type AiPrepareSuggestionResult,
  type AiProviderStatus,
  type AiProviderStatusResult,
  type AiRemoveConfigResult,
  type AiSaveConfigResult,
  type AiSuggestSubtasksResult,
  type AiTestConnectionResult,
} from '../../contracts/ai.js'
import type { AiProviderService } from '../../application/ai/ai-provider-service.js'
import type { AiSuggestionService } from '../../application/ai/ai-suggestion-service.js'
import type { DocumentTicket, InvocationLike } from './document-sessions.js'

export interface AiIpcSessions {
  authorize(event: InvocationLike): DocumentTicket | null
  isCurrent(ticket: DocumentTicket): boolean
}

export interface AiIpcOptions {
  sessions: AiIpcSessions
  providers: AiProviderService
  suggestions: AiSuggestionService
}

/**
 * IPC das oito operações de IA, somente manager. A ordem é sempre a mesma: admissão de
 * role/frame/origem/documento, schema exato com o orçamento em UTF-8 medido pelo parser, efeito no
 * serviço e revalidação da sessão antes de entregar. Nenhum caminho lança erro de implementação
 * através do IPC, nenhum evento é publicado e a resposta é validada pelo próprio parser antes de
 * sair.
 */
export class AiIpcService {
  readonly #sessions: AiIpcSessions
  readonly #providers: AiProviderService
  readonly #suggestions: AiSuggestionService
  /** Documentos admitidos, para abortar pedidos quando a superfície é ocultada/suspensa. */
  readonly #documents = new Set<string>()

  constructor(options: AiIpcOptions) {
    this.#sessions = options.sessions
    this.#providers = options.providers
    this.#suggestions = options.suggestions
  }

  #admit(event: InvocationLike): DocumentTicket | null {
    const ticket = this.#sessions.authorize(event)
    if (ticket === null || ticket.role !== 'MANAGER') return null
    this.#documents.add(ticket.key)
    return ticket
  }

  #statusOk(provider: AiProviderStatus): AiProviderStatusResult | AiFailure {
    return parseAiProviderStatusResult({ version: 1, status: 'ok', provider }) ?? aiFailure('RESOURCE_LIMIT')
  }

  #blocked(blocked: AiBlockCode): AiFailure {
    return { ...aiFailure('BLOCKED'), blocked }
  }

  /** Estado atual da área: somente resumo sem segredo, sem decifrar nem contatar o provedor. */
  async handleStatus(event: InvocationLike, request: unknown): Promise<AiProviderStatusResult> {
    try {
      const ticket = this.#admit(event)
      if (ticket === null) return aiFailure('UNAUTHORIZED')
      if (parseAiStatusRequest(request) === null) return aiFailure('INVALID_REQUEST')
      const provider = await this.#providers.load(ticket.key)
      if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
      return this.#statusOk(provider)
    } catch {
      return aiFailure('UNAVAILABLE')
    }
  }

  async handleSave(event: InvocationLike, request: unknown): Promise<AiSaveConfigResult> {
    try {
      const ticket = this.#admit(event)
      if (ticket === null) return aiFailure('UNAUTHORIZED')
      const parsed = parseAiSaveConfigRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const result = await this.#providers.save(
        ticket.key,
        {
          provider: parsed.provider,
          ...(parsed.apiBase !== undefined && { apiBase: parsed.apiBase }),
          ...(parsed.credential !== undefined && { credential: parsed.credential }),
          model: parsed.model,
        },
        parsed.expectedRevision,
      )
      if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
      if (!result.ok) {
        if ('errors' in result) {
          return { ...aiFailure('VALIDATION_FAILED'), fields: result.errors }
        }
        return this.#blocked(result.blocked)
      }
      return parseAiSaveConfigResult({ version: 1, status: 'ok', provider: result.status }) ?? aiFailure('RESOURCE_LIMIT')
    } catch {
      return aiFailure('UNAVAILABLE')
    }
  }

  async handleRemove(event: InvocationLike, request: unknown): Promise<AiRemoveConfigResult> {
    try {
      const ticket = this.#admit(event)
      if (ticket === null) return aiFailure('UNAUTHORIZED')
      if (parseAiRemoveConfigRequest(request) === null) return aiFailure('INVALID_REQUEST')
      const result = await this.#providers.remove()
      if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
      if (!result.ok) return this.#blocked(result.blocked)
      return parseAiRemoveConfigResult({ version: 1, status: 'ok', provider: result.status }) ?? aiFailure('RESOURCE_LIMIT')
    } catch {
      return aiFailure('UNAVAILABLE')
    }
  }

  /** Registra o consentimento do escopo; nenhum booleano de consentimento vem do renderer. */
  async handleAuthorize(event: InvocationLike, request: unknown): Promise<AiAuthorizeResult> {
    try {
      const ticket = this.#admit(event)
      if (ticket === null) return aiFailure('UNAUTHORIZED')
      const parsed = parseAiAuthorizeRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')

      if (parsed.scope === 'CREDENTIAL') {
        const result = await this.#providers.authorizeCredential(ticket.key)
        if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
        if (!result.ok) {
          return 'blocked' in result ? this.#blocked(result.blocked) : aiFailure('NOT_CONFIGURED')
        }
        return parseAiAuthorizeResult({ version: 1, status: 'ok', scope: 'CREDENTIAL' }) ?? aiFailure('RESOURCE_LIMIT')
      }

      const result = await this.#suggestions.authorizeContent(ticket.key, parsed.requestId)
      if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
      if (!result.ok) {
        return 'blocked' in result ? this.#blocked(result.blocked) : aiFailure('STALE_REQUEST')
      }
      return parseAiAuthorizeResult({ version: 1, status: 'ok', scope: 'CONTENT' }) ?? aiFailure('RESOURCE_LIMIT')
    } catch {
      return aiFailure('UNAVAILABLE')
    }
  }

  async handleTest(event: InvocationLike, request: unknown): Promise<AiTestConnectionResult> {
    try {
      const ticket = this.#admit(event)
      if (ticket === null) return aiFailure('UNAUTHORIZED')
      const parsed = parseAiTestConnectionRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const result = await this.#providers.testConnection(ticket.key, { probe: parsed.probe })
      if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
      if (result.ok) return parseAiTestConnectionResult({ version: 1, status: 'ok' }) ?? aiFailure('RESOURCE_LIMIT')
      if (result.state === 'FAILED') {
        return {
          ...aiFailure('FAILED'),
          reason: result.reason,
          ...(result.status !== undefined && { statusCode: result.status }),
        }
      }
      if (result.state === 'BLOCKED') return this.#blocked(result.blocked)
      return aiFailure(result.state)
    } catch {
      return aiFailure('UNAVAILABLE')
    }
  }

  async handlePrepare(event: InvocationLike, request: unknown): Promise<AiPrepareSuggestionResult> {
    try {
      const ticket = this.#admit(event)
      if (ticket === null) return aiFailure('UNAUTHORIZED')
      const parsed = parseAiPrepareSuggestionRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const result = await this.#suggestions.prepare(ticket.key, parsed)
      if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
      if (!result.ok) {
        if (result.state === 'BLOCKED') return this.#blocked(result.blocked)
        if (result.state === 'TITLE_REQUIRED') {
          return { ...aiFailure('VALIDATION_FAILED'), fields: { title: 'Informe o título da tarefa para sugerir subtarefas.' } }
        }
        if (result.state === 'NO_SLOTS') {
          return { ...aiFailure('VALIDATION_FAILED'), fields: { existingSubtaskCount: 'A tarefa já tem o máximo de subtarefas.' } }
        }
        return aiFailure(result.state)
      }
      return parseAiPrepareSuggestionResult({ version: 1, status: 'ok', prepared: result.prepared }) ?? aiFailure('RESOURCE_LIMIT')
    } catch {
      return aiFailure('UNAVAILABLE')
    }
  }

  async handleSuggest(event: InvocationLike, request: unknown): Promise<AiSuggestSubtasksResult> {
    try {
      const ticket = this.#admit(event)
      if (ticket === null) return aiFailure('UNAUTHORIZED')
      const parsed = parseAiRequestIdRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const result = await this.#suggestions.suggest(ticket.key, { requestId: parsed.requestId })
      if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
      if (result.ok) {
        return (
          parseAiSuggestSubtasksResult({ version: 1, status: 'ok', proposal: result.proposal }) ?? aiFailure('RESOURCE_LIMIT')
        )
      }
      if (result.state === 'FAILED') {
        return {
          ...aiFailure('FAILED'),
          reason: result.reason,
          ...(result.status !== undefined && { statusCode: result.status }),
        }
      }
      if (result.state === 'BLOCKED') return this.#blocked(result.blocked)
      return aiFailure(result.state)
    } catch {
      return aiFailure('UNAVAILABLE')
    }
  }

  async handleCancel(event: InvocationLike, request: unknown): Promise<AiCancelSuggestionResult> {
    try {
      const ticket = this.#admit(event)
      if (ticket === null) return aiFailure('UNAUTHORIZED')
      const parsed = parseAiRequestIdRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const result = this.#suggestions.cancel(ticket.key, parsed.requestId)
      if (!this.#sessions.isCurrent(ticket)) return aiFailure('SESSION_CLOSED')
      if (!result.ok) return aiFailure('UNKNOWN_REQUEST')
      return parseAiCancelSuggestionResult({ version: 1, status: 'ok' }) ?? aiFailure('RESOURCE_LIMIT')
    } catch {
      return aiFailure('UNAVAILABLE')
    }
  }

  /** Superfície ocultada/suspensa: aborta o pedido em voo, sem entregar nem registrar conteúdo. */
  suspend(): void {
    for (const key of [...this.#documents]) this.#suggestions.abortDocument(key)
  }

  /** Sessão invalidada: descarta consentimento, prévia e pedido do documento. */
  forgetDocument(key: string): void {
    this.#documents.delete(key)
    this.#suggestions.forgetDocument(key)
  }

  get trackedDocuments(): number {
    return this.#documents.size
  }
}
