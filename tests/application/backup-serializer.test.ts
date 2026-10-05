import { describe, expect, it } from 'vitest'
import type { Task } from '../../src/domain/task.js'
import { readBackupFile } from '../../src/application/backup/backup-file.js'
import { BackupIssueCollector } from '../../src/application/backup/backup-issues.js'
import { encodeBackupChunks, joinBackupChunks } from '../../src/application/backup/backup-serializer.js'
import { validateBackupTask } from '../../src/application/backup/backup-validation.js'
import { buildTask } from '../support/task-fixtures.js'

const EXPORTED_AT = '2026-10-05T12:00:00.000Z'

function encoded(tasks: Task[], limitBytes?: number): string {
  const result = encodeBackupChunks(tasks, {
    exportedAt: EXPORTED_AT,
    appVersion: '0.1.0',
    ...(limitBytes !== undefined && { limitBytes }),
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('encode failed')
  return joinBackupChunks(result.chunks)
}

describe('encodeBackupChunks (B04)', () => {
  it('gera a forma exata do arquivo com indentação, sem BOM e validity pelo próprio leitor', () => {
    const task = buildTask({
      dueAt: '2026-10-10T12:00:00.000Z',
      seriesId: 'serie-1',
      recurrence: { frequency: 'WEEKLY', weekdays: [1, 4] },
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }],
      subtasks: [
        { id: 's1', title: 'Item', done: false },
        { id: 's2', title: 'Outro', done: true },
      ],
      tags: ['casa', 'trabalho'],
    })

    const content = encoded([task])
    expect(content).toBe(
      JSON.stringify(
        {
          format: 'taskflow-backup',
          formatVersion: 4,
          exportedAt: EXPORTED_AT,
          app: { version: '0.1.0' },
          tasks: [task],
        },
        null,
        2,
      ),
    )
    expect(content.charCodeAt(0)).not.toBe(0xfeff)
    expect(content.split('\n')[1]).toBe('  "format": "taskflow-backup",')
    expect(content.split('\n')[2]).toBe('  "formatVersion": 4,')

    const read = readBackupFile(content)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.backup.sourceFormatVersion).toBe(4)
    expect(read.backup.tasks).toEqual([task])
  })

  it('gera arquivo válido com zero tarefas', () => {
    const content = encoded([])
    expect(readBackupFile(content)).toEqual({
      ok: true,
      backup: { sourceFormatVersion: 4, formatVersion: 4, exportedAt: EXPORTED_AT, appVersion: '0.1.0', tasks: [] },
    })
  })

  it('recusa antes de materializar o arquivo completo quando excede o limite', () => {
    const tasks = Array.from({ length: 4 }, (_, index) =>
      buildTask({ id: `t-${index}`, description: 'x'.repeat(200) }),
    )
    const result = encodeBackupChunks(tasks, { exportedAt: EXPORTED_AT, appVersion: '0.1.0', limitBytes: 600 })
    expect(result).toEqual({ ok: false, reason: 'FILE_TOO_LARGE' })

    const exact = encodeBackupChunks([tasks[0]!], { exportedAt: EXPORTED_AT, appVersion: '0.1.0', limitBytes: 10_000 })
    expect(exact.ok).toBe(true)
    if (exact.ok) {
      // O limite vale para os bytes reais: reduzir um byte recusa o mesmo conteúdo.
      const tighter = encodeBackupChunks([tasks[0]!], {
        exportedAt: EXPORTED_AT,
        appVersion: '0.1.0',
        limitBytes: exact.bytes - 1,
      })
      expect(tighter).toEqual({ ok: false, reason: 'FILE_TOO_LARGE' })
    }
  })

  it('projeta a tarefa validada: sentinelas desconhecidas não entram no arquivo', () => {
    const collector = new BackupIssueCollector()
    const raw = {
      ...buildTask(),
      trashSentinel: 'nao-entra',
      undoToken: 'nao-entra',
      metadata: { sql: true },
      recurrence: undefined,
    }
    const projected = validateBackupTask(raw, 0, collector)
    expect(projected).toBeDefined()
    const content = encoded([projected as Task])
    expect(content).not.toContain('nao-entra')
    expect(content).not.toContain('trashSentinel')
    expect(content).not.toContain('undoToken')
    expect(content).not.toContain('"metadata"')
  })

  it('recusa conteúdo histórico não exportável de forma integral', () => {
    const collector = new BackupIssueCollector()
    const historical = { ...buildTask(), title: '  espaços históricos  ' }
    expect(validateBackupTask(historical, 0, collector)).toBeUndefined()
    expect(collector.total).toBeGreaterThan(0)
    const report = collector.report()
    expect(report.issues[0]).toMatchObject({ field: 'title', code: 'INVALID_VALUE' })
  })
})
