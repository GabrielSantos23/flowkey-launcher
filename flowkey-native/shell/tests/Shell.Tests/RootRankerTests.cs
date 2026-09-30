using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class RootRankerTests
{
    private static ItemRow Item(string id, string extensionId, int? score, bool isCommand = false)
    {
        var row = new ItemRow
        {
            Item = new UiItem { Id = id, Title = id },
            ExtensionId = extensionId,
            IsCommand = isCommand,
        };
        if (score is { } value)
        {
            row.MatchScore = value;
        }
        return row;
    }

    private static string HeaderTitle(UiRow row) => Assert.IsType<HeaderRow>(row).Title;

    [Fact]
    public void RowsAreRankedByScoreWithRegeneratedGroupHeaders()
    {
        var a1 = Item("a1", "alpha", 50);
        var b1 = Item("b1", "beta", 90);
        var a2 = Item("a2", "alpha", 70);
        var rows = new List<UiRow> { UiRow.Header("Alpha"), a1, b1, a2 };

        var result = RootRanker.Rank(rows, ext => ext == "alpha" ? "Alpha" : "Beta");

        Assert.Equal(5, result.Count);
        Assert.Equal("Beta", HeaderTitle(result[0]));
        Assert.Same(b1, result[1]);
        Assert.Equal("Alpha", HeaderTitle(result[2]));
        Assert.Same(a2, result[3]);
        Assert.Same(a1, result[4]);
    }

    [Fact]
    public void ConsecutiveCommandsShareOneHeader()
    {
        var c1 = Item("c1", "builtin", 90, isCommand: true);
        var c2 = Item("c2", "ext1", 80, isCommand: true);
        var e1 = Item("e1", "ext1", 10);
        var result = RootRanker.Rank(new List<UiRow> { e1, c1, c2 }, ext => "Extension One");

        Assert.Equal("Commands", HeaderTitle(result[0]));
        Assert.Same(c1, result[1]);
        Assert.Same(c2, result[2]);
        Assert.Equal("Extension One", HeaderTitle(result[3]));
        Assert.Same(e1, result[4]);
    }

    [Fact]
    public void CalculatorRowsStayPinnedAtTheTop()
    {
        var calc = new CalculatorItemRow { Item = new UiItem { Id = "calc", Title = "1+1" }, ExtensionId = "calc" };
        var high = Item("high", "alpha", 99);
        var result = RootRanker.Rank(new List<UiRow> { high, calc }, ext => "Alpha");

        // Group headers are regenerated, so the calculator row lands after its
        // group header — but still above the higher-scoring regular row.
        Assert.Same(calc, result[1]);
        Assert.Same(high, result[3]);
    }

    [Fact]
    public void LoadMoreStaysAtTheEnd()
    {
        var item = Item("a", "alpha", 50);
        var result = RootRanker.Rank(new List<UiRow> { UiRow.Header("Alpha"), item, LoadMoreRow.Instance }, ext => "Alpha");

        Assert.Same(LoadMoreRow.Instance, result[^1]);
        Assert.Equal(3, result.Count);
    }

    [Fact]
    public void UnmatchedRowsSinkBelowMatchedOnesInStableOrder()
    {
        var matched = Item("matched", "alpha", 60);
        var first = Item("first", "alpha", 0);
        var second = Item("second", "beta", 0);
        var result = RootRanker.Rank(new List<UiRow> { first, matched, second }, ext => ext);

        var itemIds = result.OfType<ItemRow>().Select(row => row.Item.Id).ToList();
        Assert.Equal(["matched", "first", "second"], itemIds);
    }

    [Fact]
    public void SortingIsStableForEqualScores()
    {
        var one = Item("one", "alpha", 50);
        var two = Item("two", "alpha", 50);
        var result = RootRanker.Rank(new List<UiRow> { one, two }, ext => "Alpha");

        Assert.Same(one, result[1]);
        Assert.Same(two, result[2]);
    }
}
