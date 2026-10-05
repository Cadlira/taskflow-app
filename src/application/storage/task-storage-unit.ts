import type { Task } from '../../domain/task.js'
import { claimReminderOccurrence, preserveProcessedMarkers, settleElapsedReminders } from '../../domain/task-reminders.js'
import { setSubtaskDone } from '../../domain/task-subtasks.js'
import {
  isTrashExpired,
  planTrashInsertion,
  sameTrashComposition,
  sameTrashEntryKey,
} from '../../domain/task-trash.js'
import { isRevision, type Revision } from './revisions.js'
import {
  decodeTaskCarrierSummary,
  decodeTaskPayload,
  encodeTaskPayload,
  encodeTaskPayloads,
  isSameJsonValue,
  isStoredDeletedAt,
  type EncodedTaskPayload,
} from './stored-task-codec.js'
import { StorageFailure, storageFailureReasonOf } from './task-storage-error.js'
import type {
  CarrierSummary,
  ConditionalEmptyTrashResult,
  ConditionalMoveToTrashResult,
  ConditionalPermanentDeleteResult,
  ConditionalRestoreResult,
  ConditionalRevertResult,
  ConditionalUpdateResult,
  MarkSubtaskDoneResult,
  ReminderOccurrenceClaim,
  ReplaceAllResult,
  RevertPreconditions,
  SaveOutcome,
  StorageRowPort,
  StoredCollection,
  StoredRow,
  StoredTask,
  StoredTrashItem,
  TaskStorageUnit,
  TrashEntryRef,
  TrashRestoreResult,
} from './unit-of-work.js'

export interface ActiveTaskStorageUnit {
  unit: TaskStorageUnit
  /** Encerra a validade das portas; chamadas posteriores falham com `INVALID_UNIT`. */
  expire(): void
}

/** Revisão de edição válida por linha: inteiro >= 1 e nunca acima da revisão de conteúdo. */
function decodeStoredEditRevision(row: StoredRow, contentRevision: Revision): Revision {
  if (!isRevision(row.editRevision) || row.editRevision < 1n || row.editRevision > contentRevision) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }
  return row.editRevision
}

function decodeStoredContentRevision(row: StoredRow): Revision {
  if (!isRevision(row.contentRevision) || row.contentRevision < 1n) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }
  return row.contentRevision
}

function decodeTaskRow(row: StoredRow): StoredTask {
  const contentRevision = decodeStoredContentRevision(row)
  return {
    task: decodeTaskPayload(row.payloadVersion, row.payloadJson, row.id),
    contentRevision,
    editRevision: decodeStoredEditRevision(row, contentRevision),
  }
}

function decodeTrashRow(row: StoredRow): StoredTrashItem {
  if (!isStoredDeletedAt(row.deletedAt)) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }
  return { ...decodeTaskRow(row), deletedAt: row.deletedAt }
}

/** Identidade observada da entrada (D3) a partir da linha decodificada. */
function trashEntryRefOf(item: StoredTrashItem): TrashEntryRef {
  return { taskId: item.task.id, contentRevision: item.contentRevision, deletedAt: item.deletedAt }
}

function isThenable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}

/** Executa um callback interno: precisa ser síncrono; erro que não é de armazenamento vira `INVALID_DATA`. */
function runCallback<T>(callback: () => T): T {
  let result: T
  try {
    result = callback()
  } catch (error) {
    throw new StorageFailure(storageFailureReasonOf(error) ?? 'INVALID_DATA')
  }
  if (isThenable(result)) {
    throw new StorageFailure('INVALID_UNIT')
  }
  return result
}

/**
 * Primitivas portáveis sobre a porta de linhas da transação. Não conhecem SQLite, Electron ou
 * a fila; toda decisão usa o estado lido na própria unidade.
 *
 * Classificação de revisões (TFA-005): criar/gerar/restaurar/recriar identidade e toda edição
 * genérica (save/replace/revert) atualizam conteúdo **e** edição; a marcação tipada de subtarefa
 * (`markSubtaskDone`) conserva a edição; `claimReminderOccurrence` conserva ambas e o `updatedAt`;
 * no-op/recusa/rollback não alocam revisão.
 */
export function createTaskStorageUnit(port: StorageRowPort): ActiveTaskStorageUnit {
  let active = true

  function assertActive(): void {
    if (!active) throw new StorageFailure('INVALID_UNIT')
  }

  function writeTask(encoded: EncodedTaskPayload, contentRevision: Revision, editRevision: Revision): void {
    if (!isRevision(editRevision) || editRevision < 1n || editRevision > contentRevision) {
      throw new StorageFailure('INVALID_DATA')
    }
    port.writeRow('tasks', {
      id: encoded.task.id,
      payloadVersion: encoded.payloadVersion,
      payloadJson: encoded.payloadJson,
      contentRevision,
      editRevision,
    })
  }

  function saveEncoded(encoded: EncodedTaskPayload): SaveOutcome {
    const row = port.readRow('tasks', encoded.task.id)
    if (row !== undefined && isSameJsonValue(decodeTaskRow(row).task, encoded.task)) {
      return 'UNCHANGED'
    }
    const revision = port.allocateRevision()
    writeTask(encoded, revision, revision)
    return row === undefined ? 'CREATED' : 'UPDATED'
  }

  /** Percorre resumos de portadora (id/série/regra) das duas coleções, sem decodificar payload. */
  function* carrierSummariesOf(collection: StoredCollection, afterId: string | undefined): Generator<CarrierSummary> {
    for (const row of port.iterateRows(collection, afterId)) {
      yield decodeTaskCarrierSummary(row.payloadJson, row.id)
    }
  }

  /**
   * Outra portadora com regra da mesma série no plano final? Alvos que serão substituídos ou
   * removidos são ignorados por coleção; entradas homônimas da outra coleção continuam contando.
   */
  function anotherCarrierExists(
    seriesId: string,
    ignoreTasks: ReadonlySet<string>,
    ignoreTrash: ReadonlySet<string>,
  ): boolean {
    for (const summary of carrierSummariesOf('tasks', undefined)) {
      if (ignoreTasks.has(summary.id)) continue
      if (summary.hasRecurrence && summary.seriesId === seriesId) return true
    }
    for (const summary of carrierSummariesOf('trash', undefined)) {
      if (ignoreTrash.has(summary.id)) continue
      if (summary.hasRecurrence && summary.seriesId === seriesId) return true
    }
    return false
  }

  function conflictFrom(row: StoredRow): ConditionalUpdateResult & { status: 'CONFLICT' } {
    const current = decodeTaskRow(row)
    return {
      status: 'CONFLICT',
      currentContentRevision: current.contentRevision,
      currentEditRevision: current.editRevision,
    }
  }

  const unit: TaskStorageUnit = {
    get baseRevision(): Revision {
      return port.baseRevision
    },

    listTasks(): StoredTask[] {
      assertActive()
      return port.listRows('tasks').map(decodeTaskRow)
    },

    getTask(id: string): StoredTask | undefined {
      assertActive()
      const row = port.readRow('tasks', id)
      return row === undefined ? undefined : decodeTaskRow(row)
    },

    listTrash(): StoredTrashItem[] {
      assertActive()
      return port.listRows('trash').map(decodeTrashRow)
    },

    getTrashItem(id: string): StoredTrashItem | undefined {
      assertActive()
      const row = port.readRow('trash', id)
      return row === undefined ? undefined : decodeTrashRow(row)
    },

    *iterateTasks(afterId: string | undefined): Generator<StoredTask> {
      assertActive()
      for (const row of port.iterateRows('tasks', afterId)) yield decodeTaskRow(row)
    },

    *iterateTrash(afterId: string | undefined): Generator<StoredTrashItem> {
      assertActive()
      for (const row of port.iterateRows('trash', afterId)) yield decodeTrashRow(row)
    },

    *iterateCarrierSummaries(collection: StoredCollection, afterId: string | undefined): Generator<CarrierSummary> {
      assertActive()
      // Leitura leve para checagens de portadora: mesma ordem/linhas da leitura completa, sem
      // normalizar o payload; linha inválida falha em vez de ser omitida.
      for (const row of port.iterateRows(collection, afterId)) {
        yield decodeTaskCarrierSummary(row.payloadJson, row.id)
      }
    },

    saveTask(task: Task): SaveOutcome {
      assertActive()
      return saveEncoded(encodeTaskPayload(task))
    },

    saveTasks(tasks: readonly Task[]): SaveOutcome[] {
      assertActive()
      return encodeTaskPayloads(tasks).map(saveEncoded)
    },

    replaceAllTasks(tasks: readonly Task[], expectedGlobalRevision: Revision): ReplaceAllResult {
      assertActive()
      if (port.baseRevision !== expectedGlobalRevision) {
        return { status: 'CONFLICT', currentRevision: port.baseRevision }
      }

      const encoded = encodeTaskPayloads(tasks)
      const current = new Map(port.listRows('tasks').map((row) => [row.id, decodeTaskRow(row)]))
      const nextIds = new Set(encoded.map((item) => item.task.id))
      const changed = encoded.filter((item) => {
        const existing = current.get(item.task.id)
        return existing === undefined || !isSameJsonValue(existing.task, item.task)
      })
      const removed = [...current.keys()].filter((id) => !nextIds.has(id))

      if (changed.length === 0 && removed.length === 0) {
        return { status: 'UNCHANGED' }
      }

      const revision = port.allocateRevision()
      for (const id of removed) port.deleteRow('tasks', id)
      for (const item of changed) writeTask(item, revision, revision)

      const created = changed.filter((item) => !current.has(item.task.id)).length
      return { status: 'REPLACED', created, updated: changed.length - created, removed: removed.length }
    },

    deleteTask(id: string): boolean {
      assertActive()
      if (port.readRow('tasks', id) === undefined) return false
      port.deleteRow('tasks', id)
      port.allocateRevision()
      return true
    },

    moveToTrash(id: string, deletedAt: string): Task | undefined {
      assertActive()
      if (!isStoredDeletedAt(deletedAt)) throw new StorageFailure('INVALID_DATA')
      const row = port.readRow('tasks', id)
      if (row === undefined) return undefined

      // O payload e as revisões seguem como estão (inclusive em versão histórica); só a coleção muda.
      const { task } = decodeTaskRow(row)
      port.deleteRow('tasks', id)
      port.writeRow('trash', { ...row, deletedAt })
      port.allocateRevision()
      return task
    },

    moveToTrashConditionally(
      taskId: string,
      expectedContentRevision: Revision,
      now: Date,
    ): ConditionalMoveToTrashResult {
      assertActive()
      const row = port.readRow('tasks', taskId)
      if (row === undefined) return { status: 'NOT_FOUND' }

      const current = decodeTaskRow(row)
      if (current.contentRevision !== expectedContentRevision) {
        return { status: 'CHANGED', currentContentRevision: current.contentRevision }
      }

      const deletedAt = now.toISOString()
      if (!isStoredDeletedAt(deletedAt)) throw new StorageFailure('INVALID_DATA')

      const existing = port.listRows('trash').map(decodeTrashRow)
      const revision = port.allocateRevision()
      const inserted: StoredTrashItem = {
        task: current.task,
        contentRevision: revision,
        editRevision: revision,
        deletedAt,
      }
      const plan = planTrashInsertion(
        existing.map((item) => ({ ...trashEntryRefOf(item), item })),
        { ...trashEntryRefOf(inserted), item: inserted },
        now,
      )
      const keptIds = new Set(plan.kept.map((entry) => entry.taskId))
      const discardedTaskIds = existing
        .filter((item) => !keptIds.has(item.task.id) && item.task.id !== taskId)
        .map((item) => item.task.id)

      port.deleteRow('tasks', taskId)
      for (const item of existing) {
        if (item.task.id === taskId || !keptIds.has(item.task.id)) port.deleteRow('trash', item.task.id)
      }
      if (plan.retained) {
        port.writeRow('trash', {
          id: inserted.task.id,
          payloadVersion: row.payloadVersion,
          payloadJson: row.payloadJson,
          contentRevision: inserted.contentRevision,
          editRevision: inserted.editRevision,
          deletedAt: inserted.deletedAt,
        })
      }

      return {
        status: 'MOVED',
        task: current.task,
        retained: plan.retained,
        entry: trashEntryRefOf(inserted),
        discardedTaskIds,
      }
    },

    restoreFromTrash(id: string, prepare: (task: Task) => Task): TrashRestoreResult {
      assertActive()
      const row = port.readRow('trash', id)
      if (row === undefined) return { status: 'NOT_IN_TRASH' }
      if (port.readRow('tasks', id) !== undefined) return { status: 'ID_EXISTS' }

      const { task } = decodeTrashRow(row)
      const encoded = encodeTaskPayload(runCallback(() => prepare(task)))
      if (encoded.task.id !== id) throw new StorageFailure('INVALID_DATA')

      // Restauração sempre recebe conteúdo e edição novos: a base antiga não autoriza draft anterior.
      const revision = port.allocateRevision()
      port.deleteRow('trash', id)
      writeTask(encoded, revision, revision)
      return { status: 'RESTORED', task: encoded.task, contentRevision: revision, editRevision: revision }
    },

    restoreTrashItemConditionally(entry: TrashEntryRef, now: Date): ConditionalRestoreResult {
      assertActive()
      const row = port.readRow('trash', entry.taskId)
      if (row === undefined) return { status: 'NOT_IN_TRASH' }

      const item = decodeTrashRow(row)
      if (!sameTrashEntryKey(trashEntryRefOf(item), entry)) return { status: 'ENTRY_CHANGED' }
      if (isTrashExpired(item.deletedAt, now)) return { status: 'ENTRY_EXPIRED' }
      if (port.readRow('tasks', entry.taskId) !== undefined) return { status: 'ID_EXISTS' }

      // Liquidação pura dos vencidos: preserva timestamps, não gera ocorrência e não altera status.
      const restored = settleElapsedReminders(item.task, now)
      const seriesId = restored.seriesId
      if (restored.recurrence !== undefined && seriesId !== undefined && seriesId !== '') {
        // A entrada sai da lixeira no plano final; qualquer outra portadora da mesma série conflita.
        if (anotherCarrierExists(seriesId, new Set(), new Set([entry.taskId]))) {
          return { status: 'SERIES_CONFLICT' }
        }
      }

      const encoded = encodeTaskPayload(restored)
      if (encoded.task.id !== entry.taskId) throw new StorageFailure('INVALID_DATA')

      const revision = port.allocateRevision()
      port.deleteRow('trash', entry.taskId)
      writeTask(encoded, revision, revision)
      return { status: 'RESTORED', task: encoded.task, contentRevision: revision, editRevision: revision }
    },

    deleteFromTrash(id: string): boolean {
      assertActive()
      if (port.readRow('trash', id) === undefined) return false
      port.deleteRow('trash', id)
      port.allocateRevision()
      return true
    },

    deleteTrashItemConditionally(entry: TrashEntryRef): ConditionalPermanentDeleteResult {
      assertActive()
      const row = port.readRow('trash', entry.taskId)
      if (row === undefined) return { status: 'NOT_IN_TRASH' }

      const item = decodeTrashRow(row)
      if (!sameTrashEntryKey(trashEntryRefOf(item), entry)) return { status: 'ENTRY_CHANGED' }

      port.deleteRow('trash', entry.taskId)
      port.allocateRevision()
      return { status: 'DELETED' }
    },

    emptyTrash(): number {
      assertActive()
      const rows = port.listRows('trash')
      if (rows.length === 0) return 0
      for (const row of rows) port.deleteRow('trash', row.id)
      port.allocateRevision()
      return rows.length
    },

    emptyTrashConditionally(captured: readonly TrashEntryRef[]): ConditionalEmptyTrashResult {
      assertActive()
      const rows = port.listRows('trash').map(decodeTrashRow)
      if (!sameTrashComposition(captured, rows.map(trashEntryRefOf))) {
        return { status: 'CONFIRMATION_CHANGED' }
      }
      if (rows.length === 0) return { status: 'EMPTIED', removedCount: 0 }
      for (const item of rows) port.deleteRow('trash', item.task.id)
      port.allocateRevision()
      return { status: 'EMPTIED', removedCount: rows.length }
    },

    purgeTrash(shouldPurge: (item: StoredTrashItem) => boolean): number {
      assertActive()
      const purged = port
        .listRows('trash')
        .map(decodeTrashRow)
        .filter((item) => runCallback(() => shouldPurge(item)) === true)
      if (purged.length === 0) return 0
      for (const item of purged) port.deleteRow('trash', item.task.id)
      port.allocateRevision()
      return purged.length
    },

    purgeExpiredTrash(now: Date): number {
      assertActive()
      const expired = port.listRows('trash').map(decodeTrashRow).filter((item) => isTrashExpired(item.deletedAt, now))
      if (expired.length === 0) return 0
      for (const item of expired) port.deleteRow('trash', item.task.id)
      port.allocateRevision()
      return expired.length
    },

    updateTaskConditionally(
      id: string,
      expectedEditRevision: Revision,
      change: (task: Task) => Task | undefined,
    ): ConditionalUpdateResult {
      assertActive()
      const row = port.readRow('tasks', id)
      if (row === undefined) return { status: 'NOT_FOUND' }

      const current = decodeTaskRow(row)
      if (current.editRevision !== expectedEditRevision) return conflictFrom(row)

      const next = runCallback(() => change(current.task))
      if (next === undefined || next === current.task) {
        return { status: 'UNCHANGED', task: current.task, contentRevision: current.contentRevision, editRevision: current.editRevision }
      }

      const encoded = encodeTaskPayload(preserveProcessedMarkers(current.task, next))
      if (encoded.task.id !== id) throw new StorageFailure('INVALID_DATA')
      if (isSameJsonValue(current.task, encoded.task)) {
        return { status: 'UNCHANGED', task: current.task, contentRevision: current.contentRevision, editRevision: current.editRevision }
      }

      const revision = port.allocateRevision()
      writeTask(encoded, revision, revision)
      return { status: 'UPDATED', task: encoded.task, contentRevision: revision, editRevision: revision }
    },

    markSubtaskDone(
      id: string,
      expectedEditRevision: Revision,
      subtaskId: string,
      done: boolean,
      now: Date,
    ): MarkSubtaskDoneResult {
      assertActive()
      const row = port.readRow('tasks', id)
      if (row === undefined) return { status: 'NOT_FOUND' }

      const current = decodeTaskRow(row)
      if (current.editRevision !== expectedEditRevision) return conflictFrom(row)

      const next = runCallback(() => setSubtaskDone(current.task, subtaskId, done, now))
      if (next === undefined) {
        return {
          status: 'SUBTASK_NOT_FOUND',
          task: current.task,
          contentRevision: current.contentRevision,
          editRevision: current.editRevision,
        }
      }
      if (next === current.task) {
        return { status: 'UNCHANGED', task: current.task, contentRevision: current.contentRevision, editRevision: current.editRevision }
      }

      const encoded = encodeTaskPayload(next)
      if (encoded.task.id !== id) throw new StorageFailure('INVALID_DATA')

      // Marcação conserva a edição: apenas o conteúdo (e a global) avançam.
      const revision = port.allocateRevision()
      writeTask(encoded, revision, current.editRevision)
      return { status: 'UPDATED', task: encoded.task, contentRevision: revision, editRevision: current.editRevision }
    },

    revertConditionally(
      preconditions: RevertPreconditions,
      restore: (current: Task) => Task,
      now: Date,
    ): ConditionalRevertResult {
      assertActive()
      const { target, generated } = preconditions
      const row = port.readRow('tasks', target.id)
      if (row === undefined) return { status: 'REMOVED' }

      const current = decodeTaskRow(row)
      if (current.contentRevision !== target.expectedContentRevision) {
        return { status: 'CHANGED', currentRevision: current.contentRevision }
      }

      if (generated !== undefined) {
        const generatedRow = port.readRow('tasks', generated.id)
        if (
          generated.id === target.id ||
          generatedRow === undefined ||
          decodeTaskRow(generatedRow).contentRevision !== generated.expectedContentRevision
        ) {
          return { status: 'GENERATED_CHANGED' }
        }
      }

      const restored = runCallback(() => restore(current.task))
      // Conserva marcadores atuais da mesma ocorrência e liquida vencidos <= now de forma pura.
      const encoded = encodeTaskPayload(settleElapsedReminders(preserveProcessedMarkers(current.task, restored), now))
      if (encoded.task.id !== target.id) throw new StorageFailure('INVALID_DATA')

      if (generated === undefined && isSameJsonValue(current.task, encoded.task)) {
        return { status: 'REVERTED', task: current.task, contentRevision: current.contentRevision, editRevision: current.editRevision }
      }

      // Portadora única no plano final: alvo substituído e gerada removida não contam.
      const seriesId = encoded.task.seriesId
      if (encoded.task.recurrence !== undefined && seriesId !== undefined && seriesId !== '') {
        const ignoreTasks = new Set([target.id])
        if (generated !== undefined) ignoreTasks.add(generated.id)
        if (anotherCarrierExists(seriesId, ignoreTasks, new Set())) return { status: 'SERIES_CONFLICT' }
      }

      const revision = port.allocateRevision()
      if (generated !== undefined) port.deleteRow('tasks', generated.id)
      writeTask(encoded, revision, revision)
      return { status: 'REVERTED', task: encoded.task, contentRevision: revision, editRevision: revision }
    },

    claimReminderOccurrence(claim: ReminderOccurrenceClaim): boolean {
      assertActive()
      const row = port.readRow('tasks', claim.taskId)
      if (row === undefined) return false

      const current = decodeTaskRow(row)
      const claimed = claimReminderOccurrence(current.task, claim.reminderId, claim.processedFor)
      if (claimed === undefined) return false

      // Processamento interno: muda a revisão global, conserva `updatedAt`, conteúdo e edição.
      writeTask(encodeTaskPayload(claimed), current.contentRevision, current.editRevision)
      port.allocateRevision()
      return true
    },
  }

  return {
    unit,
    expire(): void {
      active = false
    },
  }
}
