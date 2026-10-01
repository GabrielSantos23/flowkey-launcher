namespace FlowKey.Shell.Native;

/// <summary>Where the Escape key routes, given the view-stack depth and main-input text.</summary>
public enum EscapeOutcome
{
    /// <summary>A command view is open — pop it.</summary>
    PopView,
    /// <summary>At the root with typed text — erase the text; the window stays open.</summary>
    ClearInput,
    /// <summary>At the root with an empty input — hide the window.</summary>
    HideWindow,
}

/// <summary>
/// The root Esc contract: typed text is erased before the launcher may hide,
/// so the window only closes on Escape once the main input is empty.
/// </summary>
public static class EscapeBehavior
{
    public static EscapeOutcome Resolve(int depth, string query) =>
        depth > 1 ? EscapeOutcome.PopView
        : query.Length > 0 ? EscapeOutcome.ClearInput
        : EscapeOutcome.HideWindow;
}
