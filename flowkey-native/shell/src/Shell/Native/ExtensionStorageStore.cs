using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

/// <summary>
/// Per-extension persistent key-value store, one JSON file per extension under
/// extension-storage/. Keys are strings, values are arbitrary JSON. Size- and
/// count-capped per extension. Not an isolation boundary (shared sidecar), the
/// same caveat as SecretsStore.
/// </summary>
public sealed class ExtensionStorageStore
{
    public const int MaxKeysPerExtension = 256;
    public const int MaxValueJsonBytes = 16 * 1024;
    public const int MaxTotalJsonBytes = 256 * 1024;

    private readonly string directory;
    private readonly object gate = new();

    public ExtensionStorageStore(string dataDirectory)
    {
        directory = Path.Combine(dataDirectory, "extension-storage");
        Directory.CreateDirectory(directory);
    }

    public NativeCallOutcome Handle(string extensionId, string method, Dictionary<string, JsonElement>? parameters)
    {
        if (!IsValidExtensionId(extensionId))
        {
            return NativeCallOutcome.Failure("invalidExtensionId", $"extension id '{extensionId}' cannot be used as a storage key");
        }
        lock (gate)
        {
            var slice = LoadSlice(extensionId);
            switch (method)
            {
                case "storage.get":
                    if (!TryKey(parameters, out var getKey, out var getFailure))
                    {
                        return getFailure!;
                    }
                    return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new
                    {
                        ok = true,
                        value = slice.TryGetValue(getKey, out var stored) ? stored.Clone() : (JsonElement?)null,
                    }));
                case "storage.set":
                    if (!TryKey(parameters, out var setKey, out var setFailure))
                    {
                        return setFailure!;
                    }
                    return Set(extensionId, setKey, parameters!, slice);
                case "storage.delete":
                    if (!TryKey(parameters, out var deleteKey, out var deleteFailure))
                    {
                        return deleteFailure!;
                    }
                    slice.Remove(deleteKey);
                    Persist(extensionId, slice);
                    return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
                case "storage.keys":
                    return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true, keys = slice.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList() }));
                default:
                    return NativeCallOutcome.Failure("notImplemented", $"native method '{method}' is not implemented by this shell");
            }
        }
    }

    /// <summary>Removes the whole storage file for an extension (uninstall hygiene).</summary>
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

    private NativeCallOutcome Set(string extensionId, string key, Dictionary<string, JsonElement> parameters, Dictionary<string, JsonElement> slice)
    {
        if (!parameters.TryGetValue("value", out var value))
        {
            return NativeCallOutcome.Failure("invalidParams", "storage.set requires a 'value' parameter (any JSON)");
        }
        if (value.ValueKind is JsonValueKind.Undefined)
        {
            return NativeCallOutcome.Failure("invalidParams", "storage.set value cannot be undefined");
        }
        var serialized = JsonSerializer.SerializeToUtf8Bytes(value);
        if (serialized.Length > MaxValueJsonBytes)
        {
            return NativeCallOutcome.Failure("valueTooLarge", $"storage values are limited to {MaxValueJsonBytes} bytes");
        }
        if (!slice.ContainsKey(key) && slice.Count >= MaxKeysPerExtension)
        {
            return NativeCallOutcome.Failure("tooManyKeys", $"extensions are limited to {MaxKeysPerExtension} storage keys");
        }
        slice[key] = value.Clone();
        if (!Persist(extensionId, slice))
        {
            return NativeCallOutcome.Failure("storageFailed", $"extension storage is limited to {MaxTotalJsonBytes} bytes");
        }
        return NativeCallOutcome.Success(JsonSerializer.SerializeToElement(new { ok = true }));
    }

    private Dictionary<string, JsonElement> LoadSlice(string extensionId)
    {
        var path = PathFor(extensionId);
        try
        {
            if (!File.Exists(path))
            {
                return new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            }
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var slice = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var property in document.RootElement.EnumerateObject())
            {
                slice[property.Name] = property.Value.Clone();
            }
            return slice;
        }
        catch (JsonException)
        {
            return new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        }
        catch (IOException)
        {
            return new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        }
    }

    private bool Persist(string extensionId, Dictionary<string, JsonElement> slice)
    {
        var path = PathFor(extensionId);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(slice);
        if (bytes.Length > MaxTotalJsonBytes)
        {
            return false;
        }
        File.WriteAllBytes(path, bytes);
        return true;
    }

    private string PathFor(string extensionId) => Path.Combine(directory, extensionId + ".json");

    private static bool TryKey(Dictionary<string, JsonElement>? parameters, out string key, out NativeCallOutcome? failure)
    {
        failure = null;
        key = "";
        if (parameters is null || !parameters.TryGetValue("key", out var keyElement) || keyElement.ValueKind != JsonValueKind.String)
        {
            failure = NativeCallOutcome.Failure("invalidParams", "storage methods require a string 'key' parameter");
            return false;
        }
        key = keyElement.GetString() ?? "";
        if (key.Length == 0 || key.Length > 128)
        {
            failure = NativeCallOutcome.Failure("invalidParams", "storage keys must be between 1 and 128 characters");
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
}
