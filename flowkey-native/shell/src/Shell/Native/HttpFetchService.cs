using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed class HttpFetchService
{
    public const long MaxResponseBytes = 5 * 1024 * 1024;
    public const int MaxRedirects = 5;
    public const int DefaultTimeoutMs = 10000;

    public async Task<NativeCallOutcome> FetchAsync(
        Dictionary<string, JsonElement>? parameters,
        IReadOnlyList<string> httpHosts,
        CancellationToken cancellationToken)
    {
        if (parameters is null || !parameters.TryGetValue("url", out var urlElement) || urlElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "http.fetch requires a string 'url' parameter");
        }
        var urlString = urlElement.GetString();
        Uri uri;
        try
        {
            uri = new Uri(urlString!);
        }
        catch (UriFormatException)
        {
            return NativeCallOutcome.Failure("invalidUrl", $"malformed url '{urlString}'");
        }

        var initial = HttpPolicy.ValidateRequest(uri, httpHosts);
        if (!initial.Allowed)
        {
            return NativeCallOutcome.Failure(initial.ErrorCode!, initial.Message!);
        }

        var method = parameters is not null && parameters.TryGetValue("method", out var m) && m.ValueKind == JsonValueKind.String
            ? m.GetString()!.ToUpperInvariant()
            : "GET";
        var timeoutMs = parameters is not null && parameters.TryGetValue("timeoutMs", out var t) && t.ValueKind == JsonValueKind.Number
            ? t.GetInt32()
            : DefaultTimeoutMs;
        var headers = parameters is not null && parameters.TryGetValue("headers", out var h) && h.ValueKind == JsonValueKind.Object
            ? h.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.ToString())
            : new Dictionary<string, string>();
        string? body = parameters is not null && parameters.TryGetValue("body", out var b) && b.ValueKind == JsonValueKind.String
            ? b.GetString()
            : null;

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(Math.Max(1, timeoutMs));

        var current = uri;
        var authorization = headers.TryGetValue("Authorization", out var auth) ? auth : null;
        string? requestBody = body;

        for (var redirect = 0; redirect <= MaxRedirects; redirect++)
        {
            if (redirect > 0)
            {
                var decision = HttpPolicy.ValidateRedirect(current, uri, httpHosts);
                if (!decision.Allowed)
                {
                    return NativeCallOutcome.Failure(decision.ErrorCode!, decision.Message!);
                }
                if (HttpPolicy.IsCrossHost(current, uri))
                {
                    authorization = null;
                }
            }

            using var handler = new SocketsHttpHandler
            {
                UseCookies = false,
                UseProxy = false,
                AllowAutoRedirect = false,
                AutomaticDecompression = DecompressionMethods.All,
                ConnectCallback = (context, ct) => ConnectValidatedAsync(context, httpHosts, ct),
            };
            using var client = new HttpClient(handler);
            using var request = new HttpRequestMessage(new HttpMethod(method), uri);
            foreach (var (key, value) in headers)
            {
                if (!key.Equals("Authorization", StringComparison.OrdinalIgnoreCase) || authorization is not null)
                {
                    request.Headers.TryAddWithoutValidation(key, key.Equals("Authorization", StringComparison.OrdinalIgnoreCase) ? authorization! : value);
                }
            }
            if (requestBody is not null)
            {
                request.Content = new StringContent(requestBody, Encoding.UTF8);
            }

            HttpResponseMessage response;
            try
            {
                response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token);
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
            {
                return NativeCallOutcome.Failure("timeout", $"request timed out after {timeoutMs} ms");
            }
            catch (Exception ex)
            {
                return NativeCallOutcome.Failure("networkError", ex.Message);
            }

            using (response)
            {
                if ((int)response.StatusCode is 301 or 302 or 303 or 307 or 308)
                {
                    var location = response.Headers.Location;
                    if (location is null)
                    {
                        return NativeCallOutcome.Failure("networkError", "redirect without Location header");
                    }
                    requestBody = (int)response.StatusCode is 301 or 302 or 303 ? null : requestBody;
                    uri = location.IsAbsoluteUri ? location : new Uri(uri, location);
                    continue;
                }

                var total = 0L;
                var buffer = new MemoryStream();
                var stream = await response.Content.ReadAsStreamAsync(timeoutCts.Token);
                var chunk = new byte[64 * 1024];
                int read;
                while ((read = await stream.ReadAsync(chunk.AsMemory(0, chunk.Length), timeoutCts.Token)) > 0)
                {
                    total += read;
                    if (total > MaxResponseBytes)
                    {
                        return NativeCallOutcome.Failure("responseTooLarge", $"response exceeds {MaxResponseBytes} bytes");
                    }
                    buffer.Write(chunk, 0, read);
                }

                var responseHeaders = response.Headers.ToDictionary(
                    p => p.Key,
                    p => string.Join(", ", p.Value));
                foreach (var p in response.Content.Headers)
                {
                    responseHeaders[p.Key] = string.Join(", ", p.Value);
                }

                var result = JsonSerializer.SerializeToElement(new
                {
                    status = (int)response.StatusCode,
                    headers = responseHeaders,
                    bodyText = Encoding.UTF8.GetString(buffer.ToArray()),
                    truncated = false,
                });
                return NativeCallOutcome.Success(result);
            }
        }
        return NativeCallOutcome.Failure("tooManyRedirects", $"more than {MaxRedirects} redirects");
    }

    private static async ValueTask<Stream> ConnectValidatedAsync(
        SocketsHttpConnectionContext context,
        IReadOnlyList<string> httpHosts,
        CancellationToken cancellationToken)
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
