// Exportação de backup no main: diálogo de salvar vinculado à janela, proteção do destino,
// snapshot coordenado de TODAS as tarefas (independente de filtros), validação pelo próprio leitor,
// gravação atômica e readback. O renderer nunca vê path/JSON/Task/Node; o job nativo global garante
// um único fluxo e cancelamento neutro. Sessão/contexto são revalidados em cada fronteira.
import { type Revision } from '../../application/storage/revisions.js'
import type { StorageFailureReason } from '../../application/storage/task-storage-error.js'
import type { TaskStorageReader, UnitResult } from '../../application/storage/unit-of-work.js'
import type { Task } from '../../domain/task.js'
import { readBackupFile } from '../../application/backup/backup-file.js'
import { compareBackupTaskCollections } from '../../application/backup/backup-comparison.js'
import { backupFileName } from '../../application/backup/backup-format.js'
import {
  BackupIssueCollector,
  canonicalTaskBytes,
  type BackupIssue,
} from '../../application/backup/backup-issues.js'
import {
  backupPreparationChargeBytes,
  backupSerializedChargeBytes,
  countValueNodes,
  type BackupResourceLedger,
} from '../../application/backup/backup-resources.js'
import { encodeBackupChunks, joinBackupChunks } from '../../application/backup/backup-serializer.js'
import { validateBackupTask } from '../../application/backup/backup-validation.js'
import type { UnitOptions } from '../storage/coordinator.js'
import type { DocumentTicket } from '../ipc/document-sessions.js'
import { captureDestinationFingerprint, checkBackupDestination } from './backup-destination.js'
import { writeBackupFile, type BackupWriteFaults } from './backup-file-write.js'
import type { BackupDialogBroker, BackupJobGate } from './backup-job.js'

export type ExportBackupErrorCode =
  | 'BUSY'
  | 'STALE_CONTEXT'
  | 'SESSION_CLOSED'
  | 'STORAGE_UNAVAILABLE'
  | 'INCOMPATIBLE_DATA'
  | 'CORRUPTED_DATA'
  | 'RESOURCE_LIMIT'
  | 'FILE_TOO_LARGE'
  | 'LOCAL_DATA_NOT_EXPORTABLE'
  | 'DESTINATION_NOT_ALLOWED'
  | 'DESTINATION_CHANGED'
  | 'FILE_WRITE_FAILED'

export type ExportBackupOutcome =
  | { kind: 'cancelled' }
  | {
      kind: 'ok'
      outcome: 'SAVED' | 'SAVED_WITH_WARNING'
      taskCount: number
      revision: Revision
      bytes: number
    }
  | { kind: 'error'; code: ExportBackupErrorCode; issues?: BackupIssue[]; extraIssueCount?: number }

export interface BackupExportStorage {
  read<T>(reader: (reader: TaskStorageReader) => T, options?: UnitOptions): Promise<UnitResult<T>>
}

export interface BackupExportServiceOptions {
  dialogs: BackupDialogBroker
  storage: BackupExportStorage
  ledger: BackupResourceLedger
  gate: BackupJobGate
  clock: () => Date
  appVersion: () => string
  /** Raízes internas (userData/sessionData/app) que não podem ser destino. */
  protectedRoots: () => readonly string[]
  isAuthorized: (ticket: DocumentTicket) => boolean
  contextSequence: (ticket: DocumentTicket) => number
  faults?: BackupWriteFaults
}

type SnapshotOutcome =
  | { status: 'OK'; tasks: readonly Task[]; revision: Revision }
  | { status: 'SESSION_CLOSED' }
  | { status: 'STALE_CONTEXT' }

function storageErrorCode(reason: StorageFailureReason): ExportBackupErrorCode {
  switch (reason) {
    case 'INCOMPATIBLE_DATA':
    case 'CORRUPTED_DATA':
      return reason
    case 'LOCKED':
    case 'QUEUE_FULL':
    case 'WAIT_TIMEOUT':
      return 'BUSY'
    case 'CLOSED':
    case 'SESSION_CLOSED':
      return 'SESSION_CLOSED'
    case 'REVISION_EXHAUSTED':
      return 'RESOURCE_LIMIT'
    default:
      return 'STORAGE_UNAVAILABLE'
  }
}

export class BackupExportService {
  readonly #dialogs: BackupDialogBroker
  readonly #storage: BackupExportStorage
  readonly #ledger: BackupResourceLedger
  readonly #gate: BackupJobGate
  readonly #clock: () => Date
  readonly #appVersion: () => string
  readonly #protectedRoots: () => readonly string[]
  readonly #isAuthorized: (ticket: DocumentTicket) => boolean
  readonly #contextSequence: (ticket: DocumentTicket) => number
  readonly #faults: BackupWriteFaults | undefined

  constructor(options: BackupExportServiceOptions) {
    this.#dialogs = options.dialogs
    this.#storage = options.storage
    this.#ledger = options.ledger
    this.#gate = options.gate
    this.#clock = options.clock
    this.#appVersion = options.appVersion
    this.#protectedRoots = options.protectedRoots
    this.#isAuthorized = options.isAuthorized
    this.#contextSequence = options.contextSequence
    this.#faults = options.faults
  }

  /**
   * Exporta o snapshot completo. O gate nativo é mantido durante diálogo/leitura/gravação
   * (concorrência recebe BUSY) e liberado em `finally`; nada de transação SQL durante o diálogo.
   */
  async exportBackup(ticket: DocumentTicket, contextSequence: number): Promise<ExportBackupOutcome> {
    if (this.#contextSequence(ticket) !== contextSequence) return { kind: 'error', code: 'STALE_CONTEXT' }
    if (!this.#gate.tryAcquire()) return { kind: 'error', code: 'BUSY' }

    try {
      if (!this.#isAuthorized(ticket)) return { kind: 'error', code: 'SESSION_CLOSED' }

      const answer = await this.#dialogs.show(ticket, {
        kind: 'save',
        title: 'Salvar backup das tarefas',
        defaultPath: backupFileName(this.#clock()),
        filters: [{ name: 'Backup TaskFlow (JSON)', extensions: ['json'] }],
        dontAddToRecent: true,
      })
      const destinationRaw = answer.filePaths[0]
      if (answer.canceled || destinationRaw === undefined) return { kind: 'cancelled' }
      if (!this.#isAuthorized(ticket)) return { kind: 'error', code: 'SESSION_CLOSED' }
      if (this.#contextSequence(ticket) !== contextSequence) return { kind: 'error', code: 'STALE_CONTEXT' }

      const destination = await checkBackupDestination(destinationRaw, { protectedRoots: this.#protectedRoots() })
      if (!destination.ok) return { kind: 'error', code: destination.code }

      const exportedAt = this.#clock().toISOString()
      const read = await this.#storage.read(
        (reader): SnapshotOutcome => {
          if (!this.#isAuthorized(ticket)) return { status: 'SESSION_CLOSED' }
          if (this.#contextSequence(ticket) !== contextSequence) return { status: 'STALE_CONTEXT' }
          return {
            status: 'OK',
            tasks: reader.listTasks().map((stored) => stored.task),
            revision: reader.baseRevision,
          }
        },
        { owner: ticket.key, admit: () => this.#isAuthorized(ticket) },
      )
      if (!read.ok) return { kind: 'error', code: storageErrorCode(read.reason) }
      if (read.value.status !== 'OK') return { kind: 'error', code: read.value.status }

      const collector = new BackupIssueCollector()
      const projected: Task[] = []
      for (const [index, task] of read.value.tasks.entries()) {
        const validated = validateBackupTask(task, index, collector)
        if (validated !== undefined) projected.push(validated)
      }
      if (collector.total > 0) {
        const report = collector.report()
        return {
          kind: 'error',
          code: 'LOCAL_DATA_NOT_EXPORTABLE',
          ...(report.issues.length > 0 && { issues: report.issues }),
          ...(report.extraIssueCount > 0 && { extraIssueCount: report.extraIssueCount }),
        }
      }

      let taskBytes = 0
      for (const task of projected) taskBytes += canonicalTaskBytes(task)
      const snapshotReservation = this.#ledger.reserve(
        backupPreparationChargeBytes(taskBytes, countValueNodes(projected)),
      )
      if (snapshotReservation.status !== 'ok') return { kind: 'error', code: 'RESOURCE_LIMIT' }

      try {
        const encoded = encodeBackupChunks(projected, {
          exportedAt,
          appVersion: this.#appVersion(),
        })
        if (!encoded.ok) return { kind: 'error', code: 'FILE_TOO_LARGE' }

        const text = joinBackupChunks(encoded.chunks)
        const textReservation = this.#ledger.reserve(backupSerializedChargeBytes(encoded.bytes))
        if (textReservation.status !== 'ok') return { kind: 'error', code: 'RESOURCE_LIMIT' }

        try {
          // A saída é validada pelo próprio leitor e comparada com a projeção conhecida.
          const parsed = readBackupFile(text)
          if (!parsed.ok) return { kind: 'error', code: 'LOCAL_DATA_NOT_EXPORTABLE' }
          if (!compareBackupTaskCollections(projected, parsed.backup.tasks).ok) {
            return { kind: 'error', code: 'LOCAL_DATA_NOT_EXPORTABLE' }
          }

          // Fronteira imediatamente antes do efeito: sessão/contexto ainda correntes.
          if (!this.#isAuthorized(ticket)) return { kind: 'error', code: 'SESSION_CLOSED' }
          if (this.#contextSequence(ticket) !== contextSequence) return { kind: 'error', code: 'STALE_CONTEXT' }

          const fingerprint = await captureDestinationFingerprint(destination.destination)
          const write = await writeBackupFile({
            destination: destination.destination,
            content: Buffer.from(text, 'utf8'),
            expectedFingerprint: fingerprint,
            ...(this.#faults !== undefined && { faults: this.#faults }),
          })
          if (write.status === 'DESTINATION_CHANGED') return { kind: 'error', code: 'DESTINATION_CHANGED' }
          if (write.status === 'FAILED') return { kind: 'error', code: 'FILE_WRITE_FAILED' }
          return {
            kind: 'ok',
            outcome: write.status,
            taskCount: projected.length,
            revision: read.value.revision,
            bytes: write.bytes,
          }
        } finally {
          this.#ledger.release(textReservation.reservation)
        }
      } finally {
        this.#ledger.release(snapshotReservation.reservation)
      }
    } catch {
      return { kind: 'error', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      this.#gate.release()
    }
  }
}
