// Leitura de arquivo de backup no main: handle único, arquivo regular e coleta limitada a
// `limite + 1` bytes, mesmo que o tamanho declarado minta ou o arquivo cresça. A decodificação é
// UTF-8 estrita com no máximo um BOM inicial opcional; a saída nunca inclui BOM. Nenhum caminho
// atravessa o IPC: o adaptador vive no proprietário.
import { open } from 'node:fs/promises'
import { MAX_BACKUP_FILE_BYTES } from '../../application/backup/backup-format.js'

export type BackupFileReadFailureCode = 'FILE_TOO_LARGE' | 'FILE_READ_FAILED' | 'INVALID_ENCODING'

export type BackupTextReadResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; reason: BackupFileReadFailureCode }

/** Handle mínimo de leitura: só o necessário para conferir regularidade e coletar bytes. */
export interface BackupReadHandle {
  stat(): Promise<{ isFile: boolean; size: number }>
  read(buffer: Buffer, length: number): Promise<{ bytesRead: number }>
  close(): Promise<void>
}

export interface BackupFileOpenPort {
  open(path: string): Promise<BackupReadHandle>
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe])
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff])
const READ_CHUNK_BYTES = 64 * 1024

/** Adaptador de produção: `open` segue link até o arquivo regular escolhido e recusa o resto. */
export function createNodeBackupFileOpenPort(): BackupFileOpenPort {
  return {
    async open(path: string): Promise<BackupReadHandle> {
      const handle = await open(path, 'r')
      return {
        stat: async () => {
          const stats = await handle.stat()
          return { isFile: stats.isFile(), size: stats.size }
        },
        read: async (buffer: Buffer, length: number) => {
          const { bytesRead } = await handle.read(buffer, 0, length, null)
          return { bytesRead }
        },
        close: async () => {
          await handle.close()
        },
      }
    },
  }
}

function startsWith(buffer: Buffer, prefix: Buffer): boolean {
  return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix)
}

/**
 * Decodifica UTF-8 estrito: rejeita UTF-16 (com ou sem BOM), BOM repetido, sequência malformada e
 * bytes inválidos. Um único BOM inicial é aceito e removido.
 */
export function decodeBackupText(bytes: Buffer): { ok: true; text: string } | { ok: false; reason: 'INVALID_ENCODING' } {
  let slice = bytes
  if (startsWith(slice, UTF8_BOM)) slice = slice.subarray(UTF8_BOM.length)
  if (startsWith(slice, UTF16_LE_BOM) || startsWith(slice, UTF16_BE_BOM)) {
    return { ok: false, reason: 'INVALID_ENCODING' }
  }
  if (startsWith(slice, UTF8_BOM)) return { ok: false, reason: 'INVALID_ENCODING' }

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    return { ok: true, text: decoder.decode(slice) }
  } catch {
    return { ok: false, reason: 'INVALID_ENCODING' }
  }
}

/**
 * Coleta os bytes do handle já aberto. O handle efetivo precisa ser arquivo regular; a coleta para
 * em `limite + 1` bytes, portanto um arquivo que cresça depois do `stat` é recusado sem leitura
 * ilimitada. Falha de I/O é distinta de excesso e de encoding.
 */
export async function readBackupTextFromHandle(
  handle: BackupReadHandle,
  limitBytes: number = MAX_BACKUP_FILE_BYTES,
): Promise<BackupTextReadResult> {
  let collected: Buffer[] = []
  let total = 0

  try {
    const stats = await handle.stat()
    if (!stats.isFile) return { ok: false, reason: 'FILE_READ_FAILED' }
    if (stats.size > limitBytes) return { ok: false, reason: 'FILE_TOO_LARGE' }

    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES)
    for (;;) {
      const remaining = limitBytes + 1 - total
      if (remaining <= 0) return { ok: false, reason: 'FILE_TOO_LARGE' }
      const { bytesRead } = await handle.read(buffer, Math.min(buffer.length, remaining))
      if (bytesRead === 0) break
      total += bytesRead
      if (total > limitBytes) return { ok: false, reason: 'FILE_TOO_LARGE' }
      collected.push(Buffer.from(buffer.subarray(0, bytesRead)))
    }
  } catch {
    return { ok: false, reason: 'FILE_READ_FAILED' }
  } finally {
    try {
      await handle.close()
    } catch {
      // Fechamento já não altera o resultado da leitura.
    }
  }

  const bytes = Buffer.concat(collected, total)
  collected = []
  const decoded = decodeBackupText(bytes)
  if (!decoded.ok) return decoded
  return { ok: true, text: decoded.text, bytes: total }
}

/** Abre e lê um único arquivo; `null` para caminho vazio/ausente (recusa segura). */
export async function readBackupTextFile(
  path: string | undefined,
  limitBytes: number = MAX_BACKUP_FILE_BYTES,
  openPort: BackupFileOpenPort = createNodeBackupFileOpenPort(),
): Promise<BackupTextReadResult> {
  if (typeof path !== 'string' || path.length === 0) return { ok: false, reason: 'FILE_READ_FAILED' }
  let handle: BackupReadHandle
  try {
    handle = await openPort.open(path)
  } catch {
    return { ok: false, reason: 'FILE_READ_FAILED' }
  }
  return readBackupTextFromHandle(handle, limitBytes)
}
