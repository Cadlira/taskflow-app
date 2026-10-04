import {
  createBasicTask,
  planBasicPatch,
  validateBasicDraft,
  type BasicFieldErrors,
  type BasicTaskDraft,
  type BasicTaskPatch,
} from '../../domain/task-draft.js'
import type { Task } from '../../domain/task.js'
import { applyStatus } from '../../domain/task-status.js'
import type { Revision } from '../storage/revisions.js'
import type { TaskStorageUnit } from '../storage/unit-of-work.js'

// Casos de uso básicos executados DENTRO da unidade coordenada: leem, decidem, validam e
// confirmam sobre o estado atual. Nada aqui é assíncrono nem toca shell/rede/IPC. Os campos
// avançados (recurrence, seriesId, subtasks, reminders, processedFor) nunca são entradas e são
// conservados porque o patch é aplicado sobre a tarefa atual relida na unidade.

export const CREATE_ID_ATTEMPTS = 3

export type CreateTaskOutcome =
  | { status: 'CREATED'; taskId: string; contentRevision: Revision }
  | { status: 'VALIDATION_FAILED'; fields: BasicFieldErrors }
  | { status: 'RESOURCE_LIMIT' }

export type MutationTaskOutcome =
  | { status: 'UPDATED'; contentRevision: Revision }
  | { status: 'UNCHANGED'; contentRevision: Revision }
  | { status: 'VALIDATION_FAILED'; fields: BasicFieldErrors }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT'; currentRevision: Revision }
  | { status: 'ADVANCED_TASK_RESTRICTED' }

export interface CreateTaskInput {
  draft: BasicTaskDraft
  now: Date
  generateId: () => string
  attempts?: number
}

export interface UpdateTaskInput {
  taskId: string
  expectedContentRevision: Revision
  patch: BasicTaskPatch
  now: Date
}

export interface ChangeStatusInput {
  taskId: string
  expectedContentRevision: Revision
  status: Task['status']
  now: Date
}

/**
 * Cria a tarefa com identidade e relógio do proprietário. Uma colisão de identidade em tarefas
 * ou na lixeira nunca sobrescreve o item existente: outra identidade é tentada até o limite e a
 * falha final é segura e sem commit.
 */
export function createTaskInUnit(unit: TaskStorageUnit, input: CreateTaskInput): CreateTaskOutcome {
  const validation = validateBasicDraft(input.draft)
  if (!validation.ok) return { status: 'VALIDATION_FAILED', fields: validation.fields }

  const attempts = input.attempts ?? CREATE_ID_ATTEMPTS
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const id = input.generateId()
    if (id.length === 0) continue
    if (unit.getTask(id) !== undefined || unit.getTrashItem(id) !== undefined) continue

    const task = createBasicTask(validation.value, { now: input.now, id })
    const saved = unit.saveTask(task)
    if (saved !== 'CREATED') continue

    const stored = unit.getTask(id)
    if (stored === undefined) continue
    return { status: 'CREATED', taskId: id, contentRevision: stored.contentRevision }
  }

  return { status: 'RESOURCE_LIMIT' }
}

/** Mudança efetiva de prazo/status que a origem liquidaria/reconciliaria com lembretes. */
function changesDueAtOrStatus(task: Task, patch: BasicTaskPatch): boolean {
  if (task.reminders.length === 0) return false

  if ('dueAt' in patch && patch.dueAt !== task.dueAt) return true
  return 'status' in patch && patch.status !== undefined && patch.status !== task.status
}

/**
 * Edita por patch condicional à revisão de conteúdo. Existência, revisão, restrições e campos
 * alterados são verificados na mesma unidade; no-op não grava nem incrementa revisão. A regra de
 * recorrência presente bloqueia qualquer mutação até a integração da TFA-005.
 */
export function updateTaskInUnit(unit: TaskStorageUnit, input: UpdateTaskInput): MutationTaskOutcome {
  const stored = unit.getTask(input.taskId)
  if (stored === undefined) return { status: 'NOT_FOUND' }
  if (stored.contentRevision !== input.expectedContentRevision) {
    return { status: 'CONFLICT', currentRevision: stored.contentRevision }
  }
  if (stored.task.recurrence !== undefined) return { status: 'ADVANCED_TASK_RESTRICTED' }
  if (changesDueAtOrStatus(stored.task, input.patch)) return { status: 'ADVANCED_TASK_RESTRICTED' }

  const plan = planBasicPatch(stored.task, input.patch, input.now)
  if (!plan.ok) return { status: 'VALIDATION_FAILED', fields: plan.fields }
  if (plan.next === undefined) return { status: 'UNCHANGED', contentRevision: stored.contentRevision }

  const outcome = unit.updateTaskConditionally(input.taskId, input.expectedContentRevision, () => plan.next)
  switch (outcome.status) {
    case 'UPDATED':
      return { status: 'UPDATED', contentRevision: outcome.contentRevision }
    case 'UNCHANGED':
      return { status: 'UNCHANGED', contentRevision: outcome.contentRevision }
    case 'NOT_FOUND':
      return { status: 'NOT_FOUND' }
    case 'CONFLICT':
      return { status: 'CONFLICT', currentRevision: outcome.currentRevision }
  }
}

/**
 * Muda o status simples com as mesmas barreiras. Status já atual é no-op quando a revisão
 * esperada é válida; reabrir rápido vai a TODO; subtarefas existentes não interferem.
 */
export function changeTaskStatusInUnit(unit: TaskStorageUnit, input: ChangeStatusInput): MutationTaskOutcome {
  const stored = unit.getTask(input.taskId)
  if (stored === undefined) return { status: 'NOT_FOUND' }
  if (stored.contentRevision !== input.expectedContentRevision) {
    return { status: 'CONFLICT', currentRevision: stored.contentRevision }
  }
  if (stored.task.recurrence !== undefined) return { status: 'ADVANCED_TASK_RESTRICTED' }
  if (stored.task.status === input.status) return { status: 'UNCHANGED', contentRevision: stored.contentRevision }
  if (stored.task.reminders.length > 0) return { status: 'ADVANCED_TASK_RESTRICTED' }

  const next = applyStatus(stored.task, input.status, input.now)
  const outcome = unit.updateTaskConditionally(input.taskId, input.expectedContentRevision, () => next)
  switch (outcome.status) {
    case 'UPDATED':
      return { status: 'UPDATED', contentRevision: outcome.contentRevision }
    case 'UNCHANGED':
      return { status: 'UNCHANGED', contentRevision: outcome.contentRevision }
    case 'NOT_FOUND':
      return { status: 'NOT_FOUND' }
    case 'CONFLICT':
      return { status: 'CONFLICT', currentRevision: outcome.currentRevision }
  }
}
