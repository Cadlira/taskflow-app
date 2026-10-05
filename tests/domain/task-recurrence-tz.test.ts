import { describe, expect, it } from 'vitest'
import { resolveNextScheduledAt, stepRecurrence } from '../../src/domain/task-recurrence.js'

// Este arquivo só roda por subprocesso com TZ fixado (ver task-recurrence.test.ts). Cada bloco
// confere o calendário civil local observado: fim de mês/leap year, fase semanal, 23/25 h, gap
// de DST, hora repetida e precisão de segundos/ms.
const CASE = process.env['TZ_CASE'] ?? Intl.DateTimeFormat().resolvedOptions().timeZone

describe.runIf(CASE === 'UTC')('recurrence em UTC', () => {
  it('dia, mês com último dia do mês e virada de ano', () => {
    expect(
      resolveNextScheduledAt({ frequency: 'DAILY', intervalDays: 1 }, '2026-01-31T10:00:00.000Z', new Date('2026-01-31T10:00:00.000Z')),
    ).toEqual({ status: 'NEXT', scheduledAt: '2026-02-01T10:00:00.000Z' })

    const monthly = { frequency: 'MONTHLY', dayOfMonth: 31 } as const
    expect(resolveNextScheduledAt(monthly, '2026-01-31T09:00:00.000Z', new Date('2026-01-31T09:00:00.000Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2026-02-28T09:00:00.000Z',
    })
    expect(resolveNextScheduledAt(monthly, '2026-02-28T09:00:00.000Z', new Date('2026-02-28T09:00:00.000Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2026-03-31T09:00:00.000Z',
    })
    // Leap year: fevereiro de 2028 tem 29 dias.
    expect(resolveNextScheduledAt(monthly, '2028-01-31T09:00:00.000Z', new Date('2028-01-31T09:00:00.000Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2028-02-29T09:00:00.000Z',
    })
    expect(resolveNextScheduledAt({ frequency: 'DAILY', intervalDays: 1 }, '2026-12-31T10:00:00.000Z', new Date('2026-12-31T10:00:00.000Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2027-01-01T10:00:00.000Z',
    })
  })

  it('fase semanal escolhe o próximo dia pedido sem reiniciar a semana', () => {
    // Quarta 07/01/2026 09:00 UTC; dias [segunda, quarta] => segunda 12/01.
    expect(
      resolveNextScheduledAt({ frequency: 'WEEKLY', weekdays: [1, 3] }, '2026-01-07T09:00:00.000Z', new Date('2026-01-07T09:00:00.000Z')),
    ).toEqual({ status: 'NEXT', scheduledAt: '2026-01-12T09:00:00.000Z' })
    expect(
      resolveNextScheduledAt({ frequency: 'WEEKLY', weekdays: [0] }, '2026-01-07T09:00:00.000Z', new Date('2026-01-07T09:00:00.000Z')),
    ).toEqual({ status: 'NEXT', scheduledAt: '2026-01-11T09:00:00.000Z' })
  })

  it('now exatamente candidato é pulado; perdidas não viram backlog', () => {
    const rule = { frequency: 'DAILY', intervalDays: 1 } as const
    expect(resolveNextScheduledAt(rule, '2026-01-01T10:00:00.000Z', new Date('2026-01-02T10:00:00.000Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2026-01-03T10:00:00.000Z',
    })
    // Conclusão muito atrasada: um único futuro, sem uma ocorrência por período perdido.
    expect(resolveNextScheduledAt(rule, '2026-01-01T10:00:00.000Z', new Date('2026-01-10T11:00:00.000Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2026-01-11T10:00:00.000Z',
    })
  })

  it('until inclusivo e precisão de segundos/ms preservada', () => {
    const rule = { frequency: 'DAILY', intervalDays: 1, until: '2026-01-03T10:00:45.123Z' } as const
    expect(resolveNextScheduledAt(rule, '2026-01-02T10:00:45.123Z', new Date('2026-01-02T10:00:45.123Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2026-01-03T10:00:45.123Z',
    })
    expect(
      resolveNextScheduledAt(rule, '2026-01-02T10:00:45.123Z', new Date('2026-01-03T10:00:45.124Z')),
    ).toEqual({ status: 'EXHAUSTED' })
  })

  it('passo diário preserva a hora local exata', () => {
    const anchor = new Date(Date.UTC(2026, 0, 1, 12, 34, 56, 789))
    const stepped = stepRecurrence({ frequency: 'DAILY', intervalDays: 1 }, anchor)
    expect(stepped?.toISOString()).toBe('2026-01-02T12:34:56.789Z')
  })
})

describe.runIf(CASE === 'America/Sao_Paulo')('recurrence em São Paulo', () => {
  it('mensal 31 reduz no mês e retorna a 31 sem tornar o ajuste permanente', () => {
    const monthly = { frequency: 'MONTHLY', dayOfMonth: 31 } as const
    // 31/01 09:00 -03 => 12:00Z.
    expect(resolveNextScheduledAt(monthly, '2026-01-31T12:00:00.000Z', new Date('2026-01-31T12:00:00.000Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2026-02-28T12:00:00.000Z',
    })
    expect(resolveNextScheduledAt(monthly, '2026-02-28T12:00:00.000Z', new Date('2026-02-28T12:00:00.000Z'))).toEqual({
      status: 'NEXT',
      scheduledAt: '2026-03-31T12:00:00.000Z',
    })
  })

  it('intervalo diário >1 conserva a fase e a hora local', () => {
    expect(
      resolveNextScheduledAt({ frequency: 'DAILY', intervalDays: 2 }, '2026-01-01T12:00:00.000Z', new Date('2026-01-01T12:00:00.000Z')),
    ).toEqual({ status: 'NEXT', scheduledAt: '2026-01-03T12:00:00.000Z' })
  })
})

describe.runIf(CASE === 'America/New_York')('recurrence em Nova York', () => {
  it('gap de primavera normaliza 02:30 para 03:30 e continua de 03:30', () => {
    // 07/03/2026 02:30 EST = 07:30Z; 08/03 não tem 02:30 (salto para 03:00 EDT).
    const first = resolveNextScheduledAt(
      { frequency: 'DAILY', intervalDays: 1 },
      '2026-03-07T07:30:00.000Z',
      new Date('2026-03-07T07:30:00.000Z'),
    )
    expect(first).toEqual({ status: 'NEXT', scheduledAt: '2026-03-08T07:30:00.000Z' })

    // A próxima continua de 03:30 local (07:30Z) em 09/03, seguindo EDT.
    const second = resolveNextScheduledAt(
      { frequency: 'DAILY', intervalDays: 1 },
      '2026-03-08T07:30:00.000Z',
      new Date('2026-03-08T07:30:00.000Z'),
    )
    expect(second).toEqual({ status: 'NEXT', scheduledAt: '2026-03-09T07:30:00.000Z' })
  })

  it('intervalos reais de 23 h e 25 h mantêm a hora civil', () => {
    const spring = resolveNextScheduledAt(
      { frequency: 'DAILY', intervalDays: 1 },
      '2026-03-07T14:00:00.000Z',
      new Date('2026-03-07T14:00:00.000Z'),
    )
    expect(spring).toEqual({ status: 'NEXT', scheduledAt: '2026-03-08T13:00:00.000Z' })

    const fall = resolveNextScheduledAt(
      { frequency: 'DAILY', intervalDays: 1 },
      '2026-10-31T13:00:00.000Z',
      new Date('2026-10-31T13:00:00.000Z'),
    )
    expect(fall).toEqual({ status: 'NEXT', scheduledAt: '2026-11-01T14:00:00.000Z' })
  })

  it('hora repetida usa a primeira ocorrência local, sem segunda automática', () => {
    // 01/11/2026: 01:30 ocorre em EDT (-04) e EST (-05); a conversão local escolhe a primeira.
    const repeated = resolveNextScheduledAt(
      { frequency: 'DAILY', intervalDays: 1 },
      '2026-10-31T05:30:00.000Z',
      new Date('2026-10-31T05:30:00.000Z'),
    )
    expect(repeated.status).toBe('NEXT')
    if (repeated.status !== 'NEXT') return
    const instant = new Date(repeated.scheduledAt)
    expect(instant.getTimezoneOffset()).toBe(240)
    expect(instant.getHours()).toBe(1)
    expect(instant.getMinutes()).toBe(30)

    // O passo seguinte sai da hora repetida escolhida para 02/11 01:30 EST.
    const following = stepRecurrence({ frequency: 'DAILY', intervalDays: 1 }, instant)
    expect(following?.toISOString()).toBe('2026-11-02T06:30:00.000Z')
  })

  it('fase semanal atravessa a mudança de DST mantendo o dia e a hora local', () => {
    // Quarta 04/03/2026 09:00 EST = 14:00Z; semanais [quarta] => 11/03 09:00 EDT = 13:00Z.
    expect(
      resolveNextScheduledAt(
        { frequency: 'WEEKLY', weekdays: [3] },
        '2026-03-04T14:00:00.000Z',
        new Date('2026-03-04T14:00:00.000Z'),
      ),
    ).toEqual({ status: 'NEXT', scheduledAt: '2026-03-11T13:00:00.000Z' })
  })
})

describe.runIf(!['UTC', 'America/Sao_Paulo', 'America/New_York'].includes(CASE))('outro fuso', () => {
  it('pula sem executar o cenário de fuso controlado', () => {
    expect(CASE).not.toBe('')
  })
})
