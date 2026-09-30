using FlowKey.Shell.Protocol;
using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class CommandCatalogTests
{
    private static ReadyExtension Extension(string id, string name, params CommandInfo[] commands) =>
        new() { Id = id, Name = name, Commands = [.. commands] };

    private static CommandInfo Command(string id, string title, string[]? keywords = null) =>
        new() { Id = id, Title = title, Keywords = keywords is null ? null : [.. keywords] };

    [Fact]
    public void ExactTitleMatchScoresHighest()
    {
        var extensions = new[] { Extension("a", "A", Command("open", "Clipboard History")) };
        var rows = CommandCatalog.Search("clipboard history", extensions);
        var row = Assert.Single(rows);
        Assert.True(row.Score >= 100);
    }

    [Fact]
    public void RowsAreOrderedByScoreDescending()
    {
        var extensions = new[]
        {
            Extension("a", "A", Command("open", "Notes"), Command("translate", "Translate Clipboard")),
            Extension("b", "B", Command("open", "Translate")),
        };
        var rows = CommandCatalog.Search("translate", extensions);
        Assert.Equal(2, rows.Count);
        Assert.Equal("Translate", rows[0].Command.Title);
        Assert.Equal("Translate Clipboard", rows[1].Command.Title);
    }

    [Fact]
    public void KeywordsExtendMatchingWithoutBeatingTitleMatches()
    {
        var extensions = new[] { Extension("a", "A", Command("paste", "Clipboard History", ["paste", "buffer"])) };
        var rows = CommandCatalog.Search("paste", extensions);
        var row = Assert.Single(rows);
        Assert.InRange(row.Score, 1, 85);
    }

    [Fact]
    public void FuzzyQueriesMatchTitles()
    {
        var extensions = new[] { Extension("a", "A", Command("open", "Clipboard History")) };
        var rows = CommandCatalog.Search("clpbrd", extensions);
        Assert.Single(rows);
    }

    [Fact]
    public void EmptyQueryReturnsAllCommandsWithBaseScore()
    {
        var extensions = new[]
        {
            Extension("a", "A", Command("open", "Notes")),
            Extension("b", "B", Command("open", "Translate")),
        };
        var rows = CommandCatalog.Search("", extensions);
        Assert.Equal(2, rows.Count);
        Assert.All(rows, row => Assert.Equal(10, row.Score));
    }

    [Fact]
    public void NonMatchingCommandsAreDropped()
    {
        var extensions = new[] { Extension("a", "A", Command("open", "Notes")) };
        Assert.Empty(CommandCatalog.Search("zzz", extensions));
    }
}
