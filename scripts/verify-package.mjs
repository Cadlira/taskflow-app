// verify:package — inspeção do artefato empacotado (TFA-002).
//
// Verifica identidade, inventário permitido do ASAR, ausência de addon externo,
// updater, elevate helper, segredos e dependências de build, além dos manifests
// asInvoker/uiAccess=false do executável e do Setup e da arquitetura x64.
// ASAR não é tratado como criptografia: os arquivos internos são listados e
// confrontados com a allowlist.
//
// Uso: node scripts/verify-package.mjs [--installed-root <pasta>]
//      O modo --installed-root também confere o desinstalador instalado.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseRoot = path.join(projectRoot, 'release')
const unpackedRoot = path.join(releaseRoot, 'win-unpacked')
const resourcesRoot = path.join(unpackedRoot, 'resources')

const UA_MACHINE_AMD64 = 0x8664
const IMAGE_RESOURCE_TYPE_MANIFEST = 24

export const PACKAGE_ALLOWLIST = [
  /^\/LICENSE$/,
  /^\/package\.json$/,
  /^\/out(\/.*)?$/,
]

export const REQUIRED_ASAR_FILES = [
  '/out/main/index.js',
  '/out/preload/index.cjs',
  '/out/renderer/index.html',
  '/package.json',
  '/LICENSE',
]

export const FORBIDDEN_ASAR_RULES = [
  { label: 'node_modules', match: (file) => file === '/node_modules' || file.startsWith('/node_modules/') },
  { label: 'addon nativo', match: (file) => file.endsWith('.node') || file.includes('better-sqlite3') },
  { label: 'git', match: (file) => file === '/.git' || file.startsWith('/.git/') },
  { label: 'env/credenciais', match: (file) => /(^|\/)\.env(\.|$)|credential|secret/i.test(file) },
  { label: 'wxt/scaffold Chrome', match: (file) => /(^|\/)(wxt|chrome)(\/|\.|$)/i.test(file) },
  { label: 'updater/update', match: (file) => /updater|app-update\.yml/i.test(file) },
  { label: 'elevate helper', match: (file) => /elevate/i.test(file) },
  { label: 'testes/coverage', match: (file) => /(^|\/)(tests?|coverage)(\/|$)/i.test(file) },
  { label: 'devtools', match: (file) => /devtools/i.test(file) },
]

export function findAllowedViolations(files, allowlist = PACKAGE_ALLOWLIST) {
  return files.filter((file) => !allowlist.some((pattern) => pattern.test(file)))
}

export function findForbiddenFiles(files, rules = FORBIDDEN_ASAR_RULES) {
  return files.flatMap((file) => rules.filter((rule) => rule.match(file)).map((rule) => `${file} → ${rule.label}`))
}

export function findMissingFiles(files, required = REQUIRED_ASAR_FILES) {
  return required.filter((file) => !files.includes(file))
}

function readUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset)
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset)
}

export function readPeMachine(buffer) {
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) return null
  const peOffset = readUInt32(buffer, 0x3c)
  if (peOffset + 6 > buffer.length || readUInt32(buffer, peOffset) !== 0x00004550) return null
  return readUInt16(buffer, peOffset + 4)
}

function rvaToFileOffset(buffer, peOffset, sizeOfOptionalHeader, rva) {
  const sectionTable = peOffset + 24 + sizeOfOptionalHeader
  const numberOfSections = readUInt16(buffer, peOffset + 6)
  for (let index = 0; index < numberOfSections; index += 1) {
    const section = sectionTable + index * 40
    const virtualSize = readUInt32(buffer, section + 8)
    const virtualAddress = readUInt32(buffer, section + 12)
    const sizeOfRawData = readUInt32(buffer, section + 16)
    const pointerToRawData = readUInt32(buffer, section + 20)
    const mappedSize = Math.max(virtualSize, sizeOfRawData)
    if (rva >= virtualAddress && rva < virtualAddress + mappedSize) {
      return pointerToRawData + (rva - virtualAddress)
    }
  }
  return null
}

export function readPeManifest(buffer) {
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) return null
  const peOffset = readUInt32(buffer, 0x3c)
  if (peOffset + 24 > buffer.length || readUInt32(buffer, peOffset) !== 0x00004550) return null
  const sizeOfOptionalHeader = readUInt16(buffer, peOffset + 20)
  const optionalHeader = peOffset + 24
  const magic = readUInt16(buffer, optionalHeader)
  const dataDirectoryOffset = optionalHeader + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : -1)
  if (dataDirectoryOffset < 0 || dataDirectoryOffset + 16 > buffer.length) return null
  const resourceRva = readUInt32(buffer, dataDirectoryOffset + 2 * 8)
  if (resourceRva === 0) return null
  const resourceBase = rvaToFileOffset(buffer, peOffset, sizeOfOptionalHeader, resourceRva)
  if (resourceBase === null || resourceBase + 16 > buffer.length) return null

  const numberOfNamedEntries = readUInt16(buffer, resourceBase + 12)
  const numberOfIdEntries = readUInt16(buffer, resourceBase + 14)
  const totalEntries = numberOfNamedEntries + numberOfIdEntries

  function findManifestDataEntry(directoryOffset) {
    for (let index = 0; index < totalEntries; index += 1) {
      const entry = directoryOffset + 16 + index * 8
      if (entry + 8 > buffer.length) return null
      const nameOrId = readUInt32(buffer, entry)
      const offsetToData = readUInt32(buffer, entry + 4)
      if (directoryOffset === resourceBase && nameOrId !== IMAGE_RESOURCE_TYPE_MANIFEST) continue
      if (offsetToData & 0x80000000) {
        const subdirectory = resourceBase + (offsetToData & 0x7fffffff)
        const found = findManifestDataEntry(subdirectory)
        if (found !== null) return found
      } else if (directoryOffset !== resourceBase) {
        return resourceBase + offsetToData
      }
    }
    return null
  }

  const dataEntry = findManifestDataEntry(resourceBase)
  if (dataEntry === null || dataEntry + 16 > buffer.length) return null
  const manifestRva = readUInt32(buffer, dataEntry)
  const manifestSize = readUInt32(buffer, dataEntry + 4)
  const manifestOffset = rvaToFileOffset(buffer, peOffset, sizeOfOptionalHeader, manifestRva)
  if (manifestOffset === null || manifestOffset + manifestSize > buffer.length) return null
  return buffer.subarray(manifestOffset, manifestOffset + manifestSize).toString('utf8')
}

export function checkManifest(manifest, expectedLevel) {
  const problems = []
  if (manifest === null || manifest === undefined) {
    return ['manifest ausente']
  }
  if (!manifest.includes(`requestedExecutionLevel level="${expectedLevel}"`)) {
    problems.push(`requestedExecutionLevel != ${expectedLevel}`)
  }
  if (!/uiAccess="false"/.test(manifest)) {
    problems.push('uiAccess ausente ou diferente de false')
  }
  return problems
}

export function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function fail(problems) {
  for (const problem of problems) process.stderr.write(`FALHA: ${problem}\n`)
  process.exitCode = 1
}

function main() {
  const problems = []
  const arguments_ = process.argv.slice(2)
  const installedRootIndex = arguments_.indexOf('--installed-root')
  const installedRoot = installedRootIndex >= 0 ? arguments_[installedRootIndex + 1] : null
  if (installedRootIndex >= 0 && !installedRoot) {
    fail(['--installed-root exige uma pasta'])
    return
  }

  const appExe = path.join(unpackedRoot, 'TaskFlowApp.exe')
  const asarFile = path.join(resourcesRoot, 'app.asar')
  if (!existsSync(appExe)) problems.push(`executável ausente: ${appExe}`)
  if (!existsSync(asarFile)) problems.push(`app.asar ausente: ${asarFile}`)
  if (problems.length > 0) {
    fail(problems)
    return
  }

  const unpackedVersion = JSON.parse(asar.extractFile(asarFile, 'package.json').toString('utf8')).version
  const setupFile = path.join(releaseRoot, `TaskFlowApp-${unpackedVersion}-win-x64-Setup.exe`)
  if (!existsSync(setupFile)) problems.push(`Setup ausente para a versão ${unpackedVersion}: ${path.basename(setupFile)}`)

  const resourcesEntries = readdirSync(resourcesRoot)
  for (const entry of resourcesEntries) {
    if (entry !== 'app.asar' && entry !== 'taskflow.ico') problems.push(`recurso inesperado em resources: ${entry}`)
  }
  const runtimeIcon = path.join(resourcesRoot, 'taskflow.ico')
  const sourceIcon = path.join(projectRoot, 'build', 'icons', 'taskflow.ico')
  if (!existsSync(runtimeIcon) || !existsSync(sourceIcon)) problems.push('ícone runtime TaskFlow ausente')
  else if (sha256(runtimeIcon) !== sha256(sourceIcon)) problems.push('ícone runtime diverge do recurso aprovado')

  const asarFiles = asar.listPackage(asarFile).map((file) => file.replace(/\\/g, '/'))
  problems.push(...findMissingFiles(asarFiles).map((file) => `arquivo obrigatório ausente no ASAR: ${file}`))
  problems.push(...findAllowedViolations(asarFiles).map((file) => `arquivo fora da allowlist do ASAR: ${file}`))
  problems.push(...findForbiddenFiles(asarFiles))

  const packagedMetadata = JSON.parse(asar.extractFile(asarFile, 'package.json').toString('utf8'))
  const projectMetadata = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  if (packagedMetadata.name !== projectMetadata.name) problems.push(`package name inesperado: ${packagedMetadata.name}`)
  if (packagedMetadata.version !== projectMetadata.version) problems.push(`versão inesperada: ${packagedMetadata.version}`)
  if (packagedMetadata.main !== 'out/main/index.js') problems.push(`main inesperado: ${packagedMetadata.main}`)
  if (JSON.stringify(packagedMetadata.dependencies ?? {}) !== '{}') problems.push('dependências runtime inesperadas no pacote')

  const unpackedFiles = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else unpackedFiles.push(full)
    }
  }
  walk(unpackedRoot)
  for (const file of unpackedFiles) {
    const relative = path.relative(unpackedRoot, file)
    if (/\.node$/i.test(file)) problems.push(`addon nativo no pacote: ${relative}`)
    if (/better-sqlite3/i.test(file)) problems.push(`better-sqlite3 no pacote: ${relative}`)
    if (/elevate/i.test(path.basename(file))) problems.push(`elevate helper no pacote: ${relative}`)
  }
  if (!existsSync(path.join(unpackedRoot, 'TaskFlowApp.exe'))) problems.push('TaskFlowApp.exe ausente')
  for (const required of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
    if (!existsSync(path.join(unpackedRoot, required))) problems.push(`notice de runtime ausente: ${required}`)
  }

  const appMachine = readPeMachine(readFileSync(appExe))
  const setupMachine = readPeMachine(readFileSync(setupFile))
  if (appMachine !== UA_MACHINE_AMD64) problems.push(`arquitetura do executável diferente de x64: ${appMachine}`)
  // O stub NSIS do Setup/desinstalador é x86 (0x14C) com payload x64; qualquer outra
  // máquina indica combinação inesperada.
  if (![0x14c, UA_MACHINE_AMD64].includes(setupMachine)) {
    problems.push(`máquina do Setup inesperada: ${setupMachine}`)
  }
  if (setupMachine === 0x14c) {
    process.stdout.write('Setup: stub NSIS x86 com payload x64 (esperado)\n')
  }

  problems.push(...checkManifest(readPeManifest(readFileSync(appExe)), 'asInvoker').map((problem) => `app: ${problem}`))
  problems.push(...checkManifest(readPeManifest(readFileSync(setupFile)), 'asInvoker').map((problem) => `Setup: ${problem}`))

  if (installedRoot) {
    const uninstaller = path.join(installedRoot, 'Uninstall TaskFlowApp.exe')
    if (!existsSync(uninstaller)) {
      problems.push(`desinstalador ausente em ${installedRoot}`)
    } else {
      const machine = readPeMachine(readFileSync(uninstaller))
      if (![0x14c, UA_MACHINE_AMD64].includes(machine)) {
        problems.push(`máquina do desinstalador inesperada: ${machine}`)
      }
      problems.push(
        ...checkManifest(readPeManifest(readFileSync(uninstaller)), 'asInvoker').map((problem) => `uninstaller: ${problem}`),
      )
    }
  }

  if (problems.length > 0) {
    fail(problems)
    return
  }

  process.stdout.write(`ASAR: ${asarFiles.length} arquivos dentro da allowlist; sem addon/updater/segredos\n`)
  process.stdout.write(`Executável: TaskFlowApp.exe x64 asInvoker/uiAccess=false\n`)
  process.stdout.write(`Setup: ${path.basename(setupFile)} x64 asInvoker/uiAccess=false\n`)
  if (installedRoot) process.stdout.write('Desinstalador instalado: x64 asInvoker/uiAccess=false\n')
  process.stdout.write(`SHA-256 TaskFlowApp.exe: ${sha256(appExe)}\n`)
  process.stdout.write(`SHA-256 app.asar: ${sha256(asarFile)}\n`)
  process.stdout.write(`SHA-256 Setup: ${sha256(setupFile)}\n`)
  process.stdout.write('verify:package OK\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
