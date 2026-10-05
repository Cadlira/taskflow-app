// Serialização incremental do arquivo v4: os pedaços são medidos em bytes UTF-8 ANTES de existir a
// string/cópia binária completa; excedente recusa com `FILE_TOO_LARGE` sem truncar. A saída não
// tem BOM.
import type { Task } from '../../domain/task.js'
import { utf8ByteLength } from '../../contracts/text.js'
import {
  BACKUP_FORMAT,
  CURRENT_BACKUP_FORMAT_VERSION,
  MAX_BACKUP_FILE_BYTES,
} from './backup-format.js'

export interface EncodeBackupOptions {
  /** Instante ISO 8601 UTC do snapshot capturado. */
  exportedAt: string
  /** Versão do app que gerou o arquivo; apenas informativa. */
  appVersion: string
  /** Limite em bytes; injetável para as provas. */
  limitBytes?: number
}

export type BackupEncodeResult =
  | { ok: true; chunks: string[]; bytes: number }
  | { ok: false; reason: 'FILE_TOO_LARGE' | 'INVALID_INPUT' }

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

/**
 * Codifica o envelope com a mesma forma do formato original (indentação de 2 espaços, chaves
 * exatas), em pedaços independentes. A contagem de bytes acontece a cada pedaço; ao ultrapassar o
 * limite a serialização para sem materializar o restante.
 */
export function encodeBackupChunks(tasks: readonly Task[], options: EncodeBackupOptions): BackupEncodeResult {
  const limit = options.limitBytes ?? MAX_BACKUP_FILE_BYTES
  if (!Number.isSafeInteger(limit) || limit <= 0) return { ok: false, reason: 'INVALID_INPUT' }

  const chunks: string[] = []
  let bytes = 0

  function push(chunk: string): boolean {
    const chunkBytes = utf8ByteLength(chunk)
    if (bytes + chunkBytes > limit) return false
    chunks.push(chunk)
    bytes += chunkBytes
    return true
  }

  const header =
    `{\n` +
    `  "format": ${JSON.stringify(BACKUP_FORMAT)},\n` +
    `  "formatVersion": ${CURRENT_BACKUP_FORMAT_VERSION},\n` +
    `  "exportedAt": ${JSON.stringify(options.exportedAt)},\n` +
    `  "app": {\n` +
    `    "version": ${JSON.stringify(options.appVersion)}\n` +
    `  },\n` +
    `  "tasks": [`
  if (!push(header)) return { ok: false, reason: 'FILE_TOO_LARGE' }

  for (const [index, task] of tasks.entries()) {
    const body = indent(JSON.stringify(task, null, 2), 4)
    if (!push(index === 0 ? `\n${body}` : `,\n${body}`)) return { ok: false, reason: 'FILE_TOO_LARGE' }
  }

  const tail = tasks.length === 0 ? `]\n}` : `\n  ]\n}`
  if (!push(tail)) return { ok: false, reason: 'FILE_TOO_LARGE' }

  return { ok: true, chunks, bytes }
}

/** Junta os pedaços já medidos; só chamar depois de `encodeBackupChunks` ter aceitado o limite. */
export function joinBackupChunks(chunks: readonly string[]): string {
  return chunks.join('')
}
