import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { SnapshotAssembler } from '../../src/application/state/snapshot-assembler.js'
import type { TaskStorageReader, UnitResult } from '../../src/application/storage/unit-of-work.js'
import {
  STATE_CHANGED_EVENT,
  STATE_LIMITS,
  STATE_UNAVAILABLE_EVENT,
  isOpaqueToken,
  parseSnapshotPageResult,
  parseStateChangedEvent,
  parseSubscribeWireResult,
  type SnapshotPage,
  type SnapshotPageResult,
  type StateSnapshot,
  type SubscribeWireResult,
} from '../../src/contracts/state.js'
import { utf8ByteLength } from '../../src/contracts/text.js'
import type { Task } from '../../src/domain/task.js'
import { buildFictitiousTask, buildFictitiousTasks, fictitiousText } from '../../src/main/harness/fixtures.js'
import { DocumentSessions } from '../../src/main/ipc/document-sessions.js'
import { StateIpcService, stateErrorCodeFor, type StateStorage } from '../../src/main/ipc/state.js'
import type { StorageCoordinator, UnitOptions } from '../../src/main/storage/coordinator.js'
import { PACKAGED_ORIGIN, fakeContents, fakeFrame, invocation, type FakeContents } from '../support/documents.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)

interface Fixture {
  file: string
  coordinator: StorageCoordinator
  sessions: DocumentSessions
  service: StateIpcService
  /** Quantas leituras coordenadas o IPC pediu (zero antes do guard). */
  reads: () => number
  flush: () => void
  setNow: (value: number) => void
  surface: (id: number) => FakeContents
  /** Chamado depois de cada leitura resolver e antes de o IPC responder. */
  afterRead: { hook: (() => void) | undefined }
}

function createFixture(options: { schedule?: (callback: () => void) => void } = {}): Fixture {
  const file = createProductFile()
  const coordinator = openCoordinator(file, options.schedule === undefined ? {} : { schedule: options.schedule })
  const sessions = new DocumentSessions(PACKAGED_ORIGIN)
  const flushes: Array<() => void> = []
  const afterRead: Fixture['afterRead'] = { hook: undefined }
  let reads = 0
  let now = 1_000
  let token = 0

  const storage: StateStorage = {
    read: async <T>(reader: (reader: TaskStorageReader) => T, unitOptions?: UnitOptions): Promise<UnitResult<T>> => {
      reads += 1
      const result = await coordinator.read(reader, unitOptions)
      afterRead.hook?.()
      return result
    },
    onCommitted: (listener) => coordinator.onCommitted(listener),
    onUnavailable: (listener) => coordinator.onUnavailable(listener),
    cancelOwner: (owner) => coordinator.cancelOwner(owner),
  }

  const service = new StateIpcService({
    sessions,
    storage,
    randomToken: () => `token-${String((token += 1)).padStart(26, '0')}`,
    now: () => now,
    schedule: (callback) => flushes.push(callback),
  })

  return {
    file,
    coordinator,
    sessions,
    service,
    reads: () => reads,
    flush: () => {
      for (let callback = flushes.shift(); callback !== undefined; callback = flushes.shift()) callback()
    },
    setNow: (value) => {
      now = value
    },
    surface: (id) => {
      const contents = fakeContents(id)
      sessions.register(contents)
      return contents
    },
    afterRead,
  }
}

async function seed(fixture: Fixture, tasks: Task[]): Promise<void> {
  expectOk(await fixture.coordinator.run((unit) => unit.saveTasks(tasks)))
}

function page(result: SnapshotPageResult | SubscribeWireResult): SnapshotPage {
  if (result.status !== 'ok') throw new Error(`expected a page, got ${result.code}`)
  return result.page
}

/** Percorre o snapshot como o preload faria, conferindo o orçamento de cada resposta. */
async function assemble(fixture: Fixture, contents: FakeContents): Promise<{ snapshot: StateSnapshot; pages: number }> {
  const assembler = new SnapshotAssembler()
  let request: { version: 2; cursor?: string } = { version: 2 }
  for (let pages = 1; pages < 10_000; pages += 1) {
    const result = await fixture.service.handleSnapshot(invocation(contents), request)
    expect(parseSnapshotPageResult(result)).not.toBeNull()
    expect(utf8ByteLength(JSON.stringify(result))).toBeLessThanOrEqual(STATE_LIMITS.pageBytes)
    const current = page(result)
    const snapshot = assembler.accept(current)
    if (snapshot !== undefined) return { snapshot, pages }
    request = { version: 2, cursor: current.cursor ?? '' }
  }
  throw new Error('snapshot did not finish')
}

describe('zero leitura antes do guard', () => {
  it('remetentes inválidos são recusados sem consultar o armazenamento', async () => {
    const fixture = createFixture()
    const contents = fixture.surface(1)
    const stale = fixture.surface(2)
    await fixture.service.handleSubscribe(invocation(stale), { version: 2 })
    const readsBefore = fixture.reads()

    const unknown = fakeContents(50)
    const blank = fixture.surface(3)
    blank.mainFrame.url = 'about:blank'
    const blob = fixture.surface(4)
    blob.mainFrame.url = 'blob:taskflow://app/0f1e2d3c'
    const dev = fixture.surface(5)
    dev.mainFrame.url = 'http://127.0.0.1:5173/'
    dev.mainFrame.origin = 'http://127.0.0.1:5173'
    const wrongOrigin = fixture.surface(6)
    wrongOrigin.mainFrame.origin = 'https://example.invalid'
    const removed = fixture.surface(7)
    removed.mainFrame.destroyed = true

    const events = [
      invocation(unknown),
      invocation(contents, fakeFrame()),
      invocation(contents, null),
      invocation(blank),
      invocation(blob),
      invocation(dev),
      invocation(wrongOrigin),
      invocation(removed),
    ]
    for (const event of events) {
      expect(await fixture.service.handleSnapshot(event, { version: 2 })).toEqual({ version: 2, status: 'error', code: 'UNAUTHORIZED' })
      expect(await fixture.service.handleSubscribe(event, { version: 2 })).toEqual({ version: 2, status: 'error', code: 'UNAUTHORIZED' })
      expect(await fixture.service.handleUnsubscribe(event, { version: 2, subscriptionId: 'A'.repeat(32) })).toEqual({
        version: 2,
        status: 'error',
        code: 'UNAUTHORIZED',
      })
    }

    expect(fixture.reads()).toBe(readsBefore)
    expect(fixture.service.activeSubscriptions).toBe(1)
  })

  it('requests malformados são recusados antes de ler, sem lançar erro pelo IPC', async () => {
    const fixture = createFixture()
    const contents = fixture.surface(1)
    const malformed: unknown[] = [
      { version: 1 },
      { version: 3 },
      { version: '2' },
      { version: 2, extra: true },
      { version: 2, path: 'C:\\dados\\taskflow.sqlite' },
      { version: 2, sql: 'DELETE FROM tasks' },
      { version: 2, cursor: 'short' },
      { version: 2, cursor: 42 },
      { version: 2, pad: 'x'.repeat(2048) },
      null,
      undefined,
      'version=2',
      [],
      () => undefined,
    ]

    for (const request of malformed) {
      expect(await fixture.service.handleSnapshot(invocation(contents), request)).toEqual({
        version: 2,
        status: 'error',
        code: 'INVALID_REQUEST',
      })
    }
    for (const request of [{ version: 2, cursor: 'A'.repeat(32) }, { version: 1 }, { version: 3 }, null]) {
      expect(await fixture.service.handleSubscribe(invocation(contents), request)).toEqual({
        version: 2,
        status: 'error',
        code: 'INVALID_REQUEST',
      })
    }
    for (const request of [
      { version: 2 },
      { version: 2, subscriptionId: '../x' },
      { version: 2, subscriptionId: 'A'.repeat(200) },
      { version: 1, subscriptionId: 'A'.repeat(32) },
    ]) {
      expect(await fixture.service.handleUnsubscribe(invocation(contents), request)).toEqual({
        version: 2,
        status: 'error',
        code: 'INVALID_REQUEST',
      })
    }
    expect(fixture.reads()).toBe(0)
  })

  it('cursor desconhecido, de outra sessão ou expirado é recusado antes de ler', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(400))
    const own = fixture.surface(1)
    const other = fixture.surface(2)
    const ownCursor = page(await fixture.service.handleSnapshot(invocation(own), { version: 2 })).cursor ?? ''
    const otherCursor = page(await fixture.service.handleSnapshot(invocation(other), { version: 2 })).cursor ?? ''
    const reads = fixture.reads()
    const stale = { version: 2, status: 'error', code: 'SNAPSHOT_STALE' }

    expect(ownCursor).not.toBe('')
    expect(isOpaqueToken(ownCursor)).toBe(true)
    expect(await fixture.service.handleSnapshot(invocation(own), { version: 2, cursor: otherCursor })).toEqual(stale)
    expect(await fixture.service.handleSnapshot(invocation(own), { version: 2, cursor: 'Z'.repeat(32) })).toEqual(stale)
    expect(fixture.reads()).toBe(reads)

    // A recusa não afetou a outra sessão: o cursor dela segue válido e é renovado a cada página.
    fixture.setNow(1_000 + STATE_LIMITS.cursorTtlMs - 1)
    const next = page(await fixture.service.handleSnapshot(invocation(other), { version: 2, cursor: otherCursor }))
    expect(next.revision).toBe('1')
    const readsAfterPage = fixture.reads()

    // 30 s sem uso: o cursor próprio expira; o renovado da outra sessão ainda vale.
    fixture.setNow(1_000 + STATE_LIMITS.cursorTtlMs + 1)
    expect(await fixture.service.handleSnapshot(invocation(own), { version: 2, cursor: ownCursor })).toEqual(stale)
    expect(fixture.reads()).toBe(readsAfterPage)
    expect(STATE_LIMITS.cursorTtlMs).toBe(30_000)
    expect((await fixture.service.handleSnapshot(invocation(other), { version: 2, cursor: next.cursor ?? '' })).status).toBe('ok')
  })
})

describe('snapshot paginado de uma revisão', () => {
  it('páginas estáveis reúnem todos os registros e campos numa única revisão', async () => {
    const fixture = createFixture()
    const tasks = buildFictitiousTasks(900)
    await seed(fixture, tasks)
    const first = tasks[0]
    expectOk(await fixture.coordinator.run((unit) => unit.moveToTrash(first?.id ?? '', '2020-01-01T00:00:00.000Z')))
    const contents = fixture.surface(1)

    const { snapshot, pages } = await assemble(fixture, contents)

    expect(pages).toBeGreaterThan(3)
    expect(snapshot.revision).toBe('2')
    expect(snapshot.tasks.map((record) => record.task)).toEqual(tasks.slice(1))
    expect(snapshot.tasks.every((record) => record.contentRevision === '1' && record.editRevision === '1')).toBe(true)
    expect(snapshot.trash).toEqual([{ task: first, deletedAt: '2020-01-01T00:00:00.000Z', contentRevision: '1', editRevision: '1' }])
    expect(fixture.service.activeCursors).toBe(0)
  })

  it('registro acima de 256 KiB com Unicode é fragmentado e recuperado inteiro', async () => {
    const fixture = createFixture()
    const big = { ...buildFictitiousTask(1), description: fictitiousText(700_000, 3) }
    await seed(fixture, [big, buildFictitiousTask(2)])

    const { snapshot, pages } = await assemble(fixture, fixture.surface(1))

    expect(utf8ByteLength(JSON.stringify(big))).toBeGreaterThan(STATE_LIMITS.pageBytes * 2)
    expect(pages).toBeGreaterThan(3)
    expect(snapshot.tasks.map((record) => record.task)).toEqual([big, buildFictitiousTask(2)])
  })

  it('commit entre páginas devolve SNAPSHOT_STALE e nada parcial é completado', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(400))
    const contents = fixture.surface(1)
    const first = page(await fixture.service.handleSnapshot(invocation(contents), { version: 2 }))

    expectOk(await fixture.coordinator.run((unit) => unit.saveTask(buildFictitiousTask(9_000))))
    const continuation = await fixture.service.handleSnapshot(invocation(contents), { version: 2, cursor: first.cursor ?? '' })
    const retry = await fixture.service.handleSnapshot(invocation(contents), { version: 2, cursor: first.cursor ?? '' })

    expect(continuation).toEqual({ version: 2, status: 'error', code: 'SNAPSHOT_STALE' })
    expect(retry).toEqual({ version: 2, status: 'error', code: 'SNAPSHOT_STALE' })
    expect(fixture.service.activeCursors).toBe(0)
    expect((await assemble(fixture, contents)).snapshot.revision).toBe('2')
  })

  it('um cursor ativo por documento: novo snapshot substitui a continuação anterior', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(400))
    const contents = fixture.surface(1)
    const first = page(await fixture.service.handleSnapshot(invocation(contents), { version: 2 }))
    const second = page(await fixture.service.handleSnapshot(invocation(contents), { version: 2 }))

    expect(fixture.service.activeCursors).toBe(1)
    expect(await fixture.service.handleSnapshot(invocation(contents), { version: 2, cursor: first.cursor ?? '' })).toMatchObject({
      code: 'SNAPSHOT_STALE',
    })
    // A recusa do token antigo não derruba o cursor corrente.
    const next = await fixture.service.handleSnapshot(invocation(contents), { version: 2, cursor: second.cursor ?? '' })
    expect(next.status).toBe('ok')
    // Token de página já usada não é reutilizável.
    expect(await fixture.service.handleSnapshot(invocation(contents), { version: 2, cursor: second.cursor ?? '' })).toMatchObject({
      code: 'SNAPSHOT_STALE',
    })
  })

  it('leitura não expurga a lixeira, não regrava payload histórico e não altera revisão', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(3))
    expectOk(await fixture.coordinator.run((unit) => unit.moveToTrash(buildFictitiousTask(1).id, '2001-01-01T00:00:00.000Z')))
    const contents = fixture.surface(1)
    await fixture.service.handleSubscribe(invocation(contents), { version: 2 })
    contents.mainFrame.sent.length = 0

    const first = await assemble(fixture, contents)
    const second = await assemble(fixture, contents)
    fixture.flush()

    expect(first.snapshot).toEqual(second.snapshot)
    expect(first.snapshot.trash).toHaveLength(1)
    expect(fixture.coordinator.confirmedRevision).toBe(2n)
    expect(contents.mainFrame.sent).toEqual([])
  })

  it('estado de produto bloqueado devolve o código, nunca snapshot vazio', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(2))
    const raw = new DatabaseSync(fixture.file)
    raw.exec("UPDATE tasks SET payload_json = '{'")
    raw.close()
    const contents = fixture.surface(1)

    expect(await fixture.service.handleSnapshot(invocation(contents), { version: 2 })).toEqual({
      version: 2,
      status: 'error',
      code: 'INCOMPATIBLE_DATA',
    })
    expect(await fixture.service.handleSubscribe(invocation(contents), { version: 2 })).toEqual({
      version: 2,
      status: 'error',
      code: 'INCOMPATIBLE_DATA',
    })
    expect(fixture.service.activeSubscriptions).toBe(0)
  })

  it('pressão de recursos devolve RESOURCE_LIMIT sem truncar nem deixar cursor', async () => {
    const fixture = createFixture()
    const contents = fixture.surface(1)
    const service = new StateIpcService({
      sessions: fixture.sessions,
      randomToken: () => 'R'.repeat(32),
      storage: {
        read: <T>(reader: (reader: TaskStorageReader) => T): Promise<UnitResult<T>> => {
          const exhausted = {
            baseRevision: 1n,
            iterateTasks: () => {
              throw new RangeError('Invalid string length')
            },
          } as unknown as TaskStorageReader
          return Promise.resolve({ ok: true, value: reader(exhausted), committed: false, revision: 1n })
        },
        onCommitted: () => () => undefined,
        onUnavailable: () => () => undefined,
        cancelOwner: () => 0,
      },
    })

    expect(await service.handleSnapshot(invocation(contents), { version: 2 })).toEqual({
      version: 2,
      status: 'error',
      code: 'RESOURCE_LIMIT',
    })
    expect(service.activeCursors).toBe(0)
  })

  it('falha inesperada do armazenamento vira código seguro, sem stack ou caminho', async () => {
    const fixture = createFixture()
    const contents = fixture.surface(1)
    const service = new StateIpcService({
      sessions: fixture.sessions,
      randomToken: () => 'R'.repeat(32),
      storage: {
        read: () => Promise.reject(new Error('C:\\Users\\x\\taskflow.sqlite: SQLITE_IOERR at INSERT INTO tasks')),
        onCommitted: () => () => undefined,
        onUnavailable: () => () => undefined,
        cancelOwner: () => 0,
      },
    })

    const result = await service.handleSnapshot(invocation(contents), { version: 2 })
    expect(result).toEqual({ version: 2, status: 'error', code: 'STORAGE_UNAVAILABLE' })
    expect(Object.keys(result).sort()).toEqual(['code', 'status', 'version'])
  })

  it('razões internas viram somente os códigos públicos fechados', () => {
    expect(stateErrorCodeFor('INCOMPATIBLE_DATA')).toBe('INCOMPATIBLE_DATA')
    expect(stateErrorCodeFor('CORRUPTED_DATA')).toBe('CORRUPTED_DATA')
    expect(['LOCKED', 'QUEUE_FULL', 'WAIT_TIMEOUT'].map((reason) => stateErrorCodeFor(reason as 'LOCKED'))).toEqual(['BUSY', 'BUSY', 'BUSY'])
    expect(['CLOSED', 'SESSION_CLOSED'].map((reason) => stateErrorCodeFor(reason as 'CLOSED'))).toEqual(['SESSION_CLOSED', 'SESSION_CLOSED'])
    expect(
      ['UNAVAILABLE', 'UNCERTAIN', 'INVALID_DATA', 'REVISION_EXHAUSTED', 'INVALID_UNIT'].map((reason) =>
        stateErrorCodeFor(reason as 'UNAVAILABLE'),
      ),
    ).toEqual(Array(5).fill('STORAGE_UNAVAILABLE'))
  })
})

describe('inscrição e invalidações', () => {
  it('inscrição, revisão base e primeira página saem do mesmo turno coordenado', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(3))
    const contents = fixture.surface(1)

    const result = await fixture.service.handleSubscribe(invocation(contents), { version: 2 })

    expect(parseSubscribeWireResult(result)).not.toBeNull()
    expect(page(result)).toMatchObject({ revision: '1', complete: { tasks: 3, trash: 0 } })
    // Tokens do main são opacos: a inscrição não é um ID previsível nem um caminho.
    expect(result.status === 'ok' && isOpaqueToken(result.subscriptionId)).toBe(true)
    expect(JSON.stringify(result)).toContain('"version":2')
    expect(fixture.reads()).toBe(1)
    expect(fixture.service.activeSubscriptions).toBe(1)
  })

  it('subscribe repetido é idempotente: uma inscrição corrente por documento', async () => {
    const fixture = createFixture()
    const contents = fixture.surface(1)
    const first = await fixture.service.handleSubscribe(invocation(contents), { version: 2 })
    const second = await fixture.service.handleSubscribe(invocation(contents), { version: 2 })

    expect(first.status === 'ok' && second.status === 'ok' && first.subscriptionId === second.subscriptionId).toBe(true)
    expect(fixture.service.activeSubscriptions).toBe(1)

    expectOk(await fixture.coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    fixture.flush()
    expect(contents.mainFrame.sent).toHaveLength(1)
  })

  it('evento sai só depois do commit, com inscrição e revisão exata, sem payload de tarefas', async () => {
    const fixture = createFixture()
    const contents = fixture.surface(1)
    const subscribed = await fixture.service.handleSubscribe(invocation(contents), { version: 2 })
    if (subscribed.status !== 'ok') throw new Error(subscribed.code)

    expectOk(await fixture.coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    fixture.flush()

    expect(contents.mainFrame.sent).toEqual([
      { channel: STATE_CHANGED_EVENT, payload: { version: 2, subscriptionId: subscribed.subscriptionId, revision: '1' } },
    ])
    const payload = contents.mainFrame.sent[0]?.payload
    expect(parseStateChangedEvent(payload)).not.toBeNull()
    expect(utf8ByteLength(JSON.stringify(payload))).toBeLessThanOrEqual(STATE_LIMITS.eventBytes)
    expect(JSON.stringify(payload)).not.toContain(buildFictitiousTask(1).id)
  })

  it('no-op, conflito, recusa e rollback não emitem alteração', async () => {
    const fixture = createFixture()
    await seed(fixture, [buildFictitiousTask(1)])
    const contents = fixture.surface(1)
    await fixture.service.handleSubscribe(invocation(contents), { version: 2 })

    await fixture.coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1)))
    await fixture.coordinator.run((unit) => unit.updateTaskConditionally(buildFictitiousTask(1).id, 99n, (task) => ({ ...task, title: 'x' })))
    await fixture.coordinator.run((unit) => unit.restoreFromTrash('ausente', (task) => task))
    await fixture.coordinator.run((unit) => {
      unit.saveTask(buildFictitiousTask(2))
      throw new Error('fixture: rollback')
    })
    fixture.flush()

    expect(contents.mainFrame.sent).toEqual([])
    expect(fixture.coordinator.confirmedRevision).toBe(1n)
  })

  it('vários commits coalescem na maior revisão por inscrição', async () => {
    const fixture = createFixture()
    const contents = fixture.surface(1)
    await fixture.service.handleSubscribe(invocation(contents), { version: 2 })

    for (let index = 1; index <= 5; index += 1) {
      expectOk(await fixture.coordinator.run((unit) => unit.saveTask(buildFictitiousTask(index))))
    }
    fixture.flush()

    expect(contents.mainFrame.sent.map((event) => event.payload)).toEqual([
      expect.objectContaining({ revision: '5' }),
    ])
  })

  it('duas superfícies recebem a mesma invalidação e convergem pelo snapshot', async () => {
    const fixture = createFixture()
    const left = fixture.surface(1)
    const right = fixture.surface(2)
    await fixture.service.handleSubscribe(invocation(left), { version: 2 })
    await fixture.service.handleSubscribe(invocation(right), { version: 2 })

    expectOk(await fixture.coordinator.run((unit) => unit.saveTasks(buildFictitiousTasks(4))))
    fixture.flush()

    expect(left.mainFrame.sent.map((event) => (event.payload as { revision: string }).revision)).toEqual(['1'])
    expect(right.mainFrame.sent.map((event) => (event.payload as { revision: string }).revision)).toEqual(['1'])
    expect((await assemble(fixture, left)).snapshot).toEqual((await assemble(fixture, right)).snapshot)
  })

  it('indisponibilidade chega como código seguro, distinto de snapshot vazio', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(2))
    const contents = fixture.surface(1)
    const subscribed = await fixture.service.handleSubscribe(invocation(contents), { version: 2 })
    if (subscribed.status !== 'ok') throw new Error(subscribed.code)

    const raw = new DatabaseSync(fixture.file)
    raw.exec("UPDATE tasks SET payload_json = '{'")
    raw.close()
    await fixture.service.handleSnapshot(invocation(contents), { version: 2 })

    expect(contents.mainFrame.sent).toEqual([
      {
        channel: STATE_UNAVAILABLE_EVENT,
        payload: { version: 2, subscriptionId: subscribed.subscriptionId, code: 'INCOMPATIBLE_DATA' },
      },
    ])
  })
})

describe('tokens e listeners pertencem ao documento', () => {
  it('cancelamento próprio é idempotente; o de outra sessão é recusado sem afetá-la', async () => {
    const fixture = createFixture()
    const own = fixture.surface(1)
    const other = fixture.surface(2)
    const mine = await fixture.service.handleSubscribe(invocation(own), { version: 2 })
    const theirs = await fixture.service.handleSubscribe(invocation(other), { version: 2 })
    if (mine.status !== 'ok' || theirs.status !== 'ok') throw new Error('subscribe failed')
    const reads = fixture.reads()

    expect(await fixture.service.handleUnsubscribe(invocation(own), { version: 2, subscriptionId: theirs.subscriptionId })).toEqual({
      version: 2,
      status: 'error',
      code: 'UNAUTHORIZED',
    })
    expect(fixture.service.activeSubscriptions).toBe(2)

    const request = { version: 2, subscriptionId: mine.subscriptionId }
    expect(await fixture.service.handleUnsubscribe(invocation(own), request)).toEqual({ version: 2, status: 'ok' })
    expect(await fixture.service.handleUnsubscribe(invocation(own), request)).toEqual({ version: 2, status: 'ok' })
    expect(fixture.service.activeSubscriptions).toBe(1)
    expect(fixture.reads()).toBe(reads)

    expectOk(await fixture.coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    fixture.flush()
    expect(own.mainFrame.sent).toEqual([])
    expect(other.mainFrame.sent).toHaveLength(1)
  })

  it('reload da mesma URL: inscrição, cursor e entregas do documento anterior deixam de valer', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(400))
    const contents = fixture.surface(1)
    const subscribed = await fixture.service.handleSubscribe(invocation(contents), { version: 2 })
    if (subscribed.status !== 'ok') throw new Error(subscribed.code)
    const cursor = subscribed.page.cursor ?? ''

    fixture.sessions.invalidate(contents.id)

    expect(fixture.service.trackedDocuments).toBe(0)
    expect(fixture.service.activeSubscriptions).toBe(0)
    expect(fixture.service.activeCursors).toBe(0)

    // O novo documento (mesma URL, mesmo frame) não herda nada do anterior.
    expectOk(await fixture.coordinator.run((unit) => unit.saveTask(buildFictitiousTask(9_000))))
    fixture.flush()
    expect(contents.mainFrame.sent).toEqual([])
    expect(await fixture.service.handleSnapshot(invocation(contents), { version: 2, cursor })).toMatchObject({
      code: 'SNAPSHOT_STALE',
    })
    expect(await fixture.service.handleUnsubscribe(invocation(contents), { version: 2, subscriptionId: subscribed.subscriptionId })).toMatchObject({
      code: 'UNAUTHORIZED',
    })

    const fresh = await fixture.service.handleSubscribe(invocation(contents), { version: 2 })
    expect(fresh.status === 'ok' && fresh.subscriptionId !== subscribed.subscriptionId).toBe(true)
  })

  it('documento que navega enquanto espera na fila não lê nem recebe dados', async () => {
    const queued: Array<() => void> = []
    const fixture = createFixture({ schedule: (callback) => queued.push(callback) })
    const seeded = fixture.coordinator.run((unit) => unit.saveTasks(buildFictitiousTasks(3)))
    queued.shift()?.()
    expectOk(await seeded)
    const contents = fixture.surface(1)
    let dataReads = 0
    fixture.coordinator.onUnitMeasured(() => (dataReads += 1))

    const pending = fixture.service.handleSnapshot(invocation(contents), { version: 2 })
    expect(fixture.coordinator.pending).toBe(1)
    // Navegação depois da autorização e antes da execução.
    fixture.sessions.invalidate(contents.id)
    while (queued.length > 0) queued.shift()?.()

    expect(await pending).toEqual({ version: 2, status: 'error', code: 'SESSION_CLOSED' })
    expect(fixture.coordinator.pending).toBe(0)
    expect(dataReads).toBe(0)
  })

  it('resultado tardio não é entregue sob a autorização antiga', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(3))
    const contents = fixture.surface(1)
    // A leitura executa; o documento navega antes de a resposta ser enviada.
    fixture.afterRead.hook = () => fixture.sessions.invalidate(contents.id)

    const snapshot = await fixture.service.handleSnapshot(invocation(contents), { version: 2 })
    const subscribed = await fixture.service.handleSubscribe(invocation(contents), { version: 2 })

    expect(snapshot).toEqual({ version: 2, status: 'error', code: 'SESSION_CLOSED' })
    expect(subscribed).toEqual({ version: 2, status: 'error', code: 'SESSION_CLOSED' })
    expect(JSON.stringify([snapshot, subscribed])).not.toContain('fict-')
    expect(fixture.service.activeSubscriptions).toBe(0)
  })

  it('crash ou fechamento antes do envio do evento: nada é entregue e o estado é limpo', async () => {
    const fixture = createFixture()
    const contents = fixture.surface(1)
    await fixture.service.handleSubscribe(invocation(contents), { version: 2 })

    expectOk(await fixture.coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    // O frame morre entre o commit e a entrega coalescida.
    contents.mainFrame.destroyed = true
    fixture.flush()

    expect(contents.mainFrame.sent).toEqual([])
    expect(fixture.service.trackedDocuments).toBe(0)
  })

  it('estado transitório limitado: oito documentos, uma inscrição e um cursor por documento', async () => {
    const fixture = createFixture()
    await seed(fixture, buildFictitiousTasks(400))
    const surfaces = Array.from({ length: 8 }, (_unused, index) => fixture.surface(index + 1))

    for (const contents of surfaces) {
      for (let repeat = 0; repeat < 3; repeat += 1) {
        await fixture.service.handleSubscribe(invocation(contents), { version: 2 })
        await fixture.service.handleSnapshot(invocation(contents), { version: 2 })
      }
    }
    const ninth = fakeContents(9)

    expect(fixture.sessions.register(ninth)).toBe(false)
    expect(await fixture.service.handleSubscribe(invocation(ninth), { version: 2 })).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(fixture.service.trackedDocuments).toBe(8)
    expect(fixture.service.activeSubscriptions).toBe(8)
    expect(fixture.service.activeCursors).toBe(8)

    for (const contents of surfaces) fixture.sessions.unregister(contents.id)
    expect([fixture.service.trackedDocuments, fixture.service.activeSubscriptions, fixture.service.activeCursors]).toEqual([0, 0, 0])
  })

  it('fila por sessão cheia devolve BUSY sem efeito nem vazamento', async () => {
    const queued: Array<() => void> = []
    const fixture = createFixture({ schedule: (callback) => queued.push(callback) })
    const contents = fixture.surface(1)

    const admitted = Array.from({ length: 8 }, () => fixture.service.handleSnapshot(invocation(contents), { version: 2 }))
    const excess = await fixture.service.handleSnapshot(invocation(contents), { version: 2 })
    while (queued.length > 0) queued.shift()?.()

    expect(excess).toEqual({ version: 2, status: 'error', code: 'BUSY' })
    expect((await Promise.all(admitted)).every((result) => result.status === 'ok')).toBe(true)
    expect(fixture.service.activeCursors).toBe(0)
  })
})
