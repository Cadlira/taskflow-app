import path from 'node:path'
import { lstat, realpath } from 'node:fs/promises'
import type { FoundationProfile } from '../profile.js'

export const NATIVE_IDENTITIES = {
  prod: { aumid: 'taskflow.app', name: 'TaskFlow App', clsid: '{8B9BA547-6778-4F8E-873F-C3171C4EE08D}' },
  dev: { aumid: 'taskflow.app.dev', name: 'TaskFlow App Dev', clsid: '{8B9BA547-6778-4F8E-873F-C3171C4EE08E}' },
  test: { aumid: 'taskflow.app.test', name: 'TaskFlow App Test', clsid: '{8B9BA547-6778-4F8E-873F-C3171C4EE08F}' },
} as const
export const STARTUP_NAME = 'taskflow.app.startup.v1'
export const LOGIN_ARGUMENT = '--taskflow-login'
export interface NativeMetadata { aumid: string; clsid: string; executable: string; shortcut: string }
export interface NativeRegistrySnapshot {
  metadata: NativeMetadata | null
  future: boolean
  run: string | null
  foreignStartup: boolean
  localServer: string | null
}
export interface NativeRegistry {
  read(): Promise<NativeRegistrySnapshot | undefined>
  removeStartupApproval(): Promise<boolean>
}
export interface IdentityPorts {
  profile: FoundationProfile
  packaged: boolean
  executable: string
  localAppData: string
  appData: string
  registry: NativeRegistry
  readonlyOnly?: boolean
  safePath?(file: string): Promise<boolean>
  shortcut(file: string): { target: string; args?: string; cwd?: string; appUserModelId?: string; toastActivatorClsid?: string }
  updateShortcut(file: string, clsid: string, cwd: string): boolean
}
export function sameWindowsPath(left: string, right: string): boolean { return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase() }
export function ownStartupCommand(executable: string): string { return `"${executable}" ${LOGIN_ARGUMENT}` }
export async function safeNativePath(file: string): Promise<boolean> {
  if (!path.win32.isAbsolute(file) || file.startsWith('\\\\') || file.includes('\0')) return false
  try {
    let cursor = path.win32.resolve(file)
    for (;;) {
      if ((await lstat(cursor)).isSymbolicLink()) return false
      const parent = path.win32.dirname(cursor)
      if (parent === cursor) break
      cursor = parent
    }
    return sameWindowsPath(await realpath(file), file)
  } catch { return false }
}
/** Deve terminar ANTES de qualquer presenter; target/CLSID alheios nunca são corrigidos. */
export async function prepareNativeIdentity(ports: IdentityPorts): Promise<boolean> {
  if (ports.profile !== 'prod' || !ports.packaged || process.platform !== 'win32') return false
  try {
    const metadata = await ports.registry.read()
    if (metadata === undefined || metadata.future || metadata.metadata === null) return false
    const identity = NATIVE_IDENTITIES.prod
    const own = metadata.metadata
    const executable = path.win32.join(ports.localAppData, 'Programs', 'TaskFlowApp', 'TaskFlowApp.exe')
    const shortcut = path.win32.join(ports.appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${identity.name}.lnk`)
    if (own.aumid !== identity.aumid || own.clsid.toUpperCase() !== identity.clsid ||
        !sameWindowsPath(ports.executable, executable) || !sameWindowsPath(own.executable, executable) || !sameWindowsPath(own.shortcut, shortcut)) return false
    if (metadata.localServer !== null && !sameWindowsPath(metadata.localServer, executable)) return false
    const safe = ports.safePath ?? safeNativePath
    if (!await safe(executable) || !await safe(shortcut)) return false
    const before = ports.shortcut(shortcut)
    // Electron real devolve `toastActivatorClsid` como string vazia quando a propriedade não
    // foi preenchida; vazio é preenchível, CLSID estrangeiro não vazio é recusado.
    const beforeClsid = (before.toastActivatorClsid ?? '').toUpperCase()
    if (!sameWindowsPath(before.target, executable) || before.appUserModelId !== identity.aumid || (before.args ?? '') !== '' ||
        (beforeClsid !== '' && beforeClsid !== identity.clsid)) return false
    if (!ports.readonlyOnly && !ports.updateShortcut(shortcut, identity.clsid, path.win32.dirname(executable))) return false
    const after = ports.shortcut(shortcut)
    return sameWindowsPath(after.target, executable) && after.appUserModelId === identity.aumid &&
      after.toastActivatorClsid?.toUpperCase() === identity.clsid && sameWindowsPath(after.cwd ?? '', path.win32.dirname(executable))
  } catch { return false }
}
