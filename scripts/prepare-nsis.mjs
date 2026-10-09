// Adaptação versionada dos templates FIXADOS, sem editar node_modules.
// Qualquer divergência da referência reprova antes de gerar/empacotar.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(root, 'node_modules/app-builder-lib/templates/nsis')
const output = path.join(root, 'build/nsis')
const references = JSON.parse(readFileSync(path.join(output, 'upstream-sha256.json'), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function source(file) {
  const bytes = readFileSync(path.join(sourceRoot, file))
  if (hash(bytes) !== references.files[file]) throw new Error(`NSIS upstream divergente: ${file}`)
  return bytes.toString('utf8').replace(/\r\n/g, '\n')
}
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('NSIS adaptação incompatível com a referência')
  return text.replace(before, after)
}
function save(file, text) { writeFileSync(path.join(output, file), text) }
for (const file of Object.keys(references.files)) source(file)

let script = source('installer.nsi')
const start = script.indexOf('Function .onInit\n')
const end = script.indexOf('FunctionEnd', start) + 'FunctionEnd'.length
if (start < 0 || end < start) throw new Error('NSIS .onInit ausente')
script = script.slice(0, start) + `Function .onInit
  Call setInstallSectionSpaceRequired
  !insertmacro check64BitAndSetRegView
  SetShellVarContext current
  StrCpy $installMode CurrentUser
  !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
  !insertmacro customInit
  StrCpy $PerUserInstallationFolder $INSTDIR
FunctionEnd` + script.slice(end)
script = replaceOnce(script, '!include "oneClick.nsh"', '!include "oneClick.nsh"\n  !insertmacro MUI_UNPAGE_INSTFILES')
script = replaceOnce(script, '!include "installUtil.nsh"', '!include "${PROJECT_DIR}\\build\\nsis\\install-util.nsh"')
script = replaceOnce(script, '!include "installSection.nsh"', '!include "${PROJECT_DIR}\\build\\nsis\\install-section.nsh"')
script = replaceOnce(script, '!ifdef BUILD_UNINSTALLER\n  !include "uninstaller.nsh"\n!endif', '!include "${PROJECT_DIR}\\build\\nsis\\uninstaller.nsh"')
save('installer.nsi', script)

let uninstall = source('uninstaller.nsh')
uninstall = replaceOnce(uninstall, '!insertmacro CHECK_APP_RUNNING', 'Call un.TFA_CheckProcesses')
uninstall = replaceOnce(uninstall, '  SetOutPath $INSTDIR\n  ${LogSet} on', '  !insertmacro check64BitAndSetRegView\n  SetShellVarContext current\n  StrCpy $installMode CurrentUser\n  !insertmacro customUnInit')
uninstall = replaceOnce(uninstall, '  !insertmacro customUnInit\n  \n  !insertmacro check64BitAndSetRegView', '  !insertmacro customUnInit')
uninstall = replaceOnce(uninstall, '  !insertmacro initMultiUser\n\n  !ifmacrodef customUnInit\n    !insertmacro customUnInit\n  !endif', '  # Guardas já executadas sem SetOutPath/initMultiUser/criação de Known Folder.')
uninstall = replaceOnce(uninstall, '  !ifmacrodef customUnInstall', '  Call un.TFA_ValidateDestination\n  Call un.TFA_CheckIdentity\n  Call un.TFA_CheckProcesses\n\n  !ifmacrodef customUnInstall')
uninstall = replaceOnce(uninstall, '  # delete the installed files', '  Call un.TFA_ValidateDestination\n  Call un.TFA_CheckIdentity\n  Call un.TFA_CheckProcesses\n\n  # delete the installed files')
uninstall = replaceOnce(uninstall, '    RMDir /r $INSTDIR', '    ClearErrors\n    RMDir /r $INSTDIR\n    ${If} ${Errors}\n      StrCpy $tfaFailureCode 206\n      !insertmacro TFA_FAIL "Falha na fase remoção dos binários. Dados retidos; não foi anunciado sucesso."\n    ${EndIf}')
// Remoção de dados nunca é implementada pelo script; argumentos de wipe são recusados.
const wipeStart = uninstall.indexOf('  Var /GLOBAL isDeleteAppData')
const wipeEnd = uninstall.indexOf('  DeleteRegKey SHELL_CONTEXT', wipeStart)
uninstall = uninstall.slice(0, wipeStart) + uninstall.slice(wipeEnd)
save('uninstaller.nsh', uninstall)

let install = source('include/installer.nsh')
install = replaceOnce(install, '!include "extractAppPackage.nsh"', '!include "${PROJECT_DIR}\\build\\nsis\\extract-application.nsh"')
// O Setup não cria cache de auto-update; não há updater no produto.
install = replaceOnce(install, '      !insertmacro copyFile "$EXEPATH" "$LOCALAPPDATA\\${APP_INSTALLER_STORE_FILE}"', '      # Sem cache de auto-update.')
install = replaceOnce(install, '  File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"', '  ClearErrors\n  WriteUninstaller "$INSTDIR\\${UNINSTALL_FILENAME}"\n  ${If} ${Errors}\n    StrCpy $tfaFailureCode 205\n    !insertmacro TFA_FAIL "Falha na fase uninstaller. Binários podem estar parciais; repare pela mesma versão íntegra."\n  ${EndIf}')
save('application-files.nsh', install)

let extract = source('include/extractAppPackage.nsh')
extract = replaceOnce(extract, '    StrCmp $R0 "success" +3\n      MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)$\\n$R0"\n      Quit', '    ${If} $R0 != "success"\n      StrCpy $tfaFailureCode 201\n      !insertmacro TFA_FAIL "Falha na fase extração. Binários podem estar parciais; repare pela mesma versão íntegra."\n    ${EndIf}')
save('extract-application.nsh', extract)

let section = source('installSection.nsh')
section = replaceOnce(section, '!include installer.nsh', '!include "${PROJECT_DIR}\\build\\nsis\\application-files.nsh"')
section = replaceOnce(section, '!insertmacro uninstallOldVersion SHELL_CONTEXT', 'Call TFA_CheckIdentity\nCall TFA_CheckProcesses\nCall TFA_CheckPredecessor\n!insertmacro uninstallOldVersion SHELL_CONTEXT')
section = replaceOnce(section, 'SetOutPath $INSTDIR', 'Call TFA_ValidateDestination\nCall TFA_CheckIdentity\nCall TFA_CheckProcesses\nSetOutPath $INSTDIR')
section = replaceOnce(section, '!insertmacro registryAddInstallInfo', 'ClearErrors\n!insertmacro registryAddInstallInfo\n${If} ${Errors}\n  StrCpy $tfaFailureCode 203\n  !insertmacro TFA_FAIL "Falha na fase registro. Binários podem estar parciais; repare pela mesma versão íntegra."\n${EndIf}')
// --force-run é recusado no preflight: não existe abertura automática autorizada.
save('install-section.nsh', section)

let util = source('include/installUtil.nsh')
util = replaceOnce(util, '  IfErrors 0 +3\n  DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`\n  Return', '  ${If} ${Errors}\n    StrCpy $tfaFailureCode 204\n    !insertmacro TFA_FAIL "Falha na fase remoção anterior; a instalação não prosseguiu."\n  ${EndIf}')
// $0 é scratch dos probes (stdout de nsExec). Não pode transportar os flags do
// predecessor através das revalidações; --updated/--keep-shortcuts são necessários.
util = replaceOnce(util, 'Function uninstallOldVersion\n', 'Var /GLOBAL tfaOldUninstallArguments\n\nFunction uninstallOldVersion\n')
util = replaceOnce(util, '  StrCpy $uninstallerFileNameTemp', '  StrCpy $tfaOldUninstallArguments $0\n\n  StrCpy $uninstallerFileNameTemp')
const retryStart = util.indexOf('  # Retry counter\n', util.indexOf('Function uninstallOldVersion'))
const retryEnd = util.indexOf('FunctionEnd', retryStart)
util = util.slice(0, retryStart) + `  Call TFA_CheckProcesses
  System::Call 'kernel32::SetEnvironmentVariableW(w "TFA_STAGED_OLD_UNINSTALLER", w "$uninstallerFileNameTemp") i .R0'
  Call TFA_CheckPredecessor
  System::Call 'kernel32::SetEnvironmentVariableW(w "TFA_STAGED_OLD_UNINSTALLER", p 0) i .R0'
  ClearErrors
  ExecWait '"$uninstallerFileNameTemp" /S /KEEP_APP_DATA $tfaOldUninstallArguments _?=$installationDir' $R0
  \${If} \${Errors}
    !insertmacro TFA_FAIL "Falha na fase remoção anterior. Não haverá fallback ou nova tentativa automática."
  \${EndIf}
  \${If} $R0 != 0
    !insertmacro TFA_FAIL "A remoção anterior recusou a manutenção. Salve os rascunhos, use Sair e verifique a instalação antes de tentar novamente."
  \${EndIf}
` + util.slice(retryEnd)
save('install-util.nsh', util)

for (const name of ['process', 'identity', 'predecessor']) {
  const command = readFileSync(path.join(output, `${name}-preflight.ps1`), 'utf8')
  const encoded = Buffer.from(command, 'utf16le').toString('base64')
  save(`${name}-command.nsh`, `!define TFA_${name.toUpperCase()}_COMMAND "${encoded}"\n`)
}
if (!existsSync(path.join(output, 'trusted-predecessors.nsh'))) {
  save('trusted-predecessors.nsh', '!define TFA_PREDECESSOR_SHA256 ""\n!define TFA_PREDECESSOR_VERSION ""\n')
}
process.stdout.write('NSIS: referências fixadas conferidas; adaptação gerada no projeto\n')
