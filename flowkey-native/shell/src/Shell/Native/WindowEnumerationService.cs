using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace FlowKey.Shell.Native;

public sealed record WindowEntry(string Id, string Title, string ProcessName, string? IconPath);

/// <summary>
/// Enumerates switchable top-level windows for the window-switcher capability
/// (`windows.list` / `windows.focus` / `windows.close`), and extracts
/// per-executable icons into the shell's icon cache. The filter rules are
/// pure and unit-tested; everything OS-facing lives behind P/Invoke.
/// </summary>
public static class WindowEnumerationService
{
    /// <summary>The inclusion policy: a switchable target is a visible, titled
    /// top-level window of another process that is not a tool window. The
    /// shell's own process is never a target.</summary>
    public static bool ShouldInclude(
        string title,
        string processName,
        bool hasTitle,
        bool isToolWindow,
        bool isVisible) =>
        isVisible
        && hasTitle
        && !string.IsNullOrWhiteSpace(title)
        && !isToolWindow
        && !string.Equals(processName, OwnProcessName, StringComparison.OrdinalIgnoreCase)
        && !string.Equals(processName, ShellProcessName, StringComparison.OrdinalIgnoreCase);

    private static string OwnProcessName => Process.GetCurrentProcess().ProcessName;

    private const string ShellProcessName = "FlowKey.Shell";

    public static bool TryParseWindowId(string? id, out IntPtr hwnd)
    {
        hwnd = IntPtr.Zero;
        if (string.IsNullOrWhiteSpace(id))
        {
            return false;
        }
        try
        {
            var text = id.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? id[2..] : id;
            hwnd = new IntPtr(Convert.ToInt64(text, 16));
            return hwnd != IntPtr.Zero;
        }
        catch (Exception)
        {
            return false;
        }
    }

    public static IReadOnlyList<WindowEntry> List()
    {
        var windows = new List<WindowEntry>();
        EnumWindows((hwnd, _) =>
        {
            if (!IsWindowVisible(hwnd) || IsToolWindow(hwnd) || IsCloaked(hwnd))
            {
                return true;
            }
            var length = GetWindowTextLength(hwnd);
            if (length == 0)
            {
                return true;
            }
            var title = new StringBuilder(length + 1);
            _ = GetWindowText(hwnd, title, title.Capacity);
            var windowTitle = title.ToString();
            if (string.IsNullOrWhiteSpace(windowTitle))
            {
                return true;
            }
            GetWindowThreadProcessId(hwnd, out var pid);
            if (pid == 0)
            {
                return true;
            }
            string? processName = null;
            string? exePath = null;
            try
            {
                using var process = Process.GetProcessById((int)pid);
                processName = process.ProcessName;
                try
                {
                    exePath = process.MainModule?.FileName;
                }
                catch
                {
                    /* system processes deny module access */
                }
            }
            catch
            {
                return true;
            }
            if (processName is null
                || !ShouldInclude(windowTitle, processName, hasTitle: true, isToolWindow: false, isVisible: true))
            {
                return true;
            }
            windows.Add(new WindowEntry(
                "0x" + hwnd.ToInt64().ToString("X"),
                windowTitle,
                processName,
                exePath is null ? null : CachedIconPath(exePath)));
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    /// <summary>Restores a minimized window if needed, then brings it to the foreground.</summary>
    public static void Focus(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
        {
            throw new KeyNotFoundException("window not found");
        }
        if (IsIconic(hwnd))
        {
            ShowWindow(hwnd, SW_RESTORE);
        }
        var foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        var currentThread = GetCurrentThreadId();
        if (foregroundThread != 0 && foregroundThread != currentThread)
        {
            _ = AttachThreadInput(currentThread, foregroundThread, true);
            _ = SetForegroundWindow(hwnd);
            _ = AttachThreadInput(currentThread, foregroundThread, false);
        }
        else
        {
            _ = SetForegroundWindow(hwnd);
        }
    }

    public static void Close(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
        {
            throw new KeyNotFoundException("window not found");
        }
        PostMessage(hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
    }

    private static bool IsToolWindow(IntPtr hwnd) =>
        (GetWindowLong(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0;

    private static bool IsCloaked(IntPtr hwnd)
    {
        if (DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out var cloaked, 4) != 0)
        {
            return false;
        }
        return cloaked != 0;
    }

    private static string? CachedIconPath(string exePath)
    {
        try
        {
            var cacheRoot = Path.Combine(IconUriPolicy.IconCacheRoot, "windows");
            Directory.CreateDirectory(cacheRoot);
            var path = Path.Combine(cacheRoot, AppIconCache.Hash(exePath.ToLowerInvariant()) + "_32.png");
            if (File.Exists(path))
            {
                return path;
            }
            using var icon = System.Drawing.Icon.ExtractAssociatedIcon(exePath);
            if (icon is null)
            {
                return null;
            }
            using var bitmap = icon.ToBitmap();
            bitmap.Save(path, System.Drawing.Imaging.ImageFormat.Png);
            return path;
        }
        catch
        {
            return null;
        }
    }

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int DWMWA_CLOAKED = 14;
    private const int SW_RESTORE = 9;
    private const int WM_CLOSE = 0x0010;

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hwnd, int index);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hwnd, int command);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint attachTo, uint attachFrom, bool attach);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
}
