using System.IO;
using FlowKey.Shell.Native;
using Xunit;

namespace Shell.Tests;

public class UpdateVersionComparerTests
{
    [Theory]
    [InlineData("1.0.0", "1.0.0", 0)]
    [InlineData("1.2.1", "1.2.0", 1)]
    [InlineData("1.10.0", "1.9.9", 1)]
    [InlineData("v1.2.0", "1.2.0", 0)]
    [InlineData("2.0", "1.9.9", 1)]
    [InlineData("1.0.0", "1.0.1", -1)]
    [InlineData("1.0.0-beta.1", "1.0.0", -1)]
    [InlineData("1.0.0-beta.2", "1.0.0-beta.1", 1)]
    [InlineData(null, "1.0.0", -1)]
    [InlineData("1.0.0", null, 1)]
    public void ComparesVersions(string? left, string? right, int expectedSign)
    {
        var result = UpdateVersionComparer.Compare(left, right);
        var sign = Math.Sign(result);
        Assert.Equal(expectedSign, sign);
    }

    [Theory]
    [InlineData("1.2.0", "1.0.0", true)]
    [InlineData("1.0.0", "1.0.0", false)]
    [InlineData("0.9.0", "1.0.0", false)]
    public void DetectsNewerVersions(string? candidate, string? current, bool expected)
    {
        Assert.Equal(expected, UpdateVersionComparer.IsNewer(candidate, current));
    }
}

public class UpdateStateTrackerTests
{
    [Fact]
    public void CheckWithUpdateMovesToAvailableAndShowsBanner()
    {
        var tracker = new UpdateStateTracker("1.0.0");
        tracker.BeginCheck();
        var status = tracker.CheckCompleted(true, "1.1.0");
        Assert.Equal(UpdatePhase.Available, status.Phase);
        Assert.Equal("1.1.0", status.NewVersion);
        Assert.True(status.ShowBanner);
    }

    [Fact]
    public void CheckWithoutUpdateHidesBanner()
    {
        var tracker = new UpdateStateTracker("1.0.0");
        tracker.BeginCheck();
        var status = tracker.CheckCompleted(false, null, "You're up to date");
        Assert.Equal(UpdatePhase.UpToDate, status.Phase);
        Assert.False(status.ShowBanner);
    }

    [Fact]
    public void DownloadProgressClampsAndCompletesToReady()
    {
        var tracker = new UpdateStateTracker("1.0.0");
        tracker.BeginCheck();
        tracker.CheckCompleted(true, "1.1.0");
        tracker.BeginDownload();
        tracker.DownloadProgress(150);
        Assert.Equal(100, tracker.Status.ProgressPercent);
        tracker.DownloadProgress(42);
        Assert.Equal(UpdatePhase.Downloading, tracker.Status.Phase);
        tracker.DownloadCompleted();
        Assert.Equal(UpdatePhase.Ready, tracker.Status.Phase);
        Assert.True(tracker.Status.ShowBanner);
    }

    [Fact]
    public void DownloadIsIgnoredWhenNoUpdateAvailable()
    {
        var tracker = new UpdateStateTracker("1.0.0");
        var status = tracker.BeginDownload();
        Assert.Equal(UpdatePhase.Idle, status.Phase);
    }

    [Fact]
    public void CheckWhileDownloadingDoesNotResetState()
    {
        var tracker = new UpdateStateTracker("1.0.0");
        tracker.BeginCheck();
        tracker.CheckCompleted(true, "1.1.0");
        tracker.BeginDownload();
        var status = tracker.BeginCheck();
        Assert.Equal(UpdatePhase.Downloading, status.Phase);
    }

    [Fact]
    public void FailuresKeepNewVersionAndReportMessage()
    {
        var tracker = new UpdateStateTracker("1.0.0");
        tracker.BeginCheck();
        tracker.CheckCompleted(true, "1.1.0");
        tracker.BeginDownload();
        var status = tracker.DownloadFailed("network down");
        Assert.Equal(UpdatePhase.Error, status.Phase);
        Assert.Equal("1.1.0", status.NewVersion);
        Assert.Equal("network down", status.Message);
        Assert.False(status.ShowBanner);
    }

    [Fact]
    public void InstalledResetsToIdle()
    {
        var tracker = new UpdateStateTracker("1.0.0");
        tracker.BeginCheck();
        tracker.CheckCompleted(true, "1.1.0");
        var status = tracker.Installed();
        Assert.Equal(UpdatePhase.Idle, status.Phase);
        Assert.Null(status.NewVersion);
    }
}

public class UpdateSettingsStoreTests : IDisposable
{
    private readonly string directory;

    public UpdateSettingsStoreTests()
    {
        directory = Path.Combine(Path.GetTempPath(), "flowkey-update-tests-" + Guid.NewGuid().ToString("N"));
    }

    [Fact]
    public void MissingFileReturnsDefault()
    {
        var settings = UpdateSettingsStore.Load(directory);
        Assert.True(settings.AutoCheckEnabled);
        Assert.Null(settings.LastCheckedAtMs);
    }

    [Fact]
    public void SaveThenLoadRoundTrips()
    {
        UpdateSettingsStore.Save(directory, new UpdateSettings(false, 12345));
        var settings = UpdateSettingsStore.Load(directory);
        Assert.False(settings.AutoCheckEnabled);
        Assert.Equal(12345, settings.LastCheckedAtMs);
    }

    [Fact]
    public void CorruptFileFallsBackToDefault()
    {
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "update-settings.json"), "{ not json");
        var settings = UpdateSettingsStore.Load(directory);
        Assert.True(settings.AutoCheckEnabled);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(directory, true);
        }
        catch
        {
        }
    }
}
