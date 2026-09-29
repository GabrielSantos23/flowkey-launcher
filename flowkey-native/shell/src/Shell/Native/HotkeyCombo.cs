namespace FlowKey.Shell.Native;

/// <summary>
/// Canonical hotkey combo strings, shared by the native settings window, the
/// web settings recorder and their tests: the wire format is Describe's
/// "Ctrl+Alt+Space" style and <see cref="TryParse"/> inverts it. The web
/// recorder formats with the same table; the shell still re-validates every
/// committed string before it reaches a store or RegisterHotKey.
/// </summary>
public static class HotkeyCombo
{
    public static string Describe(uint modifier, uint virtualKey)
    {
        var parts = new List<string>();
        if ((modifier & HotkeyManager.MOD_CONTROL) != 0)
        {
            parts.Add("Ctrl");
        }
        if ((modifier & HotkeyManager.MOD_ALT) != 0)
        {
            parts.Add("Alt");
        }
        if ((modifier & HotkeyManager.MOD_WIN) != 0)
        {
            parts.Add("Win");
        }
        if ((modifier & HotkeyManager.MOD_SHIFT) != 0)
        {
            parts.Add("Shift");
        }
        parts.Add(virtualKey switch
        {
            >= 0x30 and <= 0x39 => ((char)virtualKey).ToString(),
            >= 0x41 and <= 0x5A => ((char)virtualKey).ToString(),
            >= 0x70 and <= 0x87 => "F" + (virtualKey - 0x70 + 1),
            0x20 => "Space",
            0x25 => "Left",
            0x26 => "Up",
            0x27 => "Right",
            0x28 => "Down",
            0xBA => ";",
            0xBB => "=",
            0xBC => ",",
            0xBD => "-",
            0xBE => ".",
            0xBF => "/",
            0xDB => "[",
            0xDD => "]",
            0xDE => "'",
            _ => "0x" + virtualKey.ToString("X"),
        });
        return string.Join("+", parts);
    }

    public static bool TryParse(string combo, out uint modifier, out uint virtualKey)
    {
        modifier = 0;
        virtualKey = 0;
        var parts = combo.Split('+');
        if (parts.Length < 2)
        {
            return false;
        }
        foreach (var rawPart in parts[..^1])
        {
            modifier |= rawPart.Trim().ToLowerInvariant() switch
            {
                "ctrl" => HotkeyManager.MOD_CONTROL,
                "alt" => HotkeyManager.MOD_ALT,
                "win" => HotkeyManager.MOD_WIN,
                "shift" => HotkeyManager.MOD_SHIFT,
                _ => 0,
            };
        }
        var keyPart = parts[^1].Trim();
        virtualKey = keyPart switch
        {
            "Space" => 0x20,
            "Left" => 0x25,
            "Up" => 0x26,
            "Right" => 0x27,
            "Down" => 0x28,
            "." => 0xBE,
            "," => 0xBC,
            "-" => 0xBD,
            "=" => 0xBB,
            "/" => 0xBF,
            ";" => 0xBA,
            "'" => 0xDE,
            "[" => 0xDB,
            "]" => 0xDD,
            _ when keyPart.Length == 1 && char.IsLetterOrDigit(keyPart[0]) => (uint)char.ToUpperInvariant(keyPart[0]),
            _ when keyPart.StartsWith("F") && int.TryParse(keyPart[1..], out var f) && f is >= 1 and <= 24 => (uint)(0x70 + f - 1),
            _ => 0,
        };
        return modifier != 0 && virtualKey != 0;
    }
}
