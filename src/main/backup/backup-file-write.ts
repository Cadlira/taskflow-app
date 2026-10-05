// Gravação atômica do backup no main: temporário exclusivo no MESMO diretório, bytes completos,
// `sync`, fechamento e uma única substituição. O destino nunca é truncado/removido antes; não há
// fallback copy-delete; o cleanup remove somente o temporário próprio. Depois da substituição, a
// releitura exata de bytes confirma o arquivo ou produz aviso — sem segunda gravação nem rollback.
// Os pontos de falha são usados somente por testes/harness restrito; nunca pelo IPC.
import { randomBytes } from 'node:crypto'
import { open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import {
  captureDestinationFingerprint,
  sameDestinationFingerprint,
  type DestinationFingerprint,
} from './backup-destination.js'

export type BackupWriteFaultPoint =
  | 'temp:before-write'
  | 'temp:after-write'
  | 'temp:after-sync'
  | 'rename:before'
  | 'rename:after'
  | 'readback:before'

export interface BackupWriteFaults {
  /** Chamado em cada ponto; lançar simula a falha naquele ponto. */
  at?(point: BackupWriteFaultPoint): void
}

export type BackupWriteResult =
  | { status: 'SAVED'; bytes: number }
  | { status: 'SAVED_WITH_WARNING'; bytes: number }
  | { status: 'DESTINATION_CHANGED' }
  | { status: 'FAILED'; code: 'FILE_WRITE_FAILED' }

export interface WriteBackupOptions {
  destination: string
  /** Conteúdo completo já validado (UTF-8 sem BOM). */
  content: Buffer
  /** Fingerprint capturado depois da escolha; mudança observada antes da substituição recusa. */
  expectedFingerprint?: DestinationFingerprint | undefined
  /** Verificação exata de bytes do destino após a substituição (padrão: ativa). */
  readback?: boolean
  faults?: BackupWriteFaults
}

async function removeOwnTemporary(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath)
  } catch {
    // Somente o próprio temporário; ausência/falha não muda o resultado.
  }
}

async function readbackMatches(destination: string, expected: Buffer): Promise<boolean> {
  let handle
  try {
    handle = await open(destination, 'r')
    const buffer = Buffer.allocUnsafe(Math.min(expected.length + 1, 1024 * 1024))
    let offset = 0
    for (;;) {
      const length = Math.min(buffer.length, expected.length + 1 - offset)
      if (length <= 0) break
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      if (bytesRead === 0) break
      if (!buffer.subarray(0, bytesRead).equals(expected.subarray(offset, offset + bytesRead))) return false
      offset += bytesRead
      if (offset > expected.length) return false
    }
    return offset === expected.length
  } catch {
    return false
  } finally {
    try {
      await handle?.close()
    } catch {
      // Releitura é melhor esforço; a falha vira aviso, não erro de gravação.
    }
  }
}

/**
 * Grava `content` em temporário exclusivo (`wx`) no diretório do destino, sincroniza, fecha e
 * substitui com um único `rename`. Falha antes da substituição preserva o destino anterior; falha
 * posterior à substituição é aviso, nunca "arquivo original preservado".
 */
export async function writeBackupFile(options: WriteBackupOptions): Promise<BackupWriteResult> {
  const directory = path.dirname(options.destination)
  const temporary = path.join(
    directory,
    `.${path.basename(options.destination)}.${randomBytes(12).toString('base64url')}.tmp`,
  )

  let handle
  try {
    options.faults?.at?.('temp:before-write')
    handle = await open(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < options.content.length) {
      const { bytesWritten } = await handle.write(options.content, offset, options.content.length - offset)
      if (bytesWritten <= 0) throw new Error('short write')
      offset += bytesWritten
    }
    options.faults?.at?.('temp:after-write')
    await handle.sync()
    options.faults?.at?.('temp:after-sync')
    await handle.close()
    handle = undefined
  } catch {
    try {
      await handle?.close()
    } catch {
      // O temporário será removido abaixo.
    }
    await removeOwnTemporary(temporary)
    return { status: 'FAILED', code: 'FILE_WRITE_FAILED' }
  }

  // Mudança observável do destino entre a escolha e a substituição: recusa sem sobrescrever.
  const current = await captureDestinationFingerprint(options.destination)
  if (!sameDestinationFingerprint(current, options.expectedFingerprint)) {
    await removeOwnTemporary(temporary)
    return { status: 'DESTINATION_CHANGED' }
  }

  try {
    options.faults?.at?.('rename:before')
    await rename(temporary, options.destination)
  } catch {
    await removeOwnTemporary(temporary)
    return { status: 'FAILED', code: 'FILE_WRITE_FAILED' }
  }

  const bytes = options.content.length
  if (options.readback === false) return { status: 'SAVED', bytes }

  // Daqui em diante o arquivo já foi substituído: falha vira aviso, nunca rollback.
  try {
    options.faults?.at?.('rename:after')
    options.faults?.at?.('readback:before')
  } catch {
    return { status: 'SAVED_WITH_WARNING', bytes }
  }
  const verified = await readbackMatches(options.destination, options.content)
  return verified ? { status: 'SAVED', bytes } : { status: 'SAVED_WITH_WARNING', bytes }
}
