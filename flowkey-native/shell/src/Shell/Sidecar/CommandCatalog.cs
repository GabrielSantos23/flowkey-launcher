using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Sidecar;

public sealed record CommandRow(
    string ExtensionId,
    string ExtensionName,
    ReadyExtension Extension,
    CommandInfo Command)
{
    /// <summary>Fuzzy match score from the shell's search; 0 for non-searched rows.</summary>
    public int Score { get; init; }
}

public static class CommandCatalog
{
    public const string OpenActionId = "__open__";

    public static IReadOnlyList<CommandRow> Search(string query, IReadOnlyList<ReadyExtension> extensions)
    {
        var q = query.Trim();
        var rows = new List<CommandRow>();
        foreach (var extension in extensions)
        {
            foreach (var command in extension.Commands)
            {
                var score = q.Length == 0
                    ? 10
                    : Math.Max(
                        FuzzyMatcher.Match(q, command.Title)?.Score ?? 0,
                        (command.Keywords ?? new List<string>())
                            .Select(keyword => BuiltInCommands.KeywordScore(q, keyword))
                            .DefaultIfEmpty(0)
                            .Max());
                if (score > 0)
                {
                    rows.Add(new CommandRow(extension.Id, extension.Name, extension, command) { Score = score });
                }
            }
        }
        // OrderByDescending is stable, so equal scores keep extension order.
        return rows.OrderByDescending(row => row.Score).ToList();
    }
}
