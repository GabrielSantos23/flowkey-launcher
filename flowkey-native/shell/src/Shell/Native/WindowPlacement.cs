using System.Windows;

namespace FlowKey.Shell.Native;

/// <summary>
/// Pure window-positioning math, in WPF DIPs (callers convert from device
/// pixels via <see cref="MonitorInfo"/>). Used by the launcher summon so the
/// window always appears centered on the monitor the user is working on.
/// </summary>
public static class WindowPlacement
{
    public static (double Left, double Top) CenterInWorkArea(Rect workArea, System.Windows.Size window)
    {
        var left = workArea.Left + Math.Max(0, (workArea.Width - window.Width) / 2);
        var top = workArea.Top + Math.Max(0, (workArea.Height - window.Height) / 2);
        return (left, top);
    }

    public static (double Left, double Top) ClampToWorkArea(Rect workArea, double left, double top, System.Windows.Size window)
    {
        var maxLeft = Math.Max(workArea.Left, workArea.Right - window.Width);
        var maxTop = Math.Max(workArea.Top, workArea.Bottom - window.Height);
        return (
            Math.Min(Math.Max(workArea.Left, left), maxLeft),
            Math.Min(Math.Max(workArea.Top, top), maxTop));
    }
}
