import { app, BrowserWindow, ipcMain, Menu, protocol, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runFoundationProof } from './foundation-proof.js'
import {
  FOUNDATION_CHANNEL,
  FoundationBusyGate,
  invalidFoundationRequest,
  isAuthorizedFoundationInvocation,
  isValidFoundationRequest,
  unauthorizedFoundationInvocation,
} from './ipc/foundation.js'
import { selectFoundationProfile, resolveProfilePaths } from './profile.js'
import { isTrustedRendererUrl, parseAppAssetRequest, readPackagedAsset } from './protocol.js'

protocol.registerSchemesAsPrivileged([
  { scheme: 'taskflow', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
])

app.setName('TaskFlow App')
app.setAppUserModelId('taskflow.app')

const profile = selectFoundationProfile(app.isPackaged, process.argv, process.env)
const paths = resolveProfilePaths(process.env['LOCALAPPDATA'], profile)
app.setPath('userData', paths.userData)
app.setPath('sessionData', paths.sessionData)

const ownsProfile = app.requestSingleInstanceLock()
if (!ownsProfile) {
  app.quit()
} else {
  const packagedOrigin = 'taskflow://app'
  const devOrigin = 'http://127.0.0.1:5173'
  const expectedOrigin = app.isPackaged ? packagedOrigin : devOrigin
  const busyGate = new FoundationBusyGate()
  let mainWindow: BrowserWindow | null = null

  async function serveAssets(): Promise<void> {
    protocol.handle('taskflow', async (request) => {
      const parsed = parseAppAssetRequest(request.url, request.method)
      if (!parsed) return new Response('Not found', { status: 404 })
      const rendererRoot = path.join(app.getAppPath(), 'out', 'renderer')
      return (await readPackagedAsset(rendererRoot, parsed.assetPath)) ?? new Response('Not found', { status: 404 })
    })
  }

  function resolveDevelopmentUrl(): string {
    if (app.isPackaged) return packagedOrigin
    const urlText = process.env['ELECTRON_RENDERER_URL']
    if (!urlText || !isTrustedRendererUrl(urlText, devOrigin)) throw new Error('Approved development renderer is unavailable')
    const url = new URL(urlText)
    if (url.pathname !== '/' || url.search || url.hash) throw new Error('Approved development renderer URL is invalid')
    return devOrigin
  }

  function configureSession(): void {
    const defaultSession = session.defaultSession
    defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    defaultSession.setPermissionCheckHandler(() => false)
  }

  function createMainWindow(): BrowserWindow {
    const preload = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'preload', 'index.cjs')
    const window = new BrowserWindow({
      width: 780,
      height: 560,
      minWidth: 360,
      minHeight: 420,
      show: false,
      title: 'TaskFlow App',
      autoHideMenuBar: true,
      webPreferences: {
        preload,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        devTools: !app.isPackaged,
      },
    })

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (!isTrustedRendererUrl(url, expectedOrigin)) event.preventDefault()
    })
    window.webContents.on('will-redirect', (event, url) => {
      if (!isTrustedRendererUrl(url, expectedOrigin)) event.preventDefault()
    })
    window.webContents.on('will-attach-webview', (event) => event.preventDefault())
    window.once('ready-to-show', () => window.show())
    window.once('closed', () => {
      if (mainWindow === window) mainWindow = null
      app.quit()
    })
    return window
  }

  function registerFoundationIpc(window: BrowserWindow): void {
    ipcMain.handle(FOUNDATION_CHANNEL, async (event, request: unknown) => {
      if (!isValidFoundationRequest(request)) return invalidFoundationRequest()
      if (!isAuthorizedFoundationInvocation(event, window.webContents, expectedOrigin)) {
        return unauthorizedFoundationInvocation()
      }

      return busyGate.run(() => {
        const databaseFile = path.join(app.getPath('userData'), 'foundation-proof', 'proof.sqlite')
        return runFoundationProof(
          databaseFile,
          app.getVersion(),
          process.versions.electron,
          process.versions.node,
        )
      })
    })
  }

  async function startApplication(): Promise<void> {
    await serveAssets()
    configureSession()
    Menu.setApplicationMenu(null)
    mainWindow = createMainWindow()
    registerFoundationIpc(mainWindow)
    await mainWindow.loadURL(resolveDevelopmentUrl())
  }

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    ipcMain.removeHandler(FOUNDATION_CHANNEL)
  })

  void app.whenReady().then(startApplication).catch(() => app.quit())
}
