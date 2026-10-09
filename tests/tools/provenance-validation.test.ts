// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildIdentity } from '../../scripts/build-artifacts.mjs'
import { validateProvenance } from '../../scripts/provenance-validation.mjs'

const checksum = 'a'.repeat(64)
const iconChecksum = 'b'.repeat(64)
const identity = buildIdentity('0.2.0', 'c'.repeat(40), 'fictitious-never-executed')
const components = JSON.parse(readFileSync('build/runtime-components.json', 'utf8')) as Array<{ name: string; version: string; licenseSha256: string }>
const inventory = { schema: 1, components, files: [{ name: 'resources/taskflow.ico', sha256: iconChecksum }] }
function fixture() {
  const binaries = [identity.setup, 'win-unpacked/TaskFlowApp.exe', 'candidate-uninstaller.exe']
  const plugins = ['SpiderBanner', 'StdUtils', 'System', 'WinShell', 'nsExec', 'nsisunz']
  return {
    schema: 1, identity, origin: 'local', createdAt: '2026-10-08T12:00:00.000Z',
    source: { clean: false, sha256: checksum }, readiness: 'INVALID_CANDIDATE_DIRTY_SOURCE',
    toolchain: { node: '24.21.0', npm: '11.21.0', electronBuilder: '26.17.0', appBuilderLib: '26.17.0' },
    lockfileSha256: checksum,
    dependencies: (JSON.parse(readFileSync('package.json', 'utf8')) as { devDependencies: Record<string, string> }).devDependencies,
    runtime: { electron: '44.5.1', architecture: 'x64', embedded: { versions: { electron: '44.5.1', node: '24.21.0', chrome: '152.0.7977.130' }, sqlite: '3.53.4' } },
    environment: { platform: 'win32', architecture: 'x64', osRelease: '10.0.26200', osVersion: 'Windows 11 fixture' },
    signature: { status: 'UNSIGNED_APPROVED_FOR_CONTROLLED_PROOF', publisher: null as string | null },
    executionManifests: binaries.map((name, index) => ({ name, machine: index === 1 ? 0x8664 : 0x14c, requestedExecutionLevel: 'asInvoker', uiAccess: false })),
    files: [...binaries, 'win-unpacked/resources/app.asar', 'inventory.json'].map(name => ({ name, size: 1, sha256: checksum })),
    inventory: 'inventory.json', components,
    nsis: { binary: '3.0.4.1', plugins: '3.4.1', resolvedChecksums: { nsisSha256: '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa', resourcesSha256: '593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103' },
      templates: JSON.parse(readFileSync('build/nsis/upstream-sha256.json', 'utf8')) as { version: string; files: Record<string, string> },
      inspection: { schema: 1, method: 'actual-compiler-trace-V4-and-PE-manifest', compilerSha256: checksum, inputSha256: checksum, traceSha256: checksum, parameterTemplateSha256: checksum,
        checks: { requestExecutionLevel: 'user', guardedInitialization: true, guardedMutation: true, guardedOldUninstaller: true, noForcedTerminationOrElevation: true, plugins },
        plugins: plugins.map(name => ({ name, architecture: 'x86', sha256: checksum, evidence: name === 'StdUtils' ? 'reviewed-pinned-parameter-macro' : 'compiled-plugin-file' })) } },
    icon: { master: 'assets/taskflow-icon.svg', masterSha256: checksum, icoSha256: iconChecksum,
      frames: [16, 24, 32, 48, 256].map(size => ({ size, sha256: checksum })),
      resources: binaries.map((name, index) => ({ name, groupId: index === 1 ? 1 : 103, languages: 1, sizes: [16, 24, 32, 48, 256] })) },
  }
}
type ManifestFixture = ReturnType<typeof fixture>
describe('proveniência de candidato — W01/W14', () => {
  it('aceita fonte dirty somente explicitamente inválida e fonte limpa ainda pendente de campanha', () => {
    const m = fixture()
    expect(validateProvenance(m, identity, inventory)).toBe(true)
    m.source.clean = true
    expect(() => validateProvenance(m, identity, inventory)).toThrow('SOURCE_READINESS')
    m.readiness = 'PENDING_INSTALLED_CAMPAIGN'
    expect(validateProvenance(m, identity, inventory)).toBe(true)
    m.readiness = 'READY'
    expect(() => validateProvenance(m, identity, inventory)).toThrow('SOURCE_READINESS')
  })
  const negatives: Array<[string, (m: ManifestFixture) => void]> = [
    ['ORIGIN_DATE', m => { m.createdAt = 'invalid' }],
    ['TOOLCHAIN', m => { m.toolchain.node = '22.0.0' }],
    ['TOOLCHAIN', m => { m.toolchain.npm = '11.19.0' }],
    ['LOCK_DEPENDENCIES', m => { m.lockfileSha256 = 'missing' }],
    ['RUNTIME', m => { m.runtime.embedded.versions.electron = '1.0.0' }],
    ['RUNTIME', m => { m.runtime.embedded.sqlite = '' }],
    ['ENVIRONMENT', m => { m.environment.osRelease = '' }],
    ['SIGNATURE', m => { m.signature.publisher = 'FICTITIOUS_NOT_APPROVED' }],
    ['EXECUTION_MANIFESTS', m => { m.executionManifests[0]!.requestedExecutionLevel = 'requireAdministrator' }],
    ['EXECUTION_MANIFESTS', m => { m.executionManifests[2]!.machine = 0x8664 }],
    ['FILES', m => { m.files[0]!.name = '../escape.exe' }],
    ['FILES', m => { m.files[0]!.size = -1 }],
    ['INVENTORY_COMPONENTS', m => { m.components = [] }],
    ['NSIS_TOOLSETS', m => { m.nsis.resolvedChecksums.nsisSha256 = checksum }],
    ['NSIS_TOOLSETS', m => { m.nsis.resolvedChecksums.resourcesSha256 = checksum }],
    ['NSIS_TEMPLATES', m => { m.nsis.templates.version = '27.0.0' }],
    ['NSIS_INSPECTION', m => { m.nsis.inspection.traceSha256 = '' }],
    ['NSIS_GUARDS', m => { m.nsis.inspection.checks.guardedOldUninstaller = false }],
    ['NSIS_PLUGINS', m => { m.nsis.inspection.plugins[0]!.name = 'UAC' }],
    ['NSIS_PLUGINS', m => { m.nsis.inspection.plugins[1]!.evidence = 'compiler-exports-only' }],
    ['ICON_DERIVATION', m => { m.icon.frames.pop() }],
    ['ICON_RESOURCES', m => { m.icon.icoSha256 = checksum }],
  ]
  it.each(negatives)('recusa metadados adulterados/ausentes: %s', (reason, mutate) => {
    const m = structuredClone(fixture())
    mutate(m)
    expect(() => validateProvenance(m, identity, inventory)).toThrow(`PROVENANCE_${reason}`)
  })
})
