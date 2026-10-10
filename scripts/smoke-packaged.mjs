// smoke:packaged — integração real do pacote (TFA-002).
//
// Copia release/win-unpacked para um diretório temporário de teste e concede a ACE
// aprovada em 2026-10-04 (S-1-15-2-1, leitura/execução herdável) SOMENTE a essa cópia,
// nunca a pais, dados/perfis, roots globais ou outros diretórios. Executa o exe com o
// perfil test fixado (--foundation-test), cwd fora do repo e timeout de 60 s por execução.
//
// Isolamento integral (TFA-012, task 3.2): TODAS as fases — inclusive S1–S9 — usam um
// LOCALAPPDATA próprio sob smokeRoot, com paths calculados desse root (scripts/smoke-
// environment.mjs) e ambiente passado a todos os filhos/cópias/negativas/lifecycle.
// A comparação de integridade do perfil prod usa somente uma sentinela fictícia sob o
// próprio smokeRoot; nenhum caminho do perfil pessoal é lido, listado ou escrito.
//
// Confirma: prova SQLite real pelo renderer/preload/IPC (com probes negativos de payload),
// reabertura com fingerprint persistente, segunda instância sem saída/escrita e negativas
// integradas (preload ausente, asar corrompido, tentativa de override de perfil/caminho).
// Limpeza restrita aos processos/pastas de teste criados; nenhum modo inseguro é usado.
//
// TFA-003 — harness de produto no mesmo fluxo: banco de produto e bridge real de estado no
// Electron empacotado, com LOCALAPPDATA apontando para a pasta temporária do próprio smoke
// (perfil inteiramente fictício). Cobre round-trip/reopen, duas superfícies, negativas e
// origem real, subscriptions, ownership, kill do processo de teste em barreiras, drain e o
// benchmark. O Setup não é executado e nenhum Node/npm externo participa do app em teste.
// Evidência detalhada: release/product-harness-evidence.json (não versionado).
//
// TFA-004 — UI real de tarefas no mesmo fluxo: criar/editar/status/reabrir/abrir origem pela
// interface com opener falso, duas superfícies, negativas dos oito comandos, foco/ressync,
// reload sem duplicação e fechamento da janela principal; medição D10 com 1.000/10.000 tarefas
// (montagem, p95 de consultas e heartbeat) e evidência de dimensões/zoom/strings longas com
// abertura controlada de URL fictícia pelo shell real. Nada aqui substitui leitor de tela,
// DPI humano, Setup ou instalação.
//
// TFA-008 — lifecycle: close com tray válida oculta e mantém o processo; Sair encerra sem
// residual. O cenário `lifecycle` reporta a variante do ambiente (tray válido/inválido) e o
// probe externo WM_CLOSE confirma que fechar não encerra quando há tray.
//
// Flag `--ci-runner` (runner hospedado, sem navegador garantido e sem a máquina de referência):
// a abertura usa opener falso (`a11y|fake-opener`) e o orçamento D10 de 10.000, ainda pendente
// de revisão formal, é medido e reportado como WARN sem reprovar o runner. Sem a flag — na
// máquina de referência — o shell real é exercitado e o gate D10 reprova o processo normalmente.

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBuildStage, stageArgument } from './build-artifacts.mjs'
import { createSmokeEnvironment, PROD_SENTINEL } from './smoke-environment.mjs'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const selectedBuild = resolveBuildStage(projectRoot, stageArgument(process.argv.slice(2)), {
  version: JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version,
})
const releaseUnpacked = selectedBuild.unpackedRoot
const markerPrefix = 'TASKFLOW_FOUNDATION_TEST '
const productMarkerPrefix = 'TASKFLOW_PRODUCT_TEST '
const benchTimeoutMs = 600_000
const skipBench = process.argv.includes('--skip-bench')
// Diagnóstico focado; não substitui o smoke completo sem flags.
const entriesOnly = process.argv.includes('--entries-only')
const ciRunner = process.argv.includes('--ci-runner')
const launchTimeoutMs = 60_000
const secondInstanceTimeoutMs = 20_000

const results = []
const processes = new Set()

function out(line) {
  process.stdout.write(`${line}\n`)
}

function err(line) {
  process.stderr.write(`${line}\n`)
}

/**
 * Registra um resultado. `options.pending` marca um gate conhecidamente pendente de revisão
 * (orçamento D10 no runner hospedado): entra como WARN, continua visível na evidência e não
 * reprova o processo; sem a flag ele é FAIL normal.
 */
function record(name, ok, detail = '', options = {}) {
  const pending = options.pending === true
  results.push({ name, ok, pending })
  out(`${ok ? 'PASS' : pending ? 'WARN' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function listFiles(root) {
  if (!existsSync(root)) return []
  const files = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      const relative = path.relative(root, full).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        files.push(`${relative}/`)
        walk(full)
      } else {
        files.push(relative)
      }
    }
  }
  walk(root)
  return files.sort()
}

function grantAppContainerAce(directory) {
  // ACE aprovada somente para a cópia de teste do smoke (não propaga para pais).
  const icacls = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe')
  execFileSync(icacls, [directory, '/grant', '*S-1-15-2-1:(OI)(CI)(RX)', '/Q'], { stdio: 'ignore' })
}

function killTree(pid) {
  if (pid === undefined) return
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    // Processo já encerrado.
  }
}

function launch(exe, args, cwd, environment) {
  const child = spawn(exe, args, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdoutText = ''
  child.stderrText = ''
  child.stdout.on('data', (chunk) => {
    child.stdoutText += chunk.toString()
    // Somente progresso finito do benchmark fictício; nunca encaminhar stdout arbitrário.
    for (const match of chunk.toString().matchAll(/TASKFLOW_BENCH_STAGE (\{[^\r\n]+\})/g)) {
      try {
        const stage = JSON.parse(match[1])
        if ([1000, 10000].includes(stage.size) && ['dataset', 'capture', 'dom', 'interactions', 'complete'].includes(stage.stage)) out(`UI-BENCH progresso ${stage.size}: ${stage.stage}`)
      } catch { /* Chunk parcial não é evidência. */ }
    }
  })
  child.stderr.on('data', (chunk) => {
    child.stderrText += chunk.toString()
  })
  processes.add(child)
  child.once('exit', () => processes.delete(child))
  return child
}

function findMarker(text, prefix = markerPrefix, accept = () => true) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) continue
    try {
      const marker = JSON.parse(line.slice(prefix.length))
      if (accept(marker)) return marker
    } catch {
      return null
    }
  }
  return null
}

function waitForMarker(child, timeoutMs, prefix = markerPrefix, accept = () => true) {
  return new Promise((resolve) => {
    const started = Date.now()
    let finished = false
    const finish = (marker, reason) => {
      if (finished) return
      finished = true
      clearInterval(timer)
      resolve({ marker, reason })
    }
    const timer = setInterval(() => {
      const marker = findMarker(child.stdoutText, prefix, accept)
      if (marker !== null) finish(marker, 'marker')
      else if (child.exitCode !== null) finish(null, `exit:${child.exitCode}`)
      else if (Date.now() - started > timeoutMs) finish(null, 'timeout')
    }, 100)
  })
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve({ code: child.exitCode, timedOut: false })
      return
    }
    const timer = setTimeout(() => resolve({ code: null, timedOut: true }), timeoutMs)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, timedOut: false })
    })
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function positiveFlow({ exe, cwd, environment, markerName, extraArgs = [] }) {
  const child = launch(exe, ['--foundation-test', ...extraArgs], cwd, environment)
  const { marker, reason } = await waitForMarker(child, launchTimeoutMs)
  assert(reason === 'marker', `instância ${markerName} não reportou resultado (${reason})`)
  assert(marker.proof?.status === 'verified', `prova não verificada: ${JSON.stringify(marker.proof)}`)
  assert(/^[a-f0-9]{64}$/.test(marker.proof.fingerprint), 'fingerprint inválido')
  assert(typeof marker.proof.appVersion === 'string' && marker.proof.appVersion.length > 0, 'versão ausente')
  for (const probe of marker.probes ?? []) {
    assert(probe.result?.status === 'error' && probe.result.code === 'INVALID_REQUEST', `probe ${probe.name} não recusado`)
  }
  assert((marker.probes ?? []).length === 2, 'probes negativos ausentes')
  assert(child.exitCode === null, 'processo encerrou antes de permanecer ativo')
  return { child, marker }
}

function sha256File(file) {
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

// ---- TFA-003: harness de produto e bridge no pacote, em perfil fictício ----
async function productFlow({ exe, cwd, smokeRoot, evidence }) {
  const layout = createSmokeEnvironment(smokeRoot)
  const fictitiousLocalAppData = layout.localAppData
  mkdirSync(fictitiousLocalAppData, { recursive: true })
  const environment = layout.childEnvironment
  const profileRoot = layout.testProfileRoot
  const productDatabase = layout.productDatabase
  const proofDatabase = layout.testProfileProof
  const barrierFile = path.join(profileRoot, 'harness-barrier.json')
  const prodSentinelHash = sha256File(layout.prodSentinelFile)

  const runScenario = async (scenario, timeoutMs = launchTimeoutMs) => {
    const child = launch(exe, ['--foundation-test', `--product-harness=${scenario}`], cwd, environment)
    const { marker, reason } = await waitForMarker(child, timeoutMs, productMarkerPrefix)
    assert(reason === 'marker', `cenário ${scenario} não reportou resultado (${reason})`)
    return { child, marker }
  }
  const verifyEntries = async () => {
    const entries = await runScenario('entries', 180_000)
    evidence.entries = entries.marker
    const entriesExit = await waitForExit(entries.child, 30000)
    out(`ENTRIES ${JSON.stringify(entries.marker)}`)
    assert(entries.marker.ok === true, `Quick Add/captura reprovou: ${Object.entries(entries.marker.checks ?? {}).filter(([, ok]) => ok !== true).map(([name]) => name).join(', ')}`)
    assert(!entriesExit.timedOut && entriesExit.code === 0, 'Sair das duas superfícies não encerrou com saída0')
    record('produto: Quick Add/captura/roles43/14 e Sair', true)
  }
  if (entriesOnly) { await verifyEntries(); return }
  const reopen = async () => {
    const { child, marker } = await runScenario('reopen')
    const exit = await waitForExit(child, 20_000)
    assert(!exit.timedOut, 'cenário reopen não encerrou')
    assert(marker.ok === true, `reopen falhou: ${JSON.stringify(marker)}`)
    return marker
  }

  // P0 — TFA-005: migração real SQL1→2 no pacote, com kill nas barreiras e leitura da origem.
  evidence.migration = []
  const seedSql1 = async () => {
    rmSync(productDatabase, { force: true })
    rmSync(`${productDatabase}-journal`, { force: true })
    const { child, marker } = await runScenario('seed-sql1')
    const exit = await waitForExit(child, 20_000)
    assert(!exit.timedOut && marker.ok === true, `seed-sql1 falhou: ${JSON.stringify(marker)}`)
    return marker
  }
  const inspectSql1 = async () => {
    const { child, marker } = await runScenario('inspect-sql1')
    const exit = await waitForExit(child, 20_000)
    assert(!exit.timedOut, 'inspect-sql1 não encerrou')
    return marker
  }
  const migrateKill = async (point) => {
    const seeded = await seedSql1()
    rmSync(barrierFile, { force: true })
    const child = launch(exe, ['--foundation-test', `--product-harness=crash|${point}|migrate`], cwd, environment)
    const armed = await waitForMarker(child, launchTimeoutMs, productMarkerPrefix, (marker) => marker.armed === true)
    assert(armed.reason === 'marker', `${point}: harness não armou a barreira (${armed.reason})`)
    const deadline = Date.now() + launchTimeoutMs
    while (!existsSync(barrierFile)) {
      assert(child.exitCode === null, `${point}: processo saiu antes da barreira`)
      assert(Date.now() < deadline, `${point}: barreira não alcançada`)
      await sleep(50)
    }
    const barrier = JSON.parse(readFileSync(barrierFile, 'utf8'))
    assert(barrier.pid === child.pid && barrier.pid === armed.marker.pid, `${point}: PID da barreira não confere`)
    killTree(child.pid)
    await waitForExit(child, 10_000)

    const inspect = await inspectSql1()
    const reopened = await reopen()
    assert(
      reopened.summary.revision === (BigInt(seeded.revision) + 1n).toString(),
      `${point}: revisão após migração divergente (${reopened.summary.revision})`,
    )
    assert(reopened.summary.tasks === 12 && reopened.summary.trash === 1, `${point}: dados não preservados`)
    assert(Number(reopened.runtime.storage.schemaVersion) === 2, `${point}: destino não é SQL2`)
    evidence.migration.push({ point, seeded: seeded.revision, inspect, reopened: reopened.summary })
    return inspect
  }

  const duringInspect = await migrateKill('migrate:in-transaction')
  assert(duringInspect.ok === true && duringInspect.tasks === 12 && duringInspect.trash === 1, 'kill durante a migração não deixou SQL1 inteiro')
  record('produto: kill durante a migração deixa SQL1 inteiro e migra depois', true, `revisão ${duringInspect.revision}`)
  const beforeCommitInspect = await migrateKill('migrate:before-commit')
  assert(beforeCommitInspect.ok === true && beforeCommitInspect.tasks === 12, 'kill antes do commit não deixou SQL1 inteiro')
  record('produto: kill antes do commit da migração deixa SQL1 inteiro', true)
  const afterCommitInspect = await migrateKill('migrate:after-commit')
  assert(afterCommitInspect.ok === false && afterCommitInspect.code === 'INCOMPATIBLE_DATA', 'pós-commit deveria recusar o leitor SQL1')
  record('produto: kill depois do commit deixa SQL2 inteiro e recusa o leitor antigo', true)

  // Migração normal (sem kill): perfil SQL1 novo migra uma única vez ao abrir.
  const seeded = await seedSql1()
  const migrated = await reopen()
  assert(
    migrated.summary.revision === (BigInt(seeded.revision) + 1n).toString(),
    'migração normal não avançou exatamente uma revisão',
  )
  assert(Number(migrated.runtime.storage.schemaVersion) === 2, 'migração normal não fechou em SQL2')
  assert(migrated.summary.tasks === 12 && migrated.summary.trash === 1, 'migração normal não preservou os dados')
  record('produto: migração 1→2 normal preserva dados e avança a global uma vez', true, `revisão ${migrated.summary.revision}`)

  // O fluxo P1 nasce limpo em SQL2: o perfil fictício da migração é descartado.
  rmSync(productDatabase, { force: true })
  rmSync(`${productDatabase}-journal`, { force: true })

  // P1 — bridge real: catálogo, round-trip, duas superfícies, negativas, sessões e isolamento
  const bridge = await runScenario('bridge')
  evidence.bridge = bridge.marker
  const failedChecks = Object.entries(bridge.marker.checks ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  assert(
    bridge.marker.ok === true && failedChecks.length === 0,
    `harness bridge reprovou: ${failedChecks.join(', ') || JSON.stringify(bridge.marker)}`,
  )
  const runtime = bridge.marker.info.runtime
  record(
    'produto: bridge de estado, round-trip e duas superfícies no pacote',
    true,
    `${Object.keys(bridge.marker.checks).length} verificações; Electron ${runtime.electron}, Node ${runtime.node}, SQLite ${runtime.storage.sqliteVersion}`,
  )
  assert(runtime.packaged === true, 'harness não rodou empacotado')
  assert(
    runtime.storage.journalMode === 'delete' &&
      runtime.storage.synchronous === 3 &&
      runtime.storage.foreignKeys === 1 &&
      runtime.storage.busyTimeoutMs === 100 &&
      runtime.storage.schemaVersion === 2,
    `PRAGMAs efetivos divergentes: ${JSON.stringify(runtime.storage)}`,
  )
  record('produto: PRAGMAs efetivos DELETE/EXTRA/foreign_keys/100 ms no pacote', true, JSON.stringify(runtime.storage))
  assert(bridge.marker.info.document.frameOrigin === 'taskflow://app', 'origem real do protocolo divergente')
  record('produto: origem real do documento é taskflow://app', true)
  assert(existsSync(productDatabase), 'banco de produto ausente no perfil fictício')
  assert(existsSync(proofDatabase), 'banco da prova ausente no perfil fictício')
  // O perfil prod fictício contém somente a sentinela criada pelo smoke (nenhum arquivo novo
  // do app) e a sentinela permanece byte a byte — nunca se compara com o perfil pessoal.
  const prodEntries = existsSync(layout.prodProfileRoot) ? readdirSync(layout.prodProfileRoot).sort() : []
  assert(JSON.stringify(prodEntries) === JSON.stringify(['sentinel.json']), 'perfil prod fictício alterado no harness')
  assert(sha256File(layout.prodSentinelFile) === prodSentinelHash, 'sentinela do perfil prod fictício foi alterada')
  record('produto: bancos de produto e prova separados, só no perfil fictício', true)

  // P2 — ownership: segunda instância do mesmo perfil não abre banco nem executa
  const hashBefore = sha256File(productDatabase)
  const second = launch(exe, ['--foundation-test', '--product-harness=bridge'], cwd, environment)
  const secondExit = await waitForExit(second, secondInstanceTimeoutMs)
  assert(!secondExit.timedOut && secondExit.code === 0, `segunda instância não encerrou limpa (${secondExit.code})`)
  assert(findMarker(second.stdoutText, productMarkerPrefix) === null, 'segunda instância executou o harness')
  assert(sha256File(productDatabase) === hashBefore, 'segunda instância alterou o banco de produto')
  assert(bridge.child.exitCode === null, 'primeira instância não permaneceu ativa')
  record('produto: segunda instância não abre banco nem escreve', true)

  // P3 — fechamento normal libera a conexão; reopen conserva o estado integral
  // Saída normal pedida ao harness (app.quit: before-quit, drain e fechamento da conexão).
  // O fechamento pela janela é o cenário S8, que já roda com o banco de produto aberto.
  writeFileSync(path.join(profileRoot, 'harness-quit'), '')
  const bridgeExit = await waitForExit(bridge.child, 20_000)
  rmSync(path.join(profileRoot, 'harness-quit'), { force: true })
  assert(!bridgeExit.timedOut && bridgeExit.code === 0, `saída normal não encerrou o processo do harness (${bridgeExit.code})`)
  assert(!existsSync(`${productDatabase}-journal`), 'journal residual após fechamento normal')
  const reopened = await reopen()
  evidence.reopen = reopened
  assert(
    reopened.summary.revision === bridge.marker.summary.revision && reopened.summary.digest === bridge.marker.summary.digest,
    'reopen não conservou revisão/conteúdo',
  )
  record(
    'produto: fechar e reabrir conserva revisão e conteúdo integral',
    true,
    `revisão ${reopened.summary.revision}, ${reopened.summary.tasks} tarefas, ${reopened.summary.trash} na lixeira`,
  )

  // P4 — kill somente do processo de teste em barreiras; não é prova de falha de energia
  evidence.crash = []
  let current = reopened.summary
  const barriers = [
    ['crash|unit:in-transaction', false],
    ['crash|unit:before-commit', false],
    ['crash|unit:after-commit', true],
    ['crash|unit:before-publish', true],
    ['crash|unit:before-publish|claim', true],
    ['crash|unit:before-commit|move', false],
    ['crash|unit:after-commit|restore', true],
    ['crash|unit:before-commit|revert', false],
  ]
  for (const [scenario, committed] of barriers) {
    rmSync(barrierFile, { force: true })
    const child = launch(exe, ['--foundation-test', `--product-harness=${scenario}`], cwd, environment)
    const armed = await waitForMarker(child, launchTimeoutMs, productMarkerPrefix, (marker) => marker.armed === true)
    assert(armed.reason === 'marker', `${scenario}: harness não armou a barreira (${armed.reason})`)
    const deadline = Date.now() + launchTimeoutMs
    while (!existsSync(barrierFile)) {
      assert(child.exitCode === null, `${scenario}: processo saiu antes da barreira`)
      assert(Date.now() < deadline, `${scenario}: barreira não alcançada`)
      await sleep(50)
    }
    const barrier = JSON.parse(readFileSync(barrierFile, 'utf8'))
    // Só o PID validado do processo criado por este smoke é encerrado.
    assert(barrier.pid === child.pid && barrier.pid === armed.marker.pid, `${scenario}: PID da barreira não confere`)
    killTree(child.pid)
    await waitForExit(child, 10_000)
    const journalAfterKill = existsSync(`${productDatabase}-journal`)

    const after = await reopen()
    const expected = (BigInt(armed.marker.baseRevision) + (committed ? 1n : 0n)).toString()
    assert(after.summary.revision === expected, `${scenario}: revisão ${after.summary.revision}, esperada ${expected}`)
    if (!committed) {
      const prepared = armed.marker.preparedSummary
      const expectedDigest = prepared?.digest ?? current.digest
      assert(after.summary.digest === expectedDigest, `${scenario}: estado anterior não está inteiro`)
      if (prepared !== undefined) {
        assert(
          after.summary.tasks === prepared.tasks && after.summary.trash === prepared.trash,
          `${scenario}: coleções divergentes do estado preparado`,
        )
      }
    }
    // O app não apaga nem interpreta journal: um journal quente é revertido pelo motor na
    // abertura; um journal sem páginas gravadas não é quente e o motor o reaproveita na
    // próxima transação de escrita. A ausência é conferida após o próximo commit (drain).
    evidence.crash.push({
      scenario,
      journalAfterKill,
      journalAfterReopen: existsSync(`${productDatabase}-journal`),
      barrier: barrier.point,
      committed,
      revisionAfter: after.summary.revision,
      tasksAfter: after.summary.tasks,
    })
    record(`produto: kill em ${scenario.replace('crash|', '')}`, true, committed ? 'novo estado inteiro' : 'estado anterior inteiro')
    current = after.summary
  }

  // P5 — encerramento com unidades admitidas: drena internas, cancela sessão, fecha conexão
  const drain = await runScenario('drain')
  evidence.drain = drain.marker
  const drainExit = await waitForExit(drain.child, 20_000)
  assert(drain.marker.ok === true, `drain reprovou: ${JSON.stringify(drain.marker)}`)
  assert(!drainExit.timedOut, 'cenário drain não encerrou')
  const afterDrain = await reopen()
  assert(afterDrain.summary.revision === drain.marker.expectedRevision, 'unidades drenadas não foram confirmadas')
  assert(!existsSync(`${productDatabase}-journal`), 'journal residual após commits e fechamento normal')
  record(
    'produto: saída drena unidades internas e cancela leituras de sessão',
    true,
    `drain ${drain.marker.report.drainMs} ms, ${drain.marker.committedInternal} confirmadas, ${drain.marker.cancelledReads} canceladas`,
  )

  // P6 — limites síncronos medidos no runtime empacotado
  if (skipBench) {
    record('produto: benchmark de limites', true, 'pulado por --skip-bench')
  } else {
    const bench = await runScenario('bench', benchTimeoutMs)
    evidence.bench = bench.marker
    await waitForExit(bench.child, 30_000)
    const large = bench.marker.datasets?.[1] ?? {}
    const failedGates = Object.entries(bench.marker.gates ?? {})
      .filter(([, ok]) => ok !== true)
      .map(([name]) => name)
    out(`BENCH ${JSON.stringify(bench.marker)}`)
    assert(bench.marker.ok === true, `gate de limites reprovou: ${failedGates.join(', ') || 'sem resultado'}`)
    record(
      'produto: gate de limites (10.000 tarefas, >= 20 MiB)',
      true,
      `mutação p95 ${large.mutation.p95Ms} ms, página p95 ${large.page.p95Ms} ms, preflight ${large.preflight.ms} ms, saveMany ${large.saveManyMs} ms`,
    )
    const series = large.series ?? {}
    out(`SERIES ${JSON.stringify(series)}`)
    record(
      'produto: fechamento, edição de portadora e limite de 32.768 passos medidos',
      true,
      `closure ${series.closureMs} ms, due ${series.dueUpdateMs} ms, título ${series.titleUpdateMs} ms, limite ${series.limitMs} ms (${series.limitStatus})`,
    )
    assert((await reopen()).ok === true, 'banco do benchmark não reabriu')
    record('produto: banco do benchmark reabre validado', true)
  }

  // P7 — UI real, negativas, foco, reload sem duplicação e Sair sem residual
  await verifyEntries()

  // P7a — TFA-010: IA com transporte/proteção fictícios no pacote (sem chamada paga nem DPAPI).
  const verifyAi = async () => {
    const ai = await runScenario('ai', 120_000)
    evidence.ai = ai.marker
    const aiExit = await waitForExit(ai.child, 30_000)
    const failedAi = Object.entries(ai.marker.checks ?? {})
      .filter(([, ok]) => ok !== true)
      .map(([name]) => name)
    out(`AI ${JSON.stringify(ai.marker)}`)
    assert(ai.marker.ok === true, `IA reprovou: ${failedAi.join(', ') || JSON.stringify(ai.marker)}`)
    assert(!aiExit.timedOut && aiExit.code === 0, `Sair do cenário ai não encerrou com saída 0 (${aiExit.code})`)
    record(
      'produto: IA com transporte fake — credencial cifrada, consentimentos, prévia e sugestão',
      true,
      `${Object.keys(ai.marker.checks).length} verificações`,
    )
  }
  await verifyAi()

  const tasks = await runScenario('tasks', 180_000)
  evidence.tasks = tasks.marker
  const tasksExit = await waitForExit(tasks.child, 30_000)
  const failedTasks = Object.entries(tasks.marker.checks ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  assert(tasks.marker.ok === true, `UI real de tarefas reprovou: ${failedTasks.join(', ') || 'sem resultado'}`)
  assert(!tasksExit.timedOut && tasksExit.code === 0, `Sair do cenário tasks não encerrou com saída 0 (${tasksExit.code})`)
  record('produto: UI real, negativas, foco, reload e Sair sem residual', true)

  // P7b — TFA-005: recorrência e subtarefas no pacote (UI+preload+main+SQLite, duas superfícies).
  const recurrence = await runScenario('recurrence', 180_000)
  evidence.recurrence = recurrence.marker
  const recurrenceExit = await waitForExit(recurrence.child, 30_000)
  const failedRecurrence = Object.entries(recurrence.marker.checks ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  out(`RECURRENCE ${JSON.stringify(recurrence.marker)}`)
  assert(
    recurrence.marker.ok === true,
    `recorrência/subtarefas reprovou: ${failedRecurrence.join(', ') || 'sem resultado'}`,
  )
  assert(
    !recurrenceExit.timedOut && recurrenceExit.code === 0,
    `cenário recurrence não encerrou com saída 0 (${recurrenceExit.code})`,
  )
  record(
    'produto: recorrência/subtarefas por UI/preload/main/SQLite com duas superfícies',
    true,
    `${Object.keys(recurrence.marker.checks).length} verificações`,
  )

  // P7c — TFA-006: lixeira e desfazer no pacote (bridge catálogo17, tokens/contexto, duas
  // superfícies, UI de excluir/restaurar/esvaziar com foco).
  const trash = await runScenario('trash', 180_000)
  evidence.trash = trash.marker
  const trashExit = await waitForExit(trash.child, 30_000)
  const failedTrash = Object.entries(trash.marker.checks ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  out(`TRASH ${JSON.stringify(trash.marker)}`)
  assert(trash.marker.ok === true, `lixeira/desfazer reprovou: ${failedTrash.join(', ') || 'sem resultado'}`)
  assert(
    !trashExit.timedOut && trashExit.code === 0,
    `cenário trash não encerrou com saída 0 (${trashExit.code})`,
  )
  record(
    'produto: lixeira/desfazer com tokens/contexto, duas superfícies e foco',
    true,
    `${Object.keys(trash.marker.checks).length} verificações`,
  )

  // P7d — TFA-007: backup no pacote (export/prepare/confirm com serviços reais, diálogos stub,
  // lixeira/undo por época e duas superfícies inscritas na bridge v3).
  const backup = await runScenario('backup', 180_000)
  evidence.backup = backup.marker
  const backupExit = await waitForExit(backup.child, 30_000)
  const failedBackup = Object.entries(backup.marker.checks ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  out(`BACKUP ${JSON.stringify(backup.marker)}`)
  assert(backup.marker.ok === true, `backup reprovou: ${failedBackup.join(', ') || 'sem resultado'}`)
  assert(
    !backupExit.timedOut && backupExit.code === 0,
    `cenário backup não encerrou com saída 0 (${backupExit.code})`,
  )
  record(
    'produto: backup export/prepare/confirm com serviços reais e diálogos stub',
    true,
    `${Object.keys(backup.marker.checks).length} verificações`,
  )

  // P7e — TFA-008: recuperação/claim de lembretes no startup real e corrida com mutação.
  // O seed roda com o scheduler suspenso; o cenário `reminders` sobe um processo novo com a
  // agenda ativa (notifier fake) e valida graça/expiração/terminal/futuro, at-most-once e CAS.
  const remindersSeed = await runScenario('reminders-seed', 60_000)
  const remindersSeedExit = await waitForExit(remindersSeed.child, 20_000)
  assert(
    remindersSeed.marker.ok === true && !remindersSeedExit.timedOut && remindersSeedExit.code === 0,
    `reminders-seed falhou: ${JSON.stringify(remindersSeed.marker)} exit:${remindersSeedExit.code}`,
  )
  const reminders = await runScenario('reminders', 180_000)
  evidence.reminders = reminders.marker
  const remindersExit = await waitForExit(reminders.child, 30_000)
  const failedReminders = Object.entries(reminders.marker.checks ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  out(`REMINDERS ${JSON.stringify(reminders.marker)}`)
  assert(reminders.marker.ok === true, `lembretes reprovaram: ${failedReminders.join(', ') || 'sem resultado'}`)
  assert(
    !remindersExit.timedOut && remindersExit.code === 0,
    `cenário reminders não encerrou com saída 0 (${remindersExit.code})`,
  )
  record(
    'produto: recuperação/claim de lembretes e corrida com mutação',
    true,
    `${Object.keys(reminders.marker.checks).length} verificações`,
  )

  // P7f — TFA-012: percurso integrado `parity` (H02–H06/H09) e oráculo de reabertura no
  // mesmo banco: o cenário encerra por Sair e o processo `reopen` compara revisão + digest.
  const parity = await runScenario('parity', 240_000)
  evidence.parity = parity.marker
  const parityExit = await waitForExit(parity.child, 30_000)
  const failedParity = Object.entries(parity.marker.checks ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  out(`PARITY ${JSON.stringify(parity.marker.checks ?? {})}`)
  assert(parity.marker.ok === true, `percurso parity reprovou: ${failedParity.join(', ') || 'sem resultado'}`)
  assert(!parityExit.timedOut && parityExit.code === 0, `cenário parity não encerrou com saída 0 (${parityExit.code})`)
  record(
    'produto: percurso integrado parity (H02–H06/H09) com UI/bridge e duas superfícies',
    true,
    `${Object.keys(parity.marker.checks ?? {}).length} verificações`,
  )
  const paritySummary = parity.marker.summary
  const parityReopen = await reopen()
  assert(
    paritySummary !== undefined &&
      parityReopen.summary.revision === paritySummary.revision &&
      parityReopen.summary.contentDigest === paritySummary.contentDigest,
    `reopen divergiu do estado final do parity (${parityReopen.summary.revision} != ${paritySummary?.revision})`,
  )
  record(
    'produto: reopen confere conteúdo/revisão do parity entre processos',
    true,
    `revisão ${paritySummary.revision}, ${paritySummary.tasks} tarefas, ${paritySummary.trash} na lixeira`,
  )

  // P8 — acessibilidade/zoom/strings longas e abertura controlada (shell real na referência;
  // opener falso no runner hospedado, onde não há navegador padrão garantido).
  const a11y = await runScenario(ciRunner ? 'a11y|fake-opener' : 'a11y')
  evidence.a11y = a11y.marker
  const a11yExit = await waitForExit(a11y.child, 20_000)
  const failedA11y = Object.entries(a11y.marker.checks ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  assert(a11y.marker.ok === true, `acessibilidade/opener reprovou: ${failedA11y.join(', ') || 'sem resultado'}`)
  assert(!a11yExit.timedOut, 'cenário a11y não encerrou')
  record(
    'produto: dimensões/zoom/foco/strings longas e abertura controlada',
    true,
    `abertura ${a11y.marker.info?.openerMode ?? 'real'} ${a11y.marker.info?.openerResult?.status ?? '?'}`,
  )

  // P9 — UI real de tarefas com 1.000/10.000 tarefas fictícias contra os alvos D10.
  // O gate NÃO é removido: uma falha é registrada e mantém o smoke reprovado no final.
  if (skipBench) {
    record('produto: UI real 1.000/10.000 contra D10', true, 'pulado por --skip-bench')
    return
  }
  const uiBench = await runScenario('ui-bench', benchTimeoutMs)
  evidence.uiBench = uiBench.marker
  await waitForExit(uiBench.child, 30_000)
  const failedUiGates = Object.entries(uiBench.marker.gates ?? {})
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name)
  out(`UI-BENCH ${JSON.stringify(uiBench.marker)}`)
  const smallData = uiBench.marker.datasets?.[0] ?? {}
  const largeData = uiBench.marker.datasets?.[1] ?? {}
  record(
    'produto: UI real 1.000/10.000 contra D10',
    uiBench.marker.ok === true,
    `montagem ${smallData.mountMs}/${largeData.mountMs} ms, p95 consultas ${smallData.interactions?.p95Ms}/${largeData.interactions?.p95Ms} ms, subtarefas p95 ${smallData.subtaskControls?.p95Ms}/${largeData.subtaskControls?.p95Ms} ms, heartbeat ${smallData.heartbeatMaxMs}/${largeData.heartbeatMaxMs} ms, cards ${smallData.cards}/${largeData.cards}` +
      (failedUiGates.length > 0 ? `; gates reprovados: ${failedUiGates.join(', ')}` : '') +
      (ciRunner && failedUiGates.length > 0 ? ' [orçamento D10 pendente de revisão: reportado, não bloqueia o runner]' : ''),
    { pending: ciRunner && uiBench.marker.ok !== true },
  )
}

async function main() {
  const failures = []
  const evidence = { generatedAt: new Date().toISOString(), note: 'dados e perfis exclusivamente fictícios' }
  const smokeRoot = path.join(os.tmpdir(), `taskflow-smoke-${process.pid}-${Date.now()}`)
  const layout = createSmokeEnvironment(smokeRoot)
  const appCopy = path.join(smokeRoot, 'app')
  const cwd = path.join(smokeRoot, 'cwd')
  const testEnvironment = layout.childEnvironment

  if (!existsSync(path.join(releaseUnpacked, 'TaskFlowApp.exe'))) {
    err('smoke:packaged exige um staging selado; execute npm run package:win antes.')
    process.exitCode = 1
    return
  }

  try {
    mkdirSync(cwd, { recursive: true })
    mkdirSync(layout.prodProfileRoot, { recursive: true })
    writeFileSync(layout.prodSentinelFile, `${JSON.stringify(PROD_SENTINEL)}\n`)
    cpSync(releaseUnpacked, appCopy, { recursive: true })
    grantAppContainerAce(appCopy)
    const exe = path.join(appCopy, 'TaskFlowApp.exe')
    record('layout do smoke isolado sob root próprio (S1–S9)', true, 'LOCALAPPDATA fictício; sentinela prod própria; nenhum path pessoal')
    const prodBefore = listFiles(layout.prodProfileRoot)
    const prodSentinelBefore = sha256File(layout.prodSentinelFile)

    // S1 — prova, probes negativos e persistência no perfil test
    let fingerprint = null
    try {
      const { child, marker } = await positiveFlow({ exe, cwd, environment: testEnvironment, markerName: 'A' })
      fingerprint = marker.proof.fingerprint
      record('prova SQLite e recusas de payload no renderer', true, `fingerprint ${fingerprint.slice(0, 12)}…`)
      assert(existsSync(layout.testProfileProof), 'banco da prova ausente no perfil test')
      record('banco da prova no perfil test fictício', true)

      // S2 — segunda instância: encerra sem resultado e sem escrita
      const mtimeBefore = statSync(layout.testProfileProof).mtimeMs
      const second = launch(exe, ['--foundation-test'], cwd, testEnvironment)
      const secondExit = await waitForExit(second, secondInstanceTimeoutMs)
      const wroteMarker = findMarker(second.stdoutText) !== null
      assert(!secondExit.timedOut, 'segunda instância não encerrou')
      assert(secondExit.code === 0, `segunda instância saiu com código ${secondExit.code}`)
      assert(!wroteMarker, 'segunda instância executou a prova')
      assert(statSync(layout.testProfileProof).mtimeMs === mtimeBefore, 'segunda instância escreveu no banco')
      record('segunda instância sem prova/escrita', true)

      // S3 — perfil prod fictício intocado (sentinela própria; nunca o perfil real)
      assert(JSON.stringify(listFiles(layout.prodProfileRoot)) === JSON.stringify(prodBefore), 'sentinela do perfil prod fictício mudou durante o smoke')
      assert(sha256File(layout.prodSentinelFile) === prodSentinelBefore, 'sentinela do perfil prod fictício foi alterada')
      record('perfil prod fictício intocado (sentinela própria)', true)

      // S4 — reinício com fingerprint persistente
      killTree(child.pid)
      await waitForExit(child, 10_000)
      const reopened = await positiveFlow({ exe, cwd, environment: testEnvironment, markerName: 'C' })
      assert(reopened.marker.proof.fingerprint === fingerprint, 'fingerprint mudou após reinício')
      record('reabertura conserva o fingerprint', true)
      killTree(reopened.child.pid)
      await waitForExit(reopened.child, 10_000)

      // S7 — tentativa de override de perfil/caminho via --user-data-dir
      const overrideDir = path.join(smokeRoot, 'override')
      const overridden = await positiveFlow({
        exe,
        cwd,
        environment: testEnvironment,
        markerName: 'D',
        extraArgs: ['--user-data-dir=' + overrideDir],
      })
      assert(!existsSync(path.join(overrideDir, 'foundation-proof', 'proof.sqlite')), 'override de userData aceito')
      assert(!existsSync(path.join(overrideDir, 'profiles')), 'override de userData criou perfis em outro root')
      record('override de perfil/caminho recusado', true)
      killTree(overridden.child.pid)
      await waitForExit(overridden.child, 10_000)

      // S8 — lifecycle empacotado (TFA-008): com tray válido, close real oculta sem encerrar e
      // Sair encerra sem residual; sem tray, close leva à saída segura. O cenário reporta a
      // variante do ambiente; o WM_CLOSE externo reforça o caminho com tray.
      const lifecycleChild = launch(exe, ['--foundation-test', '--product-harness=lifecycle'], cwd, testEnvironment)
      const lifecycleResult = await waitForMarker(lifecycleChild, launchTimeoutMs, productMarkerPrefix)
      assert(lifecycleResult.reason === 'marker', `lifecycle não reportou resultado (${lifecycleResult.reason})`)
      const lifecycleMarker = lifecycleResult.marker
      assert(lifecycleMarker.ok === true, `lifecycle falhou: ${JSON.stringify(lifecycleMarker)}`)
      const lifecycleExit = await waitForExit(lifecycleChild, 20_000)
      assert(!lifecycleExit.timedOut, 'Sair do lifecycle não encerrou o processo')
      const lifecycleResidual = execFileSync('tasklist', ['/FI', `PID eq ${lifecycleChild.pid}`, '/NH'], { encoding: 'utf8' })
      assert(!lifecycleResidual.includes(String(lifecycleChild.pid)), 'processo residual após Sair')
      record('lifecycle close/quit no pacote', true, `tray:${String(lifecycleMarker.trayValid)} ${JSON.stringify(lifecycleMarker.checks ?? {})}`)

      if (lifecycleMarker.trayValid === true) {
        // WM_CLOSE externo com tray válido: oculta e mantém o processo vivo; limpeza restrita à
        // cópia de teste em seguida (o encerramento por Sair já foi comprovado acima).
        const closing = await positiveFlow({ exe, cwd, environment: testEnvironment, markerName: 'E' })
        const closingPid = closing.child.pid
        try {
          execFileSync('taskkill', ['/PID', String(closingPid)], { stdio: 'ignore' })
        } catch {
          // Alguns ambientes não entregam WM_CLOSE; a verificação abaixo reprova.
        }
        await sleep(3000)
        const stillRunning = execFileSync('tasklist', ['/FI', `PID eq ${closingPid}`, '/NH'], { encoding: 'utf8' })
        assert(stillRunning.includes(String(closingPid)), 'close com tray válido encerrou o processo')
        record('close com tray oculta sem encerrar', true)
        killTree(closingPid)
        await waitForExit(closing.child, 10_000)
      } else {
        record('close com tray oculta sem encerrar', true, 'ambiente sem tray: saída segura coberta pelo cenário')
      }

      // TFA-003 — produto e bridge de estado, antes dos cenários que adulteram o pacote
      await productFlow({ exe, cwd, smokeRoot, evidence })

      // Sentinela do perfil prod fictício intacta após TODOS os cenários (inclusive parity);
      // nunca se compara com o perfil pessoal.
      const finalProdEntries = existsSync(layout.prodProfileRoot) ? readdirSync(layout.prodProfileRoot).sort() : []
      assert(JSON.stringify(finalProdEntries) === JSON.stringify(['sentinel.json']), 'perfil prod fictício alterado após os cenários')
      assert(sha256File(layout.prodSentinelFile) === prodSentinelBefore, 'sentinela do perfil prod fictício alterada após os cenários')
      record('produto: sentinela do perfil prod fictício intacta após todos os cenários', true)

      // S5 — preload ausente detectado como falha
      const asarFile = path.join(appCopy, 'resources', 'app.asar')
      const extracted = path.join(smokeRoot, 'asar-extract')
      asar.extractAll(asarFile, extracted)
      rmSync(path.join(extracted, 'out', 'preload', 'index.cjs'))
      await asar.createPackage(extracted, asarFile)
      const brokenPreload = launch(exe, ['--foundation-test'], cwd, testEnvironment)
      const preloadResult = await waitForMarker(brokenPreload, 30_000)
      assert(preloadResult.reason === 'marker', `preload ausente não reportou falha (${preloadResult.reason})`)
      assert(preloadResult.marker.status === 'error', 'preload ausente não recusou a ponte')
      record('preload ausente reprovado sem sucesso', true, preloadResult.marker.code ?? '')
      killTree(brokenPreload.pid)
      await waitForExit(brokenPreload, 10_000)

      // S6 — asar corrompido: crash/timeout detectados, sem sucesso
      writeFileSync(asarFile, Buffer.alloc(64 * 1024))
      const corrupted = launch(exe, ['--foundation-test'], cwd, testEnvironment)
      const corruptedResult = await waitForMarker(corrupted, 30_000)
      assert(corruptedResult.marker === null || corruptedResult.marker.status === 'error', 'asar corrompido executou a prova')
      killTree(corrupted.pid)
      await waitForExit(corrupted, 10_000)
      record('asar corrompido reprovado sem sucesso', true, corruptedResult.reason)

      // S9 — hang: main alterado sem carregar a janela deve estourar o timeout do harness
      const hangExtract = path.join(smokeRoot, 'asar-hang')
      asar.extractAll(path.join(releaseUnpacked, 'resources', 'app.asar'), hangExtract)
      writeFileSync(
        path.join(hangExtract, 'out', 'main', 'index.js'),
        "const { app } = require('electron');\napp.whenReady().then(() => {});\n",
      )
      await asar.createPackage(hangExtract, asarFile)
      const hanging = launch(exe, ['--foundation-test'], cwd, testEnvironment)
      const hangResult = await waitForMarker(hanging, 15_000)
      assert(hangResult.reason === 'timeout', `hang não foi detectado pelo timeout (${hangResult.reason})`)
      killTree(hanging.pid)
      await waitForExit(hanging, 10_000)
      record('hang reprovado por timeout', true)
    } catch (error) {
      failures.push(error)
      record('fluxo integrado do smoke', false, error instanceof Error ? error.message : String(error))
    }
  } finally {
    for (const child of processes) killTree(child.pid)
    try {
      rmSync(smokeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    } catch (error) {
      err(`aviso: falha ao remover diretório de teste: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    writeFileSync(path.join(selectedBuild.stage, 'product-harness-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  } catch (error) {
    err(`aviso: evidência do harness não foi gravada: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (failures.length > 0 || results.some((result) => !result.ok && result.pending !== true)) {
    out('smoke:packaged FALHOU')
    process.exitCode = 1
  } else {
    out(ciRunner && results.some((result) => !result.ok && result.pending === true) ? 'smoke:packaged OK (com gate pendente reportado)' : 'smoke:packaged OK')
  }
}

await main()
