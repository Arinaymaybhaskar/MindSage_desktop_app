; Extra steps electron-builder splices into the NSIS installer/uninstaller
; (picked up from assets/installer.nsh: build.directories.buildResources).
;
; Uninstalling removes the program, not the journal. The journal, backups and
; the search index live in %APPDATA%\MindSage and are the user's only copy, so
; the default is to keep them (a reinstall opens the same journal) and
; deleting is an explicit "Yes" that names the folder.
;
; Cases this deliberately leaves alone:
;   - an update: electron-builder runs the old uninstaller with --updated
;     (${isUpdated}); the user must never be asked, or lose data, there.
;   - a silent uninstall (/S): nobody can answer, so the data stays.
;   - --delete-app-data: electron-builder handles that flag itself.
; Per-user data only: $APPDATA is the current user's, so another Windows
; user's journal is never touched. (The Microsoft Store build is not this
; installer; the Store removes app data by its own rules.)

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${ifNot} ${Silent}
      ClearErrors
      ${GetParameters} $R0
      ${GetOptions} $R0 "--delete-app-data" $R1
      ${if} ${Errors}
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your journal and settings?$\r$\n$\r$\nThis permanently removes the folder:$\r$\n$APPDATA\${APP_FILENAME}$\r$\n$\r$\nIt holds your entries, their backups and the search index. Choose No to keep them; reinstalling MindSage will open your journal again." IDNO mindsageKeepData
        SetShellVarContext current
        RMDir /r "$APPDATA\${APP_FILENAME}"
        !ifdef APP_PACKAGE_NAME
          RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
        !endif
        mindsageKeepData:
      ${endIf}
    ${endIf}
  ${endIf}
!macroend
