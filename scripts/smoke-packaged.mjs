// smoke:packaged — integração real do pacote (TFA-002).
//
// Copia release/win-unpacked para um diretório temporário de teste e concede a ACE
// aprovada em 2026-10-04 (S-1-15-2-1, leitura/execução herdável) SOMENTE a essa cópia,
// nunca a pais, dados/perfis, roots globais ou outros diretórios. Executa o exe com o
// perfil test fixado (--foundation-test), cwd fora do repo e timeout de 60 s por execução.
//
// Confirma: prova SQLite real pelo renderer/preload/IPC (com probes negativos de payload),
// reabertura com fingerprint persistente, segunda instância sem saída/escrita e negativas
// integradas (preload ausente, asar corrompido, tentativa de override de perfil/caminho).
// Limpeza restrita aos processos/pastas de teste criados; nenhum modo inseguro é usado.

import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseUnpacked = path.join(projectRoot, 'release', 'win-unpacked')
const localAppData = process.env.LOCALAPPDATA ?? ''
const testProfileProof = path.join(localAppData, 'TaskFlowApp', 'profiles', 'test', 'user-data', 'foundation-proof', 'proof.sqlite')
const prodProfileRoot = path.join(localAppData, 'TaskFlowApp', 'profiles', 'prod')
const markerPrefix = 'TASKFLOW_FOUNDATION_TEST '
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

function record(name, ok, detail = '') {
  results.push({ name, ok })
  out(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
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
  })
  child.stderr.on('data', (chunk) => {
    child.stderrText += chunk.toString()
  })
  processes.add(child)
  child.once('exit', () => processes.delete(child))
  return child
}

function findMarker(text) {
  const line = text.split(/\r?\n/).find((candidate) => candidate.startsWith(markerPrefix))
  if (!line) return null
  try {
    return JSON.parse(line.slice(markerPrefix.length))
  } catch {
    return null
  }
}

function waitForMarker(child, timeoutMs) {
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
      const marker = findMarker(child.stdoutText)
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

async function main() {
  const failures = []
  const smokeRoot = path.join(os.tmpdir(), `taskflow-smoke-${process.pid}-${Date.now()}`)
  const appCopy = path.join(smokeRoot, 'app')
  const cwd = path.join(smokeRoot, 'cwd')
  const testEnvironment = { TASKFLOW_PROFILE: 'dev', ELECTRON_RENDERER_URL: 'http://127.0.0.1:9/' }

  if (!existsSync(path.join(releaseUnpacked, 'TaskFlowApp.exe'))) {
    err('smoke:packaged exige release/win-unpacked; execute npm run package:win antes.')
    process.exitCode = 1
    return
  }

  try {
    mkdirSync(cwd, { recursive: true })
    cpSync(releaseUnpacked, appCopy, { recursive: true })
    grantAppContainerAce(appCopy)
    const exe = path.join(appCopy, 'TaskFlowApp.exe')
    const prodBefore = listFiles(prodProfileRoot)

    // S1 — prova, probes negativos e persistência no perfil test
    let fingerprint = null
    try {
      const { child, marker } = await positiveFlow({ exe, cwd, environment: testEnvironment, markerName: 'A' })
      fingerprint = marker.proof.fingerprint
      record('prova SQLite e recusas de payload no renderer', true, `fingerprint ${fingerprint.slice(0, 12)}…`)
      assert(existsSync(testProfileProof), 'banco da prova ausente no perfil test')
      record('banco da prova no perfil test', true)

      // S2 — segunda instância: encerra sem resultado e sem escrita
      const mtimeBefore = statSync(testProfileProof).mtimeMs
      const second = launch(exe, ['--foundation-test'], cwd, testEnvironment)
      const secondExit = await waitForExit(second, secondInstanceTimeoutMs)
      const wroteMarker = findMarker(second.stdoutText) !== null
      assert(!secondExit.timedOut, 'segunda instância não encerrou')
      assert(secondExit.code === 0, `segunda instância saiu com código ${secondExit.code}`)
      assert(!wroteMarker, 'segunda instância executou a prova')
      assert(statSync(testProfileProof).mtimeMs === mtimeBefore, 'segunda instância escreveu no banco')
      record('segunda instância sem prova/escrita', true)

      // S3 — perfil prod intocado
      assert(JSON.stringify(listFiles(prodProfileRoot)) === JSON.stringify(prodBefore), 'perfil prod mudou durante o smoke')
      record('perfil prod intocado', true)

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

      // S8 — fechamento da janela provisória encerra sem processo residual
      const closing = await positiveFlow({ exe, cwd, environment: testEnvironment, markerName: 'E' })
      const closingPid = closing.child.pid
      try {
        execFileSync('taskkill', ['/PID', String(closingPid)], { stdio: 'ignore' })
      } catch {
        // Alguns ambientes não entregam WM_CLOSE; o timeout abaixo reprova.
      }
      const closingExit = await waitForExit(closing.child, 20_000)
      assert(!closingExit.timedOut, 'janela fechada não encerrou o processo')
      const stillRunning = execFileSync('tasklist', ['/FI', `PID eq ${closingPid}`, '/NH'], { encoding: 'utf8' })
      assert(!stillRunning.includes(String(closingPid)), 'processo residual após fechamento')
      record('fechamento da janela sem processo residual', true, `exit:${closingExit.code}`)

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

  if (failures.length > 0 || results.some((result) => !result.ok)) {
    out('smoke:packaged FALHOU')
    process.exitCode = 1
  } else {
    out('smoke:packaged OK')
  }
}

await main()
