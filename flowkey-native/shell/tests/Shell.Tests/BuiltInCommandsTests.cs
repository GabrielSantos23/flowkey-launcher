using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class BuiltInCommandsTests
{
    [Fact]
    public void ShipsTheCoreShellCommands()
    {
        var ids = BuiltInCommands.All.Select(c => c.Id).ToList();
        Assert.Contains("settings", ids);
        Assert.Contains("reload-extensions", ids);
        Assert.Contains("check-updates", ids);
        Assert.Contains("quit", ids);
    }

    [Fact]
    public void TitlesAreUniqueAndPrefixedWithTheirId()
    {
        foreach (var command in BuiltInCommands.All)
        {
            Assert.False(string.IsNullOrWhiteSpace(command.Title));
            Assert.False(string.IsNullOrWhiteSpace(command.IconName));
        }
        Assert.Equal(BuiltInCommands.All.Count, BuiltInCommands.All.Select(c => c.Id).Distinct().Count());
    }

    [Fact]
    public void SearchFindsCommandsByTitlePrefix()
    {
        var results = BuiltInCommands.Search("sett");
        Assert.True(results.Count >= 1);
        Assert.Equal("settings", results[0].Command.Id);
        Assert.True(results[0].Score >= 100);
        Assert.All(results.Skip(1), r => Assert.True(r.Score < results[0].Score));
    }

    [Fact]
    public void SearchFindsCommandsByKeyword()
    {
        var results = BuiltInCommands.Search("exit");
        Assert.Contains(results, r => r.Command.Id == "quit");
    }

    [Fact]
    public void SearchFindsCommandsFuzzily()
    {
        var results = BuiltInCommands.Search("rlod");
        Assert.Contains(results, r => r.Command.Id == "reload-extensions");
    }

    [Fact]
    public void EmptyQueryReturnsEverything()
    {
        Assert.Equal(BuiltInCommands.All.Count, BuiltInCommands.Search("").Count);
    }

    [Fact]
    public void ItemIdsUseTheBuiltinCommandFormat()
    {
        Assert.All(BuiltInCommands.All, c => Assert.Equal("cmd:builtin:" + c.Id, BuiltInCommands.ItemId(c)));
    }
}
