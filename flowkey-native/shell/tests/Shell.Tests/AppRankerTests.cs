using FlowKey.Shell.Native;
using FlowKey.Shell.Sidecar;
using Xunit;

namespace FlowKey.Shell.Tests;

public class AppRankerTests
{
    private static AppEntry Entry(string name, bool isUwp = false, bool isPerUser = false) =>
        new(Id: name.ToLowerInvariant(), Name: name, LaunchPath: "x", IsUwp: isUwp, IsPerUser: isPerUser, IconKey: name.ToLowerInvariant());

    [Fact]
    public void MatchQualityRanksExactAbovePrefixAboveWordPrefix()
    {
        var exact = AppRanker.Score(Entry("Microsoft Edge"), "microsoft edge", 0);
        var prefix = AppRanker.Score(Entry("Microsoft Edge"), "micro", 0);
        var wordPrefix = AppRanker.Score(Entry("Microsoft Edge"), "edge", 0);
        Assert.True(exact > prefix);
        Assert.True(prefix > wordPrefix);
        Assert.Equal(FuzzyMatcher.Match("edge", "Microsoft Edge")!.Score, wordPrefix);
    }

    [Fact]
    public void FuzzySubsequenceMatchesRankBelowPrefixes()
    {
        var wordPrefix = AppRanker.Score(Entry("Microsoft Edge"), "edge", 0);
        var fuzzy = AppRanker.Score(Entry("Microsoft Edge"), "soft edge", 0);
        Assert.True(fuzzy > 0);
        Assert.True(fuzzy < wordPrefix);
    }

    [Fact]
    public void TypoSaysStillFindTheApp()
    {
        Assert.True(AppRanker.Score(Entry("Microsoft Edge"), "micosoft edge", 0) > 0);
        Assert.True(AppRanker.Score(Entry("Visual Studio Code"), "vscode", 0) > 0);
    }

    [Fact]
    public void LaunchCountAddsBoundedBonus()
    {
        var without = AppRanker.Score(Entry("Firefox"), "fire", 0);
        var with = AppRanker.Score(Entry("Firefox"), "fire", 10);
        Assert.Equal(without + 10, with);
        Assert.Equal(without + 20, AppRanker.Score(Entry("Firefox"), "fire", 100));
    }

    [Fact]
    public void NonMatchingEntryScoresZero() => Assert.Equal(0, AppRanker.Score(Entry("Calc"), "firefox", 5));

    [Fact]
    public void EmptyQueryGivesEveryAppTheBaseScore()
    {
        Assert.Equal(10, AppRanker.Score(Entry("Anything"), "", 0));
    }

    [Fact]
    public void DeduplicatePrefersPerUserShortcut()
    {
        var allUsers = new AppEntry("c:/programdata/.../app.lnk", "App", "x", IsUwp: false, IsPerUser: false, "k1");
        var perUser = new AppEntry("c:/users/x/.../app.lnk", "App", "x", IsUwp: false, IsPerUser: true, "k2");
        var merged = AppRanker.Deduplicate(new[] { allUsers, perUser });
        var app = Assert.Single(merged);
        Assert.True(app.IsPerUser);
    }
}
