using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class WebViewProtocolTests
{
    private const string Entry = "app.web.js";

    private static string Path(params string[] parts) =>
        System.IO.Path.Combine(parts);

    [Fact]
    public void PrefersFirstPartyDistWhenItContainsTheEntry()
    {
        var firstParty = Path("repo", "extensions");
        var installed = Path("appdata", "extensions");
        bool Exists(string path) =>
            path == Path(firstParty, "spotify", "dist", Entry);

        var folder = WebViewProtocol.ResolveExtensionBundleFolder(
            "spotify", Entry, installed, firstParty, Exists);

        Assert.Equal(Path(firstParty, "spotify", "dist"), folder);
    }

    [Fact]
    public void FallsBackToFirstPartyRootWhenEntrySitsBesideTheManifest()
    {
        var firstParty = Path("repo", "extensions");
        bool Exists(string path) =>
            path == Path(firstParty, "spotify", Entry);

        var folder = WebViewProtocol.ResolveExtensionBundleFolder(
            "spotify", Entry, Path("appdata", "extensions"), firstParty, Exists);

        Assert.Equal(Path(firstParty, "spotify"), folder);
    }

    [Fact]
    public void UsesInstalledFolderWhenTheExtensionIsNotFirstParty()
    {
        var installed = Path("appdata", "extensions");
        bool Exists(string path) => path == Path(installed, "speedtest", Entry);

        var folder = WebViewProtocol.ResolveExtensionBundleFolder(
            "speedtest", Entry, installed, Path("repo", "extensions"), Exists);

        Assert.Equal(Path(installed, "speedtest"), folder);
    }

    [Fact]
    public void FirstPartyWinsOverInstalledSoDevBundlesStayFresh()
    {
        var firstParty = Path("repo", "extensions");
        var installed = Path("appdata", "extensions");
        bool Exists(string _) => true;

        var folder = WebViewProtocol.ResolveExtensionBundleFolder(
            "spotify", Entry, installed, firstParty, Exists);

        Assert.Equal(Path(firstParty, "spotify", "dist"), folder);
    }

    [Fact]
    public void FallsBackToInstalledFolderWhenNothingContainsTheEntry()
    {
        var installed = Path("appdata", "extensions");
        var folder = WebViewProtocol.ResolveExtensionBundleFolder(
            "spotify", Entry, installed, null, _ => false);

        Assert.Equal(Path(installed, "spotify"), folder);
    }

    [Fact]
    public void HostPageUrlCarriesExtensionAndEntry()
    {
        var url = WebViewProtocol.BuildHostPageUrl("spotify", "app.web.js");
        Assert.Equal("https://app.flowkey.local/webhost.html?ext=spotify&entry=app.web.js", url);
    }

    [Fact]
    public void SerializePropsEmitsCamelCaseEnvironmentForThePage()
    {
        var message = new Protocol.WebViewMessage
        {
            ExtensionId = "spotify",
            CommandId = "now-playing",
            Entry = "app.web.js",
            Props = new Protocol.WebViewProps
            {
                Query = "daft",
                FilterValue = "artists",
                Environment = new Protocol.ExtensionEnvironment
                {
                    ExtensionId = "spotify",
                    CommandId = "now-playing",
                    CommandMode = "view",
                },
            },
        };

        var json = WebViewProtocol.SerializeProps(message);

        using var document = System.Text.Json.JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal("props", root.GetProperty("type").GetString());
        Assert.Equal("daft", root.GetProperty("query").GetString());
        Assert.Equal("artists", root.GetProperty("filterValue").GetString());
        // the page reads camelCase property names — PascalCase would make
        // every web command look like the default (search) screen
        var environment = root.GetProperty("environment");
        Assert.Equal("spotify", environment.GetProperty("extensionId").GetString());
        Assert.Equal("now-playing", environment.GetProperty("commandId").GetString());
        Assert.Equal("view", environment.GetProperty("commandMode").GetString());
    }

    [Fact]
    public void ExtensionScriptUrlIsScopedToTheVirtualHostRoot()
    {
        var url = WebViewProtocol.BuildExtensionScriptUrl("spotify", "app.web.js");
        Assert.Equal("https://extensions.flowkey.local/app.web.js", url);
    }

    [Fact]
    public void ParseMessageExtractsCallTimeout()
    {
        var parsed = WebViewProtocol.ParseMessage(
            """{"type":"webCall","bridgeId":"w-1","extensionId":"spotify","method":"oauth.authorize","timeoutMs":150000,"params":{"provider":"spotify"}}""");

        Assert.Equal(WebViewProtocol.WebMessageType.Call, parsed.Type);
        Assert.Equal("w-1", parsed.BridgeId);
        Assert.Equal("spotify", parsed.ExtensionId);
        Assert.Equal("oauth.authorize", parsed.Method);
        Assert.Equal(150000, parsed.TimeoutMs);
    }

    [Fact]
    public void ParseMessageToleratesMissingOrMalformedTimeout()
    {
        var without = WebViewProtocol.ParseMessage(
            """{"type":"webCall","bridgeId":"w-2","extensionId":"spotify","method":"media.current"}""");
        Assert.Null(without.TimeoutMs);

        var malformed = WebViewProtocol.ParseMessage(
            """{"type":"webCall","bridgeId":"w-3","extensionId":"spotify","method":"media.current","timeoutMs":"soon"}""");
        Assert.Null(malformed.TimeoutMs);
    }

    [Fact]
    public void RewriteArtworkFileUrisMapsCachedArtworkToTheArtHost()
    {
        var cacheRoot = System.IO.Path.Combine(@"C:", "appdata", "icon-cache", "images");
        var json = System.Text.Json.JsonSerializer.Serialize(new
        {
            ok = true,
            uri = new Uri(System.IO.Path.Combine(cacheRoot, "spotify", "abc123.png")).AbsoluteUri,
        });

        var rewritten = WebViewProtocol.RewriteArtworkFileUris(json, cacheRoot);

        Assert.Contains("https://art.flowkey.local/spotify/abc123.png", rewritten);
        Assert.DoesNotContain("file:", rewritten);
    }

    [Fact]
    public void RewriteArtworkFileUrisLeavesOtherStringsUntouched()
    {
        var cacheRoot = System.IO.Path.Combine(@"C:", "appdata", "icon-cache", "images");
        var json = System.Text.Json.JsonSerializer.Serialize(new
        {
            ok = true,
            uri = "https://i.scdn.co/cover.jpg",
            other = new Uri(@"C:\somewhere\else.png").AbsoluteUri,
            items = new[] { "https://x/y.png" },
        });

        var rewritten = WebViewProtocol.RewriteArtworkFileUris(json, cacheRoot);

        Assert.Contains("https://i.scdn.co/cover.jpg", rewritten);
        Assert.Contains("somewhere", rewritten);
        Assert.DoesNotContain("art.flowkey.local", rewritten);
    }

    [Fact]
    public void RewriteArtworkFileUrisToleratesNullAndEmptyInput()
    {
        Assert.Null(WebViewProtocol.RewriteArtworkFileUris(null, @"C:\cache"));
        Assert.Equal("", WebViewProtocol.RewriteArtworkFileUris("", @"C:\cache"));
    }

    [Fact]
    public void ParseViewStateReadsPrimaryActionFiltersAndFlags()
    {
        var json = """
            {"type":"viewState","primaryTitle":"Pause","canGoBack":true,"hasActions":true,"paletteOpen":true,
             "filters":[{"value":"all","label":"All"},{"value":"artists","label":"Artists"}]}
            """;

        var state = WebViewProtocol.ParseViewState(json);

        Assert.NotNull(state);
        Assert.Equal("Pause", state!.PrimaryTitle);
        Assert.True(state.CanGoBack);
        Assert.True(state.HasActions);
        Assert.True(state.PaletteOpen);
        Assert.Equal(2, state.Filters!.Count);
        Assert.Equal("artists", state.Filters[1].Value);
        Assert.Equal("Artists", state.Filters[1].Label);
    }

    [Fact]
    public void ParseViewStateToleratesMinimalAndMalformedPayloads()
    {
        var minimal = WebViewProtocol.ParseViewState("""{"type":"viewState"}""");
        Assert.NotNull(minimal);
        Assert.Equal("", minimal!.PrimaryTitle);
        Assert.False(minimal.CanGoBack);
        Assert.False(minimal.HasActions);
        Assert.False(minimal.PaletteOpen);
        Assert.Null(minimal.Filters);

        Assert.Null(WebViewProtocol.ParseViewState("not json"));
        Assert.Equal("primary", WebViewProtocol.ParseViewAction("""{"type":"pageAction","action":"primary"}"""));
        Assert.Equal("openPalette", WebViewProtocol.ParseViewAction("""{"type":"pageAction","action":"openPalette"}"""));
        Assert.Null(WebViewProtocol.ParseViewAction("""{"type":"other"}"""));
        Assert.Null(WebViewProtocol.ParseViewAction("not json"));
    }

    [Fact]
    public void ParseViewStateReadsTheSearchPlaceholderAndTheSelectionTitle()
    {
        var json = """
            {"type":"viewState","primaryTitle":"Paste","searchPlaceholder":"Search Emoji & Symbols...",
             "selectionTitle":"Upside-Down Face"}
            """;

        var state = WebViewProtocol.ParseViewState(json);

        Assert.NotNull(state);
        Assert.Equal("Search Emoji & Symbols...", state!.SearchPlaceholder);
        Assert.Equal("Upside-Down Face", state.SelectionTitle);
    }

    [Fact]
    public void ParseViewStateToleratesMissingPlaceholderAndSelection()
    {
        var state = WebViewProtocol.ParseViewState("""{"type":"viewState","primaryTitle":"Paste"}""");

        Assert.NotNull(state);
        Assert.Null(state!.SearchPlaceholder);
        Assert.Null(state.SelectionTitle);
    }

    [Theory]
    [InlineData("moveUp")]
    [InlineData("moveDown")]
    [InlineData("pageUp")]
    [InlineData("pageDown")]
    public void ParseViewActionAcceptsTheScrollActionsTheSearchBoxForwards(string action)
    {
        Assert.Equal(action, WebViewProtocol.ParseViewAction($$"""{"type":"pageAction","action":"{{action}}"}"""));
    }
}
