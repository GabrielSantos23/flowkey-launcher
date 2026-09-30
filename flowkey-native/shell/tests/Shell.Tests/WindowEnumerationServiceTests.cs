using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class WindowEnumerationServiceTests
{
    [Fact]
    public void ExcludesInvisibleToolAndOwnWindows()
    {
        Assert.True(WindowEnumerationService.ShouldInclude(title: "Notes", processName: "obsidian", hasTitle: true, isToolWindow: false, isVisible: true));
        Assert.False(WindowEnumerationService.ShouldInclude(title: "Notes", processName: "testhost", hasTitle: true, isToolWindow: false, isVisible: true), "the enumerating process itself must not be listed");
        Assert.False(WindowEnumerationService.ShouldInclude(title: "", processName: "svc", hasTitle: false, isToolWindow: false, isVisible: true), "untitled windows are noise");
        Assert.False(WindowEnumerationService.ShouldInclude(title: "tooltip", processName: "app", hasTitle: true, isToolWindow: true, isVisible: true), "tool windows are not switchable targets");
        Assert.False(WindowEnumerationService.ShouldInclude(title: "hidden", processName: "app", hasTitle: true, isToolWindow: false, isVisible: false));
    }

    [Fact]
    public void ExcludesTheShellByName()
    {
        Assert.False(WindowEnumerationService.ShouldInclude(title: "FlowKey", processName: "FlowKey.Shell", hasTitle: true, isToolWindow: false, isVisible: true));
        Assert.True(WindowEnumerationService.ShouldInclude(title: "FlowKey docs", processName: "chrome", hasTitle: true, isToolWindow: false, isVisible: true));
    }

    [Theory]
    [InlineData("0x1A2B3C")]
    [InlineData("1A2B3C")]
    public void WindowIdsRoundTripThroughHexParse(string id) =>
        Assert.True(WindowEnumerationService.TryParseWindowId(id, out var hwnd) && hwnd != IntPtr.Zero);

    [Fact]
    public void InvalidWindowIdsFailToParse()
    {
        Assert.False(WindowEnumerationService.TryParseWindowId("nothex", out _));
        Assert.False(WindowEnumerationService.TryParseWindowId("", out _));
    }
}
