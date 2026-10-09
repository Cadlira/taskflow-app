// R1: ausência de atribuição empresarial aprovada. Sem author, o builder
// preserva CompanyName do Electron; limpar antes de sua edição final e do NSIS.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { NtExecutable, NtExecutableResource, Resource } from 'resedit'

/** @param {Buffer} bytes */
export function readCompanyNames(bytes) {
  const executable = NtExecutable.from(bytes)
  const resources = NtExecutableResource.from(executable)
  return Resource.VersionInfo.fromEntries(resources.entries).flatMap(version =>
    version.getAllLanguagesForStringValues().map(language => version.getStringValues(language).CompanyName ?? ''))
}

/** @param {Buffer} bytes */
export function clearCompanyNames(bytes) {
  const executable = NtExecutable.from(bytes)
  const resources = NtExecutableResource.from(executable)
  const versions = Resource.VersionInfo.fromEntries(resources.entries)
  if (!versions.length) throw new Error('WINDOWS_VERSION_RESOURCE_MISSING')
  for (const version of versions) {
    for (const language of version.getAllLanguagesForStringValues()) version.setStringValues(language, { CompanyName: '' })
    version.outputToResourceEntries(resources.entries)
  }
  resources.outputResource(executable)
  const output = Buffer.from(executable.generate())
  if (readCompanyNames(output).some(value => value !== '')) throw new Error('WINDOWS_COMPANY_NOT_CLEARED')
  return output
}

/** @param {{electronPlatformName: string, appOutDir: string, packager: {appInfo: {productFilename: string}}}} context */
export default function afterPack(context) {
  if (context.electronPlatformName !== 'win32') throw new Error('WINDOWS_METADATA_PLATFORM')
  const executable = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  writeFileSync(executable, clearCompanyNames(readFileSync(executable)))
}
