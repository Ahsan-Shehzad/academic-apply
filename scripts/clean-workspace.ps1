param([switch]$Apply)

$ErrorActionPreference = 'Stop'
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
$taskPlan = foreach ($taskCandidate in $taskCandidates) {
    $taskResolved = (Resolve-Path -LiteralPath $taskCandidate.FullName).ProviderPath
    if ($taskResolved -eq $taskProjectRoot -or -not $taskResolved.StartsWith($taskProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup target is outside the project: $taskResolved"
    }
    if (($taskCandidate.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Linked target requires manual inspection: $taskResolved" }
    $taskSize = if ($taskCandidate.PSIsContainer) {
        [long](Get-ChildItem -LiteralPath $taskResolved -File -Recurse -Force | Measure-Object -Property Length -Sum).Sum
    } else { [long]$taskCandidate.Length }
    [pscustomobject]@{ Path = $taskResolved; Bytes = $taskSize }
}

$taskTotal = [long]($taskPlan | Measure-Object -Property Bytes -Sum).Sum
Write-Output ("{0} targets; {1:N2} GiB reclaimable." -f $taskPlan.Count, ($taskTotal / 1GB))
$taskPlan | Select-Object Path, @{Name='MiB'; Expression={[math]::Round($_.Bytes / 1MB, 2)}} | Format-Table -AutoSize | Out-String -Width 180 | Write-Output
if (-not $Apply) {
    Write-Output 'Preview only. Run this script with -Apply to remove the listed generated files.'
    return
}

# Each final path has been checked above. This script never targets the installed
# application, AppData, qa backups, candidate records or source directories.
foreach ($taskTarget in $taskPlan) {
    Remove-Item -LiteralPath $taskTarget.Path -Recurse -Force
}
$taskReport = [pscustomobject]@{
    CompletedAt = (Get-Date -Format o)
    ReclaimedBytes = $taskTotal
    DeletedTargets = $taskPlan.Count
    RetainedVersions = $taskVersions
}
$taskQARoot = Join-Path $taskProjectRoot 'qa'
New-Item -ItemType Directory -Path $taskQARoot -Force | Out-Null
$taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskQARoot 'workspace-cleanup.json') -Encoding utf8
Write-Output ("Removed {0} generated targets ({1:N2} GiB). Restore development dependencies with npm ci." -f $taskPlan.Count, ($taskTotal / 1GB))
