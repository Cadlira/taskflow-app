import { describe, expect, it } from 'vitest'
import { ReminderIndex } from '../../src/application/reminders/reminder-index.js'
import { reminderTag, projectTaskReminders } from '../../src/main/reminders/projection.js'
import { buildTask } from '../support/task-fixtures.js'

const NOW = new Date('2026-10-06T12:00:00Z')
function projection(id: string, minute: number) {
  return projectTaskReminders(buildTask({ id, dueAt: new Date(NOW.getTime() + minute * 60000).toISOString(),
    reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }] }), NOW)
}
describe('M03/M12 índice descartável removível', () => {
  it('ordena, atualiza e remove sem tombstones, preservando igualdade de deadlines', () => {
    const index = new ReminderIndex()
    for (let i = 1000; i > 0; i--) expect(index.replace(`t${i}`, projection(`t${i}`, i))).toBe(true)
    expect(index.first?.taskId).toBe('t1')
    const charge = index.charge
    for (let i = 0; i < 100; i++) index.replace('t1', projection('t1', 1001))
    expect(index.charge).toBe(charge)
    expect(index.size).toBe(1000)
    for (let i = 2; i <= 1000; i++) {
      expect(index.first?.taskId).toBe(`t${i}`)
      index.removeTask(`t${i}`)
    }
    expect(index.first?.taskId).toBe('t1')
    index.removeTask('t1')
    expect(index.charge).toBe(0)
    expect(index.first).toBeUndefined()
  })
  it('limite recusa antes de modificar índice; tag ambígua não resolve', () => {
    const index = new ReminderIndex(1024)
    expect(index.replace('a', projection('a', 1))).toBe(true)
    const before = index.charge
    expect(index.replace('a', Array.from({ length: 10 }, () => projection('a', 1)[0]!))).toBe(false)
    expect(index.charge).toBe(before)
    const a = projection('a', 1)[0]!
    index.consume(a)
    expect(index.resolve(a.tag)?.taskId).toBe('a')
    expect(index.replace('b', [{ ...projection('b', 1)[0]!, tag: a.tag, pending: false }])).toBe(true)
    expect(index.resolve(a.tag)).toBeUndefined()
  })
  it('SHA25664 conserva Unicode/IDs longos sem ambiguidades de delimitadores; processado resolve sem agenda', () => {
    const key = { taskId: 'a:b'.repeat(2000), reminderId: 'c\u00e7', triggerISO: NOW.toISOString() }
    const tag = reminderTag(key)
    expect(tag).toMatch(/^[a-f0-9]{64}$/)
    expect(tag).not.toBe(reminderTag({ ...key, taskId: 'a', reminderId: 'b:c\u00e7' }))
    const index = new ReminderIndex()
    const task = buildTask({ id: key.taskId, dueAt: key.triggerISO,
      reminders: [{ id: key.reminderId, type: 'OFFSET', offsetMinutes: 0, processedFor: key.triggerISO }] })
    expect(index.replace(task.id, projectTaskReminders(task, NOW))).toBe(true)
    expect(index.size).toBe(0)
    expect(index.resolve(tag)).toMatchObject(key)
  })
})
