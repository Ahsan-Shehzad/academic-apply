param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
$wordInstance = $null
$documentInstance = $null
$previousPrintHiddenText = $null
try {
    $wordInstance = New-Object -ComObject Word.Application
    $wordInstance.Visible = $false
    $wordInstance.DisplayAlerts = 0
    $wordInstance.AutomationSecurity = 3
    $previousPrintHiddenText = $wordInstance.Options.PrintHiddenText
    $wordInstance.Options.PrintHiddenText = $false
    $documentInstance = $wordInstance.Documents.Open($InputFile, $false, $true, $false)
    $documentInstance.ExportAsFixedFormat($OutputFile, 17)
    Write-Output 'PDF exported'
} finally {
    if ($null -ne $documentInstance) { $documentInstance.Close(0); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($documentInstance) }
    if ($null -ne $wordInstance) {
        if ($null -ne $previousPrintHiddenText) { $wordInstance.Options.PrintHiddenText = $previousPrintHiddenText }
        $wordInstance.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($wordInstance)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
