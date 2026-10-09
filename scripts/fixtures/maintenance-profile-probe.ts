import { app } from 'electron'
import { mkdirSync, lstatSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import { FileAiProviderConfig } from '../../src/main/ai/file-ai-config.js'
import { createNativeProtection } from '../../src/main/ai/native-protection.js'
import { AiConfigStorageError } from '../../src/application/ai/ai-provider-config-repository.js'

const mode = process.argv[2]
const root = path.resolve(process.argv[3] ?? '')
const expectedParent = path.resolve('.tmp/tfa011-tests')
if (!['prepare', 'verify'].includes(mode ?? '') || path.dirname(root) !== expectedParent || !/^dpapi-[a-zA-Z0-9-]+$/.test(path.basename(root))) throw new Error('FIXTURE_ROOT_REFUSED')
let ancestor = root
while (ancestor !== path.dirname(expectedParent)) {
  if (lstatSync(ancestor).isSymbolicLink()) throw new Error('FIXTURE_REPARSE_REFUSED')
  ancestor = path.dirname(ancestor)
}
const userData = path.join(root, 'user-data')
mkdirSync(userData, { recursive: true })
app.setPath('userData', userData)
app.setPath('sessionData', path.join(root, 'session-data'))
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
const fictitious = 'TFA011-FICTITIOUS-NOT-A-PROVIDER-CREDENTIAL'
const started = performance.now()
app.whenReady().then(async () => {
  const config = new FileAiProviderConfig(userData, createNativeProtection())
  if (!config.protectionAvailable()) throw new Error('NATIVE_PROTECTION_UNAVAILABLE')
  if (mode === 'prepare') {
    if (existsSync(config.file)) throw new Error('FIXTURE_ALREADY_EXISTS')
    await config.save({ expectedRevision: '0', provider: 'OPENAI', model: 'fictitious-no-network', credential: fictitious })
  }
  const before = digest(config.file)
  const opened = await config.openCredential()
  const protectedMatch = opened?.config.credential === fictitious
  const ciphertextOnly = !readFileSync(config.file).includes(Buffer.from(fictitious))
  if (!protectedMatch || !ciphertextOnly || before !== digest(config.file)) throw new Error('DPAPI_ORACLE_FAILED')
  const checks = { realNativeProtection: true, sameUserDecryptMatch: true, plaintextAbsent: true, configIntact: true, futureRefusedIntact: false, unreadableRefusedIntact: false }
  if (mode === 'verify') {
    for (const kind of ['future', 'unreadable'] as const) {
      const directory = path.join(root, kind)
      mkdirSync(directory)
      const probe = new FileAiProviderConfig(directory, createNativeProtection())
      writeFileSync(probe.file, JSON.stringify(kind === 'future'
        ? { version: 2, revision: '0', config: null }
        : { version: 1, revision: '1', config: { provider: 'OPENAI', model: 'fictitious-no-network', credential: randomBytes(64).toString('base64') } }))
      const baseline = digest(probe.file)
      let reason: string | undefined
      try { await probe.openCredential() } catch (error) { if (error instanceof AiConfigStorageError) reason = error.reason }
      const expected = kind === 'future' ? 'INCOMPATIBLE_DATA' : 'CREDENTIAL_UNREADABLE'
      if (reason !== expected || baseline !== digest(probe.file)) throw new Error('INVALID_CONFIG_ORACLE_FAILED')
      checks[kind === 'future' ? 'futureRefusedIntact' : 'unreadableRefusedIntact'] = true
    }
  }
  process.stdout.write(`TFA011_DPAPI ${JSON.stringify({ case: 'W10-local-native-protection', mode, status: 'PASS', durationMs: Math.round(performance.now() - started), checks, electron: process.versions.electron, networkRequests: 0 })}\n`)
  app.exit(0)
}).catch(() => { process.stdout.write('TFA011_DPAPI {"status":"FAIL","reason":"SANITIZED_PROBE_FAILURE"}\n'); app.exit(1) })
