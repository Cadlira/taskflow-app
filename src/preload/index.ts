import { contextBridge, ipcRenderer } from 'electron'
import type { FoundationRequest, FoundationResult, TaskFlowDesktopApi } from '../contracts/foundation.js'

const FOUNDATION_CHANNEL = 'foundation:verify:v1'

const desktopApi: TaskFlowDesktopApi = Object.freeze({
  verifyFoundation: (request: FoundationRequest): Promise<FoundationResult> =>
    ipcRenderer.invoke(FOUNDATION_CHANNEL, request) as Promise<FoundationResult>,
})

contextBridge.exposeInMainWorld('taskflowDesktop', desktopApi)
