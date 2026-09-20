using System.IO;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class IconUriPolicyTests
{
    private const string TinyPngDataUri =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    [Fact]
    public void SmallPngDataUriIsAllowed() => Assert.True(IconUriPolicy.IsAllowed(TinyPngDataUri));

    [Fact]
    public void OversizedDataUriIsRejected()
    {
        var big = "data:image/png;base64," + new string('A', 90_000);
        Assert.False(IconUriPolicy.IsAllowed(big));
    }

    [Fact]
    public void NonPngDataUriIsRejected() =>
        Assert.False(IconUriPolicy.IsAllowed("data:image/jpeg;base64,iVBORw0KGgo="));

    [Fact]
    public void InvalidBase64IsRejected() =>
        Assert.False(IconUriPolicy.IsAllowed("data:image/png;base64,!!!not-base64!!!"));

    [Fact]
    public void HttpAndHttpsAreRejected()
    {
        Assert.False(IconUriPolicy.IsAllowed("https://example.com/icon.png"));
        Assert.False(IconUriPolicy.IsAllowed("http://example.com/icon.png"));
    }

    [Fact]
    public void UncPathIsRejected() =>
        Assert.False(IconUriPolicy.IsAllowed("file://server/share/icon.png"));

    [Fact]
    public void PathOutsideIconCacheIsRejected()
    {
        Assert.False(IconUriPolicy.IsAllowed("file:///C:/Windows/system32/icon.png"));
        Assert.False(IconUriPolicy.IsAllowed("file:///C:/Users/x/AppData/Local/FlowKey.Shell/other/icon.png"));
    }

    [Fact]
    public void TraversalIsRejected() =>
        Assert.False(IconUriPolicy.IsAllowed("file:///C:/Users/x/AppData/Local/FlowKey.Shell/icon-cache/../secret.png"));

    [Fact]
    public void PathInsideIconCacheIsAllowedWithResolvedPath()
    {
        var root = IconUriPolicy.IconCacheRoot;
        var uri = new Uri(Path.Combine(root, "abc.png")).AbsoluteUri;
        Assert.True(IconUriPolicy.TryGetLocalPath(uri, out var path));
        Assert.StartsWith(root, path, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void NonFileSchemesAreRejected()
    {
        Assert.False(IconUriPolicy.IsAllowed("ftp://example.com/icon.png"));
        Assert.False(IconUriPolicy.IsAllowed(@"shell:AppsFolder\x"));
        Assert.False(IconUriPolicy.IsAllowed("just-a-string"));
        Assert.False(IconUriPolicy.IsAllowed(null));
    }
}
