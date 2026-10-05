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
import type {
  ClearUndoOfferRequest,
  ClearUndoOfferResult,
  DeleteTrashItemRequest,
  DeleteTrashItemResult,
  EmptyTrashRequest,
  EmptyTrashResult,
  MoveTaskToTrashRequest,
  MoveTaskToTrashResult,
  PrepareTrashConfirmationRequest,
  PrepareTrashConfirmationResult,
  PrepareTrashViewRequest,
  PrepareTrashViewResult,
  RestoreTrashItemRequest,
  RestoreTrashItemResult,
  UndoLastTaskActionRequest,
  UndoLastTaskActionResult,
} from './trash.js'

/**
 * Catálogo fechado exposto ao renderer, total17: diagnóstico (v1), três operações de
 * leitura/subscription de estado (v2), quatro mutações de tarefas (v3), abertura da origem salva
 * (v1) e oito operações v1 de contexto/confirmação/lixeira/undo. Não há send/canal livre, SQL,
 * caminho, repository, Task completa, before-image, UndoPlan, clock, URL arbitrária ou hooks de
 * teste; lixeira/undo usam somente referências e tokens próprios.
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
  /** Edita por patch condicional à revisão de edição; APPLIED pode oferecer desfazer. */
  updateTask(request: TaskUpdateRequest): Promise<TaskMutationResult>
  /** Muda o status simples condicional à revisão de edição; status igual é no-op. */
  changeTaskStatus(request: TaskStatusRequest): Promise<TaskMutationResult>
  /** Marca/desmarca um item por intenção, conservando a revisão de edição da tarefa. */
  setSubtaskDone(request: SubtaskDoneRequest): Promise<TaskMutationResult>
  /** Abre a origem **salva** validada pelo main; nunca recebe URL livre do renderer. */
  openTaskSource(request: TaskOpenSourceRequest): Promise<TaskOpenSourceResult>
  /** Estabelece contexto novo e limpa oferta/confirmação próprias antes da ação dependente. */
  clearUndoOffer(request: ClearUndoOfferRequest): Promise<ClearUndoOfferResult>
  /** Prepara confirmação opaca (MOVE/PERMANENT/EMPTY) ligada à base lida no main. */
  prepareTrashConfirmation(request: PrepareTrashConfirmationRequest): Promise<PrepareTrashConfirmationResult>
  /** Confirma a exclusão recuperável; ack informa retained e pode trazer undoToken. */
  moveTaskToTrash(request: MoveTaskToTrashRequest): Promise<MoveTaskToTrashResult>
  /** Restaura a entrada observada sem gerar ocorrência e sem oferecer desfazer. */
  restoreTrashItem(request: RestoreTrashItemRequest): Promise<RestoreTrashItemResult>
  /** Exclusão definitiva da entrada observada, sem desfazer. */
  deleteTrashItem(request: DeleteTrashItemRequest): Promise<DeleteTrashItemResult>
  /** Esvaziamento irreversível condicionado à composição observada. */
  emptyTrash(request: EmptyTrashRequest): Promise<EmptyTrashResult>
  /** Manutenção explícita da lixeira (expurgo por idade) antes de abrir/atualizar a área. */
  prepareTrashView(request: PrepareTrashViewRequest): Promise<PrepareTrashViewResult>
  /** Desfaz a última ação efetiva própria consumindo o token uma única vez. */
  undoLastTaskAction(request: UndoLastTaskActionRequest): Promise<UndoLastTaskActionResult>
}
