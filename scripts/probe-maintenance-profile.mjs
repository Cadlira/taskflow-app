// Prova local restrita com adapters reais, sem rede, perfil real ou bridge pública.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { containedPath } from './build-artifacts.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32' || process.argv.length !== 2) throw new Error('PROBE_WINDOWS_WITHOUT_ARGUMENTS_REQUIRED')
const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const base = containedPath(projectRoot, '.tmp/tfa011-tests')
mkdirSync(base, { recursive: true })
const fixture = mkdtempSync(path.join(base, 'dpapi-'))
containedPath(projectRoot, path.relative(projectRoot, fixture).replace(/\\/g, '/'))
try {
  const sid = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (!/^S-1-5-21-\d+-\d+-\d+-\d+$/.test(sid)) throw new Error('FIXTURE_OWNER_UNVERIFIED')
  execFileSync('icacls.exe', [fixture, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)(F)`, '*S-1-5-18:(OI)(CI)(F)'], { windowsHide: true, stdio: 'ignore' })
  const script = path.join(fixture, 'probe.cjs')
  await build({ entryPoints: [path.join(projectRoot, 'scripts/fixtures/maintenance-profile-probe.ts')], outfile: script,
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  const results = []
  for (const mode of ['prepare', 'verify']) {
    const stdout = execFileSync(require('electron'), [script, mode, fixture], { cwd: projectRoot, env: environment, windowsHide: true, timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const lines = stdout.split(/\r?\n/).filter(line => line.startsWith('TFA011_DPAPI '))
    if (lines.length !== 1) throw new Error('PROBE_RESULT_MISSING')
    const result = JSON.parse(lines[0].slice('TFA011_DPAPI '.length))
    if (result.status !== 'PASS' || result.mode !== mode || result.networkRequests !== 0 || result.electron !== require('electron/package.json').version) throw new Error('PROBE_RESULT_INVALID')
    results.push(result)
  }
  const proof = { scope: 'local-fixture-only-not-installed-maintenance', results }
  writeFileSync(path.join(fixture, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`${JSON.stringify(proof)}\n`)
} catch {
  process.stderr.write('MAINTENANCE_PROFILE_PROBE_FAILED_SANITIZED\n')
  process.exitCode = 1
}
