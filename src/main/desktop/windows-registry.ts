import { spawn } from 'node:child_process'
import path from 'node:path'
import { asExactRecord } from '../../contracts/record.js'
import { NATIVE_IDENTITIES, STARTUP_NAME, type NativeRegistry, type NativeRegistrySnapshot } from './native-identity.js'

const prefix = String.raw`$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$root=[Microsoft.Win32.Registry]::CurrentUser
function ReadText($key,$name) { if($null -eq $key){return $null}; $v=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); if($null -eq $v){return $null}; if($v -isnot [string]){throw 'invalid'}; return $v }
`
/** Scripts fixos, sem opções/path de cliente, sem reg.exe/codepage ou bypass de política. */
export const REGISTRY_SCRIPTS = {
  read: prefix + String.raw`
$family=$root.OpenSubKey('Software\TaskFlow App\NativeIdentity')
$future=$false
if($null -ne $family){foreach($name in $family.GetSubKeyNames()){if($name -ne 'v1'){$future=$true}};$family.Close()}
$meta=$root.OpenSubKey('Software\TaskFlow App\NativeIdentity\v1')
$metadata=$null
if($null -ne $meta){$metadata=@{aumid=(ReadText $meta 'AUMID');clsid=(ReadText $meta 'CLSID');executable=(ReadText $meta 'InstalledExecutable');shortcut=(ReadText $meta 'StartMenuLink')};$meta.Close()}
$runKey=$root.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run')
$run=ReadText $runKey '` + STARTUP_NAME + String.raw`'
$foreign=$false
if($null -ne $runKey){foreach($name in $runKey.GetValueNames()){if($name.StartsWith('taskflow.app.startup.') -and $name -ne '` + STARTUP_NAME + String.raw`'){$foreign=$true}};$runKey.Close()}
$serverKey=$root.OpenSubKey('Software\Classes\CLSID` + '\\' + NATIVE_IDENTITIES.prod.clsid + String.raw`\LocalServer32')
$server=ReadText $serverKey ''
if($null -ne $serverKey){$serverKey.Close()}
@{metadata=$metadata;future=$future;run=$run;foreignStartup=$foreign;localServer=$server} | ConvertTo-Json -Compress -Depth 3
`,
  removeApproval: prefix + String.raw`
$runKey=$root.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run')
if($null -ne (ReadText $runKey '` + STARTUP_NAME + String.raw`')){throw 'ownership'}
if($null -ne $runKey){$runKey.Close()}
$key=$root.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',$true)
if($null -ne $key){$key.DeleteValue('` + STARTUP_NAME + String.raw`',$false);$key.Close()}
'{"removed":true}'
`,
} as const
export type RegistryOperation = keyof typeof REGISTRY_SCRIPTS
export async function executeRegistryOperation(operation: RegistryOperation, systemRoot: string): Promise<unknown> {
  if (process.platform !== 'win32' || !path.win32.isAbsolute(systemRoot) || systemRoot.startsWith('\\\\')) return undefined
  const executable = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return new Promise(resolve => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(REGISTRY_SCRIPTS[operation], 'utf16le').toString('base64')], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let settled = false
    let bytes = 0
    const chunks: Buffer[] = []
    const finish = (value: unknown): void => { if (settled) return; settled = true; clearTimeout(timer); resolve(value) }
    const timer = setTimeout(() => { child.kill(); finish(undefined) }, 5000)
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > 8192) { child.kill(); finish(undefined) } else chunks.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 8192) { child.kill(); finish(undefined) } })
    child.once('error', () => finish(undefined))
    child.once('close', code => {
      if (code !== 0) { finish(undefined); return }
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)).trim()
        finish(JSON.parse(text) as unknown)
      } catch { finish(undefined) }
    })
  })
}
export function parseNativeRegistrySnapshot(value: unknown): NativeRegistrySnapshot | undefined {
  const raw = asExactRecord(value, ['metadata', 'future', 'run', 'foreignStartup', 'localServer'])
  if (raw === null || typeof raw['future'] !== 'boolean' || typeof raw['foreignStartup'] !== 'boolean') return undefined
  if (raw['run'] !== null && typeof raw['run'] !== 'string') return undefined
  if (raw['localServer'] !== null && typeof raw['localServer'] !== 'string') return undefined
  const metadata = raw['metadata'] === null ? null : asExactRecord(raw['metadata'], ['aumid', 'clsid', 'executable', 'shortcut'])
  if (raw['metadata'] !== null && (metadata === null || !Object.values(metadata).every(value => typeof value === 'string'))) return undefined
  return { metadata: metadata === null ? null : { aumid: metadata['aumid'] as string, clsid: metadata['clsid'] as string, executable: metadata['executable'] as string, shortcut: metadata['shortcut'] as string },
    future: raw['future'], run: raw['run'], foreignStartup: raw['foreignStartup'], localServer: raw['localServer'] }
}
export function createWindowsRegistry(systemRoot: string): NativeRegistry {
  return {
    read: async () => parseNativeRegistrySnapshot(await executeRegistryOperation('read', systemRoot)),
    removeStartupApproval: async () => {
      const raw = asExactRecord(await executeRegistryOperation('removeApproval', systemRoot), ['removed'])
      return raw?.['removed'] === true
    },
  }
}
