import {
  TASK_CREATE_CHANNEL,
  TASK_OPEN_SOURCE_CHANNEL,
  TASK_STATUS_CHANNEL,
  TASK_UPDATE_CHANNEL,
  parseTaskCreateRequest,
  parseTaskCreateResult,
  parseTaskMutationResult,
  parseTaskOpenSourceRequest,
  parseTaskOpenSourceResult,
  parseTaskStatusRequest,
  parseTaskUpdateRequest,
  taskFailure,
  type TaskCreateResult,
  type TaskMutationResult,
  type TaskOpenSourceResult,
} from '../../contracts/tasks.js'

/** Transporte fechado: o preload só deixa passar os quatro canais do catálogo. */
export interface TaskCommandTransport {
  invoke(channel: string, request: unknown): Promise<unknown>
}

/**
 * Falha local de transporte/saída inválida: o comando pode ter sido confirmado no banco, então
 * quem chamou precisa tratar como **resultado incerto** (ressincronizar antes de decidir), sem
 * receber envelope de erro inventado pelo main.
 */
export class TaskCommandTransportError extends Error {
  constructor() {
    super('task-command-transport')
    this.name = 'TaskCommandTransportError'
  }
}

export interface TaskCommandClient {
  createTask(request: unknown): Promise<TaskCreateResult>
  updateTask(request: unknown): Promise<TaskMutationResult>
  changeTaskStatus(request: unknown): Promise<TaskMutationResult>
  openTaskSource(request: unknown): Promise<TaskOpenSourceResult>
}

async function invokeStrict(transport: TaskCommandTransport, channel: string, request: unknown): Promise<unknown> {
  try {
    return await transport.invoke(channel, request)
  } catch {
    // Sessão/renderer/navegação invalidados no meio do invoke: resultado não confirmado.
    throw new TaskCommandTransportError()
  }
}

/**
 * Lado do documento dos comandos v1: valida o request antes de enviar e a resposta antes de
 * devolver. Request inválido nem chega ao main; saída malformada vira falha local de transporte.
 */
export function createTaskCommandClient(transport: TaskCommandTransport): TaskCommandClient {
  return {
    async createTask(request: unknown): Promise<TaskCreateResult> {
      const parsed = parseTaskCreateRequest(request)
      if (parsed.kind === 'invalid-request') return taskFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return { ...taskFailure('VALIDATION_FAILED'), fields: parsed.fields }
      const response = parseTaskCreateResult(await invokeStrict(transport, TASK_CREATE_CHANNEL, parsed.value))
      if (response === null) throw new TaskCommandTransportError()
      return response
    },

    async updateTask(request: unknown): Promise<TaskMutationResult> {
      const parsed = parseTaskUpdateRequest(request)
      if (parsed.kind === 'invalid-request') return taskFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return { ...taskFailure('VALIDATION_FAILED'), fields: parsed.fields }
      const response = parseTaskMutationResult(await invokeStrict(transport, TASK_UPDATE_CHANNEL, parsed.value))
      if (response === null) throw new TaskCommandTransportError()
      return response
    },

    async changeTaskStatus(request: unknown): Promise<TaskMutationResult> {
      const parsed = parseTaskStatusRequest(request)
      if (parsed.kind === 'invalid-request') return taskFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return { ...taskFailure('VALIDATION_FAILED'), fields: parsed.fields }
      const response = parseTaskMutationResult(await invokeStrict(transport, TASK_STATUS_CHANNEL, parsed.value))
      if (response === null) throw new TaskCommandTransportError()
      return response
    },

    async openTaskSource(request: unknown): Promise<TaskOpenSourceResult> {
      const parsed = parseTaskOpenSourceRequest(request)
      if (parsed.kind === 'invalid-request') return taskFailure('INVALID_REQUEST')
      if (parsed.kind === 'validation') return { ...taskFailure('VALIDATION_FAILED'), fields: parsed.fields }
      const response = parseTaskOpenSourceResult(await invokeStrict(transport, TASK_OPEN_SOURCE_CHANNEL, parsed.value))
      if (response === null) throw new TaskCommandTransportError()
      return response
    },
  }
}
