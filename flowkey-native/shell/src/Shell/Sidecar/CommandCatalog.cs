using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Sidecar;

public sealed record CommandRow(string ExtensionId, string ExtensionName, ReadyExtension Extension, CommandInfo Command);

public static class CommandCatalog
{
    public const string OpenActionId = "__open__";

    public static IReadOnlyList<CommandRow> Search(string query, IReadOnlyList<ReadyExtension> extensions)
    {
        var q = query.Trim().ToLowerInvariant();
        var rows = new List<CommandRow>();
        foreach (var extension in extensions)
        {
            foreach (var command in extension.Commands)
            {
                var haystacks = new[] { command.Title.ToLowerInvariant() }
                    .Concat((command.Keywords ?? new List<string>()).Select(k => k.ToLowerInvariant()))
                    .ToList();
                var score = q.Length == 0
                    ? 10
                    : haystacks.Any(h => h == q)
                        ? 100
                        : haystacks.Any(h => h.StartsWith(q))
                            ? 80
                            : haystacks.Any(h => h.Contains(q))
                                ? 50
                                : 0;
                if (score > 0)
                {
                    rows.Add(new CommandRow(extension.Id, extension.Name, extension, command));
                }
            }
        }
        return rows;
    }
}
