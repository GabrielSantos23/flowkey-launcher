using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Media.Imaging;

namespace FlowKey.Shell.Native;

/// <summary>
/// Resolves extension-shipped image icons: a manifest `icon` (or command icon)
/// that names an image file is loaded from the extension's own directory —
/// the installed package directory for third-party extensions, or the
/// first-party source folder beside the repo. Paths that escape the extension
/// directory are rejected; results are cached by absolute path.
/// </summary>
public static partial class ExtensionAssets
{
    public const string FallbackAssetsFolder = "assets";

    [GeneratedRegex(@"\.(png|jpe?g|gif|webp|ico|bmp)$", RegexOptions.IgnoreCase)]
    private static partial Regex ImageFilePattern();

    public static bool IsImageFile(string name) => ImageFilePattern().IsMatch(name);

    private static readonly Dictionary<string, BitmapImage> Cache = new(StringComparer.Ordinal);
    private static readonly object Gate = new();

    /// <summary>
    /// The directory an extension's manifest-referenced files live in:
    /// the installed package directory when the extension is installed,
    /// otherwise the first-party extensions folder under the repo root.
    /// </summary>
    public static string? AssetsDirFor(string extensionId, string? repoRoot, Func<string, string?> installedPath)
    {
        var installed = installedPath(extensionId);
        if (installed is not null)
        {
            return installed;
        }
        if (repoRoot is null)
        {
            return null;
        }
        var firstParty = Path.Combine(repoRoot, "extensions", extensionId);
        return Directory.Exists(firstParty) ? firstParty : null;
    }

    /// <summary>
    /// Loads an image-form icon (see <see cref="IsImageFile"/>) from the
    /// extension directory, trying the direct path and then an `assets/`
    /// subfolder. Returns null when the name is not an image file, the
    /// extension has no directory, or the resolved file does not exist.
    /// </summary>
    public static BitmapImage? LoadIcon(string? assetsDir, string? iconName)
    {
        if (assetsDir is null || iconName is null || !IsImageFile(iconName))
        {
            return null;
        }
        lock (Gate)
        {
            var resolved = Resolve(assetsDir, iconName);
            if (resolved is null)
            {
                return null;
            }
            if (Cache.TryGetValue(resolved, out var cached))
            {
                return cached;
            }
            try
            {
                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.DecodePixelWidth = 64;
                bitmap.UriSource = new Uri(resolved);
                bitmap.EndInit();
                bitmap.Freeze();
                Cache[resolved] = bitmap;
                return bitmap;
            }
            catch (IOException)
            {
                return null;
            }
            catch (NotSupportedException)
            {
                return null;
            }
        }
    }

    /// <summary>Resolves the icon to an existing file inside the extension directory, or null.</summary>
    public static string? Resolve(string assetsDir, string iconName)
    {
        if (iconName.Contains('\\') || iconName.Contains(':') || iconName.Split('/').Any(s => s == ".."))
        {
            return null;
        }
        var root = Path.GetFullPath(assetsDir);
        foreach (var candidate in new[]
                 {
                     Path.GetFullPath(Path.Combine(root, iconName.Replace('/', Path.DirectorySeparatorChar))),
                     Path.GetFullPath(Path.Combine(root, FallbackAssetsFolder, iconName.Replace('/', Path.DirectorySeparatorChar))),
                 })
        {
            if (!candidate.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            {
                continue;
            }
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        return null;
    }
}
