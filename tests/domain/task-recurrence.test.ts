import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RECURRENCE_STEP_LIMIT,
  buildNextOccurrence,
  isRecurrence,
  isSameRecurrence,
  resolveNextScheduledAt,
  stepRecurrence,
  transferRecurrence,
  type Recurrence,
} from '../../src/domain/task-recurrence.js'
import { MAX_DATE_INSTANT_MS } from '../../src/domain/task-reminders.js'
import { buildTask, fixedNow } from '../support/task-fixtures.js'

// Testes portáveis das fronteiras, limites e da construção da próxima ocorrência. Casos de
// calendário/fuso/DST rodam em subprocesso com TZ fixado no final deste arquivo.

function counter(prefix = 'id'): () => string {
  let index = 0
  return () => `${prefix}-${index += 1}`
}

describe('task-recurrence: validação estrutural', () => {
  it('aceita somente limites exatos das três frequências', () => {
    expect(isRecurrence({ frequency: 'DAILY', intervalDays: 1 })).toBe(true)
    expect(isRecurrence({ frequency: 'DAILY', intervalDays: 365 })).toBe(true)
    expect(isRecurrence({ frequency: 'DAILY', intervalDays: 0 })).toBe(false)
    expect(isRecurrence({ frequency: 'DAILY', intervalDays: 366 })).toBe(false)
    expect(isRecurrence({ frequency: 'DAILY', intervalDays: 1.5 })).toBe(false)

    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [0] })).toBe(true)
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe(true)
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [] })).toBe(false)
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [0, 0] })).toBe(false)
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [7] })).toBe(false)
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: Array.from({ length: 8 }, (_u, i) => i % 7) })).toBe(false)

    expect(isRecurrence({ frequency: 'MONTHLY', dayOfMonth: 1 })).toBe(true)
    expect(isRecurrence({ frequency: 'MONTHLY', dayOfMonth: 31 })).toBe(true)
    expect(isRecurrence({ frequency: 'MONTHLY', dayOfMonth: 0 })).toBe(false)
    expect(isRecurrence({ frequency: 'MONTHLY', dayOfMonth: 32 })).toBe(false)

    expect(isRecurrence({ frequency: 'YEARLY' })).toBe(false)
    expect(isRecurrence({ frequency: 'DAILY', intervalDays: 1, anchorAt: 'inválido' })).toBe(false)
    expect(isRecurrence({ frequency: 'DAILY', intervalDays: 1, until: 'inválido' })).toBe(false)
  })

  it('compara regras incluindo âncora e limite', () => {
    const base = { frequency: 'DAILY', intervalDays: 1 } as const
    expect(isSameRecurrence(base, { ...base })).toBe(true)
    expect(isSameRecurrence(base, { ...base, until: '2026-10-10T00:00:00.000Z' })).toBe(false)
    expect(isSameRecurrence(base, { ...base, anchorAt: '2026-10-01T00:00:00.000Z' })).toBe(false)
    expect(isSameRecurrence(undefined, undefined)).toBe(true)
    expect(isSameRecurrence(base, undefined)).toBe(false)
    expect(isSameRecurrence({ frequency: 'WEEKLY', weekdays: [1, 3] }, { frequency: 'WEEKLY', weekdays: [3, 1] })).toBe(false)
  })
})

describe('task-recurrence: cálculo finito e limítrofe', () => {
  it('não converte erro de representabilidade em fim natural', () => {
    const maxIso = new Date(MAX_DATE_INSTANT_MS).toISOString()
    expect(resolveNextScheduledAt({ frequency: 'DAILY', intervalDays: 1 }, maxIso, fixedNow())).toEqual({
      status: 'OUT_OF_RANGE',
    })
    expect(resolveNextScheduledAt({ frequency: 'DAILY', intervalDays: 1 }, 'inválido', fixedNow()).status).toBe('OUT_OF_RANGE')
  })

  it('limita a decisão a 32.768 passos e devolve RESOURCE_LIMIT', () => {
    // Mais de um século de passos diários: além do limite, nunca encerra silenciosamente.
    expect(RECURRENCE_STEP_LIMIT).toBe(32_768)
    const result = resolveNextScheduledAt(
      { frequency: 'DAILY', intervalDays: 1 },
      '1900-01-01T12:00:00.000Z',
      new Date('2200-01-01T12:00:00.000Z'),
    )
    expect(result).toEqual({ status: 'RESOURCE_LIMIT' })
  })

  it('aceita exatamente o limite de passos e falha no passo seguinte', () => {
    const rule = { frequency: 'DAILY', intervalDays: 1 } as const
    // 12:00 local evita gaps de DST: cada passo é exatamente um dia civil.
    const anchorLocal = new Date(2026, 0, 1, 12, 0, 0, 0)
    const lastValid = new Date(2026, 0, 1 + RECURRENCE_STEP_LIMIT, 11, 59, 59, 999)
    const boundary = resolveNextScheduledAt(rule, anchorLocal.toISOString(), lastValid)
    expect(boundary.status).toBe('NEXT')
    if (boundary.status === 'NEXT') {
      expect(boundary.scheduledAt).toBe(new Date(2026, 0, 1 + RECURRENCE_STEP_LIMIT, 12, 0, 0, 0).toISOString())
    }

    // Um passo além do limite: recusa por recurso, sem encerrar a série.
    const beyond = new Date(2026, 0, 1 + RECURRENCE_STEP_LIMIT, 12, 0, 0, 0)
    expect(resolveNextScheduledAt(rule, anchorLocal.toISOString(), beyond)).toEqual({ status: 'RESOURCE_LIMIT' })
  })

  it('candidato posterior ao until encerra naturalmente e igualdade gera', () => {
    const rule = { frequency: 'DAILY', intervalDays: 1, until: '2026-10-03T12:00:00.000Z' } as const
    const equal = resolveNextScheduledAt(rule, '2026-10-02T12:00:00.000Z', new Date('2026-10-02T12:00:00.000Z'))
    expect(equal).toEqual({ status: 'NEXT', scheduledAt: '2026-10-03T12:00:00.000Z' })

    const exhausted = resolveNextScheduledAt(rule, '2026-10-02T12:00:00.000Z', new Date('2026-10-03T12:00:00.001Z'))
    expect(exhausted).toEqual({ status: 'EXHAUSTED' })
  })

  it('avança ao menos uma vez e sempre entrega instante estritamente posterior ao agora', () => {
    const due = '2026-10-01T09:00:00.000Z'
    const now = new Date('2026-10-01T09:00:00.000Z')
    const result = resolveNextScheduledAt({ frequency: 'DAILY', intervalDays: 1 }, due, now)
    expect(result.status).toBe('NEXT')
    if (result.status !== 'NEXT') return
    expect(Date.parse(result.scheduledAt)).toBeGreaterThan(now.getTime())
    // Concluir antes do prazo também avança pelo menos um passo.
    const early = resolveNextScheduledAt({ frequency: 'DAILY', intervalDays: 1 }, due, new Date('2026-09-30T00:00:00.000Z'))
    expect(early.status).toBe('NEXT')
    if (early.status !== 'NEXT') return
    expect(early.scheduledAt).not.toBe(due)
    expect(Date.parse(early.scheduledAt)).toBeGreaterThan(Date.parse(due))
  })

  it('passo semanal escolhe o próximo dia da fase e mensal ajusta sem tornar o ajuste permanente', () => {
    const anchor = new Date(Date.UTC(2026, 0, 7, 12, 0, 0)) // quarta-feira
    const weekly = stepRecurrence({ frequency: 'WEEKLY', weekdays: [1, 3] }, anchor)
    expect(weekly).toBeDefined()
    if (weekly === undefined) return
    expect(weekly.getTime()).toBeGreaterThan(anchor.getTime())
    expect([1, 3]).toContain(weekly.getDay())

    // Qualquer que seja o fuso local, o passo mensal de dia 31 nunca excede o último dia do mês.
    const monthStep = stepRecurrence({ frequency: 'MONTHLY', dayOfMonth: 31 }, new Date(Date.UTC(2026, 0, 15, 12, 0, 0)))
    expect(monthStep).toBeDefined()
    if (monthStep === undefined) return
    expect(monthStep.getDate()).toBeLessThanOrEqual(31)
    expect(monthStep.getMonth()).toBe(1)
  })
})

describe('task-recurrence: próxima ocorrência pura', () => {
  it('copia campos e série, renova IDs de lembretes/subtarefas e não transporta âncora/completedAt', () => {
    const closed = buildTask({
      id: 'tarefa-1',
      title: 'Título',
      description: 'Descrição',
      requester: 'Solicitante',
      assignee: 'Responsável',
      priority: 'HIGH',
      dueAt: '2026-10-01T09:00:00.000Z',
      tags: ['ação', '日本'],
      sourceUrl: 'https://example.test/x',
      seriesId: 'serie-1',
      status: 'TODO',
      reminders: [
        { id: 'r1', type: 'OFFSET', offsetMinutes: 60, processedFor: '2026-10-01T08:00:00.000Z' },
        { id: 'r2', type: 'OFFSET', offsetMinutes: 1440 },
      ],
      subtasks: [
        { id: 'st1', title: 'Primeiro', done: true },
        { id: 'st2', title: 'Segundo', done: false },
      ],
      recurrence: { frequency: 'DAILY', intervalDays: 2, anchorAt: '2026-10-01T09:00:00.000Z', until: '2026-12-01T09:00:00.000Z' },
    })

    const recurrence = closed.recurrence
    if (recurrence === undefined) throw new Error('fixture sem regra')
    const result = buildNextOccurrence(closed, recurrence, '2026-10-03T09:00:00.000Z', {
      now: fixedNow(),
      generateId: counter('nova'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const next = result.task

    expect(next.id).toBe('nova-1')
    expect(next.seriesId).toBe('serie-1')
    expect(next.status).toBe('TODO')
    expect(next.title).toBe(closed.title)
    expect(next.description).toBe(closed.description)
    expect(next.requester).toBe(closed.requester)
    expect(next.assignee).toBe(closed.assignee)
    expect(next.priority).toBe('HIGH')
    expect(next.tags).toEqual(['ação', '日本'])
    expect(next.sourceUrl).toBe(closed.sourceUrl)
    expect(next.dueAt).toBe('2026-10-03T09:00:00.000Z')
    expect('completedAt' in next).toBe(false)
    expect('anchorAt' in (next.recurrence ?? {})).toBe(false)
    expect(next.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 2, until: '2026-12-01T09:00:00.000Z' })
    expect(next.reminders).toEqual([
      { id: 'nova-2', type: 'OFFSET', offsetMinutes: 60 },
      { id: 'nova-3', type: 'OFFSET', offsetMinutes: 1440 },
    ])
    expect(next.subtasks).toEqual([
      { id: 'nova-4', title: 'Primeiro', done: false },
      { id: 'nova-5', title: 'Segundo', done: false },
    ])
    expect(next.createdAt).toBe('2026-10-04T12:00:00.000Z')
    expect(next.updatedAt).toBe('2026-10-04T12:00:00.000Z')
  })

  it('recusa identidade quando o gerador colide com o conjunto substituído ou com as coleções', () => {
    const closed = buildTask({
      id: 'tarefa-1',
      seriesId: 'serie-1',
      dueAt: '2026-10-01T09:00:00.000Z',
      subtasks: [{ id: 'antiga', title: 'Passo', done: true }],
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    })
    const recurrence = closed.recurrence
    if (recurrence === undefined) throw new Error('fixture sem regra')

    // ID de tarefa já ocupado na coleção.
    const collision = buildNextOccurrence(closed, recurrence, '2026-10-02T09:00:00.000Z', {
      now: fixedNow(),
      generateId: () => 'ocupado',
      isIdTaken: (id) => id === 'ocupado',
    })
    expect(collision).toEqual({ ok: false, reason: 'IDENTITY_CONFLICT' })

    // Gerador que só devolve o ID antigo da subtarefa: o conjunto substituído não é reutilizado.
    const reuse = buildNextOccurrence(closed, recurrence, '2026-10-02T09:00:00.000Z', {
      now: fixedNow(),
      generateId: () => 'antiga',
    })
    expect(reuse).toEqual({ ok: false, reason: 'IDENTITY_CONFLICT' })

    // Sem série não se inventa identidade.
    const orphan = buildTask({ id: 'tarefa-2', dueAt: '2026-10-01T09:00:00.000Z' })
    expect(
      buildNextOccurrence(orphan, { frequency: 'DAILY', intervalDays: 1 }, '2026-10-02T09:00:00.000Z', {
        now: fixedNow(),
        generateId: counter('x'),
      }),
    ).toEqual({ ok: false, reason: 'IDENTITY_CONFLICT' })
  })

  it('transfere a regra sem âncora, clonando parâmetros e até', () => {
    const until = '2026-11-01T00:00:00.000Z'
    expect(transferRecurrence({ frequency: 'WEEKLY', weekdays: [1, 5], anchorAt: 'x', until })).toEqual({
      frequency: 'WEEKLY',
      weekdays: [1, 5],
      until,
    })
    const source: Recurrence = { frequency: 'WEEKLY', weekdays: [1, 5] }
    const weekly = transferRecurrence(source)
    if (weekly.frequency !== 'WEEKLY') throw new Error('esperado semanal')
    expect(weekly.weekdays).toEqual([1, 5])
    expect(weekly.weekdays).not.toBe(source.weekdays)
    expect(transferRecurrence({ frequency: 'MONTHLY', dayOfMonth: 31 })).toEqual({ frequency: 'MONTHLY', dayOfMonth: 31 })
    expect(transferRecurrence({ frequency: 'DAILY', intervalDays: 3 })).toEqual({ frequency: 'DAILY', intervalDays: 3 })
  })
})

describe('task-recurrence: calendário em fusos controlados (subprocesso)', () => {
  it('executa cenários de UTC/São Paulo/Nova York com TZ fixado', () => {
    const projectRoot = path.resolve(import.meta.dirname, '..', '..')
    const vitest = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs')
    const cases = ['UTC', 'America/Sao_Paulo', 'America/New_York']

    for (const timezone of cases) {
      const runChild = (): ReturnType<typeof spawnSync> =>
        spawnSync(
          process.execPath,
          [vitest, 'run', 'tests/domain/task-recurrence-tz.test.ts', '--reporter=dot', '--no-color'],
          { cwd: projectRoot, env: { ...process.env, TZ: timezone, TZ_CASE: timezone }, encoding: 'utf8', timeout: 120_000 },
        )
      let result = runChild()
      if (result.status !== 0) result = runChild()
      expect(result.status, `TZ=${timezone}\n${result.stdout}\n${result.stderr}`).toBe(0)
    }
  }, 300_000)
})
