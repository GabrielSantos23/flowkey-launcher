using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class SettingsProtocolTests
{
    private static SettingsState SampleState() => new(
        Nav: [new SettingsNavItem("general", "General", null)],
        General: new SettingsGeneralState(true, "Ctrl+Alt+Space", false),
        Extensions: new SettingsExtensionsState(
            [new SettingsFailureRow("broken", "manifest invalid")],
            [new SettingsInstalledRow("demo", "Demo", "1.0.0", true)]),
        About: new SettingsAboutState("1.2.3", 2),
        Update: new SettingsUpdateStatus("idle", "Last checked automatically every 6 hours"),
        Details: new Dictionary<string, SettingsExtensionDetail>(StringComparer.Ordinal)
        {
            ["demo"] = new SettingsExtensionDetail(
                "demo", "Demo", null, "1.0.0", null,
                IsZipInstalled: false, ZipEnabled: false, InstalledAt: null,
                OAuth: [new SettingsOAuthRow("spotify", "checking", null)],
                Preferences: [], AppChoices: [], Commands: []),
        },
        PendingInstall: null,
        PendingReconsent: new SettingsPendingConsent(
            "reconsent", "demo", "Demo", "1.0.0", null,
            NativeMethods: [], HttpHosts: [], OAuth: ["spotify"], FsPaths: [], UriSchemes: [],
            HasWebUi: false, ManifestWarnings: []),
        Capture: new SettingsCaptureState("summon", null));

    [Fact]
    public void SerializeStateEmitsCamelCaseNestedPayload()
    {
        var json = SettingsProtocol.SerializeState(SampleState());
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal("state", root.GetProperty("type").GetString());
        var state = root.GetProperty("state");
        Assert.Equal("Ctrl+Alt+Space", state.GetProperty("general").GetProperty("summonHotkey").GetString());
        Assert.True(state.GetProperty("extensions").GetProperty("installed")[0].GetProperty("enabled").GetBoolean());
        Assert.Equal("summon", state.GetProperty("capture").GetProperty("scope").GetString());
        // camelCase policy alone would produce "oAuth" for the OAuth
        // properties — the wire name is pinned to "oauth" (JsonPropertyName)
        // because the settings page reads detail.oauth / pending.oauth.
        Assert.True(state.GetProperty("details").GetProperty("demo").TryGetProperty("oauth", out _));
        Assert.False(state.GetProperty("details").GetProperty("demo").TryGetProperty("oAuth", out _));
        Assert.True(state.GetProperty("pendingReconsent").TryGetProperty("oauth", out _));
    }

    [Fact]
    public void SerializeInvokeResultRoundTrips()
    {
        var ok = JsonDocument.Parse(SettingsProtocol.SerializeInvokeResult("s1", true, result: new { path = "C:\\x" })).RootElement;
        Assert.Equal("invokeResult", ok.GetProperty("type").GetString());
        Assert.Equal("s1", ok.GetProperty("id").GetString());
        Assert.True(ok.GetProperty("ok").GetBoolean());
        Assert.Equal("C:\\x", ok.GetProperty("result").GetProperty("path").GetString());

        var failed = JsonDocument.Parse(SettingsProtocol.SerializeInvokeResult("s2", false, error: "nope")).RootElement;
        Assert.False(failed.GetProperty("ok").GetBoolean());
        Assert.Equal("nope", failed.GetProperty("error").GetString());
    }

    [Fact]
    public void SerializeThemeWrapsCss()
    {
        var json = SettingsProtocol.SerializeTheme(":root { --x: 1; }");
        var root = JsonDocument.Parse(json).RootElement;
        Assert.Equal("theme", root.GetProperty("type").GetString());
        Assert.Contains("--x", root.GetProperty("css").GetString());
    }

    [Fact]
    public void ParseMessageUnderstandsReadyInvokeLog()
    {
        var ready = SettingsProtocol.ParseMessage("""{"type":"ready"}""");
        Assert.Equal(SettingsMessageType.Ready, ready.Type);

        var invoke = SettingsProtocol.ParseMessage(
            """{"type":"invoke","id":"s7","op":"setOpenAtLogin","params":{"enabled":true}}""");
        Assert.Equal(SettingsMessageType.Invoke, invoke.Type);
        Assert.Equal("s7", invoke.Id);
        Assert.Equal("setOpenAtLogin", invoke.Op);
        Assert.True(invoke.Params.GetProperty("enabled").GetBoolean());

        var log = SettingsProtocol.ParseMessage("""{"type":"log","message":"boom"}""");
        Assert.Equal(SettingsMessageType.Log, log.Type);
        Assert.Equal("boom", log.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("[1,2,3]")]
    [InlineData("""{"type":"unknown"}""")]
    public void MalformedMessagesParseAsUnknown(string json) =>
        Assert.Equal(SettingsMessageType.Unknown, SettingsProtocol.ParseMessage(json).Type);
}
