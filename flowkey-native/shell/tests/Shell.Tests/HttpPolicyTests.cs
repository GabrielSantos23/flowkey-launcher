using System.Net;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class HttpPolicyTests
{
    private static readonly string[] Hosts = ["api.example.com", "http://legacy.example.com", "custom.example.com:8443"];

    private static PolicyDecision Validate(string url, string[]? hosts = null) =>
        HttpPolicy.ValidateRequest(new Uri(url), hosts ?? Hosts);

    [Fact]
    public void AllowedHttpsHostPasses() => Assert.True(Validate("https://api.example.com/v1/x").Allowed);

    [Fact]
    public void UnknownHostIsDenied()
    {
        var d = Validate("https://evil.com/x");
        Assert.False(d.Allowed);
        Assert.Equal("hostNotAllowed", d.ErrorCode);
    }

    [Fact]
    public void CleartextIsDeniedUnlessOptedIn()
    {
        Assert.Equal("insecureBlocked", Validate("http://api.example.com/x").ErrorCode);
        Assert.True(Validate("http://legacy.example.com/x").Allowed);
    }

    [Fact]
    public void NonStandardPortIsDeniedUnlessDeclared()
    {
        Assert.Equal("portBlocked", Validate("https://api.example.com:8443/x").ErrorCode);
        Assert.True(Validate("https://custom.example.com:8443/x").Allowed);
    }

    [Fact]
    public void CleartextOptInUsesPort80()
    {
        Assert.Equal("portBlocked", Validate("http://legacy.example.com:8080/x").ErrorCode);
        Assert.True(Validate("http://legacy.example.com/x").Allowed);
    }

    [Fact]
    public void UserInfoIsDenied() => Assert.Equal("userInfoBlocked", Validate("https://user:pass@api.example.com/x").ErrorCode);

    [Fact]
    public void NonHttpSchemesAreDenied() => Assert.Equal("invalidUrl", Validate("ftp://api.example.com/x").ErrorCode);

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("127.8.8.8")]
    [InlineData("10.1.2.3")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.1.1")]
    [InlineData("169.254.1.1")]
    [InlineData("0.0.0.0")]
    [InlineData("0.1.2.3")]
    [InlineData("100.64.0.1")]
    [InlineData("100.127.255.255")]
    [InlineData("224.0.0.1")]
    [InlineData("239.255.255.255")]
    [InlineData("255.255.255.255")]
    [InlineData("::1")]
    [InlineData("fe80::1")]
    [InlineData("fc00::1")]
    [InlineData("fd12:3456::1")]
    [InlineData("ff02::1")]
    [InlineData("::ffff:127.0.0.1")]
    [InlineData("::ffff:10.0.0.5")]
    [InlineData("::ffff:192.168.0.9")]
    public void BlockedAddressesAreDetected(string text)
    {
        Assert.True(HttpPolicy.IsBlockedAddress(IPAddress.Parse(text)));
    }

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("1.1.1.1")]
    [InlineData("172.32.0.1")]
    [InlineData("100.128.0.1")]
    [InlineData("2606:4700::1111")]
    public void PublicAddressesAreAllowed(string text)
    {
        Assert.False(HttpPolicy.IsBlockedAddress(IPAddress.Parse(text)));
    }

    [Fact]
    public void ResolvedPrivateAddressIsDenied()
    {
        var d = HttpPolicy.ValidateResolvedAddresses("api.example.com", [IPAddress.Parse("192.168.0.10")]);
        Assert.False(d.Allowed);
        Assert.Equal("privateAddressBlocked", d.ErrorCode);
    }

    [Fact]
    public void RedirectDowngradeIsDenied()
    {
        var d = HttpPolicy.ValidateRedirect(
            new Uri("https://api.example.com/x"),
            new Uri("http://api.example.com/x"),
            Hosts);
        Assert.False(d.Allowed);
        Assert.Equal("insecureBlocked", d.ErrorCode);
    }

    [Fact]
    public void RedirectToNonAllowlistedHostIsDenied()
    {
        var d = HttpPolicy.ValidateRedirect(
            new Uri("https://api.example.com/x"),
            new Uri("https://evil.com/x"),
            Hosts);
        Assert.False(d.Allowed);
        Assert.Equal("hostNotAllowed", d.ErrorCode);
    }

    [Fact]
    public void RedirectWithinAllowlistIsAllowed()
    {
        var d = HttpPolicy.ValidateRedirect(
            new Uri("https://api.example.com/x"),
            new Uri("https://api.example.com/y"),
            Hosts);
        Assert.True(d.Allowed);
    }

    [Fact]
    public void CrossHostRedirectDropsAuthorization()
    {
        var same = HttpPolicy.IsCrossHost(new Uri("https://api.example.com/a"), new Uri("https://api.example.com/b"));
        var cross = HttpPolicy.IsCrossHost(new Uri("https://api.example.com/a"), new Uri("https://other.example.com/b"));
        Assert.False(same);
        Assert.True(cross);
    }
}
