using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record OAuthCallbackResult(string? Code, string? ProviderError, string? Failure)
{
    public bool StateRejected => Failure == "invalidState";
}

public sealed class OAuthService
{
    public const int DefaultCallbackTimeoutSeconds = 120;
    private static readonly TimeSpan RefreshSkew = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan RateCap = TimeSpan.FromSeconds(5);

    private readonly TokenVault vault;
    private readonly Func<IReadOnlyDictionary<string, OAuthProviderDefinition>> providers;
    private readonly Func<string, Task> launchBrowser;

    public OAuthService(
        TokenVault vault,
        Func<IReadOnlyDictionary<string, OAuthProviderDefinition>> providers,
        Func<string, Task>? launchBrowser = null)
    {
        this.vault = vault;
        this.providers = providers;
        this.launchBrowser = launchBrowser ?? (url => Task.Run(() =>
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })));
    }

    public async Task<NativeCallOutcome> AuthorizeAsync(
        string extensionId,
        Dictionary<string, JsonElement>? parameters,
        IReadOnlyList<string> declaredProviders,
        CancellationToken cancellationToken,
        TimeSpan? callbackTimeout = null)
    {
        if (!TryProvider(parameters, out var provider, out var failure))
        {
            return failure!;
        }
        if (!declaredProviders.Contains(provider, StringComparer.Ordinal))
        {
            return NativeCallOutcome.Failure("providerNotDeclared", $"extension did not declare oauth provider '{provider}' in its manifest");
        }
        var definition = ResolveProvider(provider);
        if (definition is null)
        {
            return NativeCallOutcome.Failure("unknownProvider", $"oauth provider '{provider}' is not implemented by this shell");
        }
        var clientId = ReadClientId(parameters) ?? definition.ClientId;
        if (string.IsNullOrWhiteSpace(clientId))
        {
            return NativeCallOutcome.Failure("notConfigured", SpotifyAuthConfig.ClientIdDocs);
        }

        var existing = vault.Get(extensionId, provider);
        if (existing is not null && existing.ExpiresAt > DateTimeOffset.UtcNow + RefreshSkew)
        {
            return AuthorizedResult(existing);
        }

        var state = RandomUrlSafe(32);
        var verifier = CreateVerifier();
        var challenge = CreateChallenge(verifier);
        var port = definition.RedirectPort > 0 ? definition.RedirectPort : FindFreePort();
        var listener = new HttpListener();
        var prefix = $"http://127.0.0.1:{port}/";
        try
        {
            listener.Prefixes.Add(prefix);
            listener.Start();
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("listenerFailed", $"could not bind {prefix}: {ex.Message}");
        }

        var redirectUri = $"http://127.0.0.1:{port}/callback";
        var authorizeUrl = BuildAuthorizeUrl(definition, clientId, redirectUri, state, challenge);
        try
        {
            await launchBrowser(authorizeUrl);
            var code = await WaitForCallbackAsync(listener, state, definition.Id, callbackTimeout ?? TimeSpan.FromSeconds(DefaultCallbackTimeoutSeconds), cancellationToken);
            if (code.Failure is not null)
            {
                return NativeCallOutcome.Failure(code.Failure, code.Failure == "invalidState"
                    ? "oauth callback state mismatch rejected (possible CSRF)"
                    : code.Failure == "accessDenied"
                        ? $"authorization failed: {code.ProviderError}"
                        : "oauth callback did not contain an authorization code");
            }
            var exchanged = await ExchangeCodeAsync(definition, clientId, code.Code!, redirectUri, verifier, cancellationToken);
            if (exchanged.Error is not null)
            {
                return NativeCallOutcome.Failure(exchanged.Error.Code, exchanged.Error.Message);
            }
            var refreshedRefresh = exchanged.Token!.RefreshToken.Length > 0
                ? exchanged.Token.RefreshToken
                : existing?.RefreshToken ?? "";
            var stored = new VaultedToken(exchanged.Token.AccessToken, refreshedRefresh, exchanged.Token.ExpiresAt, exchanged.Token.Scope, clientId);
            vault.Store(extensionId, provider, stored);
            return AuthorizedResult(stored);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return NativeCallOutcome.Failure("aborted", "oauth authorization aborted");
        }
        catch (TimeoutException)
        {
            return NativeCallOutcome.Failure("timeout", $"no oauth callback within {(callbackTimeout ?? TimeSpan.FromSeconds(DefaultCallbackTimeoutSeconds)).TotalSeconds} seconds");
        }
        finally
        {
            try
            {
                listener.Stop();
                listener.Close();
            }
            catch
            {
            }
        }
    }

    public async Task<NativeCallOutcome> StatusAsync(
        string extensionId,
        Dictionary<string, JsonElement>? parameters,
        IReadOnlyList<string> declaredProviders,
        CancellationToken cancellationToken)
    {
        if (!TryProvider(parameters, out var provider, out var failure))
        {
            return failure!;
        }
        if (!declaredProviders.Contains(provider, StringComparer.Ordinal))
        {
            return NativeCallOutcome.Failure("providerNotDeclared", $"extension did not declare oauth provider '{provider}' in its manifest");
        }
        var entry = await GetValidEntryAsync(extensionId, provider, cancellationToken);
        if (entry is null)
        {
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = false }));
        }
        return AuthorizedResult(entry);
    }

    public NativeCallOutcome Disconnect(
        string extensionId,
        Dictionary<string, JsonElement>? parameters,
        IReadOnlyList<string> declaredProviders)
    {
        if (!TryProvider(parameters, out var provider, out var failure))
        {
            return failure!;
        }
        if (!declaredProviders.Contains(provider, StringComparer.Ordinal))
        {
            return NativeCallOutcome.Failure("providerNotDeclared", $"extension did not declare oauth provider '{provider}' in its manifest");
        }
        vault.Delete(extensionId, provider);
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    public async Task<string?> GetAccessTokenAsync(string extensionId, string provider, CancellationToken cancellationToken)
    {
        var entry = await GetValidEntryAsync(extensionId, provider, cancellationToken);
        return entry?.AccessToken;
    }

    public async Task<bool> ForceRefreshAsync(string extensionId, string provider, CancellationToken cancellationToken)
    {
        var definition = ResolveProvider(provider);
        if (definition is null)
        {
            return false;
        }
        var entry = vault.Get(extensionId, provider);
        if (entry is null || entry.RefreshToken.Length == 0)
        {
            return false;
        }
        var refreshed = await RefreshAsync(definition, extensionId, provider, entry, cancellationToken);
        return refreshed is not null;
    }

    private async Task<VaultedToken?> GetValidEntryAsync(string extensionId, string provider, CancellationToken cancellationToken)
    {
        var entry = vault.Get(extensionId, provider);
        if (entry is null)
        {
            return null;
        }
        if (entry.ExpiresAt > DateTimeOffset.UtcNow + RefreshSkew)
        {
            return entry;
        }
        var definition = ResolveProvider(provider);
        if (definition is null || entry.RefreshToken.Length == 0)
        {
            return entry.ExpiresAt > DateTimeOffset.UtcNow ? entry : null;
        }
        return await RefreshAsync(definition, extensionId, provider, entry, cancellationToken);
    }

    private async Task<VaultedToken?> RefreshAsync(
        OAuthProviderDefinition definition,
        string extensionId,
        string provider,
        VaultedToken entry,
        CancellationToken cancellationToken)
    {
        if (!definition.IsConfigured && entry.ClientId.Length == 0)
        {
            return null;
        }
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = entry.RefreshToken,
            ["client_id"] = entry.ClientId.Length > 0 ? entry.ClientId : definition.ClientId!,
        });
        using var response = await client.PostAsync(definition.TokenUrl, content, cancellationToken);
        if ((int)response.StatusCode is 400 or 401)
        {
            vault.Delete(extensionId, provider);
            return null;
        }
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var root = document.RootElement;
        if (!root.TryGetProperty("access_token", out var accessTokenElement) || accessTokenElement.ValueKind != JsonValueKind.String)
        {
            return null;
        }
        var expiresIn = root.TryGetProperty("expires_in", out var expiresInElement) && expiresInElement.TryGetInt32(out var seconds)
            ? seconds
            : 3600;
        var next = new VaultedToken(
            accessTokenElement.GetString()!,
            root.TryGetProperty("refresh_token", out var refreshElement) && refreshElement.ValueKind == JsonValueKind.String
                ? refreshElement.GetString()!
                : entry.RefreshToken,
            DateTimeOffset.UtcNow + TimeSpan.FromSeconds(expiresIn),
            root.TryGetProperty("scope", out var scopeElement) && scopeElement.ValueKind == JsonValueKind.String
                ? scopeElement.GetString() ?? entry.Scope
                : entry.Scope,
            entry.ClientId);
        vault.Store(extensionId, provider, next);
        return next;
    }

    private async Task<(string? Code, string? ProviderError, string? Failure)> WaitForCallbackAsync(
        HttpListener listener,
        string expectedState,
        string providerName,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(timeout);
        timeoutCts.Token.Register(() => listener.Stop());
        while (!cancellationToken.IsCancellationRequested)
        {
            HttpListenerContext context;
            try
            {
                context = await listener.GetContextAsync();
            }
            catch (Exception) when (timeoutCts.IsCancellationRequested)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    throw new OperationCanceledException(cancellationToken);
                }
                throw new TimeoutException();
            }
            var request = context.Request;
            if (!string.Equals(request.Url?.AbsolutePath ?? "", "/callback", StringComparison.Ordinal))
            {
                await RespondAsync(context, 404, "Not found");
                continue;
            }
            var callback = ParseCallback(request.Url, expectedState);
            if (callback.StateRejected)
            {
                await RespondAsync(context, 400, "Invalid state");
                return (null, null, "invalidState");
            }
            if (callback.ProviderError is not null)
            {
                await RespondAsync(context, 200, "Authorization failed. You can close this tab.");
                return (null, callback.ProviderError, "accessDenied");
            }
            if (callback.Code is null)
            {
                await RespondAsync(context, 400, "Missing code");
                return (null, null, "invalidCallback");
            }
            await RespondAsync(context, 200, $"Connected with {providerName}. You can close this tab and return to FlowKey.");
            return (callback.Code, null, null);
        }
        throw new OperationCanceledException(cancellationToken);
    }

    private static async Task RespondAsync(HttpListenerContext context, int status, string message)
    {
        try
        {
            context.Response.StatusCode = status;
            context.Response.ContentType = "text/html; charset=utf-8";
            var html = $"<!doctype html><html><body style=\"font-family:sans-serif;background:#111;color:#eee;display:grid;place-items:center;height:96vh\"><p>{message}</p></body></html>";
            var bytes = Encoding.UTF8.GetBytes(html);
            await context.Response.OutputStream.WriteAsync(bytes);
            context.Response.Close();
        }
        catch
        {
        }
    }

    private async Task<(VaultedToken? Token, Protocol.ProtocolError? Error)> ExchangeCodeAsync(
        OAuthProviderDefinition definition,
        string clientId,
        string code,
        string redirectUri,
        string verifier,
        CancellationToken cancellationToken)
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = redirectUri,
                ["client_id"] = clientId,
                ["code_verifier"] = verifier,
            });
            using var response = await client.PostAsync(definition.TokenUrl, content, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (!response.IsSuccessStatusCode)
            {
                var code2 = root.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String ? err.GetString()! : "providerError";
                var message = root.TryGetProperty("error_description", out var desc) && desc.ValueKind == JsonValueKind.String ? desc.GetString()! : $"token endpoint returned {(int)response.StatusCode}";
                return (null, new Protocol.ProtocolError { Code = code2, Message = message });
            }
            if (!root.TryGetProperty("access_token", out var accessToken) || accessToken.ValueKind != JsonValueKind.String)
            {
                return (null, new Protocol.ProtocolError { Code = "invalidTokenResponse", Message = "token response missing access_token" });
            }
            var expiresIn = root.TryGetProperty("expires_in", out var expiresInElement) && expiresInElement.TryGetInt32(out var seconds) ? seconds : 3600;
            return (new VaultedToken(
                accessToken.GetString()!,
                root.TryGetProperty("refresh_token", out var refresh) && refresh.ValueKind == JsonValueKind.String ? refresh.GetString()! : "",
                DateTimeOffset.UtcNow + TimeSpan.FromSeconds(expiresIn),
                root.TryGetProperty("scope", out var scope) && scope.ValueKind == JsonValueKind.String ? scope.GetString()! : ""), null);
        }
        catch (JsonException)
        {
            return (null, new Protocol.ProtocolError { Code = "invalidTokenResponse", Message = "token endpoint returned malformed json" });
        }
        catch (Exception ex)
        {
            return (null, new Protocol.ProtocolError { Code = "networkError", Message = ex.Message });
        }
    }

    private OAuthProviderDefinition? ResolveProvider(string provider)
    {
        return providers().GetValueOrDefault(provider);
    }

    private static string? ReadClientId(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("clientId", out var element) || element.ValueKind != JsonValueKind.String)
        {
            return null;
        }
        var value = element.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static bool TryProvider(Dictionary<string, JsonElement>? parameters, out string provider, out NativeCallOutcome? failure)
    {
        provider = "";
        failure = null;
        if (parameters is null || !parameters.TryGetValue("provider", out var element) || element.ValueKind != JsonValueKind.String)
        {
            failure = NativeCallOutcome.Failure("invalidParams", "oauth methods require a string 'provider' parameter");
            return false;
        }
        provider = element.GetString()!;
        return true;
    }

    private static NativeCallOutcome AuthorizedResult(VaultedToken entry) =>
        NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new
        {
            ok = true,
            expiresAt = entry.ExpiresAt.ToString("o"),
            scope = entry.Scope,
        }));

    public static string BuildAuthorizeUrl(
        OAuthProviderDefinition definition,
        string clientId,
        string redirectUri,
        string state,
        string challenge)
    {
        var builder = new UriBuilder(definition.AuthorizeUrl);
        var query = $"client_id={Uri.EscapeDataString(clientId)}"
            + "&response_type=code"
            + $"&redirect_uri={Uri.EscapeDataString(redirectUri)}"
            + $"&state={Uri.EscapeDataString(state)}"
            + "&code_challenge_method=S256"
            + $"&code_challenge={Uri.EscapeDataString(challenge)}"
            + $"&scope={Uri.EscapeDataString(definition.Scopes)}";
        builder.Query = query;
        return builder.Uri.AbsoluteUri;
    }

    public static OAuthCallbackResult ParseCallback(Uri? requestUrl, string expectedState)
    {
        if (requestUrl is null)
        {
            return new OAuthCallbackResult(null, null, "invalidCallback");
        }
        var query = System.Web.HttpUtility.ParseQueryString(requestUrl.Query);
        var state = query["state"];
        if (string.IsNullOrEmpty(state) || state.Length != expectedState.Length || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(state),
                Encoding.UTF8.GetBytes(expectedState)))
        {
            return new OAuthCallbackResult(null, null, "invalidState");
        }
        var error = query["error"];
        if (!string.IsNullOrEmpty(error))
        {
            return new OAuthCallbackResult(null, error, "accessDenied");
        }
        var code = query["code"];
        if (string.IsNullOrEmpty(code))
        {
            return new OAuthCallbackResult(null, null, "invalidCallback");
        }
        return new OAuthCallbackResult(code, null, null);
    }

    public static string CreateVerifier()
    {
        return RandomUrlSafe(64);
    }

    public static string CreateChallenge(string verifier)
    {
        var hash = SHA256.HashData(Encoding.ASCII.GetBytes(verifier));
        return Base64Url(hash);
    }

    private static string RandomUrlSafe(int byteCount)
    {
        var bytes = RandomNumberGenerator.GetBytes(byteCount);
        return Base64Url(bytes);
    }

    private static int FindFreePort()
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

    private static string Base64Url(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
