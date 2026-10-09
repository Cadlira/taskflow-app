// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { compareInstalledPayload, inspectContent, inventoryPayload } from '../../scripts/payload-inventory.mjs'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar') as { createPackage(source: string, dest: string): Promise<void> }
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }) })
const hash = (text: string): string => createHash('sha256').update(text).digest('hex')
async function fixture() {
  const project = mkdtempSync(path.join(os.tmpdir(), 'tfa011-payload-'))
  roots.push(project)
  const root = path.join(project, 'payload')
  const source = path.join(project, 'source')
  const components = ['vue', 'pinia'].map(name => ({ name, version: 'fixture', origin: `node_modules/${name}`, licenseSha256: hash(`${name} fictitious license`) }))
  for (const directory of ['payload/resources', 'source/out/main', 'source/out/preload', 'source/out/renderer', 'build/nsis', 'node_modules/electron/dist', 'node_modules/vue', 'node_modules/pinia']) mkdirSync(path.join(project, directory), { recursive: true })
  writeFileSync(path.join(project, 'build/nsis/THIRD-PARTY-NOTICES.txt'), 'NSIS fictitious notice')
  writeFileSync(path.join(root, 'resources/NSIS-THIRD-PARTY-NOTICES.txt'), 'NSIS fictitious notice')
  writeFileSync(path.join(project, 'node_modules/electron/dist/LICENSES.chromium.html'), 'runtime fictitious license')
  writeFileSync(path.join(root, 'LICENSES.chromium.html'), 'runtime fictitious license')
  for (const component of components) writeFileSync(path.join(project, component.origin, 'LICENSE'), `${component.name} fictitious license`)
  writeFileSync(path.join(project, 'build/runtime-components.json'), JSON.stringify(components))
  writeFileSync(path.join(root, 'resources/runtime-components.json'), JSON.stringify(components))
  writeFileSync(path.join(root, 'resources/THIRD-PARTY-NOTICES.txt'), components.map(c => `${c.name} ${c.version}\n${c.name} fictitious license`).join('\n'))
  for (const name of ['TaskFlowApp.exe', 'resources/taskflow.ico', 'LICENSE.electron.txt']) writeFileSync(path.join(root, name), 'fictitious bytes')
  for (const name of ['LICENSE', 'package.json', 'out/main/index.js', 'out/preload/index.cjs', 'out/preload/quick-add.cjs', 'out/renderer/index.html']) writeFileSync(path.join(source, name), 'fictitious content')
  await asar.createPackage(source, path.join(root, 'resources/app.asar'))
  return { project, root, source }
}
describe('inventário integral — W08/W13 local', () => {
  it('registra bytes externos e internos e distingue recurso gerado instalado', async () => {
    const { project, root } = await fixture()
    const inventory = inventoryPayload(root, project)
    expect(inventory.files).toHaveLength(8)
    expect(inventory.asar).toHaveLength(6)
    writeFileSync(path.join(root, 'Uninstall TaskFlowApp.exe'), 'fictitious uninstaller')
    writeFileSync(path.join(root, 'uninstallerIcon.ico'), 'fictitious icon')
    const generated = [
      { name: 'Uninstall TaskFlowApp.exe', size: Buffer.byteLength('fictitious uninstaller'), sha256: hash('fictitious uninstaller'), origin: 'fixture candidate' },
      { name: 'uninstallerIcon.ico', size: 15, sha256: hash('fictitious icon'), origin: 'fixture master icon' },
    ]
    expect(compareInstalledPayload(root, inventory, generated).map(file => file.name)).toEqual(['Uninstall TaskFlowApp.exe', 'uninstallerIcon.ico'])
    expect(() => compareInstalledPayload(root, inventory, [])).toThrow('PROVENANCE_MISSING')
    for (const resource of generated) {
      const file = path.join(root, resource.name)
      const original = readFileSync(file)
      writeFileSync(file, Buffer.alloc(original.length, 1))
      expect(() => compareInstalledPayload(root, inventory, generated)).toThrow('GENERATED_BYTES_MISMATCH')
      rmSync(file)
      expect(() => compareInstalledPayload(root, inventory, generated)).toThrow('REQUIRED_MISSING')
      writeFileSync(file, original)
    }
    writeFileSync(path.join(root, 'resources/taskflow.ico'), 'tampered')
    expect(() => compareInstalledPayload(root, inventory, generated)).toThrow('MISMATCH')
  })
  it.each(['.env', 'private-helper.exe', 'resources/fixture.json', 'resources/runtime.js.map', 'app-update.yml'])('recusa entrada externa %s', async name => {
    const { project, root } = await fixture()
    writeFileSync(path.join(root, name), 'fictitious')
    expect(() => inventoryPayload(root, project)).toThrow()
  })
  it('recusa fixture/mapa sob out e sentinela sob nome permitido, sem imprimir bytes', async () => {
    const { project, root, source } = await fixture()
    writeFileSync(path.join(source, 'out/main/internals.js.map'), '{}')
    await asar.createPackage(source, path.join(root, 'resources/app.asar'))
    expect(() => inventoryPayload(root, project)).toThrow('ASAR_UNEXPECTED_ENTRY')
    rmSync(path.join(source, 'out/main/internals.js.map'))
    writeFileSync(path.join(source, 'out/main/index.js'), 'TFA011_FORBIDDEN_TEST_SENTINEL')
    await asar.createPackage(source, path.join(root, 'resources/app.asar'))
    expect(() => inventoryPayload(root, project)).toThrow(/FORBIDDEN_CONTENT/)
    expect(inspectContent(Buffer.from('ordinary application code'))).toBe(false)
  })
  it('recusa notice ausente/divergente e componente adulterado', async () => {
    const { project, root } = await fixture()
    const notice = path.join(root, 'resources/THIRD-PARTY-NOTICES.txt')
    const original = readFileSync(notice)
    writeFileSync(notice, 'incomplete')
    expect(() => inventoryPayload(root, project)).toThrow('NOTICES_MISSING_OR_MISMATCH')
    writeFileSync(notice, original)
    writeFileSync(path.join(root, 'resources/runtime-components.json'), '[]')
    expect(() => inventoryPayload(root, project)).toThrow('NOTICES_COMPONENT_MISMATCH')
  })
  it.each(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AWS_SECRET_ACCESS_KEY'])('recusa configuração fictícia %s sob nome JS permitido', async variable => {
    const { project, root, source } = await fixture()
    writeFileSync(path.join(source, 'out/main/index.js'), `// fixture exclusiva\n${variable}=TFA011_FICTITIOUS_NOT_A_CREDENTIAL`)
    await asar.createPackage(source, path.join(root, 'resources/app.asar'))
    // O scanner pode recusar primeiro o ASAR externo ou a entrada interna.
    expect(() => inventoryPayload(root, project)).toThrow(/FORBIDDEN_CONTENT/)
  })
  it('recusa notice NSIS ausente ou divergente dos textos revisados', async () => {
    const { project, root } = await fixture()
    const notice = path.join(root, 'resources/NSIS-THIRD-PARTY-NOTICES.txt')
    writeFileSync(notice, 'incomplete fictitious notice')
    expect(() => inventoryPayload(root, project)).toThrow('NSIS_NOTICES_MISMATCH')
    rmSync(notice)
    expect(() => inventoryPayload(root, project)).toThrow('PAYLOAD_REQUIRED_MISSING')
  })
  it('recusa recurso ausente e reparse sem seguir arquivo externo', async () => {
    const { project, root } = await fixture()
    const icon = path.join(root, 'resources/taskflow.ico')
    rmSync(icon)
    expect(() => inventoryPayload(root, project)).toThrow('PAYLOAD_REQUIRED_MISSING')
    symlinkSync(path.join(project, 'source'), path.join(root, 'escaped'), 'junction')
    expect(() => inventoryPayload(root, project)).toThrow('Reparse')
  })
})
