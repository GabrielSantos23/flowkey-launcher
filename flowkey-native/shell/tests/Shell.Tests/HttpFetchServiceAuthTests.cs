using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class HttpFetchServiceAuthTests
{
    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> responses;
        private readonly Queue<HttpResponseMessage> fallback;

        public List<(string Url, string AuthHeader)> Requests { get; } = new();

        public StubHandler(Queue<HttpResponseMessage> responses, Queue<HttpResponseMessage>? fallback = null)
        {
            this.responses = responses;
            this.fallback = fallback ?? new Queue<HttpResponseMessage>();
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var auth = request.Headers.TryGetValues("Authorization", out var values) ? string.Join(", ", values) : "";
            Requests.Add((request.RequestUri!.ToString(), auth));
            if (responses.TryDequeue(out var response))
            {
                return Task.FromResult(response);
            }
            if (fallback.TryDequeue(out var next))
            {
                return Task.FromResult(next);
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError));
        }
    }

    private static Queue<HttpResponseMessage> JsonQueue(params (HttpStatusCode Status, string Body)[] items)
    {
        var queue = new Queue<HttpResponseMessage>();
        foreach (var (status, body) in items)
        {
            queue.Enqueue(JsonResponse(status, body));
        }
        return queue;
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode status, string body)
    {
        return new HttpResponseMessage(status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
    }

    private static Dictionary<string, JsonElement> Params(string url, string? auth = "spotify", string? authorizationHeader = null)
    {
        var result = new Dictionary<string, JsonElement>
        {
            ["url"] = JsonSerializer.SerializeToElement(url),
        };
        if (auth is not null)
        {
            result["auth"] = JsonSerializer.SerializeToElement(auth);
        }
        if (authorizationHeader is not null)
        {
            result["headers"] = JsonSerializer.SerializeToElement(new Dictionary<string, string>
            {
                ["Authorization"] = authorizationHeader,
            });
        }
        return result;
    }

    private static Dictionary<string, JsonElement> PlainParams(string url) => new()
    {
        ["url"] = JsonSerializer.SerializeToElement(url),
    };

    private static IReadOnlyList<string> Hosts(params string[] hosts) => hosts;

    [Fact]
    public async Task InjectsBearerTokenOnBehalfOfTheExtension()
    {
        var handler = new StubHandler(JsonQueue((HttpStatusCode.OK, "{\"display_name\":\"me\"}")));
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(false)),
            () => handler);

        Assert.True(outcome.Ok, outcome.Error?.Message ?? "fetch failed");
        Assert.Equal((HttpStatusCode)200, (HttpStatusCode)outcome.Result!.Value.GetProperty("status").GetInt32());
        var request = handler.Requests.Single();
        Assert.Equal("Bearer tok-1", request.AuthHeader);
    }

    [Fact]
    public async Task DropsExtensionSuppliedAuthorizationWhenAuthIsRequested()
    {
        var handler = new StubHandler(JsonQueue((HttpStatusCode.OK, "{}")));
        var service = new HttpFetchService();
        await service.FetchAsync(
            Params("https://api.spotify.com/v1/me", authorizationHeader: "Bearer extension-supplied"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(false)),
            () => handler);
        Assert.Equal("Bearer tok-1", handler.Requests.Single().AuthHeader);
    }

    [Fact]
    public async Task PlainFetchStillHonorsExtensionAuthorization()
    {
        var handler = new StubHandler(JsonQueue((HttpStatusCode.OK, "hello")));
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.github.com/x", auth: null, authorizationHeader: "Bearer plain"),
            Hosts("api.github.com"),
            CancellationToken.None,
            null,
            () => handler);
        Assert.True(outcome.Ok);
        Assert.Equal("Bearer plain", handler.Requests.Single().AuthHeader);
        Assert.Equal(200, outcome.Result!.Value.GetProperty("status").GetInt32());
        Assert.Equal("hello", outcome.Result.Value.GetProperty("bodyText").GetString());
        Assert.False(outcome.Result.Value.GetProperty("truncated").GetBoolean());
    }

    [Fact]
    public async Task RejectsHostOutsideProviderPinBeforeSending()
    {
        var handler = new StubHandler(JsonQueue());
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://evil.example.com/steal"),
            Hosts("api.spotify.com", "evil.example.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(false)),
            () => handler);
        Assert.False(outcome.Ok);
        Assert.Equal("hostNotAllowed", outcome.Error!.Code);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task BlocksRedirectAwayFromPinnedHost()
    {
        var redirect = JsonResponse(HttpStatusCode.Found, "");
        redirect.Headers.Location = new Uri("https://evil.example.com/catch");
        var handler = new StubHandler(new Queue<HttpResponseMessage>(new[] { redirect }));
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com", "evil.example.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(false)),
            () => handler);
        Assert.False(outcome.Ok);
        Assert.Equal("hostNotAllowed", outcome.Error!.Code);
    }

    [Fact]
    public async Task FailsAuthRequiredWhenNoTokenAvailable()
    {
        var handler = new StubHandler(JsonQueue());
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>(null), _ => Task.FromResult(false)),
            () => handler);
        Assert.False(outcome.Ok);
        Assert.Equal("authRequired", outcome.Error!.Code);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task RefreshesTokenOnceOn401AndRetries()
    {
        var handler = new StubHandler(JsonQueue((HttpStatusCode.Unauthorized, "{}"), (HttpStatusCode.OK, "{\"ok\":true}")));
        var refreshed = false;
        var tokens = new[] { "tok-1", "tok-2" };
        var acquireCalls = 0;
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext(
                "api.spotify.com",
                _ => Task.FromResult<string?>(tokens[Math.Min(acquireCalls++, tokens.Length - 1)]),
                _ =>
                {
                    refreshed = true;
                    return Task.FromResult(true);
                }),
            () => handler);

        Assert.True(outcome.Ok, outcome.Error?.Message ?? "fetch failed");
        Assert.True(refreshed);
        Assert.Equal(2, handler.Requests.Count);
        Assert.Equal("Bearer tok-1", handler.Requests[0].AuthHeader);
        Assert.Equal("Bearer tok-2", handler.Requests[1].AuthHeader);
    }

    [Fact]
    public async Task FailsAuthRequiredWhenRefreshFails()
    {
        var handler = new StubHandler(JsonQueue((HttpStatusCode.Unauthorized, "{}")));
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(false)),
            () => handler);
        Assert.False(outcome.Ok);
        Assert.Equal("authRequired", outcome.Error!.Code);
    }

    [Fact]
    public async Task FailsAuthRequiredWhenStillUnauthorizedAfterRefresh()
    {
        var handler = new StubHandler(JsonQueue((HttpStatusCode.Unauthorized, "{}"), (HttpStatusCode.Unauthorized, "{}")));
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(true)),
            () => handler);
        Assert.False(outcome.Ok);
        Assert.Equal("authRequired", outcome.Error!.Code);
        Assert.Equal(2, handler.Requests.Count);
    }

    [Fact]
    public async Task Retries429WhenRetryAfterIsShort()
    {
        var rateLimited = JsonResponse(HttpStatusCode.TooManyRequests, "{}");
        rateLimited.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(1));
        var handler = new StubHandler(new Queue<HttpResponseMessage>(new[] { rateLimited, JsonResponse(HttpStatusCode.OK, "final") }));
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(false)),
            () => handler);
        Assert.True(outcome.Ok);
        Assert.Equal(200, outcome.Result!.Value.GetProperty("status").GetInt32());
        Assert.Equal(2, handler.Requests.Count);
    }

    [Fact]
    public async Task AuthedFetchEnforcesOneTotalBudgetAcrossRetries()
    {
        var rateLimited = JsonResponse(HttpStatusCode.TooManyRequests, "{}");
        rateLimited.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(3));
        var handler = new StubHandler(new Queue<HttpResponseMessage>(new[] { rateLimited }));
        var service = new HttpFetchService();
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        var parameters = Params("https://api.spotify.com/v1/search?q=kanye");
        parameters["timeoutMs"] = System.Text.Json.JsonSerializer.SerializeToElement(1000);
        var outcome = await service.FetchAsync(
            parameters,
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(false)),
            () => handler);

        Assert.False(outcome.Ok);
        Assert.Equal("timeout", outcome.Error!.Code);
        Assert.Single(handler.Requests);
        Assert.True(stopwatch.ElapsedMilliseconds < 10_000);
    }

    [Fact]
    public async Task Surfaces429WhenRetryAfterExceedsCap()
    {
        var queue = JsonQueue((HttpStatusCode.TooManyRequests, "slow down"));
        queue.Peek().Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(30));
        var handler = new StubHandler(queue);
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => new AuthedFetchContext("api.spotify.com", _ => Task.FromResult<string?>("tok-1"), _ => Task.FromResult(false)),
            () => handler);
        Assert.True(outcome.Ok);
        Assert.Equal(429, outcome.Result!.Value.GetProperty("status").GetInt32());
        Assert.Equal("slow down", outcome.Result.Value.GetProperty("bodyText").GetString());
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task RedirectChainKeepsAuthorizationOnSameHostHopAndDropsOnFirstCrossHostHop()
    {
        var sameHost = JsonResponse(HttpStatusCode.Found, "");
        sameHost.Headers.Location = new Uri("https://api.spotify.com/v2/me");
        var crossHost = JsonResponse(HttpStatusCode.Found, "");
        crossHost.Headers.Location = new Uri("https://evil.example.com/catch");
        var handler = new StubHandler(new Queue<HttpResponseMessage>(new[]
        {
            sameHost,
            crossHost,
            JsonResponse(HttpStatusCode.OK, "done"),
        }));
        var service = new HttpFetchService();

        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me", auth: null, authorizationHeader: "Bearer extension-token"),
            Hosts("api.spotify.com", "evil.example.com"),
            CancellationToken.None,
            null,
            () => handler);

        Assert.True(outcome.Ok, outcome.Error?.Message ?? "fetch failed");
        Assert.Equal(3, handler.Requests.Count);
        Assert.Equal("Bearer extension-token", handler.Requests[0].AuthHeader);
        Assert.Equal("Bearer extension-token", handler.Requests[1].AuthHeader);
        Assert.Equal("", handler.Requests[2].AuthHeader);
    }

    [Fact]
    public void ParseRetryAfterHandlesSecondsDatesAndGarbage()
    {
        Assert.Equal(TimeSpan.FromSeconds(3), HttpFetchService.ParseRetryAfter(new Dictionary<string, string> { ["Retry-After"] = "3" }));
        Assert.Null(HttpFetchService.ParseRetryAfter(new Dictionary<string, string> { ["Retry-After"] = "not a date" }));
        Assert.Null(HttpFetchService.ParseRetryAfter(new Dictionary<string, string>()));
        var future = new Dictionary<string, string> { ["retry-after"] = DateTimeOffset.UtcNow.AddSeconds(10).ToString("R") };
        var parsed = HttpFetchService.ParseRetryAfter(future);
        Assert.NotNull(parsed);
        Assert.InRange(parsed!.Value.TotalSeconds, 5, 10);
    }

    [Fact]
    public async Task UnknownProviderFailsWithoutSending()
    {
        var handler = new StubHandler(JsonQueue());
        var service = new HttpFetchService();
        var outcome = await service.FetchAsync(
            Params("https://api.spotify.com/v1/me"),
            Hosts("api.spotify.com"),
            CancellationToken.None,
            _ => null,
            () => handler);
        Assert.False(outcome.Ok);
        Assert.Equal("unknownProvider", outcome.Error!.Code);
        Assert.Empty(handler.Requests);
    }
}
