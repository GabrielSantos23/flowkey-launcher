param(
    [string]$ExePath = 'D:\projects\asyar\flowkey-native\shell\src\Shell\bin\Release\net8.0-windows\win-x64\FlowKey.Shell.exe',
    [string]$OutPath = 'D:\projects\asyar\design-reference\settings-ext-wip.png'
)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Shot33 {
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
    if ($proc.MainWindowHandle -ne 0 -and $proc.MainWindowTitle -eq 'FlowKey Settings') { $h = $proc.MainWindowHandle; break }
    Start-Sleep -Milliseconds 100
}
if ($h -eq [IntPtr]::Zero) { Write-Output "window_not_found"; Stop-Process -Id $proc.Id -Force; exit 1 }
Start-Sleep -Seconds 2
[Shot33]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500
# Click the Google Translate nav entry via UI Automation
$root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
$nav = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Google Translate')))
if ($nav -eq $null) { Write-Output "nav_not_found" } else {
    $wr = New-Object "RECT"
    [Shot33]::GetWindowRect($h, [ref]$wr) | Out-Null
    Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr i);' -Name U32 -Namespace Win
    [Win.U32]::SetCursorPos($wr.L + 100, $wr.T + 300) | Out-Null
    Start-Sleep -Milliseconds 200
    [Win.U32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    [Win.U32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 1500
    Start-Sleep -Milliseconds 1200
}
$r = New-Object "RECT"
[Shot33]::GetWindowRect($h, [ref]$r) | Out-Null
$bmp = New-Object System.Drawing.Bitmap(($r.R - $r.L), ($r.B - $r.T))
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[Shot33]::PrintWindow($h, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("saved " + $OutPath)
Stop-Process -Id $proc.Id -Force
