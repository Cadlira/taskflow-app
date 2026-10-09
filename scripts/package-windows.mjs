import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildIdentity, createBuildStage, digest, sealBuildStage } from './build-artifacts.mjs'
import { inventoryPayload } from './payload-inventory.mjs'
import { createManifest, sourceState } from './build-manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
// O builder fixado escolhe 7z para pacotes diferenciais mesmo com useZip.
// O extractor do script usa ZIP; reprovar a divergência antes de criar o stage.
if (metadata.build.nsis.useZip !== true || metadata.build.nsis.differentialPackage !== false) {
  throw new Error('NSIS requer ZIP sem pacote diferencial para alinhar payload e extractor')
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const arguments_ = process.argv.slice(2)
if (arguments_.length !== 0 && (arguments_.length !== 2 || arguments_[0] !== '--run')) throw new Error('Use --run <id>')
const run = arguments_[1] ?? `local-${Date.now()}`
const identity = buildIdentity(metadata.version, commit, run)
const stage = createBuildStage(root, identity)
execFileSync(process.execPath, [path.join(root, 'scripts/prepare-nsis.mjs')], { cwd: root, stdio: 'inherit' })
const before = sourceState(root)
writeFileSync(path.join(stage, 'source-before.json'), `${JSON.stringify({ identity, source: before }, null, 2)}\n`, { flag: 'wx' })
execFileSync(process.execPath, [
  '--import', pathToFileURL(path.join(root, 'scripts/capture-nsis.mjs')).href,
  path.join(root, 'node_modules/electron-builder/out/cli/cli.js'), '--win', 'nsis', '--x64', '--publish', 'never',
  `-c.directories.output=${stage}`, `-c.nsis.artifactName=${identity.setup}`,
], { cwd: root, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } })
// Reader fixado extrai o bloco NSIS, sem executar Setup nem instalar nada.
const require = createRequire(import.meta.url)
const { UninstallerReader } = require('app-builder-lib/out/targets/nsis/nsisUtil.js')
const uninstaller = path.join(stage, 'candidate-uninstaller.exe')
await UninstallerReader.exec(path.join(stage, identity.setup), uninstaller)
writeFileSync(path.join(stage, 'uninstaller-sha256.json'), `${JSON.stringify({ version: metadata.version, sha256: digest(uninstaller) }, null, 2)}\n`)
const inventory = inventoryPayload(path.join(stage, 'win-unpacked'), root)
writeFileSync(path.join(stage, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`)
createManifest(root, stage, identity, inventory, before)
const selected = sealBuildStage(root, identity.id)
process.stdout.write(`Build-id: ${identity.id}\nUse --stage ${identity.id} em verify:package e smoke:packaged.\n`)
// Esse recibo de seleção não é o manifesto completo de proveniência/readiness.
if (selected.files.length !== 11) throw new Error('Seleção incompleta')
