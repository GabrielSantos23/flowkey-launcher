using FlowKey.Shell.Native;
using FlowKey.Shell.Windows;
using Xunit;

namespace FlowKey.Shell.Tests;

public class HotkeyComboTests
{
    [Fact]
    public void CtrlAltCParses()
    {
        Assert.True(MainWindow.TryParseCombo("Ctrl+Alt+C", out var modifier, out var virtualKey));
        Assert.Equal(0x0003u, modifier);
        Assert.Equal(0x43u, virtualKey);
    }

    [Fact]
    public void CtrlAltSpaceParses()
    {
        Assert.True(MainWindow.TryParseCombo("Ctrl+Alt+Space", out var modifier, out var virtualKey));
        Assert.Equal(0x0003u, modifier);
        Assert.Equal(0x20u, virtualKey);
    }

    [Theory]
    [InlineData("C")]
    [InlineData("Ctrl")]
    [InlineData("Ctrl+Alt+Rad")]
    public void InvalidCombosFailToParse(string combo) =>
        Assert.False(MainWindow.TryParseCombo(combo, out _, out _));

    // The shared HotkeyCombo table is the wire contract with the settings web
    // recorder (settings-ui test/keys.test.ts pins the same cases).

    [Fact]
    public void DescribeProducesCanonicalOrder()
    {
        Assert.Equal("Ctrl+Alt+Space", HotkeyCombo.Describe(HotkeyManager.MOD_CONTROL | HotkeyManager.MOD_ALT, 0x20));
        Assert.Equal("Ctrl+Win+Shift+K", HotkeyCombo.Describe(
            HotkeyManager.MOD_SHIFT | HotkeyManager.MOD_WIN | HotkeyManager.MOD_CONTROL, 0x4B));
        Assert.Equal("Win+F12", HotkeyCombo.Describe(HotkeyManager.MOD_WIN, 0x7B));
        Assert.Equal("Alt+/", HotkeyCombo.Describe(HotkeyManager.MOD_ALT, 0xBF));
    }

    [Fact]
    public void DescribeAndTryParseRoundTrip()
    {
        foreach (var (modifier, virtualKey) in new[]
        {
            (HotkeyManager.MOD_CONTROL | HotkeyManager.MOD_ALT, 0x20u),
            (HotkeyManager.MOD_WIN, 0x4Bu),
            (HotkeyManager.MOD_CONTROL | HotkeyManager.MOD_WIN | HotkeyManager.MOD_SHIFT, 0x70u),
            (HotkeyManager.MOD_ALT, 0x39u),
        })
        {
            var combo = HotkeyCombo.Describe(modifier, virtualKey);
            Assert.True(HotkeyCombo.TryParse(combo, out var parsedModifier, out var parsedVirtualKey));
            Assert.Equal(modifier, parsedModifier);
            Assert.Equal(virtualKey, parsedVirtualKey);
        }
    }

    [Fact]
    public void TryParseMatchesMainWindowParser()
    {
        Assert.True(HotkeyCombo.TryParse("Ctrl+Alt+Space", out var modifier, out var virtualKey));
        Assert.True(MainWindow.TryParseCombo("Ctrl+Alt+Space", out var mainWindowModifier, out var mainWindowVirtualKey));
        Assert.Equal(mainWindowModifier, modifier);
        Assert.Equal(mainWindowVirtualKey, virtualKey);
    }
}
