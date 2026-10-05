// Contrato fechado dos quatro wrappers de backup (v1): exportar, preparar, confirmar e cancelar.
// Requests têm schema exato e até 64 KiB UTF-8; respostas até 8 KiB. Nenhum path, conteúdo, Task,
// sessão, relógio ou opção nativa do renderer autoriza arquivo ou substituição; preview e ack
// carregam somente token/metadados/counts/revisões. Issues são dados seguros de campo/código/índice.
import { asExactRecord, serializedBytes } from './record.js'
import { STATE_ERROR_CODES, isOpaqueToken, isRevisionText } from './state.js'
import {
  BACKUP_ISSUE_CODES,
  BACKUP_ISSUE_FIELDS,
  type BackupIssue,
  type BackupIssueCode,
  type BackupIssueField,
} from '../application/backup/backup-issues.js'
import { CURRENT_BACKUP_FORMAT_VERSION } from '../application/backup/backup-format.js'

export const BACKUP_EXPORT_CHANNEL = 'backup:export:v1'
export const BACKUP_PREPARE_CHANNEL = 'backup:prepare:v1'
export const BACKUP_CONFIRM_CHANNEL = 'backup:confirm:v1'
export const BACKUP_CANCEL_CHANNEL = 'backup:cancel:v1'

/** Canais que o preload pode invocar para os quatro wrappers de backup. */
export const BACKUP_COMMAND_CHANNELS: readonly string[] = [
  BACKUP_EXPORT_CHANNEL,
  BACKUP_PREPARE_CHANNEL,
  BACKUP_CONFIRM_CHANNEL,
  BACKUP_CANCEL_CHANNEL,
]

export const BACKUP_COMMAND_LIMITS = {
  requestBytes: 64 * 1024,
  responseBytes: 8 * 1024,
} as const

/** TTL publicado da prévia: 5 minutos monotônicos, sem renovação por foco/exportação. */
export const BACKUP_PREVIEW_TTL_MS = 5 * 60 * 1000

export const BACKUP_ERROR_CODES = [
  ...STATE_ERROR_CODES,
  'STALE_CONTEXT',
  'FILE_TOO_LARGE',
  'FILE_READ_FAILED',
  'INVALID_ENCODING',
  'INVALID_JSON',
  'NOT_TASKFLOW_BACKUP',
  'INVALID_FORMAT_VERSION',
  'NEWER_FORMAT_VERSION',
  'INVALID_STRUCTURE',
  'INVALID_TASKS',
  'LOCAL_DATA_NOT_EXPORTABLE',
  'FILE_WRITE_FAILED',
  'DESTINATION_CHANGED',
  'DESTINATION_NOT_ALLOWED',
  'BACKUP_PREVIEW_INVALID',
  'BACKUP_PREVIEW_EXPIRED',
  'BACKUP_BASE_CHANGED',
  'BACKUP_VERIFICATION_FAILED',
  'SERIES_CONFLICT',
] as const

export type BackupErrorCode = (typeof BACKUP_ERROR_CODES)[number]
export type BackupCommitState = 'NOT_APPLIED' | 'UNKNOWN'
export type BackupVerification = 'VERIFIED' | 'PENDING'

export function isBackupErrorCode(value: unknown): value is BackupErrorCode {
  return typeof value === 'string' && (BACKUP_ERROR_CODES as readonly string[]).includes(value)
}

function isContextSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function fitsRequestBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= BACKUP_COMMAND_LIMITS.requestBytes
}

function fitsResponseBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= BACKUP_COMMAND_LIMITS.responseBytes
}

// ---- Superfície pública do renderer ----

export type ExportBackupRequest = Readonly<{ version: 1; contextSequence: number }>
export type PrepareBackupRestoreRequest = Readonly<{ version: 1; contextSequence: number }>
export type ConfirmBackupRestoreRequest = Readonly<{ version: 1; contextSequence: number; restoreToken: string }>
export type CancelBackupRestoreRequest = Readonly<{ version: 1; contextSequence: number; restoreToken: string }>

export type ExportBackupAck = Readonly<{
  version: 1
  status: 'cancelled'
}> | Readonly<{
  version: 1
  status: 'ok'
  outcome: 'SAVED' | 'SAVED_WITH_WARNING'
  taskCount: number
  revision: string
}>

export type PrepareBackupRestoreAck = Readonly<{
  version: 1
  status: 'cancelled'
}> | Readonly<{
  version: 1
  status: 'ok'
  restoreToken: string
  baseRevision: string
  sourceFormatVersion: number
  formatVersion: typeof CURRENT_BACKUP_FORMAT_VERSION
  exportedAt: string
  appVersion: string
  fileTaskCount: number
  localTaskCount: number
  expiresInMs: number
}>

export type ConfirmBackupRestoreAck = Readonly<{
  version: 1
  status: 'ok'
  outcome: 'APPLIED' | 'UNCHANGED'
  revision: string
  restoredCount: number
  verification: BackupVerification
  undoEpoch: number
}>

export type CancelBackupRestoreAck = Readonly<{ version: 1; status: 'ok'; cancelled: true }>

export type BackupFailure = Readonly<{
  version: 1
  status: 'error'
  code: BackupErrorCode
  issues?: BackupIssue[]
  extraIssueCount?: number
  commitState?: BackupCommitState
}>

export type ExportBackupResult = ExportBackupAck | BackupFailure
export type PrepareBackupRestoreResult = PrepareBackupRestoreAck | BackupFailure
export type ConfirmBackupRestoreResult = ConfirmBackupRestoreAck | BackupFailure
export type CancelBackupRestoreResult = CancelBackupRestoreAck | BackupFailure

// ---- Parse de requests (preload e main) ----

export function parseExportBackupRequest(value: unknown): ExportBackupRequest | null {
  if (!fitsRequestBudget(value)) return null
  const record = asExactRecord(value, ['version', 'contextSequence'])
  if (record === null || record['version'] !== 1 || !isContextSequence(record['contextSequence'])) return null
  return { version: 1, contextSequence: record['contextSequence'] }
}

export function parsePrepareBackupRestoreRequest(value: unknown): PrepareBackupRestoreRequest | null {
  return parseExportBackupRequest(value)
}

export function parseConfirmBackupRestoreRequest(value: unknown): ConfirmBackupRestoreRequest | null {
  if (!fitsRequestBudget(value)) return null
  const record = asExactRecord(value, ['version', 'contextSequence', 'restoreToken'])
  if (record === null || record['version'] !== 1 || !isContextSequence(record['contextSequence'])) return null
  return isOpaqueToken(record['restoreToken'])
    ? { version: 1, contextSequence: record['contextSequence'], restoreToken: record['restoreToken'] }
    : null
}

export function parseCancelBackupRestoreRequest(value: unknown): CancelBackupRestoreRequest | null {
  return parseConfirmBackupRestoreRequest(value)
}

// ---- Parse de saída (preload valida antes de devolver ao renderer) ----

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isFormatVersionFour(value: unknown): value is 4 {
  return value === CURRENT_BACKUP_FORMAT_VERSION
}

function isExportOutcome(value: unknown): value is 'SAVED' | 'SAVED_WITH_WARNING' {
  return value === 'SAVED' || value === 'SAVED_WITH_WARNING'
}

function isBackupIssue(value: unknown): value is BackupIssue {
  const record = asExactRecord(value, ['taskIndex', 'field', 'code'], ['reminderIndex', 'subtaskIndex'])
  if (record === null || !isCount(record['taskIndex'])) return false
  if (!(BACKUP_ISSUE_FIELDS as readonly string[]).includes(record['field'] as string)) return false
  if (!(BACKUP_ISSUE_CODES as readonly string[]).includes(record['code'] as string)) return false
  if ('reminderIndex' in record && !isCount(record['reminderIndex'])) return false
  if ('subtaskIndex' in record && !isCount(record['subtaskIndex'])) return false
  return true
}

function parseIssues(value: unknown): { issues?: BackupIssue[]; extraIssueCount?: number } | null {
  if (value === undefined) return {}
  if (!Array.isArray(value) || value.length === 0 || value.length > 5) return null
  const issues: BackupIssue[] = []
  for (const item of value as unknown[]) {
    if (!isBackupIssue(item)) return null
    issues.push(item)
  }
  return { issues }
}

function parseFailure(value: unknown): BackupFailure | null {
  const record = asExactRecord(
    value,
    ['version', 'status', 'code'],
    ['issues', 'extraIssueCount', 'commitState'],
  )
  if (record === null || record['version'] !== 1 || record['status'] !== 'error') return null
  const code = record['code']
  if (!isBackupErrorCode(code)) return null

  const parsed = parseIssues(record['issues'])
  if (parsed === null) return null
  if (parsed.issues !== undefined && code !== 'INVALID_TASKS' && code !== 'LOCAL_DATA_NOT_EXPORTABLE') return null

  let extraIssueCount: number | undefined
  if ('extraIssueCount' in record) {
    if (!isCount(record['extraIssueCount']) || record['extraIssueCount'] < 1) return null
    if (parsed.issues === undefined) return null
    if (code !== 'INVALID_TASKS' && code !== 'LOCAL_DATA_NOT_EXPORTABLE') return null
    extraIssueCount = record['extraIssueCount']
  }

  let commitState: BackupCommitState | undefined
  if ('commitState' in record) {
    const candidate = record['commitState']
    if (candidate !== 'NOT_APPLIED' && candidate !== 'UNKNOWN') return null
    if (code !== 'BACKUP_VERIFICATION_FAILED' && code !== 'STORAGE_UNAVAILABLE') return null
    commitState = candidate
  }

  const failure: BackupFailure = {
    version: 1,
    status: 'error',
    code,
    ...(parsed.issues !== undefined && { issues: parsed.issues }),
    ...(extraIssueCount !== undefined && { extraIssueCount }),
    ...(commitState !== undefined && { commitState }),
  }
  return fitsResponseBudget(failure) ? failure : null
}

export function parseExportBackupResult(value: unknown): ExportBackupResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status'], ['outcome', 'taskCount', 'revision'])
  if (record === null || record['version'] !== 1) return null
  if (record['status'] === 'cancelled') {
    const exact = asExactRecord(value, ['version', 'status'])
    return exact === null ? null : { version: 1, status: 'cancelled' }
  }
  if (record['status'] !== 'ok') return null
  if (!isExportOutcome(record['outcome']) || !isCount(record['taskCount']) || !isRevisionText(record['revision'])) {
    return null
  }
  const ack: ExportBackupAck = {
    version: 1,
    status: 'ok',
    outcome: record['outcome'],
    taskCount: record['taskCount'],
    revision: record['revision'],
  }
  return fitsResponseBudget(ack) ? ack : null
}

export function parsePrepareBackupRestoreResult(value: unknown): PrepareBackupRestoreResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status'], ['restoreToken', 'baseRevision', 'sourceFormatVersion', 'formatVersion', 'exportedAt', 'appVersion', 'fileTaskCount', 'localTaskCount', 'expiresInMs'])
  if (record === null || record['version'] !== 1) return null
  if (record['status'] === 'cancelled') {
    const exact = asExactRecord(value, ['version', 'status'])
    return exact === null ? null : { version: 1, status: 'cancelled' }
  }
  if (record['status'] !== 'ok') return null
  if (!isOpaqueToken(record['restoreToken']) || !isRevisionText(record['baseRevision'])) return null
  const sourceFormatVersion = record['sourceFormatVersion']
  if (typeof sourceFormatVersion !== 'number' || !Number.isInteger(sourceFormatVersion) || sourceFormatVersion < 1 || sourceFormatVersion > CURRENT_BACKUP_FORMAT_VERSION) {
    return null
  }
  if (!isFormatVersionFour(record['formatVersion'])) return null
  if (typeof record['exportedAt'] !== 'string' || Number.isNaN(Date.parse(record['exportedAt']))) return null
  if (typeof record['appVersion'] !== 'string' || record['appVersion'] === '') return null
  if (!isCount(record['fileTaskCount']) || !isCount(record['localTaskCount'])) return null
  if (typeof record['expiresInMs'] !== 'number' || record['expiresInMs'] !== BACKUP_PREVIEW_TTL_MS) return null
  const ack: PrepareBackupRestoreAck = {
    version: 1,
    status: 'ok',
    restoreToken: record['restoreToken'],
    baseRevision: record['baseRevision'],
    sourceFormatVersion,
    formatVersion: CURRENT_BACKUP_FORMAT_VERSION,
    exportedAt: record['exportedAt'],
    appVersion: record['appVersion'],
    fileTaskCount: record['fileTaskCount'],
    localTaskCount: record['localTaskCount'],
    expiresInMs: BACKUP_PREVIEW_TTL_MS,
  }
  return fitsResponseBudget(ack) ? ack : null
}

export function parseConfirmBackupRestoreResult(value: unknown): ConfirmBackupRestoreResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(
    value,
    ['version', 'status', 'outcome', 'revision', 'restoredCount', 'verification', 'undoEpoch'],
  )
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok') return null
  const outcome = record['outcome']
  if (outcome !== 'APPLIED' && outcome !== 'UNCHANGED') return null
  if (!isRevisionText(record['revision']) || !isCount(record['restoredCount'])) return null
  const verification = record['verification']
  if (verification !== 'VERIFIED' && verification !== 'PENDING') return null
  const undoEpoch = record['undoEpoch']
  if (typeof undoEpoch !== 'number' || !Number.isSafeInteger(undoEpoch) || undoEpoch < 1) return null
  const ack: ConfirmBackupRestoreAck = {
    version: 1,
    status: 'ok',
    outcome,
    revision: record['revision'],
    restoredCount: record['restoredCount'],
    verification,
    undoEpoch,
  }
  return fitsResponseBudget(ack) ? ack : null
}

export function parseCancelBackupRestoreResult(value: unknown): CancelBackupRestoreResult | null {
  const failure = parseFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'cancelled'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok' || record['cancelled'] !== true) {
    return null
  }
  const ack: CancelBackupRestoreAck = { version: 1, status: 'ok', cancelled: true }
  return fitsResponseBudget(ack) ? ack : null
}

/** Valida o DTO publicado da prévia e confere o orçamento antes de publicar. */
export function fitsBackupPreviewBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= BACKUP_COMMAND_LIMITS.responseBytes
}

/** Somente para testes de contrato: os campos aceitos do issue. */
export const BACKUP_CONTRACT_ISSUE_FIELDS: readonly BackupIssueField[] = BACKUP_ISSUE_FIELDS
export const BACKUP_CONTRACT_ISSUE_CODES: readonly BackupIssueCode[] = BACKUP_ISSUE_CODES
