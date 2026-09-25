param(
    [string]$ExePath = 'D:\projects\asyar\flowkey-native\shell\publish-measure\FlowKey.Shell.exe',
    [string]$OutDir = 'D:\projects\asyar\design-reference'
)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Shot32 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
public struct RECT { public int L, T, R, B; }
"@
function Snap($h, $path) {
    $r = New-Object "RECT"
    [Shot32]::GetWindowRect($h, [ref]$r) | Out-Null
    $bmp = New-Object System.Drawing.Bitmap(($r.R - $r.L), ($r.B - $r.T))
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc()
    [Shot32]::PrintWindow($h, $hdc, 2) | Out-Null
    $g.ReleaseHdc($hdc)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
$proc = Start-Process -FilePath $ExePath -ArgumentList '--settings' -PassThru
Start-Sleep -Seconds 7
$proc.Refresh()
$h = $proc.MainWindowHandle
[Shot32]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 400
Snap $h (Join-Path $OutDir 'settings-general-wip.png')
$root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
$radios = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::RadioButton)))
$targets = @(
    @{ Index = 8; Name = 'spotify' },
    @{ Index = 4; Name = 'apps' },
    @{ Index = 5; Name = 'clipboardhistory' },
    @{ Index = 3; Name = 'emoji' }
)
foreach ($t in $targets) {
    if ($t.Index -lt $radios.Count) {
        $radios[$t.Index].GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
        Start-Sleep -Milliseconds 1500
        Snap $h (Join-Path $OutDir ('settings-ext-' + $t.Name + '.png'))
    }
}
$proc.Refresh()
Write-Output ('exited=' + $proc.HasExited)
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
