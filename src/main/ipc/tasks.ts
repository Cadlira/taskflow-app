import { formatRevision, type Revision } from '../../application/storage/revisions.js'
import type { StorageFailureReason } from '../../application/storage/task-storage-error.js'
import type { TaskStorageReader, TaskStorageUnit, UnitResult } from '../../application/storage/unit-of-work.js'
import {
  changeTaskStatusInUnit,
  createTaskInUnit,
  updateTaskInUnit,
  type MutationTaskOutcome,
} from '../../application/tasks/task-commands.js'
import { validateSourceUrlForOpen } from '../../application/tasks/source-url.js'
import {
  fitsResponseBudget,
  parseTaskCreateRequest,
  parseTaskOpenSourceRequest,
  parseTaskStatusRequest,
  parseTaskUpdateRequest,
  taskFailure,
  type TaskCommandErrorCode,
  type TaskCommandFailure,
  type TaskCreateResult,
  type TaskMutationResult,
  type TaskOpenSourceResult,
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

/** Traduz razões internas para a união pública fechada; nenhum detalhe acompanha o código. */
export function taskErrorCodeFor(reason: StorageFailureReason): TaskCommandErrorCode {
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
 * IPC dos quatro comandos v1: autoriza o remetente antes de olhar o request, valida schema e
 * bytes antes de qualquer leitura, decide dentro da unidade coordenada e nunca devolve erro de
 * implementação. A sessão é revalidada depois da unidade e antes do efeito/entrega.
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
      if (ticket === null) return taskFailure('UNAUTHORIZED')

      const parsed = parseTaskCreateRequest(request)
      if (parsed.kind === 'invalid-request') return taskFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return { ...taskFailure('VALIDATION_FAILED'), fields: parsed.fields }

      const result = await this.#storage.run(
        (unit) =>
          createTaskInUnit(unit, {
            draft: parsed.value.draft,
            now: this.#clock(),
            generateId: this.#generateId,
          }),
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskFailure('SESSION_CLOSED')
      if (!result.ok) return taskFailure(taskErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'VALIDATION_FAILED') {
        return { ...taskFailure('VALIDATION_FAILED'), fields: outcome.fields }
      }
      if (outcome.status === 'RESOURCE_LIMIT') return taskFailure('RESOURCE_LIMIT')

      return this.#budget({
        version: 1,
        status: 'ok',
        taskId: outcome.taskId,
        revision: formatRevision(result.revision),
        contentRevision: formatRevision(outcome.contentRevision),
      })
    } catch {
      return taskFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleUpdate(event: InvocationLike, request: unknown): Promise<TaskMutationResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskFailure('UNAUTHORIZED')

      const parsed = parseTaskUpdateRequest(request)
      if (parsed.kind === 'invalid-request') return taskFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return { ...taskFailure('VALIDATION_FAILED'), fields: parsed.fields }

      const result = await this.#storage.run(
        (unit) => {
          const expected = BigInt(parsed.value.expectedContentRevision)
          return updateTaskInUnit(unit, {
            taskId: parsed.value.taskId,
            expectedContentRevision: expected,
            patch: parsed.value.patch,
            now: this.#clock(),
          })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskFailure('SESSION_CLOSED')
      if (!result.ok) return taskFailure(taskErrorCodeFor(result.reason))
      return this.#mutationResponse(result.revision, result.value)
    } catch {
      return taskFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleStatus(event: InvocationLike, request: unknown): Promise<TaskMutationResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskFailure('UNAUTHORIZED')

      const parsed = parseTaskStatusRequest(request)
      if (parsed.kind === 'invalid-request') return taskFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return { ...taskFailure('VALIDATION_FAILED'), fields: parsed.fields }

      const result = await this.#storage.run(
        (unit) => {
          const expected = BigInt(parsed.value.expectedContentRevision)
          return changeTaskStatusInUnit(unit, {
            taskId: parsed.value.taskId,
            expectedContentRevision: expected,
            status: parsed.value.status,
            now: this.#clock(),
          })
        },
        this.#options(ticket),
      )
      if (!this.#sessions.isCurrent(ticket)) return taskFailure('SESSION_CLOSED')
      if (!result.ok) return taskFailure(taskErrorCodeFor(result.reason))
      return this.#mutationResponse(result.revision, result.value)
    } catch {
      return taskFailure('STORAGE_UNAVAILABLE')
    }
  }

  async handleOpenSource(event: InvocationLike, request: unknown): Promise<TaskOpenSourceResult> {
    try {
      const ticket = this.#sessions.authorize(event)
      if (ticket === null) return taskFailure('UNAUTHORIZED')

      const parsed = parseTaskOpenSourceRequest(request)
      if (parsed.kind === 'invalid-request') return taskFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return { ...taskFailure('VALIDATION_FAILED'), fields: parsed.fields }

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
      if (!this.#sessions.isCurrent(ticket)) return taskFailure('SESSION_CLOSED')
      if (!result.ok) return taskFailure(taskErrorCodeFor(result.reason))

      const outcome = result.value
      if (outcome.status === 'NOT_FOUND') return taskFailure('NOT_FOUND')
      if (outcome.status === 'SOURCE_NOT_AVAILABLE') return taskFailure('SOURCE_NOT_AVAILABLE')
      if (outcome.status === 'CONFLICT') {
        return { ...taskFailure('CONFLICT'), currentContentRevision: formatRevision(outcome.currentRevision) }
      }

      const validation = validateSourceUrlForOpen(outcome.sourceUrl)
      if (!validation.ok) return taskFailure(validation.code)

      // O efeito externo fica fora da transação e só ocorre com a sessão ainda vigente.
      if (!this.#sessions.isCurrent(ticket)) return taskFailure('SESSION_CLOSED')
      try {
        await this.#opener.openExternal(validation.href)
      } catch {
        return taskFailure('EXTERNAL_OPEN_FAILED')
      }
      // A entrega também é guardada: o documento que pediu pode ter navegado durante a espera.
      if (!this.#sessions.isCurrent(ticket)) return taskFailure('SESSION_CLOSED')
      return { version: 1, status: 'ok' }
    } catch {
      return taskFailure('STORAGE_UNAVAILABLE')
    }
  }

  #options(ticket: DocumentTicket): UnitOptions {
    return { owner: ticket.key, admit: () => this.#sessions.isCurrent(ticket) }
  }

  #mutationResponse(revision: Revision, outcome: MutationTaskOutcome): TaskMutationResult {
    switch (outcome.status) {
      case 'UPDATED':
      case 'UNCHANGED':
        return this.#budget({
          version: 1,
          status: 'ok',
          revision: formatRevision(revision),
          contentRevision: formatRevision(outcome.contentRevision),
        })
      case 'VALIDATION_FAILED':
        return { ...taskFailure('VALIDATION_FAILED'), fields: outcome.fields }
      case 'NOT_FOUND':
        return taskFailure('NOT_FOUND')
      case 'ADVANCED_TASK_RESTRICTED':
        return taskFailure('ADVANCED_TASK_RESTRICTED')
      case 'CONFLICT':
        return { ...taskFailure('CONFLICT'), currentContentRevision: formatRevision(outcome.currentRevision) }
    }
  }

  /** Nunca trunca para caber: resposta acima do orçamento vira RESOURCE_LIMIT. */
  #budget<T extends TaskCreateResult | TaskMutationResult>(response: T): T | TaskCommandFailure {
    return fitsResponseBudget(response) ? response : taskFailure('RESOURCE_LIMIT')
  }
}
