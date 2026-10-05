import {
  STATE_CHANGED_EVENT,
  STATE_LIMITS,
  STATE_SNAPSHOT_CHANNEL,
  STATE_SUBSCRIBE_CHANNEL,
  STATE_UNAVAILABLE_EVENT,
  STATE_UNDO_INVALIDATED_EVENT,
  STATE_UNSUBSCRIBE_CHANNEL,
  parseSnapshotPageResult,
  parseStateChangedEvent,
  parseStateRequest,
  parseStateUnavailableEvent,
  parseSubscribeWireResult,
  parseUndoInvalidatedEvent,
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
  type UndoInvalidationReason,
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

interface BufferedChanged {
  revision: bigint
  epoch: number
}

interface BufferedEpoch {
  epoch: number
  reason: UndoInvalidationReason
}

/** Quantas inscrições desconhecidas ficam em buffer durante o handshake. */
const HANDSHAKE_BUFFER_LIMIT = 4

/**
 * Lado do documento do contrato de estado: reúne páginas, bufferiza invalidações durante o
 * handshake, nunca regride de revisão/época e ressincroniza por snapshot. Eventos são apenas
 * invalidações; nenhuma escrita é repetida. A época do undo é coalescida separadamente da revisão
 * SQL: UNCHANGED (revisão igual) ainda limpa ofertas e dispara ressincronização.
 */
export function createStateClient(transport: StateTransport, environment: StateClientEnvironment): StateClient {
  let lastSnapshot: StateSnapshot | undefined
  let lastRevision: bigint | undefined
  let lastEpoch: number | undefined
  let stale = false
  let subscriptionId: string | undefined
  let pendingRevision: bigint | undefined
  let resyncQueued = false
  let disposed = false
  let chain: Promise<unknown> = Promise.resolve()
  let reconcileTimer: unknown
  let removeFocus: (() => void) | undefined
  const listeners = new Set<StateListener>()
  const handshakeChanged = new Map<string, BufferedChanged>()
  const handshakeEpoch = new Map<string, BufferedEpoch>()
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

  /** Época maior (ou primeira conhecida) avança a barreira; igual/anterior é ignorada. */
  function applyEpoch(epoch: number, reason: UndoInvalidationReason): boolean {
    if (!stale && lastEpoch !== undefined && epoch <= lastEpoch) return false
    lastEpoch = epoch
    notify({ type: 'undo-invalidated', undoEpoch: epoch, reason })
    return true
  }

  /** Publica o snapshot sem regredir; devolve o estado completo vigente. */
  function adopt(snapshot: StateSnapshot): StateSnapshot {
    const revision = BigInt(snapshot.revision)
    if (lastRevision !== undefined && lastSnapshot !== undefined) {
      const olderRevision = revision < lastRevision
      const olderEpoch = lastEpoch !== undefined && snapshot.undoEpoch < lastEpoch
      if (olderRevision && olderEpoch) return lastSnapshot
    }

    const changed =
      lastRevision === undefined ||
      revision > lastRevision ||
      lastEpoch === undefined ||
      snapshot.undoEpoch > lastEpoch ||
      stale
    lastSnapshot = snapshot
    lastRevision = revision
    if (lastEpoch === undefined || snapshot.undoEpoch > lastEpoch) {
      // Adoção de época maior também limpa ofertas, mesmo quando a revisão SQL é igual.
      applyEpoch(snapshot.undoEpoch, 'BACKUP_RESTORED')
      lastEpoch = snapshot.undoEpoch
    }
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
          const result = parseSnapshotPageResult(await invoke(STATE_SNAPSHOT_CHANNEL, { version: 3 }))
          if (result === null) return { ok: false, code: 'STORAGE_UNAVAILABLE' }
          if (result.status === 'error') return { ok: false, code: result.code }
          page = result.page
        }

        const snapshot = assembler.accept(page)
        if (snapshot !== undefined) return { ok: true, snapshot }

        const result = parseSnapshotPageResult(
          await invoke(STATE_SNAPSHOT_CHANNEL, { version: 3, cursor: page.cursor }),
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
      if (buffered === undefined || revision > buffered.revision) {
        remember(handshakeChanged, event.subscriptionId, { revision, epoch: event.undoEpoch })
      }
      return
    }
    if (event.subscriptionId !== subscriptionId) return
    // Época maior é barreira mesmo quando a revisão SQL é igual (no-op/UNCHANGED).
    if (lastEpoch !== undefined && event.undoEpoch > lastEpoch) {
      applyEpoch(event.undoEpoch, 'BACKUP_RESTORED')
      scheduleResync()
    }
    applyChanged(revision)
  })

  const removeUndoInvalidated = transport.on(STATE_UNDO_INVALIDATED_EVENT, (payload) => {
    const event = parseUndoInvalidatedEvent(payload)
    if (event === null || disposed) return
    if (subscriptionId === undefined) {
      remember(handshakeEpoch, event.subscriptionId, { epoch: event.undoEpoch, reason: event.reason })
      return
    }
    if (event.subscriptionId !== subscriptionId) return
    if (lastEpoch !== undefined && event.undoEpoch <= lastEpoch) return
    applyEpoch(event.undoEpoch, event.reason)
    // Época mudou sem evento SQL: reconcilia para adotar o snapshot (mesma revisão se for o caso).
    scheduleResync()
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
    handshakeEpoch.clear()
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
        return result.ok ? { version: 3, status: 'ok', snapshot: result.snapshot } : failure(result.code)
      })
    },

    subscribeState(request: unknown, listener?: unknown): Promise<SubscribeStateResult> {
      if (parseStateRequest(request) === null || (listener !== undefined && typeof listener !== 'function')) {
        return Promise.resolve(failure('INVALID_REQUEST'))
      }

      return serialize(async () => {
        const wire = parseSubscribeWireResult(await invoke(STATE_SUBSCRIBE_CHANNEL, { version: 3 }))
        if (wire === null) return failure('STORAGE_UNAVAILABLE')
        if (wire.status === 'error') return failure(wire.code)

        subscriptionId = wire.subscriptionId
        if (listener !== undefined) listeners.add(listener as StateListener)

        // Invalidações que chegaram antes da resposta: maior revisão e maior época, separadas.
        const bufferedChanged = handshakeChanged.get(wire.subscriptionId)
        const bufferedEpoch = handshakeEpoch.get(wire.subscriptionId)
        const unavailable = handshakeUnavailable.get(wire.subscriptionId)
        handshakeChanged.clear()
        handshakeEpoch.clear()
        handshakeUnavailable.clear()
        if (
          bufferedChanged !== undefined &&
          (pendingRevision === undefined || bufferedChanged.revision > pendingRevision)
        ) {
          pendingRevision = bufferedChanged.revision
        }

        const result = await runCycle(wire.page)
        if (!result.ok) {
          const id = wire.subscriptionId
          clearSubscription()
          await invoke(STATE_UNSUBSCRIBE_CHANNEL, { version: 3, subscriptionId: id })
          return failure(result.code)
        }

        startReconciliation()
        if (unavailable !== undefined) markStale(unavailable)
        // Época perdida durante o handshake é aplicada depois do snapshot adotado.
        if (bufferedEpoch !== undefined && (lastEpoch === undefined || bufferedEpoch.epoch > lastEpoch)) {
          applyEpoch(bufferedEpoch.epoch, bufferedEpoch.reason)
          scheduleResync()
        }
        if (pendingRevision !== undefined && lastRevision !== undefined && pendingRevision > lastRevision) {
          scheduleResync()
        }
        return { version: 3, status: 'ok', subscriptionId: wire.subscriptionId, snapshot: result.snapshot }
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
      removeUndoInvalidated()
      removeUnavailable()
    },
  }
}
