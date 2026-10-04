// Casos portáveis revisados a partir de taskflow-extension@a763e7a
// tests/infrastructure/stored-trash.test.ts e chrome-task-repository.test.ts (migrações e
// dados incompatíveis), sem os fakes de `chrome.storage`. Acrescidos os casos do codec por item.
import { describe, expect, it } from 'vitest'
import {
  CURRENT_PAYLOAD_VERSION,
  decodeStoredTaskRecords,
  decodeTaskPayload,
  encodeTaskPayload,
  encodeTaskPayloads,
  isKnownPayloadVersion,
  isSameJsonValue,
  isStoredDeletedAt,
} from '../../src/application/storage/stored-task-codec.js'
import { storageFailureReasonOf } from '../../src/application/storage/task-storage-error.js'
import type { Task } from '../../src/domain/task.js'
import { buildFictitiousTask, buildMinimalFictitiousTask } from '../../src/main/harness/fixtures.js'

const DUE = '2026-09-20T10:00:00.000Z'

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Revisar proposta',
    status: 'TODO',
    priority: 'MEDIUM',
    reminders: [],
    subtasks: [],
    tags: [],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  }
}

function reasonOf(action: () => unknown): string | undefined {
  try {
    action()
  } catch (error) {
    return storageFailureReasonOf(error)
  }
  return 'NO_ERROR'
}

describe('versões históricas do payload', () => {
  it('v1 completa listas ausentes e descarta propriedades desconhecidas', () => {
    const legacy = {
      id: 'a',
      title: 'Legado',
      status: 'TODO',
      priority: 'LOW',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      extra: 'ignorado',
    }

    expect(decodeStoredTaskRecords(1, [legacy])).toEqual([
      {
        id: 'a',
        title: 'Legado',
        status: 'TODO',
        priority: 'LOW',
        reminders: [],
        subtasks: [],
        tags: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ])
  })

  it('v1 migra lembretes preservando identificador e deslocamento', () => {
    const stored = { ...buildTask({ dueAt: DUE }), reminders: [{ id: 'r', offsetMinutes: 15 }] }
    expect(decodeStoredTaskRecords(1, [stored])).toEqual([
      buildTask({ dueAt: DUE, reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }] }),
    ])
  })

  it('v1 converte lastTriggeredFor no instante efetivo processado', () => {
    const stored = {
      ...buildTask({ dueAt: DUE }),
      reminders: [{ id: 'r', offsetMinutes: 1440, lastTriggeredFor: DUE }],
    }
    expect(decodeStoredTaskRecords(1, [stored])).toEqual([
      buildTask({
        dueAt: DUE,
        reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 1440, processedFor: '2026-09-19T10:00:00.000Z' }],
      }),
    ])
  })

  it('v2 lê tipos de lembrete e ignora série/recorrência que a versão não conhecia', () => {
    const stored = {
      ...buildTask({
        dueAt: DUE,
        reminders: [
          { id: 'o', type: 'OFFSET', offsetMinutes: 30 },
          { id: 'a', type: 'AT', at: '2026-09-20T08:00:00.000Z', processedFor: '2026-09-20T08:00:00.000Z' },
        ],
      }),
      seriesId: 'serie',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    }
    const [decoded] = decodeStoredTaskRecords(2, [stored])

    expect(decoded?.reminders).toEqual(stored.reminders)
    expect(decoded?.seriesId).toBeUndefined()
    expect(decoded?.recurrence).toBeUndefined()
    expect(decoded?.subtasks).toEqual([])
  })

  it('v3 devolve regra e série e atribui lista de subtarefas vazia', () => {
    const stored = {
      ...buildTask({
        dueAt: DUE,
        seriesId: 'serie',
        recurrence: { frequency: 'WEEKLY', weekdays: [5, 1, 3] },
        reminders: [{ id: 'o', type: 'OFFSET', offsetMinutes: 30 }],
      }),
      subtasks: undefined,
    }
    const [decoded] = decodeStoredTaskRecords(3, [stored])

    expect(decoded?.seriesId).toBe('serie')
    expect(decoded?.recurrence).toEqual({ frequency: 'WEEKLY', weekdays: [5, 1, 3] })
    expect(decoded?.subtasks).toEqual([])
  })

  it('v4 preserva ordem, títulos e marcações das subtarefas', () => {
    const subtasks = [
      { id: 's2', title: 'Segundo', done: true },
      { id: 's1', title: 'Primeiro', done: false },
    ]
    const [decoded] = decodeStoredTaskRecords(4, [{ ...buildTask({ subtasks }), extra: true }])

    expect(decoded?.subtasks).toEqual(subtasks)
    expect(decoded).not.toHaveProperty('extra')
  })

  it('reconhece somente as versões 1 a 4', () => {
    expect([1, 2, 3, 4].every(isKnownPayloadVersion)).toBe(true)
    expect([0, 5, '4', null, undefined, 4.5].some(isKnownPayloadVersion)).toBe(false)
    expect(CURRENT_PAYLOAD_VERSION).toBe(4)
  })
})

describe('fidelidade dos campos conhecidos', () => {
  it('round-trip por item conserva todos os campos, ordens e Unicode', () => {
    for (const task of [buildFictitiousTask(1), buildFictitiousTask(3), buildFictitiousTask(6)]) {
      const encoded = encodeTaskPayload(task)
      const decoded = decodeTaskPayload(encoded.payloadVersion, encoded.payloadJson, task.id)

      expect(encoded.payloadVersion).toBe(4)
      expect(decoded).toEqual(task)
      expect(Object.keys(decoded).sort()).toEqual(Object.keys(task).sort())
      expect(decoded.tags).toEqual(task.tags)
      expect(decoded.subtasks.map((subtask) => subtask.id)).toEqual(task.subtasks.map((subtask) => subtask.id))
      expect(decoded.reminders.map((reminder) => reminder.id)).toEqual(task.reminders.map((reminder) => reminder.id))
    }
  })

  it('distingue campo opcional ausente de campo presente', () => {
    const minimal = buildMinimalFictitiousTask('minima')
    const encoded = encodeTaskPayload(minimal)
    const decoded = decodeTaskPayload(4, encoded.payloadJson, 'minima')

    for (const key of ['description', 'requester', 'assignee', 'dueAt', 'seriesId', 'recurrence', 'sourceUrl', 'completedAt']) {
      expect(decoded).not.toHaveProperty(key)
    }
    expect(decodeTaskPayload(4, encodeTaskPayload({ ...minimal, description: '' }).payloadJson, 'minima')).toHaveProperty(
      'description',
      '',
    )
  })

  it('conserva Unicode, escaping e surrogate isolado', () => {
    const description = 'aspas " barra \\ nova\nlinha \u0000   emoji 🚀 isolado \ud83d fim'
    const task = buildTask({ description, title: '日本語 — açaí' })
    const encoded = encodeTaskPayload(task)

    expect(decodeTaskPayload(4, encoded.payloadJson, task.id)).toEqual(task)
  })

  it('não gera ocorrência, não executa undo e não toca marcadores ao decodificar dados avançados', () => {
    const task = buildFictitiousTask(3)
    const decoded = decodeTaskPayload(4, JSON.stringify(task), task.id)

    expect(decoded.recurrence).toEqual(task.recurrence)
    expect(decoded.reminders).toEqual(task.reminders)
    expect(decoded.updatedAt).toBe(task.updatedAt)
  })
})

describe('payload inválido ou desconhecido', () => {
  const incompatible: Array<[string, unknown, unknown]> = [
    ['versão futura', 5, buildTask()],
    ['versão zero', 0, buildTask()],
    ['versão textual', '4', buildTask()],
    ['status desconhecido', 4, { ...buildTask(), status: 'ARCHIVED' }],
    ['prioridade desconhecida', 4, { ...buildTask(), priority: 'MAX' }],
    ['data inválida', 4, { ...buildTask(), createdAt: 'ontem' }],
    ['tarefa sem título', 4, { ...buildTask(), title: undefined }],
    ['tag inválida', 4, { ...buildTask(), tags: [1] }],
    ['lembrete v1 inválido', 1, { ...buildTask({ dueAt: DUE }), reminders: [{ id: 'r', offsetMinutes: '15' }] }],
    ['lembrete de tipo desconhecido', 4, { ...buildTask({ dueAt: DUE }), reminders: [{ id: 'r', type: 'WEEKLY' }] }],
    ['lembrete sem prazo', 4, { ...buildTask(), reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 5 }] }],
    [
      'lembretes com o mesmo instante',
      4,
      {
        ...buildTask({ dueAt: DUE }),
        reminders: [
          { id: 'a', type: 'OFFSET', offsetMinutes: 60 },
          { id: 'b', type: 'AT', at: '2026-09-20T09:00:00.000Z' },
        ],
      },
    ],
    ['lembrete AT depois do prazo', 4, { ...buildTask({ dueAt: DUE }), reminders: [{ id: 'a', type: 'AT', at: '2026-09-21T09:00:00.000Z' }] }],
    ['identificador de série vazio', 3, buildTask({ seriesId: '' })],
    ['recorrência inválida', 4, { ...buildTask({ dueAt: DUE, seriesId: 's' }), recurrence: { frequency: 'YEARLY' } }],
    ['recorrência sem série', 4, { ...buildTask({ dueAt: DUE }), recurrence: { frequency: 'DAILY', intervalDays: 1 } }],
    [
      'recorrência com lembrete AT',
      4,
      {
        ...buildTask({ dueAt: DUE, seriesId: 's' }),
        recurrence: { frequency: 'DAILY', intervalDays: 1 },
        reminders: [{ id: 'a', type: 'AT', at: '2026-09-20T09:00:00.000Z' }],
      },
    ],
    ['subtarefas ausentes na v4', 4, { ...buildTask(), subtasks: undefined }],
    ['subtarefa sem marcação', 4, { ...buildTask(), subtasks: [{ id: 's', title: 'Passo' }] }],
    [
      'subtarefas com identificador repetido',
      4,
      { ...buildTask(), subtasks: [{ id: 's', title: 'A', done: false }, { id: 's', title: 'B', done: true }] },
    ],
    ['registro que não é objeto', 4, 'tarefa'],
  ]

  it.each(incompatible)('recusa %s como INCOMPATIBLE_DATA', (_label, version, value) => {
    expect(reasonOf(() => decodeStoredTaskRecords(version, [value]))).toBe('INCOMPATIBLE_DATA')
  })

  it('recusa identificadores repetidos na mesma coleção', () => {
    expect(reasonOf(() => decodeStoredTaskRecords(4, [buildTask(), buildTask()]))).toBe('INCOMPATIBLE_DATA')
  })

  it('recusa JSON inválido e ID do payload diferente do metadado, sem omitir o registro', () => {
    const json = JSON.stringify(buildTask({ id: 'a' }))

    expect(reasonOf(() => decodeTaskPayload(4, '{"id":', 'a'))).toBe('INCOMPATIBLE_DATA')
    expect(reasonOf(() => decodeTaskPayload(4, json, 'b'))).toBe('INCOMPATIBLE_DATA')
    expect(reasonOf(() => decodeTaskPayload(4, json, ''))).toBe('INCOMPATIBLE_DATA')
    expect(reasonOf(() => decodeTaskPayload(4, 42, 'a'))).toBe('INCOMPATIBLE_DATA')
    expect(reasonOf(() => decodeTaskPayload(4, '[]', 'a'))).toBe('INCOMPATIBLE_DATA')
    expect(decodeTaskPayload(4, json, 'a').id).toBe('a')
  })

  it('a razão não revela campo, valor ou conteúdo do registro', () => {
    try {
      decodeStoredTaskRecords(4, [{ ...buildTask(), title: 'segredo', status: 'X' }])
      expect.unreachable()
    } catch (error) {
      expect(String((error as Error).message)).toBe('storage failure: INCOMPATIBLE_DATA')
      expect(JSON.stringify(error)).not.toContain('segredo')
    }
  })
})

describe('validação na escrita', () => {
  it('recusa dado inválido antes de gravar, com razão própria de escrita', () => {
    expect(reasonOf(() => encodeTaskPayload({ ...buildTask(), status: 'ARCHIVED' }))).toBe('INVALID_DATA')
    expect(reasonOf(() => encodeTaskPayload({ ...buildTask(), reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 5 }] }))).toBe(
      'INVALID_DATA',
    )
    expect(reasonOf(() => encodeTaskPayload(null))).toBe('INVALID_DATA')
    expect(reasonOf(() => encodeTaskPayloads([buildTask(), buildTask()]))).toBe('INVALID_DATA')
  })

  it('grava sempre a versão atual e normaliza como o decoder', () => {
    const encoded = encodeTaskPayload({ ...buildTask(), extra: 'x', description: undefined })

    expect(encoded.payloadVersion).toBe(4)
    expect(JSON.parse(encoded.payloadJson)).toEqual(buildTask())
    expect(encoded.task).toEqual(buildTask())
  })
})

describe('auxiliares do codec', () => {
  it('compara valores JSON ignorando a ordem das chaves e respeitando a das listas', () => {
    expect(isSameJsonValue({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
    expect(isSameJsonValue({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(isSameJsonValue({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
    expect(isSameJsonValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(isSameJsonValue([], {})).toBe(false)
    expect(isSameJsonValue(null, {})).toBe(false)
  })

  it.each([undefined, '', 'ontem', 42])('recusa deletedAt inválido (%s)', (deletedAt) => {
    expect(isStoredDeletedAt(deletedAt)).toBe(false)
  })

  it('aceita deletedAt em instante válido', () => {
    expect(isStoredDeletedAt('2026-09-12T08:00:00.000Z')).toBe(true)
  })
})
