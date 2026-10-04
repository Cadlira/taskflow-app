// Harness restrito de produto (TFA-003). Só executa no perfil `test` e quando o processo
// recebe `--product-harness=<cenário>`. Usa unidades internas do coordenador para confirmar
// dados fictícios e a bridge pública real para ler; não acrescenta canal, writer ou hook de
// teste ao preload, e não implementa gerenciamento de tarefas.
import type { App, BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { formatRevision } from '../../application/storage/revisions.js'
import type { StateSnapshotResult } from '../../contracts/state.js'
import { utf8ByteLength } from '../../contracts/text.js'
import type { Task } from '../../domain/task.js'
import type { DocumentSessions } from '../ipc/document-sessions.js'
import type { StateIpcService } from '../ipc/state.js'
import type { ShutdownReport, StorageCoordinator } from '../storage/coordinator.js'
import { ProductDatabase, type StorageFaultPoint, type StorageFaults } from '../storage/product-database.js'
import { PRODUCT_STORAGE_DEFINITION } from '../storage/product-schema.js'
import { buildFictitiousTask, buildFictitiousTasks, buildMinimalFictitiousTask, fictitiousText } from './fixtures.js'

const HARNESS_PREFIX = '--product-harness='
const MARKER = 'TASKFLOW_PRODUCT_TEST '
const CRASH_POINTS: readonly StorageFaultPoint[] = [
  'unit:before-begin',
  'unit:in-transaction',
  'unit:before-commit',
  'unit:after-commit',
  'unit:before-publish',
]

export type ProductHarnessScenario =
  | { name: 'bridge' }
  | { name: 'reopen' }
  | { name: 'bench' }
  | { name: 'drain' }
  | { name: 'crash'; point: StorageFaultPoint; unit: 'save' | 'claim' }

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
}

/** Aceita exatamente um argumento de harness com cenário conhecido; qualquer outra forma é ignorada. */
export function parseProductHarnessScenario(argv: readonly string[]): ProductHarnessScenario | null {
  const matches = argv.filter((argument) => argument.startsWith(HARNESS_PREFIX))
  const value = matches[0]?.slice(HARNESS_PREFIX.length)
  if (matches.length !== 1 || value === undefined) return null
  if (value === 'bridge' || value === 'reopen' || value === 'bench' || value === 'drain') return { name: value }

  const [name, point, unit, ...rest] = value.split('|')
  if (name !== 'crash' || rest.length > 0) return null
  if (!CRASH_POINTS.includes(point as StorageFaultPoint)) return null
  if (unit !== undefined && unit !== 'save' && unit !== 'claim') return null
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
  const result = await window.taskflowDesktop.subscribeState({ version: 1 }, (update) => {
    window.__tf.updates.push(update.type === 'snapshot'
      ? { type: 'snapshot', revision: update.snapshot.revision, tasks: update.snapshot.tasks.length, trash: update.snapshot.trash.length }
      : update)
  })
  return result.status === 'ok'
    ? { status: 'ok', subscriptionId: result.subscriptionId, revision: result.snapshot.revision, tasks: result.snapshot.tasks.length }
    : result
})()`

const LAST_UPDATE_SCRIPT = `(() => {
  if (!window.__tf) return null
  const snapshots = window.__tf.updates.filter((update) => update.type === 'snapshot')
  return { count: window.__tf.updates.length, last: snapshots.length ? snapshots[snapshots.length - 1] : null }
})()`

const SNAPSHOT_SCRIPT = 'window.taskflowDesktop.getStateSnapshot({ version: 1 })'

interface SubscribeProbe {
  status: string
  subscriptionId?: string
  revision?: string
  tasks?: number
  code?: string
}

interface UpdateProbe {
  count: number
  last: { revision: string; tasks: number; trash: number } | null
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
  checks['catalogClosed'] =
    JSON.stringify(catalog['keys']) ===
      JSON.stringify(['getStateSnapshot', 'subscribeState', 'unsubscribeState', 'verifyFoundation']) &&
    catalog['frozen'] === true &&
    (catalog['globals'] as string[]).every((kind) => kind === 'undefined')

  const startRevision = currentRevision()
  const initial = await evaluate<StateSnapshotResult>(surfaceA, SNAPSHOT_SCRIPT)
  checks['initialSnapshot'] = initial.status === 'ok' && initial.snapshot.revision === startRevision

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
    `window.taskflowDesktop.subscribeState({ version: 1 }).then((result) => ({ status: result.status, subscriptionId: result.subscriptionId }))`,
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

  // Negativas pela bridge real: schema exato, limite de 1 KiB e token de outra sessão.
  const negatives = await evaluate<Array<{ status: string; code?: string }>>(
    surfaceA,
    `Promise.all([
      window.taskflowDesktop.getStateSnapshot({ version: 2 }),
      window.taskflowDesktop.getStateSnapshot({ version: 1, extra: true }),
      window.taskflowDesktop.getStateSnapshot({ version: 1, pad: 'x'.repeat(2000) }),
      window.taskflowDesktop.subscribeState({ version: 1, sql: 'SELECT 1' }),
      window.taskflowDesktop.unsubscribeState({ version: 1, subscriptionId: '../x' }),
      window.taskflowDesktop.unsubscribeState({ version: 1, subscriptionId: ${JSON.stringify(subscriptionB.subscriptionId ?? '')} }),
    ])`,
  )
  info['negatives'] = negatives.map((result) => result.code ?? result.status)
  checks['invalidRequestsRefused'] = negatives.slice(0, 5).every((result) => result.code === 'INVALID_REQUEST')
  checks['foreignUnsubscribeRefused'] = negatives[5]?.code === 'UNAUTHORIZED' && stateIpc.activeSubscriptions === 2

  const unsubscribed = await evaluate<Array<{ status: string }>>(
    surfaceA,
    `(async () => {
      const request = { version: 1, subscriptionId: ${JSON.stringify(subscriptionA.subscriptionId ?? '')} }
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
        window.taskflowDesktop.getStateSnapshot({ version: 1 }),
        window.taskflowDesktop.subscribeState({ version: 1 }),
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
      `typeof window.taskflowDesktop === 'object' ? window.taskflowDesktop.getStateSnapshot({ version: 1 }) : null`,
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
  checks['reloadInvalidatesSession'] = afterReload === 0 && reloadCommit.ok && reloadCommit.committed && !leaked
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
  unit: 'save' | 'claim',
): Promise<void> {
  const { coordinator } = deps
  const claimTask = buildFictitiousTask(7001, { idPrefix: 'claim' })
  const pending = claimTask.reminders.find((reminder) => reminder.processedFor === undefined && reminder.type === 'OFFSET')
  if (unit === 'claim') await coordinator.run((target) => target.saveTask(claimTask))

  const base = coordinator.confirmedRevision ?? 0n
  deps.faults.at = (reached) => {
    if (reached !== point) return
    writeFileSync(barrierFile(deps), JSON.stringify({ point, pid: process.pid, baseRevision: formatRevision(base) }))
    // Barreira: o processo fica parado aqui até ser encerrado pelo runner.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
  }
  emit({ scenario: 'crash', armed: true, point, unit, pid: process.pid, baseRevision: formatRevision(base) })

  if (unit === 'claim' && pending?.type === 'OFFSET' && claimTask.dueAt !== undefined) {
    const processedFor = new Date(Date.parse(claimTask.dueAt) - pending.offsetMinutes * 60_000).toISOString()
    await coordinator.run((target) =>
      target.claimReminderOccurrence({ taskId: claimTask.id, reminderId: pending.id, processedFor }),
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
        return unit.updateTaskConditionally(task.id, stored.contentRevision, (current) => ({
          ...current,
          title: `${current.title} (editada)`,
        })).status
      })
    }
    const mutationDurations = [...unitDurations]

    // Páginas pela bridge real: cada leitura de página é uma unidade medida.
    unitDurations.length = 0
    const snapshotStarted = performance.now()
    const snapshot = await evaluate<{ status: string; tasks?: number; trash?: number; code?: string }>(
      mainWindow,
      `window.taskflowDesktop.getStateSnapshot({ version: 1 }).then((result) => result.status === 'ok'
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
  }

  emit({
    scenario: 'bench',
    ok: Object.values(gates).every(Boolean),
    gates,
    datasets,
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

/**
 * Executa o cenário e reporta uma linha JSON no stdout. Cenários de verificação pontual
 * encerram o app ao final; `bridge` permanece vivo para o teste de segunda instância.
 */
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
    if (scenario.name === 'reopen') await runReopen(deps)
    else if (scenario.name === 'drain') await runDrain(deps)
    else await runBench(deps)
    deps.app.quit()
  } catch {
    emit({ scenario: scenario.name, ok: false, code: 'HARNESS_FAILED' })
    deps.app.exit(3)
  }
}
