using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class FuzzyMatcherTests
{
    private const int ScoreExact = 120;
    private const int ScorePrefix = 100;
    private const int ScoreWordPrefix = 90;
    private const int SubsequenceCap = 85;

    [Fact]
    public void EmptyQueryMatchesEverythingWithoutIndices()
    {
        var match = FuzzyMatcher.Match("", "Anything");
        Assert.NotNull(match);
        Assert.Equal(1, match!.Score);
        Assert.Empty(match.Indices);
    }

    [Fact]
    public void ExactMatchScoresHighestAndHighlightsEverything()
    {
        var match = FuzzyMatcher.Match("chrome", "Chrome");
        Assert.Equal(ScoreExact, match!.Score);
        Assert.Equal(new[] { 0, 1, 2, 3, 4, 5 }, match.Indices);
    }

    [Fact]
    public void PrefixBeatsEverythingButExact()
    {
        var match = FuzzyMatcher.Match("chro", "Chrome");
        Assert.Equal(ScorePrefix, match!.Score);
        Assert.Equal(new[] { 0, 1, 2, 3 }, match.Indices);
    }

    [Fact]
    public void WordPrefixBeatsSubsequence()
    {
        var match = FuzzyMatcher.Match("edge", "Microsoft Edge");
        Assert.Equal(ScoreWordPrefix, match!.Score);
        Assert.Equal(new[] { 10, 11, 12, 13 }, match.Indices);
    }

    [Fact]
    public void SubsequenceMatchesStayBelowPrefixScores()
    {
        var dense = FuzzyMatcher.Match("soft", "Microsoft");
        Assert.NotNull(dense);
        Assert.InRange(dense!.Score, 10, SubsequenceCap);

        var gappy = FuzzyMatcher.Match("mft", "Microsoft");
        Assert.NotNull(gappy);
        Assert.InRange(gappy!.Score, 10, SubsequenceCap);
        Assert.True(dense.Score > gappy.Score, "a tight contains match should outrank a gappy one");
    }

    [Fact]
    public void SubsequenceIndicesFormAnAscendingSubsequence()
    {
        var match = FuzzyMatcher.Match("mft", "Microsoft");
        Assert.Equal(new[] { 0, 7, 8 }, match!.Indices);
    }

    [Fact]
    public void WordBoundariesRaiseSubsequenceScores()
    {
        var boundary = FuzzyMatcher.Match("ap", "MyAppIcon");
        var interior = FuzzyMatcher.Match("pp", "MyAppIcon");
        Assert.NotNull(boundary);
        Assert.NotNull(interior);
        Assert.True(boundary!.Score > interior!.Score, "word/camel boundary hit should outrank interior hit");
    }

    [Fact]
    public void MissingQueryCharacterMatchesThroughPlainSubsequence()
    {
        var match = FuzzyMatcher.Match("micosoft", "Microsoft");
        Assert.NotNull(match);
        Assert.Equal(new[] { 0, 1, 2, 4, 5, 6, 7, 8 }, match!.Indices);
    }

    [Fact]
    public void TransposedQueryCharacterStillMatchesWithTypoPenalty()
    {
        var clean = FuzzyMatcher.Match("microsoft", "Microsoft");
        var typo = FuzzyMatcher.Match("micorsoft", "Microsoft");
        Assert.NotNull(typo);
        Assert.Equal(new[] { 0, 1, 2, 3, 5, 6, 7, 8 }, typo!.Indices);
        Assert.True(typo.Score < clean!.Score, "typo-tolerant match should score below the clean one");
    }

    [Fact]
    public void UnrelatedTextReturnsNull()
    {
        Assert.Null(FuzzyMatcher.Match("zzz", "Microsoft Edge"));
        Assert.Null(FuzzyMatcher.Match("firefox", ""));
    }

    [Fact]
    public void CaseIsIgnoredForMatchingButIndicesPointIntoOriginalText()
    {
        var match = FuzzyMatcher.Match("EDGE", "Microsoft Edge");
        Assert.NotNull(match);
        Assert.Equal(new[] { 10, 11, 12, 13 }, match!.Indices);
    }
}
