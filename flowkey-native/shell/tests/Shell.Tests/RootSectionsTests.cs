using System.IO;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class UsageTrackerTests : IDisposable
{
    private readonly string directory;

    public UsageTrackerTests()
    {
        directory = Path.Combine(Path.GetTempPath(), "flowkey-usage-tests-" + Guid.NewGuid().ToString("N"));
    }

    public void Dispose()
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void IncrementPersistsAcrossInstances()
    {
        var first = new UsageTracker(directory);
        first.Increment("app:steam");
        first.Increment("app:steam");
        first.Increment("cmd:emoji:open");

        var second = new UsageTracker(directory);
        Assert.Equal(2, second.GetCount("app:steam"));
        Assert.Equal(1, second.GetCount("cmd:emoji:open"));
        Assert.Equal(0, second.GetCount("app:missing"));
    }

    [Fact]
    public void TopIdsOrderByCountThenRecency()
    {
        var tracker = new UsageTracker(directory);
        tracker.Increment("app:low");
        tracker.Increment("app:high");
        tracker.Increment("app:high");
        tracker.Increment("app:high");
        tracker.Increment("cmd:a");
        tracker.Increment("cmd:b");

        var top = tracker.TopIds(10);
        Assert.Equal("app:high", top[0]);
        // Same count as cmd:a but used later.
        Assert.Equal("cmd:b", top[1]);
        Assert.Equal("cmd:a", top[2]);
        Assert.Equal("app:low", top[3]);
    }

    [Fact]
    public void TopIdsRespectsCap()
    {
        var tracker = new UsageTracker(directory);
        for (var i = 0; i < 8; i++)
        {
            tracker.Increment("app:" + i);
        }
        Assert.Equal(5, tracker.TopIds(5).Count);
    }
}

public class FavoritesStoreTests : IDisposable
{
    private readonly string directory;

    public FavoritesStoreTests()
    {
        directory = Path.Combine(Path.GetTempPath(), "flowkey-favorites-tests-" + Guid.NewGuid().ToString("N"));
    }

    public void Dispose()
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static FavoriteEntry App(string id, string title) => new("app", id, title, "", null, null, null);

    [Fact]
    public void ToggleAddsThenRemoves()
    {
        var store = new FavoritesStore(directory);
        Assert.True(store.Toggle(App("steam", "Steam")));
        Assert.True(store.IsFavorite("app", "steam"));
        Assert.False(store.Toggle(App("steam", "Steam")));
        Assert.False(store.IsFavorite("app", "steam"));
    }

    [Fact]
    public void FavoritesPersistAcrossInstances()
    {
        var first = new FavoritesStore(directory);
        first.Toggle(App("steam", "Steam"));
        first.Toggle(new FavoriteEntry("cmd", "cmd:emoji:open", "Emoji & Symbols", "Emoji", "smile", "#F59E0B", null));

        var second = new FavoritesStore(directory);
        Assert.Equal(2, second.All().Count);
        Assert.True(second.IsFavorite("cmd", "cmd:emoji:open"));
    }

    [Fact]
    public void ToggleIsIdempotentPerItem()
    {
        var store = new FavoritesStore(directory);
        store.Toggle(App("a", "A"));
        store.Toggle(App("b", "B"));
        store.Toggle(App("a", "A"));
        Assert.Single(store.All());
        Assert.True(store.IsFavorite("app", "b"));
    }
}

public class RootSectionsBuilderTests
{
    private static ReadyExtension ExtensionsWith(params (string Id, string Title)[] commands)
    {
        return new ReadyExtension
        {
            Id = "ext",
            Name = "Ext",
            Version = "1.0.0",
            Commands = commands.Select(c => new CommandInfo { Id = c.Id, Title = c.Title }).ToList(),
            NativeMethods = new List<string>(),
            HttpHosts = new List<string>(),
        };
    }

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "flowkey-rootsections-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static ItemRow BuildRow(CommandRow cmd) =>
        UiRow.Item(new UiItem { Id = "cmd:" + cmd.ExtensionId + ":" + cmd.Command.Id, Title = cmd.Command.Title, Actions = new List<UiAction>() }) as ItemRow
        ?? throw new InvalidOperationException();

    private static IReadOnlyList<(AppEntry, string?)> NoApps => new List<(AppEntry, string?)>();

    [Fact]
    public void EmptyStoresOmitBothSections()
    {
        var rows = RootSectionsBuilder.Build(
            new FavoritesStore(TempDir()), new UsageTracker(TempDir()),
            new List<ReadyExtension>(), NoApps, BuildRow);
        Assert.Empty(rows);
    }

    [Fact]
    public void FavoritesComeBeforeSuggestionsAndFavoritesWinDuplication()
    {
        var favorites = new FavoritesStore(TempDir());
        favorites.Toggle(new FavoriteEntry("cmd", "cmd:ext:fav", "Fav Command", "Ext", null, null, null));
        var usage = new UsageTracker(TempDir());
        usage.Increment("cmd:ext:top");
        usage.Increment("cmd:ext:top");
        usage.Increment("cmd:ext:fav");

        var extensions = new List<ReadyExtension> { ExtensionsWith(("fav", "Fav Command"), ("top", "Top Command")) };
        var rows = RootSectionsBuilder.Build(favorites, usage, extensions, NoApps, BuildRow);

        Assert.Equal(4, rows.Count);
        Assert.Equal("Favorites", Assert.IsType<HeaderRow>(rows[0]).Title);
        Assert.Equal("cmd:ext:fav", Assert.IsType<ItemRow>(rows[1]).Item.Id);
        Assert.Equal("Suggestions", Assert.IsType<HeaderRow>(rows[2]).Title);
        // The favorited command is also used, but favorites win: only the other
        // command appears under Suggestions (the Commands section below is
        // composed separately and keeps both).
        Assert.Equal("cmd:ext:top", Assert.IsType<ItemRow>(rows[3]).Item.Id);
    }

    [Fact]
    public void SuggestionsCapAtFive()
    {
        var usage = new UsageTracker(TempDir());
        var commands = new List<(string Id, string Title)>();
        for (var i = 0; i < 8; i++)
        {
            usage.Increment("cmd:ext:c" + i);
            commands.Add(("c" + i, "Command " + i));
        }
        var extensions = new List<ReadyExtension> { ExtensionsWith(commands.ToArray()) };
        var rows = RootSectionsBuilder.Build(
            new FavoritesStore(TempDir()), usage, extensions, NoApps, BuildRow);

        var suggestionItems = rows.OfType<ItemRow>().ToList();
        Assert.Equal(5, suggestionItems.Count);
    }

    [Fact]
    public void FavoriteActionTogglesLabel()
    {
        var favorites = new FavoritesStore(TempDir());
        Assert.Equal("Add to Favorite", RootSectionsBuilder.FavoriteAction(favorites, "app", "steam").Title);
        favorites.Toggle(new FavoriteEntry("app", "steam", "Steam", "", null, null, null));
        Assert.Equal("Remove from Favorite", RootSectionsBuilder.FavoriteAction(favorites, "app", "steam").Title);
    }
}
