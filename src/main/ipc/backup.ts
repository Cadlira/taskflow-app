// IPC dos quatro wrappers de backup v1: autoriza o remetente antes de olhar o request, valida o
// schema antes de qualquer acesso e revalida a sessão antes de responder. Nenhum path/JSON/Task
// atravessa; o serviço do main mantém arquivo/token/preparação no proprietário.
import {
  parseCancelBackupRestoreRequest,
  parseConfirmBackupRestoreRequest,
  parseExportBackupRequest,
  parsePrepareBackupRestoreRequest,
  type BackupErrorCode,
  type BackupFailure,
  type CancelBackupRestoreResult,
  type ConfirmBackupRestoreResult,
  type ExportBackupResult,
  type PrepareBackupRestoreResult,
} from '../../contracts/backup.js'
import type { DocumentTicket, InvocationLike } from './document-sessions.js'
import type { BackupCommandServices } from '../backup/backup-restore-service.js'

export interface BackupCommandSessions {
  authorize(event: InvocationLike): DocumentTicket | null
  isCurrent(ticket: DocumentTicket): boolean
}

export interface BackupCommandIpcOptions {
  sessions: BackupCommandSessions
  services: BackupCommandServices
}

function failure(code: BackupErrorCode): BackupFailure {
  return { version: 1, status: 'error', code }
}

export class BackupCommandIpcService {
  readonly #sessions: BackupCommandSessions
  readonly #services: BackupCommandServices

  constructor(options: BackupCommandIpcOptions) {
    this.#sessions = options.sessions
    this.#services = options.services
  }

  async handleExport(event: InvocationLike, request: unknown): Promise<ExportBackupResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return failure('UNAUTHORIZED')
      const parsed = parseExportBackupRequest(request)
      if (parsed === null) return failure('INVALID_REQUEST')

      const result = await this.#services.exportBackup(ticket, parsed.contextSequence)
      // Resultado tardio não é entregue ao documento novo; o arquivo concluído permanece.
      if (!this.#sessions.isCurrent(ticket)) return failure('SESSION_CLOSED')
      return result
    } catch {
      return failure('STORAGE_UNAVAILABLE')
    }
  }

  async handlePrepare(event: InvocationLike, request: unknown): Promise<PrepareBackupRestoreResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return failure('UNAUTHORIZED')
      const parsed = parsePrepareBackupRestoreRequest(request)
      if (parsed === null) return failure('INVALID_REQUEST')

      const result = await this.#services.prepareBackupRestore(ticket, parsed.contextSequence)
      if (!this.#sessions.isCurrent(ticket)) return failure('SESSION_CLOSED')
      return result
    } catch {
      return failure('STORAGE_UNAVAILABLE')
    }
  }

  async handleConfirm(event: InvocationLike, request: unknown): Promise<ConfirmBackupRestoreResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return failure('UNAUTHORIZED')
      const parsed = parseConfirmBackupRestoreRequest(request)
      if (parsed === null) return failure('INVALID_REQUEST')

      const result = await this.#services.confirmBackupRestore(ticket, parsed.contextSequence, parsed.restoreToken)
      if (!this.#sessions.isCurrent(ticket)) return failure('SESSION_CLOSED')
      return result
    } catch {
      return failure('STORAGE_UNAVAILABLE')
    }
  }

  async handleCancel(event: InvocationLike, request: unknown): Promise<CancelBackupRestoreResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return failure('UNAUTHORIZED')
      const parsed = parseCancelBackupRestoreRequest(request)
      if (parsed === null) return failure('INVALID_REQUEST')

      const result = this.#services.cancelBackupRestore(parsed.restoreToken, ticket.key)
      if (!this.#sessions.isCurrent(ticket)) return failure('SESSION_CLOSED')
      return result
    } catch {
      return failure('STORAGE_UNAVAILABLE')
    }
  }
}
