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
}
