import { describe, expect, it } from 'vitest'
import { isWellFormedCaptureText, mapClipboardText, truncateCaptureText, validateCaptureSource } from '../../src/domain/clipboard-capture.js'

describe('Q01/Q02 captura copiada portável', () => {
  it.each([199, 200, 201, 3999, 4000, 4001])('mapeia %i unidades e anuncia cortes', (length) => {
    const mapped = mapClipboardText('a'.repeat(length))
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) return
    expect(mapped.draft.title.length).toBe(Math.min(length, 200))
    expect(mapped.draft.description?.length).toBe(length > 200 ? Math.min(length, 4000) : undefined)
    expect(mapped.draft.flags.titleTruncated).toBe(length > 200)
    expect(mapped.draft.flags.descriptionTruncated).toBe(length > 4000)
  })
  it('decide descrição pelo normalizado e conserva linhas internas', () => {
    expect(mapClipboardText(`  curto ${'\n '.repeat(5000)} fim `)).toEqual({ ok: true, draft: {
      kind: 'TEXT', title: 'curto fim', flags: { titleTruncated: false, descriptionTruncated: false, sourceOpeningLimited: false },
    } })
    const value = `${'x'.repeat(201)}\n segunda linha\n terceira`
    const mapped = mapClipboardText(`  ${value}  `)
    expect(mapped.ok && mapped.draft.description).toBe(value)
    expect(mapped.ok && mapped.draft.title).not.toContain('\n')
  })
  it.each([200, 4000])('recua corte no par substituto em %i', (limit) => {
    const input = `${'x'.repeat(limit - 2)}😀restante`
    const output = truncateCaptureText(input, limit)
    expect(output).toBe(`${'x'.repeat(limit - 2)}…`)
    expect(output.length).toBeLessThanOrEqual(limit)
    expect(isWellFormedCaptureText(output)).toBe(true)
  })
  it.each(['\ud800', '\udfff', 'x\ud800x', '\udfff😀', 'https://example.test/\ud800'])('recusa órfão literal', (raw) => {
    expect(mapClipboardText(raw)).toEqual({ ok: false, code: 'INVALID_TEXT' })
  })
  it('aceita emoji completo e cortes sem órfão na descrição', () => {
    const mapped = mapClipboardText(`${'😀'.repeat(2000)}mais`)
    expect(mapped.ok && isWellFormedCaptureText(mapped.draft.title)).toBe(true)
    expect(mapped.ok && isWellFormedCaptureText(mapped.draft.description ?? '')).toBe(true)
  })
  it.each(['', ' \t\r\n '])('vazio não cria draft', (raw) => expect(mapClipboardText(raw)).toEqual({ ok: false, code: 'EMPTY' }))
  it('canonicaliza token absoluto inteiro com IDNA e deixa título vazio', () => {
    const mapped = mapClipboardText('  HTTPS://BÜCHER.example:443/a?q=á#fim  ')
    expect(mapped).toEqual({ ok: true, draft: { kind: 'URL', title: '', sourceUrl: 'https://xn--bcher-kva.example/a?q=%C3%A1#fim',
      flags: { titleTruncated: false, descriptionTruncated: false, sourceOpeningLimited: false } } })
  })
  it.each(['https://example.test texto', 'https://example.test\ntexto', 'Veja https://example.test', 'example.test', 'www.example.test'])('whitespace/link embutido não infere origem: %s', (raw) => {
    const mapped = mapClipboardText(raw)
    expect(mapped.ok && mapped.draft.kind).toBe('TEXT')
    expect(mapped.ok && mapped.draft.sourceUrl).toBeUndefined()
  })
  it.each(['javascript:alert(1)', 'file:///c:/ficticio', 'mailto:a@example.test', 'https:example.test', 'http:/example.test',
    'https:///example.test', 'https://', 'https://a:b@example.test', 'https://@example.test', 'https://example.test/\u0000x',
    'https://example.test/\u0085x', 'https://example.test/\u009fx', 'https://[::invalid]', 'https://example.test:99999'])('recusa candidato: %s', (raw) => {
    expect(mapClipboardText(raw)).toEqual({ ok: false, code: 'UNSUPPORTED' })
  })
  it('recusa controles que parser descartaria na origem manual', () => {
    expect(validateCaptureSource('https://example.test/\n')).toEqual({ ok: false, code: 'UNSUPPORTED' })
    expect(validateCaptureSource('https://exa\tmple.test')).toEqual({ ok: false, code: 'UNSUPPORTED' })
  })
  it('não corta URL maior que política de abertura salva', () => {
    const raw = `https://example.test/${'a'.repeat(3000)}`
    const mapped = mapClipboardText(raw)
    expect(mapped.ok && mapped.draft.sourceUrl).toBe(raw)
    expect(mapped.ok && mapped.draft.flags.sourceOpeningLimited).toBe(true)
    expect(mapped.ok && mapped.draft.title).toBe('')
  })
})
