import { describe, expect, it } from 'vitest'
import type { Task } from '../../src/domain/task.js'
import { compareBackupTaskCollections, projectedTask } from '../../src/application/backup/backup-comparison.js'
import { buildTask } from '../support/task-fixtures.js'

function extendedTask(): Task {
  return buildTask({
    dueAt: '2026-10-10T12:00:00.000Z',
    seriesId: 'serie-1',
    recurrence: { frequency: 'WEEKLY', weekdays: [1, 4], until: '2026-12-31T23:59:00.000Z' },
    reminders: [
      { id: 'r1', type: 'OFFSET', offsetMinutes: 60 },
      { id: 'r2', type: 'OFFSET', offsetMinutes: 1440, processedFor: '2026-10-09T12:00:00.000Z' },
      { id: 'r3', type: 'AT', at: '2026-10-08T09:00:00.000Z' },
    ],
    subtasks: [
      { id: 's1', title: 'Primeiro', done: true },
      { id: 's2', title: 'Segundo', done: false },
    ],
    tags: ['casa', 'trabalho'],
    sourceUrl: 'https://example.com/t/1',
    completedAt: undefined,
  })
}

type Mutation = (task: Task) => Task

const FIELD_MUTATIONS: Array<[string, Mutation]> = [
  ['title', (task) => ({ ...task, title: 'Outro título' })],
  ['description', (task) => ({ ...task, description: 'Outra descrição' })],
  ['requester', (task) => ({ ...task, requester: 'Outro' })],
  ['assignee', (task) => ({ ...task, assignee: 'Outro' })],
  ['status', (task) => ({ ...task, status: 'DONE', completedAt: '2026-10-01T10:00:00.000Z' })],
  ['priority', (task) => ({ ...task, priority: 'URGENT' })],
  ['tags-order', (task) => ({ ...task, tags: ['trabalho', 'casa'] })],
  ['dueAt', (task) => ({ ...task, dueAt: '2026-10-11T12:00:00.000Z' })],
  ['sourceUrl', (task) => ({ ...task, sourceUrl: 'https://example.com/t/2' })],
  ['createdAt', (task) => ({ ...task, createdAt: '2026-10-02T10:00:00.000Z' })],
  ['updatedAt', (task) => ({ ...task, updatedAt: '2026-10-02T11:00:00.000Z' })],
  ['completedAt', (task) => ({ ...task, completedAt: '2026-10-03T10:00:00.000Z' })],
  ['seriesId', (task) => ({ ...task, seriesId: 'serie-2' })],
  ['recurrence-frequency', (task) => ({ ...task, recurrence: { frequency: 'DAILY', intervalDays: 2 } })],
  ['recurrence-interval', (task) => ({ ...task, recurrence: { frequency: 'WEEKLY', weekdays: [1, 5] } })],
  ['recurrence-anchor', (task) => ({
    ...task,
    recurrence: { frequency: 'WEEKLY', weekdays: [1, 4], anchorAt: '2026-10-01T12:00:00.000Z' },
  })],
  ['recurrence-until', (task) => ({
    ...task,
    recurrence: { frequency: 'WEEKLY', weekdays: [1, 4], until: '2026-12-30T23:59:00.000Z' },
  })],
  ['reminder-offset', (task) => ({
    ...task,
    reminders: task.reminders.map((reminder) =>
      reminder.id === 'r1' && reminder.type === 'OFFSET' ? { ...reminder, offsetMinutes: 30 } : reminder,
    ),
  })],
  ['reminder-at', (task) => ({
    ...task,
    reminders: task.reminders.map((reminder) =>
      reminder.id === 'r3' && reminder.type === 'AT' ? { ...reminder, at: '2026-10-08T10:00:00.000Z' } : reminder,
    ),
  })],
  ['reminder-processedFor', (task) => ({
    ...task,
    reminders: task.reminders.map((reminder) =>
      reminder.id === 'r2' && reminder.type === 'OFFSET'
        ? { ...reminder, processedFor: '2026-10-09T13:00:00.000Z' }
        : reminder,
    ),
  })],
  ['reminder-id', (task) => ({
    ...task,
    reminders: task.reminders.map((reminder) => (reminder.id === 'r2' ? { ...reminder, id: 'r2b' } : reminder)),
  })],
  ['reminder-order', (task) => ({ ...task, reminders: [...task.reminders].reverse() })],
  ['subtask-id', (task) => ({
    ...task,
    subtasks: task.subtasks.map((subtask) => (subtask.id === 's2' ? { ...subtask, id: 's3' } : subtask)),
  })],
  ['subtask-title', (task) => ({
    ...task,
    subtasks: task.subtasks.map((subtask) => (subtask.id === 's2' ? { ...subtask, title: 'Renomeado' } : subtask)),
  })],
  ['subtask-done', (task) => ({
    ...task,
    subtasks: task.subtasks.map((subtask) => (subtask.id === 's2' ? { ...subtask, done: true } : subtask)),
  })],
  ['subtask-order', (task) => ({ ...task, subtasks: [...task.subtasks].reverse() })],
]

describe('compareBackupTaskCollections (B02)', () => {
  it('considera idênticas quando só a ordem da coleção muda', () => {
    const base = extendedTask()
    const other = buildTask({ id: 'tarefa-ficticia-2', title: 'Outra' })
    const expected = [base, other]
    const actual = [other, base]
    expect(compareBackupTaskCollections(expected, actual).ok).toBe(true)
  })

  it.each(FIELD_MUTATIONS)('detecta perda/alteração isolada de %s', (_name, mutate) => {
    const expected = [extendedTask()]
    const actual = [mutate(extendedTask())]
    const comparison = compareBackupTaskCollections(expected, actual)
    expect(comparison.ok).toBe(false)
    expect(comparison.changed.length + comparison.missing.length + comparison.extra.length).toBeGreaterThan(0)
  })

  it('detecta remoção e acréscimo de tarefas e duplicatas', () => {
    const task = extendedTask()
    const other = buildTask({ id: 'tarefa-ficticia-2', title: 'Outra' })
    expect(compareBackupTaskCollections([task, other], [task]).ok).toBe(false)
    expect(compareBackupTaskCollections([task], [task, other]).ok).toBe(false)
    expect(compareBackupTaskCollections([task], [task, { ...task }]).ok).toBe(false)
  })

  it('trata ausência de opcional distinta de valor presente', () => {
    const withDue = extendedTask()
    const withoutDue: Task = { ...withDue }
    delete withoutDue.dueAt
    expect(compareBackupTaskCollections([withDue], [withoutDue]).ok).toBe(false)
  })

  it('a projeção preserva a ordem de tags, lembretes e subtarefas', () => {
    const projected = projectedTask(extendedTask())
    expect((projected['tags'] as string[])).toEqual(['casa', 'trabalho'])
    expect((projected['reminders'] as Array<{ id: string }>).map((item) => item.id)).toEqual(['r1', 'r2', 'r3'])
    expect((projected['subtasks'] as Array<{ id: string }>).map((item) => item.id)).toEqual(['s1', 's2'])
    expect(projected['seriesId']).toBe('serie-1')
    expect(projected['recurrence']).toEqual({
      frequency: 'WEEKLY',
      weekdays: [1, 4],
      until: '2026-12-31T23:59:00.000Z',
    })
  })
})
