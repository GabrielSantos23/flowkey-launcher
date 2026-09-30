using System.IO;
using System.Text.Json;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Native;

/// <summary>
/// Persists how often each action runs, per extension, so the Ctrl+K panel
/// can float frequently used actions to the top, Raycast-style. Backs
/// <see cref="OrderForPanel"/>: primary stays first, then usage count
/// (recency breaks ties), then the extension's original order.
/// </summary>
public sealed class ActionUsageStore
{
    private sealed record Entry
    {
        public int Count { get; set; }
        public long LastUsed { get; set; }
    }

    private readonly string filePath;
    private Dictionary<string, Entry> entries = new(StringComparer.Ordinal);
    private readonly object gate = new();

    public ActionUsageStore(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "action-usage.json");
        Load();
    }

    public void Bump(string extensionId, string actionId)
    {
        lock (gate)
        {
            var key = extensionId + "|" + actionId;
            entries[key] = new Entry
            {
                Count = GetCount(extensionId, actionId) + 1,
                LastUsed = DateTime.UtcNow.Ticks,
            };
            Persist();
        }
    }

    public int GetCount(string extensionId, string actionId) =>
        entries.TryGetValue(extensionId + "|" + actionId, out var entry) ? entry.Count : 0;

    public long LastUsedTicks(string extensionId, string actionId) =>
        entries.TryGetValue(extensionId + "|" + actionId, out var entry) ? entry.LastUsed : 0;

    public IReadOnlyList<UiAction> OrderForPanel(string extensionId, IReadOnlyList<UiAction> actions)
    {
        return actions
            .Select((action, index) => (Action: action, Index: index))
            .OrderBy(pair => pair.Action.Primary == true ? 0 : 1)
            .ThenByDescending(pair => GetCount(extensionId, pair.Action.Id))
            .ThenByDescending(pair => LastUsedTicks(extensionId, pair.Action.Id))
            .ThenBy(pair => pair.Index)
            .Select(pair => pair.Action)
            .ToList();
    }

    private void Load()
    {
        try
        {
            if (File.Exists(filePath))
            {
                entries = JsonSerializer.Deserialize<Dictionary<string, Entry>>(File.ReadAllText(filePath))
                    ?? new(StringComparer.Ordinal);
            }
        }
        catch
        {
            entries = new(StringComparer.Ordinal);
        }
    }

    private void Persist()
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
