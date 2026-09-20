using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public static class AppRanker
{
    public static int Score(AppEntry entry, string query, int launchCount)
    {
        var q = query.Trim().ToLowerInvariant();
        var name = entry.Name.ToLowerInvariant();
        var baseScore = 0;
        if (q.Length == 0)
        {
            baseScore = 10;
        }
        else if (name == q)
        {
            baseScore = 100;
        }
        else if (name.StartsWith(q))
        {
            baseScore = 80;
        }
        else if (name.Split(' ', StringSplitOptions.RemoveEmptyEntries).Any(w => w.StartsWith(q)))
        {
            baseScore = 60;
        }
        else if (name.Contains(q))
        {
            baseScore = 40;
        }
        else
        {
            return 0;
        }
        return baseScore + Math.Min(launchCount, 20);
    }

    public static List<AppEntry> Deduplicate(IEnumerable<AppEntry> entries)
    {
        var byKey = new Dictionary<string, AppEntry>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in entries)
        {
            if (byKey.TryGetValue(entry.Name, out var existing))
            {
                if (entry.IsPerUser && !existing.IsPerUser)
                {
                    byKey[entry.Name] = entry;
                }
            }
            else
            {
                byKey[entry.Name] = entry;
            }
        }
        return byKey.Values.ToList();
    }
}

public sealed class AppUsageStore
{
    private readonly string filePath;
    private Dictionary<string, int> counts = new(StringComparer.OrdinalIgnoreCase);
    private readonly object gate = new();

    public AppUsageStore(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "app-usage.json");
        Load();
    }

    public int GetCount(string appId) =>
        counts.TryGetValue(appId, out var c) ? c : 0;

    public void Increment(string appId)
    {
        lock (gate)
        {
            counts[appId] = GetCount(appId) + 1;
            Persist();
        }
    }

    private void Load()
    {
        try
        {
            if (File.Exists(filePath))
            {
                counts = JsonSerializer.Deserialize<Dictionary<string, int>>(File.ReadAllText(filePath)) ?? new(StringComparer.OrdinalIgnoreCase);
            }
        }
        catch
        {
            counts = new(StringComparer.OrdinalIgnoreCase);
        }
    }

    private void Persist()
    {
        try
        {
            File.WriteAllText(filePath, JsonSerializer.Serialize(counts));
        }
        catch
        {
            /* best-effort persistence */
        }
    }
}
