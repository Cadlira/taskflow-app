// Formato de arquivo `taskflow-backup` (recorte revisado de taskflow-extension@a763e7a
// src/application/backup/backup-file.ts, MIT, mesmo autor). O envelope, a cadeia de migrações e a
// validação estrita do arquivo são independentes do codec persistido (v1–v4), do schema SQL (2) e
// do versionamento da bridge: os números não se equivalem.
import type { Task } from '../../domain/task.js'

export const BACKUP_FORMAT = 'taskflow-backup'

/** Versão de formato gerada pela exportação e normalizada pela leitura. */
export const CURRENT_BACKUP_FORMAT_VERSION = 4

/** Limite simétrico do arquivo completo (bytes UTF-8), inclusive envelope e BOM de entrada. */
export const MAX_BACKUP_FILE_BYTES = 20 * 1024 * 1024

/** Conteúdo validado de um arquivo de backup já normalizado para a versão atual. */
export interface BackupFile {
  /** Versão declarada no arquivo original (1–4); nunca seleciona codec nem schema. */
  sourceFormatVersion: number
  /** Sempre a versão atual depois da cadeia de migrações. */
  formatVersion: typeof CURRENT_BACKUP_FORMAT_VERSION
  exportedAt: string
  appVersion: string
  tasks: Task[]
}

/**
 * O domínio sempre persiste instantes por `toISOString()`; formatos equivalentes são recusados.
 * A mesma checagem vale para `exportedAt` e para os instantes dentro das tarefas.
 */
export function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Nome do arquivo em hora local, no padrão `taskflow-backup-AAAA-MM-DD-HHmm.json`. */
export function backupFileName(now: Date): string {
  return `taskflow-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}.json`
}
