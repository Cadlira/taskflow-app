// Importação consentida no main: abrir arquivo por diálogo nativo, ler/validar sob orçamento,
// capturar base coordenada, publicar prévia imutável com token/TTL e confirmar a substituição por
// CAS global numa única unidade. A conclusão serializada aplica a barreira de época antes de
// publicar/da próxima entrada; o token é consumido uma vez e nunca reconstruído.
import { formatRevision, type Revision } from '../../application/storage/revisions.js'
import type { StorageFailureReason } from '../../application/storage/task-storage-error.js'
import type { TaskStorageReader, TaskStorageUnit, UnitResult } from '../../application/storage/unit-of-work.js'
import type { UndoRegistry } from '../../application/undo/undo-registry.js'
import { canonicalTaskBytes } from '../../application/backup/backup-issues.js'
import {
  backupPreparationChargeBytes,
  countValueNodes,
  type BackupResourceLedger,
} from '../../application/backup/backup-resources.js'
import type { BackupRestoreInUnitResult } from '../../application/backup/backup-restore-plan.js'
import { restoreBackupInUnit } from '../../application/backup/backup-restore-plan.js'
import {
  BACKUP_PREVIEW_TTL_MS,
  fitsBackupPreviewBudget,
  type BackupErrorCode,
  type CancelBackupRestoreResult,
  type ConfirmBackupRestoreResult,
  type ExportBackupResult,
  type PrepareBackupRestoreResult,
} from '../../contracts/backup.js'
import type { UnitOptions } from '../storage/coordinator.js'
import type { DocumentTicket } from '../ipc/document-sessions.js'
import { readBackupPipeline } from './backup-read-pipeline.js'
import { BackupExportService } from './backup-export-service.js'
import type { BackupWriteFaults } from './backup-file-write.js'
import type { BackupJobGate } from './backup-job.js'
import type { BackupDialogBroker } from './backup-job.js'
import { BackupRestoreRegistry, type BackupPreparation } from './backup-restore-registry.js'

export interface BackupRestoreStorage {
  read<T>(reader: (reader: TaskStorageReader) => T, options?: UnitOptions): Promise<UnitResult<T>>
  run<T>(unit: (unit: TaskStorageUnit) => T, options?: UnitOptions): Promise<UnitResult<T>>
}

export interface BackupCommandServicesOptions {
  dialogs: BackupDialogBroker
  storage: BackupRestoreStorage
  ledger: BackupResourceLedger
  gate: BackupJobGate
  registry: BackupRestoreRegistry
  undo: UndoRegistry
  clock: () => Date
  appVersion: () => string
  protectedRoots: () => readonly string[]
  isAuthorized: (ticket: DocumentTicket) => boolean
  contextSequence: (ticket: DocumentTicket) => number
  /** Pontos de falha da gravação, restritos ao harness/testes; nunca vêm do IPC. */
  faults?: BackupWriteFaults
}

interface BaseSnapshot {
  revision: Revision
  localTaskCount: number
}

type BaseReadOutcome = { status: 'OK'; base: BaseSnapshot } | { status: 'SESSION_CLOSED' } | { status: 'STALE_CONTEXT' }

function failure(code: BackupErrorCode, extra: Partial<{ commitState: 'NOT_APPLIED' | 'UNKNOWN' }> = {}) {
  return { version: 1 as const, status: 'error' as const, code, ...extra }
}

function storageErrorCode(reason: StorageFailureReason): BackupErrorCode {
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
    case 'BACKUP_VERIFICATION_FAILED':
      return 'BACKUP_VERIFICATION_FAILED'
    default:
      return 'STORAGE_UNAVAILABLE'
  }
}

export class BackupCommandServices {
  readonly #dialogs: BackupDialogBroker
  readonly #storage: BackupRestoreStorage
  readonly #ledger: BackupResourceLedger
  readonly #gate: BackupJobGate
  readonly #registry: BackupRestoreRegistry
  readonly #undo: UndoRegistry
  readonly #clock: () => Date
  readonly #isAuthorized: (ticket: DocumentTicket) => boolean
  readonly #contextSequence: (ticket: DocumentTicket) => number
  readonly #export: BackupExportService

  constructor(options: BackupCommandServicesOptions) {
    this.#dialogs = options.dialogs
    this.#storage = options.storage
    this.#ledger = options.ledger
    this.#gate = options.gate
    this.#registry = options.registry
    this.#undo = options.undo
    this.#clock = options.clock
    this.#isAuthorized = options.isAuthorized
    this.#contextSequence = options.contextSequence
    this.#export = new BackupExportService({
      dialogs: options.dialogs,
      storage: options.storage,
      ledger: options.ledger,
      gate: options.gate,
      clock: options.clock,
      appVersion: options.appVersion,
      protectedRoots: options.protectedRoots,
      isAuthorized: options.isAuthorized,
      contextSequence: options.contextSequence,
      ...(options.faults !== undefined && { faults: options.faults }),
    })
  }

  exportBackup(ticket: DocumentTicket, contextSequence: number): Promise<ExportBackupResult> {
    return this.#export.exportBackup(ticket, contextSequence).then((outcome) => {
      if (outcome.kind === 'cancelled') return { version: 1 as const, status: 'cancelled' as const }
      if (outcome.kind === 'ok') {
        return {
          version: 1 as const,
          status: 'ok' as const,
          outcome: outcome.outcome,
          taskCount: outcome.taskCount,
          revision: formatRevision(outcome.revision),
        }
      }
      return {
        version: 1 as const,
        status: 'error' as const,
        code: outcome.code,
        ...(outcome.issues !== undefined && { issues: outcome.issues }),
        ...(outcome.extraIssueCount !== undefined && { extraIssueCount: outcome.extraIssueCount }),
      }
    })
  }

  /**
   * Abre/escolhe o arquivo, valida integralmente sob orçamento, captura a base coordenada e publica
   * a prévia. A reserva de parse permanece até a preparação ser publicada; a preparação anterior do
   * documento é liberada. Cancelar a seleção é neutro.
   */
  async prepareBackupRestore(ticket: DocumentTicket, contextSequence: number): Promise<PrepareBackupRestoreResult> {
    if (this.#contextSequence(ticket) !== contextSequence) return failure('STALE_CONTEXT')
    if (!this.#gate.tryAcquire()) return failure('BUSY')

    try {
      if (!this.#isAuthorized(ticket)) return failure('SESSION_CLOSED')

      const answer = await this.#dialogs.show(ticket, {
        kind: 'open',
        title: 'Selecionar backup das tarefas',
        filters: [{ name: 'Backup TaskFlow (JSON)', extensions: ['json'] }],
      })
      const chosen = answer.filePaths[0]
      if (answer.canceled || chosen === undefined) return { version: 1, status: 'cancelled' }

      if (!this.#isAuthorized(ticket)) return failure('SESSION_CLOSED')
      if (this.#contextSequence(ticket) !== contextSequence) return failure('STALE_CONTEXT')

      const pipeline = await readBackupPipeline({ path: chosen, ledger: this.#ledger })
      if (!pipeline.ok) {
        return {
          version: 1,
          status: 'error',
          code: pipeline.code,
          ...(pipeline.issues !== undefined && { issues: pipeline.issues }),
          ...(pipeline.extraIssueCount !== undefined && { extraIssueCount: pipeline.extraIssueCount }),
        }
      }

      try {
        const preparationCharge = backupPreparationChargeBytes(
          pipeline.backup.tasks.reduce((total, task) => total + canonicalTaskBytes(task), 0),
          countValueNodes(pipeline.backup.tasks),
        )

        const read = await this.#storage.read(
          (reader): BaseReadOutcome => {
            if (!this.#isAuthorized(ticket)) return { status: 'SESSION_CLOSED' }
            if (this.#contextSequence(ticket) !== contextSequence) return { status: 'STALE_CONTEXT' }
            let localTaskCount = 0
            for (const _task of reader.iterateTasks(undefined)) {
              void _task
              localTaskCount += 1
            }
            return { status: 'OK', base: { revision: reader.baseRevision, localTaskCount } }
          },
          { owner: ticket.key, admit: () => this.#isAuthorized(ticket) },
        )
        if (!read.ok) return failure(storageErrorCode(read.reason))
        if (read.value.status !== 'OK') return failure(read.value.status)

        const preview = {
          version: 1 as const,
          status: 'ok' as const,
          restoreToken: '',
          baseRevision: formatRevision(read.value.base.revision),
          sourceFormatVersion: pipeline.backup.sourceFormatVersion,
          formatVersion: 4 as const,
          exportedAt: pipeline.backup.exportedAt,
          appVersion: pipeline.backup.appVersion,
          fileTaskCount: pipeline.backup.tasks.length,
          localTaskCount: read.value.base.localTaskCount,
          expiresInMs: BACKUP_PREVIEW_TTL_MS,
        }
        if (!fitsBackupPreviewBudget(preview)) return failure('RESOURCE_LIMIT')

        // Publica com o charge da preparação ainda sobreposto ao charge de parse; a publicação
        // reserva a preparação e falha sem efeito se não couber.
        const published = this.#registry.publish(ticket.key, {
          contextSequence,
          baseRevision: read.value.base.revision,
          sourceFormatVersion: pipeline.backup.sourceFormatVersion,
          exportedAt: pipeline.backup.exportedAt,
          appVersion: pipeline.backup.appVersion,
          fileTaskCount: pipeline.backup.tasks.length,
          localTaskCount: read.value.base.localTaskCount,
          tasks: pipeline.backup.tasks,
          chargeBytes: preparationCharge,
        })
        if (published.status !== 'ok') return failure('RESOURCE_LIMIT')

        // A preparação agora segura a única reserva; a de parse é liberada.
        this.#ledger.release(pipeline.reservation)
        return { ...preview, restoreToken: published.preparation.token }
      } catch {
        this.#ledger.release(pipeline.reservation)
        return failure('STORAGE_UNAVAILABLE')
      }
    } catch {
      return failure('STORAGE_UNAVAILABLE')
    } finally {
      this.#gate.release()
    }
  }

  /**
   * Confirma a substituição sobre a base exata da prévia. O token é consumido uma única vez; a
   * unidade decide/valida/verifica no mesmo commit e a conclusão serializada aplica a barreira de
   * época (APPLIED/UNCHANGED) antes de publicar. Rollback/falha não invalidam outras sessões.
   */
  async confirmBackupRestore(
    ticket: DocumentTicket,
    contextSequence: number,
    restoreToken: string,
  ): Promise<ConfirmBackupRestoreResult> {
    if (this.#contextSequence(ticket) !== contextSequence) return failure('STALE_CONTEXT')

    const consumed = this.#registry.consume(ticket.key, restoreToken)
    if (consumed.status === 'expired') return failure('BACKUP_PREVIEW_EXPIRED', { commitState: 'NOT_APPLIED' })
    if (consumed.status === 'invalid') return failure('BACKUP_PREVIEW_INVALID', { commitState: 'NOT_APPLIED' })
    const preparation: BackupPreparation = consumed.preparation

    let conclusionVerified = false
    try {
      const result = await this.#storage.run(
        (unit) =>
          restoreBackupInUnit(unit, {
            tasks: preparation.tasks,
            expectedGlobalRevision: preparation.baseRevision,
            now: this.#clock(),
          }),
        {
          owner: ticket.key,
          admit: () => this.#isAuthorized(ticket),
          onCompleted: (completion) => {
            if (!completion.result.ok) return
            const value = completion.result.value as BackupRestoreInUnitResult
            if (value.status !== 'APPLIED' && value.status !== 'UNCHANGED') return
            // Barreira síncrona, somente in-memory: nova época e preparações alheias descartadas.
            this.#undo.invalidateAll('BACKUP_RESTORED')
            this.#registry.invalidateAll()
            conclusionVerified = true
          },
        },
      )

      if (!result.ok) {
        if (result.reason === 'BACKUP_VERIFICATION_FAILED') {
          return failure('BACKUP_VERIFICATION_FAILED', { commitState: 'NOT_APPLIED' })
        }
        if (result.reason === 'UNCERTAIN') {
          // Commit/rollback incerto: barreira conservadora de recuperação sem declarar sucesso.
          this.#invalidateForRecovery()
          return failure('STORAGE_UNAVAILABLE', { commitState: 'UNKNOWN' })
        }
        return failure(storageErrorCode(result.reason), { commitState: 'NOT_APPLIED' })
      }

      const value = result.value
      if (value.status === 'BASE_CHANGED') return failure('BACKUP_BASE_CHANGED', { commitState: 'NOT_APPLIED' })
      if (value.status === 'SERIES_CONFLICT') return failure('SERIES_CONFLICT', { commitState: 'NOT_APPLIED' })

      return {
        version: 1,
        status: 'ok',
        outcome: value.status,
        revision: formatRevision(result.revision),
        restoredCount: value.restoredCount,
        verification: conclusionVerified ? 'VERIFIED' : 'PENDING',
        undoEpoch: this.#undo.epoch,
      }
    } catch {
      this.#invalidateForRecovery()
      return failure('STORAGE_UNAVAILABLE', { commitState: 'UNKNOWN' })
    }
  }

  /** Cancela a prévia própria; repetição idempotente; token alheio não afeta outra preparação. */
  cancelBackupRestore(restoreToken: string, documentKey: string): CancelBackupRestoreResult {
    const cancelled = this.#registry.cancel(documentKey, restoreToken)
    if (cancelled.status !== 'ok') return failure('BACKUP_PREVIEW_INVALID')
    return { version: 1, status: 'ok', cancelled: true }
  }

  #invalidateForRecovery(): void {
    try {
      this.#undo.invalidateAll('STORAGE_RECOVERED')
    } catch {
      // Sem época nova: a contenção do coordenador continua bloqueando até reopen.
    }
    this.#registry.invalidateAll()
  }
}
