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
            var group = new GeometryGroup { FillRule = FillRule.Nonzero };
            foreach (var element in document.Descendants())
            {
                var geometry = ParseElement(element);
                if (geometry is not null)
                {
                    group.Children.Add(geometry);
                }
            }
            if (group.Children.Count == 0)
            {
                return null;
            }
            group.Freeze();
            return group;
        }
        catch
        {
            return null;
        }
    }

    private static Geometry? ParseElement(XElement element)
    {
        switch (element.Name.LocalName)
        {
            case "path":
                var d = (string?)element.Attribute("d");
                return d is null ? null : Geometry.Parse(d);
            case "rect":
                var x = (double?)element.Attribute("x") ?? 0;
                var y = (double?)element.Attribute("y") ?? 0;
                var width = (double?)element.Attribute("width") ?? 0;
                var height = (double?)element.Attribute("height") ?? 0;
                if (width <= 0 || height <= 0)
                {
                    return null;
                }
                var rx = (double?)element.Attribute("rx") ?? 0;
                var ry = (double?)element.Attribute("ry") ?? rx;
                return new RectangleGeometry(new Rect(x, y, width, height), rx, ry);
            case "circle":
                var cx = (double?)element.Attribute("cx") ?? 0;
                var cy = (double?)element.Attribute("cy") ?? 0;
                var r = (double?)element.Attribute("r") ?? 0;
                return r <= 0 ? null : new EllipseGeometry(new Point(cx, cy), r, r);
            case "ellipse":
                var ecx = (double?)element.Attribute("cx") ?? 0;
                var ecy = (double?)element.Attribute("cy") ?? 0;
                var erx = (double?)element.Attribute("rx") ?? 0;
                var ery = (double?)element.Attribute("ry") ?? 0;
                return erx <= 0 || ery <= 0 ? null : new EllipseGeometry(new Point(ecx, ecy), erx, ery);
            case "line":
                return new LineGeometry(
                    new Point((double?)element.Attribute("x1") ?? 0, (double?)element.Attribute("y1") ?? 0),
                    new Point((double?)element.Attribute("x2") ?? 0, (double?)element.Attribute("y2") ?? 0));
            default:
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
