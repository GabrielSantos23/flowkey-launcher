using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed class ImageFetchService
{
    public const long MaxDownloadBytes = 2 * 1024 * 1024;
    public const int MaxEdgePixels = 512;
    public const long MaxCacheBytes = 256 * 1024 * 1024;
    public const int DownloadTimeoutMs = 10000;

    private readonly Func<HttpMessageHandler>? handlerFactory;
    private readonly string cacheRoot;

    public ImageFetchService(Func<HttpMessageHandler>? handlerFactory = null, string? cacheRoot = null)
    {
        this.handlerFactory = handlerFactory;
        this.cacheRoot = cacheRoot ?? CacheRoot;
    }

    public string CachePathFor(string extensionId, string url) => CachePath(cacheRoot, extensionId, url);

    public async Task<NativeCallOutcome> FetchAsync(
        string extensionId,
        Dictionary<string, JsonElement>? parameters,
        IReadOnlyList<string> httpHosts,
        CancellationToken cancellationToken)
    {
        if (parameters is null || !parameters.TryGetValue("url", out var urlElement) || urlElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "image.fetch requires a string 'url' parameter");
        }
        Uri uri;
        try
        {
            uri = new Uri(urlElement.GetString()!);
        }
        catch (UriFormatException)
        {
            return NativeCallOutcome.Failure("invalidUrl", $"malformed url '{urlElement.GetString()}'");
        }
        var decision = HttpPolicy.ValidateRequest(uri, httpHosts);
        if (!decision.Allowed)
        {
            return NativeCallOutcome.Failure(decision.ErrorCode!, decision.Message!);
        }

        var target = CachePath(cacheRoot, extensionId, urlElement.GetString()!);
        if (File.Exists(target))
        {
            File.SetLastAccessTimeUtc(target, DateTime.UtcNow);
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new
            {
                ok = true,
                uri = new Uri(target).AbsoluteUri,
            }));
        }

        var bytes = await DownloadAsync(uri, cancellationToken);
        if (bytes.Failure is not null)
        {
            return bytes.Failure;
        }

        using var stream = new MemoryStream(bytes.Data!);
        using var image = TryDecode(stream);
        if (image is null)
        {
            return NativeCallOutcome.Failure("invalidImage", "url did not return a decodable image");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        using (var resized = Downscale(image))
        {
            resized.Save(target, System.Drawing.Imaging.ImageFormat.Png);
        }
        File.SetLastAccessTimeUtc(target, DateTime.UtcNow);
        Evict(cacheRoot, MaxCacheBytes);
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new
        {
            ok = true,
            uri = new Uri(target).AbsoluteUri,
        }));
    }

    public static string CacheRoot { get; } = Path.Combine(IconUriPolicy.IconCacheRoot, "images");

    internal static string CachePath(string root, string extensionId, string url)
    {
        var folder = Path.Combine(root, Sanitize(extensionId));
        return Path.Combine(folder, AppIconCache.Hash(url) + ".png");
    }

    internal static string Sanitize(string extensionId)
    {
        var builder = new StringBuilder();
        foreach (var c in extensionId.ToLowerInvariant())
        {
            builder.Append(char.IsAsciiLetterOrDigit(c) ? c : '-');
        }
        return builder.Length == 0 ? "unknown" : builder.ToString();
    }

    internal static Bitmap? TryDecode(Stream stream)
    {
        try
        {
            var decoder = System.Windows.Media.Imaging.BitmapDecoder.Create(
                stream,
                System.Windows.Media.Imaging.BitmapCreateOptions.PreservePixelFormat,
                System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
            if (decoder.Frames.Count == 0)
            {
                return null;
            }
            var converted = new MemoryStream();
            var encoder = new System.Windows.Media.Imaging.BmpBitmapEncoder();
            encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(decoder.Frames[0]));
            encoder.Save(converted);
            converted.Position = 0;
            return new Bitmap(converted);
        }
        catch (ArgumentException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
        catch (NotSupportedException)
        {
            return null;
        }
        catch (System.IO.IOException)
        {
            return null;
        }
    }

    internal static Bitmap Downscale(Bitmap source)
    {
        var scale = Math.Min(1.0f, MaxEdgePixels / (float)Math.Max(source.Width, source.Height));
        if (scale >= 1.0f)
        {
            return source;
        }
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
        var target = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(target);
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.DrawImage(source, 0, 0, width, height);
        return target;
    }

    internal static void Evict(string root, long maxBytes)
    {
        if (!Directory.Exists(root))
        {
            return;
        }
        long total = 0;
        var files = new List<(string Path, DateTime LastAccess, long Length)>();
        foreach (var file in Directory.EnumerateFiles(root, "*.png", SearchOption.AllDirectories))
        {
            try
            {
                var info = new FileInfo(file);
                total += info.Length;
                files.Add((file, info.LastAccessTimeUtc, info.Length));
            }
            catch (IOException)
            {
            }
        }
        if (total <= maxBytes)
        {
            return;
        }
        foreach (var file in files.OrderBy(f => f.LastAccess))
        {
            if (total <= maxBytes)
            {
                break;
            }
            try
            {
                File.Delete(file.Path);
                total -= file.Length;
            }
            catch (IOException)
            {
            }
        }
    }

    private async Task<(byte[]? Data, NativeCallOutcome? Failure)> DownloadAsync(Uri uri, CancellationToken cancellationToken)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(DownloadTimeoutMs);
        using var handler = handlerFactory is not null
            ? handlerFactory()
            : new SocketsHttpHandler
            {
                UseCookies = false,
                UseProxy = false,
                AllowAutoRedirect = false,
                AutomaticDecompression = DecompressionMethods.All,
                ConnectCallback = (context, ct) => ConnectValidatedAsync(context, ct),
            };
        using var client = new HttpClient(handler);
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token);
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            return (null, NativeCallOutcome.Failure("timeout", $"image request timed out after {DownloadTimeoutMs} ms"));
        }
        catch (Exception ex)
        {
            return (null, NativeCallOutcome.Failure("networkError", ex.Message));
        }
        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                return (null, NativeCallOutcome.Failure("imageFetchFailed", $"image url returned {(int)response.StatusCode}"));
            }
            if (response.Headers.Location is not null)
            {
                return (null, NativeCallOutcome.Failure("redirectBlocked", "image.fetch does not follow redirects; use the direct url"));
            }
            var buffer = new MemoryStream();
            try
            {
                await response.Content.CopyToAsync(buffer, timeoutCts.Token);
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
            {
                return (null, NativeCallOutcome.Failure("timeout", $"image request timed out after {DownloadTimeoutMs} ms"));
            }
            if (buffer.Length > MaxDownloadBytes)
            {
                return (null, NativeCallOutcome.Failure("responseTooLarge", $"image exceeds {MaxDownloadBytes} bytes"));
            }
            return (buffer.ToArray(), null);
        }
    }

    private static async ValueTask<Stream> ConnectValidatedAsync(SocketsHttpConnectionContext context, CancellationToken cancellationToken)
    {
        var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, cancellationToken);
        var decision = HttpPolicy.ValidateResolvedAddresses(context.DnsEndPoint.Host, addresses);
        if (!decision.Allowed)
        {
            throw new HttpRequestException($"blocked: {decision.Message}");
        }
        foreach (var address in addresses)
        {
            if (HttpPolicy.IsBlockedAddress(address))
            {
                continue;
            }
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
            socket.NoDelay = true;
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, context.DnsEndPoint.Port), cancellationToken);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }
        throw new HttpRequestException("no allowed address to connect to");
    }
}
