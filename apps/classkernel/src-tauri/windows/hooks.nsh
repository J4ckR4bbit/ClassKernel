; Installer hooks for ClassKernel (bundle > windows > nsis > installerHooks in
; tauri.conf.json). Tauri's installer template inserts these macros at fixed
; points: NSIS_HOOK_POSTINSTALL after its own files and shortcuts, and
; NSIS_HOOK_POSTUNINSTALL after its own removals.
;
; ClassKernel Science, the science teaching tools, is part of ClassKernel.exe:
; started with --science, it opens only the Science window (src-tauri/src/
; lib.rs). "Installing" it gives it shortcuts of its own in the Start menu
; and on the desktop, with its own icon (science.ico, a bundle resource) and
; its own taskbar identity, so it opens and pins like an app of its own.
;
; The question is asked on a normal install only: never in an update, a
; passive or silent install, or when Science's shortcut is already there
; (a reinstall keeps it).

!define SCIENCE_NAME "ClassKernel Science"
; Must match SCIENCE_APP_ID in src-tauri/src/lib.rs: the window and its
; shortcut share it, so the taskbar groups them and a pin starts Science.
!define SCIENCE_APP_ID "com.classkernel.science"

; A shortcut's AppUserModelID, as the template's own SetLnkAppUserModelId
; does for ClassKernel's shortcut, but with Science's id.
!macro CK_SetScienceAppUserModelId shortcut
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
  ${If} $0 P<> 0
    ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
    ${If} $1 P<> 0
      ${IPersistFile::Load} $1 '("${shortcut}", ${STGM_READWRITE})'
      ${IUnknown::QueryInterface} $0 '("${IID_IPropertyStore}",.r2)'
      ${If} $2 P<> 0
        System::Call 'Oleaut32::SysAllocString(w "${SCIENCE_APP_ID}") i.r3'
        System::Call '*${SYSSTRUCT_PROPERTYKEY}(${PKEY_AppUserModel_ID})p.r4'
        System::Call '*${SYSSTRUCT_PROPVARIANT}(${VT_BSTR},,&i4 $3)p.r5'
        ${IPropertyStore::SetValue} $2 '($4,$5)'
        System::Call 'Oleaut32::SysFreeString($3)'
        System::Free $4
        System::Free $5
        ${IPropertyStore::Commit} $2 ""
        ${IUnknown::Release} $2 ""
        ${IPersistFile::Save} $1 '("${shortcut}",1)'
      ${EndIf}
      ${IUnknown::Release} $1 ""
    ${EndIf}
    ${IUnknown::Release} $0 ""
  ${EndIf}
!macroend

!macro CK_CreateScienceShortcut shortcut
  CreateShortcut "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe" "--science" "$INSTDIR\science.ico" 0 SW_SHOWNORMAL "" "Science teaching tools for the board"
  !insertmacro CK_SetScienceAppUserModelId "${shortcut}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode <> 1
  ${AndIf} $PassiveMode <> 1
  ${AndIfNot} ${Silent}
  ${AndIfNot} ${FileExists} "$SMPROGRAMS\${SCIENCE_NAME}.lnk"
    MessageBox MB_YESNO|MB_ICONQUESTION "Also install ${SCIENCE_NAME}?$\r$\n$\r$\nThe science teaching tools for the board - a chemistry reference, a titration simulator, a galvanic cell animator, graph plotters and graph paper - in a window of their own, with their own Start menu and desktop shortcuts.$\r$\n$\r$\nYou can always open them from Tools in ClassKernel too." /SD IDNO IDNO ck_science_skip
      !insertmacro CK_CreateScienceShortcut "$SMPROGRAMS\${SCIENCE_NAME}.lnk"
      !insertmacro CK_CreateScienceShortcut "$DESKTOP\${SCIENCE_NAME}.lnk"
    ck_science_skip:
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; An update uninstalls the old copy first: keep Science's shortcuts then.
  ${If} $UpdateMode <> 1
    Delete "$SMPROGRAMS\${SCIENCE_NAME}.lnk"
    Delete "$DESKTOP\${SCIENCE_NAME}.lnk"
  ${EndIf}
!macroend
