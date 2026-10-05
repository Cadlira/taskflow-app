import { describe, expect, it } from 'vitest'
import {
  INVALID_DATE_INPUT,
  fromLocalDateTimeInput,
  needsTimeZoneReview,
  needsUntilTimeZoneReview,
  toLocalDateTimeInput,
} from '../../src/renderer/src/components/tasks/date-time.js'

// Este arquivo só roda sob `TZ=America/Sao_Paulo` (invocado por date-time.test.ts em subprocesso);
// executado com outro fuso no `npm test`, as asserções dependentes de fuso são puladas.
const SAO_PAULO = Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Sao_Paulo'

describe.runIf(SAO_PAULO)('helper de datas sob fuso de São Paulo', () => {
  it('recusa o gap da entrada do DST e aceita o horário seguinte', () => {
    // 2018-11-04: à meia-noite os relógios avançam para 01:00; 00:30 não existe.
    expect(fromLocalDateTimeInput('2018-11-04T00:30')).toBe(INVALID_DATE_INPUT)
    expect(fromLocalDateTimeInput('2018-11-04T01:30')).toBe('2018-11-04T03:30:00.000Z')
  })

  it('hora repetida usa a ocorrência anterior, como a conversão local da origem', () => {
    // 2019-02-17: à meia-noite os relógios voltam para 23:00; 23:30 de 16/02 ocorre duas vezes.
    expect(fromLocalDateTimeInput('2019-02-16T23:30')).toBe('2019-02-17T01:30:00.000Z')
  })

  it('mudança de fuso com formulário aberto exige revisão', () => {
    const originalIso = '2026-10-05T18:30:00.000Z'
    const captured = toLocalDateTimeInput(originalIso)
    expect(captured).toBe('2026-10-05T15:30')
    expect(
      needsTimeZoneReview({ originalIso, capturedInput: captured, nextInput: '2026-10-05T17:45', dirty: true }),
    ).toBe(false)
    // Simula a troca de fuso mudando a conversão corrente.
    expect(
      needsTimeZoneReview({
        originalIso,
        capturedInput: captured,
        nextInput: '2026-10-05T17:45',
        dirty: true,
        convert: () => '2026-10-05T14:30',
      }),
    ).toBe(true)
    // Sem alterar o prazo, o ISO original permanece e não há bloqueio.
    expect(
      needsTimeZoneReview({ originalIso, capturedInput: captured, nextInput: captured, dirty: false }),
    ).toBe(false)
  })

  it('revisão do limite da série sob São Paulo mantém o contrato do prazo', () => {
    const untilIso = '2026-12-31T02:30:00.000Z'
    const captured = toLocalDateTimeInput(untilIso)
    expect(captured).toBe('2026-12-30T23:30')
    expect(
      needsUntilTimeZoneReview({
        originalUntilIso: untilIso,
        capturedUntilInput: captured,
        nextUntilInput: '2026-12-31T10:00',
        dirty: true,
      }),
    ).toBe(false)
    expect(
      needsUntilTimeZoneReview({
        originalUntilIso: untilIso,
        capturedUntilInput: captured,
        nextUntilInput: '2026-12-31T10:00',
        dirty: true,
        convert: () => '2026-12-30T22:30',
      }),
    ).toBe(true)
    // Sem limite original, um valor novo é interpretado no fuso corrente sem revisão.
    expect(
      needsUntilTimeZoneReview({
        originalUntilIso: undefined,
        capturedUntilInput: '',
        nextUntilInput: '2026-12-31T10:00',
        dirty: true,
        convert: () => '2026-12-30T22:30',
      }),
    ).toBe(false)
  })
})

describe.runIf(!SAO_PAULO)('helper de datas sob outro fuso', () => {
  it('mantém as recusas independentes de fuso', () => {
    expect(fromLocalDateTimeInput('2026-02-30T10:00')).toBe(INVALID_DATE_INPUT)
  })
})
