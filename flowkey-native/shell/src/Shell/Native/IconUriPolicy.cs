using System.IO;
using System.Text;

namespace FlowKey.Shell.Native;

public static class IconUriPolicy
{
    public const long MaxDataUriBytes = 64 * 1024;

    public static string IconCacheRoot { get; } =
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FlowKey.Shell",
            "icon-cache");

    public static bool IsAllowed(string? iconUri)
    {
        return TryGetLocalPath(iconUri, out _) || IsAllowedDataUri(iconUri);
    }

    public static bool IsAllowedDataUri(string? iconUri)
    {
        if (iconUri is null || !iconUri.StartsWith("data:image/png;base64,", StringComparison.Ordinal))
        {
            return false;
        }
        var payload = iconUri["data:image/png;base64,".Length..];
        if (Base64Length(payload) > MaxDataUriBytes)
        {
            return false;
        }
        try
        {
            Convert.FromBase64String(payload);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public static bool TryGetLocalPath(string? iconUri, out string path)
    {
        path = "";
        if (iconUri is null || !iconUri.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        try
        {
            var uri = new Uri(iconUri);
            if (uri.IsUnc || !string.IsNullOrEmpty(uri.Host))
            {
                return false;
            }
            var candidate = Path.GetFullPath(uri.LocalPath);
            var root = Path.GetFullPath(IconCacheRoot);
            if (!candidate.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            if (candidate.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Contains(".."))
            {
                return false;
            }
            path = candidate;
            return true;
        }
        catch (UriFormatException)
        {
            return false;
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (System.IO.IOException)
        {
            return false;
        }
    }

    public static byte[]? DecodeDataUri(string iconUri)
    {
        if (!IsAllowedDataUri(iconUri))
        {
            return null;
        }
        try
        {
            return Convert.FromBase64String(iconUri["data:image/png;base64,".Length..]);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private static long Base64Length(string payload) =>
        (long)Math.Ceiling(payload.Length * 3.0 / 4.0);
}
