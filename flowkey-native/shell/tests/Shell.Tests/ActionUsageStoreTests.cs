using System.IO;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ActionUsageStoreTests : IDisposable
{
    private readonly string directory;

    public ActionUsageStoreTests()
    {
        directory = Path.Combine(Path.GetTempPath(), "flowkey-action-usage-tests-" + Guid.NewGuid().ToString("N"));
    }

    public void Dispose()
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static UiAction Action(string id, string title, bool primary = false) => new()
    {
        Id = id,
        Title = title,
        Primary = primary,
    };

    [Fact]
    public void BumpPersistsCountsAndRecencyAcrossInstances()
    {
        var first = new ActionUsageStore(directory);
        first.Bump("clipboard-history", "paste");
        first.Bump("clipboard-history", "paste");
        first.Bump("clipboard-history", "edit");

        var second = new ActionUsageStore(directory);
        Assert.Equal(2, second.GetCount("clipboard-history", "paste"));
        Assert.Equal(1, second.GetCount("clipboard-history", "edit"));
        Assert.Equal(0, second.GetCount("clipboard-history", "missing"));
        Assert.True(second.LastUsedTicks("clipboard-history", "edit") >= second.LastUsedTicks("clipboard-history", "paste"));
    }

    [Fact]
    public void OrderForPanelKeepsPrimaryFirstThenRanksByUsage()
    {
        var store = new ActionUsageStore(directory);
        store.Bump("ext", "secondary-a");
        store.Bump("ext", "secondary-a");
        store.Bump("ext", "secondary-a");
        store.Bump("ext", "secondary-b");
        store.Bump("ext", "secondary-b");

        var ordered = store.OrderForPanel("ext",
        [
            Action("secondary-b", "B"),
            Action("primary", "P", primary: true),
            Action("secondary-a", "A"),
            Action("unused", "U"),
        ]);

        Assert.Equal(["primary", "secondary-a", "secondary-b", "unused"], ordered.Select(a => a.Id).ToList());
    }

    [Fact]
    public void OrderForPanelIsStableForEqualUsage()
    {
        var store = new ActionUsageStore(directory);
        var actions = new[] { Action("one", "One"), Action("two", "Two"), Action("three", "Three") };
        var ordered = store.OrderForPanel("ext", actions);
        Assert.Equal(["one", "two", "three"], ordered.Select(a => a.Id).ToList());
    }

    [Fact]
    public void UsageIsScopedPerExtension()
    {
        var store = new ActionUsageStore(directory);
        store.Bump("ext-a", "paste");
        Assert.Equal(1, store.GetCount("ext-a", "paste"));
        Assert.Equal(0, store.GetCount("ext-b", "paste"));
    }
}
