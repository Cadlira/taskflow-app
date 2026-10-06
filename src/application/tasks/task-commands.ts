import {
  buildCreateTask,
  planTaskUpdate,
  type CreateTaskDraft,
  type EditTaskPatch,
  type TaskFieldErrors,
} from '../../domain/task-draft.js'
import { createIdentityAllocator } from '../../domain/identity.js'
import {
  buildNextOccurrence,
  isSameRecurrence,
  resolveNextScheduledAt,
} from '../../domain/task-recurrence.js'
import type { IdGenerator, Task, TaskStatus } from '../../domain/task.js'
import { applyStatus } from '../../domain/task-status.js'
import { settleElapsedReminders } from '../../domain/task-reminders.js'
import type { Revision } from '../storage/revisions.js'
import type { TaskStorageUnit } from '../storage/unit-of-work.js'
import type { ReservedUndo, RevertUndoFacts, UndoReservationPort } from './undo-types.js'

// Casos de uso executados DENTRO da unidade coordenada: leem, decidem, validam e confirmam sobre
// o estado atual. Nada aqui é assíncrono nem toca shell/rede/IPC. Relógio, identidades, âncora,
// série e conflitos são do proprietário (main); o renderer nunca fornece esses campos.
//
// Classificação de revisões (D4): campos/status/regra/estrutura de subtarefas e fechamento/geração
// atualizam conteúdo **e** edição; `setSubtaskDone` conserva a edição (primitiva tipada). Recusa,
// no-op e rollback não alocam revisão. Mudanças efetivas de edição/status/fechamento devolvem
// fatos internos de undo (before-image relida), nunca Task/plano para o renderer.

export const CREATE_ID_ATTEMPTS = 3

/** Escolha explícita ao cancelar uma ocorrência que carrega a regra da série. */
export type RecurrenceCancellation = 'SKIP' | 'END'

export type CreateTaskOutcome =
  | { status: 'CREATED'; taskId: string; contentRevision: Revision; editRevision: Revision }
  | { status: 'VALIDATION_FAILED'; fields: TaskFieldErrors }
  | { status: 'IDENTITY_CONFLICT' }

export type MutationTaskOutcome =
  | {
      status: 'UPDATED'
      contentRevision: Revision
      editRevision: Revision
      undo: RevertUndoFacts
      /** Reserva já contabilizada; o main publica o recibo somente após commit/contexto válidos. */
      reserved?: ReservedUndo
    }
  | { status: 'UNCHANGED'; contentRevision: Revision; editRevision: Revision }
  | { status: 'VALIDATION_FAILED'; fields: TaskFieldErrors }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT'; currentContentRevision: Revision; currentEditRevision: Revision }
  | { status: 'RECURRENCE_CHOICE_REQUIRED' }
  | { status: 'RECURRENCE_OUT_OF_RANGE' }
  | { status: 'RESOURCE_LIMIT' }
  | { status: 'SERIES_CONFLICT' }
  | { status: 'IDENTITY_CONFLICT' }
  | { status: 'INVALID_REQUEST' }
  | { status: 'STALE_CONTEXT' }

export type SubtaskDoneOutcome =
  | { status: 'UPDATED'; contentRevision: Revision; editRevision: Revision }
  | { status: 'UNCHANGED'; contentRevision: Revision; editRevision: Revision }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT'; currentContentRevision: Revision; currentEditRevision: Revision }
  | { status: 'SUBTASK_NOT_FOUND' }
  | { status: 'STALE_CONTEXT' }

export interface CreateTaskInput {
  draft: CreateTaskDraft
  now: Date
  generateId: IdGenerator
  attempts?: number
}

export interface UpdateTaskInput {
  taskId: string
  expectedEditRevision: Revision
  patch: EditTaskPatch
  cancellation?: RecurrenceCancellation
  now: Date
  generateId: IdGenerator
  /** Reserva do recibo antes da escrita; ausente em contextos que não oferecem desfazer. */
  reservations?: UndoReservationPort
}

export interface ChangeStatusInput {
  taskId: string
  expectedEditRevision: Revision
  status: TaskStatus
  cancellation?: RecurrenceCancellation
  now: Date
  generateId: IdGenerator
  reservations?: UndoReservationPort
}

export interface SetSubtaskDoneInput {
  taskId: string
  expectedEditRevision: Revision
  subtaskId: string
  done: boolean
  now: Date
}

/** Percorre tarefas e lixeira com leitura leve: outra portadora da mesma série conflita. */
function hasOtherCarrier(unit: TaskStorageUnit, seriesId: string, ignoreTaskId: string): boolean {
  for (const summary of unit.iterateCarrierSummaries('tasks', undefined)) {
    if (summary.id === ignoreTaskId) continue
    if (summary.hasRecurrence && summary.seriesId === seriesId) return true
  }
  for (const summary of unit.iterateCarrierSummaries('trash', undefined)) {
    if (summary.hasRecurrence && summary.seriesId === seriesId) return true
  }
  return false
}

/** Qualquer `seriesId` conhecido (com ou sem regra) bloqueia a reutilização por uma série nova. */
function isSeriesTaken(unit: TaskStorageUnit, id: string): boolean {
  for (const collection of ['tasks', 'trash'] as const) {
    for (const summary of unit.iterateCarrierSummaries(collection, undefined)) {
      if (summary.seriesId === id) return true
    }
  }
  return false
}

function isIdOccupied(unit: TaskStorageUnit, id: string): boolean {
  return unit.getTask(id) !== undefined || unit.getTrashItem(id) !== undefined
}

/**
 * Cria a tarefa com identidade, série e relógio do proprietário. Uma colisão de identidade em
 * tarefas ou na lixeira nunca sobrescreve o item existente: outra identidade é tentada até o
 * limite e a falha final é segura e sem commit. Criação terminal com regra persiste sem gerar.
 */
export function createTaskInUnit(unit: TaskStorageUnit, input: CreateTaskInput): CreateTaskOutcome {
  const attempts = input.attempts ?? CREATE_ID_ATTEMPTS

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const id = input.generateId()
    if (id.length === 0 || isIdOccupied(unit, id)) continue

    // Série nova alocada antes do plano, contra todas as séries conhecidas (tarefas/lixeira).
    let seriesId: string | undefined
    if (input.draft.recurrence !== undefined) {
      const seriesIdentity = createIdentityAllocator((candidate) => isSeriesTaken(unit, candidate))
      seriesId = seriesIdentity.allocate(input.generateId)
      if (seriesId === undefined) return { status: 'IDENTITY_CONFLICT' }
    }

    const plan = buildCreateTask(input.draft, {
      now: input.now,
      id,
      ...(seriesId !== undefined && { seriesId }),
      generateId: input.generateId,
    })
    if (!plan.ok) {
      return plan.kind === 'validation' ? { status: 'VALIDATION_FAILED', fields: plan.fields } : { status: 'IDENTITY_CONFLICT' }
    }

    const saved = unit.saveTask(plan.task)
    if (saved !== 'CREATED') continue

    const stored = unit.getTask(id)
    if (stored === undefined) continue
    return {
      status: 'CREATED',
      taskId: id,
      contentRevision: stored.contentRevision,
      editRevision: stored.editRevision,
    }
  }

  return { status: 'IDENTITY_CONFLICT' }
}

type ClosurePlan =
  | { status: 'CLOSE'; closed: Task; generated?: Task }
  | { status: 'RECURRENCE_CHOICE_REQUIRED' }
  | { status: 'RECURRENCE_OUT_OF_RANGE' }
  | { status: 'RESOURCE_LIMIT' }
  | { status: 'SERIES_CONFLICT' }
  | { status: 'IDENTITY_CONFLICT' }
  | { status: 'INVALID_REQUEST' }

/**
 * Planeja o fechamento de uma ocorrência que carrega a regra: exige escolha em CANCELLED,
 * confere portadora única na série, calcula a próxima (fim natural não gera) e valida todas as
 * identidades antes de qualquer escrita. A antiga perde a regra; a nova nasce TODO com cópia.
 */
function planClosure(
  unit: TaskStorageUnit,
  terminal: Task,
  cancellation: RecurrenceCancellation | undefined,
  input: { now: Date; generateId: IdGenerator },
): ClosurePlan {
  const recurrence = terminal.recurrence
  if (recurrence === undefined) return { status: 'INVALID_REQUEST' }

  if (terminal.status === 'CANCELLED' && cancellation === undefined) {
    return { status: 'RECURRENCE_CHOICE_REQUIRED' }
  }

  if (cancellation !== undefined && terminal.status !== 'CANCELLED') {
    return { status: 'INVALID_REQUEST' }
  }

  const seriesId = terminal.seriesId
  if (seriesId === undefined || seriesId === '') return { status: 'IDENTITY_CONFLICT' }

  if (hasOtherCarrier(unit, seriesId, terminal.id)) return { status: 'SERIES_CONFLICT' }

  let generated: Task | undefined

  if (cancellation !== 'END') {
    if (terminal.dueAt === undefined) return { status: 'INVALID_REQUEST' }
    const scheduled = resolveNextScheduledAt(recurrence, terminal.dueAt, input.now)

    if (scheduled.status === 'OUT_OF_RANGE') return { status: 'RECURRENCE_OUT_OF_RANGE' }
    if (scheduled.status === 'RESOURCE_LIMIT') return { status: 'RESOURCE_LIMIT' }

    if (scheduled.status === 'NEXT') {
      const built = buildNextOccurrence(terminal, recurrence, scheduled.scheduledAt, {
        now: input.now,
        generateId: input.generateId,
        isIdTaken: (candidate) => isIdOccupied(unit, candidate),
      })
      if (!built.ok) return { status: 'IDENTITY_CONFLICT' }
      generated = settleElapsedReminders(built.task, input.now)
    }
  }

  const closed: Task = settleElapsedReminders({ ...terminal }, input.now)
  delete closed.recurrence

  return generated === undefined ? { status: 'CLOSE', closed } : { status: 'CLOSE', closed, generated }
}

function closureFailure(plan: Exclude<ClosurePlan, { status: 'CLOSE' }>): MutationTaskOutcome {
  return plan
}

function writeClosure(
  unit: TaskStorageUnit,
  plan: Extract<ClosurePlan, { status: 'CLOSE' }>,
  beforeImage: Task,
  reservations: UndoReservationPort | undefined,
): MutationTaskOutcome {
  // Reserva depois de determinar que o fechamento é efetivo e antes da primeira escrita.
  const provisional: RevertUndoFacts = {
    kind: 'REVERT',
    target: { id: plan.closed.id, expectedContentRevision: 0n },
    beforeImage,
    ...(plan.generated !== undefined && { generated: { id: plan.generated.id, expectedContentRevision: 0n } }),
  }
  const reserved = reservations?.reserve(provisional)
  if (reservations !== undefined && reserved === undefined) return { status: 'RESOURCE_LIMIT' }

  if (plan.generated === undefined) {
    unit.saveTask(plan.closed)
  } else {
    unit.saveTasks([plan.closed, plan.generated])
  }

  const stored = unit.getTask(plan.closed.id)
  if (stored === undefined) {
    if (reserved !== undefined) reservations?.release(reserved)
    return { status: 'IDENTITY_CONFLICT' }
  }

  let generated: RevertUndoFacts['generated']
  if (plan.generated !== undefined) {
    const generatedStored = unit.getTask(plan.generated.id)
    if (generatedStored === undefined) {
      if (reserved !== undefined) reservations?.release(reserved)
      return { status: 'IDENTITY_CONFLICT' }
    }
    generated = { id: plan.generated.id, expectedContentRevision: generatedStored.contentRevision }
  }

  return {
    status: 'UPDATED',
    contentRevision: stored.contentRevision,
    editRevision: stored.editRevision,
    undo: {
      kind: 'REVERT',
      target: { id: plan.closed.id, expectedContentRevision: stored.contentRevision },
      beforeImage,
      ...(generated !== undefined && { generated }),
    },
    ...(reserved !== undefined && { reserved }),
  }
}

/**
 * Edita por patch condicional à revisão de **edição**. Existência, revisão, restrições e campos
 * alterados são verificados na mesma unidade; no-op não grava nem incrementa revisão. Uma edição
 * efetiva que resulte em terminal com regra segue o fechamento (DONE/SKIP geram no máximo uma
 * próxima TODO; END não gera). Mudanças efetivas de prazo/status/com coleção liquidam pendentes
 * vencidas (`<= now`, sem graça) e reconciliam a geração na mesma unidade; edições independentes
 * continuam permitidas.
 */
export function updateTaskInUnit(unit: TaskStorageUnit, input: UpdateTaskInput): MutationTaskOutcome {
  const stored = unit.getTask(input.taskId)
  if (stored === undefined) return { status: 'NOT_FOUND' }
  if (stored.editRevision !== input.expectedEditRevision) {
    return {
      status: 'CONFLICT',
      currentContentRevision: stored.contentRevision,
      currentEditRevision: stored.editRevision,
    }
  }

  const patchAddsRule =
    'recurrence' in input.patch && input.patch.recurrence !== null && input.patch.recurrence !== undefined
  let newSeriesId: string | undefined

  if (patchAddsRule && stored.task.recurrence === undefined && stored.task.seriesId === undefined) {
    const seriesIdentity = createIdentityAllocator((candidate) => isSeriesTaken(unit, candidate))
    newSeriesId = seriesIdentity.allocate(input.generateId)
    if (newSeriesId === undefined) return { status: 'IDENTITY_CONFLICT' }
  }

  const plan = planTaskUpdate(stored.task, input.patch, {
    now: input.now,
    generateId: input.generateId,
    ...(newSeriesId !== undefined && { newSeriesId }),
  })

  if (!plan.ok) {
    return plan.kind === 'validation' ? { status: 'VALIDATION_FAILED', fields: plan.fields } : { status: 'IDENTITY_CONFLICT' }
  }

  const next = plan.next
  if (next === undefined) {
    return { status: 'UNCHANGED', contentRevision: stored.contentRevision, editRevision: stored.editRevision }
  }

  const terminal = next.status === 'DONE' || next.status === 'CANCELLED'
  const closes = terminal && next.recurrence !== undefined
  const dueChanged = next.dueAt !== stored.task.dueAt

  if (closes) {
    const closure = planClosure(unit, next, input.cancellation, { now: input.now, generateId: input.generateId })
    if (closure.status !== 'CLOSE') return closureFailure(closure)
    return writeClosure(unit, closure, stored.task, input.reservations)
  }

  if (input.cancellation !== undefined) return { status: 'INVALID_REQUEST' }

  // Mudança de regra/prazo numa portadora exige série única, mesmo sem fechamento.
  const ruleDiffers = !isSameRecurrence(next.recurrence, stored.task.recurrence)
  if (next.recurrence !== undefined && (ruleDiffers || dueChanged)) {
    const seriesId = next.seriesId
    if (seriesId !== undefined && hasOtherCarrier(unit, seriesId, stored.task.id)) return { status: 'SERIES_CONFLICT' }
  }

  // Reserva depois de determinar que a edição é efetiva e antes da primeira escrita.
  const provisional: RevertUndoFacts = {
    kind: 'REVERT',
    target: { id: input.taskId, expectedContentRevision: 0n },
    beforeImage: stored.task,
  }
  const reserved = input.reservations?.reserve(provisional)
  if (input.reservations !== undefined && reserved === undefined) return { status: 'RESOURCE_LIMIT' }

  const outcome = unit.updateTaskConditionally(input.taskId, input.expectedEditRevision, () => next)
  switch (outcome.status) {
    case 'UPDATED':
      return {
        status: 'UPDATED',
        contentRevision: outcome.contentRevision,
        editRevision: outcome.editRevision,
        undo: {
          ...provisional,
          target: { id: input.taskId, expectedContentRevision: outcome.contentRevision },
        },
        ...(reserved !== undefined && { reserved }),
      }
    case 'UNCHANGED':
      if (reserved !== undefined) input.reservations?.release(reserved)
      return { status: 'UNCHANGED', contentRevision: outcome.contentRevision, editRevision: outcome.editRevision }
    case 'NOT_FOUND':
      if (reserved !== undefined) input.reservations?.release(reserved)
      return { status: 'NOT_FOUND' }
    case 'CONFLICT':
      if (reserved !== undefined) input.reservations?.release(reserved)
      return {
        status: 'CONFLICT',
        currentContentRevision: outcome.currentContentRevision,
        currentEditRevision: outcome.currentEditRevision,
      }
  }
}

/**
 * Muda o status com as mesmas barreiras. Status já atual é no-op quando a revisão de edição é
 * válida; CANCELLED de portadora exige SKIP/END; DONE/SKIP fecham/geram e liquidam pendentes
 * vencidas (`<= now`, sem graça) preservando regra/dados/marcadores.
 */
export function changeTaskStatusInUnit(unit: TaskStorageUnit, input: ChangeStatusInput): MutationTaskOutcome {
  const stored = unit.getTask(input.taskId)
  if (stored === undefined) return { status: 'NOT_FOUND' }
  if (stored.editRevision !== input.expectedEditRevision) {
    return {
      status: 'CONFLICT',
      currentContentRevision: stored.contentRevision,
      currentEditRevision: stored.editRevision,
    }
  }
  if (stored.task.status === input.status) {
    return { status: 'UNCHANGED', contentRevision: stored.contentRevision, editRevision: stored.editRevision }
  }
  const changed = settleElapsedReminders(applyStatus(stored.task, input.status, input.now), input.now)
  const terminal = input.status === 'DONE' || input.status === 'CANCELLED'

  if (stored.task.recurrence !== undefined && terminal) {
    const closure = planClosure(unit, changed, input.cancellation, { now: input.now, generateId: input.generateId })
    if (closure.status !== 'CLOSE') return closureFailure(closure)
    return writeClosure(unit, closure, stored.task, input.reservations)
  }

  if (input.cancellation !== undefined) return { status: 'INVALID_REQUEST' }

  // Reserva depois de determinar que a mudança de status é efetiva e antes da escrita.
  const provisional: RevertUndoFacts = {
    kind: 'REVERT',
    target: { id: input.taskId, expectedContentRevision: 0n },
    beforeImage: stored.task,
  }
  const reserved = input.reservations?.reserve(provisional)
  if (input.reservations !== undefined && reserved === undefined) return { status: 'RESOURCE_LIMIT' }

  const outcome = unit.updateTaskConditionally(input.taskId, input.expectedEditRevision, () => changed)
  switch (outcome.status) {
    case 'UPDATED':
      return {
        status: 'UPDATED',
        contentRevision: outcome.contentRevision,
        editRevision: outcome.editRevision,
        undo: {
          ...provisional,
          target: { id: input.taskId, expectedContentRevision: outcome.contentRevision },
        },
        ...(reserved !== undefined && { reserved }),
      }
    case 'UNCHANGED':
      if (reserved !== undefined) input.reservations?.release(reserved)
      return { status: 'UNCHANGED', contentRevision: outcome.contentRevision, editRevision: outcome.editRevision }
    case 'NOT_FOUND':
      if (reserved !== undefined) input.reservations?.release(reserved)
      return { status: 'NOT_FOUND' }
    case 'CONFLICT':
      if (reserved !== undefined) input.reservations?.release(reserved)
      return {
        status: 'CONFLICT',
        currentContentRevision: outcome.currentContentRevision,
        currentEditRevision: outcome.currentEditRevision,
      }
  }
}

/**
 * Marca/desmarca por intenção um item da lista atual: verifica a revisão de edição, recusa base
 * estrutural antiga e nunca fecha/gera, reconcilia lembretes ou altera status.
 */
export function setSubtaskDoneInUnit(unit: TaskStorageUnit, input: SetSubtaskDoneInput): SubtaskDoneOutcome {
  const outcome = unit.markSubtaskDone(
    input.taskId,
    input.expectedEditRevision,
    input.subtaskId,
    input.done,
    input.now,
  )

  switch (outcome.status) {
    case 'UPDATED':
    case 'UNCHANGED':
      return { status: outcome.status, contentRevision: outcome.contentRevision, editRevision: outcome.editRevision }
    case 'NOT_FOUND':
      return { status: 'NOT_FOUND' }
    case 'SUBTASK_NOT_FOUND':
      return { status: 'SUBTASK_NOT_FOUND' }
    case 'CONFLICT':
      return {
        status: 'CONFLICT',
        currentContentRevision: outcome.currentContentRevision,
        currentEditRevision: outcome.currentEditRevision,
      }
  }
}
