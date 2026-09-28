namespace FlowKey.Shell.Native;

/// <summary>
/// Everything the footer surface renders, produced by <see cref="FooterStateBuilder"/>
/// and consumed by the WebView2 footer page (via <see cref="FooterProtocol"/>) and by
/// the native fallback layout alike.
/// </summary>
public sealed record FooterState(
    FooterLeftState Left,
    string? PrimaryTitle,
    bool ShowActionsHint,
    FooterToastState? Toast);

public sealed record FooterLeftState(string Kind, string? Title, FooterIconState? Icon);

/// <summary>Icon payload renderable in the footer page: emoji text or a rasterized PNG data URI.</summary>
public sealed record FooterIconState(string Kind, string? Emoji = null, string? DataUri = null);

public sealed record FooterToastState(string Title, string? Detail, bool IsError);

/// <summary>Identity of the extension whose command sits on top of the view stack.</summary>
public sealed record FooterExtensionInfo(
    string Id,
    string Name,
    IReadOnlyDictionary<string, string> CommandTitles);

/// <summary>Snapshot of the view-stack state the footer reflects.</summary>
public sealed record FooterInput(
    bool WebViewVisible,
    WebViewProtocol.WebViewState? WebViewState,
    int SearchDepth,
    string? TopExtensionId,
    FooterExtensionInfo? TopExtension,
    string? TopCommandId,
    FooterIconState? CommandIcon,
    string? NativePrimaryActionTitle,
    string? SelectedItemTitle,
    FooterToastState? Toast);

/// <summary>
/// The footer's decision logic, ported from the former MainWindow.UpdateFooter
/// code-behind: what the left slot shows (settings gear vs. command identity),
/// the primary-action hint and when the Ctrl+K hint appears.
/// </summary>
public static class FooterStateBuilder
{
    public static FooterState Build(FooterInput input)
    {
        var commandLevel = input.SearchDepth > 1 && !string.IsNullOrEmpty(input.TopExtensionId);
        var commandTitle = input.TopCommandId is not null
            && input.TopExtension is not null
            && input.TopExtension.CommandTitles.TryGetValue(input.TopCommandId, out var title)
            ? title
            : null;
        var label = commandTitle ?? input.TopExtension?.Name ?? "";
        // Both view kinds name the current selection: a native view from the
        // highlighted row, a web page from its reported view state.
        if (commandLevel && !string.IsNullOrEmpty(input.SelectedItemTitle))
        {
            label += " – " + input.SelectedItemTitle;
        }
        var left = commandLevel
            ? new FooterLeftState("command", label, input.CommandIcon)
            : new FooterLeftState("settings", null, null);
        var primaryTitle = input.WebViewVisible
            ? input.WebViewState?.PrimaryTitle
            : input.NativePrimaryActionTitle;
        if (string.IsNullOrEmpty(primaryTitle))
        {
            primaryTitle = null;
        }
        var showActionsHint = input.WebViewVisible
            ? input.WebViewState?.HasActions == true
            : true;
        return new FooterState(left, primaryTitle, showActionsHint, input.Toast);
    }
}
