// Plano final e verificação da restauração de backup DENTRO da unidade coordenada:
// tasks importadas (após liquidação pura <= now) + TODA a lixeira preservada; portadora única por
// série em qualquer status; CAS global; releitura e comparação completa de conteúdo e metadata
// ANTES do COMMIT. Mismatch lança falha de verificação e o coordenador reverte a unidade inteira.
// Nenhum ID, timestamp, âncora ou ordem é regenerado; nenhum registro vai para a lixeira.
import { settleElapsedReminders } from '../../domain/task-reminders.js'
import type { Task } from '../../domain/task.js'
import { isSameJsonValue } from '../storage/stored-task-codec.js'
import { StorageFailure } from '../storage/task-storage-error.js'
import type { Revision } from '../storage/revisions.js'
import type { StoredTask, StoredTrashItem, TaskStorageUnit } from '../storage/unit-of-work.js'

export type BackupRestoreInUnitResult =
  | {
      status: 'APPLIED'
      revision: Revision
      restoredCount: number
      created: number
      updated: number
      removed: number
    }
  | { status: 'UNCHANGED'; revision: Revision; restoredCount: number }
  | { status: 'BASE_CHANGED'; currentRevision: Revision }
  | { status: 'SERIES_CONFLICT' }

export interface BackupRestoreInUnitInput {
  /** Tarefas validadas/projetadas do arquivo, antes da liquidação. */
  tasks: readonly Task[]
  /** Revisão global observada na preparação; precisa continuar atual. */
  expectedGlobalRevision: Revision
  /** Relógio lido uma única vez na execução. */
  now: Date
}

function verificationFailed(): never {
  throw new StorageFailure('BACKUP_VERIFICATION_FAILED')
}

/** Portadora com regra exige série; o plano final tem no máximo uma por série em tasks+trash. */
function isRecurrenceCarrier(task: Task): boolean {
  return task.recurrence !== undefined && task.seriesId !== undefined && task.seriesId !== ''
}

function verifyTasks(unit: TaskStorageUnit, expected: readonly Task[], pre: ReadonlyMap<string, StoredTask>, revision: Revision): void {
  const post = unit.listTasks()
  if (post.length !== expected.length) verificationFailed()

  const expectedById = new Map(expected.map((task) => [task.id, task]))
  for (const stored of post) {
    const target = expectedById.get(stored.task.id)
    if (target === undefined) verificationFailed()
    if (!isSameJsonValue(stored.task, target)) verificationFailed()

    const previous = pre.get(stored.task.id)
    if (previous === undefined || !isSameJsonValue(previous.task, target)) {
      // Nova ou alterada: recebeu a revisão local da unidade nas duas dimensões.
      if (stored.contentRevision !== revision || stored.editRevision !== revision) verificationFailed()
    } else {
      // Idêntica: metadata anterior conservada exatamente.
      if (stored.contentRevision !== previous.contentRevision || stored.editRevision !== previous.editRevision) {
        verificationFailed()
      }
    }
  }
}

function verifyTrash(unit: TaskStorageUnit, pre: readonly StoredTrashItem[]): void {
  const post = unit.listTrash()
  if (post.length !== pre.length) verificationFailed()
  const preById = new Map(pre.map((item) => [item.task.id, item]))
  for (const item of post) {
    const previous = preById.get(item.task.id)
    if (previous === undefined) verificationFailed()
    if (!isSameJsonValue(item.task, previous.task)) verificationFailed()
    if (
      item.deletedAt !== previous.deletedAt ||
      item.contentRevision !== previous.contentRevision ||
      item.editRevision !== previous.editRevision
    ) {
      verificationFailed()
    }
  }
}

/**
 * Executa a substituição completa de tarefas numa única unidade. Devolve o resultado do plano; a
 * verificação divergente lança `BACKUP_VERIFICATION_FAILED` para rollback integral.
 */
export function restoreBackupInUnit(
  unit: TaskStorageUnit,
  input: BackupRestoreInUnitInput,
): BackupRestoreInUnitResult {
  const base = unit.baseRevision
  if (base !== input.expectedGlobalRevision) return { status: 'BASE_CHANGED', currentRevision: base }

  const preTasks = new Map<string, StoredTask>()
  for (const stored of unit.listTasks()) preTasks.set(stored.task.id, stored)
  const preTrash = unit.listTrash()

  // Liquidação pura dos gatilhos pendentes <= now; timestamps, status e marcações futuras intactos.
  const finalTasks = input.tasks.map((task) => settleElapsedReminders(task, input.now))

  const carriers = new Set<string>()
  for (const task of finalTasks) {
    if (!isRecurrenceCarrier(task)) continue
    const seriesId = task.seriesId as string
    if (carriers.has(seriesId)) return { status: 'SERIES_CONFLICT' }
    carriers.add(seriesId)
  }
  for (const item of preTrash) {
    if (!isRecurrenceCarrier(item.task)) continue
    const seriesId = item.task.seriesId as string
    if (carriers.has(seriesId)) return { status: 'SERIES_CONFLICT' }
    carriers.add(seriesId)
  }

  const replaced = unit.replaceAllTasks(finalTasks, input.expectedGlobalRevision)
  if (replaced.status === 'CONFLICT') return { status: 'BASE_CHANGED', currentRevision: replaced.currentRevision }

  if (replaced.status === 'UNCHANGED') {
    // Sem revisão SQL nova: ainda assim, o estado confirmado precisa conferir com a expectativa.
    verifyTasks(unit, finalTasks, preTasks, base)
    verifyTrash(unit, preTrash)
    return { status: 'UNCHANGED', revision: base, restoredCount: finalTasks.length }
  }

  verifyTasks(unit, finalTasks, preTasks, replaced.revision)
  verifyTrash(unit, preTrash)
  return {
    status: 'APPLIED',
    revision: replaced.revision,
    restoredCount: finalTasks.length,
    created: replaced.created,
    updated: replaced.updated,
    removed: replaced.removed,
  }
}
