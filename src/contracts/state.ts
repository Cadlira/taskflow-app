import type { Task } from '../domain/task.js'
import { asExactRecord, serializedBytes } from './record.js'

// Catálogo fechado de estado v3. Separado de `foundation:verify:v1`. Cada registro carrega as
// revisões públicas de conteúdo completo e de edição, em forma decimal canônica. O snapshot
// carrega também a época transitória do undo (`undoEpoch`), que pertence ao par com a revisão:
// páginas e continuações valem somente para o par (revision, undoEpoch) capturado junto.
export const STATE_SNAPSHOT_CHANNEL = 'state:snapshot:v3'
export const STATE_SUBSCRIBE_CHANNEL = 'state:subscribe:v3'
export const STATE_UNSUBSCRIBE_CHANNEL = 'state:unsubscribe:v3'
export const STATE_CHANGED_EVENT = 'state:changed:v3'
export const STATE_UNAVAILABLE_EVENT = 'state:unavailable:v3'
export const STATE_UNDO_INVALIDATED_EVENT = 'state:undo-invalidated:v1'

export const STATE_LIMITS = {
  /** Request de estado/diagnóstico e eventos: 1 KiB UTF-8 serializado. */
  requestBytes: 1024,
  eventBytes: 1024,
  /** Página de snapshot: 256 KiB UTF-8 serializado, incluindo envelope e escaping. */
  pageBytes: 256 * 1024,
  /** Cursor sem atividade expira em 30 s; renovado a cada página. */
  cursorTtlMs: 30_000,
  /** Reconciliação periódica enquanto inscrito. */
  reconcileIntervalMs: 30_000,
  /** Reconstruções imediatas do snapshot por ciclo antes de devolver `BUSY`. */
  immediateRebuilds: 3,
  /** Documentos registrados simultaneamente (harness de teste). */
  documents: 8,
  tokenBytes: 128,
} as const

export const STATE_ERROR_CODES = [
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'BUSY',
  'SESSION_CLOSED',
  'SNAPSHOT_STALE',
  'RESOURCE_LIMIT',
  'INCOMPATIBLE_DATA',
  'CORRUPTED_DATA',
  'STORAGE_UNAVAILABLE',
] as const

export type StateErrorCode = (typeof STATE_ERROR_CODES)[number]

export const UNDO_INVALIDATION_REASONS = ['BACKUP_RESTORED', 'STORAGE_RECOVERED'] as const
export type UndoInvalidationReason = (typeof UNDO_INVALIDATION_REASONS)[number]

export type StateFailure = Readonly<{ version: 3; status: 'error'; code: StateErrorCode }>

// ---- Superfície pública do renderer (wrappers do preload) ----

export type StateRequest = Readonly<{ version: 3 }>
export type UnsubscribeStateRequest = Readonly<{ version: 3; subscriptionId: string }>

export type TaskRecord = Readonly<{ task: Task; contentRevision: string; editRevision: string }>
export type TrashRecord = Readonly<{
  task: Task
  deletedAt: string
  contentRevision: string
  editRevision: string
}>

/** Snapshot completo de um único par (revisão global, época do undo). */
export type StateSnapshot = Readonly<{
  revision: string
  undoEpoch: number
  tasks: TaskRecord[]
  trash: TrashRecord[]
}>

export type StateSnapshotResult = Readonly<{ version: 3; status: 'ok'; snapshot: StateSnapshot }> | StateFailure

export type SubscribeStateResult =
  | Readonly<{ version: 3; status: 'ok'; subscriptionId: string; snapshot: StateSnapshot }>
  | StateFailure

export type UnsubscribeStateResult = Readonly<{ version: 3; status: 'ok' }> | StateFailure

/**
 * Atualização local entregue ao callback do renderer. `stale` conserva o último snapshot
 * completo: indisponibilidade ou churn nunca viram lista vazia. `undo-invalidated` é a barreira
 * transitória: apenas limpa ofertas/confirmações e não representa mutação de dados.
 */
export type StateUpdate =
  | Readonly<{ type: 'snapshot'; snapshot: StateSnapshot }>
  | Readonly<{ type: 'stale'; code: StateErrorCode }>
  | Readonly<{ type: 'undo-invalidated'; undoEpoch: number; reason: UndoInvalidationReason }>

export type StateListener = (update: StateUpdate) => void

// ---- Protocolo de transporte entre preload e main ----

export type SnapshotPageRequest = Readonly<{ version: 3; cursor?: string }>

export type SnapshotCollection = 'tasks' | 'trash'

/**
 * Trecho do JSON de um registro. Fragmentos consecutivos da mesma coleção com `final: false`
 * pertencem ao mesmo registro; só o conjunto reunido e validado pode ser publicado.
 */
export type SnapshotFragment = Readonly<{ collection: SnapshotCollection; data: string; final: boolean }>

export type SnapshotCounts = Readonly<{ tasks: number; trash: number }>

export type SnapshotPage = Readonly<{
  revision: string
  undoEpoch: number
  fragments: SnapshotFragment[]
  /** Continuação opaca; ausente na última página. */
  cursor?: string
  /** Presente somente na última página, para validar a conclusão. */
  complete?: SnapshotCounts
}>

export type SnapshotPageResult = Readonly<{ version: 3; status: 'ok'; page: SnapshotPage }> | StateFailure

export type SubscribeWireResult =
  | Readonly<{ version: 3; status: 'ok'; subscriptionId: string; page: SnapshotPage }>
  | StateFailure

export type StateChangedEvent = Readonly<{
  version: 3
  subscriptionId: string
  revision: string
  undoEpoch: number
}>
export type StateUnavailableEvent = Readonly<{ version: 3; subscriptionId: string; code: StateErrorCode }>
export type UndoInvalidatedEvent = Readonly<{
  version: 1
  subscriptionId: string
  undoEpoch: number
  reason: UndoInvalidationReason
}>

// ---- Validação em runtime (tipos TS não autorizam request nem resposta) ----

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const REVISION_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/
const MAX_REVISION_TEXT = '9223372036854775807'

export function isUndoEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

export function isUndoInvalidationReason(value: unknown): value is UndoInvalidationReason {
  return typeof value === 'string' && (UNDO_INVALIDATION_REASONS as readonly string[]).includes(value)
}

export function stateFailure(code: StateErrorCode): StateFailure {
  return { version: 3, status: 'error', code }
}

export function isStateErrorCode(value: unknown): value is StateErrorCode {
  return typeof value === 'string' && (STATE_ERROR_CODES as readonly string[]).includes(value)
}

export function isOpaqueToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

export function isRevisionText(value: unknown): value is string {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) return false
  return value.length < MAX_REVISION_TEXT.length || value <= MAX_REVISION_TEXT
}

function fitsRequestBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= STATE_LIMITS.requestBytes
}

/** `{ version: 3 }` exato, até 1 KiB. Versões 1/2 anteriores são recusadas. */
export function parseStateRequest(value: unknown): StateRequest | null {
  const record = asExactRecord(value, ['version'])
  if (record === null || record['version'] !== 3 || !fitsRequestBudget(value)) return null
  return { version: 3 }
}

/** `{ version: 3 }` ou `{ version: 3, cursor }` exatos, até 1 KiB. */
export function parseSnapshotPageRequest(value: unknown): SnapshotPageRequest | null {
  const record = asExactRecord(value, ['version'], ['cursor'])
  if (record === null || record['version'] !== 3 || !fitsRequestBudget(value)) return null
  if (!('cursor' in record)) return { version: 3 }
  return isOpaqueToken(record['cursor']) ? { version: 3, cursor: record['cursor'] } : null
}

/** `{ version: 3, subscriptionId }` exato, até 1 KiB. */
export function parseUnsubscribeRequest(value: unknown): UnsubscribeStateRequest | null {
  const record = asExactRecord(value, ['version', 'subscriptionId'])
  if (record === null || record['version'] !== 3 || !fitsRequestBudget(value)) return null
  return isOpaqueToken(record['subscriptionId']) ? { version: 3, subscriptionId: record['subscriptionId'] } : null
}

function parseFailure(value: unknown): StateFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'])
  if (record === null || record['version'] !== 3 || record['status'] !== 'error') return null
  return isStateErrorCode(record['code']) ? stateFailure(record['code']) : null
}

function parseCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function isSnapshotFragment(value: unknown): value is SnapshotFragment {
  const fragment = asExactRecord(value, ['collection', 'data', 'final'])
  if (fragment === null) return false
  const collection = fragment['collection']
  if (collection !== 'tasks' && collection !== 'trash') return false
  return typeof fragment['data'] === 'string' && typeof fragment['final'] === 'boolean'
}

function parseSnapshotPage(value: unknown): SnapshotPage | null {
  const record = asExactRecord(value, ['revision', 'undoEpoch', 'fragments'], ['cursor', 'complete'])
  if (record === null || !isRevisionText(record['revision']) || !isUndoEpoch(record['undoEpoch'])) return null
  if (!Array.isArray(record['fragments'])) return null

  const hasCursor = 'cursor' in record
  const hasComplete = 'complete' in record
  if (hasCursor === hasComplete) return null

  const fragments: SnapshotFragment[] = []
  for (const item of record['fragments'] as unknown[]) {
    if (!isSnapshotFragment(item)) return null
    fragments.push(item)
  }

  if (hasCursor) {
    return isOpaqueToken(record['cursor'])
      ? { revision: record['revision'], undoEpoch: record['undoEpoch'], fragments, cursor: record['cursor'] }
      : null
  }

  const complete = asExactRecord(record['complete'], ['tasks', 'trash'])
  if (complete === null) return null
  const tasks = parseCount(complete['tasks'])
  const trash = parseCount(complete['trash'])
  if (tasks === null || trash === null) return null
  return { revision: record['revision'], undoEpoch: record['undoEpoch'], fragments, complete: { tasks, trash } }
}

function fitsPageBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= STATE_LIMITS.pageBytes
}

/** Valida a resposta de página recebida pelo preload; saída malformada vira `null`. */
export function parseSnapshotPageResult(value: unknown): SnapshotPageResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'page'])
  if (record === null || record['version'] !== 3 || record['status'] !== 'ok' || !fitsPageBudget(value)) return null
  const page = parseSnapshotPage(record['page'])
  return page === null ? null : { version: 3, status: 'ok', page }
}

export function parseSubscribeWireResult(value: unknown): SubscribeWireResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'subscriptionId', 'page'])
  if (record === null || record['version'] !== 3 || record['status'] !== 'ok' || !fitsPageBudget(value)) return null
  if (!isOpaqueToken(record['subscriptionId'])) return null
  const page = parseSnapshotPage(record['page'])
  return page === null ? null : { version: 3, status: 'ok', subscriptionId: record['subscriptionId'], page }
}

export function parseUnsubscribeResult(value: unknown): UnsubscribeStateResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status'])
  return record !== null && record['version'] === 3 && record['status'] === 'ok' ? { version: 3, status: 'ok' } : null
}

function fitsEventBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= STATE_LIMITS.eventBytes
}

export function parseStateChangedEvent(value: unknown): StateChangedEvent | null {
  const record = asExactRecord(value, ['version', 'subscriptionId', 'revision', 'undoEpoch'])
  if (record === null || record['version'] !== 3 || !fitsEventBudget(value)) return null
  if (!isOpaqueToken(record['subscriptionId']) || !isRevisionText(record['revision'])) return null
  if (!isUndoEpoch(record['undoEpoch'])) return null
  return { version: 3, subscriptionId: record['subscriptionId'], revision: record['revision'], undoEpoch: record['undoEpoch'] }
}

export function parseStateUnavailableEvent(value: unknown): StateUnavailableEvent | null {
  const record = asExactRecord(value, ['version', 'subscriptionId', 'code'])
  if (record === null || record['version'] !== 3 || !fitsEventBudget(value)) return null
  if (!isOpaqueToken(record['subscriptionId']) || !isStateErrorCode(record['code'])) return null
  return { version: 3, subscriptionId: record['subscriptionId'], code: record['code'] }
}

/** `undo-invalidated` v1 fechado: inscrição/época/razão, sem revisão SQL fictícia nem Task. */
export function parseUndoInvalidatedEvent(value: unknown): UndoInvalidatedEvent | null {
  const record = asExactRecord(value, ['version', 'subscriptionId', 'undoEpoch', 'reason'])
  if (record === null || record['version'] !== 1 || !fitsEventBudget(value)) return null
  if (!isOpaqueToken(record['subscriptionId']) || !isUndoEpoch(record['undoEpoch'])) return null
  if (!isUndoInvalidationReason(record['reason'])) return null
  return {
    version: 1,
    subscriptionId: record['subscriptionId'],
    undoEpoch: record['undoEpoch'],
    reason: record['reason'],
  }
}
