using System.IO;
using System.Text;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed class SecretsStore
{
    public const int MaxValueBytes = 8 * 1024;
    public const int MaxKeysPerExtension = 64;

    private readonly string filePath;
    private readonly object gate = new();
    private Dictionary<string, Dictionary<string, string>> secrets = new(StringComparer.Ordinal);
    private bool loaded;

    public SecretsStore(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "secrets.json");
    }

    public NativeCallOutcome Handle(string extensionId, string method, Dictionary<string, JsonElement>? parameters)
    {
        if (!TryKey(parameters, out var key, out var failure))
        {
            return failure!;
        }
        lock (gate)
        {
            EnsureLoaded();
            secrets.TryGetValue(extensionId, out var slice);
            slice ??= new Dictionary<string, string>(StringComparer.Ordinal);
            return method switch
            {
                "secrets.get" => Get(extensionId, key, slice),
                "secrets.set" => Set(extensionId, key, parameters!, slice),
                "secrets.delete" => Delete(extensionId, key, slice),
                _ => NativeCallOutcome.Failure("notImplemented", $"native method '{method}' is not implemented by this shell"),
            };
        }
    }

    private NativeCallOutcome Get(string extensionId, string key, Dictionary<string, string> slice)
    {
        if (!slice.TryGetValue(key, out var stored))
        {
            return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
        }
        var value = DpapiProtector.TryDecrypt(stored);
        if (value is null)
        {
            return NativeCallOutcome.Failure("secretCorrupt", $"secret '{key}' of extension '{extensionId}' could not be decrypted");
        }
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true, value }));
    }

    private NativeCallOutcome Set(string extensionId, string key, Dictionary<string, JsonElement> parameters, Dictionary<string, string> slice)
    {
        if (!parameters.TryGetValue("value", out var valueElement) || valueElement.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "secrets.set requires a string 'value' parameter");
        }
        var value = valueElement.GetString()!;
        if (Encoding.UTF8.GetByteCount(value) > MaxValueBytes)
        {
            return NativeCallOutcome.Failure("secretTooLarge", $"secret values are limited to {MaxValueBytes} bytes");
        }
        if (!slice.ContainsKey(key) && slice.Count >= MaxKeysPerExtension)
        {
            return NativeCallOutcome.Failure("tooManySecrets", $"extensions are limited to {MaxKeysPerExtension} secrets");
        }
        slice[key] = DpapiProtector.Encrypt(value);
        Persist(extensionId, slice);
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private NativeCallOutcome Delete(string extensionId, string key, Dictionary<string, string> slice)
    {
        slice.Remove(key);
        Persist(extensionId, slice);
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private void Persist(string extensionId, Dictionary<string, string> slice)
    {
        secrets[extensionId] = slice;
        File.WriteAllText(filePath, Encoding.UTF8.GetString(JsonSerializer.SerializeToUtf8Bytes(secrets)));
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
            secrets = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string>>>(
                File.ReadAllText(filePath)) ?? new(StringComparer.Ordinal);
        }
        catch (JsonException)
        {
            secrets = new(StringComparer.Ordinal);
        }
        catch (IOException)
        {
            secrets = new(StringComparer.Ordinal);
        }
    }

    private static bool TryKey(Dictionary<string, JsonElement>? parameters, out string key, out NativeCallOutcome? failure)
    {
        key = "";
        failure = null;
        if (parameters is null || !parameters.TryGetValue("key", out var element) || element.ValueKind != JsonValueKind.String)
        {
            failure = NativeCallOutcome.Failure("invalidParams", "secrets methods require a string 'key' parameter");
            return false;
        }
        key = element.GetString()!;
        return true;
    }
}
