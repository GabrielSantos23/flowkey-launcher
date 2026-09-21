using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Sidecar;

public sealed class SearchLevel
{
    public string? ExtensionId { get; set; }
    public string? CommandId { get; init; }
    public string Query { get; set; } = "";
    public List<string> RequestIds { get; } = new();
    public Dictionary<string, string> ExtensionByRequest { get; } = new(StringComparer.Ordinal);
    public Dictionary<string, IReadOnlyList<UiRow>> RowsByRequest { get; } = new(StringComparer.Ordinal);
    public IReadOnlyList<UiRow> Rows { get; set; } = Array.Empty<UiRow>();
}

public sealed class SearchState
{
    private readonly Stack<SearchLevel> levels = new();
    private readonly HashSet<string> liveRequestIds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> actionRefreshByRequest = new(StringComparer.Ordinal);
    private long generation;

    public const string OpenActionId = "__open__";

    public int Depth => levels.Count;
    public string CurrentQuery => levels.Count > 0 ? levels.Peek().Query : "";
    public long Generation { get; private set; }

    public void BeginRootQuery(string query, IReadOnlyList<(string ExtensionId, string RequestId)> requests)
    {
        generation++;
        liveRequestIds.Clear();
        actionRefreshByRequest.Clear();
        var level = new SearchLevel { Query = query };
        RegisterRequests(level, requests.Select(r => (r.ExtensionId, r.RequestId)));
        levels.Clear();
        levels.Push(level);
    }

    public void PushRequest(string requestId, string extensionId, string commandId)
    {
        generation++;
        liveRequestIds.Clear();
        actionRefreshByRequest.Clear();
        var level = new SearchLevel { ExtensionId = extensionId, CommandId = commandId, Query = "" };
        level.ExtensionByRequest[requestId] = extensionId;
        level.RequestIds.Add(requestId);
        level.RowsByRequest[requestId] = Array.Empty<UiRow>();
        liveRequestIds.Add(requestId);
        levels.Push(level);
    }

    public void TrackAction(string requestId, string extensionId)
    {
        actionRefreshByRequest[requestId] = extensionId;
    }

    public bool Pop()
    {
        if (levels.Count <= 1)
        {
            return false;
        }
        var top = levels.Pop();
        liveRequestIds.Clear();
        actionRefreshByRequest.Clear();
        generation++;
        foreach (var id in levels.Peek().RequestIds)
        {
            liveRequestIds.Add(id);
        }
        return true;
    }

    public void ResetToRoot()
    {
        while (levels.Count > 1)
        {
            levels.Pop();
        }
        liveRequestIds.Clear();
        actionRefreshByRequest.Clear();
        generation++;
        if (levels.Count > 0)
        {
            foreach (var id in levels.Peek().RequestIds)
            {
                liveRequestIds.Add(id);
            }
        }
    }

    public SearchLevel? Top => levels.Count > 0 ? levels.Peek() : null;

    public void BeginLevelQuery(IReadOnlyList<(string ExtensionId, string RequestId)> requests)
    {
        generation++;
        liveRequestIds.Clear();
        actionRefreshByRequest.Clear();
        if (levels.Count == 0)
        {
            levels.Push(new SearchLevel());
        }
        var top = levels.Peek();
        top.RequestIds.Clear();
        top.RowsByRequest.Clear();
        foreach (var (extensionId, requestId) in requests)
        {
            top.RequestIds.Add(requestId);
            top.ExtensionByRequest[requestId] = extensionId;
            top.RowsByRequest[requestId] = Array.Empty<UiRow>();
            liveRequestIds.Add(requestId);
        }
    }

    public string? ExtensionFor(string requestId) =>
        Top?.RequestIds.Contains(requestId) == true ? Top.ExtensionId : null;

    public (string? ExtensionId, string? CommandId) RequestContext(string requestId)
    {
        var top = Top;
        if (top is null || !top.RequestIds.Contains(requestId))
        {
            return (null, null);
        }
        return (top.ExtensionId, top.CommandId);
    }

    public IReadOnlyList<UiRow> ApplyResult(string requestId, ListTree tree, out bool stale)
    {
        var top = Top;
        if (top is null)
        {
            stale = true;
            return CurrentRows;
        }
        if (actionRefreshByRequest.Remove(requestId, out var refreshExtension))
        {
            var previous = top.ExtensionByRequest
                .Where(kv => kv.Value == refreshExtension)
                .Select(kv => kv.Key)
                .ToList();
            foreach (var id in previous)
            {
                top.RequestIds.Remove(id);
                top.RowsByRequest.Remove(id);
                top.ExtensionByRequest.Remove(id);
                liveRequestIds.Remove(id);
            }
            top.RequestIds.Add(requestId);
            top.ExtensionByRequest[requestId] = refreshExtension;
            top.RowsByRequest[requestId] = RowBuilder.Flatten(tree, refreshExtension);
            stale = false;
            return MergeTopRows(top);
        }
        if (!liveRequestIds.Contains(requestId))
        {
            stale = true;
            return CurrentRows;
        }

        stale = false;
        top.ExtensionByRequest.TryGetValue(requestId, out var extensionId);
        top.RowsByRequest[requestId] = RowBuilder.Flatten(tree, extensionId);
        return MergeTopRows(top);
    }

    private IReadOnlyList<UiRow> MergeTopRows(SearchLevel top)
    {
        var merged = new List<UiRow>();
        foreach (var id in top.RequestIds)
        {
            merged.AddRange(top.RowsByRequest[id]);
        }
        top.Rows = merged;
        CurrentRows = merged;
        return merged;
    }

    public IReadOnlyList<UiRow> CurrentRows { get; private set; } = Array.Empty<UiRow>();

    private void RegisterRequests(SearchLevel level, IEnumerable<(string ExtensionId, string RequestId)> requests)
    {
        foreach (var (extensionId, requestId) in requests)
        {
            level.RequestIds.Add(requestId);
            level.RowsByRequest[requestId] = Array.Empty<UiRow>();
            liveRequestIds.Add(requestId);
        }
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
    public bool IsCommand { get; set; }
    public string? CommandId { get; set; }
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
