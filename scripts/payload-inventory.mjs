import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { containedPath } from './build-artifacts.mjs'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
const byteHash = data => createHash('sha256').update(data).digest('hex')
const forbiddenName = /(^|\/)(\.git|\.env(?:\.[^/]*)?|tests?|fixtures?|coverage|node_modules|profiles|user-data|session-data)(\/|$)|\.map$|\.node$|updater|elevate|app-update\.yml/i
const appFiles = [/^LICENSE$/, /^package\.json$/, /^out\/main\/index\.js$/, /^out\/preload\/(?:index|quick-add)\.cjs$/, /^out\/renderer\/index\.html$/, /^out\/renderer\/assets\/index-[\w-]+\.(?:js|css)$/]
const fixtureSentinel = Buffer.from('TFA011_FORBIDDEN_TEST_SENTINEL')
function architecture(data) {
  if (data.length < 64 || data.readUInt16LE(0) !== 0x5a4d) return 'architecture-independent'
  const offset = data.readUInt32LE(60)
  if (offset + 6 > data.length || data.readUInt32LE(offset) !== 0x4550) throw new Error('PAYLOAD_INVALID_PE')
  const machine = data.readUInt16LE(offset + 4)
  if (machine !== 0x8664 && machine !== 0x14c) throw new Error('PAYLOAD_UNEXPECTED_ARCHITECTURE')
  return machine === 0x8664 ? 'x64' : 'x86'
}
export function inspectContent(data) {
  // Defesa adicional com motivo finito; não imprime conteúdo nem certifica ausência
  // universal de segredos. A proveniência/revisão de entradas continua obrigatória.
  return data.includes(fixtureSentinel) || /(?:^|\n)\s*(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY)\s*=/.test(data.toString('utf8'))
}
function walk(root, callback, directory = root) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = path.relative(root, path.join(directory, entry.name)).replace(/\\/g, '/')
    const file = containedPath(root, name)
    const stat = lstatSync(file)
    if (stat.isSymbolicLink()) throw new Error('PAYLOAD_REPARSE')
    if (stat.isDirectory()) walk(root, callback, file)
    else if (stat.isFile()) callback(name, readFileSync(file))
    else throw new Error('PAYLOAD_NON_REGULAR')
  }
}
export function inventoryPayload(root, projectRoot) {
  const runtimeRoot = path.join(projectRoot, 'node_modules/electron/dist')
  const runtimeFiles = new Set()
  walk(runtimeRoot, name => runtimeFiles.add(name))
  const files = []
  walk(root, (name, data) => {
    if (forbiddenName.test(name)) throw new Error('PAYLOAD_FORBIDDEN_NAME')
    let classification
    let origin
    if (name === 'TaskFlowApp.exe') { classification = 'application-executable'; origin = 'Electron + product metadata' }
    else if (name === 'resources/app.asar') { classification = 'application-archive'; origin = 'out + package metadata + LICENSE' }
    else if (name === 'resources/taskflow.ico') { classification = 'identity'; origin = 'assets/taskflow-icon.svg' }
    else if (['resources/THIRD-PARTY-NOTICES.txt', 'resources/runtime-components.json'].includes(name)) { classification = 'notice'; origin = 'incorporated renderer modules' }
    else if (name === 'resources/NSIS-THIRD-PARTY-NOTICES.txt') { classification = 'notice'; origin = 'build/nsis/THIRD-PARTY-NOTICES.txt (reviewed installer texts, official plugin provenance and documented upstream limitations)' }
    else if (name === 'LICENSE.electron.txt') { classification = 'notice'; origin = 'Electron LICENSE' }
    else if (runtimeFiles.has(name) && name !== 'electron.exe' && !name.startsWith('resources/')) {
      classification = name === 'LICENSES.chromium.html' ? 'notice' : 'runtime-electron'; origin = 'electron/dist'
      if (byteHash(data) !== byteHash(readFileSync(path.join(runtimeRoot, name)))) throw new Error('RUNTIME_BYTES_MISMATCH')
    }
    else throw new Error('PAYLOAD_UNEXPECTED_ENTRY')
    if (inspectContent(data)) throw new Error('PAYLOAD_FORBIDDEN_CONTENT')
    files.push({ name, classification, origin, architecture: architecture(data), size: data.length, sha256: byteHash(data) })
  })
  const required = ['TaskFlowApp.exe', 'resources/app.asar', 'resources/taskflow.ico', 'resources/THIRD-PARTY-NOTICES.txt', 'resources/runtime-components.json', 'resources/NSIS-THIRD-PARTY-NOTICES.txt', 'LICENSE.electron.txt', 'LICENSES.chromium.html']
  for (const name of required) if (!files.some(file => file.name === name)) throw new Error('PAYLOAD_REQUIRED_MISSING')
  for (const name of runtimeFiles) {
    if (['electron.exe', 'LICENSE', 'version'].includes(name) || name.startsWith('resources/')) continue
    if (!files.some(file => file.name === name)) throw new Error('RUNTIME_REQUIRED_MISSING')
  }
  const archive = path.join(root, 'resources/app.asar')
  if (!readFileSync(path.join(root, 'resources/NSIS-THIRD-PARTY-NOTICES.txt')).equals(readFileSync(path.join(projectRoot, 'build/nsis/THIRD-PARTY-NOTICES.txt')))) throw new Error('NSIS_NOTICES_MISMATCH')
  const internal = []
  for (const raw of asar.listPackage(archive).sort()) {
    const name = raw.replace(/\\/g, '/').replace(/^\//, '')
    const nativeName = name.split('/').join(path.sep)
    const stat = asar.statFile(archive, nativeName, false)
    if ('files' in stat) continue
    if (stat.link || stat.unpacked || forbiddenName.test(name) || !appFiles.some(rule => rule.test(name))) throw new Error('ASAR_UNEXPECTED_ENTRY')
    const data = asar.extractFile(archive, nativeName, false)
    if (inspectContent(data)) throw new Error('ASAR_FORBIDDEN_CONTENT')
    internal.push({ name, classification: name === 'out/main/index.js' ? 'application-with-test-only-diagnostics' : 'application', origin: 'reviewed build output', architecture: 'architecture-independent', size: data.length, sha256: byteHash(data) })
  }
  const components = JSON.parse(readFileSync(path.join(root, 'resources/runtime-components.json'), 'utf8'))
  const expected = JSON.parse(readFileSync(path.join(projectRoot, 'build/runtime-components.json'), 'utf8'))
  if (JSON.stringify(components) !== JSON.stringify(expected)) throw new Error('NOTICES_COMPONENT_MISMATCH')
  const notices = readFileSync(path.join(root, 'resources/THIRD-PARTY-NOTICES.txt'), 'utf8')
  for (const component of components) {
    const license = readFileSync(path.join(projectRoot, component.origin, 'LICENSE'), 'utf8')
    if (byteHash(Buffer.from(license)) !== component.licenseSha256 || !notices.includes(`${component.name} ${component.version}\n`) || !notices.includes(license)) throw new Error('NOTICES_MISSING_OR_MISMATCH')
  }
  for (const component of ['vue', 'pinia']) if (!components.some(value => value.name === component)) throw new Error('NOTICES_REQUIRED_COMPONENT_MISSING')
  return { schema: 1, files, asar: internal, components, limits: ['Names/content checks supplement source review; no universal secret certification', 'Installed/generated resources require a separate comparison'] }
}
export function compareInstalledPayload(installedRoot, inventory, expectedGenerated) {
  // O relatório devolve somente nomes técnicos/motivos; não enumera o perfil.
  const expected = new Map(inventory.files.map(file => [file.name, file]))
  const requiredGenerated = ['Uninstall TaskFlowApp.exe', 'uninstallerIcon.ico']
  if (!Array.isArray(expectedGenerated) || expectedGenerated.length !== requiredGenerated.length ||
      !requiredGenerated.every(name => expectedGenerated.filter(file => file.name === name).length === 1)) {
    throw new Error('INSTALLED_GENERATED_PROVENANCE_MISSING')
  }
  const generated = new Map(expectedGenerated.map(file => [file.name, file]))
  const found = new Set()
  const generatedFiles = []
  walk(installedRoot, (name, data) => {
    const before = expected.get(name)
    if (before) {
      if (before.size !== data.length || before.sha256 !== byteHash(data)) throw new Error('INSTALLED_BYTES_MISMATCH')
      found.add(name)
    } else if (generated.has(name)) {
      const source = generated.get(name)
      if (source.size !== data.length || source.sha256 !== byteHash(data)) throw new Error('INSTALLED_GENERATED_BYTES_MISMATCH')
      generatedFiles.push({ name, size: data.length, sha256: byteHash(data), architecture: architecture(data), classification: 'generated-by-setup', origin: source.origin })
    }
    else throw new Error('INSTALLED_UNEXPECTED_ENTRY')
  })
  if (found.size !== expected.size || generatedFiles.length !== requiredGenerated.length) throw new Error('INSTALLED_REQUIRED_MISSING')
  return generatedFiles
}
