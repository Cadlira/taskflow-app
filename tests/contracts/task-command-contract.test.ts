import { describe, expect, it } from 'vitest'
import {
  TASK_COMMAND_LIMITS,
  TASK_MUTATION_ERROR_CODES,
  TASK_SOURCE_ERROR_CODES,
  fitsResponseBudget,
  parseSubtaskDoneRequest,
  parseSubtaskDoneResult,
  parseTaskCreateRequest,
  parseTaskCreateResult,
  parseTaskMutationResult,
  parseTaskOpenSourceRequest,
  parseTaskOpenSourceResult,
  parseTaskStatusRequest,
  parseTaskUpdateRequest,
  taskMutationFailure,
  taskSourceFailure,
  type TaskCreateRequest,
  type TaskPatch,
  type TaskUpdateRequest,
} from '../../src/contracts/tasks.js'

const REVISION = '42'
const EDIT_REVISION = '41'
/** Caractere de controle: cada um ocupa seis bytes no JSON serializado. */
const ESCAPED = '\u0007'
const UUID = '00000000-0000-4000-8000-000000000000'

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function createRequest(draft: Record<string, unknown>): unknown {
  return { version: 2, draft }
}

function updateRequest(patch: Record<string, unknown>, extra: Record<string, unknown> = {}): unknown {
  return { version: 2, taskId: 'tarefa-1', expectedEditRevision: EDIT_REVISION, patch, ...extra }
}

/** Draft completo com campos básicos nos limites e 20 títulos de subtarefa de 200 caracteres. */
function boundaryDraft(): Record<string, unknown> {
  return {
    title: ESCAPED.repeat(200),
    description: '\u0000'.repeat(4000),
    requester: ESCAPED.repeat(120),
    assignee: ESCAPED.repeat(120),
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueAt: '2026-10-04T12:00:00.000Z',
    tags: Array.from({ length: 10 }, (_unused, index) => `tag-${index}-${'x'.repeat(24)}`),
    sourceUrl: `https://example.test/${'x'.repeat(2062)}`,
    subtasks: Array.from({ length: 20 }, (_unused, index) => ({ title: `${ESCAPED.repeat(200)}${String(index).padStart(2, '0')}` })),
  }
}

describe('contrato dos comandos de tarefas v2', () => {
  it('aceita criação mínima e completa com básicos, regra e títulos de subtarefa', () => {
    const minimal = parseTaskCreateRequest(createRequest({ title: 'Comprar leite' }))
    expect(minimal.kind).toBe('ok')
    if (minimal.kind === 'ok') expect(minimal.value).toEqual<TaskCreateRequest>({ version: 2, draft: { title: 'Comprar leite' } })

    const complete = parseTaskCreateRequest(
      createRequest({
        title: 'Comprar leite',
        description: 'Integral',
        requester: 'Ana',
        assignee: 'Bruno',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueAt: '2026-10-04T12:00:00.000Z',
        tags: ['casa', 'mercado'],
        sourceUrl: 'https://example.test/pedido',
        recurrence: { frequency: 'WEEKLY', weekdays: [1, 3, 5], until: '2026-12-01T10:00:00.000Z' },
        subtasks: [{ title: 'Mercado' }, { title: 'Padaria' }],
      }),
    )
    expect(complete.kind).toBe('ok')
    if (complete.kind !== 'ok') return
    expect(complete.value).toEqual<TaskCreateRequest>({
      version: 2,
      draft: {
        title: 'Comprar leite',
        description: 'Integral',
        requester: 'Ana',
        assignee: 'Bruno',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueAt: '2026-10-04T12:00:00.000Z',
        tags: ['casa', 'mercado'],
        sourceUrl: 'https://example.test/pedido',
        recurrence: { frequency: 'WEEKLY', weekdays: [1, 3, 5], until: '2026-12-01T10:00:00.000Z' },
        subtasks: [{ title: 'Mercado' }, { title: 'Padaria' }],
      },
    })
  })

  it('aceita as três frequências exatas e recusa parâmetros de frequência alheia', () => {
    const daily = parseTaskCreateRequest(createRequest({ title: 'ok', dueAt: '2026-10-04T12:00:00.000Z', recurrence: { frequency: 'DAILY', intervalDays: 365 } }))
    expect(daily.kind).toBe('ok')
    if (daily.kind === 'ok') expect(daily.value.draft.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 365 })

    const monthly = parseTaskCreateRequest(createRequest({ title: 'ok', dueAt: '2026-10-04T12:00:00.000Z', recurrence: { frequency: 'MONTHLY', dayOfMonth: 31 } }))
    expect(monthly.kind).toBe('ok')
    if (monthly.kind === 'ok') expect(monthly.value.draft.recurrence).toEqual({ frequency: 'MONTHLY', dayOfMonth: 31 })
  })

  it('recusa parâmetros de frequência alheia', () => {
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'DAILY', weekdays: [1] } })).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'WEEKLY', intervalDays: 1 } })).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'MONTHLY', weekdays: [1] } })).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'WEEKLY', dayOfMonth: 5 } })).kind).toBe('invalid-request')
  })

  it('recusa campos de autoridade e de sistema antes de qualquer leitura', () => {
    for (const extra of [
      { id: 'x' },
      { createdAt: '2026-10-04T00:00:00.000Z' },
      { updatedAt: '2026-10-04T00:00:00.000Z' },
      { completedAt: '2026-10-04T00:00:00.000Z' },
      { seriesId: 's' },
      { recurrence: { frequency: 'DAILY', intervalDays: 1, anchorAt: '2026-10-04T00:00:00.000Z' } },
      { reminders: [] },
      { processedFor: '2026-10-04T00:00:00.000Z' },
      { children: [] },
      { depth: 1 },
      { path: 'C:\\dados' },
      { workingDirectory: 'C:\\' },
      { undoPlan: {} },
      { shell: 'open' },
      { url: 'https://example.test' },
    ]) {
      expect(parseTaskCreateRequest(createRequest({ title: 'ok', ...extra })).kind).toBe('invalid-request')
      expect(parseTaskUpdateRequest(updateRequest(extra)).kind).toBe('invalid-request')
    }

    // `done` pertence à marcação tipada, nunca ao draft/à lista.
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', subtasks: [{ title: 'a', done: true }] })).kind).toBe('invalid-request')
    expect(parseTaskUpdateRequest(updateRequest({ subtasks: [{ id: 's1', title: 'a', done: true }] })).kind).toBe('invalid-request')
    // Criação não transporta IDs de subtarefa.
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', subtasks: [{ id: UUID, title: 'a' }] })).kind).toBe('invalid-request')
  })

  it('recusa v1 antigo sem tocar no conteúdo do request', () => {
    const draftTrap = Object.defineProperty({}, 'title', {
      enumerable: true,
      get: () => {
        throw new Error('leu draft v1')
      },
    })
    const patchTrap = Object.defineProperty({}, 'title', {
      enumerable: true,
      get: () => {
        throw new Error('leu patch v1')
      },
    })
    expect(parseTaskCreateRequest({ version: 1, draft: draftTrap }).kind).toBe('invalid-request')
    expect(parseTaskUpdateRequest({ version: 1, taskId: 'a', expectedContentRevision: REVISION, patch: patchTrap }).kind).toBe('invalid-request')
    expect(parseTaskStatusRequest({ version: 1, taskId: 'a', expectedContentRevision: REVISION, status: 'DONE' }).kind).toBe('invalid-request')
    expect(parseSubtaskDoneRequest({ version: 1, taskId: 'a', expectedContentRevision: REVISION, subtaskId: 's', done: true }).kind).toBe('invalid-request')
    // openTaskSource conserva v1: a versão 2 é que é recusada.
    expect(parseTaskOpenSourceRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION }).kind).toBe('invalid-request')
    expect(parseTaskOpenSourceRequest({ version: 1, taskId: 'a', expectedContentRevision: REVISION }).kind).toBe('ok')
  })

  it('valida título, enums, tipos e códigos finitos por campo', () => {
    expect(parseTaskCreateRequest(createRequest({}))).toEqual({ kind: 'validation', fields: { title: 'REQUIRED' } })
    expect(parseTaskCreateRequest(createRequest({ title: 42 }))).toEqual({ kind: 'validation', fields: { title: 'INVALID_VALUE' } })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', status: 'BOGUS' }))).toEqual({
      kind: 'validation',
      fields: { status: 'INVALID_VALUE' },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', priority: 1 }))).toEqual({
      kind: 'validation',
      fields: { priority: 'INVALID_VALUE' },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', tags: ['a', 2] }))).toEqual({
      kind: 'validation',
      fields: { tags: 'INVALID_VALUE' },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', tags: 'x' }))).toEqual({ kind: 'validation', fields: { tags: 'INVALID_VALUE' } })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', description: 7 }))).toEqual({
      kind: 'validation',
      fields: { description: 'INVALID_VALUE' },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', dueAt: 123 }))).toEqual({
      kind: 'validation',
      fields: { dueAt: 'INVALID_VALUE' },
    })

    // Opcional `null` na criação equivale a ausência (não leva a chave para o draft).
    const nulled = parseTaskCreateRequest(createRequest({ title: 'ok', description: null, dueAt: null, tags: null }))
    expect(nulled).toEqual({ kind: 'validation', fields: { tags: 'INVALID_VALUE' } })

    // Erros da regra em forma finita por subcampo.
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'BOGUS' } }))).toEqual({
      kind: 'validation',
      fields: { recurrence: { frequency: 'INVALID_VALUE' } },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: null } }))).toEqual({
      kind: 'validation',
      fields: { recurrence: { frequency: 'REQUIRED' } },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { intervalDays: 1 } })).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'DAILY', intervalDays: 'x' } }))).toEqual({
      kind: 'validation',
      fields: { recurrence: { intervalDays: 'INVALID_VALUE' } },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'WEEKLY', weekdays: [0, 'x'] } }))).toEqual({
      kind: 'validation',
      fields: { recurrence: { weekdays: 'INVALID_VALUE' } },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'MONTHLY', dayOfMonth: 'x' } }))).toEqual({
      kind: 'validation',
      fields: { recurrence: { dayOfMonth: 'INVALID_VALUE' } },
    })
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'DAILY', intervalDays: 1, until: 5 } }))).toEqual({
      kind: 'validation',
      fields: { recurrence: { until: 'INVALID_VALUE' } },
    })

    // Erros de subtarefas posicionais e finitos.
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', subtasks: [{ title: 42 }] }))).toEqual({
      kind: 'validation',
      fields: { subtasks: { items: [{ index: 0, title: 'REQUIRED' }] } },
    })
    expect(
      parseTaskCreateRequest(createRequest({ title: 'ok', subtasks: Array.from({ length: 21 }, (_unused, index) => ({ title: `s${index}` })) })),
    ).toEqual({ kind: 'validation', fields: { subtasks: { list: 'TOO_MANY' } } })
    expect(
      parseTaskCreateRequest(
        createRequest({ title: 'ok', subtasks: Array.from({ length: 21 }, () => ({ title: 'x' })).map((item, index) => (index === 20 ? { title: 7 } : item)) }),
      ),
    ).toEqual({ kind: 'validation', fields: { subtasks: { list: 'TOO_MANY', items: [{ index: 20, title: 'REQUIRED' }] } } })

    // Chaves extras em regra/subtarefa e protótipos estranhos continuam inválidos.
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', recurrence: { frequency: 'DAILY', intervalDays: 1, extra: 1 } })).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', subtasks: [{ title: 'a', extra: 1 }] })).kind).toBe('invalid-request')
    class DraftLike {
      title = 'ok'
    }
    expect(parseTaskCreateRequest({ version: 2, draft: new DraftLike() }).kind).toBe('invalid-request')
    const accessor = { get title(): string { return 'ok' } }
    expect(parseTaskCreateRequest({ version: 2, draft: accessor }).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest({ version: 2, draft: { title: 'ok' }, extra: true }).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest({ version: 2, draft: null }).kind).toBe('invalid-request')
  })

  it('update aceita ID/revisão de edição exatos e distingue omitido/null/[] por campo', () => {
    const empty = parseTaskUpdateRequest(updateRequest({}))
    expect(empty.kind).toBe('ok')
    if (empty.kind === 'ok') {
      expect(empty.value).toEqual<TaskUpdateRequest>({ version: 2, taskId: 'tarefa-1', expectedEditRevision: EDIT_REVISION, patch: {} })
    }

    const cleared = parseTaskUpdateRequest(
      updateRequest({
        title: 'Novo título',
        description: null,
        requester: null,
        assignee: null,
        dueAt: null,
        sourceUrl: null,
        tags: [],
        status: 'DONE',
        priority: 'LOW',
        subtasks: [],
      }),
    )
    expect(cleared.kind).toBe('ok')
    if (cleared.kind !== 'ok') return
    expect(cleared.value.patch).toEqual<TaskPatch>({
      title: 'Novo título',
      description: null,
      requester: null,
      assignee: null,
      dueAt: null,
      sourceUrl: null,
      tags: [],
      status: 'DONE',
      priority: 'LOW',
      subtasks: [],
    })

    // Ausente conserva: só as chaves enviadas entram no patch.
    const partial = parseTaskUpdateRequest(updateRequest({ title: 'Só título' }))
    expect(partial.kind).toBe('ok')
    if (partial.kind === 'ok') expect(Object.keys(partial.value.patch)).toEqual(['title'])

    expect(parseTaskUpdateRequest(updateRequest({ title: null }))).toEqual({ kind: 'validation', fields: { title: 'INVALID_VALUE' } })
    expect(parseTaskUpdateRequest(updateRequest({ status: null }))).toEqual({ kind: 'validation', fields: { status: 'INVALID_VALUE' } })
    expect(parseTaskUpdateRequest(updateRequest({ priority: null }))).toEqual({ kind: 'validation', fields: { priority: 'INVALID_VALUE' } })
    expect(parseTaskUpdateRequest(updateRequest({ tags: null }))).toEqual({ kind: 'validation', fields: { tags: 'INVALID_VALUE' } })
    expect(parseTaskUpdateRequest(updateRequest({ subtasks: 7 })).kind).toBe('invalid-request')

    // Regra: omitida conserva; null retira; objeto altera.
    const rule = parseTaskUpdateRequest(updateRequest({ recurrence: { frequency: 'DAILY', intervalDays: 2 } }))
    expect(rule.kind).toBe('ok')
    if (rule.kind === 'ok') expect(rule.value.patch.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 2 })
    const removed = parseTaskUpdateRequest(updateRequest({ recurrence: null }))
    expect(removed.kind).toBe('ok')
    if (removed.kind === 'ok') expect(removed.value.patch.recurrence).toBeNull()
    const omitted = parseTaskUpdateRequest(updateRequest({ title: 'x' }))
    expect(omitted.kind).toBe('ok')
    if (omitted.kind === 'ok') expect('recurrence' in omitted.value.patch).toBe(false)

    // `until`: omitido conserva o existente; null retira; string altera.
    const keepUntil = parseTaskUpdateRequest(updateRequest({ recurrence: { frequency: 'DAILY', intervalDays: 2 } }))
    expect(keepUntil.kind).toBe('ok')
    if (keepUntil.kind === 'ok') expect('until' in (keepUntil.value.patch.recurrence ?? {})).toBe(false)
    const dropUntil = parseTaskUpdateRequest(updateRequest({ recurrence: { frequency: 'DAILY', intervalDays: 2, until: null } }))
    expect(dropUntil.kind).toBe('ok')
    if (dropUntil.kind === 'ok') expect(dropUntil.value.patch.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 2, until: null })
    const setUntil = parseTaskUpdateRequest(updateRequest({ recurrence: { frequency: 'DAILY', intervalDays: 2, until: '2026-11-01T10:00:00.000Z' } }))
    expect(setUntil.kind).toBe('ok')
    if (setUntil.kind === 'ok') {
      expect(setUntil.value.patch.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 2, until: '2026-11-01T10:00:00.000Z' })
    }

    // Lista de edição por id/título: id existente ou ausente (novo), nunca done.
    const subtasks = parseTaskUpdateRequest(updateRequest({ subtasks: [{ id: 's1', title: 'A' }, { title: 'B' }] }))
    expect(subtasks.kind).toBe('ok')
    if (subtasks.kind === 'ok') expect(subtasks.value.patch.subtasks).toEqual([{ id: 's1', title: 'A' }, { title: 'B' }])
    expect(parseTaskUpdateRequest(updateRequest({ subtasks: [{ id: 42, title: 'A' }] }))).toEqual({
      kind: 'validation',
      fields: { subtasks: { items: [{ index: 0, id: 'INVALID_VALUE' }] } },
    })
    expect(parseTaskUpdateRequest(updateRequest({ subtasks: [{ id: 's1', title: 42 }] }))).toEqual({
      kind: 'validation',
      fields: { subtasks: { items: [{ index: 0, title: 'REQUIRED' }] } },
    })
  })

  it('aceita ID histórico não vazio e recusa ID/revisão fora de representação', () => {
    expect(
      parseTaskUpdateRequest({ version: 2, taskId: 'tarefa histórica/única — 🚀', expectedEditRevision: '0', patch: {} }).kind,
    ).toBe('ok')
    expect(parseTaskUpdateRequest({ version: 2, taskId: 'a', expectedEditRevision: '9223372036854775807', patch: {} }).kind).toBe('ok')

    for (const taskId of ['', 7, null]) {
      expect(parseTaskUpdateRequest({ version: 2, taskId, expectedEditRevision: '1', patch: {} }).kind).toBe('invalid-request')
    }
    for (const revision of ['', '00', '-1', '1.5', '9223372036854775808', ' 1', 1, null]) {
      expect(parseTaskUpdateRequest({ version: 2, taskId: 'a', expectedEditRevision: revision, patch: {} }).kind).toBe('invalid-request')
      expect(parseTaskStatusRequest({ version: 2, taskId: 'a', expectedEditRevision: revision, status: 'DONE' }).kind).toBe('invalid-request')
      expect(
        parseSubtaskDoneRequest({ version: 2, taskId: 'a', expectedEditRevision: revision, subtaskId: 's', done: true }).kind,
      ).toBe('invalid-request')
      expect(parseTaskOpenSourceRequest({ version: 1, taskId: 'a', expectedContentRevision: revision }).kind).toBe('invalid-request')
    }
  })

  it('status e setSubtaskDone têm shapes exatos; done exige boolean; cancellation é SKIP/END', () => {
    const status = parseTaskStatusRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION, status: 'CANCELLED', cancellation: 'END' })
    expect(status.kind).toBe('ok')
    if (status.kind === 'ok') {
      expect(status.value).toEqual({ version: 2, taskId: 'a', expectedEditRevision: REVISION, status: 'CANCELLED', cancellation: 'END' })
    }
    expect(parseTaskStatusRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION, status: 'NOPE' })).toEqual({
      kind: 'validation',
      fields: { status: 'INVALID_VALUE' },
    })
    expect(parseTaskStatusRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION, status: 'TODO', task: {} }).kind).toBe('invalid-request')

    const done = parseSubtaskDoneRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION, subtaskId: 'sub-1', done: false })
    expect(done.kind).toBe('ok')
    if (done.kind === 'ok') {
      expect(done.value).toEqual({ version: 2, taskId: 'a', expectedEditRevision: REVISION, subtaskId: 'sub-1', done: false })
    }
    for (const value of ['true', 1, null, undefined]) {
      expect(parseSubtaskDoneRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION, subtaskId: 's', done: value })).toEqual({
        kind: 'invalid-request',
      })
    }
    expect(parseSubtaskDoneRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION, subtaskId: '', done: true }).kind).toBe('invalid-request')
    expect(
      parseSubtaskDoneRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION, subtaskId: 's', done: true, cancellation: 'SKIP' }).kind,
    ).toBe('invalid-request')

    // Escolha extrínseca: só SKIP/END passam; presente no request de update/status.
    for (const cancellation of ['skip', 'BOTH', 'ITEM', 1, null]) {
      expect(parseTaskUpdateRequest(updateRequest({}, { cancellation })).kind).toBe('invalid-request')
      expect(parseTaskStatusRequest({ version: 2, taskId: 'a', expectedEditRevision: REVISION, status: 'CANCELLED', cancellation }).kind).toBe(
        'invalid-request',
      )
    }
    expect(parseTaskCreateRequest({ version: 2, draft: { title: 'x' }, cancellation: 'SKIP' }).kind).toBe('invalid-request')
  })

  it('mede o request completo: básicos nos limites e 20 subtarefas abaixo de 64 KiB', () => {
    const within = { version: 2, draft: boundaryDraft() }
    expect(byteLength(within)).toBeLessThanOrEqual(TASK_COMMAND_LIMITS.requestBytes)
    const parsed = parseTaskCreateRequest(within)
    expect(parsed.kind).toBe('ok')
    if (parsed.kind === 'ok') {
      expect(parsed.value.draft.title).toHaveLength(200)
      expect(parsed.value.draft.subtasks).toHaveLength(20)
      expect(parsed.value.draft.tags).toHaveLength(10)
    }

    // Excesso medido no envelope completo é recusado explicitamente, sem truncar o draft.
    const over = { version: 2, draft: { ...boundaryDraft(), description: '\u0000'.repeat(12_000) } }
    expect(byteLength(over)).toBeGreaterThan(TASK_COMMAND_LIMITS.requestBytes)
    expect(parseTaskCreateRequest(over).kind).toBe('invalid-request')

    // O orçamento de resposta é conferido no ack serializado; nunca há truncamento.
    const ack = { version: 2, status: 'ok', taskId: 'x', revision: '1', contentRevision: '1', editRevision: '1' }
    expect(fitsResponseBudget(ack)).toBe(true)
    expect(TASK_COMMAND_LIMITS.responseBytes).toBe(8 * 1024)
    expect(parseTaskCreateResult(ack)).toEqual(ack)
    const huge = { ...ack, taskId: 'x'.repeat(TASK_COMMAND_LIMITS.responseBytes) }
    expect(fitsResponseBudget(huge)).toBe(false)
    expect(parseTaskCreateResult(huge)).toBeNull()
  })

  it('mede IDs históricos longos/estranhos no request completo e recusa o excesso sem truncar', () => {
    const longId = 'x'.repeat(30_000)
    const within = { version: 2, taskId: longId, expectedEditRevision: '1', patch: {} }
    expect(byteLength(within)).toBeLessThanOrEqual(TASK_COMMAND_LIMITS.requestBytes)
    const parsed = parseTaskUpdateRequest(within)
    expect(parsed.kind).toBe('ok')
    if (parsed.kind === 'ok') expect(parsed.value.taskId).toHaveLength(30_000)

    const over = { version: 2, taskId: 'y'.repeat(70_000), expectedEditRevision: '1', patch: {} }
    expect(byteLength(over)).toBeGreaterThan(TASK_COMMAND_LIMITS.requestBytes)
    expect(parseTaskUpdateRequest(over).kind).toBe('invalid-request')
    expect(parseTaskOpenSourceRequest({ version: 1, taskId: longId, expectedContentRevision: '1' }).kind).toBe('ok')
    expect(parseTaskOpenSourceRequest({ version: 1, taskId: 'z'.repeat(70_000), expectedContentRevision: '1' }).kind).toBe('invalid-request')
  })

  it('valida as respostas: ack com as duas revisões, erro por código e campos restritos', () => {
    expect(
      parseTaskCreateResult({ version: 2, status: 'ok', taskId: 'novo', revision: '7', contentRevision: '7', editRevision: '6' }),
    ).toEqual({ version: 2, status: 'ok', taskId: 'novo', revision: '7', contentRevision: '7', editRevision: '6' })
    expect(parseTaskMutationResult({ version: 2, status: 'ok', revision: '8', contentRevision: '8', editRevision: '3' })).toEqual({
      version: 2,
      status: 'ok',
      revision: '8',
      contentRevision: '8',
      editRevision: '3',
    })
    expect(parseSubtaskDoneResult({ version: 2, status: 'ok', revision: '9', contentRevision: '9', editRevision: '3' })).toEqual({
      version: 2,
      status: 'ok',
      revision: '9',
      contentRevision: '9',
      editRevision: '3',
    })
    expect(parseTaskOpenSourceResult({ version: 1, status: 'ok' })).toEqual({ version: 1, status: 'ok' })

    // `taskId` é só da criação; ack sem editRevision ou versão v1 não passam.
    expect(parseTaskMutationResult({ version: 2, status: 'ok', taskId: 'x', revision: '8', contentRevision: '8', editRevision: '3' })).toBeNull()
    expect(parseTaskCreateResult({ version: 2, status: 'ok', taskId: 'x', revision: '8', contentRevision: '8' })).toBeNull()
    expect(parseTaskCreateResult({ version: 1, status: 'ok', taskId: 'x', revision: '1', contentRevision: '1' })).toBeNull()
    expect(parseTaskCreateResult({ version: 2, status: 'ok', taskId: '', revision: '1', contentRevision: '1', editRevision: '1' })).toBeNull()
    expect(parseTaskCreateResult({ version: 2, status: 'ok', taskId: 'x', revision: '01', contentRevision: '1', editRevision: '1' })).toBeNull()
    expect(parseTaskMutationResult({ version: 2, status: 'ok', revision: '8', contentRevision: '3', editRevision: '3', extra: true })).toBeNull()

    // Todo código fechado da união de mutação passa; um código só da origem não.
    for (const code of TASK_MUTATION_ERROR_CODES) {
      const failure = code === 'VALIDATION_FAILED' ? { ...taskMutationFailure(code), fields: { title: 'REQUIRED' } } : taskMutationFailure(code)
      expect(parseTaskMutationResult(failure)).toMatchObject({ version: 2, status: 'error', code })
    }
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'SOURCE_NOT_ALLOWED' })).toBeNull()
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'SQLITE_BUSY' })).toBeNull()
    for (const code of TASK_SOURCE_ERROR_CODES) {
      expect(parseTaskOpenSourceResult(taskSourceFailure(code))).toMatchObject({ version: 1, status: 'error', code })
    }
    expect(parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'VALIDATION_FAILED' })).toBeNull()
    expect(parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })).toBeNull()

    // CONFLICT pode expor as duas revisões atuais; nunca conteúdo, stack ou causa.
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'CONFLICT', currentContentRevision: '9', currentEditRevision: '8' }),
    ).toEqual({ version: 2, status: 'error', code: 'CONFLICT', currentContentRevision: '9', currentEditRevision: '8' })
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'CONFLICT', currentContentRevision: '9' })).toBeNull()
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'CONFLICT', currentEditRevision: '8' })).toBeNull()
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'NOT_FOUND', currentContentRevision: '9', currentEditRevision: '9' }),
    ).toBeNull()
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'CONFLICT', currentContentRevision: '9', currentEditRevision: '9', task: {} }),
    ).toBeNull()
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'BUSY', stack: 'Error at C:\\x' })).toBeNull()
    expect(parseTaskMutationResult(new Error('boom'))).toBeNull()

    // VALIDATION_FAILED exige fields com códigos avançados posicionais e finitos.
    expect(
      parseTaskMutationResult({
        version: 2,
        status: 'error',
        code: 'VALIDATION_FAILED',
        fields: {
          title: 'REQUIRED',
          dueAt: 'INVALID_DATE',
          recurrence: { frequency: 'INVALID_VALUE', until: 'UNTIL_BEFORE_DUE' },
          subtasks: { list: 'TOO_MANY', items: [{ index: 0, title: 'TOO_LONG', id: 'UNKNOWN_ID' }] },
        },
      }),
    ).toEqual({
      version: 2,
      status: 'error',
      code: 'VALIDATION_FAILED',
      fields: {
        title: 'REQUIRED',
        dueAt: 'INVALID_DATE',
        recurrence: { frequency: 'INVALID_VALUE', until: 'UNTIL_BEFORE_DUE' },
        subtasks: { list: 'TOO_MANY', items: [{ index: 0, title: 'TOO_LONG', id: 'UNKNOWN_ID' }] },
      },
    })
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED' })).toBeNull()
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'CONFLICT', fields: { title: 'REQUIRED' } })).toBeNull()
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { unknown: 'REQUIRED' } })).toBeNull()
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { title: 'NOPE' } })).toBeNull()
    expect(parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: {} })).toBeNull()
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { recurrence: { frequency: 'NOPE' } } }),
    ).toBeNull()
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { recurrence: {} } }),
    ).toBeNull()
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { subtasks: { items: [] } } }),
    ).toBeNull()
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { subtasks: { items: [{ index: 20, title: 'REQUIRED' }] } } }),
    ).toBeNull()
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { subtasks: { items: [{ index: 0 }] } } }),
    ).toBeNull()
    expect(
      parseTaskMutationResult({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { subtasks: { items: [{ index: 0, extra: 1 }] } } }),
    ).toBeNull()

    // openTaskSource: CONFLICT pode trazer somente a revisão de conteúdo atual.
    expect(
      parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'CONFLICT', currentContentRevision: '9' }),
    ).toEqual({ version: 1, status: 'error', code: 'CONFLICT', currentContentRevision: '9' })
    expect(parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'CONFLICT' })).toEqual({
      version: 1,
      status: 'error',
      code: 'CONFLICT',
    })
    expect(parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'NOT_FOUND', currentContentRevision: '9' })).toBeNull()
    expect(parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'SOURCE_NOT_AVAILABLE', fields: {} })).toBeNull()
    expect(parseTaskOpenSourceResult({ version: 2, status: 'error', code: 'NOT_FOUND' })).toBeNull()
    expect(parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'SOURCE_NOT_ALLOWED', stack: 'x' })).toBeNull()
  })
})
