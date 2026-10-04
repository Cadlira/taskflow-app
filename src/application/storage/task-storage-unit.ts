import type { Task } from '../../domain/task.js'
import { claimReminderOccurrence, preserveProcessedMarkers } from '../../domain/task-reminders.js'
import { isRevision, type Revision } from './revisions.js'
import {
  decodeTaskPayload,
  encodeTaskPayload,
  encodeTaskPayloads,
  isSameJsonValue,
  isStoredDeletedAt,
  type EncodedTaskPayload,
} from './stored-task-codec.js'
import { StorageFailure, storageFailureReasonOf } from './task-storage-error.js'
import type {
  ConditionalRevertResult,
  ConditionalUpdateResult,
  ReminderOccurrenceClaim,
  ReplaceAllResult,
  RevertPreconditions,
  SaveOutcome,
  StorageRowPort,
  StoredRow,
  StoredTask,
  StoredTrashItem,
  TaskStorageUnit,
  TrashRestoreResult,
} from './unit-of-work.js'

export interface ActiveTaskStorageUnit {
  unit: TaskStorageUnit
  /** Encerra a validade das portas; chamadas posteriores falham com `INVALID_UNIT`. */
  expire(): void
}

function decodeStoredRevision(row: StoredRow): Revision {
  if (!isRevision(row.contentRevision) || row.contentRevision < 1n) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }
  return row.contentRevision
}

function decodeTaskRow(row: StoredRow): StoredTask {
  return {
    task: decodeTaskPayload(row.payloadVersion, row.payloadJson, row.id),
    contentRevision: decodeStoredRevision(row),
  }
}

function decodeTrashRow(row: StoredRow): StoredTrashItem {
  if (!isStoredDeletedAt(row.deletedAt)) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }
  return { ...decodeTaskRow(row), deletedAt: row.deletedAt }
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
 * Primitives portáveis sobre a porta de linhas da transação. Não conhecem SQLite, Electron ou
 * a fila; toda decisão usa o estado lido na própria unidade.
 */
export function createTaskStorageUnit(port: StorageRowPort): ActiveTaskStorageUnit {
  let active = true

  function assertActive(): void {
    if (!active) throw new StorageFailure('INVALID_UNIT')
  }

  function writeTask(encoded: EncodedTaskPayload, contentRevision: Revision): void {
    port.writeRow('tasks', {
      id: encoded.task.id,
      payloadVersion: encoded.payloadVersion,
      payloadJson: encoded.payloadJson,
      contentRevision,
    })
  }

  function saveEncoded(encoded: EncodedTaskPayload): SaveOutcome {
    const row = port.readRow('tasks', encoded.task.id)
    if (row !== undefined && isSameJsonValue(decodeTaskRow(row).task, encoded.task)) {
      return 'UNCHANGED'
    }
    writeTask(encoded, port.allocateRevision())
    return row === undefined ? 'CREATED' : 'UPDATED'
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
      for (const item of changed) writeTask(item, revision)

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

      // O payload segue como está (inclusive em versão histórica); só a coleção muda.
      const { task } = decodeTaskRow(row)
      port.deleteRow('tasks', id)
      port.writeRow('trash', { ...row, deletedAt })
      port.allocateRevision()
      return task
    },

    restoreFromTrash(id: string, prepare: (task: Task) => Task): TrashRestoreResult {
      assertActive()
      const row = port.readRow('trash', id)
      if (row === undefined) return { status: 'NOT_IN_TRASH' }
      if (port.readRow('tasks', id) !== undefined) return { status: 'ID_EXISTS' }

      const { task } = decodeTrashRow(row)
      const encoded = encodeTaskPayload(runCallback(() => prepare(task)))
      if (encoded.task.id !== id) throw new StorageFailure('INVALID_DATA')

      // Restauração sempre recebe revisão de conteúdo nova: a antiga não autoriza draft anterior.
      const contentRevision = port.allocateRevision()
      port.deleteRow('trash', id)
      writeTask(encoded, contentRevision)
      return { status: 'RESTORED', task: encoded.task, contentRevision }
    },

    deleteFromTrash(id: string): boolean {
      assertActive()
      if (port.readRow('trash', id) === undefined) return false
      port.deleteRow('trash', id)
      port.allocateRevision()
      return true
    },

    emptyTrash(): number {
      assertActive()
      const rows = port.listRows('trash')
      if (rows.length === 0) return 0
      for (const row of rows) port.deleteRow('trash', row.id)
      port.allocateRevision()
      return rows.length
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

    updateTaskConditionally(
      id: string,
      expectedContentRevision: Revision,
      change: (task: Task) => Task | undefined,
    ): ConditionalUpdateResult {
      assertActive()
      const row = port.readRow('tasks', id)
      if (row === undefined) return { status: 'NOT_FOUND' }

      const current = decodeTaskRow(row)
      if (current.contentRevision !== expectedContentRevision) {
        return { status: 'CONFLICT', currentRevision: current.contentRevision }
      }

      const next = runCallback(() => change(current.task))
      if (next === undefined || next === current.task) {
        return { status: 'UNCHANGED', ...current }
      }

      const encoded = encodeTaskPayload(preserveProcessedMarkers(current.task, next))
      if (encoded.task.id !== id) throw new StorageFailure('INVALID_DATA')
      if (isSameJsonValue(current.task, encoded.task)) {
        return { status: 'UNCHANGED', ...current }
      }

      const contentRevision = port.allocateRevision()
      writeTask(encoded, contentRevision)
      return { status: 'UPDATED', task: encoded.task, contentRevision }
    },

    revertConditionally(
      preconditions: RevertPreconditions,
      restore: (current: Task) => Task,
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
      const encoded = encodeTaskPayload(preserveProcessedMarkers(current.task, restored))
      if (encoded.task.id !== target.id) throw new StorageFailure('INVALID_DATA')

      if (generated === undefined && isSameJsonValue(current.task, encoded.task)) {
        return { status: 'REVERTED', ...current }
      }

      const contentRevision = port.allocateRevision()
      if (generated !== undefined) port.deleteRow('tasks', generated.id)
      writeTask(encoded, contentRevision)
      return { status: 'REVERTED', task: encoded.task, contentRevision }
    },

    claimReminderOccurrence(claim: ReminderOccurrenceClaim): boolean {
      assertActive()
      const row = port.readRow('tasks', claim.taskId)
      if (row === undefined) return false

      const current = decodeTaskRow(row)
      const claimed = claimReminderOccurrence(current.task, claim.reminderId, claim.processedFor)
      if (claimed === undefined) return false

      // Processamento interno: muda a revisão global, conserva `updatedAt` e a de conteúdo.
      writeTask(encodeTaskPayload(claimed), current.contentRevision)
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
