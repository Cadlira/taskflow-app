// Regras básicas revisadas de taskflow-extension@a763e7a src/domain/task-draft.ts (MIT, mesmo autor).
// Mantidos: limites, trim de textos, tags distintas sem diferenciar caixa, defaults TODO/MEDIUM e
// validação HTTP/HTTPS. Ampliado na TFA-005 com regra de recorrência (até inclusivo contra
// dueAt combinado, âncora preservada) e lista de subtarefas id/título, sem lembretes, IA ou
// campos de autoridade.
import { isTaskPriority, isTaskStatus, type IdGenerator, type Task, type TaskPriority, type TaskStatus } from './task.js'
import { isRepresentableInstant } from './task-reminders.js'
import {
  isRecurrence,
  isRecurrenceFrequency,
  isSameRecurrence,
  RECURRENCE_LIMITS,
  type Recurrence,
  type RecurrenceFrequency,
} from './task-recurrence.js'
import { applyStatus } from './task-status.js'
import {
  isSameSubtaskList,
  resolveSubtaskDrafts,
  type Subtask,
  type SubtaskDraft,
  type SubtaskListErrors,
} from './task-subtasks.js'
import { parseUrl } from './url.js'

export const TASK_LIMITS = {
  title: 200,
  description: 4000,
  person: 120,
  tag: 30,
  tags: 10,
} as const

export const BASIC_TASK_FIELDS = [
  'title',
  'description',
  'requester',
  'assignee',
  'status',
  'priority',
  'dueAt',
  'tags',
  'sourceUrl',
] as const

export type BasicTaskField = (typeof BASIC_TASK_FIELDS)[number]

export const BASIC_FIELD_ERROR_CODES = [
  'REQUIRED',
  'TOO_LONG',
  'TOO_MANY',
  'INVALID_VALUE',
  'INVALID_DATE',
  'INVALID_URL',
] as const

export type BasicFieldErrorCode = (typeof BASIC_FIELD_ERROR_CODES)[number]
export type BasicFieldErrors = Partial<Record<BasicTaskField, BasicFieldErrorCode>>

/** Códigos avançados acrescentados pela TFA-005; forma finita por campo/índice. */
export const ADVANCED_FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID_VALUE',
  'TOO_LONG',
  'TOO_MANY',
  'DUPLICATE_ID',
  'UNKNOWN_ID',
  'DUE_REQUIRED',
  'UNTIL_BEFORE_DUE',
  'ABSOLUTE_REMINDER_INCOMPATIBLE',
] as const

export type AdvancedFieldErrorCode = (typeof ADVANCED_FIELD_ERROR_CODES)[number]
export type TaskFieldErrorCode = BasicFieldErrorCode | AdvancedFieldErrorCode

export const RECURRENCE_FIELDS = ['frequency', 'intervalDays', 'weekdays', 'dayOfMonth', 'until'] as const
export type RecurrenceField = (typeof RECURRENCE_FIELDS)[number]
export type RecurrenceFieldErrors = Partial<Record<RecurrenceField, AdvancedFieldErrorCode>>

/**
 * Erros de validação dos comandos: os nove campos básicos e, em forma finita, a regra de
 * recorrência (`recurrence.frequency/…`) e a lista de subtarefas (`subtasks.list` e itens por
 * índice/título/id). Nenhuma mensagem arbitrária ou chave recebida é refletida.
 */
export interface TaskFieldErrors {
  title?: TaskFieldErrorCode
  description?: TaskFieldErrorCode
  requester?: TaskFieldErrorCode
  assignee?: TaskFieldErrorCode
  status?: TaskFieldErrorCode
  priority?: TaskFieldErrorCode
  dueAt?: TaskFieldErrorCode
  tags?: TaskFieldErrorCode
  sourceUrl?: TaskFieldErrorCode
  recurrence?: RecurrenceFieldErrors
  subtasks?: SubtaskListErrors
}

/** Entrada de criação tipada; o contrato de transporte já garantiu os tipos primitivos. */
export interface BasicTaskDraft {
  title: string
  description?: string
  requester?: string
  assignee?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string
  tags?: readonly string[]
  sourceUrl?: string
}

/**
 * Patch de edição: chave ausente conserva; `null` limpa descrição/solicitante/responsável/prazo/
 * origem; `[]` limpa tags. Título, status e prioridade não aceitam `null`.
 */
export interface BasicTaskPatch {
  title?: string
  description?: string | null
  requester?: string | null
  assignee?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string | null
  tags?: readonly string[]
  sourceUrl?: string | null
}

/** Regra informada pelo formulário; a âncora e a série não são entradas do cliente. */
export interface TaskRecurrenceDraft {
  frequency: RecurrenceFrequency
  intervalDays?: number
  weekdays?: readonly number[]
  dayOfMonth?: number
  /** Limite ISO: omitido conserva existente (edição), `null` retira e string altera. */
  until?: string | null
}

/** Draft de criação: básicos + regra opcional (sem âncora) + títulos ordenados. */
export interface CreateTaskDraft extends BasicTaskDraft {
  recurrence?: TaskRecurrenceDraft
  /** Criação aceita somente título; IDs vêm da autoridade. */
  subtasks?: readonly SubtaskDraft[]
}

/** Patch de edição: básicos + regra (`null` retira) + lista id/título (ausente conserva, [] limpa). */
export interface EditTaskPatch extends BasicTaskPatch {
  recurrence?: TaskRecurrenceDraft | null
  subtasks?: readonly SubtaskDraft[]
}

export interface NormalizedBasicDraft {
  title: string
  description?: string
  requester?: string
  assignee?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string
  tags: string[]
  sourceUrl?: string
}

export type BasicDraftValidation = { ok: true; value: NormalizedBasicDraft } | { ok: false; fields: BasicFieldErrors }
export type BasicPatchPlan = { ok: true; next: Task | undefined } | { ok: false; fields: BasicFieldErrors }

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** Deduplica por caixa preservando a primeira grafia; itens vazios são descartados. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of tags) {
    const tag = raw.trim()
    const key = tag.toLocaleLowerCase()

    if (tag && !seen.has(key)) {
      seen.add(key)
      result.push(tag)
    }
  }

  return result
}

export function isHttpUrl(value: string): boolean {
  const url = parseUrl(value)
  return url !== undefined && (url.protocol === 'http:' || url.protocol === 'https:')
}

/** Converte texto ISO em instante UTC representável; recusa datas impossíveis ou fora do intervalo. */
export function normalizeInstant(value: string): string | undefined {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp) || !isRepresentableInstant(timestamp)) return undefined
  return new Date(timestamp).toISOString()
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

/** Valida e normaliza os nove campos básicos de criação, sem tocar em campos avançados. */
export function validateBasicDraft(draft: BasicTaskDraft): BasicDraftValidation {
  const fields: BasicFieldErrors = {}

  const title = draft.title.trim()
  if (!title) {
    fields.title = 'REQUIRED'
  } else if (title.length > TASK_LIMITS.title) {
    fields.title = 'TOO_LONG'
  }

  const description = optionalText(draft.description)
  if (description && description.length > TASK_LIMITS.description) {
    fields.description = 'TOO_LONG'
  }

  const requester = optionalText(draft.requester)
  if (requester && requester.length > TASK_LIMITS.person) {
    fields.requester = 'TOO_LONG'
  }

  const assignee = optionalText(draft.assignee)
  if (assignee && assignee.length > TASK_LIMITS.person) {
    fields.assignee = 'TOO_LONG'
  }

  if (draft.status !== undefined && !isTaskStatus(draft.status)) {
    fields.status = 'INVALID_VALUE'
  }

  if (draft.priority !== undefined && !isTaskPriority(draft.priority)) {
    fields.priority = 'INVALID_VALUE'
  }

  let dueAt: string | undefined
  if (draft.dueAt !== undefined) {
    dueAt = normalizeInstant(draft.dueAt)
    if (dueAt === undefined) fields.dueAt = 'INVALID_DATE'
  }

  const tags = normalizeTags(draft.tags ?? [])
  if (tags.some((tag) => tag.length > TASK_LIMITS.tag)) {
    fields.tags = 'TOO_LONG'
  } else if (tags.length > TASK_LIMITS.tags) {
    fields.tags = 'TOO_MANY'
  }

  const sourceUrl = optionalText(draft.sourceUrl)
  if (sourceUrl && !isHttpUrl(sourceUrl)) {
    fields.sourceUrl = 'INVALID_URL'
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields }
  }

  return {
    ok: true,
    value: {
      title,
      ...(description && { description }),
      ...(requester && { requester }),
      ...(assignee && { assignee }),
      ...(draft.status && { status: draft.status }),
      ...(draft.priority && { priority: draft.priority }),
      ...(dueAt && { dueAt }),
      tags,
      ...(sourceUrl && { sourceUrl }),
    },
  }
}

/** Tarefa completa a partir do draft validado; identidade e relógio vêm do proprietário. */
export function createBasicTask(draft: NormalizedBasicDraft, context: { now: Date; id: string }): Task {
  const timestamp = context.now.toISOString()
  const task: Task = {
    id: context.id,
    title: draft.title,
    ...(draft.description && { description: draft.description }),
    ...(draft.requester && { requester: draft.requester }),
    ...(draft.assignee && { assignee: draft.assignee }),
    priority: draft.priority ?? 'MEDIUM',
    ...(draft.dueAt && { dueAt: draft.dueAt }),
    reminders: [],
    subtasks: [],
    tags: draft.tags,
    ...(draft.sourceUrl && { sourceUrl: draft.sourceUrl }),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'TODO',
  }

  return applyStatus(task, draft.status ?? 'TODO', context.now)
}

interface TextFieldOperation {
  key: 'title' | 'description' | 'requester' | 'assignee' | 'sourceUrl'
  value: string | undefined
}

type FieldOperation =
  | TextFieldOperation
  | { key: 'priority'; value: TaskPriority }
  | { key: 'dueAt'; value: string | undefined }
  | { key: 'tags'; value: string[] }

/**
 * Planeja o patch sobre a tarefa atual. Campos ausentes conservam o valor histórico intacto, sem
 * revalidação retroativa; apenas a intenção presente e realmente alterada é validada. Devolve
 * `next: undefined` quando nada muda (no-op), sem gravação.
 */
export function planBasicPatch(current: Task, patch: BasicTaskPatch, now: Date): BasicPatchPlan {
  const fields: BasicFieldErrors = {}
  const operations: FieldOperation[] = []
  let statusChange: TaskStatus | undefined

  if ('title' in patch) {
    const title = (patch.title ?? '').trim()
    if (title === current.title) {
      // Intacto (mesmo que histórico acima do limite): não revalida.
    } else if (!title) {
      fields.title = 'REQUIRED'
    } else if (title.length > TASK_LIMITS.title) {
      fields.title = 'TOO_LONG'
    } else {
      operations.push({ key: 'title', value: title })
    }
  }

  const applyText = (key: 'description' | 'requester' | 'assignee', limit: number): void => {
    if (!(key in patch)) return
    const raw = patch[key]
    if (raw === null || raw === undefined) {
      if (current[key] !== undefined) operations.push({ key, value: undefined })
      return
    }

    const value = raw.trim()
    if (!value) {
      if (current[key] !== undefined) operations.push({ key, value: undefined })
      return
    }
    if (value === current[key]) return
    if (value.length > limit) {
      fields[key] = 'TOO_LONG'
      return
    }
    operations.push({ key, value })
  }

  applyText('description', TASK_LIMITS.description)
  applyText('requester', TASK_LIMITS.person)
  applyText('assignee', TASK_LIMITS.person)

  if ('status' in patch) {
    if (patch.status === undefined || !isTaskStatus(patch.status)) {
      fields.status = 'INVALID_VALUE'
    } else if (patch.status !== current.status) {
      statusChange = patch.status
    }
  }

  if ('priority' in patch) {
    if (patch.priority === undefined || !isTaskPriority(patch.priority)) {
      fields.priority = 'INVALID_VALUE'
    } else if (patch.priority !== current.priority) {
      operations.push({ key: 'priority', value: patch.priority })
    }
  }

  if ('dueAt' in patch) {
    const raw = patch.dueAt
    if (raw === null) {
      if (current.dueAt !== undefined) operations.push({ key: 'dueAt', value: undefined })
    } else if (raw === current.dueAt) {
      // Presente e idêntico ao salvo: conserva exatamente o ISO original, inclusive precisão.
    } else {
      const dueAt = normalizeInstant(raw)
      if (dueAt === undefined) {
        fields.dueAt = 'INVALID_DATE'
      } else {
        operations.push({ key: 'dueAt', value: dueAt })
      }
    }
  }

  if ('tags' in patch) {
    const tags = normalizeTags(patch.tags ?? [])
    if (!sameTags(tags, current.tags)) {
      if (tags.some((tag) => tag.length > TASK_LIMITS.tag)) {
        fields.tags = 'TOO_LONG'
      } else if (tags.length > TASK_LIMITS.tags) {
        fields.tags = 'TOO_MANY'
      } else {
        operations.push({ key: 'tags', value: tags })
      }
    }
  }

  if ('sourceUrl' in patch) {
    const raw = patch.sourceUrl
    if (raw === null) {
      if (current.sourceUrl !== undefined) operations.push({ key: 'sourceUrl', value: undefined })
    } else {
      const value = raw.trim()
      if (!value) {
        if (current.sourceUrl !== undefined) operations.push({ key: 'sourceUrl', value: undefined })
      } else if (value === current.sourceUrl) {
        // Intacto: não revalida nem regrava o valor histórico.
      } else if (!isHttpUrl(value)) {
        fields.sourceUrl = 'INVALID_URL'
      } else {
        operations.push({ key: 'sourceUrl', value })
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields }
  }

  if (operations.length === 0 && statusChange === undefined) {
    return { ok: true, next: undefined }
  }

  const edited: Task = { ...current }
  for (const operation of operations) {
    switch (operation.key) {
      case 'priority':
        edited.priority = operation.value
        break
      case 'dueAt':
        if (operation.value === undefined) delete edited.dueAt
        else edited.dueAt = operation.value
        break
      case 'tags':
        edited.tags = operation.value
        break
      default:
        if (operation.value === undefined) delete edited[operation.key]
        else edited[operation.key] = operation.value
        break
    }
  }

  if (statusChange !== undefined) {
    return { ok: true, next: applyStatus(edited, statusChange, now) }
  }

  return { ok: true, next: { ...edited, updatedAt: now.toISOString() } }
}

// ---- TFA-005: regra de recorrência e subtarefas na criação/edição ----

function stripAnchor(rule: Recurrence): Recurrence {
  if (rule.anchorAt === undefined) return rule
  const until = rule.until === undefined ? {} : { until: rule.until }

  if (rule.frequency === 'DAILY') return { ...until, frequency: 'DAILY', intervalDays: rule.intervalDays }
  if (rule.frequency === 'WEEKLY') return { ...until, frequency: 'WEEKLY', weekdays: [...rule.weekdays] }
  return { ...until, frequency: 'MONTHLY', dayOfMonth: rule.dayOfMonth }
}

/**
 * Valida e normaliza a regra informada. O prazo combinado é obrigatório (`DUE_REQUIRED`), o
 * limite precisa ser igual ou posterior a ele (`UNTIL_BEFORE_DUE`) e parâmetros de frequência
 * alheia ou fora dos limites são recusados com erro no campo. `until` omitido conserva o limite
 * anterior informado; `null` retira; string normaliza o ISO oferecido.
 */
function normalizeRecurrenceDraft(
  draft: TaskRecurrenceDraft,
  dueAt: string | undefined,
  previousUntil: string | undefined,
  hasPreviousRule: boolean,
  fields: TaskFieldErrors,
): Recurrence | undefined {
  const recurrenceFields: RecurrenceFieldErrors = {}

  let until: string | undefined
  if ('until' in draft) {
    const raw = draft.until
    if (raw === null) {
      // Criação não tem limite a retirar; ali o formulário omite a chave.
      if (!hasPreviousRule) recurrenceFields.until = 'INVALID_VALUE'
      until = undefined
    } else if (typeof raw === 'string') {
      const normalized = normalizeInstant(raw)
      if (normalized === undefined) recurrenceFields.until = 'INVALID_VALUE'
      else until = normalized
    } else {
      recurrenceFields.until = 'INVALID_VALUE'
    }
  } else {
    until = previousUntil
  }

  const base = until === undefined ? {} : { until }
  let rule: Recurrence | undefined

  // Parâmetros de frequência alheia nunca moldam a regra: defensivamente, a presença de uma
  // chave de outra frequência invalida a regra (o parser já recusa a forma antes de ler dados).
  const alienParam =
    isRecurrenceFrequency(draft.frequency) &&
    Object.keys(draft).some(
      (key) =>
        key !== 'frequency' &&
        key !== 'until' &&
        !(draft.frequency === 'DAILY' && key === 'intervalDays') &&
        !(draft.frequency === 'WEEKLY' && key === 'weekdays') &&
        !(draft.frequency === 'MONTHLY' && key === 'dayOfMonth'),
    )

  if (!isRecurrenceFrequency(draft.frequency)) {
    recurrenceFields.frequency = draft.frequency === undefined ? 'REQUIRED' : 'INVALID_VALUE'
  } else if (alienParam) {
    recurrenceFields.frequency = 'INVALID_VALUE'
  } else if (draft.frequency === 'DAILY') {
    const intervalDays = draft.intervalDays
    if (intervalDays === undefined) {
      recurrenceFields.intervalDays = 'REQUIRED'
    } else if (
      typeof intervalDays !== 'number' ||
      !Number.isSafeInteger(intervalDays) ||
      intervalDays < RECURRENCE_LIMITS.intervalDaysMin ||
      intervalDays > RECURRENCE_LIMITS.intervalDaysMax
    ) {
      recurrenceFields.intervalDays = 'INVALID_VALUE'
    } else {
      rule = { ...base, frequency: 'DAILY', intervalDays }
    }
  } else if (draft.frequency === 'WEEKLY') {
    const weekdays = draft.weekdays
    if (weekdays === undefined) {
      recurrenceFields.weekdays = 'REQUIRED'
    } else if (
      !Array.isArray(weekdays) ||
      weekdays.length < RECURRENCE_LIMITS.weekdaysMin ||
      weekdays.length > RECURRENCE_LIMITS.weekdaysMax
    ) {
      recurrenceFields.weekdays = 'INVALID_VALUE'
    } else {
      const seen = new Set<number>()
      let valid = true
      for (const weekday of weekdays) {
        if (typeof weekday !== 'number' || !Number.isSafeInteger(weekday) || weekday < 0 || weekday > 6 || seen.has(weekday)) {
          valid = false
          break
        }
        seen.add(weekday)
      }
      if (!valid) recurrenceFields.weekdays = 'INVALID_VALUE'
      else rule = { ...base, frequency: 'WEEKLY', weekdays: [...weekdays] }
    }
  } else {
    const dayOfMonth = draft.dayOfMonth
    if (dayOfMonth === undefined) {
      recurrenceFields.dayOfMonth = 'REQUIRED'
    } else if (
      typeof dayOfMonth !== 'number' ||
      !Number.isSafeInteger(dayOfMonth) ||
      dayOfMonth < RECURRENCE_LIMITS.dayOfMonthMin ||
      dayOfMonth > RECURRENCE_LIMITS.dayOfMonthMax
    ) {
      recurrenceFields.dayOfMonth = 'INVALID_VALUE'
    } else {
      rule = { ...base, frequency: 'MONTHLY', dayOfMonth }
    }
  }

  if (dueAt === undefined) {
    fields.dueAt = 'DUE_REQUIRED'
    rule = undefined
  } else if (until !== undefined && Date.parse(until) < Date.parse(dueAt)) {
    recurrenceFields.until = 'UNTIL_BEFORE_DUE'
    rule = undefined
  }

  if (Object.keys(recurrenceFields).length > 0) {
    fields.recurrence = { ...(fields.recurrence ?? {}), ...recurrenceFields }
  }

  return rule !== undefined && isRecurrence(rule) ? rule : undefined
}

export interface CreateTaskContext {
  now: Date
  /** Identidade da tarefa alocada pelo proprietário. */
  id: string
  /** Identidade da série alocada pelo proprietário; obrigatória quando há regra. */
  seriesId?: string
  generateId: IdGenerator
}

export type CreateTaskPlan =
  | { ok: true; task: Task }
  | { ok: false; kind: 'validation'; fields: TaskFieldErrors }
  | { ok: false; kind: 'identity' }

/**
 * Cria a tarefa a partir do draft validado: identidade/relógio do proprietário, regra sem âncora
 * antiga (criação não tem anterior), série fornecida pelo proprietário e subtarefas com IDs novos
 * desmarcados. Criação terminal com regra persiste sem gerar imediatamente.
 */
export function buildCreateTask(draft: CreateTaskDraft, context: CreateTaskContext): CreateTaskPlan {
  const basic = validateBasicDraft(draft)
  if (!basic.ok) return { ok: false, kind: 'validation', fields: basic.fields }

  const fields: TaskFieldErrors = {}
  let recurrence: Recurrence | undefined

  if (draft.recurrence !== undefined) {
    recurrence = normalizeRecurrenceDraft(draft.recurrence, basic.value.dueAt, undefined, false, fields)
  }

  let subtasks: Subtask[] = []
  if (draft.subtasks !== undefined) {
    const resolution = resolveSubtaskDrafts(draft.subtasks, [], context.generateId, 'create')
    if (!resolution.ok) {
      if (resolution.kind === 'identity') return { ok: false, kind: 'identity' }
      fields.subtasks = resolution.errors
    } else {
      subtasks = resolution.subtasks
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, kind: 'validation', fields }

  if (recurrence !== undefined && (context.seriesId === undefined || context.seriesId === '')) {
    return { ok: false, kind: 'identity' }
  }

  const created = createBasicTask(basic.value, { now: context.now, id: context.id })

  return {
    ok: true,
    task: {
      ...created,
      subtasks,
      ...(recurrence !== undefined && context.seriesId !== undefined && { seriesId: context.seriesId, recurrence }),
    },
  }
}

export interface UpdateTaskContext {
  now: Date
  generateId: IdGenerator
  /** Série nova alocada pelo proprietário quando a regra é adicionada a tarefa sem série. */
  newSeriesId?: string
}

export type TaskUpdatePlan =
  | { ok: true; next: Task | undefined }
  | { ok: false; kind: 'validation'; fields: TaskFieldErrors }
  | { ok: false; kind: 'identity' }

/**
 * Planeja o patch completo sobre a tarefa atual (básicos + regra + subtarefas + status):
 *
 * - regra omitida conserva (inclusive âncora); `null` retira conservando status/seriesId; objeto
 *   valida parâmetros e `until` contra o prazo combinado;
 * - ao mudar prazo/regra de portadora existente, a âncora é a antiga `anchorAt ?? dueAt`,
 *   permanecendo enquanto divergir do novo prazo e desaparecendo ao retornar ao mesmo ISO;
 *   regra nova sem anterior não recebe âncora e série histórica é mantida;
 * - subtarefas ausentes conservam; [] limpam; itens com ID existente preservam a marcação atual;
 * - atributo absoluto (`AT`) da tarefa impede adicionar/alterar regra nela.
 */
export function planTaskUpdate(current: Task, patch: EditTaskPatch, context: UpdateTaskContext): TaskUpdatePlan {
  const basic = planBasicPatch(current, patch, context.now)
  if (!basic.ok) return { ok: false, kind: 'validation', fields: basic.fields }

  let working = basic.next ?? current
  let changed = basic.next !== undefined
  const fields: TaskFieldErrors = {}
  const hadRule = current.recurrence !== undefined

  let rule = current.recurrence
  let ruleSent = false

  if ('recurrence' in patch) {
    if (patch.recurrence === null) {
      rule = undefined
      ruleSent = true
    } else if (patch.recurrence !== undefined) {
      ruleSent = true
      rule = normalizeRecurrenceDraft(
        patch.recurrence,
        working.dueAt,
        current.recurrence?.until,
        hadRule,
        fields,
      )
      if (rule !== undefined && current.reminders.some((reminder) => reminder.type === 'AT')) {
        fields.recurrence = { ...(fields.recurrence ?? {}), frequency: 'ABSOLUTE_REMINDER_INCOMPATIBLE' }
      }
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, kind: 'validation', fields }

  if (rule !== undefined && working.dueAt === undefined) {
    return { ok: false, kind: 'validation', fields: { dueAt: 'DUE_REQUIRED' } }
  }

  const dueChanged = working.dueAt !== current.dueAt
  const ruleChanged = !isSameRecurrence(rule, current.recurrence)

  if (rule !== undefined && hadRule && (dueChanged || ruleChanged)) {
    const base = current.recurrence?.anchorAt ?? current.dueAt
    if (base !== undefined && base !== working.dueAt) {
      rule = { ...rule, anchorAt: base }
    } else {
      rule = stripAnchor(rule)
    }
  }

  if (!isSameRecurrence(rule, current.recurrence)) changed = true

  if (!isSameRecurrence(rule, current.recurrence) || ruleSent) {
    if (rule !== undefined && current.seriesId === undefined) {
      const seriesId = context.newSeriesId
      if (seriesId === undefined || seriesId === '') return { ok: false, kind: 'identity' }
      working = { ...working, seriesId }
    }
  }

  if (rule === undefined) {
    if (current.recurrence !== undefined) {
      working = { ...working }
      delete working.recurrence
    }
  } else {
    working = { ...working, recurrence: rule }
  }

  if ('subtasks' in patch) {
    const resolution = resolveSubtaskDrafts(patch.subtasks ?? [], current.subtasks, context.generateId, 'edit')
    if (!resolution.ok) {
      if (resolution.kind === 'identity') return { ok: false, kind: 'identity' }
      return { ok: false, kind: 'validation', fields: { subtasks: resolution.errors } }
    }
    if (!isSameSubtaskList(resolution.subtasks, current.subtasks)) {
      working = { ...working, subtasks: resolution.subtasks }
      changed = true
    }
  }

  if (!changed) return { ok: true, next: undefined }

  return { ok: true, next: { ...working, updatedAt: context.now.toISOString() } }
}
