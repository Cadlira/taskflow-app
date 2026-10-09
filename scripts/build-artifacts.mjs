import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
export function digest(file) { return createHash('sha256').update(readFileSync(file)).digest('hex') }
export function buildIdentity(version, commit, run) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || version === '0.1.1') throw new Error('Versão de candidato inválida')
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Commit inválido')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(run)) throw new Error('Run inválido')
  const id = `${version}-win-x64-${commit}-${run}`
  return { version, architecture: 'x64', commit, run, id, setup: `TaskFlowApp-${id}-Setup.exe` }
}
export function containedPath(root, relative) {
  if (path.isAbsolute(relative) || !relative || /[\\:]/.test(relative) || relative.split('/').some(part => part === '' || part === '.' || part === '..' || /[. ]$/.test(part))) throw new Error('Caminho de artefato inválido')
  const base = realpathSync(root)
  const target = path.resolve(base, relative)
  const relation = path.relative(base, target)
  if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) throw new Error('Artefato fora do root')
  let cursor = target
  while (cursor !== base) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Reparse/symlink no artefato')
    const parent = path.dirname(cursor)
    if (parent === cursor) throw new Error('Root inválido')
    cursor = parent
  }
  return target
}
export function createBuildStage(projectRoot, identity) {
  const checked = buildIdentity(identity.version, identity.commit, identity.run)
  const stage = containedPath(projectRoot, `release/candidates/${checked.id}`)
  // Não reutilizar, limpar ou sobrepor saídas; inclusive build anterior incompleto.
  if (existsSync(stage)) throw new Error('Staging já existente')
  mkdirSync(path.dirname(stage), { recursive: true })
  containedPath(projectRoot, `release/candidates/${checked.id}`)
  mkdirSync(stage)
  writeFileSync(path.join(stage, 'selection.json'), `${JSON.stringify({ schema: 1, identity: checked, sealed: false }, null, 2)}\n`, { flag: 'wx' })
  return stage
}
function loadSelection(projectRoot, stageId) {
  if (typeof stageId !== 'string' || stageId.includes('/') || stageId.includes('\\')) throw new Error('Informe --stage <build-id>')
  const stage = containedPath(projectRoot, `release/candidates/${stageId}`)
  const selectionFile = containedPath(stage, 'selection.json')
  const selection = JSON.parse(readFileSync(selectionFile, 'utf8'))
  const expected = buildIdentity(selection.identity.version, selection.identity.commit, selection.identity.run)
  if (selection.schema !== 1 || selection.identity.architecture !== 'x64' || selection.identity.id !== expected.id || selection.identity.setup !== expected.setup || stageId !== expected.id) throw new Error('Identidade do staging divergente')
  return { stage, selection, identity: expected }
}
function exactFiles(stage, identity) {
  const setups = readdirSync(stage).filter(name => /setup.*\.exe$/i.test(name))
  if (setups.length !== 1 || setups[0] !== identity.setup) throw new Error('Setup ausente, duplicado ou divergente')
  const relativeFiles = [identity.setup, 'win-unpacked/TaskFlowApp.exe', 'win-unpacked/resources/app.asar']
  for (const name of relativeFiles) {
    const file = containedPath(stage, name)
    if (!lstatSync(file).isFile()) throw new Error('Artefato não é arquivo regular')
  }
  const archive = containedPath(stage, relativeFiles[2])
  const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
  if (metadata.version !== identity.version || metadata.name !== 'taskflow-app' || metadata.main !== 'out/main/index.js') throw new Error('Versão/identidade do payload divergente')
  const executable = readFileSync(containedPath(stage, relativeFiles[1]))
  if (executable.length < 64 || executable.readUInt16LE(0) !== 0x5a4d) throw new Error('PE inválido')
  const pe = executable.readUInt32LE(60)
  if (pe + 6 > executable.length || executable.readUInt32LE(pe) !== 0x4550 || executable.readUInt16LE(pe + 4) !== 0x8664) throw new Error('Arquitetura do payload divergente')
  const reviewFiles = ['candidate-uninstaller.exe', 'uninstaller-sha256.json', 'inventory.json', 'manifest.json', 'source-before.json', `${identity.setup}.manifest.xml`, 'TaskFlowApp.exe.manifest.xml', 'candidate-uninstaller.exe.manifest.xml']
  const inventory = JSON.parse(readFileSync(containedPath(stage, 'inventory.json'), 'utf8'))
  if (inventory.schema !== 1 || !Array.isArray(inventory.files)) throw new Error('Inventário de payload incompleto')
  const payloadRoot = containedPath(stage, 'win-unpacked')
  const actualPayload = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = path.relative(payloadRoot, path.join(directory, entry.name)).replace(/\\/g, '/')
      const file = containedPath(payloadRoot, name)
      if (lstatSync(file).isDirectory()) visit(file)
      else if (lstatSync(file).isFile()) actualPayload.push({ name, size: lstatSync(file).size, sha256: digest(file) })
      else throw new Error('Payload não regular')
    }
  }
  visit(payloadRoot)
  const expectedPayload = inventory.files.map(({ name, size, sha256 }) => ({ name, size, sha256 }))
  const sorted = files => files.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  if (JSON.stringify(sorted(actualPayload)) !== JSON.stringify(sorted(expectedPayload))) throw new Error('Payload/hash/tamanho divergente do inventário')
  const manifest = JSON.parse(readFileSync(containedPath(stage, 'manifest.json'), 'utf8'))
  if (manifest.schema !== 1 || JSON.stringify(manifest.identity) !== JSON.stringify(identity) ||
      typeof manifest.source?.clean !== 'boolean' || !/^[a-f0-9]{64}$/.test(manifest.source.sha256) ||
      manifest.readiness !== (manifest.source.clean ? 'PENDING_INSTALLED_CAMPAIGN' : 'INVALID_CANDIDATE_DIRTY_SOURCE')) throw new Error('Manifesto de proveniência divergente')
  const before = JSON.parse(readFileSync(containedPath(stage, 'source-before.json'), 'utf8'))
  if (JSON.stringify(before.identity) !== JSON.stringify(identity) || JSON.stringify(before.source) !== JSON.stringify(manifest.source)) throw new Error('Fonte alterada durante o build')
  const manifestNames = [...relativeFiles, 'candidate-uninstaller.exe', 'inventory.json'].sort()
  if (!Array.isArray(manifest.files) || JSON.stringify(manifest.files.map(file => file.name).sort()) !== JSON.stringify(manifestNames)) throw new Error('Manifesto de arquivos incompleto')
  for (const file of manifest.files) {
    const target = containedPath(stage, file.name)
    if (file.size !== lstatSync(target).size || file.sha256 !== digest(target)) throw new Error('Hash/tamanho no manifesto divergente')
  }
  const uninstaller = JSON.parse(readFileSync(containedPath(stage, 'uninstaller-sha256.json'), 'utf8'))
  if (uninstaller.version !== identity.version || uninstaller.sha256 !== digest(containedPath(stage, 'candidate-uninstaller.exe'))) throw new Error('Procedência do desinstalador divergente')
  for (const name of reviewFiles.filter(name => name.endsWith('.manifest.xml'))) {
    const content = readFileSync(containedPath(stage, name), 'utf8')
    if (!content.includes('requestedExecutionLevel level="asInvoker"') || !content.includes('uiAccess="false"')) throw new Error('Manifest de execução divergente')
  }
  return [...relativeFiles, ...reviewFiles].map(name => {
    const file = containedPath(stage, name)
    if (!lstatSync(file).isFile()) throw new Error('Artefato não é arquivo regular')
    return { name, size: lstatSync(file).size, sha256: digest(file) }
  })
}
export function sealBuildStage(projectRoot, stageId) {
  const { stage, selection, identity } = loadSelection(projectRoot, stageId)
  if (selection.sealed !== false) throw new Error('Staging já selado')
  const files = exactFiles(stage, identity)
  writeFileSync(path.join(stage, 'selection.json'), `${JSON.stringify({ schema: 1, identity, sealed: true, files }, null, 2)}\n`)
  return { stage, identity, files }
}
export function resolveBuildStage(projectRoot, stageId, expected = {}) {
  const { stage, selection, identity } = loadSelection(projectRoot, stageId)
  if (selection.sealed !== true) throw new Error('Build não concluído/selado')
  for (const [key, value] of Object.entries(expected)) if (identity[key] !== value) throw new Error('Candidato diferente do esperado')
  const actual = exactFiles(stage, identity)
  if (!Array.isArray(selection.files) || JSON.stringify(actual) !== JSON.stringify(selection.files)) throw new Error('Hash/tamanho do candidato divergente')
  return { stage, identity, files: actual, setupFile: path.join(stage, identity.setup), unpackedRoot: path.join(stage, 'win-unpacked') }
}
export function stageArgument(arguments_) {
  const positions = arguments_.flatMap((value, index) => value === '--stage' ? [index] : [])
  if (positions.length !== 1 || !arguments_[positions[0] + 1] || arguments_[positions[0] + 1].startsWith('--')) throw new Error('Informe um único --stage <build-id>')
  return arguments_[positions[0] + 1]
}
