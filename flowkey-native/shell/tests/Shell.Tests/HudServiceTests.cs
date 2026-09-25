using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class HudServiceTests
{
    private static Dictionary<string, JsonElement>? Params(string json)
    {
        if (json is null)
        {
            return null;
        }
        var element = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);
        return element;
    }

    [Fact]
    public void MissingOrEmptyTitleIsRejected()
    {
        Assert.False(HudService.TryParseRequest(Params(null), out _, out var error1));
        Assert.Equal("hud.show requires a non-empty string 'title' parameter", error1);

        Assert.False(HudService.TryParseRequest(Params("{}"), out _, out var error2));
        Assert.Equal("hud.show requires a non-empty string 'title' parameter", error2);

        Assert.False(HudService.TryParseRequest(Params("""{"title": 42}"""), out _, out var error3));
        Assert.Equal("hud.show requires a non-empty string 'title' parameter", error3);

        Assert.False(HudService.TryParseRequest(Params("""{"title": "   "}"""), out _, out var error4));
        Assert.Equal("hud.show requires a non-empty string 'title' parameter", error4);
    }

    [Fact]
    public void TitleOnlyRequestUsesDefaultDuration()
    {
        Assert.True(HudService.TryParseRequest(Params("""{"title": "Playing next track"}"""), out var request, out _));
        Assert.NotNull(request);
        Assert.Equal("Playing next track", request!.Title);
        Assert.Equal(HudService.DefaultDurationSeconds, request.DurationSeconds);
        Assert.Null(request.IconUri);
        Assert.Null(request.Emoji);
    }

    [Theory]
    [InlineData(0.5, 1)]
    [InlineData(1, 1)]
    [InlineData(6.5, 6.5)]
    [InlineData(10, 10)]
    [InlineData(60, 10)]
    public void DurationIsClampedToTheSupportedRange(double requested, double expected)
    {
        var json = $$"""{"title": "Copied", "duration": {{requested.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}""";
        Assert.True(HudService.TryParseRequest(Params(json), out var request, out _));
        Assert.Equal(expected, request!.DurationSeconds);
    }

    [Fact]
    public void NonNumericDurationIsRejected()
    {
        Assert.False(HudService.TryParseRequest(Params("""{"title": "Copied", "duration": "long"}"""), out _, out var error));
        Assert.Equal("hud.show 'duration' must be a number of seconds", error);
    }

    [Theory]
    [InlineData("""{"title": "A", "icon": "data:image/png;base64,AAAA"}""", "data:image/png;base64,AAAA", null)]
    [InlineData("""{"title": "A", "icon": "file:///icon-cache/x.png"}""", "file:///icon-cache/x.png", null)]
    [InlineData("""{"title": "A", "icon": "⏭️"}""", null, "⏭️")]
    public void IconClassifiesAsUriOrEmoji(string json, string? iconUri, string? emoji)
    {
        Assert.True(HudService.TryParseRequest(Params(json), out var request, out _));
        Assert.Equal(iconUri, request!.IconUri);
        Assert.Equal(emoji, request.Emoji);
    }
}
