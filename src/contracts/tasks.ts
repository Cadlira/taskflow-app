import { isTaskPriority, isTaskStatus, type TaskPriority, type TaskStatus } from '../domain/task.js'
import {
  BASIC_TASK_FIELDS,
  ADVANCED_FIELD_ERROR_CODES,
  RECURRENCE_FIELDS,
  type CreateTaskDraft,
  type EditTaskPatch,
  type TaskFieldErrors,
  type TaskRecurrenceDraft,
} from '../domain/task-draft.js'
import { isRecurrenceFrequency, type RecurrenceFrequency } from '../domain/task-recurrence.js'
import type { SubtaskDraft } from '../domain/task-subtasks.js'
import { asExactRecord, asPlainRecord, serializedBytes, type PlainRecord } from './record.js'
import { STATE_ERROR_CODES, isOpaqueToken, isRevisionText } from './state.js'

// Catálogo fechado de comandos de tarefas v3. Cada operação tem canal próprio; nenhum send/canal
// livre, URL arbitrária, Task completa, campo de auditoria, autoridade (id/série/âncora/done),
// clock, ordenação de contexto ou avançado de lembrete é aceito. `openTaskSource` conserva v1.

export const TASK_CREATE_CHANNEL = 'task:create:v3'
export const TASK_UPDATE_CHANNEL = 'task:update:v3'
export const TASK_STATUS_CHANNEL = 'task:status:v3'
export const TASK_SUBTASK_DONE_CHANNEL = 'task:subtask-done:v3'
export const TASK_OPEN_SOURCE_CHANNEL = 'task:source:open:v1'

/** Canais que o preload pode invocar para os comandos de tarefas. */
export const TASK_COMMAND_CHANNELS: readonly string[] = [
  TASK_CREATE_CHANNEL,
  TASK_UPDATE_CHANNEL,
  TASK_STATUS_CHANNEL,
  TASK_SUBTASK_DONE_CHANNEL,
  TASK_OPEN_SOURCE_CHANNEL,
]

export const TASK_COMMAND_LIMITS = {
  /** Request dos cinco comandos: 64 KiB UTF-8 JSON serializado, incluindo envelope e escaping. */
  requestBytes: 64 * 1024,
  /** Resposta dos cinco comandos: 8 KiB UTF-8 JSON serializado. */
  responseBytes: 8 * 1024,
} as const

/** Sequência de contexto monotônica por documento, estabelecida via `clearUndoOffer`. */
export function isContextSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

export const TASK_MUTATION_ERROR_CODES = [
  ...STATE_ERROR_CODES,
  'VALIDATION_FAILED',
  'CONFLICT',
  'NOT_FOUND',
  'ADVANCED_TASK_RESTRICTED',
  'RECURRENCE_CHOICE_REQUIRED',
  'RECURRENCE_OUT_OF_RANGE',
  'SERIES_CONFLICT',
  'IDENTITY_CONFLICT',
  'SUBTASK_NOT_FOUND',
  'STALE_CONTEXT',
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

/** Falha de uma mutação v3: códigos fechados, campos posicionais e revisões atuais no conflito. */
export type TaskMutationFailure = Readonly<{
  version: 3
  status: 'error'
  code: TaskMutationErrorCode
  /** Presente somente em `VALIDATION_FAILED`, em forma finita por campo/índice. */
  fields?: TaskFieldErrors
  /** Presentes somente em `CONFLICT`, quando o proprietário conhece as revisões atuais. */
  currentContentRevision?: string
  currentEditRevision?: string
}>

/** Falha de `openTaskSource` (v1): nunca transporta stack, caminho ou payload. */
export type TaskSourceFailure = Readonly<{
  version: 1
  status: 'error'
  code: TaskSourceErrorCode
  currentContentRevision?: string
}>

export type TaskCommandFailure = TaskMutationFailure | TaskSourceFailure

export function taskMutationFailure(code: TaskMutationErrorCode): TaskMutationFailure {
  return { version: 3, status: 'error', code }
}

export function taskSourceFailure(code: TaskSourceErrorCode): TaskSourceFailure {
  return { version: 1, status: 'error', code }
}

export function isTaskMutationErrorCode(value: unknown): value is TaskMutationErrorCode {
  return typeof value === 'string' && (TASK_MUTATION_ERROR_CODES as readonly string[]).includes(value)
}

export function isTaskSourceErrorCode(value: unknown): value is TaskSourceErrorCode {
  return typeof value === 'string' && (TASK_SOURCE_ERROR_CODES as readonly string[]).includes(value)
}

// ---- Superfície pública do renderer ----

/** Escolha explícita ao cancelar uma ocorrência que carrega a regra (somente CANCELLED). */
export type TaskCancellation = 'SKIP' | 'END'

/** Draft de criação v2: básicos + regra opcional (sem âncora) + títulos de subtarefas. */
export type TaskCreateDraft = Readonly<CreateTaskDraft>

/** Patch de edição v2: básicos + regra/null + lista id/título; ausente conserva, null/[] limpam. */
export type TaskPatch = Readonly<EditTaskPatch>

export type TaskCreateRequest = Readonly<{ version: 3; contextSequence: number; draft: TaskCreateDraft }>
export type TaskUpdateRequest = Readonly<{
  version: 3
  contextSequence: number
  taskId: string
  expectedEditRevision: string
  patch: TaskPatch
  cancellation?: TaskCancellation
}>
export type TaskStatusRequest = Readonly<{
  version: 3
  contextSequence: number
  taskId: string
  expectedEditRevision: string
  status: TaskStatus
  cancellation?: TaskCancellation
}>
export type SubtaskDoneRequest = Readonly<{
  version: 3
  contextSequence: number
  taskId: string
  expectedEditRevision: string
  subtaskId: string
  done: boolean
}>
export type TaskOpenSourceRequest = Readonly<{
  version: 1
  taskId: string
  expectedContentRevision: string
}>

export type TaskCreateAck = Readonly<{
  version: 3
  status: 'ok'
  outcome: 'APPLIED'
  taskId: string
  revision: string
  contentRevision: string
  editRevision: string
}>
export type TaskMutationAck = Readonly<{
  version: 3
  status: 'ok'
  outcome: 'APPLIED' | 'UNCHANGED'
  revision: string
  contentRevision: string
  editRevision: string
  /** Somente em update/status APPLIED e quando o recibo pôde ser publicado no contexto atual. */
  undoToken?: string
}>
export type TaskOpenSourceAck = Readonly<{ version: 1; status: 'ok' }>

export type TaskCreateResult = TaskCreateAck | TaskMutationFailure
export type TaskMutationResult = TaskMutationAck | TaskMutationFailure
export type TaskOpenSourceResult = TaskOpenSourceAck | TaskSourceFailure

// ---- Validação em runtime ----

export type TaskRequestParse<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'invalid-request' }
  | { kind: 'validation'; fields: TaskFieldErrors }

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

function readOptionalText(record: PlainRecord, key: string, fields: TaskFieldErrors): OptionalTextRead {
  if (!(key in record)) return { present: false }
  const value = record[key]
  if (value === null) return { present: true, value: null }
  if (typeof value === 'string') return { present: true, value }
  fields[key as 'description'] = 'INVALID_VALUE'
  return { present: true, value: null }
}

function readTitle(record: PlainRecord, fields: TaskFieldErrors, required: boolean): string | undefined {
  if (!('title' in record)) {
    if (required) fields.title = 'REQUIRED'
    return undefined
  }
  const value = record['title']
  if (typeof value !== 'string') {
    fields.title = 'INVALID_VALUE'
    return undefined
  }
  return value
}

function readStatus(record: PlainRecord, fields: TaskFieldErrors): TaskStatus | undefined {
  if (!('status' in record)) return undefined
  const value = record['status']
  if (!isTaskStatus(value)) {
    fields.status = 'INVALID_VALUE'
    return undefined
  }
  return value
}

function readPriority(record: PlainRecord, fields: TaskFieldErrors): TaskPriority | undefined {
  if (!('priority' in record)) return undefined
  const value = record['priority']
  if (!isTaskPriority(value)) {
    fields.priority = 'INVALID_VALUE'
    return undefined
  }
  return value
}

function readTags(record: PlainRecord, fields: TaskFieldErrors): readonly string[] | undefined {
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

const CANCELLATION_VALUES: readonly TaskCancellation[] = ['SKIP', 'END']

function readCancellation(record: PlainRecord): TaskRequestParse<TaskCancellation | undefined> {
  if (!('cancellation' in record)) return { kind: 'ok', value: undefined }
  const value = record['cancellation']
  if (typeof value !== 'string' || !(CANCELLATION_VALUES as readonly string[]).includes(value)) {
    return { kind: 'invalid-request' }
  }
  return { kind: 'ok', value: value as TaskCancellation }
}

// ---- Regra de recorrência e subtarefas no request ----

type RecurrenceParse = { kind: 'ok'; value: TaskRecurrenceDraft } | { kind: 'invalid-request' } | { kind: 'validation'; errors: NonNullable<TaskFieldErrors['recurrence']> }

function parseRecurrenceDraft(value: unknown): RecurrenceParse {
  const record = asExactRecord(value, ['frequency'], ['intervalDays', 'weekdays', 'dayOfMonth', 'until'])
  if (record === null) return { kind: 'invalid-request' }

  const errors: NonNullable<TaskFieldErrors['recurrence']> = {}
  const frequency = record['frequency']
  if (typeof frequency !== 'string') {
    errors.frequency = 'REQUIRED'
  } else if (!isRecurrenceFrequency(frequency)) {
    errors.frequency = 'INVALID_VALUE'
  } else {
    // Parâmetros de frequência alheia são recusados já na forma (antes de qualquer leitura).
    const allowed =
      frequency === 'DAILY'
        ? ['frequency', 'intervalDays', 'until']
        : frequency === 'WEEKLY'
          ? ['frequency', 'weekdays', 'until']
          : ['frequency', 'dayOfMonth', 'until']
    if (Object.keys(record).some((key) => !allowed.includes(key))) return { kind: 'invalid-request' }
  }

  let intervalDays: number | undefined
  if ('intervalDays' in record) {
    const raw = record['intervalDays']
    if (typeof raw !== 'number') errors.intervalDays = 'INVALID_VALUE'
    else intervalDays = raw
  }

  let weekdays: number[] | undefined
  if ('weekdays' in record) {
    const raw = record['weekdays']
    if (!Array.isArray(raw)) {
      errors.weekdays = 'INVALID_VALUE'
    } else {
      const days: number[] = []
      let valid = true
      for (const day of raw as unknown[]) {
        if (typeof day !== 'number') {
          valid = false
          break
        }
        days.push(day)
      }
      if (valid) weekdays = days
      else errors.weekdays = 'INVALID_VALUE'
    }
  }

  let dayOfMonth: number | undefined
  if ('dayOfMonth' in record) {
    const raw = record['dayOfMonth']
    if (typeof raw !== 'number') errors.dayOfMonth = 'INVALID_VALUE'
    else dayOfMonth = raw
  }

  let until: string | null | undefined
  if ('until' in record) {
    const raw = record['until']
    if (raw === null) until = null
    else if (typeof raw === 'string') until = raw
    else errors.until = 'INVALID_VALUE'
  }

  if (Object.keys(errors).length > 0) return { kind: 'validation', errors }

  return {
    kind: 'ok',
    value: {
      frequency: frequency as RecurrenceFrequency,
      ...(intervalDays !== undefined && { intervalDays }),
      ...(weekdays !== undefined && { weekdays }),
      ...(dayOfMonth !== undefined && { dayOfMonth }),
      ...(until !== undefined && { until }),
    },
  }
}

type SubtaskParse = { kind: 'ok'; value: SubtaskDraft[] } | { kind: 'invalid-request' } | { kind: 'validation'; errors: NonNullable<TaskFieldErrors['subtasks']> }

function parseSubtaskDrafts(value: unknown, mode: 'create' | 'edit'): SubtaskParse {
  if (!Array.isArray(value)) return { kind: 'invalid-request' }

  const items: Array<{ index: number; title?: 'REQUIRED' | 'TOO_LONG'; id?: 'INVALID_VALUE' | 'DUPLICATE_ID' | 'UNKNOWN_ID' }> = []
  const drafts: SubtaskDraft[] = []

  for (const [index, item] of (value as unknown[]).entries()) {
    const record = mode === 'create' ? asExactRecord(item, ['title']) : asExactRecord(item, [], ['id', 'title'])
    if (record === null) return { kind: 'invalid-request' }

    const title = record['title']
    if (typeof title !== 'string') {
      items.push({ index, title: 'REQUIRED' })
      continue
    }

    let id: string | undefined
    if ('id' in record) {
      const rawId = record['id']
      if (typeof rawId !== 'string') {
        items.push({ index, id: 'INVALID_VALUE' })
        continue
      }
      id = rawId
    }

    drafts.push(id === undefined ? { title } : { id, title })
  }

  if (value.length > 20) {
    return { kind: 'validation', errors: { list: 'TOO_MANY', ...(items.length > 0 && { items }) } }
  }
  if (items.length > 0) return { kind: 'validation', errors: { items } }
  return { kind: 'ok', value: drafts }
}

/** `draft` de criação v3: básicos + regra opcional + subtarefas (títulos). */
export function parseTaskCreateRequest(value: unknown): TaskRequestParse<TaskCreateRequest> {
  if (!fitsRequestBudget(value)) return { kind: 'invalid-request' }
  const record = asExactRecord(value, ['version', 'contextSequence', 'draft'])
  if (record === null || record['version'] !== 3 || !isContextSequence(record['contextSequence'])) {
    return { kind: 'invalid-request' }
  }
  const draft = asExactRecord(record['draft'], [], [...BASIC_TASK_FIELDS, 'recurrence', 'subtasks'])
  if (draft === null) return { kind: 'invalid-request' }

  const fields: TaskFieldErrors = {}
  const title = readTitle(draft, fields, true)
  const description = readOptionalText(draft, 'description', fields)
  const requester = readOptionalText(draft, 'requester', fields)
  const assignee = readOptionalText(draft, 'assignee', fields)
  const dueAt = readOptionalText(draft, 'dueAt', fields)
  const sourceUrl = readOptionalText(draft, 'sourceUrl', fields)
  const status = readStatus(draft, fields)
  const priority = readPriority(draft, fields)
  const tags = readTags(draft, fields)

  let recurrence: TaskRecurrenceDraft | undefined
  if ('recurrence' in draft) {
    const parsed = parseRecurrenceDraft(draft['recurrence'])
    if (parsed.kind === 'invalid-request') return { kind: 'invalid-request' }
    if (parsed.kind === 'validation') fields.recurrence = parsed.errors
    else recurrence = parsed.value
  }

  let subtasks: SubtaskDraft[] | undefined
  if ('subtasks' in draft) {
    const parsed = parseSubtaskDrafts(draft['subtasks'], 'create')
    if (parsed.kind === 'invalid-request') return { kind: 'invalid-request' }
    if (parsed.kind === 'validation') fields.subtasks = parsed.errors
    else subtasks = parsed.value
  }

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
    ...(recurrence !== undefined && { recurrence }),
    ...(subtasks !== undefined && { subtasks }),
  }
  return { kind: 'ok', value: { version: 3, contextSequence: record['contextSequence'], draft: parsed } }
}

/** `patch` de edição v3: básicos + regra/null + lista id/título. */
export function parseTaskUpdateRequest(value: unknown): TaskRequestParse<TaskUpdateRequest> {
  if (!fitsRequestBudget(value)) return { kind: 'invalid-request' }
  const record = asExactRecord(value, ['version', 'contextSequence', 'taskId', 'expectedEditRevision', 'patch'], ['cancellation'])
  if (record === null || record['version'] !== 3 || !isContextSequence(record['contextSequence'])) {
    return { kind: 'invalid-request' }
  }
  if (!isTaskId(record['taskId']) || !isRevisionText(record['expectedEditRevision'])) {
    return { kind: 'invalid-request' }
  }
  const patchRecord = asExactRecord(record['patch'], [], [...BASIC_TASK_FIELDS, 'recurrence', 'subtasks'])
  if (patchRecord === null) return { kind: 'invalid-request' }

  const cancellation = readCancellation(record)
  if (cancellation.kind !== 'ok') return { kind: 'invalid-request' }

  const fields: TaskFieldErrors = {}
  let title: string | undefined
  if ('title' in patchRecord) {
    const raw = patchRecord['title']
    if (typeof raw === 'string') title = raw
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

  let recurrence: TaskRecurrenceDraft | null | undefined
  if ('recurrence' in patchRecord) {
    const raw = patchRecord['recurrence']
    if (raw === null) {
      recurrence = null
    } else {
      const parsed = parseRecurrenceDraft(raw)
      if (parsed.kind === 'invalid-request') return { kind: 'invalid-request' }
      if (parsed.kind === 'validation') fields.recurrence = parsed.errors
      else recurrence = parsed.value
    }
  }

  let subtasks: SubtaskDraft[] | undefined
  if ('subtasks' in patchRecord) {
    const parsed = parseSubtaskDrafts(patchRecord['subtasks'], 'edit')
    if (parsed.kind === 'invalid-request') return { kind: 'invalid-request' }
    if (parsed.kind === 'validation') fields.subtasks = parsed.errors
    else subtasks = parsed.value
  }

  if (Object.keys(fields).length > 0) return { kind: 'validation', fields }

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
    recurrence?: TaskRecurrenceDraft | null
    subtasks?: readonly SubtaskDraft[]
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
  if (recurrence !== undefined) patch.recurrence = recurrence
  if (subtasks !== undefined) patch.subtasks = subtasks

  return {
    kind: 'ok',
    value: {
      version: 3,
      contextSequence: record['contextSequence'],
      taskId: record['taskId'],
      expectedEditRevision: record['expectedEditRevision'],
      patch,
      ...(cancellation.value !== undefined && { cancellation: cancellation.value }),
    },
  }
}

export function parseTaskStatusRequest(value: unknown): TaskRequestParse<TaskStatusRequest> {
  if (!fitsRequestBudget(value)) return { kind: 'invalid-request' }
  const record = asExactRecord(value, ['version', 'contextSequence', 'taskId', 'expectedEditRevision', 'status'], ['cancellation'])
  if (record === null || record['version'] !== 3 || !isContextSequence(record['contextSequence'])) {
    return { kind: 'invalid-request' }
  }
  if (!isTaskId(record['taskId']) || !isRevisionText(record['expectedEditRevision'])) {
    return { kind: 'invalid-request' }
  }
  const status = record['status']
  if (!isTaskStatus(status)) {
    return { kind: 'validation', fields: { status: 'INVALID_VALUE' } }
  }
  const cancellation = readCancellation(record)
  if (cancellation.kind !== 'ok') return { kind: 'invalid-request' }
  return {
    kind: 'ok',
    value: {
      version: 3,
      contextSequence: record['contextSequence'],
      taskId: record['taskId'],
      expectedEditRevision: record['expectedEditRevision'],
      status,
      ...(cancellation.value !== undefined && { cancellation: cancellation.value }),
    },
  }
}

export function parseSubtaskDoneRequest(value: unknown): TaskRequestParse<SubtaskDoneRequest> {
  if (!fitsRequestBudget(value)) return { kind: 'invalid-request' }
  const record = asExactRecord(value, ['version', 'contextSequence', 'taskId', 'expectedEditRevision', 'subtaskId', 'done'])
  if (record === null || record['version'] !== 3 || !isContextSequence(record['contextSequence'])) {
    return { kind: 'invalid-request' }
  }
  if (!isTaskId(record['taskId']) || !isRevisionText(record['expectedEditRevision']) || !isTaskId(record['subtaskId'])) {
    return { kind: 'invalid-request' }
  }
  if (typeof record['done'] !== 'boolean') {
    // Intenção tipada: boolean explícito; formas extrínsecas (inversão/string) são recusadas.
    return { kind: 'invalid-request' }
  }
  return {
    kind: 'ok',
    value: {
      version: 3,
      contextSequence: record['contextSequence'],
      taskId: record['taskId'],
      expectedEditRevision: record['expectedEditRevision'],
      subtaskId: record['subtaskId'],
      done: record['done'],
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

// ---- Parse da saída (preload) ----

const BASIC_CODES_WITH_DUE: Record<string, readonly string[]> = {
  title: ['REQUIRED', 'TOO_LONG', 'TOO_MANY', 'INVALID_VALUE', 'INVALID_DATE', 'INVALID_URL'],
  description: ['REQUIRED', 'TOO_LONG', 'TOO_MANY', 'INVALID_VALUE', 'INVALID_DATE', 'INVALID_URL'],
  requester: ['REQUIRED', 'TOO_LONG', 'TOO_MANY', 'INVALID_VALUE', 'INVALID_DATE', 'INVALID_URL'],
  assignee: ['REQUIRED', 'TOO_LONG', 'TOO_MANY', 'INVALID_VALUE', 'INVALID_DATE', 'INVALID_URL'],
  status: ['REQUIRED', 'INVALID_VALUE'],
  priority: ['REQUIRED', 'INVALID_VALUE'],
  dueAt: ['REQUIRED', 'TOO_LONG', 'TOO_MANY', 'INVALID_VALUE', 'INVALID_DATE', 'INVALID_URL', 'DUE_REQUIRED'],
  tags: ['REQUIRED', 'TOO_LONG', 'TOO_MANY', 'INVALID_VALUE', 'INVALID_DATE', 'INVALID_URL'],
  sourceUrl: ['REQUIRED', 'TOO_LONG', 'TOO_MANY', 'INVALID_VALUE', 'INVALID_DATE', 'INVALID_URL'],
}

const RECURRENCE_CODES: Record<string, readonly string[]> = {
  frequency: ['REQUIRED', 'INVALID_VALUE', 'ABSOLUTE_REMINDER_INCOMPATIBLE'],
  intervalDays: ['REQUIRED', 'INVALID_VALUE'],
  weekdays: ['REQUIRED', 'INVALID_VALUE'],
  dayOfMonth: ['REQUIRED', 'INVALID_VALUE'],
  until: ['INVALID_VALUE', 'UNTIL_BEFORE_DUE'],
}

function parseRecurrenceFieldErrors(value: unknown): NonNullable<TaskFieldErrors['recurrence']> | null {
  const record = asPlainRecord(value)
  if (record === null) return null
  const keys = Object.getOwnPropertyNames(record)
  if (keys.length === 0) return null
  const errors: NonNullable<TaskFieldErrors['recurrence']> = {}
  for (const key of keys) {
    const allowed = RECURRENCE_CODES[key]
    if (allowed === undefined) return null
    const code = record[key]
    if (typeof code !== 'string' || !allowed.includes(code)) return null
    Object.assign(errors, { [key]: code })
  }
  return errors
}

function parseBasicFieldErrors(value: unknown): TaskFieldErrors | null {
  const record = asPlainRecord(value)
  if (record === null) return null
  const keys = Object.getOwnPropertyNames(record)
  if (keys.length === 0) return null
  const fields: TaskFieldErrors = {}
  for (const key of keys) {
    if (key === 'recurrence') {
      const errors = parseRecurrenceFieldErrors(record[key])
      if (errors === null) return null
      fields.recurrence = errors
      continue
    }
    if (key === 'subtasks') {
      const errors = parseSubtaskFieldErrors(record[key])
      if (errors === null) return null
      fields.subtasks = errors
      continue
    }
    const allowed = BASIC_CODES_WITH_DUE[key]
    if (allowed === undefined) return null
    const code = record[key]
    if (typeof code !== 'string' || !allowed.includes(code)) return null
    Object.assign(fields, { [key]: code })
  }
  return fields
}

const SUBTASK_TITLE_CODES: readonly string[] = ['REQUIRED', 'TOO_LONG']
const SUBTASK_ID_CODES: readonly string[] = ['INVALID_VALUE', 'DUPLICATE_ID', 'UNKNOWN_ID']

function parseSubtaskFieldErrors(value: unknown): NonNullable<TaskFieldErrors['subtasks']> | null {
  const record = asExactRecord(value, [], ['list', 'items'])
  if (record === null) return null
  const errors: NonNullable<TaskFieldErrors['subtasks']> = {}

  if ('list' in record) {
    if (record['list'] !== 'TOO_MANY') return null
    errors.list = 'TOO_MANY'
  }

  if ('items' in record) {
    const items = record['items']
    if (!Array.isArray(items) || items.length === 0 || items.length > 20) return null
    const parsed: NonNullable<NonNullable<TaskFieldErrors['subtasks']>['items']> = []
    for (const item of items as unknown[]) {
      const itemRecord = asExactRecord(item, ['index'], ['title', 'id'])
      if (itemRecord === null) return null
      const index = itemRecord['index']
      if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index > 19) return null
      const parsedItem: { index: number; title?: 'REQUIRED' | 'TOO_LONG'; id?: 'INVALID_VALUE' | 'DUPLICATE_ID' | 'UNKNOWN_ID' } = { index }
      if ('title' in itemRecord) {
        const code = itemRecord['title']
        if (typeof code !== 'string' || !SUBTASK_TITLE_CODES.includes(code)) return null
        parsedItem.title = code as 'REQUIRED' | 'TOO_LONG'
      }
      if ('id' in itemRecord) {
        const code = itemRecord['id']
        if (typeof code !== 'string' || !SUBTASK_ID_CODES.includes(code)) return null
        parsedItem.id = code as 'INVALID_VALUE' | 'DUPLICATE_ID' | 'UNKNOWN_ID'
      }
      if (parsedItem.title === undefined && parsedItem.id === undefined) return null
      parsed.push(parsedItem)
    }
    errors.items = parsed
  }

  return Object.keys(errors).length > 0 ? errors : null
}

function parseMutationFailure(value: unknown): TaskMutationFailure | null {
  const record = asExactRecord(
    value,
    ['version', 'status', 'code'],
    ['fields', 'currentContentRevision', 'currentEditRevision'],
  )
  if (record === null || record['version'] !== 3 || record['status'] !== 'error') return null
  const code = record['code']
  if (typeof code !== 'string' || !(TASK_MUTATION_ERROR_CODES as readonly string[]).includes(code)) return null

  const failure: {
    version: 3
    status: 'error'
    code: TaskMutationErrorCode
    fields?: TaskFieldErrors
    currentContentRevision?: string
    currentEditRevision?: string
  } = { version: 3, status: 'error', code: code as TaskMutationErrorCode }

  if ('fields' in record) {
    const fields = parseBasicFieldErrors(record['fields'])
    if (code !== 'VALIDATION_FAILED' || fields === null) return null
    failure.fields = fields
  } else if (code === 'VALIDATION_FAILED') {
    return null
  }

  const hasContent = 'currentContentRevision' in record
  const hasEdit = 'currentEditRevision' in record
  if (hasContent !== hasEdit) return null
  if (hasContent) {
    if (code !== 'CONFLICT') return null
    if (!isRevisionText(record['currentContentRevision']) || !isRevisionText(record['currentEditRevision'])) return null
    failure.currentContentRevision = record['currentContentRevision']
    failure.currentEditRevision = record['currentEditRevision']
  }

  // Códigos de campo/estrutura só acompanham VALIDATION_FAILED; os demais não transportam dados.
  return failure
}

function parseSourceFailure(value: unknown): TaskSourceFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'], ['currentContentRevision'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'error') return null
  const code = record['code']
  if (typeof code !== 'string' || !(TASK_SOURCE_ERROR_CODES as readonly string[]).includes(code)) return null
  const failure: { version: 1; status: 'error'; code: TaskSourceErrorCode; currentContentRevision?: string } = {
    version: 1,
    status: 'error',
    code: code as TaskSourceErrorCode,
  }
  if ('currentContentRevision' in record) {
    if (code !== 'CONFLICT' || !isRevisionText(record['currentContentRevision'])) return null
    failure.currentContentRevision = record['currentContentRevision']
  }
  return failure
}

export function parseTaskCreateResult(value: unknown): TaskCreateResult | null {
  const failure = parseMutationFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'outcome', 'taskId', 'revision', 'contentRevision', 'editRevision'])
  if (record === null || record['version'] !== 3 || record['status'] !== 'ok' || record['outcome'] !== 'APPLIED') return null
  const taskId = record['taskId']
  const revision = record['revision']
  const contentRevision = record['contentRevision']
  const editRevision = record['editRevision']
  if (
    typeof taskId !== 'string' ||
    taskId.length === 0 ||
    !isRevisionText(revision) ||
    !isRevisionText(contentRevision) ||
    !isRevisionText(editRevision)
  ) {
    return null
  }
  const ack: TaskCreateAck = { version: 3, status: 'ok', outcome: 'APPLIED', taskId, revision, contentRevision, editRevision }
  return fitsResponseBudget(ack) ? ack : null
}

function parseMutationAck(value: unknown): TaskMutationAck | null {
  const record = asExactRecord(
    value,
    ['version', 'status', 'outcome', 'revision', 'contentRevision', 'editRevision'],
    ['undoToken'],
  )
  if (record === null || record['version'] !== 3 || record['status'] !== 'ok') return null
  const outcome = record['outcome']
  if (outcome !== 'APPLIED' && outcome !== 'UNCHANGED') return null
  const revision = record['revision']
  const contentRevision = record['contentRevision']
  const editRevision = record['editRevision']
  if (!isRevisionText(revision) || !isRevisionText(contentRevision) || !isRevisionText(editRevision)) return null
  if ('undoToken' in record) {
    // Token só acompanha uma alteração aplicada; no-op/check não oferecem desfazer.
    if (outcome !== 'APPLIED' || !isOpaqueToken(record['undoToken'])) return null
  }
  const ack: TaskMutationAck = {
    version: 3,
    status: 'ok',
    outcome,
    revision,
    contentRevision,
    editRevision,
    ...('undoToken' in record && { undoToken: record['undoToken'] as string }),
  }
  return fitsResponseBudget(ack) ? ack : null
}

export function parseTaskMutationResult(value: unknown): TaskMutationResult | null {
  return parseMutationFailure(value) ?? parseMutationAck(value)
}

export function parseSubtaskDoneResult(value: unknown): TaskMutationResult | null {
  return parseMutationFailure(value) ?? parseMutationAck(value)
}

export function parseTaskOpenSourceResult(value: unknown): TaskOpenSourceResult | null {
  const failure = parseSourceFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status'])
  if (record === null || record['version'] !== 1 || record['status'] !== 'ok') return null
  return { version: 1, status: 'ok' }
}

/** Códigos avançados aceitos pela união pública (exportado para testes de contrato). */
export { ADVANCED_FIELD_ERROR_CODES, RECURRENCE_FIELDS }
