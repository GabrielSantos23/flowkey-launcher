using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Sidecar;

/// <summary>
/// Root fallback shown when a query matches nothing anywhere: one row that
/// opens the default browser with the query, Raycast-style. The shell
/// intercepts the action ids locally — the row never reaches an extension.
/// </summary>
public static class WebSearchFallback
{
    public const string ActionIdPrefix = "__websearch__";
    public const string ItemIdPrefix = "websearch:";
    public const string ExtensionId = "websearch";

    public sealed record Engine(string ActionId, string Title, string UrlFormat);

    public static IReadOnlyList<Engine> Engines { get; } = new[]
    {
        new Engine(ActionIdPrefix, "Google", "https://www.google.com/search?q={0}"),
        new Engine(ActionIdPrefix + "ddg", "DuckDuckGo", "https://duckduckgo.com/?q={0}"),
        new Engine(ActionIdPrefix + "yt", "YouTube", "https://www.youtube.com/results?search_query={0}"),
    };

    public static string? UrlFor(string actionId, string query)
    {
        foreach (var engine in Engines)
        {
            if (string.Equals(engine.ActionId, actionId, StringComparison.Ordinal))
            {
                return string.Format(engine.UrlFormat, Uri.EscapeDataString(query));
            }
        }
        return null;
    }

    public static IReadOnlyList<UiRow> Build(string query)
    {
        var trimmed = query.Trim();
        if (trimmed.Length == 0)
        {
            return Array.Empty<UiRow>();
        }
        var actions = Engines
            .Select((engine, index) => new UiAction
            {
                Id = engine.ActionId,
                Title = "Search with " + engine.Title,
                Primary = index == 0,
            })
            .ToList();
        return
        [
            UiRow.Item(new UiItem
            {
                Id = ItemIdPrefix + trimmed,
                Title = "Search the web for '" + trimmed + "'",
                Kind = "Search",
                Actions = actions,
            }),
        ];
    }
}
