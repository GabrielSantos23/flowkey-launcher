using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class ToastServiceTests
{
    private static Dictionary<string, JsonElement> Params(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void ParsesTitleMessageStyleAndDuration()
    {
        var ok = ToastService.TryParseRequest(
            Params("""{"title":"Saved","message":"Note stored","style":"failure","duration":2.5}"""),
            out var request,
            out var error);

        Assert.True(ok);
        Assert.Null(error);
        Assert.Equal("Saved", request!.Title);
        Assert.Equal("Note stored", request.Message);
        Assert.Equal(ToastStyle.Failure, request.Style);
        Assert.Equal(2.5, request.DurationSeconds);
    }

    [Fact]
    public void DefaultsToNeutralStyleAndDefaultDuration()
    {
        var ok = ToastService.TryParseRequest(Params("""{"title":"Copied"}"""), out var request, out var error);

        Assert.True(ok);
        Assert.Null(error);
        Assert.Equal("Copied", request!.Title);
        Assert.Null(request.Message);
        Assert.Equal(ToastStyle.Neutral, request.Style);
        Assert.Equal(HudService.DefaultDurationSeconds, request.DurationSeconds);
    }

    [Fact]
    public void ClampsDurationIntoHudBounds()
    {
        var ok = ToastService.TryParseRequest(Params("""{"title":"t","duration":100}"""), out var request, out _);

        Assert.True(ok);
        Assert.Equal(HudService.MaxDurationSeconds, request!.DurationSeconds);
    }

    [Fact]
    public void RejectsMissingOrBlankTitle()
    {
        Assert.False(ToastService.TryParseRequest(Params("{}"), out _, out var error));
        Assert.Contains("title", error);
        Assert.False(ToastService.TryParseRequest(Params("""{"title":"   "}"""), out _, out var blankError));
        Assert.Contains("title", blankError);
    }

    [Fact]
    public void RejectsUnknownStyle()
    {
        Assert.False(ToastService.TryParseRequest(Params("""{"title":"t","style":"pulsating"}"""), out _, out var error));
        Assert.Contains("style", error);
    }

    [Fact]
    public void AcceptsEmojiAndUriIconsLikeHud()
    {
        var ok = ToastService.TryParseRequest(
            Params("""{"title":"t","icon":"🎉"}"""), out var emojiRequest, out _);
        Assert.True(ok);
        Assert.Equal("🎉", emojiRequest!.Emoji);

        var uriOk = ToastService.TryParseRequest(
            Params("""{"title":"t","icon":"file:///cache/x.png"}"""), out var uriRequest, out _);
        Assert.True(uriOk);
        Assert.Equal("file:///cache/x.png", uriRequest!.IconUri);
    }
}

public class AlertServiceTests
{
    private static Dictionary<string, JsonElement> Params(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void ParsesTitleMessageButtonsAndDestructiveFlag()
    {
        var ok = AlertService.TryParseRequest(
            Params("""
                {"title":"Delete note?","message":"This cannot be undone.","confirmTitle":"Delete","cancelTitle":"Keep","destructive":true}
                """),
            out var request,
            out var error);

        Assert.True(ok);
        Assert.Null(error);
        Assert.Equal("Delete note?", request!.Title);
        Assert.Equal("This cannot be undone.", request.Message);
        Assert.Equal("Delete", request.ConfirmTitle);
        Assert.Equal("Keep", request.CancelTitle);
        Assert.True(request.Destructive);
    }

    [Fact]
    public void AppliesDefaultButtonTitles()
    {
        var ok = AlertService.TryParseRequest(Params("""{"title":"Continue?"}"""), out var request, out var error);

        Assert.True(ok);
        Assert.Null(error);
        Assert.Equal("OK", request!.ConfirmTitle);
        Assert.Equal("Cancel", request.CancelTitle);
        Assert.False(request.Destructive);
    }

    [Fact]
    public void RejectsMissingOrBlankTitle()
    {
        Assert.False(AlertService.TryParseRequest(Params("{}"), out _, out var error));
        Assert.Contains("title", error);
        Assert.False(AlertService.TryParseRequest(Params("""{"title":"  "}"""), out _, out var blankError));
        Assert.Contains("title", blankError);
    }

    [Fact]
    public void RejectsNonBooleanDestructive()
    {
        Assert.False(AlertService.TryParseRequest(Params("""{"title":"t","destructive":"yes"}"""), out _, out var error));
        Assert.Contains("destructive", error);
    }
}
