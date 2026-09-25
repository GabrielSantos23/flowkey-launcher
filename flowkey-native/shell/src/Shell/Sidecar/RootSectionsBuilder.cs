using System.IO;
using System.Windows.Media.Imaging;
using System.Windows.Media;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Rendering;

namespace FlowKey.Shell.Sidecar;

/// <summary>
/// Composes the synthetic root sections (Favorites, then Suggestions) shown only
/// when the root view has no query. Items keep living in their normal sections —
/// these rows are pinned shortcuts, not moves. Item identity: commands use their
/// existing "cmd:{extensionId}:{commandId}" UiItem id, apps use "app:{appId}".
/// </summary>
public static class RootSectionsBuilder
{
    public const string FavoriteActionId = "__favorite__";
    public const string FavoriteActionAddTitle = "Add to Favorite";
    public const string FavoriteActionRemoveTitle = "Remove from Favorite";

    private const string AppKind = "app";
    private const string CommandKind = "cmd";
    private const string AppsExtensionId = "apps";

    public static IReadOnlyList<UiRow> Build(
        FavoritesStore favorites,
        UsageTracker usage,
        IReadOnlyList<ReadyExtension> extensions,
        IReadOnlyList<(AppEntry Entry, string? IconPath)> apps,
        Func<CommandRow, ItemRow?> buildCommandRow,
        int suggestionCap = 5)
    {
        var rows = new List<UiRow>();

        var favoriteRows = new List<UiRow>();
        foreach (var favorite in favorites.All())
        {
            if (favorite.Kind == AppKind)
            {
                var app = apps.FirstOrDefault(a => a.Entry.Id == favorite.Id);
                if (app.Entry is not null)
                {
                    favoriteRows.Add(AppRow(app.Entry, app.IconPath, favorites));
                }
            }
            else if (favorite.Kind == CommandKind)
            {
                var command = FindCommand(extensions, favorite.Id);
                if (command is not null)
                {
                    var row = buildCommandRow(command);
                    if (row is not null)
                    {
                        favoriteRows.Add(WithFavoriteAction(row, favorites));
                    }
                }
            }
        }
        if (favoriteRows.Count > 0)
        {
            rows.Add(UiRow.Header("Favorites"));
            rows.AddRange(favoriteRows);
        }

        var suggestionRows = new List<UiRow>();
        foreach (var id in usage.TopIds(suggestionCap + favorites.All().Count))
        {
            if (suggestionRows.Count >= suggestionCap)
            {
                break;
            }
            if (id.StartsWith(CommandKind + ":", StringComparison.Ordinal))
            {
                if (favorites.IsFavorite(CommandKind, id))
                {
                    continue;
                }
                var command = FindCommand(extensions, id);
                if (command is null)
                {
                    continue;
                }
                var row = buildCommandRow(command);
                if (row is not null)
                {
                    suggestionRows.Add(WithFavoriteAction(row, favorites));
                }
            }
            else if (id.StartsWith(AppKind + ":", StringComparison.Ordinal))
            {
                if (favorites.IsFavorite(AppKind, id))
                {
                    continue;
                }
                var app = apps.FirstOrDefault(a => a.Entry.Id == id.Substring(AppKind.Length + 1));
                if (app.Entry is not null)
                {
                    suggestionRows.Add(AppRow(app.Entry, app.IconPath, favorites));
                }
            }
        }
        if (suggestionRows.Count > 0)
        {
            rows.Add(UiRow.Header("Suggestions"));
            rows.AddRange(suggestionRows);
        }

        return rows;
    }

    public static UiAction FavoriteAction(FavoritesStore favorites, string kind, string id)
    {
        return new UiAction
        {
            Id = FavoriteActionId,
            Title = favorites.IsFavorite(kind, id) ? FavoriteActionRemoveTitle : FavoriteActionAddTitle,
        };
    }

    private static CommandRow? FindCommand(IReadOnlyList<ReadyExtension> extensions, string key)
    {
        var parts = key.Split(':');
        if (parts.Length != 3 || parts[0] != CommandKind)
        {
            return null;
        }
        var extension = extensions.FirstOrDefault(e => e.Id == parts[1]);
        var command = extension?.Commands.FirstOrDefault(c => c.Id == parts[2]);
        return extension is null || command is null
            ? null
            : new CommandRow(extension.Id, extension.Name, extension, command);
    }

    private static ItemRow AppRow(AppEntry entry, string? iconPath, FavoritesStore favorites)
    {
        var row = UiRow.Item(new UiItem
        {
            Id = entry.Id,
            Title = entry.Name,
            Kind = "Application",
            Actions = new List<UiAction>
            {
                new UiAction { Id = "launch", Title = "Open", Primary = true },
                FavoriteAction(favorites, AppKind, entry.Id),
            },
        });
        row.ExtensionId = AppsExtensionId;
        if (iconPath is not null && File.Exists(iconPath))
        {
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.UriSource = new Uri(iconPath);
            bitmap.EndInit();
            bitmap.Freeze();
            row.Bitmap = bitmap;
        }
        return row;
    }

    private static ItemRow WithFavoriteAction(ItemRow row, FavoritesStore favorites)
    {
        var kind = row.IsCommand ? CommandKind : AppKind;
        var actions = (row.Item.Actions ?? new List<UiAction>()).ToList();
        if (actions.All(a => a.Id != FavoriteActionId))
        {
            actions.Add(FavoriteAction(favorites, kind, row.Item.Id));
            row.Item.Actions = actions;
        }
        return row;
    }
}
