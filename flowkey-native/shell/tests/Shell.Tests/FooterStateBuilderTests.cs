using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class FooterStateBuilderTests
{
    private static FooterInput Input(
        bool webViewVisible = false,
        WebViewProtocol.WebViewState? webViewState = null,
        int depth = 1,
        string? topExtensionId = null,
        FooterExtensionInfo? topExtension = null,
        string? topCommandId = null,
        FooterIconState? commandIcon = null,
        string? nativePrimaryActionTitle = null,
        string? selectedItemTitle = null,
        FooterToastState? toast = null) =>
        new(
            webViewVisible,
            webViewState,
            depth,
            topExtensionId,
            topExtension,
            topCommandId,
            commandIcon,
            nativePrimaryActionTitle,
            selectedItemTitle,
            toast);

    private static FooterExtensionInfo Spotify() => new(
        "spotify",
        "Spotify",
        new Dictionary<string, string> { ["now-playing"] = "Now Playing", ["search"] = "Search" });

    [Fact]
    public void RootViewShowsSettingsGear()
    {
        var state = FooterStateBuilder.Build(Input());

        Assert.Equal("settings", state.Left.Kind);
        Assert.Null(state.Left.Title);
    }

    [Fact]
    public void CommandLevelShowsExtensionIdentity()
    {
        var state = FooterStateBuilder.Build(Input(
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify()));

        Assert.Equal("command", state.Left.Kind);
        Assert.Equal("Spotify", state.Left.Title);
    }

    [Fact]
    public void CommandTitleWinsOverExtensionName()
    {
        var state = FooterStateBuilder.Build(Input(
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify(),
            topCommandId: "now-playing"));

        Assert.Equal("Now Playing", state.Left.Title);
    }

    [Fact]
    public void SelectedItemTitleIsAppendedInNativeBranch()
    {
        var state = FooterStateBuilder.Build(Input(
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify(),
            selectedItemTitle: "Daft Punk"));

        Assert.Equal("Spotify – Daft Punk", state.Left.Title);
    }

    [Fact]
    public void WebViewBranchAppendsTheSelectionTitleThePageReports()
    {
        // a web page reports its own selection through the view state, so the
        // footer's left slot reads the same as it does for native views
        var state = FooterStateBuilder.Build(Input(
            webViewVisible: true,
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify(),
            selectedItemTitle: "Daft Punk"));

        Assert.Equal("Spotify – Daft Punk", state.Left.Title);
    }

    [Fact]
    public void WebViewBranchWithoutASelectionKeepsTheCommandIdentity()
    {
        var state = FooterStateBuilder.Build(Input(
            webViewVisible: true,
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify()));

        Assert.Equal("Spotify", state.Left.Title);
    }

    [Fact]
    public void WebViewBranchUsesReportedPrimaryTitle()
    {
        var state = FooterStateBuilder.Build(Input(
            webViewVisible: true,
            webViewState: new WebViewProtocol.WebViewState("Pause", CanGoBack: false, HasActions: true, Filters: null),
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify()));

        Assert.Equal("Pause", state.PrimaryTitle);
    }

    [Fact]
    public void NativeBranchUsesSelectedPrimaryAction()
    {
        var state = FooterStateBuilder.Build(Input(
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify(),
            nativePrimaryActionTitle: "Open"));

        Assert.Equal("Open", state.PrimaryTitle);
    }

    [Fact]
    public void WebViewBranchShowsActionsHintOnlyWhenReported()
    {
        var without = FooterStateBuilder.Build(Input(
            webViewVisible: true,
            webViewState: new WebViewProtocol.WebViewState("", CanGoBack: false, HasActions: false, Filters: null),
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify()));
        Assert.False(without.ShowActionsHint);

        var with = FooterStateBuilder.Build(Input(
            webViewVisible: true,
            webViewState: new WebViewProtocol.WebViewState("Pause", CanGoBack: false, HasActions: true, Filters: null),
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify()));
        Assert.True(with.ShowActionsHint);
    }

    [Fact]
    public void NativeBranchAlwaysShowsActionsHint()
    {
        var state = FooterStateBuilder.Build(Input(
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify()));

        Assert.True(state.ShowActionsHint);
    }

    [Fact]
    public void EmptyPrimaryTitleYieldsNull()
    {
        var web = FooterStateBuilder.Build(Input(
            webViewVisible: true,
            webViewState: new WebViewProtocol.WebViewState("", CanGoBack: false, HasActions: false, Filters: null),
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify()));
        Assert.Null(web.PrimaryTitle);

        var native = FooterStateBuilder.Build(Input());
        Assert.Null(native.PrimaryTitle);
    }

    [Fact]
    public void MissingExtensionAtCommandLevelKeepsCommandSlotWithEmptyTitle()
    {
        var state = FooterStateBuilder.Build(Input(
            depth: 2,
            topExtensionId: "gone",
            topExtension: null,
            topCommandId: "now-playing"));

        Assert.Equal("command", state.Left.Kind);
        Assert.Equal("", state.Left.Title);
    }

    [Fact]
    public void CommandIconPassesThroughOnCommandLevelOnly()
    {
        var icon = new FooterIconState("image", DataUri: "data:image/png;base64,AAA");

        var command = FooterStateBuilder.Build(Input(
            depth: 2,
            topExtensionId: "spotify",
            topExtension: Spotify(),
            commandIcon: icon));
        Assert.Equal(icon, command.Left.Icon);

        var root = FooterStateBuilder.Build(Input(commandIcon: icon));
        Assert.Null(root.Left.Icon);
    }

    [Fact]
    public void ToastPassesThrough()
    {
        var toast = new FooterToastState("Copied", "answer.md", IsError: false);

        var state = FooterStateBuilder.Build(Input(toast: toast));

        Assert.Equal(toast, state.Toast);
    }

    [Fact]
    public void RootViewIgnoresSelectionAndPrimaryTitle()
    {
        var state = FooterStateBuilder.Build(Input(
            selectedItemTitle: "Daft Punk",
            nativePrimaryActionTitle: "Open"));

        Assert.Equal("settings", state.Left.Kind);
        Assert.Equal("Open", state.PrimaryTitle);
        Assert.True(state.ShowActionsHint);
    }
}
