!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /TN "AcademicApply Weekly Discovery" /F'
!macroend
