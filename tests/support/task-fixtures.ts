import type { Task } from '../../src/domain/task.js'

// Dados exclusivamente fictícios para os testes do núcleo portável.

const FIXED_NOW = new Date('2026-10-04T12:00:00.000Z')

export function fixedNow(): Date {
  return new Date(FIXED_NOW.getTime())
}

/** Overrides que aceitam `undefined` explícito (exactOptionalPropertyTypes). */
export type TaskOverrides = { [K in keyof Task]?: Task[K] | undefined }

export function buildTask(overrides: TaskOverrides = {}): Task {
  const base: Task = {
    id: 'tarefa-ficticia-1',
    title: 'Tarefa fictícia',
    description: 'Descrição fictícia',
    requester: 'Solicitante',
    assignee: 'Responsável',
    status: 'TODO',
    priority: 'MEDIUM',
    reminders: [],
    subtasks: [],
    tags: ['casa'],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T11:00:00.000Z',
  }
  const result: Task = { ...base }
  for (const key of Object.keys(overrides) as Array<keyof Task>) {
    const value = overrides[key]
    if (value !== undefined) {
      Object.assign(result, { [key]: value })
    } else {
      delete result[key]
    }
  }
  return result
}
