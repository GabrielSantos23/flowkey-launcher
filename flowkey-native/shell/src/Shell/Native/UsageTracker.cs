using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

/// <summary>
/// Launch/run counters for anything the root view can offer as a suggestion.
/// Keys are stable item ids: "app:{appId}" for installed applications and
/// "cmd:{extensionId}:{commandId}" for extension commands. Persisted as JSON
/// under the shell data directory, same pattern as the other stores.
/// </summary>
public sealed class UsageTracker
{
    private sealed record UsageEntry(int Count, string LastUsed);

    private readonly string filePath;
    private Dictionary<string, UsageEntry> entries = new(StringComparer.Ordinal);
    private readonly object gate = new();

    public UsageTracker(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "usage.json");
        Load();
    }

    public static string AppKey(string appId) => "app:" + appId;

    public int GetCount(string id)
    {
        lock (gate)
        {
            return entries.TryGetValue(id, out var entry) ? entry.Count : 0;
        }
    }

    public void Increment(string id)
    {
        lock (gate)
        {
            var count = entries.TryGetValue(id, out var entry) ? entry.Count + 1 : 1;
            entries[id] = new UsageEntry(count, DateTimeOffset.UtcNow.ToString("O"));
            Save();
        }
    }

    /// <summary>Ids ordered by usage count, ties broken by most recent use.</summary>
    public IReadOnlyList<string> TopIds(int cap)
    {
        lock (gate)
        {
            return entries
                .OrderByDescending(kv => kv.Value.Count)
                .ThenByDescending(kv => kv.Value.LastUsed, StringComparer.Ordinal)
                .Take(cap)
                .Select(kv => kv.Key)
                .ToList();
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(filePath))
            {
                return;
            }
            var loaded = JsonSerializer.Deserialize<Dictionary<string, UsageEntry>>(File.ReadAllText(filePath));
            if (loaded is not null)
            {
                entries = new Dictionary<string, UsageEntry>(loaded, StringComparer.Ordinal);
            }
        }
        catch
        {
            /* corrupt or unreadable usage data must never break startup */
        }
    }

    private void Save()
    {
        try
        {
            File.WriteAllText(filePath, JsonSerializer.Serialize(entries));
        }
        catch
        {
            /* best-effort persistence */
        }
    }
}
