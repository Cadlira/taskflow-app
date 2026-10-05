// Cadeia de migrações do arquivo de backup (cópia revisada de taskflow-extension@a763e7a
// src/application/backup/backup-file.ts, MIT, mesmo autor). Nenhuma migração corrige valor
// legado: o que continuar inválido é recusado pela validação estrita da versão seguinte.
import { isRepresentableInstant } from '../../domain/task-reminders.js'

const MINUTE_MS = 60_000

/** Arquivo ainda em versão intermediária dentro da cadeia de migrações. */
export interface RawBackupFile {
  [key: string]: unknown
  format?: unknown
  formatVersion?: unknown
  exportedAt?: unknown
  app?: unknown
  tasks?: unknown
}

/** Converte a versão `i + 1` do formato na versão `i + 2`. */
export type BackupMigration = (file: RawBackupFile) => RawBackupFile

/**
 * Converte `lastTriggeredFor` no instante efetivo processado. Valores ausentes, malformados ou
 * fora do intervalo representável são preservados como estão para que a validação estrita da
 * versão 2 recuse o arquivo, em vez de descartá-los silenciosamente.
 */
function migrateProcessedFor(lastTriggeredFor: unknown, offsetMinutes: number): unknown {
  if (typeof lastTriggeredFor !== 'string') return lastTriggeredFor

  const timestamp = Date.parse(lastTriggeredFor)
  if (Number.isNaN(timestamp)) return lastTriggeredFor

  const processedMs = timestamp - offsetMinutes * MINUTE_MS
  return isRepresentableInstant(processedMs) ? new Date(processedMs).toISOString() : String(processedMs)
}

function migrateReminderToV2(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value

  const legacy = value as Record<string, unknown>
  const offsetMinutes = legacy['offsetMinutes']
  if (typeof offsetMinutes !== 'number' || !Number.isInteger(offsetMinutes) || offsetMinutes < 0) {
    return value
  }

  const migrated: Record<string, unknown> = { id: legacy['id'], type: 'OFFSET', offsetMinutes }
  if (legacy['lastTriggeredFor'] !== undefined) {
    migrated['processedFor'] = migrateProcessedFor(legacy['lastTriggeredFor'], offsetMinutes)
  }
  return migrated
}

function migrateTaskToV2(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value

  const task = value as Record<string, unknown>
  if (!Array.isArray(task['reminders'])) return value
  return { ...task, reminders: task['reminders'].map(migrateReminderToV2) }
}

const migrateBackupV1ToV2: BackupMigration = (file) => ({
  ...file,
  formatVersion: 2,
  tasks: Array.isArray(file.tasks) ? file.tasks.map(migrateTaskToV2) : file.tasks,
})

/** A versão 3 apenas admite tarefas de série; nenhuma tarefa existente ganha campos novos. */
const migrateBackupV2ToV3: BackupMigration = (file) => ({ ...file, formatVersion: 3 })

/**
 * A versão 4 exige a lista de subtarefas: cada tarefa que seja objeto recebe a lista vazia. Nada
 * mais é alterado; a validação posterior continua recusando o que for inválido.
 */
const migrateBackupV3ToV4: BackupMigration = (file) => ({
  ...file,
  formatVersion: 4,
  tasks: Array.isArray(file.tasks)
    ? file.tasks.map((task: unknown) =>
        typeof task === 'object' && task !== null && !Array.isArray(task) ? { ...task, subtasks: [] } : task,
      )
    : file.tasks,
})

/** Lista ordenada: a posição `i` converte a versão `i + 1` na `i + 2`. */
export const BACKUP_MIGRATIONS: readonly BackupMigration[] = [
  migrateBackupV1ToV2,
  migrateBackupV2ToV3,
  migrateBackupV3ToV4,
]

/** Aplica somente as migrações necessárias; migração ausente é recusa da cadeia. */
export function migrateBackupFile(
  file: RawBackupFile,
  fromVersion: number,
  currentVersion: number,
  migrations: readonly BackupMigration[] = BACKUP_MIGRATIONS,
): RawBackupFile | undefined {
  let migrated = file
  for (let from = fromVersion; from < currentVersion; from += 1) {
    const migration = migrations[from - 1]
    if (migration === undefined) return undefined
    migrated = migration(migrated)
  }
  return migrated
}
