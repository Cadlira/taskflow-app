// Regras básicas revisadas de taskflow-extension@a763e7a src/domain/task-draft.ts (MIT, mesmo autor).
// Mantidos: limites, trim de textos, tags distintas sem diferenciar caixa, defaults TODO/MEDIUM e
// validação HTTP/HTTPS. Não entram lembretes, recorrência, subtarefas, IA nem o `updateTask`
// integral da origem (que limpa `reminders`/`recurrence` omitidos).
import { isTaskPriority, isTaskStatus, type Task, type TaskPriority, type TaskStatus } from './task.js'
import { isRepresentableInstant } from './task-reminders.js'
import { applyStatus } from './task-status.js'
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
