using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

/// <summary>
/// Per-extension transient cache, one JSON file per extension under
/// extension-cache/. Unlike ExtensionStorageStore, entries carry an optional
/// TTL and larger caps: caches are disposable by design, storage is not.
/// Expired entries are dropped lazily on access. Not an isolation boundary
/// (shared sidecar), the same caveat as the other extension stores.
/// </summary>
public sealed class ExtensionCacheStore
{
    public const int MaxKeysPerExtension = 512;
    public const int MaxValueJsonBytes = 64 * 1024;
    public const int MaxTotalJsonBytes = 1024 * 1024;

    private readonly string directory;
    private readonly object gate = new();
    private readonly Func<long> nowMs;

    public ExtensionCacheStore(string dataDirectory, Func<long>? clock = null)
    {
        directory = Path.Combine(dataDirectory, "extension-cache");
        Directory.CreateDirectory(directory);
        nowMs = clock ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    public NativeCallOutcome Handle(string extensionId, string method, Dictionary<string, JsonElement>? parameters)
    {
        if (!IsValidExtensionId(extensionId))
        {
            return NativeCallOutcome.Failure("invalidExtensionId", $"extension id '{extensionId}' cannot be used as a cache namespace");
        }
        lock (gate)
        {
            var slice = LoadSlice(extensionId);
            switch (method)
            {
                case "cache.get":
                    if (!TryKey(parameters, out var getKey, out var getFailure))
                    {
                        return getFailure!;
                    }
                    return Get(extensionId, slice, getKey);
                case "cache.set":
                    if (!TryKey(parameters, out var setKey, out var setFailure))
                    {
                        return setFailure!;
                    }
                    return Set(extensionId, slice, setKey, parameters!);
                case "cache.delete":
                    if (!TryKey(parameters, out var deleteKey, out var deleteFailure))
                    {
                        return deleteFailure!;
                    }
                    if (slice.Remove(deleteKey))
                    {
                        Persist(extensionId, slice);
                    }
                    return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
                case "cache.clear":
                    Persist(extensionId, new Dictionary<string, CacheEntry>(StringComparer.Ordinal));
                    return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
                default:
                    return NativeCallOutcome.Failure("notImplemented", $"native method '{method}' is not implemented by this shell");
            }
        }
    }

    /// <summary>Removes the whole cache file for an extension (uninstall hygiene).</summary>
    public void RemoveExtension(string extensionId)
    {
        lock (gate)
        {
            if (!IsValidExtensionId(extensionId))
            {
                return;
            }
            var path = PathFor(extensionId);
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch (IOException)
            {
                /* best effort */
            }
        }
    }

    private NativeCallOutcome Get(string extensionId, Dictionary<string, CacheEntry> slice, string key)
    {
        if (slice.TryGetValue(key, out var entry))
        {
            if (entry.ExpiresAtMs is long expiresAt && nowMs() >= expiresAt)
            {
                slice.Remove(key);
                Persist(extensionId, slice);
            }
            else
            {
                return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true, value = entry.Value.Clone() }));
            }
        }
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private NativeCallOutcome Set(string extensionId, Dictionary<string, CacheEntry> slice, string key, Dictionary<string, JsonElement> parameters)
    {
        if (!parameters.TryGetValue("value", out var value) || value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return NativeCallOutcome.Failure("invalidParams", "cache.set requires a 'value' parameter (any JSON)");
        }
        var serialized = JsonSerializer.SerializeToUtf8Bytes(value);
        if (serialized.Length > MaxValueJsonBytes)
        {
            return NativeCallOutcome.Failure("valueTooLarge", $"cache values are limited to {MaxValueJsonBytes} bytes");
        }

        long? expiresAtMs = null;
        if (parameters.TryGetValue("ttlSeconds", out var ttlElement))
        {
            if (ttlElement.ValueKind is not JsonValueKind.Number
                || double.IsNaN(ttlElement.GetDouble())
                || ttlElement.GetDouble() <= 0)
            {
                return NativeCallOutcome.Failure("invalidParams", "cache.set 'ttlSeconds' must be a positive number");
            }
            expiresAtMs = nowMs() + (long)(ttlElement.GetDouble() * 1000);
        }

        if (!slice.ContainsKey(key) && slice.Count >= MaxKeysPerExtension)
        {
            return NativeCallOutcome.Failure("tooManyKeys", $"extensions are limited to {MaxKeysPerExtension} cache keys");
        }
        slice[key] = new CacheEntry(value.Clone(), expiresAtMs);
        if (!Persist(extensionId, slice))
        {
            return NativeCallOutcome.Failure("cacheFailed", $"extension caches are limited to {MaxTotalJsonBytes} bytes");
        }
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private Dictionary<string, CacheEntry> LoadSlice(string extensionId)
    {
        var path = PathFor(extensionId);
        try
        {
            if (!File.Exists(path))
            {
                return new Dictionary<string, CacheEntry>(StringComparer.Ordinal);
            }
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var slice = new Dictionary<string, CacheEntry>(StringComparer.Ordinal);
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Value.ValueKind != JsonValueKind.Object
                    || !property.Value.TryGetProperty("value", out var value))
                {
                    continue;
                }
                long? expiresAtMs = null;
                if (property.Value.TryGetProperty("expiresAtMs", out var expiresElement)
                    && expiresElement.ValueKind == JsonValueKind.Number)
                {
                    expiresAtMs = expiresElement.GetInt64();
                }
                slice[property.Name] = new CacheEntry(value.Clone(), expiresAtMs);
            }
            return slice;
        }
        catch (JsonException)
        {
            return new Dictionary<string, CacheEntry>(StringComparer.Ordinal);
        }
        catch (IOException)
        {
            return new Dictionary<string, CacheEntry>(StringComparer.Ordinal);
        }
    }

    private bool Persist(string extensionId, Dictionary<string, CacheEntry> slice)
    {
        var path = PathFor(extensionId);
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var entry in slice.OrderBy(e => e.Key, StringComparer.Ordinal))
            {
                writer.WritePropertyName(entry.Key);
                writer.WriteStartObject();
                writer.WritePropertyName("value");
                entry.Value.Value.WriteTo(writer);
                if (entry.Value.ExpiresAtMs is long expiresAtMs)
                {
                    writer.WriteNumber("expiresAtMs", expiresAtMs);
                }
                writer.WriteEndObject();
            }
            writer.WriteEndObject();
        }
        if (stream.Length > MaxTotalJsonBytes)
        {
            return false;
        }
        File.WriteAllBytes(path, stream.ToArray());
        return true;
    }

    private string PathFor(string extensionId) => Path.Combine(directory, extensionId + ".json");

    private static bool TryKey(Dictionary<string, JsonElement>? parameters, out string key, out NativeCallOutcome? failure)
    {
        failure = null;
        key = "";
        if (parameters is null || !parameters.TryGetValue("key", out var keyElement) || keyElement.ValueKind != JsonValueKind.String)
        {
            failure = NativeCallOutcome.Failure("invalidParams", "cache methods require a string 'key' parameter");
            return false;
        }
        key = keyElement.GetString() ?? "";
        if (key.Length == 0 || key.Length > 128)
        {
            failure = NativeCallOutcome.Failure("invalidParams", "cache keys must be between 1 and 128 characters");
            return false;
        }
        return true;
    }

    private static bool IsValidExtensionId(string extensionId)
    {
        return extensionId.Length > 0
            && extensionId.Length <= 64
            && !extensionId.Contains("..")
            && extensionId.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-' or '_');
    }

    private sealed record CacheEntry(JsonElement Value, long? ExpiresAtMs);
}
