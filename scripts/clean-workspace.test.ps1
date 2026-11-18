$ErrorActionPreference = 'Stop'

# Load only function definitions; never execute the cleanup entry point.
$taskTokens = $null
$taskErrors = $null
$taskScript = Join-Path $PSScriptRoot 'clean-workspace.ps1'
$taskAst = [System.Management.Automation.Language.Parser]::ParseFile($taskScript, [ref]$taskTokens, [ref]$taskErrors)
if ($taskErrors.Count) { throw ($taskErrors | Out-String) }
foreach ($taskFunction in $taskAst.FindAll({ param($taskNode) $taskNode -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([scriptblock]::Create($taskFunction.Extent.Text))
}
function Assert-CleanupEqual {
    param($Actual, $Expected, [string]$Message)
    if ($Actual -ne $Expected) { throw "$Message - expected $Expected, got $Actual" }
}

# A transient file lock clears on the third attempt.
$taskState = @{ Calls = 0; Waits = 0; Bytes = 100 }
$taskResult = Invoke-CleanupTarget -LiteralPath 'fixture-transient' -InitialBytes 100 -RemoveAction {
    param($taskPath)
    $taskState.Calls++
    if ($taskState.Calls -lt 3) { throw [IO.IOException]::new('app.asar is being used by another process') }
    $taskState.Bytes = 0
} -ReadBytesAction { param($taskPath) $taskState.Bytes } -WaitAction { $taskState.Waits++ }
Assert-CleanupEqual $taskResult.Status 'removed' 'Transient lock should recover'
Assert-CleanupEqual $taskResult.Attempts 3 'Retries should be bounded'
Assert-CleanupEqual $taskState.Waits 2 'Only failed attempts should wait'
Assert-CleanupEqual $taskResult.ReclaimedBytes 100 'Successful deletion should report actual bytes'

# A persistent lock cannot prevent the following target from being removed.
$taskState = @{ Calls = @{}; Sizes = @{ locked = 100; healthy = 50 } }
$taskResults = @(foreach ($taskTarget in @(@{Path='locked';Bytes=100}, @{Path='healthy';Bytes=50})) {
    Invoke-CleanupTarget -LiteralPath $taskTarget.Path -InitialBytes $taskTarget.Bytes -RemoveAction {
        param($taskPath)
        $taskState.Calls[$taskPath]++
        if ($taskPath -eq 'locked') {
            $taskState.Sizes[$taskPath] = 20
            throw [IO.IOException]::new('app.asar is locked')
        }
        $taskState.Sizes[$taskPath] = 0
    } -ReadBytesAction { param($taskPath) $taskState.Sizes[$taskPath] } -WaitAction {}
})
Assert-CleanupEqual $taskResults[0].Status 'pending' 'Persistent lock should remain pending'
Assert-CleanupEqual $taskResults[0].Attempts 3 'Persistent lock should stop retrying'
Assert-CleanupEqual $taskResults[0].RemainingBytes 20 'Locked files must remain reported'
Assert-CleanupEqual $taskResults[1].Status 'removed' 'Later targets must still run'
Assert-CleanupEqual (($taskResults | Measure-Object ReclaimedBytes -Sum).Sum) 130 'Partial removals must be counted without claiming the locked bytes'

# A rerun with an already absent target is harmless.
$taskResult = Invoke-CleanupTarget -LiteralPath 'fixture-absent' -InitialBytes 0 -RemoveAction {} -ReadBytesAction { param($taskPath) 0 } -WaitAction { throw 'No delay expected' }
Assert-CleanupEqual $taskResult.Status 'removed' 'Absent targets should be harmless'
Assert-CleanupEqual $taskResult.ReclaimedBytes 0 'Absent targets must not inflate reclaimed bytes'

# Unreadable remaining metadata must not inflate progress or abort other work.
$taskResult = Invoke-CleanupTarget -LiteralPath 'fixture-denied' -InitialBytes 200 -RemoveAction { param($taskPath) throw [UnauthorizedAccessException]::new('Access denied') } -ReadBytesAction { param($taskPath) throw 'Cannot measure remaining files' } -WaitAction {}
Assert-CleanupEqual $taskResult.Status 'pending' 'Access errors should be recorded'
Assert-CleanupEqual $taskResult.ReclaimedBytes 0 'Unknown remaining size must be conservative'
Assert-CleanupEqual $taskResult.RemainingBytes 200 'Unknown remaining size should retain the original estimate'

Write-Output 'Passed 4 cleanup scenarios: transient lock, persistent lock with continued progress, harmless rerun, and unreadable metadata. No files were deleted.'
