import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contratos estruturais do include usado nas DUAS compilações NSIS; não executam
// Setup e não substituem a matriz instalada W04 nem a inspeção do script gerado.
const source = readFileSync('build/installer.nsh', 'utf8')

function sharedFunction(name: string): string {
  const start = source.indexOf(`Function \${PREFIX}${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  return source.slice(start, source.indexOf('FunctionEnd', start))
}

describe('NSIS — coerência do destino antes de efeitos', () => {
  it('mantém flags do predecessor fora dos registradores scratch usados pelos probes', () => {
    const util = readFileSync('build/nsis/install-util.nsh', 'utf8')
    const begin = util.indexOf('StrCpy $tfaOldUninstallArguments $0')
    const guards = util.indexOf('Call TFA_CheckProcesses', begin)
    const run = util.indexOf('ExecWait', guards)
    expect(begin).toBeGreaterThan(0)
    expect(guards).toBeGreaterThan(begin)
    expect(run).toBeGreaterThan(guards)
    expect(util.slice(run, util.indexOf('\n', run))).toContain('$tfaOldUninstallArguments')
    expect(util.slice(run, util.indexOf('\n', run))).not.toMatch(/\$0\b/)
  })
  it('guarda o cleanup e usa Registry64 também em PowerShell de 32 bits', () => {
    const uninstaller = readFileSync('build/nsis/uninstaller.nsh', 'utf8')
    const onInit = uninstaller.slice(uninstaller.indexOf('Function un.onInit'), uninstaller.indexOf('FunctionEnd', uninstaller.indexOf('Function un.onInit')))
    expect(onInit.indexOf('check64BitAndSetRegView')).toBeLessThan(onInit.indexOf('customUnInit'))
    const section = uninstaller.slice(uninstaller.indexOf('Section "un.'))
    expect(section.indexOf('Call un.TFA_CheckProcesses')).toBeLessThan(section.indexOf('!insertmacro customUnInstall'))
    for (const probe of ['identity', 'predecessor']) {
      expect(readFileSync(`build/nsis/${probe}-preflight.ps1`, 'utf8')).toContain('[Microsoft.Win32.RegistryView]::Registry64')
    }
    expect(onInit).not.toMatch(/^\s*SetOutPath\b/m)
  })
  it('resolve Known Folders sem criar pastas no preflight compartilhado', () => {
    const resolve = sharedFunction('TFA_ResolveCanonicalDir')
    const calls = resolve.split('\n').filter(line => line.includes('System::Call') && line.includes('SHGetKnownFolderPath'))
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call).toContain('i 0x00004000') // DONT_VERIFY: resolução sem efeitos
      expect(call).not.toContain('0x00008000') // CREATE: proibido no preflight
    }
    expect(resolve).not.toMatch(/CreateDirectory|FileOpen|WriteReg/)
    expect(source).toContain('!insertmacro TFA_DEFINE_SHARED ""')
    expect(source).toContain('!insertmacro TFA_DEFINE_SHARED "un."')
  })

  it('recusa UserProgramFiles divergente de LocalAppData antes de aceitar o destino', () => {
    const resolve = sharedFunction('TFA_ResolveCanonicalDir')
    expect(resolve).toContain('{5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}')
    expect(resolve).toContain('{F1B32785-6FBA-4FCF-9D55-7B8E7F157091}')
    const compare = resolve.indexOf('${If} $tfaCanonicalRoot != $tfaRuntimeRoot')
    const accept = resolve.lastIndexOf('StrCpy $tfaFound 1')
    expect(compare).toBeGreaterThan(-1)
    expect(resolve.slice(compare, accept)).toMatch(/Return[\s\S]*TFA_IsUnderProfile[\s\S]*TFA_HasReparsePoint/)
    expect(resolve).toContain('StrCpy $tfaRuntimeRoot "$tfaValue\\Programs"')

    const validate = sharedFunction('TFA_ValidateDestination')
    const guard = validate.indexOf('Call ${PREFIX}TFA_ResolveCanonicalDir')
    expect(guard).toBeGreaterThan(-1)
    expect(validate).not.toMatch(/CreateDirectory|FileOpen|WriteReg/)
    expect(validate.slice(guard)).toContain('!insertmacro TFA_FAIL')
  })
})
