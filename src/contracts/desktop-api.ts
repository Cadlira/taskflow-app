import type { FoundationRequest, FoundationResult } from './foundation.js'
import type {
  StateListener,
  StateRequest,
  StateSnapshotResult,
  SubscribeStateResult,
  UnsubscribeStateRequest,
  UnsubscribeStateResult,
} from './state.js'

/**
 * Catálogo fechado exposto ao renderer: o diagnóstico da fundação e três operações de
 * leitura/subscription de estado. Não há comando de mutação, SQL, caminho, repository,
 * canal genérico ou abertura externa.
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
}
