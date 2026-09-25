param(
    [string]$ExePath = 'D:\projects\asyar\flowkey-native\shell\publish-measure\FlowKey.Shell.exe',
    [string]$WorkDir = 'D:\projects\asyar\flowkey-native\shell\publish-measure',
    [int]$IdleSeconds = 300,
    [switch]$SettingsCycle
)

$ErrorActionPreference = 'Stop'
Add-Type -Name U32 -Namespace M -MemberDefinition @'
public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder sb, int max);
[DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessageW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
'@

$exe = $ExePath
$wd = $WorkDir

function Get-HwndByTitle {
    param([string]$Title)
    $proc = Get-Process -Name 'FlowKey.Shell' -ErrorAction SilentlyContinue | Select-Object -First 1
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
            if ($sb.ToString() -eq $Title) {
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

Get-Process -Name 'FlowKey.Shell' -ErrorAction SilentlyContinue | ForEach-Object { $_.Kill() }
Start-Sleep -Seconds 2

Start-Process -FilePath $exe -WorkingDirectory $wd
Start-Sleep -Seconds 8

$hwnd = Get-HwndByTitle -Title 'FlowKey'
[M.U32]::PostMessageW($hwnd, 0x0312, [IntPtr]0x464B, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 2
[M.U32]::PostMessageW($hwnd, 0x0312, [IntPtr]0x464B, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 2

Write-Output "idle-wait-${IdleSeconds}s..."
Start-Sleep -Seconds $IdleSeconds
Read-Memory -Label 'IDLE'

if ($SettingsCycle) {
    Read-Memory -Label 'SETTINGS_BEFORE'
    [M.U32]::PostMessageW($hwnd, 0x8001, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Seconds 5
    $shwnd = Get-HwndByTitle -Title 'FlowKey Settings'
    Read-Memory -Label 'SETTINGS_OPEN'
    if ($shwnd -ne [IntPtr]::Zero) {
        [M.U32]::PostMessageW($shwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    }
    Start-Sleep -Seconds 3
    Read-Memory -Label 'SETTINGS_JUST_AFTER_CLOSE'
    Start-Sleep -Seconds 60
    Read-Memory -Label 'SETTINGS_60S_AFTER_CLOSE'
}

Get-Process -Name 'FlowKey.Shell' -ErrorAction SilentlyContinue | ForEach-Object { $_.Kill() }
Write-Output 'DONE'
