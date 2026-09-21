param(
    [string]$ExePath = 'D:\projects\asyar\flowkey-native\shell\publish-measure\FlowKey.Shell.exe',
    [string]$WorkDir = 'D:\projects\asyar\flowkey-native\shell\publish-measure'
)

# Open-time measurement: trigger = WM_HOTKEY posted into the registering
# thread's queue (the registered-hotkey delivery hop), then poll
# IsWindowVisible on the cached launcher hwnd at ~2 ms granularity.
# Same method as previous phases.

$ErrorActionPreference = 'Stop'
Add-Type -Name U32 -Namespace M -MemberDefinition @'
[DllImport("user32.dll", SetLastError=true)] public static extern bool PostThreadMessage(uint threadId, uint msg, IntPtr wParam, IntPtr lParam);
[DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessageW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder sb, int max);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
'@

$WM_HOTKEY = 0x0312
$SUMMON_ID = 0x464B
$exe = $ExePath
$wd = $WorkDir

function Get-ShellProc {
    return @(Get-Process -Name 'FlowKey.Shell' -ErrorAction SilentlyContinue)
}

function Stop-Shell {
    Get-ShellProc | ForEach-Object { $_.Kill() }
    Start-Sleep -Seconds 2
}

function Get-LauncherHwnd {
    $proc = Get-ShellProc | Select-Object -First 1
    if (-not $proc) { return [IntPtr]::Zero }
    $targetPid = [uint32]$proc.Id
    $script:launcherHwnd = [IntPtr]::Zero
    $cb = [M.U32+EnumProc]{
        param($h, $l)
        $owner = [uint32]0
        [M.U32]::GetWindowThreadProcessId($h, [ref]$owner) | Out-Null
        if ($owner -eq $targetPid) {
            $sb = New-Object System.Text.StringBuilder 64
            [M.U32]::GetWindowTextW($h, $sb, 64) | Out-Null
            if ($sb.ToString() -eq 'FlowKey') {
                $script:launcherHwnd = $h
                return $false
            }
        }
        return $true
    }
    [M.U32]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    return $script:launcherHwnd
}

function Post-Summon {
    $proc = Get-ShellProc | Select-Object -First 1
    if (-not $proc) { throw 'shell not running' }
    $proc.Refresh()
    foreach ($t in $proc.Threads) {
        [M.U32]::PostThreadMessage([uint32]$t.Id, $WM_HOTKEY, [IntPtr]$SUMMON_ID, [IntPtr]::Zero) | Out-Null
    }
    $hwnd = Get-LauncherHwnd
    if ($hwnd -ne [IntPtr]::Zero) {
        [M.U32]::PostMessageW($hwnd, $WM_HOTKEY, [IntPtr]$SUMMON_ID, [IntPtr]::Zero) | Out-Null
    }
}

function Summon-AndMeasure {
    $hwnd = Get-LauncherHwnd
    if ($hwnd -eq [IntPtr]::Zero) { return -2 }
    Post-Summon
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt 2000) {
        if ([M.U32]::IsWindowVisible($hwnd)) {
            return $sw.ElapsedMilliseconds
        }
        Start-Sleep -Milliseconds 1
    }
    return -1
}

function Hide-Summoned {
    $hwnd = Get-LauncherHwnd
    if ($hwnd -eq [IntPtr]::Zero) { return $false }
    Post-Summon
    Start-Sleep -Milliseconds 600
    return -not [M.U32]::IsWindowVisible($hwnd)
}

Stop-Shell

$times = @()
foreach ($round in 1..3) {
    Start-Process -FilePath $exe -WorkingDirectory $wd
    Start-Sleep -Seconds 8
    $times += "cold-round$round=$(Summon-AndMeasure)"
    if ($round -eq 3) {
        for ($w = 1; $w -le 5; $w++) {
            Start-Sleep -Milliseconds 1200
            if (-not (Hide-Summoned)) { $times += "hide-fail-warm$w" }
            $times += "warm$w=$(Summon-AndMeasure)"
        }
    }
    if (-not (Hide-Summoned)) { $times += "hide-fail-round$round" }
    Start-Sleep -Seconds 1
    Stop-Shell
}

Write-Output $times
