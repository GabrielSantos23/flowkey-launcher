using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class FooterProtocolTests
{
    private static FooterState SampleState() => new(
        new FooterLeftState("command", "Now Playing", new FooterIconState("image", DataUri: "data:image/png;base64,AAA")),
        "Pause",
        ShowActionsHint: true,
        new FooterToastState("Copied", "answer.md", IsError: true));

    [Fact]
    public void SerializeStateEmitsCamelCasePayloadForThePage()
    {
        var json = FooterProtocol.SerializeState(SampleState());

        using var document = System.Text.Json.JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal("state", root.GetProperty("type").GetString());
        var left = root.GetProperty("left");
        Assert.Equal("command", left.GetProperty("kind").GetString());
        Assert.Equal("Now Playing", left.GetProperty("title").GetString());
        var icon = left.GetProperty("icon");
        Assert.Equal("image", icon.GetProperty("kind").GetString());
        Assert.Equal("data:image/png;base64,AAA", icon.GetProperty("dataUri").GetString());
        Assert.Equal("Pause", root.GetProperty("primaryTitle").GetString());
        Assert.True(root.GetProperty("showActionsHint").GetBoolean());
        var toast = root.GetProperty("toast");
        Assert.Equal("Copied", toast.GetProperty("title").GetString());
        Assert.Equal("answer.md", toast.GetProperty("detail").GetString());
        Assert.True(toast.GetProperty("isError").GetBoolean());
    }

    [Fact]
    public void SerializeStateOmitsNullToastAndTitle()
    {
        var json = FooterProtocol.SerializeState(new FooterState(
            new FooterLeftState("settings", null, null),
            null,
            ShowActionsHint: false,
            null));

        using var document = System.Text.Json.JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.False(root.TryGetProperty("toast", out _));
        Assert.False(root.TryGetProperty("primaryTitle", out _));
        Assert.Equal("settings", root.GetProperty("left").GetProperty("kind").GetString());
    }

    [Fact]
    public void SerializeStateOmitsIconForSettingsSlot()
    {
        var json = FooterProtocol.SerializeState(new FooterState(
            new FooterLeftState("settings", null, null),
            "Open",
            ShowActionsHint: true,
            null));

        using var document = System.Text.Json.JsonDocument.Parse(json);
        Assert.False(document.RootElement.GetProperty("left").TryGetProperty("icon", out _));
    }

    [Fact]
    public void ParseMessageReadsReady()
    {
        var parsed = FooterProtocol.ParseMessage("""{"type":"ready"}""");

        Assert.Equal(FooterMessageType.Ready, parsed.Type);
    }

    [Fact]
    public void ParseMessageReadsTheSettingsAction()
    {
        var parsed = FooterProtocol.ParseMessage("""{"type":"action","action":"settings"}""");

        Assert.Equal(FooterMessageType.Action, parsed.Type);
        Assert.Equal("settings", parsed.Action);
    }

    [Fact]
    public void ParseMessageReadsLog()
    {
        var parsed = FooterProtocol.ParseMessage("""{"type":"log","message":"boom"}""");

        Assert.Equal(FooterMessageType.Log, parsed.Type);
        Assert.Equal("boom", parsed.Message);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"type":"other"}""")]
    [InlineData("""{"type":"action"}""")]
    [InlineData("42")]
    public void ParseMessageRejectsMalformedAndUnknownPayloads(string json)
    {
        Assert.Equal(FooterMessageType.Unknown, FooterProtocol.ParseMessage(json).Type);
    }

    [Fact]
    public void ParseMessageToleratesNullAndEmpty()
    {
        Assert.Equal(FooterMessageType.Unknown, FooterProtocol.ParseMessage(null).Type);
        Assert.Equal(FooterMessageType.Unknown, FooterProtocol.ParseMessage("").Type);
    }
}
