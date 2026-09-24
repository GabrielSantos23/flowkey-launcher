using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Web;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class OAuthCallbackStateTests
{
    [Theory]
    [InlineData("http://127.0.0.1:99/callback?code=abc&state=wrong")]
    [InlineData("http://127.0.0.1:99/callback?code=abc")]
    public void ParseCallbackRejectsStateMismatch(string url)
    {
        var result = OAuthService.ParseCallback(new Uri(url), "expected-state");
        Assert.Equal("invalidState", result.Failure);
        Assert.Null(result.Code);
        Assert.True(result.StateRejected);
    }

    [Fact]
    public void ParseCallbackReturnsCodeForMatchingState()
    {
        var result = OAuthService.ParseCallback(new Uri("http://127.0.0.1:99/callback?code=abc&state=expected-state"), "expected-state");
        Assert.Null(result.Failure);
        Assert.Equal("abc", result.Code);
    }

    [Fact]
    public void ParseCallbackRejectsMissingCode()
    {
        var result = OAuthService.ParseCallback(new Uri("http://127.0.0.1:99/callback?state=expected-state"), "expected-state");
        Assert.Equal("invalidCallback", result.Failure);
    }

    [Fact]
    public void ParseCallbackSurfacesProviderDenial()
    {
        var result = OAuthService.ParseCallback(new Uri("http://127.0.0.1:99/callback?error=access_denied&state=expected-state"), "expected-state");
        Assert.Equal("accessDenied", result.Failure);
        Assert.Equal("access_denied", result.ProviderError);
    }

    [Fact]
    public void CreateChallengeIsBase64UrlSha256OfVerifier()
    {
        var verifier = "test-verifier-value";
        var expected = Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(Encoding.ASCII.GetBytes(verifier)))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        Assert.Equal(expected, OAuthService.CreateChallenge(verifier));
    }

    [Fact]
    public void CreateVerifierMeetsRfc7636Length()
    {
        var verifier = OAuthService.CreateVerifier();
        Assert.InRange(verifier.Length, 43, 128);
    }
}

public class OAuthServiceTests : IDisposable
{
    private readonly string tempDir = Path.Combine(Path.GetTempPath(), "flowkey-oauth-tests-" + Guid.NewGuid().ToString("N"));
    private readonly TokenVault vault;
    private HttpListener? stubServer;
    private readonly List<string> tokenRequests = new();
    private readonly Queue<HttpResponseMessage> stubResponses = new();

    public OAuthServiceTests()
    {
        vault = new TokenVault(tempDir);
    }

    public void Dispose()
    {
        if (stubServer is not null)
        {
            try
            {
                stubServer.Stop();
                stubServer.Close();
            }
            catch
            {
            }
        }
        if (Directory.Exists(tempDir))
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    private string StartStubServer()
    {
        var port = FreePort();
        stubServer = new HttpListener();
        stubServer.Prefixes.Add($"http://127.0.0.1:{port}/token/");
        stubServer.Start();
        _ = Task.Run(async () =>
        {
            while (stubServer is not null && stubServer.IsListening)
            {
                HttpListenerContext context;
                try
                {
                    context = await stubServer.GetContextAsync();
                }
                catch
                {
                    return;
                }
                tokenRequests.Add(await new StreamReader(context.Request.InputStream).ReadToEndAsync());
                if (stubResponses.TryDequeue(out var response))
                {
                    context.Response.StatusCode = (int)response.StatusCode;
                    var bytes = await response.Content.ReadAsByteArrayAsync();
                    context.Response.ContentType = "application/json";
                    await context.Response.OutputStream.WriteAsync(bytes);
                }
                else
                {
                    context.Response.StatusCode = 500;
                }
                context.Response.Close();
                response.Dispose();
            }
        });
        return $"http://127.0.0.1:{port}/token";
    }

    private OAuthProviderDefinition Definition(string tokenUrl, string? clientId = "client-1") =>
        new("spotify", clientId, "https://accounts.example.test/authorize", tokenUrl, "scope-a scope-b", "api.spotify.com", 0);

    private static OAuthProviderDefinition UnconfiguredDefinition(string tokenUrl = "http://127.0.0.1:1/token") =>
        new("spotify", null, "https://accounts.example.test/authorize", tokenUrl, "scope-a", "api.spotify.com", 0);

    private static Dictionary<string, JsonElement> ProviderParams() => new()
    {
        ["provider"] = JsonSerializer.SerializeToElement("spotify"),
    };

    [Fact]
    public async Task AuthorizeFlowExchangesCodeAndNeverExposesTokens()
    {
        var tokenUrl = StartStubServer();
        stubResponses.Enqueue(TokenResponse("at-1", "rt-1", 3600, "scope-a scope-b"));
        string? capturedAuthorizeUrl = null;
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition(tokenUrl) }, url =>
        {
            capturedAuthorizeUrl = url;
            var query = HttpUtility.ParseQueryString(new Uri(url).Query);
            var redirect = new Uri(query["redirect_uri"]!);
            var callbackUrl = $"http://127.0.0.1:{redirect.Port}/callback?code=auth-code-1&state={query["state"]}";
            _ = Task.Run(async () =>
            {
                try
                {
                    await new HttpClient().GetStringAsync(callbackUrl);
                }
                catch
                {
                }
            });
            return Task.CompletedTask;
        });

        var outcome = await service.AuthorizeAsync("ext-a", ProviderParams(), new[] { "spotify" }, CancellationToken.None, TimeSpan.FromSeconds(20));

        Assert.True(outcome.Ok, outcome.Error?.Message ?? "authorize failed");
        var resultJson = outcome.Result!.Value.GetRawText();
        Assert.Contains("\"ok\":true", resultJson);
        Assert.Contains("expiresAt", resultJson);
        Assert.Contains("\"scope\":\"scope-a scope-b\"", resultJson);
        Assert.DoesNotContain("at-1", resultJson);
        Assert.DoesNotContain("rt-1", resultJson);
        Assert.DoesNotContain("auth-code-1", resultJson);

        Assert.NotNull(capturedAuthorizeUrl);
        Assert.Contains("code_challenge_method=S256", capturedAuthorizeUrl);
        Assert.Contains("client_id=client-1", capturedAuthorizeUrl);
        Assert.Contains("response_type=code", capturedAuthorizeUrl);

        var body = tokenRequests.Single();
        Assert.Contains("grant_type=authorization_code", body);
        Assert.Contains("code=auth-code-1", body);
        Assert.Contains("client_id=client-1", body);
        Assert.Contains("redirect_uri=http%3a%2f%2f127.0.0.1%3a", body, StringComparison.OrdinalIgnoreCase);
        var verifier = body.Split('&').Select(p => p.Split('=', 2)).First(p => p[0] == "code_verifier")[1];
        Assert.InRange(verifier.Length, 43, 128);

        var entry = vault.Get("ext-a", "spotify");
        Assert.NotNull(entry);
        Assert.Equal("at-1", entry!.AccessToken);
        Assert.Equal("rt-1", entry.RefreshToken);
        Assert.Equal("scope-a scope-b", entry.Scope);
    }

    [Fact]
    public async Task AuthorizeReturnsExistingValidTokenWithoutLaunchingBrowser()
    {
        vault.Store("ext-a", "spotify", new VaultedToken("at-kept", "rt-kept", DateTimeOffset.UtcNow.AddHours(1), "scope-a scope-b"));
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition("http://127.0.0.1:1/token") }, _ => throw new InvalidOperationException("browser must not be launched"));

        var outcome = await service.AuthorizeAsync("ext-a", ProviderParams(), new[] { "spotify" }, CancellationToken.None, TimeSpan.FromSeconds(5));

        Assert.True(outcome.Ok);
        var resultJson = outcome.Result!.Value.GetRawText();
        Assert.DoesNotContain("at-kept", resultJson);
        var stored = vault.Get("ext-a", "spotify");
        Assert.Equal("at-kept", stored!.AccessToken);
    }

    [Fact]
    public async Task AuthorizeRejectsUndeclaredProvider()
    {
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition("http://127.0.0.1:1/token") });
        var outcome = await service.AuthorizeAsync("ext-a", ProviderParams(), Array.Empty<string>(), CancellationToken.None);
        Assert.False(outcome.Ok);
        Assert.Equal("providerNotDeclared", outcome.Error!.Code);
    }

    [Fact]
    public async Task AuthorizeAcceptsClientIdParameterOnUnconfiguredProvider()
    {
        var tokenUrl = StartStubServer();
        stubResponses.Enqueue(TokenResponse("at-1", "rt-1", 3600, "scope-a scope-b"));
        string? capturedAuthorizeUrl = null;
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = UnconfiguredDefinition(tokenUrl) }, url =>
        {
            capturedAuthorizeUrl = url;
            var query = HttpUtility.ParseQueryString(new Uri(url).Query);
            var redirect = new Uri(query["redirect_uri"]!);
            _ = Task.Run(async () =>
            {
                try
                {
                    await new HttpClient().GetStringAsync($"http://127.0.0.1:{redirect.Port}/callback?code=code-x&state={query["state"]}");
                }
                catch
                {
                }
            });
            return Task.CompletedTask;
        });
        var parameters = new Dictionary<string, JsonElement>
        {
            ["provider"] = JsonSerializer.SerializeToElement("spotify"),
            ["clientId"] = JsonSerializer.SerializeToElement("pref-client-id"),
        };

        var outcome = await service.AuthorizeAsync("ext-a", parameters, new[] { "spotify" }, CancellationToken.None, TimeSpan.FromSeconds(20));

        Assert.True(outcome.Ok, outcome.Error?.Message ?? "authorize failed");
        Assert.Contains("client_id=pref-client-id", capturedAuthorizeUrl);
        Assert.Contains("client_id=pref-client-id", tokenRequests.Single(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal("pref-client-id", vault.Get("ext-a", "spotify")!.ClientId);
    }

    [Fact]
    public async Task AuthorizeFailsNotConfiguredWithoutClientId()
    {
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = UnconfiguredDefinition() });
        var outcome = await service.AuthorizeAsync("ext-a", ProviderParams(), new[] { "spotify" }, CancellationToken.None);
        Assert.False(outcome.Ok);
        Assert.Equal("notConfigured", outcome.Error!.Code);
        Assert.Contains("FLOWKEY_SPOTIFY_CLIENT_ID", outcome.Error.Message);
    }

    [Fact]
    public async Task AuthorizeRejectsStateMismatchDuringCallback()
    {
        var tokenUrl = StartStubServer();
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition(tokenUrl) }, url =>
        {
            var query = HttpUtility.ParseQueryString(new Uri(url).Query);
            var redirect = new Uri(query["redirect_uri"]!);
            _ = Task.Run(async () =>
            {
                try
                {
                    await new HttpClient().GetStringAsync($"http://127.0.0.1:{redirect.Port}/callback?code=evil-code&state=tampered-state");
                }
                catch
                {
                }
            });
            return Task.CompletedTask;
        });

        var outcome = await service.AuthorizeAsync("ext-a", ProviderParams(), new[] { "spotify" }, CancellationToken.None, TimeSpan.FromSeconds(20));

        Assert.False(outcome.Ok);
        Assert.Equal("invalidState", outcome.Error!.Code);
        Assert.Null(vault.Get("ext-a", "spotify"));
        Assert.DoesNotContain(tokenRequests, body => body.Contains("evil-code"));
    }

    [Fact]
    public async Task StatusReturnsOkFalseWithoutEntry()
    {
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition("http://127.0.0.1:1/token") });
        var outcome = await service.StatusAsync("ext-a", ProviderParams(), new[] { "spotify" }, CancellationToken.None);
        Assert.True(outcome.Ok);
        Assert.Contains("\"ok\":false", outcome.Result!.Value.GetRawText());
    }

    [Fact]
    public async Task StatusRefreshesExpiredEntry()
    {
        var tokenUrl = StartStubServer();
        stubResponses.Enqueue(TokenResponse("at-2", "rt-2", 3600, "scope-a scope-b"));
        vault.Store("ext-a", "spotify", new VaultedToken("at-expired", "rt-1", DateTimeOffset.UtcNow.AddSeconds(-30), "scope-a scope-b"));
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition(tokenUrl) });

        var outcome = await service.StatusAsync("ext-a", ProviderParams(), new[] { "spotify" }, CancellationToken.None);

        Assert.True(outcome.Ok);
        Assert.Contains("\"ok\":true", outcome.Result!.Value.GetRawText());
        Assert.Equal("at-2", vault.Get("ext-a", "spotify")!.AccessToken);
    }

    [Fact]
    public async Task DisconnectRemovesVaultEntry()
    {
        vault.Store("ext-a", "spotify", new VaultedToken("at-1", "rt-1", DateTimeOffset.UtcNow.AddHours(1), "scope"));
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition("http://127.0.0.1:1/token") });

        var outcome = service.Disconnect("ext-a", ProviderParams(), new[] { "spotify" });

        Assert.True(outcome.Ok);
        Assert.Null(vault.Get("ext-a", "spotify"));
    }

    [Fact]
    public async Task ForceRefreshUpdatesVault()
    {
        var tokenUrl = StartStubServer();
        stubResponses.Enqueue(TokenResponse("at-2", "rt-2", 3600, "scope-a scope-b"));
        vault.Store("ext-a", "spotify", new VaultedToken("at-1", "rt-1", DateTimeOffset.UtcNow.AddHours(1), "scope-a scope-b"));
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition(tokenUrl) });

        var refreshed = await service.ForceRefreshAsync("ext-a", "spotify", CancellationToken.None);

        Assert.True(refreshed);
        var entry = vault.Get("ext-a", "spotify");
        Assert.Equal("at-2", entry!.AccessToken);
        Assert.Equal("rt-2", entry.RefreshToken);
        Assert.Contains("grant_type=refresh_token", tokenRequests.Single());
        Assert.Contains("refresh_token=rt-1", tokenRequests.Single());
    }

    [Fact]
    public async Task ForceRefreshDeletesEntryOnInvalidGrant()
    {
        var tokenUrl = StartStubServer();
        stubResponses.Enqueue(new HttpResponseMessage(HttpStatusCode.BadRequest)
        {
            Content = new StringContent("{\"error\":\"invalid_grant\"}", Encoding.UTF8, "application/json"),
        });
        vault.Store("ext-a", "spotify", new VaultedToken("at-1", "rt-stale", DateTimeOffset.UtcNow.AddHours(1), "scope"));
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition(tokenUrl) });

        var refreshed = await service.ForceRefreshAsync("ext-a", "spotify", CancellationToken.None);

        Assert.False(refreshed);
        Assert.Null(vault.Get("ext-a", "spotify"));
    }

    [Fact]
    public async Task GetAccessTokenReturnsNullWithoutEntry()
    {
        var service = new OAuthService(vault, () => new Dictionary<string, OAuthProviderDefinition> { ["spotify"] = Definition("http://127.0.0.1:1/token") });
        Assert.Null(await service.GetAccessTokenAsync("ext-a", "spotify", CancellationToken.None));
    }

    private static HttpResponseMessage TokenResponse(string accessToken, string refreshToken, int expiresIn, string scope) =>
        new(HttpStatusCode.OK)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { access_token = accessToken, refresh_token = refreshToken, expires_in = expiresIn, scope }),
                Encoding.UTF8,
                "application/json"),
        };

    private static int FreePort()
    {
        var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        try
        {
            return ((IPEndPoint)probe.LocalEndpoint).Port;
        }
        finally
        {
            probe.Stop();
        }
    }
}
