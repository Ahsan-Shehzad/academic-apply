param([switch]$Apply)

$ErrorActionPreference = 'Stop'

function Get-CleanupTargetBytes {
    param([string]$LiteralPath)
    if (-not (Test-Path -LiteralPath $LiteralPath)) { return [long]0 }
    $taskItem = Get-Item -LiteralPath $LiteralPath -Force
    if (-not $taskItem.PSIsContainer) { return [long]$taskItem.Length }
    return [long](Get-ChildItem -LiteralPath $LiteralPath -File -Recurse -Force | Measure-Object -Property Length -Sum).Sum
}

function Invoke-CleanupTarget {
    param(
        [string]$LiteralPath,
        [long]$InitialBytes,
        [scriptblock]$RemoveAction,
        [scriptblock]$ReadBytesAction,
        [scriptblock]$WaitAction = { Start-Sleep -Milliseconds 750 },
        [ValidateRange(1, 5)][int]$MaxAttempts = 3
    )
    $taskLastError = $null
    $taskRemaining = $InitialBytes
    for ($taskAttempt = 1; $taskAttempt -le $MaxAttempts; $taskAttempt++) {
        try {
            & $RemoveAction $LiteralPath
            $taskRemaining = [long](& $ReadBytesAction $LiteralPath)
            return [pscustomobject]@{
                Path = $LiteralPath; Status = 'removed'; Attempts = $taskAttempt
                ReclaimedBytes = [math]::Max(0, $InitialBytes - $taskRemaining)
                RemainingBytes = $taskRemaining; Error = $null
            }
        } catch {
            $taskLastError = $_.Exception.Message
            if ($taskAttempt -lt $MaxAttempts) { & $WaitAction }
        }
    }
    # Recursive removal can remove some files before encountering a locked one.
    # Count that actual progress and retain the failure instead of aborting.
    try { $taskRemaining = [long](& $ReadBytesAction $LiteralPath) } catch { $taskRemaining = $InitialBytes }
    return [pscustomobject]@{
        Path = $LiteralPath; Status = 'pending'; Attempts = $MaxAttempts
        ReclaimedBytes = [math]::Max(0, $InitialBytes - $taskRemaining)
        RemainingBytes = $taskRemaining; Error = $taskLastError
    }
}

$taskProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
foreach ($taskRequired in @('package.json', 'src', 'desktop', 'release')) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskProjectRoot $taskRequired))) {
        throw "Expected project content is missing: $taskRequired"
    }
}

# Keep the verified current delivery and one rollback version.
$taskVersions = @('1.8.0', '1.7.0')
$taskReleaseRoot = Join-Path $taskProjectRoot 'release'
$taskKeepFiles = @('README.md', 'SHA256SUMS.txt', 'VALIDATION.md')
foreach ($taskVersion in $taskVersions) {
    $taskKeepFiles += "AcademicApply-Setup-$taskVersion.exe"
    $taskKeepFiles += "AcademicApply-Setup-$taskVersion.exe.blockmap"
    $taskKeepFiles += "AcademicApply-Source-$taskVersion.zip"
}

$taskChecksums = @{}
foreach ($taskLine in Get-Content -LiteralPath (Join-Path $taskReleaseRoot 'SHA256SUMS.txt')) {
    if ($taskLine -match '^([a-fA-F0-9]{64})\s+(.+)$') {
        $taskChecksums[$Matches[2]] = $Matches[1]
    }
}
foreach ($taskVersion in $taskVersions) {
    foreach ($taskName in @("AcademicApply-Setup-$taskVersion.exe", "AcademicApply-Source-$taskVersion.zip")) {
        $taskFile = Join-Path $taskReleaseRoot $taskName
        if (-not (Test-Path -LiteralPath $taskFile -PathType Leaf)) { throw "Retained delivery is missing: $taskFile" }
        if (-not $taskChecksums.ContainsKey($taskName) -or (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash -ne $taskChecksums[$taskName]) {
            throw "Retained delivery checksum mismatch: $taskName"
        }
    }
}

$taskCandidates = @(Get-ChildItem -LiteralPath $taskProjectRoot -Directory -Force | Where-Object {
    $_.Name -like 'release-*' -or $_.Name -in @('node_modules', 'dist', '.test-data')
})
$taskCandidates += @(Get-ChildItem -LiteralPath $taskReleaseRoot -File -Force | Where-Object { $_.Name -notin $taskKeepFiles })
$taskPlan = @(foreach ($taskCandidate in $taskCandidates) {
    $taskResolved = (Resolve-Path -LiteralPath $taskCandidate.FullName).ProviderPath
    if ($taskResolved -eq $taskProjectRoot -or -not $taskResolved.StartsWith($taskProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup target is outside the project: $taskResolved"
    }
    if (($taskCandidate.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Linked target requires manual inspection: $taskResolved" }
    $taskSize = Get-CleanupTargetBytes -LiteralPath $taskResolved
    [pscustomobject]@{ Path = $taskResolved; Bytes = $taskSize }
})

$taskTotal = [long]($taskPlan | Measure-Object -Property Bytes -Sum).Sum
Write-Output ("{0} targets; {1:N2} GiB reclaimable." -f $taskPlan.Count, ($taskTotal / 1GB))
$taskPlan | Select-Object Path, @{Name='MiB'; Expression={[math]::Round($_.Bytes / 1MB, 2)}} | Format-Table -AutoSize | Out-String -Width 180 | Write-Output
if (-not $Apply) {
    Write-Output 'Preview only. Run this script with -Apply to remove the listed generated files.'
    return
}

# Each final path has been checked above. This script never targets the installed
# application, AppData, qa backups, candidate records or source directories.
$taskResults = @(foreach ($taskTarget in $taskPlan) {
    Write-Output ("Cleaning {0}" -f $taskTarget.Path) | Out-Host
    $taskResult = Invoke-CleanupTarget -LiteralPath $taskTarget.Path -InitialBytes $taskTarget.Bytes -ReadBytesAction {
        param($taskPath) Get-CleanupTargetBytes -LiteralPath $taskPath
    } -RemoveAction {
        param($taskPath)
        # Recheck the final target immediately before each removal attempt.
        if (-not (Test-Path -LiteralPath $taskPath)) { return }
        $taskChecked = (Resolve-Path -LiteralPath $taskPath).ProviderPath
        if (-not $taskChecked.StartsWith($taskProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Cleanup target is outside the project: $taskChecked"
        }
        if (((Get-Item -LiteralPath $taskChecked -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Linked target requires manual inspection: $taskChecked"
        }
        Remove-Item -LiteralPath $taskChecked -Recurse -Force -ErrorAction Stop
    }
    if ($taskResult.Status -eq 'pending') {
        Write-Warning ("Skipped a locked or inaccessible target after {0} attempts: {1}. {2}" -f $taskResult.Attempts, $taskResult.Path, $taskResult.Error)
    }
    $taskResult
})
$taskPending = @($taskResults | Where-Object Status -eq 'pending')
$taskRemoved = @($taskResults | Where-Object Status -eq 'removed')
$taskReclaimed = [long]($taskResults | Measure-Object -Property ReclaimedBytes -Sum).Sum
$taskReport = [pscustomobject]@{
    CompletedAt = (Get-Date -Format o)
    Status = $(if ($taskPending.Count) { 'partial' } else { 'completed' })
    ReclaimedBytes = $taskReclaimed
    DeletedTargets = $taskRemoved.Count
    PendingTargets = $taskPending
    Results = $taskResults
    RetainedVersions = $taskVersions
}
$taskQARoot = Join-Path $taskProjectRoot 'qa'
New-Item -ItemType Directory -Path $taskQARoot -Force | Out-Null
$taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskQARoot 'workspace-cleanup.json') -Encoding utf8
Write-Output ("Removed {0} generated targets; reclaimed {1:N2} GiB; {2} targets pending. Restore development dependencies with npm ci." -f $taskRemoved.Count, ($taskReclaimed / 1GB), $taskPending.Count)
if ($taskPending.Count) {
    Write-Warning 'Other targets were processed. Close applications using the pending build files, or wait for background scanning to finish, then run this script again. Details are in qa/workspace-cleanup.json. No applications were force-closed.'
}
