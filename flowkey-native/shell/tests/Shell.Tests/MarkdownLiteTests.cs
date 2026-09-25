using System.Diagnostics;
using System.Text;
using FlowKey.Shell.Rendering;
using Xunit;

namespace FlowKey.Shell.Tests;

public class MarkdownLiteTests
{
    [Fact]
    public void HeadingsBoldItalicCodeParse()
    {
        var result = MarkdownLite.Parse("# Title\nSome **bold** and *italic* and `code`.");
        var heading = Assert.IsType<MdHeading>(result.Nodes[0]);
        Assert.Equal(1, heading.Level);
        var paragraph = Assert.IsType<MdParagraph>(result.Nodes[1]);
        Assert.Contains(paragraph.Inlines, i => i is MdInline.Bold b && b.Value == "bold");
        Assert.Contains(paragraph.Inlines, i => i is MdInline.Italic i2 && i2.Value == "italic");
        Assert.Contains(paragraph.Inlines, i => i is MdInline.Code c && c.Value == "code");
    }

    [Fact]
    public void ListsAndCodeBlocksParse()
    {
        var result = MarkdownLite.Parse("- alpha\n1. beta\n\n```\ncode line\n```\n");
        Assert.Contains(result.Nodes, n => n is MdListItem li && li.Number is null && li.Inlines[0] is MdInline.Text t && t.Value == "alpha");
        Assert.Contains(result.Nodes, n => n is MdListItem li2 && li2.Number == 1);
        var code = Assert.IsType<MdCodeBlock>(result.Nodes.Single(n => n is MdCodeBlock));
        Assert.Contains("code line", code.Text);
    }

    [Fact]
    public void LinksParseWithLabelAndHref()
    {
        var paragraph = Assert.IsType<MdParagraph>(MarkdownLite.Parse("[site](https://x.com)").Nodes.Single(n => n is MdParagraph));
        var link = Assert.IsType<MdInline.Link>(paragraph.Inlines.Single(i => i is MdInline.Link));
        Assert.Equal("https://x.com", link.Href);
        Assert.Equal("site", link.Label);
    }
    [Fact]
    public void HttpsLinkIsOpenableWithCanonicalUrl()
    {
        Assert.True(MarkdownLite.IsLinkOpenable("https://example.com/a/../b?x=1", out var canonical, out _));
        Assert.DoesNotContain("/..", canonical);
    }

    [Fact]
    public void LinkWithUserInfoIsRejected() =>
        Assert.False(MarkdownLite.IsLinkOpenable("https://user:pass@example.com", out _, out _));

    [Fact]
    public void OverlongLinkIsRejected() =>
        Assert.False(MarkdownLite.IsLinkOpenable("https://example.com/" + new string('a', 3000), out _, out _));

    [Fact]
    public void OversizedSourceTruncatesWithNotice()
    {
        var result = MarkdownLite.Parse(string.Concat(Enumerable.Repeat("paragraph\n\n", 10_000)));
        Assert.True(result.Truncated);
        Assert.Contains(result.Nodes, n => n is MdTruncationNotice);
        Assert.True(result.Nodes.Count <= MarkdownLite.MaxNodes + 1);
    }

    [Fact]
    public void PathologicalInputStaysBounded()
    {
        var cases = new[]
        {
            new string('[', 50_000),
            new string('*', 50_000),
            new string('`', 50_000),
            string.Concat(Enumerable.Repeat("[a](b)", 10_000)),
            string.Concat(Enumerable.Repeat("**x", 16_000)),
        };
        foreach (var text in cases)
        {
            var sw = Stopwatch.StartNew();
            var result = MarkdownLite.Parse(text);
            sw.Stop();
            Assert.True(sw.ElapsedMilliseconds < 2000, $"parse took {sw.ElapsedMilliseconds} ms");
            Assert.True(result.Nodes.Count <= MarkdownLite.MaxNodes + 1);
            Assert.True(result.Truncated || result.Nodes.Count > 0);
        }
    }
}
