import {
  createProviderDispatchingTester,
  type AiConnectionTester,
} from '../../application/ai/ai-connection-tester.js'
import {
  createProviderDispatchingSuggester,
  type AiSubtaskSuggester,
} from '../../application/ai/ai-subtask-suggester.js'
import type { AiFetch } from './ai-probe.js'
import { OpenAiCompatibleConnectionTester, OpenAiCompatibleSubtaskSuggester } from './openai-adapter.js'
import { AnthropicConnectionTester, AnthropicSubtaskSuggester } from './anthropic-adapter.js'

/**
 * Composição dos adapters por provedor sobre um transporte injetado. `CUSTOM` compartilha o
 * protocolo compatível com OpenAI. Nenhum adapter lê variável de ambiente, arquivo ou Electron:
 * tudo o que chega à rede passa pelo transporte recebido.
 */
export function createProviderConnectionTester(transport: AiFetch): AiConnectionTester {
  return createProviderDispatchingTester({
    OPENAI: new OpenAiCompatibleConnectionTester(transport),
    CUSTOM: new OpenAiCompatibleConnectionTester(transport),
    ANTHROPIC: new AnthropicConnectionTester(transport),
  })
}

export function createProviderSubtaskSuggester(transport: AiFetch): AiSubtaskSuggester {
  return createProviderDispatchingSuggester({
    OPENAI: new OpenAiCompatibleSubtaskSuggester(transport),
    CUSTOM: new OpenAiCompatibleSubtaskSuggester(transport),
    ANTHROPIC: new AnthropicSubtaskSuggester(transport),
  })
}
