import { describe, expect, it } from 'vitest'
import { applyStatus, cancelTask, completeTask, reopenTask } from '../../src/domain/task-status.js'
import { buildTask, fixedNow } from '../support/task-fixtures.js'

describe('task-status: transições simples', () => {
  it('mesmo status devolve a mesma tarefa, sem tocar timestamps', () => {
    const task = buildTask({ status: 'IN_PROGRESS' })
    expect(applyStatus(task, 'IN_PROGRESS', fixedNow())).toBe(task)
  })

  it('DONE registra completedAt e atualiza updatedAt', () => {
    const task = buildTask({ status: 'TODO', updatedAt: '2026-10-01T11:00:00.000Z' })
    const done = completeTask(task, fixedNow())
    expect(done.status).toBe('DONE')
    expect(done.completedAt).toBe('2026-10-04T12:00:00.000Z')
    expect(done.updatedAt).toBe('2026-10-04T12:00:00.000Z')
    expect(done.createdAt).toBe(task.createdAt)
    expect(done.id).toBe(task.id)
  })

  it('sair de DONE remove completedAt; cancelar e reabrir seguem a regra', () => {
    const done = buildTask({ status: 'DONE', completedAt: '2026-10-02T10:00:00.000Z' })
    const cancelled = cancelTask(done, fixedNow())
    expect(cancelled.status).toBe('CANCELLED')
    expect('completedAt' in cancelled).toBe(false)

    const reopened = reopenTask(cancelled, fixedNow())
    expect(reopened.status).toBe('TODO')
    expect('completedAt' in reopened).toBe(false)
    expect(reopened.updatedAt).toBe('2026-10-04T12:00:00.000Z')
  })

  it('aplicar status não altera os demais campos', () => {
    const task = buildTask({
      title: 'Fictícia',
      tags: ['a'],
      subtasks: [{ id: 's', title: 'Passo', done: false }],
    })
    const done = completeTask(task, fixedNow())
    expect(done.title).toBe(task.title)
    expect(done.tags).toEqual(task.tags)
    expect(done.subtasks).toEqual(task.subtasks)
  })
})
