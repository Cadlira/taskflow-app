import type { Task } from '../domain/task.js'
import { asExactRecord, serializedBytes } from './record.js'

// Catálogo fechado de estado v1. Separado de `foundation:verify:v1`.
export const STATE_SNAPSHOT_CHANNEL = 'state:snapshot:v1'
export const STATE_SUBSCRIBE_CHANNEL = 'state:subscribe:v1'
export const STATE_UNSUBSCRIBE_CHANNEL = 'state:unsubscribe:v1'
export const STATE_CHANGED_EVENT = 'state:changed:v1'
export const STATE_UNAVAILABLE_EVENT = 'state:unavailable:v1'

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

export type StateFailure = Readonly<{ version: 1; status: 'error'; code: StateErrorCode }>

// ---- Superfície pública do renderer (wrappers do preload) ----

export type StateRequest = Readonly<{ version: 1 }>
export type UnsubscribeStateRequest = Readonly<{ version: 1; subscriptionId: string }>

export type TaskRecord = Readonly<{ task: Task; contentRevision: string }>
export type TrashRecord = Readonly<{ task: Task; deletedAt: string; contentRevision: string }>

/** Snapshot completo de uma única revisão global (string decimal canônica). */
export type StateSnapshot = Readonly<{ revision: string; tasks: TaskRecord[]; trash: TrashRecord[] }>

export type StateSnapshotResult = Readonly<{ version: 1; status: 'ok'; snapshot: StateSnapshot }> | StateFailure

export type SubscribeStateResult =
  | Readonly<{ version: 1; status: 'ok'; subscriptionId: string; snapshot: StateSnapshot }>
  | StateFailure

export type UnsubscribeStateResult = Readonly<{ version: 1; status: 'ok' }> | StateFailure

/**
 * Atualização local entregue ao callback do renderer. `stale` conserva o último snapshot
 * completo: indisponibilidade ou churn nunca viram lista vazia.
 */
export type StateUpdate =
  | Readonly<{ type: 'snapshot'; snapshot: StateSnapshot }>
  | Readonly<{ type: 'stale'; code: StateErrorCode }>

export type StateListener = (update: StateUpdate) => void

// ---- Protocolo de transporte entre preload e main ----

export type SnapshotPageRequest = Readonly<{ version: 1; cursor?: string }>

export type SnapshotCollection = 'tasks' | 'trash'

/**
 * Trecho do JSON de um registro. Fragmentos consecutivos da mesma coleção com `final: false`
 * pertencem ao mesmo registro; só o conjunto reunido e validado pode ser publicado.
 */
export type SnapshotFragment = Readonly<{ collection: SnapshotCollection; data: string; final: boolean }>

export type SnapshotCounts = Readonly<{ tasks: number; trash: number }>

export type SnapshotPage = Readonly<{
  revision: string
  fragments: SnapshotFragment[]
  /** Continuação opaca; ausente na última página. */
  cursor?: string
  /** Presente somente na última página, para validar a conclusão. */
  complete?: SnapshotCounts
}>

export type SnapshotPageResult = Readonly<{ version: 1; status: 'ok'; page: SnapshotPage }> | StateFailure

export type SubscribeWireResult =
  | Readonly<{ version: 1; status: 'ok'; subscriptionId: string; page: SnapshotPage }>
  | StateFailure

export type StateChangedEvent = Readonly<{ version: 1; subscriptionId: string; revision: string }>
export type StateUnavailableEvent = Readonly<{ version: 1; subscriptionId: string; code: StateErrorCode }>

// ---- Validação em runtime (tipos TS não autorizam request nem resposta) ----

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const REVISION_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/
const MAX_REVISION_TEXT = '9223372036854775807'

export function stateFailure(code: StateErrorCode): StateFailure {
  return { version: 1, status: 'error', code }
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

/** `{ version: 1 }` exato, até 1 KiB. */
export function parseStateRequest(value: unknown): StateRequest | null {
  const record = asExactRecord(value, ['version'])
  if (record === null || record['version'] !== 1 || !fitsRequestBudget(value)) return null
  return { version: 1 }
}

/** `{ version: 1 }` ou `{ version: 1, cursor }` exatos, até 1 KiB. */
export function parseSnapshotPageRequest(value: unknown): SnapshotPageRequest | null {
  const record = asExactRecord(value, ['version'], ['cursor'])
  if (record === null || record['version'] !== 1 || !fitsRequestBudget(value)) return null
  if (!('cursor' in record)) return { version: 1 }
  return isOpaqueToken(record['cursor']) ? { version: 1, cursor: record['cursor'] } : null
}

/** `{ version: 1, subscriptionId }` exato, até 1 KiB. */
export function parseUnsubscribeRequest(value: unknown): UnsubscribeStateRequest | null {
  const record = asExactRecord(value, ['version', 'subscriptionId'])
  if (record === null || record['version'] !== 1 || !fitsRequestBudget(value)) return null
  return isOpaqueToken(record['subscriptionId']) ? { version: 1, subscriptionId: record['subscriptionId'] } : null
}

function parseFailure(value: unknown): StateFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'error') return null
  return isStateErrorCode(record['code']) ? stateFailure(record['code']) : null
}

function parseCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function parseSnapshotPage(value: unknown): SnapshotPage | null {
  const record = asExactRecord(value, ['revision', 'fragments'], ['cursor', 'complete'])
  if (record === null || !isRevisionText(record['revision']) || !Array.isArray(record['fragments'])) return null

  const hasCursor = 'cursor' in record
  const hasComplete = 'complete' in record
  if (hasCursor === hasComplete) return null

  const fragments: SnapshotFragment[] = []
  for (const item of record['fragments'] as unknown[]) {
    const fragment = asExactRecord(item, ['collection', 'data', 'final'])
    if (fragment === null) return null
    const collection = fragment['collection']
    if (collection !== 'tasks' && collection !== 'trash') return null
    if (typeof fragment['data'] !== 'string' || typeof fragment['final'] !== 'boolean') return null
    fragments.push({ collection, data: fragment['data'], final: fragment['final'] })
  }

  if (hasCursor) {
    return isOpaqueToken(record['cursor'])
      ? { revision: record['revision'], fragments, cursor: record['cursor'] }
      : null
  }

  const complete = asExactRecord(record['complete'], ['tasks', 'trash'])
  if (complete === null) return null
  const tasks = parseCount(complete['tasks'])
  const trash = parseCount(complete['trash'])
  if (tasks === null || trash === null) return null
  return { revision: record['revision'], fragments, complete: { tasks, trash } }
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
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !fitsPageBudget(value)) return null
  const page = parseSnapshotPage(record['page'])
  return page === null ? null : { version: 1, status: 'ok', page }
}

export function parseSubscribeWireResult(value: unknown): SubscribeWireResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'subscriptionId', 'page'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || !fitsPageBudget(value)) return null
  if (!isOpaqueToken(record['subscriptionId'])) return null
  const page = parseSnapshotPage(record['page'])
  return page === null ? null : { version: 1, status: 'ok', subscriptionId: record['subscriptionId'], page }
}

export function parseUnsubscribeResult(value: unknown): UnsubscribeStateResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status'])
  return record !== null && record['version'] === 1 && record['status'] === 'ok' ? { version: 1, status: 'ok' } : null
}

function fitsEventBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= STATE_LIMITS.eventBytes
}

export function parseStateChangedEvent(value: unknown): StateChangedEvent | null {
  const record = asExactRecord(value, ['version', 'subscriptionId', 'revision'])
  if (record === null || record['version'] !== 1 || !fitsEventBudget(value)) return null
  if (!isOpaqueToken(record['subscriptionId']) || !isRevisionText(record['revision'])) return null
  return { version: 1, subscriptionId: record['subscriptionId'], revision: record['revision'] }
}

export function parseStateUnavailableEvent(value: unknown): StateUnavailableEvent | null {
  const record = asExactRecord(value, ['version', 'subscriptionId', 'code'])
  if (record === null || record['version'] !== 1 || !fitsEventBudget(value)) return null
  if (!isOpaqueToken(record['subscriptionId']) || !isStateErrorCode(record['code'])) return null
  return { version: 1, subscriptionId: record['subscriptionId'], code: record['code'] }
}
