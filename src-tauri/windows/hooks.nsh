!define SOCADB_MCP "socadb-mcp-windows-x64.exe"

Var SocadbRmSession
Var SocadbInUse
Var SocadbTries
Var SocadbMainExe

Function SocadbRegisterRuntimeExe
  !insertmacro RestartManager_RegisterFile $SocadbRmSession "$R9"
  Push $0
FunctionEnd

Function SocadbRegisterRuntime
  ${Locate} "$INSTDIR\runtime\node_modules\@anthropic-ai" "/L=F /M=*.exe" "SocadbRegisterRuntimeExe"
  ${Locate} "$INSTDIR\runtime\node_modules\@openai" "/L=F /M=*.exe" "SocadbRegisterRuntimeExe"
  ${If} ${FileExists} "$INSTDIR\runtime\bun.exe"
    !insertmacro RestartManager_RegisterFile $SocadbRmSession "$INSTDIR\runtime\bun.exe"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\runtime\${SOCADB_MCP}"
    !insertmacro RestartManager_RegisterFile $SocadbRmSession "$INSTDIR\runtime\${SOCADB_MCP}"
  ${EndIf}
FunctionEnd

; MAINBINARYNAME is defined after this file is included, so functions here
; can't name it.
Function SocadbRegisterMainExe
  !insertmacro RestartManager_RegisterFile $SocadbRmSession "$SocadbMainExe"
FunctionEnd

; Restart Manager keeps listing a process its session found after the process
; exits, so every check opens a session of its own.
!macro SOCADB_CHECK_IN_USE register
  StrCpy $SocadbInUse 0
  !insertmacro RestartManager_StartSession $SocadbRmSession
  ${If} $SocadbRmSession != ""
    Call ${register}
    System::Call 'RSTRTMGR::RmGetList(i $SocadbRmSession, *i .r1, *i .r2, p 0, *i .r3) i .r0'
    ${IfThen} $0 = ${ERROR_MORE_DATA} ${|} StrCpy $SocadbInUse 1 ${|}
    !insertmacro RestartManager_EndSession $SocadbRmSession
  ${EndIf}
!macroend

Function SocadbMainExeInUse
  !insertmacro SOCADB_CHECK_IN_USE SocadbRegisterMainExe
FunctionEnd

Function SocadbRuntimeInUse
  !insertmacro SOCADB_CHECK_IN_USE SocadbRegisterRuntime
FunctionEnd

Function SocadbStopRuntime
  !insertmacro RestartManager_StartSession $SocadbRmSession
  ${If} $SocadbRmSession != ""
    Call SocadbRegisterRuntime
    System::Call 'RSTRTMGR::RmShutdown(i $SocadbRmSession, i ${RmForceShutdown}, p 0)'
    !insertmacro RestartManager_EndSession $SocadbRmSession
  ${EndIf}
FunctionEnd

!macro SOCADB_WAIT_UNTIL_FREE check tries
  StrCpy $SocadbTries 0
  ${Do}
    Call ${check}
    ${IfThen} $SocadbInUse = 0 ${|} ${Break} ${|}
    ${IfThen} $SocadbTries >= ${tries} ${|} ${Break} ${|}
    Sleep 250
    IntOp $SocadbTries $SocadbTries + 1
  ${Loop}
!macroend

; What any version put under runtime/, never the folder itself, which may hold
; the user's files when the install folder was typed by hand. An update never
; uninstalls, and the uninstaller deletes only the current version's files.
!macro SOCADB_REMOVE_RUNTIME
  RMDir /r "$INSTDIR\runtime\node_modules"
  Delete "$INSTDIR\runtime\bun.exe"
  Delete "$INSTDIR\runtime\${SOCADB_MCP}"
  Delete "$INSTDIR\runtime\package.json"
  Delete "$INSTDIR\runtime\agent-runner-claude.ts"
  Delete "$INSTDIR\runtime\agent-runner-codex.ts"
  Delete "$INSTDIR\runtime\agent-runner-shared.ts"
  Delete "$INSTDIR\runtime\claude-session-store.ts"
  Delete "$INSTDIR\runtime\codex-exec.ts"
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; In update mode, Tauri checks only once whether SocaDB still runs, while the
  ; app that started the update is still quitting, and gives up with "Failed to
  ; kill". Drop this wait once tauri-apps/tauri#16277 is fixed.
  ${If} $UpdateMode = 1
    StrCpy $SocadbMainExe "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SOCADB_WAIT_UNTIL_FREE SocadbMainExeInUse 80
  ${EndIf}
  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; AI apps keep the MCP server running even while SocaDB is closed. Windows
  ; won't overwrite a running executable but lets it be renamed; a later
  ; install deletes the copy once nothing runs it.
  Delete "$INSTDIR\${SOCADB_MCP}.*.old"
  ${If} ${FileExists} "$INSTDIR\${SOCADB_MCP}"
    ClearErrors
    FileOpen $R2 "$INSTDIR\${SOCADB_MCP}" a
    ${If} ${Errors}
      System::Call 'kernel32::GetTickCount() i .R1'
      Rename "$INSTDIR\${SOCADB_MCP}" "$INSTDIR\${SOCADB_MCP}.$R1.old"
    ${Else}
      FileClose $R2
    ${EndIf}
  ${EndIf}

  ; With SocaDB closed, only its own agents can still run from runtime/: the
  ; updater quits without stopping them in versions before 0.1.6.
  !insertmacro SOCADB_WAIT_UNTIL_FREE SocadbRuntimeInUse 40
  ${If} $SocadbInUse = 1
    Call SocadbStopRuntime
    !insertmacro SOCADB_WAIT_UNTIL_FREE SocadbRuntimeInUse 20
  ${EndIf}

  ; A runtime still in use stays whole, so an install that fails on it leaves
  ; the previous version working.
  ${If} $SocadbInUse = 0
  ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SOCADB_REMOVE_RUNTIME
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro SOCADB_REMOVE_RUNTIME
  RMDir "$INSTDIR\runtime"
  Delete "$INSTDIR\${SOCADB_MCP}.*.old"
  RMDir "$INSTDIR"
!macroend
