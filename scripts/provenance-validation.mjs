// Contrato sanitizado de proveniência; não lê perfis nem inclui paths pessoais.
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value)
const requireCheck = (condition, reason) => { if (!condition) throw new Error(`PROVENANCE_${reason}`) }
export function validateProvenance(m, identity, inventory) {
  requireCheck(m?.schema === 1 && JSON.stringify(m.identity) === JSON.stringify(identity), 'IDENTITY')
  requireCheck(['local', 'github-actions'].includes(m.origin) && typeof m.createdAt === 'string' && Number.isFinite(Date.parse(m.createdAt)), 'ORIGIN_DATE')
  requireCheck(typeof m.source?.clean === 'boolean' && hash(m.source.sha256) && m.readiness === (m.source.clean ? 'PENDING_INSTALLED_CAMPAIGN' : 'INVALID_CANDIDATE_DIRTY_SOURCE'), 'SOURCE_READINESS')
  requireCheck(m.toolchain?.node === '24.21.0' && m.toolchain.npm === '11.21.0' && m.toolchain.electronBuilder === '26.17.0' && m.toolchain.appBuilderLib === '26.17.0', 'TOOLCHAIN')
  requireCheck(hash(m.lockfileSha256) && m.dependencies?.electron === '44.5.1' && m.dependencies['electron-builder'] === m.toolchain.electronBuilder, 'LOCK_DEPENDENCIES')
  requireCheck(m.runtime?.electron === m.dependencies.electron && m.runtime.architecture === 'x64' && m.runtime.embedded?.versions?.electron === m.runtime.electron && m.runtime.embedded.versions.node === '24.21.0' && version(m.runtime.embedded.versions.chrome) && version(m.runtime.embedded.sqlite), 'RUNTIME')
  requireCheck(m.environment?.platform === 'win32' && m.environment.architecture === 'x64' && typeof m.environment.osRelease === 'string' && /^10\.0\.\d+$/.test(m.environment.osRelease) && typeof m.environment.osVersion === 'string' && m.environment.osVersion.startsWith('Windows'), 'ENVIRONMENT')
  requireCheck(m.signature?.status === 'UNSIGNED_APPROVED_FOR_CONTROLLED_PROOF' && m.signature.publisher === null, 'SIGNATURE')
  const binaries = [identity.setup, 'win-unpacked/TaskFlowApp.exe', 'candidate-uninstaller.exe']
  requireCheck(Array.isArray(m.executionManifests) && m.executionManifests.length === 3 && binaries.every((name, index) => m.executionManifests.filter(item => item.name === name && item.machine === (index === 1 ? 0x8664 : 0x14c) && item.requestedExecutionLevel === 'asInvoker' && item.uiAccess === false).length === 1), 'EXECUTION_MANIFESTS')
  const names = [...binaries, 'win-unpacked/resources/app.asar', 'inventory.json'].sort()
  requireCheck(Array.isArray(m.files) && JSON.stringify(m.files.map(file => file.name).sort()) === JSON.stringify(names) && m.files.every(file => Number.isSafeInteger(file.size) && file.size > 0 && hash(file.sha256)), 'FILES')
  requireCheck(m.inventory === 'inventory.json' && inventory?.schema === 1 && JSON.stringify(m.components) === JSON.stringify(inventory.components), 'INVENTORY_COMPONENTS')
  const incorporated = ['@vue/reactivity', '@vue/runtime-core', '@vue/runtime-dom', '@vue/shared', 'pinia', 'vue']
  requireCheck(Array.isArray(m.components) && m.components.length === incorporated.length && incorporated.every(name => m.components.filter(component => component.name === name && component.version === m.dependencies[name.startsWith('@vue/') ? 'vue' : name] && hash(component.licenseSha256)).length === 1), 'COMPONENT_VERSIONS')
  requireCheck(m.nsis?.binary === '3.0.4.1' && m.nsis.plugins === '3.4.1' && m.nsis.resolvedChecksums?.nsisSha256 === '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa' && m.nsis.resolvedChecksums.resourcesSha256 === '593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103', 'NSIS_TOOLSETS')
  requireCheck(m.nsis.templates?.version === '26.17.0' && Object.keys(m.nsis.templates.files ?? {}).length === 7 && Object.values(m.nsis.templates.files).every(hash), 'NSIS_TEMPLATES')
  const inspection = m.nsis.inspection
  requireCheck(inspection?.schema === 1 && inspection.method === 'actual-compiler-trace-V4-and-PE-manifest' && [inspection.compilerSha256, inspection.inputSha256, inspection.traceSha256, inspection.parameterTemplateSha256].every(hash), 'NSIS_INSPECTION')
  requireCheck(inspection.checks?.requestExecutionLevel === 'user' && ['guardedInitialization', 'guardedMutation', 'guardedOldUninstaller', 'noForcedTerminationOrElevation'].every(key => inspection.checks[key] === true), 'NSIS_GUARDS')
  const plugins = ['SpiderBanner', 'StdUtils', 'System', 'WinShell', 'nsExec', 'nsisunz']
  requireCheck(Array.isArray(inspection.plugins) && inspection.plugins.length === 6 && plugins.every(name => inspection.plugins.filter(item => item.name === name && item.architecture === 'x86' && hash(item.sha256) && item.evidence === (name === 'StdUtils' ? 'reviewed-pinned-parameter-macro' : 'compiled-plugin-file')).length === 1) && JSON.stringify(inspection.checks.plugins) === JSON.stringify(plugins), 'NSIS_PLUGINS')
  requireCheck(m.icon?.master === 'assets/taskflow-icon.svg' && hash(m.icon.masterSha256) && hash(m.icon.icoSha256) && Array.isArray(m.icon.frames) && JSON.stringify(m.icon.frames.map(frame => frame.size)) === '[16,24,32,48,256]' && m.icon.frames.every(frame => hash(frame.sha256)), 'ICON_DERIVATION')
  requireCheck(m.icon.icoSha256 === inventory.files?.find(file => file.name === 'resources/taskflow.ico')?.sha256 && Array.isArray(m.icon.resources) && m.icon.resources.length === 3 && binaries.every((name, index) => m.icon.resources.filter(item => item.name === name && item.groupId === (index === 1 ? 1 : 103) && item.languages >= 1 && JSON.stringify(item.sizes) === '[16,24,32,48,256]').length === 1), 'ICON_RESOURCES')
  return true
}
