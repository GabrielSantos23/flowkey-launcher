using System.Runtime.InteropServices;

namespace FlowKey.Shell.Native;

public sealed class HotkeyManager
{
    public const uint MOD_ALT = 0x0001;
    public const uint MOD_CONTROL = 0x0002;
    public const uint MOD_SHIFT = 0x0004;
    public const uint MOD_WIN = 0x0008;

    private readonly IntPtr hwnd;
    private readonly int hotkeyId;
    private readonly Action<string> log;

    public HotkeyManager(IntPtr hwnd, int hotkeyId, Action<string> log)
    {
        this.hwnd = hwnd;
        this.hotkeyId = hotkeyId;
        this.log = log;
    }

    public uint Modifier { get; private set; }
    public uint VirtualKey { get; private set; }

    public bool TryRegister(uint modifier, uint virtualKey)
    {
        UnregisterCurrent();
        if (RegisterHotKey(hwnd, hotkeyId, modifier, virtualKey))
        {
            Modifier = modifier;
            VirtualKey = virtualKey;
            return true;
        }
        log("RegisterHotKey failed: " + Marshal.GetLastWin32Error());
        return false;
    }

    public void UnregisterCurrent()
    {
        if (Modifier != 0 || VirtualKey != 0)
        {
            UnregisterHotKey(hwnd, hotkeyId);
            Modifier = 0;
            VirtualKey = 0;
        }
    }

    public bool Matches(IntPtr wParamHotkeyId, uint modifier, uint virtualKey) =>
        wParamHotkeyId.ToInt32() == hotkeyId && Modifier == modifier && VirtualKey == virtualKey;

    public static bool IsReservedCombo(uint modifier, uint virtualKey)
    {
        if ((modifier & (MOD_CONTROL | MOD_ALT | MOD_WIN)) == 0)
        {
            return true;
        }
        if (virtualKey is >= 0x70 and <= 0x87 && modifier == MOD_SHIFT)
        {
            return true;
        }
        if (virtualKey is 0x1B or 0x09 or 0x08 or 0x0D or 0x20 or 0x2E)
        {
            return modifier == 0 || modifier == MOD_SHIFT;
        }
        return false;
    }

    public static bool IsAltGrRisky(uint modifier, uint virtualKey) =>
        modifier == (MOD_CONTROL | MOD_ALT) && virtualKey is >= 0x41 and <= 0x5A or >= 0x30 and <= 0x39;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
