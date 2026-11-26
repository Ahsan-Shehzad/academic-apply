# Local release files

| Version | Purpose | Installer |
| --- | --- | --- |
| 1.9.3 | Current release | [Windows x64 setup](https://github.com/Ahsan-Shehzad/academic-apply/releases/download/v1.9.3/AcademicApply-Setup-1.9.3.exe) |
| 1.9.2 | Previous release | [Windows x64 setup](https://github.com/Ahsan-Shehzad/academic-apply/releases/download/v1.9.2/AcademicApply-Setup-1.9.2.exe) |
| 1.9.0 | Earlier release for rollback | [Windows x64 setup](https://github.com/Ahsan-Shehzad/academic-apply/releases/download/v1.9.0/AcademicApply-Setup-1.9.0.exe) |
| 1.8.0 | Archived release for rollback | [Windows x64 setup](https://github.com/Ahsan-Shehzad/academic-apply/releases/download/v1.8.0/AcademicApply-Setup-1.8.0.exe) |

Matching source ZIP archives and installer blockmaps are retained alongside these installers. The 1.9.3 installer and source archive include 2-query WebDiscovery batching, activity-refreshed ACP timeouts, deduplicated portal planning, concurrent MCP search execution, and city-to-country location normalization for the built-in Chrome Portal MCP.

Verify files using [SHA256SUMS.txt](SHA256SUMS.txt):

```powershell
Get-FileHash .\release\AcademicApply-Setup-1.9.3.exe -Algorithm SHA256
```

See [VALIDATION.md](VALIDATION.md) for delivery checks. Installers are unsigned.

Installers, blockmaps and source ZIPs are excluded from Git history and published as [GitHub Release assets](https://github.com/Ahsan-Shehzad/academic-apply/releases). Each release includes a per-version `SHA256SUMS.txt`. A fresh clone contains these instructions and the combined local manifest; download release assets or build the app to obtain an installer.

Rolling back the executable does not roll back workspace data. Preserve a separate workspace backup before opening data with an older release.
