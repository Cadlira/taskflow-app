// Opt-in explícito: node scripts/native-shortcuts-packaged.mjs --opt-in.
// Usa cópias temporárias, perfil test e F20–F23. Não executa Setup nem altera perfil prod.
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32' || !process.argv.includes('--opt-in')) throw new Error('Windows e --opt-in são obrigatórios')
const temporary = mkdtempSync(path.join(os.tmpdir(), 'tfa009-native-'))
const children = new Set()
const evidence = { campaign: 'Q13', profile: 'isolated-test', setupExecuted: false, stage: 'prepare', checks: {}, runs: [], limitation: null, cleanup: false }
let helper
function start(exe, args, env = {}) {
  const child = spawn(exe, args, { cwd: temporary, env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  child.lines = []; child.pending = ''; child.stderrSafe = false
  child.stdout.on('data', chunk => {
    child.pending += chunk.toString()
    let split
    while ((split = child.pending.indexOf('\n')) >= 0) {
      const line = child.pending.slice(0, split).trim()
      if (line.startsWith('TASKFLOW_NATIVE_DIAGNOSTIC ')) evidence.stage = JSON.parse(line.slice('TASKFLOW_NATIVE_DIAGNOSTIC '.length)).stage
      child.lines.push(line); child.pending = child.pending.slice(split + 1)
    }
  })
  child.stderr.on('data', () => { child.stderrSafe = true }) // Nenhum conteúdo externo/clipboard no log.
  children.add(child); child.once('exit', () => children.delete(child)); return child
}
async function marker(child, prefix, kind, timeout = 45000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const index = child.lines.findIndex(line => line.startsWith(prefix) && (!kind || JSON.parse(line.slice(prefix.length)).kind === kind))
    if (index >= 0) return JSON.parse(child.lines.splice(index, 1)[0].slice(prefix.length))
    const earlyFailure = child.lines.find(line => line.startsWith('TASKFLOW_PRODUCT_TEST '))
    if (prefix === 'TASKFLOW_NATIVE_PHASE ' && earlyFailure) {
      const result = JSON.parse(earlyFailure.slice('TASKFLOW_PRODUCT_TEST '.length))
      evidence.runs.push(result); throw new Error('NATIVE_HARNESS_FAILED_BEFORE_PHASE')
    }
    if (child.exitCode !== null) throw new Error('TEST_PROCESS_EXITED')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('NATIVE_TIMEOUT')
}
let commandSequence = 0
function command(child, text) {
  if (child === helper) writeFileSync(child.commandFile, JSON.stringify({ sequence: ++commandSequence, command: text }))
  else writeFileSync(child.commandFile, text)
}
async function helperCommand(text, expected) { command(helper, text); return marker(helper, 'TASKFLOW_NATIVE_HELPER ', expected) }
function input(target, key = 0) {
  execFileSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts', 'fixtures', 'native-shortcut-input.ps1'),
    '-TargetHandle', target.hwnd, '-TargetProcess', String(target.pid), '-FunctionKey', String(key)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 })
}
async function exited(child) {
  const until = Date.now() + 15000
  while (child.exitCode === null && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50))
  return child.exitCode === 0
}
async function campaign(exe, environment, helperReady, reopen) {
  evidence.stage = reopen ? 'restart:startup' : 'initial:startup'
  const child = start(exe, ['--foundation-test', `--product-harness=${reopen ? 'entries-native-reopen' : 'entries-native'}`], environment)
  child.commandFile = path.join(environment.LOCALAPPDATA, 'TaskFlowApp', 'profiles', 'test', 'user-data', 'native-harness-step.txt')
  const count = reopen ? 1 : 10
  for (let index = 0; index < count; index++) {
    const phase = await marker(child, 'TASKFLOW_NATIVE_PHASE ')
    evidence.stage = phase.phase
    if (phase.phase === 'release-conflict') await helperCommand('release', 'released')
    else {
      if (phase.phase === 'f22-clipboard') {
        command(helper, 'clipboard')
        const clipboard = await marker(helper, 'TASKFLOW_NATIVE_HELPER ')
        if (clipboard.kind !== 'clipboard-ready') throw new Error('NATIVE_CLIPBOARD_UNAVAILABLE')
      }
      const focus = phase.phase === 'lease-f23' ? phase : helperReady
      if (focus === helperReady) await helperCommand('show', 'shown')
      const key = phase.phase === 'blur-other-app' ? 0 : phase.phase.startsWith('f21') ? 21 : phase.phase.startsWith('f22') ? 22 :
        phase.phase === 'f20-from-other-app' || phase.phase === 'old-f20' ? 20 : 23
      input(focus, key)
      evidence.checks[`${phase.phase}:ownedForeground`] = true
    }
    command(child, `next:${phase.phase}`)
  }
  const result = await marker(child, 'TASKFLOW_PRODUCT_TEST ')
  evidence.runs.push(result)
  evidence.checks[`${result.scenario}:passed`] = result.ok
  evidence.checks[`${result.scenario}:cleanExit`] = await exited(child)
  const released = await helperCommand('probe', 'probe')
  evidence.checks[`${result.scenario}:registrationsReleased`] = released.released
}
try {
  evidence.packageAsarSha256 = createHash('sha256').update(readFileSync(path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar'))).digest('hex')
  for (const [source, destination] of [[path.join(root, 'release', 'win-unpacked'), 'product'], [path.join(root, 'node_modules', 'electron', 'dist'), 'helper-runtime']]) {
    if (!existsSync(source)) throw new Error('LOCAL_PACKAGE_OR_ELECTRON_MISSING')
    cpSync(source, path.join(temporary, destination), { recursive: true })
    execFileSync('icacls.exe', [path.join(temporary, destination), '/grant', '*S-1-15-2-1:(OI)(CI)(RX)', '/Q'], { windowsHide: true, stdio: 'ignore' })
  }
  const helperSource = path.join(temporary, 'helper.cjs')
  writeFileSync(helperSource, readFileSync(path.join(root, 'scripts', 'fixtures', 'native-shortcut-helper.cjs')))
  execFileSync('icacls.exe', [helperSource, '/grant', '*S-1-15-2-1:(RX)', '/Q'], { windowsHide: true, stdio: 'ignore' })
  const fakeLocal = path.join(temporary, 'local'), userData = path.join(fakeLocal, 'TaskFlowApp', 'profiles', 'test', 'user-data')
  mkdirSync(userData, { recursive: true })
  writeFileSync(path.join(userData, 'shortcuts.json'), JSON.stringify({ version: 1, revision: '0', actions: {
    QUICK_ADD: { modifiers: 'CTRL_SHIFT', key: 'F20' }, OPEN_TASK_MANAGER: { modifiers: 'CTRL_SHIFT', key: 'F21' }, CAPTURE_CLIPBOARD: null } }))
  helper = start(path.join(temporary, 'helper-runtime', 'electron.exe'), [helperSource], { TFA_NATIVE_ROOT: temporary })
  helper.commandFile = path.join(temporary, 'helper-command.json')
  const ready = await marker(helper, 'TASKFLOW_NATIVE_HELPER ', 'ready')
  evidence.checks.realHelperConflict = ready.conflict
  if (!ready.conflict) throw new Error('DEDICATED_COMBINATION_UNAVAILABLE')
  const exe = path.join(temporary, 'product', 'TaskFlowApp.exe'), environment = { LOCALAPPDATA: fakeLocal }
  await campaign(exe, environment, ready, false)
  await campaign(exe, environment, ready, true)
} catch (error) {
  evidence.limitation = error instanceof Error && error.message.includes('FOREGROUND_UNAVAILABLE') ? 'FOREGROUND_UNAVAILABLE' :
    error instanceof Error ? error.message : 'NATIVE_CAMPAIGN_FAILED'
} finally {
  if (helper?.exitCode === null) { command(helper, 'quit'); await exited(helper) }
  for (const child of children) if (child.exitCode === null && child.pid) {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch { /* Próprio processo já encerrado. */ }
  }
  // A raiz é o resultado absoluto de mkdtemp sob os.tmpdir; somente esse alvo é removido.
  const cleanupTargetValid = path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('tfa009-native-')
  if (cleanupTargetValid) {
    try { rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
    catch { evidence.limitation ??= 'OWNED_TEMPORARY_CLEANUP_FAILED' }
  } else evidence.limitation ??= 'CLEANUP_TARGET_MISMATCH'
  evidence.cleanup = !existsSync(temporary)
  evidence.ok = evidence.limitation === null && Object.values(evidence.checks).every(Boolean) && evidence.cleanup
  writeFileSync(path.join(root, 'release', 'native-shortcut-evidence.json'), JSON.stringify(evidence, null, 2))
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
  if (!evidence.ok) process.exitCode = 1
}
