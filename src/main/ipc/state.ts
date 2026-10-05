import {
  buildSnapshotPage,
  initialSnapshotPosition,
  serializeTaskRecord,
  serializeTrashRecord,
  type SerializedRecord,
  type SnapshotPosition,
  type SnapshotRecordSource,
} from '../../application/state/snapshot-paging.js'
import { formatRevision, type Revision } from '../../application/storage/revisions.js'
import type { StorageFailureReason } from '../../application/storage/task-storage-error.js'
import type { TaskStorageReader, UnitResult } from '../../application/storage/unit-of-work.js'
import {
  STATE_CHANGED_EVENT,
  STATE_LIMITS,
  STATE_UNAVAILABLE_EVENT,
  STATE_UNDO_INVALIDATED_EVENT,
  parseSnapshotPageRequest,
  parseStateRequest,
  parseUnsubscribeRequest,
  stateFailure,
  type SnapshotCollection,
  type SnapshotPage,
  type SnapshotPageResult,
  type StateChangedEvent,
  type StateErrorCode,
  type StateFailure,
  type StateUnavailableEvent,
  type SubscribeWireResult,
  type UndoInvalidatedEvent,
  type UndoInvalidationReason,
  type UnsubscribeStateResult,
} from '../../contracts/state.js'
import { utf8ByteLength } from '../../contracts/text.js'
import type { UnitOptions } from '../storage/coordinator.js'
import type { DocumentSessions, DocumentTicket, InvocationLike } from './document-sessions.js'

/** Reserva para o envelope da página (versão, status, revisão, época, cursor e inscrição). */
const PAGE_ENVELOPE_RESERVE_BYTES = 512
const RETIRED_SUBSCRIPTIONS = 16

/** Época transitória observável pelo IPC de estado (nunca vem do renderer). */
export interface UndoEpochSource {
  readonly epoch: number
  onInvalidated(listener: (event: { epoch: number; reason: UndoInvalidationReason }) => void): () => void
}

/** O que o IPC de estado usa do coordenador: leitura coordenada e notificações. */
export interface StateStorage {
  read<T>(reader: (reader: TaskStorageReader) => T, options?: UnitOptions): Promise<UnitResult<T>>
  onCommitted(listener: (revision: Revision) => void): () => void
  onUnavailable(listener: (reason: StorageFailureReason) => void): () => void
  cancelOwner(owner: string): number
}

export interface StateIpcOptions {
  sessions: DocumentSessions
  storage: StateStorage
  undo: UndoEpochSource
  /** Token opaco gerado pelo main (cursor e inscrição). */
  randomToken: () => string
  now?: () => number
  /** Agenda a entrega coalescida das invalidações. */
  schedule?: (callback: () => void) => void
}

interface SnapshotCursor {
  token: string
  revision: Revision
  undoEpoch: number
  position: SnapshotPosition
  expiresAt: number
}

/** Estado transitório de um documento: no máximo uma inscrição e um cursor ativo. */
interface DocumentState {
  ticket: DocumentTicket
  subscriptionId: string | undefined
  retired: string[]
  cursor: SnapshotCursor | undefined
  pendingRevision: Revision | undefined
  pendingEpoch: number | undefined
  pendingEpochReason: UndoInvalidationReason | undefined
}

type PageOutcome =
  | { kind: 'page'; page: SnapshotPage; subscriptionId: string | undefined }
  | { kind: 'error'; code: StateErrorCode }

/** Traduz razões internas para a união pública fechada; nenhum detalhe acompanha o código. */
export function stateErrorCodeFor(reason: StorageFailureReason): StateErrorCode {
  switch (reason) {
    case 'INCOMPATIBLE_DATA':
    case 'CORRUPTED_DATA':
      return reason
    case 'LOCKED':
    case 'QUEUE_FULL':
    case 'WAIT_TIMEOUT':
      return 'BUSY'
    case 'CLOSED':
    case 'SESSION_CLOSED':
      return 'SESSION_CLOSED'
    default:
      return 'STORAGE_UNAVAILABLE'
  }
}

function recordSource(reader: TaskStorageReader): SnapshotRecordSource {
  return {
    *records(collection: SnapshotCollection, afterId: string | undefined): Generator<SerializedRecord> {
      if (collection === 'tasks') {
        for (const stored of reader.iterateTasks(afterId)) yield serializeTaskRecord(stored)
      } else {
        for (const stored of reader.iterateTrash(afterId)) yield serializeTrashRecord(stored)
      }
    },
  }
}

/**
 * IPC de estado v1: somente leitura e subscriptions. Cada operação autoriza o remetente antes
 * de olhar o request, revalida a sessão antes de ler e antes de responder, e nunca devolve
 * erro de implementação: o resultado é sempre a união versionada de sucesso ou código.
 */
export class StateIpcService {
  readonly #sessions: DocumentSessions
  readonly #storage: StateStorage
  readonly #undo: UndoEpochSource
  readonly #randomToken: () => string
  readonly #now: () => number
  readonly #schedule: (callback: () => void) => void
  readonly #documents = new Map<string, DocumentState>()
  readonly #disposers: Array<() => void>
  #flushScheduled = false

  constructor(options: StateIpcOptions) {
    this.#sessions = options.sessions
    this.#storage = options.storage
    this.#undo = options.undo
    this.#randomToken = options.randomToken
    this.#now = options.now ?? (() => Date.now())
    this.#schedule = options.schedule ?? ((callback) => void setImmediate(callback))
    this.#disposers = [
      this.#sessions.onInvalidated((key) => this.#forget(key)),
      this.#storage.onCommitted((revision) => this.#queueInvalidation(revision)),
      this.#storage.onUnavailable((reason) => this.#announceUnavailable(reason)),
      this.#undo.onInvalidated((event) => this.#queueEpoch(event.epoch, event.reason)),
    ]
  }

  /** Documentos com estado transitório vivo (para verificação de limpeza). */
  get trackedDocuments(): number {
    return this.#documents.size
  }

  get activeSubscriptions(): number {
    return [...this.#documents.values()].filter((document) => document.subscriptionId !== undefined).length
  }

  get activeCursors(): number {
    return [...this.#documents.values()].filter((document) => document.cursor !== undefined).length
  }

  dispose(): void {
    for (const dispose of this.#disposers) dispose()
    this.#documents.clear()
  }

  async handleSnapshot(event: InvocationLike, request: unknown): Promise<SnapshotPageResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return stateFailure('UNAUTHORIZED')
      const parsed = parseSnapshotPageRequest(request)
      if (parsed === null) return stateFailure('INVALID_REQUEST')

      const outcome = await this.#page(ticket, parsed.cursor, false)
      if (outcome.kind === 'error') return stateFailure(outcome.code)
      return this.#withinBudget(ticket, { version: 3, status: 'ok', page: outcome.page })
    } catch {
      return stateFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleSubscribe(event: InvocationLike, request: unknown): Promise<SubscribeWireResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return stateFailure('UNAUTHORIZED')
      if (parseStateRequest(request) === null) return stateFailure('INVALID_REQUEST')

      const outcome = await this.#page(ticket, undefined, true)
      if (outcome.kind === 'error') return stateFailure(outcome.code)
      if (outcome.subscriptionId === undefined) return stateFailure('STORAGE_UNAVAILABLE')
      return this.#withinBudget(ticket, {
        version: 3,
        status: 'ok',
        subscriptionId: outcome.subscriptionId,
        page: outcome.page,
      })
    } catch {
      return stateFailure('STORAGE_UNAVAILABLE')
    }
  }

  handleUnsubscribe(event: InvocationLike, request: unknown): Promise<UnsubscribeStateResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return Promise.resolve(stateFailure('UNAUTHORIZED'))
      const parsed = parseUnsubscribeRequest(request)
      if (parsed === null) return Promise.resolve(stateFailure('INVALID_REQUEST'))

      const document = this.#documents.get(ticket.key)
      if (document?.subscriptionId === parsed.subscriptionId) {
        document.subscriptionId = undefined
        document.pendingRevision = undefined
        document.pendingEpoch = undefined
        document.pendingEpochReason = undefined
        document.retired = [...document.retired, parsed.subscriptionId].slice(-RETIRED_SUBSCRIPTIONS)
        return Promise.resolve({ version: 3, status: 'ok' })
      }
      // Repetição do próprio cancelamento é segura; token de outra sessão é recusado.
      if (document?.retired.includes(parsed.subscriptionId) === true) {
        return Promise.resolve({ version: 3, status: 'ok' })
      }
      return Promise.resolve(stateFailure('UNAUTHORIZED'))
    } catch {
      return Promise.resolve(stateFailure('STORAGE_UNAVAILABLE'))
    }
  }

  #documentFor(ticket: DocumentTicket): DocumentState {
    let document = this.#documents.get(ticket.key)
    if (document === undefined) {
      document = {
        ticket,
        subscriptionId: undefined,
        retired: [],
        cursor: undefined,
        pendingRevision: undefined,
        pendingEpoch: undefined,
        pendingEpochReason: undefined,
      }
      this.#documents.set(ticket.key, document)
    }
    return document
  }

  #forget(key: string): void {
    this.#documents.delete(key)
    this.#storage.cancelOwner(key)
  }

  /** Continuação válida da sessão, ou `undefined` (desconhecida, alheia ou expirada). */
  #activeCursor(document: DocumentState, token: string): SnapshotCursor | undefined {
    const cursor = document.cursor
    if (cursor === undefined || cursor.token !== token) return undefined
    if (this.#now() > cursor.expiresAt) {
      document.cursor = undefined
      return undefined
    }
    return cursor
  }

  async #page(ticket: DocumentTicket, cursorToken: string | undefined, subscribe: boolean): Promise<PageOutcome> {
    const document = this.#documentFor(ticket)
    // Cursor inválido é recusado aqui, antes de qualquer leitura.
    if (cursorToken !== undefined && this.#activeCursor(document, cursorToken) === undefined) {
      return { kind: 'error', code: 'SNAPSHOT_STALE' }
    }

    const result = await this.#storage.read(
      (reader): PageOutcome => {
        const current = this.#documents.get(ticket.key)
        if (current === undefined) return { kind: 'error', code: 'SESSION_CLOSED' }
        // Época capturada no mesmo turno coordenado da leitura: páginas pertencem ao par.
        const undoEpoch = this.#undo.epoch

        let position = initialSnapshotPosition()
        if (cursorToken !== undefined) {
          const cursor = this.#activeCursor(current, cursorToken)
          // Commit entre páginas: a continuação não vale mais e nada parcial é completado.
          if (cursor === undefined || cursor.revision !== reader.baseRevision || cursor.undoEpoch !== undoEpoch) {
            current.cursor = undefined
            return { kind: 'error', code: 'SNAPSHOT_STALE' }
          }
          position = cursor.position
        }
        current.cursor = undefined

        let built
        try {
          built = buildSnapshotPage(
            recordSource(reader),
            position,
            STATE_LIMITS.pageBytes - PAGE_ENVELOPE_RESERVE_BYTES,
          )
        } catch (error) {
          if (error instanceof RangeError) return { kind: 'error', code: 'RESOURCE_LIMIT' }
          throw error
        }

        // Inscrição, revisão/época base e primeira página saem do mesmo turno coordenado.
        if (subscribe && current.subscriptionId === undefined) current.subscriptionId = this.#randomToken()

        const revision = formatRevision(reader.baseRevision)
        if (built.complete !== undefined) {
          return {
            kind: 'page',
            page: { revision, undoEpoch, fragments: built.fragments, complete: built.complete },
            subscriptionId: current.subscriptionId,
          }
        }

        const token = this.#randomToken()
        current.cursor = {
          token,
          revision: reader.baseRevision,
          undoEpoch,
          position: built.position,
          expiresAt: this.#now() + STATE_LIMITS.cursorTtlMs,
        }
        return {
          kind: 'page',
          page: { revision, undoEpoch, fragments: built.fragments, cursor: token },
          subscriptionId: current.subscriptionId,
        }
      },
      { owner: ticket.key, admit: () => this.#sessions.isCurrent(ticket) },
    )

    // Resultado tardio: a autorização antiga não libera dados para outro documento.
    if (!this.#sessions.isCurrent(ticket)) return { kind: 'error', code: 'SESSION_CLOSED' }
    if (!result.ok) return { kind: 'error', code: stateErrorCodeFor(result.reason) }
    return result.value
  }

  /** Confere o orçamento real da resposta serializada; nunca trunca para caber. */
  #withinBudget<T extends SnapshotPageResult | SubscribeWireResult>(ticket: DocumentTicket, response: T): T | StateFailure {
    if (utf8ByteLength(JSON.stringify(response)) <= STATE_LIMITS.pageBytes) return response
    const document = this.#documents.get(ticket.key)
    if (document !== undefined) document.cursor = undefined
    return stateFailure('RESOURCE_LIMIT')
  }

  #queueInvalidation(revision: Revision): void {
    for (const document of this.#documents.values()) {
      if (document.subscriptionId === undefined) continue
      // Invalidações coalescem: só a maior revisão por inscrição interessa.
      if (document.pendingRevision === undefined || revision > document.pendingRevision) {
        document.pendingRevision = revision
      }
    }
    this.#scheduleFlush()
  }

  /** Barreira de época (inclusive UNCHANGED): não fabrica revisão SQL nem evento de alteração. */
  #queueEpoch(epoch: number, reason: UndoInvalidationReason): void {
    for (const document of this.#documents.values()) {
      if (document.subscriptionId === undefined) continue
      if (document.pendingEpoch === undefined || epoch > document.pendingEpoch) {
        document.pendingEpoch = epoch
        document.pendingEpochReason = reason
      }
    }
    this.#scheduleFlush()
  }

  #scheduleFlush(): void {
    if (this.#flushScheduled) return
    this.#flushScheduled = true
    this.#schedule(() => {
      this.#flushScheduled = false
      this.#flushInvalidations()
    })
  }

  #flushInvalidations(): void {
    const epoch = this.#undo.epoch
    for (const document of [...this.#documents.values()]) {
      const { subscriptionId, pendingRevision, pendingEpoch, pendingEpochReason } = document
      document.pendingRevision = undefined
      document.pendingEpoch = undefined
      document.pendingEpochReason = undefined
      if (subscriptionId === undefined) continue

      // A barreira transitória precede a alteração; a época real acompanha o evento v3.
      if (pendingEpoch !== undefined && pendingEpochReason !== undefined) {
        this.#send(document, STATE_UNDO_INVALIDATED_EVENT, {
          version: 1,
          subscriptionId,
          undoEpoch: pendingEpoch,
          reason: pendingEpochReason,
        })
      }
      if (pendingRevision !== undefined) {
        this.#send(document, STATE_CHANGED_EVENT, {
          version: 3,
          subscriptionId,
          revision: formatRevision(pendingRevision),
          undoEpoch: epoch,
        })
      }
    }
  }

  #announceUnavailable(reason: StorageFailureReason): void {
    for (const document of [...this.#documents.values()]) {
      if (document.subscriptionId === undefined) continue
      const event: StateUnavailableEvent = {
        version: 3,
        subscriptionId: document.subscriptionId,
        code: stateErrorCodeFor(reason),
      }
      this.#send(document, STATE_UNAVAILABLE_EVENT, event)
    }
  }

  /** Guard de envio: só o documento corrente da sessão recebe; evento acima de 1 KiB não sai. */
  #send(
    document: DocumentState,
    channel: string,
    event: StateChangedEvent | StateUnavailableEvent | UndoInvalidatedEvent,
  ): void {
    const frame = this.#sessions.currentFrame(document.ticket)
    if (frame === null) {
      this.#forget(document.ticket.key)
      return
    }
    if (utf8ByteLength(JSON.stringify(event)) > STATE_LIMITS.eventBytes) return
    try {
      frame.send(channel, event)
    } catch {
      // Transporte invalidado: o cliente reconcilia por snapshot quando voltar.
    }
  }
}
