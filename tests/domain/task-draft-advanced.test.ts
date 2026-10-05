import { describe, expect, it } from 'vitest'
import { buildCreateTask, planTaskUpdate, type TaskRecurrenceDraft } from '../../src/domain/task-draft.js'
import { buildTask, fixedNow } from '../support/task-fixtures.js'

function counter(prefix = 'novo'): () => string {
  let index = 0
  return () => `${prefix}-${index += 1}`
}

describe('task-draft avançado: criação com regra e subtarefas', () => {
  it('cria com regra sem âncora, série da autoridade e subtarefas desmarcadas', () => {
    const result = buildCreateTask(
      {
        title: 'Nova',
        dueAt: '2026-10-05T10:00:00.000Z',
        recurrence: { frequency: 'WEEKLY', weekdays: [1, 3], until: '2026-12-01T10:00:00.000Z' },
        subtasks: [{ title: 'Primeiro' }, { title: 'Segundo' }],
      },
      { now: fixedNow(), id: 'tarefa-1', seriesId: 'serie-1', generateId: counter('s') },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.task.id).toBe('tarefa-1')
    expect(result.task.seriesId).toBe('serie-1')
    expect(result.task.recurrence).toEqual({ frequency: 'WEEKLY', weekdays: [1, 3], until: '2026-12-01T10:00:00.000Z' })
    expect(result.task.status).toBe('TODO')
    expect(result.task.subtasks).toEqual([
      { id: 's-1', title: 'Primeiro', done: false },
      { id: 's-2', title: 'Segundo', done: false },
    ])
    expect(result.task.reminders).toEqual([])
  })

  it('criação terminal com regra persiste sem gerar imediatamente', () => {
    const result = buildCreateTask(
      { title: 'Concluída', status: 'DONE', dueAt: '2026-10-05T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 1 } },
      { now: fixedNow(), id: 'tarefa-1', seriesId: 'serie-1', generateId: counter() },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.task.status).toBe('DONE')
    expect(result.task.completedAt).toBe('2026-10-04T12:00:00.000Z')
    expect(result.task.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1 })
    // Nenhuma segunda tarefa é criada pela criação terminal.
    expect(result.task.seriesId).toBe('serie-1')

    const cancelled = buildCreateTask(
      { title: 'Cancelada', status: 'CANCELLED', dueAt: '2026-10-05T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 1 } },
      { now: fixedNow(), id: 'tarefa-2', seriesId: 'serie-2', generateId: counter() },
    )
    expect(cancelled.ok && cancelled.task.status === 'CANCELLED').toBe(true)
    expect(cancelled.ok && 'completedAt' in cancelled.task).toBe(false)
  })

  it('recusa regra sem prazo, até anterior e parâmetros fora dos limites', () => {
    const noDue = buildCreateTask(
      { title: 'X', recurrence: { frequency: 'DAILY', intervalDays: 1 } },
      { now: fixedNow(), id: 't', seriesId: 's', generateId: counter() },
    )
    expect(noDue).toEqual({ ok: false, kind: 'validation', fields: { dueAt: 'DUE_REQUIRED' } })

    const untilBefore = buildCreateTask(
      { title: 'X', dueAt: '2026-10-05T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 1, until: '2026-10-04T10:00:00.000Z' } },
      { now: fixedNow(), id: 't', seriesId: 's', generateId: counter() },
    )
    expect(untilBefore).toEqual({
      ok: false,
      kind: 'validation',
      fields: { recurrence: { until: 'UNTIL_BEFORE_DUE' } },
    })

    const equal = buildCreateTask(
      { title: 'X', dueAt: '2026-10-05T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 1, until: '2026-10-05T10:00:00.000Z' } },
      { now: fixedNow(), id: 't', seriesId: 's', generateId: counter() },
    )
    expect(equal.ok).toBe(true)

    const invalid = buildCreateTask(
      { title: 'X', dueAt: '2026-10-05T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 366 } },
      { now: fixedNow(), id: 't', seriesId: 's', generateId: counter() },
    )
    expect(invalid).toEqual({ ok: false, kind: 'validation', fields: { recurrence: { intervalDays: 'INVALID_VALUE' } } })

    const nulUntil = buildCreateTask(
      { title: 'X', dueAt: '2026-10-05T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 1, until: null } },
      { now: fixedNow(), id: 't', seriesId: 's', generateId: counter() },
    )
    expect(nulUntil.ok).toBe(false)

    const weekly = buildCreateTask(
      { title: 'X', dueAt: '2026-10-05T10:00:00.000Z', recurrence: { frequency: 'WEEKLY', weekdays: [0, 0] } },
      { now: fixedNow(), id: 't', seriesId: 's', generateId: counter() },
    )
    expect(weekly.ok).toBe(false)
  })
})

describe('task-draft avançado: edição de regra, âncora e limite', () => {
  const due = '2026-10-05T10:00:00.000Z'
  const rule = { frequency: 'DAILY', intervalDays: 1 } as const

  it('adiar conserva a âncora antiga e retornar ao ISO remove a âncora', () => {
    const current = buildTask({ dueAt: due, seriesId: 'serie-1', recurrence: rule })
    const postponed = planTaskUpdate(
      current,
      { dueAt: '2026-10-06T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 1 } },
      { now: fixedNow(), generateId: counter() },
    )
    expect(postponed.ok).toBe(true)
    if (!postponed.ok || postponed.next === undefined) return
    expect(postponed.next.dueAt).toBe('2026-10-06T10:00:00.000Z')
    expect(postponed.next.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1, anchorAt: due })

    const returned = planTaskUpdate(
      postponed.next,
      { dueAt: due, recurrence: { frequency: 'DAILY', intervalDays: 1 } },
      { now: fixedNow(), generateId: counter() },
    )
    expect(returned.ok).toBe(true)
    if (!returned.ok || returned.next === undefined) return
    expect(returned.next.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1 })
    expect('anchorAt' in (returned.next.recurrence ?? {})).toBe(false)
    expect(returned.next.seriesId).toBe('serie-1')
  })

  it('regra e prazo juntos mantêm a base antiga, sem rebase silencioso', () => {
    const current = buildTask({
      dueAt: '2026-10-05T10:00:00.000Z',
      seriesId: 'serie-1',
      recurrence: { frequency: 'WEEKLY', weekdays: [1] },
    })
    // Muda a regra para terça e o prazo para outro dia no mesmo save.
    const plan = planTaskUpdate(
      current,
      { dueAt: '2026-10-06T10:00:00.000Z', recurrence: { frequency: 'WEEKLY', weekdays: [2] } },
      { now: fixedNow(), generateId: counter() },
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok || plan.next === undefined) return
    expect(plan.next.recurrence).toEqual({ frequency: 'WEEKLY', weekdays: [2], anchorAt: '2026-10-05T10:00:00.000Z' })
  })

  it('prazo alterado com regra omitida conserva a regra e recalcula a âncora', () => {
    const current = buildTask({ dueAt: due, seriesId: 'serie-1', recurrence: rule })
    const plan = planTaskUpdate(current, { dueAt: '2026-10-09T10:00:00.000Z' }, { now: fixedNow(), generateId: counter() })
    expect(plan.ok).toBe(true)
    if (!plan.ok || plan.next === undefined) return
    expect(plan.next.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1, anchorAt: due })
  })

  it('omitir conserva, null retira preservando série/status e regra nova sem anterior não ganha âncora', () => {
    const current = buildTask({ dueAt: due, seriesId: 'serie-1', status: 'IN_PROGRESS', recurrence: rule })
    const omitted = planTaskUpdate(current, { title: 'Outro' }, { now: fixedNow(), generateId: counter() })
    expect(omitted.ok && omitted.next?.recurrence).toEqual(rule)

    const removed = planTaskUpdate(current, { recurrence: null }, { now: fixedNow(), generateId: counter() })
    expect(removed.ok).toBe(true)
    if (!removed.ok || removed.next === undefined) return
    expect('recurrence' in removed.next).toBe(false)
    expect(removed.next.seriesId).toBe('serie-1')
    expect(removed.next.status).toBe('IN_PROGRESS')

    const without = buildTask({ dueAt: due })
    const added = planTaskUpdate(
      without,
      { dueAt: '2026-10-08T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 2 } },
      { now: fixedNow(), generateId: counter(), newSeriesId: 'serie-nova' },
    )
    expect(added.ok).toBe(true)
    if (!added.ok || added.next === undefined) return
    expect(added.next.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 2 })
    expect(added.next.seriesId).toBe('serie-nova')

    const seriesless = planTaskUpdate(without, { recurrence: { frequency: 'DAILY', intervalDays: 1 } }, { now: fixedNow(), generateId: counter() })
    expect(seriesless).toEqual({ ok: false, kind: 'identity' })

    const historical = buildTask({ dueAt: due, seriesId: 'serie-historica' })
    const readded = planTaskUpdate(historical, { recurrence: { frequency: 'DAILY', intervalDays: 1 } }, { now: fixedNow(), generateId: counter() })
    expect(readded.ok && readded.next?.seriesId).toBe('serie-historica')
  })

  it('until omitido conserva, null retira e string altera; comparação é contra o prazo combinado', () => {
    const until = '2026-12-01T10:00:00.000Z'
    const current = buildTask({ dueAt: due, seriesId: 'serie-1', recurrence: { frequency: 'DAILY', intervalDays: 1, until } })

    const kept = planTaskUpdate(current, { title: 'Outro título', recurrence: { frequency: 'DAILY', intervalDays: 1 } }, { now: fixedNow(), generateId: counter() })
    expect(kept.ok && kept.next?.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1, until })
    // Regra idêntica sem outra mudança é no-op: nada a gravar.
    expect(planTaskUpdate(current, { recurrence: { frequency: 'DAILY', intervalDays: 1 } }, { now: fixedNow(), generateId: counter() })).toEqual({
      ok: true,
      next: undefined,
    })

    const cleared = planTaskUpdate(current, { recurrence: { frequency: 'DAILY', intervalDays: 1, until: null } }, { now: fixedNow(), generateId: counter() })
    expect(cleared.ok).toBe(true)
    if (cleared.ok && cleared.next !== undefined) expect('until' in (cleared.next.recurrence ?? {})).toBe(false)

    const changed = planTaskUpdate(
      current,
      { dueAt: '2026-11-15T10:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 1, until: '2026-11-14T10:00:00.000Z' } },
      { now: fixedNow(), generateId: counter() },
    )
    expect(changed).toEqual({ ok: false, kind: 'validation', fields: { recurrence: { until: 'UNTIL_BEFORE_DUE' } } })

    const invalid = planTaskUpdate(current, { recurrence: { frequency: 'DAILY', intervalDays: 1, until: 'impossível' } }, { now: fixedNow(), generateId: counter() })
    expect(invalid).toEqual({ ok: false, kind: 'validation', fields: { recurrence: { until: 'INVALID_VALUE' } } })
  })

  it('remover o prazo com regra viva recusa com DUE_REQUIRED', () => {
    const current = buildTask({ dueAt: due, seriesId: 'serie-1', recurrence: rule })
    expect(planTaskUpdate(current, { dueAt: null }, { now: fixedNow(), generateId: counter() })).toEqual({
      ok: false,
      kind: 'validation',
      fields: { dueAt: 'DUE_REQUIRED' },
    })
    // Retirar a regra e o prazo juntos é permitido.
    expect(planTaskUpdate(current, { dueAt: null, recurrence: null }, { now: fixedNow(), generateId: counter() }).ok).toBe(true)
  })

  it('lembrete absoluto impede adicionar/alterar regra sem remover o lembrete', () => {
    const current = buildTask({
      dueAt: due,
      seriesId: 'serie-1',
      reminders: [{ id: 'r1', type: 'AT', at: '2026-10-05T09:00:00.000Z' }],
    })
    const plan = planTaskUpdate(current, { recurrence: { frequency: 'DAILY', intervalDays: 1 } }, { now: fixedNow(), generateId: counter() })
    expect(plan).toEqual({
      ok: false,
      kind: 'validation',
      fields: { recurrence: { frequency: 'ABSOLUTE_REMINDER_INCOMPATIBLE' } },
    })
  })
})

describe('task-draft avançado: subtarefas no patch e no-op', () => {
  it('adiciona sem ID, reordena preservando done, limpa com [] e recusa ID removido', () => {
    const current = buildTask({
      subtasks: [
        { id: 's1', title: 'A', done: true },
        { id: 's2', title: 'B', done: false },
      ],
    })

    const reordered = planTaskUpdate(
      current,
      { subtasks: [{ id: 's2', title: 'B' }, { id: 's1', title: 'A' }] },
      { now: fixedNow(), generateId: counter('n') },
    )
    expect(reordered.ok).toBe(true)
    if (reordered.ok && reordered.next !== undefined) {
      expect(reordered.next.subtasks).toEqual([
        { id: 's2', title: 'B', done: false },
        { id: 's1', title: 'A', done: true },
      ])
    }

    const added = planTaskUpdate(
      current,
      { subtasks: [{ id: 's1', title: 'A' }, { title: 'C' }] },
      { now: fixedNow(), generateId: counter('n') },
    )
    expect(added.ok).toBe(true)
    if (added.ok && added.next !== undefined) {
      expect(added.next.subtasks[1]).toEqual({ id: 'n-1', title: 'C', done: false })
      expect(added.next.subtasks[0]?.done).toBe(true)
    }

    const cleared = planTaskUpdate(current, { subtasks: [] }, { now: fixedNow(), generateId: counter() })
    expect(cleared.ok && cleared.next?.subtasks).toEqual([])

    const unknown = planTaskUpdate(
      current,
      { subtasks: [{ id: 'sumiu', title: 'X' }] },
      { now: fixedNow(), generateId: counter() },
    )
    expect(unknown).toEqual({ ok: false, kind: 'validation', fields: { subtasks: { items: [{ index: 0, id: 'UNKNOWN_ID' }] } } })
  })

  it('parâmetros de frequência alheia invalidam a regra no domínio (defesa em profundidade)', () => {
    const current = buildTask({ dueAt: '2026-10-05T10:00:00.000Z', seriesId: 'serie-1' })
    const alien = planTaskUpdate(
      current,
      { recurrence: { frequency: 'DAILY', intervalDays: 1, weekdays: [1] } as unknown as TaskRecurrenceDraft },
      { now: fixedNow(), generateId: counter() },
    )
    expect(alien).toEqual({
      ok: false,
      kind: 'validation',
      fields: { recurrence: { frequency: 'INVALID_VALUE' } },
    })
  })

  it('patch vazio ou exatamente o estado atual não grava', () => {
    const current = buildTask({
      dueAt: '2026-10-05T10:00:00.000Z',
      seriesId: 'serie-1',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
      subtasks: [{ id: 's1', title: 'A', done: true }],
    })
    expect(planTaskUpdate(current, {}, { now: fixedNow(), generateId: counter() })).toEqual({ ok: true, next: undefined })
    expect(
      planTaskUpdate(
        current,
        {
          title: current.title,
          ...(current.dueAt !== undefined && { dueAt: current.dueAt }),
          recurrence: { frequency: 'DAILY', intervalDays: 1 },
          subtasks: [{ id: 's1', title: 'A' }],
        },
        { now: fixedNow(), generateId: counter() },
      ),
    ).toEqual({ ok: true, next: undefined })
  })

  it('gerador de ID de subtarefa esgotado vira identidade recusada sem tarefa parcial', () => {
    const current = buildTask({ subtasks: [{ id: 's1', title: 'A', done: false }] })
    expect(
      planTaskUpdate(current, { subtasks: [{ id: 's1', title: 'A' }, { title: 'Nova' }] }, { now: fixedNow(), generateId: () => 's1' }),
    ).toEqual({ ok: false, kind: 'identity' })
  })
})
