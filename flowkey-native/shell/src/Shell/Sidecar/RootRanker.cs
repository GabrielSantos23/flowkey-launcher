namespace FlowKey.Shell.Sidecar;

/// <summary>
/// Ranks the merged root rows by their shell-computed fuzzy scores
/// (<see cref="ItemRow.MatchScore"/>) instead of source order, then regenerates
/// group headers over the sorted rows, Raycast-style. Calculator result rows
/// stay pinned at the top and the pagination row stays last. Existing header
/// rows are dropped — groups are rebuilt from row identity.
/// </summary>
public static class RootRanker
{
    public static IReadOnlyList<UiRow> Rank(IReadOnlyList<UiRow> rows, Func<string, string>? extensionName = null)
    {
        var loadMore = rows.OfType<LoadMoreRow>().ToList();
        var items = rows
            .OfType<ItemRow>()
            .OrderByDescending(row => row is CalculatorItemRow ? 1 : 0)
            .ThenByDescending(row => row.MatchScore ?? 0)
            .ToList();

        var result = new List<UiRow>(items.Count + loadMore.Count);
        string? lastGroup = null;
        foreach (var row in items)
        {
            var group = row.IsCommand ? "Commands" : row.ExtensionId ?? "";
            if (group != lastGroup)
            {
                var title = row.IsCommand
                    ? "Commands"
                    : extensionName?.Invoke(group) ?? group;
                if (title.Length > 0)
                {
                    result.Add(UiRow.Header(title));
                }
                lastGroup = group;
            }
            result.Add(row);
        }
        result.AddRange(loadMore);
        return result;
    }
}
