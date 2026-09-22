using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record AuthedFetchContext(
    string PinnedHost,
    Func<CancellationToken, Task<string?>> AcquireToken,
    Func<CancellationToken, Task<bool>> ForceRefresh);

public sealed class HttpFetchService
{
    public const long MaxResponseBytes = 5 * 1024 * 1024;
    public const int MaxRedirects = 5;
    public const int DefaultTimeoutMs = 10000;
    public const int MaxAuthAttempts = 2;
    private static readonly TimeSpan RetryAfterCap = TimeSpan.FromSeconds(5);

    public Task<NativeCallOutcome> FetchAsync(
        Dictionary<string, JsonElement>? parameters,
        IReadOnlyList<string> httpHosts,
        CancellationToken cancellationToken)
    {
        return FetchAsync(parameters, httpHosts, cancellationToken, resolveAuth: null, handlerFactory: null);
    }

    public async Task<NativeCallOutcome> FetchAsync(
        Dictionary<string, JsonElement>? parameters,
        IReadOnlyList<string> httpHosts,
        CancellationToken cancellationToken,
        Func<string, AuthedFetchContext?>? resolveAuth,
        Func<HttpMessageHandler>? handlerFactory = null)
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

        string? provider = null;
        if (parameters is not null && parameters.TryGetValue("auth", out var authElement))
        {
            if (authElement.ValueKind != JsonValueKind.String)
            {
                return NativeCallOutcome.Failure("invalidParams", "http.fetch 'auth' must be a provider id string");
            }
            provider = authElement.GetString();
            if (resolveAuth is null)
            {
                return NativeCallOutcome.Failure("authUnsupported", "authenticated fetch is not wired up in this shell");
            }
        }

        var pinnedHost = (string?)null;
        var authed = (AuthedFetchContext?)null;
        if (provider is not null)
        {
            authed = resolveAuth!(provider);
            if (authed is null)
            {
                return NativeCallOutcome.Failure("unknownProvider", $"oauth provider '{provider}' is not implemented by this shell");
            }
            pinnedHost = authed.PinnedHost;
            foreach (var key in headers.Keys.Where(k => k.Equals("Authorization", StringComparison.OrdinalIgnoreCase)).ToList())
            {
                headers.Remove(key);
            }
            if (!HostMatches(uri, pinnedHost))
            {
                return NativeCallOutcome.Failure("hostNotAllowed", $"authenticated requests for provider '{provider}' may only target {pinnedHost}");
            }
        }
        else if (headers.TryGetValue("Authorization", out var auth))
        {
            return await SendOnceAndMapAsync(uri, method, headers, auth, body, httpHosts, pinnedHost, timeoutMs, cancellationToken, handlerFactory);
        }

        if (authed is null)
        {
            return await SendOnceAndMapAsync(uri, method, headers, null, body, httpHosts, pinnedHost, timeoutMs, cancellationToken, handlerFactory);
        }

        var token = await authed.AcquireToken(cancellationToken);
        if (token is null)
        {
            return NativeCallOutcome.Failure("authRequired", $"no valid token for provider '{provider}'; run oauth.authorize first");
        }

        var refreshed = false;
        var rateRetried = false;
        for (var attempt = 0; attempt <= MaxAuthAttempts; attempt++)
        {
            var sent = await SendLoopAsync(uri, method, headers, $"Bearer {token}", body, httpHosts, pinnedHost, timeoutMs, cancellationToken, handlerFactory);
            if (sent.Failure is not null)
            {
                return sent.Failure;
            }
            if (sent.Status == 401 && !refreshed)
            {
                refreshed = true;
                if (await authed.ForceRefresh(cancellationToken))
                {
                    token = await authed.AcquireToken(cancellationToken);
                    if (token is null)
                    {
                        return NativeCallOutcome.Failure("authRequired", $"token refresh for provider '{provider}' did not yield a token");
                    }
                    continue;
                }
                return NativeCallOutcome.Failure("authRequired", $"token refresh for provider '{provider}' failed; re-authorization is required");
            }
            if (sent.Status == 401)
            {
                return NativeCallOutcome.Failure("authRequired", $"provider '{provider}' rejected the request after a token refresh; re-authorization is required");
            }
            if (sent.Status == 429 && !rateRetried)
            {
                rateRetried = true;
                var delay = ParseRetryAfter(sent.Headers);
                if (delay > TimeSpan.Zero && delay <= RetryAfterCap)
                {
                    await Task.Delay(delay.Value, cancellationToken);
                    continue;
                }
            }
            return MapSuccess(sent);
        }
        return NativeCallOutcome.Failure("authRequired", $"provider '{provider}' kept rejecting the request; re-authorization is required");
    }

    private static async Task<NativeCallOutcome> SendOnceAndMapAsync(
        Uri uri,
        string method,
        Dictionary<string, string> headers,
        string? authorization,
        string? body,
        IReadOnlyList<string> httpHosts,
        string? pinnedHost,
        int timeoutMs,
        CancellationToken cancellationToken,
        Func<HttpMessageHandler>? handlerFactory)
    {
        var sent = await SendLoopAsync(uri, method, headers, authorization, body, httpHosts, pinnedHost, timeoutMs, cancellationToken, handlerFactory);
        if (sent.Failure is not null)
        {
            return sent.Failure;
        }
        return MapSuccess(sent);
    }

    private static NativeCallOutcome MapSuccess(SendResult sent)
    {
        var result = JsonSerializer.SerializeToElement(new
        {
            status = sent.Status,
            headers = sent.Headers,
            bodyText = sent.BodyText,
            truncated = false,
        });
        return NativeCallOutcome.Success(result);
    }

    private static async Task<SendResult> SendLoopAsync(
        Uri uri,
        string method,
        Dictionary<string, string> headers,
        string? authorization,
        string? body,
        IReadOnlyList<string> httpHosts,
        string? pinnedHost,
        int timeoutMs,
        CancellationToken cancellationToken,
        Func<HttpMessageHandler>? handlerFactory)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(Math.Max(1, timeoutMs));

        var current = uri;
        string? requestBody = body;

        for (var redirect = 0; redirect <= MaxRedirects; redirect++)
        {
            if (pinnedHost is not null && !HostMatches(uri, pinnedHost))
            {
                return SendResult.Failed(NativeCallOutcome.Failure(
                    "hostNotAllowed",
                    $"authenticated requests may only target {pinnedHost}; redirect to '{uri.Host}' was blocked"));
            }
            if (redirect > 0)
            {
                var decision = HttpPolicy.ValidateRedirect(current, uri, httpHosts);
                if (!decision.Allowed)
                {
                    return SendResult.Failed(NativeCallOutcome.Failure(decision.ErrorCode!, decision.Message!));
                }
                if (HttpPolicy.IsCrossHost(current, uri))
                {
                    authorization = null;
                }
            }

            using var handler = handlerFactory is not null
                ? handlerFactory()
                : new SocketsHttpHandler
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
                if (key.Equals("Authorization", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                request.Headers.TryAddWithoutValidation(key, value);
            }
            if (authorization is not null)
            {
                request.Headers.TryAddWithoutValidation("Authorization", authorization);
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
                return SendResult.Failed(NativeCallOutcome.Failure("timeout", $"request timed out after {timeoutMs} ms"));
            }
            catch (Exception ex)
            {
                return SendResult.Failed(NativeCallOutcome.Failure("networkError", ex.Message));
            }

            using (response)
            {
                if ((int)response.StatusCode is 301 or 302 or 303 or 307 or 308)
                {
                    var location = response.Headers.Location;
                    if (location is null)
                    {
                        return SendResult.Failed(NativeCallOutcome.Failure("networkError", "redirect without Location header"));
                    }
                    requestBody = (int)response.StatusCode is 301 or 302 or 303 ? null : requestBody;
                    current = uri;
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
                        return SendResult.Failed(NativeCallOutcome.Failure("responseTooLarge", $"response exceeds {MaxResponseBytes} bytes"));
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

                return new SendResult((int)response.StatusCode, responseHeaders, Encoding.UTF8.GetString(buffer.ToArray()));
            }
        }
        return SendResult.Failed(NativeCallOutcome.Failure("tooManyRedirects", $"more than {MaxRedirects} redirects"));
    }

    internal static TimeSpan? ParseRetryAfter(IReadOnlyDictionary<string, string> headers)
    {
        var entry = headers.FirstOrDefault(p => p.Key.Equals("Retry-After", StringComparison.OrdinalIgnoreCase));
        if (entry.Key is null || string.IsNullOrWhiteSpace(entry.Value))
        {
            return null;
        }
        if (int.TryParse(entry.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var seconds))
        {
            return TimeSpan.FromSeconds(Math.Max(0, seconds));
        }
        if (DateTimeOffset.TryParse(entry.Value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            return date - DateTimeOffset.UtcNow;
        }
        return null;
    }

    private static bool HostMatches(Uri uri, string pinnedHost) =>
        string.Equals(uri.Host, pinnedHost, StringComparison.OrdinalIgnoreCase);

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

    private sealed record SendResult(int Status, Dictionary<string, string> Headers, string BodyText, NativeCallOutcome? Failure = null)
    {
        public static SendResult Failed(NativeCallOutcome outcome) => new(0, new Dictionary<string, string>(), "", outcome);
    }
}
