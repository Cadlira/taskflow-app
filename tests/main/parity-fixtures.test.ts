// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBackupFile } from '../../src/application/backup/backup-file.js'
import { buildCreateTask } from '../../src/domain/task-draft.js'
import { resolveNextScheduledAt } from '../../src/domain/task-recurrence.js'
import { buildAgedParityTask, buildParityPlan } from '../../src/main/harness/parity-fixtures.js'

// Validação portátil das fixtures do percurso `parity` (TFA-012 task 3.1): os drafts são
// válidos no domínio, as expectativas literais conferem com os contratos e os backups
// v1–v4 existentes são reutilizados pelo codec. Nenhum dado real, nenhum runtime Electron.
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0)
const counter = (prefix = 'id'): (() => string) => {
  let n = 0
  return () => `${prefix}-${(n += 1)}`
}

describe('fixtures do percurso parity — validade e expectativas independentes', () => {
  it('cria a tarefa completa com campos, série, OFFSET e checklist esperados', () => {
    const plan = buildParityPlan(NOW)
    const result = buildCreateTask(plan.full, {
      now: new Date(NOW),
      id: 'tfa012-parity-full',
      seriesId: 'tfa012-serie',
      generateId: counter('tfa012'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const task = result.task
    expect(task.title).toBe(plan.expected.fullTitle)
    expect(task.description).toBe(plan.expected.fullDescription)
    expect(task.requester).toBe(plan.expected.fullRequester)
    expect(task.assignee).toBe(plan.expected.fullAssignee)
    expect(task.status).toBe('TODO')
    expect(task.priority).toBe('HIGH')
    expect(task.dueAt).toBe(plan.expected.fullDueAt)
    expect(task.sourceUrl).toBe(plan.expected.fullSourceUrl)
    expect([...task.tags].sort()).toEqual([...plan.expected.fullTags].sort())
    expect(task.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1 })
    expect(task.subtasks.map((item) => item.title)).toEqual(plan.expected.fullSubtaskTitles)
    expect(task.subtasks.every((item) => item.done === false)).toBe(true)
    expect(task.reminders).toHaveLength(1)
    const reminder = task.reminders[0]
    expect(reminder?.type).toBe('OFFSET')
    if (reminder?.type === 'OFFSET') {
      expect(reminder.offsetMinutes).toBe(plan.expected.fullReminderOffsetMinutes)
    }
    expect(reminder !== undefined && 'processedFor' in reminder).toBe(false)
    expect(task.seriesId).toBe('tfa012-serie')
    // Prazo esperado da próxima ocorrência: aritmética literal da fixture confere com o contrato.
    const next = resolveNextScheduledAt(task.recurrence!, task.dueAt!, new Date(NOW))
    expect(next).toEqual({ status: 'NEXT', scheduledAt: plan.expected.fullNextDueAt })
  })

  it('a tarefa simples da lixeira é válida e sem regra/lembretes', () => {
    const plan = buildParityPlan(NOW)
    const result = buildCreateTask(plan.plain, { now: new Date(NOW), id: 'tfa012-parity-plain', generateId: counter('plain') })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.task.title).toBe(plan.expected.plainTitle)
    expect(result.task.recurrence).toBeUndefined()
    expect(result.task.reminders).toHaveLength(0)
  })

  it('a fixture envelhecida tem gatilho vencido e futuro com literais coerentes', () => {
    const plan = buildParityPlan(NOW)
    const aged = buildAgedParityTask(NOW)
    expect(aged.title).toBe(plan.expected.agedTitle)
    expect(aged.dueAt).toBe(plan.expected.agedDueAt)
    expect(aged.reminders.map((reminder) => reminder.id)).toEqual(['tfa012-parity-aged-r1', 'tfa012-parity-aged-r2'])
    expect(aged.reminders.every((reminder) => reminder.type === 'OFFSET')).toBe(true)
    const trigger = aged.dueAt === undefined ? NaN : Date.parse(aged.dueAt) - 90 * 60 * 1000
    expect(new Date(trigger).toISOString()).toBe(plan.expected.agedTriggerAt)
    expect(trigger).toBeLessThanOrEqual(NOW)
    expect(Date.parse(plan.expected.agedFutureTriggerAt)).toBeGreaterThan(NOW)
    // IDs únicos dentro das listas da fixture.
    expect(new Set(aged.reminders.map((reminder) => reminder.id)).size).toBe(aged.reminders.length)
  })

  it('reutiliza os backups v1–v4 existentes com o codec de leitura', () => {
    for (const version of [1, 2, 3, 4] as const) {
      const text = readFileSync(`tests/fixtures/backups/taskflow-backup-v${version}.json`, 'utf8')
      const parsed = readBackupFile(text)
      expect(parsed.ok, `backup v${version}`).toBe(true)
      if (!parsed.ok) continue
      expect(parsed.backup.sourceFormatVersion).toBe(version)
      expect(parsed.backup.tasks.length).toBeGreaterThan(0)
      expect(parsed.backup.tasks.every((task) => typeof task.id === 'string' && task.id.length > 0)).toBe(true)
    }
    const v4 = readBackupFile(readFileSync('tests/fixtures/backups/taskflow-backup-v4.json', 'utf8'))
    if (v4.ok) {
      expect(v4.backup.formatVersion).toBe(4)
      expect(v4.backup.tasks.some((task) => Array.isArray(task.subtasks))).toBe(true)
    }
  })

  it('não embute caminhos pessoais nem identificadores do ambiente', () => {
    const plan = buildParityPlan(NOW)
    const text = JSON.stringify(plan)
    expect(text).not.toMatch(/Users\\\\/i)
    expect(text).not.toContain('C:\\\\')
    const username = process.env['USERNAME']
    if (username !== undefined && username.length > 2) {
      expect(text).not.toContain(username)
    }
  })
})
