import { describe, expect, it } from 'vitest'
import {
  STATE_ERROR_CODES,
  STATE_LIMITS,
  isOpaqueToken,
  isRevisionText,
  parseSnapshotPageRequest,
  parseSnapshotPageResult,
  parseStateChangedEvent,
  parseStateRequest,
  parseStateUnavailableEvent,
  parseSubscribeWireResult,
  parseUnsubscribeRequest,
  parseUnsubscribeResult,
  stateFailure,
} from '../../src/contracts/state.js'
import { measureJsonStringContent, utf8ByteLength } from '../../src/contracts/text.js'

const TOKEN = 'A'.repeat(32)

describe('requests de estado v1', () => {
  it('aceita somente os shapes exatos', () => {
    expect(parseStateRequest({ version: 1 })).toEqual({ version: 1 })
    expect(parseSnapshotPageRequest({ version: 1 })).toEqual({ version: 1 })
    expect(parseSnapshotPageRequest({ version: 1, cursor: TOKEN })).toEqual({ version: 1, cursor: TOKEN })
    expect(parseUnsubscribeRequest({ version: 1, subscriptionId: TOKEN })).toEqual({ version: 1, subscriptionId: TOKEN })
  })

  it.each([
    ['versão errada', { version: 2 }],
    ['versão textual', { version: '1' }],
    ['campo extra', { version: 1, extra: true }],
    ['caminho livre', { version: 1, path: 'C:\\dados' }],
    ['SQL livre', { version: 1, sql: 'SELECT 1' }],
    ['nulo', null],
    ['lista', [1]],
    ['texto', 'version=1'],
    ['número', 1],
    ['sem versão', {}],
  ])('recusa %s', (_label, request) => {
    expect(parseStateRequest(request)).toBeNull()
    expect(parseSnapshotPageRequest(request)).toBeNull()
    expect(parseUnsubscribeRequest(request)).toBeNull()
  })

  it('recusa protótipo estranho, getter, símbolo e propriedade não enumerável', () => {
    class Custom {
      version = 1
    }
    const getter = Object.defineProperty({}, 'version', { enumerable: true, get: () => 1 })
    const symbol = { version: 1, [Symbol('x')]: 1 }
    const hidden = Object.defineProperty({ version: 1 }, 'cursor', { enumerable: false, value: TOKEN })
    const toJson = Object.defineProperty({ version: 1 }, 'toJSON', {
      enumerable: false,
      value: () => ({ version: 1, padding: 'x'.repeat(2048) }),
    })

    for (const request of [new Custom(), getter, symbol, hidden, toJson]) {
      expect(parseStateRequest(request)).toBeNull()
      expect(parseSnapshotPageRequest(request)).toBeNull()
    }
    expect(parseStateRequest(Object.assign(Object.create(null) as object, { version: 1 }))).toEqual({ version: 1 })
  })

  it.each([
    ['curto', 'abc'],
    ['com caminho', '../../data/taskflow.sqlite'],
    ['com espaço', `${'A'.repeat(20)} `],
    ['acima de 128 bytes', 'A'.repeat(129)],
    ['não textual', 42],
    ['vazio', ''],
  ])('recusa cursor/ID %s', (_label, token) => {
    expect(isOpaqueToken(token)).toBe(false)
    expect(parseSnapshotPageRequest({ version: 1, cursor: token })).toBeNull()
    expect(parseUnsubscribeRequest({ version: 1, subscriptionId: token })).toBeNull()
  })

  it('aplica o limite serializado de 1 KiB em UTF-8', () => {
    expect(STATE_LIMITS.requestBytes).toBe(1024)
    // Chave extra já recusa; aqui o excesso vem de um valor Unicode num campo permitido.
    expect(parseUnsubscribeRequest({ version: 1, subscriptionId: 'A'.repeat(128) })).not.toBeNull()
    expect(parseStateRequest({ version: 1, pad: 'ã'.repeat(600) })).toBeNull()
  })
})

describe('respostas e eventos validados no destino', () => {
  const page = { revision: '7', fragments: [{ collection: 'tasks', data: '{}', final: true }], complete: { tasks: 1, trash: 0 } }

  it('aceita página final, página com continuação, inscrição e cancelamento', () => {
    expect(parseSnapshotPageResult({ version: 1, status: 'ok', page })).toEqual({ version: 1, status: 'ok', page })
    expect(
      parseSnapshotPageResult({ version: 1, status: 'ok', page: { revision: '7', fragments: [], cursor: TOKEN } }),
    ).toEqual({ version: 1, status: 'ok', page: { revision: '7', fragments: [], cursor: TOKEN } })
    expect(parseSubscribeWireResult({ version: 1, status: 'ok', subscriptionId: TOKEN, page })).toMatchObject({
      subscriptionId: TOKEN,
    })
    expect(parseUnsubscribeResult({ version: 1, status: 'ok' })).toEqual({ version: 1, status: 'ok' })
  })

  it('aceita somente os códigos fechados de erro', () => {
    expect(STATE_ERROR_CODES).toEqual([
      'INVALID_REQUEST',
      'UNAUTHORIZED',
      'BUSY',
      'SESSION_CLOSED',
      'SNAPSHOT_STALE',
      'RESOURCE_LIMIT',
      'INCOMPATIBLE_DATA',
      'CORRUPTED_DATA',
      'STORAGE_UNAVAILABLE',
    ])
    for (const code of STATE_ERROR_CODES) {
      expect(parseSnapshotPageResult(stateFailure(code))).toEqual({ version: 1, status: 'error', code })
    }
    expect(parseSnapshotPageResult({ version: 1, status: 'error', code: 'CONFLICT' })).toBeNull()
    expect(parseSnapshotPageResult({ version: 1, status: 'error', code: 'ID_EXISTS' })).toBeNull()
  })

  it.each([
    ['erro com stack', { version: 1, status: 'error', code: 'BUSY', stack: 'Error: at C:\\x' }],
    ['erro com mensagem', { version: 1, status: 'error', code: 'BUSY', message: 'SQLITE_BUSY' }],
    ['erro com cause', { version: 1, status: 'error', code: 'BUSY', cause: {} }],
    ['instância de Error', new Error('boom')],
    ['versão errada', { version: 2, status: 'ok', page }],
    ['status desconhecido', { version: 1, status: 'done', page }],
    ['página com cursor e conclusão', { version: 1, status: 'ok', page: { ...page, cursor: TOKEN } }],
    ['página sem cursor nem conclusão', { version: 1, status: 'ok', page: { revision: '7', fragments: [] } }],
    ['revisão numérica', { version: 1, status: 'ok', page: { ...page, revision: 7 } }],
    ['revisão não canônica', { version: 1, status: 'ok', page: { ...page, revision: '07' } }],
    ['coleção desconhecida', { version: 1, status: 'ok', page: { ...page, fragments: [{ collection: 'config', data: '', final: true }] } }],
    ['fragmento com campo extra', { version: 1, status: 'ok', page: { ...page, fragments: [{ collection: 'tasks', data: '', final: true, path: 'x' }] } }],
    ['contagem negativa', { version: 1, status: 'ok', page: { ...page, complete: { tasks: -1, trash: 0 } } }],
    ['campo extra no envelope', { version: 1, status: 'ok', page, sql: 'x' }],
  ])('recusa saída malformada: %s', (_label, value) => {
    expect(parseSnapshotPageResult(value)).toBeNull()
    expect(parseSubscribeWireResult(value)).toBeNull()
  })

  it('recusa página acima de 256 KiB serializados', () => {
    const big = { ...page, fragments: [{ collection: 'tasks', data: 'x'.repeat(STATE_LIMITS.pageBytes), final: true }] }
    expect(STATE_LIMITS.pageBytes).toBe(262_144)
    expect(parseSnapshotPageResult({ version: 1, status: 'ok', page: big })).toBeNull()
  })

  it('eventos carregam só versão, inscrição e revisão ou código, até 1 KiB', () => {
    expect(parseStateChangedEvent({ version: 1, subscriptionId: TOKEN, revision: '9223372036854775807' })).toEqual({
      version: 1,
      subscriptionId: TOKEN,
      revision: '9223372036854775807',
    })
    expect(parseStateUnavailableEvent({ version: 1, subscriptionId: TOKEN, code: 'CORRUPTED_DATA' })).toMatchObject({
      code: 'CORRUPTED_DATA',
    })
    for (const invalid of [
      { version: 1, subscriptionId: TOKEN, revision: '1', tasks: [] },
      { version: 1, subscriptionId: TOKEN, revision: '1', patch: { id: 'a' } },
      { version: 1, subscriptionId: TOKEN, revision: 1 },
      { version: 1, subscriptionId: TOKEN, revision: '9223372036854775808' },
      { version: 1, subscriptionId: 'x', revision: '1' },
      { version: 2, subscriptionId: TOKEN, revision: '1' },
    ]) {
      expect(parseStateChangedEvent(invalid)).toBeNull()
    }
    expect(parseStateUnavailableEvent({ version: 1, subscriptionId: TOKEN, code: 'SQLITE_IOERR' })).toBeNull()
    expect(parseStateUnavailableEvent({ version: 1, subscriptionId: TOKEN, code: 'BUSY', path: 'C:\\x' })).toBeNull()
  })

  it('revisões de transporte são decimais canônicos dentro de 64 bits', () => {
    expect(['0', '1', '9007199254740993', '9223372036854775807'].every(isRevisionText)).toBe(true)
    expect(['', '01', '-1', '1.5', '9223372036854775808', '99999999999999999999'].some(isRevisionText)).toBe(false)
  })
})

describe('medição de bytes sem Node nem DOM', () => {
  it('conta UTF-8 como o runtime', () => {
    for (const text of ['', 'abc', 'ação', '日本語', '🚀✅', 'a\ud83db', '\u2028\u0000"\\']) {
      expect(utf8ByteLength(text)).toBe(Buffer.byteLength(text, 'utf8'))
    }
  })

  it('mede o escaping de JSON e não divide caracteres', () => {
    for (const text of ['simples', 'aspas " e \\ barra', 'linha\nnova\t\u0000\u001f', 'ação 日本 🚀🚀', 'isolado \ud83d fim \udc00']) {
      const whole = measureJsonStringContent(text, 0, Number.MAX_SAFE_INTEGER)
      expect(whole.end).toBe(text.length)
      expect(whole.bytes).toBe(Buffer.byteLength(JSON.stringify(text), 'utf8') - 2)
    }

    const emoji = 'a🚀b'
    // Com 4 bytes cabem `a` (1) e não cabe o emoji inteiro (4): o corte fica antes do par.
    expect(measureJsonStringContent(emoji, 0, 4)).toEqual({ end: 1, bytes: 1 })
    expect(measureJsonStringContent(emoji, 1, 4)).toEqual({ end: 3, bytes: 4 })
  })
})
