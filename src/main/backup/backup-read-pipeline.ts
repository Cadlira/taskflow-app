// Pipeline de leitura de um arquivo de backup: leitura limitada → reserva lógica → scanner antes
// de parse → parse/migração/validação. O charge de parse é reservado antes de materializar os
// objetos e mantido até o chamador preparar a cópia (ou liberá-lo em caso de recusa). Tudo vive no
// main; nenhum texto/path atravessa o IPC.
import {
  readBackupFile,
  type BackupReadFailureCode,
} from '../../application/backup/backup-file.js'
import { MAX_BACKUP_FILE_BYTES, type BackupFile } from '../../application/backup/backup-format.js'
import {
  backupParseChargeBytes,
  BackupResourceLedger,
  type BackupReservation,
  type BackupReserveResult,
} from '../../application/backup/backup-resources.js'
import { scanBackupJson } from '../../application/backup/backup-scanner.js'
import type { BackupIssue } from '../../application/backup/backup-issues.js'
import { readBackupTextFile, type BackupFileOpenPort } from './backup-file-access.js'

export type BackupPipelineFailureCode =
  | BackupReadFailureCode
  | 'FILE_TOO_LARGE'
  | 'FILE_READ_FAILED'
  | 'INVALID_ENCODING'
  | 'RESOURCE_LIMIT'

export type BackupPipelineResult =
  | {
      ok: true
      backup: BackupFile
      fileBytes: number
      nodeCount: number
      /** Reserva de parse ativa; o chamador troca/libera após a preparação. */
      reservation: BackupReservation
    }
  | {
      ok: false
      code: BackupPipelineFailureCode
      issues?: BackupIssue[]
      extraIssueCount?: number
    }

export interface ReadBackupPipelineOptions {
  path: string | undefined
  ledger: BackupResourceLedger
  openPort?: BackupFileOpenPort
  limitBytes?: number
}

/**
 * Lê e valida um arquivo sob o orçamento global. Em qualquer recusa nada fica reservado; em
 * sucesso, a reserva de parse permanece ativa para o chamador converter em preparação.
 */
export async function readBackupPipeline(options: ReadBackupPipelineOptions): Promise<BackupPipelineResult> {
  const limit = options.limitBytes ?? MAX_BACKUP_FILE_BYTES
  const read =
    options.openPort === undefined
      ? await readBackupTextFile(options.path, limit)
      : await readBackupTextFile(options.path, limit, options.openPort)
  if (!read.ok) return { ok: false, code: read.reason }

  // Reserva inicial (string/decodificação) antes da varredura; depois converte na charge de parse.
  const initial = options.ledger.reserve(backupParseChargeBytes(read.bytes, 0))
  if (initial.status !== 'ok') return { ok: false, code: 'RESOURCE_LIMIT' }

  let reservation: BackupReservation = initial.reservation
  try {
    const scan = scanBackupJson(read.text)
    if (!scan.ok) {
      options.ledger.release(reservation)
      return { ok: false, code: scan.reason }
    }

    const replaced: BackupReserveResult = options.ledger.replace(
      reservation,
      backupParseChargeBytes(read.bytes, scan.nodes),
    )
    if (replaced.status !== 'ok') {
      options.ledger.release(reservation)
      return { ok: false, code: 'RESOURCE_LIMIT' }
    }
    reservation = replaced.reservation

    const parsed = readBackupFile(read.text)
    if (!parsed.ok) {
      options.ledger.release(reservation)
      return {
        ok: false,
        code: parsed.reason,
        ...(parsed.issues !== undefined && { issues: parsed.issues }),
        ...(parsed.extraIssueCount !== undefined && { extraIssueCount: parsed.extraIssueCount }),
      }
    }

    return {
      ok: true,
      backup: parsed.backup,
      fileBytes: read.bytes,
      nodeCount: scan.nodes,
      reservation,
    }
  } catch {
    options.ledger.release(reservation)
    return { ok: false, code: 'RESOURCE_LIMIT' }
  }
}
