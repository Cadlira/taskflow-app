// Harness restrito de produto (TFA-003). Só executa no perfil `test` e quando o processo
// recebe `--product-harness=<cenário>`. Usa unidades internas do coordenador para confirmar
// dados fictícios e a bridge pública real para ler; não acrescenta canal, writer ou hook de
// teste ao preload, e não implementa gerenciamento de tarefas.
import type { App, BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readBackupFile } from '../../application/backup/backup-file.js'
import { formatRevision } from '../../application/storage/revisions.js'
import type { TrashEntryRef, UnitResult } from '../../application/storage/unit-of-work.js'
import type { UndoFacts } from '../../application/tasks/undo-types.js'
import { UndoRegistry } from '../../application/undo/undo-registry.js'
import {
  changeTaskStatusInUnit,
  updateTaskInUnit,
} from '../../application/tasks/task-commands.js'
import type { BackupResourceLedger } from '../../application/backup/backup-resources.js'
import { BACKUP_PREVIEW_TTL_MS } from '../../contracts/backup.js'
import type { BackupWriteFaultPoint, BackupWriteFaults } from '../backup/backup-file-write.js'
import type { StateSnapshotResult } from '../../contracts/state.js'
import { utf8ByteLength } from '../../contracts/text.js'
import { resolveNextScheduledAt } from '../../domain/task-recurrence.js'
import type { Task } from '../../domain/task.js'
import { BackupCommandServices } from '../backup/backup-restore-service.js'
import type { BackupDialogBroker, BackupJobGate } from '../backup/backup-job.js'
import type { BackupRestoreRegistry } from '../backup/backup-restore-registry.js'
import type { BackupCommandIpcService } from '../ipc/backup.js'
import type { DocumentSessions } from '../ipc/document-sessions.js'
import type { StateIpcService } from '../ipc/state.js'
import { StorageCoordinator, type ShutdownReport } from '../storage/coordinator.js'
import { ProductDatabase, type StorageFaultPoint, type StorageFaults } from '../storage/product-database.js'
import { PRODUCT_STORAGE_DEFINITION, PRODUCT_V1_DEFINITION } from '../storage/product-schema.js'
import { buildFictitiousTask, buildFictitiousTasks, buildMinimalFictitiousTask, fictitiousText } from './fixtures.js'

const HARNESS_PREFIX = '--product-harness='
const MARKER = 'TASKFLOW_PRODUCT_TEST '
const CRASH_POINTS: readonly StorageFaultPoint[] = [
  'unit:before-begin',
  'unit:in-transaction',
  'unit:before-commit',
  'unit:after-commit',
  'unit:before-publish',
  'migrate:in-transaction',
  'migrate:before-commit',
  'migrate:after-commit',
]
const BACKUP_WRITE_FAULT_POINTS: readonly BackupWriteFaultPoint[] = [
  'temp:before-write',
  'temp:after-write',
  'temp:after-sync',
  'rename:before',
  'rename:after',
  'readback:before',
]

export type ProductHarnessScenario =
  | { name: 'bridge' }
  | { name: 'reopen' }
  | { name: 'bench' }
  | { name: 'drain' }
  | { name: 'tasks' }
  | { name: 'ui-bench' }
  | { name: 'seed-sql1' }
  | { name: 'inspect-sql1' }
  | { name: 'recurrence' }
  | { name: 'trash' }
  | { name: 'backup'; exportFail?: BackupWriteFaultPoint }
  | { name: 'a11y'; opener: 'real' | 'fake' }
  | { name: 'crash'; point: StorageFaultPoint; unit: 'save' | 'claim' | 'migrate' | 'move' | 'restore' | 'revert' }

/** Cenários que precisam do arquivo em SQL 1 intocado: o coordenador de produto não abre antes. */
export function harnessSkipsCoordinatorStart(scenario: ProductHarnessScenario): boolean {
  return (
    scenario.name === 'seed-sql1' ||
    scenario.name === 'inspect-sql1' ||
    (scenario.name === 'crash' && scenario.unit === 'migrate')
  )
}

export interface ProductHarnessBackupDependencies {
  ipc: BackupCommandIpcService
  services: BackupCommandServices
  registry: BackupRestoreRegistry
  ledger: BackupResourceLedger
  gate: BackupJobGate
  undo: UndoRegistry
  /** Pontos de falha da gravação, armados apenas pelo cenário `backup` do harness. */
  writeFaults: BackupWriteFaults
}

export interface ProductHarnessDependencies {
  app: App
  coordinator: StorageCoordinator
  sessions: DocumentSessions
  stateIpc: StateIpcService
  faults: StorageFaults
  mainWindow: BrowserWindow
  /** Cria uma superfície de teste com o preload normal; `register: false` não a autoriza. */
  createSurface: (register: boolean) => BrowserWindow | null
  surfaceUrl: string
  expectedOrigin: string
  productDatabaseFile: string
  foundationProofFile: string
  shutdownStorage: () => ShutdownReport | undefined
  /** Porta de abertura externa do main; o harness de teste pode substituí-la por um fake. */
  opener: { openExternal(href: string): Promise<void> }
  /** Serviços de backup reais do main, para os cenários fictícios (nenhum perfil real é usado). */
  backup?: ProductHarnessBackupDependencies
}

/** Aceita exatamente um argumento de harness com cenário conhecido; qualquer outra forma é ignorada. */
export function parseProductHarnessScenario(argv: readonly string[]): ProductHarnessScenario | null {
  const matches = argv.filter((argument) => argument.startsWith(HARNESS_PREFIX))
  const value = matches[0]?.slice(HARNESS_PREFIX.length)
  if (matches.length !== 1 || value === undefined) return null
  if (value === 'bridge' || value === 'reopen' || value === 'bench' || value === 'drain') return { name: value }
  if (value === 'tasks' || value === 'ui-bench' || value === 'seed-sql1' || value === 'inspect-sql1' || value === 'recurrence' || value === 'trash') {
    return { name: value }
  }
  if (value === 'a11y') return { name: 'a11y', opener: 'real' }
  // Runner hospedado: sem navegador padrão garantido, a abertura usa um opener falso e o shell
  // real continua sendo prova da máquina de referência.
  if (value === 'a11y|fake-opener') return { name: 'a11y', opener: 'fake' }
  if (value === 'backup') return { name: 'backup' }
  // Falha injetada de gravação (somente harness/testes): nenhum diálogo nativo é aberto.
  if (value.startsWith('backup|')) {
    const [name, kind, point, ...rest] = value.split('|')
    if (name !== 'backup' || kind !== 'export-fail' || rest.length > 0) return null
    if (!BACKUP_WRITE_FAULT_POINTS.includes(point as BackupWriteFaultPoint)) return null
    return { name: 'backup', exportFail: point as BackupWriteFaultPoint }
  }

  const [name, point, unit, ...rest] = value.split('|')
  if (name !== 'crash' || rest.length > 0) return null
  if (!CRASH_POINTS.includes(point as StorageFaultPoint)) return null
  if (unit !== undefined && unit !== 'save' && unit !== 'claim' && unit !== 'migrate' && unit !== 'move' && unit !== 'restore' && unit !== 'revert') return null
  return { name: 'crash', point: point as StorageFaultPoint, unit: unit ?? 'save' }
}

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`${MARKER}${JSON.stringify(payload)}\n`)
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonical(record[key])]),
  )
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')
}

function fileHash(file: string): string | null {
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null
}

function evaluate<T>(window: BrowserWindow, expression: string): Promise<T> {
  return window.webContents.executeJavaScript(expression, true) as Promise<T>
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await delay(50)
  }
  return false
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Mede a duração de uma unidade real (soma de `onUnitMeasured`) e devolve o tempo de parede. */
async function measuredUnit(
  coordinator: StorageCoordinator,
  durations: number[],
  work: () => Promise<void>,
): Promise<number> {
  const stop = coordinator.onUnitMeasured((milliseconds) => durations.push(milliseconds))
  const started = performance.now()
  await work()
  stop()
  return performance.now() - started
}

function runtimeInfo(deps: ProductHarnessDependencies): Record<string, unknown> {
  return {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    packaged: deps.app.isPackaged,
    arch: process.arch,
    storage: deps.coordinator.runtime ?? null,
    availability: deps.coordinator.availability,
  }
}

const SUBSCRIBE_SCRIPT = `(async () => {
  window.__tf = { updates: [] }
  const result = await window.taskflowDesktop.subscribeState({ version: 3 }, (update) => {
    window.__tf.updates.push(update.type === 'snapshot'
      ? { type: 'snapshot', revision: update.snapshot.revision, undoEpoch: update.snapshot.undoEpoch, tasks: update.snapshot.tasks.length, trash: update.snapshot.trash.length }
      : update)
  })
  return result.status === 'ok'
    ? { status: 'ok', subscriptionId: result.subscriptionId, revision: result.snapshot.revision, undoEpoch: result.snapshot.undoEpoch, tasks: result.snapshot.tasks.length }
    : result
})()`

const LAST_UPDATE_SCRIPT = `(() => {
  if (!window.__tf) return null
  const snapshots = window.__tf.updates.filter((update) => update.type === 'snapshot')
  return { count: window.__tf.updates.length, last: snapshots.length ? snapshots[snapshots.length - 1] : null }
})()`

const SNAPSHOT_SCRIPT = 'window.taskflowDesktop.getStateSnapshot({ version: 3 })'

interface SubscribeProbe {
  status: string
  subscriptionId?: string
  revision?: string
  undoEpoch?: number
  tasks?: number
  code?: string
}

interface UpdateProbe {
  count: number
  last: { revision: string; undoEpoch: number; tasks: number; trash: number } | null
}

async function loadSurface(window: BrowserWindow, url: string): Promise<void> {
  try {
    await window.loadURL(url)
  } catch {
    // Carga recusada (ex.: 404 do protocolo) ainda produz um documento para as negativas.
  }
}

async function runBridge(deps: ProductHarnessDependencies): Promise<void> {
  const { coordinator, mainWindow: surfaceA, stateIpc, sessions } = deps
  const checks: Record<string, boolean> = {}
  const info: Record<string, unknown> = { runtime: runtimeInfo(deps) }
  const currentRevision = (): string => formatRevision(coordinator.confirmedRevision ?? 0n)

  const frame = surfaceA.webContents.mainFrame
  info['document'] = { frameOrigin: frame.origin, url: frame.url, expectedOrigin: deps.expectedOrigin }
  checks['originMatches'] = frame.origin === deps.expectedOrigin
  checks['availabilityReady'] = coordinator.availability.state === 'ready'

  const catalog = await evaluate<Record<string, unknown>>(
    surfaceA,
    `({
      keys: Object.keys(window.taskflowDesktop).sort(),
      frozen: Object.isFrozen(window.taskflowDesktop),
      globals: ['require', 'process', 'module', 'Buffer', 'ipcRenderer', 'electron', '__dirname'].map((name) => typeof window[name]),
    })`,
  )
  info['catalog'] = catalog
  // Vinte e um wrappers: diagnóstico (1), estado (3), tarefas create/check v3 (2), update/status v4
  // (2), origem (1), lixeira/undo (8) e backup (4).
  checks['catalogClosed'] =
    JSON.stringify(catalog['keys']) ===
      JSON.stringify([
        'cancelBackupRestore',
        'changeTaskStatus',
        'clearUndoOffer',
        'confirmBackupRestore',
        'createTask',
        'deleteTrashItem',
        'emptyTrash',
        'exportBackup',
        'getStateSnapshot',
        'moveTaskToTrash',
        'openTaskSource',
        'prepareBackupRestore',
        'prepareTrashConfirmation',
        'prepareTrashView',
        'restoreTrashItem',
        'setSubtaskDone',
        'subscribeState',
        'undoLastTaskAction',
        'unsubscribeState',
        'updateTask',
        'verifyFoundation',
      ]) &&
    catalog['frozen'] === true &&
    (catalog['globals'] as string[]).every((kind) => kind === 'undefined')

  const startRevision = currentRevision()
  const initial = await evaluate<StateSnapshotResult>(surfaceA, SNAPSHOT_SCRIPT)
  checks['initialSnapshot'] =
    initial.status === 'ok' && initial.snapshot.revision === startRevision && initial.snapshot.undoEpoch >= 1

  // Duas superfícies de teste autorizadas, ambas com o preload normal.
  const surfaceB = deps.createSurface(true)
  if (surfaceB === null) throw new Error('second surface unavailable')
  await loadSurface(surfaceB, deps.surfaceUrl)
  const subscriptionA = await evaluate<SubscribeProbe>(surfaceA, SUBSCRIBE_SCRIPT)
  const subscriptionB = await evaluate<SubscribeProbe>(surfaceB, SUBSCRIBE_SCRIPT)
  checks['subscribeBoth'] =
    subscriptionA.status === 'ok' &&
    subscriptionB.status === 'ok' &&
    subscriptionA.subscriptionId !== subscriptionB.subscriptionId
  const repeated = await evaluate<SubscribeProbe>(
    surfaceA,
    `window.taskflowDesktop.subscribeState({ version: 3 }).then((result) => ({ status: result.status, subscriptionId: result.subscriptionId }))`,
  )
  checks['subscribeIdempotent'] =
    repeated.subscriptionId === subscriptionA.subscriptionId && stateIpc.activeSubscriptions === 2

  // Commits internos fictícios: todos os campos, mínimo, Unicode e um registro acima de 256 KiB.
  const tasks: Task[] = [
    ...buildFictitiousTasks(40),
    buildMinimalFictitiousTask('fict-minima'),
    { ...buildFictitiousTask(9001), description: fictitiousText(400_000, 9001) },
  ]
  const first = tasks[0]
  const second = tasks[1]
  const sixth = tasks[5]
  if (first === undefined || second === undefined || sixth === undefined) throw new Error('fixtures unavailable')

  const saved = await coordinator.run((unit) => unit.saveTasks(tasks))
  const moved = await coordinator.run((unit) => {
    unit.moveToTrash(first.id, '2026-09-10T08:00:00.000Z')
    return unit.moveToTrash(second.id, '2026-09-11T08:00:00.000Z')?.id
  })
  // O mesmo ID passa a existir nas duas coleções; a restauração precisa recusar sem alterar.
  const recreated = await coordinator.run((unit) => unit.saveTask(first))
  const collision = await coordinator.run((unit) => unit.restoreFromTrash(first.id, (task) => task))
  const noop = await coordinator.run((unit) => unit.saveTask(sixth))
  checks['internalCommits'] =
    saved.ok && saved.committed && moved.ok && moved.committed && recreated.ok && recreated.committed
  checks['restoreCollision'] = collision.ok && !collision.committed && collision.value.status === 'ID_EXISTS'
  checks['noopWithoutRevision'] =
    noop.ok && !noop.committed && recreated.ok && noop.revision === recreated.revision

  const converged = await waitFor(async () => {
    const updateA = await evaluate<UpdateProbe | null>(surfaceA, LAST_UPDATE_SCRIPT)
    const updateB = await evaluate<UpdateProbe | null>(surfaceB, LAST_UPDATE_SCRIPT)
    return updateA?.last?.revision === currentRevision() && updateB?.last?.revision === currentRevision()
  })
  checks['twoSurfacesConverge'] = converged

  const snapshot = await evaluate<StateSnapshotResult>(surfaceA, SNAPSHOT_SCRIPT)
  const expectedActive = tasks.filter((task) => task.id !== second.id).sort((left, right) => (left.id < right.id ? -1 : 1))
  if (snapshot.status === 'ok') {
    const bridgeTasks = [...snapshot.snapshot.tasks].sort((left, right) => (left.task.id < right.task.id ? -1 : 1))
    checks['roundTripAllFields'] =
      digest(bridgeTasks.map((record) => record.task)) === digest(expectedActive) &&
      snapshot.snapshot.revision === currentRevision()
    checks['trashPreserved'] =
      snapshot.snapshot.trash.length === 2 &&
      snapshot.snapshot.trash.some((item) => item.task.id === first.id && item.deletedAt === '2026-09-10T08:00:00.000Z')
    checks['recordAbovePage'] = bridgeTasks.some((record) => utf8ByteLength(JSON.stringify(record)) > 256 * 1024)
    info['snapshot'] = {
      revision: snapshot.snapshot.revision,
      tasks: snapshot.snapshot.tasks.length,
      trash: snapshot.snapshot.trash.length,
      digest: digest(snapshot.snapshot),
    }
  } else {
    checks['roundTripAllFields'] = false
    info['snapshotError'] = snapshot.code
  }
  checks['readsDoNotMutate'] = recreated.ok && currentRevision() === formatRevision(recreated.revision)

  // Negativas pela bridge real: schemas v1/v2 antigos, limite de 1 KiB e token de outra sessão.
  // As sondas de versão continuam antigas (recusa de contrato); a de autorização usa v3 para
  // chegar à decisão de sessão em vez de parar no schema.
  const negatives = await evaluate<Array<{ status: string; code?: string }>>(
    surfaceA,
    `Promise.all([
      window.taskflowDesktop.getStateSnapshot({ version: 1 }),
      window.taskflowDesktop.getStateSnapshot({ version: 2, extra: true }),
      window.taskflowDesktop.getStateSnapshot({ version: 2, pad: 'x'.repeat(2000) }),
      window.taskflowDesktop.subscribeState({ version: 2, sql: 'SELECT 1' }),
      window.taskflowDesktop.unsubscribeState({ version: 2, subscriptionId: '../x' }),
      window.taskflowDesktop.unsubscribeState({ version: 3, subscriptionId: ${JSON.stringify(subscriptionB.subscriptionId ?? '')} }),
    ])`,
  )
  info['negatives'] = negatives.map((result) => result.code ?? result.status)
  checks['invalidRequestsRefused'] = negatives.slice(0, 5).every((result) => result.code === 'INVALID_REQUEST')
  checks['foreignUnsubscribeRefused'] = negatives[5]?.code === 'UNAUTHORIZED' && stateIpc.activeSubscriptions === 2

  const unsubscribed = await evaluate<Array<{ status: string }>>(
    surfaceA,
    `(async () => {
      const request = { version: 3, subscriptionId: ${JSON.stringify(subscriptionA.subscriptionId ?? '')} }
      return [await window.taskflowDesktop.unsubscribeState(request), await window.taskflowDesktop.unsubscribeState(request)]
    })()`,
  )
  checks['unsubscribeIdempotent'] =
    unsubscribed.every((result) => result.status === 'ok') && stateIpc.activeSubscriptions === 1

  // webContents desconhecido: mesmo preload e mesma URL, sem registro. Zero leitura de dados.
  const unitsBefore = coordinator.metrics.units
  const unknown = deps.createSurface(false)
  if (unknown !== null) {
    await loadSurface(unknown, deps.surfaceUrl)
    const refused = await evaluate<Array<{ status: string; code?: string }>>(
      unknown,
      `Promise.all([
        window.taskflowDesktop.getStateSnapshot({ version: 3 }),
        window.taskflowDesktop.subscribeState({ version: 3 }),
        window.taskflowDesktop.verifyFoundation({ version: 1 }),
      ])`,
    )
    checks['unknownContentsRefused'] =
      refused.every((result) => result.code === 'UNAUTHORIZED') && coordinator.metrics.units === unitsBefore
    unknown.destroy()
  } else {
    checks['unknownContentsRefused'] = false
  }

  // URL errada em superfície registrada: mesma origem, rota não autorizada.
  const wrongUrl = deps.createSurface(true)
  if (wrongUrl !== null) {
    await loadSurface(wrongUrl, `${deps.surfaceUrl}/index.html?probe=1`)
    const probe = await evaluate<{ status: string; code?: string } | null>(
      wrongUrl,
      `typeof window.taskflowDesktop === 'object' ? window.taskflowDesktop.getStateSnapshot({ version: 3 }) : null`,
    ).catch(() => null)
    info['wrongUrl'] = { url: wrongUrl.webContents.getURL(), result: probe?.code ?? probe?.status ?? 'no-bridge' }
    checks['wrongUrlRefused'] = probe === null || probe.code === 'UNAUTHORIZED'
    wrongUrl.destroy()
  } else {
    checks['wrongUrlRefused'] = false
  }

  // Reload da mesma URL: a sessão antiga, a inscrição e as entregas pendentes deixam de valer.
  const finished = new Promise<void>((resolve) => surfaceB.webContents.once('did-finish-load', () => resolve()))
  surfaceB.webContents.reload()
  await finished
  const afterReload = stateIpc.activeSubscriptions
  const reloadCommit = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(9100)))
  await delay(400)
  const leaked = await evaluate<boolean>(surfaceB, `typeof window.__tf !== 'undefined'`)
  const resubscribed = await evaluate<SubscribeProbe>(surfaceB, SUBSCRIBE_SCRIPT)
  info['afterReload'] = { subscriptions: afterReload, newSubscription: resubscribed.subscriptionId }
  // O documento novo (UI real) se reinscreve sozinho: a sessão anterior não vale mais e o token é novo.
  checks['reloadInvalidatesSession'] =
    reloadCommit.ok && reloadCommit.committed && !leaked && resubscribed.subscriptionId !== subscriptionB.subscriptionId
  checks['newDocumentResubscribes'] = resubscribed.status === 'ok' && resubscribed.revision === currentRevision()

  // Limite de documentos registrados no harness.
  const extras: BrowserWindow[] = []
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const extra = deps.createSurface(true)
    if (extra === null) break
    extras.push(extra)
  }
  info['documents'] = { registered: sessions.size, extras: extras.length }
  checks['documentLimit'] = sessions.size === 8 && deps.createSurface(true) === null
  for (const extra of extras) extra.destroy()
  await waitFor(() => sessions.size === 2, 5_000)
  checks['documentsReleased'] = sessions.size === 2

  // Diagnóstico e produto independentes: um não altera o banco do outro.
  const productBefore = fileHash(deps.productDatabaseFile)
  const proof = await evaluate<{ status: string }>(surfaceA, 'window.taskflowDesktop.verifyFoundation({ version: 1 })')
  const proofAfterVerify = fileHash(deps.foundationProofFile)
  checks['diagnosticKeepsProduct'] = proof.status === 'verified' && fileHash(deps.productDatabaseFile) === productBefore
  const productCommit = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(9200)))
  checks['productKeepsDiagnostic'] =
    productCommit.ok && productCommit.committed && fileHash(deps.foundationProofFile) === proofAfterVerify

  const final = await evaluate<StateSnapshotResult>(surfaceA, SNAPSHOT_SCRIPT)
  const summary =
    final.status === 'ok'
      ? {
          revision: final.snapshot.revision,
          tasks: final.snapshot.tasks.length,
          trash: final.snapshot.trash.length,
          digest: digest(final.snapshot),
        }
      : null
  checks['finalSnapshot'] = summary !== null && summary.revision === currentRevision()

  // Libera a superfície de teste: resta só a janela principal, cujo fechamento encerra o app.
  surfaceB.destroy()
  await waitFor(() => sessions.size === 1, 5_000)
  checks['testSurfaceReleased'] = sessions.size === 1 && stateIpc.trackedDocuments <= 1

  emit({ scenario: 'bridge', ok: Object.values(checks).every(Boolean), checks, info, summary })

  // O processo fica vivo para o teste de segunda instância. O runner pede a saída normal
  // (before-quit, drain e fechamento da conexão) criando um arquivo no perfil fictício.
  const quitRequest = path.resolve(deps.productDatabaseFile, '..', '..', '..', 'harness-quit')
  const poll = setInterval(() => {
    if (!existsSync(quitRequest)) return
    clearInterval(poll)
    deps.app.quit()
  }, 100)
}

async function runReopen(deps: ProductHarnessDependencies): Promise<void> {
  const snapshot = await evaluate<StateSnapshotResult>(deps.mainWindow, SNAPSHOT_SCRIPT)
  emit({
    scenario: 'reopen',
    ok: snapshot.status === 'ok',
    runtime: runtimeInfo(deps),
    summary:
      snapshot.status === 'ok'
        ? {
            revision: snapshot.snapshot.revision,
            tasks: snapshot.snapshot.tasks.length,
            trash: snapshot.snapshot.trash.length,
            digest: digest(snapshot.snapshot),
          }
        : { code: snapshot.code },
  })
}

function barrierFile(deps: ProductHarnessDependencies): string {
  return path.resolve(deps.productDatabaseFile, '..', '..', '..', 'harness-barrier.json')
}

/** Bloqueia o processo de teste no ponto pedido; o runner valida o PID e o encerra. */
async function runCrash(
  deps: ProductHarnessDependencies,
  point: StorageFaultPoint,
  unit: 'save' | 'claim' | 'migrate' | 'move' | 'restore' | 'revert',
): Promise<void> {
  const { coordinator } = deps

  if (unit === 'migrate') {
    // Migração real 1→2 sobre o perfil fictício semeado em SQL 1; o coordenador de produto não
    // abriu antes. A barreira fica dentro da transação de migração.
    const base = 0n
    deps.faults.at = (reached) => {
      if (reached !== point) return
      writeFileSync(barrierFile(deps), JSON.stringify({ point, pid: process.pid, baseRevision: formatRevision(base) }))
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
    }
    emit({ scenario: 'crash', armed: true, point, unit, pid: process.pid, baseRevision: '0' })
    const result = ProductDatabase.open(deps.productDatabaseFile, PRODUCT_STORAGE_DEFINITION, deps.faults)
    if (result.ok) result.database.close()
    // Só chega aqui se a barreira não foi alcançada: o runner trata como falha.
    emit({ scenario: 'crash', armed: false, point, reached: false })
    return
  }

  const claimTask = buildFictitiousTask(7001, { idPrefix: 'claim' })
  const pending = claimTask.reminders.find((reminder) => reminder.processedFor === undefined && reminder.type === 'OFFSET')
  if (unit === 'claim') await coordinator.run((target) => target.saveTask(claimTask))

  // Lixeira/reversão: o estado de partida (tarefa, entrada ou alvo alterado) é preparado ANTES
  // da barreira; a barreira intercepta a própria operação sob teste.
  const now = new Date('2026-10-04T12:00:00.000Z')
  let moveTaskId = ''
  let moveRevision = 1n
  let restoreEntry: TrashEntryRef | undefined
  let revertTarget: { id: string; expectedContentRevision: bigint } | undefined
  let revertBefore: Task | undefined
  if (unit === 'move' || unit === 'restore' || unit === 'revert') {
    const seedIndex = 810_000 + Number((coordinator.confirmedRevision ?? 0n) % 100_000n)
    const task = buildFictitiousTask(seedIndex, { idPrefix: 'crash-trash' })
    moveTaskId = task.id
    await coordinator.run((target) => target.saveTask(task))
    const stored = await coordinator.read((reader) => reader.getTask(task.id))
    moveRevision = stored.ok && stored.value !== undefined ? stored.value.contentRevision : 1n

    if (unit === 'restore') {
      const moved = await coordinator.run((target) => target.moveToTrashConditionally(task.id, moveRevision, now))
      if (moved.ok && moved.value.status === 'MOVED') restoreEntry = moved.value.entry
    }
    if (unit === 'revert') {
      const updated = await coordinator.run((target) =>
        target.updateTaskConditionally(task.id, moveRevision, (current) => ({ ...current, title: `${current.title} alterada` })),
      )
      if (updated.ok && updated.value.status === 'UPDATED') {
        revertTarget = { id: task.id, expectedContentRevision: updated.value.contentRevision }
        revertBefore = task
      }
    }
  }

  const base = coordinator.confirmedRevision ?? 0n
  // Estado preparado (tarefa/entrada/alvo) capturado pela mesma projeção do reopen: o smoke
  // compara o digest do rollback com este estado, não com o anterior ao processo de teste.
  let preparedSummary: Record<string, unknown> | null = null
  try {
    const prepared = await evaluate<StateSnapshotResult>(deps.mainWindow, SNAPSHOT_SCRIPT)
    if (prepared.status === 'ok') {
      preparedSummary = {
        revision: prepared.snapshot.revision,
        tasks: prepared.snapshot.tasks.length,
        trash: prepared.snapshot.trash.length,
        digest: digest(prepared.snapshot),
      }
    }
  } catch {
    preparedSummary = null
  }
  deps.faults.at = (reached) => {
    if (reached !== point) return
    writeFileSync(barrierFile(deps), JSON.stringify({ point, pid: process.pid, baseRevision: formatRevision(base) }))
    // Barreira: o processo fica parado aqui até ser encerrado pelo runner.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
  }
  emit({
    scenario: 'crash',
    armed: true,
    point,
    unit,
    pid: process.pid,
    baseRevision: formatRevision(base),
    ...(preparedSummary !== null && { preparedSummary }),
  })

  if (unit === 'claim' && pending?.type === 'OFFSET' && claimTask.dueAt !== undefined) {
    const processedFor = new Date(Date.parse(claimTask.dueAt) - pending.offsetMinutes * 60_000).toISOString()
    await coordinator.run((target) =>
      target.claimReminderOccurrence({ taskId: claimTask.id, reminderId: pending.id, processedFor }),
    )
  } else if (unit === 'move') {
    await coordinator.run((target) => target.moveToTrashConditionally(moveTaskId, moveRevision, now))
  } else if (unit === 'restore' && restoreEntry !== undefined) {
    await coordinator.run((target) => target.restoreTrashItemConditionally(restoreEntry as TrashEntryRef, now))
  } else if (unit === 'revert' && revertTarget !== undefined && revertBefore !== undefined) {
    await coordinator.run((target) =>
      target.revertConditionally({ target: revertTarget as { id: string; expectedContentRevision: bigint } }, () => revertBefore as Task, now),
    )
  } else {
    await coordinator.run((target) => target.saveTask(buildFictitiousTask(800_000 + Number(base % 100_000n), { idPrefix: 'crash' })))
  }
  // Só chega aqui se a barreira não foi alcançada: o runner trata como falha.
  emit({ scenario: 'crash', armed: false, point, reached: false })
}

async function runDrain(deps: ProductHarnessDependencies): Promise<void> {
  const { coordinator } = deps
  const base = coordinator.confirmedRevision ?? 0n
  // Unidades internas admitidas e leituras de sessão ainda não iniciadas no momento da saída.
  const internal = Array.from({ length: 20 }, (_unused, index) =>
    coordinator.run((unit) => unit.saveTask(buildFictitiousTask(600_000 + index, { idPrefix: `drain-${base}` }))),
  )
  const sessionReads = Array.from({ length: 4 }, () =>
    coordinator.read((reader) => reader.listTasks().length, { owner: 'harness-session' }),
  )
  const pendingBefore = coordinator.pending
  const report = deps.shutdownStorage()
  const afterShutdown = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(699_999)))
  const internalResults = await Promise.all(internal)
  const readResults = await Promise.all(sessionReads)

  emit({
    scenario: 'drain',
    ok:
      report !== undefined &&
      internalResults.every((result) => result.ok && result.committed) &&
      readResults.every((result) => !result.ok && result.reason === 'CLOSED') &&
      !afterShutdown.ok &&
      afterShutdown.reason === 'CLOSED' &&
      coordinator.availability.state === 'closed',
    pendingBefore,
    report: report === undefined ? null : { ...report, drainMs: round(report.drainMs) },
    committedInternal: internalResults.filter((result) => result.ok && result.committed).length,
    cancelledReads: readResults.filter((result) => !result.ok).length,
    admissionAfterShutdown: afterShutdown.ok ? 'accepted' : afterShutdown.reason,
    expectedRevision: formatRevision(base + 20n),
    runtime: runtimeInfo(deps),
  })
}

async function runBench(deps: ProductHarnessDependencies): Promise<void> {
  const { coordinator, mainWindow } = deps
  const unitDurations: number[] = []
  const stopMeasuring = coordinator.onUnitMeasured((milliseconds) => unitDurations.push(milliseconds))

  // Heartbeat do main: maior intervalo entre ticks de 10 ms mede o pior bloqueio do event loop.
  let lastTick = performance.now()
  let maxHeartbeatGapMs = 0
  const heartbeat = setInterval(() => {
    const now = performance.now()
    maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now - lastTick)
    lastTick = now
  }, 10)

  const datasets: Array<Record<string, unknown>> = []
  for (const size of [1_000, 10_000]) {
    const prefix = `bench${size}`
    const tasks = buildFictitiousTasks(size, { idPrefix: prefix, descriptionLength: 1_100 })
    const trashTasks = buildFictitiousTasks(100, { idPrefix: `${prefix}-lixo`, descriptionLength: 1_100 })
    const payloadBytes = [...tasks, ...trashTasks].reduce((total, task) => total + utf8ByteLength(JSON.stringify(task)), 0)

    // Coleção inteira num único commit: saveMany não é dividido para cumprir orçamento.
    unitDurations.length = 0
    const replaced = await coordinator.run((unit) => {
      unit.emptyTrash()
      return unit.replaceAllTasks([...tasks, ...trashTasks], unit.baseRevision)
    })
    const saveManyMs = unitDurations[0] ?? 0
    await delay(30)

    // Mutações representativas: 100 movimentos para a lixeira e 100 edições condicionais.
    unitDurations.length = 0
    for (const task of trashTasks) {
      await coordinator.run((unit) => unit.moveToTrash(task.id, '2026-09-15T12:00:00.000Z'))
    }
    for (const task of tasks.slice(0, 100)) {
      await coordinator.run((unit) => {
        const stored = unit.getTask(task.id)
        if (stored === undefined) return 'missing'
        return unit.updateTaskConditionally(task.id, stored.editRevision, (current) => ({
          ...current,
          title: `${current.title} (editada)`,
        })).status
      })
    }
    const mutationDurations = [...unitDurations]

    // TFA-005: varredura de portadora e fechamento/geração pelo caminho real de comandos.
    // Portadoras sem lembretes (a guarda D8 bloquearia o fechamento de tarefas com reminders).
    const carrierIds: string[] = []
    const carrierDurations: number[] = []
    let identity = 0
    for (let index = 0; index < 3; index += 1) {
      const base = buildFictitiousTask(95_000 + index, { idPrefix: `${prefix}-carrier` })
      const carrier: Task = {
        ...base,
        reminders: [],
        status: 'TODO',
        dueAt: '2026-11-20T10:00:00.000Z',
        seriesId: `serie-scan-${size}-${index}`,
        recurrence: { frequency: 'MONTHLY', dayOfMonth: 15 },
      }
      delete carrier.completedAt
      const saved = await coordinator.run((unit) => unit.saveTask(carrier))
      if (saved.ok && saved.committed) carrierIds.push(carrier.id)
    }
    const closureMs = await measuredUnit(coordinator, carrierDurations, async () => {
      const id = carrierIds[0]
      if (id === undefined) return
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: id,
          expectedEditRevision: unit.getTask(id)?.editRevision ?? 0n,
          status: 'DONE',
          now: new Date('2026-10-20T10:00:00.000Z'),
          generateId: () => `gerada-${prefix}-${identity += 1}`,
        }),
      )
    })
    const dueUpdateMs = await measuredUnit(coordinator, carrierDurations, async () => {
      const id = carrierIds[1]
      if (id === undefined) return
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: id,
          expectedEditRevision: unit.getTask(id)?.editRevision ?? 0n,
          patch: { dueAt: '2026-11-25T10:00:00.000Z' },
          now: new Date('2026-10-20T10:00:00.000Z'),
          generateId: () => `novo-${prefix}`,
        }),
      )
    })
    const titleUpdateMs = await measuredUnit(coordinator, carrierDurations, async () => {
      const id = carrierIds[2]
      if (id === undefined) return
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: id,
          expectedEditRevision: unit.getTask(id)?.editRevision ?? 0n,
          patch: { title: `${prefix} título editado` },
          now: new Date('2026-10-20T10:00:00.000Z'),
          generateId: () => `novo2-${prefix}`,
        }),
      )
    })
    const carriersReady = carrierIds.length === 3

    // Pior caso do limite de 32.768 passos (série antiga avançando até o relógio distante).
    const limitStarted = performance.now()
    const limitResult = resolveNextScheduledAt(
      { frequency: 'DAILY', intervalDays: 1 },
      '1900-01-01T12:00:00.000Z',
      new Date('2200-01-01T12:00:00.000Z'),
    )
    const seriesLimitMs = performance.now() - limitStarted

    // Páginas pela bridge real: cada leitura de página é uma unidade medida.
    unitDurations.length = 0
    const snapshotStarted = performance.now()
    const snapshot = await evaluate<{ status: string; tasks?: number; trash?: number; code?: string }>(
      mainWindow,
      `window.taskflowDesktop.getStateSnapshot({ version: 3 }).then((result) => result.status === 'ok'
        ? { status: 'ok', tasks: result.snapshot.tasks.length, trash: result.snapshot.trash.length }
        : result)`,
    )
    const snapshotTotalMs = performance.now() - snapshotStarted
    const pageDurations = [...unitDurations]

    // Preflight completo (integridade, estrutura e todos os payloads) numa segunda abertura.
    const preflightStarted = performance.now()
    const preflight = ProductDatabase.open(deps.productDatabaseFile, PRODUCT_STORAGE_DEFINITION)
    const preflightMs = performance.now() - preflightStarted
    if (preflight.ok) preflight.database.close()

    datasets.push({
      tasks: size,
      trash: 100,
      payloadBytes,
      payloadMiB: round(payloadBytes / (1024 * 1024)),
      databaseBytes: statSync(deps.productDatabaseFile).size,
      replaced: replaced.ok ? replaced.value.status : replaced.reason,
      saveManyMs: round(saveManyMs),
      mutation: {
        count: mutationDurations.length,
        p95Ms: round(percentile(mutationDurations, 0.95)),
        maxMs: round(Math.max(0, ...mutationDurations)),
      },
      series: {
        carriersReady,
        closureMs: round(closureMs),
        dueUpdateMs: round(dueUpdateMs),
        titleUpdateMs: round(titleUpdateMs),
        unitP95Ms: round(percentile(carrierDurations, 0.95)),
        unitMaxMs: round(Math.max(0, ...carrierDurations)),
        limitMs: round(seriesLimitMs),
        limitStatus: limitResult.status,
        stepLimit: 32_768,
      },
      page: {
        count: pageDurations.length,
        p95Ms: round(percentile(pageDurations, 0.95)),
        maxMs: round(Math.max(0, ...pageDurations)),
        snapshotTotalMs: round(snapshotTotalMs),
      },
      snapshot,
      preflight: { ok: preflight.ok, ms: round(preflightMs) },
    })
  }

  // TFA-006 — recursos dos recibos: charge lógico, heap real, pico e liberação em oito sessões.
  const receiptRegistry = new UndoRegistry({
    randomToken: (() => {
      let count = 0
      return () => `bench-token-${String((count += 1)).padStart(12, '0')}`
    })(),
  })
  const heavyBefore = { ...buildFictitiousTask(930_000), description: fictitiousText(200_000, 930_000) }
  const heavyFacts: UndoFacts = {
    kind: 'REVERT',
    target: { id: heavyBefore.id, expectedContentRevision: 2n },
    beforeImage: heavyBefore,
  }
  const heapBefore = process.memoryUsage().heapUsed
  let chargeBytesPerReceipt = 0
  let peakUsedBytes = 0
  for (let round = 0; round < 25; round += 1) {
    for (let doc = 0; doc < 8; doc += 1) {
      const key = `bench-doc-${doc}`
      const sequence = receiptRegistry.contextSequence(key) + 1
      receiptRegistry.clear(key, sequence)
      const reservation = receiptRegistry.reserve(key, sequence, heavyFacts)
      if (reservation.status !== 'ok') throw new Error('reserva de recibo recusada')
      chargeBytesPerReceipt = reservation.reservation.bytes
      const token = receiptRegistry.publish(reservation.reservation, heavyFacts)
      if (token === undefined) throw new Error('publicação de recibo recusada')
      if (receiptRegistry.usedBytes > peakUsedBytes) peakUsedBytes = receiptRegistry.usedBytes
      if (receiptRegistry.consumeOffer(key, sequence, token) === undefined) throw new Error('consumo de recibo falhou')
    }
  }
  const heapAfter = process.memoryUsage().heapUsed
  const receipts = {
    chargeBytesPerReceipt,
    peakUsedBytes,
    usedBytesAfter: receiptRegistry.usedBytes,
    heapDeltaBytes: heapAfter - heapBefore,
    cycles: 25,
    documents: 8,
    released:
      receiptRegistry.usedBytes === 0 &&
      receiptRegistry.activeReservations === 0 &&
      receiptRegistry.openOffers === 0 &&
      receiptRegistry.openConfirmations === 0,
  }

  // Drain: unidades internas admitidas no momento do encerramento.
  const draining = Array.from({ length: 32 }, (_unused, index) =>
    coordinator.run((unit) => unit.saveTask(buildFictitiousTask(700_000 + index, { idPrefix: 'bench-drain' }))),
  )
  clearInterval(heartbeat)
  stopMeasuring()
  const report = deps.shutdownStorage()
  const drained = await Promise.all(draining)

  const large = datasets[1] ?? {}
  const mutation = large['mutation'] as { p95Ms: number } | undefined
  const page = large['page'] as { p95Ms: number } | undefined
  const preflight = large['preflight'] as { ok: boolean; ms: number } | undefined
  const gates = {
    payloadAtLeast20MiB: Number(large['payloadBytes'] ?? 0) >= 20 * 1024 * 1024,
    mutationP95Within100Ms: (mutation?.p95Ms ?? Infinity) <= 100,
    pageP95Within100Ms: (page?.p95Ms ?? Infinity) <= 100,
    preflightWithin5s: preflight?.ok === true && preflight.ms <= 5_000,
    drainWithin5s: report !== undefined && report.drainMs <= 5_000,
    saveManyAtomic: datasets.every((dataset) => dataset['replaced'] === 'REPLACED'),
    snapshotsComplete: datasets.every((dataset) => (dataset['snapshot'] as { status: string }).status === 'ok'),
    // TFA-005: fechamento/varredura de portadora medidos com o volume real e limite finito.
    seriesMeasured: datasets.every((dataset) => {
      const series = dataset['series'] as { carriersReady: boolean; limitStatus: string } | undefined
      return series?.carriersReady === true && series.limitStatus === 'RESOURCE_LIMIT'
    }),
    // TFA-006: recibos liberados após ciclos em oito sessões, sem vazamento de charge.
    receiptsReleased: receipts.released,
  }

  emit({
    scenario: 'bench',
    ok: Object.values(gates).every(Boolean),
    gates,
    datasets,
    receipts,
    maxHeartbeatGapMs: round(maxHeartbeatGapMs),
    maxUnitMs: round(coordinator.metrics.maxUnitMs),
    drain:
      report === undefined
        ? null
        : { ...report, drainMs: round(report.drainMs), committed: drained.filter((result) => result.ok).length },
    hardware: {
      cpu: os.cpus()[0]?.model ?? 'unknown',
      logicalCores: os.cpus().length,
      memoryGiB: round(os.totalmem() / 1024 ** 3),
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
    },
    runtime: runtimeInfo(deps),
  })
}

/** Espera uma condição dentro do renderer (polling) e devolve `true`/`false`. */
function uiWait(predicate: string, timeoutMs = 20_000): string {
  return `(async () => {
    const deadline = Date.now() + ${timeoutMs};
    while (Date.now() < deadline) {
      try {
        if (${predicate}) return true;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  })()`
}

function uiBodyHas(text: string, timeoutMs = 20_000): string {
  // `textContent` não depende de a árvore estar pintada (os cartões fora da viewport usam
  // content-visibility); a checagem de presença não deve depender do scroll.
  return uiWait(`(document.body.textContent || '').includes(${JSON.stringify(text)})`, timeoutMs)
}

function uiCardsAtLeast(count: number, timeoutMs = 30_000): string {
  return uiWait(`document.querySelectorAll('[data-task-id]').length >= ${count}`, timeoutMs)
}

const UI_FIND_BUTTON = `(text) => [...document.querySelectorAll('button')].find((button) => (button.textContent || '').replace(/\\s+/g, ' ').trim().includes(text))`

function uiCreate(title: string, sourceUrl: string | undefined): string {
  const fields = JSON.stringify([['input[name="title"]', title], ...(sourceUrl === undefined ? [] : [['input[name="sourceUrl"]', sourceUrl]])])
  return `(async () => {
    const findButton = ${UI_FIND_BUTTON};
    const open = findButton('Nova tarefa') ?? findButton('Criar primeira tarefa');
    if (!open) return false;
    open.click();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !document.querySelector('form.task-form')) await new Promise((resolve) => setTimeout(resolve, 25));
    for (const [selector, value] of ${fields}) {
      const element = document.querySelector(selector);
      if (!element) return false;
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('form.task-form');
    if (!form) return false;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`
}

function uiOpenEdit(title: string): string {
  return `(async () => {
    const card = [...document.querySelectorAll('[data-task-id]')].find((element) => (element.textContent || '').includes(${JSON.stringify(title)}));
    const edit = card?.querySelector('[data-action="edit"]');
    if (!edit) return false;
    edit.click();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !document.querySelector('form.task-form input[name="title"]')) await new Promise((resolve) => setTimeout(resolve, 25));
    return Boolean(document.querySelector('form.task-form input[name="title"]'));
  })()`
}

function uiEditTitle(title: string, nextTitle: string): string {
  return `(async () => {
    const card = [...document.querySelectorAll('[data-task-id]')].find((element) => (element.textContent || '').includes(${JSON.stringify(title)}));
    const edit = card?.querySelector('[data-action="edit"]');
    if (!edit) return false;
    edit.click();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !document.querySelector('form.task-form input[name="title"]')) await new Promise((resolve) => setTimeout(resolve, 25));
    const input = document.querySelector('form.task-form input[name="title"]');
    if (!input) return false;
    input.value = ${JSON.stringify(nextTitle)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('form.task-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`
}

function uiCardAction(title: string, action: string): string {
  return `(() => {
    const card = [...document.querySelectorAll('[data-task-id]')].find((element) => (element.textContent || '').includes(${JSON.stringify(title)}));
    const control = card?.querySelector('[data-action="${action}"]');
    if (!control) return false;
    control.click();
    return true;
  })()`
}

const UI_CLICK_OPEN_SOURCE = `(() => {
  const button = document.querySelector('form.task-form [data-action="open-source"]');
  if (!button) return false;
  button.click();
  return true;
})()`

const UI_CANCEL_FORM = `(() => {
  const button = [...document.querySelectorAll('form.task-form button')].find((candidate) => (candidate.textContent || '').includes('Cancelar') || (candidate.textContent || '').includes('Fechar'));
  if (!button) return false;
  button.click();
  return true;
})()`

const UI_HEARTBEAT_START = `(() => {
  window.__hb = { last: performance.now(), max: 0, timer: setInterval(() => {
    const now = performance.now();
    window.__hb.max = Math.max(window.__hb.max, now - window.__hb.last);
    window.__hb.last = now;
  }, 10) };
  return true;
})()`

const UI_HEARTBEAT_READ = `(() => {
  if (!window.__hb) return null;
  clearInterval(window.__hb.timer);
  return { max: window.__hb.max };
})()`

const UI_INTERACTION = (index: number): string => `(async () => {
  const select = document.querySelector('[data-test="sort-key"]');
  if (!select) return null;
  const values = ['PRIORITY', 'STATUS', 'DUE_DATE'];
  let moves = 0;
  const originalInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (...args) { moves += 1; return originalInsert.apply(this, args); };
  const started = performance.now();
  select.value = values[${index} % 3];
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await Promise.resolve();
  await Promise.resolve();
  Node.prototype.insertBefore = originalInsert;
  const afterFlush = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const afterMacrotask = performance.now();
  void document.body.offsetHeight;
  const afterLayout = performance.now();
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  const painted = performance.now();
  return { flushMs: afterFlush - started, macrotaskMs: afterMacrotask - afterFlush, layoutMs: afterLayout - afterMacrotask, paintMs: painted - afterLayout, moves };
})()`

/** TFA-005: expande o cartão e marca um item — mede o novo controle pelo orçamento D10. */
const UI_SUBTASK_TOGGLE = (index: number): string => `(async () => {
  const cards = [...document.querySelectorAll('[data-task-id]')];
  const card = cards[${index}];
  if (!card) return null;
  const toggle = card.querySelector('[data-action="subtasks"]');
  if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const box = card.querySelector('input.subtask-checkbox');
  if (!box) return null;
  const started = performance.now();
  box.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  return performance.now() - started;
})()`

const CATALOG_SCRIPT = `({
  keys: Object.keys(window.taskflowDesktop).sort(),
  frozen: Object.isFrozen(window.taskflowDesktop),
  globals: ['require', 'process', 'module', 'Buffer', 'ipcRenderer', 'electron', '__dirname'].map((name) => typeof window[name]),
})`

/**
 * Estabelece contexto novo na superfície (clear ack) e executa o corpo com `seq` disponível.
 * Toda ação de tarefa/lixeira desta Change passa por aqui, como o renderer real faz.
 */
function withFreshContext(body: string): string {
  return `(async () => {
    const seq = (window.__tfa006Sequence = (window.__tfa006Sequence ?? 0) + 1)
    const cleared = await window.taskflowDesktop.clearUndoOffer({ version: 1, contextSequence: seq })
    if (cleared.status !== 'ok') return cleared
    return ${body}
  })()`
}

/**
 * TFA-004: exercita a UI real de tarefas com dados fictícios no pacote — criar, editar, status,
 * reabrir, abrir origem (opener falso), duas superfícies, negativas, reconciliação por foco,
 * reload sem resposta e limpeza. Fecha a janela principal ao final (o runner valida a saída).
 */
async function runTasks(deps: ProductHarnessDependencies): Promise<void> {
  const { coordinator, mainWindow: surfaceA, stateIpc, sessions } = deps
  const checks: Record<string, boolean> = {}
  const info: Record<string, unknown> = { runtime: runtimeInfo(deps) }
  const openedHrefs: string[] = []
  // Opener falso: nenhuma URL real é aberta durante a suíte.
  deps.opener.openExternal = async (href: string) => {
    openedHrefs.push(href)
  }

  // Perfil fictício exclusivo do harness: limpa tarefas/lixeira antes do cenário.
  expectOkUnit(await coordinator.run((unit) => {
    unit.emptyTrash()
    return unit.replaceAllTasks([], unit.baseRevision)
  }))
  checks['uiReadyEmpty'] = await evaluate<boolean>(surfaceA, uiBodyHas('Nenhuma tarefa ainda'))

  const title = `UI fictícia ${Date.now()}`
  const sourceUrl = 'https://example.invalid/tarefa-ui'
  checks['createAccepted'] = await evaluate<boolean>(surfaceA, uiCreate(title, sourceUrl))
  checks['createVisible'] = await evaluate<boolean>(surfaceA, uiBodyHas(title))
  const listed = await coordinator.read((reader) => reader.listTasks())
  const stored = listed.ok ? listed.value.find((item) => item.task.title === title) : undefined
  checks['createPersisted'] = stored !== undefined && stored.task.sourceUrl === sourceUrl
  const taskId = stored?.task.id ?? ''

  // Segunda superfície com a UI real: converge pelo snapshot/eventos existentes.
  const surfaceB = deps.createSurface(true)
  if (surfaceB === null) throw new Error('second surface unavailable')
  await loadSurface(surfaceB, deps.surfaceUrl)
  checks['secondSurfaceConverges'] = await evaluate<boolean>(surfaceB, uiBodyHas(title))

  // Edição real pela UI (patch básico).
  const editedTitle = `${title} editada`
  checks['editAccepted'] = await evaluate<boolean>(surfaceA, uiEditTitle(title, editedTitle))
  checks['editVisible'] = await evaluate<boolean>(surfaceA, uiBodyHas(editedTitle))
  checks['editPersisted'] = await waitFor(async () => {
    const read = await coordinator.read((reader) => reader.getTask(taskId))
    return read.ok && read.value?.task.title === editedTitle
  })

  // Abrir origem salva pelo gesto, com opener falso e sem alterar a tarefa.
  checks['openSourceForm'] = await evaluate<boolean>(surfaceA, uiOpenEdit(editedTitle))
  checks['openSourceClicked'] = await evaluate<boolean>(surfaceA, UI_CLICK_OPEN_SOURCE)
  checks['openSourceFake'] = await waitFor(() => openedHrefs.length === 1 && openedHrefs[0] === sourceUrl)
  const beforeOpen = await coordinator.read((reader) => reader.getTask(taskId))
  checks['openSourceKeepsTask'] = beforeOpen.ok && beforeOpen.value?.task.sourceUrl === sourceUrl
  await evaluate<boolean>(surfaceA, UI_CANCEL_FORM)

  // Status: concluir registra completedAt; reabrir limpa.
  checks['completeClicked'] = await evaluate<boolean>(surfaceA, uiCardAction(editedTitle, 'complete'))
  checks['completePersisted'] = await waitFor(async () => {
    const read = await coordinator.read((reader) => reader.getTask(taskId))
    return read.ok && read.value?.task.status === 'DONE' && read.value.task.completedAt !== undefined
  })
  // O cartão só passa a oferecer Reabrir quando o snapshot da conclusão chega à UI.
  checks['reopenControlReady'] = await evaluate<boolean>(
    surfaceA,
    uiWait(
      `Boolean([...document.querySelectorAll('[data-task-id]')].find((element) => (element.textContent || '').includes(${JSON.stringify(editedTitle)}))?.querySelector('[data-action="reopen"]'))`,
    ),
  )
  checks['reopenClicked'] = await evaluate<boolean>(surfaceA, uiCardAction(editedTitle, 'reopen'))
  checks['reopenPersisted'] = await waitFor(async () => {
    const read = await coordinator.read((reader) => reader.getTask(taskId))
    return read.ok && read.value?.task.status === 'TODO' && read.value.task.completedAt === undefined
  })

  // Catálogo fechado e negativas na ponte real do pacote (create/check v3, update/status v4;
  // versões antigas recusadas sem perder a validação de valor na versão corrente).
  const catalog = await evaluate<{ keys: string[]; frozen: boolean; globals: string[] }>(surfaceA, CATALOG_SCRIPT)
  info['catalog'] = catalog
  checks['catalogTwentyOneClosed'] =
    catalog.keys.length === 21 &&
    catalog.frozen === true &&
    catalog.globals.every((kind) => kind === 'undefined') &&
    ['shell', 'clipboard', 'invoke', 'send', 'sql', 'path', 'reminder', 'harness'].every(
      (name) => !catalog.keys.some((key) => key.toLowerCase().includes(name)),
    )
  const negatives = await evaluate<Array<{ status: string; code?: string }>>(
    surfaceA,
    `Promise.all([
      window.taskflowDesktop.createTask({ version: 1, draft: { title: 'v1 recusado' } }),
      window.taskflowDesktop.createTask({ version: 2, contextSequence: 1, draft: { title: 'x', id: 'forjado' } }),
      window.taskflowDesktop.updateTask({ version: 1, taskId: 'a', expectedEditRevision: '01', patch: {} }),
      window.taskflowDesktop.changeTaskStatus({ version: 3, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', status: 'NOPE' }),
      window.taskflowDesktop.setSubtaskDone({ version: 2, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', subtaskId: 's', done: 'sim' }),
      window.taskflowDesktop.openTaskSource({ version: 1, taskId: 'a', expectedContentRevision: '1', url: 'https://x.test' }),
      window.taskflowDesktop.changeTaskStatus({ version: 4, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', status: 'NOPE' }),
    ])`,
  )
  info['negatives'] = negatives.map((result) => result.code ?? result.status)
  checks['negativeCommands'] =
    negatives[0]?.code === 'INVALID_REQUEST' &&
    negatives[1]?.code === 'INVALID_REQUEST' &&
    negatives[2]?.code === 'INVALID_REQUEST' &&
    negatives[3]?.code === 'INVALID_REQUEST' &&
    negatives[4]?.code === 'INVALID_REQUEST' &&
    negatives[5]?.code === 'INVALID_REQUEST' &&
    negatives[6]?.code === 'VALIDATION_FAILED'

  // Reconciliação por foco: dispara leitura coordenada mesmo sem evento novo visível.
  const unitsBefore = coordinator.metrics.units
  await evaluate<boolean>(surfaceA, `(() => { window.dispatchEvent(new Event('focus')); return true })()`)
  checks['focusReconciles'] = await waitFor(() => coordinator.metrics.units > unitsBefore, 10_000)

  // Reload com resposta possivelmente perdida: nenhuma duplicação e estado confirmado reaparece.
  const lateTitle = `UI tardia ${Date.now()}`
  await evaluate<string>(
    surfaceA,
    `(async () => {
      const seq = (window.__tfa006Sequence = (window.__tfa006Sequence ?? 0) + 1)
      await window.taskflowDesktop.clearUndoOffer({ version: 1, contextSequence: seq })
      window.__late = window.taskflowDesktop.createTask({ version: 3, contextSequence: seq, draft: { title: ${JSON.stringify(lateTitle)} } }).catch(() => undefined)
      return 'issued'
    })()`,
  )
  const reloaded = new Promise<void>((resolve) => surfaceA.webContents.once('did-finish-load', () => resolve()))
  surfaceA.webContents.reload()
  await reloaded
  checks['reloadReady'] = await evaluate<boolean>(surfaceA, uiBodyHas('Tarefas'))
  const lateTasks = await coordinator.read((reader) => reader.listTasks())
  const lateCount = lateTasks.ok ? lateTasks.value.filter((item) => item.task.title === lateTitle).length : -1
  info['lateCount'] = lateCount
  checks['reloadNoDuplicate'] =
    lateCount <= 1 && (lateCount === 0 || (await evaluate<boolean>(surfaceA, uiBodyHas(lateTitle))))

  // Crash controlado de uma superfície de teste (W6): sessão invalidada e nova superfície recupera
  // o estado confirmado por snapshot, sem listener/timer acumulado.
  surfaceB.webContents.forcefullyCrashRenderer()
  await delay(500)
  surfaceB.destroy()
  await waitFor(() => sessions.size === 1, 10_000)
  const surfaceC = deps.createSurface(true)
  if (surfaceC === null) throw new Error('recovery surface unavailable')
  await loadSurface(surfaceC, deps.surfaceUrl)
  checks['crashRecovers'] = await evaluate<boolean>(surfaceC, uiBodyHas(editedTitle))
  surfaceC.destroy()
  await waitFor(() => sessions.size === 1 && stateIpc.trackedDocuments <= 1, 10_000)

  // Limpeza: a superfície de teste libera sessão/estado transitório.
  checks['testSurfaceReleased'] = sessions.size === 1 && stateIpc.trackedDocuments <= 1

  emit({ scenario: 'tasks', ok: Object.values(checks).every(Boolean), checks, info })

  // Fechamento da janela principal: o runner valida a saída 0 e a ausência de residual.
  await new Promise<void>((resolve) => {
    deps.mainWindow.once('closed', () => resolve())
    deps.mainWindow.close()
  })
}

/** Seleciona o cartão pelo título (IDs históricos nunca entram em seletor CSS). */
function uiCardSelector(title: string): string {
  return `(function () {
    return [...document.querySelectorAll('[data-task-id]')].find((element) => (element.textContent || '').includes(${JSON.stringify(title)}));
  })()`
}

function uiCardHas(title: string, selector: string): string {
  return `(() => { const card = ${uiCardSelector(title)}; return Boolean(card && card.querySelector(${JSON.stringify(selector)})); })()`
}

/** Marca/desmarca o item de subtarefa pelo checkbox do cartão (índice na ordem atual). */
function uiToggleSubtask(title: string, index: number): string {
  return `(async () => {
    const card = ${uiCardSelector(title)};
    if (!card) return false;
    const toggle = card.querySelector('[data-action="subtasks"]');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const boxes = [...card.querySelectorAll('input.subtask-checkbox')];
    const box = boxes[${index}];
    if (!box || box.disabled) return false;
    box.click();
    return true;
  })()`
}

interface CommandProbe {
  status: string
  code?: string
  taskId?: string
  revision?: string
  contentRevision?: string
  editRevision?: string
  currentEditRevision?: string
  itemCount?: number
  retained?: boolean
  removedCount?: number
  undoToken?: string
  confirmationToken?: string
  /** Presente nos acks elegíveis v2/v4 (lixeira/undo e update/status). */
  undoEpoch?: number
}

interface RecurrenceProbe {
  status: string
  code?: string
  taskId?: string
  editRevision?: string
}

/**
 * TFA-005: recorrência/subtarefas no pacote real — criação, marcação pela UI, save após checks,
 * fechamento com geração, conflito de duas sessões, escolha obrigatória/END e reconciliação.
 */
async function runRecurrence(deps: ProductHarnessDependencies): Promise<void> {
  const { coordinator, mainWindow: surfaceA, stateIpc, sessions } = deps
  const checks: Record<string, boolean> = {}
  const info: Record<string, unknown> = { runtime: runtimeInfo(deps) }
  const now = Date.now()
  const due = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const later = new Date(now + 21 * 24 * 60 * 60 * 1000).toISOString()

  expectOkUnit(
    await coordinator.run((unit) => {
      unit.emptyTrash()
      return unit.replaceAllTasks([], unit.baseRevision)
    }),
  )
  checks['recurrenceUiReady'] = await evaluate<boolean>(surfaceA, uiBodyHas('Nenhuma tarefa ainda'))

  const title = `Recorrente fictícia ${now}`
  const created = await evaluate<CommandProbe>(
    surfaceA,
    withFreshContext(
      `window.taskflowDesktop.createTask({ version: 3, contextSequence: seq, draft: { title: ${JSON.stringify(title)}, dueAt: ${JSON.stringify(due)}, recurrence: { frequency: 'DAILY', intervalDays: 1 }, subtasks: [{ title: 'Passo A' }, { title: 'Passo B' }] } })`,
    ),
  )
  info['created'] = created
  checks['createAccepted'] =
    created.status === 'ok' &&
    typeof created.taskId === 'string' &&
    created.contentRevision === created.editRevision &&
    created.editRevision !== undefined
  const taskId = created.taskId ?? ''
  const baseEdit = created.editRevision ?? '0'
  checks['createVisibleUi'] = await evaluate<boolean>(surfaceA, uiBodyHas(title))

  const surfaceB = deps.createSurface(true)
  if (surfaceB === null) throw new Error('second surface unavailable')
  await loadSurface(surfaceB, deps.surfaceUrl)
  checks['secondSurfaceConverges'] = await evaluate<boolean>(surfaceB, uiBodyHas(title))
  checks['recurrenceBadgeOnBoth'] =
    (await evaluate<boolean>(surfaceA, uiCardHas(title, '[data-test="recurrence-badge"]'))) &&
    (await evaluate<boolean>(surfaceB, uiCardHas(title, '[data-test="recurrence-badge"]'))) &&
    (await evaluate<boolean>(surfaceA, uiCardHas(title, '[data-test="recurrence-summary"]')))

  // Marcação pela UI: conteúdo avança, edição é conservada; as duas superfícies mostram progresso.
  checks['toggleThroughUi'] = await evaluate<boolean>(surfaceA, uiToggleSubtask(title, 0))
  checks['togglePersisted'] = await waitFor(async () => {
    const read = await coordinator.read((reader) => reader.getTask(taskId))
    return read.ok && read.value?.task.subtasks[0]?.done === true
  })
  const afterToggle = await coordinator.read((reader) => reader.getTask(taskId))
  checks['toggleKeepsEdit'] =
    afterToggle.ok &&
    afterToggle.value?.editRevision.toString() === baseEdit &&
    afterToggle.value.contentRevision.toString() !== baseEdit
  checks['progressOnBoth'] =
    (await evaluate<boolean>(surfaceA, uiBodyHas('1 de 2'))) && (await evaluate<boolean>(surfaceB, uiBodyHas('1 de 2')))

  // Save depois do check (mesma revisão de edição) conserva o done lido agora.
  const editedTitle = `${title} editada`
  const saved = await evaluate<CommandProbe>(
    surfaceA,
    withFreshContext(
      `window.taskflowDesktop.updateTask({ version: 4, contextSequence: seq, taskId: ${JSON.stringify(taskId)}, expectedEditRevision: ${JSON.stringify(baseEdit)}, patch: { title: ${JSON.stringify(editedTitle)} } })`,
    ),
  )
  checks['saveAfterCheck'] = saved.status === 'ok'
  const afterSave = await coordinator.read((reader) => reader.getTask(taskId))
  checks['saveKeptDone'] =
    afterSave.ok &&
    afterSave.value?.task.subtasks[0]?.done === true &&
    afterSave.value?.task.title === editedTitle

  // Fechar DONE transfere a regra para exatamente uma próxima TODO no mesmo commit.
  const editForClose = afterSave.ok && afterSave.value !== undefined ? afterSave.value.editRevision.toString() : '0'
  const closed = await evaluate<CommandProbe>(
    surfaceA,
    withFreshContext(
      `window.taskflowDesktop.changeTaskStatus({ version: 4, contextSequence: seq, taskId: ${JSON.stringify(taskId)}, expectedEditRevision: ${JSON.stringify(editForClose)}, status: 'DONE' })`,
    ),
  )
  checks['closeAccepted'] = closed.status === 'ok'
  const afterClose = await coordinator.read((reader) => reader.listTasks())
  const closedRecord = afterClose.ok ? afterClose.value.find((stored) => stored.task.id === taskId) : undefined
  const generated = afterClose.ok
    ? afterClose.value.find(
        (stored) => stored.task.id !== taskId && stored.task.seriesId === closedRecord?.task.seriesId,
      )
    : undefined
  checks['oneNextTodo'] =
    afterClose.ok &&
    afterClose.value.length === 2 &&
    generated?.task.status === 'TODO' &&
    generated?.task.recurrence !== undefined &&
    closedRecord?.task.recurrence === undefined
  checks['generatedVisibleUi'] =
    generated !== undefined ? await evaluate<boolean>(surfaceB, uiBodyHas(generated.task.title)) : false

  // Duas sessões: base de edição antiga recebe CONFLICT com as revisões atuais e nada é duplicado.
  const conflict = await evaluate<CommandProbe>(
    surfaceB,
    withFreshContext(
      `window.taskflowDesktop.updateTask({ version: 4, contextSequence: seq, taskId: ${JSON.stringify(taskId)}, expectedEditRevision: ${JSON.stringify(baseEdit)}, patch: { title: 'stale' } })`,
    ),
  )
  info['conflict'] = conflict
  checks['staleConflicts'] =
    conflict.status === 'error' && conflict.code === 'CONFLICT' && conflict.currentEditRevision !== undefined
  const countAfterConflict = await coordinator.read((reader) => reader.listTasks())
  checks['noThirdTask'] = countAfterConflict.ok && countAfterConflict.value.length === 2

  // Cancelamento de portadora: escolha obrigatória sem write; END fecha sem gerar.
  const title2 = `Cancelável fictícia ${now}`
  const created2 = await evaluate<RecurrenceProbe>(
    surfaceA,
    withFreshContext(
      `window.taskflowDesktop.createTask({ version: 3, contextSequence: seq, draft: { title: ${JSON.stringify(title2)}, dueAt: ${JSON.stringify(later)}, recurrence: { frequency: 'WEEKLY', weekdays: [1, 3] } } })`,
    ),
  )
  const noChoice = await evaluate<CommandProbe>(
    surfaceA,
    withFreshContext(
      `window.taskflowDesktop.changeTaskStatus({ version: 4, contextSequence: seq, taskId: ${JSON.stringify(created2.taskId ?? '')}, expectedEditRevision: ${JSON.stringify(created2.editRevision ?? '0')}, status: 'CANCELLED' })`,
    ),
  )
  checks['choiceRequired'] = noChoice.status === 'error' && noChoice.code === 'RECURRENCE_CHOICE_REQUIRED'
  const ended = await evaluate<CommandProbe>(
    surfaceA,
    withFreshContext(
      `window.taskflowDesktop.changeTaskStatus({ version: 4, contextSequence: seq, taskId: ${JSON.stringify(created2.taskId ?? '')}, expectedEditRevision: ${JSON.stringify(created2.editRevision ?? '0')}, status: 'CANCELLED', cancellation: 'END' })`,
    ),
  )
  checks['endAccepted'] = ended.status === 'ok'
  const finalTasks = await coordinator.read((reader) => reader.listTasks())
  checks['endNoGeneration'] =
    finalTasks.ok &&
    finalTasks.value.length === 3 &&
    finalTasks.value.filter((stored) => stored.task.recurrence !== undefined).length === 1

  // Reopen validado preserva o estado das duas séries e o done marcado.
  const unitsBefore = coordinator.metrics.units
  await evaluate<boolean>(surfaceA, `(() => { window.dispatchEvent(new Event('focus')); return true })()`)
  checks['focusReconciles'] = await waitFor(() => coordinator.metrics.units > unitsBefore, 10_000)

  surfaceB.destroy()
  await waitFor(() => sessions.size === 1 && stateIpc.trackedDocuments <= 1, 10_000)
  checks['testSurfaceReleased'] = sessions.size === 1

  emit({ scenario: 'recurrence', ok: Object.values(checks).every(Boolean), checks, info })

  // Encerramento normal: o runner valida a saída 0 e a ausência de residual.
  deps.app.quit()
}

/** Unidade que precisa ter sucesso; falha vira erro do cenário. */
function expectOkUnit(result: UnitResult<unknown>): void {
  if (!result.ok) throw new Error(`unit failed: ${result.reason}`)
}

/**
 * TFA-004: mede montagem/consultas/heartbeat da UI real com 1.000 e 10.000 tarefas fictícias
 * contra os alvos D10. Falha vira reprovação do cenário; nada é truncado ou removido do gate.
 */
async function runUiBench(deps: ProductHarnessDependencies): Promise<void> {
  const { coordinator, mainWindow } = deps
  const surface = mainWindow
  const datasets: Array<Record<string, unknown>> = []

  for (const size of [1_000, 10_000]) {
    const tasks = buildFictitiousTasks(size, { idPrefix: `uibench${size}`, descriptionLength: 240 })
    const payloadBytes = tasks.reduce((total, task) => total + utf8ByteLength(JSON.stringify(task)), 0)
    expectOkUnit(
      await coordinator.run((unit) => {
        unit.emptyTrash()
        return unit.replaceAllTasks(tasks, unit.baseRevision)
      }),
    )

    const reloaded = new Promise<void>((resolve) => surface.webContents.once('did-finish-load', () => resolve()))
    const started = performance.now()
    surface.webContents.reload()
    await reloaded
    const cardsReady = await evaluate<boolean>(surface, uiCardsAtLeast(size))
    const mountMs = performance.now() - started

    // Diagnóstico: custo bruto do Chrome para reordenar os mesmos nós (sem Vue).
    const rawMove = await evaluate<{
      fragmentMs: number
      fragmentSettleMs: number
      insertMs: number
      insertSettleMs: number
    } | null>(
      surface,
      `(async () => {
        const list = document.querySelector('.task-list');
        if (!list) return null;
        const items = [...list.children];
        const fragmentStarted = performance.now();
        const fragment = document.createDocumentFragment();
        for (let index = items.length - 1; index >= 0; index -= 1) fragment.appendChild(items[index]);
        list.appendChild(fragment);
        const afterFragment = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const afterFragmentSettle = performance.now();
        const insertStarted = performance.now();
        const top = list.firstChild;
        for (let index = items.length - 1; index >= 0; index -= 1) list.insertBefore(items[index], top);
        const afterInserts = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const afterInsertSettle = performance.now();
        return {
          fragmentMs: afterFragment - fragmentStarted,
          fragmentSettleMs: afterFragmentSettle - afterFragment,
          insertMs: afterInserts - insertStarted,
          insertSettleMs: afterInsertSettle - afterInserts,
        };
      })()`,
    )

    // Restaura o DOM reconciliado pelo Vue antes de medir as interações.
    const restored = new Promise<void>((resolve) => surface.webContents.once('did-finish-load', () => resolve()))
    surface.webContents.reload()
    await restored
    await evaluate<boolean>(surface, uiCardsAtLeast(size))

    await evaluate<boolean>(
      surface,
      `(() => { const select = document.querySelector('[data-test="sort-key"]'); return select !== null })()`,
    )
    await evaluate<boolean>(surface, UI_HEARTBEAT_START)
    const interactions: number[] = []
    const flushTimes: number[] = []
    const layoutTimes: number[] = []
    const paintTimes: number[] = []
    const moveCounts: number[] = []
    for (let index = 0; index < 20; index += 1) {
      const interactionStarted = performance.now()
      const segments = await evaluate<{ flushMs: number; layoutMs: number; paintMs: number; moves: number } | null>(surface, UI_INTERACTION(index))
      interactions.push(performance.now() - interactionStarted)
      if (segments !== null) {
        flushTimes.push(segments.flushMs)
        layoutTimes.push(segments.layoutMs)
        paintTimes.push(segments.paintMs)
        moveCounts.push(segments.moves)
      }
    }

    // TFA-005: novos controles (expansão + marcação de subtarefa) medidos pelo mesmo orçamento.
    const subtaskTimes: number[] = []
    for (let index = 0; index < 5; index += 1) {
      const measured = await evaluate<number | null>(surface, UI_SUBTASK_TOGGLE(index))
      subtaskTimes.push(measured ?? Number.POSITIVE_INFINITY)
    }
    const subtaskP95 = round(percentile(subtaskTimes, 0.95))
    const heartbeat = await evaluate<{ max: number } | null>(surface, UI_HEARTBEAT_READ)
    const dom = await evaluate<{ cards: number; elements: number }>(
      surface,
      `({ cards: document.querySelectorAll('[data-task-id]').length, elements: document.querySelectorAll('*').length })`,
    )

    datasets.push({
      tasks: size,
      payloadBytes,
      payloadMiB: round(payloadBytes / (1024 * 1024)),
      mountMs: round(mountMs),
      cardsReady,
      cards: dom.cards,
      elements: dom.elements,
      rawMove,
      interactions: {
        count: interactions.length,
        p95Ms: round(percentile(interactions, 0.95)),
        maxMs: round(Math.max(0, ...interactions)),
        flushP95Ms: round(percentile(flushTimes, 0.95)),
        layoutP95Ms: round(percentile(layoutTimes, 0.95)),
        paintP95Ms: round(percentile(paintTimes, 0.95)),
        maxMoves: Math.max(0, ...moveCounts),
      },
      subtaskControls: {
        count: subtaskTimes.length,
        p95Ms: subtaskP95,
        maxMs: round(Math.max(0, ...subtaskTimes)),
      },
      heartbeatMaxMs: round(heartbeat?.max ?? Number.POSITIVE_INFINITY),
    })
  }

  const first = datasets[0] ?? {}
  const second = datasets[1] ?? {}
  const firstInteractions = first['interactions'] as { p95Ms: number } | undefined
  const secondInteractions = second['interactions'] as { p95Ms: number } | undefined
  const firstSubtasks = first['subtaskControls'] as { p95Ms: number } | undefined
  const secondSubtasks = second['subtaskControls'] as { p95Ms: number } | undefined
  const gates = {
    mount1000Within2s: Number(first['mountMs'] ?? Number.POSITIVE_INFINITY) <= 2_000,
    mount10000Within5s: Number(second['mountMs'] ?? Number.POSITIVE_INFINITY) <= 5_000,
    cardsComplete:
      Number(first['cards'] ?? -1) === 1_000 && Number(second['cards'] ?? -1) === 10_000 &&
      first['cardsReady'] === true && second['cardsReady'] === true,
    interactionsP95Within500ms:
      (firstInteractions?.p95Ms ?? Number.POSITIVE_INFINITY) <= 500 &&
      (secondInteractions?.p95Ms ?? Number.POSITIVE_INFINITY) <= 500,
    subtaskControlsP95Within500ms:
      (firstSubtasks?.p95Ms ?? Number.POSITIVE_INFINITY) <= 500 &&
      (secondSubtasks?.p95Ms ?? Number.POSITIVE_INFINITY) <= 500,
    heartbeatWithin250ms:
      Number(first['heartbeatMaxMs'] ?? Number.POSITIVE_INFINITY) <= 250 &&
      Number(second['heartbeatMaxMs'] ?? Number.POSITIVE_INFINITY) <= 250,
  }

  emit({
    scenario: 'ui-bench',
    ok: Object.values(gates).every(Boolean),
    gates,
    datasets,
    hardware: {
      cpu: os.cpus()[0]?.model ?? 'unknown',
      logicalCores: os.cpus().length,
      memoryGiB: round(os.totalmem() / 1024 ** 3),
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
    },
    runtime: runtimeInfo(deps),
  })
}

/**
 * TFA-004: evidência de pacote para dimensões/zoom/foco/strings longas e abertura de uma URL
 * fictícia controlada. `opener: 'real'` usa o shell do Windows (máquina de referência);
 * `opener: 'fake'` troca a porta por um registrador (runner hospedado sem navegador garantido).
 * Não substitui leitor de tela/DPI humano; nenhum dado privado é aberto e o Setup não é executado.
 */
async function runA11y(deps: ProductHarnessDependencies, openerMode: 'real' | 'fake'): Promise<void> {
  const { coordinator, mainWindow: surface } = deps
  const checks: Record<string, boolean> = {}
  const bounds = surface.getBounds()
  const minimum = surface.getMinimumSize()
  const info: Record<string, unknown> = { runtime: runtimeInfo(deps), bounds, minimum, openerMode }

  checks['initialBounds'] = bounds.width === 780 && bounds.height === 560
  checks['minimumSize'] = minimum[0] === 360 && minimum[1] === 420
  checks['uiLoaded'] = await evaluate<boolean>(surface, uiBodyHas('Tarefas'))

  checks['openForm'] = await evaluate<boolean>(
    surface,
    `(() => { const findButton = ${UI_FIND_BUTTON}; const button = findButton('Nova tarefa') ?? findButton('Criar primeira tarefa'); button?.click(); return Boolean(button) })()`,
  )
  checks['titleExists'] = await evaluate<boolean>(surface, uiWait(`Boolean(document.querySelector('form.task-form input[name="title"]'))`))
  checks['initialFocusOnTitle'] = await evaluate<boolean>(
    surface,
    `document.activeElement === document.querySelector('form.task-form input[name="title"]')`,
  )
  checks['accessibleNames'] = await evaluate<boolean>(
    surface,
    `(() => {
      const controls = [...document.querySelectorAll('form.task-form button')];
      return controls.length > 0 && controls.every((control) => (control.textContent || '').trim().length > 0 || (control.getAttribute('aria-label') || '').trim().length > 0);
    })()`,
  )

  surface.webContents.setZoomFactor(2)
  checks['zoom200CancelReachable'] = await evaluate<boolean>(
    surface,
    `(() => {
      const button = [...document.querySelectorAll('form.task-form button')].find((candidate) => (candidate.textContent || '').includes('Cancelar'));
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0;
    })()`,
  )
  surface.webContents.setZoomFactor(1)
  checks['closeForm'] = await evaluate<boolean>(surface, UI_CANCEL_FORM)

  // String longa Unicode permanece integral no cartão.
  const longTitle = `Longa ${'ação 日本語 🚀 '.repeat(12)}`
  const longTask = { ...buildFictitiousTask(995_001, { idPrefix: 'a11y-longa' }), title: longTitle }
  expectOkUnit(await coordinator.run((unit) => unit.saveTask(longTask)))
  checks['longStringVisible'] = await evaluate<boolean>(surface, uiBodyHas(longTitle, 15_000))

  // Abertura da URL fictícia controlada: shell real na máquina de referência ou opener falso no
  // runner hospedado; em ambos os casos a tarefa não muda.
  const openerTask = { ...buildFictitiousTask(995_002, { idPrefix: 'a11y-opener' }), sourceUrl: 'https://example.invalid/tarefa-a11y' }
  expectOkUnit(await coordinator.run((unit) => unit.saveTask(openerTask)))
  const stored = await coordinator.read((reader) => reader.getTask(openerTask.id))
  const revision = stored.ok ? stored.value?.contentRevision.toString() ?? '1' : '1'
  const recorded: string[] = []
  if (openerMode === 'fake') {
    deps.opener.openExternal = async (href: string) => {
      recorded.push(href)
    }
  }
  const result = await evaluate<{ status: string; code?: string }>(
    surface,
    `window.taskflowDesktop.openTaskSource({ version: 1, taskId: ${JSON.stringify(openerTask.id)}, expectedContentRevision: ${JSON.stringify(revision)} })`,
  )
  info['openerResult'] = result
  checks['windowsOpenerAccepted'] =
    result.status === 'ok' && (openerMode === 'real' || recorded[0] === openerTask.sourceUrl)
  const after = await coordinator.read((reader) => reader.getTask(openerTask.id))
  checks['openerKeepsTask'] = after.ok && after.value?.contentRevision.toString() === revision

  emit({ scenario: 'a11y', ok: Object.values(checks).every(Boolean), checks, info })
}

/**
 * Semeia o perfil fictício em SQL 1 (schema anterior), recriando o arquivo do zero. Usado pelo
 * smoke para exercitar a migração real 1→2 no pacote: abre a origem, grava fixtures e encerra
 * sem migrar. Nenhum dado real participa.
 */
async function runSeedSql1(deps: ProductHarnessDependencies): Promise<void> {
  const file = deps.productDatabaseFile
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(`${file}${suffix}`, { force: true })
  }

  const opened = ProductDatabase.open(file, PRODUCT_V1_DEFINITION)
  if (!opened.ok) {
    emit({ scenario: 'seed-sql1', ok: false, code: opened.reason })
    deps.app.exit(3)
    return
  }
  opened.database.close()

  const coordinator = new StorageCoordinator({
    open: () => ProductDatabase.open(file, PRODUCT_V1_DEFINITION),
  })
  coordinator.start()
  const tasks = [...buildFictitiousTasks(12), buildMinimalFictitiousTask('sql1-minima')]
  const saved = await coordinator.run((unit) => unit.saveTasks(tasks))
  const moved = await coordinator.run((unit) =>
    unit.moveToTrash(tasks[0]?.id ?? 'ausente', '2026-09-12T08:00:00.000Z'),
  )
  const revision = coordinator.confirmedRevision ?? 0n
  const report = coordinator.shutdown()

  emit({
    scenario: 'seed-sql1',
    ok: saved.ok && saved.committed && moved.ok && moved.committed,
    revision: formatRevision(revision),
    tasks: tasks.length,
    drainMs: Math.round(report.drainMs * 100) / 100,
    runtime: runtimeInfo(deps),
  })
  deps.app.quit()
}

/**
 * Inspeciona o perfil com o leitor SQL 1 (origem): evidência de que um kill antes do commit da
 * migração deixou o arquivo antigo inteiro (e de que o pós-commit já é SQL 2).
 */
function runInspectSql1(deps: ProductHarnessDependencies): void {
  const result = ProductDatabase.open(deps.productDatabaseFile, PRODUCT_V1_DEFINITION)
  if (!result.ok) {
    emit({ scenario: 'inspect-sql1', ok: false, code: result.reason })
    deps.app.quit()
    return
  }
  try {
    emit({
      scenario: 'inspect-sql1',
      ok: true,
      schemaVersion: 1,
      revision: formatRevision(result.database.readGlobalRevision()),
      tasks: result.database.listRows('tasks').length,
      trash: result.database.listRows('trash').length,
    })
  } finally {
    result.database.close()
  }
  deps.app.quit()
}

/**
 * Executa o cenário e reporta uma linha JSON no stdout. Cenários de verificação pontual
 * encerram o app ao final; `bridge` permanece vivo para o teste de segunda instância.
 */
/**
 * TFA-006: lixeira e desfazer no pacote real — confirmações/tokens/contexto,
 * duas superfícies convergindo pela mesma projeção tasks+trash, UI de excluir/restaurar/esvaziar
 * com foco, e negativas de contexto/token. Fecha a janela principal (o runner valida a saída).
 */
async function runTrash(deps: ProductHarnessDependencies): Promise<void> {
  const { coordinator, mainWindow: surfaceA, stateIpc, sessions } = deps
  const checks: Record<string, boolean> = {}
  const info: Record<string, unknown> = { runtime: runtimeInfo(deps) }
  const now = Date.now()
  const revisionOf = async (id: string): Promise<string> => {
    const read = await coordinator.read((reader) => reader.getTask(id))
    return read.ok && read.value !== undefined ? read.value.contentRevision.toString(10) : '0'
  }

  expectOkUnit(
    await coordinator.run((unit) => {
      unit.emptyTrash()
      return unit.replaceAllTasks([], unit.baseRevision)
    }),
  )
  checks['trashAccessible'] = await evaluate<boolean>(
    surfaceA,
    uiWait(`(document.body.textContent || '').includes('Criar primeira tarefa') && Boolean(document.querySelector('[data-action="trash"]'))`),
  )
  await evaluate<boolean>(surfaceA, `(() => { document.querySelector('[data-action="trash"]')?.click(); return true })()`)
  checks['trashEmptyUi'] = await evaluate<boolean>(surfaceA, uiBodyHas('Lixeira vazia'))
  await evaluate<boolean>(surfaceA, `(() => { document.querySelector('[data-action="back"]')?.click(); return true })()`)
  checks['trashBackUi'] = await evaluate<boolean>(surfaceA, uiBodyHas('Nenhuma tarefa ainda'))

  // Semeia quatro tarefas fictícias direto no banco (mesmo coordenador do produto).
  const titles = [0, 1, 2, 3].map((index) => `Lixeira fictícia ${now} ${index}`)
  const seeded = [0, 1, 2, 3].map((index) => buildFictitiousTask(920_000 + index, { idPrefix: `trash-${index}` }))
  seeded.forEach((task, index) => {
    task.title = titles[index] ?? task.title
  })
  expectOkUnit(await coordinator.run((unit) => unit.saveTasks(seeded)))
  const [first, second, third, fourth] = seeded
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    throw new Error('fixtures unavailable')
  }
  checks['seedVisible'] = await evaluate<boolean>(surfaceA, uiBodyHas(titles[0] ?? ''))

  // Duas superfícies: B conduz a bridge (contexto próprio) e A a UI real (contexto do store).
  const surfaceB = deps.createSurface(true)
  if (surfaceB === null) throw new Error('second surface unavailable')
  await loadSurface(surfaceB, deps.surfaceUrl)
  const bridgeScript = (body: string): string => `(async () => {
    const seq = (window.__tfa006Sequence = (window.__tfa006Sequence ?? 10000) + 1)
    const cleared = await window.taskflowDesktop.clearUndoOffer({ version: 1, contextSequence: seq })
    if (cleared.status !== 'ok') return { cleared }
    return ${body}
  })()`

  // MOVE pela bridge real: prepara base, confirma e recebe retained + undoToken.
  const moveFlow = bridgeScript(`(async () => {
    const prepared = await window.taskflowDesktop.prepareTrashConfirmation({ version: 1, contextSequence: seq, kind: 'MOVE', taskId: ${JSON.stringify(first.id)}, expectedContentRevision: ${JSON.stringify(await revisionOf(first.id))} })
    if (prepared.status !== 'ok') return { prepared }
    const moved = await window.taskflowDesktop.moveTaskToTrash({ version: 2, contextSequence: seq, confirmationToken: prepared.confirmationToken })
    return { seq, prepared, moved }
  })()`)
  const moved = await evaluate<{ seq?: number; prepared?: CommandProbe; moved?: CommandProbe }>(surfaceB, moveFlow)
  info['move'] = { prepared: moved.prepared?.status, moved: moved.moved?.status }
  checks['prepareMove'] = moved.prepared?.status === 'ok' && moved.prepared?.itemCount === 1
  checks['moveRetained'] =
    moved.moved?.status === 'ok' &&
    moved.moved?.retained === true &&
    typeof moved.moved?.undoToken === 'string' &&
    typeof moved.moved?.undoEpoch === 'number' &&
    moved.moved.undoEpoch >= 1
  const firstGone = await coordinator.read((reader) => reader.getTask(first.id))
  const trashAfterMove = await coordinator.read((reader) => reader.listTrash())
  const entry = trashAfterMove.ok ? trashAfterMove.value.find((item) => item.task.id === first.id) : undefined
  checks['trashIdentity'] =
    firstGone.ok &&
    firstGone.value === undefined &&
    entry !== undefined &&
    formatRevision(entry.contentRevision) === moved.moved?.revision &&
    entry.deletedAt.length > 0
  checks['crossSurfaceMove'] = await evaluate<boolean>(surfaceA, uiWait(`!(document.body.textContent || '').includes(${JSON.stringify(titles[0])})`))

  // Restore pela bridge em B; A converge de volta pela mesma projeção tasks+trash.
  const restoreFlow = bridgeScript(
    `window.taskflowDesktop.restoreTrashItem({ version: 1, contextSequence: seq, entry: { taskId: ${JSON.stringify(first.id)}, contentRevision: ${JSON.stringify(moved.moved?.revision ?? '0')}, deletedAt: ${JSON.stringify(entry?.deletedAt ?? '')} } })`,
  )
  const restored = await evaluate<CommandProbe>(surfaceB, restoreFlow)
  checks['restoreAccepted'] = restored.status === 'ok'
  checks['crossSurfaceRestored'] = await evaluate<boolean>(surfaceA, uiBodyHas(titles[0] ?? ''))
  const firstBack = await coordinator.read((reader) => reader.getTask(first.id))
  const trashAfterRestore = await coordinator.read((reader) => reader.listTrash())
  checks['restoreNoGeneration'] =
    firstBack.ok &&
    firstBack.value?.task.id === first.id &&
    trashAfterRestore.ok &&
    trashAfterRestore.value.length === 0

  // UI de exclusão recuperável + oferta de Desfazer (L06/L07 pelo fluxo real do store em A).
  const uiDeleteAndUndo = `(async () => {
    const card = [...document.querySelectorAll('[data-task-id]')].find((element) => (element.textContent || '').includes(${JSON.stringify(titles[1])}))
    const control = card?.querySelector('[data-action="delete"]')
    if (!control) return false
    control.click()
    const deadline = Date.now() + 15000
    while (Date.now() < deadline && !document.querySelector('[role="alertdialog"]')) await new Promise((resolve) => setTimeout(resolve, 25))
    const dialog = document.querySelector('[role="alertdialog"]')
    if (!dialog || !(dialog.textContent || '').includes('30 dias')) return false
    const confirm = [...dialog.querySelectorAll('button')].find((button) => (button.textContent || '').includes('Excluir'))
    if (!confirm) return false
    confirm.click()
    const undoDeadline = Date.now() + 15000
    while (Date.now() < undoDeadline && !document.querySelector('[data-action="undo"]')) await new Promise((resolve) => setTimeout(resolve, 25))
    return Boolean(document.querySelector('[data-action="undo"]'))
  })()`
  checks['uiDeleteOffersUndo'] = await evaluate<boolean>(surfaceA, uiDeleteAndUndo)
  const secondInTrash = await coordinator.read((reader) => reader.getTrashItem(second.id))
  checks['uiDeleteCommitted'] = secondInTrash.ok && secondInTrash.value !== undefined
  checks['crossSurfaceDeleted'] = await evaluate<boolean>(surfaceB, uiWait(`!(document.body.textContent || '').includes(${JSON.stringify(titles[1])})`))
  await evaluate<boolean>(surfaceA, `(() => { document.querySelector('[data-action="undo"]')?.click(); return true })()`)
  checks['uiUndoRestores'] = await waitFor(async () => {
    const read = await coordinator.read((reader) => reader.getTask(second.id))
    return read.ok && read.value !== undefined
  })
  checks['undoConsumedOnce'] = await evaluate<boolean>(surfaceA, `(async () => !document.querySelector('[data-action="undo"]'))()`)

  // Confirmação stale: prepara em B, outra sessão edita o alvo e o commit recusa sem escrever.
  const stalePrepare = bridgeScript(`(async () => {
    const prepared = await window.taskflowDesktop.prepareTrashConfirmation({ version: 1, contextSequence: seq, kind: 'MOVE', taskId: ${JSON.stringify(third.id)}, expectedContentRevision: ${JSON.stringify(await revisionOf(third.id))} })
    window.__staleConfirmation = { seq, token: prepared.confirmationToken }
    return prepared
  })()`)
  const stalePrepared = await evaluate<CommandProbe>(surfaceB, stalePrepare)
  checks['stalePrepared'] = stalePrepared.status === 'ok'
  const thirdStored = await coordinator.read((reader) => reader.getTask(third.id))
  const thirdEditRevision = thirdStored.ok && thirdStored.value !== undefined ? thirdStored.value.editRevision : 1n
  expectOkUnit(
    await coordinator.run((unit) =>
      unit.updateTaskConditionally(third.id, thirdEditRevision, (current) => ({ ...current, title: `${current.title} alterada` })),
    ),
  )
  const staleMove = await evaluate<CommandProbe>(
    surfaceB,
    `window.taskflowDesktop.moveTaskToTrash({ version: 2, contextSequence: window.__staleConfirmation.seq, confirmationToken: window.__staleConfirmation.token })`,
  )
  checks['staleConfirmationRefused'] = staleMove.status === 'error' && staleMove.code === 'CONFIRMATION_CHANGED'
  const thirdStill = await coordinator.read((reader) => reader.getTask(third.id))
  checks['staleKeepsTask'] = thirdStill.ok && thirdStill.value?.task.id === third.id

  // Token alheio/repetido e contexto antigo na mesma superfície.
  const tokenNegatives = await evaluate<Array<{ status: string; code?: string }>>(
    surfaceB,
    `Promise.all([
      window.taskflowDesktop.moveTaskToTrash({ version: 2, contextSequence: window.__staleConfirmation.seq, confirmationToken: 'B'.repeat(32) }),
      window.taskflowDesktop.moveTaskToTrash({ version: 2, contextSequence: window.__staleConfirmation.seq, confirmationToken: window.__staleConfirmation.token }),
      (async () => {
        const next = (window.__tfa006Sequence = (window.__tfa006Sequence ?? 10000) + 1)
        await window.taskflowDesktop.clearUndoOffer({ version: 1, contextSequence: next })
        return window.taskflowDesktop.restoreTrashItem({ version: 1, contextSequence: window.__staleConfirmation.seq, entry: { taskId: ${JSON.stringify(third.id)}, contentRevision: '1', deletedAt: '2026-10-04T12:00:00.000Z' } })
      })(),
    ])`,
  )
  info['tokenNegatives'] = tokenNegatives.map((result) => result.code ?? result.status)
  checks['tokenAndContextRefused'] =
    tokenNegatives[0]?.code === 'CONFIRMATION_INVALID' &&
    tokenNegatives[1]?.code === 'CONFIRMATION_INVALID' &&
    tokenNegatives[2]?.code === 'STALE_CONTEXT'

  // EMPTY condicionado: prepara, composição muda por outra operação e recusa; depois esvazia.
  const moveThird = bridgeScript(`(async () => {
    const prepared = await window.taskflowDesktop.prepareTrashConfirmation({ version: 1, contextSequence: seq, kind: 'MOVE', taskId: ${JSON.stringify(third.id)}, expectedContentRevision: ${JSON.stringify(await revisionOf(third.id))} })
    if (prepared.status !== 'ok') return { prepared }
    return window.taskflowDesktop.moveTaskToTrash({ version: 2, contextSequence: seq, confirmationToken: prepared.confirmationToken })
  })()`)
  const movedThird = await evaluate<CommandProbe>(surfaceB, moveThird)
  checks['moveThird'] = movedThird.status === 'ok'

  const emptyPrepare = bridgeScript(`(async () => {
    const prepared = await window.taskflowDesktop.prepareTrashConfirmation({ version: 1, contextSequence: seq, kind: 'EMPTY' })
    window.__emptyConfirmation = { seq, token: prepared.confirmationToken }
    return prepared
  })()`)
  const emptyPrepared = await evaluate<CommandProbe>(surfaceB, emptyPrepare)
  checks['emptyPrepared'] = emptyPrepared.status === 'ok' && emptyPrepared.itemCount === 1
  // Outra sessão move a quarta tarefa: composição muda e a confirmação antiga é recusada.
  expectOkUnit(
    await coordinator.run((unit) => {
      unit.moveToTrash(fourth.id, new Date(now).toISOString())
    }),
  )
  const staleEmpty = await evaluate<CommandProbe>(
    surfaceB,
    `window.taskflowDesktop.emptyTrash({ version: 1, contextSequence: window.__emptyConfirmation.seq, confirmationToken: window.__emptyConfirmation.token })`,
  )
  checks['emptyStaleRefused'] = staleEmpty.status === 'error' && staleEmpty.code === 'CONFIRMATION_CHANGED'
  const stillTwo = await coordinator.read((reader) => reader.listTrash())
  checks['emptyStaleKeepsItems'] = stillTwo.ok && stillTwo.value.length === 2

  const emptyFlow = bridgeScript(`(async () => {
    const prepared = await window.taskflowDesktop.prepareTrashConfirmation({ version: 1, contextSequence: seq, kind: 'EMPTY' })
    if (prepared.status !== 'ok') return { prepared }
    const emptied = await window.taskflowDesktop.emptyTrash({ version: 1, contextSequence: seq, confirmationToken: prepared.confirmationToken })
    return { prepared, emptied }
  })()`)
  const emptied = await evaluate<{ prepared?: CommandProbe; emptied?: CommandProbe }>(surfaceB, emptyFlow)
  checks['emptyExact'] = emptied.emptied?.status === 'ok' && emptied.emptied?.removedCount === 2
  checks['emptyNoUndo'] = emptied.emptied !== undefined && !('undoToken' in emptied.emptied)

  // UI de esvaziamento com foco em Voltar: move uma tarefa pela bridge e esvazia pela UI de A.
  const lastTask = buildFictitiousTask(920_100, { idPrefix: 'trash-ui' })
  expectOkUnit(await coordinator.run((unit) => unit.saveTask(lastTask)))
  const lastStored = await coordinator.read((reader) => reader.getTask(lastTask.id))
  if (lastStored.ok && lastStored.value !== undefined) {
    const moveUi = bridgeScript(`(async () => {
      const prepared = await window.taskflowDesktop.prepareTrashConfirmation({ version: 1, contextSequence: seq, kind: 'MOVE', taskId: ${JSON.stringify(lastTask.id)}, expectedContentRevision: ${JSON.stringify(lastStored.value.contentRevision.toString(10))} })
      if (prepared.status !== 'ok') return prepared
      return window.taskflowDesktop.moveTaskToTrash({ version: 2, contextSequence: seq, confirmationToken: prepared.confirmationToken })
    })()`)
    await evaluate<CommandProbe>(surfaceB, moveUi)
  }
  checks['crossSurfaceSeesNew'] = await evaluate<boolean>(surfaceA, uiWait(`!(document.body.textContent || '').includes(${JSON.stringify(lastTask.title)})`))
  await evaluate<boolean>(surfaceA, `(() => { document.querySelector('[data-action="trash"]')?.click(); return true })()`)
  checks['uiTrashShowsItem'] = await evaluate<boolean>(surfaceA, uiBodyHas(lastTask.title))
  const uiEmpty = `(async () => {
    const stages = { clicked: false, disabled: false, dialog: false, confirmed: false, activeAction: '', alert: '' }
    const clickDeadline = Date.now() + 15000
    while (Date.now() < clickDeadline) {
      const candidate = document.querySelector('[data-action="empty"]')
      if (candidate) {
        stages.disabled = candidate.getAttribute('aria-disabled') === 'true'
        if (!stages.disabled) {
          candidate.click()
          stages.clicked = true
          break
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    if (!stages.clicked) return stages
    const deadline = Date.now() + 15000
    while (Date.now() < deadline && !document.querySelector('[role="alertdialog"]')) {
      const alert = document.querySelector('[role="alert"]')
      if (alert && (alert.textContent || '').trim().length > 0) {
        stages.alert = (alert.textContent || '').trim().slice(0, 160)
        return stages
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const dialog = document.querySelector('[role="alertdialog"]')
    stages.dialog = Boolean(dialog)
    const confirm = dialog ? [...dialog.querySelectorAll('button')].find((button) => (button.textContent || '').includes('Esvaziar lixeira')) : undefined
    if (!confirm) return stages
    confirm.click()
    stages.confirmed = true
    const focusDeadline = Date.now() + 15000
    while (Date.now() < focusDeadline) {
      const active = document.activeElement
      stages.activeAction = active instanceof HTMLElement ? (active.dataset.action ?? active.tagName) : 'none'
      if (stages.activeAction === 'back') return stages
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return stages
  })()`
  const emptyUi = await evaluate<{ clicked: boolean; disabled: boolean; dialog: boolean; confirmed: boolean; activeAction: string; alert: string }>(surfaceA, uiEmpty)
  info['emptyUi'] = emptyUi
  checks['uiEmptyFocusBack'] = emptyUi.activeAction === 'back'

  surfaceB.destroy()
  await waitFor(() => sessions.size === 1 && stateIpc.trackedDocuments <= 1, 10_000)
  checks['testSurfaceReleased'] = sessions.size === 1 && stateIpc.trackedDocuments <= 1

  emit({ scenario: 'trash', ok: Object.values(checks).every(Boolean), checks, info })

  await new Promise<void>((resolve) => {
    deps.mainWindow.once('closed', () => resolve())
    deps.mainWindow.close()
  })
}

interface BackupSubscriptionProbe {
  status: string
  subscriptionId?: string
  revision?: string
  undoEpoch?: number
  tasks?: number
  code?: string
}

interface BackupUpdateProbe {
  type: string
  revision?: string
  undoEpoch?: number
  reason?: string
  code?: string
}

const BACKUP_SUBSCRIBE_SCRIPT = `(async () => {
  window.__backupUpdates = []
  const result = await window.taskflowDesktop.subscribeState({ version: 3 }, (update) => {
    window.__backupUpdates.push(update.type === 'snapshot'
      ? { type: 'snapshot', revision: update.snapshot.revision, undoEpoch: update.snapshot.undoEpoch }
      : update)
  })
  return result.status === 'ok'
    ? { status: 'ok', subscriptionId: result.subscriptionId, revision: result.snapshot.revision, undoEpoch: result.snapshot.undoEpoch, tasks: result.snapshot.tasks.length }
    : result
})()`

const BACKUP_UPDATES_WAIT = (epoch: number): string => `(async () => {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const updates = window.__backupUpdates || []
    if (updates.some((update) => update && update.type === 'undo-invalidated' && update.undoEpoch >= ${epoch})) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
})()`

const BACKUP_UPDATES_READ = `(() => {
  const updates = window.__backupUpdates || []
  return updates.map((update) => update.type === 'snapshot'
    ? { type: 'snapshot', revision: update.snapshot.revision }
    : { type: update.type, undoEpoch: update.undoEpoch, reason: update.reason, code: update.code })
})()`

/**
 * TFA-007: exportação e restauração de backup no pacote real — serviços do main com diálogos
 * nativos substituídos por stub (nenhum diálogo real é aberto), arquivo em diretório temporário
 * exclusivo, lixeira/undo barrados por época e duas superfícies inscritas na bridge v3. Perfil
 * exclusivamente fictício; fecha a janela principal ao final (o runner valida a saída).
 */
async function runBackup(deps: ProductHarnessDependencies, exportFail?: BackupWriteFaultPoint): Promise<void> {
  const backup = deps.backup
  if (backup === undefined) throw new Error('backup services unavailable')
  const { coordinator, mainWindow: surfaceA, sessions, stateIpc } = deps
  const checks: Record<string, boolean> = {}
  const info: Record<string, unknown> = {
    runtime: runtimeInfo(deps),
    dialog: 'stub',
    note: 'diálogos nativos substituídos por stub do harness; nenhum diálogo real é aberto',
    ...(exportFail !== undefined && { exportFailPoint: exportFail }),
  }
  const workDir = mkdtempSync(path.join(os.tmpdir(), 'tfa007-harness-'))

  try {
    // Ticket sintetizado do main: a janela principal é registrada pelo index.ts; sem registro não
    // há sessão autorizada para os serviços reais.
    const ticket = sessions.authorize({
      sender: surfaceA.webContents as never,
      senderFrame: surfaceA.webContents.mainFrame as never,
    })
    if (ticket === null) throw new Error('main window is not registered')
    info['ticket'] = { contentsId: ticket.contentsId, generation: ticket.generation }

    // Diálogo stub: a fila devolve o caminho esperado por tipo de pedido; nunca abre janela nativa.
    const dialogQueue: Array<{ kind: 'open' | 'save'; file: string }> = []
    const dialogs: BackupDialogBroker = {
      show: async (_ticket, request) => {
        const next = dialogQueue.shift()
        if (next === undefined || next.kind !== request.kind) return { canceled: true, filePaths: [] }
        return { canceled: false, filePaths: [next.file] }
      },
    }
    // Variante com os serviços reais (storage/registro/orçamento/trava/undo) e somente o diálogo
    // trocado; o ponto de falha de gravação compartilha o objeto do harness para poder ser armado.
    const services = new BackupCommandServices({
      dialogs,
      storage: coordinator,
      ledger: backup.ledger,
      gate: backup.gate,
      registry: backup.registry,
      undo: backup.undo,
      clock: () => new Date(),
      appVersion: () => deps.app.getVersion(),
      protectedRoots: () => [],
      isAuthorized: (candidate) => sessions.isCurrent(candidate),
      contextSequence: (candidate) => backup.undo.contextSequence(candidate.key),
      faults: backup.writeFaults,
    })
    const contextSequence = (): number => {
      const cleared = backup.undo.clear(ticket.key, 1)
      if (cleared.status !== 'ok') throw new Error('backup context could not be established')
      return backup.undo.contextSequence(ticket.key)
    }

    // Estado de partida determinístico: nenhuma tarefa/lixeira anterior participa das contagens.
    expectOkUnit(
      await coordinator.run((unit) => {
        unit.emptyTrash()
        return unit.replaceAllTasks([], unit.baseRevision)
      }),
    )

    // (1) Semeia duas tarefas fictícias, move uma para a lixeira e exporta as ativas pelo serviço.
    const kept = buildFictitiousTask(40_001, { idPrefix: 'backup-keep' })
    const trashed = buildFictitiousTask(40_002, { idPrefix: 'backup-lixeira' })
    expectOkUnit(
      await coordinator.run((unit) => {
        unit.saveTasks([kept, trashed])
        unit.moveToTrash(trashed.id, '2026-10-04T12:00:00.000Z')
      }),
    )
    const exportFile = path.join(workDir, 'export-v4.json')
    dialogQueue.push({ kind: 'save', file: exportFile })
    const exported = await services.exportBackup(ticket, contextSequence())
    const exportText = existsSync(exportFile) ? readFileSync(exportFile, 'utf8') : ''
    const parsedExport = exportText === '' ? null : readBackupFile(exportText)
    const exportedBackup = parsedExport !== null && parsedExport.ok ? parsedExport.backup : null
    const exportedFileCount = exportedBackup?.tasks.length ?? -1
    checks['exportSaved'] = exported.status === 'ok' && exported.outcome === 'SAVED'
    checks['exportFileValid'] = exportedBackup !== null && exportedBackup.sourceFormatVersion === 4
    checks['exportCountMatches'] = exported.status === 'ok' && exported.taskCount === exportedFileCount
    checks['exportNoTempLeftovers'] = readdirSync(workDir).every((name) => !name.endsWith('.tmp'))
    info['export'] = {
      outcome: exported.status === 'ok' ? exported.outcome : exported.status,
      taskCount: exported.status === 'ok' ? exported.taskCount : null,
      fileTaskCount: exportedFileCount,
      sourceFormatVersion: exportedBackup?.sourceFormatVersion ?? null,
    }

    // (2) Prévia completa e confirmação APPLIED com verificação e época nova.
    dialogQueue.push({ kind: 'open', file: exportFile })
    const appliedPreview = await services.prepareBackupRestore(ticket, contextSequence())
    const appliedEpochBefore = backup.undo.epoch
    const appliedConfirm =
      appliedPreview.status === 'ok'
        ? await services.confirmBackupRestore(ticket, contextSequence(), appliedPreview.restoreToken)
        : null
    const appliedReconfirm =
      appliedPreview.status === 'ok'
        ? await services.confirmBackupRestore(ticket, contextSequence(), appliedPreview.restoreToken)
        : null
    checks['prepareAppliedPreview'] =
      appliedPreview.status === 'ok' &&
      appliedPreview.sourceFormatVersion === 4 &&
      appliedPreview.formatVersion === 4 &&
      appliedPreview.fileTaskCount === exportedFileCount &&
      appliedPreview.localTaskCount === 1 &&
      appliedPreview.expiresInMs === BACKUP_PREVIEW_TTL_MS
    checks['confirmApplied'] =
      appliedConfirm !== null &&
      appliedConfirm.status === 'ok' &&
      appliedConfirm.outcome === 'APPLIED' &&
      appliedConfirm.verification === 'VERIFIED' &&
      appliedConfirm.undoEpoch === appliedEpochBefore + 1
    checks['reconfirmInvalid'] =
      appliedReconfirm !== null &&
      appliedReconfirm.status === 'error' &&
      appliedReconfirm.code === 'BACKUP_PREVIEW_INVALID'
    info['applied'] = {
      preview:
        appliedPreview.status === 'ok'
          ? {
              sourceFormatVersion: appliedPreview.sourceFormatVersion,
              formatVersion: appliedPreview.formatVersion,
              fileTaskCount: appliedPreview.fileTaskCount,
              localTaskCount: appliedPreview.localTaskCount,
              expiresInMs: appliedPreview.expiresInMs,
            }
          : appliedPreview.status,
      confirm:
        appliedConfirm === null
          ? null
          : appliedConfirm.status === 'ok'
            ? {
                outcome: appliedConfirm.outcome,
                revision: appliedConfirm.revision,
                restoredCount: appliedConfirm.restoredCount,
                verification: appliedConfirm.verification,
                undoEpoch: appliedConfirm.undoEpoch,
              }
            : { code: appliedConfirm.code, commitState: appliedConfirm.commitState ?? null },
      reconfirm:
        appliedReconfirm === null ? null : appliedReconfirm.status === 'error' ? appliedReconfirm.code : appliedReconfirm.status,
    }

    // (3)+(7) UNCHANGED com duas superfícies inscritas na v3: a barreira de época chega sem
    // revisão SQL nova e nenhum outro tipo de evento aparece.
    const surfaceB = deps.createSurface(true)
    if (surfaceB === null) throw new Error('second surface unavailable')
    await loadSurface(surfaceB, deps.surfaceUrl)
    const subscriptionA = await evaluate<BackupSubscriptionProbe>(surfaceA, BACKUP_SUBSCRIBE_SCRIPT)
    const subscriptionB = await evaluate<BackupSubscriptionProbe>(surfaceB, BACKUP_SUBSCRIBE_SCRIPT)
    checks['subscribeBothSurfaces'] =
      subscriptionA.status === 'ok' &&
      subscriptionB.status === 'ok' &&
      subscriptionA.subscriptionId !== subscriptionB.subscriptionId

    const unchangedRevisionBefore = coordinator.confirmedRevision ?? 0n
    dialogQueue.push({ kind: 'open', file: exportFile })
    const unchangedPreview = await services.prepareBackupRestore(ticket, contextSequence())
    const unchangedEpochBefore = backup.undo.epoch
    const unchangedConfirm =
      unchangedPreview.status === 'ok'
        ? await services.confirmBackupRestore(ticket, contextSequence(), unchangedPreview.restoreToken)
        : null
    checks['confirmUnchanged'] =
      unchangedConfirm !== null &&
      unchangedConfirm.status === 'ok' &&
      unchangedConfirm.outcome === 'UNCHANGED' &&
      unchangedConfirm.verification === 'VERIFIED' &&
      unchangedConfirm.revision === formatRevision(unchangedRevisionBefore) &&
      unchangedConfirm.undoEpoch === unchangedEpochBefore + 1
    checks['unchangedKeepsRevision'] = (coordinator.confirmedRevision ?? 0n) === unchangedRevisionBefore

    const expectedEpoch = unchangedConfirm !== null && unchangedConfirm.status === 'ok' ? unchangedConfirm.undoEpoch : -1
    const epochOnSecondSurface =
      expectedEpoch >= 1 ? await evaluate<boolean>(surfaceB, BACKUP_UPDATES_WAIT(expectedEpoch)) : false
    const updatesA = await evaluate<BackupUpdateProbe[]>(surfaceA, BACKUP_UPDATES_READ)
    const updatesB = await evaluate<BackupUpdateProbe[]>(surfaceB, BACKUP_UPDATES_READ)
    checks['epochEventSecondSurface'] =
      epochOnSecondSurface &&
      updatesB.some(
        (update) =>
          update.type === 'undo-invalidated' &&
          update.undoEpoch === expectedEpoch &&
          update.reason === 'BACKUP_RESTORED',
      )
    checks['revisionStableSecondSurface'] =
      subscriptionB.revision !== undefined &&
      updatesB.filter((update) => update.type === 'snapshot').every((update) => update.revision === subscriptionB.revision) &&
      (coordinator.confirmedRevision ?? 0n) === unchangedRevisionBefore
    const knownTypes = new Set(['snapshot', 'stale', 'undo-invalidated'])
    checks['noExtraEventTypes'] =
      updatesA.every((update) => knownTypes.has(update.type)) &&
      updatesB.every((update) => knownTypes.has(update.type)) &&
      updatesB.every((update) => update.type === 'snapshot' || update.type === 'undo-invalidated')
    info['unchanged'] = {
      outcome: unchangedConfirm !== null && unchangedConfirm.status === 'ok' ? unchangedConfirm.outcome : unchangedConfirm?.status ?? null,
      revision: unchangedConfirm !== null && unchangedConfirm.status === 'ok' ? unchangedConfirm.revision : null,
      undoEpoch: unchangedConfirm !== null && unchangedConfirm.status === 'ok' ? unchangedConfirm.undoEpoch : null,
      expectedEpoch,
      updateTypesSecond: updatesB.map((update) => update.type),
    }

    surfaceB.destroy()
    await waitFor(() => sessions.size === 1 && stateIpc.trackedDocuments <= 1, 10_000)
    checks['testSurfaceReleased'] = sessions.size === 1 && stateIpc.trackedDocuments <= 1

    // (4) Base mudou depois da prévia: BACKUP_BASE_CHANGED sem aplicar nada nem perder dados.
    dialogQueue.push({ kind: 'open', file: exportFile })
    const stalePreview = await services.prepareBackupRestore(ticket, contextSequence())
    const lateTask = buildFictitiousTask(40_003, { idPrefix: 'backup-tardia' })
    expectOkUnit(await coordinator.run((unit) => unit.saveTask(lateTask)))
    const staleConfirm =
      stalePreview.status === 'ok'
        ? await services.confirmBackupRestore(ticket, contextSequence(), stalePreview.restoreToken)
        : null
    checks['baseStaleRefused'] =
      staleConfirm !== null &&
      staleConfirm.status === 'error' &&
      staleConfirm.code === 'BACKUP_BASE_CHANGED' &&
      staleConfirm.commitState === 'NOT_APPLIED'
    const afterStale = await coordinator.read((reader) => ({
      tasks: reader.listTasks().length,
      trash: reader.listTrash().length,
      kept: reader.getTask(kept.id) !== undefined,
      late: reader.getTask(lateTask.id) !== undefined,
    }))
    checks['baseStaleNoLoss'] =
      afterStale.ok &&
      afterStale.value.kept &&
      afterStale.value.late &&
      afterStale.value.tasks === 2 &&
      afterStale.value.trash === 1
    info['baseStale'] = {
      prepare: stalePreview.status,
      confirm:
        staleConfirm === null ? null : staleConfirm.status === 'error' ? staleConfirm.code : staleConfirm.status,
      tasks: afterStale.ok ? afterStale.value.tasks : null,
      trash: afterStale.ok ? afterStale.value.trash : null,
    }

    // (5) Portadora do arquivo com a mesma série de uma portadora na lixeira: SERIES_CONFLICT sem
    // substituição; a lixeira permanece intacta.
    const carrier = buildFictitiousTask(42, { idPrefix: 'backup-carrier' })
    if (carrier.recurrence === undefined || carrier.seriesId === undefined) throw new Error('carrier fixture unavailable')
    expectOkUnit(
      await coordinator.run((unit) => {
        unit.saveTask(carrier)
        unit.moveToTrash(carrier.id, '2026-10-05T12:00:00.000Z')
      }),
    )
    const seriesFile = path.join(workDir, 'series-conflict-v4.json')
    writeFileSync(
      seriesFile,
      JSON.stringify({
        format: 'taskflow-backup',
        formatVersion: 4,
        exportedAt: new Date().toISOString(),
        app: { version: '0.1.0' },
        tasks: [carrier],
      }),
      'utf8',
    )
    dialogQueue.push({ kind: 'open', file: seriesFile })
    const seriesPreview = await services.prepareBackupRestore(ticket, contextSequence())
    const seriesConfirm =
      seriesPreview.status === 'ok'
        ? await services.confirmBackupRestore(ticket, contextSequence(), seriesPreview.restoreToken)
        : null
    checks['seriesConflictRefused'] =
      seriesConfirm !== null &&
      seriesConfirm.status === 'error' &&
      seriesConfirm.code === 'SERIES_CONFLICT' &&
      seriesConfirm.commitState === 'NOT_APPLIED'
    const carrierInTrash = await coordinator.read((reader) => reader.getTrashItem(carrier.id))
    checks['seriesConflictKeepsTrash'] =
      carrierInTrash.ok && carrierInTrash.value !== undefined && carrierInTrash.value.task.seriesId === carrier.seriesId
    info['seriesConflict'] = {
      prepare: seriesPreview.status,
      confirm:
        seriesConfirm === null ? null : seriesConfirm.status === 'error' ? seriesConfirm.code : seriesConfirm.status,
      trashKept: carrierInTrash.ok && carrierInTrash.value !== undefined,
    }

    // (6) Somente com ponto pedido: falha injetada na gravação nunca abre diálogo e preserva o
    // destino anterior (pontos pós-substituição viram aviso por contrato, sem rollback).
    if (exportFail !== undefined) {
      const failDestination = path.join(workDir, 'export-fail.json')
      const originalContent = 'conteúdo anterior preservado'
      writeFileSync(failDestination, originalContent, 'utf8')
      const beforeRename =
        exportFail === 'temp:before-write' ||
        exportFail === 'temp:after-write' ||
        exportFail === 'temp:after-sync' ||
        exportFail === 'rename:before'
      backup.writeFaults.at = (point) => {
        if (point === exportFail) throw new Error('harness write fault')
      }
      dialogQueue.push({ kind: 'save', file: failDestination })
      const failedExport = await services.exportBackup(ticket, contextSequence())
      delete backup.writeFaults.at
      const destinationContent = existsSync(failDestination) ? readFileSync(failDestination, 'utf8') : ''
      const noTempLeftovers = readdirSync(workDir).every((name) => !name.endsWith('.tmp'))
      if (beforeRename) {
        checks['exportFailRefused'] =
          failedExport.status === 'error' &&
          failedExport.code === 'FILE_WRITE_FAILED' &&
          destinationContent === originalContent &&
          noTempLeftovers
      } else {
        checks['exportFailWarning'] =
          failedExport.status === 'ok' &&
          failedExport.outcome === 'SAVED_WITH_WARNING' &&
          destinationContent !== originalContent
      }
      checks['exportFailDisarmed'] = backup.writeFaults.at === undefined
      info['exportFail'] = {
        point: exportFail,
        beforeRename,
        result:
          failedExport.status === 'ok'
            ? failedExport.outcome
            : failedExport.status === 'error'
              ? failedExport.code
              : 'cancelled',
        destinationPreserved: destinationContent === originalContent,
        noTempLeftovers,
      }
    }

    emit({ scenario: 'backup', ok: Object.values(checks).every(Boolean), checks, info })
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true, maxRetries: 5 })
    } catch {
      // Diretório fictício temporário: resíduo não altera o resultado do cenário.
    }
  }

  await new Promise<void>((resolve) => {
    deps.mainWindow.once('closed', () => resolve())
    deps.mainWindow.close()
  })
}

export async function runProductHarness(
  scenario: ProductHarnessScenario,
  deps: ProductHarnessDependencies,
): Promise<void> {
  try {
    if (scenario.name === 'bridge') {
      await runBridge(deps)
      return
    }
    if (scenario.name === 'crash') {
      await runCrash(deps, scenario.point, scenario.unit)
      return
    }
    if (scenario.name === 'tasks') {
      await runTasks(deps)
      return
    }
    if (scenario.name === 'recurrence') {
      await runRecurrence(deps)
      return
    }
    if (scenario.name === 'trash') {
      await runTrash(deps)
      return
    }
    if (scenario.name === 'backup') {
      await runBackup(deps, scenario.exportFail)
      return
    }
    if (scenario.name === 'seed-sql1') {
      await runSeedSql1(deps)
      return
    }
    if (scenario.name === 'inspect-sql1') {
      runInspectSql1(deps)
      return
    }
    if (scenario.name === 'reopen') await runReopen(deps)
    else if (scenario.name === 'drain') await runDrain(deps)
    else if (scenario.name === 'ui-bench') await runUiBench(deps)
    else if (scenario.name === 'a11y') await runA11y(deps, scenario.opener)
    else await runBench(deps)
    deps.app.quit()
  } catch {
    emit({ scenario: scenario.name, ok: false, code: 'HARNESS_FAILED' })
    deps.app.exit(3)
  }
}
