"use strict";
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

function parseModels(output) {
  return [
    ...String(output).matchAll(
      /^\s*([a-z][a-z0-9._-]+)(?:\t+| {2,})([^\r\n]+)$/gm,
    ),
  ]
    .map((m) => ({ id: m[1], label: m[2].trim(), efforts: [] }))
    .filter((m, i, rows) => rows.findIndex((r) => r.id === m.id) === i);
}
function connectionKey(settings, provider) {
  return JSON.stringify([
    settings.providerPaths?.[provider] || "",
    settings.models?.[provider] || "",
    settings.effort || "",
  ]);
}
const psLiteral = (value) => "'" + String(value).replace(/'/g, "''") + "'";
const encoded = (value) => Buffer.from(value, "utf16le").toString("base64");

// Electron and background launchers may own a hidden console. CREATE_NEW_CONSOLE
// avoids inheriting it; a receipt confirms the new PowerShell session started.
async function openSignInTerminal(spec, workspace, exec, options = {}) {
  if (process.platform !== "win32")
    throw new Error(
      "Open the CLI in your system terminal to complete sign-in.",
    );
  const ps = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const receipt = path.join(
    workspace,
    "signin-" + crypto.randomUUID() + ".json",
  );
  const title =
    "AcademicApply - " +
    (options.label || "Antigravity sign-in") +
    " " +
    crypto.randomUUID().slice(0, 8);
  const inner = [
    `$Host.UI.RawUI.WindowTitle = ${psLiteral(title)}`,
    `[IO.File]::WriteAllText(${psLiteral(receipt + ".tmp")}, (ConvertTo-Json @{ pid = $PID; started = $true }))`,
    `[IO.File]::Move(${psLiteral(receipt + ".tmp")}, ${psLiteral(receipt)})`,
    `Write-Host ${psLiteral(options.before || "Complete Antigravity sign-in here if requested. If you are already signed in, close this terminal and return to Test service.")}`,
    `& ${psLiteral(spec.file)} ${spec.args.map(psLiteral).join(" ")}`,
    `Write-Host ${psLiteral(options.after || "Return to AcademicApply and run Test service. You may close this terminal.")}`,
  ].join("\n");
  const outer = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AcademicSignInConsole {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct STARTUPINFO {
    public int cb; public string lpReserved, lpDesktop, lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)] public struct PROCESS_INFORMATION {
    public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CreateProcess(
    string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
    bool inheritHandles, uint flags, IntPtr environment, string directory, ref STARTUPINFO startup, out PROCESS_INFORMATION process);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
$startup = New-Object AcademicSignInConsole+STARTUPINFO
$startup.cb = [Runtime.InteropServices.Marshal]::SizeOf($startup)
$startup.dwFlags = 1
$startup.wShowWindow = 1
$startup.lpDesktop = 'winsta0\\default'
$startup.lpTitle = ${psLiteral(title)}
$processInfo = New-Object AcademicSignInConsole+PROCESS_INFORMATION
$command = New-Object Text.StringBuilder(${psLiteral('"' + ps + '" -NoProfile -NoExit -EncodedCommand ' + encoded(inner))})
$created = [AcademicSignInConsole]::CreateProcess(${psLiteral(ps)}, $command, [IntPtr]::Zero, [IntPtr]::Zero, $false, 0x10, [IntPtr]::Zero, ${psLiteral(workspace)}, [ref]$startup, [ref]$processInfo)
if (-not $created) { throw (New-Object ComponentModel.Win32Exception([Runtime.InteropServices.Marshal]::GetLastWin32Error())) }
[AcademicSignInConsole]::CloseHandle($processInfo.hThread) | Out-Null
[AcademicSignInConsole]::CloseHandle($processInfo.hProcess) | Out-Null`;
  try {
    await exec(
      ps,
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded(outer)],
      { cwd: workspace, timeout: 15000 },
    );
    for (let attempt = 0; attempt < 50; attempt++) {
      if (fs.existsSync(receipt)) {
        const result = JSON.parse(fs.readFileSync(receipt, "utf8"));
        if (result.started && Number.isInteger(result.pid)) {
          try {
            const check = `$ErrorActionPreference = 'Stop'
for ($attempt = 0; $attempt -lt 50; $attempt++) {
  $terminalWindow = Get-Process | Where-Object { $_.MainWindowTitle -like ${psLiteral("*" + title + "*")} -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($terminalWindow) { ConvertTo-Json -Compress @{ visible = $true; hostPid = $terminalWindow.Id }; exit 0 }
  Start-Sleep -Milliseconds 100
}
throw 'PowerShell started, but no visible sign-in window was found. Open the CLI manually and return to Test service.'`;
            const confirmation = await exec(
              ps,
              [
                "-NoProfile",
                "-NonInteractive",
                "-EncodedCommand",
                encoded(check),
              ],
              { timeout: 10000 },
            );
            return { ...result, ...JSON.parse(confirmation.stdout) };
          } catch (error) {
            await exec("taskkill.exe", [
              "/PID",
              String(result.pid),
              "/T",
              "/F",
            ]).catch(() => {});
            throw error;
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      "The sign-in terminal did not confirm startup. Open PowerShell, run the detected CLI executable, then return to Test service.",
    );
  } finally {
    fs.rmSync(receipt, { force: true });
    fs.rmSync(receipt + ".tmp", { force: true });
  }
}
module.exports = { parseModels, connectionKey, openSignInTerminal, psLiteral };
