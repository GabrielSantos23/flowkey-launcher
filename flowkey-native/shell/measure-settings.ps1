param(
    [string]$ExePath = 'D:\projects\asyar\flowkey-native\shell\publish-measure\FlowKey.Shell.exe',
    [string]$OutDir = 'D:\projects\asyar\design-reference'
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Native {
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    }
public struct RECT { public int L, T, R, B; }
"@

function Get-PrivateWs {
    Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "Name='FlowKey.Shell'" | Out-Null
    Start-Sleep -Milliseconds 500
    $p = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "Name='FlowKey.Shell'" | Select-Object -First 1
    if ($null -eq $p) { return $null }
    return [math]::Round($p.WorkingSetPrivate / 1MB, 1)
}

function Wait-SettingsWindow {
    for ($i = 0; $i -lt 100; $i++) {
        $h = [Win32Native]::FindWindow($null, "FlowKey Settings")
        if ($h -ne [IntPtr]::Zero) { return $h }
        Start-Sleep -Milliseconds 100
    }
    return [IntPtr]::Zero
}

function Screenshot-Window($h, $path) {
    $r = New-Object "RECT"
    [Win32Native]::GetWindowRect($h, [ref]$r) | Out-Null
    $w = $r.R - $r.L; $ht = $r.B - $r.T
    $bmp = New-Object System.Drawing.Bitmap($w, $ht)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

# Phase A: baseline, no settings
$proc = Start-Process -FilePath $ExePath -PassThru
Start-Sleep -Seconds 30
$baseline = Get-PrivateWs
Write-Output ("baseline_no_settings_mb=" + $baseline)
Stop-Process -Id $proc.Id -Force
Start-Sleep -Seconds 2

# Phase B: settings open, screenshot, close, re-measure
$proc = Start-Process -FilePath $ExePath -ArgumentList '--settings' -PassThru
$h = Wait-SettingsWindow
Start-Sleep -Seconds 2
$open = Get-PrivateWs
Write-Output ("settings_open_mb=" + $open)
Screenshot-Window $h (Join-Path $OutDir 'settings-general-wip.png')
[Win32Native]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 2
$after = Get-PrivateWs
Write-Output ("right_after_close_mb=" + $after)
Start-Sleep -Seconds 60
$later = Get-PrivateWs
Write-Output ("60s_after_close_mb=" + $later)
Stop-Process -Id $proc.Id -Force
