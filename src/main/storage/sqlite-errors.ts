import { storageFailureReasonOf, type StorageFailureReason } from '../../application/storage/task-storage-error.js'

// Códigos primários de resultado do SQLite (https://sqlite.org/rescode.html).
const SQLITE_PERM = 3
const SQLITE_BUSY = 5
const SQLITE_LOCKED = 6
const SQLITE_READONLY = 8
const SQLITE_IOERR = 10
const SQLITE_CORRUPT = 11
const SQLITE_CANTOPEN = 14
const SQLITE_NOTADB = 26

/** Código primário do erro do `node:sqlite`, quando houver. Nada além do número é usado. */
export function sqliteResultCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { code?: unknown; errcode?: unknown }
  if (candidate.code !== 'ERR_SQLITE_ERROR' || typeof candidate.errcode !== 'number') return undefined
  return candidate.errcode & 0xff
}

/**
 * Classifica um erro para uma razão portável. Mensagem, stack, SQL e caminho do erro original
 * ficam no main e não são propagados.
 */
export function classifyStorageError(error: unknown): StorageFailureReason {
  const reason = storageFailureReasonOf(error)
  if (reason !== undefined) return reason

  const code = sqliteResultCode(error)
  if (code === SQLITE_BUSY || code === SQLITE_LOCKED) return 'LOCKED'
  if (code === SQLITE_CORRUPT || code === SQLITE_NOTADB) return 'CORRUPTED_DATA'
  return 'UNAVAILABLE'
}

/**
 * Falhas de ambiente (permissão, I/O, abertura) deixam a conexão em estado que só um reopen
 * validado esclarece. Disco cheio e violações de regra revertem e a conexão segue válida.
 */
export function requiresReopen(error: unknown): boolean {
  const code = sqliteResultCode(error)
  return code === SQLITE_PERM || code === SQLITE_READONLY || code === SQLITE_IOERR || code === SQLITE_CANTOPEN
}
