using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace FlowKey.Shell.Native;

public sealed record FrontmostApp(string? Id, string Name, string? Path);

/// <summary>
/// Desktop integration queries: the currently focused application and the
/// system default handler for a file path or extension. Generic, gated by the
/// extension's `nativeMethods` declarations like every other route.
/// </summary>
public static class DesktopAppsService
{
    public static FrontmostApp? GetFrontmost()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero)
        {
            return null;
        }
        _ = GetWindowThreadProcessId(hwnd, out var pid);
        if (pid == 0)
        {
            return null;
        }
        try
        {
            var process = Process.GetProcessById((int)pid);
            string? path = null;
            try
            {
                path = process.MainModule?.FileName;
            }
            catch (Exception)
            {
                /* elevated or system process: path is unavailable */
            }
            return new FrontmostApp(null, process.ProcessName, path);
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    /// <summary>
    /// Resolves the system default executable for a file path or extension
    /// (e.g. `.md` or `C:/notes/x.md`) via the shell association table.
    /// </summary>
    public static string? DefaultExecutableFor(string target)
    {
        if (string.IsNullOrWhiteSpace(target))
        {
            return null;
        }
        var query = Path.GetExtension(target) is { Length: > 0 } extension ? extension : target;
        var buffer = new StringBuilder(1024);
        var length = (uint)buffer.Capacity;
        var result = AssocQueryStringW(0, ASSOCSTR_EXECUTABLE, query, null, buffer, ref length);
        if (result != 0)
        {
            return null;
        }
        return buffer.ToString();
    }

    private const uint ASSOCSTR_EXECUTABLE = 2;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
    private static extern uint AssocQueryStringW(
        uint flags, uint str, string pszAssoc, string? pszExtra, StringBuilder pszOut, ref uint pcchOut);
}
