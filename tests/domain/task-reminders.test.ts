import { describe, expect, it } from 'vitest'
import {
  preserveProcessedMarkers,
  settleElapsedReminders,
  settleElapsedRemindersPreservingMarkers,
} from '../../src/domain/task-reminders.js'
import { buildTask } from '../support/task-fixtures.js'

// Liquidação pura (L09): sem scheduler, sem notificação e sem depender de status ativo.

const DUE = '2026-10-04T12:00:00.000Z'
const NOW = new Date('2026-10-04T18:00:00.000Z')

describe('settleElapsedReminders (L09)', () => {
  it('liquida AT/OFFSET vencidos e exatos <= now; futuros permanecem pendentes', () => {
    const task = buildTask({
      dueAt: DUE,
      reminders: [
        { id: 'offset-vencido', type: 'OFFSET', offsetMinutes: 120 },
        { id: 'at-exato', type: 'AT', at: NOW.toISOString() },
        { id: 'at-futuro', type: 'AT', at: new Date(NOW.getTime() + 60_000).toISOString() },
      ],
    })

    const settled = settleElapsedReminders(task, NOW)

    expect(settled.reminders[0]?.processedFor).toBe('2026-10-04T10:00:00.000Z')
    expect(settled.reminders[1]?.processedFor).toBe(NOW.toISOString())
    expect(settled.reminders[2]?.processedFor).toBeUndefined()
    expect(task.reminders.some((reminder) => reminder.processedFor !== undefined)).toBe(false)
  })

  it('terminal segue a mesma liquidação, sem guarda de status ativo', () => {
    const done = buildTask({
      status: 'DONE',
      completedAt: NOW.toISOString(),
      dueAt: DUE,
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }],
    })
    expect(settleElapsedReminders(done, NOW).reminders[0]?.processedFor).toBe('2026-10-04T11:00:00.000Z')

    const cancelled = buildTask({
      status: 'CANCELLED',
      dueAt: DUE,
      reminders: [{ id: 'r1', type: 'AT', at: '2026-10-04T09:00:00.000Z' }],
    })
    expect(settleElapsedReminders(cancelled, NOW).reminders[0]?.processedFor).toBe('2026-10-04T09:00:00.000Z')
  })

  it('sem dueAt conserva os lembretes como estão e gatilho não representável não recebe marker inventado', () => {
    const withoutDue = buildTask({
      dueAt: undefined,
      reminders: [{ id: 'r1', type: 'AT', at: '2026-10-01T00:00:00.000Z' }],
    })
    expect(settleElapsedReminders(withoutDue, NOW)).toBe(withoutDue)

    const extreme = buildTask({
      // Maior instante representável por Date; OFFSET negativo cairia fora do intervalo.
      dueAt: new Date(8_640_000_000_000_000).toISOString(),
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: -1 }],
    })
    const settled = settleElapsedReminders(extreme, NOW)
    expect(settled.reminders[0]?.processedFor).toBeUndefined()
    expect(settled).toBe(extreme)
  })

  it('não reconstrói a tarefa quando nada muda (no-op)', () => {
    const already = buildTask({
      dueAt: DUE,
      reminders: [
        { id: 'r1', type: 'OFFSET', offsetMinutes: 60 },
        { id: 'r2', type: 'AT', at: '2026-10-04T23:00:00.000Z' },
      ],
    }).reminders.map((reminder) => ({ ...reminder }))
    const task = buildTask({
      dueAt: DUE,
      reminders: [{ ...already[0]!, processedFor: '2026-10-04T11:00:00.000Z' }, already[1]!],
    })
    expect(settleElapsedReminders(task, NOW)).toBe(task)
  })
})

describe('preserveProcessedMarkers + liquidação (L07/L09)', () => {
  it('conserva o marcador atual de mesmo lembrete/instante e depois liquida os pendentes', () => {
    const claimed = buildTask({
      dueAt: DUE,
      reminders: [
        { id: 'r1', type: 'OFFSET', offsetMinutes: 120, processedFor: '2026-10-04T10:00:00.000Z' },
        { id: 'r2', type: 'AT', at: '2026-10-04T15:00:00.000Z' },
      ],
    })
    // Versão restaurada mais antiga, sem o marcador do claim atual.
    const beforeImage = buildTask({
      dueAt: DUE,
      reminders: [
        { id: 'r1', type: 'OFFSET', offsetMinutes: 120 },
        { id: 'r2', type: 'AT', at: '2026-10-04T15:00:00.000Z' },
      ],
    })

    const settled = settleElapsedRemindersPreservingMarkers(claimed, beforeImage, NOW)

    expect(settled.reminders[0]?.processedFor).toBe('2026-10-04T10:00:00.000Z')
    expect(settled.reminders[1]?.processedFor).toBe('2026-10-04T15:00:00.000Z')
  })

  it('marcador de lembrete alterado ou de outro instante não é transportado', () => {
    const claimed = buildTask({
      dueAt: DUE,
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 120, processedFor: '2026-10-04T10:00:00.000Z' }],
    })
    const changedReminder = buildTask({
      dueAt: DUE,
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 30 }],
    })
    const preserved = preserveProcessedMarkers(claimed, changedReminder)
    expect(preserved.reminders[0]?.processedFor).toBeUndefined()
    expect(settleElapsedRemindersPreservingMarkers(claimed, changedReminder, NOW).reminders[0]?.processedFor).toBe(
      '2026-10-04T11:30:00.000Z',
    )
  })
})
