import type { FoundationRequest, FoundationResult } from './foundation.js'
import type { EntryRequest, EntryAck, CaptureResult, PendingCaptureResult, CaptureAckRequest, CaptureDiscardRequest,
  CaptureAckResult, ShortcutSettingsResult, SetShortcutRequest, ShortcutEditingRequest } from './capture-shortcuts.js'
import type { QUICK_ADD_OPERATIONS } from './surface-catalog.js'
import type { DesktopRequest, DesktopLegacyRequest, DesktopStatusResult, StartupRequest, StartupResult, DesktopAck, DesktopFailure, DesktopListener, DesktopSubscription, ActivationRequest, ActivationResult } from './desktop.js'
import type {
  StateListener,
  StateRequest,
  StateSnapshotResult,
  SubscribeStateResult,
  UnsubscribeStateRequest,
  UnsubscribeStateResult,
} from './state.js'
import type {
  CancelBackupRestoreRequest,
  CancelBackupRestoreResult,
  ConfirmBackupRestoreRequest,
  ConfirmBackupRestoreResult,
  ExportBackupRequest,
  ExportBackupResult,
  PrepareBackupRestoreRequest,
  PrepareBackupRestoreResult,
} from './backup.js'
import type {
  SubtaskDoneRequest,
  TaskCheckResult,
  TaskCreateRequest,
  TaskCreateResult,
  TaskMutationResult,
  TaskUpdateResult,
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
import type {
  AiAuthorizeRequest,
  AiAuthorizeResult,
  AiCancelSuggestionResult,
  AiPrepareSuggestionRequest,
  AiPrepareSuggestionResult,
  AiProviderStatusResult,
  AiRemoveConfigRequest,
  AiRemoveConfigResult,
  AiRequestIdRequest,
  AiSaveConfigRequest,
  AiSaveConfigResult,
  AiStatusRequest,
  AiSuggestSubtasksResult,
  AiTestConnectionRequest,
  AiTestConnectionResult,
} from './ai.js'

/**
 * Catálogo fechado exposto ao renderer, total43 no manager (estado3; diagnóstico/origem1;
 * create4/check3, update5/status4, move2, outros contexto/trash/undo1; quatro backup1;
 * status/inscrição/eventos desktop2, startup/saída/resolução1, nove de captura/atalhos1 e oito de
 * IA1) e14 operações no Quick Add, sem nenhuma de IA. Não há send/canal livre, SQL, caminho,
 * repository, Task completa, before-image, UndoPlan, clock, URL arbitrária ou hooks de teste;
 * lixeira/undo/backup usam somente referências, tokens e resumos próprios, e a credencial de IA
 * nunca é lida pelo renderer — só o resumo sem segredo.
 */
export interface TaskFlowDesktopApi {
  openQuickAdd(request: EntryRequest): Promise<EntryAck>
  openTaskManager(request: EntryRequest): Promise<EntryAck>
  captureClipboard(request: EntryRequest): Promise<CaptureResult>
  getPendingCapture(request: EntryRequest): Promise<PendingCaptureResult>
  acknowledgeCapture(request: CaptureAckRequest): Promise<CaptureAckResult>
  discardCapture(request: CaptureDiscardRequest): Promise<CaptureAckResult>
  getShortcutSettings(request: EntryRequest): Promise<ShortcutSettingsResult>
  setShortcut(request: SetShortcutRequest): Promise<ShortcutSettingsResult>
  setShortcutEditing(request: ShortcutEditingRequest): Promise<EntryAck>
  getDesktopStatus(request: DesktopRequest): Promise<DesktopStatusResult>
  setStartAtLogin(request: StartupRequest): Promise<StartupResult>
  requestQuit(request: DesktopLegacyRequest): Promise<DesktopAck | DesktopFailure>
  subscribeDesktopEvents(request: DesktopRequest, listener: DesktopListener): Promise<DesktopSubscription>
  resolveReminderActivation(request: ActivationRequest): Promise<ActivationResult>
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
  updateTask(request: TaskUpdateRequest): Promise<TaskUpdateResult>
  /** Muda o status simples condicional à revisão de edição; status igual é no-op. */
  changeTaskStatus(request: TaskStatusRequest): Promise<TaskMutationResult>
  /** Marca/desmarca um item por intenção, conservando a revisão de edição da tarefa. */
  setSubtaskDone(request: SubtaskDoneRequest): Promise<TaskCheckResult>
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
  /** Exporta um snapshot consistente de todas as tarefas por diálogo nativo; nenhum path sai. */
  exportBackup(request: ExportBackupRequest): Promise<ExportBackupResult>
  /** Abre/valida um backup e publica a prévia imutável (token/TTL/base) no proprietário. */
  prepareBackupRestore(request: PrepareBackupRestoreRequest): Promise<PrepareBackupRestoreResult>
  /** Confirma a substituição total sobre a base exata da prévia, consumindo o token uma vez. */
  confirmBackupRestore(request: ConfirmBackupRestoreRequest): Promise<ConfirmBackupRestoreResult>
  /** Cancela a prévia própria; repetição é idempotente. */
  cancelBackupRestore(request: CancelBackupRestoreRequest): Promise<CancelBackupRestoreResult>
  /** Resumo sem segredo da configuração de IA; nenhuma decifra e nenhuma requisição. */
  getAiProviderStatus(request: AiStatusRequest): Promise<AiProviderStatusResult>
  /** Substitui a configuração por completo sob CAS; campo de credencial vazio preserva a salva. */
  saveAiProviderConfig(request: AiSaveConfigRequest): Promise<AiSaveConfigResult>
  /** Remove a configuração apagando o ciphertext e revogando os consentimentos da origem. */
  removeAiProviderConfig(request: AiRemoveConfigRequest): Promise<AiRemoveConfigResult>
  /** Registra o consentimento do escopo, vinculado a origem/provedor/base/revisão da configuração. */
  authorizeAiUse(request: AiAuthorizeRequest): Promise<AiAuthorizeResult>
  /** Testa a conexão somente por gesto do usuário; listagem de modelos ou envio mínimo explícito. */
  testAiConnection(request: AiTestConnectionRequest): Promise<AiTestConnectionResult>
  /** Prepara a prévia literal no main; editar título/descrição exige nova preparação. */
  prepareAiSuggestion(request: AiPrepareSuggestionRequest): Promise<AiPrepareSuggestionResult>
  /** Executa o snapshot preparado: uma requisição, cancelável e sem retry; nada é persistido. */
  suggestAiSubtasks(request: AiRequestIdRequest): Promise<AiSuggestSubtasksResult>
  /** Cancela o pedido do próprio `requestId`; resposta tardia é descartada. */
  cancelAiSuggestion(request: AiRequestIdRequest): Promise<AiCancelSuggestionResult>
}
export type QuickAddDesktopApi = Pick<TaskFlowDesktopApi, (typeof QUICK_ADD_OPERATIONS)[number]>
