import { app, BrowserWindow, ipcMain, Menu, protocol, session, shell } from 'electron'
import { randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BackupResourceLedger } from '../application/backup/backup-resources.js'
import { UndoRegistry } from '../application/undo/undo-registry.js'
import { BACKUP_CANCEL_CHANNEL, BACKUP_CONFIRM_CHANNEL, BACKUP_EXPORT_CHANNEL, BACKUP_PREPARE_CHANNEL } from '../contracts/backup.js'
import type { FoundationResult } from '../contracts/foundation.js'
import { STATE_SNAPSHOT_CHANNEL, STATE_SUBSCRIBE_CHANNEL, STATE_UNSUBSCRIBE_CHANNEL } from '../contracts/state.js'
import {
  TASK_CREATE_CHANNEL,
  TASK_OPEN_SOURCE_CHANNEL,
  TASK_STATUS_CHANNEL,
  TASK_SUBTASK_DONE_CHANNEL,
  TASK_UPDATE_CHANNEL,
} from '../contracts/tasks.js'
import {
  TRASH_CLEAR_UNDO_OFFER_CHANNEL,
  TRASH_DELETE_CHANNEL,
  TRASH_EMPTY_CHANNEL,
  TRASH_MOVE_CHANNEL,
  TRASH_PREPARE_CONFIRMATION_CHANNEL,
  TRASH_PREPARE_VIEW_CHANNEL,
  TRASH_RESTORE_CHANNEL,
  TRASH_UNDO_CHANNEL,
} from '../contracts/trash.js'
import { runFoundationProof } from './foundation-proof.js'
import { harnessSkipsCoordinatorStart, parseProductHarnessScenario, runProductHarness } from './harness/product-harness.js'
import { createElectronBackupDialogBroker } from './backup/backup-dialogs-electron.js'
import type { BackupWriteFaults } from './backup/backup-file-write.js'
import { BackupJobGate } from './backup/backup-job.js'
import { BackupRestoreRegistry } from './backup/backup-restore-registry.js'
import { BackupCommandServices } from './backup/backup-restore-service.js'
import { DocumentSessions } from './ipc/document-sessions.js'
import { BackupCommandIpcService } from './ipc/backup.js'
import { FOUNDATION_CHANNEL, FoundationBusyGate, handleFoundationInvocation } from './ipc/foundation.js'
import { StateIpcService } from './ipc/state.js'
import { TaskCommandIpcService } from './ipc/tasks.js'
import { TrashCommandIpcService } from './ipc/trash.js'
import {
  resolveFoundationProofFile,
  resolveProductDatabaseFile,
  resolveProfilePaths,
  selectFoundationProfile,
} from './profile.js'
import { isTrustedRendererUrl, parseAppAssetRequest, readPackagedAsset } from './protocol.js'
import { StorageCoordinator, type ShutdownReport } from './storage/coordinator.js'
import { ProductDatabase, type StorageFaults } from './storage/product-database.js'
import { PRODUCT_STORAGE_DEFINITION } from './storage/product-schema.js'

protocol.registerSchemesAsPrivileged([
  { scheme: 'taskflow', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
])

app.setName('TaskFlow App')
app.setAppUserModelId('taskflow.app')

const profile = selectFoundationProfile(app.isPackaged, process.argv, process.env)
const paths = resolveProfilePaths(process.env['LOCALAPPDATA'], profile)
app.setPath('userData', paths.userData)
app.setPath('sessionData', paths.sessionData)

// Ownership do perfil antes de qualquer banco: a segunda instância encerra sem abrir a prova
// nem o produto e sem criar janela.
const ownsProfile = app.requestSingleInstanceLock()
if (!ownsProfile) {
  app.quit()
} else {
  const packagedOrigin = 'taskflow://app'
  const devOrigin = 'http://127.0.0.1:5173'
  const expectedOrigin = app.isPackaged ? packagedOrigin : devOrigin
  const busyGate = new FoundationBusyGate()
  const sessions = new DocumentSessions(expectedOrigin)
  // Recibos/confirmações/contexto são temporários e por documento: sessão invalidada limpa tudo.
  const undo = new UndoRegistry({ randomToken: () => randomBytes(24).toString('base64url') })
  const backupLedger = new BackupResourceLedger()
  const backupGate = new BackupJobGate()
  const backupRegistry = new BackupRestoreRegistry({
    ledger: backupLedger,
    randomToken: () => randomBytes(24).toString('base64url'),
  })
  sessions.onInvalidated((key) => {
    undo.forgetDocument(key)
    backupRegistry.forgetDocument(key)
  })
  // Contexto novo (troca de área/ação) libera preparação de backup obsoleta do documento.
  undo.onContextEstablished((key, sequence) => backupRegistry.releaseOutdated(key, sequence))
  // Harness restrito ao perfil test: nunca é alcançável pelo preload/IPC nem pelo perfil prod.
  const harnessScenario = profile === 'test' ? parseProductHarnessScenario(process.argv) : null
  const harnessFaults: StorageFaults = {}
  const harnessBackupWriteFaults: BackupWriteFaults = {}
  const coordinator = new StorageCoordinator({
    open: () =>
      ProductDatabase.open(resolveProductDatabaseFile(app.getPath('userData')), PRODUCT_STORAGE_DEFINITION, harnessFaults),
    faults: harnessFaults,
  })
  const stateIpc = new StateIpcService({
    sessions,
    storage: coordinator,
    undo,
    randomToken: () => randomBytes(24).toString('base64url'),
  })
  // Porta de abertura externa do main: recebe somente href já validado pelo serviço de comando.
  const opener = { openExternal: (href: string): Promise<void> => shell.openExternal(href) }
  const taskIpc = new TaskCommandIpcService({
    sessions,
    storage: coordinator,
    clock: () => new Date(),
    generateId: () => randomUUID(),
    opener,
    undo,
  })
  const trashIpc = new TrashCommandIpcService({
    sessions,
    storage: coordinator,
    clock: () => new Date(),
    undo,
  })
  const backupDialogs = createElectronBackupDialogBroker({
    windowFor: (ticket) =>
      BrowserWindow.getAllWindows().find((window) => !window.isDestroyed() && window.webContents.id === ticket.contentsId) ??
      null,
    defaultDirectory: () => app.getPath('documents'),
  })
  const backupServices = new BackupCommandServices({
    dialogs: backupDialogs,
    storage: coordinator,
    ledger: backupLedger,
    gate: backupGate,
    registry: backupRegistry,
    undo,
    clock: () => new Date(),
    appVersion: () => app.getVersion(),
    protectedRoots: () => [app.getPath('userData'), app.getPath('sessionData'), app.getAppPath()],
    isAuthorized: (ticket) => sessions.isCurrent(ticket),
    contextSequence: (ticket) => undo.contextSequence(ticket.key),
    faults: harnessBackupWriteFaults,
  })
  const backupIpc = new BackupCommandIpcService({ sessions, services: backupServices })
  let mainWindow: BrowserWindow | null = null
  let shutdownStarted = false

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

  /** Cria uma superfície isolada e a registra como documento autorizado. */
  function createSurface(options: { show: boolean; register: boolean }): BrowserWindow | null {
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

    const contents = window.webContents
    const contentsId = contents.id
    if (options.register && !sessions.register(contents)) {
      window.destroy()
      return null
    }

    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedRendererUrl(url, expectedOrigin)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!isTrustedRendererUrl(url, expectedOrigin)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    // Navegação e reload (inclusive da mesma URL) trocam o documento: a sessão anterior, seus
    // cursores, inscrição e respostas pendentes deixam de valer no início e na conclusão.
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) sessions.invalidate(contentsId)
    })
    contents.on('did-navigate', () => sessions.invalidate(contentsId))
    contents.on('render-process-gone', () => sessions.invalidate(contentsId))
    contents.once('destroyed', () => sessions.unregister(contentsId))
    if (options.show) window.once('ready-to-show', () => window.show())
    return window
  }

  function createMainWindow(): BrowserWindow {
    const window = createSurface({ show: true, register: true })
    if (window === null) throw new Error('Main window could not be registered')
    window.once('closed', () => {
      if (mainWindow === window) mainWindow = null
      app.quit()
    })
    return window
  }

  function registerIpc(): void {
    ipcMain.handle(FOUNDATION_CHANNEL, (event, request: unknown) =>
      handleFoundationInvocation(event, request, sessions, busyGate, () =>
        runFoundationProof(
          resolveFoundationProofFile(app.getPath('userData')),
          app.getVersion(),
          process.versions.electron,
          process.versions.node,
        ),
      ),
    )
    ipcMain.handle(STATE_SNAPSHOT_CHANNEL, (event, request: unknown) => stateIpc.handleSnapshot(event, request))
    ipcMain.handle(STATE_SUBSCRIBE_CHANNEL, (event, request: unknown) => stateIpc.handleSubscribe(event, request))
    ipcMain.handle(STATE_UNSUBSCRIBE_CHANNEL, (event, request: unknown) => stateIpc.handleUnsubscribe(event, request))
    ipcMain.handle(TASK_CREATE_CHANNEL, (event, request: unknown) => taskIpc.handleCreate(event, request))
    ipcMain.handle(TASK_UPDATE_CHANNEL, (event, request: unknown) => taskIpc.handleUpdate(event, request))
    ipcMain.handle(TASK_STATUS_CHANNEL, (event, request: unknown) => taskIpc.handleStatus(event, request))
    ipcMain.handle(TASK_SUBTASK_DONE_CHANNEL, (event, request: unknown) => taskIpc.handleSubtaskDone(event, request))
    ipcMain.handle(TASK_OPEN_SOURCE_CHANNEL, (event, request: unknown) => taskIpc.handleOpenSource(event, request))
    ipcMain.handle(TRASH_CLEAR_UNDO_OFFER_CHANNEL, (event, request: unknown) => trashIpc.handleClearUndoOffer(event, request))
    ipcMain.handle(TRASH_PREPARE_CONFIRMATION_CHANNEL, (event, request: unknown) =>
      trashIpc.handlePrepareConfirmation(event, request),
    )
    ipcMain.handle(TRASH_MOVE_CHANNEL, (event, request: unknown) => trashIpc.handleMove(event, request))
    ipcMain.handle(TRASH_RESTORE_CHANNEL, (event, request: unknown) => trashIpc.handleRestore(event, request))
    ipcMain.handle(TRASH_DELETE_CHANNEL, (event, request: unknown) => trashIpc.handleDelete(event, request))
    ipcMain.handle(TRASH_EMPTY_CHANNEL, (event, request: unknown) => trashIpc.handleEmpty(event, request))
    ipcMain.handle(TRASH_PREPARE_VIEW_CHANNEL, (event, request: unknown) => trashIpc.handlePrepareView(event, request))
    ipcMain.handle(TRASH_UNDO_CHANNEL, (event, request: unknown) => trashIpc.handleUndo(event, request))
    ipcMain.handle(BACKUP_EXPORT_CHANNEL, (event, request: unknown) => backupIpc.handleExport(event, request))
    ipcMain.handle(BACKUP_PREPARE_CHANNEL, (event, request: unknown) => backupIpc.handlePrepare(event, request))
    ipcMain.handle(BACKUP_CONFIRM_CHANNEL, (event, request: unknown) => backupIpc.handleConfirm(event, request))
    ipcMain.handle(BACKUP_CANCEL_CHANNEL, (event, request: unknown) => backupIpc.handleCancel(event, request))
  }

  /**
   * Encerramento: fecha a admissão do IPC, invalida sessões/listeners, cancela entradas de
   * sessão ainda não iniciadas, drena as unidades internas admitidas e fecha a conexão. As
   * unidades são síncronas: uma unidade em commit termina antes de este código executar.
   */
  function shutdownStorage(): ShutdownReport | undefined {
    if (shutdownStarted) return undefined
    shutdownStarted = true
    for (const channel of [
      FOUNDATION_CHANNEL,
      STATE_SNAPSHOT_CHANNEL,
      STATE_SUBSCRIBE_CHANNEL,
      STATE_UNSUBSCRIBE_CHANNEL,
      TASK_CREATE_CHANNEL,
      TASK_UPDATE_CHANNEL,
      TASK_STATUS_CHANNEL,
      TASK_SUBTASK_DONE_CHANNEL,
      TASK_OPEN_SOURCE_CHANNEL,
      TRASH_CLEAR_UNDO_OFFER_CHANNEL,
      TRASH_PREPARE_CONFIRMATION_CHANNEL,
      TRASH_MOVE_CHANNEL,
      TRASH_RESTORE_CHANNEL,
      TRASH_DELETE_CHANNEL,
      TRASH_EMPTY_CHANNEL,
      TRASH_PREPARE_VIEW_CHANNEL,
      TRASH_UNDO_CHANNEL,
      BACKUP_EXPORT_CHANNEL,
      BACKUP_PREPARE_CHANNEL,
      BACKUP_CONFIRM_CHANNEL,
      BACKUP_CANCEL_CHANNEL,
    ]) {
      ipcMain.removeHandler(channel)
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) sessions.unregister(window.webContents.id)
    }
    stateIpc.dispose()
    return coordinator.shutdown()
  }

  async function startApplication(): Promise<void> {
    await serveAssets()
    configureSession()
    Menu.setApplicationMenu(null)
    // Indisponibilidade do banco de produto não vira estado vazio: o IPC devolve o código.
    // Cenários de migração (seed SQL1, inspeção e kill antes/durante/depois do commit) precisam
    // do arquivo intocado: nem o coordenador abre nem o IPC de estado/comandos é registrado,
    // pois a primeira leitura do renderer abriria/migraria o banco antes do harness.
    if (harnessScenario === null || !harnessSkipsCoordinatorStart(harnessScenario)) {
      coordinator.start()
      registerIpc()
    }
    mainWindow = createMainWindow()
    await mainWindow.loadURL(resolveDevelopmentUrl())
    if (harnessScenario !== null) {
      await runProductHarness(harnessScenario, {
        app,
        coordinator,
        sessions,
        stateIpc,
        faults: harnessFaults,
        mainWindow,
        createSurface: (register) => createSurface({ show: false, register }),
        surfaceUrl: resolveDevelopmentUrl(),
        expectedOrigin,
        productDatabaseFile: resolveProductDatabaseFile(app.getPath('userData')),
        foundationProofFile: resolveFoundationProofFile(app.getPath('userData')),
        shutdownStorage,
        opener,
        backup: {
          ipc: backupIpc,
          services: backupServices,
          registry: backupRegistry,
          ledger: backupLedger,
          gate: backupGate,
          undo,
          writeFaults: harnessBackupWriteFaults,
        },
      })
    } else if (profile === 'test') {
      await runFoundationSmoke(mainWindow)
    }
  }

  // Modo de diagnóstico do perfil test (smoke do pacote): usa somente a ponte pública
  // do renderer, sem canais/paths livres, e reporta o resultado no stdout para o
  // harness. O processo permanece ativo para o teste de segunda instância.
  async function runFoundationSmoke(window: BrowserWindow): Promise<void> {
    try {
      const proof = (await window.webContents.executeJavaScript(
        'window.taskflowDesktop.verifyFoundation({ version: 1 })',
      )) as FoundationResult
      const probePayloads = [
        { name: 'invalid-version', payload: { version: 2 } },
        { name: 'extra-field', payload: { version: 1, extra: true } },
      ]
      const probes: Array<{ name: string; result: FoundationResult }> = []
      for (const probe of probePayloads) {
        const result = (await window.webContents.executeJavaScript(
          `window.taskflowDesktop.verifyFoundation(${JSON.stringify(probe.payload)})`,
        )) as FoundationResult
        probes.push({ name: probe.name, result })
      }
      process.stdout.write(`TASKFLOW_FOUNDATION_TEST ${JSON.stringify({ proof, probes })}\n`)
      if (proof.status !== 'verified') app.exit(3)
    } catch {
      process.stdout.write('TASKFLOW_FOUNDATION_TEST {"status":"error","code":"BRIDGE_UNAVAILABLE"}\n')
      app.exit(3)
    }
  }

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => void shutdownStorage())

  void app.whenReady().then(startApplication).catch(() => app.quit())
}
