// Instrumenta somente a CLI de build fixada. Não altera node_modules nem o app.
// Captura o trace -V4 da própria compilação após expansão de includes/macros.
import childProcess from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { hashBytes, inspectPreprocessedNsis, instructionsFromCompilerTrace } from './nsis-inspection.mjs'
import { readPeManifest, checkManifest } from './verify-package.mjs'

const require = createRequire(import.meta.url)
// Carregar pela entrada pública evita ciclo interno ao importar NsisTarget primeiro.
require('electron-builder')
const { NsisTarget } = require('app-builder-lib/out/targets/nsis/NsisTarget.js')
const { getMakeNsisPath, getNsisPluginsPath } = require('app-builder-lib/out/toolsets/windows.js')
const original = NsisTarget.prototype.executeMakensis
NsisTarget.prototype.executeMakensis = async function (defines, commands, script, options) {
  const compiler = await getMakeNsisPath(this.packager.config.toolsets?.nsis, this.options.customNsisBinary)
  const stage = path.dirname(commands.OutFile.replace(/^"|"$/g, ''))
  writeFileSync(path.join(stage, 'nsis-input.private.json'), JSON.stringify({ defines, commands, script }), { flag: 'wx' })
  const spawn = childProcess.spawn
  const chunks = []
  let captures = 0
  childProcess.spawn = function (command, args, settings) {
    if (path.resolve(command) !== path.resolve(compiler.path)) return spawn.call(this, command, args, settings)
    captures++
    const child = spawn.call(this, command, ['-V4', '-OUTPUTCHARSET', 'UTF8', ...args], settings)
    child.stdout.on('data', data => { chunks.push(Buffer.from(data)) })
    return child
  }
  try { await original.call(this, defines, commands, script, options) }
  finally { childProcess.spawn = spawn }
  if (captures !== 1) throw new Error('NSIS_INSPECTION_CAPTURE_MISSING_OR_AMBIGUOUS')
  const trace = Buffer.concat(chunks)
  // Saída bruta tem paths do build; fica somente no stage local ignorado.
  writeFileSync(path.join(stage, 'nsis-compiler-trace.private.txt'), trace, { flag: 'wx' })
  const parsed = instructionsFromCompilerTrace(trace.toString('utf8'))
  const setup = commands.OutFile.replace(/^"|"$/g, '')
  if (checkManifest(readPeManifest(readFileSync(setup)), 'asInvoker').length !== 0) throw new Error('NSIS_INSPECTION_ELEVATION')
  const checks = inspectPreprocessedNsis(parsed.instructions, true)
  // StdUtils.nsh reduz !verbose nos helpers de parâmetros, ocultando-os no trace.
  // Sua expansão foi revisada e fixada por hash; não inferir uso pelos exports.
  if (!script.includes('${StdUtils.TestParameter}')) throw new Error('NSIS_INSPECTION_PARAMETER_HELPER_MISSING')
  const parameterTemplate = path.join(this.packager.projectDir, 'node_modules/app-builder-lib/templates/nsis/include/StdUtils.nsh')
  const parameterTemplateSha256 = hashBytes(readFileSync(parameterTemplate))
  if (parameterTemplateSha256 !== 'e68d1bf7e4afd258b601346b833bf064285213d8f481caa900a1430cdabee275') throw new Error('NSIS_INSPECTION_PARAMETER_HELPER_MISMATCH')
  const usedPlugins = [...new Set([...parsed.plugins, 'StdUtils'])].sort()
  const pluginsRoot = await getNsisPluginsPath(this.packager.config.toolsets?.nsis, this.options.customNsisResources)
  const builtinRoot = path.join(path.dirname(path.dirname(compiler.path)), 'Plugins', 'x86-unicode')
  const plugins = usedPlugins.map(name => {
    const root = ['System', 'nsExec'].includes(name) ? builtinRoot : path.join(pluginsRoot, 'x86-unicode')
    return { name, architecture: 'x86', sha256: hashBytes(readFileSync(path.join(root, `${name}.dll`))), evidence: name === 'StdUtils' ? 'reviewed-pinned-parameter-macro' : 'compiled-plugin-file' }
  })
  const report = { schema: 1, method: 'actual-compiler-trace-V4-and-PE-manifest', compilerSha256: hashBytes(readFileSync(compiler.path)), inputSha256: hashBytes(JSON.stringify({ defines, commands, script })), traceSha256: hashBytes(trace), checks: { ...checks, plugins: usedPlugins }, plugins, parameterTemplateSha256 }
  writeFileSync(path.join(stage, 'nsis-inspection.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
}
