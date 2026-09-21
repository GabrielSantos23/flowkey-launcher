# Idle + settings-window memory measurement for the native shell.
# Method identical to scripts/measure-idle.ps1 (private working set),
# with the settings-window delta around a WM_APP_OPEN_SETTINGS round trip.

$ErrorActionPreference = 'Stop'
Add-Type -Name U32 -Namespace M -MemberDefinition @'
public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder sb, int max);
[DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessageW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
'@

$WM_APP_OPEN_SETTINGS = 0x8001
$WM_CLOSE = 0x0010
$exe = 'D:\projects\asyar\flowkey-native\shell\publish-measure\FlowKey.Shell.exe'
$wd = 'D:\projects\asyar\flowkey-native\shell\publish-measure'

function Get-ShellProc {
    return @(Get-Process -Name 'FlowKey.Shell' -ErrorAction SilentlyContinue)
}

function Get-LauncherHwnd {
    $proc = Get-ShellProc | Select-Object -First 1
    if (-not $proc) { return [IntPtr]::Zero }
    $targetPid = [uint32]$proc.Id
    $script:foundHwnd = [IntPtr]::Zero
    $cb = [M.U32+EnumProc]{
        param($h, $l)
        $owner = [uint32]0
        [M.U32]::GetWindowThreadProcessId($h, [ref]$owner) | Out-Null
        if ($owner -eq $targetPid) {
            $sb = New-Object System.Text.StringBuilder 64
            [M.U32]::GetWindowTextW($h, $sb, 64) | Out-Null
            if ($sb.ToString() -eq 'FlowKey') {
                $script:foundHwnd = $h
                return $false
            }
        }
        return $true
    }
    [M.U32]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    return $script:foundHwnd
}

function Get-SettingsHwnd {
    $proc = Get-ShellProc | Select-Object -First 1
    if (-not $proc) { return [IntPtr]::Zero }
    $targetPid = [uint32]$proc.Id
    $script:foundHwnd = [IntPtr]::Zero
    $cb = [M.U32+EnumProc]{
        param($h, $l)
        $owner = [uint32]0
        [M.U32]::GetWindowThreadProcessId($h, [ref]$owner) | Out-Null
        if ($owner -eq $targetPid) {
            $sb = New-Object System.Text.StringBuilder 64
            [M.U32]::GetWindowTextW($h, $sb, 64) | Out-Null
            if ($sb.ToString() -eq 'FlowKey Settings') {
                $script:foundHwnd = $h
                return $false
            }
        }
        return $true
    }
    [M.U32]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    return $script:foundHwnd
}

function Read-Memory {
    param([string]$Label)
    $out = & powershell -ExecutionPolicy Bypass -File 'D:\projects\asyar\scripts\measure-idle.ps1' -Shell native
    $shellMb = ($out | Select-String 'SHELL_ONLY_MB').ToString().Split(' ')[-1]
    $sidecarMb = ($out | Select-String 'SIDECAR_MB').ToString().Split(' ')[-1]
    $totalMb = ($out | Select-String 'TOTAL_MB').ToString().Split(' ')[-1]
    $freeMb = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB, 0)
    Write-Output ("$Label shell=$shellMb sidecar=$sidecarMb total=$totalMb freeRamMb=$freeMb")
}

Get-ShellProc | ForEach-Object { $_.Kill() }
Start-Sleep -Seconds 2

Start-Process -FilePath $exe -WorkingDirectory $wd
Start-Sleep -Seconds 8

$hwnd = Get-LauncherHwnd
if ($hwnd -eq [IntPtr]::Zero) { throw 'launcher window not found' }

# summon then hide, then idle 5 minutes
[M.U32]::PostMessageW($hwnd, 0x0312, [IntPtr]0x464B, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 2
[M.U32]::PostMessageW($hwnd, 0x0312, [IntPtr]0x464B, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 2

Write-Output "idle-wait-300s..."
Start-Sleep -Seconds 300

Read-Memory -Label 'IDLE_A'
Start-Sleep -Seconds 60
Read-Memory -Label 'IDLE_B'

# settings window delta
Read-Memory -Label 'SETTINGS_BEFORE'
[M.U32]::PostMessageW($hwnd, $WM_APP_OPEN_SETTINGS, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 5
$shwnd = Get-SettingsHwnd
Write-Output "settings-hwnd=$shwnd"
Read-Memory -Label 'SETTINGS_OPEN'
if ($shwnd -ne [IntPtr]::Zero) {
    [M.U32]::PostMessageW($shwnd, $WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}
Start-Sleep -Seconds 3
Read-Memory -Label 'SETTINGS_JUST_AFTER_CLOSE'
Start-Sleep -Seconds 60
Read-Memory -Label 'SETTINGS_60S_AFTER_CLOSE'

Get-ShellProc | ForEach-Object { $_.Kill() }
Write-Output 'DONE'
