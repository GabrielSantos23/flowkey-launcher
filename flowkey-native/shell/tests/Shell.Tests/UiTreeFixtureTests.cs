using System.IO;
using System.Text.Json;
using FlowKey.Shell.Protocol;
using Xunit;

namespace FlowKey.Shell.Tests;

public static class ContractPaths
{
    public static string ContractDir { get; } = FindContractDir();

    public static string UiFixture => Path.Combine(ContractDir, "ui-tree.fixture.json");

    public static string ProtocolFixture => Path.Combine(ContractDir, "protocol.fixture.json");

    public static string ManifestFixture => Path.Combine(ContractDir, "manifest.fixture.json");

    private static string FindContractDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "contract", "ui-tree.fixture.json");
            if (File.Exists(candidate))
            {
                return Path.Combine(dir.FullName, "contract");
            }
            dir = dir.Parent!;
        }
        throw new InvalidOperationException("contract directory not found above the test output");
    }
}

public class UiTreeFixtureTests
{
    private static JsonDocument UiFixture() =>
        JsonDocument.Parse(File.ReadAllText(ContractPaths.UiFixture));

    [Fact]
    public void ListFixtureDeserializesIntoListTree()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("list").GetRawText(), JsonOptions.Default);

        var list = Assert.IsType<ListTree>(tree);
        Assert.Equal("side-pane", list.Layout);
        Assert.Equal("All Types", list.Filter!.Options[0].Label);
        Assert.NotEmpty(list.Sections);
        Assert.Equal("No matches", list.EmptyView!.Title);
        foreach (var section in list.Sections)
        {
            Assert.NotEmpty(section.Items);
            foreach (var item in section.Items)
            {
                Assert.False(string.IsNullOrWhiteSpace(item.Id));
                Assert.NotNull(item.Actions);
                Assert.Contains(item.Actions!, a => a.Primary == true);
            }
        }
        Assert.Contains(list.Sections[0].Items[0].Actions!, a => a.Push == "album-songs:al1");
    }

    [Fact]
    public void ListFixtureCarriesSelectionPane()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("list").GetRawText(), JsonOptions.Default);

        var list = Assert.IsType<ListTree>(tree);
        var rocket = list.Sections[0].Items.Single(i => i.Id == "🚀");
        Assert.Equal("ship, launch", rocket.Pane!.Preview);
        Assert.Equal(["Source", "Type", "Characters"], rocket.Pane.Fields!.Select(f => f.Label).ToList());
        Assert.True(rocket.Pane.Fields[0].ValueIconUri!.StartsWith("data:image/png;base64,"));
        Assert.Null(list.Sections[0].Items[0].Pane);
    }

    [Fact]
    public void DetailFixtureDeserializesIntoDetailTree()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("detail").GetRawText(), JsonOptions.Default);

        var detail = Assert.IsType<DetailTree>(tree);
        Assert.Equal("🚀 Rocket", detail.Title);
        Assert.Equal("SpaceX mission", detail.Subtitle);
        Assert.Equal("file:///icon-cache/test.png", detail.ImageUri);
        Assert.NotEmpty(detail.Fields);
        Assert.Contains("**fast**", detail.Description);
        Assert.Contains(detail.Actions, a => a.Primary == true);
    }

    [Fact]
    public void GridFixtureDeserializesIntoGridTree()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("grid").GetRawText(), JsonOptions.Default);

        var grid = Assert.IsType<GridTree>(tree);
        Assert.Equal("Results", grid.Title);
        Assert.Equal(8, grid.Columns);
        Assert.NotNull(grid.Sections);
        Assert.Equal(2, grid.Sections!.Count);
        Assert.Equal("Smileys", grid.Sections[0].Title);
        Assert.Equal("2", grid.Sections[0].Subtitle);
        Assert.NotEmpty(grid.Sections[0].Items);
        Assert.Null(grid.Sections[0].Items[0].IconSvg);
        var lucide = grid.Sections[1].Items.Single(i => i.Id == "lucide-activity");
        Assert.Equal("activity", lucide.IconName);
        Assert.Equal("#EF4444", lucide.IconColor);
        var svg = grid.Sections[1].Items.Single(i => i.Id == "svg-heart");
        Assert.Contains("<svg", svg.IconSvg);
        Assert.NotNull(grid.Filter);
        Assert.Equal(2, grid.Filter!.Options.Count);
        Assert.Equal("Nothing here", grid.EmptyView!.Title);
    }

    [Fact]
    public void GridSvgIconParsesIntoGeometry()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("grid").GetRawText(), JsonOptions.Default);
        var grid = Assert.IsType<GridTree>(tree);
        var svg = grid.Sections![1].Items.Single(i => i.Id == "svg-heart");
        var geometry = Rendering.SvgIcon.FromContent(svg.IconSvg);
        Assert.NotNull(geometry);
        Assert.True(geometry!.Bounds.Width > 0);
        Assert.Null(Rendering.SvgIcon.FromContent(null));
        Assert.Null(Rendering.SvgIcon.FromContent(""));
        Assert.Null(Rendering.SvgIcon.FromContent("not svg at all"));
    }

    [Fact]
    public void ListItemsCarryKeywordsAccessoriesLoadingAndPlaceholder()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("list").GetRawText(), JsonOptions.Default);
        var list = Assert.IsType<ListTree>(tree);

        var rocket = list.Sections[0].Items.Single(i => i.Id == "🚀");
        Assert.Contains("rocket", rocket.Keywords!);
        Assert.Equal("Symbol", rocket.Accessories![0].Text);
        Assert.Equal("Unicode category", rocket.Accessories[0].Tooltip);
        Assert.Equal("secondary", rocket.Accessories[0].Color);
        Assert.Equal("success", rocket.Accessories[1].Color);
        Assert.False(list.IsLoading!.Value);
        Assert.Equal("Search symbols...", list.SearchBarPlaceholder);

        var grid = Assert.IsType<GridTree>(JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("grid").GetRawText(), JsonOptions.Default));
        Assert.True(grid.IsLoading!.Value);
        Assert.Equal("Search results...", grid.SearchBarPlaceholder);
    }

    [Fact]
    public void FormFixtureDeserializesIntoFormTree()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("form").GetRawText(), JsonOptions.Default);

        var form = Assert.IsType<FormTree>(tree);
        Assert.Equal("New note", form.Title);
        Assert.Equal(10, form.Fields.Count);
        Assert.Contains(form.Fields, f => f.Kind == "textfield" && f.Required == true);
        var vault = form.Fields.Single(f => f.Id == "vault");
        Assert.Equal(2, vault.Options!.Count);
        Assert.Equal("personal", vault.Default!.Value.GetString());
        var tags = form.Fields.Single(f => f.Id == "tags");
        Assert.Equal(["idea"], tags.Defaults);
        Assert.Contains(form.Actions, a => a.Primary == true);
        Assert.Equal("submit-1", form.SubmitActionId);
    }

    [Fact]
    public void ListTreesMayDeclarePagination()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("list").GetRawText(), JsonOptions.Default);
        var list = Assert.IsType<ListTree>(tree);

        Assert.True(list.Pagination!.HasNextPage);
        Assert.Equal("load-more-1", list.Pagination.MoreActionId);
        Assert.Equal(50, list.Pagination.PageSize);
    }

    [Fact]
    public void ActionsMayDeclareDestructiveStyleAndShortcutHint()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("list").GetRawText(), JsonOptions.Default);
        var list = Assert.IsType<ListTree>(tree);

        var remove = list.Sections[0].Items[0].Actions!.Single(a => a.Id == "remove");
        Assert.Equal("destructive", remove.Style);
        Assert.Equal("backspace", remove.Shortcut!.Key);
        Assert.Equal(["ctrl"], remove.Shortcut.Modifiers);
    }

    [Fact]
    public void DetailMetadataSupportsLinkTagsAndSeparatorVariants()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("detail").GetRawText(), JsonOptions.Default);
        var detail = Assert.IsType<DetailTree>(tree);

        var link = detail.Fields.Single(f => f.Label == "Repository");
        Assert.Equal("https://github.com/x/y", link.Href);
        var tags = detail.Fields.Single(f => f.Label == "Tags");
        Assert.Equal("tags", tags.Kind);
        Assert.Equal(["alpha", "beta"], tags.Tags);
        Assert.Equal("separator", detail.Fields[^1].Kind);
    }

    [Fact]
    public void ListFixtureCarriesOptionalKind()
    {
        var fixture = UiFixture();
        var tree = JsonSerializer.Deserialize<UiTree>(fixture.RootElement.GetProperty("list").GetRawText(), JsonOptions.Default);

        var list = Assert.IsType<ListTree>(tree);
        var rocket = list.Sections[0].Items.Single(i => i.Id == "🚀");
        Assert.Equal("Symbol", rocket.Kind);
        Assert.Equal("rocket", rocket.IconName);
        Assert.Equal("#8B5CF6", rocket.IconColor);
        Assert.Null(list.Sections[0].Items[0].Kind);
    }
}

public class ProtocolFixtureTests
{
    private static JsonElement Root() =>
        JsonDocument.Parse(File.ReadAllText(ContractPaths.ProtocolFixture)).RootElement;

    [Fact]
    public void ProtocolVersionIsOneEverywhere()
    {
        var root = Root();
        Assert.Equal(1, root.GetProperty("protocolVersion").GetInt32());
        Assert.Equal(ProtocolVersion.Current, root.GetProperty("protocolVersion").GetInt32());

        var init = root.GetProperty("hostToSidecar").GetProperty("init").Deserialize<InitMessage>(JsonOptions.Default)!;
        Assert.Equal(ProtocolVersion.Current, init.ProtocolVersion);
        Assert.False(string.IsNullOrWhiteSpace(init.ExtensionsDir));

        var ready = root.GetProperty("sidecarToHost").GetProperty("ready").Deserialize<ReadyMessage>(JsonOptions.Default)!;
        Assert.Equal(ProtocolVersion.Current, ready.ProtocolVersion);
    }

    [Fact]
    public void ReadyExtensionsDeclareNativeMethodsAndHttpHosts()
    {
        var ready = Root().GetProperty("sidecarToHost").GetProperty("ready").Deserialize<ReadyMessage>(JsonOptions.Default)!;

        var emoji = Assert.Single(ready.Extensions, e => e.Id == "emoji");
        Assert.Contains("clipboard.write", emoji.NativeMethods);
        Assert.Empty(emoji.HttpHosts);
        Assert.NotEmpty(emoji.Commands);
    }

    [Fact]
    public void ReadyExtensionsMayDeclareOauthProviders()
    {
        var ready = Root().GetProperty("sidecarToHost").GetProperty("ready").Deserialize<ReadyMessage>(JsonOptions.Default)!;

        var emoji = Assert.Single(ready.Extensions, e => e.Id == "emoji");
        Assert.NotNull(emoji.OAuth);
        Assert.Empty(emoji.OAuth!);
    }

    [Fact]
    public void SearchAndActionCarryRequestAndExtensionIds()
    {
        var root = Root();
        var search = root.GetProperty("hostToSidecar").GetProperty("search").Deserialize<SearchMessage>(JsonOptions.Default)!;
        var action = root.GetProperty("hostToSidecar").GetProperty("action").Deserialize<ActionMessage>(JsonOptions.Default)!;

        Assert.False(string.IsNullOrWhiteSpace(search.RequestId));
        Assert.Equal("emoji", search.ExtensionId);
        Assert.False(string.IsNullOrWhiteSpace(action.RequestId));
        Assert.Equal("emoji", action.ExtensionId);
        Assert.False(string.IsNullOrWhiteSpace(action.Item!.Id));
        Assert.Equal("push", action.Arguments!["direction"]);
    }

    [Fact]
    public void SearchMayCarryCommandId()
    {
        var search = Root().GetProperty("hostToSidecar").GetProperty("searchWithCommand").Deserialize<SearchMessage>(JsonOptions.Default)!;
        Assert.Equal("open", search.CommandId);
        Assert.Equal("clipboard-history", search.ExtensionId);
    }

    [Fact]
    public void SearchMayCarryFilterValue()
    {
        var search = Root().GetProperty("hostToSidecar").GetProperty("searchWithCommand").Deserialize<SearchMessage>(JsonOptions.Default)!;
        Assert.Equal("all", search.FilterValue);
    }

    [Fact]
    public void NativeResultExamplesCoverOkAndErrorVariants()
    {
        var root = Root();

        var ok = root.GetProperty("hostToSidecar").GetProperty("nativeResultOk").Deserialize<NativeResultMessage>(JsonOptions.Default)!;
        Assert.Equal("nativeResult", ok.Type);
        Assert.True(ok.Ok);
        Assert.NotNull(ok.Result);

        var failure = root.GetProperty("hostToSidecar").GetProperty("nativeResultError").Deserialize<NativeResultMessage>(JsonOptions.Default)!;
        Assert.Equal("nativeResult", failure.Type);
        Assert.False(failure.Ok);
        Assert.NotNull(failure.Error);
        Assert.Equal("hostNotAllowed", failure.Error!.Code);
        Assert.False(string.IsNullOrWhiteSpace(failure.Error.Message));
    }

    [Fact]
    public void CommandsMayDeclareKeywordsAndMode()
    {
        var ready = Root().GetProperty("sidecarToHost").GetProperty("ready").Deserialize<ReadyMessage>(JsonOptions.Default)!;
        var command = ready.Extensions[0].Commands[0];
        Assert.Contains("emoji", command.Keywords!);
        Assert.Equal("view", command.Mode);
        Assert.Equal("smile", command.Icon);
        Assert.Equal("#4F8CFF", command.IconColor);
    }

    [Fact]
    public void ReadyMayDeclarePreferenceSchema()
    {
        var ready = Root().GetProperty("sidecarToHost").GetProperty("ready").Deserialize<ReadyMessage>(JsonOptions.Default)!;
        var schema = ready.Extensions[0].Preferences![0];
        Assert.Equal("skinTone", schema.Name);
        Assert.Equal("dropdown", schema.Type);
        Assert.NotEmpty(schema.Options!);
    }

    [Fact]
    public void AckCarriesRequestIdOnly()
    {
        var ack = Root().GetProperty("sidecarToHost").GetProperty("ack").Deserialize<AckMessage>(JsonOptions.Default)!;
        Assert.Equal("ack", ack.Type);
        Assert.False(string.IsNullOrWhiteSpace(ack.RequestId));
    }

    [Fact]
    public void NativeCallCarriesExtensionId()
    {
        var root = Root();
        var call = root.GetProperty("sidecarToHost").GetProperty("nativeCall").Deserialize<NativeCallMessage>(JsonOptions.Default)!;

        Assert.Equal("emoji", call.ExtensionId);
        Assert.Equal("clipboard.write", call.Method);
        Assert.NotNull(call.Params);

        var denied = root.GetProperty("sidecarToHost").GetProperty("nativeCallDenied").Deserialize<NativeCallMessage>(JsonOptions.Default)!;
        Assert.Equal("emoji", denied.ExtensionId);
        Assert.Equal("http.fetch", denied.Method);
    }

    [Fact]
    public void WebViewAndWebBridgeMessagesFollowWireShape()
    {
        var root = Root();

        var mount = root.GetProperty("sidecarToHost").GetProperty("webView").Deserialize<WebViewMessage>(JsonOptions.Default)!;
        Assert.Equal("webView", mount.Type);
        Assert.Equal("speedtest", mount.ExtensionId);
        Assert.Equal("test", mount.CommandId);
        Assert.Equal("main.web.js", mount.Entry);
        Assert.Equal("view", mount.Props.Environment.CommandMode);
        Assert.Equal("C:/notes", mount.Props.Preferences["vaultPath"].GetString());

        var call = root.GetProperty("hostToSidecar").GetProperty("webCall").Deserialize<WebCallMessage>(JsonOptions.Default)!;
        Assert.Equal("webCall", call.Type);
        Assert.Equal("w-1", call.BridgeId);
        Assert.Equal("http.fetch", call.Method);
        Assert.Equal(20000, call.TimeoutMs);
        Assert.True(call.Params!["discardBody"].GetBoolean());

        var result = root.GetProperty("sidecarToHost").GetProperty("webResult").Deserialize<WebResultMessage>(JsonOptions.Default)!;
        Assert.Equal("webResult", result.Type);
        Assert.True(result.Ok);
        Assert.Equal(4000000, result.Result!.Value.GetProperty("bytesReceived").GetInt64());

        var abort = root.GetProperty("hostToSidecar").GetProperty("webAbort").Deserialize<WebAbortMessage>(JsonOptions.Default)!;
        Assert.Equal("webAbort", abort.Type);
        Assert.Equal("w-1", abort.BridgeId);
    }

    [Fact]
    public void WindowCommandAndLaunchCommandCarryAttribution()
    {
        var root = Root();

        var windowCommand = root.GetProperty("sidecarToHost").GetProperty("windowCommand").Deserialize<WindowCommandMessage>(JsonOptions.Default)!;
        Assert.Equal("windowCommand", windowCommand.Type);
        Assert.Equal("demo-ext", windowCommand.ExtensionId);
        Assert.Equal("closeMainWindow", windowCommand.Command);

        var launch = root.GetProperty("sidecarToHost").GetProperty("launchCommand").Deserialize<LaunchCommandMessage>(JsonOptions.Default)!;
        Assert.Equal("launchCommand", launch.Type);
        Assert.Equal("demo-ext", launch.ExtensionId);
        Assert.Equal("open", launch.CommandId);
        Assert.Equal("notes", launch.Query);
    }

    [Fact]
    public void ToastAndAlertNativeCallsFollowWireShape()
    {
        var root = Root();

        var toast = root.GetProperty("sidecarToHost").GetProperty("nativeCallToast").Deserialize<NativeCallMessage>(JsonOptions.Default)!;
        Assert.Equal("toast.show", toast.Method);
        Assert.Equal("Saved", toast.Params!["title"].GetString());
        Assert.Equal("success", toast.Params!["style"].GetString());

        var alert = root.GetProperty("sidecarToHost").GetProperty("nativeCallAlert").Deserialize<NativeCallMessage>(JsonOptions.Default)!;
        Assert.Equal("alert.confirm", alert.Method);
        Assert.Equal("Delete note?", alert.Params!["title"].GetString());
        Assert.True(alert.Params!["destructive"].GetBoolean());
    }

    [Fact]
    public void ErrorCarriesCodeAndMessage()
    {
        var error = Root().GetProperty("sidecarToHost").GetProperty("error").Deserialize<ErrorMessage>(JsonOptions.Default)!;

        Assert.False(string.IsNullOrWhiteSpace(error.Error.Code));
        Assert.False(string.IsNullOrWhiteSpace(error.Error.Message));
    }

    [Fact]
    public void UiPushCarriesViewStateAndTreeWithoutRequestId()
    {
        var push = Root().GetProperty("sidecarToHost").GetProperty("uiPush").Deserialize<UiPushMessage>(JsonOptions.Default)!;

        Assert.Equal("uiPush", push.Type);
        Assert.Equal("clipboard-history", push.ExtensionId);
        Assert.Equal("open", push.CommandId);
        Assert.Equal("par", push.Query);
        Assert.Equal("all", push.FilterValue);
        var list = Assert.IsType<ListTree>(push.Tree);
        Assert.NotEmpty(list.Sections);
        Assert.NotEmpty(list.Sections[0].Items);
    }
}
