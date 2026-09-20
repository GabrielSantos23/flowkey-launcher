using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Sidecar;

public sealed class SearchState
{
    public string CurrentRequestId { get; private set; } = "";

    public void SetCurrent(string requestId) => CurrentRequestId = requestId;

    public bool IsCurrent(string requestId) =>
        !string.IsNullOrEmpty(requestId) && string.Equals(requestId, CurrentRequestId, StringComparison.Ordinal);

    public IReadOnlyList<UiRow> ApplyResult(string requestId, ListTree tree, out bool stale)
    {
        if (!IsCurrent(requestId))
        {
            stale = true;
            return CurrentRows;
        }

        stale = false;
        CurrentRows = RowBuilder.Flatten(tree);
        return CurrentRows;
    }

    public IReadOnlyList<UiRow> CurrentRows { get; private set; } = Array.Empty<UiRow>();
}

public abstract class UiRow
{
    public static HeaderRow Header(string title) => new() { Title = title };
    public static ItemRow Item(UiItem item) => new() { Item = item };
}

public sealed class HeaderRow : UiRow
{
    public string Title { get; init; } = "";
}

public sealed class ItemRow : UiRow
{
    public UiItem Item { get; init; } = new();
}

public static class RowBuilder
{
    public static IReadOnlyList<UiRow> Flatten(ListTree tree)
    {
        var rows = new List<UiRow>();
        foreach (var section in tree.Sections)
        {
            if (section.Items.Count == 0)
            {
                continue;
            }
            if (!string.IsNullOrEmpty(section.Title))
            {
                rows.Add(UiRow.Header(section.Title));
            }
            rows.AddRange(section.Items.Select(UiRow.Item));
        }
        return rows;
    }

    public static int FirstItemIndex(IReadOnlyList<UiRow> rows)
    {
        for (var i = 0; i < rows.Count; i++)
        {
            if (rows[i] is ItemRow)
            {
                return i;
            }
        }
        return -1;
    }
}
