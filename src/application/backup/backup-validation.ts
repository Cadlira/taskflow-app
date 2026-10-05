// Validação estrita do arquivo de backup (cópia revisada de taskflow-extension@a763e7a
// src/domain/task-integrity.ts, MIT, mesmo autor) com duas mudanças deliberadas do desktop:
// problemas seguros (campo/código/índice, sem título nem mensagem livre) e projeção explícita de
// todos os níveis — propriedades desconhecidas são descartadas e nunca viram configuração,
// inclusive dentro de `recurrence`. O codec persistido (v1–v4) permanece independente e aceita
// histórico mais amplo; este contrato não aplica a regra de edição de formulário a dados antigos.
import { isTaskPriority, isTaskStatus, type Task, type TaskReminder } from '../../domain/task.js'
import { isHttpUrl, TASK_LIMITS } from '../../domain/task-draft.js'
import {
  isRepresentableInstant,
  MAX_REMINDERS,
  resolveReminderTriggerAt,
} from '../../domain/task-reminders.js'
import { RECURRENCE_LIMITS, type Recurrence } from '../../domain/task-recurrence.js'
import { MAX_SUBTASKS, SUBTASK_TITLE_LIMIT, type Subtask } from '../../domain/task-subtasks.js'
import { isCanonicalInstant } from './backup-format.js'
import { BackupIssueCollector, type BackupIssueCode } from './backup-issues.js'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Projeta a regra conhecida; extras (inclusive parâmetros de outra frequência) são ignorados. */
export function projectBackupRecurrence(value: unknown): Recurrence | undefined {
  if (!isRecord(value)) return undefined

  const anchorAt = value['anchorAt']
  const until = value['until']
  if (anchorAt !== undefined && !isCanonicalInstant(anchorAt)) return undefined
  if (until !== undefined && !isCanonicalInstant(until)) return undefined
  const base = {
    ...(anchorAt !== undefined && { anchorAt }),
    ...(until !== undefined && { until }),
  }

  const frequency = value['frequency']
  if (frequency === 'DAILY') {
    const intervalDays = value['intervalDays']
    if (
      typeof intervalDays !== 'number' ||
      !Number.isSafeInteger(intervalDays) ||
      intervalDays < RECURRENCE_LIMITS.intervalDaysMin ||
      intervalDays > RECURRENCE_LIMITS.intervalDaysMax
    ) {
      return undefined
    }
    return { ...base, frequency: 'DAILY', intervalDays }
  }

  if (frequency === 'WEEKLY') {
    const weekdays = value['weekdays']
    if (
      !Array.isArray(weekdays) ||
      weekdays.length < RECURRENCE_LIMITS.weekdaysMin ||
      weekdays.length > RECURRENCE_LIMITS.weekdaysMax
    ) {
      return undefined
    }
    const seen = new Set<number>()
    const projected: number[] = []
    for (const weekday of weekdays as unknown[]) {
      if (typeof weekday !== 'number' || !Number.isSafeInteger(weekday) || weekday < 0 || weekday > 6) {
        return undefined
      }
      if (seen.has(weekday)) return undefined
      seen.add(weekday)
      projected.push(weekday)
    }
    return { ...base, frequency: 'WEEKLY', weekdays: projected }
  }

  if (frequency === 'MONTHLY') {
    const dayOfMonth = value['dayOfMonth']
    if (
      typeof dayOfMonth !== 'number' ||
      !Number.isSafeInteger(dayOfMonth) ||
      dayOfMonth < RECURRENCE_LIMITS.dayOfMonthMin ||
      dayOfMonth > RECURRENCE_LIMITS.dayOfMonthMax
    ) {
      return undefined
    }
    return { ...base, frequency: 'MONTHLY', dayOfMonth }
  }

  return undefined
}

/** Projeta um lembrete conhecido; extras são descartados. */
export function projectBackupReminder(value: unknown): TaskReminder | undefined {
  if (!isRecord(value)) return undefined

  const id = value['id']
  if (typeof id !== 'string' || id.trim() === '') return undefined

  const processedFor = value['processedFor']
  if (processedFor !== undefined && !isCanonicalInstant(processedFor)) return undefined
  const identity = processedFor === undefined ? { id } : { id, processedFor }

  if (value['type'] === 'OFFSET') {
    const offsetMinutes = value['offsetMinutes']
    if (typeof offsetMinutes !== 'number' || !Number.isSafeInteger(offsetMinutes) || offsetMinutes < 0) {
      return undefined
    }
    return { ...identity, type: 'OFFSET', offsetMinutes }
  }

  if (value['type'] === 'AT') {
    const at = value['at']
    if (!isCanonicalInstant(at)) return undefined
    return { ...identity, type: 'AT', at }
  }

  return undefined
}

/** Projeta uma subtarefa conhecida; extras são descartados. */
export function projectBackupSubtask(value: unknown): Subtask | undefined {
  if (!isRecord(value)) return undefined

  const id = value['id']
  if (typeof id !== 'string' || id.trim() === '') return undefined

  const title = value['title']
  if (typeof title !== 'string' || title.trim() === '') return undefined
  if (title !== title.trim() || title.length > SUBTASK_TITLE_LIMIT) return undefined

  if (typeof value['done'] !== 'boolean') return undefined
  return { id, title, done: value['done'] }
}

interface TaskValidationState {
  taskIndex: number
  collector: BackupIssueCollector
  invalid: boolean
}

function markInvalid(state: TaskValidationState): void {
  state.invalid = true
}

function addIssue(
  state: TaskValidationState,
  field: Parameters<BackupIssueCollector['add']>[0]['field'],
  code: BackupIssueCode,
  indices: { reminderIndex?: number; subtaskIndex?: number } = {},
): void {
  markInvalid(state)
  state.collector.add({ taskIndex: state.taskIndex, field, code, ...indices })
}

/**
 * Valida e projeta uma tarefa de arquivo. Devolve a tarefa conhecida somente quando todos os
 * problemas possíveis foram coletados sem nenhuma falha; caso contrário devolve `undefined` e o
 * coletor registra campo/código/índice.
 */
export function validateBackupTask(
  value: unknown,
  taskIndex: number,
  collector: BackupIssueCollector,
): Task | undefined {
  const state: TaskValidationState = { taskIndex, collector, invalid: false }

  if (!isRecord(value)) {
    addIssue(state, 'task', 'INVALID_VALUE')
    return undefined
  }

  let id: string | undefined
  if (typeof value['id'] !== 'string' || value['id'].trim() === '') {
    addIssue(state, 'id', 'REQUIRED')
  } else {
    id = value['id']
  }

  let title: string | undefined
  const rawTitle = value['title']
  if (typeof rawTitle !== 'string' || rawTitle.trim() === '') {
    addIssue(state, 'title', 'REQUIRED')
  } else if (rawTitle !== rawTitle.trim()) {
    addIssue(state, 'title', 'INVALID_VALUE')
  } else if (rawTitle.length > TASK_LIMITS.title) {
    addIssue(state, 'title', 'TOO_LONG')
  } else {
    title = rawTitle
  }

  function optionalText(
    raw: unknown,
    field: 'description' | 'requester' | 'assignee',
    limit: number,
  ): string | undefined {
    if (raw === undefined) return undefined
    if (typeof raw !== 'string') {
      addIssue(state, field, 'INVALID_VALUE')
      return undefined
    }
    if (raw.trim() === '') {
      addIssue(state, field, 'REQUIRED')
      return undefined
    }
    if (raw !== raw.trim()) {
      addIssue(state, field, 'INVALID_VALUE')
      return undefined
    }
    if (raw.length > limit) {
      addIssue(state, field, 'TOO_LONG')
      return undefined
    }
    return raw
  }

  const description = optionalText(value['description'], 'description', TASK_LIMITS.description)
  const requester = optionalText(value['requester'], 'requester', TASK_LIMITS.person)
  const assignee = optionalText(value['assignee'], 'assignee', TASK_LIMITS.person)

  let status: Task['status'] | undefined
  if (!isTaskStatus(value['status'])) addIssue(state, 'status', 'INVALID_VALUE')
  else status = value['status']

  let priority: Task['priority'] | undefined
  if (!isTaskPriority(value['priority'])) addIssue(state, 'priority', 'INVALID_VALUE')
  else priority = value['priority']

  let dueAt: string | undefined
  if (value['dueAt'] !== undefined) {
    if (isCanonicalInstant(value['dueAt'])) dueAt = value['dueAt']
    else addIssue(state, 'dueAt', 'INVALID_DATE')
  }

  let completedAt: string | undefined
  if (value['completedAt'] !== undefined) {
    if (isCanonicalInstant(value['completedAt'])) completedAt = value['completedAt']
    else addIssue(state, 'completedAt', 'INVALID_DATE')
  }

  if (status === 'DONE' && value['completedAt'] === undefined) {
    addIssue(state, 'completedAt', 'REQUIRED')
  } else if (status !== undefined && status !== 'DONE' && value['completedAt'] !== undefined) {
    addIssue(state, 'completedAt', 'INVALID_VALUE')
  }

  let createdAt: string | undefined
  if (isCanonicalInstant(value['createdAt'])) createdAt = value['createdAt']
  else addIssue(state, 'createdAt', 'INVALID_DATE')

  let updatedAt: string | undefined
  if (isCanonicalInstant(value['updatedAt'])) updatedAt = value['updatedAt']
  else addIssue(state, 'updatedAt', 'INVALID_DATE')

  let tags: string[] | undefined
  if (!Array.isArray(value['tags'])) {
    addIssue(state, 'tags', 'INVALID_VALUE')
  } else {
    const collected: string[] = []
    const seenTags = new Set<string>()
    let tagIssue = false
    for (const rawTag of value['tags'] as unknown[]) {
      if (typeof rawTag !== 'string' || rawTag.trim() === '') {
        addIssue(state, 'tags', 'REQUIRED')
        tagIssue = true
        continue
      }
      if (rawTag !== rawTag.trim()) {
        addIssue(state, 'tags', 'INVALID_VALUE')
        tagIssue = true
        continue
      }
      if (rawTag.length > TASK_LIMITS.tag) {
        addIssue(state, 'tags', 'TOO_LONG')
        tagIssue = true
        continue
      }
      const key = rawTag.toLocaleLowerCase()
      if (seenTags.has(key)) {
        addIssue(state, 'tags', 'DUPLICATE')
        tagIssue = true
        continue
      }
      seenTags.add(key)
      collected.push(rawTag)
    }
    if (value['tags'].length > TASK_LIMITS.tags) {
      addIssue(state, 'tags', 'TOO_MANY')
      tagIssue = true
    }
    if (!tagIssue) tags = collected
  }

  let sourceUrl: string | undefined
  if (value['sourceUrl'] !== undefined) {
    const raw = value['sourceUrl']
    if (
      typeof raw !== 'string' ||
      raw.trim() === '' ||
      raw !== raw.trim() ||
      !isHttpUrl(raw)
    ) {
      addIssue(state, 'sourceUrl', 'INVALID_URL')
    } else {
      sourceUrl = raw
    }
  }

  let seriesId: string | undefined
  if (value['seriesId'] !== undefined) {
    const raw = value['seriesId']
    if (typeof raw !== 'string' || raw.trim() === '') addIssue(state, 'seriesId', 'REQUIRED')
    else seriesId = raw
  }

  let reminders: TaskReminder[] | undefined
  if (!Array.isArray(value['reminders'])) {
    addIssue(state, 'reminders', 'INVALID_VALUE')
  } else {
    const collected: TaskReminder[] = []
    const seenReminderIds = new Set<string>()
    const seenInstants = new Set<number>()
    let reminderIssue = false

    ;(value['reminders'] as unknown[]).forEach((rawReminder, reminderIndex) => {
      if (!isRecord(rawReminder)) {
        addIssue(state, 'reminders', 'INVALID_VALUE', { reminderIndex })
        reminderIssue = true
        return
      }

      const reminderId = rawReminder['id']
      let reminderIdOk = false
      if (typeof reminderId !== 'string' || reminderId.trim() === '') {
        addIssue(state, 'reminders', 'REQUIRED', { reminderIndex })
      } else if (seenReminderIds.has(reminderId)) {
        addIssue(state, 'reminders', 'DUPLICATE', { reminderIndex })
      } else {
        reminderIdOk = true
      }

      const projection = projectBackupReminder(rawReminder)
      if (projection === undefined) {
        addIssue(state, 'reminders', 'INVALID_VALUE', { reminderIndex })
        reminderIssue = true
        return
      }

      if (dueAt === undefined) {
        reminderIssue = true
        return
      }

      const triggerAt = resolveReminderTriggerAt(projection, dueAt)
      if (!isRepresentableInstant(triggerAt)) {
        addIssue(state, 'reminders', 'INVALID_VALUE', { reminderIndex })
        reminderIssue = true
        return
      }

      if (projection.type === 'AT' && triggerAt > Date.parse(dueAt)) {
        addIssue(state, 'reminders', 'INVALID_VALUE', { reminderIndex })
        reminderIssue = true
        return
      }

      if (seenInstants.has(triggerAt)) {
        addIssue(state, 'reminders', 'DUPLICATE', { reminderIndex })
        reminderIssue = true
        return
      }

      if (!reminderIdOk) {
        reminderIssue = true
        return
      }

      seenReminderIds.add(projection.id)
      seenInstants.add(triggerAt)
      collected.push(projection)
    })

    if (value['reminders'].length > MAX_REMINDERS) {
      addIssue(state, 'reminders', 'TOO_MANY')
      reminderIssue = true
    } else if (value['reminders'].length > 0 && value['dueAt'] === undefined) {
      addIssue(state, 'reminders', 'REQUIRED')
      reminderIssue = true
    }
    if (!reminderIssue) reminders = collected
  }

  let recurrence: Recurrence | undefined
  if (value['recurrence'] !== undefined) {
    const projection = projectBackupRecurrence(value['recurrence'])
    if (projection === undefined) {
      addIssue(state, 'recurrence', 'INVALID_VALUE')
    } else if (dueAt === undefined) {
      addIssue(state, 'recurrence', 'INVALID_VALUE')
    } else if (seriesId === undefined) {
      addIssue(state, 'recurrence', 'INVALID_VALUE')
    } else if (reminders !== undefined && reminders.some((reminder) => reminder.type === 'AT')) {
      addIssue(state, 'recurrence', 'INVALID_VALUE')
    } else {
      recurrence = projection
    }
  }

  let subtasks: Subtask[] | undefined
  if (!Array.isArray(value['subtasks'])) {
    addIssue(state, 'subtasks', 'INVALID_VALUE')
  } else {
    const collected: Subtask[] = []
    const seenSubtaskIds = new Set<string>()
    let subtaskIssue = false

    ;(value['subtasks'] as unknown[]).forEach((rawSubtask, subtaskIndex) => {
      if (!isRecord(rawSubtask)) {
        addIssue(state, 'subtasks', 'INVALID_VALUE', { subtaskIndex })
        subtaskIssue = true
        return
      }

      const subtaskId = rawSubtask['id']
      let subtaskIdOk = false
      if (typeof subtaskId !== 'string' || subtaskId.trim() === '') {
        addIssue(state, 'subtasks', 'REQUIRED', { subtaskIndex })
      } else if (seenSubtaskIds.has(subtaskId)) {
        addIssue(state, 'subtasks', 'DUPLICATE', { subtaskIndex })
      } else {
        subtaskIdOk = true
      }

      const subtaskTitle = rawSubtask['title']
      let subtaskTitleOk = false
      if (typeof subtaskTitle !== 'string' || subtaskTitle.trim() === '') {
        addIssue(state, 'subtasks', 'REQUIRED', { subtaskIndex })
      } else if (subtaskTitle !== subtaskTitle.trim()) {
        addIssue(state, 'subtasks', 'INVALID_VALUE', { subtaskIndex })
      } else if (subtaskTitle.length > SUBTASK_TITLE_LIMIT) {
        addIssue(state, 'subtasks', 'TOO_LONG', { subtaskIndex })
      } else {
        subtaskTitleOk = true
      }

      if (typeof rawSubtask['done'] !== 'boolean') {
        addIssue(state, 'subtasks', 'INVALID_VALUE', { subtaskIndex })
        subtaskIssue = true
        return
      }

      if (!subtaskIdOk || !subtaskTitleOk) {
        subtaskIssue = true
        return
      }

      seenSubtaskIds.add(subtaskId as string)
      collected.push({ id: subtaskId as string, title: subtaskTitle as string, done: rawSubtask['done'] })
    })

    if (value['subtasks'].length > MAX_SUBTASKS) {
      addIssue(state, 'subtasks', 'TOO_MANY')
      subtaskIssue = true
    }
    if (!subtaskIssue) subtasks = collected
  }

  if (
    state.invalid ||
    id === undefined ||
    title === undefined ||
    status === undefined ||
    priority === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    tags === undefined ||
    reminders === undefined ||
    subtasks === undefined
  ) {
    return undefined
  }

  return {
    id,
    title,
    status,
    priority,
    reminders,
    subtasks,
    tags,
    createdAt,
    updatedAt,
    ...(description !== undefined && { description }),
    ...(requester !== undefined && { requester }),
    ...(assignee !== undefined && { assignee }),
    ...(dueAt !== undefined && { dueAt }),
    ...(seriesId !== undefined && { seriesId }),
    ...(recurrence !== undefined && { recurrence }),
    ...(sourceUrl !== undefined && { sourceUrl }),
    ...(completedAt !== undefined && { completedAt }),
  }
}

/** Valida a coleção inteira; qualquer tarefa inválida ou `id` repetido recusa o arquivo todo. */
export function validateBackupTaskCollection(
  values: readonly unknown[],
  collector: BackupIssueCollector,
): Task[] | undefined {
  const tasks: Task[] = []
  const seenIds = new Map<string, number>()

  values.forEach((value, taskIndex) => {
    const task = validateBackupTask(value, taskIndex, collector)
    if (task === undefined) return

    const firstIndex = seenIds.get(task.id)
    if (firstIndex !== undefined) {
      collector.add({ taskIndex, field: 'id', code: 'DUPLICATE' })
      return
    }

    seenIds.set(task.id, taskIndex)
    tasks.push(task)
  })

  return collector.total === 0 ? tasks : undefined
}

/** Projeta uma tarefa local para o modelo permitido do backup; `undefined` quando não é exportável. */
export function projectTaskForBackup(
  value: unknown,
  collector: BackupIssueCollector,
): Task | undefined {
  return validateBackupTask(value, 0, collector)
}
