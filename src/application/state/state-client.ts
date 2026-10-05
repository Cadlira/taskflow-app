import {
  STATE_CHANGED_EVENT,
  STATE_LIMITS,
  STATE_SNAPSHOT_CHANNEL,
  STATE_SUBSCRIBE_CHANNEL,
  STATE_UNAVAILABLE_EVENT,
  STATE_UNSUBSCRIBE_CHANNEL,
  parseSnapshotPageResult,
  parseStateChangedEvent,
  parseStateRequest,
  parseStateUnavailableEvent,
  parseSubscribeWireResult,
  parseUnsubscribeRequest,
  parseUnsubscribeResult,
  stateFailure,
  type SnapshotPage,
  type StateErrorCode,
  type StateFailure,
  type StateListener,
  type StateSnapshot,
  type StateSnapshotResult,
  type StateUpdate,
  type SubscribeStateResult,
  type UnsubscribeStateResult,
} from '../../contracts/state.js'
import { MalformedSnapshotError, SnapshotAssembler } from './snapshot-assembler.js'

/** Transporte fechado: só os canais do catálogo de estado passam por aqui. */
export interface StateTransport {
  invoke(channel: string, request: unknown): Promise<unknown>
  /** Registra o listener fixo do canal de evento e devolve sua remoção. */
  on(channel: string, listener: (payload: unknown) => void): () => void
}

export interface StateClientEnvironment {
  setInterval(callback: () => void, milliseconds: number): unknown
  clearInterval(handle: unknown): void
  /** Notifica quando a superfície retoma o foco; devolve a remoção. */
  onFocus(callback: () => void): () => void
}

export interface StateClient {
  getStateSnapshot(request: unknown): Promise<StateSnapshotResult>
  subscribeState(request: unknown, listener?: unknown): Promise<SubscribeStateResult>
  unsubscribeState(request: unknown): Promise<UnsubscribeStateResult>
  dispose(): void
}

type Assembly = { ok: true; snapshot: StateSnapshot } | { ok: false; code: StateErrorCode }

/** Quantas inscrições desconhecidas ficam em buffer durante o handshake. */
const HANDSHAKE_BUFFER_LIMIT = 4

/**
 * Lado do documento do contrato de estado: reúne páginas, bufferiza invalidações durante o
 * handshake, nunca regride de revisão e ressincroniza por snapshot. Eventos são apenas
 * invalidações; nenhuma escrita é repetida. Montagens são serializadas por documento.
 */
export function createStateClient(transport: StateTransport, environment: StateClientEnvironment): StateClient {
  let lastSnapshot: StateSnapshot | undefined
  let lastRevision: bigint | undefined
  let stale = false
  let subscriptionId: string | undefined
  let pendingRevision: bigint | undefined
  let resyncQueued = false
  let disposed = false
  let chain: Promise<unknown> = Promise.resolve()
  let reconcileTimer: unknown
  let removeFocus: (() => void) | undefined
  const listeners = new Set<StateListener>()
  const handshakeChanged = new Map<string, bigint>()
  const handshakeUnavailable = new Map<string, StateErrorCode>()

  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work, work)
    chain = run.catch(() => undefined)
    return run
  }

  function notify(update: StateUpdate): void {
    for (const listener of [...listeners]) {
      try {
        listener(update)
      } catch {
        // Falha de um callback local não afeta o estado nem os demais callbacks.
      }
    }
  }

  function markStale(code: StateErrorCode): void {
    stale = true
    if (subscriptionId !== undefined) notify({ type: 'stale', code })
  }

  /** Publica o snapshot sem regredir; devolve o estado completo vigente. */
  function adopt(snapshot: StateSnapshot): StateSnapshot {
    const revision = BigInt(snapshot.revision)
    if (lastRevision !== undefined && lastSnapshot !== undefined && revision < lastRevision) {
      return lastSnapshot
    }

    const changed = lastRevision === undefined || revision > lastRevision || stale
    lastSnapshot = snapshot
    lastRevision = revision
    stale = false
    if (pendingRevision !== undefined && pendingRevision <= revision) pendingRevision = undefined
    if (changed && subscriptionId !== undefined) notify({ type: 'snapshot', snapshot })
    return snapshot
  }

  async function invoke(channel: string, request: unknown): Promise<unknown> {
    try {
      return await transport.invoke(channel, request)
    } catch {
      // Transporte invalidado: sem detalhes do erro remoto; quem chamou ressincroniza.
      return undefined
    }
  }

  async function assemble(initialPage?: SnapshotPage): Promise<Assembly> {
    const assembler = new SnapshotAssembler()
    let page = initialPage

    try {
      for (;;) {
        if (page === undefined) {
          const result = parseSnapshotPageResult(await invoke(STATE_SNAPSHOT_CHANNEL, { version: 2 }))
          if (result === null) return { ok: false, code: 'STORAGE_UNAVAILABLE' }
          if (result.status === 'error') return { ok: false, code: result.code }
          page = result.page
        }

        const snapshot = assembler.accept(page)
        if (snapshot !== undefined) return { ok: true, snapshot }

        const result = parseSnapshotPageResult(
          await invoke(STATE_SNAPSHOT_CHANNEL, { version: 2, cursor: page.cursor }),
        )
        if (result === null) return { ok: false, code: 'STORAGE_UNAVAILABLE' }
        if (result.status === 'error') return { ok: false, code: result.code }
        page = result.page
      }
    } catch (error) {
      if (error instanceof MalformedSnapshotError) return { ok: false, code: 'STORAGE_UNAVAILABLE' }
      return { ok: false, code: error instanceof RangeError ? 'RESOURCE_LIMIT' : 'STORAGE_UNAVAILABLE' }
    }
  }

  /** Um ciclo: no máximo três reconstruções imediatas; depois `BUSY`, conservando o estado stale. */
  async function runCycle(initialPage?: SnapshotPage): Promise<Assembly> {
    let page = initialPage
    for (let attempt = 0; attempt < STATE_LIMITS.immediateRebuilds; attempt += 1) {
      const result = await assemble(page)
      page = undefined
      if (result.ok) return { ok: true, snapshot: adopt(result.snapshot) }
      if (result.code !== 'SNAPSHOT_STALE') {
        markStale(result.code)
        return result
      }
    }
    markStale('BUSY')
    return { ok: false, code: 'BUSY' }
  }

  function scheduleResync(): void {
    if (disposed || subscriptionId === undefined || resyncQueued) return
    resyncQueued = true
    void serialize(async () => {
      resyncQueued = false
      if (disposed || subscriptionId === undefined) return
      await runCycle()
      if (pendingRevision !== undefined && lastRevision !== undefined && pendingRevision > lastRevision) {
        scheduleResync()
      }
    })
  }

  function applyChanged(revision: bigint): void {
    // Revisão antiga ou repetida é ignorada; com estado stale, qualquer invalidação ressincroniza.
    if (!stale && lastRevision !== undefined && revision <= lastRevision) return
    if (pendingRevision === undefined || revision > pendingRevision) pendingRevision = revision
    scheduleResync()
  }

  function remember<T>(buffer: Map<string, T>, key: string, value: T): void {
    if (!buffer.has(key) && buffer.size >= HANDSHAKE_BUFFER_LIMIT) return
    buffer.set(key, value)
  }

  // Listeners fixos, instalados antes de qualquer subscribe: um por canal por documento.
  const removeChanged = transport.on(STATE_CHANGED_EVENT, (payload) => {
    const event = parseStateChangedEvent(payload)
    if (event === null || disposed) return
    const revision = BigInt(event.revision)
    if (subscriptionId === undefined) {
      const buffered = handshakeChanged.get(event.subscriptionId)
      if (buffered === undefined || revision > buffered) remember(handshakeChanged, event.subscriptionId, revision)
      return
    }
    if (event.subscriptionId === subscriptionId) applyChanged(revision)
  })

  const removeUnavailable = transport.on(STATE_UNAVAILABLE_EVENT, (payload) => {
    const event = parseStateUnavailableEvent(payload)
    if (event === null || disposed) return
    if (subscriptionId === undefined) {
      remember(handshakeUnavailable, event.subscriptionId, event.code)
      return
    }
    if (event.subscriptionId === subscriptionId) markStale(event.code)
  })

  function stopReconciliation(): void {
    if (reconcileTimer !== undefined) environment.clearInterval(reconcileTimer)
    reconcileTimer = undefined
    removeFocus?.()
    removeFocus = undefined
  }

  function startReconciliation(): void {
    if (reconcileTimer !== undefined) return
    // Um evento pode se perder sem salto visível: reconcilia a cada 30 s e ao retomar o foco.
    reconcileTimer = environment.setInterval(scheduleResync, STATE_LIMITS.reconcileIntervalMs)
    removeFocus = environment.onFocus(scheduleResync)
  }

  function clearSubscription(): void {
    subscriptionId = undefined
    pendingRevision = undefined
    listeners.clear()
    handshakeChanged.clear()
    handshakeUnavailable.clear()
    stopReconciliation()
  }

  function failure(code: StateErrorCode): StateFailure {
    return stateFailure(code)
  }

  return {
    getStateSnapshot(request: unknown): Promise<StateSnapshotResult> {
      if (parseStateRequest(request) === null) return Promise.resolve(failure('INVALID_REQUEST'))
      return serialize(async () => {
        const result = await runCycle()
        return result.ok ? { version: 2, status: 'ok', snapshot: result.snapshot } : failure(result.code)
      })
    },

    subscribeState(request: unknown, listener?: unknown): Promise<SubscribeStateResult> {
      if (parseStateRequest(request) === null || (listener !== undefined && typeof listener !== 'function')) {
        return Promise.resolve(failure('INVALID_REQUEST'))
      }

      return serialize(async () => {
        const wire = parseSubscribeWireResult(await invoke(STATE_SUBSCRIBE_CHANNEL, { version: 2 }))
        if (wire === null) return failure('STORAGE_UNAVAILABLE')
        if (wire.status === 'error') return failure(wire.code)

        subscriptionId = wire.subscriptionId
        if (listener !== undefined) listeners.add(listener as StateListener)

        // Invalidações que chegaram antes da resposta: só a maior revisão interessa.
        const buffered = handshakeChanged.get(wire.subscriptionId)
        const unavailable = handshakeUnavailable.get(wire.subscriptionId)
        handshakeChanged.clear()
        handshakeUnavailable.clear()
        if (buffered !== undefined && (pendingRevision === undefined || buffered > pendingRevision)) {
          pendingRevision = buffered
        }

        const result = await runCycle(wire.page)
        if (!result.ok) {
          const id = wire.subscriptionId
          clearSubscription()
          await invoke(STATE_UNSUBSCRIBE_CHANNEL, { version: 2, subscriptionId: id })
          return failure(result.code)
        }

        startReconciliation()
        if (unavailable !== undefined) markStale(unavailable)
        if (pendingRevision !== undefined && lastRevision !== undefined && pendingRevision > lastRevision) {
          scheduleResync()
        }
        return { version: 2, status: 'ok', subscriptionId: wire.subscriptionId, snapshot: result.snapshot }
      })
    },

    unsubscribeState(request: unknown): Promise<UnsubscribeStateResult> {
      const parsed = parseUnsubscribeRequest(request)
      if (parsed === null) return Promise.resolve(failure('INVALID_REQUEST'))

      return serialize(async () => {
        const result = parseUnsubscribeResult(await invoke(STATE_UNSUBSCRIBE_CHANNEL, parsed))
        if (result === null) return failure('STORAGE_UNAVAILABLE')
        if (result.status === 'ok' && parsed.subscriptionId === subscriptionId) clearSubscription()
        return result
      })
    },

    dispose(): void {
      disposed = true
      clearSubscription()
      removeChanged()
      removeUnavailable()
    },
  }
}
