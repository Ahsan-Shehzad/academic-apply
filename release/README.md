# Local release files

| Version | Purpose | Installer |
| --- | --- | --- |
| 1.8.0 | Current release | [Windows x64 setup](https://github.com/Ahsan-Shehzad/academic-apply/releases/download/v1.8.0/AcademicApply-Setup-1.8.0.exe) |
| 1.7.0 | Previous release for rollback | [Windows x64 setup](https://github.com/Ahsan-Shehzad/academic-apply/releases/download/v1.7.0/AcademicApply-Setup-1.7.0.exe) |

Matching source ZIP archives and installer blockmaps are retained alongside these installers. The 1.8.0 source archive reflects the current repository setup and README; the 1.8.0 installer is the already verified application build.

Verify files using [SHA256SUMS.txt](SHA256SUMS.txt):

```powershell
Get-FileHash .\release\AcademicApply-Setup-1.8.0.exe -Algorithm SHA256
```

See [VALIDATION.md](VALIDATION.md) for delivery checks. Installers are unsigned.

Installers, blockmaps and source ZIPs are excluded from Git history and published as [GitHub Release assets](https://github.com/Ahsan-Shehzad/academic-apply/releases). Each release includes a per-version `SHA256SUMS.txt`. A fresh clone contains these instructions and the combined local manifest; download release assets or build the app to obtain an installer.

Rolling back the executable does not roll back workspace data. Preserve a separate workspace backup before opening data with an older release.
