using System.IO;

namespace FlowKey.Shell.Native;

/// <summary>
/// Target resolution for the consent-gated `shell.open` route: one capability
/// that opens either an http(s) URL or an existing file/folder path with the
/// system handler. Used by user-created content (e.g. quicklinks) where an
/// fsPaths scope cannot express "whatever the user saved".
/// </summary>
public static class ShellOpenService
{
    /// <summary>Only http/https count as URLs; everything else is treated as a path.</summary>
    public static bool IsHttpUrl(string target)
    {
        if (string.IsNullOrWhiteSpace(target) || !Uri.TryCreate(target, UriKind.Absolute, out var uri))
        {
            return false;
        }
        return uri.Scheme is "http" or "https";
    }

    /// <summary>
    /// Opens the target: URLs go through the shell handler, paths must exist.
    /// Returns an error code, or null on success.
    /// </summary>
    public static string? Open(string target)
    {
        if (string.IsNullOrWhiteSpace(target))
        {
            return "openFailed";
        }
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(target)
            {
                UseShellExecute = true,
            });
            return null;
        }
        catch (Exception)
        {
            return "openFailed";
        }
    }
}
