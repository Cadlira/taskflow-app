import { asExactRecord, serializedBytes } from './record.js'
import { STATE_ERROR_CODES, isOpaqueToken, isRevisionText } from './state.js'

// Catálogo fechado v1 de contexto/confirmação/lixeira/undo: oito wrappers, sem RPC genérico.
// Requests têm schema exato e até 64 KiB UTF-8; respostas até 8 KiB; nenhuma Task/antes/plano,
// clock, predicate, SQL, path ou sessionId informado pelo renderer é aceito.

export const TRASH_CLEAR_UNDO_OFFER_CHANNEL = 'trash:clear-undo:v1'
export const TRASH_PREPARE_CONFIRMATION_CHANNEL = 'trash:prepare-confirm:v1'
export const TRASH_MOVE_CHANNEL = 'trash:move:v1'
export const TRASH_RESTORE_CHANNEL = 'trash:restore:v1'
export const TRASH_DELETE_CHANNEL = 'trash:delete:v1'
export const TRASH_EMPTY_CHANNEL = 'trash:empty:v1'
export const TRASH_PREPARE_VIEW_CHANNEL = 'trash:prepare-view:v1'
export const TRASH_UNDO_CHANNEL = 'task:undo:v1'

/** Canais que o preload pode invocar para os oito wrappers desta Change. */
export const TRASH_COMMAND_CHANNELS: readonly string[] = [
  TRASH_CLEAR_UNDO_OFFER_CHANNEL,
  TRASH_PREPARE_CONFIRMATION_CHANNEL,
  TRASH_MOVE_CHANNEL,
  TRASH_RESTORE_CHANNEL,
  TRASH_DELETE_CHANNEL,
  TRASH_EMPTY_CHANNEL,
  TRASH_PREPARE_VIEW_CHANNEL,
  TRASH_UNDO_CHANNEL,
]

export const TRASH_COMMAND_LIMITS = {
  requestBytes: 64 * 1024,
  responseBytes: 8 * 1024,
} as const

export const TRASH_ERROR_CODES = [
  ...STATE_ERROR_CODES,
  'STALE_CONTEXT',
  'CONFIRMATION_INVALID',
  'CONFIRMATION_CHANGED',
  'NOT_IN_TRASH',
  'ENTRY_CHANGED',
  'ENTRY_EXPIRED',
  'ID_EXISTS',
  'UNDO_NOT_AVAILABLE',
  'CHANGED',
  'REMOVED',
  'GENERATED_CHANGED',
  'SERIES_CONFLICT',
  'NOT_FOUND',
  'CONFLICT',
  'BUSY',
] as const

export type TrashErrorCode = (typeof TRASH_ERROR_CODES)[number]

export type TrashFailure = Readonly<{ version: 1; status: 'error'; code: TrashErrorCode }>

export function trashFailure(code: TrashErrorCode): TrashFailure {
  return { version: 1, status: 'error', code }
}

export function isTrashErrorCode(value: unknown): value is TrashErrorCode {
  return typeof value === 'string' && (TRASH_ERROR_CODES as readonly string[]).includes(value)
}

// ---- Superfície pública do renderer ----

/** Identidade observada de uma entrada: strings exatas do snapshot, nunca Task. */
export type TrashEntryReference = Readonly<{ taskId: string; contentRevision: string; deletedAt: string }>

export type ClearUndoOfferRequest = Readonly<{ version: 1; contextSequence: number }>
export type PrepareTrashConfirmationRequest = Readonly<
  | { version: 1; contextSequence: number; kind: 'MOVE'; taskId: string; expectedContentRevision: string }
  | { version: 1; contextSequence: number; kind: 'PERMANENT'; entry: TrashEntryReference }
  | { version: 1; contextSequence: number; kind: 'EMPTY' }
>
export type MoveTaskToTrashRequest = Readonly<{ version: 1; contextSequence: number; confirmationToken: string }>
export type RestoreTrashItemRequest = Readonly<{ version: 1; contextSequence: number; entry: TrashEntryReference }>
export type DeleteTrashItemRequest = Readonly<{ version: 1; contextSequence: number; confirmationToken: string }>
export type EmptyTrashRequest = Readonly<{ version: 1; contextSequence: number; confirmationToken: string }>
export type PrepareTrashViewRequest = Readonly<{ version: 1; contextSequence: number }>
export type UndoLastTaskActionRequest = Readonly<{ version: 1; contextSequence: number; undoToken: string }>

export type ClearUndoOfferAck = Readonly<{ version: 1; status: 'ok'; contextSequence: number }>
export type PrepareTrashConfirmationAck = Readonly<{
  version: 1
  status: 'ok'
  confirmationToken: string
  revision: string
  itemCount: number
  /** Presente somente em MOVE: a portadora avisa que a série será interrompida. */
  hasRecurrence?: boolean
}>
export type MoveTaskToTrashAck = Readonly<{
  version: 1
  status: 'ok'
  revision: string
  retained: boolean
  /** Somente quando retida e o contexto ainda era válido na publicação. */
  undoToken?: string
}>
export type RestoreTrashItemAck = Readonly<{
  version: 1
  status: 'ok'
  revision: string
  contentRevision: string
  editRevision: string
}>
export type DeleteTrashItemAck = Readonly<{ version: 1; status: 'ok'; revision: string }>
export type EmptyTrashAck = Readonly<{ version: 1; status: 'ok'; revision: string; removedCount: number }>
export type PrepareTrashViewAck = Readonly<{ version: 1; status: 'ok'; revision: string; purgedCount: number }>
export type UndoLastTaskActionAck = Readonly<{
  version: 1
  status: 'ok'
  revision: string
  contentRevision: string
  editRevision: string
}>

export type ClearUndoOfferResult = ClearUndoOfferAck | TrashFailure
export type PrepareTrashConfirmationResult = PrepareTrashConfirmationAck | TrashFailure
export type MoveTaskToTrashResult = MoveTaskToTrashAck | TrashFailure
export type RestoreTrashItemResult = RestoreTrashItemAck | TrashFailure
export type DeleteTrashItemResult = DeleteTrashItemAck | TrashFailure
export type EmptyTrashResult = EmptyTrashAck | TrashFailure
export type PrepareTrashViewResult = PrepareTrashViewAck | TrashFailure
export type UndoLastTaskActionResult = UndoLastTaskActionAck | TrashFailure

// ---- Validação em runtime ----

function fitsRequestBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= TRASH_COMMAND_LIMITS.requestBytes
}

/** Confere o orçamento real da resposta serializada; nunca trunca para caber. */
export function fitsTrashResponseBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= TRASH_COMMAND_LIMITS.responseBytes
}

function isContextSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function isTaskId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isDeletedAtText(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function isTrashEntryReference(value: unknown): value is TrashEntryReference {
  const record = asExactRecord(value, ['taskId', 'contentRevision', 'deletedAt'])
  if (record === null) return false
  return (
    isTaskId(record['taskId']) &&
    isRevisionText(record['contentRevision']) &&
    isDeletedAtText(record['deletedAt'])
  )
}

function parseEntryReference(value: unknown): TrashEntryReference | null {
  if (!isTrashEntryReference(value)) return null
  const record = value as { taskId: string; contentRevision: string; deletedAt: string }
  return { taskId: record.taskId, contentRevision: record.contentRevision, deletedAt: record.deletedAt }
}

export function parseClearUndoOfferRequest(value: unknown): ClearUndoOfferRequest | null {
  if (!fitsRequestBudget(value)) return null
  const record = asExactRecord(value, ['version', 'contextSequence'])
  if (record === null || record['version'] !== 1) return null
  return isContextSequence(record['contextSequence'])
    ? { version: 1, contextSequence: record['contextSequence'] }
    : null
}

export function parsePrepareTrashConfirmationRequest(value: unknown): PrepareTrashConfirmationRequest | null {
  if (!fitsRequestBudget(value)) return null
  const record = asExactRecord(value, ['version', 'contextSequence', 'kind'], [
    'taskId',
    'expectedContentRevision',
    'entry',
  ])
  if (record === null || record['version'] !== 1 || !isContextSequence(record['contextSequence'])) return null
  const common = { version: 1 as const, contextSequence: record['contextSequence'] }
  const kind = record['kind']
  if (kind === 'EMPTY') {
    const exact = asExactRecord(value, ['version', 'contextSequence', 'kind'])
    return exact === null ? null : { ...common, kind: 'EMPTY' }
  }
  if (kind === 'MOVE') {
    const exact = asExactRecord(value, ['version', 'contextSequence', 'kind', 'taskId', 'expectedContentRevision'])
    if (exact === null) return null
    if (!isTaskId(exact['taskId']) || !isRevisionText(exact['expectedContentRevision'])) return null
    return {
      ...common,
      kind: 'MOVE',
      taskId: exact['taskId'],
      expectedContentRevision: exact['expectedContentRevision'],
    }
  }
  if (kind === 'PERMANENT') {
    const exact = asExactRecord(value, ['version', 'contextSequence', 'kind', 'entry'])
    if (exact === null) return null
    const entry = parseEntryReference(exact['entry'])
    return entry === null ? null : { ...common, kind: 'PERMANENT', entry }
  }
  return null
}

export function parseMoveTaskToTrashRequest(value: unknown): MoveTaskToTrashRequest | null {
  if (!fitsRequestBudget(value)) return null
  const record = asExactRecord(value, ['version', 'contextSequence', 'confirmationToken'])
  if (record === null || record['version'] !== 1 || !isContextSequence(record['contextSequence'])) return null
  return isOpaqueToken(record['confirmationToken'])
    ? { version: 1, contextSequence: record['contextSequence'], confirmationToken: record['confirmationToken'] }
    : null
}

export function parseRestoreTrashItemRequest(value: unknown): RestoreTrashItemRequest | null {
  if (!fitsRequestBudget(value)) return null
  const record = asExactRecord(value, ['version', 'contextSequence', 'entry'])
  if (record === null || record['version'] !== 1 || !isContextSequence(record['contextSequence'])) return null
  const entry = parseEntryReference(record['entry'])
  return entry === null ? null : { version: 1, contextSequence: record['contextSequence'], entry }
}

function parseTokenOnlyRequest(value: unknown): { version: 1; contextSequence: number; confirmationToken: string } | null {
  if (!fitsRequestBudget(value)) return null
  const record = asExactRecord(value, ['version', 'contextSequence', 'confirmationToken'])
  if (record === null || record['version'] !== 1 || !isContextSequence(record['contextSequence'])) return null
  return isOpaqueToken(record['confirmationToken'])
    ? { version: 1, contextSequence: record['contextSequence'], confirmationToken: record['confirmationToken'] }
    : null
}

export const parseDeleteTrashItemRequest = parseTokenOnlyRequest
export const parseEmptyTrashRequest = parseTokenOnlyRequest

export function parsePrepareTrashViewRequest(value: unknown): PrepareTrashViewRequest | null {
  return parseClearUndoOfferRequest(value)
}

export function parseUndoLastTaskActionRequest(value: unknown): UndoLastTaskActionRequest | null {
  if (!fitsRequestBudget(value)) return null
  const record = asExactRecord(value, ['version', 'contextSequence', 'undoToken'])
  if (record === null || record['version'] !== 1 || !isContextSequence(record['contextSequence'])) return null
  return isOpaqueToken(record['undoToken'])
    ? { version: 1, contextSequence: record['contextSequence'], undoToken: record['undoToken'] }
    : null
}

// ---- Parse da saída (preload) ----

function parseFailure(value: unknown): TrashFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'error') return null
  return isTrashErrorCode(record['code']) ? trashFailure(record['code']) : null
}

function parseCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function withinBudget<T>(value: T): T | null {
  return fitsTrashResponseBudget(value) ? value : null
}

export function parseClearUndoOfferResult(value: unknown): ClearUndoOfferResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'contextSequence'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok') return null
  return isContextSequence(record['contextSequence'])
    ? withinBudget({ version: 1 as const, status: 'ok' as const, contextSequence: record['contextSequence'] })
    : null
}

export function parsePrepareTrashConfirmationResult(value: unknown): PrepareTrashConfirmationResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(
    value,
    ['version', 'status', 'confirmationToken', 'revision', 'itemCount'],
    ['hasRecurrence'],
  )
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok') return null
  if (!isOpaqueToken(record['confirmationToken']) || !isRevisionText(record['revision'])) return null
  const itemCount = parseCount(record['itemCount'])
  if (itemCount === null) return null
  if ('hasRecurrence' in record && typeof record['hasRecurrence'] !== 'boolean') return null
  const ack: PrepareTrashConfirmationAck = {
    version: 1,
    status: 'ok',
    confirmationToken: record['confirmationToken'],
    revision: record['revision'],
    itemCount,
    ...('hasRecurrence' in record && { hasRecurrence: record['hasRecurrence'] as boolean }),
  }
  return withinBudget(ack)
}

export function parseMoveTaskToTrashResult(value: unknown): MoveTaskToTrashResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'revision', 'retained'], ['undoToken'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok') return null
  if (!isRevisionText(record['revision']) || typeof record['retained'] !== 'boolean') return null
  if ('undoToken' in record && !isOpaqueToken(record['undoToken'])) return null
  const ack: MoveTaskToTrashAck = {
    version: 1,
    status: 'ok',
    revision: record['revision'],
    retained: record['retained'],
    ...('undoToken' in record && { undoToken: record['undoToken'] as string }),
  }
  return withinBudget(ack)
}

export function parseRestoreTrashItemResult(value: unknown): RestoreTrashItemResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'revision', 'contentRevision', 'editRevision'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok') return null
  if (
    !isRevisionText(record['revision']) ||
    !isRevisionText(record['contentRevision']) ||
    !isRevisionText(record['editRevision'])
  ) {
    return null
  }
  return withinBudget({
    version: 1 as const,
    status: 'ok' as const,
    revision: record['revision'],
    contentRevision: record['contentRevision'],
    editRevision: record['editRevision'],
  })
}

export function parseDeleteTrashItemResult(value: unknown): DeleteTrashItemResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'revision'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !isRevisionText(record['revision'])) {
    return null
  }
  return withinBudget({ version: 1 as const, status: 'ok' as const, revision: record['revision'] })
}

export function parseEmptyTrashResult(value: unknown): EmptyTrashResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'revision', 'removedCount'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !isRevisionText(record['revision'])) {
    return null
  }
  const removedCount = parseCount(record['removedCount'])
  if (removedCount === null) return null
  return withinBudget({ version: 1 as const, status: 'ok' as const, revision: record['revision'], removedCount })
}

export function parsePrepareTrashViewResult(value: unknown): PrepareTrashViewResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'revision', 'purgedCount'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !isRevisionText(record['revision'])) {
    return null
  }
  const purgedCount = parseCount(record['purgedCount'])
  if (purgedCount === null) return null
  return withinBudget({ version: 1 as const, status: 'ok' as const, revision: record['revision'], purgedCount })
}

export function parseUndoLastTaskActionResult(value: unknown): UndoLastTaskActionResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'revision', 'contentRevision', 'editRevision'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok') return null
  if (
    !isRevisionText(record['revision']) ||
    !isRevisionText(record['contentRevision']) ||
    !isRevisionText(record['editRevision'])
  ) {
    return null
  }
  return withinBudget({
    version: 1 as const,
    status: 'ok' as const,
    revision: record['revision'],
    contentRevision: record['contentRevision'],
    editRevision: record['editRevision'],
  })
}
