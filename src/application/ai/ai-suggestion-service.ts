import {
  buildSubtaskSuggestionContent,
  buildSubtaskSuggestionProposal,
  SUBTASK_SUGGESTION_OUTPUT_LIMIT,
  type SubtaskSuggestionProposal,
} from '../../domain/ai-subtask-suggestion.js'
import { MAX_SUBTASKS } from '../../domain/task-subtasks.js'
import { resolveApiBase, resolveConfigOrigin, resolveOrigin, type AiProvider } from '../../domain/ai-provider.js'
import {
  AiConfigStorageError,
  aiBlockFor,
  type AiConfigBlock,
  type AiProviderConfigRepository,
} from './ai-provider-config-repository.js'
import type { AiConsentRegistry } from './ai-consent.js'
import type { AiRequestRegistry } from './ai-request-registry.js'
import { AI_GENERATION_TIMEOUT_MS, type AiGenerationFailure, type AiSubtaskSuggester } from './ai-subtask-suggester.js'

export interface AiSuggestionInput {
  title: string
  description: string
  /** Itens já presentes na lista do formulário, base do cálculo das vagas restantes (0–19). */
  existingSubtaskCount: number
}

/** Prévia devolvida ao renderer: o texto exato que sairá do dispositivo e o vínculo da sessão. */
export interface PreparedAiSuggestion {
  requestId: string
  content: string
  descriptionTruncated: boolean
  origin: string
  consentRequired: boolean
}

export type PrepareAiSuggestionOutcome =
  | { ok: true; prepared: PreparedAiSuggestion }
  | { ok: false; state: 'NOT_CONFIGURED' | 'TITLE_REQUIRED' | 'NO_SLOTS' }
  | { ok: false; state: 'BLOCKED'; blocked: AiConfigBlock }

export type SuggestAiSubtasksOutcome =
  | { ok: true; proposal: SubtaskSuggestionProposal }
  | {
      ok: false
      state: 'STALE_REQUEST' | 'NOT_CONFIGURED' | 'BUSY' | 'CANCELLED' | 'DISCARDED' | 'CONSENT_REQUIRED'
    }
  | { ok: false; state: 'BLOCKED'; blocked: AiConfigBlock }
  | { ok: false; state: 'FAILED'; reason: AiGenerationFailure; status?: number }

export type AuthorizeAiContentResult =
  | { ok: true }
  | { ok: false; state: 'STALE_REQUEST' }
  | { ok: false; blocked: AiConfigBlock }

export type CancelAiSuggestionOutcome = { ok: true; cancelled: true } | { ok: false; state: 'UNKNOWN_REQUEST' }

/** Snapshot preparado no main: a geração executa exatamente esta cadeia, sem re-montagem. */
interface AiSuggestionSnapshot {
  requestId: string
  content: string
  descriptionTruncated: boolean
  origin: string
  provider: AiProvider
  apiBase: string
  configRevision: string
  existingSubtaskCount: number
}

export interface AiSuggestionServiceDependencies {
  repository: AiProviderConfigRepository
  consents: AiConsentRegistry
  requests: AiRequestRegistry
  suggester: AiSubtaskSuggester
  /** Identidade opaca do pedido; vem da composição (main), nunca do renderer. */
  generateRequestId: () => string
}

/**
 * Caso de uso da sugestão de subtarefas. A prévia é preparada e vinculada a um `requestId`; a
 * geração executa o snapshot preparado, com no máximo uma requisição em voo por documento,
 * limitada no tempo e cancelável, e devolve a proposta já validada pelas regras da digitação
 * manual ou um motivo do conjunto fechado.
 *
 * Nada aqui é persistido: o caso de uso não grava no armazenamento em nenhum caminho, e uma
 * resposta que chega depois de cancelamento, troca de configuração ou invalidação de sessão é
 * descartada sem entrega e sem registro de conteúdo.
 */
export function createAiSuggestionService({
  repository,
  consents,
  requests,
  suggester,
  generateRequestId,
}: AiSuggestionServiceDependencies) {
  const snapshots = new Map<string, AiSuggestionSnapshot>()

  function bindingOf(snapshot: AiSuggestionSnapshot): {
    origin: string
    provider: AiProvider
    apiBase: string
    configRevision: string
    requestId: string
  } {
    return {
      origin: snapshot.origin,
      provider: snapshot.provider,
      apiBase: snapshot.apiBase,
      configRevision: snapshot.configRevision,
      requestId: snapshot.requestId,
    }
  }

  /**
   * Prepara a prévia exata: título e descrição atuais, corte sinalizado e origem de destino. A
   * preparação anterior do documento é invalidada; o renderer exibe exatamente o texto devolvido.
   */
  async function prepare(documentKey: string, input: AiSuggestionInput): Promise<PrepareAiSuggestionOutcome> {
    const title = input.title.trim()

    if (title === '') {
      return { ok: false, state: 'TITLE_REQUIRED' }
    }

    if (input.existingSubtaskCount >= MAX_SUBTASKS) {
      return { ok: false, state: 'NO_SLOTS' }
    }

    let stored

    try {
      stored = await repository.read()
    } catch (error) {
      if (error instanceof AiConfigStorageError && error.reason === 'UNKNOWN') {
        try {
          await repository.reconcile()
          stored = await repository.read()
        } catch (reconcileError) {
          return { ok: false, state: 'BLOCKED', blocked: aiBlockFor(reconcileError) }
        }
      } else {
        return { ok: false, state: 'BLOCKED', blocked: aiBlockFor(error) }
      }
    }

    const summary = stored.summary

    if (summary === undefined) {
      return { ok: false, state: 'NOT_CONFIGURED' }
    }

    const built = buildSubtaskSuggestionContent(title, input.description)
    const snapshot: AiSuggestionSnapshot = {
      requestId: generateRequestId(),
      content: built.content,
      descriptionTruncated: built.descriptionTruncated,
      origin: resolveOrigin(summary.apiBase),
      provider: summary.provider,
      apiBase: summary.apiBase,
      configRevision: stored.revision,
      existingSubtaskCount: input.existingSubtaskCount,
    }
    snapshots.set(documentKey, snapshot)
    const consentRequired = !consents.has(documentKey, 'CONTENT', bindingOf(snapshot))

    return {
      ok: true,
      prepared: {
        requestId: snapshot.requestId,
        content: snapshot.content,
        descriptionTruncated: snapshot.descriptionTruncated,
        origin: snapshot.origin,
        consentRequired,
      },
    }
  }

  /** Registra o consentimento de conteúdo para a prévia preparada do próprio documento. */
  async function authorizeContent(documentKey: string, requestId: string): Promise<AuthorizeAiContentResult> {
    const snapshot = snapshots.get(documentKey)

    if (snapshot === undefined || snapshot.requestId !== requestId) {
      return { ok: false, state: 'STALE_REQUEST' }
    }

    if (!repository.protectionAvailable()) {
      return { ok: false, blocked: 'PROTECTION_UNAVAILABLE' }
    }

    consents.grant(documentKey, 'CONTENT', bindingOf(snapshot))
    return { ok: true }
  }

  /**
   * Executa o snapshot preparado. O `requestId` é consumido no início: pedido alheio, antigo ou
   * já consumido é recusado sem afetar pedidos de outra sessão.
   */
  async function suggest(documentKey: string, input: { requestId: string }): Promise<SuggestAiSubtasksOutcome> {
    const snapshot = snapshots.get(documentKey)

    if (snapshot === undefined || snapshot.requestId !== input.requestId) {
      return { ok: false, state: 'STALE_REQUEST' }
    }

    // Sem consentimento vigente nada é enviado nem consumido: autorizar mantém a prévia válida.
    if (!consents.has(documentKey, 'CONTENT', bindingOf(snapshot))) {
      return { ok: false, state: 'CONSENT_REQUIRED' }
    }

    const ticket = requests.begin(documentKey, {
      requestId: snapshot.requestId,
      configRevision: snapshot.configRevision,
    })

    if (ticket === undefined) {
      // Ocupado: a prévia preparada é conservada para novo acionamento após o pedido em voo.
      return { ok: false, state: 'BUSY' }
    }

    snapshots.delete(documentKey)

    /** Cancelamento do usuário prevalece; aborto por troca de configuração/sessão descarta. */
    const discard = (): SuggestAiSubtasksOutcome =>
      ticket.cancelled ? { ok: false, state: 'CANCELLED' } : { ok: false, state: 'DISCARDED' }

    try {
      let opened

      try {
        opened = await repository.openCredential()
      } catch (error) {
        return { ok: false, state: 'BLOCKED', blocked: aiBlockFor(error) }
      }

      if (opened === undefined) {
        return { ok: false, state: 'NOT_CONFIGURED' }
      }

      // A configuração precisa ser a mesma da preparação; qualquer troca invalida o snapshot.
      if (
        opened.revision !== snapshot.configRevision ||
        resolveConfigOrigin(opened.config) !== snapshot.origin ||
        resolveApiBase(opened.config) !== snapshot.apiBase
      ) {
        return { ok: false, state: 'STALE_REQUEST' }
      }

      if (!requests.isCurrent(ticket)) {
        return discard()
      }

      if (!consents.has(documentKey, 'CONTENT', bindingOf(snapshot))) {
        return { ok: false, state: 'CONSENT_REQUIRED' }
      }

      const response = await suggester.suggestSubtasks({
        config: opened.config,
        content: snapshot.content,
        maxOutputTokens: SUBTASK_SUGGESTION_OUTPUT_LIMIT,
        signal: ticket.signal,
      })

      // O cancelamento e o aborto têm precedência sobre a resposta que porventura chegou.
      if (ticket.cancelled) {
        return { ok: false, state: 'CANCELLED' }
      }

      if (!requests.isCurrent(ticket)) {
        return { ok: false, state: 'DISCARDED' }
      }

      // Revisão monotônica: uma configuração trocada durante o pedido descarta o resultado.
      let revisionNow: string

      try {
        revisionNow = await repository.currentRevision()
      } catch {
        return { ok: false, state: 'DISCARDED' }
      }

      if (revisionNow !== snapshot.configRevision) {
        return { ok: false, state: 'DISCARDED' }
      }

      if (!response.ok) {
        return {
          ok: false,
          state: 'FAILED',
          reason: response.reason,
          ...(response.status !== undefined && { status: response.status }),
        }
      }

      const proposal = buildSubtaskSuggestionProposal(response.text, snapshot.existingSubtaskCount)

      if (proposal.drafts.length === 0) {
        return { ok: false, state: 'FAILED', reason: 'NO_VALID_ITEM' }
      }

      return { ok: true, proposal }
    } finally {
      requests.finish(ticket)
    }
  }

  /**
   * Cancela o pedido do próprio `requestId`: um pedido em voo é abortado; uma preparação ainda
   * não enviada tem o `requestId` invalidado. `requestId` de outro documento é recusado.
   */
  function cancel(documentKey: string, requestId: string): CancelAiSuggestionOutcome {
    if (requests.cancel(documentKey, requestId)) {
      return { ok: true, cancelled: true }
    }

    const snapshot = snapshots.get(documentKey)

    if (snapshot !== undefined && snapshot.requestId === requestId) {
      snapshots.delete(documentKey)
      return { ok: true, cancelled: true }
    }

    return { ok: false, state: 'UNKNOWN_REQUEST' }
  }

  /** Sessão invalidada, fechamento, crash ou saída: descarta prévia, consentimentos e pedido. */
  function forgetDocument(documentKey: string): void {
    snapshots.delete(documentKey)
    consents.clearDocument(documentKey)
    requests.abortDocument(documentKey)
  }

  /** Superfície ocultada/suspensa: aborta o pedido em voo e conserva prévia e consentimentos. */
  function abortDocument(documentKey: string): void {
    requests.abortDocument(documentKey)
  }

  /** Tempo máximo de geração exposto ao IPC para documentação/teste sem duplicar o valor. */
  const generationTimeoutMs = AI_GENERATION_TIMEOUT_MS

  return { prepare, authorizeContent, suggest, cancel, forgetDocument, abortDocument, generationTimeoutMs }
}

export type AiSuggestionService = ReturnType<typeof createAiSuggestionService>
