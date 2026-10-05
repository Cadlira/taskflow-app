import type { UndoRegistry } from '../../application/undo/undo-registry.js'
import { formatRevision, type Revision } from '../../application/storage/revisions.js'
import type { StorageFailureReason } from '../../application/storage/task-storage-error.js'
import type { TaskStorageReader, TaskStorageUnit, UnitResult } from '../../application/storage/unit-of-work.js'
import {
  changeTaskStatusInUnit,
  createTaskInUnit,
  setSubtaskDoneInUnit,
  updateTaskInUnit,
  type MutationTaskOutcome,
  type SubtaskDoneOutcome,
} from '../../application/tasks/task-commands.js'
import type { ReservedUndo, UndoFacts, UndoReservationPort } from '../../application/tasks/undo-types.js'
import { validateSourceUrlForOpen } from '../../application/tasks/source-url.js'
import {
  fitsResponseBudget,
  parseSubtaskDoneRequest,
  parseTaskCreateRequest,
  parseTaskOpenSourceRequest,
  parseTaskStatusRequest,
  parseTaskUpdateRequest,
  taskCheckFailure,
  taskCreateFailure,
  taskMutationFailure,
  taskSourceFailure,
  type TaskCheckAck,
  type TaskCheckFailure,
  type TaskCheckResult,
  type TaskCreateAck,
  type TaskCreateResult,
  type TaskMutationAck,
  type TaskMutationErrorCode,
  type TaskMutationFailure,
  type TaskMutationResult,
  type TaskOpenSourceResult,
  type TaskSourceErrorCode,
} from '../../contracts/tasks.js'
import type { UnitOptions } from '../storage/coordinator.js'
import type { DocumentTicket, InvocationLike } from './document-sessions.js'

/** O que o IPC de comandos usa da autorização: admissão e revalidação por ticket. */
export interface TaskCommandSessions {
  authorize(event: InvocationLike): DocumentTicket | null
  isCurrent(ticket: DocumentTicket): boolean
}

/** O que o IPC de comandos usa do coordenador: uma unidade de escrita e uma leitura coordenada. */
export interface TaskCommandStorage {
  run<T>(unit: (unit: TaskStorageUnit) => T, options?: UnitOptions): Promise<UnitResult<T>>
  read<T>(reader: (reader: TaskStorageReader) => T, options?: UnitOptions): Promise<UnitResult<T>>
}

export interface TaskCommandIpcOptions {
  sessions: TaskCommandSessions
  storage: TaskCommandStorage
  /** Relógio injetado da composição; nunca vem do renderer. */
  clock: () => Date
  /** Gerador de identidade injetado da composição; colisões nunca sobrescrevem. */
  generateId: () => string
  /** Porta de abertura externa do main; só recebe href já validado. */
  opener: { openExternal(href: string): Promise<void> }
  /** Registro temporário de recibos/contexto por documento. */
  undo: UndoRegistry
}

/**
 * Códigos de armazenamento comuns às mutações e à origem: razões internas traduzidas para a
 * união pública fechada; nenhum detalhe acompanha o código.
 */
export type TaskStorageErrorCode = TaskMutationErrorCode & TaskSourceErrorCode

export function taskErrorCodeFor(reason: StorageFailureReason): TaskStorageErrorCode {
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

type SourceReadOutcome =
  | { status: 'OK'; sourceUrl: string; revision: Revision }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT'; currentRevision: Revision }
  | { status: 'SOURCE_NOT_AVAILABLE' }

/**
 * IPC dos cinco comandos v3: autoriza o remetente antes de olhar o request, valida schema e bytes
 * antes de qualquer leitura, exige o contexto estabelecido próprio na admissão e na execução,
 * decide dentro da unidade coordenada e nunca devolve erro de implementação. O recibo de undo é
 * reservado antes da escrita e publicado somente depois do commit, com sessão/contexto válidos.
 * `openTaskSource` conserva v1.
 */
export class TaskCommandIpcService {
  readonly #sessions: TaskCommandSessions
  readonly #storage: TaskCommandStorage
  readonly #clock: () => Date
  readonly #generateId: () => string
  readonly #opener: { openExternal(href: string): Promise<void> }
  readonly #undo: UndoRegistry

  constructor(options: TaskCommandIpcOptions) {
    this.#sessions = options.sessions
    this.#storage = options.storage
    this.#clock = options.clock
    this.#generateId = options.generateId
    this.#opener = options.opener
    this.#undo = options.undo
  }

  async handleCreate(event: InvocationLike, request: unknown): Promise<TaskCreateResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskCreateFailure('UNAUTHORIZED')

      const parsed = parseTaskCreateRequest(request)
      if (parsed.kind === 'invalid-request') return taskCreateFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') {
        return { ...taskCreateFailure('VALIDATION_FAILED'), fields: parsed.fields }
      }
      const { contextSequence, draft } = parsed.value
      if (!this.#hasContext(ticket, contextSequence)) return taskCreateFailure('STALE_CONTEXT')

      const result = await this.#storage.run(
        (unit) => {
          if (!this.#hasContext(ticket, contextSequence)) return { status: 'STALE_CONTEXT' } as const
          return createTaskInUnit(unit, { draft, now: this.#clock(), generateId: this.#generateId })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskCreateFailure('SESSION_CLOSED')
      if (!result.ok) return taskCreateFailure(taskErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'STALE_CONTEXT') return taskCreateFailure('STALE_CONTEXT')
      if (outcome.status === 'VALIDATION_FAILED') {
        return { ...taskCreateFailure('VALIDATION_FAILED'), fields: outcome.fields }
      }
      if (outcome.status === 'IDENTITY_CONFLICT') return taskCreateFailure('IDENTITY_CONFLICT')

      const ack: TaskCreateAck = {
        version: 3,
        status: 'ok',
        outcome: 'APPLIED',
        taskId: outcome.taskId,
        revision: formatRevision(result.revision),
        contentRevision: formatRevision(outcome.contentRevision),
        editRevision: formatRevision(outcome.editRevision),
      }
      return fitsResponseBudget(ack) ? ack : taskCreateFailure('RESOURCE_LIMIT')
    } catch {
      return taskCreateFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleUpdate(event: InvocationLike, request: unknown): Promise<TaskMutationResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskMutationFailure('UNAUTHORIZED')

      const parsed = parseTaskUpdateRequest(request)
      if (parsed.kind === 'invalid-request') return taskMutationFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') {
        return { ...taskMutationFailure('VALIDATION_FAILED'), fields: parsed.fields }
      }
      const { contextSequence, taskId, expectedEditRevision, patch, cancellation } = parsed.value
      if (!this.#hasContext(ticket, contextSequence)) return taskMutationFailure('STALE_CONTEXT')

      const reservation = this.#reservationPort(ticket, contextSequence)
      let result: UnitResult<MutationTaskOutcome>
      try {
        result = await this.#storage.run(
          (unit) => {
            if (!this.#hasContext(ticket, contextSequence)) return { status: 'STALE_CONTEXT' }
            return updateTaskInUnit(unit, {
              taskId,
              expectedEditRevision: BigInt(expectedEditRevision),
              patch,
              ...(cancellation !== undefined && { cancellation }),
              now: this.#clock(),
              generateId: this.#generateId,
              reservations: reservation.port,
            })
          },
          this.#options(ticket),
        )
      } catch {
        reservation.releasePending()
        return taskMutationFailure('STORAGE_UNAVAILABLE')
      }
      if (!result.ok) {
        reservation.releasePending()
        if (!this.#sessions.isCurrent(ticket)) return taskMutationFailure('SESSION_CLOSED')
        return taskMutationFailure(taskErrorCodeFor(result.reason))
      }
      if (!this.#sessions.isCurrent(ticket)) {
        reservation.releasePending()
        return taskMutationFailure('SESSION_CLOSED')
      }
      return this.#mutationResponse(result, ticket, contextSequence, reservation.releasePending)
    } catch {
      return taskMutationFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleStatus(event: InvocationLike, request: unknown): Promise<TaskMutationResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskMutationFailure('UNAUTHORIZED')

      const parsed = parseTaskStatusRequest(request)
      if (parsed.kind === 'invalid-request') return taskMutationFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') {
        return { ...taskMutationFailure('VALIDATION_FAILED'), fields: parsed.fields }
      }
      const { contextSequence, taskId, expectedEditRevision, status, cancellation } = parsed.value
      if (!this.#hasContext(ticket, contextSequence)) return taskMutationFailure('STALE_CONTEXT')

      const reservation = this.#reservationPort(ticket, contextSequence)
      let result: UnitResult<MutationTaskOutcome>
      try {
        result = await this.#storage.run(
          (unit) => {
            if (!this.#hasContext(ticket, contextSequence)) return { status: 'STALE_CONTEXT' }
            return changeTaskStatusInUnit(unit, {
              taskId,
              expectedEditRevision: BigInt(expectedEditRevision),
              status,
              ...(cancellation !== undefined && { cancellation }),
              now: this.#clock(),
              generateId: this.#generateId,
              reservations: reservation.port,
            })
          },
          this.#options(ticket),
        )
      } catch {
        reservation.releasePending()
        return taskMutationFailure('STORAGE_UNAVAILABLE')
      }
      if (!result.ok) {
        reservation.releasePending()
        if (!this.#sessions.isCurrent(ticket)) return taskMutationFailure('SESSION_CLOSED')
        return taskMutationFailure(taskErrorCodeFor(result.reason))
      }
      if (!this.#sessions.isCurrent(ticket)) {
        reservation.releasePending()
        return taskMutationFailure('SESSION_CLOSED')
      }
      return this.#mutationResponse(result, ticket, contextSequence, reservation.releasePending)
    } catch {
      return taskMutationFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleSubtaskDone(event: InvocationLike, request: unknown): Promise<TaskCheckResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskCheckFailure('UNAUTHORIZED')

      const parsed = parseSubtaskDoneRequest(request)
      if (parsed.kind === 'invalid-request') return taskCheckFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') {
        return { ...taskCheckFailure('VALIDATION_FAILED'), fields: parsed.fields }
      }
      const { contextSequence, taskId, expectedEditRevision, subtaskId, done } = parsed.value
      if (!this.#hasContext(ticket, contextSequence)) return taskCheckFailure('STALE_CONTEXT')

      const result = await this.#storage.run(
        (unit) => {
          if (!this.#hasContext(ticket, contextSequence)) return { status: 'STALE_CONTEXT' } as const
          return setSubtaskDoneInUnit(unit, {
            taskId,
            expectedEditRevision: BigInt(expectedEditRevision),
            subtaskId,
            done,
            now: this.#clock(),
          })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskCheckFailure('SESSION_CLOSED')
      if (!result.ok) return taskCheckFailure(taskErrorCodeFor(result.reason))
      return this.#subtaskResponse(result.revision, result.value)
    } catch {
      return taskCheckFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleOpenSource(event: InvocationLike, request: unknown): Promise<TaskOpenSourceResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskSourceFailure('UNAUTHORIZED')

      const parsed = parseTaskOpenSourceRequest(request)
      if (parsed.kind === 'invalid-request') return taskSourceFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return taskSourceFailure('INVALID_REQUEST')

      const result = await this.#storage.read(
        (reader): SourceReadOutcome => {
          const stored = reader.getTask(parsed.value.taskId)
          if (stored === undefined) return { status: 'NOT_FOUND' }
          if (stored.contentRevision !== BigInt(parsed.value.expectedContentRevision)) {
            return { status: 'CONFLICT', currentRevision: stored.contentRevision }
          }
          if (stored.task.sourceUrl === undefined) return { status: 'SOURCE_NOT_AVAILABLE' }
          return { status: 'OK', sourceUrl: stored.task.sourceUrl, revision: stored.contentRevision }
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskSourceFailure('SESSION_CLOSED')
      // As razões mapeadas (códigos de estado + RESOURCE_LIMIT) pertencem também à união da origem.
      if (!result.ok) return taskSourceFailure(taskErrorCodeFor(result.reason) as TaskSourceErrorCode)

      const outcome = result.value
      if (outcome.status === 'NOT_FOUND') return taskSourceFailure('NOT_FOUND')
      if (outcome.status === 'SOURCE_NOT_AVAILABLE') return taskSourceFailure('SOURCE_NOT_AVAILABLE')
      if (outcome.status === 'CONFLICT') {
        return { ...taskSourceFailure('CONFLICT'), currentContentRevision: formatRevision(outcome.currentRevision) }
      }

      const validation = validateSourceUrlForOpen(outcome.sourceUrl)
      if (!validation.ok) return taskSourceFailure(validation.code)

      // O efeito externo fica fora da transação e só ocorre com a sessão ainda vigente.
      if (!this.#sessions.isCurrent(ticket)) return taskSourceFailure('SESSION_CLOSED')
      try {
        await this.#opener.openExternal(validation.href)
      } catch {
        return taskSourceFailure('EXTERNAL_OPEN_FAILED')
      }
      // A entrega também é guardada: o documento que pediu pode ter navegado durante a espera.
      if (!this.#sessions.isCurrent(ticket)) return taskSourceFailure('SESSION_CLOSED')
      return { version: 1, status: 'ok' }
    } catch {
      return taskSourceFailure('STORAGE_UNAVAILABLE')
    }
  }

  #hasContext(ticket: DocumentTicket, sequence: number): boolean {
    return this.#undo.contextSequence(ticket.key) === sequence
  }

  #options(ticket: DocumentTicket): UnitOptions {
    return { owner: ticket.key, admit: () => this.#sessions.isCurrent(ticket) }
  }

  /**
   * Porta de reserva usada pela unidade: captura a reserva para publicá-la/liberá-la após o
   * commit. `releasePending` cobre rollback/erro/resultado incerto sem vazar charge.
   */
  #reservationPort(ticket: DocumentTicket, sequence: number): {
    port: UndoReservationPort
    releasePending: () => void
  } {
    let pending: ReservedUndo | undefined
    const port: UndoReservationPort = {
      reserve: (facts: UndoFacts) => {
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

  /**
   * Publica o recibo após o commit somente com sessão e contexto ainda correntes; fora disso a
   * reserva é liberada e nenhum token é entregue. O banco conserva o commit.
   */
  #publishUndo(
    ticket: DocumentTicket,
    sequence: number,
    outcome: MutationTaskOutcome,
  ): string | undefined {
    if (outcome.status !== 'UPDATED') return undefined
    const { reserved, undo } = outcome
    if (reserved === undefined) return undefined
    if (!this.#sessions.isCurrent(ticket) || !this.#hasContext(ticket, sequence)) {
      this.#undo.release(reserved)
      return undefined
    }
    return this.#undo.publish(reserved, undo) ?? undefined
  }

  #mutationResponse(
    result: Extract<UnitResult<MutationTaskOutcome>, { ok: true }>,
    ticket: DocumentTicket,
    sequence: number,
    releasePending: () => void,
  ): TaskMutationResult {
    const outcome = result.value
    if (outcome.status === 'UPDATED' || outcome.status === 'UNCHANGED') {
      // Época lida ANTES de publicar: o ack só carrega a época sob a qual a oferta pôde existir.
      const undoEpoch = this.#undo.epoch
      const undoToken = result.committed ? this.#publishUndo(ticket, sequence, outcome) : undefined
      releasePending()
      const ack: TaskMutationAck = {
        version: 4,
        status: 'ok',
        outcome: outcome.status === 'UPDATED' ? 'APPLIED' : 'UNCHANGED',
        revision: formatRevision(result.revision),
        contentRevision: formatRevision(outcome.contentRevision),
        editRevision: formatRevision(outcome.editRevision),
        undoEpoch,
        ...(undoToken !== undefined && { undoToken }),
      }
      return fitsResponseBudget(ack) ? ack : taskMutationFailure('RESOURCE_LIMIT')
    }
    releasePending()
    return this.#mutationFailure(outcome)
  }

  #subtaskResponse(revision: Revision, outcome: SubtaskDoneOutcome): TaskCheckResult {
    if (outcome.status === 'UPDATED' || outcome.status === 'UNCHANGED') {
      const ack: TaskCheckAck = {
        version: 3,
        status: 'ok',
        outcome: outcome.status === 'UPDATED' ? 'APPLIED' : 'UNCHANGED',
        revision: formatRevision(revision),
        contentRevision: formatRevision(outcome.contentRevision),
        editRevision: formatRevision(outcome.editRevision),
      }
      return fitsResponseBudget(ack) ? ack : taskCheckFailure('RESOURCE_LIMIT')
    }
    return this.#checkFailure(outcome)
  }

  /** Campos comuns das recusas de update/status e de check; a versão é do chamador. */
  #failureDetails(
    outcome:
      | Exclude<MutationTaskOutcome, { status: 'UPDATED' | 'UNCHANGED' }>
      | Exclude<SubtaskDoneOutcome, { status: 'UPDATED' | 'UNCHANGED' }>,
  ): { code: TaskMutationErrorCode; fields?: TaskMutationFailure['fields']; content?: Revision; edit?: Revision } {
    switch (outcome.status) {
      case 'VALIDATION_FAILED':
        return { code: 'VALIDATION_FAILED', fields: outcome.fields }
      case 'NOT_FOUND':
        return { code: 'NOT_FOUND' }
      case 'SUBTASK_NOT_FOUND':
        return { code: 'SUBTASK_NOT_FOUND' }
      case 'ADVANCED_TASK_RESTRICTED':
        return { code: 'ADVANCED_TASK_RESTRICTED' }
      case 'RECURRENCE_CHOICE_REQUIRED':
        return { code: 'RECURRENCE_CHOICE_REQUIRED' }
      case 'RECURRENCE_OUT_OF_RANGE':
        return { code: 'RECURRENCE_OUT_OF_RANGE' }
      case 'RESOURCE_LIMIT':
        return { code: 'RESOURCE_LIMIT' }
      case 'SERIES_CONFLICT':
        return { code: 'SERIES_CONFLICT' }
      case 'IDENTITY_CONFLICT':
        return { code: 'IDENTITY_CONFLICT' }
      case 'INVALID_REQUEST':
        return { code: 'INVALID_REQUEST' }
      case 'STALE_CONTEXT':
        return { code: 'STALE_CONTEXT' }
      case 'CONFLICT':
        return {
          code: 'CONFLICT',
          content: outcome.currentContentRevision,
          edit: outcome.currentEditRevision,
        }
    }
  }

  #mutationFailure(
    outcome: Exclude<MutationTaskOutcome, { status: 'UPDATED' | 'UNCHANGED' }>,
  ): TaskMutationFailure {
    const details = this.#failureDetails(outcome)
    if (details.code === 'CONFLICT') {
      return {
        ...taskMutationFailure('CONFLICT'),
        currentContentRevision: formatRevision(details.content as Revision),
        currentEditRevision: formatRevision(details.edit as Revision),
      }
    }
    return {
      ...taskMutationFailure(details.code),
      ...(details.fields !== undefined && { fields: details.fields }),
    }
  }

  #checkFailure(outcome: Exclude<SubtaskDoneOutcome, { status: 'UPDATED' | 'UNCHANGED' }>): TaskCheckFailure {
    const details = this.#failureDetails(outcome)
    if (details.code === 'CONFLICT') {
      return {
        ...taskCheckFailure('CONFLICT'),
        currentContentRevision: formatRevision(details.content as Revision),
        currentEditRevision: formatRevision(details.edit as Revision),
      }
    }
    return {
      ...taskCheckFailure(details.code),
      ...(details.fields !== undefined && { fields: details.fields }),
    }
  }
}
