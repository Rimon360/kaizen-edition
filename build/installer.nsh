; electron-builder NSIS custom hooks.
;
; The voice-cloning sidecar (chatterbox-sidecar.exe) is a non-Electron child
; process that electron-builder doesn't track. On a reinstall / auto-update it
; can still be running, locking files in the install directory and hanging the
; (un)installer -> a half-installed app + a zombie that holds the single-instance
; lock, so the relaunched app "won't open".
;
; The built-in app-closing check (CHECK_APP_RUNNING) only knows about
; "${APP_EXECUTABLE_FILENAME}" (KAIZEN EDITION.exe) and is UNAWARE of the bundled
; chatterbox-sidecar.exe. So we force-kill both the sidecar AND any lingering app
; process ourselves, at every point where files are about to be touched.
;
; taskkill on a process that isn't running is a harmless no-op, so this is safe for
; fresh installs and silent auto-updates too.
;
; Keep this file ASCII-only.

!macro killKaizenProcesses
  nsExec::Exec 'taskkill /F /T /IM "chatterbox-sidecar.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
!macroend

; Installer start: kill before we write anything into the install dir.
!macro customInit
  !insertmacro killKaizenProcesses
  ; Give Windows a moment to release the file handles before we overwrite files.
  Sleep 1500
!macroend

; Uninstaller start (un.onInit) -- runs BEFORE un.atomicRMDir moves the old install
; to %TEMP%\...\old-install. THIS is the critical one: during an auto-update the
; (old) uninstaller does the atomic file move, and if the app or the sidecar is
; still alive their files get renamed out from under a running process. That then
; crashes lazy-require()ing a module after the temp is cleaned ("ENOENT ...
; old-install\resources\package.json"), or the move fails and the update aborts
; half-done. Force-kill both here so the move always works on free files.
!macro customUnInit
  !insertmacro killKaizenProcesses
  Sleep 1500
!macroend

; Uninstaller end: belt-and-suspenders cleanup of any sidecar that respawned.
!macro customUnInstall
  nsExec::Exec 'taskkill /F /T /IM "chatterbox-sidecar.exe"'
  Pop $0
  Sleep 500
!macroend
