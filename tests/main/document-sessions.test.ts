import { describe, expect, it } from 'vitest'
import { DocumentSessions } from '../../src/main/ipc/document-sessions.js'
import { isAuthorizedDocumentUrl } from '../../src/main/protocol.js'
import { PACKAGED_ORIGIN, fakeContents, fakeFrame, invocation } from '../support/documents.js'

function registered(): { sessions: DocumentSessions; contents: ReturnType<typeof fakeContents> } {
  const sessions = new DocumentSessions(PACKAGED_ORIGIN)
  const contents = fakeContents(17)
  expect(sessions.register(contents)).toBe(true)
  return { sessions, contents }
}

describe('autorização por documento', () => {
  it('autoriza o main frame vivo da superfície registrada, na origem e URL reais', () => {
    const { sessions, contents } = registered()
    const ticket = sessions.authorize(invocation(contents))

    expect(ticket).toMatchObject({ contentsId: 17 })
    expect(ticket && sessions.isCurrent(ticket)).toBe(true)
    expect(ticket && sessions.currentFrame(ticket)).toBe(contents.mainFrame)
  })

  it('recusa webContents desconhecido, inclusive com o mesmo id', () => {
    const { sessions, contents } = registered()

    expect(sessions.authorize(invocation(fakeContents(18)))).toBeNull()
    expect(sessions.authorize(invocation(fakeContents(17, contents.mainFrame)))).toBeNull()
  })

  it('recusa iframe e frame removido, destruído ou destacado', () => {
    const { sessions, contents } = registered()

    expect(sessions.authorize(invocation(contents, fakeFrame('taskflow://app/')))).toBeNull()
    expect(sessions.authorize(invocation(contents, null))).toBeNull()

    contents.mainFrame.destroyed = true
    expect(sessions.authorize(invocation(contents))).toBeNull()
    contents.mainFrame.destroyed = false
    contents.mainFrame.detached = true
    expect(sessions.authorize(invocation(contents))).toBeNull()
  })

  it('recusa superfície destruída e falha fechada se o main frame não puder ser lido', () => {
    const { sessions, contents } = registered()
    contents.destroyed = true
    expect(sessions.authorize(invocation(contents))).toBeNull()

    const broken = {
      id: 30,
      isDestroyed: () => false,
      get mainFrame(): never {
        throw new Error('Object has been destroyed')
      },
    }
    sessions.register(broken)
    expect(sessions.authorize({ sender: broken, senderFrame: fakeFrame() })).toBeNull()
  })

  it.each([
    ['origem opaca', 'taskflow://app/', 'null'],
    ['origem externa', 'taskflow://app/', 'https://example.invalid'],
    ['origem dev no pacote', 'http://127.0.0.1:5173/', 'http://127.0.0.1:5173'],
    ['about:blank com origem herdada', 'about:blank', PACKAGED_ORIGIN],
    ['blob com origem herdada', 'blob:taskflow://app/0f1e2d3c', PACKAGED_ORIGIN],
    ['host parecido', 'taskflow://app.evil/', PACKAGED_ORIGIN],
    ['outra rota', 'taskflow://app/other.html', PACKAGED_ORIGIN],
    ['query', 'taskflow://app/index.html?probe=1', PACKAGED_ORIGIN],
    ['fragmento', 'taskflow://app/#/tarefas', PACKAGED_ORIGIN],
    ['credenciais na URL', 'taskflow://user:pass@app/', PACKAGED_ORIGIN],
    ['URL inválida', 'not a url', PACKAGED_ORIGIN],
    ['data URL', 'data:text/html,<p>x</p>', PACKAGED_ORIGIN],
  ])('recusa %s', (_label, url, origin) => {
    const sessions = new DocumentSessions(PACKAGED_ORIGIN)
    const contents = fakeContents(5, fakeFrame(url, origin))
    sessions.register(contents)

    expect(sessions.authorize(invocation(contents))).toBeNull()
  })

  it('aceita somente a rota local do shell', () => {
    expect(isAuthorizedDocumentUrl('taskflow://app/', PACKAGED_ORIGIN)).toBe(true)
    expect(isAuthorizedDocumentUrl('taskflow://app/index.html', PACKAGED_ORIGIN)).toBe(true)
    expect(isAuthorizedDocumentUrl('http://127.0.0.1:5173/', 'http://127.0.0.1:5173')).toBe(true)
    expect(isAuthorizedDocumentUrl('http://127.0.0.1:5173/', PACKAGED_ORIGIN)).toBe(false)
    expect(isAuthorizedDocumentUrl('http://localhost:5173/', 'http://127.0.0.1:5173')).toBe(false)
  })
})

describe('geração do documento', () => {
  it('navegação/reload da mesma URL invalida a sessão anterior', () => {
    const { sessions, contents } = registered()
    const invalidated: string[] = []
    sessions.onInvalidated((key) => invalidated.push(key))
    const before = sessions.authorize(invocation(contents))
    if (before === null) throw new Error('expected a ticket')

    // Reload: mesmo webContents, mesmo frame, mesma URL — outro documento.
    sessions.invalidate(contents.id)

    expect(sessions.isCurrent(before)).toBe(false)
    expect(sessions.currentFrame(before)).toBeNull()
    expect(invalidated).toEqual([before.key])

    const after = sessions.authorize(invocation(contents))
    expect(after?.generation).not.toBe(before.generation)
    expect(after && sessions.isCurrent(after)).toBe(true)
    expect(sessions.isCurrent(before)).toBe(false)
  })

  it('antes da primeira autorização do novo documento, nada é entregue a ele', () => {
    const { sessions, contents } = registered()
    const before = sessions.authorize(invocation(contents))
    if (before === null) throw new Error('expected a ticket')
    sessions.invalidate(contents.id)

    // O ticket antigo aponta para a geração anterior; o novo documento ainda não autorizou.
    expect(sessions.currentFrame({ ...before, generation: before.generation + 1 })).toBeNull()
  })

  it('troca do main frame sem evento de navegação também invalida (falha fechada)', () => {
    const { sessions, contents } = registered()
    const before = sessions.authorize(invocation(contents))
    if (before === null) throw new Error('expected a ticket')

    contents.mainFrame = fakeFrame()
    expect(sessions.isCurrent(before)).toBe(false)

    const after = sessions.authorize(invocation(contents))
    expect(after?.generation).not.toBe(before.generation)
    expect(sessions.isCurrent(before)).toBe(false)
  })

  it('documento que sai da origem autorizada perde a sessão corrente', () => {
    const { sessions, contents } = registered()
    const ticket = sessions.authorize(invocation(contents))
    if (ticket === null) throw new Error('expected a ticket')

    contents.mainFrame.url = 'about:blank'
    expect(sessions.isCurrent(ticket)).toBe(false)
    contents.mainFrame.url = 'taskflow://app/'
    contents.mainFrame.destroyed = true
    expect(sessions.isCurrent(ticket)).toBe(false)
  })

  it('crash e fechamento encerram a sessão e notificam a limpeza', () => {
    const { sessions, contents } = registered()
    const invalidated: string[] = []
    sessions.onInvalidated((key) => invalidated.push(key))
    const ticket = sessions.authorize(invocation(contents))
    if (ticket === null) throw new Error('expected a ticket')

    sessions.unregister(contents.id)

    expect(sessions.isCurrent(ticket)).toBe(false)
    expect(sessions.authorize(invocation(contents))).toBeNull()
    expect(invalidated).toEqual([ticket.key])
    expect(sessions.size).toBe(0)
  })

  it('a geração é criada pelo main: ID fornecido pelo renderer não confere autoridade', () => {
    const { sessions, contents } = registered()
    const ticket = sessions.authorize(invocation(contents))
    if (ticket === null) throw new Error('expected a ticket')

    expect(sessions.isCurrent({ role: 'MANAGER', contentsId: 17, generation: 999, key: ticket.key })).toBe(false)
    expect(sessions.isCurrent({ role: 'MANAGER', contentsId: 99, generation: ticket.generation, key: ticket.key })).toBe(false)
  })
})

describe('limite de documentos registrados', () => {
  it('no máximo oito superfícies; o excedente é recusado e a liberação reabre vaga', () => {
    const sessions = new DocumentSessions(PACKAGED_ORIGIN)
    for (let id = 1; id <= 8; id += 1) expect(sessions.register(fakeContents(id))).toBe(true)

    const ninth = fakeContents(9)
    expect(sessions.register(ninth)).toBe(false)
    expect(sessions.authorize(invocation(ninth))).toBeNull()
    expect(sessions.size).toBe(8)

    sessions.unregister(3)
    expect(sessions.register(ninth)).toBe(true)
    expect(sessions.authorize(invocation(ninth))).not.toBeNull()
  })
})
