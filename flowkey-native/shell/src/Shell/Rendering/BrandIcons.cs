using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Brush = System.Windows.Media.Brush;
using Color = System.Windows.Media.Color;
using ColorConverter = System.Windows.Media.ColorConverter;
using Geometry = System.Windows.Media.Geometry;
using System.Xml.Linq;

namespace FlowKey.Shell.Rendering;

/// <summary>
/// Per-extension brand marks from Assets/Icons/brand-{extensionId}.svg.
/// The SVG's own fill color is used; the geometry renders filled, not stroked.
/// </summary>
public static class BrandIcons
{
    private static readonly Dictionary<string, (Geometry Geometry, Brush Brush)> Cache = new(StringComparer.Ordinal);
    private static readonly object Gate = new();

    public static bool TryGet(string extensionId, out Geometry geometry, out Brush brush)
    {
        lock (Gate)
        {
            if (Cache.TryGetValue(extensionId, out var cached))
            {
                geometry = cached.Geometry;
                brush = cached.Brush;
                return true;
            }
        }

        try
        {
            var geometryParsed = LucideIcon.Load("brand-" + extensionId);
            if (geometryParsed is null)
            {
                geometry = null!;
                brush = null!;
                return false;
            }
            var resource = System.Windows.Application.GetResourceStream(
                new Uri("pack://application:,,,/Assets/Icons/brand-" + extensionId + ".svg"));
            Brush parsed = (Brush)System.Windows.Application.Current.FindResource("AccentBrush");
            using (var reader = new StreamReader(resource.Stream))
            {
                var document = XDocument.Load(reader);
                var fill = (string?)document.Descendants()
                    .FirstOrDefault(element => element.Attribute("fill") is not null)
                    ?.Attribute("fill");
                if (fill is not null && fill.StartsWith("#", StringComparison.Ordinal))
                {
                    parsed = new SolidColorBrush(
                        (Color)ColorConverter.ConvertFromString(fill));
                    parsed.Freeze();
                }
            }
            lock (Gate)
            {
                Cache[extensionId] = (geometryParsed, parsed);
            }
            geometry = geometryParsed;
            brush = parsed;
            return true;
        }
        catch
        {
            geometry = null!;
            brush = null!;
            return false;
        }
    }

    private static readonly Dictionary<string, ImageSource> BitmapCache = new(StringComparer.Ordinal);

    /// <summary>
    /// Bitmap brand marks from Assets/Icons/brand-{extensionId}.png, for logos too
    /// complex to trace as SVG geometry (e.g. Google Translate). Falls back to null
    /// when only an SVG brand mark exists.
    /// </summary>
    public static bool TryGetBitmap(string extensionId, out ImageSource bitmap)
    {
        lock (Gate)
        {
            if (BitmapCache.TryGetValue(extensionId, out var cached))
            {
                bitmap = cached;
                return true;
            }
        }

        try
        {
            var resource = System.Windows.Application.GetResourceStream(
                new Uri("pack://application:,,,/Assets/Icons/brand-" + extensionId + ".png"));
            if (resource is null)
            {
                bitmap = null!;
                return false;
            }
            var frame = BitmapFrame.Create(resource.Stream, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
            frame.Freeze();
            lock (Gate)
            {
                BitmapCache[extensionId] = frame;
            }
            bitmap = frame;
            return true;
        }
        catch
        {
            bitmap = null!;
            return false;
        }
    }
}
