using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ImageFetchServiceTests : IDisposable
{
    private readonly string tempRoot = Path.Combine(Path.GetTempPath(), "flowkey-image-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(tempRoot))
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    private static byte[] PngBytes(int width, int height)
    {
        using var bitmap = new Bitmap(width, height);
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return stream.ToArray();
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        public int Requests;
        private readonly Func<HttpResponseMessage> response;

        public StubHandler(Func<HttpResponseMessage> response)
        {
            this.response = response;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref Requests);
            return Task.FromResult(response());
        }
    }

    private static Dictionary<string, JsonElement> Params(string url) => new()
    {
        ["url"] = JsonSerializer.SerializeToElement(url),
    };

    [Fact]
    public async Task DownloadsDecodesAndCachesImageAsFileUri()
    {
        var png = PngBytes(600, 400);
        var handler = new StubHandler(() => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(png),
        });
        var service = new ImageFetchService(() => handler, tempRoot);

        var outcome = await service.FetchAsync("ext-a", Params("https://img.test/art.png"), new[] { "img.test" }, CancellationToken.None);

        Assert.True(outcome.Ok, outcome.Error?.Message ?? "fetch failed");
        var uri = outcome.Result!.Value.GetProperty("uri").GetString()!;
        Assert.StartsWith("file:///", uri);
        var path = Path.GetFullPath(new Uri(uri).LocalPath);
        Assert.True(File.Exists(path));
        Assert.Equal(512, ImageWidth(path));

        var second = await service.FetchAsync("ext-a", Params("https://img.test/art.png"), new[] { "img.test" }, CancellationToken.None);
        Assert.True(second.Ok);
        Assert.Equal(uri, second.Result!.Value.GetProperty("uri").GetString());
        Assert.Equal(1, handler.Requests);
    }

    [Fact]
    public async Task RejectsHostOutsideAllowlistBeforeAnyNetworkCall()
    {
        var service = new ImageFetchService(cacheRoot: tempRoot);
        var outcome = await service.FetchAsync("ext-a", Params("https://unlisted.test/art.png"), new[] { "img.test" }, CancellationToken.None);
        Assert.False(outcome.Ok);
        Assert.Equal("hostNotAllowed", outcome.Error!.Code);
    }

    [Fact]
    public async Task RejectsNonImagePayload()
    {
        var handler = new StubHandler(() => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("<html>not an image</html>", Encoding.UTF8, "text/html"),
        });
        var service = new ImageFetchService(() => handler, tempRoot);
        var outcome = await service.FetchAsync("ext-a", Params("https://img.test/page.png"), new[] { "img.test" }, CancellationToken.None);
        Assert.False(outcome.Ok);
        Assert.Equal("invalidImage", outcome.Error!.Code);
    }

    [Fact]
    public async Task RejectsOversizedDownload()
    {
        var handler = new StubHandler(() => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[ImageFetchService.MaxDownloadBytes + 1]),
        });
        var service = new ImageFetchService(() => handler, tempRoot);
        var outcome = await service.FetchAsync("ext-a", Params("https://img.test/big.png"), new[] { "img.test" }, CancellationToken.None);
        Assert.False(outcome.Ok);
        Assert.Equal("responseTooLarge", outcome.Error!.Code);
    }

    [Fact]
    public async Task RejectsHttpErrorStatuses()
    {
        var handler = new StubHandler(() => new HttpResponseMessage(HttpStatusCode.NotFound));
        var service = new ImageFetchService(() => handler, tempRoot);
        var outcome = await service.FetchAsync("ext-a", Params("https://img.test/missing.png"), new[] { "img.test" }, CancellationToken.None);
        Assert.False(outcome.Ok);
        Assert.Equal("imageFetchFailed", outcome.Error!.Code);
    }

    [Fact]
    public void CachePathSanitizesExtensionAndHashesUrl()
    {
        var path = ImageFetchService.CachePath(tempRoot, "spotify-player", "https://img.test/a.png");
        Assert.StartsWith(Path.Combine(tempRoot, "spotify-player"), path);
        Assert.EndsWith(".png", path);
        Assert.DoesNotContain("..", path);
        Assert.Contains("weird-ext-", ImageFetchService.CachePath(tempRoot, "weird ext!", "https://img.test/a.png").Split(Path.DirectorySeparatorChar)[^2]);
    }

    [Fact]
    public void DownscaledImagesStayWithinMaxEdge()
    {
        using var wide = ImageFetchService.Downscale(new Bitmap(1024, 600));
        Assert.Equal(512, wide.Width);
        Assert.Equal(300, wide.Height);

        using var tall = ImageFetchService.Downscale(new Bitmap(300, 1024));
        Assert.Equal(150, tall.Width);
        Assert.Equal(512, tall.Height);

        using var small = ImageFetchService.Downscale(new Bitmap(400, 200));
        Assert.Equal(400, small.Width);
        Assert.Equal(200, small.Height);
    }

    [Fact]
    public void EvictionRemovesLeastRecentlyUsedFiles()
    {
        var root = Path.Combine(tempRoot, "evict");
        Directory.CreateDirectory(root);
        WriteFile(root, "a.png", 400_000, DateTime.UtcNow.AddHours(-3));
        WriteFile(root, "b.png", 300_000, DateTime.UtcNow.AddHours(-2));
        WriteFile(root, "c.png", 300_000, DateTime.UtcNow.AddHours(-1));

        ImageFetchService.Evict(root, 900_000);

        Assert.False(File.Exists(Path.Combine(root, "a.png")));
        Assert.True(File.Exists(Path.Combine(root, "b.png")));
        Assert.True(File.Exists(Path.Combine(root, "c.png")));
    }

    private static void WriteFile(string root, string name, int bytes, DateTime lastAccess)
    {
        var path = Path.Combine(root, name);
        File.WriteAllBytes(path, new byte[bytes]);
        File.SetLastAccessTimeUtc(path, lastAccess);
    }

    private static int ImageWidth(string path)
    {
        using var stream = File.OpenRead(path);
        using var bitmap = new Bitmap(stream);
        return bitmap.Width;
    }
}
