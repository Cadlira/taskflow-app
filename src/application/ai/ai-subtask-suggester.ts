// Cópia revisada de taskflow-extension@a763e7a src/application/ai/ai-subtask-suggester.ts
// (MIT, mesmo autor). Portas puras: nenhum Vue/Pinia/Electron/fetch atravessa este módulo.
import type { AiProvider, AiProviderConfig } from '../../domain/ai-provider.js'
import type { AiAbortSignal } from './ai-abort.js'
import type { AiConnectionFailure } from './ai-connection-tester.js'

/**
 * Conjunto fechado de motivos de falha da geração. Estende o da verificação com os casos próprios
 * de ler a resposta do provedor, sem substituí-lo: 401 continua significando credencial inválida
 * nos dois caminhos. Como na verificação, o corpo devolvido nunca chega à interface nem ao log.
 */
export type AiGenerationFailure =
  | AiConnectionFailure
  /** Resposta bem formada, porém sem texto aproveitável. */
  | 'EMPTY_RESPONSE'
  /** Estrutura da resposta não permite extrair o texto gerado. */
  | 'UNREADABLE_RESPONSE'
  /** Texto extraído, porém nenhum item sobreviveu à validação de subtarefa. */
  | 'NO_VALID_ITEM'

/** Limite de tempo da geração, no mesmo padrão de `AI_CONNECTION_TIMEOUT_MS`. */
export const AI_GENERATION_TIMEOUT_MS = 30_000

export interface AiSubtaskSuggestionRequest {
  config: AiProviderConfig
  /**
   * Conteúdo já montado pelo domínio e já apresentado ao usuário. Valor opaco para o adapter, que
   * o transmite sem reconstruir, concatenar nem reformatar: é assim que a pré-visualização e o que
   * sai do dispositivo permanecem idênticos.
   */
  content: string
  /** Teto de saída pedido ao provedor. */
  maxOutputTokens: number
  signal?: AiAbortSignal | undefined
}

export type AiSubtaskSuggestionResponse =
  /** Texto gerado, já extraído do formato do provedor e nunca registrado nem persistido. */
  | { ok: true; text: string }
  | { ok: false; reason: AiGenerationFailure; status?: number }

/**
 * Porta de geração, separada da porta de verificação. A verificação descarta o corpo da resposta;
 * esta é a única que o lê, e essa distinção é o que sustenta a garantia de privacidade.
 */
export interface AiSubtaskSuggester {
  suggestSubtasks(request: AiSubtaskSuggestionRequest): Promise<AiSubtaskSuggestionResponse>
}

/**
 * Encaminha a geração ao adapter do provedor selecionado. `CUSTOM` usa o protocolo compatível com
 * OpenAI, então compartilha o adapter de `OPENAI` com outra base.
 */
export function createProviderDispatchingSuggester(
  suggesters: Record<AiProvider, AiSubtaskSuggester>,
): AiSubtaskSuggester {
  return {
    suggestSubtasks(request) {
      return suggesters[request.config.provider].suggestSubtasks(request)
    },
  }
}
