namespace FlowKey.Shell.Native;

/// <summary>
/// Decides which clipboard captures land in the history. The shell's own test
/// suite writes fixture strings ("plain text", file lists, emoji) to the real
/// system clipboard through test-runner processes; when the launcher is open
/// during a test run those writes would otherwise be recorded as if the user
/// had copied them. Real user copies never come from a test host, so those
/// sources are skipped.
/// </summary>
public static class ClipboardCapturePolicy
{
    private static readonly string[] SkippedSourcePrefixes =
    [
        "testhost",
        "vstest",
        "datacollector",
    ];

    public static bool ShouldRecord(string? sourceApp)
    {
        if (string.IsNullOrEmpty(sourceApp))
        {
            return true;
        }
        var name = sourceApp.ToLowerInvariant();
        foreach (var prefix in SkippedSourcePrefixes)
        {
            if (name.StartsWith(prefix, StringComparison.Ordinal))
            {
                return false;
            }
        }
        return true;
    }
}
