// Cliente local dos quatro wrappers de backup: valida o request antes de invocar e a resposta
// antes de devolver ao renderer. O transporte é fechado aos canais do catálogo; nenhum path,
// conteúdo ou função atravessa.
import {
  BACKUP_CANCEL_CHANNEL,
  BACKUP_CONFIRM_CHANNEL,
  BACKUP_EXPORT_CHANNEL,
  BACKUP_PREPARE_CHANNEL,
  parseCancelBackupRestoreRequest,
  parseCancelBackupRestoreResult,
  parseConfirmBackupRestoreRequest,
  parseConfirmBackupRestoreResult,
  parseExportBackupRequest,
  parseExportBackupResult,
  parsePrepareBackupRestoreRequest,
  parsePrepareBackupRestoreResult,
  type CancelBackupRestoreRequest,
  type CancelBackupRestoreResult,
  type ConfirmBackupRestoreRequest,
  type ConfirmBackupRestoreResult,
  type ExportBackupRequest,
  type ExportBackupResult,
} from '../../contracts/backup.js'

export interface BackupCommandTransport {
  invoke(channel: string, request: unknown): Promise<unknown>
}

export interface BackupCommandClient {
  exportBackup(request: unknown): Promise<ExportBackupResult>
  prepareBackupRestore(request: unknown): Promise<import('../../contracts/backup.js').PrepareBackupRestoreResult>
  confirmBackupRestore(request: unknown): Promise<ConfirmBackupRestoreResult>
  cancelBackupRestore(request: unknown): Promise<CancelBackupRestoreResult>
}

function unavailable(): { version: 1; status: 'error'; code: 'STORAGE_UNAVAILABLE' } {
  return { version: 1, status: 'error', code: 'STORAGE_UNAVAILABLE' }
}

function invalid(): { version: 1; status: 'error'; code: 'INVALID_REQUEST' } {
  return { version: 1, status: 'error', code: 'INVALID_REQUEST' }
}

export function createBackupCommandClient(transport: BackupCommandTransport): BackupCommandClient {
  return {
    async exportBackup(request: unknown): Promise<ExportBackupResult> {
      const parsed: ExportBackupRequest | null = parseExportBackupRequest(request)
      if (parsed === null) return invalid()
      return parseExportBackupResult(await transport.invoke(BACKUP_EXPORT_CHANNEL, parsed)) ?? unavailable()
    },

    async prepareBackupRestore(request: unknown) {
      const parsed = parsePrepareBackupRestoreRequest(request)
      if (parsed === null) return invalid()
      return parsePrepareBackupRestoreResult(await transport.invoke(BACKUP_PREPARE_CHANNEL, parsed)) ?? unavailable()
    },

    async confirmBackupRestore(request: unknown): Promise<ConfirmBackupRestoreResult> {
      const parsed: ConfirmBackupRestoreRequest | null = parseConfirmBackupRestoreRequest(request)
      if (parsed === null) return invalid()
      return parseConfirmBackupRestoreResult(await transport.invoke(BACKUP_CONFIRM_CHANNEL, parsed)) ?? unavailable()
    },

    async cancelBackupRestore(request: unknown): Promise<CancelBackupRestoreResult> {
      const parsed: CancelBackupRestoreRequest | null = parseCancelBackupRestoreRequest(request)
      if (parsed === null) return invalid()
      return parseCancelBackupRestoreResult(await transport.invoke(BACKUP_CANCEL_CHANNEL, parsed)) ?? unavailable()
    },
  }
}
