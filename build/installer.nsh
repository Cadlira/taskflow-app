# build/installer.nsh — TFA-002
#
# Guardas da instalação exclusivamente por usuário e da ACE do AppContainer.
# Complemento pequeno aos templates do electron-builder 26.17.0 (one-click,
# perMachine=false); não substitui o script inteiro nem adiciona páginas.
#
# Contratos aplicados (spec windows-per-user-installation / decisões D2, D3, D4):
# - Destino final obrigatório: Known Folder UserProgramFiles + TaskFlowApp do usuário atual,
#   dentro do perfil; Known Folder redirecionado, reparse point, outro usuário, root global,
#   UNC, caminho relativo ou traversal são recusados antes de extrair/gravar.
# - `/allusers` é recusado sempre (inclusive com `/currentuser` e `/S`); `/currentuser` e `/S`
#   mantêm as mesmas restrições; `/D` único e somente no destino canônico, no formato `/D=`.
# - HKCU com InstallLocation anterior fora do canônico recusa sem alterar a instalação existente;
#   instalação de máquina (HKLM) preexistente é recusada sem migração.
# - A ACE somente leitura/execução para S-1-15-2-1 (ALL APPLICATION PACKAGES) é concedida
#   apenas após a validação e somente no root instalado; falha interrompe com código não zero,
#   sem desabilitar sandbox, elevar ou ampliar a ACL para pais/dados/outros diretórios.
# - O desinstalador repete a validação do mesmo destino antes de qualquer remoção.
#
# O desinstalador do NSIS só pode chamar funções `un.`; as funções abaixo são geradas
# para os dois contextos via macro com prefixo, sem duplicar a lógica.

!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"

!define TFA_INSTALL_DIR_NAME "TaskFlowApp"
!define TFA_NATIVE_KEY "Software\TaskFlow App\NativeIdentity\v1"
!define TFA_TOAST_CLSID "{8B9BA547-6778-4F8E-873F-C3171C4EE08D}"
!define TFA_STARTUP_NAME "taskflow.app.startup.v1"
!define TFA_APP_CONTAINER_SID "S-1-15-2-1"
!define TFA_FILE_ATTRIBUTE_REPARSE_POINT 0x400
!define TFA_INVALID_FILE_ATTRIBUTES 0xFFFFFFFF

# multiUser.nsh (corpo principal) define as mesmas chaves depois deste include;
# antecipar /ifndef permite reutilizá-las aqui sem depender da ordem dos templates.
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"

Var tfaGuardMode
Var tfaParams
Var tfaHaystack
Var tfaNeedle
Var tfaHayLen
Var tfaNeedleLen
Var tfaScanIndex
Var tfaIndex
Var tfaMaxStart
Var tfaSlice
Var tfaFound
Var tfaCount
Var tfaValue
Var tfaRequestedDir
Var tfaCanonicalRoot
Var tfaCanonicalDir
Var tfaProfilePrefix
Var tfaCurrent
Var tfaProbeFile
Var tfaExpectedDefaultDir
Var tfaRegistryValue

!macro TFA_FAIL TEXT
  SetErrorLevel 2
  ${If} ${Silent}
    DetailPrint "TaskFlow App: ${TEXT}"
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "${TEXT}"
  ${EndIf}
  Quit
!macroend

# Conjunto compartilhado entre instalação e remoção. ${P} é "" no instalador e "un." no
# desinstalador; cada função gerada é local ao seu contexto.
!macro TFA_DEFINE_SHARED PREFIX

  # Procura $tfaNeedle em $tfaHaystack a partir de $tfaScanIndex (sem diferenciar maiúsculas).
  # Saída: $tfaFound (0/1) e $tfaIndex (posição ou -1).
  Function ${PREFIX}TFA_Find
    StrCpy $tfaFound 0
    StrCpy $tfaIndex -1
    StrLen $tfaHayLen $tfaHaystack
    StrLen $tfaNeedleLen $tfaNeedle
    ${If} $tfaNeedleLen == 0
      Return
    ${EndIf}
    IntOp $tfaMaxStart $tfaHayLen - $tfaNeedleLen
    ${DoWhile} $tfaScanIndex <= $tfaMaxStart
      StrCpy $tfaSlice $tfaHaystack $tfaNeedleLen $tfaScanIndex
      ${If} $tfaSlice == $tfaNeedle
        StrCpy $tfaIndex $tfaScanIndex
        StrCpy $tfaFound 1
        Return
      ${EndIf}
      IntOp $tfaScanIndex $tfaScanIndex + 1
    ${Loop}
  FunctionEnd

  # Conta ocorrências de $tfaNeedle em $tfaHaystack. Saída: $tfaCount.
  Function ${PREFIX}TFA_Count
    StrCpy $tfaCount 0
    StrCpy $tfaScanIndex 0
    StrLen $tfaNeedleLen $tfaNeedle
    ${Do}
      Call ${PREFIX}TFA_Find
      ${If} $tfaFound == 0
        ${Break}
      ${EndIf}
      IntOp $tfaCount $tfaCount + 1
      IntOp $tfaScanIndex $tfaIndex + $tfaNeedleLen
      ${If} $tfaNeedleLen == 0
        ${Break}
      ${EndIf}
    ${Loop}
  FunctionEnd

  # Remove barras invertidas finais de $tfaValue.
  Function ${PREFIX}TFA_TrimTrailingBackslash
    ${DoWhile} 1 == 1
      StrCpy $tfaSlice $tfaValue 1 -1
      ${If} $tfaSlice != "\"
        ${Break}
      ${EndIf}
      StrCpy $tfaValue $tfaValue -1
    ${Loop}
  FunctionEnd

  # Remove espaços/tabs ao final de $tfaValue (a linha de comando pode trazer sobra).
  Function ${PREFIX}TFA_TrimTrailingWhitespace
    ${DoWhile} 1 == 1
      StrCpy $tfaSlice $tfaValue 1 -1
      ${If} $tfaSlice == ""
        ${Break}
      ${EndIf}
      ${If} $tfaSlice == " "
      ${OrIf} $tfaSlice == "$\t"
        StrCpy $tfaValue $tfaValue -1
      ${Else}
        ${Break}
      ${EndIf}
    ${Loop}
  FunctionEnd

  # Verifica se $tfaValue (absoluto) está sob $PROFILE. Saída: $tfaFound (0/1).
  Function ${PREFIX}TFA_IsUnderProfile
    StrCpy $tfaFound 0
    StrCpy $tfaProfilePrefix "$PROFILE\"
    StrLen $tfaNeedleLen $tfaProfilePrefix
    StrCpy $tfaSlice $tfaValue $tfaNeedleLen
    ${If} $tfaSlice == $tfaProfilePrefix
      StrCpy $tfaFound 1
    ${EndIf}
  FunctionEnd

  # Verifica se $tfaValue ou algum ancestral existente é reparse point. Saída: $tfaFound (1 = sim).
  Function ${PREFIX}TFA_HasReparsePoint
    StrCpy $tfaFound 0
    StrCpy $tfaCurrent $tfaValue
    ${Do}
      ${If} $tfaCurrent == ""
        ${Break}
      ${EndIf}
      System::Call 'kernel32::GetFileAttributesW(w "$tfaCurrent") i .R0'
      ${If} $R0 <> ${TFA_INVALID_FILE_ATTRIBUTES}
        ${If} $R0 & ${TFA_FILE_ATTRIBUTE_REPARSE_POINT}
          StrCpy $tfaFound 1
          Return
        ${EndIf}
      ${EndIf}
      StrLen $tfaHayLen $tfaCurrent
      StrCpy $tfaIndex -1
      StrCpy $tfaScanIndex 0
      ${If} $tfaHayLen > 1
        IntOp $tfaMaxStart $tfaHayLen - 1
        ${DoWhile} $tfaScanIndex <= $tfaMaxStart
          StrCpy $tfaSlice $tfaCurrent 1 $tfaScanIndex
          ${If} $tfaSlice == "\"
            StrCpy $tfaIndex $tfaScanIndex
          ${EndIf}
          IntOp $tfaScanIndex $tfaScanIndex + 1
        ${Loop}
      ${EndIf}
      ${If} $tfaIndex <= 2
        ${Break}
      ${EndIf}
      StrCpy $tfaCurrent $tfaCurrent $tfaIndex
    ${Loop}
  FunctionEnd

  # Compara $tfaValue com o destino canônico (sem diferenciar maiúsculas), recusando
  # UNC, relativo, device, separador “/”, traversal e reparse point. Saída: $tfaFound (1 = equivalente).
  Function ${PREFIX}TFA_MatchesCanonical
    StrCpy $tfaFound 0
    ${If} $tfaValue == ""
      Return
    ${EndIf}
    StrCpy $tfaSlice $tfaValue 2
    ${If} $tfaSlice == "\\"
      Return
    ${EndIf}
    ${If} $tfaSlice == "//"
      Return
    ${EndIf}
    StrCpy $tfaSlice $tfaValue 1 1
    ${If} $tfaSlice != ":"
      Return
    ${EndIf}
    StrCpy $tfaSlice $tfaValue 1 2
    ${If} $tfaSlice != "\"
      Return
    ${EndIf}
    # componente de traversal não é aceito, mesmo que o texto resolva ao destino
    StrCpy $tfaHaystack $tfaValue
    StrCpy $tfaNeedle ".."
    StrCpy $tfaScanIndex 0
    Call ${PREFIX}TFA_Find
    ${If} $tfaFound == 1
      StrCpy $tfaFound 0
      Return
    ${EndIf}
    # separador alternativo não é aceito; o destino canônico usa “\”
    StrCpy $tfaHaystack $tfaValue
    StrCpy $tfaNeedle "/"
    StrCpy $tfaScanIndex 0
    Call ${PREFIX}TFA_Find
    ${If} $tfaFound == 1
      StrCpy $tfaFound 0
      Return
    ${EndIf}
    StrCpy $tfaFound 0
    Call ${PREFIX}TFA_TrimTrailingBackslash
    ${If} $tfaValue == $tfaCanonicalDir
      Call ${PREFIX}TFA_HasReparsePoint
      ${If} $tfaFound == 0
        StrCpy $tfaFound 1
      ${Else}
        StrCpy $tfaFound 0
      ${EndIf}
    ${EndIf}
  FunctionEnd

  # Resolve o root UserProgramFiles do usuário atual e exige que ele esteja no perfil
  # e sem reparse point. Saída: $tfaCanonicalDir e $tfaFound (0/1).
  Function ${PREFIX}TFA_ResolveCanonicalDir
    StrCpy $tfaFound 0
    StrCpy $tfaCanonicalRoot ""
    StrCpy $tfaCanonicalDir ""
    System::Call 'SHELL32::SHGetKnownFolderPath(g "{5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}", i 0x00008000, p 0, *p .R1)i.R0'
    ${If} $R0 <> 0
      Return
    ${EndIf}
    ${If} $R1 = 0
      Return
    ${EndIf}
    System::Call 'KERNEL32::lstrcpynW(w .R2, p R1, i ${NSIS_MAX_STRLEN})'
    System::Call 'OLE32::CoTaskMemFree(p R1)'
    StrCpy $tfaCanonicalRoot $R2
    StrCpy $tfaValue $tfaCanonicalRoot
    Call ${PREFIX}TFA_TrimTrailingBackslash
    StrCpy $tfaCanonicalRoot $tfaValue
    Call ${PREFIX}TFA_IsUnderProfile
    ${If} $tfaFound == 0
      Return
    ${EndIf}
    StrCpy $tfaValue $tfaCanonicalRoot
    Call ${PREFIX}TFA_HasReparsePoint
    ${If} $tfaFound == 1
      StrCpy $tfaFound 0
      Return
    ${EndIf}
    StrCpy $tfaCanonicalDir "$tfaCanonicalRoot\${TFA_INSTALL_DIR_NAME}"
    StrCpy $tfaFound 1
  FunctionEnd

  # Valida argumentos de modo/destino. Falha via TFA_FAIL. Saída: $tfaValue = valor de /D ("" se ausente).
  Function ${PREFIX}TFA_CheckArguments
    StrCpy $tfaValue ""
    ${GetParameters} $tfaParams
    StrCpy $tfaHaystack $tfaParams

    # /allusers recusado em qualquer combinação
    StrCpy $tfaNeedle "/allusers"
    StrCpy $tfaScanIndex 0
    Call ${PREFIX}TFA_Find
    ${If} $tfaFound == 1
      !insertmacro TFA_FAIL "Não foi possível continuar: o argumento /allusers não é suportado. O TaskFlow App instala somente para o usuário atual."
    ${EndIf}

    # /currentuser duplicado
    StrCpy $tfaNeedle "/currentuser"
    StrCpy $tfaScanIndex 0
    Call ${PREFIX}TFA_Count
    ${If} $tfaCount > 1
      !insertmacro TFA_FAIL "Não foi possível continuar: argumento de modo duplicado. Use somente /currentuser."
    ${EndIf}

    # /D é consumido nativamente pelo NSIS antes do $CMDLINE; por isso a validação usa
    # a linha de comando original via kernel32::GetCommandLineW, no formato único /D=<destino>.
    System::Call 'kernel32::GetCommandLineW() w .R6'
    ${If} $R6 == ""
      !insertmacro TFA_FAIL "Não foi possível continuar: não foi possível validar os argumentos de destino."
    ${EndIf}
    StrCpy $tfaHaystack $R6
    StrCpy $tfaNeedle "/d="
    StrCpy $tfaScanIndex 0
    Call ${PREFIX}TFA_Count
    ${If} $tfaCount > 1
      !insertmacro TFA_FAIL "Não foi possível continuar: destino informado mais de uma vez. Informe no máximo um /D=<destino>."
    ${EndIf}
    ${If} $tfaCount == 1
      StrCpy $tfaScanIndex 0
      Call ${PREFIX}TFA_Find
      IntOp $tfaIndex $tfaIndex + 3
      StrCpy $tfaValue $tfaHaystack "" $tfaIndex
      Call ${PREFIX}TFA_TrimTrailingWhitespace
      # duplicidade ou malformado embutido no restante da linha
      StrCpy $tfaHaystack $tfaValue
      StrCpy $tfaNeedle "/d"
      StrCpy $tfaScanIndex 0
      Call ${PREFIX}TFA_Find
      ${If} $tfaFound == 1
        !insertmacro TFA_FAIL "Não foi possível continuar: argumento de destino duplicado ou malformado. Use no máximo /D=<destino>."
      ${EndIf}
      ${If} $tfaValue == ""
        !insertmacro TFA_FAIL "Não foi possível continuar: destino vazio em /D. Use /D=<destino>."
      ${EndIf}
    ${Else}
      StrCpy $tfaHaystack $R6
      StrCpy $tfaNeedle "/d"
      StrCpy $tfaScanIndex 0
      Call ${PREFIX}TFA_Count
      ${If} $tfaCount > 0
        !insertmacro TFA_FAIL "Não foi possível continuar: argumento de destino malformado. Use /D=<destino>."
      ${EndIf}
      StrCpy $tfaValue ""
    ${EndIf}
  FunctionEnd

  # Guarda comum: argumentos, destino canônico e registro anterior. No modo instalação,
  # também recusa instalação de máquina legada e testa a escrita; em ambos, fixa o
  # $INSTDIR canônico antes de qualquer efeito.
  Function ${PREFIX}TFA_ValidateDestination
    Call ${PREFIX}TFA_CheckArguments
    StrCpy $tfaRequestedDir $tfaValue

    Call ${PREFIX}TFA_ResolveCanonicalDir
    ${If} $tfaFound == 0
      !insertmacro TFA_FAIL "Não foi possível continuar: a pasta de programas do usuário não está no perfil autorizado. A operação foi cancelada."
    ${EndIf}

    # o próprio destino canônico não pode ser reparse point (escape por junction)
    StrCpy $tfaValue $tfaCanonicalDir
    Call ${PREFIX}TFA_HasReparsePoint
    ${If} $tfaFound == 1
      !insertmacro TFA_FAIL "Não foi possível continuar: o destino autorizado é um ponto de reparse e a operação foi cancelada."
    ${EndIf}

    ${If} $tfaRequestedDir != ""
      StrCpy $tfaValue $tfaRequestedDir
      Call ${PREFIX}TFA_MatchesCanonical
      ${If} $tfaFound == 0
        !insertmacro TFA_FAIL "Não foi possível continuar: o destino informado não é o destino autorizado para o usuário atual."
      ${EndIf}
    ${EndIf}

    ReadRegStr $tfaRegistryValue HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $tfaRegistryValue != ""
      StrCpy $tfaValue $tfaRegistryValue
      Call ${PREFIX}TFA_MatchesCanonical
      ${If} $tfaFound == 0
        !insertmacro TFA_FAIL "Não foi possível continuar: há um registro de instalação anterior fora do destino autorizado. Remova essa instalação antes de continuar."
      ${EndIf}
    ${EndIf}

    ${If} $tfaGuardMode == "install"
      # instalação de máquina legada (HKLM, ambos os modos de registro)
      ReadRegStr $tfaRegistryValue HKLM "Software\${APP_GUID}" InstallLocation
      StrCpy $tfaCurrent $tfaRegistryValue
      ReadRegStr $tfaRegistryValue HKLM "Software\WOW6432Node\${APP_GUID}" InstallLocation
      ${If} $tfaRegistryValue != ""
        StrCpy $tfaCurrent $tfaRegistryValue
      ${EndIf}
      ${If} $tfaCurrent != ""
        !insertmacro TFA_FAIL "Não foi possível continuar: existe uma instalação para todos os usuários que este aplicativo não migra. Remova-a antes de continuar."
      ${EndIf}
    ${EndIf}

    # defesa adicional: o destino já resolvido pelo template precisa ser o canônico ou,
    # somente na instalação, o default do próprio template (sem override nem registro).
    StrCpy $tfaValue $INSTDIR
    Call ${PREFIX}TFA_MatchesCanonical
    ${If} $tfaFound == 0
      ${If} $tfaGuardMode == "install"
        StrCpy $tfaExpectedDefaultDir "$tfaCanonicalRoot\${APP_FILENAME}"
        ${If} $INSTDIR != $tfaExpectedDefaultDir
          !insertmacro TFA_FAIL "Não foi possível continuar: o destino resolvido não é o autorizado para o usuário atual."
        ${EndIf}
      ${Else}
        !insertmacro TFA_FAIL "Não foi possível desinstalar: o destino resolvido não é o autorizado para o usuário atual. A remoção foi cancelada."
      ${EndIf}
    ${EndIf}

    StrCpy $INSTDIR $tfaCanonicalDir
    SetShellVarContext current

    ${If} $tfaGuardMode == "install"
      # destino gravável; falha aqui não altera instalação/dados existentes
      CreateDirectory "$INSTDIR"
      ClearErrors
      FileOpen $tfaProbeFile "$INSTDIR\.taskflow-write-probe" w
      ${If} ${Errors}
        ClearErrors
        !insertmacro TFA_FAIL "Não foi possível continuar: o destino autorizado não pode ser preparado para o usuário atual."
      ${EndIf}
      FileClose $tfaProbeFile
      Delete "$INSTDIR\.taskflow-write-probe"
    ${EndIf}
  FunctionEnd

!macroend

!ifdef BUILD_UNINSTALLER
  !insertmacro TFA_DEFINE_SHARED "un."
!endif

!ifndef BUILD_UNINSTALLER
  !insertmacro TFA_DEFINE_SHARED ""

  # Concede somente leitura/execução herdável ao AppContainer no root instalado.
  # Executada em customInstall, depois da validação e da extração; falha interrompe.
  Function TFA_GrantAppContainerReadExecute
    ClearErrors
    nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*${TFA_APP_CONTAINER_SID}:(OI)(CI)(RX)" /Q'
    Pop $tfaCount
    Pop $0
    ${If} $tfaCount != 0
      !insertmacro TFA_FAIL "Não foi possível concluir a instalação: a permissão de leitura do executável para o sandbox do Windows não pôde ser configurada. Nenhum modo inseguro foi habilitado."
    ${EndIf}
  FunctionEnd
!endif

!macro customInit
  StrCpy $tfaGuardMode "install"
  Call TFA_ValidateDestination
!macroend

!macro customUnInit
  StrCpy $tfaGuardMode "uninstall"
  Call un.TFA_ValidateDestination
!macroend

!macro customInstall
  Call TFA_GrantAppContainerReadExecute
  ReadRegStr $tfaValue HKCU "${TFA_NATIVE_KEY}" "AUMID"
  ${If} $tfaValue != ""
  ${AndIf} $tfaValue != "${APP_ID}"
    !insertmacro TFA_FAIL "A identidade nativa existente pertence a outro aplicativo. O cadastro foi preservado."
  ${EndIf}
  ReadRegStr $tfaValue HKCU "${TFA_NATIVE_KEY}" "InstalledExecutable"
  ${If} $tfaValue != ""
  ${AndIf} $tfaValue != "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    !insertmacro TFA_FAIL "A identidade nativa existente pertence a outro destino. O cadastro foi preservado."
  ${EndIf}
  ReadRegStr $tfaValue HKCU "${TFA_NATIVE_KEY}" "CLSID"
  ${If} $tfaValue != ""
  ${AndIf} $tfaValue != "${TFA_TOAST_CLSID}"
    !insertmacro TFA_FAIL "A identidade nativa existente não é reconhecida. O cadastro foi preservado."
  ${EndIf}
  ClearErrors
  WriteRegStr HKCU "${TFA_NATIVE_KEY}" "AUMID" "${APP_ID}"
  WriteRegStr HKCU "${TFA_NATIVE_KEY}" "CLSID" "${TFA_TOAST_CLSID}"
  WriteRegStr HKCU "${TFA_NATIVE_KEY}" "InstalledExecutable" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "${TFA_NATIVE_KEY}" "StartMenuLink" "$newStartMenuLink"
  ${If} ${Errors}
    !insertmacro TFA_FAIL "Não foi possível registrar a identidade nativa do aplicativo para este usuário."
  ${EndIf}
!macroend

!macro customUnInstall
  # O uninstall usado pelo upgrade mantém identidade e preferência/aprovação externa.
  ${IfNot} ${isUpdated}
    ReadRegStr $tfaValue HKCU "${TFA_NATIVE_KEY}" "InstalledExecutable"
    ${If} $tfaValue == "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ReadRegStr $tfaCurrent HKCU "${TFA_NATIVE_KEY}" "CLSID"
      ${If} $tfaCurrent == "${TFA_TOAST_CLSID}"
        ReadRegStr $tfaCurrent HKCU "Software\Classes\CLSID\${TFA_TOAST_CLSID}\LocalServer32" ""
        ${If} $tfaCurrent == "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
          DeleteRegKey HKCU "Software\Classes\CLSID\${TFA_TOAST_CLSID}"
        ${EndIf}
        ReadRegStr $tfaCurrent HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${TFA_STARTUP_NAME}"
        ${If} $tfaCurrent == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" --taskflow-login'
          DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${TFA_STARTUP_NAME}"
          DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${TFA_STARTUP_NAME}"
        ${ElseIf} $tfaCurrent == ""
          DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${TFA_STARTUP_NAME}"
        ${EndIf}
        DeleteRegValue HKCU "${TFA_NATIVE_KEY}" "AUMID"
        DeleteRegValue HKCU "${TFA_NATIVE_KEY}" "CLSID"
        DeleteRegValue HKCU "${TFA_NATIVE_KEY}" "InstalledExecutable"
        DeleteRegValue HKCU "${TFA_NATIVE_KEY}" "StartMenuLink"
        DeleteRegKey /ifempty HKCU "${TFA_NATIVE_KEY}"
        DeleteRegKey /ifempty HKCU "Software\TaskFlow App\NativeIdentity"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
