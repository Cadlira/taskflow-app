import { describe, expect, it } from 'vitest'
import {
  TASK_LIMITS,
  createBasicTask,
  isHttpUrl,
  normalizeTags,
  validateBasicDraft,
  type BasicTaskDraft,
} from '../../src/domain/task-draft.js'
import { fixedNow } from '../support/task-fixtures.js'

function draft(overrides: Partial<BasicTaskDraft> = {}): BasicTaskDraft {
  return { title: 'Comprar leite', ...overrides }
}

describe('task-draft: criação básica', () => {
  it.each(['https://user:password@example.test', 'https://@example.test', 'https:example.test', 'https://example.test/\n', 'https://example.test/\u0080', 'https://example.test/\ud800'])('Q01 origem manual nova recusa candidato inseguro: %s', sourceUrl => {
    expect(validateBasicDraft(draft({ sourceUrl }))).toEqual({ ok: false, fields: { sourceUrl: 'INVALID_URL' } })
  })
  it('origem manual longa permanece inteira; restrição de abertura não vira limite de codec', () => {
    const sourceUrl = 'https://example.test/' + 'a'.repeat(3000)
    const result = validateBasicDraft(draft({ sourceUrl })); expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.sourceUrl).toBe(sourceUrl)
  })
  it('cria com defaults TODO/MEDIUM, tags vazias e auditoria do proprietário', () => {
    const validation = validateBasicDraft(draft())
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const task = createBasicTask(validation.value, { now: fixedNow(), id: 'id-fixo' })
    expect(task).toMatchObject({
      id: 'id-fixo',
      title: 'Comprar leite',
      status: 'TODO',
      priority: 'MEDIUM',
      tags: [],
      reminders: [],
      subtasks: [],
      createdAt: '2026-10-04T12:00:00.000Z',
      updatedAt: '2026-10-04T12:00:00.000Z',
    })
    expect(task.completedAt).toBeUndefined()
    expect(task.description).toBeUndefined()
  })

  it('normaliza textos, tags e opcionais; aceita criação completa', () => {
    const validation = validateBasicDraft(
      draft({
        title: '  Comprar leite  ',
        description: '  Integral  ',
        requester: ' Ana ',
        assignee: '  Bruno',
        status: 'DONE',
        priority: 'URGENT',
        dueAt: '2026-10-05T15:30:00.000Z',
        tags: ['casa', 'CASA', ' mercado ', '', 'café'],
        sourceUrl: '  https://example.test/pedido  ',
      }),
    )
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.value).toEqual({
      title: 'Comprar leite',
      description: 'Integral',
      requester: 'Ana',
      assignee: 'Bruno',
      status: 'DONE',
      priority: 'URGENT',
      dueAt: '2026-10-05T15:30:00.000Z',
      tags: ['casa', 'mercado', 'café'],
      sourceUrl: 'https://example.test/pedido',
    })

    const task = createBasicTask(validation.value, { now: fixedNow(), id: 'id' })
    expect(task.status).toBe('DONE')
    expect(task.completedAt).toBe('2026-10-04T12:00:00.000Z')
  })

  it('textos opcionais vazios viram ausência e não entram na tarefa', () => {
    const validation = validateBasicDraft(draft({ description: '   ', requester: '', assignee: '\t' }))
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const task = createBasicTask(validation.value, { now: fixedNow(), id: 'id' })
    expect(task.description).toBeUndefined()
    expect(task.requester).toBeUndefined()
    expect(task.assignee).toBeUndefined()
  })

  it('título obrigatório e limites exatos/excedidos', () => {
    expect(validateBasicDraft(draft({ title: '   ' }))).toEqual({ ok: false, fields: { title: 'REQUIRED' } })
    expect(validateBasicDraft(draft({ title: 'x'.repeat(TASK_LIMITS.title) })).ok).toBe(true)
    expect(validateBasicDraft(draft({ title: 'x'.repeat(TASK_LIMITS.title + 1) }))).toEqual({
      ok: false,
      fields: { title: 'TOO_LONG' },
    })

    const longDescription = 'x'.repeat(TASK_LIMITS.description)
    expect(validateBasicDraft(draft({ description: longDescription })).ok).toBe(true)
    expect(validateBasicDraft(draft({ description: `${longDescription}x` }))).toEqual({
      ok: false,
      fields: { description: 'TOO_LONG' },
    })

    expect(validateBasicDraft(draft({ requester: 'x'.repeat(TASK_LIMITS.person) })).ok).toBe(true)
    expect(validateBasicDraft(draft({ assignee: 'x'.repeat(TASK_LIMITS.person + 1) }))).toEqual({
      ok: false,
      fields: { assignee: 'TOO_LONG' },
    })
  })

  it('limites de tags: exatos aceitos, quantidade e tamanho excedidos recusados', () => {
    const tenTags = Array.from({ length: TASK_LIMITS.tags }, (_unused, index) => `tag-${index}`)
    expect(validateBasicDraft(draft({ tags: tenTags })).ok).toBe(true)
    expect(validateBasicDraft(draft({ tags: [...tenTags, 'extra'] }))).toEqual({
      ok: false,
      fields: { tags: 'TOO_MANY' },
    })
    expect(validateBasicDraft(draft({ tags: ['x'.repeat(TASK_LIMITS.tag)] })).ok).toBe(true)
    expect(validateBasicDraft(draft({ tags: ['x'.repeat(TASK_LIMITS.tag + 1)] }))).toEqual({
      ok: false,
      fields: { tags: 'TOO_LONG' },
    })
    // Duplicatas por caixa não contam duas vezes.
    expect(normalizeTags(['A', 'a', 'b'])).toEqual(['A', 'b'])
    expect(validateBasicDraft(draft({ tags: [...tenTags, tenTags[0]?.toUpperCase() ?? 'X'] })).ok).toBe(true)
  })

  it('valida prazo e URL de origem', () => {
    expect(validateBasicDraft(draft({ dueAt: 'não-é-data' }))).toEqual({ ok: false, fields: { dueAt: 'INVALID_DATE' } })
    // Instantâneo fora do intervalo representável.
    expect(validateBasicDraft(draft({ dueAt: '+275760-09-13T00:00:00.001Z' }))).toEqual({
      ok: false,
      fields: { dueAt: 'INVALID_DATE' },
    })
    expect(validateBasicDraft(draft({ dueAt: '2028-02-29T10:00:00.000Z' })).ok).toBe(true)

    expect(validateBasicDraft(draft({ sourceUrl: 'ftp://example.test' }))).toEqual({
      ok: false,
      fields: { sourceUrl: 'INVALID_URL' },
    })
    expect(validateBasicDraft(draft({ sourceUrl: 'example.test' }))).toEqual({
      ok: false,
      fields: { sourceUrl: 'INVALID_URL' },
    })
    expect(validateBasicDraft(draft({ sourceUrl: 'https://example.test/a?b=1#c' })).ok).toBe(true)
    expect(isHttpUrl('HTTP://EXAMPLE.TEST')).toBe(true)
    expect(isHttpUrl('file:///C:/x')).toBe(false)
  })

  it('status e prioridade inválidos são recusados com código finito', () => {
    expect(validateBasicDraft(draft({ status: 'NOPE' as never }))).toEqual({
      ok: false,
      fields: { status: 'INVALID_VALUE' },
    })
    expect(validateBasicDraft(draft({ priority: 'NOPE' as never }))).toEqual({
      ok: false,
      fields: { priority: 'INVALID_VALUE' },
    })
  })
})
