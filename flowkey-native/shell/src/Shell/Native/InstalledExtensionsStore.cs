using System.IO;
using System.Text.Json;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Native;

public sealed record ExtensionConsent(
    IReadOnlyList<string> NativeMethods,
    IReadOnlyList<string> HttpHosts,
    IReadOnlyList<string> OAuth);

public sealed record InstalledExtension(
    string Id,
    string Name,
    string Version,
    string InstallPath,
    bool Enabled,
    DateTimeOffset InstalledAt,
    ExtensionConsent Consent);

/// <summary>
/// Persisted registry of zip-installed third-party extensions, including the
/// capabilities the user consented to at install time. The consent record —
/// not the manifest — is what the shell enforces for installed extensions.
/// </summary>
public sealed class InstalledExtensionsStore
{
    private readonly string filePath;
    private readonly object gate = new();
    private Dictionary<string, InstalledExtension> records = new(StringComparer.Ordinal);
    private bool loaded;

    public InstalledExtensionsStore(string dataDirectory)
    {
        Directory.CreateDirectory(dataDirectory);
        filePath = Path.Combine(dataDirectory, "installed-extensions.json");
    }

    public IReadOnlyList<InstalledExtension> GetAll()
    {
        lock (gate)
        {
            EnsureLoaded();
            return records.Values.OrderBy(r => r.Id, StringComparer.Ordinal).ToList();
        }
    }

    public InstalledExtension? Get(string id)
    {
        lock (gate)
        {
            EnsureLoaded();
            return records.GetValueOrDefault(id);
        }
    }

    public void Upsert(InstalledExtension record)
    {
        lock (gate)
        {
            EnsureLoaded();
            records[record.Id] = record;
            Persist();
        }
    }

    public void SetEnabled(string id, bool enabled)
    {
        lock (gate)
        {
            EnsureLoaded();
            if (records.TryGetValue(id, out var existing))
            {
                records[id] = existing with { Enabled = enabled };
                Persist();
            }
        }
    }

    public void UpdateConsent(string id, ExtensionConsent consent)
    {
        lock (gate)
        {
            EnsureLoaded();
            if (records.TryGetValue(id, out var existing))
            {
                records[id] = existing with { Consent = consent };
                Persist();
            }
        }
    }

    public bool Remove(string id)
    {
        lock (gate)
        {
            EnsureLoaded();
            if (!records.Remove(id))
            {
                return false;
            }
            Persist();
            return true;
        }
    }

    private void Persist()
    {
        File.WriteAllText(filePath, JsonSerializer.Serialize(records, JsonOptions.Default));
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
            records = JsonSerializer.Deserialize<Dictionary<string, InstalledExtension>>(
                File.ReadAllText(filePath), JsonOptions.Default) ?? new(StringComparer.Ordinal);
        }
        catch (JsonException)
        {
            records = new(StringComparer.Ordinal);
        }
        catch (IOException)
        {
            records = new(StringComparer.Ordinal);
        }
    }
}
