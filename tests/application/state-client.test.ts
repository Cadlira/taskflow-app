import { describe, expect, it } from 'vitest'
import {
  buildSnapshotPage,
  initialSnapshotPosition,
  serializeTaskRecord,
  type SerializedRecord,
  type SnapshotPosition,
} from '../../src/application/state/snapshot-paging.js'
import { createStateClient, type StateClient } from '../../src/application/state/state-client.js'
import {
  STATE_CHANGED_EVENT,
  STATE_SNAPSHOT_CHANNEL,
  STATE_SUBSCRIBE_CHANNEL,
  STATE_UNAVAILABLE_EVENT,
  STATE_UNSUBSCRIBE_CHANNEL,
  stateFailure,
  type SnapshotCollection,
  type StateErrorCode,
  type StateUpdate,
} from '../../src/contracts/state.js'
import type { Task } from '../../src/domain/task.js'
import { buildFictitiousTasks } from '../../src/main/harness/fixtures.js'

const SUBSCRIPTION = 'S'.repeat(32)
const PAGE_BUDGET = 3 * 1024

/**
 * Main fictício: mesma paginação do produto, com ganchos para intercalar commits, erros e
 * eventos em pontos determinísticos (sem sleeps).
 */
class FakeMain {
  revision = 5n
  tasks: Task[] = buildFictitiousTasks(6, { descriptionLength: 900 })
  invocations: Array<{ channel: string; request: unknown }> = []
  listeners = new Map<string, Array<(payload: unknown) => void>>()
  /** Chamado antes de responder cada invoke; pode alterar o estado ou devolver uma resposta. */
  intercept: ((channel: string, request: unknown, count: number) => unknown) | undefined
  #cursor: { token: string; revision: bigint; position: SnapshotPosition } | undefined
  #tokens = 0
  subscribed = false

  readonly transport = {
    invoke: async (channel: string, request: unknown): Promise<unknown> => {
      this.invocations.push({ channel, request })
      const intercepted = this.intercept?.(channel, request, this.invocations.length)
      if (intercepted !== undefined) return intercepted
      return this.#respond(channel, request)
    },
    on: (channel: string, listener: (payload: unknown) => void): (() => void) => {
      const list = this.listeners.get(channel) ?? []
      list.push(listener)
      this.listeners.set(channel, list)
      return () => list.splice(list.indexOf(listener), 1)
    },
  }

  commit(): bigint {
    this.revision += 1n
    this.tasks = this.tasks.map((task) => ({ ...task, title: `${task.title} r${this.revision}` }))
    return this.revision
  }

  emitChanged(revision: bigint, subscriptionId = SUBSCRIPTION): void {
    for (const listener of this.listeners.get(STATE_CHANGED_EVENT) ?? []) {
      listener({ version: 2, subscriptionId, revision: revision.toString() })
    }
  }

  emitUnavailable(code: StateErrorCode): void {
    for (const listener of this.listeners.get(STATE_UNAVAILABLE_EVENT) ?? []) {
      listener({ version: 2, subscriptionId: SUBSCRIPTION, code })
    }
  }

  count(channel: string): number {
    return this.invocations.filter((invocation) => invocation.channel === channel).length
  }

  #respond(channel: string, request: unknown): unknown {
    if (channel === STATE_UNSUBSCRIBE_CHANNEL) {
      this.subscribed = false
      return { version: 2, status: 'ok' }
    }

    const cursor = (request as { cursor?: string }).cursor
    let position = initialSnapshotPosition()
    if (cursor !== undefined) {
      if (this.#cursor === undefined || this.#cursor.token !== cursor || this.#cursor.revision !== this.revision) {
        this.#cursor = undefined
        return stateFailure('SNAPSHOT_STALE')
      }
      position = this.#cursor.position
    }

    const tasks = this.tasks
    const built = buildSnapshotPage(
      {
        *records(collection: SnapshotCollection, afterId: string | undefined): Generator<SerializedRecord> {
          if (collection !== 'tasks') return
          for (const task of tasks) {
            if (afterId === undefined || task.id > afterId) yield serializeTaskRecord({ task, contentRevision: 1n, editRevision: 1n })
          }
        },
      },
      position,
      PAGE_BUDGET,
    )

    const revision = this.revision.toString()
    let page
    if (built.complete === undefined) {
      this.#tokens += 1
      const token = `cursor-${String(this.#tokens).padStart(24, '0')}`
      this.#cursor = { token, revision: this.revision, position: built.position }
      page = { revision, fragments: built.fragments, cursor: token }
    } else {
      this.#cursor = undefined
      page = { revision, fragments: built.fragments, complete: built.complete }
    }

    if (channel === STATE_SUBSCRIBE_CHANNEL) {
      this.subscribed = true
      return { version: 2, status: 'ok', subscriptionId: SUBSCRIPTION, page }
    }
    return { version: 2, status: 'ok', page }
  }
}

interface Harness {
  main: FakeMain
  client: StateClient
  updates: StateUpdate[]
  listener: (update: StateUpdate) => void
  tick: () => void
  focus: () => void
  timers: number
  settle: () => Promise<void>
}

function createHarness(): Harness {
  const main = new FakeMain()
  const intervals = new Map<number, () => void>()
  const focusListeners = new Set<() => void>()
  let nextTimer = 1
  const client = createStateClient(main.transport, {
    setInterval: (callback) => {
      intervals.set(nextTimer, callback)
      return nextTimer++
    },
    clearInterval: (handle) => void intervals.delete(handle as number),
    onFocus: (callback) => {
      focusListeners.add(callback)
      return () => focusListeners.delete(callback)
    },
  })
  const updates: StateUpdate[] = []
  return {
    main,
    client,
    updates,
    listener: (update) => updates.push(update),
    tick: () => intervals.forEach((callback) => callback()),
    focus: () => focusListeners.forEach((callback) => callback()),
    get timers() {
      return intervals.size
    },
    // Aguarda a fila serializada do cliente esvaziar (promessas apenas, sem relógio).
    settle: async () => {
      for (let turn = 0; turn < 200; turn += 1) await Promise.resolve()
    },
  }
}

function snapshotRevisions(updates: StateUpdate[]): string[] {
  return updates.flatMap((update) => (update.type === 'snapshot' ? [update.snapshot.revision] : []))
}

describe('getStateSnapshot', () => {
  it('reúne todas as páginas numa única revisão, com as duas revisões em cada registro', async () => {
    const { main, client } = createHarness()
    const result = await client.getStateSnapshot({ version: 2 })

    if (result.status !== 'ok') throw new Error(result.code)
    expect(main.count(STATE_SNAPSHOT_CHANNEL)).toBeGreaterThan(1)
    expect(result.snapshot.revision).toBe('5')
    expect(result.snapshot.tasks.map((record) => record.task)).toEqual(main.tasks)
    expect(result.snapshot.tasks.every((record) => record.contentRevision === '1' && record.editRevision === '1')).toBe(true)
    expect(main.invocations.every((invocation) => (invocation.request as { version: number }).version === 2)).toBe(true)
  })

  it('commit entre páginas: descarta a montagem parcial e reconstrói, sem snapshot misto', async () => {
    const { main, client } = createHarness()
    main.intercept = (_channel, request, count) => {
      // Commit logo antes da primeira continuação.
      if (count === 2 && (request as { cursor?: string }).cursor !== undefined) main.commit()
      return undefined
    }
    const result = await client.getStateSnapshot({ version: 2 })

    if (result.status !== 'ok') throw new Error(result.code)
    expect(result.snapshot.revision).toBe('6')
    expect(result.snapshot.tasks.every((record) => record.task.title.endsWith('r6'))).toBe(true)
  })

  it('escritas contínuas: após três reconstruções devolve BUSY e conserva o último snapshot completo', async () => {
    const harness = createHarness()
    const { main, client } = harness
    const subscribed = await client.subscribeState({ version: 2 }, harness.listener)
    if (subscribed.status !== 'ok') throw new Error(subscribed.code)
    const before = main.count(STATE_SNAPSHOT_CHANNEL)

    main.intercept = (_channel, request) => {
      if ((request as { cursor?: string }).cursor !== undefined) main.commit()
      return undefined
    }
    const busy = await client.getStateSnapshot({ version: 2 })

    expect(busy).toEqual({ version: 2, status: 'error', code: 'BUSY' })
    // Três primeiras páginas e três continuações recusadas: sem loop.
    expect(main.count(STATE_SNAPSHOT_CHANNEL) - before).toBe(6)
    expect(harness.updates.at(-1)).toEqual({ type: 'stale', code: 'BUSY' })
    expect(snapshotRevisions(harness.updates)).toEqual(['5'])

    // Novo ciclo numa solicitação posterior, quando o churn para.
    main.intercept = undefined
    const recovered = await client.getStateSnapshot({ version: 2 })
    expect(recovered.status === 'ok' && recovered.snapshot.revision).toBe(main.revision.toString())
    expect(snapshotRevisions(harness.updates).at(-1)).toBe(main.revision.toString())
  })

  it('request inválido (inclusive v1) é recusado sem usar o transporte', async () => {
    const { main, client } = createHarness()
    for (const request of [{ version: 1 }, { version: 3 }, { version: 2, extra: true }, null, { version: 2, cursor: 'x'.repeat(32) }]) {
      expect(await client.getStateSnapshot(request)).toEqual({ version: 2, status: 'error', code: 'INVALID_REQUEST' })
    }
    expect(await client.subscribeState({ version: 1 }, 'callback')).toEqual({ version: 2, status: 'error', code: 'INVALID_REQUEST' })
    expect(await client.unsubscribeState({ version: 1, subscriptionId: '../x' })).toEqual({
      version: 2,
      status: 'error',
      code: 'INVALID_REQUEST',
    })
    expect(await client.unsubscribeState({ version: 2, subscriptionId: '../x' })).toEqual({
      version: 2,
      status: 'error',
      code: 'INVALID_REQUEST',
    })
    expect(main.invocations).toEqual([])
  })

  it('erro do main e transporte rejeitado viram código seguro, nunca coleção vazia', async () => {
    const { main, client } = createHarness()
    main.intercept = () => stateFailure('CORRUPTED_DATA')
    expect(await client.getStateSnapshot({ version: 2 })).toEqual({ version: 2, status: 'error', code: 'CORRUPTED_DATA' })

    main.intercept = () => {
      throw new Error('C:\\Users\\x\\taskflow.sqlite: SQLITE_IOERR')
    }
    const rejected = await client.getStateSnapshot({ version: 2 })
    expect(rejected).toEqual({ version: 2, status: 'error', code: 'STORAGE_UNAVAILABLE' })
    expect(JSON.stringify(rejected)).not.toContain('sqlite')
  })

  it.each([
    ['resposta sem envelope', { tasks: [] }],
    ['erro com stack', { version: 2, status: 'error', code: 'BUSY', stack: 'Error at C:\\x' }],
    ['erro v1 antigo', { version: 1, status: 'error', code: 'BUSY' }],
    ['instância de Error', new Error('boom')],
    ['página com tarefa sem editRevision', {
      version: 2,
      status: 'ok',
      page: { revision: '5', fragments: [{ collection: 'tasks', data: '{"task":{"id":"a"},"contentRevision":"1"}', final: true }], complete: { tasks: 1, trash: 0 } },
    }],
    ['indefinido', undefined],
  ])('saída malformada do main (%s) é recusada sem expor detalhes', async (_label, response) => {
    const { main, client } = createHarness()
    main.intercept = () => response ?? null
    expect(await client.getStateSnapshot({ version: 2 })).toEqual({ version: 2, status: 'error', code: 'STORAGE_UNAVAILABLE' })
  })

  it('montagens do mesmo documento são serializadas', async () => {
    const { main, client } = createHarness()
    let active = 0
    let maxActive = 0
    main.intercept = (_channel, request) => {
      if ((request as { cursor?: string }).cursor === undefined) active += 1
      maxActive = Math.max(maxActive, active)
      return undefined
    }
    const results = await Promise.all([
      client.getStateSnapshot({ version: 2 }).finally(() => (active -= 1)),
      client.getStateSnapshot({ version: 2 }).finally(() => (active -= 1)),
      client.getStateSnapshot({ version: 2 }).finally(() => (active -= 1)),
    ])

    expect(results.every((result) => result.status === 'ok')).toBe(true)
    expect(maxActive).toBe(1)
  })
})

describe('subscribeState', () => {
  it('instala um listener fixo por canal antes de qualquer pedido e não o multiplica', async () => {
    const harness = createHarness()
    const { main, client } = harness

    expect(main.invocations).toEqual([])
    expect(main.listeners.get(STATE_CHANGED_EVENT)).toHaveLength(1)
    expect(main.listeners.get(STATE_UNAVAILABLE_EVENT)).toHaveLength(1)

    const first = await client.subscribeState({ version: 2 }, harness.listener)
    const second = await client.subscribeState({ version: 2 }, harness.listener)
    expect(first.status === 'ok' && second.status === 'ok' && first.subscriptionId === second.subscriptionId).toBe(true)
    expect(main.listeners.get(STATE_CHANGED_EVENT)).toHaveLength(1)
    expect(harness.timers).toBe(1)

    main.emitChanged(main.commit())
    await harness.settle()
    // Um callback local, uma entrega por snapshot novo.
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6'])
  })

  it('o callback local nunca é enviado ao main', async () => {
    const harness = createHarness()
    await harness.client.subscribeState({ version: 2 }, harness.listener)

    expect(harness.main.invocations[0]).toEqual({ channel: STATE_SUBSCRIBE_CHANNEL, request: { version: 2 } })
    for (const invocation of harness.main.invocations) {
      expect(JSON.stringify(invocation.request)).not.toContain('listener')
      expect(Object.values(invocation.request as object).some((value) => typeof value === 'function')).toBe(false)
    }
  })

  it('commit durante o handshake: a invalidação bufferizada vence a resposta antiga', async () => {
    const harness = createHarness()
    const { main, client } = harness
    main.intercept = (channel) => {
      if (channel === STATE_SUBSCRIBE_CHANNEL && main.revision === 5n) {
        // O evento do commit chega antes da resposta do subscribe.
        const response = { version: 2, status: 'ok', subscriptionId: SUBSCRIPTION, page: { revision: '5', fragments: [], complete: { tasks: 0, trash: 0 } } }
        main.emitChanged(main.commit())
        return response
      }
      return undefined
    }

    const subscribed = await client.subscribeState({ version: 2 }, harness.listener)
    await harness.settle()

    expect(subscribed.status === 'ok' && subscribed.snapshot.revision).toBe('5')
    // O estado publicado nunca regride e converge para a revisão do evento.
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6'])
  })

  it('commit durante a montagem das páginas iniciais: ressincroniza antes de publicar', async () => {
    const harness = createHarness()
    const { main, client } = harness
    main.intercept = (_channel, request, count) => {
      if (count === 2 && (request as { cursor?: string }).cursor !== undefined) main.emitChanged(main.commit())
      return undefined
    }

    const subscribed = await client.subscribeState({ version: 2 }, harness.listener)
    await harness.settle()

    expect(subscribed.status === 'ok' && subscribed.snapshot.revision).toBe('6')
    expect(snapshotRevisions(harness.updates)).toEqual(['6'])
  })

  it('resposta antiga depois de evento não substitui o estado novo', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)
    main.emitChanged(main.commit())
    await harness.settle()

    // Uma resposta atrasada, de revisão anterior, chega depois.
    main.intercept = () => ({ version: 2, status: 'ok', page: { revision: '5', fragments: [], complete: { tasks: 0, trash: 0 } } })
    const late = await client.getStateSnapshot({ version: 2 })

    expect(late.status === 'ok' && late.snapshot.revision).toBe('6')
    expect(late.status === 'ok' && late.snapshot.tasks).toHaveLength(6)
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6'])
  })

  it('múltiplos commits coalescem: só a maior revisão orienta a ressincronização', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)
    const before = main.count(STATE_SNAPSHOT_CHANNEL)

    main.emitChanged(main.commit())
    main.emitChanged(main.commit())
    main.emitChanged(main.commit())
    await harness.settle()

    expect(snapshotRevisions(harness.updates)).toEqual(['5', '8'])
    // Um único ciclo (primeira página + continuações), não um por evento.
    expect(main.count(STATE_SNAPSHOT_CHANNEL) - before).toBeLessThanOrEqual(8)
  })

  it('eventos antigos, de versão errada, repetidos ou de outra inscrição não regridem nem disparam leitura', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)
    main.emitChanged(main.commit())
    await harness.settle()
    const invocations = main.invocations.length

    main.emitChanged(6n)
    main.emitChanged(4n)
    main.emitChanged(5n)
    main.emitChanged(99n, 'X'.repeat(32))
    for (const listener of main.listeners.get(STATE_CHANGED_EVENT) ?? []) {
      listener({ version: 1, subscriptionId: SUBSCRIPTION, revision: '7' })
      listener({ version: 3, subscriptionId: SUBSCRIPTION, revision: '7' })
      listener({ version: 2, subscriptionId: SUBSCRIPTION, revision: '7', tasks: [{ id: 'patch' }] })
      listener('state changed')
    }
    await harness.settle()

    expect(main.invocations.length).toBe(invocations)
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6'])
  })

  it('salto de revisão ressincroniza por snapshot, sem inferir patches', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)
    main.commit()
    main.commit()
    main.commit()
    main.emitChanged(main.revision)
    await harness.settle()

    expect(snapshotRevisions(harness.updates)).toEqual(['5', '8'])
  })

  it('evento perdido sem salto: reconciliação a cada 30 s e no foco obtém o snapshot atual', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)

    main.commit()
    harness.tick()
    await harness.settle()
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6'])

    main.commit()
    harness.focus()
    await harness.settle()
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6', '7'])

    // Sem mudança, a reconciliação não publica de novo.
    harness.tick()
    await harness.settle()
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6', '7'])
  })

  it('indisponibilidade marca o último snapshot como stale e a volta ressincroniza', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)

    main.emitUnavailable('STORAGE_UNAVAILABLE')
    expect(harness.updates.at(-1)).toEqual({ type: 'stale', code: 'STORAGE_UNAVAILABLE' })

    // O reopen republica a mesma revisão: com estado stale, a invalidação ressincroniza.
    main.emitChanged(main.revision)
    await harness.settle()
    expect(harness.updates.map((update) => update.type)).toEqual(['snapshot', 'stale', 'snapshot'])
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '5'])
  })

  it('erro durante a ressincronização conserva o último snapshot e reporta o código', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)

    main.intercept = () => stateFailure('STORAGE_UNAVAILABLE')
    main.emitChanged(main.commit())
    await harness.settle()
    expect(harness.updates.at(-1)).toEqual({ type: 'stale', code: 'STORAGE_UNAVAILABLE' })
    expect(snapshotRevisions(harness.updates)).toEqual(['5'])

    main.intercept = undefined
    harness.tick()
    await harness.settle()
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6'])
  })

  it('falha na inscrição não deixa listener, timer ou inscrição pendurados', async () => {
    const harness = createHarness()
    const { main, client } = harness
    main.intercept = (channel, request) => {
      if (channel === STATE_SNAPSHOT_CHANNEL && (request as { cursor?: string }).cursor !== undefined) {
        return stateFailure('CORRUPTED_DATA')
      }
      return undefined
    }

    const result = await client.subscribeState({ version: 2 }, harness.listener)

    expect(result).toEqual({ version: 2, status: 'error', code: 'CORRUPTED_DATA' })
    expect(main.count(STATE_UNSUBSCRIBE_CHANNEL)).toBe(1)
    expect(main.subscribed).toBe(false)
    expect(harness.timers).toBe(0)
  })
})

describe('unsubscribeState e limpeza', () => {
  it('cancelamento próprio é idempotente e encerra reconciliação e entregas', async () => {
    const harness = createHarness()
    const { main, client } = harness
    const subscribed = await client.subscribeState({ version: 2 }, harness.listener)
    if (subscribed.status !== 'ok') throw new Error(subscribed.code)
    const request = { version: 2, subscriptionId: subscribed.subscriptionId }

    expect(await client.unsubscribeState(request)).toEqual({ version: 2, status: 'ok' })
    expect(await client.unsubscribeState(request)).toEqual({ version: 2, status: 'ok' })
    expect(harness.timers).toBe(0)

    const invocations = main.invocations.length
    main.emitChanged(main.commit())
    harness.tick()
    harness.focus()
    await harness.settle()
    expect(main.invocations.length).toBe(invocations)
    expect(snapshotRevisions(harness.updates)).toEqual(['5'])
  })

  it('recusa do main (token de outra sessão) não encerra a inscrição própria', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)
    main.intercept = (channel) => (channel === STATE_UNSUBSCRIBE_CHANNEL ? stateFailure('UNAUTHORIZED') : undefined)

    expect(await client.unsubscribeState({ version: 2, subscriptionId: 'O'.repeat(32) })).toEqual({
      version: 2,
      status: 'error',
      code: 'UNAUTHORIZED',
    })
    main.intercept = undefined
    main.emitChanged(main.commit())
    await harness.settle()
    expect(snapshotRevisions(harness.updates)).toEqual(['5', '6'])
  })

  it('dispose remove os listeners fixos e ignora eventos posteriores', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, harness.listener)

    client.dispose()
    expect(main.listeners.get(STATE_CHANGED_EVENT)).toHaveLength(0)
    expect(main.listeners.get(STATE_UNAVAILABLE_EVENT)).toHaveLength(0)
    expect(harness.timers).toBe(0)
  })

  it('falha de um callback local não afeta o estado nem os demais', async () => {
    const harness = createHarness()
    const { main, client } = harness
    await client.subscribeState({ version: 2 }, () => {
      throw new Error('fixture: callback failed')
    })
    await client.subscribeState({ version: 2 }, harness.listener)

    main.emitChanged(main.commit())
    await harness.settle()
    expect(snapshotRevisions(harness.updates).at(-1)).toBe('6')
  })
})
