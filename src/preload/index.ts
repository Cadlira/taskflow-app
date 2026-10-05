import { contextBridge, ipcRenderer } from 'electron'
import { createStateClient, type StateTransport } from '../application/state/state-client.js'
import { createTaskCommandClient, type TaskCommandTransport } from '../application/tasks/task-client.js'
import { createTrashCommandClient, type TrashCommandTransport } from '../application/tasks/trash-client.js'
import type { TaskFlowDesktopApi } from '../contracts/desktop-api.js'
import type { FoundationRequest, FoundationResult } from '../contracts/foundation.js'
import {
  STATE_CHANGED_EVENT,
  STATE_SNAPSHOT_CHANNEL,
  STATE_SUBSCRIBE_CHANNEL,
  STATE_UNAVAILABLE_EVENT,
  STATE_UNSUBSCRIBE_CHANNEL,
  type StateListener,
  type StateRequest,
  type UnsubscribeStateRequest,
} from '../contracts/state.js'
import {
  TASK_COMMAND_CHANNELS,
  type SubtaskDoneRequest,
  type TaskCreateRequest,
  type TaskOpenSourceRequest,
  type TaskStatusRequest,
  type TaskUpdateRequest,
} from '../contracts/tasks.js'
import {
  TRASH_COMMAND_CHANNELS,
  type ClearUndoOfferRequest,
  type DeleteTrashItemRequest,
  type EmptyTrashRequest,
  type MoveTaskToTrashRequest,
  type PrepareTrashConfirmationRequest,
  type PrepareTrashViewRequest,
  type RestoreTrashItemRequest,
  type UndoLastTaskActionRequest,
} from '../contracts/trash.js'

const FOUNDATION_CHANNEL = 'foundation:verify:v1'

// Catálogo fechado: nenhum canal fora destas listas é alcançável a partir do renderer.
const STATE_INVOKE_CHANNELS: readonly string[] = [
  STATE_SNAPSHOT_CHANNEL,
  STATE_SUBSCRIBE_CHANNEL,
  STATE_UNSUBSCRIBE_CHANNEL,
]
const STATE_EVENT_CHANNELS: readonly string[] = [STATE_CHANGED_EVENT, STATE_UNAVAILABLE_EVENT]

const stateTransport: StateTransport = {
  invoke(channel: string, request: unknown): Promise<unknown> {
    if (!STATE_INVOKE_CHANNELS.includes(channel)) return Promise.reject(new Error('channel not allowed'))
    return ipcRenderer.invoke(channel, request)
  },
  on(channel: string, listener: (payload: unknown) => void): () => void {
    if (!STATE_EVENT_CHANNELS.includes(channel)) throw new Error('channel not allowed')
    // O evento do Electron não é repassado: o cliente recebe só o payload, que ele valida.
    const handler = (_event: unknown, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

const taskTransport: TaskCommandTransport = {
  invoke(channel: string, request: unknown): Promise<unknown> {
    if (!TASK_COMMAND_CHANNELS.includes(channel)) return Promise.reject(new Error('channel not allowed'))
    return ipcRenderer.invoke(channel, request)
  },
}

const trashTransport: TrashCommandTransport = {
  invoke(channel: string, request: unknown): Promise<unknown> {
    if (!TRASH_COMMAND_CHANNELS.includes(channel)) return Promise.reject(new Error('channel not allowed'))
    return ipcRenderer.invoke(channel, request)
  },
}

// Um único cliente por documento: listeners fixos instalados antes de qualquer subscribe.
const stateClient = createStateClient(stateTransport, {
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  onFocus: (callback) => {
    window.addEventListener('focus', callback)
    return () => window.removeEventListener('focus', callback)
  },
})
const taskClient = createTaskCommandClient(taskTransport)
const trashClient = createTrashCommandClient(trashTransport)

const desktopApi: TaskFlowDesktopApi = Object.freeze({
  verifyFoundation: (request: FoundationRequest): Promise<FoundationResult> =>
    ipcRenderer.invoke(FOUNDATION_CHANNEL, request) as Promise<FoundationResult>,
  getStateSnapshot: (request: StateRequest) => stateClient.getStateSnapshot(request),
  // `listener` é um callback local: fica no preload e nunca é argumento de invoke.
  subscribeState: (request: StateRequest, listener?: StateListener) => stateClient.subscribeState(request, listener),
  unsubscribeState: (request: UnsubscribeStateRequest) => stateClient.unsubscribeState(request),
  // Requests são validados no preload; respostas validadas antes de voltar ao renderer.
  createTask: (request: TaskCreateRequest) => taskClient.createTask(request),
  updateTask: (request: TaskUpdateRequest) => taskClient.updateTask(request),
  changeTaskStatus: (request: TaskStatusRequest) => taskClient.changeTaskStatus(request),
  setSubtaskDone: (request: SubtaskDoneRequest) => taskClient.setSubtaskDone(request),
  openTaskSource: (request: TaskOpenSourceRequest) => taskClient.openTaskSource(request),
  clearUndoOffer: (request: ClearUndoOfferRequest) => trashClient.clearUndoOffer(request),
  prepareTrashConfirmation: (request: PrepareTrashConfirmationRequest) => trashClient.prepareTrashConfirmation(request),
  moveTaskToTrash: (request: MoveTaskToTrashRequest) => trashClient.moveTaskToTrash(request),
  restoreTrashItem: (request: RestoreTrashItemRequest) => trashClient.restoreTrashItem(request),
  deleteTrashItem: (request: DeleteTrashItemRequest) => trashClient.deleteTrashItem(request),
  emptyTrash: (request: EmptyTrashRequest) => trashClient.emptyTrash(request),
  prepareTrashView: (request: PrepareTrashViewRequest) => trashClient.prepareTrashView(request),
  undoLastTaskAction: (request: UndoLastTaskActionRequest) => trashClient.undoLastTaskAction(request),
})

contextBridge.exposeInMainWorld('taskflowDesktop', desktopApi)
