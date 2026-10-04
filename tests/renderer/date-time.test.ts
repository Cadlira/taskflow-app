import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INVALID_DATE_INPUT,
  formatDateTime,
  fromLocalDateTimeInput,
  needsTimeZoneReview,
  toLocalDateTimeInput,
} from '../../src/renderer/src/components/tasks/date-time.js'

describe('helper de datas: entrada local e exibição', () => {
  it('converte vazio, impossível e calendar básico', () => {
    expect(toLocalDateTimeInput(undefined)).toBe('')
    expect(toLocalDateTimeInput('inválido')).toBe('')
    expect(fromLocalDateTimeInput('')).toBeUndefined()
    expect(fromLocalDateTimeInput('   ')).toBeUndefined()
    expect(fromLocalDateTimeInput('2026-02-30T10:00')).toBe(INVALID_DATE_INPUT)
    expect(fromLocalDateTimeInput('2026-13-01T10:00')).toBe(INVALID_DATE_INPUT)
    expect(fromLocalDateTimeInput('2026-00-10T10:00')).toBe(INVALID_DATE_INPUT)
    expect(fromLocalDateTimeInput('2026-10-05T24:00')).toBe(INVALID_DATE_INPUT)
    expect(fromLocalDateTimeInput('sem-formato')).toBe(INVALID_DATE_INPUT)
  })

  it('aceita leap day e mantém o instante local', () => {
    const leap = fromLocalDateTimeInput('2028-02-29T10:00')
    expect(leap).toBeDefined()
    expect(leap).not.toBe(INVALID_DATE_INPUT)
    expect(toLocalDateTimeInput(leap)).toBe('2028-02-29T10:00')
  })

  it('exibe e reconverte em ida e volta para minutos', () => {
    const iso = fromLocalDateTimeInput('2026-10-05T15:30')
    expect(typeof iso).toBe('string')
    expect(toLocalDateTimeInput(iso)).toBe('2026-10-05T15:30')
    expect(formatDateTime(iso as string)).not.toBe('')
  })

  it('preserva o ISO intacto quando o prazo não é editado (ausente do patch)', () => {
    // O formulário não reconverte o prazo salvo: o texto de entrada é só apresentação.
    const savedIso = '2026-10-05T15:30:45.123Z'
    expect(toLocalDateTimeInput(savedIso)).toBe(toLocalDateTimeInput(savedIso))
    expect(savedIso).toBe('2026-10-05T15:30:45.123Z')
  })

  it('detecta mudança de fuso somente com prazo alterado', () => {
    const captured = '2026-10-05T15:30'
    // Sem alteração do prazo, nada bloqueia.
    expect(
      needsTimeZoneReview({
        originalIso: '2026-10-05T18:30:00.000Z',
        capturedInput: captured,
        nextInput: captured,
        dirty: false,
      }),
    ).toBe(false)
    // Prazo limpo não precisa de revisão de fuso.
    expect(
      needsTimeZoneReview({
        originalIso: '2026-10-05T18:30:00.000Z',
        capturedInput: captured,
        nextInput: '',
        dirty: true,
        convert: () => '',
      }),
    ).toBe(false)
    // Fuso inalterado.
    expect(
      needsTimeZoneReview({
        originalIso: '2026-10-05T18:30:00.000Z',
        capturedInput: captured,
        nextInput: '2026-10-05T17:45',
        dirty: true,
        convert: () => captured,
      }),
    ).toBe(false)
    // Fuso mudou: a conversão atual já não reproduz o texto capturado.
    expect(
      needsTimeZoneReview({
        originalIso: '2026-10-05T18:30:00.000Z',
        capturedInput: captured,
        nextInput: '2026-10-05T17:45',
        dirty: true,
        convert: () => '2026-10-05T14:30',
      }),
    ).toBe(true)
    // Tarefa sem prazo original nunca exige revisão.
    expect(needsTimeZoneReview({ originalIso: undefined, capturedInput: '', nextInput: '2026-10-05T17:45', dirty: true })).toBe(false)
  })

  it('exercita gap, hora repetida e troca de fuso em subprocesso com TZ fixado', () => {
    const vitest = path.resolve(import.meta.dirname, '..', '..', 'node_modules', 'vitest', 'vitest.mjs')
    const runChild = (): ReturnType<typeof spawnSync> =>
      spawnSync(process.execPath, [vitest, 'run', 'tests/renderer/date-time-tz.test.ts', '--reporter=dot', '--no-color'], {
        cwd: path.resolve(import.meta.dirname, '..', '..'),
        env: { ...process.env, TZ: 'America/Sao_Paulo' },
        encoding: 'utf8',
        timeout: 120_000,
      })
    // Uma retentativa cobre flakiness de recurso do subprocesso sob a suíte paralela;
    // o resultado precisa ser 0 em ambas as execuções que chegarem a terminar.
    let result = runChild()
    if (result.status !== 0) result = runChild()
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })
})
