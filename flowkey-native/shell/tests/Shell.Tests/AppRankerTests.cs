using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class AppRankerTests
{
    private static AppEntry Entry(string name, bool isUwp = false, bool isPerUser = false) =>
        new(Id: name.ToLowerInvariant(), Name: name, LaunchPath: "x", IsUwp: isUwp, IsPerUser: isPerUser, IconKey: name.ToLowerInvariant());

    [Theory]
    [InlineData("microsoft edge", 100)]
    [InlineData("micro", 80)]
    [InlineData("edge", 60)]
    [InlineData("soft edge", 40)]
    [InlineData("zzz", 0)]
    public void MatchQualityRanksCorrectly(string query, int expectedBase)
    {
        var score = AppRanker.Score(Entry("Microsoft Edge"), query, 0);
        Assert.Equal(expectedBase, score);
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
    public void DeduplicatePrefersPerUserShortcut()
    {
        var allUsers = new AppEntry("c:/programdata/.../app.lnk", "App", "x", IsUwp: false, IsPerUser: false, "k1");
        var perUser = new AppEntry("c:/users/x/.../app.lnk", "App", "x", IsUwp: false, IsPerUser: true, "k2");
        var merged = AppRanker.Deduplicate(new[] { allUsers, perUser });
        var app = Assert.Single(merged);
        Assert.True(app.IsPerUser);
    }
}
