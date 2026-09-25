using System.IO;
using System.Text;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record VaultedToken(
    string AccessToken,
    string RefreshToken,
    DateTimeOffset ExpiresAt,
    string Scope,
    string ClientId = "");

public sealed class TokenVault
{
    private readonly string filePath;
    private readonly object gate = new();
    private Dictionary<string, VaultedToken> entries = new(StringComparer.Ordinal);
    private bool loaded;

    public TokenVault(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "token-vault.json");
    }

    public VaultedToken? Get(string extensionId, string provider)
    {
        lock (gate)
        {
            EnsureLoaded();
            return entries.TryGetValue(Key(extensionId, provider), out var entry) ? entry : null;
        }
    }

    public void Store(string extensionId, string provider, VaultedToken token)
    {
        lock (gate)
        {
            EnsureLoaded();
            entries[Key(extensionId, provider)] = token;
            Persist();
        }
    }

    public bool Delete(string extensionId, string provider)
    {
        lock (gate)
        {
            EnsureLoaded();
            if (!entries.Remove(Key(extensionId, provider)))
            {
                return false;
            }
            Persist();
            return true;
        }
    }

    private static string Key(string extensionId, string provider) => extensionId + "|" + provider;

    private void Persist()
    {
        var plain = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var (key, entry) in entries)
        {
            plain[key] = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["accessToken"] = DpapiProtector.Encrypt(entry.AccessToken),
                ["refreshToken"] = DpapiProtector.Encrypt(entry.RefreshToken),
                ["expiresAt"] = entry.ExpiresAt.ToString("o"),
                ["scope"] = entry.Scope,
                ["clientId"] = entry.ClientId,
            };
        }
        File.WriteAllText(filePath, Encoding.UTF8.GetString(JsonSerializer.SerializeToUtf8Bytes(plain)));
    }

    private void EnsureLoaded()
    {
        if (loaded)
        {
            return;
        }
        loaded = true;
        try
        {
            if (!File.Exists(filePath))
            {
                return;
            }
            using var document = JsonDocument.Parse(File.ReadAllText(filePath));
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Value.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }
                var accessToken = ReadEncrypted(property.Value, "accessToken");
                var refreshToken = ReadEncrypted(property.Value, "refreshToken");
                var expiresAt = property.Value.TryGetProperty("expiresAt", out var expires) && expires.ValueKind == JsonValueKind.String
                    && DateTimeOffset.TryParse(expires.GetString(), out var parsed)
                        ? parsed
                        : DateTimeOffset.MinValue;
                var scope = property.Value.TryGetProperty("scope", out var scopeElement) && scopeElement.ValueKind == JsonValueKind.String
                    ? scopeElement.GetString() ?? ""
                    : "";
                var clientId = property.Value.TryGetProperty("clientId", out var clientIdElement) && clientIdElement.ValueKind == JsonValueKind.String
                    ? clientIdElement.GetString() ?? ""
                    : "";
                if (accessToken is not null && refreshToken is not null)
                {
                    entries[property.Name] = new VaultedToken(accessToken, refreshToken, expiresAt, scope, clientId);
                }
            }
        }
        catch (JsonException)
        {
            entries = new(StringComparer.Ordinal);
        }
        catch (IOException)
        {
            entries = new(StringComparer.Ordinal);
        }
    }

    private static string? ReadEncrypted(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
        {
            return null;
        }
        return DpapiProtector.TryDecrypt(value.GetString() ?? "");
    }
}
