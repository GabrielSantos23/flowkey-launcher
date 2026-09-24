using System.Collections.Generic;
using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class SearchStatePushTests
{
    private static UiPushMessage Push(
        string extensionId = "ext",
        string commandId = "open",
        string query = "par",
        string? filterValue = "all")
    {
        return new UiPushMessage
        {
            ExtensionId = extensionId,
            CommandId = commandId,
            Query = query,
            FilterValue = filterValue,
            Tree = new ListTree
            {
                Sections = new List<UiSection>
                {
                    new()
                    {
                        Items = new List<UiItem>
                        {
                            new() { Id = "x1", Title = "Pushed item" },
                        },
                    },
                },
            },
        };
    }

    private static SearchState PushedState(string requestId = "s1", string query = "par", string? filterValue = "all")
    {
        var state = new SearchState();
        state.BeginRootQuery("root", new List<(string, string)>());
        state.PushRequest(requestId, "ext", "open");
        var top = state.Top!;
        top.Query = query;
        top.FilterValue = filterValue;
        return state;
    }

    [Fact]
    public void PushAppliesWhenViewStateMatches()
    {
        var state = PushedState();
        Assert.True(state.ShouldApplyPush(Push(), "par"));
    }

    [Fact]
    public void PushIsDiscardedAtRootDepth()
    {
        var state = new SearchState();
        state.BeginRootQuery("par", new List<(string, string)> { ("ext", "s1") });
        state.Top!.Query = "par";
        Assert.False(state.ShouldApplyPush(Push(), "par"));
    }

    [Fact]
    public void PushIsDiscardedForWrongExtensionOrCommand()
    {
        var state = PushedState();
        Assert.False(state.ShouldApplyPush(Push(extensionId: "other"), "par"));
        Assert.False(state.ShouldApplyPush(Push(commandId: "other"), "par"));
    }

    [Fact]
    public void PushIsDiscardedForStaleQueryOrPendingSearchText()
    {
        var state = PushedState(query: "par");
        Assert.False(state.ShouldApplyPush(Push(query: "old"), "par"));
        Assert.False(state.ShouldApplyPush(Push(), "parX"));
    }

    [Fact]
    public void PushIsDiscardedForMismatchedFilterValue()
    {
        var state = PushedState(filterValue: "all");
        Assert.False(state.ShouldApplyPush(Push(filterValue: "text"), "par"));
    }

    [Fact]
    public void PushResultReplacesRowsForTheExtensionAtThePushedLevel()
    {
        var state = PushedState();
        state.PushResult("ext", (Push().Tree as ListTree)!);
        var rows = state.CurrentRows;
        var item = Assert.Single(rows.OfType<ItemRow>());
        Assert.Equal("x1", item.Item.Id);
        Assert.Equal("Pushed item", item.Item.Title);
        Assert.Equal("ext", item.ExtensionId);
    }

    [Fact]
    public void PushResultTargetsTheNewestRequestForTheExtension()
    {
        var state = PushedState("s1");
        state.BeginLevelQuery(new List<(string, string)> { ("ext", "s2") });
        state.Top!.Query = "par";
        state.Top.FilterValue = "all";
        state.PushResult("ext", (Push().Tree as ListTree)!);
        var item = Assert.Single(state.CurrentRows.OfType<ItemRow>());
        Assert.Equal("x1", item.Item.Id);
        Assert.Equal("s2", state.Top.RequestIds.Single());
    }

    [Fact]
    public void PushResultKeepsCurrentRowsWhenExtensionIsAbsent()
    {
        var state = PushedState();
        var before = state.CurrentRows;
        state.PushResult("unknown-ext", (Push().Tree as ListTree)!);
        Assert.Same(before, state.CurrentRows);
    }
}

public class SearchStatePushActionTests
{
    private static Protocol.UiPushMessage Push(string commandId, string query, string extensionId = "spotify") =>
        new() { ExtensionId = extensionId, CommandId = commandId, Query = query };

    [Fact]
    public void ActionPushedLevelAcceptsPushesWithUnmatchedSearchBoxText()
    {
        var state = new SearchState();
        state.PushRequest("r0", "spotify", "search");
        state.PushRequest("r1", "spotify", "album-songs:al1", actionPushed: true);

        Assert.True(state.ShouldApplyPush(Push("album-songs:al1", ""), "kanye"));
    }

    [Fact]
    public void RegularLevelsStillRequireSearchBoxMatch()
    {
        var state = new SearchState();
        state.PushRequest("r0", "spotify", "search");
        state.PushRequest("r1", "spotify", "open", actionPushed: false);

        Assert.False(state.ShouldApplyPush(Push("open", ""), "kanye"));
        Assert.True(state.ShouldApplyPush(Push("open", ""), ""));
    }

    [Fact]
    public void ActionPushedLevelStillGuardsExtensionAndCommand()
    {
        var state = new SearchState();
        state.PushRequest("r0", "spotify", "search");
        state.PushRequest("r1", "spotify", "album-songs:al1", actionPushed: true);

        Assert.False(state.ShouldApplyPush(Push("album-songs:other", ""), "kanye"));
        Assert.False(state.ShouldApplyPush(Push("album-songs:al1", "", extensionId: "emoji"), "kanye"));
    }
}
