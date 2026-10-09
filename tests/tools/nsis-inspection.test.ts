// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { inspectPreprocessedNsis, instructionsFromCompilerTrace } from '../../scripts/nsis-inspection.mjs'

const guards = (prefix = '') => ['TFA_ValidateDestination', 'TFA_CheckIdentity', 'TFA_CheckProcesses'].map(name => `Call ${prefix}${name}`).join('\n')
const script = `RequestExecutionLevel user
Function .onInit
${guards()}
FunctionEnd
Function un.onInit
${guards('un.')}
FunctionEnd
Section "install" INSTALL_SECTION_ID
${guards()}
SetOutPath $INSTDIR
SectionEnd
Section "un.Uninstall"
${guards('un.')}
DeleteRegKey HKCU "fixture"
SectionEnd
Function uninstallOldVersion
Call TFA_CheckProcesses
Call TFA_CheckPredecessor
ExecWait '"fixture" /S'
FunctionEnd
System::Call 'fixture'
nsExec::ExecToStack 'fixture'
`
describe('NSIS efetivamente preprocessado — W03/W05/W06', () => {
  it('ignora exports disponíveis e identifica somente DLLs efetivamente incorporadas', () => {
    const result = instructionsFromCompilerTrace(' + nsProcess::KillProcess\nFunction: ".onInit"\nCall "TFA_CheckProcesses"\nFunctionEnd\nFile: "StdUtils.dll"->"$PLUGINSDIR\\StdUtils.dll" [compress] 10/20 bytes\n')
    expect(result.plugins).toEqual(['StdUtils'])
    expect(result.instructions).toBe('Function ".onInit"\nCall TFA_CheckProcesses\nFunctionEnd')
    expect(() => instructionsFromCompilerTrace('File: "nsProcess.dll"->"$PLUGINSDIR\\nsProcess.dll" [compress] 10/20 bytes\n')).toThrow('FORCED_MAINTENANCE')
  })
  it('inspeciona inicialização e mutação dos dois contextos e lista plugins usados', () => {
    expect(inspectPreprocessedNsis(script)).toMatchObject({ guardedInitialization: true, guardedMutation: true, guardedOldUninstaller: true, plugins: ['System', 'nsExec'] })
  })
  it('exige prova PE quando o trace do compilador não declara execution level', () => {
    const withoutLevel = script.replace('RequestExecutionLevel user\n', '')
    expect(() => inspectPreprocessedNsis(withoutLevel)).toThrow('ELEVATION')
    expect(inspectPreprocessedNsis(withoutLevel, true).requestExecutionLevel).toBe('user')
    expect(() => inspectPreprocessedNsis(script.replace('RequestExecutionLevel user', 'RequestExecutionLevel admin'), true)).toThrow('ELEVATION')
  })
  it.each([
    script.replace('RequestExecutionLevel user', 'RequestExecutionLevel admin'),
    `${script}\nnsProcess::KillProcess 'fixture'`,
    script.replace('Function .onInit\n', 'Function .onInit\nSetOutPath $INSTDIR\n'),
    script.replace('Function un.onInit\n', 'Function un.onInit\nDeleteRegKey HKCU "fixture"\n'),
    script.replace('Section "install" INSTALL_SECTION_ID\n', 'Section "install" INSTALL_SECTION_ID\nSetOutPath $INSTDIR\n'),
    script.replace('Section "un.Uninstall"\n', 'Section "un.Uninstall"\nDeleteRegKey HKCU "fixture"\n'),
    script.replace('Call TFA_CheckPredecessor\n', ''),
    script.replace("ExecWait '\"fixture\" /S'", "ExecWait '\"fixture\" /S'\nExecWait '\"fixture\" /S'"),
  ])('reprova elevação/kill/efeito precoce/predecessor sem guarda ou com retry (%#)', input => {
    expect(() => inspectPreprocessedNsis(input)).toThrow(/NSIS_INSPECTION/)
  })
})
