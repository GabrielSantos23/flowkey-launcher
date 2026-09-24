using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record FavoriteEntry(
    string Kind,
    string Id,
    string Title,
    string Subtitle,
    string? Icon,
    string? IconColor,
    string? IconUri);

/// <summary>
/// User-pinned root items (installed apps and extension commands), toggled from
/// the Ctrl+K action panel and rendered as the Favorites section of the root
/// list. Persisted as JSON under the shell data directory.
/// </summary>
public sealed class FavoritesStore
{
    private readonly string filePath;
    private List<FavoriteEntry> favorites = new();
    private readonly object gate = new();

    public FavoritesStore(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "favorites.json");
        Load();
    }

    public bool IsFavorite(string kind, string id)
    {
        lock (gate)
        {
            return favorites.Any(f => f.Kind == kind && f.Id == id);
        }
    }

    /// <summary>Adds when absent, removes when present. Returns true when now a favorite.</summary>
    public bool Toggle(FavoriteEntry entry)
    {
        lock (gate)
        {
            var existing = favorites.FirstOrDefault(f => f.Kind == entry.Kind && f.Id == entry.Id);
            var added = existing is null;
            if (existing is not null)
            {
                favorites.Remove(existing);
            }
            else
            {
                favorites.Add(entry);
            }
            Save();
            return added;
        }
    }

    public IReadOnlyList<FavoriteEntry> All()
    {
        lock (gate)
        {
            return favorites.ToList();
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
            var loaded = JsonSerializer.Deserialize<List<FavoriteEntry>>(File.ReadAllText(filePath));
            if (loaded is not null)
            {
                favorites = loaded;
            }
        }
        catch
        {
            /* corrupt or unreadable favorites must never break startup */
        }
    }

    private void Save()
    {
        try
        {
            File.WriteAllText(filePath, JsonSerializer.Serialize(favorites));
        }
        catch
        {
            /* best-effort persistence */
        }
    }
}
