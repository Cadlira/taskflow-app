// Coletor limitado de problemas da validação estrita do backup. Os problemas são dados seguros:
// campo finito, código finito e índices posicionais; nunca título, mensagem livre, valor, URL ou
// caminho. Somente os primeiros cinco ficam retidos; o restante vira contagem.
import { utf8ByteLength } from '../../contracts/text.js'
import type { BackupFile } from './backup-format.js'

/** Quantos problemas são retidos com detalhe; o excedente só é contado. */
export const BACKUP_ISSUE_LIMIT = 5

export const BACKUP_ISSUE_FIELDS = [
  'task',
  'id',
  'title',
  'description',
  'requester',
  'assignee',
  'status',
  'priority',
  'dueAt',
  'reminders',
  'seriesId',
  'recurrence',
  'subtasks',
  'tags',
  'sourceUrl',
  'createdAt',
  'updatedAt',
  'completedAt',
] as const

export type BackupIssueField = (typeof BACKUP_ISSUE_FIELDS)[number]

export const BACKUP_ISSUE_CODES = [
  'REQUIRED',
  'INVALID_VALUE',
  'TOO_LONG',
  'TOO_MANY',
  'INVALID_DATE',
  'INVALID_URL',
  'DUPLICATE',
] as const

export type BackupIssueCode = (typeof BACKUP_ISSUE_CODES)[number]

export interface BackupIssue {
  /** Posição da tarefa no arquivo, começando em zero. */
  taskIndex: number
  field: BackupIssueField
  code: BackupIssueCode
  /** Posição do lembrete dentro da tarefa, quando o problema é do item. */
  reminderIndex?: number
  /** Posição da subtarefa dentro da tarefa, quando o problema é do item. */
  subtaskIndex?: number
}

export interface BackupIssueReport {
  issues: BackupIssue[]
  extraIssueCount: number
}

/** Retém no máximo cinco problemas seguros e conta o restante sem materializar a lista inteira. */
export class BackupIssueCollector {
  readonly #issues: BackupIssue[] = []
  #total = 0

  add(issue: BackupIssue): void {
    this.#total += 1
    if (this.#issues.length < BACKUP_ISSUE_LIMIT) this.#issues.push(issue)
  }

  get total(): number {
    return this.#total
  }

  get issues(): readonly BackupIssue[] {
    return this.#issues
  }

  get extraIssueCount(): number {
    return this.#total - this.#issues.length
  }

  report(): BackupIssueReport {
    return { issues: [...this.#issues], extraIssueCount: this.extraIssueCount }
  }
}

/** Problema de exportação: conteúdo local aceito pelo codec, mas recusado pelo formato de arquivo. */
export function localDataIssuesOf(report: BackupIssueReport): BackupIssueReport {
  return report
}

/**
 * Bytes UTF-8 da serialização canônica (chaves na ordem do modelo) usada como charge lógico.
 * `undefined` conta como ausente, como no comparador e no JSON.
 */
export function canonicalTaskBytes(task: unknown): number {
  return utf8ByteLength(JSON.stringify(task))
}

/**
 * Bytes do arquivo completo serializado em memória (somente para medição interna; o limite real
 * é conferido incrementalmente pela serialização).
 */
export function backupFileBytes(backup: BackupFile): number {
  return utf8ByteLength(
    JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: backup.formatVersion,
      exportedAt: backup.exportedAt,
      app: { version: backup.appVersion },
      tasks: backup.tasks,
    }),
  )
}
