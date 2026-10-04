/// <reference types="vite/client" />

import type { TaskFlowDesktopApi } from '../../contracts/foundation.js'

declare global {
  interface Window {
    taskflowDesktop: TaskFlowDesktopApi
  }
}

export {}
