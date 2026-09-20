using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Sidecar;

public sealed class SearchState
{
    private readonly HashSet<string> currentRequestIds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> extensionByRequest = new(StringComparer.Ordinal);
    private readonly Dictionary<string, IReadOnlyList<UiRow>> rowsByRequest = new(StringComparer.Ordinal);
    private readonly List<string> orderedRequestIds = new();

    public IReadOnlyList<UiRow> CurrentRows { get; private set; } = Array.Empty<UiRow>();

    public void BeginQuery(IReadOnlyList<(string ExtensionId, string RequestId)> requests)
    {
        currentRequestIds.Clear();
        rowsByRequest.Clear();
        orderedRequestIds.Clear();
        extensionByRequest.Clear();
        foreach (var (extensionId, requestId) in requests)
        {
            currentRequestIds.Add(requestId);
            extensionByRequest[requestId] = extensionId;
            rowsByRequest[requestId] = Array.Empty<UiRow>();
            orderedRequestIds.Add(requestId);
        }
    }

    public bool IsCurrent(string requestId) =>
        !string.IsNullOrEmpty(requestId) && currentRequestIds.Contains(requestId);

    public string? ExtensionFor(string requestId) =>
        extensionByRequest.TryGetValue(requestId, out var id) ? id : null;

    public IReadOnlyList<UiRow> ApplyResult(string requestId, ListTree tree, out bool stale)
    {
        if (!IsCurrent(requestId))
        {
            stale = true;
            return CurrentRows;
        }

        stale = false;
        rowsByRequest[requestId] = RowBuilder.Flatten(tree, ExtensionFor(requestId));
        var merged = new List<UiRow>();
        foreach (var id in orderedRequestIds)
        {
            merged.AddRange(rowsByRequest[id]);
        }
        CurrentRows = merged;
        return CurrentRows;
    }
}

public abstract class UiRow
{
    public string? ExtensionId { get; set; }

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
    public System.Windows.Media.ImageSource? Bitmap { get; set; }
}

public static class RowBuilder
{
    public static IReadOnlyList<UiRow> Flatten(ListTree tree, string? extensionId = null)
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
            foreach (var item in section.Items)
            {
                var row = UiRow.Item(item);
                row.ExtensionId = extensionId;
                rows.Add(row);
            }
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
