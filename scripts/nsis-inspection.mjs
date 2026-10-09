import { createHash } from 'node:crypto'

export const hashBytes = data => createHash('sha256').update(data).digest('hex')
export function instructionsFromCompilerTrace(trace) {
  // Exports disponíveis (+ Plugin::Function) incluem plugins não utilizados.
  // Somente File -> $PLUGINSDIR comprova inclusão efetiva no compilado.
  const plugins = [...new Set([...trace.matchAll(/^File: "([\w-]+)\.dll"->"\$PLUGINSDIR\\[^"\r\n]+"/gm)].map(match => match[1]))].sort()
  const instructions = trace.split(/\r?\n/).filter(line => /^(?:RequestExecutionLevel:|Function:|FunctionEnd\b|Section:|SectionEnd\b|Call |SetOutPath:|CreateDirectory:|WriteReg\w*:|DeleteReg\w*:|RMDir:|FileOpen:|ExecWait:|ExecShell:|Plugin command:)/.test(line))
    .map(line => line.replace(/^([\w]+): /, '$1 ').replace(/^Call "([^"\r\n]+)"$/, 'Call $1')).join('\n')
  if (plugins.some(name => ['nsProcess', 'UAC'].includes(name))) throw new Error('NSIS_INSPECTION_FORCED_MAINTENANCE')
  return { instructions, plugins }
}
function block(script, directive, name, ending) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = script.match(new RegExp(`^[ \\t]*${directive}[ \\t]+["']?${escaped}["']?(?:[ \\t].*)?\\r?\\n([\\s\\S]*?)^[ \\t]*${ending}\\b`, 'mi'))
  if (!match) throw new Error('NSIS_INSPECTION_BLOCK_MISSING')
  return match[1]
}
function guarded(body, prefix, effect) {
  const boundary = body.search(effect)
  if (boundary < 0) throw new Error('NSIS_INSPECTION_EFFECT_MISSING')
  for (const guard of ['TFA_ValidateDestination', 'TFA_CheckIdentity', 'TFA_CheckProcesses']) {
    if (!body.slice(0, boundary).includes(`Call ${prefix}${guard}`)) throw new Error('NSIS_INSPECTION_GUARD_ORDER')
  }
}
export function inspectPreprocessedNsis(script, verifiedPeManifest = false) {
  const levels = [...script.matchAll(/^\s*RequestExecutionLevel\s+(\w+)/gmi)].map(match => match[1].toLowerCase())
  // NSIS 3.0.4.1 não registra RequestExecutionLevel no trace -V4.
  // Nesse caso a evidência deve vir do manifest do PE efetivamente compilado.
  if (!(levels.length === 1 && levels[0] === 'user') && !(levels.length === 0 && verifiedPeManifest)) throw new Error('NSIS_INSPECTION_ELEVATION')
  if (/\b(?:taskkill|Stop-Process|nsProcess::KillProcess|UAC::RunElevated)\b/i.test(script) || /^\s*ExecShell\s+["']?runas\b/mi.test(script)) throw new Error('NSIS_INSPECTION_FORCED_MAINTENANCE')
  for (const [name, prefix] of [['.onInit', ''], ['un.onInit', 'un.']]) {
    const init = block(script, 'Function', name, 'FunctionEnd')
    if (/^\s*(?:SetOutPath|CreateDirectory|WriteReg\w*|DeleteReg\w*|RMDir|FileOpen|ExecWait)\b/mi.test(init)) throw new Error('NSIS_INSPECTION_INIT_EFFECT')
    for (const guard of ['TFA_ValidateDestination', 'TFA_CheckIdentity', 'TFA_CheckProcesses']) {
      if (!init.includes(`Call ${prefix}${guard}`)) throw new Error('NSIS_INSPECTION_INIT_GUARD_MISSING')
    }
  }
  const install = block(script, 'Section', 'install', 'SectionEnd')
  guarded(install, '', /^\s*SetOutPath\s+["']?\$INSTDIR/mi)
  const uninstall = block(script, 'Section', 'un.Uninstall', 'SectionEnd')
  guarded(uninstall, 'un.', /^\s*(?:DeleteReg\w*|RMDir)\b/mi)
  const old = block(script, 'Function', 'uninstallOldVersion', 'FunctionEnd')
  const execution = old.search(/^\s*ExecWait\b/mi)
  if (execution < 0 || !old.slice(0, execution).includes('Call TFA_CheckPredecessor') || !old.slice(0, execution).includes('Call TFA_CheckProcesses')) throw new Error('NSIS_INSPECTION_PREDECESSOR_ORDER')
  if (/^\s*ExecWait\b/gmi.test(old.slice(execution + 8))) throw new Error('NSIS_INSPECTION_PREDECESSOR_RETRY')
  return {
    requestExecutionLevel: 'user', guardedInitialization: true, guardedMutation: true,
    guardedOldUninstaller: true, noForcedTerminationOrElevation: true,
    plugins: [...new Set([...script.matchAll(/^\s*(\w+)::\w+/gm)].map(match => match[1]))].sort(),
  }
}
