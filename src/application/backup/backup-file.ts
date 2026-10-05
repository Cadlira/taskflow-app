// Leitura do arquivo de backup: envelope, cadeia de migrações e validação estrita. Cópia revisada
// de taskflow-extension@a763e7a src/application/backup/backup-file.ts (MIT, mesmo autor); acrescenta
// a versão original (`sourceFormatVersion`) para a prévia e o relatório seguro de problemas.
import {
  BACKUP_FORMAT,
  CURRENT_BACKUP_FORMAT_VERSION,
  isCanonicalInstant,
  type BackupFile,
} from './backup-format.js'
import { BackupIssueCollector, type BackupIssue } from './backup-issues.js'
import { migrateBackupFile, type BackupMigration, type RawBackupFile } from './backup-migrations.js'
import { validateBackupTaskCollection } from './backup-validation.js'

export type BackupReadFailureCode =
  | 'INVALID_JSON'
  | 'NOT_TASKFLOW_BACKUP'
  | 'INVALID_FORMAT_VERSION'
  | 'NEWER_FORMAT_VERSION'
  | 'INVALID_STRUCTURE'
  | 'INVALID_TASKS'

export type BackupReadResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; reason: BackupReadFailureCode; issues?: BackupIssue[]; extraIssueCount?: number }

export interface ReadBackupOptions {
  /** Versão de formato suportada pelo leitor; padrão: versão atual. */
  currentVersion?: number
  /** Migrações disponíveis; padrão: as migrações de produção. */
  migrations?: readonly BackupMigration[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Lê o texto de um arquivo de backup, aplica as migrações necessárias e valida integralmente as
 * tarefas. Nenhuma estrutura desconhecida é aceita sem validação do domínio; nenhum valor legado
 * é corrigido para virar válido. Devolve a versão original e a versão normalizada.
 */
export function readBackupFile(text: string, options: ReadBackupOptions = {}): BackupReadResult {
  const currentVersion = options.currentVersion ?? CURRENT_BACKUP_FORMAT_VERSION

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'INVALID_JSON' }
  }

  if (!isRecord(parsed) || parsed['format'] !== BACKUP_FORMAT) {
    return { ok: false, reason: 'NOT_TASKFLOW_BACKUP' }
  }

  const version = parsed['formatVersion']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'INVALID_FORMAT_VERSION' }
  }

  if (version > currentVersion) {
    return { ok: false, reason: 'NEWER_FORMAT_VERSION' }
  }

  const migrated = migrateBackupFile(
    parsed as RawBackupFile,
    version,
    currentVersion,
    options.migrations,
  )
  if (migrated === undefined) return { ok: false, reason: 'INVALID_FORMAT_VERSION' }

  if (!isCanonicalInstant(migrated.exportedAt)) {
    return { ok: false, reason: 'INVALID_STRUCTURE' }
  }

  if (
    !isRecord(migrated.app) ||
    typeof migrated.app['version'] !== 'string' ||
    migrated.app['version'] === ''
  ) {
    return { ok: false, reason: 'INVALID_STRUCTURE' }
  }

  if (!Array.isArray(migrated.tasks)) {
    return { ok: false, reason: 'INVALID_STRUCTURE' }
  }

  const collector = new BackupIssueCollector()
  const tasks = validateBackupTaskCollection(migrated.tasks as unknown[], collector)
  if (tasks === undefined) {
    const report = collector.report()
    return {
      ok: false,
      reason: 'INVALID_TASKS',
      ...(report.issues.length > 0 && { issues: report.issues }),
      ...(report.extraIssueCount > 0 && { extraIssueCount: report.extraIssueCount }),
    }
  }

  return {
    ok: true,
    backup: {
      sourceFormatVersion: version,
      formatVersion: CURRENT_BACKUP_FORMAT_VERSION,
      exportedAt: migrated.exportedAt,
      appVersion: migrated.app['version'],
      tasks,
    },
  }
}

export { CURRENT_BACKUP_FORMAT_VERSION, BACKUP_FORMAT }
