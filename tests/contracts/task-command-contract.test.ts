import { describe, expect, it } from 'vitest'
import {
  TASK_COMMAND_LIMITS,
  fitsResponseBudget,
  parseTaskCreateRequest,
  parseTaskCreateResult,
  parseTaskMutationResult,
  parseTaskOpenSourceRequest,
  parseTaskOpenSourceResult,
  parseTaskStatusRequest,
  parseTaskUpdateRequest,
  taskFailure,
  type TaskCreateRequest,
  type TaskPatch,
} from '../../src/contracts/tasks.js'

const REVISION = '42'

function createRequest(draft: Record<string, unknown>): unknown {
  return { version: 1, draft }
}

function patchRequest(patch: Record<string, unknown>): unknown {
  return { version: 1, taskId: 'tarefa-1', expectedContentRevision: REVISION, patch }
}

describe('contrato dos comandos de tarefas', () => {
  it('aceita criação mínima e completa com somente as nove chaves básicas', () => {
    const minimal = parseTaskCreateRequest(createRequest({ title: 'Comprar leite' }))
    expect(minimal.kind).toBe('ok')

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
      }),
    )
    expect(complete.kind).toBe('ok')
    if (complete.kind !== 'ok') return
    expect(complete.value).toEqual<TaskCreateRequest>({
      version: 1,
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
      },
    })
  })

  it('recusa auditoria, campos avançados, path e opções do shell antes de qualquer leitura', () => {
    for (const extra of [
      { id: 'x' },
      { createdAt: '2026-10-04T00:00:00.000Z' },
      { updatedAt: '2026-10-04T00:00:00.000Z' },
      { completedAt: '2026-10-04T00:00:00.000Z' },
      { recurrence: { frequency: 'DAILY' } },
      { seriesId: 's' },
      { subtasks: [] },
      { reminders: [] },
      { processedFor: '2026-10-04T00:00:00.000Z' },
      { path: 'C:\\dados' },
      { workingDirectory: 'C:\\' },
    ]) {
      expect(parseTaskCreateRequest(createRequest({ title: 'ok', ...extra })).kind).toBe('invalid-request')
      expect(parseTaskUpdateRequest(patchRequest(extra)).kind).toBe('invalid-request')
    }
    // A comandos existentes: Task completa/avançados no envelope.
    expect(parseTaskStatusRequest({ version: 1, taskId: 'a', expectedContentRevision: REVISION, status: 'TODO', task: {} }).kind).toBe('invalid-request')
    expect(parseTaskOpenSourceRequest({ version: 1, taskId: 'a', expectedContentRevision: REVISION, url: 'https://x.test' }).kind).toBe('invalid-request')
    expect(parseTaskOpenSourceRequest({ version: 1, taskId: 'a', expectedContentRevision: REVISION, options: {} }).kind).toBe('invalid-request')
    expect(parseTaskOpenSourceRequest({ version: 1, taskId: 'a', expectedContentRevision: REVISION, path: 'C:\\' }).kind).toBe('invalid-request')
  })

  it('valida título, enums e tipos com códigos finitos por campo', () => {
    const missing = parseTaskCreateRequest(createRequest({}))
    expect(missing).toEqual({ kind: 'validation', fields: { title: 'REQUIRED' } })

    expect(parseTaskCreateRequest(createRequest({ title: 42 }))).toEqual({
      kind: 'validation',
      fields: { title: 'INVALID_VALUE' },
    })
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
    expect(parseTaskCreateRequest(createRequest({ title: 'ok', dueAt: 123 }))).toEqual({
      kind: 'validation',
      fields: { dueAt: 'INVALID_VALUE' },
    })
  })

  it('patch distingue ausente de null e de lista vazia; título/status/prioridade/tags não aceitam null', () => {
    const cleared = parseTaskUpdateRequest(
      patchRequest({
        description: null,
        requester: null,
        assignee: null,
        dueAt: null,
        sourceUrl: null,
        tags: [],
        status: 'DONE',
        priority: 'LOW',
        title: 'Novo título',
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
    })

    expect(parseTaskUpdateRequest(patchRequest({ title: null }))).toEqual({ kind: 'validation', fields: { title: 'INVALID_VALUE' } })
    expect(parseTaskUpdateRequest(patchRequest({ status: null }))).toEqual({ kind: 'validation', fields: { status: 'INVALID_VALUE' } })
    expect(parseTaskUpdateRequest(patchRequest({ priority: null }))).toEqual({ kind: 'validation', fields: { priority: 'INVALID_VALUE' } })
    expect(parseTaskUpdateRequest(patchRequest({ tags: null }))).toEqual({ kind: 'validation', fields: { tags: 'INVALID_VALUE' } })

    const empty = parseTaskUpdateRequest(patchRequest({}))
    expect(empty.kind).toBe('ok')
    if (empty.kind === 'ok') expect(empty.value.patch).toEqual({})
  })

  it('aceita ID histórico não vazio e recusa ID/revisão fora de representação', () => {
    expect(parseTaskUpdateRequest({ version: 1, taskId: 'tarefa histórica/única', expectedContentRevision: '0', patch: {} }).kind).toBe('ok')
    expect(parseTaskUpdateRequest({ version: 1, taskId: 'a', expectedContentRevision: '9223372036854775807', patch: {} }).kind).toBe('ok')

    for (const taskId of ['', 7, null]) {
      expect(parseTaskUpdateRequest({ version: 1, taskId, expectedContentRevision: '1', patch: {} }).kind).toBe('invalid-request')
    }
    for (const revision of ['00', '-1', '1.5', '9223372036854775808', ' 1', 1, null]) {
      expect(parseTaskUpdateRequest({ version: 1, taskId: 'a', expectedContentRevision: revision, patch: {} }).kind).toBe('invalid-request')
      expect(parseTaskStatusRequest({ version: 1, taskId: 'a', expectedContentRevision: revision, status: 'DONE' }).kind).toBe('invalid-request')
    }
  })

  it('recusa protótipos estranhos, acesso e versão/bytes fora do esquema', () => {
    class DraftLike {
      title = 'ok'
    }
    expect(parseTaskCreateRequest({ version: 1, draft: new DraftLike() }).kind).toBe('invalid-request')
    const accessor = { get title(): string { return 'ok' } }
    expect(parseTaskCreateRequest({ version: 1, draft: accessor }).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest({ version: 2, draft: { title: 'ok' } }).kind).toBe('invalid-request')
    expect(parseTaskCreateRequest({ version: 1, draft: { title: 'ok' }, extra: true }).kind).toBe('invalid-request')

    const oversized = { version: 1, draft: { title: 'ok', description: 'x'.repeat(70 * 1024) } }
    expect(parseTaskCreateRequest(oversized).kind).toBe('invalid-request')
    const escaped = { version: 1, draft: { title: 'ok', description: '\u0000'.repeat(12000) } }
    expect(parseTaskCreateRequest(escaped).kind).toBe('invalid-request')
    const within = { version: 1, draft: { title: 'ok', description: 'x'.repeat(TASK_COMMAND_LIMITS.requestBytes - 200) } }
    expect(parseTaskCreateRequest(within).kind).toBe('ok')
  })

  it('valida as respostas: ack curto, erro por código e campos restritos', () => {
    expect(parseTaskCreateResult({ version: 1, status: 'ok', taskId: 'novo', revision: '7', contentRevision: '7' })).toEqual({
      version: 1,
      status: 'ok',
      taskId: 'novo',
      revision: '7',
      contentRevision: '7',
    })
    expect(parseTaskMutationResult({ version: 1, status: 'ok', revision: '8', contentRevision: '3' })).toEqual({
      version: 1,
      status: 'ok',
      revision: '8',
      contentRevision: '3',
    })
    expect(parseTaskOpenSourceResult({ version: 1, status: 'ok' })).toEqual({ version: 1, status: 'ok' })

    expect(parseTaskMutationResult(taskFailure('NOT_FOUND'))).toEqual({ version: 1, status: 'error', code: 'NOT_FOUND' })
    expect(parseTaskMutationResult({ version: 1, status: 'error', code: 'CONFLICT', currentContentRevision: '9' })).toEqual({
      version: 1,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: '9',
    })
    expect(
      parseTaskMutationResult({ version: 1, status: 'error', code: 'VALIDATION_FAILED', fields: { title: 'REQUIRED', dueAt: 'INVALID_DATE' } }),
    ).toEqual({
      version: 1,
      status: 'error',
      code: 'VALIDATION_FAILED',
      fields: { title: 'REQUIRED', dueAt: 'INVALID_DATE' },
    })

    // Campos só valem em VALIDATION_FAILED; revisão só em CONFLICT; código precisa pertencer à operação.
    expect(parseTaskMutationResult({ version: 1, status: 'error', code: 'CONFLICT', fields: { title: 'REQUIRED' } })).toBeNull()
    expect(parseTaskMutationResult({ version: 1, status: 'error', code: 'VALIDATION_FAILED' })).toBeNull()
    expect(parseTaskMutationResult({ version: 1, status: 'error', code: 'INVALID_REQUEST', currentContentRevision: '1' })).toBeNull()
    expect(parseTaskMutationResult({ version: 1, status: 'error', code: 'EXTERNAL_OPEN_FAILED' })).toBeNull()
    expect(parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'SOURCE_TOO_LONG' })).toEqual({
      version: 1,
      status: 'error',
      code: 'SOURCE_TOO_LONG',
    })
    expect(parseTaskOpenSourceResult({ version: 1, status: 'error', code: 'ADVANCED_TASK_RESTRICTED' })).toBeNull()
    expect(parseTaskMutationResult({ version: 1, status: 'ok', revision: '8', contentRevision: '3', extra: true })).toBeNull()
    expect(parseTaskCreateResult({ version: 1, status: 'ok', taskId: '', revision: '1', contentRevision: '1' })).toBeNull()
    expect(parseTaskCreateResult({ version: 1, status: 'ok', taskId: 'x', revision: '01', contentRevision: '1' })).toBeNull()
    expect(parseTaskMutationResult({ version: 1, status: 'error', code: 'VALIDATION_FAILED', fields: { unknown: 'REQUIRED' } })).toBeNull()
    expect(parseTaskMutationResult({ version: 1, status: 'error', code: 'VALIDATION_FAILED', fields: { title: 'NOPE' } })).toBeNull()
    expect(fitsResponseBudget({ version: 1, status: 'ok', taskId: 'x', revision: '1', contentRevision: '1' })).toBe(true)
  })
})
