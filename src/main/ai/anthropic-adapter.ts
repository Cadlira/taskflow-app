// Cópia revisada de taskflow-extension@a763e7a src/infrastructure/ai/anthropic-adapter.ts (MIT,
// mesmo autor). Autenticação por chave própria e versão da API declarada em toda requisição.
import {
  AI_MINIMAL_PROBE_CONTENT,
  type AiConnectionResult,
  type AiConnectionTester,
  type AiConnectionTestRequest,
} from '../../application/ai/ai-connection-tester.js'
import type {
  AiSubtaskSuggester,
  AiSubtaskSuggestionRequest,
  AiSubtaskSuggestionResponse,
} from '../../application/ai/ai-subtask-suggester.js'
import { resolveApiBase, resolveOrigin } from '../../domain/ai-provider.js'
import { runAiGeneration } from './ai-generation.js'
import { runAiProbe, type AiFetch } from './ai-probe.js'

/** Versão da API declarada em toda requisição à Anthropic. */
export const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Cabeçalho de paridade mantido da origem. Na extensão ele era necessário porque o contexto
 * enviava `Origin`; sem `Origin`, no main, ele é inócuo, e permanece por paridade até uma prova
 * real autorizada decidir sobre a remoção.
 */
export const ANTHROPIC_DIRECT_BROWSER_HEADER = 'anthropic-dangerous-direct-browser-access'

/** Verificação na Anthropic; o corpo da resposta nunca é lido. */
export class AnthropicConnectionTester implements AiConnectionTester {
  readonly #transport: AiFetch

  constructor(transport: AiFetch) {
    this.#transport = transport
  }

  testConnection({ config, probe, signal }: AiConnectionTestRequest): Promise<AiConnectionResult> {
    const base = resolveApiBase(config)
    const origin = resolveOrigin(base)
    const headers = {
      'x-api-key': config.credential,
      'anthropic-version': ANTHROPIC_VERSION,
      [ANTHROPIC_DIRECT_BROWSER_HEADER]: 'true',
    }

    if (probe === 'MODEL_LIST') {
      return runAiProbe(
        `${base}/v1/models`,
        { method: 'GET', headers: { ...headers, Accept: 'application/json' } },
        { origin, probe, transport: this.#transport, ...(signal !== undefined && { signal }) },
      )
    }

    // Envio mínimo: conteúdo literal fixo e um token de resposta. Nunca conteúdo de tarefa.
    return runAiProbe(
      `${base}/v1/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: AI_MINIMAL_PROBE_CONTENT }],
        }),
      },
      { origin, probe, transport: this.#transport, ...(signal !== undefined && { signal }) },
    )
  }
}

/**
 * Caminho mínimo até o texto gerado no formato da Anthropic: o primeiro bloco de texto da
 * resposta. Nada além dele é navegado.
 */
export function extractAnthropicText(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }

  const { content } = payload as { content?: unknown }

  if (!Array.isArray(content)) {
    return undefined
  }

  const block = content.find(
    (candidate): candidate is { type: 'text'; text: string } =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { type?: unknown }).type === 'text' &&
      typeof (candidate as { text?: unknown }).text === 'string',
  )

  // Lista de blocos sem nenhum bloco de texto é resposta bem formada e vazia, não ilegível.
  return block === undefined ? '' : block.text
}

/** Geração na Anthropic com os dois cabeçalhos obrigatórios e o teto de saída do TaskFlow. */
export class AnthropicSubtaskSuggester implements AiSubtaskSuggester {
  readonly #transport: AiFetch

  constructor(transport: AiFetch) {
    this.#transport = transport
  }

  suggestSubtasks({
    config,
    content,
    maxOutputTokens,
    signal,
  }: AiSubtaskSuggestionRequest): Promise<AiSubtaskSuggestionResponse> {
    const base = resolveApiBase(config)

    return runAiGeneration(
      `${base}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': config.credential,
          'anthropic-version': ANTHROPIC_VERSION,
          [ANTHROPIC_DIRECT_BROWSER_HEADER]: 'true',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: maxOutputTokens,
          messages: [{ role: 'user', content }],
          stream: false,
        }),
      },
      { origin: resolveOrigin(base), extract: extractAnthropicText, transport: this.#transport, ...(signal !== undefined && { signal }) },
    )
  }
}
