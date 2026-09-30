using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class SystemControlServiceTests
{
    [Theory]
    [InlineData("lock")]
    [InlineData("sleep")]
    [InlineData("mute")]
    [InlineData("volume-up")]
    [InlineData("volume-down")]
    [InlineData("empty-recycle-bin")]
    [InlineData("restart")]
    [InlineData("shutdown")]
    public void DeclaredOperationsAreAllowed(string op) =>
        Assert.True(SystemControlService.IsAllowedOp(op));

    [Theory]
    [InlineData("format")]
    [InlineData("delete-users")]
    [InlineData("Lock")]
    [InlineData("")]
    public void UnknownOperationsAreRejected(string op) =>
        Assert.False(SystemControlService.IsAllowedOp(op));

    [Fact]
    public void OperationListIsExposedForTheConsentDialog() =>
        Assert.Equal(SystemControlService.AllowedOps.Length, SystemControlService.AllowedOps.Distinct().Count());
}
