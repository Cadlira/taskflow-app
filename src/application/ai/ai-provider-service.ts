import {
  buildAiProviderConfig,
  resolveApiBase,
  resolveConfigOrigin,
  resolveOrigin,
  type AiConfigFieldErrors,
  type AiProvider,
  type AiProviderConfig,
  type AiProviderConfigDraft,
} from '../../domain/ai-provider.js'
import {
  aiBlockFor,
  AiConfigStorageError,
  type AiConfigBlock,
  type AiProviderConfigRepository,
  type AiStoredConfigSummary,
  type AiStoredState,
} from './ai-provider-config-repository.js'
import type { AiConnectionFailure, AiConnectionProbe, AiConnectionTester } from './ai-connection-tester.js'
import type { AiConsentBinding, AiConsentRegistry } from './ai-consent.js'
import type { AiRequestRegistry } from './ai-request-registry.js'

/** Visão da configuração entregue à interface. Não carrega a credencial: apenas a marca de que
 * existe uma gravada, que não permite reconstruí-la. */
export interface AiConfigSummary {
  provider: AiProvider
  /** Base efetiva, fixa nos provedores oficiais e informada em `CUSTOM`. */
  apiBase: string
  origin: string
  model: string
  hasCredential: boolean
}

/** Disponibilidade do mecanismo nativo de proteção, exibida ao usuário sem vazar detalhes. */
export type AiProtection = 'AVAILABLE' | 'UNAVAILABLE'

export type AiProviderStatus =
  | { state: 'NONE'; revision: string; protection: AiProtection }
  | {
      state: 'CONFIGURED'
      revision: string
      protection: AiProtection
      summary: AiConfigSummary
      credentialConsent: boolean
      contentConsent: boolean
    }
  | { state: 'BLOCKED'; blocked: AiConfigBlock }

export type SaveAiProviderConfigResult =
  | { ok: true; status: AiProviderStatus }
  | { ok: false; errors: AiConfigFieldErrors }
  | { ok: false; blocked: AiConfigBlock }

export type RemoveAiProviderConfigResult =
  | { ok: true; status: AiProviderStatus }
  | { ok: false; blocked: AiConfigBlock }

export type AuthorizeAiUseResult =
  | { ok: true }
  | { ok: false; state: 'NOT_CONFIGURED' }
  | { ok: false; blocked: AiConfigBlock }

export type AiTestOutcome =
  | { ok: true }
  | { ok: false; state: 'NOT_CONFIGURED' | 'BUSY' | 'CANCELLED' | 'DISCARDED' | 'CONSENT_REQUIRED' }
  | { ok: false; state: 'BLOCKED'; blocked: AiConfigBlock }
  | { ok: false; state: 'FAILED'; reason: AiConnectionFailure; status?: number }

export interface AiProviderServiceDependencies {
  repository: AiProviderConfigRepository
  consents: AiConsentRegistry
  requests: AiRequestRegistry
  tester: AiConnectionTester
}

/** Valor de fachada usado só para validar base/modelo sem decifrar a credencial preservada. */
const PRESERVED_CREDENTIAL = '\u0000taskflow-preserved-credential'

type ReadOutcome =
  | { ok: true; stored: AiStoredState }
  | { ok: false; blocked: AiConfigBlock }

/**
 * Casos de uso da configuração BYOK: ler o estado atual sem segredo, gravar substituindo por
 * completo sob CAS, remover apagando a credencial e revogando consentimentos, e testar a conexão.
 * Nenhuma operação contata o provedor fora de `testConnection`, que só é chamada por acionamento
 * do usuário e exige consentimento vigente.
 */
export function createAiProviderService({
  repository,
  consents,
  requests,
  tester,
}: AiProviderServiceDependencies) {
  function protection(): AiProtection {
    return repository.protectionAvailable() ? 'AVAILABLE' : 'UNAVAILABLE'
  }

  /** Leitura com reconciliação explícita uma única vez quando a publicação ficou incerta. */
  async function readSummary(): Promise<ReadOutcome> {
    try {
      return { ok: true, stored: await repository.read() }
    } catch (error) {
      if (error instanceof AiConfigStorageError && error.reason === 'UNKNOWN') {
        try {
          await repository.reconcile()
          return { ok: true, stored: await repository.read() }
        } catch (reconcileError) {
          return { ok: false, blocked: aiBlockFor(reconcileError) }
        }
      }

      return { ok: false, blocked: aiBlockFor(error) }
    }
  }

  function bindingFor(stored: AiStoredState): Omit<AiConsentBinding, 'requestId'> {
    const summary = stored.summary as AiStoredConfigSummary

    return {
      origin: resolveOrigin(summary.apiBase),
      provider: summary.provider,
      apiBase: summary.apiBase,
      configRevision: stored.revision,
    }
  }

  function describe(stored: AiStoredState, documentKey: string): AiProviderStatus {
    const summary = stored.summary as AiStoredConfigSummary
    const binding = bindingFor(stored)

    return {
      state: 'CONFIGURED',
      revision: stored.revision,
      protection: protection(),
      summary: {
        provider: summary.provider,
        apiBase: summary.apiBase,
        origin: binding.origin,
        model: summary.model,
        hasCredential: summary.hasCredential,
      },
      credentialConsent: consents.has(documentKey, 'CREDENTIAL', binding),
      contentConsent: consents.hasContentForConfig(documentKey, binding),
    }
  }

  /** Estado atual da área para o documento. Não decifra a credencial nem contata o provedor. */
  async function load(documentKey: string): Promise<AiProviderStatus> {
    const read = await readSummary()

    if (!read.ok) {
      return { state: 'BLOCKED', blocked: read.blocked }
    }

    if (read.stored.summary === undefined) {
      return {
        state: 'NONE',
        revision: read.stored.revision,
        protection: protection(),
      }
    }

    return describe(read.stored, documentKey)
  }

  /** Registra o consentimento de credencial para a origem/configuração vigentes. */
  async function authorizeCredential(documentKey: string): Promise<AuthorizeAiUseResult> {
    const read = await readSummary()

    if (!read.ok) {
      return { ok: false, blocked: read.blocked }
    }

    if (read.stored.summary === undefined) {
      return { ok: false, state: 'NOT_CONFIGURED' }
    }

    consents.grant(documentKey, 'CREDENTIAL', bindingFor(read.stored))
    return { ok: true }
  }

  /**
   * Grava substituindo a configuração por completo. Credencial ausente/vazia preserva a já
   * gravada; a revisão esperada é conferida antes de qualquer efeito. Sucesso aborta os pedidos
   * em voo e limpa os consentimentos, porque a configuração deixou de ser a mesma.
   */
  async function save(
    documentKey: string,
    draft: AiProviderConfigDraft,
    expectedRevision: string,
  ): Promise<SaveAiProviderConfigResult> {
    const read = await readSummary()

    // Configuração incompatível ou publicação incerta bloqueia a gravação: nada é sobrescrito.
    if (!read.ok) {
      return { ok: false, blocked: read.blocked }
    }

    const typed = draft.credential?.trim() ?? ''
    const hasStored = read.stored.summary?.hasCredential === true

    if (typed === '' && !hasStored) {
      return { ok: false, errors: { credential: 'Informe a credencial do provedor.' } }
    }

    const built = buildAiProviderConfig({
      ...draft,
      ...(typed === '' && { credential: PRESERVED_CREDENTIAL }),
    })

    if (!built.ok) {
      return { ok: false, errors: built.errors }
    }

    const config = built.config

    try {
      const saved = await repository.save({
        expectedRevision,
        provider: config.provider,
        ...(config.provider === 'CUSTOM' && { apiBase: config.apiBase }),
        model: config.model,
        ...(typed !== '' && { credential: typed }),
      })
      requests.abortAll()
      consents.clearAll()
      return { ok: true, status: describe(saved, documentKey) }
    } catch (error) {
      return { ok: false, blocked: aiBlockFor(error) }
    }
  }

  /**
   * Apaga a configuração e o ciphertext, inclusive em estado bloqueado ou indecifrável. Sucesso
   * aborta os pedidos em voo e revoga todos os consentimentos.
   */
  async function remove(): Promise<RemoveAiProviderConfigResult> {
    try {
      const removed = await repository.remove()
      requests.abortAll()
      consents.clearAll()
      return {
        ok: true,
        status: {
          state: 'NONE',
          revision: removed.revision,
          protection: protection(),
        },
      }
    } catch (error) {
      return { ok: false, blocked: aiBlockFor(error) }
    }
  }

  /**
   * Único caminho de rede da configuração. Sem consentimento vigente para a origem, nada é
   * enviado. O corpo da resposta nunca é lido pelo executor de verificação.
   */
  async function testConnection(
    documentKey: string,
    input: { probe: AiConnectionProbe },
  ): Promise<AiTestOutcome> {
    let opened: { config: AiProviderConfig; revision: string } | undefined

    try {
      opened = await repository.openCredential()
    } catch (error) {
      return { ok: false, state: 'BLOCKED', blocked: aiBlockFor(error) }
    }

    if (opened === undefined) {
      return { ok: false, state: 'NOT_CONFIGURED' }
    }

    const config = opened.config
    const binding = {
      origin: resolveConfigOrigin(config),
      provider: config.provider,
      apiBase: resolveApiBase(config),
      configRevision: opened.revision,
    }

    if (!consents.has(documentKey, 'CREDENTIAL', binding)) {
      return { ok: false, state: 'CONSENT_REQUIRED' }
    }

    const ticket = requests.begin(documentKey, { configRevision: opened.revision })

    if (ticket === undefined) {
      return { ok: false, state: 'BUSY' }
    }

    try {
      const result = await tester.testConnection({ config, probe: input.probe, signal: ticket.signal })

      // O cancelamento e o aborto têm precedência sobre a resposta que porventura chegou.
      if (ticket.cancelled) {
        return { ok: false, state: 'CANCELLED' }
      }

      if (!requests.isCurrent(ticket)) {
        return { ok: false, state: 'DISCARDED' }
      }

      if (!result.ok) {
        return {
          ok: false,
          state: 'FAILED',
          reason: result.reason,
          ...(result.status !== undefined && { status: result.status }),
        }
      }

      return { ok: true }
    } finally {
      requests.finish(ticket)
    }
  }

  return { load, save, remove, authorizeCredential, testConnection }
}

export type AiProviderService = ReturnType<typeof createAiProviderService>
