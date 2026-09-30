using System.Runtime.InteropServices;
using System.Windows;

namespace FlowKey.Shell.Native;

/// <summary>
/// Monitor geometry for the shell's windows, in WPF DIPs. WPF (without a
/// PerMonitorV2 manifest) is system-DPI aware: one DIP is 1/96 of the system
/// DPI, so every monitor's pixel geometry converts with the same primary
/// scale — including multi-monitor setups, where DWM scales the window on
/// higher-DPI displays.
/// </summary>
public static class MonitorInfo
{
    public sealed record Info(Rect WorkArea, double PixelsPerDip);

    public static Info? FromWindow(IntPtr hwnd) => FromMonitor(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST));

    private static Info? FromMonitor(IntPtr monitor)
    {
        if (monitor == IntPtr.Zero)
        {
            return null;
        }
        var info = MONITORINFO.Create();
        if (!GetMonitorInfo(monitor, ref info))
        {
            return null;
        }
        var scale = SystemPixelsPerDip();
        var work = info.rcWork;
        return new Info(
            new Rect(
                work.Left / scale,
                work.Top / scale,
                (work.Right - work.Left) / scale,
                (work.Bottom - work.Top) / scale),
            scale);
    }

    /// <summary>The system DPI scale (primary monitor). Falls back to 1.0.</summary>
    public static double SystemPixelsPerDip()
    {
        var primary = MonitorFromPoint(default, MONITOR_DEFAULTTONEAREST);
        if (primary != IntPtr.Zero
            && GetDpiForMonitor(primary, MDT_EFFECTIVE_DPI, out var dpiX, out _) == 0
            && dpiX > 0)
        {
            return dpiX / 96.0;
        }
        return 1.0;
    }

    private const uint MONITOR_DEFAULTTONEAREST = 2;
    private const int MDT_EFFECTIVE_DPI = 0;

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(POINT point, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);

    [DllImport("shcore.dll")]
    private static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;

        public static MONITORINFO Create() => new() { cbSize = Marshal.SizeOf<MONITORINFO>() };
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}
