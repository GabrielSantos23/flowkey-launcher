using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class WebSearchFallbackTests
{
    [Fact]
    public void BuildProducesOneRowWithOneActionPerEngine()
    {
        var rows = WebSearchFallback.Build("hello world");
        var row = Assert.Single(rows);
        var item = Assert.IsType<ItemRow>(row).Item;
        Assert.Equal("websearch:hello world", item.Id);
        Assert.Equal(WebSearchFallback.Engines.Count, item.Actions!.Count);
        Assert.True(item.Actions[0].Primary == true);
        Assert.Equal(WebSearchFallback.Engines[0].ActionId, item.Actions[0].Id);
    }

    [Fact]
    public void PrimaryActionOpensTheDefaultEngine()
    {
        var url = WebSearchFallback.UrlFor(WebSearchFallback.Engines[0].ActionId, "hello world");
        Assert.Equal("https://www.google.com/search?q=hello%20world", url);
    }

    [Fact]
    public void EachEngineResolvesItsOwnUrl()
    {
        foreach (var engine in WebSearchFallback.Engines)
        {
            var url = WebSearchFallback.UrlFor(engine.ActionId, "x");
            Assert.StartsWith("https://", url);
        }
        var youtube = WebSearchFallback.UrlFor("__websearch__yt", "cats");
        Assert.Contains("youtube.com", youtube);
        Assert.Contains("cats", youtube);
    }

    [Fact]
    public void QueryIsUrlEscaped()
    {
        var url = WebSearchFallback.UrlFor("__websearch__", "c++ \"quoted\"");
        Assert.NotNull(url);
        Assert.DoesNotContain(' ', url!);
        Assert.DoesNotContain('"', url);
        Assert.Contains("c%2B%2B", url);
    }

    [Fact]
    public void UnknownEngineReturnsNull()
    {
        Assert.Null(WebSearchFallback.UrlFor("__websearch__nope", "x"));
        Assert.Null(WebSearchFallback.UrlFor("something-else", "x"));
    }

    [Fact]
    public void EmptyQueryProducesNoRows()
    {
        Assert.Empty(WebSearchFallback.Build(""));
        Assert.Empty(WebSearchFallback.Build("   "));
    }
}
