// Comparação completa de coleções de backup por conjunto de IDs. A ordem das linhas SQL ou do
// arquivo não importa para a coleção; a ordem interna das listas (tags, reminders, weekdays,
// subtasks) importa. Não reutiliza o comparador incompleto da origem (que omitia
// seriesId/recurrence/subtasks). Metadata de armazenamento é conferida separadamente.
import type { Task } from '../../domain/task.js'
import { isSameJsonValue } from '../storage/stored-task-codec.js'

export interface BackupCollectionComparison {
  ok: boolean
  expectedCount: number
  actualCount: number
  missing: string[]
  extra: string[]
  changed: string[]
}

const REPORT_ID_LIMIT = 5

/**
 * Compara duas coleções de tarefas já validadas/projetadas. `ok` exige conjuntos exatos de IDs,
 * nenhuma duplicata em nenhum lado e igualdade estrutural completa de cada tarefa.
 */
export function compareBackupTaskCollections(
  expected: readonly Task[],
  actual: readonly Task[],
): BackupCollectionComparison {
  const expectedById = new Map<string, Task>()
  const actualById = new Map<string, Task>()
  const result: BackupCollectionComparison = {
    ok: true,
    expectedCount: expected.length,
    actualCount: actual.length,
    missing: [],
    extra: [],
    changed: [],
  }

  for (const task of expected) {
    if (expectedById.has(task.id)) result.ok = false
    else expectedById.set(task.id, task)
  }
  for (const task of actual) {
    if (actualById.has(task.id)) result.ok = false
    else actualById.set(task.id, task)
  }

  for (const [id, expectedTask] of expectedById) {
    const actualTask = actualById.get(id)
    if (actualTask === undefined) {
      result.ok = false
      if (result.missing.length < REPORT_ID_LIMIT) result.missing.push(id)
      continue
    }
    if (!isSameJsonValue(projectedTask(expectedTask), projectedTask(actualTask))) {
      result.ok = false
      if (result.changed.length < REPORT_ID_LIMIT) result.changed.push(id)
    }
  }

  for (const id of actualById.keys()) {
    if (expectedById.has(id)) continue
    result.ok = false
    if (result.extra.length < REPORT_ID_LIMIT) result.extra.push(id)
  }

  if (result.expectedCount !== result.actualCount) result.ok = false
  return result
}

/**
 * Projeção estrutural completa dos campos conhecidos, na mesma forma do JSON gravado: cada campo
 * básico, todos os parâmetros da regra (inclusive anchorAt/until), cada lembrete (id/tipo/offset
 * ou at/processedFor) e cada subtarefa (id/title/done), preservando a ordem das listas.
 */
export function projectedTask(task: Task): Record<string, unknown> {
  const projected: Record<string, unknown> = {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    reminders: task.reminders.map((reminder) =>
      reminder.type === 'OFFSET'
        ? {
            id: reminder.id,
            type: 'OFFSET',
            offsetMinutes: reminder.offsetMinutes,
            ...(reminder.processedFor !== undefined && { processedFor: reminder.processedFor }),
          }
        : {
            id: reminder.id,
            type: 'AT',
            at: reminder.at,
            ...(reminder.processedFor !== undefined && { processedFor: reminder.processedFor }),
          },
    ),
    subtasks: task.subtasks.map((subtask) => ({ id: subtask.id, title: subtask.title, done: subtask.done })),
    tags: [...task.tags],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }

  if (task.description !== undefined) projected['description'] = task.description
  if (task.requester !== undefined) projected['requester'] = task.requester
  if (task.assignee !== undefined) projected['assignee'] = task.assignee
  if (task.dueAt !== undefined) projected['dueAt'] = task.dueAt
  if (task.seriesId !== undefined) projected['seriesId'] = task.seriesId
  if (task.recurrence !== undefined) {
    projected['recurrence'] = {
      frequency: task.recurrence.frequency,
      ...(task.recurrence.anchorAt !== undefined && { anchorAt: task.recurrence.anchorAt }),
      ...(task.recurrence.until !== undefined && { until: task.recurrence.until }),
      ...(task.recurrence.frequency === 'DAILY' && { intervalDays: task.recurrence.intervalDays }),
      ...(task.recurrence.frequency === 'WEEKLY' && { weekdays: [...task.recurrence.weekdays] }),
      ...(task.recurrence.frequency === 'MONTHLY' && { dayOfMonth: task.recurrence.dayOfMonth }),
    }
  }
  if (task.sourceUrl !== undefined) projected['sourceUrl'] = task.sourceUrl
  if (task.completedAt !== undefined) projected['completedAt'] = task.completedAt

  return projected
}
