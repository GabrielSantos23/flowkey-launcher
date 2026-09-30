using System.ComponentModel;
using System.Runtime.InteropServices;

namespace FlowKey.Shell.Native;

/// <summary>
/// Shell-owned system operations for the bundled system extension. The op
/// whitelist is the consent surface: the extension declares `system.control`
/// in its manifest and the shell refuses anything outside this list, so a
/// rogue caller can never turn one capability into arbitrary command
/// execution.
/// </summary>
public static class SystemControlService
{
    public static readonly string[] AllowedOps =
    [
        "lock",
        "sleep",
        "mute",
        "volume-up",
        "volume-down",
        "empty-recycle-bin",
        "restart",
        "shutdown",
    ];

    public static bool IsAllowedOp(string op) => AllowedOps.Contains(op);

    public static void Execute(string op)
    {
        switch (op)
        {
            case "lock":
                LockWorkStation();
                break;
            case "sleep":
                if (!SetSuspendState(false, false, false))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                }
                break;
            case "mute":
            case "volume-up":
            case "volume-down":
                SendMediaCommand(op switch
                {
                    "mute" => APPCOMMAND_VOLUME_MUTE,
                    "volume-up" => APPCOMMAND_VOLUME_UP,
                    _ => APPCOMMAND_VOLUME_DOWN,
                });
                break;
            case "empty-recycle-bin":
                // SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND
                SHEmptyRecycleBin(IntPtr.Zero, null, 0x0007);
                break;
            case "restart":
                ExitWindowsEx(EWX_REBOOT | EWX_FORCEIFHUNG);
                break;
            case "shutdown":
                ExitWindowsEx(EWX_POWEROFF | EWX_FORCEIFHUNG);
                break;
            default:
                throw new ArgumentException("unknown system op '" + op + "'");
        }
    }

    private static void SendMediaCommand(int appCommand)
    {
        // WM_APPCOMMAND with the app command shifted into its high word.
        PostMessage(GetForegroundWindowSafe(), WM_APPCOMMAND, IntPtr.Zero, (IntPtr)(appCommand << 16));
    }

    private static IntPtr GetForegroundWindowSafe()
    {
        var hwnd = GetForegroundWindow();
        return hwnd == IntPtr.Zero ? HWND_BROADCAST : hwnd;
    }

    private const int WM_APPCOMMAND = 0x0319;
    private const int APPCOMMAND_VOLUME_MUTE = 8;
    private const int APPCOMMAND_VOLUME_DOWN = 9;
    private const int APPCOMMAND_VOLUME_UP = 10;
    private static readonly IntPtr HWND_BROADCAST = new(0xFFFF);
    private const int EWX_REBOOT = 0x00000002;
    private const int EWX_POWEROFF = 0x00000008;
    private const int EWX_FORCEIFHUNG = 0x00000010;

    [DllImport("user32.dll")]
    private static extern bool LockWorkStation();

    [DllImport("powrprof.dll")]
    private static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("shell32.dll")]
    private static extern int SHEmptyRecycleBin(IntPtr hwnd, string? rootPath, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ExitWindowsEx(uint flags, uint reason = 0);
}
