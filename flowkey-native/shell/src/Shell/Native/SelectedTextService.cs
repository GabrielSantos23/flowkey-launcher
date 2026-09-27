using System.Runtime.InteropServices;

namespace FlowKey.Shell.Native;

/// <summary>
/// Captures the selected text of the foreground application. Primary strategy
/// is UI Automation (non-invasive); the clipboard fallback types Ctrl+C into
/// the focused app, so it is opt-in per call and always restores the previous
/// clipboard text afterwards.
/// </summary>
public static class SelectedTextService
{
    public const int MaxSelectedTextLength = 16 * 1024;

    public static string? GetSelectedText(bool allowFallback)
    {
        var viaAutomation = TryGetViaAutomation();
        if (!string.IsNullOrEmpty(viaAutomation))
        {
            return viaAutomation;
        }
        if (!allowFallback)
        {
            return null;
        }
        return TryGetViaClipboardFallback();
    }

    private static string? TryGetViaAutomation()
    {
        try
        {
            var element = System.Windows.Automation.AutomationElement.FocusedElement;
            if (element?.GetCurrentPattern(System.Windows.Automation.TextPattern.Pattern)
                is not System.Windows.Automation.TextPattern pattern)
            {
                return null;
            }
            var selection = pattern.GetSelection();
            if (selection is not { Length: > 0 })
            {
                return null;
            }
            var text = selection[0].GetText(MaxSelectedTextLength);
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }
        catch (Exception)
        {
            /* focused element does not expose text; fall back if allowed */
            return null;
        }
    }

    private static string? TryGetViaClipboardFallback()
    {
        string? previous = null;
        var hadPrevious = false;
        try
        {
            var content = ClipboardService.ReadContent();
            previous = content.Text;
            hadPrevious = content.Text is not null;
        }
        catch (InvalidOperationException)
        {
            /* clipboard unreadable; proceed without restore */
        }

        SendCopy();
        Thread.Sleep(180);

        try
        {
            var content = ClipboardService.ReadContent();
            if (hadPrevious && content.Text != previous)
            {
                // Restore what the copy operation overwrote (text formats only).
                try
                {
                    ClipboardService.WriteText(previous!);
                }
                catch (InvalidOperationException)
                {
                }
            }
            return content.Text;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    private static void SendCopy()
    {
        var inputs = new[]
        {
            InputKey(VK_CONTROL, true),
            InputKey('C', true),
            InputKey('C', false),
            InputKey(VK_CONTROL, false),
        };
        _ = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
    }

    private const ushort VK_CONTROL = 0x11;
    private const uint INPUT_KEYBOARD = 1;

    private static INPUT InputKey(ushort vk, bool down) => new()
    {
        type = INPUT_KEYBOARD,
        U = new InputUnion
        {
            ki = new KEYBDINPUT
            {
                wVk = vk,
                wScan = 0,
                dwFlags = down ? 0u : 2u,
                time = 0,
                dwExtraInfo = IntPtr.Zero,
            },
        },
    };

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)]
        public KEYBDINPUT ki;
        [FieldOffset(0)]
        public MOUSEINPUT mi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
}
