param(
    [string]$ExePath = 'D:\projects\asyar\flowkey-native\shell\src\Shell\bin\Release\net8.0-windows\win-x64\FlowKey.Shell.exe',
    [string]$OutPath = 'D:\projects\asyar\design-reference\root-wip.png',
    [string]$Query = ''
)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Shot34 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr i);
}
public struct RECT { public int L, T, R, B; }
"@
$proc = Start-Process -FilePath $ExePath -PassThru
Start-Sleep -Seconds 2
[System.Windows.Forms.SendKeys]::SendWait('^% ')
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WEnumShot {
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
"@
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 200; $i++) {
    $script:found = [IntPtr]::Zero
    $targetPid = 0
    try { $proc.Refresh(); $targetPid = $proc.Id } catch { }
    $cb = [WEnumShot+EnumProc]{ param($h2, $l2)
        $pid2 = 0
        [WEnumShot]::GetWindowThreadProcessId($h2, [ref]$pid2) | Out-Null
        if ($pid2 -eq $targetPid -and [WEnumShot]::IsWindowVisible($h2)) {
            $sb = New-Object System.Text.StringBuilder 256
            [WEnumShot]::GetWindowText($h2, $sb, 256) | Out-Null
            if ($sb.ToString() -eq 'FlowKey') { $script:found = $h2; return $false }
        }
        return $true
    }
    [WEnumShot]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    $h = $script:found
    if ($h -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 100
}
if ($h -eq [IntPtr]::Zero) { Write-Output "window_not_found"; Stop-Process -Id $proc.Id -Force; exit 1 }
Start-Sleep -Seconds 1
[Shot34]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500
if ($Query -ne '') {
    [System.Windows.Forms.SendKeys]::SendWait($Query)
    Start-Sleep -Milliseconds 1500
}
$r = New-Object "RECT"
[Shot34]::GetWindowRect($h, [ref]$r) | Out-Null
$bmp = New-Object System.Drawing.Bitmap(($r.R - $r.L), ($r.B - $r.T))
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[Shot34]::PrintWindow($h, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("saved " + $OutPath)
Stop-Process -Id $proc.Id -Force
