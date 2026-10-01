using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class EscapeBehaviorTests
{
    [Theory]
    [InlineData(2, "hello")]
    [InlineData(3, "")]
    public void CommandLevelStillPopsFirst(int depth, string query)
    {
        Assert.Equal(EscapeOutcome.PopView, EscapeBehavior.Resolve(depth, query));
    }

    [Fact]
    public void RootWithTypedTextClearsTheInputInsteadOfHiding()
    {
        Assert.Equal(EscapeOutcome.ClearInput, EscapeBehavior.Resolve(1, "calc"));
    }

    [Fact]
    public void RootWithEmptyInputHides()
    {
        Assert.Equal(EscapeOutcome.HideWindow, EscapeBehavior.Resolve(1, ""));
    }
}
