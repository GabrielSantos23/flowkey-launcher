using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ClipboardCapturePolicyTests
{
    [Theory]
    [InlineData("explorer")]
    [InlineData("chrome")]
    [InlineData("FlowKey.Shell")]
    [InlineData(null)]
    [InlineData("")]
    public void OrdinarySourcesAreRecorded(string? source) =>
        Assert.True(ClipboardCapturePolicy.ShouldRecord(source));

    [Theory]
    [InlineData("testhost")]
    [InlineData("testhost.xunit")]
    [InlineData("testhost.console")]
    [InlineData("vstest.executionengine.x86")]
    [InlineData("vstest.console")]
    [InlineData("TestHost")]
    [InlineData("datacollector")]
    public void TestRunnerSourcesAreSkipped(string? source) =>
        Assert.False(ClipboardCapturePolicy.ShouldRecord(source));
}
