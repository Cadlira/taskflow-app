import type { ConfirmationBase, UndoRegistry } from '../../application/undo/undo-registry.js'
import { formatRevision, type Revision } from '../../application/storage/revisions.js'
import type { StorageFailureReason } from '../../application/storage/task-storage-error.js'
import type { TaskStorageReader, TaskStorageUnit, TrashEntryRef, UnitResult } from '../../application/storage/unit-of-work.js'
import {
  deleteTrashItemInUnit,
  emptyTrashInUnit,
  moveTaskToTrashInUnit,
  prepareTrashViewInUnit,
  restoreTrashItemInUnit,
  undoLastTaskActionInUnit,
  type TrashDeleteOutcome,
  type TrashMoveOutcome,
  type TrashRestoreOutcome,
  type UndoOutcome,
} from '../../application/tasks/trash-commands.js'
import type { ReservedUndo, UndoFacts, UndoReservationPort } from '../../application/tasks/undo-types.js'
import {
  fitsTrashResponseBudget,
  parseClearUndoOfferRequest,
  parseDeleteTrashItemRequest,
  parseEmptyTrashRequest,
  parseMoveTaskToTrashRequest,
  parsePrepareTrashConfirmationRequest,
  parsePrepareTrashViewRequest,
  parseRestoreTrashItemRequest,
  parseUndoLastTaskActionRequest,
  trashFailure,
  trashMoveFailure,
  type ClearUndoOfferResult,
  type DeleteTrashItemResult,
  type EmptyTrashResult,
  type MoveTaskToTrashResult,
  type PrepareTrashConfirmationResult,
  type PrepareTrashViewResult,
  type RestoreTrashItemResult,
  type TrashErrorCode,
  type TrashFailure,
  type UndoLastTaskActionResult,
} from '../../contracts/trash.js'
import type { UnitOptions } from '../storage/coordinator.js'
import type { DocumentTicket, InvocationLike } from './document-sessions.js'

/** O que o IPC da lixeira usa da autorização: admissão e revalidação por ticket. */
export interface TrashCommandSessions {
  authorize(event: InvocationLike): DocumentTicket | null
  isCurrent(ticket: DocumentTicket): boolean
}

/** O que o IPC da lixeira usa do coordenador: uma unidade de escrita e uma leitura coordenada. */
export interface TrashCommandStorage {
  run<T>(unit: (unit: TaskStorageUnit) => T, options?: UnitOptions): Promise<UnitResult<T>>
  read<T>(reader: (reader: TaskStorageReader) => T, options?: UnitOptions): Promise<UnitResult<T>>
}

export interface TrashCommandIpcOptions {
  sessions: TrashCommandSessions
  storage: TrashCommandStorage
  /** Relógio injetado da composição; lido dentro da unidade, nunca vem do renderer. */
  clock: () => Date
  /** Registro temporário de recibos/confirmações/contexto por documento. */
  undo: UndoRegistry
}

/** Traduz razões internas para a união pública fechada; nenhum detalhe acompanha o código. */
export function trashErrorCodeFor(reason: StorageFailureReason): TrashErrorCode {
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
    case 'REVISION_EXHAUSTED':
      return 'RESOURCE_LIMIT'
    default:
      return 'STORAGE_UNAVAILABLE'
  }
}

interface PrepareOutcome {
  base: ConfirmationBase
  revision: Revision
  itemCount: number
  hasRecurrence?: boolean
}

type PrepareReadResult =
  | { status: 'OK'; value: PrepareOutcome }
  | { status: 'NOT_FOUND' }
  | { status: 'NOT_IN_TRASH' }
  | { status: 'ENTRY_CHANGED' }
  | { status: 'CONFLICT' }

/** Resultado de unidade que pode ter sido cancelado por troca de contexto antes de executar. */
type WithStale<T> = T | { status: 'STALE_CONTEXT' }

/**
 * IPC dos oito wrappers v1 de contexto/confirmação/lixeira/undo: autoriza o remetente antes de
 * olhar o request, valida schema/bytes antes de qualquer leitura, exige o contexto estabelecido
 * próprio na admissão e na execução, consome cada token uma vez e publica a oferta de desfazer
 * somente depois do commit, com sessão/contexto válidos. Nenhuma Task/before-image atravessa.
 */
export class TrashCommandIpcService {
  readonly #sessions: TrashCommandSessions
  readonly #storage: TrashCommandStorage
  readonly #clock: () => Date
  readonly #undo: UndoRegistry

  constructor(options: TrashCommandIpcOptions) {
    this.#sessions = options.sessions
    this.#storage = options.storage
    this.#clock = options.clock
    this.#undo = options.undo
  }

  async handleClearUndoOffer(event: InvocationLike, request: unknown): Promise<ClearUndoOfferResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return trashFailure('UNAUTHORIZED')
      const parsed = parseClearUndoOfferRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      if (!this.#sessions.isCurrent(ticket)) return trashFailure('SESSION_CLOSED')

      const cleared = this.#undo.clear(ticket.key, parsed.contextSequence)
      if (cleared.status === 'STALE_CONTEXT') return trashFailure('STALE_CONTEXT')
      return this.#budget({ version: 1, status: 'ok', contextSequence: parsed.contextSequence })
    } catch {
      return trashFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handlePrepareConfirmation(
    event: InvocationLike,
    request: unknown,
  ): Promise<PrepareTrashConfirmationResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return trashFailure('UNAUTHORIZED')
      const parsed = parsePrepareTrashConfirmationRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      if (!this.#hasContext(ticket, parsed.contextSequence)) return trashFailure('STALE_CONTEXT')

      const result = await this.#storage.read(
        (reader): PrepareReadResult => {
          const revision = reader.baseRevision
          if (parsed.kind === 'MOVE') {
            const stored = reader.getTask(parsed.taskId)
            if (stored === undefined) return { status: 'NOT_FOUND' }
            if (stored.contentRevision !== BigInt(parsed.expectedContentRevision)) return { status: 'CONFLICT' }
            return {
              status: 'OK',
              value: {
                base: {
                  kind: 'MOVE',
                  taskId: parsed.taskId,
                  expectedContentRevision: stored.contentRevision,
                },
                revision,
                itemCount: 1,
                hasRecurrence: stored.task.recurrence !== undefined,
              },
            }
          }
          if (parsed.kind === 'PERMANENT') {
            const item = reader.getTrashItem(parsed.entry.taskId)
            if (item === undefined) return { status: 'NOT_IN_TRASH' }
            if (
              item.contentRevision !== BigInt(parsed.entry.contentRevision) ||
              item.deletedAt !== parsed.entry.deletedAt
            ) {
              return { status: 'ENTRY_CHANGED' }
            }
            const entry: TrashEntryRef = {
              taskId: item.task.id,
              contentRevision: item.contentRevision,
              deletedAt: item.deletedAt,
            }
            return {
              status: 'OK',
              value: { base: { kind: 'PERMANENT', entry }, revision, itemCount: 1 },
            }
          }
          const entries: TrashEntryRef[] = reader.listTrash().map((item) => ({
            taskId: item.task.id,
            contentRevision: item.contentRevision,
            deletedAt: item.deletedAt,
          }))
          return {
            status: 'OK',
            value: { base: { kind: 'EMPTY', entries }, revision, itemCount: entries.length },
          }
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return trashFailure('SESSION_CLOSED')
      if (!result.ok) return trashFailure(trashErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'NOT_FOUND') return trashFailure('NOT_FOUND')
      if (outcome.status === 'NOT_IN_TRASH') return trashFailure('NOT_IN_TRASH')
      if (outcome.status === 'ENTRY_CHANGED') return trashFailure('ENTRY_CHANGED')
      if (outcome.status === 'CONFLICT') return trashFailure('CONFLICT')

      // Contexto pode ter mudado durante a leitura: não publica token de base antiga.
      if (!this.#hasContext(ticket, parsed.contextSequence)) return trashFailure('STALE_CONTEXT')
      const confirmation = this.#undo.setConfirmation(ticket.key, parsed.contextSequence, outcome.value.base)
      if (confirmation === undefined) {
        return trashFailure(this.#hasContext(ticket, parsed.contextSequence) ? 'RESOURCE_LIMIT' : 'STALE_CONTEXT')
      }

      return this.#budget({
        version: 1,
        status: 'ok',
        confirmationToken: confirmation.token,
        revision: formatRevision(outcome.value.revision),
        itemCount: outcome.value.itemCount,
        ...(outcome.value.hasRecurrence !== undefined && { hasRecurrence: outcome.value.hasRecurrence }),
      })
    } catch {
      return trashFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleMove(event: InvocationLike, request: unknown): Promise<MoveTaskToTrashResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return trashMoveFailure('UNAUTHORIZED')
      const parsed = parseMoveTaskToTrashRequest(request)
      if (parsed === null) return trashMoveFailure('INVALID_REQUEST')
      if (!this.#hasContext(ticket, parsed.contextSequence)) return trashMoveFailure('STALE_CONTEXT')

      const base = this.#consumeConfirmation(ticket, parsed.confirmationToken)
      if (base === undefined || base.kind !== 'MOVE') return trashMoveFailure('CONFIRMATION_INVALID')

      const reservation = this.#reservationPort(ticket, parsed.contextSequence)
      let result: UnitResult<WithStale<TrashMoveOutcome>>
      try {
        result = await this.#storage.run(
          (unit) => {
            if (!this.#hasContext(ticket, parsed.contextSequence)) return { status: 'STALE_CONTEXT' } as const
            return moveTaskToTrashInUnit(unit, {
              taskId: base.taskId,
              expectedContentRevision: base.expectedContentRevision,
              now: this.#clock(),
              reservations: reservation.port,
            })
          },
          this.#options(ticket),
        )
      } catch {
        reservation.releasePending()
        return trashMoveFailure('STORAGE_UNAVAILABLE')
      }
      if (!result.ok) {
        reservation.releasePending()
        if (!this.#sessions.isCurrent(ticket)) return trashMoveFailure('SESSION_CLOSED')
        return trashMoveFailure(trashErrorCodeFor(result.reason))
      }
      if (!this.#sessions.isCurrent(ticket)) {
        reservation.releasePending()
        return trashMoveFailure('SESSION_CLOSED')
      }

      const outcome = result.value
      if (outcome.status === 'MOVED') {
        // Época lida antes de publicar: o ack descreve a época sob a qual a oferta pôde existir.
        const undoEpoch = this.#undo.epoch
        let undoToken: string | undefined
        if (outcome.retained && outcome.undo !== undefined && outcome.reserved !== undefined && result.committed) {
          undoToken = this.#publishUndo(ticket, parsed.contextSequence, outcome.reserved, outcome.undo)
        }
        reservation.releasePending()
        const ack = {
          version: 2 as const,
          status: 'ok' as const,
          revision: formatRevision(result.revision),
          retained: outcome.retained,
          undoEpoch,
          ...(undoToken !== undefined && { undoToken }),
        }
        return fitsTrashResponseBudget(ack) ? ack : trashMoveFailure('RESOURCE_LIMIT')
      }
      reservation.releasePending()
      return this.#moveFailure(outcome)
    } catch {
      return trashMoveFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleRestore(event: InvocationLike, request: unknown): Promise<RestoreTrashItemResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return trashFailure('UNAUTHORIZED')
      const parsed = parseRestoreTrashItemRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      if (!this.#hasContext(ticket, parsed.contextSequence)) return trashFailure('STALE_CONTEXT')

      const result = await this.#storage.run(
        (unit) => {
          if (!this.#hasContext(ticket, parsed.contextSequence)) return { status: 'STALE_CONTEXT' } as const
          return restoreTrashItemInUnit(unit, {
            entry: {
              taskId: parsed.entry.taskId,
              contentRevision: BigInt(parsed.entry.contentRevision),
              deletedAt: parsed.entry.deletedAt,
            },
            now: this.#clock(),
          })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return trashFailure('SESSION_CLOSED')
      if (!result.ok) return trashFailure(trashErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'RESTORED') {
        return this.#budget({
          version: 1,
          status: 'ok',
          revision: formatRevision(result.revision),
          contentRevision: formatRevision(outcome.contentRevision),
          editRevision: formatRevision(outcome.editRevision),
        })
      }
      return this.#restoreFailure(outcome)
    } catch {
      return trashFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleDelete(event: InvocationLike, request: unknown): Promise<DeleteTrashItemResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return trashFailure('UNAUTHORIZED')
      const parsed = parseDeleteTrashItemRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      if (!this.#hasContext(ticket, parsed.contextSequence)) return trashFailure('STALE_CONTEXT')

      const base = this.#consumeConfirmation(ticket, parsed.confirmationToken)
      if (base === undefined || base.kind !== 'PERMANENT') return trashFailure('CONFIRMATION_INVALID')

      const result = await this.#storage.run(
        (unit) => {
          if (!this.#hasContext(ticket, parsed.contextSequence)) return { status: 'STALE_CONTEXT' } as const
          return deleteTrashItemInUnit(unit, { entry: base.entry })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return trashFailure('SESSION_CLOSED')
      if (!result.ok) return trashFailure(trashErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'DELETED') {
        return this.#budget({ version: 1, status: 'ok', revision: formatRevision(result.revision) })
      }
      return this.#deleteFailure(outcome)
    } catch {
      return trashFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleEmpty(event: InvocationLike, request: unknown): Promise<EmptyTrashResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return trashFailure('UNAUTHORIZED')
      const parsed = parseEmptyTrashRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      if (!this.#hasContext(ticket, parsed.contextSequence)) return trashFailure('STALE_CONTEXT')

      const base = this.#consumeConfirmation(ticket, parsed.confirmationToken)
      if (base === undefined || base.kind !== 'EMPTY') return trashFailure('CONFIRMATION_INVALID')

      const result = await this.#storage.run(
        (unit) => {
          if (!this.#hasContext(ticket, parsed.contextSequence)) return { status: 'STALE_CONTEXT' } as const
          return emptyTrashInUnit(unit, { captured: base.entries })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return trashFailure('SESSION_CLOSED')
      if (!result.ok) return trashFailure(trashErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'EMPTIED') {
        return this.#budget({
          version: 1,
          status: 'ok',
          revision: formatRevision(result.revision),
          removedCount: outcome.removedCount,
        })
      }
      return this.#emptyFailure()
    } catch {
      return trashFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handlePrepareView(event: InvocationLike, request: unknown): Promise<PrepareTrashViewResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return trashFailure('UNAUTHORIZED')
      const parsed = parsePrepareTrashViewRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      if (!this.#hasContext(ticket, parsed.contextSequence)) return trashFailure('STALE_CONTEXT')

      const result = await this.#storage.run(
        (unit) => {
          if (!this.#hasContext(ticket, parsed.contextSequence)) return { status: 'STALE_CONTEXT' } as const
          return prepareTrashViewInUnit(unit, { now: this.#clock() })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return trashFailure('SESSION_CLOSED')
      if (!result.ok) return trashFailure(trashErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'STALE_CONTEXT') return trashFailure('STALE_CONTEXT')
      return this.#budget({
        version: 1,
        status: 'ok',
        revision: formatRevision(result.revision),
        purgedCount: outcome.purgedCount,
      })
    } catch {
      return trashFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleUndo(event: InvocationLike, request: unknown): Promise<UndoLastTaskActionResult> {
    try {
      const ticket = this.#sessions.authorize(event)
if (ticket === null || ticket.role !== 'MANAGER') return trashFailure('UNAUTHORIZED')
      const parsed = parseUndoLastTaskActionRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      if (!this.#hasContext(ticket, parsed.contextSequence)) return trashFailure('STALE_CONTEXT')

      // Tentativa válida consome o token uma vez, mesmo se a aplicação recusar/falhar depois.
      const receipt = this.#undo.consumeOffer(ticket.key, parsed.contextSequence, parsed.undoToken)
      if (receipt === undefined) return trashFailure('UNDO_NOT_AVAILABLE')

      const result = await this.#storage.run(
        (unit) => {
          if (!this.#hasContext(ticket, parsed.contextSequence)) return { status: 'STALE_CONTEXT' } as const
          return undoLastTaskActionInUnit(unit, { receipt, now: this.#clock() })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return trashFailure('SESSION_CLOSED')
      if (!result.ok) return trashFailure(trashErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'RESTORED' || outcome.status === 'REVERTED') {
        return this.#budget({
          version: 1,
          status: 'ok',
          revision: formatRevision(result.revision),
          contentRevision: formatRevision(outcome.contentRevision),
          editRevision: formatRevision(outcome.editRevision),
        })
      }
      return this.#undoFailure(outcome)
    } catch {
      return trashFailure('STORAGE_UNAVAILABLE')
    }
  }

  #hasContext(ticket: DocumentTicket, sequence: number): boolean {
    return this.#undo.contextSequence(ticket.key) === sequence
  }

  #options(ticket: DocumentTicket): UnitOptions {
    return { owner: ticket.key, admit: () => this.#sessions.isCurrent(ticket) }
  }

  /** Token próprio tomado uma vez; errado/alheio/repetido devolve `undefined`. */
  #consumeConfirmation(ticket: DocumentTicket, token: string): ConfirmationBase | undefined {
    return this.#undo.consumeConfirmation(ticket.key, token)
  }

  #reservationPort(ticket: DocumentTicket, sequence: number): {
    port: UndoReservationPort
    releasePending: () => void
  } {
    let pending: ReservedUndo | undefined
    const port: UndoReservationPort = {
      reserve: (facts) => {
        const result = this.#undo.reserve(ticket.key, sequence, facts)
        if (result.status !== 'ok') return undefined
        pending = result.reservation
        return result.reservation
      },
      release: (reservation) => {
        this.#undo.release(reservation)
        if (pending?.id === reservation.id) pending = undefined
      },
    }
    return {
      port,
      releasePending: () => {
        if (pending !== undefined) this.#undo.release(pending)
        pending = undefined
      },
    }
  }

  #publishUndo(
    ticket: DocumentTicket,
    sequence: number,
    reserved: ReservedUndo,
    facts: UndoFacts,
  ): string | undefined {
    if (!this.#sessions.isCurrent(ticket) || !this.#hasContext(ticket, sequence)) {
      this.#undo.release(reserved)
      return undefined
    }
    return this.#undo.publish(reserved, facts) ?? undefined
  }

  #moveFailure(outcome: Exclude<WithStale<TrashMoveOutcome>, { status: 'MOVED' }>): MoveTaskToTrashResult {
    switch (outcome.status) {
      case 'NOT_FOUND':
        return trashMoveFailure('NOT_FOUND')
      case 'CHANGED':
        return trashMoveFailure('CONFIRMATION_CHANGED')
      case 'RESOURCE_LIMIT':
        return trashMoveFailure('RESOURCE_LIMIT')
      case 'STALE_CONTEXT':
        return trashMoveFailure('STALE_CONTEXT')
    }
  }

  #restoreFailure(
    outcome: Exclude<WithStale<TrashRestoreOutcome>, { status: 'RESTORED' }>,
  ): RestoreTrashItemResult {
    switch (outcome.status) {
      case 'NOT_IN_TRASH':
        return trashFailure('NOT_IN_TRASH')
      case 'ENTRY_CHANGED':
        return trashFailure('ENTRY_CHANGED')
      case 'ENTRY_EXPIRED':
        return trashFailure('ENTRY_EXPIRED')
      case 'ID_EXISTS':
        return trashFailure('ID_EXISTS')
      case 'SERIES_CONFLICT':
        return trashFailure('SERIES_CONFLICT')
      case 'STALE_CONTEXT':
        return trashFailure('STALE_CONTEXT')
    }
  }

  #deleteFailure(
    outcome: Exclude<WithStale<TrashDeleteOutcome>, { status: 'DELETED' }>,
  ): DeleteTrashItemResult {
    switch (outcome.status) {
      case 'NOT_IN_TRASH':
        return trashFailure('NOT_IN_TRASH')
      case 'ENTRY_CHANGED':
        return trashFailure('ENTRY_CHANGED')
      case 'STALE_CONTEXT':
        return trashFailure('STALE_CONTEXT')
    }
  }

  #emptyFailure(): EmptyTrashResult {
    return trashFailure('CONFIRMATION_CHANGED')
  }

  #undoFailure(
    outcome: Exclude<WithStale<UndoOutcome>, { status: 'RESTORED' | 'REVERTED' }>,
  ): UndoLastTaskActionResult {
    switch (outcome.status) {
      case 'NOT_IN_TRASH':
        return trashFailure('NOT_IN_TRASH')
      case 'ENTRY_CHANGED':
        return trashFailure('ENTRY_CHANGED')
      case 'ENTRY_EXPIRED':
        return trashFailure('ENTRY_EXPIRED')
      case 'ID_EXISTS':
        return trashFailure('ID_EXISTS')
      case 'SERIES_CONFLICT':
        return trashFailure('SERIES_CONFLICT')
      case 'REMOVED':
        return trashFailure('REMOVED')
      case 'CHANGED':
        return trashFailure('CHANGED')
      case 'GENERATED_CHANGED':
        return trashFailure('GENERATED_CHANGED')
      case 'STALE_CONTEXT':
        return trashFailure('STALE_CONTEXT')
    }
  }

  /** Nunca trunca para caber: resposta acima do orçamento vira RESOURCE_LIMIT. */
  #budget<T extends
    | ClearUndoOfferResult
    | PrepareTrashConfirmationResult
    | MoveTaskToTrashResult
    | RestoreTrashItemResult
    | DeleteTrashItemResult
    | EmptyTrashResult
    | PrepareTrashViewResult
    | UndoLastTaskActionResult>(response: T): T | TrashFailure {
    return fitsTrashResponseBudget(response) ? response : trashFailure('RESOURCE_LIMIT')
  }
}
