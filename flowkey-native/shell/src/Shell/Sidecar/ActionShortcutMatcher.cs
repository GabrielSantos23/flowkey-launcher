using System.Windows.Input;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Sidecar;

/// <summary>
/// Turns an extension-declared <see cref="UiShortcut"/> into a live keyboard
/// binding inside the launcher: the shell matches the focused view's key
/// events against the selected item's actions and runs them directly.
/// </summary>
public static class ActionShortcutMatcher
{
    public static bool Matches(UiShortcut? shortcut, ModifierKeys modifiers, Key key)
    {
        if (shortcut is null
            || !TryParseModifiers(shortcut.Modifiers, out var expectedModifiers)
            || !TryParseKey(shortcut.Key, out var expectedKey))
        {
            return false;
        }
        return expectedModifiers == modifiers && expectedKey == key;
    }

    public static bool TryParseKey(string? name, out Key key)
    {
        key = Key.None;
        if (string.IsNullOrEmpty(name))
        {
            return false;
        }
        if (name.Length == 1)
        {
            var c = char.ToLowerInvariant(name[0]);
            if (c is >= 'a' and <= 'z')
            {
                key = Key.A + (c - 'a');
                return true;
            }
            if (c is >= '0' and <= '9')
            {
                key = Key.D0 + (c - '0');
                return true;
            }
            return false;
        }
        key = name switch
        {
            "return" or "enter" => Key.Enter,
            "backspace" => Key.Back,
            "delete" or "deleteForward" => Key.Delete,
            "tab" => Key.Tab,
            "escape" => Key.Escape,
            "space" => Key.Space,
            "up" => Key.Up,
            "down" => Key.Down,
            "left" => Key.Left,
            "right" => Key.Right,
            "pageUp" => Key.PageUp,
            "pageDown" => Key.PageDown,
            "home" => Key.Home,
            "end" => Key.End,
            _ => Key.None,
        };
        return key != Key.None;
    }

    private static bool TryParseModifiers(IReadOnlyList<string>? modifiers, out ModifierKeys parsed)
    {
        parsed = ModifierKeys.None;
        if (modifiers is null)
        {
            return true;
        }
        foreach (var raw in modifiers)
        {
            var flag = raw switch
            {
                "ctrl" or "cmd" => ModifierKeys.Control,
                "alt" or "opt" => ModifierKeys.Alt,
                "shift" => ModifierKeys.Shift,
                "windows" => ModifierKeys.Windows,
                _ => (ModifierKeys?)null,
            };
            if (flag is null)
            {
                parsed = ModifierKeys.None;
                return false;
            }
            parsed |= flag.Value;
        }
        return true;
    }
}
