import { asExactRecord, serializedBytes } from './record.js'
import { TASK_LIMITS } from '../domain/task-draft.js'
import { isAiProvider, type AiProvider } from '../domain/ai-provider.js'
import { MAX_SUBTASKS, SUBTASK_TITLE_LIMIT } from '../domain/task-subtasks.js'
import { SUBTASK_SUGGESTION_DESCRIPTION_LIMIT } from '../domain/ai-subtask-suggestion.js'

/**
 * Catálogo fechado das oito operações de IA `:v1`, somente manager. Diferente das demais
 * famílias, os orçamentos incluem uma exceção declarada de 16 KiB para a prévia e o resultado da
 * sugestão — medidos em UTF-8 completo, antes de qualquer efeito.
 */
export const AI_CHANNELS = {
  getAiProviderStatus: 'ai:get-status:v1',
  saveAiProviderConfig: 'ai:save-config:v1',
  removeAiProviderConfig: 'ai:remove-config:v1',
  authorizeAiUse: 'ai:authorize:v1',
  testAiConnection: 'ai:test-connection:v1',
  prepareAiSuggestion: 'ai:prepare-suggestion:v1',
  suggestAiSubtasks: 'ai:suggest:v1',
  cancelAiSuggestion: 'ai:cancel:v1',
} as const

export const AI_CHANNEL_LIST: readonly string[] = Object.values(AI_CHANNELS)

export const AI_LIMITS = {
  /** Requests das operações de IA: 1 KiB UTF-8 serializado. */
  requestBytes: 1024,
  /** Results das operações de IA: 8 KiB, exceto prévia/sugestão (16 KiB). */
  resultBytes: 8192,
  /** Configuração completa (base e modelo extensos) e resumo devolvido ao renderer: 8 KiB. */
  configBytes: 8192,
  /** Prévia preparada e resultado da sugestão: 16 KiB UTF-8 medidos antes de qualquer efeito. */
  suggestionBytes: 16384,
} as const

/**
 * Conjunto fechado de códigos de erro do grupo de IA. Nenhum detalhe de implementação, URL
 * completa, cabeçalho, corpo do provedor ou credencial acompanha o código.
 */
export const AI_ERROR_CODES = [
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'BUSY',
  'NOT_CONFIGURED',
  'CONSENT_REQUIRED',
  'STALE_REQUEST',
  'SESSION_CLOSED',
  'VALIDATION_FAILED',
  'BLOCKED',
  'FAILED',
  'CANCELLED',
  'DISCARDED',
  'UNKNOWN_REQUEST',
  'RESOURCE_LIMIT',
  'UNAVAILABLE',
] as const

export type AiErrorCode = (typeof AI_ERROR_CODES)[number]

/** Bloqueios do armazenamento/proteção, correspondentes fechados de `AiConfigBlock`. */
export const AI_BLOCK_CODES = [
  'INCOMPATIBLE',
  'PROTECTION_UNAVAILABLE',
  'CREDENTIAL_UNREADABLE',
  'UNKNOWN',
  'UNAVAILABLE',
  'STALE_REVISION',
  'RESOURCE_LIMIT',
] as const

export type AiBlockCode = (typeof AI_BLOCK_CODES)[number]

/** Motivos de falha do provedor: união da verificação e da geração, sem o corpo da resposta. */
export const AI_FAILURE_REASONS = [
  'INVALID_CREDENTIALS',
  'ENDPOINT_UNREACHABLE',
  'MODEL_LIST_UNSUPPORTED',
  'TIMEOUT',
  'UNEXPECTED_RESPONSE',
  'EMPTY_RESPONSE',
  'UNREADABLE_RESPONSE',
  'NO_VALID_ITEM',
] as const

export type AiFailureReason = (typeof AI_FAILURE_REASONS)[number]

/** Campos de validação do formulário de configuração/preparação; mensagens fixas, sem segredo. */
export type AiFieldErrors = Readonly<{
  apiBase?: string
  credential?: string
  model?: string
  title?: string
  existingSubtaskCount?: string
}>

export interface AiFailure {
  version: 1
  status: 'error'
  code: AiErrorCode
  fields?: AiFieldErrors
  blocked?: AiBlockCode
  reason?: AiFailureReason
  /** Código de estado HTTP observado, quando houver; nunca o corpo nem a URL completa. */
  statusCode?: number
}

export function aiFailure(code: AiErrorCode): AiFailure {
  return { version: 1, status: 'error', code }
}

// ---- Requests ----

export type AiStatusRequest = Readonly<{ version: 1 }>
export type AiRemoveConfigRequest = Readonly<{ version: 1 }>
export type AiAuthorizeRequest =
  | Readonly<{ version: 1; scope: 'CREDENTIAL' }>
  | Readonly<{ version: 1; scope: 'CONTENT'; requestId: string }>
export type AiTestConnectionRequest = Readonly<{ version: 1; probe: 'MODEL_LIST' | 'MINIMAL_COMPLETION' }>
export type AiSaveConfigRequest = Readonly<{
  version: 1
  expectedRevision: string
  provider: AiProvider
  apiBase?: string
  credential?: string
  model: string
}>
export type AiPrepareSuggestionRequest = Readonly<{
  version: 1
  title: string
  description: string
  existingSubtaskCount: number
}>
export type AiRequestIdRequest = Readonly<{ version: 1; requestId: string }>

// ---- Results ----

export type AiProtection = 'AVAILABLE' | 'UNAVAILABLE'

export interface AiConfigSummary {
  provider: AiProvider
  apiBase: string
  origin: string
  model: string
  hasCredential: boolean
}

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
  | { state: 'BLOCKED'; blocked: AiBlockCode }

export type AiProviderStatusResult = Readonly<{ version: 1; status: 'ok'; provider: AiProviderStatus }> | AiFailure

export type AiSaveConfigResult = Readonly<{ version: 1; status: 'ok'; provider: AiProviderStatus }> | AiFailure
export type AiRemoveConfigResult = Readonly<{ version: 1; status: 'ok'; provider: AiProviderStatus }> | AiFailure
export type AiAuthorizeResult = Readonly<{ version: 1; status: 'ok'; scope: 'CREDENTIAL' | 'CONTENT' }> | AiFailure
export type AiTestConnectionResult = Readonly<{ version: 1; status: 'ok' }> | AiFailure

export interface PreparedAiSuggestion {
  requestId: string
  /** Texto exato que será transmitido; idêntico caractere a caractere ao exibido. */
  content: string
  descriptionTruncated: boolean
  origin: string
  consentRequired: boolean
}

export type AiPrepareSuggestionResult =
  | Readonly<{ version: 1; status: 'ok'; prepared: PreparedAiSuggestion }>
  | AiFailure

export interface AiSubtaskDraft {
  title: string
}

export type AiSuggestSubtasksResult =
  | Readonly<{
      version: 1
      status: 'ok'
      proposal: { drafts: AiSubtaskDraft[]; discardedByLimit: boolean }
    }>
  | AiFailure

export type AiCancelSuggestionResult = Readonly<{ version: 1; status: 'ok' }> | AiFailure

// ---- Validação em runtime: tipos TS não autorizam request nem resposta ----

const REVISION_PATTERN = /^(?:0|[1-9][0-9]{0,31})$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function isAiRevision(value: unknown): value is string {
  return typeof value === 'string' && REVISION_PATTERN.test(value)
}

export function isAiRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
}

function within(value: unknown, budget: number): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= budget
}

function optionalString(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return value === undefined || typeof value === 'string'
}

export function parseAiStatusRequest(value: unknown): AiStatusRequest | null {
  const record = asExactRecord(value, ['version'])
  return record !== null && record['version'] === 1 && within(value, AI_LIMITS.requestBytes) ? { version: 1 } : null
}

export function parseAiRemoveConfigRequest(value: unknown): AiRemoveConfigRequest | null {
  const record = asExactRecord(value, ['version'])
  return record !== null && record['version'] === 1 && within(value, AI_LIMITS.requestBytes) ? { version: 1 } : null
}

export function parseAiAuthorizeRequest(value: unknown): AiAuthorizeRequest | null {
  const record = asExactRecord(value, ['version', 'scope'], ['requestId'])
  if (record === null || record['version'] !== 1 || !within(value, AI_LIMITS.requestBytes)) return null
  const scope = record['scope']
  if (scope !== 'CREDENTIAL' && scope !== 'CONTENT') return null
  if (scope === 'CREDENTIAL') {
    return 'requestId' in record ? null : { version: 1, scope }
  }
  return isAiRequestId(record['requestId']) ? { version: 1, scope: 'CONTENT', requestId: record['requestId'] } : null
}

export function parseAiTestConnectionRequest(value: unknown): AiTestConnectionRequest | null {
  const record = asExactRecord(value, ['version', 'probe'])
  if (record === null || record['version'] !== 1 || !within(value, AI_LIMITS.requestBytes)) return null
  const probe = record['probe']
  return probe === 'MODEL_LIST' || probe === 'MINIMAL_COMPLETION' ? { version: 1, probe } : null
}

export function parseAiSaveConfigRequest(value: unknown): AiSaveConfigRequest | null {
  const record = asExactRecord(
    value,
    ['version', 'expectedRevision', 'provider', 'model'],
    ['apiBase', 'credential'],
  )
  if (record === null || record['version'] !== 1 || !within(value, AI_LIMITS.configBytes)) return null
  if (!isAiRevision(record['expectedRevision']) || !isAiProvider(record['provider'])) return null
  if (typeof record['model'] !== 'string' || !optionalString(record, 'apiBase') || !optionalString(record, 'credential')) {
    return null
  }

  // Base informada só é aceita em CUSTOM; provedor oficial com base é estrutura de outra origem.
  if (record['provider'] !== 'CUSTOM' && record['apiBase'] !== undefined) return null

  return {
    version: 1,
    expectedRevision: record['expectedRevision'],
    provider: record['provider'],
    model: record['model'],
    ...(record['apiBase'] !== undefined && { apiBase: record['apiBase'] as string }),
    ...(record['credential'] !== undefined && { credential: record['credential'] as string }),
  }
}

export function parseAiPrepareSuggestionRequest(value: unknown): AiPrepareSuggestionRequest | null {
  const record = asExactRecord(value, ['version', 'title', 'description', 'existingSubtaskCount'])
  if (record === null || record['version'] !== 1 || !within(value, AI_LIMITS.suggestionBytes)) return null
  const title = record['title']
  const description = record['description']
  const count = record['existingSubtaskCount']
  if (typeof title !== 'string' || title.length === 0 || title.length > TASK_LIMITS.title) return null
  if (typeof description !== 'string' || description.length > TASK_LIMITS.description) return null
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count >= MAX_SUBTASKS) return null
  return { version: 1, title, description, existingSubtaskCount: count }
}

export function parseAiRequestIdRequest(value: unknown): AiRequestIdRequest | null {
  const record = asExactRecord(value, ['version', 'requestId'])
  return record !== null && record['version'] === 1 && isAiRequestId(record['requestId']) && within(value, AI_LIMITS.requestBytes)
    ? { version: 1, requestId: record['requestId'] }
    : null
}

// ---- Falhas e resumos ----

function parseFieldErrors(value: unknown): AiFieldErrors | null {
  const record = asExactRecord(value, [], ['apiBase', 'credential', 'model', 'title', 'existingSubtaskCount'])
  if (record === null) return null
  const errors: Record<string, string> = {}
  for (const key of ['apiBase', 'credential', 'model', 'title', 'existingSubtaskCount']) {
    const message = record[key]
    if (message === undefined) continue
    if (typeof message !== 'string' || message.length === 0 || message.length > 200) return null
    errors[key] = message
  }
  return Object.keys(errors).length === 0 ? null : errors
}

function parseStatusCode(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 100 && value <= 599 ? value : null
}

export function parseAiFailure(value: unknown, budget: number = AI_LIMITS.resultBytes): AiFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'], ['fields', 'blocked', 'reason', 'statusCode'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'error' || !within(value, budget)) return null
  if (typeof record['code'] !== 'string' || !(AI_ERROR_CODES as readonly string[]).includes(record['code'])) return null
  if (
    record['blocked'] !== undefined &&
    (typeof record['blocked'] !== 'string' || !(AI_BLOCK_CODES as readonly string[]).includes(record['blocked']))
  ) {
    return null
  }
  if (
    record['reason'] !== undefined &&
    (typeof record['reason'] !== 'string' || !(AI_FAILURE_REASONS as readonly string[]).includes(record['reason']))
  ) {
    return null
  }
  const fields = record['fields'] === undefined ? undefined : parseFieldErrors(record['fields'])
  if (record['fields'] !== undefined && fields === null) return null
  const statusCode = parseStatusCode(record['statusCode'])
  if (statusCode === null) return null

  return {
    version: 1,
    status: 'error',
    code: record['code'] as AiErrorCode,
    ...(fields !== undefined && fields !== null && { fields }),
    ...(record['blocked'] !== undefined && { blocked: record['blocked'] as AiBlockCode }),
    ...(record['reason'] !== undefined && { reason: record['reason'] as AiFailureReason }),
    ...(statusCode !== undefined && statusCode !== null && { statusCode }),
  }
}

function parseConfigSummary(value: unknown): AiConfigSummary | null {
  const record = asExactRecord(value, ['provider', 'apiBase', 'origin', 'model', 'hasCredential'])
  if (record === null || !isAiProvider(record['provider']) || typeof record['apiBase'] !== 'string' ||
    typeof record['origin'] !== 'string' || typeof record['model'] !== 'string' || typeof record['hasCredential'] !== 'boolean') {
    return null
  }
  return {
    provider: record['provider'],
    apiBase: record['apiBase'],
    origin: record['origin'],
    model: record['model'],
    hasCredential: record['hasCredential'],
  }
}

export function parseAiProviderStatus(value: unknown): AiProviderStatus | null {
  const record = asExactRecord(value, ['state'], ['revision', 'protection', 'summary', 'credentialConsent', 'contentConsent', 'blocked'])
  if (record === null || typeof record['state'] !== 'string') return null
  const protection = record['protection']
  if (protection !== undefined && protection !== 'AVAILABLE' && protection !== 'UNAVAILABLE') return null

  if (record['state'] === 'BLOCKED') {
    const blocked = record['blocked']
    if (typeof blocked !== 'string' || !(AI_BLOCK_CODES as readonly string[]).includes(blocked)) return null
    if (record['revision'] !== undefined || record['summary'] !== undefined) return null
    return { state: 'BLOCKED', blocked: blocked as AiBlockCode }
  }

  if (record['state'] === 'NONE') {
    if (!isAiRevision(record['revision']) || protection === undefined) return null
    if (record['summary'] !== undefined || record['credentialConsent'] !== undefined || record['contentConsent'] !== undefined) return null
    return { state: 'NONE', revision: record['revision'], protection }
  }

  if (record['state'] !== 'CONFIGURED') return null
  if (!isAiRevision(record['revision']) || protection === undefined) return null
  if (typeof record['credentialConsent'] !== 'boolean' || typeof record['contentConsent'] !== 'boolean') return null
  const summary = parseConfigSummary(record['summary'])
  if (summary === null) return null
  return {
    state: 'CONFIGURED',
    revision: record['revision'],
    protection,
    summary,
    credentialConsent: record['credentialConsent'],
    contentConsent: record['contentConsent'],
  }
}

function parseStatusOk(value: unknown, budget: number): Readonly<{ version: 1; status: 'ok'; provider: AiProviderStatus }> | null {
  const record = asExactRecord(value, ['version', 'status', 'provider'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !within(value, budget)) return null
  const provider = parseAiProviderStatus(record['provider'])
  return provider === null ? null : { version: 1, status: 'ok', provider }
}

export function parseAiProviderStatusResult(value: unknown): AiProviderStatusResult | null {
  return parseAiFailure(value) ?? parseStatusOk(value, AI_LIMITS.resultBytes)
}

export function parseAiSaveConfigResult(value: unknown): AiSaveConfigResult | null {
  return parseAiFailure(value, AI_LIMITS.configBytes) ?? parseStatusOk(value, AI_LIMITS.configBytes)
}

export function parseAiRemoveConfigResult(value: unknown): AiRemoveConfigResult | null {
  return parseAiFailure(value) ?? parseStatusOk(value, AI_LIMITS.resultBytes)
}

export function parseAiAuthorizeResult(value: unknown): AiAuthorizeResult | null {
  const failure = parseAiFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'scope'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !within(value, AI_LIMITS.resultBytes)) return null
  return record['scope'] === 'CREDENTIAL' || record['scope'] === 'CONTENT' ? { version: 1, status: 'ok', scope: record['scope'] } : null
}

export function parseAiTestConnectionResult(value: unknown): AiTestConnectionResult | null {
  const failure = parseAiFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status'])
  return record !== null && record['version'] === 1 && record['status'] === 'ok' && within(value, AI_LIMITS.resultBytes)
    ? { version: 1, status: 'ok' }
    : null
}

function parsePrepared(value: unknown): PreparedAiSuggestion | null {
  const record = asExactRecord(value, ['requestId', 'content', 'descriptionTruncated', 'origin', 'consentRequired'])
  if (record === null || !isAiRequestId(record['requestId']) || typeof record['content'] !== 'string' ||
    typeof record['descriptionTruncated'] !== 'boolean' || typeof record['origin'] !== 'string' ||
    typeof record['consentRequired'] !== 'boolean') {
    return null
  }
  return {
    requestId: record['requestId'],
    content: record['content'],
    descriptionTruncated: record['descriptionTruncated'],
    origin: record['origin'],
    consentRequired: record['consentRequired'],
  }
}

export function parseAiPrepareSuggestionResult(value: unknown): AiPrepareSuggestionResult | null {
  const failure = parseAiFailure(value, AI_LIMITS.suggestionBytes)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'prepared'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !within(value, AI_LIMITS.suggestionBytes)) return null
  const prepared = parsePrepared(record['prepared'])
  return prepared === null ? null : { version: 1, status: 'ok', prepared }
}

export function parseAiSuggestSubtasksResult(value: unknown): AiSuggestSubtasksResult | null {
  const failure = parseAiFailure(value, AI_LIMITS.suggestionBytes)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'proposal'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !within(value, AI_LIMITS.suggestionBytes)) return null
  const proposal = asExactRecord(record['proposal'], ['drafts', 'discardedByLimit'])
  if (proposal === null || typeof proposal['discardedByLimit'] !== 'boolean' || !Array.isArray(proposal['drafts'])) return null
  if (proposal['drafts'].length > MAX_SUBTASKS) return null
  const drafts: AiSubtaskDraft[] = []
  for (const item of proposal['drafts'] as unknown[]) {
    const draft = asExactRecord(item, ['title'])
    if (draft === null || typeof draft['title'] !== 'string' || draft['title'].length === 0 || draft['title'].length > SUBTASK_TITLE_LIMIT) return null
    drafts.push({ title: draft['title'] })
  }
  return { version: 1, status: 'ok', proposal: { drafts, discardedByLimit: proposal['discardedByLimit'] } }
}

export function parseAiCancelSuggestionResult(value: unknown): AiCancelSuggestionResult | null {
  const failure = parseAiFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status'])
  return record !== null && record['version'] === 1 && record['status'] === 'ok' && within(value, AI_LIMITS.resultBytes)
    ? { version: 1, status: 'ok' }
    : null
}

/** Descrição máxima aceita no envelope de preparação, exposta para a UI/testes. */
export const AI_PREPARE_DESCRIPTION_LIMIT = SUBTASK_SUGGESTION_DESCRIPTION_LIMIT
