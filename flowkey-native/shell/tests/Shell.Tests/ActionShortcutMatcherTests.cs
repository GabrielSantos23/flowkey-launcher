using System.Windows.Input;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ActionShortcutMatcherTests
{
    [Fact]
    public void NullShortcutNeverMatches() =>
        Assert.False(ActionShortcutMatcher.Matches(null, ModifierKeys.None, Key.Enter));

    [Fact]
    public void PlainKeyMatchesWithoutModifiers()
    {
        var shortcut = new UiShortcut { Key = "backspace" };
        Assert.True(ActionShortcutMatcher.Matches(shortcut, ModifierKeys.None, Key.Back));
        Assert.False(ActionShortcutMatcher.Matches(shortcut, ModifierKeys.Control, Key.Back));
    }

    [Fact]
    public void ModifierCombinationsMustMatchExactly()
    {
        var shortcut = new UiShortcut { Key = "c", Modifiers = ["ctrl", "shift"] };
        Assert.True(ActionShortcutMatcher.Matches(shortcut, ModifierKeys.Control | ModifierKeys.Shift, Key.C));
        Assert.False(ActionShortcutMatcher.Matches(shortcut, ModifierKeys.Control, Key.C));
        Assert.False(ActionShortcutMatcher.Matches(shortcut, ModifierKeys.None, Key.C));
    }

    [Fact]
    public void AllModifierAliasesParse()
    {
        var ctrl = new UiShortcut { Key = "d", Modifiers = ["ctrl"] };
        var cmd = new UiShortcut { Key = "d", Modifiers = ["cmd"] };
        var alt = new UiShortcut { Key = "d", Modifiers = ["alt"] };
        var opt = new UiShortcut { Key = "d", Modifiers = ["opt"] };
        var win = new UiShortcut { Key = "d", Modifiers = ["windows"] };
        Assert.True(ActionShortcutMatcher.Matches(ctrl, ModifierKeys.Control, Key.D));
        Assert.True(ActionShortcutMatcher.Matches(cmd, ModifierKeys.Control, Key.D));
        Assert.True(ActionShortcutMatcher.Matches(alt, ModifierKeys.Alt, Key.D));
        Assert.True(ActionShortcutMatcher.Matches(opt, ModifierKeys.Alt, Key.D));
        Assert.True(ActionShortcutMatcher.Matches(win, ModifierKeys.Windows, Key.D));
    }

    [Theory]
    [InlineData("a", Key.A)]
    [InlineData("z", Key.Z)]
    [InlineData("5", Key.D5)]
    [InlineData("enter", Key.Enter)]
    [InlineData("return", Key.Enter)]
    [InlineData("backspace", Key.Back)]
    [InlineData("delete", Key.Delete)]
    [InlineData("deleteForward", Key.Delete)]
    [InlineData("tab", Key.Tab)]
    [InlineData("escape", Key.Escape)]
    [InlineData("space", Key.Space)]
    [InlineData("up", Key.Up)]
    [InlineData("down", Key.Down)]
    [InlineData("left", Key.Left)]
    [InlineData("right", Key.Right)]
    [InlineData("pageUp", Key.PageUp)]
    [InlineData("pageDown", Key.PageDown)]
    [InlineData("home", Key.Home)]
    [InlineData("end", Key.End)]
    public void KeyNamesMapToWpfKeys(string name, Key expected) =>
        Assert.True(ActionShortcutMatcher.TryParseKey(name, out var parsed) && parsed == expected);

    [Theory]
    [InlineData("f1")]
    [InlineData("")]
    [InlineData("ctrl")]
    public void UnknownKeyNamesAreRejected(string name) =>
        Assert.False(ActionShortcutMatcher.TryParseKey(name, out _));
}
