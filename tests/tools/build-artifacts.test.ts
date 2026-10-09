// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { buildIdentity, containedPath, createBuildStage, digest, resolveBuildStage, sealBuildStage, stageArgument } from '../../scripts/build-artifacts.mjs'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar') as { createPackage(source: string, dest: string): Promise<void> }
const roots: string[] = []
const commit = 'a'.repeat(40)
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function workspace(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tfa011-selection-'))
  roots.push(root)
  return root
}
async function fixture(version = '0.2.0') {
  const root = workspace()
  const identity = buildIdentity(version, commit, 'fixture')
  const stage = createBuildStage(root, identity)
  const resources = path.join(stage, 'win-unpacked/resources')
  mkdirSync(resources, { recursive: true })
  const pe = Buffer.alloc(128)
  pe.writeUInt16LE(0x5a4d, 0)
  pe.writeUInt32LE(64, 60)
  pe.writeUInt32LE(0x4550, 64)
  pe.writeUInt16LE(0x8664, 68)
  writeFileSync(path.join(stage, 'win-unpacked/TaskFlowApp.exe'), pe)
  writeFileSync(path.join(stage, identity.setup), 'fictitious setup, never executed')
  const source = path.join(root, 'fixture-source')
  mkdirSync(source)
  writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'taskflow-app', version, main: 'out/main/index.js' }))
  await asar.createPackage(source, path.join(resources, 'app.asar'))
  writeFileSync(path.join(stage, 'candidate-uninstaller.exe'), 'fictitious uninstaller, never executed')
  writeFileSync(path.join(stage, 'inventory.json'), JSON.stringify({ schema: 1, files: ['TaskFlowApp.exe', 'resources/app.asar'].map(name => ({ name, size: readFileSync(path.join(stage, 'win-unpacked', name)).length, sha256: digest(path.join(stage, 'win-unpacked', name)) })) }))
  writeFileSync(path.join(stage, 'uninstaller-sha256.json'), JSON.stringify({ version, sha256: digest(path.join(stage, 'candidate-uninstaller.exe')) }))
  for (const name of [`${identity.setup}.manifest.xml`, 'TaskFlowApp.exe.manifest.xml', 'candidate-uninstaller.exe.manifest.xml']) writeFileSync(path.join(stage, name), '<requestedExecutionLevel level="asInvoker" uiAccess="false"/>')
  const files = [identity.setup, 'win-unpacked/TaskFlowApp.exe', 'win-unpacked/resources/app.asar', 'candidate-uninstaller.exe', 'inventory.json'].map(name => ({ name, size: readFileSync(path.join(stage, name)).length, sha256: digest(path.join(stage, name)) }))
  writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({ schema: 1, identity, source: { clean: true, sha256: 'c'.repeat(64) }, readiness: 'PENDING_INSTALLED_CAMPAIGN', files }))
  writeFileSync(path.join(stage, 'source-before.json'), JSON.stringify({ identity, source: { clean: true, sha256: 'c'.repeat(64) } }))
  return { root, stage, identity }
}
describe('staging e seleção exata — W14 local', () => {
  it('isola o build, conserva históricos e não reutiliza saída', () => {
    const root = workspace()
    mkdirSync(path.join(root, 'release'))
    const historical = path.join(root, 'release/TaskFlowApp-0.1.1-win-x64-Setup.exe')
    writeFileSync(historical, 'historical')
    const identity = buildIdentity('0.2.0', commit, 'fixture')
    const stage = createBuildStage(root, identity)
    expect(stage).toContain(identity.id)
    expect(() => createBuildStage(root, identity)).toThrow('existente')
    expect(readFileSync(historical, 'utf8')).toBe('historical')
  })
  it.each(['../escape', 'a/b', 'a\\b', 'x:stream', '', 'a '.repeat(40)])('recusa run inválido %s', run => {
    expect(() => buildIdentity('0.2.0', commit, run)).toThrow()
  })
  it('recusa versão histórica e commit não identificável', () => {
    expect(() => buildIdentity('0.1.1', commit, 'fixture')).toThrow()
    expect(() => buildIdentity('0.2.0', 'HEAD', 'fixture')).toThrow()
  })
  it('recusa escape/reparse em ancestral sem escrever no destino', () => {
    const root = workspace()
    const outside = workspace()
    mkdirSync(path.join(root, 'release'))
    symlinkSync(outside, path.join(root, 'release/candidates'), 'junction')
    expect(() => createBuildStage(root, buildIdentity('0.2.0', commit, 'fixture'))).toThrow('Reparse')
    expect(() => containedPath(root, '../outside')).toThrow()
  })
  it('exige stage explícito único sem fallback histórico', () => {
    expect(() => stageArgument([])).toThrow()
    expect(() => stageArgument(['--stage', 'a', '--stage', 'b'])).toThrow()
    expect(() => stageArgument(['--stage', '--ci-runner'])).toThrow()
  })
  it('seleciona os bytes exatos de versão/arquitetura/commit/run', async () => {
    const { root, stage, identity } = await fixture()
    expect(() => resolveBuildStage(root, identity.id)).toThrow('selado')
    sealBuildStage(root, identity.id)
    const resolved = resolveBuildStage(root, identity.id, { version: '0.2.0', commit, run: 'fixture' })
    expect(resolved.setupFile).toBe(path.join(stage, identity.setup))
    expect(resolved.files).toHaveLength(11)
    expect(() => resolveBuildStage(root, identity.id, { commit: 'b'.repeat(40) })).toThrow('esperado')
  })
  it('falha em Setup ausente sem usar histórico coexistente', async () => {
    const { root, stage, identity } = await fixture()
    rmSync(path.join(stage, identity.setup))
    writeFileSync(path.join(root, 'release/TaskFlowApp-0.1.1-win-x64-Setup.exe'), 'old')
    expect(() => sealBuildStage(root, identity.id)).toThrow('ausente')
  })
  it('recusa duplicado e versão errada mesmo havendo arquivo esperado', async () => {
    const { root, stage, identity } = await fixture()
    copyFileSync(path.join(stage, identity.setup), path.join(stage, 'duplicate-Setup.exe'))
    expect(() => sealBuildStage(root, identity.id)).toThrow('duplicado')
    rmSync(path.join(stage, 'duplicate-Setup.exe'))
    const source = path.join(root, 'fixture-source/package.json')
    writeFileSync(source, JSON.stringify({ name: 'taskflow-app', version: '0.1.1', main: 'out/main/index.js' }))
    await asar.createPackage(path.dirname(source), path.join(stage, 'win-unpacked/resources/app.asar'))
    expect(() => sealBuildStage(root, identity.id)).toThrow('divergente')
  })
  it('recusa arquitetura errada e adulteração posterior de cada artefato', async () => {
    const { root, stage, identity } = await fixture()
    const exe = path.join(stage, 'win-unpacked/TaskFlowApp.exe')
    const pe = readFileSync(exe)
    pe.writeUInt16LE(0x14c, 68)
    writeFileSync(exe, pe)
    expect(() => sealBuildStage(root, identity.id)).toThrow('Arquitetura')
    pe.writeUInt16LE(0x8664, 68)
    writeFileSync(exe, pe)
    sealBuildStage(root, identity.id)
    for (const file of [identity.setup, 'win-unpacked/TaskFlowApp.exe', 'win-unpacked/resources/app.asar', 'candidate-uninstaller.exe', 'inventory.json', 'manifest.json', 'uninstaller-sha256.json', 'TaskFlowApp.exe.manifest.xml']) {
      const target = path.join(stage, file)
      const original = readFileSync(target)
      writeFileSync(target, Buffer.concat([original, Buffer.from('tamper')]))
      expect(() => resolveBuildStage(root, identity.id)).toThrow()
      writeFileSync(target, original)
    }
  })
  it('recusa payload externo acrescido/adulterado depois do selo, mesmo com recibos centrais intactos', async () => {
    const { root, stage, identity } = await fixture()
    const resource = path.join(stage, 'win-unpacked/resources/runtime-fictitious.pak')
    writeFileSync(resource, 'reviewed-fictitious-runtime')
    const inventoryFile = path.join(stage, 'inventory.json')
    const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8')) as { files: Array<{ name: string; size: number; sha256: string }> }
    inventory.files.push({ name: 'resources/runtime-fictitious.pak', size: readFileSync(resource).length, sha256: digest(resource) })
    writeFileSync(inventoryFile, JSON.stringify(inventory))
    const manifestFile = path.join(stage, 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as { files: Array<{ name: string; size: number; sha256: string }> }
    const declared = manifest.files.find(file => file.name === 'inventory.json')!
    declared.size = readFileSync(inventoryFile).length
    declared.sha256 = digest(inventoryFile)
    writeFileSync(manifestFile, JSON.stringify(manifest))
    sealBuildStage(root, identity.id)
    const original = readFileSync(resource)
    writeFileSync(resource, Buffer.alloc(original.length, 1))
    expect(() => resolveBuildStage(root, identity.id)).toThrow('Payload/hash/tamanho')
    writeFileSync(resource, original)
    writeFileSync(path.join(stage, 'win-unpacked/unexpected-helper.exe'), 'FICTITIOUS_NEVER_EXECUTED')
    expect(() => resolveBuildStage(root, identity.id)).toThrow('Payload/hash/tamanho')
  })
})
