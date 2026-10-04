import { describe, expect, it } from 'vitest'
import { WINDOWS_URL_CHAR_LIMIT, validateSourceUrlForOpen } from '../../src/application/tasks/source-url.js'

const BASE = 'https://example.test/'

function hrefOfLength(limit: number): string {
  return BASE + 'x'.repeat(limit - BASE.length)
}

describe('validação da origem salva para abertura', () => {
  it('aceita somente HTTP/HTTPS com host, sem credenciais nem controles', () => {
    expect(validateSourceUrlForOpen('https://example.test/pedido')).toEqual({
      ok: true,
      href: 'https://example.test/pedido',
    })
    expect(validateSourceUrlForOpen('http://127.0.0.1:8080/a?b=1#c')).toMatchObject({ ok: true })
    // URL válida com Unicode é serializada (percent-encoded) pelo construtor padrão.
    expect(validateSourceUrlForOpen('https://example.test/ação?q=coração')).toEqual({
      ok: true,
      href: 'https://example.test/a%C3%A7%C3%A3o?q=cora%C3%A7%C3%A3o',
    })
  })

  it('recusa protocolos privilegiados, UNC, userinfo e controles antes de qualquer efeito', () => {
    for (const raw of [
      'file:///C:/segredo.txt',
      'javascript:alert(1)',
      'data:text/plain,oi',
      'mailto:alguem@example.test',
      'taskflow://app/outro',
      '\\\\servidor\\pasta',
      'ftp://example.test/x',
      'https://usuario:senha@example.test/x',
      'https://usuario@example.test/x',
      'https://example.test/linha\nquebrada',
      'https://example.test/\u0000fim',
      'https://example.test/\u007f',
      'não é url',
      'example.test',
    ]) {
      expect(validateSourceUrlForOpen(raw), raw).toEqual({ ok: false, code: 'SOURCE_NOT_ALLOWED' })
    }
  })

  it('respeita o limite de 2081 caracteres do Windows sem cortar nem reescrever', () => {
    const atLimit = hrefOfLength(WINDOWS_URL_CHAR_LIMIT)
    const overLimit = hrefOfLength(WINDOWS_URL_CHAR_LIMIT + 1)
    expect(validateSourceUrlForOpen(atLimit)).toEqual({ ok: true, href: atLimit })
    expect(validateSourceUrlForOpen(overLimit)).toEqual({ ok: false, code: 'SOURCE_TOO_LONG' })
    // Uma URL mais longa não é truncada para caber: a recusa é explícita.
    const huge = hrefOfLength(50_000)
    const result = validateSourceUrlForOpen(huge)
    expect(result).toEqual({ ok: false, code: 'SOURCE_TOO_LONG' })
  })
})
