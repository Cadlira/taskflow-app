import { describe, expect, it } from 'vitest'
import {
  DUE_SOON_WINDOW_MS,
  EMPTY_TASK_FILTERS,
  filterTasks,
  getDueSituation,
  matchesSearch,
  sortTasks,
} from '../../src/domain/task-queries.js'
import { buildTask } from '../support/task-fixtures.js'

const NOW = new Date('2026-10-04T12:00:00.000Z')

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

describe('task-queries: pesquisa', () => {
  it('pesquisa substring sem diferenciar caixa em título, descrição, pessoas, tags e subtarefas', () => {
    const task = buildTask({
      title: 'Revisar contrato',
      description: 'cláusula de rescisão',
      requester: 'Ana Prado',
      assignee: 'Bruno Lima',
      tags: ['jurídico'],
      subtasks: [
        { id: 's1', title: 'Conferir anexo', done: false },
        { id: 's2', title: 'Enviar e-mail', done: true },
      ],
      sourceUrl: 'https://example.test/segredo',
    })

    expect(matchesSearch(task, '  CONTRATO  ')).toBe(true)
    expect(matchesSearch(task, 'RESCISÃO')).toBe(true)
    expect(matchesSearch(task, 'ana prado')).toBe(true)
    expect(matchesSearch(task, 'bruno')).toBe(true)
    expect(matchesSearch(task, 'juríd')).toBe(true)
    expect(matchesSearch(task, 'conferir anexo')).toBe(true)
    expect(matchesSearch(task, 'e-mail')).toBe(true)
    expect(matchesSearch(task, 'segredo')).toBe(false)
    expect(matchesSearch(task, '')).toBe(true)
    expect(matchesSearch(task, '   ')).toBe(true)
  })

  it('não remove acentos nem tokeniza palavras', () => {
    const task = buildTask({ title: 'Ação de cobrança', description: 'água mineral' })
    expect(matchesSearch(task, 'acao')).toBe(false)
    expect(matchesSearch(task, 'ação de')).toBe(true)
    expect(matchesSearch(task, 'cobrança água')).toBe(false)
  })
})

describe('task-queries: filtros combináveis', () => {
  const tasks = [
    buildTask({ id: 'a', title: 'Alfa', status: 'TODO', priority: 'HIGH', dueAt: iso(-1000) }),
    buildTask({ id: 'b', title: 'Beta', status: 'IN_PROGRESS', priority: 'LOW', dueAt: iso(60_000) }),
    buildTask({ id: 'c', title: 'Gama', status: 'TODO', priority: 'LOW', dueAt: undefined }),
  ]

  it('combina pesquisa, status, prioridade e situação por AND', () => {
    const filters = { ...EMPTY_TASK_FILTERS, search: 'a', status: 'TODO' as const, priority: 'LOW' as const }
    expect(filterTasks(tasks, filters, NOW).map((task) => task.id)).toEqual(['c'])

    const overdue = { ...EMPTY_TASK_FILTERS, dueSituation: 'OVERDUE' as const }
    expect(filterTasks(tasks, overdue, NOW).map((task) => task.id)).toEqual(['a'])

    const dueSoon = { ...EMPTY_TASK_FILTERS, dueSituation: 'DUE_SOON' as const }
    expect(filterTasks(tasks, dueSoon, NOW).map((task) => task.id)).toEqual(['b'])

    const all = { ...EMPTY_TASK_FILTERS, status: 'TODO' as const, priority: 'HIGH' as const, search: 'alfa' }
    expect(filterTasks(tasks, all, NOW).map((task) => task.id)).toEqual(['a'])
  })
})

describe('task-queries: situações de prazo', () => {
  it('fronteiras: now-1 ms atrasada; now e +24 h próximas; +24 h+1 ms fora; terminais/sem prazo sem classificação', () => {
    expect(getDueSituation(buildTask({ dueAt: iso(-1) }), NOW)).toBe('OVERDUE')
    expect(getDueSituation(buildTask({ dueAt: iso(0) }), NOW)).toBe('DUE_SOON')
    expect(getDueSituation(buildTask({ dueAt: iso(DUE_SOON_WINDOW_MS) }), NOW)).toBe('DUE_SOON')
    expect(getDueSituation(buildTask({ dueAt: iso(DUE_SOON_WINDOW_MS + 1) }), NOW)).toBeUndefined()
    expect(getDueSituation(buildTask({ dueAt: iso(-1), status: 'DONE' }), NOW)).toBeUndefined()
    expect(getDueSituation(buildTask({ dueAt: iso(-1), status: 'CANCELLED' }), NOW)).toBeUndefined()
    expect(getDueSituation(buildTask({ dueAt: undefined }), NOW)).toBeUndefined()
  })
})

describe('task-queries: ordenação e desempates', () => {
  it('DUE_DATE: prazo crescente, ausentes por último, criação decrescente no empate', () => {
    const tasks = [
      buildTask({ id: 'sem-prazo', dueAt: undefined, createdAt: '2026-10-01T00:00:00.000Z' }),
      buildTask({ id: 'depois', dueAt: iso(2000), createdAt: '2026-10-03T00:00:00.000Z' }),
      buildTask({ id: 'antes', dueAt: iso(1000), createdAt: '2026-10-02T00:00:00.000Z' }),
      buildTask({ id: 'empate-novo', dueAt: iso(1000), createdAt: '2026-10-04T00:00:00.000Z' }),
    ]
    expect(sortTasks(tasks, 'DUE_DATE').map((task) => task.id)).toEqual([
      'empate-novo',
      'antes',
      'depois',
      'sem-prazo',
    ])
  })

  it('PRIORITY: URGENT/HIGH/MEDIUM/LOW e criação decrescente', () => {
    const tasks = [
      buildTask({ id: 'low', priority: 'LOW' }),
      buildTask({ id: 'medium-a', priority: 'MEDIUM', createdAt: '2026-10-01T00:00:00.000Z' }),
      buildTask({ id: 'medium-b', priority: 'MEDIUM', createdAt: '2026-10-03T00:00:00.000Z' }),
      buildTask({ id: 'urgent', priority: 'URGENT' }),
      buildTask({ id: 'high', priority: 'HIGH' }),
    ]
    expect(sortTasks(tasks, 'PRIORITY').map((task) => task.id)).toEqual([
      'urgent',
      'high',
      'medium-b',
      'medium-a',
      'low',
    ])
  })

  it('STATUS: TODO/IN_PROGRESS/DONE/CANCELLED, prazo e criação', () => {
    const tasks = [
      buildTask({ id: 'cancelled', status: 'CANCELLED' }),
      buildTask({ id: 'done-sem-prazo', status: 'DONE', dueAt: undefined }),
      buildTask({ id: 'done-com-prazo', status: 'DONE', dueAt: iso(1000) }),
      buildTask({ id: 'in-progress', status: 'IN_PROGRESS' }),
      buildTask({ id: 'todo-b', status: 'TODO', createdAt: '2026-10-03T00:00:00.000Z' }),
      buildTask({ id: 'todo-a', status: 'TODO', createdAt: '2026-10-01T00:00:00.000Z' }),
    ]
    expect(sortTasks(tasks, 'STATUS').map((task) => task.id)).toEqual([
      'todo-b',
      'todo-a',
      'in-progress',
      'done-com-prazo',
      'done-sem-prazo',
      'cancelled',
    ])
  })
})
