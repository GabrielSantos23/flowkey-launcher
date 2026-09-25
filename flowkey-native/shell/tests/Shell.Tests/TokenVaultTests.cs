using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class TokenVaultTests : IDisposable
{
    private readonly string tempDir = Path.Combine(Path.GetTempPath(), "flowkey-vault-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(tempDir))
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Fact]
    public void TokensRoundTripEncryptedOnDisk()
    {
        var vault = new TokenVault(tempDir);
        var expires = DateTimeOffset.UtcNow.AddHours(1);
        vault.Store("ext-a", "spotify", new VaultedToken("access-plain", "refresh-plain", expires, "scope-x"));

        var raw = File.ReadAllText(Path.Combine(tempDir, "token-vault.json"));
        Assert.DoesNotContain("access-plain", raw);
        Assert.DoesNotContain("refresh-plain", raw);
        Assert.Contains(DpapiProtector.Prefix, raw);
        Assert.Contains("scope-x", raw);

        var reloaded = new TokenVault(tempDir).Get("ext-a", "spotify");
        Assert.NotNull(reloaded);
        Assert.Equal("access-plain", reloaded!.AccessToken);
        Assert.Equal("refresh-plain", reloaded.RefreshToken);
        Assert.Equal("scope-x", reloaded.Scope);
        Assert.True(Math.Abs((reloaded.ExpiresAt - expires).TotalSeconds) < 1);
    }

    [Fact]
    public void EntriesAreIsolatedPerExtensionAndProvider()
    {
        var vault = new TokenVault(tempDir);
        vault.Store("ext-a", "spotify", new VaultedToken("a", "ra", DateTimeOffset.UtcNow.AddHours(1), "s"));
        vault.Store("ext-b", "spotify", new VaultedToken("b", "rb", DateTimeOffset.UtcNow.AddHours(1), "s"));
        vault.Store("ext-a", "other", new VaultedToken("c", "rc", DateTimeOffset.UtcNow.AddHours(1), "s"));

        Assert.Equal("a", vault.Get("ext-a", "spotify")!.AccessToken);
        Assert.Equal("b", vault.Get("ext-b", "spotify")!.AccessToken);
        Assert.Equal("c", vault.Get("ext-a", "other")!.AccessToken);
    }

    [Fact]
    public void DeleteRemovesEntry()
    {
        var vault = new TokenVault(tempDir);
        vault.Store("ext-a", "spotify", new VaultedToken("a", "r", DateTimeOffset.UtcNow.AddHours(1), "s"));
        Assert.True(vault.Delete("ext-a", "spotify"));
        Assert.Null(vault.Get("ext-a", "spotify"));
        Assert.False(vault.Delete("ext-a", "spotify"));
    }

    [Fact]
    public void CorruptVaultFileStartsEmptyAndRemainsUsable()
    {
        Directory.CreateDirectory(tempDir);
        File.WriteAllText(Path.Combine(tempDir, "token-vault.json"), "{ not json");
        var vault = new TokenVault(tempDir);
        Assert.Null(vault.Get("ext-a", "spotify"));
        vault.Store("ext-a", "spotify", new VaultedToken("a", "r", DateTimeOffset.UtcNow.AddHours(1), "s"));
        Assert.Equal("a", new TokenVault(tempDir).Get("ext-a", "spotify")!.AccessToken);
    }

    [Fact]
    public void UndecryptableTokenYieldsNull()
    {
        Directory.CreateDirectory(tempDir);
        File.WriteAllText(Path.Combine(tempDir, "token-vault.json"), JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["ext-a|spotify"] = new Dictionary<string, string>
            {
                ["accessToken"] = "dpapi:" + Convert.ToBase64String(Encoding.UTF8.GetBytes("garbage-not-encrypted")),
                ["refreshToken"] = DpapiProtector.Encrypt("r"),
                ["expiresAt"] = DateTimeOffset.UtcNow.AddHours(1).ToString("o"),
                ["scope"] = "s",
            },
        }));
        Assert.Null(new TokenVault(tempDir).Get("ext-a", "spotify"));
    }
}

public class SpotifyAuthConfigTests : IDisposable
{
    private readonly string tempDir = Path.Combine(Path.GetTempPath(), "flowkey-spotify-config-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        Environment.SetEnvironmentVariable(SpotifyAuthConfig.ClientIdEnvVar, null);
        if (Directory.Exists(tempDir))
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Fact]
    public void LoadsClientIdFromFile()
    {
        Directory.CreateDirectory(tempDir);
        File.WriteAllText(Path.Combine(tempDir, SpotifyAuthConfig.ConfigFileName), "{\"clientId\":\"file-id\",\"redirectPort\":47311}");
        var config = SpotifyAuthConfig.Load(tempDir);
        Assert.Equal("file-id", config.ClientId);
        Assert.Equal(47311, config.RedirectPort);
    }

    [Fact]
    public void EnvironmentVariableWinsOverFile()
    {
        Directory.CreateDirectory(tempDir);
        File.WriteAllText(Path.Combine(tempDir, SpotifyAuthConfig.ConfigFileName), "{\"clientId\":\"file-id\"}");
        Environment.SetEnvironmentVariable(SpotifyAuthConfig.ClientIdEnvVar, "env-id");
        var config = SpotifyAuthConfig.Load(tempDir);
        Assert.Equal("env-id", config.ClientId);
    }

    [Fact]
    public void MissingConfigurationYieldsNullClientId()
    {
        var config = SpotifyAuthConfig.Load(tempDir);
        Assert.Null(config.ClientId);
        Assert.Equal(0, config.RedirectPort);
    }
}

public class SecretsStoreTests : IDisposable
{
    private readonly string tempDir = Path.Combine(Path.GetTempPath(), "flowkey-secrets-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(tempDir))
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    private static Dictionary<string, JsonElement> Params(string key, string? value = null)
    {
        var result = new Dictionary<string, JsonElement> { ["key"] = JsonSerializer.SerializeToElement(key) };
        if (value is not null)
        {
            result["value"] = JsonSerializer.SerializeToElement(value);
        }
        return result;
    }

    [Fact]
    public void SetGetDeleteRoundTrip()
    {
        var store = new SecretsStore(tempDir);
        Assert.True(store.Handle("ext-a", "secrets.set", Params("api-key", "v-123")).Ok);
        var got = store.Handle("ext-a", "secrets.get", Params("api-key"));
        Assert.True(got.Ok);
        Assert.Equal("v-123", got.Result!.Value.GetProperty("value").GetString());
        Assert.True(store.Handle("ext-a", "secrets.delete", Params("api-key")).Ok);
        got = store.Handle("ext-a", "secrets.get", Params("api-key"));
        Assert.True(got.Ok);
        Assert.False(got.Result!.Value.TryGetProperty("value", out _));
    }

    [Fact]
    public void SecretsAreEncryptedOnDisk()
    {
        var store = new SecretsStore(tempDir);
        store.Handle("ext-a", "secrets.set", Params("api-key", "hunter2"));
        var raw = File.ReadAllText(Path.Combine(tempDir, "secrets.json"));
        Assert.DoesNotContain("hunter2", raw);
        Assert.Contains(DpapiProtector.Prefix, raw);
    }

    [Fact]
    public void SecretsAreIsolatedPerExtension()
    {
        var store = new SecretsStore(tempDir);
        store.Handle("ext-a", "secrets.set", Params("k", "a-value"));
        store.Handle("ext-b", "secrets.set", Params("k", "b-value"));
        Assert.Equal("a-value", store.Handle("ext-a", "secrets.get", Params("k")).Result!.Value.GetProperty("value").GetString());
        Assert.Equal("b-value", store.Handle("ext-b", "secrets.get", Params("k")).Result!.Value.GetProperty("value").GetString());
    }

    [Fact]
    public void GetOfUnknownKeyReturnsOkWithoutValue()
    {
        var store = new SecretsStore(tempDir);
        var outcome = store.Handle("ext-a", "secrets.get", Params("missing"));
        Assert.True(outcome.Ok);
        Assert.False(outcome.Result!.Value.TryGetProperty("value", out _));
    }

    [Fact]
    public void SetRejectsOversizedValue()
    {
        var store = new SecretsStore(tempDir);
        var outcome = store.Handle("ext-a", "secrets.set", Params("k", new string('x', SecretsStore.MaxValueBytes + 1)));
        Assert.False(outcome.Ok);
        Assert.Equal("secretTooLarge", outcome.Error!.Code);
    }

    [Fact]
    public void SetEnforcesKeyCountCap()
    {
        var store = new SecretsStore(tempDir);
        for (var i = 0; i < SecretsStore.MaxKeysPerExtension; i++)
        {
            Assert.True(store.Handle("ext-a", "secrets.set", Params($"key-{i}", "v")).Ok);
        }
        var overflow = store.Handle("ext-a", "secrets.set", Params("key-overflow", "v"));
        Assert.False(overflow.Ok);
        Assert.Equal("tooManySecrets", overflow.Error!.Code);
        Assert.True(store.Handle("ext-a", "secrets.set", Params("key-0", "updated")).Ok);
    }

    [Fact]
    public void MethodsValidateParams()
    {
        var store = new SecretsStore(tempDir);
        Assert.Equal("invalidParams", store.Handle("ext-a", "secrets.get", null).Error!.Code);
        Assert.Equal("invalidParams", store.Handle("ext-a", "secrets.set", Params("k")).Error!.Code);
        Assert.Equal("invalidParams", store.Handle("ext-a", "secrets.get", new Dictionary<string, JsonElement>()).Error!.Code);
    }

    [Fact]
    public void CorruptSecretsFileStartsEmpty()
    {
        Directory.CreateDirectory(tempDir);
        File.WriteAllText(Path.Combine(tempDir, "secrets.json"), "not json");
        var store = new SecretsStore(tempDir);
        Assert.True(store.Handle("ext-a", "secrets.set", Params("k", "v")).Ok);
        Assert.Equal("v", store.Handle("ext-a", "secrets.get", Params("k")).Result!.Value.GetProperty("value").GetString());
    }
}
