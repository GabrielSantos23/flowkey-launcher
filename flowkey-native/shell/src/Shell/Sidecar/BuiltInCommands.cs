namespace FlowKey.Shell.Sidecar;

public sealed record BuiltInCommand(
    string Id,
    string Title,
    string Subtitle,
    string IconName,
    string? IconColor,
    IReadOnlyList<string> Keywords);

/// <summary>
/// Shell-owned commands that appear at the root like extension commands but
/// never reach the sidecar: the shell runs them locally. Item ids follow the
/// "cmd:{extensionId}:{commandId}" format so favorites/usage treat them like
/// any command; <see cref="ExtensionId"/> marks them for local dispatch.
/// </summary>
public static class BuiltInCommands
{
    public const string ExtensionId = "builtin";
    public const string SettingsId = "settings";
    public const string ReloadExtensionsId = "reload-extensions";
    public const string CheckUpdatesId = "check-updates";
    public const string QuitId = "quit";

    public static IReadOnlyList<BuiltInCommand> All { get; } = new[]
    {
        new BuiltInCommand(SettingsId, "Settings", "Open FlowKey settings", "settings", null,
            ["preferences", "options", "configure"]),
        new BuiltInCommand(ReloadExtensionsId, "Reload Extensions", "Restart the extension sidecar", "refresh-cw", null,
            ["restart", "sidecar"]),
        new BuiltInCommand(CheckUpdatesId, "Check for Updates", "Look for a new FlowKey release", "download", null,
            ["update", "version"]),
        new BuiltInCommand(QuitId, "Quit FlowKey", "Exit the launcher", "log-out", null,
            ["exit", "close"]),
    };

    public static string ItemId(BuiltInCommand command) => "cmd:" + ExtensionId + ":" + command.Id;

    public static IReadOnlyList<(BuiltInCommand Command, int Score)> Search(string query)
    {
        var q = query.Trim();
        var results = new List<(BuiltInCommand, int)>();
        foreach (var command in All)
        {
            var score = 0;
            if (q.Length == 0)
            {
                score = 10;
            }
            else
            {
                score = FuzzyMatcher.Match(q, command.Title)?.Score ?? 0;
                foreach (var keyword in command.Keywords)
                {
                    var keywordScore = KeywordScore(q, keyword);
                    if (keywordScore > score)
                    {
                        score = keywordScore;
                    }
                }
            }
            if (score > 0)
            {
                results.Add((command, score));
            }
        }
        return results.OrderByDescending(result => result.Item2).ToList();
    }

    /// <summary>Keyword matches are capped below title matches so titles win ties.</summary>
    public static int KeywordScore(string query, string keyword) =>
        Math.Min(80, FuzzyMatcher.Match(query, keyword)?.Score ?? 0);
}
