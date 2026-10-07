import { contextBridge, ipcRenderer } from 'electron'
import { createEntryClient } from '../application/capture/entry-client.js'
import type { SurfaceRole } from '../application/capture/capture-ports.js'
import { ENTRY_CHANNELS } from '../contracts/capture-shortcuts.js'
import { QUICK_ADD_OPERATIONS } from '../contracts/surface-catalog.js'
import { createDesktopClient } from '../application/reminders/desktop-client.js'
import { DESKTOP_CHANNELS, DESKTOP_EVENT_CHANNEL, DESKTOP_RESOLVE_CHANNEL } from '../contracts/desktop.js'
import { TaskCommandTransportError } from '../application/tasks/task-client.js'
import { createBackupCommandClient, type BackupCommandTransport } from '../application/backup/backup-client.js'
import { createStateClient, type StateTransport } from '../application/state/state-client.js'
import { createTaskCommandClient, type TaskCommandTransport } from '../application/tasks/task-client.js'
import { createTrashCommandClient, type TrashCommandTransport } from '../application/tasks/trash-client.js'
import type { TaskFlowDesktopApi } from '../contracts/desktop-api.js'
import type { FoundationRequest, FoundationResult } from '../contracts/foundation.js'
import {
  BACKUP_COMMAND_CHANNELS,
  type CancelBackupRestoreRequest,
  type ConfirmBackupRestoreRequest,
  type ExportBackupRequest,
  type PrepareBackupRestoreRequest,
} from '../contracts/backup.js'
import {
  STATE_CHANGED_EVENT,
  STATE_SNAPSHOT_CHANNEL,
  STATE_SUBSCRIBE_CHANNEL,
  STATE_UNAVAILABLE_EVENT,
  STATE_UNDO_INVALIDATED_EVENT,
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

/** Role constante da entrada de preload escolhida pelo main; nenhuma leitura de argv/URL. */
export function exposeDesktopBridge(role: SurfaceRole): void {

// Catálogo fechado: nenhum canal fora destas listas é alcançável a partir do renderer.
const STATE_INVOKE_CHANNELS: readonly string[] = [
  STATE_SNAPSHOT_CHANNEL,
  STATE_SUBSCRIBE_CHANNEL,
  STATE_UNSUBSCRIBE_CHANNEL,
]
const STATE_EVENT_CHANNELS: readonly string[] = [
  STATE_CHANGED_EVENT,
  STATE_UNAVAILABLE_EVENT,
  STATE_UNDO_INVALIDATED_EVENT,
]

const stateTransport: StateTransport = {
  invoke(channel: string, request: unknown): Promise<unknown> {
    if (!STATE_INVOKE_CHANNELS.includes(channel)) return Promise.reject(new Error('channel not allowed'))
    return productInvoke(channel, request)
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
    return productInvoke(channel, request)
  },
}

const trashTransport: TrashCommandTransport = {
  invoke(channel: string, request: unknown): Promise<unknown> {
    if (!TRASH_COMMAND_CHANNELS.includes(channel)) return Promise.reject(new Error('channel not allowed'))
    return productInvoke(channel, request)
  },
}

const backupTransport: BackupCommandTransport = {
  invoke(channel: string, request: unknown): Promise<unknown> {
    if (!BACKUP_COMMAND_CHANNELS.includes(channel)) return Promise.reject(new Error('channel not allowed'))
    return productInvoke(channel, request)
  },
}

let productEpoch = 0
let productActive = true
async function productInvoke(channel: string, request: unknown): Promise<unknown> {
  const epoch = productEpoch
  if (!productActive) throw new TaskCommandTransportError()
  const result: unknown = await ipcRenderer.invoke(channel, request)
  if (!productActive || epoch !== productEpoch) throw new TaskCommandTransportError()
  return result
}
const desktopClient = createDesktopClient({
  invoke: (channel, request) => {
    if (![...Object.values(DESKTOP_CHANNELS), DESKTOP_RESOLVE_CHANNEL].includes(channel)) return Promise.reject(new Error('channel not allowed'))
    return ipcRenderer.invoke(channel, request)
  },
  on: (channel, listener) => {
    if (channel !== DESKTOP_EVENT_CHANNEL) throw new Error('channel not allowed')
    const handler = (_event: unknown, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}, event => {
  if (event.kind === 'surface-suspended') {
    productEpoch += 1; productActive = false; stateClient.dispose()
  } else if (event.kind === 'surface-active' && !productActive) {
    productEpoch += 1; productActive = true; stateClient = makeStateClient()
  }
}, role)

// Um único cliente por documento: listeners fixos instalados antes de qualquer subscribe.
function makeStateClient() { return createStateClient(stateTransport, {
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  onFocus: (callback) => {
    window.addEventListener('focus', callback)
    return () => window.removeEventListener('focus', callback)
  },
}) }
let stateClient = makeStateClient()
const taskClient = createTaskCommandClient(taskTransport)
const trashClient = createTrashCommandClient(trashTransport)
const backupClient = createBackupCommandClient(backupTransport)
const entries = createEntryClient({ invoke: (channel, request) => {
  if (!(Object.values(ENTRY_CHANNELS) as readonly string[]).includes(channel)) return Promise.reject(new Error('channel not allowed'))
  return productInvoke(channel, request)
} })

const desktopApi: TaskFlowDesktopApi = Object.freeze({
  ...entries,
  getDesktopStatus: desktopClient.getDesktopStatus,
  setStartAtLogin: desktopClient.setStartAtLogin,
  requestQuit: desktopClient.requestQuit,
  subscribeDesktopEvents: desktopClient.subscribeDesktopEvents,
  resolveReminderActivation: desktopClient.resolveReminderActivation,
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
  exportBackup: (request: ExportBackupRequest) => backupClient.exportBackup(request),
  prepareBackupRestore: (request: PrepareBackupRestoreRequest) => backupClient.prepareBackupRestore(request),
  confirmBackupRestore: (request: ConfirmBackupRestoreRequest) => backupClient.confirmBackupRestore(request),
  cancelBackupRestore: (request: CancelBackupRestoreRequest) => backupClient.cancelBackupRestore(request),
})

const surfaceApi = role === 'MANAGER' ? desktopApi : Object.freeze(Object.fromEntries(
  QUICK_ADD_OPERATIONS.map(operation => [operation, desktopApi[operation]]),
))
contextBridge.exposeInMainWorld('taskflowDesktop', surfaceApi)
}
