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
; Outside an update, the updater's copy of the installer and the empty install
; folder go on every uninstall, /S included: neither holds user data.
; Per-user data only: it removes the current user's folder, never another
; Windows user's. (If a standard user elevates with an administrator's
; credentials to uninstall an all-users install, "current" is that
; administrator, the same limit as electron-builder's own delete-app-data.)
; There is no MSIX/appx target; if one is added, the Store's uninstall removes
; the package's app data by its own rules and this prompt does not apply.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${ifNot} ${Silent}
      ClearErrors
      ${GetParameters} $R0
      ${GetOptions} $R0 "--delete-app-data" $R1
      ${if} ${Errors}
        ; An all-users install runs in the "all" shell context, where $APPDATA
        ; is ProgramData. Electron's userData is per user, so name and remove
        ; the current user's folder, then put the context back so the rest of
        ; the uninstall (registry key, Start menu) is not left half done.
        ${if} $installMode == "all"
          SetShellVarContext current
        ${endif}
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your journal and settings?$\r$\n$\r$\nThis permanently removes the folder:$\r$\n$APPDATA\${APP_FILENAME}$\r$\n$\r$\nIt holds your entries, photos and recordings, their backups and the search index. Choose No to keep them; reinstalling MindSage will open your journal again." IDYES mindsageDeleteData
        Goto mindsageKeepData
        mindsageDeleteData:
        RMDir /r "$APPDATA\${APP_FILENAME}"
        mindsageKeepData:
        ${if} $installMode == "all"
          SetShellVarContext all
        ${endif}
      ${endIf}
    ${endIf}

    ; No user data below, so it goes on every uninstall, /S included (KAN-384).
    ; un.onInit made $INSTDIR the working folder, which Windows will not
    ; remove: step out so electron-builder's RMDir /r $INSTDIR, which runs
    ; after this macro, takes the emptied folder too.
    SetOutPath $TEMP
    ; The copy of the installer electron-builder keeps for the updater, then
    ; its folder, only if nothing else is in it.
    !ifdef APP_INSTALLER_STORE_FILE
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
      ${GetParent} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}" $R0
      RMDir "$R0"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
    !endif
  ${endIf}
!macroend
