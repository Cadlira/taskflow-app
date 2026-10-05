import type { FoundationRequest, FoundationResult } from './foundation.js'
import type {
  StateListener,
  StateRequest,
  StateSnapshotResult,
  SubscribeStateResult,
  UnsubscribeStateRequest,
  UnsubscribeStateResult,
} from './state.js'
import type {
  SubtaskDoneRequest,
  TaskCreateRequest,
  TaskCreateResult,
  TaskMutationResult,
  TaskOpenSourceRequest,
  TaskOpenSourceResult,
  TaskStatusRequest,
  TaskUpdateRequest,
} from './tasks.js'

/**
 * Catálogo fechado exposto ao renderer: o diagnóstico da fundação, três operações de
 * leitura/subscription de estado v2 e cinco comandos de tarefas (quatro mutações v2 e a
 * abertura da origem salva v1). Não há send/canal livre, SQL, caminho, repository, Task
 * completa, autoridade (série/âncora/done), UndoPlan, URL arbitrária ou hooks de teste.
 */
export interface TaskFlowDesktopApi {
  verifyFoundation(request: FoundationRequest): Promise<FoundationResult>
  /** Snapshot completo e validado de uma única revisão. */
  getStateSnapshot(request: StateRequest): Promise<StateSnapshotResult>
  /**
   * Inscrição idempotente por documento. `listener` é um callback local: permanece no
   * preload/renderer e nunca é enviado ao main.
   */
  subscribeState(request: StateRequest, listener?: StateListener): Promise<SubscribeStateResult>
  unsubscribeState(request: UnsubscribeStateRequest): Promise<UnsubscribeStateResult>
  /** Cria uma tarefa básica com regra/subtarefas opcionais; identidade e relógio vêm do main. */
  createTask(request: TaskCreateRequest): Promise<TaskCreateResult>
  /** Edita por patch condicional à revisão de edição. */
  updateTask(request: TaskUpdateRequest): Promise<TaskMutationResult>
  /** Muda o status simples condicional à revisão de edição; status igual é no-op. */
  changeTaskStatus(request: TaskStatusRequest): Promise<TaskMutationResult>
  /** Marca/desmarca um item por intenção, conservando a revisão de edição da tarefa. */
  setSubtaskDone(request: SubtaskDoneRequest): Promise<TaskMutationResult>
  /** Abre a origem **salva** validada pelo main; nunca recebe URL livre do renderer. */
  openTaskSource(request: TaskOpenSourceRequest): Promise<TaskOpenSourceResult>
}
