import { app, BrowserWindow, clipboard, ipcMain, Menu, protocol, session, shell, Tray, nativeImage, powerMonitor, Notification } from 'electron'
import { ClipboardCaptureReader } from '../application/capture/clipboard-reader.js'
import { MemoryCaptureInbox } from '../application/capture/memory-capture-inbox.js'
import type { SurfaceRole } from '../application/capture/capture-ports.js'
import { ShortcutController } from '../application/shortcuts/shortcut-controller.js'
import { FileShortcutPreferences } from './shortcuts/file-preferences.js'
import { electronShortcutRegistry } from './shortcuts/electron-registry.js'
import { EntryIpcService } from './ipc/entries.js'
import { ENTRY_CHANNELS } from '../contracts/capture-shortcuts.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
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
import { DESKTOP_CHANNELS, DESKTOP_RESOLVE_CHANNEL, type ReminderCapability } from '../contracts/desktop.js'
import type { ReminderServiceStatus } from '../application/reminders/reminder-ports.js'
import { DesktopIpcService } from './ipc/desktop.js'
import { AiIpcService } from './ipc/ai.js'
import { createAiProviderService } from '../application/ai/ai-provider-service.js'
import { createAiSuggestionService } from '../application/ai/ai-suggestion-service.js'
import { AiConsentRegistry } from '../application/ai/ai-consent.js'
import { AiRequestRegistry } from '../application/ai/ai-request-registry.js'
import { FileAiProviderConfig } from './ai/file-ai-config.js'
import { createNativeProtection } from './ai/native-protection.js'
import { createNetTransport } from './ai/net-transport.js'
import { createHarnessAiProtection, createHarnessAiTransport } from './harness/ai-fake.js'
import { createProviderConnectionTester, createProviderSubtaskSuggester } from './ai/provider-adapters.js'
import { AI_CHANNELS } from '../contracts/ai.js'
import { DesktopLifecycle, type DesktopWindow } from './desktop/lifecycle.js'
import { createDesktopTray, type DesktopTray } from './desktop/tray.js'
import { NATIVE_IDENTITIES, LOGIN_ARGUMENT, STARTUP_NAME, prepareNativeIdentity } from './desktop/native-identity.js'
import { createWindowsRegistry } from './desktop/windows-registry.js'
import { StartupService } from './desktop/startup.js'
import { parseNativeActivation, parseActivationRelay, ReminderActivationRoute } from './desktop/activation.js'
import { createReminderRuntime, resetForBackup } from './reminders/runtime.js'
import { createNativeNotifier, fakeReminderSubmit } from './reminders/notifier.js'
import { REMINDER_OWNER } from './reminders/processor.js'

protocol.registerSchemesAsPrivileged([
  { scheme: 'taskflow', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
])

const profile = selectFoundationProfile(app.isPackaged, process.argv, process.env)
const identity = NATIVE_IDENTITIES[profile]
app.setName(identity.name)
app.setAppUserModelId(identity.aumid)
const paths = resolveProfilePaths(process.env['LOCALAPPDATA'], profile)
app.setPath('userData', paths.userData)
app.setPath('sessionData', paths.sessionData)

// Ownership do perfil antes de qualquer banco: a segunda instância encerra sem abrir a prova
// nem o produto e sem criar janela. O relay COM (-Embedding) NÃO pede o lock sem dados:
// isso dispararia o owner antes do callback e consumiria a rota; ele só pede com
// `additionalData` depois de um callback validado (D8).
const coldLaunch = process.argv.includes('-Embedding')
const relayMode = coldLaunch && profile === 'prod' && app.isPackaged
const ownsProfile = relayMode ? false : app.requestSingleInstanceLock()
const registry = createWindowsRegistry(process.env['SystemRoot'] ?? '')
const nativeIdentityPorts = {
  profile, packaged: app.isPackaged, executable: process.execPath,
  localAppData: process.env['LOCALAPPDATA'] ?? '', appData: process.env['APPDATA'] ?? '', registry,
  shortcut: (file: string) => shell.readShortcutLink(file),
  updateShortcut: (file: string, clsid: string, cwd: string) => shell.writeShortcutLink(file, 'update', { target: process.execPath, toastActivatorClsid: clsid, cwd }),
}
let activationHandler: (tag: string) => void = () => undefined
let activationRegistered = false
let nativeBootstrap: Notification | undefined
app.on('will-quit', () => { nativeBootstrap?.removeAllListeners(); nativeBootstrap = undefined })
function registerActivation(): void {
  if (activationRegistered || profile !== 'prod' || !app.isPackaged) return
  activationRegistered = true
  Notification.handleActivation(details => {
    const tag = parseNativeActivation(details)
    if (tag !== undefined) activationHandler(tag)
  })
}

function startOwner(): void {
  const packagedOrigin = 'taskflow://app'
  const devOrigin = 'http://127.0.0.1:5173'
  const expectedOrigin = app.isPackaged ? packagedOrigin : devOrigin
  const busyGate = new FoundationBusyGate()
  const sessions = new DocumentSessions(expectedOrigin)
  const controls = new DocumentSessions(expectedOrigin)
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
  // IA opcional: segredo cifrado no userData, consentimento e pedidos em memória, rede injetável.
  // O cenário `ai` do harness usa proteção/transporte fictícios e diretório próprio.
  const aiHarness = harnessScenario?.name === 'ai'
  const aiDirectory = aiHarness ? path.join(app.getPath('userData'), 'ai-harness') : app.getPath('userData')
  if (aiHarness) mkdirSync(aiDirectory, { recursive: true })
  const aiRepository = new FileAiProviderConfig(
    aiDirectory,
    aiHarness ? createHarnessAiProtection() : createNativeProtection(),
  )
  const aiConsents = new AiConsentRegistry()
  const aiRequests = new AiRequestRegistry()
  const aiTransport = aiHarness ? createHarnessAiTransport() : createNetTransport()
  const aiProviders = createAiProviderService({
    repository: aiRepository,
    consents: aiConsents,
    requests: aiRequests,
    tester: createProviderConnectionTester(aiTransport),
  })
  const aiSuggestions = createAiSuggestionService({
    repository: aiRepository,
    consents: aiConsents,
    requests: aiRequests,
    suggester: createProviderSubtaskSuggester(aiTransport),
    generateRequestId: () => randomBytes(24).toString('base64url'),
  })
  const aiIpc = new AiIpcService({ sessions, providers: aiProviders, suggestions: aiSuggestions })
  sessions.onInvalidated((key) => aiIpc.forgetDocument(key))
  let mainWindow: BrowserWindow | null = null
  let quickWindow: BrowserWindow | null = null
  let quitDrained = false
  const captureEpochs: Record<SurfaceRole, number> = { MANAGER: 0, QUICK_ADD: 0 }
  const captureClock = { monotonic: () => performance.now(), arm: (ms: number, callback: () => void) => {
    const timer = setTimeout(callback, ms); return () => clearTimeout(timer)
  } }
  let harnessClipboardText = '', harnessClipboardReads = 0
  const captureReader = new ClipboardCaptureReader({ readText: async () => {
    if (harnessScenario?.name === 'entries' || harnessScenario?.name === 'ui-bench') { harnessClipboardReads++; return harnessClipboardText }
    return clipboard.readText()
  } }, captureClock)
  const captureInbox = new MemoryCaptureInbox(captureClock, { next: () => randomUUID() })
  const windowFor = (role: SurfaceRole): BrowserWindow | null => role === 'MANAGER' ? mainWindow : quickWindow
  let shutdownStarted = false
  let tray: DesktopTray | undefined
  let runtime: ReturnType<typeof createReminderRuntime> | undefined
  let reminderState: ReminderServiceStatus = 'RECOVERING'
  let reminderCapability: ReminderCapability = profile === 'prod' ? 'UNAVAILABLE' : 'FAKE'
  let nativeIdentityReady = false
  let started = false
  let pendingActivation: string | undefined
  let startupTimer: ReturnType<typeof setInterval> | undefined
  let coldTimer: ReturnType<typeof setTimeout> | undefined
  const startup = new StartupService({
    installed: () => profile === 'prod' && app.isPackaged && nativeIdentityReady,
    validate: () => prepareNativeIdentity({ ...nativeIdentityPorts, readonlyOnly: true }), executable: process.execPath, registry,
    get: () => app.getLoginItemSettings({ path: process.execPath, args: [LOGIN_ARGUMENT] }),
    // Windows: o interruptor é `openAtLogin`; `enabled` é macOS-only e não grava o Run.
    set: enabled => app.setLoginItemSettings({ name: STARTUP_NAME, path: process.execPath, args: [LOGIN_ARGUMENT], openAtLogin: enabled }),
    changed: () => desktopIpc.emit('desktop-status-changed'),
  })
  function windowPort(window: BrowserWindow): DesktopWindow {
    return { destroyed: () => window.isDestroyed(), hide: () => window.hide(), show: () => window.show(),
      focus: () => window.focus(), restore: () => { if (window.isMinimized()) window.restore() } }
  }
  const lifecycle: DesktopLifecycle = new DesktopLifecycle({
    window: role => { const window = windowFor(role); return window === null ? undefined : windowPort(window) },
    create: role => {
      const window = createMainWindow(role)
      if (role === 'MANAGER') mainWindow = window; else quickWindow = window
      void window.loadURL(resolveDevelopmentUrl()).catch(() => { if (!window.isDestroyed()) window.destroy() })
      return windowPort(window)
    },
    admit: role => { const window = windowFor(role); if (window !== null && !window.isDestroyed()) sessions.register(window.webContents, role) },
    withdraw: role => {
      captureEpochs[role] += 1
      const window = windowFor(role)
      if (window !== null && !window.isDestroyed()) sessions.unregister(window.webContents.id)
      if (role === 'MANAGER') {
        shortcuts.releaseAllEditing()
        if (startupTimer !== undefined) clearInterval(startupTimer)
        startupTimer = undefined
      }
    },
    suspended: role => { aiIpc.suspend(); desktopIpc.emit('surface-suspended', role) },
    active: role => {
      desktopIpc.emit('surface-active', role)
      if (role === 'MANAGER') {
        void startup.read()
        startupTimer ??= setInterval(() => { void startup.read() }, 60000)
      }
    },
    pauseReminders: () => { shortcuts.suspend(true); runtime?.service.suspend(); coordinator.cancelOwner(REMINDER_OWNER) },
    resumeReminders: async () => {
      const service = runtime?.service
      if (!service) return false
      service.resume()
      // Uma unidade anterior pode ainda terminar depois de suspend. Não antecipar admissão.
      const deadline = performance.now() + 5000
      while (service.busy && lifecycle.power !== 'QUITTING' && performance.now() < deadline) {
        await new Promise<void>(resolve => setTimeout(resolve, 10))
      }
      return lifecycle.power !== 'QUITTING' && await service.recover()
    },
    resumed: () => shortcuts.suspend(false),
    stop: () => { captureInbox.clear(); entries.dispose(); runtime?.dispose(); void shutdownStorage(); tray?.destroy(); tray = undefined },
    quit: () => { void shortcuts.stop().finally(() => { quitDrained = true; app.quit() }) },
  })
  const desktopIpc = new DesktopIpcService({
    control: controls, product: sessions, storage: coordinator, reminders: () => runtime?.service,
    status: role => ({ surfaceSequence: 1, visibility: lifecycle.visibilityFor(role), recovery: lifecycle.power,
      reminders: reminderState, reminderCapability, startup: startup.state }),
    startup: (desired, current) => startup.set(desired, current), quit: () => lifecycle.quit(),
  })
  const harnessNativeActions: Record<string, number> = {}
  const nativeHarness = harnessScenario?.name === 'entries-native' || harnessScenario?.name === 'entries-native-reopen'
  const shortcuts = new ShortcutController({ registry: electronShortcutRegistry,
    preferences: new FileShortcutPreferences(app.getPath('userData')), clock: captureClock,
    nativeEnabled: profile === 'prod' || nativeHarness,
    invoke: action => {
      if (nativeHarness) harnessNativeActions[action] = (harnessNativeActions[action] ?? 0) + 1
      if (action === 'CAPTURE_CLIPBOARD') void captureGlobally()
      else { try { lifecycle.open(action === 'QUICK_ADD' ? 'QUICK_ADD' : 'MANAGER') } catch { /* Abertura pode ser repetida pelo usuário. */ } }
    },
    changed: () => { void shortcuts.settings().then(result => {
      if (result.status === 'ok') desktopIpc.shortcutsChanged(result.settings.configRevision, result.settings.statusSequence)
    }) },
  })
  const entries = new EntryIpcService({ product: sessions, control: controls, inbox: captureInbox, clipboard: captureReader,
    shortcuts, open: role => lifecycle.open(role),
    focused: id => BrowserWindow.getFocusedWindow()?.webContents.id === id,
    reference: (role, ref) => desktopIpc.captureAvailable(role, ref),
  })
  async function captureGlobally(): Promise<void> {
    if (lifecycle.power !== 'ACTIVE') return
    const epoch = captureEpochs.QUICK_ADD
    const current = () => lifecycle.power === 'ACTIVE' && epoch === captureEpochs.QUICK_ADD
    const result = await captureReader.read(current)
    if (!current() || !result.ok) return
    const capture = captureInbox.stage('QUICK_ADD', result.draft)
    if (!capture) return
    desktopIpc.captureAvailable('QUICK_ADD', capture)
    try { lifecycle.open('QUICK_ADD') } catch { /* Staged conserva TTL se a abertura falhar. */ }
  }
  const activation = new ReminderActivationRoute(() => Date.now(), () => lifecycle.open(), tag => desktopIpc.locate(tag))
  activationHandler = tag => {
    if (!started) { pendingActivation = tag; return }
    if (coldTimer !== undefined) clearTimeout(coldTimer)
    coldTimer = undefined
    if (activation.accept(tag)) activation.ready()
  }
  app.on('second-instance', (_event, _argv, _cwd, data: unknown) => {
    const tag = parseActivationRelay(data)
    if (tag !== undefined) activationHandler(tag)
    else if (started) lifecycle.open()
  })

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
  function createSurface(options: { show: boolean; register: boolean; role?: SurfaceRole }): BrowserWindow | null {
    const role = options.role ?? 'MANAGER'
    const preload = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'preload', role === 'MANAGER' ? 'index.cjs' : 'quick-add.cjs')
    const window = new BrowserWindow({
      width: role === 'MANAGER' ? 780 : 480,
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
    if (options.register && !sessions.register(contents, role)) {
      window.destroy()
      return null
    }
    if (options.register && !controls.register(contents, role)) { window.destroy(); return null }

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
      if (details.isMainFrame && !details.isSameDocument) { captureEpochs[role] += 1; sessions.invalidate(contentsId); controls.invalidate(contentsId) }
    })
    contents.on('did-navigate', () => { sessions.invalidate(contentsId); controls.invalidate(contentsId) })
    contents.on('render-process-gone', () => {
      sessions.unregister(contentsId); controls.unregister(contentsId)
      if (windowFor(role) === window && !shutdownStarted) {
        window.destroy(); if (role === 'MANAGER') mainWindow = null; else quickWindow = null
        lifecycle.rendererGone(role)
      }
    })
    contents.once('destroyed', () => { captureEpochs[role] += 1; sessions.unregister(contentsId); controls.unregister(contentsId) })
    if (options.show) window.once('ready-to-show', () => window.show())
    return window
  }

  function createMainWindow(role: SurfaceRole = 'MANAGER'): BrowserWindow {
    const window = createSurface({ show: role === 'QUICK_ADD' || !coldLaunch, register: true, role })
    if (window === null) throw new Error('Main window could not be registered')
    window.once('closed', () => {
      if (mainWindow === window) mainWindow = null
      if (quickWindow === window) quickWindow = null
    })
    window.on('close', event => {
      // Falha conhecida posterior da bandeja não pode reter a única superfície sem saída.
      lifecycle.setTray(tray?.valid() === true)
      if (lifecycle.close(role)) event.preventDefault()
    })
    window.on('query-session-end', () => lifecycle.quit())
    window.on('session-end', () => lifecycle.quit())
    window.on('focus', () => { if (lifecycle.visibility === 'VISIBLE' && lifecycle.power === 'ACTIVE') void startup.read() })
    window.on('blur', () => { if (role === 'MANAGER') shortcuts.releaseAllEditing() })
    return window
  }

  function registerIpc(): void {
    ipcMain.handle(ENTRY_CHANNELS.openQuickAdd, (event, request: unknown) => entries.open(event, request, 'QUICK_ADD'))
    ipcMain.handle(ENTRY_CHANNELS.openTaskManager, (event, request: unknown) => entries.open(event, request, 'MANAGER'))
    ipcMain.handle(ENTRY_CHANNELS.captureClipboard, (event, request: unknown) => entries.capture(event, request))
    ipcMain.handle(ENTRY_CHANNELS.getPendingCapture, (event, request: unknown) => entries.pending(event, request))
    ipcMain.handle(ENTRY_CHANNELS.acknowledgeCapture, (event, request: unknown) => entries.acknowledge(event, request))
    ipcMain.handle(ENTRY_CHANNELS.discardCapture, (event, request: unknown) => entries.acknowledge(event, request, true))
    ipcMain.handle(ENTRY_CHANNELS.getShortcutSettings, (event, request: unknown) => entries.settings(event, request))
    ipcMain.handle(ENTRY_CHANNELS.setShortcut, (event, request: unknown) => entries.setShortcut(event, request))
    ipcMain.handle(ENTRY_CHANNELS.setShortcutEditing, (event, request: unknown) => entries.editing(event, request))
    ipcMain.handle(FOUNDATION_CHANNEL, (event, request: unknown) =>
      handleFoundationInvocation(profile, event, request, sessions, busyGate, () =>
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
    ipcMain.handle(AI_CHANNELS.getAiProviderStatus, (event, request: unknown) => aiIpc.handleStatus(event, request))
    ipcMain.handle(AI_CHANNELS.saveAiProviderConfig, (event, request: unknown) => aiIpc.handleSave(event, request))
    ipcMain.handle(AI_CHANNELS.removeAiProviderConfig, (event, request: unknown) => aiIpc.handleRemove(event, request))
    ipcMain.handle(AI_CHANNELS.authorizeAiUse, (event, request: unknown) => aiIpc.handleAuthorize(event, request))
    ipcMain.handle(AI_CHANNELS.testAiConnection, (event, request: unknown) => aiIpc.handleTest(event, request))
    ipcMain.handle(AI_CHANNELS.prepareAiSuggestion, (event, request: unknown) => aiIpc.handlePrepare(event, request))
    ipcMain.handle(AI_CHANNELS.suggestAiSubtasks, (event, request: unknown) => aiIpc.handleSuggest(event, request))
    ipcMain.handle(AI_CHANNELS.cancelAiSuggestion, (event, request: unknown) => aiIpc.handleCancel(event, request))
    ipcMain.handle(DESKTOP_CHANNELS.status, (event, request: unknown) => desktopIpc.status(event, request))
    ipcMain.handle(DESKTOP_CHANNELS.startup, (event, request: unknown) => desktopIpc.startup(event, request))
    ipcMain.handle(DESKTOP_CHANNELS.quit, (event, request: unknown) => desktopIpc.quit(event, request))
    ipcMain.handle(DESKTOP_CHANNELS.subscribe, (event, request: unknown) => desktopIpc.subscribe(event, request))
    ipcMain.handle(DESKTOP_CHANNELS.unsubscribe, (event, request: unknown) => desktopIpc.unsubscribe(event, request))
    ipcMain.handle(DESKTOP_RESOLVE_CHANNEL, (event, request: unknown) => desktopIpc.resolve(event, request))
  }

  /**
   * Encerramento: fecha a admissão do IPC, invalida sessões/listeners, cancela entradas de
   * sessão ainda não iniciadas, drena as unidades internas admitidas e fecha a conexão. As
   * unidades são síncronas: uma unidade em commit termina antes de este código executar.
   */
  function shutdownStorage(): ShutdownReport | undefined {
    if (shutdownStarted) return undefined
    shutdownStarted = true
    runtime?.dispose()
    if (coldTimer !== undefined) clearTimeout(coldTimer)
    if (startupTimer !== undefined) clearInterval(startupTimer)
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
      ...Object.values(AI_CHANNELS),
      ...Object.values(DESKTOP_CHANNELS), DESKTOP_RESOLVE_CHANNEL, ...Object.values(ENTRY_CHANNELS),
    ]) {
      ipcMain.removeHandler(channel)
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) sessions.unregister(window.webContents.id)
    }
    aiRequests.abortAll()
    aiConsents.clearAll()
    stateIpc.dispose()
    desktopIpc.dispose()
    return coordinator.shutdown()
  }

  async function startApplication(): Promise<void> {
    const diagnostic = (stage: string): void => { if (nativeHarness) process.stdout.write(`TASKFLOW_NATIVE_DIAGNOSTIC ${JSON.stringify({stage})}\n`) }
    diagnostic('assets')
    await serveAssets()
    configureSession()
    Menu.setApplicationMenu(null)
    registerActivation()
    const icon = app.isPackaged ? path.join(process.resourcesPath, 'taskflow.ico') : path.join(app.getAppPath(), 'build', 'icons', 'taskflow.ico')
    let submit = fakeReminderSubmit
    nativeIdentityReady = profile === 'prod' && await prepareNativeIdentity(nativeIdentityPorts)
    if (nativeIdentityReady && Notification.isSupported()) {
      // Bootstrap cria o presenter/COM sem show, claim ou toast fictício.
      nativeBootstrap = new Notification({ title: identity.name })
      reminderCapability = 'NATIVE'
      submit = createNativeNotifier({ supported: () => Notification.isSupported(), create: options => new Notification(options) }, icon, () => {
        reminderState = 'UNAVAILABLE'; desktopIpc.emit('desktop-status-changed')
      }, tag => activationHandler(tag))
    } else if (profile === 'prod') {
      reminderState = 'UNAVAILABLE'
      submit = (_candidate, completed) => { completed(); return () => undefined }
    }
    tray = createDesktopTray({
      name: identity.name,
      icon: () => nativeImage.createFromPath(icon),
      create: image => new Tray(image),
      menu: items => Menu.buildFromTemplate([...items]),
      open: () => lifecycle.open(),
      quickAdd: () => lifecycle.open('QUICK_ADD'),
      capture: () => { void captureGlobally() },
      quit: () => lifecycle.quit(),
    })
    // Falha inicial (ícone/menu/criação) mantém a janela visível e o fechamento seguro.
    lifecycle.setTray(tray?.valid() === true)
    diagnostic('shortcuts'); await shortcuts.start(); diagnostic('shortcuts-ready')
    // Indisponibilidade do banco de produto não vira estado vazio: o IPC devolve o código.
    // Cenários de migração (seed SQL1, inspeção e kill antes/durante/depois do commit) precisam
    // do arquivo intocado: nem o coordenador abre nem o IPC de estado/comandos é registrado,
    // pois a primeira leitura do renderer abriria/migraria o banco antes do harness.
    if (harnessScenario === null || !harnessSkipsCoordinatorStart(harnessScenario)) {
      coordinator.start()
      registerIpc()
      runtime = createReminderRuntime({ storage: coordinator,
        active: () => lifecycle.remindersActive && (profile !== 'prod' || reminderCapability === 'NATIVE'), submit,
        statusChanged: status => { reminderState = status; desktopIpc.emit('desktop-status-changed') },
        effect: code => { if (code === 'NATIVE_NOTIFICATION_FAILED') { reminderState = 'UNAVAILABLE'; desktopIpc.emit('desktop-status-changed') } },
      })
      undo.onInvalidated(event => {
        if (event.reason === 'BACKUP_RESTORED') resetForBackup(runtime)
      })
      // Cenários explícitos de harness suspendem o scheduler para manter probes de
      // revisão/digest determinísticas; `reminders` mantém a agenda real (com notifier fake) e
      // o fluxo normal (foundation) também. Cenários futuros de lembrete devem declarar-se aqui.
      if (harnessScenario === null || harnessScenario.name === 'reminders') runtime.service.wake()
      else runtime.service.suspend()
    }
    mainWindow = createMainWindow()
    diagnostic('renderer'); await mainWindow.loadURL(resolveDevelopmentUrl()); diagnostic('renderer-ready')
    started = true
    if (coldLaunch || (profile === 'prod' && process.argv.includes(LOGIN_ARGUMENT))) {
      if (lifecycle.trayValid) lifecycle.hide()
      else lifecycle.open()
    }
    if (pendingActivation !== undefined) { activationHandler(pendingActivation); pendingActivation = undefined }
    else if (coldLaunch) coldTimer = setTimeout(() => lifecycle.open(), 10000)
    powerMonitor.on('suspend', () => lifecycle.suspend())
    powerMonitor.on('resume', () => lifecycle.resume())
    if (harnessScenario !== null) {
      await runProductHarness(harnessScenario, {
        app,
        coordinator,
        sessions,
        stateIpc,
        faults: harnessFaults,
        mainWindow,
        lifecycle,
        entries: {
          window: windowFor, clipboardText: text => { harnessClipboardText = text }, reads: () => harnessClipboardReads,
          globalCapture: captureGlobally,
          shortcuts, nativeActions: () => ({ ...harnessNativeActions }),
          metrics: () => ({ mainHeapBytes: process.memoryUsage().heapUsed,
            renderers: app.getAppMetrics().filter(metric => metric.type === 'Tab').map(metric => ({ pid: metric.pid, workingSetKiB: metric.memory.workingSetSize })) }),
          sandboxed: role => { const window = windowFor(role); return window ? app.getAppMetrics().find(metric => metric.pid === window.webContents.getOSProcessId())?.sandboxed : undefined },
          rejectManagerOperations: async () => {
            if (!quickWindow) return false
            const event = { sender: quickWindow.webContents, senderFrame: quickWindow.webContents.mainFrame }
            const replies = await Promise.all([
              entries.open(event, { version: 1 }, 'QUICK_ADD'), entries.setShortcut(event, { version: 1 }),
              entries.editing(event, { version: 1, editing: true }), taskIpc.handleUpdate(event, { version: 5 }),
              taskIpc.handleStatus(event, { version: 4 }), trashIpc.handleMove(event, { version: 2 }),
              backupIpc.handleExport(event, { version: 1 }), desktopIpc.startup(event, { version: 1, desired: true }),
              aiIpc.handleStatus(event, { version: 1 }),
              aiIpc.handleSave(event, { version: 1, expectedRevision: '0', provider: 'OPENAI', model: 'm' }),
              aiIpc.handleRemove(event, { version: 1 }),
              aiIpc.handleAuthorize(event, { version: 1, scope: 'CREDENTIAL' }),
              aiIpc.handleTest(event, { version: 1, probe: 'MODEL_LIST' }),
              aiIpc.handlePrepare(event, { version: 1, title: 'T', description: '', existingSubtaskCount: 0 }),
              aiIpc.handleSuggest(event, { version: 1, requestId: 'A'.repeat(32) }),
              aiIpc.handleCancel(event, { version: 1, requestId: 'A'.repeat(32) }),
            ])
            return replies.every(reply => reply.status === 'error' && reply.code === 'UNAUTHORIZED')
          },
        },
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

  app.on('window-all-closed', () => {
    lifecycle.windowAllClosed(tray?.valid() === true)
  })
  app.on('before-quit', event => { if (!quitDrained) event.preventDefault(); lifecycle.quit() })

  void app.whenReady().then(startApplication).catch(() => app.quit())
}

if (ownsProfile) startOwner()
else if (relayMode) {
  // Relay transitório: nenhum coordenador, banco, janela ou agenda foi criado.
  void app.whenReady().then(async () => {
    if (!await prepareNativeIdentity(nativeIdentityPorts)) { app.quit(); return }
    const deadline = setTimeout(() => app.quit(), 10000)
    activationHandler = tag => {
      clearTimeout(deadline)
      const owned = app.requestSingleInstanceLock({ version: 1, kind: 'reminder-activation', tag })
      if (!owned) { app.quit(); return }
      startOwner()
      activationHandler(tag)
    }
    registerActivation()
    nativeBootstrap = new Notification({ title: identity.name })
  }).catch(() => app.quit())
} else app.quit()
