import {
  AiConfigStorageError,
  type AiProviderConfigRepository,
  type AiStoredConfigSummary,
} from '../../src/application/ai/ai-provider-config-repository.js'
import { OPENAI_API_BASE, type AiProviderConfig } from '../../src/domain/ai-provider.js'

/** Estado do repositório fictício de IA usado pelos testes de aplicação e de main. */
export interface FakeAiState {
  summary?: AiStoredConfigSummary | undefined
  revision?: string
  credential?: string | undefined
  protection: boolean
  readError?: Error | undefined
  openError?: Error | undefined
  saveError?: Error | undefined
  removeError?: Error | undefined
}

export interface FakeAiRepository {
  repository: AiProviderConfigRepository
  calls: { save: unknown[]; remove: number; reconcile: number }
  state: FakeAiState
}

/** Repositório em memória com CAS de revisão e erros armáveis por teste. */
export function createFakeAiRepository(initial: Partial<FakeAiState> = {}): FakeAiRepository {
  const state: FakeAiState = { protection: true, credential: 'sk-segredo', summary: configuredSummary(), revision: '1', ...initial }
  const calls = { save: [] as unknown[], remove: 0, reconcile: 0 }
  const repository: AiProviderConfigRepository = {
    async read() {
      if (state.readError) throw state.readError
      return {
        revision: state.revision ?? '0',
        ...(state.summary !== undefined && { summary: state.summary }),
      }
    },
    async openCredential() {
      if (state.openError) throw state.openError
      if (state.summary === undefined) return undefined
      const config: AiProviderConfig =
        state.summary.provider === 'CUSTOM'
          ? { provider: 'CUSTOM', apiBase: state.summary.apiBase, credential: state.credential ?? '', model: state.summary.model }
          : { provider: state.summary.provider, credential: state.credential ?? '', model: state.summary.model }
      return { config, revision: state.revision ?? '0' }
    },
    async save(input) {
      if (state.saveError) throw state.saveError
      calls.save.push(input)
      const current = state.revision ?? '0'
      if (input.expectedRevision !== current) {
        throw new AiConfigStorageError('STALE_REVISION', 'revisão antiga')
      }
      const revision = (BigInt(current) + 1n).toString()
      const apiBase =
        input.provider === 'CUSTOM' ? (input.apiBase ?? '') : input.provider === 'OPENAI' ? OPENAI_API_BASE : 'https://api.anthropic.com'
      const summary: AiStoredConfigSummary = {
        provider: input.provider,
        apiBase,
        model: input.model,
        hasCredential: input.credential !== undefined || state.summary?.hasCredential === true,
      }
      if (input.credential !== undefined) state.credential = input.credential
      state.summary = summary
      state.revision = revision
      return { revision, summary }
    },
    async remove() {
      calls.remove += 1
      if (state.removeError) throw state.removeError
      const revision = (BigInt(state.revision ?? '0') + 1n).toString()
      state.summary = undefined
      state.credential = undefined
      state.revision = revision
      return { revision }
    },
    async reconcile() {
      calls.reconcile += 1
    },
    protectionAvailable() {
      return state.protection
    },
    async currentRevision() {
      return state.revision ?? '0'
    },
  }
  return { repository, calls, state }
}

export function configuredSummary(overrides: Partial<AiStoredConfigSummary> = {}): AiStoredConfigSummary {
  return {
    provider: 'OPENAI',
    apiBase: OPENAI_API_BASE,
    model: 'gpt-4o-mini',
    hasCredential: true,
    ...overrides,
  }
}
