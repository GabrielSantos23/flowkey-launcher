param(
    [string]$ExePath = 'D:\projects\asyar\flowkey-native\shell\publish-measure\FlowKey.Shell.exe',
    [string]$OutPath = 'D:\projects\asyar\design-reference\settings-general-wip.png'
)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Shot32 {
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
public struct RECT { public int L, T, R, B; }
"@
$proc = Start-Process -FilePath $ExePath -ArgumentList '--settings' -PassThru
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 200; $i++) {
    $proc.Refresh()
    if ($proc.MainWindowHandle -ne 0 -and $proc.MainWindowTitle -eq 'FlowKey Settings') {
        $h = $proc.MainWindowHandle
        break
    }
    Start-Sleep -Milliseconds 100
}
if ($h -eq [IntPtr]::Zero) { Write-Output "window_not_found"; Stop-Process -Id $proc.Id -Force; exit 1 }
Start-Sleep -Seconds 5
[Shot32]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500
$r = New-Object "RECT"
[Shot32]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.R - $r.L; $ht = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[Shot32]::PrintWindow($h, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("saved " + $OutPath)
Stop-Process -Id $proc.Id -Force
