Function un.checkAppRunning
  Call un.TFA_CheckProcesses
FunctionEnd

Function un.onInit
  !insertmacro check64BitAndSetRegView
  SetShellVarContext current
  StrCpy $installMode CurrentUser
  !insertmacro customUnInit

  # Parse command line for /S flag and set silent mode
  ${GetParameters} $R0
  ${GetOptions} $R0 "/S" $R1
  ${IfNot} ${Errors}
    SetSilent silent
  ${EndIf}
  
  ${If} ${Silent}
    call un.checkAppRunning
  ${else}
    !ifdef ONE_CLICK
      MessageBox MB_OKCANCEL "$(areYouSureToUninstall)" IDOK +2
      Quit

      # one-click installer executes uninstall section in the silent mode, but we must show message dialog if silent mode was not explicitly set by user (using /S flag)
      call un.checkAppRunning
      SetSilent silent
    !endif
  ${endIf}

  # Guardas já executadas sem SetOutPath/initMultiUser/criação de Known Folder.
FunctionEnd

Function un.atomicRMDir
  Exch $R0
  Push $R1
  Push $R2
  Push $R3

  StrCpy $R3 "$INSTDIR$R0\*.*"
  FindFirst $R1 $R2 $R3

  loop:
    StrCmp $R2 "" break

    StrCmp $R2 "." continue
    StrCmp $R2 ".." continue

    IfFileExists "$INSTDIR$R0\$R2\*.*" isDir isNotDir

    isDir:
      CreateDirectory "$PLUGINSDIR\old-install$R0\$R2"

      Push "$R0\$R2"
      Call un.atomicRMDir
      Pop $R3

      ${if} $R3 != 0
        Goto done
      ${endIf}

      Goto continue

    isNotDir:
      ClearErrors
      Rename "$INSTDIR$R0\$R2" "$PLUGINSDIR\old-install$R0\$R2"

      # Ignore errors when renaming ourselves.
      StrCmp "$R0\$R2" "${UNINSTALL_FILENAME}" 0 +2
      ClearErrors

      IfErrors 0 +3
      StrCpy $R3 "$INSTDIR$R0\$R2"
      Goto done

    continue:
      FindNext $R1 $R2
      Goto loop

  break:
    StrCpy $R3 0

  done:
    FindClose $R1

    StrCpy $R0 $R3

    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd

Function un.restoreFiles
  Exch $R0
  Push $R1
  Push $R2
  Push $R3

  StrCpy $R3 "$PLUGINSDIR\old-install$R0\*.*"
  FindFirst $R1 $R2 $R3

  loop:
    StrCmp $R2 "" break

    StrCmp $R2 "." continue
    StrCmp $R2 ".." continue

    IfFileExists "$INSTDIR$R0\$R2\*.*" isDir isNotDir

    isDir:
      CreateDirectory "$INSTDIR$R0\$R2"

      Push "$R0\$R2"
      Call un.restoreFiles
      Pop $R3

      Goto continue

    isNotDir:
      Rename "$PLUGINSDIR\old-install$R0\$R2" "$INSTDIR$R0\$R2"

    continue:
      FindNext $R1 $R2
      Goto loop

  break:
    StrCpy $R0 0
    FindClose $R1

    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd

!ifndef UNINSTALL_SECTION_NAME
  !define UNINSTALL_SECTION_NAME "Uninstall"
!endif

Section "un.${UNINSTALL_SECTION_NAME}"
  SectionIn RO
  # for assisted installer we check it here to show progress
  !ifndef ONE_CLICK
    ${IfNot} ${Silent}
      call un.checkAppRunning
    ${endIf}
  !endif

  !insertmacro setLinkVars

  Call un.TFA_ValidateDestination
  Call un.TFA_CheckIdentity
  Call un.TFA_CheckProcesses

  !ifmacrodef customUnInstall
    !insertmacro customUnInstall
  !endif

  Call un.TFA_ValidateDestination
  Call un.TFA_CheckIdentity
  Call un.TFA_CheckProcesses

  # delete the installed files
  !ifmacrodef customRemoveFiles
    !insertmacro customRemoveFiles
  !else
    ${if} ${isUpdated}
      CreateDirectory "$PLUGINSDIR\old-install"

      Push ""
      Call un.atomicRMDir
      Pop $R0

      ${if} $R0 != 0
        DetailPrint "File is busy, aborting: $R0"

        # Attempt to restore previous directory
        Push ""
        Call un.restoreFiles
        Pop $R0

        Abort `Can't rename "$INSTDIR" to "$PLUGINSDIR\old-install".`
      ${endif}

    ${endif}

    # Move out of $INSTDIR so it can be removed
    SetOutPath $TEMP
    # Remove all files (or remaining shallow directories from the block above)
    ClearErrors
    RMDir /r $INSTDIR
    ${If} ${Errors}
      StrCpy $tfaFailureCode 206
      !insertmacro TFA_FAIL "Falha na fase remoção dos binários. Dados retidos; não foi anunciado sucesso."
    ${EndIf}
  !endif

  ${ifNot} ${isKeepShortcuts}
    WinShell::UninstAppUserModelId "${APP_ID}"

    !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
      WinShell::UninstShortcut "$oldDesktopLink"
      Delete "$oldDesktopLink"
    !endif

    !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
      WinShell::UninstShortcut "$oldStartMenuLink"

      Delete "$oldStartMenuLink"
      ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
      ${ifNot} $R1 == ""
        RMDir "$SMPROGRAMS\$R1"
      ${endIf}
    !endif
  ${endIf}

  # refresh the desktop
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'

  !ifmacrodef unregisterFileAssociations
    !insertmacro unregisterFileAssociations
  !endif

  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"

  !ifdef ONE_CLICK
    !insertmacro quitSuccess
  !endif
SectionEnd

!ifmacrodef customUnInstallSection
  !insertmacro customUnInstallSection
!endif
