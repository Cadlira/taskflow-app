import { describe, expect, it } from 'vitest'
import { planBasicPatch } from '../../src/domain/task-draft.js'
import { buildTask, fixedNow } from '../support/task-fixtures.js'

describe('task-draft: patch de edição', () => {
  it('patch vazio ou igual ao atual é no-op sem gravação', () => {
    const current = buildTask()
    expect(planBasicPatch(current, {}, fixedNow())).toEqual({ ok: true, next: undefined })
    expect(
      planBasicPatch(
        current,
        {
          title: current.title,
          ...(current.description !== undefined && { description: current.description }),
          tags: [...current.tags],
          status: current.status,
        },
        fixedNow(),
      ),
    ).toEqual({ ok: true, next: undefined })
  })

  it('altera somente os campos presentes e atualiza updatedAt', () => {
    const current = buildTask()
    const plan = planBasicPatch(current, { title: '  Novo título  ', priority: 'HIGH' }, fixedNow())
    expect(plan.ok).toBe(true)
    if (!plan.ok || plan.next === undefined) return
    expect(plan.next.title).toBe('Novo título')
    expect(plan.next.priority).toBe('HIGH')
    expect(plan.next.updatedAt).toBe('2026-10-04T12:00:00.000Z')
    expect(plan.next.createdAt).toBe(current.createdAt)
    expect(plan.next.id).toBe(current.id)
  })

  it('null limpa opcionais e [] limpa tags; vazio em texto alterado vira ausência', () => {
    const plan = planBasicPatch(
      buildTask(),
      { description: null, requester: '   ', assignee: null, sourceUrl: null, tags: [] },
      fixedNow(),
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok || plan.next === undefined) return
    expect(plan.next.description).toBeUndefined()
    expect(plan.next.requester).toBeUndefined()
    expect(plan.next.assignee).toBeUndefined()
    expect(plan.next.sourceUrl).toBeUndefined()
    expect(plan.next.tags).toEqual([])
  })

  it('preserva valores históricos intactos, inclusive acima dos limites de formulário', () => {
    const historical = buildTask({
      title: 'T'.repeat(500),
      description: 'D'.repeat(9000),
      tags: Array.from({ length: 20 }, (_unused, index) => `etiqueta-${index}`),
      sourceUrl: 'valor-historico-sem-http',
      dueAt: '2026-10-05T15:30:45.123Z',
    })
    // Campo ausente não é revalidado nem limpo.
    const plan = planBasicPatch(historical, { priority: 'LOW' }, fixedNow())
    expect(plan.ok).toBe(true)
    if (!plan.ok || plan.next === undefined) return
    expect(plan.next.title).toBe(historical.title)
    expect(plan.next.description).toBe(historical.description)
    expect(plan.next.tags).toEqual(historical.tags)
    expect(plan.next.sourceUrl).toBe('valor-historico-sem-http')
    expect(plan.next.dueAt).toBe('2026-10-05T15:30:45.123Z')

    // Valor presente e idêntico ao salvo também é considerado intacto.
    const same = planBasicPatch(historical, { title: historical.title, tags: [...historical.tags] }, fixedNow())
    expect(same).toEqual({ ok: true, next: undefined })

    // Valor alterado precisa cumprir o limite.
    expect(planBasicPatch(historical, { title: 'T'.repeat(500) + 'x' }, fixedNow())).toEqual({
      ok: false,
      fields: { title: 'TOO_LONG' },
    })
    expect(planBasicPatch(historical, { description: 'D'.repeat(9000) + 'x' }, fixedNow())).toEqual({
      ok: false,
      fields: { description: 'TOO_LONG' },
    })
  })

  it('conserva prazo com precisão e instante; nova edição normaliza; null remove', () => {
    const current = buildTask({ dueAt: '2026-10-05T15:30:45.123Z' })
    const untouched = planBasicPatch(current, { title: 'Outro' }, fixedNow())
    expect(untouched.ok && untouched.next?.dueAt).toBe('2026-10-05T15:30:45.123Z')

    const equal = planBasicPatch(current, { dueAt: '2026-10-05T15:30:45.123Z' }, fixedNow())
    expect(equal).toEqual({ ok: true, next: undefined })

    const changed = planBasicPatch(current, { dueAt: '2026-10-06T09:00:00-03:00' }, fixedNow())
    expect(changed.ok).toBe(true)
    if (changed.ok && changed.next !== undefined) {
      expect(changed.next.dueAt).toBe('2026-10-06T12:00:00.000Z')
    }

    const removed = planBasicPatch(current, { dueAt: null }, fixedNow())
    expect(removed.ok).toBe(true)
    if (removed.ok && removed.next !== undefined) expect('dueAt' in removed.next).toBe(false)

    expect(planBasicPatch(current, { dueAt: 'impossível' }, fixedNow())).toEqual({
      ok: false,
      fields: { dueAt: 'INVALID_DATE' },
    })
  })

  it('preserva série, subtarefas, lembretes e processedFor em edição independente', () => {
    const current = buildTask({
      seriesId: 'serie-1',
      recurrence: { frequency: 'DAILY', intervalDays: 2 },
      subtasks: [
        { id: 's1', title: 'Passo 1', done: true },
        { id: 's2', title: 'Passo 2 — acentuação', done: false },
      ],
      reminders: [
        { id: 'r1', type: 'OFFSET', offsetMinutes: 60, processedFor: '2026-10-01T09:00:00.000Z' },
        { id: 'r2', type: 'AT', at: '2026-10-01T08:00:00.000Z' },
      ],
      tags: ['日本', 'ação'],
    })

    const plan = planBasicPatch(current, { description: 'Nova descrição' }, fixedNow())
    expect(plan.ok).toBe(true)
    if (!plan.ok || plan.next === undefined) return
    expect(plan.next.seriesId).toBe('serie-1')
    expect(plan.next.recurrence).toEqual(current.recurrence)
    expect(plan.next.subtasks).toEqual(current.subtasks)
    expect(plan.next.reminders).toEqual(current.reminders)
    expect(plan.next.reminders[0]?.processedFor).toBe('2026-10-01T09:00:00.000Z')

    // Unicode e escaping não são truncados.
    const unicode = 'áéíóú — 日本語 🚀 "aspas" \\barra\\ \n\tlinha'
    const unicodePlan = planBasicPatch(current, { description: unicode }, fixedNow())
    if (unicodePlan.ok && unicodePlan.next !== undefined) expect(unicodePlan.next.description).toBe(unicode)
  })

  it('status pelo patch segue completedAt e no-op; demais campos permanecem', () => {
    const current = buildTask({ status: 'IN_PROGRESS' })

    const toDone = planBasicPatch(current, { status: 'DONE' }, fixedNow())
    expect(toDone.ok).toBe(true)
    if (toDone.ok && toDone.next !== undefined) {
      expect(toDone.next.status).toBe('DONE')
      expect(toDone.next.completedAt).toBe('2026-10-04T12:00:00.000Z')
      expect(toDone.next.updatedAt).toBe('2026-10-04T12:00:00.000Z')
    }

    const done = buildTask({ status: 'DONE', completedAt: '2026-10-02T10:00:00.000Z' })
    const toTodo = planBasicPatch(done, { status: 'TODO' }, fixedNow())
    expect(toTodo.ok).toBe(true)
    if (toTodo.ok && toTodo.next !== undefined) {
      expect(toTodo.next.status).toBe('TODO')
      expect('completedAt' in toTodo.next).toBe(false)
    }

    // Mesmo status com outro campo alterado conserva completedAt.
    const sameStatus = planBasicPatch(done, { status: 'DONE', title: 'Outro' }, fixedNow())
    expect(sameStatus.ok).toBe(true)
    if (sameStatus.ok && sameStatus.next !== undefined) {
      expect(sameStatus.next.completedAt).toBe('2026-10-02T10:00:00.000Z')
      expect(sameStatus.next.title).toBe('Outro')
    }
  })

  it('edita tags com deduplicação e valida origem alterada', () => {
    const plan = planBasicPatch(buildTask({ tags: ['a', 'b'] }), { tags: ['B', ' c ', 'c'] }, fixedNow())
    expect(plan.ok).toBe(true)
    if (plan.ok && plan.next !== undefined) expect(plan.next.tags).toEqual(['B', 'c'])

    expect(planBasicPatch(buildTask(), { sourceUrl: 'não-é-url' }, fixedNow())).toEqual({
      ok: false,
      fields: { sourceUrl: 'INVALID_URL' },
    })

    const cleared = planBasicPatch(buildTask({ sourceUrl: 'https://example.test' }), { sourceUrl: '' }, fixedNow())
    expect(cleared.ok).toBe(true)
    if (cleared.ok && cleared.next !== undefined) expect('sourceUrl' in cleared.next).toBe(false)
  })

  it('recusa patch inválido sem devolver tarefa parcial', () => {
    const invalid = planBasicPatch(buildTask(), { title: '   ', tags: Array.from({ length: 11 }, (_u, i) => `t${i}`) }, fixedNow())
    expect(invalid).toEqual({ ok: false, fields: { title: 'REQUIRED', tags: 'TOO_MANY' } })
  })
})
