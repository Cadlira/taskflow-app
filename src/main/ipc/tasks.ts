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
import { validateSourceUrlForOpen } from '../../application/tasks/source-url.js'
import {
  fitsResponseBudget,
  parseSubtaskDoneRequest,
  parseTaskCreateRequest,
  parseTaskOpenSourceRequest,
  parseTaskStatusRequest,
  parseTaskUpdateRequest,
  taskMutationFailure,
  taskSourceFailure,
  type TaskCreateResult,
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
 * IPC dos cinco comandos: autoriza o remetente antes de olhar o request, valida schema e bytes
 * antes de qualquer leitura, decide dentro da unidade coordenada e nunca devolve erro de
 * implementação. A sessão é revalidada depois da unidade e antes do efeito/entrega.
 * Mutações são v2 (ack com conteúdo **e** edição); `openTaskSource` conserva v1.
 */
export class TaskCommandIpcService {
  readonly #sessions: TaskCommandSessions
  readonly #storage: TaskCommandStorage
  readonly #clock: () => Date
  readonly #generateId: () => string
  readonly #opener: { openExternal(href: string): Promise<void> }

  constructor(options: TaskCommandIpcOptions) {
    this.#sessions = options.sessions
    this.#storage = options.storage
    this.#clock = options.clock
    this.#generateId = options.generateId
    this.#opener = options.opener
  }

  async handleCreate(event: InvocationLike, request: unknown): Promise<TaskCreateResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskMutationFailure('UNAUTHORIZED')

      const parsed = parseTaskCreateRequest(request)
      if (parsed.kind === 'invalid-request') return taskMutationFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') {
        return { ...taskMutationFailure('VALIDATION_FAILED'), fields: parsed.fields }
      }

      const result = await this.#storage.run(
        (unit) =>
          createTaskInUnit(unit, {
            draft: parsed.value.draft,
            now: this.#clock(),
            generateId: this.#generateId,
          }),
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskMutationFailure('SESSION_CLOSED')
      if (!result.ok) return taskMutationFailure(taskErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'VALIDATION_FAILED') {
        return { ...taskMutationFailure('VALIDATION_FAILED'), fields: outcome.fields }
      }
      if (outcome.status === 'IDENTITY_CONFLICT') return taskMutationFailure('IDENTITY_CONFLICT')

      return this.#budget({
        version: 2,
        status: 'ok',
        taskId: outcome.taskId,
        revision: formatRevision(result.revision),
        contentRevision: formatRevision(outcome.contentRevision),
        editRevision: formatRevision(outcome.editRevision),
      })
    } catch {
      return taskMutationFailure('STORAGE_UNAVAILABLE')
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

      const result = await this.#storage.run(
        (unit) =>
          updateTaskInUnit(unit, {
            taskId: parsed.value.taskId,
            expectedEditRevision: BigInt(parsed.value.expectedEditRevision),
            patch: parsed.value.patch,
            ...(parsed.value.cancellation !== undefined && { cancellation: parsed.value.cancellation }),
            now: this.#clock(),
            generateId: this.#generateId,
          }),
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskMutationFailure('SESSION_CLOSED')
      if (!result.ok) return taskMutationFailure(taskErrorCodeFor(result.reason))
      return this.#mutationResponse(result.revision, result.value)
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

      const result = await this.#storage.run(
        (unit) =>
          changeTaskStatusInUnit(unit, {
            taskId: parsed.value.taskId,
            expectedEditRevision: BigInt(parsed.value.expectedEditRevision),
            status: parsed.value.status,
            ...(parsed.value.cancellation !== undefined && { cancellation: parsed.value.cancellation }),
            now: this.#clock(),
            generateId: this.#generateId,
          }),
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskMutationFailure('SESSION_CLOSED')
      if (!result.ok) return taskMutationFailure(taskErrorCodeFor(result.reason))
      return this.#mutationResponse(result.revision, result.value)
    } catch {
      return taskMutationFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleSubtaskDone(event: InvocationLike, request: unknown): Promise<TaskMutationResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskMutationFailure('UNAUTHORIZED')

      const parsed = parseSubtaskDoneRequest(request)
      if (parsed.kind === 'invalid-request') return taskMutationFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') {
        return { ...taskMutationFailure('VALIDATION_FAILED'), fields: parsed.fields }
      }

      const result = await this.#storage.run(
        (unit) =>
          setSubtaskDoneInUnit(unit, {
            taskId: parsed.value.taskId,
            expectedEditRevision: BigInt(parsed.value.expectedEditRevision),
            subtaskId: parsed.value.subtaskId,
            done: parsed.value.done,
            now: this.#clock(),
          }),
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskMutationFailure('SESSION_CLOSED')
      if (!result.ok) return taskMutationFailure(taskErrorCodeFor(result.reason))
      return this.#subtaskResponse(result.revision, result.value)
    } catch {
      return taskMutationFailure('STORAGE_UNAVAILABLE')
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

  #options(ticket: DocumentTicket): UnitOptions {
    return { owner: ticket.key, admit: () => this.#sessions.isCurrent(ticket) }
  }

  #mutationResponse(revision: Revision, outcome: MutationTaskOutcome): TaskMutationResult {
    if (outcome.status === 'UPDATED' || outcome.status === 'UNCHANGED') {
      return this.#budget({
        version: 2,
        status: 'ok',
        revision: formatRevision(revision),
        contentRevision: formatRevision(outcome.contentRevision),
        editRevision: formatRevision(outcome.editRevision),
      })
    }
    return this.#mutationFailure(outcome)
  }

  #subtaskResponse(revision: Revision, outcome: SubtaskDoneOutcome): TaskMutationResult {
    if (outcome.status === 'UPDATED' || outcome.status === 'UNCHANGED') {
      return this.#budget({
        version: 2,
        status: 'ok',
        revision: formatRevision(revision),
        contentRevision: formatRevision(outcome.contentRevision),
        editRevision: formatRevision(outcome.editRevision),
      })
    }
    return this.#mutationFailure(outcome)
  }

  #mutationFailure(outcome: Exclude<MutationTaskOutcome, { status: 'UPDATED' | 'UNCHANGED' }> | Exclude<SubtaskDoneOutcome, { status: 'UPDATED' | 'UNCHANGED' }>): TaskMutationResult {
    switch (outcome.status) {
      case 'VALIDATION_FAILED':
        return { ...taskMutationFailure('VALIDATION_FAILED'), fields: outcome.fields }
      case 'NOT_FOUND':
        return taskMutationFailure('NOT_FOUND')
      case 'SUBTASK_NOT_FOUND':
        return taskMutationFailure('SUBTASK_NOT_FOUND')
      case 'ADVANCED_TASK_RESTRICTED':
        return taskMutationFailure('ADVANCED_TASK_RESTRICTED')
      case 'RECURRENCE_CHOICE_REQUIRED':
        return taskMutationFailure('RECURRENCE_CHOICE_REQUIRED')
      case 'RECURRENCE_OUT_OF_RANGE':
        return taskMutationFailure('RECURRENCE_OUT_OF_RANGE')
      case 'RESOURCE_LIMIT':
        return taskMutationFailure('RESOURCE_LIMIT')
      case 'SERIES_CONFLICT':
        return taskMutationFailure('SERIES_CONFLICT')
      case 'IDENTITY_CONFLICT':
        return taskMutationFailure('IDENTITY_CONFLICT')
      case 'INVALID_REQUEST':
        return taskMutationFailure('INVALID_REQUEST')
      case 'CONFLICT':
        return {
          ...taskMutationFailure('CONFLICT'),
          currentContentRevision: formatRevision(outcome.currentContentRevision),
          currentEditRevision: formatRevision(outcome.currentEditRevision),
        }
    }
  }

  /** Nunca trunca para caber: resposta acima do orçamento vira RESOURCE_LIMIT. */
  #budget<T extends TaskCreateResult | TaskMutationResult>(response: T): T | TaskMutationFailure {
    return fitsResponseBudget(response) ? response : taskMutationFailure('RESOURCE_LIMIT')
  }
}
