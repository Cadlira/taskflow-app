import { isTaskPriority, isTaskStatus, type TaskPriority, type TaskStatus } from '../domain/task.js'
import {
  BASIC_FIELD_ERROR_CODES,
  BASIC_TASK_FIELDS,
  type BasicFieldErrorCode,
  type BasicFieldErrors,
  type BasicTaskDraft,
  type BasicTaskField,
  type BasicTaskPatch,
} from '../domain/task-draft.js'
import { asExactRecord, asPlainRecord, serializedBytes, type PlainRecord } from './record.js'
import { STATE_ERROR_CODES, isRevisionText } from './state.js'

// Os nove campos básicos, seus códigos de erro e os shapes de draft/patch vivem no domínio
// (fonte única); o contrato apenas os expõe e valida a forma de transporte.
export { BASIC_FIELD_ERROR_CODES, BASIC_TASK_FIELDS }
export type { BasicFieldErrorCode, BasicFieldErrors, BasicTaskField }

// Catálogo fechado de comandos de tarefas v1. Cada operação tem canal próprio; nenhum
// send/canal livre, URL arbitrária, Task completa, campo de auditoria ou avançado é aceito.

export const TASK_CREATE_CHANNEL = 'task:create:v1'
export const TASK_UPDATE_CHANNEL = 'task:update:v1'
export const TASK_STATUS_CHANNEL = 'task:status:v1'
export const TASK_OPEN_SOURCE_CHANNEL = 'task:source:open:v1'

/** Canais que o preload pode invocar para os comandos de tarefas. */
export const TASK_COMMAND_CHANNELS: readonly string[] = [
  TASK_CREATE_CHANNEL,
  TASK_UPDATE_CHANNEL,
  TASK_STATUS_CHANNEL,
  TASK_OPEN_SOURCE_CHANNEL,
]

export const TASK_COMMAND_LIMITS = {
  /** Request dos quatro comandos: 64 KiB UTF-8 JSON serializado, incluindo envelope e escaping. */
  requestBytes: 64 * 1024,
  /** Resposta dos quatro comandos: 8 KiB UTF-8 JSON serializado. */
  responseBytes: 8 * 1024,
} as const

export const TASK_MUTATION_ERROR_CODES = [
  ...STATE_ERROR_CODES,
  'VALIDATION_FAILED',
  'CONFLICT',
  'NOT_FOUND',
  'ADVANCED_TASK_RESTRICTED',
] as const

export const TASK_SOURCE_ERROR_CODES = [
  ...STATE_ERROR_CODES,
  'CONFLICT',
  'NOT_FOUND',
  'SOURCE_NOT_AVAILABLE',
  'SOURCE_NOT_ALLOWED',
  'SOURCE_TOO_LONG',
  'EXTERNAL_OPEN_FAILED',
] as const

export type TaskMutationErrorCode = (typeof TASK_MUTATION_ERROR_CODES)[number]
export type TaskSourceErrorCode = (typeof TASK_SOURCE_ERROR_CODES)[number]
export type TaskCommandErrorCode = TaskMutationErrorCode | TaskSourceErrorCode

export type TaskCommandFailure = Readonly<{
  version: 1
  status: 'error'
  code: TaskCommandErrorCode
  /** Presente somente em `VALIDATION_FAILED`. */
  fields?: BasicFieldErrors
  /** Presente somente em `CONFLICT`, quando o proprietário conhece a revisão atual. */
  currentContentRevision?: string
}>

export function taskFailure(code: TaskCommandErrorCode): TaskCommandFailure {
  return { version: 1, status: 'error', code }
}

export function isTaskMutationErrorCode(value: unknown): value is TaskMutationErrorCode {
  return typeof value === 'string' && (TASK_MUTATION_ERROR_CODES as readonly string[]).includes(value)
}

export function isTaskSourceErrorCode(value: unknown): value is TaskSourceErrorCode {
  return typeof value === 'string' && (TASK_SOURCE_ERROR_CODES as readonly string[]).includes(value)
}

// ---- Superfície pública do renderer ----

/** Draft de criação: mesmas regras do domínio; tipos garantidos pelo parser de runtime. */
export type TaskCreateDraft = Readonly<BasicTaskDraft>

/** Patch de edição: mesma semântica do domínio (ausente conserva, null/[] limpam). */
export type TaskPatch = Readonly<BasicTaskPatch>

export type TaskCreateRequest = Readonly<{ version: 1; draft: TaskCreateDraft }>
export type TaskUpdateRequest = Readonly<{
  version: 1
  taskId: string
  expectedContentRevision: string
  patch: TaskPatch
}>
export type TaskStatusRequest = Readonly<{
  version: 1
  taskId: string
  expectedContentRevision: string
  status: TaskStatus
}>
export type TaskOpenSourceRequest = Readonly<{
  version: 1
  taskId: string
  expectedContentRevision: string
}>

export type TaskCreateAck = Readonly<{
  version: 1
  status: 'ok'
  taskId: string
  revision: string
  contentRevision: string
}>
export type TaskMutationAck = Readonly<{
  version: 1
  status: 'ok'
  revision: string
  contentRevision: string
}>
export type TaskOpenSourceAck = Readonly<{ version: 1; status: 'ok' }>

export type TaskCreateResult = TaskCreateAck | TaskCommandFailure
export type TaskMutationResult = TaskMutationAck | TaskCommandFailure
export type TaskOpenSourceResult = TaskOpenSourceAck | TaskCommandFailure

// ---- Validação em runtime ----

export type TaskRequestParse<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'invalid-request' }
  | { kind: 'validation'; fields: BasicFieldErrors }

function fitsRequestBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= TASK_COMMAND_LIMITS.requestBytes
}

/** Confere o orçamento real da resposta serializada; nunca trunca para caber. */
export function fitsResponseBudget(value: unknown): boolean {
  const bytes = serializedBytes(value)
  return bytes !== null && bytes <= TASK_COMMAND_LIMITS.responseBytes
}

/** Tarefa histórica é identificada por string não vazia compatível com o codec; não exige UUID. */
function isTaskId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

type OptionalTextRead = { present: true; value: string | null } | { present: false }

function readOptionalText(record: PlainRecord, key: string, fields: BasicFieldErrors): OptionalTextRead {
  if (!(key in record)) return { present: false }
  const value = record[key]
  if (value === null) return { present: true, value: null }
  if (typeof value === 'string') return { present: true, value }
  fields[key as BasicTaskField] = 'INVALID_VALUE'
  return { present: true, value: null }
}

function readTitle(record: PlainRecord, fields: BasicFieldErrors): string | undefined {
  if (!('title' in record)) {
    fields.title = 'REQUIRED'
    return undefined
  }
  const value = record['title']
  if (typeof value !== 'string') {
    fields.title = 'INVALID_VALUE'
    return undefined
  }
  return value
}

function readStatus(record: PlainRecord, fields: BasicFieldErrors): TaskStatus | undefined {
  if (!('status' in record)) return undefined
  const value = record['status']
  if (!isTaskStatus(value)) {
    fields.status = 'INVALID_VALUE'
    return undefined
  }
  return value
}

function readPriority(record: PlainRecord, fields: BasicFieldErrors): TaskPriority | undefined {
  if (!('priority' in record)) return undefined
  const value = record['priority']
  if (!isTaskPriority(value)) {
    fields.priority = 'INVALID_VALUE'
    return undefined
  }
  return value
}

function readTags(record: PlainRecord, fields: BasicFieldErrors): readonly string[] | undefined {
  if (!('tags' in record)) return undefined
  const value = record['tags']
  if (!Array.isArray(value)) {
    fields.tags = 'INVALID_VALUE'
    return undefined
  }
  const tags: string[] = []
  for (const item of value as unknown[]) {
    if (typeof item !== 'string') {
      fields.tags = 'INVALID_VALUE'
      return undefined
    }
    tags.push(item)
  }
  return tags
}

/** `draft` de criação: título obrigatório; opcionais podem vir como texto ou `null` (ausência). */
export function parseTaskCreateRequest(value: unknown): TaskRequestParse<TaskCreateRequest> {
  if (!fitsRequestBudget(value)) return { kind: 'invalid-request' }
  const record = asExactRecord(value, ['version', 'draft'])
  if (record === null || record['version'] !== 1) return { kind: 'invalid-request' }
  const draft = asExactRecord(record['draft'], [], BASIC_TASK_FIELDS)
  if (draft === null) return { kind: 'invalid-request' }

  const fields: BasicFieldErrors = {}
  const title = readTitle(draft, fields)
  const description = readOptionalText(draft, 'description', fields)
  const requester = readOptionalText(draft, 'requester', fields)
  const assignee = readOptionalText(draft, 'assignee', fields)
  const dueAt = readOptionalText(draft, 'dueAt', fields)
  const sourceUrl = readOptionalText(draft, 'sourceUrl', fields)
  const status = readStatus(draft, fields)
  const priority = readPriority(draft, fields)
  const tags = readTags(draft, fields)

  if (Object.keys(fields).length > 0 || title === undefined) {
    return { kind: 'validation', fields }
  }

  const parsed: TaskCreateDraft = {
    title,
    ...(description.present && typeof description.value === 'string' && { description: description.value }),
    ...(requester.present && typeof requester.value === 'string' && { requester: requester.value }),
    ...(assignee.present && typeof assignee.value === 'string' && { assignee: assignee.value }),
    ...(status !== undefined && { status }),
    ...(priority !== undefined && { priority }),
    ...(dueAt.present && typeof dueAt.value === 'string' && { dueAt: dueAt.value }),
    ...(tags !== undefined && { tags }),
    ...(sourceUrl.present && typeof sourceUrl.value === 'string' && { sourceUrl: sourceUrl.value }),
  }
  return { kind: 'ok', value: { version: 1, draft: parsed } }
}

/** `patch` de edição: todas as nove chaves opcionais; ausente conserva, `null`/`[]` limpam. */
export function parseTaskUpdateRequest(value: unknown): TaskRequestParse<TaskUpdateRequest> {
  if (!fitsRequestBudget(value)) return { kind: 'invalid-request' }
  const record = asExactRecord(value, ['version', 'taskId', 'expectedContentRevision', 'patch'])
  if (record === null || record['version'] !== 1) return { kind: 'invalid-request' }
  if (!isTaskId(record['taskId']) || !isRevisionText(record['expectedContentRevision'])) {
    return { kind: 'invalid-request' }
  }
  const patchRecord = asExactRecord(record['patch'], [], BASIC_TASK_FIELDS)
  if (patchRecord === null) return { kind: 'invalid-request' }

  const fields: BasicFieldErrors = {}
  let title: string | undefined
  if ('title' in patchRecord) {
    const value = patchRecord['title']
    if (typeof value === 'string') title = value
    else fields.title = 'INVALID_VALUE'
  }
  const description = readOptionalText(patchRecord, 'description', fields)
  const requester = readOptionalText(patchRecord, 'requester', fields)
  const assignee = readOptionalText(patchRecord, 'assignee', fields)
  const dueAt = readOptionalText(patchRecord, 'dueAt', fields)
  const sourceUrl = readOptionalText(patchRecord, 'sourceUrl', fields)
  const status = readStatus(patchRecord, fields)
  const priority = readPriority(patchRecord, fields)
  const tags = readTags(patchRecord, fields)

  if (Object.keys(fields).length > 0) {
    return { kind: 'validation', fields }
  }

  const patch: {
    title?: string
    description?: string | null
    requester?: string | null
    assignee?: string | null
    status?: TaskStatus
    priority?: TaskPriority
    dueAt?: string | null
    tags?: readonly string[]
    sourceUrl?: string | null
  } = {}
  if (title !== undefined) patch.title = title
  if (description.present) patch.description = description.value
  if (requester.present) patch.requester = requester.value
  if (assignee.present) patch.assignee = assignee.value
  if (status !== undefined) patch.status = status
  if (priority !== undefined) patch.priority = priority
  if (dueAt.present) patch.dueAt = dueAt.value
  if (tags !== undefined) patch.tags = tags
  if (sourceUrl.present) patch.sourceUrl = sourceUrl.value

  return {
    kind: 'ok',
    value: {
      version: 1,
      taskId: record['taskId'],
      expectedContentRevision: record['expectedContentRevision'],
      patch,
    },
  }
}

export function parseTaskStatusRequest(value: unknown): TaskRequestParse<TaskStatusRequest> {
  if (!fitsRequestBudget(value)) return { kind: 'invalid-request' }
  const record = asExactRecord(value, ['version', 'taskId', 'expectedContentRevision', 'status'])
  if (record === null || record['version'] !== 1) return { kind: 'invalid-request' }
  if (!isTaskId(record['taskId']) || !isRevisionText(record['expectedContentRevision'])) {
    return { kind: 'invalid-request' }
  }
  const status = record['status']
  if (!isTaskStatus(status)) {
    return { kind: 'validation', fields: { status: 'INVALID_VALUE' } }
  }
  return {
    kind: 'ok',
    value: {
      version: 1,
      taskId: record['taskId'],
      expectedContentRevision: record['expectedContentRevision'],
      status,
    },
  }
}

export function parseTaskOpenSourceRequest(value: unknown): TaskRequestParse<TaskOpenSourceRequest> {
  if (!fitsRequestBudget(value)) return { kind: 'invalid-request' }
  const record = asExactRecord(value, ['version', 'taskId', 'expectedContentRevision'])
  if (record === null || record['version'] !== 1) return { kind: 'invalid-request' }
  if (!isTaskId(record['taskId']) || !isRevisionText(record['expectedContentRevision'])) {
    return { kind: 'invalid-request' }
  }
  return {
    kind: 'ok',
    value: {
      version: 1,
      taskId: record['taskId'],
      expectedContentRevision: record['expectedContentRevision'],
    },
  }
}

function parseFieldErrors(value: unknown): BasicFieldErrors | null {
  const record = asPlainRecord(value)
  if (record === null) return null
  const keys = Object.getOwnPropertyNames(record)
  if (keys.length === 0) return null
  const fields: BasicFieldErrors = {}
  for (const key of keys) {
    if (!(BASIC_TASK_FIELDS as readonly string[]).includes(key)) return null
    const code = record[key]
    if (typeof code !== 'string' || !(BASIC_FIELD_ERROR_CODES as readonly string[]).includes(code)) return null
    fields[key as BasicTaskField] = code as BasicFieldErrorCode
  }
  return fields
}

function parseTaskFailure(value: unknown, allowed: readonly string[]): TaskCommandFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'], ['fields', 'currentContentRevision'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'error') return null
  const code = record['code']
  if (typeof code !== 'string' || !allowed.includes(code)) return null

  const failure: { version: 1; status: 'error'; code: TaskCommandErrorCode; fields?: BasicFieldErrors; currentContentRevision?: string } =
    { version: 1, status: 'error', code: code as TaskCommandErrorCode }

  if ('fields' in record) {
    const fields = parseFieldErrors(record['fields'])
    if (code !== 'VALIDATION_FAILED' || fields === null) return null
    failure.fields = fields
  } else if (code === 'VALIDATION_FAILED') {
    return null
  }

  if ('currentContentRevision' in record) {
    if (code !== 'CONFLICT' || !isRevisionText(record['currentContentRevision'])) return null
    failure.currentContentRevision = record['currentContentRevision']
  }
  return failure
}

type ResponseBody = { kind: 'failure'; failure: TaskCommandFailure } | { kind: 'ok'; record: PlainRecord }

function parseResponse(value: unknown, allowed: readonly string[]): ResponseBody | null {
  const failure = parseTaskFailure(value, allowed)
  if (failure !== null) return { kind: 'failure', failure }
  const record = asExactRecord(value, ['version', 'status'], ['taskId', 'revision', 'contentRevision'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok') return null
  return { kind: 'ok', record }
}

export function parseTaskCreateResult(value: unknown): TaskCreateResult | null {
  const body = parseResponse(value, TASK_MUTATION_ERROR_CODES)
  if (body === null) return null
  if (body.kind === 'failure') return body.failure
  const taskId = body.record['taskId']
  const revision = body.record['revision']
  const contentRevision = body.record['contentRevision']
  if (typeof taskId !== 'string' || taskId.length === 0 || !isRevisionText(revision) || !isRevisionText(contentRevision)) {
    return null
  }
  // Confere o shape exato da confirmação: sem chaves extras.
  if (asExactRecord(value, ['version', 'status', 'taskId', 'revision', 'contentRevision']) === null) return null
  const ack: TaskCreateAck = { version: 1, status: 'ok', taskId, revision, contentRevision }
  return fitsResponseBudget(ack) ? ack : null
}

export function parseTaskMutationResult(value: unknown): TaskMutationResult | null {
  const body = parseResponse(value, TASK_MUTATION_ERROR_CODES)
  if (body === null) return null
  if (body.kind === 'failure') return body.failure
  const revision = body.record['revision']
  const contentRevision = body.record['contentRevision']
  if (!isRevisionText(revision) || !isRevisionText(contentRevision)) return null
  if (asExactRecord(value, ['version', 'status', 'revision', 'contentRevision']) === null) return null
  const ack: TaskMutationAck = { version: 1, status: 'ok', revision, contentRevision }
  return fitsResponseBudget(ack) ? ack : null
}

export function parseTaskOpenSourceResult(value: unknown): TaskOpenSourceResult | null {
  const body = parseResponse(value, TASK_SOURCE_ERROR_CODES)
  if (body === null) return null
  if (body.kind === 'failure') return body.failure
  if (asExactRecord(value, ['version', 'status']) === null) return null
  return { version: 1, status: 'ok' }
}
