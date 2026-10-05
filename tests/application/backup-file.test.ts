import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBackupFile } from '../../src/application/backup/backup-file.js'
import { backupFileName, isCanonicalInstant } from '../../src/application/backup/backup-format.js'
import { BackupIssueCollector } from '../../src/application/backup/backup-issues.js'
import { BACKUP_MIGRATIONS } from '../../src/application/backup/backup-migrations.js'
import { validateBackupTaskCollection } from '../../src/application/backup/backup-validation.js'

// Fixtures fictícias revisadas da origem (tarefas fictícias, sem dados reais).
function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'tests', 'fixtures', 'backups', name), 'utf8')
}

const V1 = fixture('taskflow-backup-v1.json')
const V2 = fixture('taskflow-backup-v2.json')
const V3 = fixture('taskflow-backup-v3.json')
const V4 = fixture('taskflow-backup-v4.json')

describe('readBackupFile — fixtures v1–v4 (B01)', () => {
  it('aceita v1, converte lastTriggeredFor por OFFSET e separa a versão original', () => {
    const result = readBackupFile(V1)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.backup.sourceFormatVersion).toBe(1)
    expect(result.backup.formatVersion).toBe(4)
    expect(result.backup.exportedAt).toBe('2026-09-13T18:30:00.000Z')
    expect(result.backup.appVersion).toBe('0.1.0')
    expect(result.backup.tasks).toHaveLength(4)

    const first = result.backup.tasks[0]!
    expect(first.subtasks).toEqual([])
    expect(first.reminders).toEqual([
      { id: 'rem-1', type: 'OFFSET', offsetMinutes: 60 },
      { id: 'rem-2', type: 'OFFSET', offsetMinutes: 1440, processedFor: '2026-09-19T12:00:00.000Z' },
    ])
    expect(first).not.toHaveProperty('unknownTaskField')
    expect(result.backup.tasks[3]).not.toHaveProperty('legacy')
    expect(result.backup.tasks[2]).toMatchObject({ status: 'DONE', completedAt: '2026-09-08T17:45:00.000Z' })
  })

  it('aceita v2 preservando OFFSET/AT e marcadores', () => {
    const result = readBackupFile(V2)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.backup.sourceFormatVersion).toBe(2)
    expect(result.backup.formatVersion).toBe(4)
    expect(result.backup.tasks).toHaveLength(3)
    expect(result.backup.tasks[0]!.reminders).toEqual([
      { id: 'rem-rel-60', type: 'OFFSET', offsetMinutes: 60 },
      { id: 'rem-rel-processed', type: 'OFFSET', offsetMinutes: 1440, processedFor: '2026-09-19T12:00:00.000Z' },
      { id: 'rem-abs-pending', type: 'AT', at: '2026-09-18T09:30:00.000Z' },
      { id: 'rem-abs-processed', type: 'AT', at: '2026-09-17T08:00:00.000Z', processedFor: '2026-09-17T08:00:00.000Z' },
    ])
    expect(result.backup.tasks.every((task) => task.subtasks.length === 0)).toBe(true)
  })

  it('aceita v3 preservando série, regra, âncora e until, sem inventar subtarefas', () => {
    const result = readBackupFile(V3)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.backup.sourceFormatVersion).toBe(3)
    expect(result.backup.tasks).toHaveLength(3)
    const [closed, carrier, daily] = result.backup.tasks
    expect(closed).toMatchObject({ seriesId: 'serie-energia', status: 'DONE' })
    expect(closed!.recurrence).toBeUndefined()
    expect(carrier).toMatchObject({ seriesId: 'serie-energia', recurrence: { frequency: 'MONTHLY', dayOfMonth: 10 } })
    expect(daily!.recurrence).toEqual({
      anchorAt: '2026-09-05T12:00:00.000Z',
      until: '2026-12-31T23:59:00.000Z',
      frequency: 'DAILY',
      intervalDays: 15,
    })
    expect(result.backup.tasks.every((task) => task.subtasks.length === 0)).toBe(true)
  })

  it('aceita v4 com subtarefas completas na ordem e extras aninhados descartados', () => {
    const result = readBackupFile(V4)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.backup.sourceFormatVersion).toBe(4)
    expect(result.backup.tasks).toHaveLength(4)
    const subtaskCount = result.backup.tasks.reduce((total, task) => total + task.subtasks.length, 0)
    expect(subtaskCount).toBe(7)
    expect(result.backup.tasks[1]!.subtasks).toEqual([
      { id: 'sub-sala', title: 'Reservar sala', done: true },
      { id: 'sub-pauta', title: 'Enviar pauta', done: false },
      { id: 'sub-numeros', title: 'Revisar os números', done: true },
    ])
    expect(result.backup.tasks[1]!.subtasks[1]).not.toHaveProperty('unknownSubtaskField')
  })
})

describe('readBackupFile — recusas integrais (B01)', () => {
  it('recusa JSON inválido/vazio sem confundir com envelope válido de zero tarefas', () => {
    expect(readBackupFile('{ não é json')).toEqual({ ok: false, reason: 'INVALID_JSON' })
    expect(readBackupFile('')).toEqual({ ok: false, reason: 'INVALID_JSON' })
    const empty = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-09-16T18:30:00.000Z',
      app: { version: '0.4.0' },
      tasks: [],
    })
    expect(readBackupFile(empty)).toEqual({
      ok: true,
      backup: { sourceFormatVersion: 4, formatVersion: 4, exportedAt: '2026-09-16T18:30:00.000Z', appVersion: '0.4.0', tasks: [] },
    })
  })

  it('recusa envelope, versão e estrutura inválidos', () => {
    expect(readBackupFile('{"format":"outro"}')).toEqual({ ok: false, reason: 'NOT_TASKFLOW_BACKUP' })
    expect(readBackupFile(JSON.stringify({ format: 'taskflow-backup', formatVersion: 0 }))).toEqual({
      ok: false,
      reason: 'INVALID_FORMAT_VERSION',
    })
    expect(readBackupFile(JSON.stringify({ format: 'taskflow-backup', formatVersion: 5 }))).toEqual({
      ok: false,
      reason: 'NEWER_FORMAT_VERSION',
    })
    const broken = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-09-16T18:30:00.000',
      app: { version: '1' },
      tasks: [],
    })
    expect(readBackupFile(broken)).toEqual({ ok: false, reason: 'INVALID_STRUCTURE' })
    const noTasks = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-09-16T18:30:00.000Z',
      app: { version: '' },
      tasks: [],
    })
    expect(readBackupFile(noTasks)).toEqual({ ok: false, reason: 'INVALID_STRUCTURE' })
  })

  it('recusa migração ausente sem completar a cadeia', () => {
    const result = readBackupFile(V1, { migrations: [] })
    expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT_VERSION' })
    expect(BACKUP_MIGRATIONS).toHaveLength(3)
  })

  it('não corrige lastTriggeredFor inválido do v1: recusa o arquivo', () => {
    const invalid = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 1,
      exportedAt: '2026-09-13T18:30:00.000Z',
      app: { version: '0.1.0' },
      tasks: [
        {
          id: 'x',
          title: 'x',
          status: 'TODO',
          priority: 'LOW',
          dueAt: '2026-09-20T12:00:00.000Z',
          reminders: [{ id: 'r', offsetMinutes: 60, lastTriggeredFor: 'não-é-data' }],
          tags: [],
          createdAt: '2026-09-10T09:00:00.000Z',
          updatedAt: '2026-09-10T09:00:00.000Z',
        },
      ],
    })
    const result = readBackupFile(invalid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('INVALID_TASKS')
    expect(result.issues?.map((issue) => issue.field)).toContain('reminders')
  })
})

describe('validação integral e coletor limitado (B01/B02)', () => {
  it('limita a cinco problemas seguros com contagem restante, sem título/mensagem', () => {
    const collector = new BackupIssueCollector()
    const tasks = Array.from({ length: 8 }, () => ({
      id: '',
      title: '',
      status: 'NOPE',
      priority: 'NOPE',
      reminders: [],
      tags: [],
      createdAt: 'não',
      updatedAt: 'não',
    }))
    const result = validateBackupTaskCollection(tasks, collector)
    expect(result).toBeUndefined()
    const report = collector.report()
    expect(report.issues).toHaveLength(5)
    expect(report.extraIssueCount).toBeGreaterThan(0)
    for (const issue of report.issues) {
      const keys = Object.keys(issue).sort()
      expect(keys).toEqual(expect.arrayContaining(['taskIndex', 'field', 'code']))
      expect(keys.every((key) => ['taskIndex', 'field', 'code', 'reminderIndex', 'subtaskIndex'].includes(key))).toBe(true)
    }
  })

  it('recusa IDs repetidos no arquivo e subtarefas repetidas na mesma tarefa', () => {
    const base = (id: string) => ({
      id,
      title: 't',
      status: 'TODO',
      priority: 'LOW',
      reminders: [],
      subtasks: [],
      tags: [],
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-10T09:00:00.000Z',
    })
    expect(readBackupFile(JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-09-16T18:30:00.000Z',
      app: { version: '0.4.0' },
      tasks: [base('a'), base('a')],
    }))).toMatchObject({ ok: false, reason: 'INVALID_TASKS' })

    const duplicateSubtasks = {
      ...base('a'),
      subtasks: [
        { id: 's', title: 't', done: false },
        { id: 's', title: 't2', done: true },
      ],
    }
    const result = readBackupFile(JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-09-16T18:30:00.000Z',
      app: { version: '0.4.0' },
      tasks: [duplicateSubtasks],
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues?.some((issue) => issue.subtaskIndex !== undefined)).toBe(true)
  })

  it('aceita o mesmo id de subtarefa em tarefas diferentes e projeta apenas campos conhecidos', () => {
    const taskWithExtras = {
      id: 'a',
      title: 't',
      status: 'TODO',
      priority: 'LOW',
      dueAt: '2026-10-10T12:00:00.000Z',
      seriesId: 'serie-x',
      recurrence: { frequency: 'DAILY', intervalDays: 1, alien: true, weekdays: [1] },
      reminders: [],
      subtasks: [{ id: 's', title: 'item', done: false, extra: 1 }],
      tags: [],
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-10T09:00:00.000Z',
      extraTask: 'x',
    }
    const other = { ...taskWithExtras, id: 'b', subtasks: [{ id: 's', title: 'item', done: true }] }
    const result = readBackupFile(JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-09-16T18:30:00.000Z',
      app: { version: '0.4.0' },
      tasks: [taskWithExtras, other],
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const first = result.backup.tasks[0]!
    expect(first.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1 })
    expect(first.subtasks[0]).toEqual({ id: 's', title: 'item', done: false })
    expect(first).not.toHaveProperty('extraTask')
  })

  it('aceita until histórico anterior ao prazo sem aplicar a regra de formulário', () => {
    const historical = {
      id: 'a',
      title: 't',
      status: 'TODO',
      priority: 'LOW',
      dueAt: '2026-10-10T12:00:00.000Z',
      seriesId: 'serie-x',
      recurrence: { frequency: 'DAILY', intervalDays: 1, until: '2026-10-01T12:00:00.000Z' },
      reminders: [],
      subtasks: [],
      tags: [],
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-10T09:00:00.000Z',
    }
    const result = readBackupFile(JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-09-16T18:30:00.000Z',
      app: { version: '0.4.0' },
      tasks: [historical],
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.tasks[0]!.recurrence?.until).toBe('2026-10-01T12:00:00.000Z')
  })
})

describe('limites do contrato estrito (B02)', () => {
  function readTasks(tasks: unknown[]): ReturnType<typeof readBackupFile> {
    return readBackupFile(
      JSON.stringify({
        format: 'taskflow-backup',
        formatVersion: 4,
        exportedAt: '2026-09-16T18:30:00.000Z',
        app: { version: '0.4.0' },
        tasks,
      }),
    )
  }

  function baseTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'tarefa-1',
      title: 'Tarefa',
      status: 'TODO',
      priority: 'LOW',
      reminders: [],
      subtasks: [],
      tags: [],
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-10T09:00:00.000Z',
      ...overrides,
    }
  }

  it('recusa título longo, texto opcional longo e status/prioridade desconhecidos', () => {
    const result = readTasks([
      baseTask({ title: 'x'.repeat(201) }),
      baseTask({ id: 'b', description: 'x'.repeat(4001) }),
      baseTask({ id: 'c', status: 'PAUSED' }),
      baseTask({ id: 'd', priority: 'CRITICAL' }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    const codes = result.issues?.map((issue) => [issue.field, issue.code]) ?? []
    expect(codes).toEqual(
      expect.arrayContaining([
        ['title', 'TOO_LONG'],
        ['description', 'TOO_LONG'],
        ['status', 'INVALID_VALUE'],
        ['priority', 'INVALID_VALUE'],
      ]),
    )
  })

  it('recusa tags demais, duplicadas sem diferenciar caixa e URL não HTTP', () => {
    const tooManyTags = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']
    const result = readTasks([
      baseTask({ tags: tooManyTags }),
      baseTask({ id: 'b', tags: ['Casa', 'casa'] }),
      baseTask({ id: 'c', sourceUrl: 'ftp://example.com/x' }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('INVALID_TASKS')
  })

  it('recusa lembretes demais, mesmo instante e AT depois do prazo', () => {
    const many = Array.from({ length: 11 }, (_, index) => ({
      id: `r-${index}`,
      type: 'OFFSET',
      offsetMinutes: index + 1,
    }))
    const dueAt = '2026-10-10T12:00:00.000Z'
    const result = readTasks([
      baseTask({ dueAt, reminders: many }),
      baseTask({
        id: 'b',
        dueAt,
        reminders: [
          { id: 'r1', type: 'OFFSET', offsetMinutes: 60 },
          { id: 'r2', type: 'OFFSET', offsetMinutes: 60 },
        ],
      }),
      baseTask({
        id: 'c',
        dueAt,
        reminders: [{ id: 'r1', type: 'AT', at: '2026-10-11T12:00:00.000Z' }],
      }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    const reminderIssues = result.issues?.filter((issue) => issue.field === 'reminders') ?? []
    expect(reminderIssues.some((issue) => issue.code === 'TOO_MANY')).toBe(true)
    expect(reminderIssues.some((issue) => issue.code === 'DUPLICATE')).toBe(true)
    expect(reminderIssues.some((issue) => issue.code === 'INVALID_VALUE')).toBe(true)
  })

  it('recusa subtarefas demais, DONE sem completedAt e recorrência sem série', () => {
    const subtasks = Array.from({ length: 21 }, (_, index) => ({
      id: `s-${index}`,
      title: 'item',
      done: false,
    }))
    const result = readTasks([
      baseTask({ subtasks }),
      baseTask({ id: 'b', status: 'DONE' }),
      baseTask({
        id: 'c',
        dueAt: '2026-10-10T12:00:00.000Z',
        recurrence: { frequency: 'DAILY', intervalDays: 1 },
      }),
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    const map = new Map((result.issues ?? []).map((issue) => [issue.field, issue.code]))
    expect(map.get('subtasks')).toBe('TOO_MANY')
    expect(map.get('completedAt')).toBe('REQUIRED')
    expect(map.get('recurrence')).toBe('INVALID_VALUE')
  })
})

describe('backupFileName e instantes canônicos', () => {
  it('preserva o padrão de nome em hora local', () => {
    expect(backupFileName(new Date(2026, 8, 13, 18, 30))).toBe('taskflow-backup-2026-09-13-1830.json')
    expect(backupFileName(new Date(2026, 0, 5, 7, 4))).toBe('taskflow-backup-2026-01-05-0704.json')
  })

  it('aceita somente a forma canônica de instante', () => {
    expect(isCanonicalInstant('2026-09-13T18:30:00.000Z')).toBe(true)
    expect(isCanonicalInstant('2026-09-13T18:30:00.000')).toBe(false)
    expect(isCanonicalInstant('2026-09-13T18:30:00Z')).toBe(false)
    expect(isCanonicalInstant(123)).toBe(false)
  })
})
