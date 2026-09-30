using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ShellOpenServiceTests
{
    [Theory]
    [InlineData("https://github.com")]
    [InlineData("http://example.com/x?y=1")]
    public void HttpsTargetsOpenAsUrls(string target) =>
        Assert.True(ShellOpenService.IsHttpUrl(target));

    [Theory]
    [InlineData("C:\\Users\\me\\notes.txt")]
    [InlineData("file://C:/notes.txt")]
    [InlineData("github.com")]
    [InlineData("javascript:alert(1)")]
    [InlineData("")]
    public void NonHttpTargetsAreNotTreatedAsUrls(string target) =>
        Assert.False(ShellOpenService.IsHttpUrl(target));

    [Fact]
    public void RelativeUrisAreNotUrls() =>
        Assert.False(ShellOpenService.IsHttpUrl("example.com/path"));
}
