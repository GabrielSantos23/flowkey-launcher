param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('tauri', 'native')]
    [string]$Shell
)

# Private working set (Task Manager "Memory" column) for one shell:
#   tauri  -> asyar.exe + its msedgewebview2.exe descendants + sidecar (bun/node)
#   native -> FlowKey.Shell.exe + (no webviews expected) + sidecar (bun/node)
# Same method for both shells: Win32_PerfFormattedData_PerfProc_Process
# WorkingSetPrivate, summed over the app process, all msedgewebview2.exe
# descendants, and the sidecar.

$appName = switch ($Shell) {
    'tauri' { 'asyar' }
    'native' { 'FlowKey.Shell' }
}

$appProcs = @(Get-Process -Name $appName -ErrorAction SilentlyContinue)
if ($appProcs.Count -eq 0) {
    Write-Output "APP_NOT_FOUND $appName"
    exit 1
}

$ci = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name

$map = @{}
foreach ($p in $ci) { $map[[long]$p.ProcessId] = $p }

function Test-Ancestor {
    param([long]$PidToCheck, [long]$AncestorPid)
    $cur = $PidToCheck
    $guard = 0
    while ($cur -gt 0 -and $guard -lt 32) {
        if ($cur -eq $AncestorPid) { return $true }
        $p = $map[$cur]
        if ($null -eq $p) { return $false }
        $cur = [long]$p.ParentProcessId
        $guard++
    }
    return $false
}

$appPids = @($appProcs | ForEach-Object { [long]$_.Id })
$webviewPids = @()
$sidecarPids = @()

foreach ($p in $ci) {
    $pidL = [long]$p.ProcessId
    if ($appPids -contains $pidL) { continue }
    foreach ($appPid in $appPids) {
        if (Test-Ancestor -PidToCheck $pidL -AncestorPid $appPid) {
            if ($p.Name -like 'msedgewebview2*') { $webviewPids += $pidL }
            elseif ($p.Name -like 'bun*' -or $p.Name -like 'node*') { $sidecarPids += $pidL }
            break
        }
    }
}

$perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
    Select-Object IDProcess, Name, WorkingSetPrivate

function Get-PrivateMb {
    param([long]$TargetPid)
    $row = $perf | Where-Object { [long]$_.IDProcess -eq $TargetPid }
    if ($null -eq $row) { return 0.0 }
    return [math]::Round($row.WorkingSetPrivate / 1MB, 1)
}

$appMb = 0.0
foreach ($appPid in $appPids) { $appMb += Get-PrivateMb $appPid }

$webviewMb = 0.0
foreach ($pidL in $webviewPids) {
    $mb = Get-PrivateMb $pidL
    $webviewMb += $mb
    Write-Output ("webview   pid=$pidL mb=$mb")
}
$sidecarMb = 0.0
foreach ($pidL in $sidecarPids) {
    $mb = Get-PrivateMb $pidL
    $sidecarMb += $mb
    Write-Output ("sidecar   pid=$pidL mb=$mb")
}

$total = $appMb + $webviewMb + $sidecarMb

Write-Output ""
Write-Output ("SHELL_ONLY_MB(app process)   " + [math]::Round($appMb, 1))
Write-Output ("WEBVIEW_GROUP_MB             " + [math]::Round($webviewMb, 1))
Write-Output ("SIDECAR_MB                   " + [math]::Round($sidecarMb, 1))
Write-Output ("TOTAL_MB                     " + [math]::Round($total, 1))
