/// <reference types="vite/client" />

import type { TaskFlowDesktopApi } from '../../contracts/desktop-api.js'

declare global {
  interface Window {
    taskflowDesktop: TaskFlowDesktopApi
  }
}

export {}
