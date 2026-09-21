using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed class PreferencesStore
{
    private const string PasswordPrefix = "dpapi:";
    private readonly string filePath;
    private readonly object gate = new();
    private Dictionary<string, Dictionary<string, JsonElement>> preferences = new(StringComparer.Ordinal);
    private bool loaded;

    public PreferencesStore(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "preferences.json");
    }

    public Dictionary<string, JsonElement> Slice(string extensionId, IReadOnlyList<Protocol.PreferenceSchema> schema)
    {
        lock (gate)
        {
            EnsureLoaded();
            var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            preferences.TryGetValue(extensionId, out var values);
            values ??= new Dictionary<string, JsonElement>(StringComparer.Ordinal);

            foreach (var entry in schema)
            {
                if (values.TryGetValue(entry.Name, out var stored))
                {
                    if (entry.Type == "password" && stored.ValueKind == JsonValueKind.String)
                    {
                        var raw = stored.GetString() ?? "";
                        result[entry.Name] = JsonSerializer.SerializeToElement(DecryptValue(raw));
                    }
                    else
                    {
                        result[entry.Name] = stored;
                    }
                }
                else if (entry.Default is not null && entry.Default.Value.ValueKind != JsonValueKind.Null)
                {
                    result[entry.Name] = entry.Default.Value;
                }
            }
            return result;
        }
    }

    public List<string> MissingRequired(string extensionId, IReadOnlyList<Protocol.PreferenceSchema> schema)
    {
        lock (gate)
        {
            EnsureLoaded();
            preferences.TryGetValue(extensionId, out var values);
            values ??= new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            var missing = new List<string>();
            foreach (var entry in schema)
            {
                if (!entry.Required)
                {
                    continue;
                }
                var hasValue = values.TryGetValue(entry.Name, out var stored) && stored.ValueKind switch
                {
                    JsonValueKind.String => !string.IsNullOrEmpty(stored.GetString()),
                    JsonValueKind.True or JsonValueKind.False => true,
                    _ => stored.ValueKind != JsonValueKind.Null && stored.ValueKind != JsonValueKind.Undefined,
                };
                var hasDefault = entry.Default is not null && entry.Default.Value.ValueKind != JsonValueKind.Null;
                if (!hasValue && !hasDefault)
                {
                    missing.Add(entry.Title);
                }
            }
            return missing;
        }
    }

    public IReadOnlyDictionary<string, Dictionary<string, JsonElement>> AllSlices()
    {
        lock (gate)
        {
            EnsureLoaded();
            return preferences.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);
        }
    }

    public void SetSlice(string extensionId, IReadOnlyList<Protocol.PreferenceSchema> schema, Dictionary<string, JsonElement> values)
    {
        lock (gate)
        {
            EnsureLoaded();
            var passwordNames = schema
                .Where(e => e.Type == "password")
                .Select(e => e.Name)
                .ToHashSet(StringComparer.Ordinal);
            var stored = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var (name, value) in values)
            {
                if (passwordNames.Contains(name) && value.ValueKind == JsonValueKind.String)
                {
                    stored[name] = JsonSerializer.SerializeToElement(EncryptValue(value.GetString() ?? ""));
                }
                else
                {
                    stored[name] = value;
                }
            }
            preferences[extensionId] = stored;
            Persist();
        }
    }

    private void Persist()
    {
        var plain = JsonSerializer.SerializeToUtf8Bytes(preferences);
        File.WriteAllText(filePath, Encoding.UTF8.GetString(plain));
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
            if (File.Exists(filePath))
            {
                preferences = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(
                    File.ReadAllText(filePath)) ?? new(StringComparer.Ordinal);
            }
        }
        catch
        {
            preferences = new(StringComparer.Ordinal);
        }
    }

    private static string DecryptValue(string stored)
    {
        if (!stored.StartsWith(PasswordPrefix, StringComparison.Ordinal))
        {
            return stored;
        }
        try
        {
            var encrypted = Convert.FromBase64String(stored[PasswordPrefix.Length..]);
            var plain = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plain);
        }
        catch
        {
            return "";
        }
    }

    public static string EncryptValue(string plain)
    {
        var encrypted = ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), null, DataProtectionScope.CurrentUser);
        return PasswordPrefix + Convert.ToBase64String(encrypted);
    }
}
