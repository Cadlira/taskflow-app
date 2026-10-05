import type { Task } from '../../domain/task.js'
import type { Revision } from '../storage/revisions.js'
import type { ConditionalRestoreResult, TaskStorageUnit, TrashEntryRef } from '../storage/unit-of-work.js'
import type { DeleteUndoFacts, UndoFacts, UndoReservationPort } from './undo-types.js'

// Casos de uso da lixeira e do desfazer executados DENTRO da unidade coordenada. Decide, valida e
// confirma sobre o estado atual; nada aqui é assíncrono ou atravessa IPC e o renderer nunca
// fornece Task/antes/plano — somente referências observadas e o token opaco emitido pelo main.

export type TrashMoveOutcome =
  | {
      status: 'MOVED'
      retained: boolean
      /** Identidade da nova entrada (existe mesmo quando o limite a descarta). */
      entry: TrashEntryRef
      /** Presente somente quando a entrada foi retida: renova a oferta de Desfazer. */
      undo?: DeleteUndoFacts
      /** Reserva do recibo, publicada pelo main apenas após commit/contexto válidos. */
      reserved?: { id: number; bytes: number }
      discardedTaskIds: string[]
    }
  | { status: 'NOT_FOUND' }
  | { status: 'CHANGED'; currentContentRevision: Revision }
  | { status: 'RESOURCE_LIMIT' }

export type TrashRestoreOutcome = ConditionalRestoreResult

export type TrashDeleteOutcome =
  | { status: 'DELETED' }
  | { status: 'NOT_IN_TRASH' }
  | { status: 'ENTRY_CHANGED' }

export type TrashEmptyOutcome =
  | { status: 'EMPTIED'; removedCount: number }
  | { status: 'CONFIRMATION_CHANGED' }

export type TrashMaintenanceOutcome = { status: 'MAINTAINED'; purgedCount: number }

export type UndoOutcome =
  | { status: 'RESTORED'; task: Task; contentRevision: Revision; editRevision: Revision }
  | { status: 'REVERTED'; task: Task; contentRevision: Revision; editRevision: Revision }
  | { status: 'NOT_IN_TRASH' }
  | { status: 'ENTRY_CHANGED' }
  | { status: 'ENTRY_EXPIRED' }
  | { status: 'ID_EXISTS' }
  | { status: 'SERIES_CONFLICT' }
  | { status: 'REMOVED' }
  | { status: 'CHANGED' }
  | { status: 'GENERATED_CHANGED' }

/** Move com política: confere a revisão de conteúdo observada e aplica retenção/limite/cap junto. */
export function moveTaskToTrashInUnit(
  unit: TaskStorageUnit,
  input: {
    taskId: string
    expectedContentRevision: Revision
    now: Date
    reservations?: UndoReservationPort
  },
): TrashMoveOutcome {
  if (input.taskId.length === 0) return { status: 'NOT_FOUND' }

  // Recibo DELETE usa referência pequena; a reserva antecede a primeira escrita.
  const provisional: DeleteUndoFacts = {
    kind: 'DELETE',
    entry: { taskId: input.taskId, contentRevision: 0n, deletedAt: '' },
  }
  const reserved = input.reservations?.reserve(provisional)
  if (input.reservations !== undefined && reserved === undefined) return { status: 'RESOURCE_LIMIT' }

  const outcome = unit.moveToTrashConditionally(input.taskId, input.expectedContentRevision, input.now)
  switch (outcome.status) {
    case 'MOVED':
      if (!outcome.retained) {
        if (reserved !== undefined) input.reservations?.release(reserved)
        return {
          status: 'MOVED',
          retained: false,
          entry: outcome.entry,
          discardedTaskIds: outcome.discardedTaskIds,
        }
      }
      return {
        status: 'MOVED',
        retained: true,
        entry: outcome.entry,
        discardedTaskIds: outcome.discardedTaskIds,
        undo: { kind: 'DELETE', entry: outcome.entry },
        ...(reserved !== undefined && { reserved }),
      }
    case 'NOT_FOUND':
      if (reserved !== undefined) input.reservations?.release(reserved)
      return { status: 'NOT_FOUND' }
    case 'CHANGED':
      if (reserved !== undefined) input.reservations?.release(reserved)
      return { status: 'CHANGED', currentContentRevision: outcome.currentContentRevision }
  }
}

/** Restore normal (sem undo): confere entrada/idade/ID/portadora e não gera ocorrência. */
export function restoreTrashItemInUnit(
  unit: TaskStorageUnit,
  input: { entry: TrashEntryRef; now: Date },
): TrashRestoreOutcome {
  return unit.restoreTrashItemConditionally(input.entry, input.now)
}

/** Exclusão definitiva: somente a entrada observada; idade não é reexigida. */
export function deleteTrashItemInUnit(
  unit: TaskStorageUnit,
  input: { entry: TrashEntryRef },
): TrashDeleteOutcome {
  const outcome = unit.deleteTrashItemConditionally(input.entry)
  return outcome.status === 'DELETED' ? { status: 'DELETED' } : outcome
}

/** Esvaziamento condicionado à composição completa capturada pelo main. */
export function emptyTrashInUnit(
  unit: TaskStorageUnit,
  input: { captured: readonly TrashEntryRef[] },
): TrashEmptyOutcome {
  const outcome = unit.emptyTrashConditionally(input.captured)
  return outcome.status === 'EMPTIED'
    ? { status: 'EMPTIED', removedCount: outcome.removedCount }
    : { status: 'CONFIRMATION_CHANGED' }
}

/** Manutenção explícita por idade (startup/entrada): leituras continuam puras. */
export function prepareTrashViewInUnit(
  unit: TaskStorageUnit,
  input: { now: Date },
): TrashMaintenanceOutcome {
  return { status: 'MAINTAINED', purgedCount: unit.purgeExpiredTrash(input.now) }
}

/**
 * Desfaz a última ação própria usando o recibo interno: DELETE reusa o restore condicionado
 * (idade/entrada/ID/portadora/liquidação) e REVERT confere conteúdo completo de alvo/gerada.
 */
export function undoLastTaskActionInUnit(
  unit: TaskStorageUnit,
  input: { receipt: UndoFacts; now: Date },
): UndoOutcome {
  const { receipt } = input

  if (receipt.kind === 'DELETE') {
    const restored = unit.restoreTrashItemConditionally(receipt.entry, input.now)
    switch (restored.status) {
      case 'RESTORED':
        return {
          status: 'RESTORED',
          task: restored.task,
          contentRevision: restored.contentRevision,
          editRevision: restored.editRevision,
        }
      case 'NOT_IN_TRASH':
      case 'ENTRY_CHANGED':
      case 'ENTRY_EXPIRED':
      case 'ID_EXISTS':
      case 'SERIES_CONFLICT':
        return { status: restored.status }
    }
  }

  const reverted = unit.revertConditionally(
    {
      target: receipt.target,
      ...(receipt.generated !== undefined && { generated: receipt.generated }),
    },
    () => receipt.beforeImage,
    input.now,
  )
  switch (reverted.status) {
    case 'REVERTED':
      return {
        status: 'REVERTED',
        task: reverted.task,
        contentRevision: reverted.contentRevision,
        editRevision: reverted.editRevision,
      }
    case 'REMOVED':
    case 'CHANGED':
    case 'GENERATED_CHANGED':
    case 'SERIES_CONFLICT':
      return { status: reverted.status }
  }
}
