import {
  AI_CHANNELS,
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
  type AiCancelSuggestionResult,
  type AiPrepareSuggestionResult,
  type AiProviderStatusResult,
  type AiRemoveConfigResult,
  type AiSaveConfigResult,
  type AiSuggestSubtasksResult,
  type AiTestConnectionResult,
} from '../../contracts/ai.js'

/** Transporte fechado: o preload só deixa passar os oito canais deste catálogo. */
export interface AiCommandTransport {
  invoke(channel: string, request: unknown): Promise<unknown>
}

/**
 * Falha local de transporte/saída inválida: a operação pode ter sido executada no main, então
 * quem chamou precisa tratar como **resultado incerto**, sem receber envelope inventado pelo
 * renderer e sem repetir automaticamente.
 */
export class AiCommandTransportError extends Error {
  constructor() {
    super('ai-command-transport')
    this.name = 'AiCommandTransportError'
  }
}

export interface AiCommandClient {
  getAiProviderStatus(request: unknown): Promise<AiProviderStatusResult>
  saveAiProviderConfig(request: unknown): Promise<AiSaveConfigResult>
  removeAiProviderConfig(request: unknown): Promise<AiRemoveConfigResult>
  authorizeAiUse(request: unknown): Promise<AiAuthorizeResult>
  testAiConnection(request: unknown): Promise<AiTestConnectionResult>
  prepareAiSuggestion(request: unknown): Promise<AiPrepareSuggestionResult>
  suggestAiSubtasks(request: unknown): Promise<AiSuggestSubtasksResult>
  cancelAiSuggestion(request: unknown): Promise<AiCancelSuggestionResult>
}

async function invokeStrict(transport: AiCommandTransport, channel: string, request: unknown): Promise<unknown> {
  try {
    return await transport.invoke(channel, request)
  } catch {
    throw new AiCommandTransportError()
  }
}

/**
 * Lado do documento das oito operações v1: valida o request antes de enviar e a resposta antes de
 * devolver. Request inválido nem chega ao main; saída malformada vira falha local de transporte.
 */
export function createAiCommandClient(transport: AiCommandTransport): AiCommandClient {
  return {
    async getAiProviderStatus(request: unknown): Promise<AiProviderStatusResult> {
      const parsed = parseAiStatusRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const response = parseAiProviderStatusResult(await invokeStrict(transport, AI_CHANNELS.getAiProviderStatus, parsed))
      if (response === null) throw new AiCommandTransportError()
      return response
    },

    async saveAiProviderConfig(request: unknown): Promise<AiSaveConfigResult> {
      const parsed = parseAiSaveConfigRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const response = parseAiSaveConfigResult(await invokeStrict(transport, AI_CHANNELS.saveAiProviderConfig, parsed))
      if (response === null) throw new AiCommandTransportError()
      return response
    },

    async removeAiProviderConfig(request: unknown): Promise<AiRemoveConfigResult> {
      const parsed = parseAiRemoveConfigRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const response = parseAiRemoveConfigResult(await invokeStrict(transport, AI_CHANNELS.removeAiProviderConfig, parsed))
      if (response === null) throw new AiCommandTransportError()
      return response
    },

    async authorizeAiUse(request: unknown): Promise<AiAuthorizeResult> {
      const parsed = parseAiAuthorizeRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const response = parseAiAuthorizeResult(await invokeStrict(transport, AI_CHANNELS.authorizeAiUse, parsed))
      if (response === null) throw new AiCommandTransportError()
      return response
    },

    async testAiConnection(request: unknown): Promise<AiTestConnectionResult> {
      const parsed = parseAiTestConnectionRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const response = parseAiTestConnectionResult(await invokeStrict(transport, AI_CHANNELS.testAiConnection, parsed))
      if (response === null) throw new AiCommandTransportError()
      return response
    },

    async prepareAiSuggestion(request: unknown): Promise<AiPrepareSuggestionResult> {
      const parsed = parseAiPrepareSuggestionRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const response = parseAiPrepareSuggestionResult(await invokeStrict(transport, AI_CHANNELS.prepareAiSuggestion, parsed))
      if (response === null) throw new AiCommandTransportError()
      return response
    },

    async suggestAiSubtasks(request: unknown): Promise<AiSuggestSubtasksResult> {
      const parsed = parseAiRequestIdRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const response = parseAiSuggestSubtasksResult(await invokeStrict(transport, AI_CHANNELS.suggestAiSubtasks, parsed))
      if (response === null) throw new AiCommandTransportError()
      return response
    },

    async cancelAiSuggestion(request: unknown): Promise<AiCancelSuggestionResult> {
      const parsed = parseAiRequestIdRequest(request)
      if (parsed === null) return aiFailure('INVALID_REQUEST')
      const response = parseAiCancelSuggestionResult(await invokeStrict(transport, AI_CHANNELS.cancelAiSuggestion, parsed))
      if (response === null) throw new AiCommandTransportError()
      return response
    },
  }
}
