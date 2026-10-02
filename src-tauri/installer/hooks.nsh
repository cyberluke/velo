; Tauri NSIS installer hook (tauri.conf.json bundle.windows.nsis.installerHooks).
;
; Runs after the installer has copied the app files, written the registry keys
; and created the default Start Menu / desktop shortcuts. Adds Start Menu
; shortcuts that launch the app with a deep-link argument, so a single click
; opens the Calendar tab or the address book (Settings → People) with the
; window focused and maximized — cold start or warm start alike.
;
; $INSTDIR\NAI-E-Mail.exe follows bundle.mainBinaryName; keep the two in sync.

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$SMPROGRAMS\NAI E-Mail"
  CreateShortcut "$SMPROGRAMS\NAI E-Mail\NAI E-Mail - Calendar.lnk" "$INSTDIR\NAI-E-Mail.exe" "naiemail://calendar"
  CreateShortcut "$SMPROGRAMS\NAI E-Mail\NAI E-Mail - Contacts.lnk" "$INSTDIR\NAI-E-Mail.exe" "naiemail://contacts"
!macroend