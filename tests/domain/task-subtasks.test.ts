import { describe, expect, it } from 'vitest'
import {
  MAX_SUBTASKS,
  SUBTASK_TITLE_LIMIT,
  countSubtaskProgress,
  isSameSubtaskList,
  resetSubtasks,
  resolveSubtaskDrafts,
  setSubtaskDone,
} from '../../src/domain/task-subtasks.js'
import { buildTask, fixedNow } from '../support/task-fixtures.js'

function counter(prefix = 'novo'): () => string {
  let index = 0
  return () => `${prefix}-${index += 1}`
}

describe('task-subtasks: resolução de drafts', () => {
  it('aceita 0/20 itens e recusa 21 com erro de lista', () => {
    expect(resolveSubtaskDrafts([], [], counter(), 'create')).toEqual({ ok: true, subtasks: [] })

    const twenty = Array.from({ length: MAX_SUBTASKS }, (_u, index) => ({ title: `Passo ${index}` }))
    const full = resolveSubtaskDrafts(twenty, [], counter(), 'create')
    expect(full.ok).toBe(true)
    if (full.ok) {
      expect(full.subtasks).toHaveLength(20)
      expect(full.subtasks.every((item) => item.done === false)).toBe(true)
      expect(new Set(full.subtasks.map((item) => item.id)).size).toBe(20)
    }

    const tooMany = resolveSubtaskDrafts([...twenty, { title: '21' }], [], counter(), 'create')
    expect(tooMany.ok).toBe(false)
    if (!tooMany.ok && tooMany.kind === 'validation') {
      expect(tooMany.errors.list).toBe('TOO_MANY')
    } else {
      throw new Error('esperado erro de lista')
    }
  })

  it('título trim 1–200 por item e erro posicional', () => {
    const empty = resolveSubtaskDrafts([{ title: '   ' }], [], counter(), 'create')
    expect(empty.ok).toBe(false)
    if (!empty.ok && empty.kind === 'validation') {
      expect(empty.errors.items).toEqual([{ index: 0, title: 'REQUIRED' }])
    }

    const limit = resolveSubtaskDrafts([{ title: 'T'.repeat(SUBTASK_TITLE_LIMIT) }], [], counter(), 'create')
    expect(limit.ok).toBe(true)

    const long = resolveSubtaskDrafts(
      [{ title: 'ok' }, { title: 'X'.repeat(SUBTASK_TITLE_LIMIT + 1) }],
      [],
      counter(),
      'create',
    )
    expect(long.ok).toBe(false)
    if (!long.ok && long.kind === 'validation') {
      expect(long.errors.items).toEqual([{ index: 1, title: 'TOO_LONG' }])
    }

    const trimmed = resolveSubtaskDrafts([{ title: '  Com espaços  ' }], [], counter(), 'create')
    expect(trimmed.ok).toBe(true)
    if (trimmed.ok) expect(trimmed.subtasks[0]?.title).toBe('Com espaços')
  })

  it('criação aceita somente título; ID enviado é recusado sem gravar', () => {
    const withId = resolveSubtaskDrafts([{ id: 'forjado', title: 'Passo' }], [], counter(), 'create')
    expect(withId.ok).toBe(false)
    if (!withId.ok && withId.kind === 'validation') {
      expect(withId.errors.items).toEqual([{ index: 0, id: 'INVALID_VALUE' }])
    }
  })

  it('edição exige ID existente, recusa vazio/repetido e preserva a marcação atual', () => {
    const current = [
      { id: 's1', title: 'Primeiro', done: true },
      { id: 's2', title: 'Segundo', done: false },
    ]
    const reordered = resolveSubtaskDrafts(
      [
        { id: 's2', title: 'Segundo' },
        { id: 's1', title: 'Primeiro renomeado' },
      ],
      current,
      counter(),
      'edit',
    )
    expect(reordered.ok).toBe(true)
    if (reordered.ok) {
      expect(reordered.subtasks).toEqual([
        { id: 's2', title: 'Segundo', done: false },
        { id: 's1', title: 'Primeiro renomeado', done: true },
      ])
    }

    const unknown = resolveSubtaskDrafts([{ id: 's9', title: 'Novo' }], current, counter(), 'edit')
    expect(unknown.ok).toBe(false)
    if (!unknown.ok && unknown.kind === 'validation') {
      expect(unknown.errors.items).toEqual([{ index: 0, id: 'UNKNOWN_ID' }])
    }

    const duplicate = resolveSubtaskDrafts(
      [
        { id: 's1', title: 'A' },
        { id: 's1', title: 'B' },
      ],
      current,
      counter(),
      'edit',
    )
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok && duplicate.kind === 'validation') {
      expect(duplicate.errors.items?.find((item) => item.index === 1)?.id).toBe('DUPLICATE_ID')
    }

    const blank = resolveSubtaskDrafts([{ id: '  ', title: 'A' }], current, counter(), 'edit')
    expect(blank.ok).toBe(false)
    if (!blank.ok && blank.kind === 'validation') {
      expect(blank.errors.items?.[0]?.id).toBe('INVALID_VALUE')
    }
  })

  it('título intacto conserva o histórico sem limite retroativo; renomear revalida', () => {
    const historical = 'H'.repeat(SUBTASK_TITLE_LIMIT + 50)
    const current = [{ id: 's1', title: historical, done: false }]

    const intact = resolveSubtaskDrafts([{ id: 's1', title: historical }], current, counter(), 'edit')
    expect(intact.ok).toBe(true)
    if (intact.ok) expect(intact.subtasks[0]?.title).toBe(historical)

    const renamed = resolveSubtaskDrafts([{ id: 's1', title: historical + 'x' }], current, counter(), 'edit')
    expect(renamed.ok).toBe(false)
    if (!renamed.ok && renamed.kind === 'validation') {
      expect(renamed.errors.items?.[0]?.title).toBe('TOO_LONG')
    }
  })

  it('IDs novos não reutilizam IDs antigos do conjunto nem duplicam na lista', () => {
    const current = [
      { id: 'antiga-1', title: 'A', done: true },
      { id: 'antiga-2', title: 'B', done: false },
    ]
    // Mesmo enviando só um item novo, as identidades antigas ficam reservadas.
    const generated = counter('novo')
    const result = resolveSubtaskDrafts([{ title: 'C' }], current, generated, 'edit')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.subtasks[0]?.id).toBe('novo-1')

    const colliding = resolveSubtaskDrafts([{ title: 'C' }], current, () => 'antiga-1', 'edit')
    expect(colliding.ok).toBe(false)
    if (!colliding.ok && colliding.kind === 'identity') expect(colliding.kind).toBe('identity')
  })
})

describe('task-subtasks: marcação e progresso', () => {
  it('marca/desmarca nos quatro status sem alterar status/completedAt/prazo/lembretes', () => {
    const statuses = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const

    for (const status of statuses) {
      const task = buildTask({
        status,
        ...(status === 'DONE' && { completedAt: '2026-10-02T10:00:00.000Z' }),
        dueAt: '2026-10-05T10:00:00.000Z',
        reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 30, processedFor: '2026-10-05T09:30:00.000Z' }],
        subtasks: [
          { id: 's1', title: 'A', done: false },
          { id: 's2', title: 'B', done: true },
        ],
      })

      const marked = setSubtaskDone(task, 's1', true, fixedNow())
      expect(marked).toBeDefined()
      if (marked === undefined) continue
      expect(marked.subtasks).toEqual([
        { id: 's1', title: 'A', done: true },
        { id: 's2', title: 'B', done: true },
      ])
      expect(marked.status).toBe(status)
      expect(marked.completedAt).toBe(task.completedAt)
      expect(marked.dueAt).toBe(task.dueAt)
      expect(marked.reminders).toEqual(task.reminders)
      expect(marked.updatedAt).toBe('2026-10-04T12:00:00.000Z')
      expect(task.subtasks[0]?.done).toBe(false)
    }
  })

  it('mesmo valor é no-op e item ausente devolve undefined sem marcar outro item', () => {
    const task = buildTask({ subtasks: [{ id: 's1', title: 'A', done: true }] })
    expect(setSubtaskDone(task, 's1', true, fixedNow())).toBe(task)
    expect(setSubtaskDone(task, 's2', true, fixedNow())).toBeUndefined()
    expect(setSubtaskDone(task, 's1', false, fixedNow())?.updatedAt).toBe('2026-10-04T12:00:00.000Z')
  })

  it('progresso é derivado e a cópia da próxima renova IDs e desmarca', () => {
    const subtasks = [
      { id: 's1', title: 'A', done: true },
      { id: 's2', title: 'B', done: false },
    ]
    expect(countSubtaskProgress(subtasks)).toEqual({ done: 1, total: 2 })
    expect(countSubtaskProgress([])).toEqual({ done: 0, total: 0 })

    const reset = resetSubtasks(subtasks, counter('r'))
    expect(reset).toEqual([
      { id: 'r-1', title: 'A', done: false },
      { id: 'r-2', title: 'B', done: false },
    ])
    expect(resetSubtasks(subtasks, () => 's1')).toBeUndefined()

    expect(isSameSubtaskList(subtasks, [...subtasks])).toBe(true)
    expect(isSameSubtaskList(subtasks, [{ id: 's1', title: 'A', done: true }])).toBe(false)
    expect(isSameSubtaskList(subtasks, [subtasks[1]!, subtasks[0]!])).toBe(false)
  })
})
