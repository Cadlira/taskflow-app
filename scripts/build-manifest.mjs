import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import os from 'node:os'
import { digest } from './build-artifacts.mjs'
import { readPeManifest, checkManifest, readPeMachine } from './verify-package.mjs'
import { inspectIconFrames, verifyPeIcon } from './windows-icon.mjs'
import { validateProvenance } from './provenance-validation.mjs'

function sourceState(root) {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort()
  const hash = createHash('sha256')
  for (const file of files) {
    // Somente arquivos da fonte, não perfis, credenciais ou logs ignorados.
    hash.update(file).update('\0').update(readFileSync(path.join(root, file)))
  }
  return { clean: status.trim() === '', sha256: hash.digest('hex') }
}
export { sourceState }
export function createManifest(root, stage, identity, inventory, before) {
  const after = sourceState(root)
  if (before.sha256 !== after.sha256) throw new Error('Fonte alterada durante o build')
  const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const version = name => JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version
  const binaryFiles = [identity.setup, 'win-unpacked/TaskFlowApp.exe', 'candidate-uninstaller.exe']
  const manifests = binaryFiles.map(name => {
    const bytes = readFileSync(path.join(stage, name))
    const manifest = readPeManifest(bytes)
    if (checkManifest(manifest, 'asInvoker').length) throw new Error('Manifest de execução incompatível')
    writeFileSync(path.join(stage, `${path.basename(name)}.manifest.xml`), manifest)
    return { name, machine: readPeMachine(bytes), requestedExecutionLevel: 'asInvoker', uiAccess: false }
  })
  const probe = execFileSync(path.join(stage, 'win-unpacked/TaskFlowApp.exe'), ['-e',
    "const db=new(require('node:sqlite').DatabaseSync)(':memory:');process.stdout.write(JSON.stringify({versions:process.versions,sqlite:db.prepare('select sqlite_version() as version').get().version}));db.close()"],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const runtime = JSON.parse(probe)
  const files = [...binaryFiles, 'win-unpacked/resources/app.asar', 'inventory.json'].map(name => ({ name, sha256: digest(path.join(stage, name)), size: readFileSync(path.join(stage, name)).length }))
  const manifest = {
    schema: 1, identity, origin: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local', createdAt: new Date().toISOString(), source: after,
    readiness: after.clean ? 'PENDING_INSTALLED_CAMPAIGN' : 'INVALID_CANDIDATE_DIRTY_SOURCE',
    toolchain: { node: process.versions.node, npm: process.env.npm_config_user_agent?.match(/npm\/([^ ]+)/)?.[1] ?? 'UNVERIFIED', electronBuilder: version('electron-builder'), appBuilderLib: version('app-builder-lib') },
    lockfileSha256: digest(path.join(root, 'package-lock.json')),
    dependencies: metadata.devDependencies,
    runtime: { electron: version('electron'), architecture: 'x64', embedded: runtime, license: 'LICENSES.chromium.html' },
    nsis: { templates: JSON.parse(readFileSync(path.join(root, 'build/nsis/upstream-sha256.json'), 'utf8')), binary: '3.0.4.1', plugins: '3.4.1', resolvedChecksums: { nsisSha256: '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa', resourcesSha256: '593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103' }, inspection: JSON.parse(readFileSync(path.join(stage, 'nsis-inspection.json'), 'utf8')) },
    environment: { platform: process.platform, architecture: process.arch, osRelease: os.release(), osVersion: os.version() },
    signature: { status: 'UNSIGNED_APPROVED_FOR_CONTROLLED_PROOF', publisher: null },
    icon: { master: 'assets/taskflow-icon.svg', masterSha256: digest(path.join(root, 'assets/taskflow-icon.svg')),
      icoSha256: digest(path.join(root, 'build/icons/taskflow.ico')),
      frames: inspectIconFrames(readFileSync(path.join(root, 'build/icons/taskflow.ico'))),
      resources: binaryFiles.map((name, index) => ({ name, ...verifyPeIcon(readFileSync(path.join(stage, name)), readFileSync(path.join(root, 'build/icons/taskflow.ico')), index === 1 ? 1 : 103) })) },
    files, executionManifests: manifests, inventory: 'inventory.json', components: inventory.components,
    limitations: ['Not a release', 'Installed campaign separate from packaging', 'Setup byte-for-byte reproducibility not claimed'],
  }
  if (process.versions.node !== metadata.engines.node || manifest.toolchain.npm !== metadata.engines.npm) throw new Error('Toolchain divergente')
  validateProvenance(manifest, identity, inventory)
  writeFileSync(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
