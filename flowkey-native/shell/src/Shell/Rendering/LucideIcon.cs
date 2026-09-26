using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Xml.Linq;
using Application = System.Windows.Application;
using Color = System.Windows.Media.Color;
using Point = System.Windows.Point;

namespace FlowKey.Shell.Rendering;

public static class LucideIcon
{
    private static readonly Dictionary<string, Geometry> Cache = new(StringComparer.Ordinal);
    private static readonly object Gate = new();

    public static Geometry? Load(string name)
    {
        if (string.IsNullOrEmpty(name) || name.Contains('/') || name.Contains(".."))
        {
            return null;
        }
        lock (Gate)
        {
            if (Cache.TryGetValue(name, out var cached))
            {
                return cached;
            }
            var geometry = Parse(name);
            if (geometry is not null)
            {
                Cache[name] = geometry;
            }
            return geometry;
        }
    }

    private static Geometry? Parse(string name)
    {
        try
        {
            var resource = Application.GetResourceStream(new Uri("pack://application:,,,/Assets/Icons/" + name + ".svg"));
            if (resource is null)
            {
                return null;
            }
            using var reader = new StreamReader(resource.Stream);
            var document = XDocument.Load(reader);
            return SvgIcon.ParseDocument(document);
        }
        catch
        {
            return null;
        }
    }

    public static System.Windows.Media.Brush ColorFromHex(string? hex, System.Windows.Media.Brush fallback)
    {
        if (hex is null)
        {
            return fallback;
        }
        try
        {
            var brush = new SolidColorBrush((Color)System.Windows.Media.ColorConverter.ConvertFromString(hex));
            brush.Freeze();
            return brush;
        }
        catch
        {
            return fallback;
        }
    }
}
