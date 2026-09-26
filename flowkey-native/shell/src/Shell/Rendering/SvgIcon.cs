using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Windows.Media;
using System.Xml.Linq;
using Point = System.Windows.Point;

namespace FlowKey.Shell.Rendering;

/// <summary>
/// Parses raw SVG markup (as shipped by extensions via UiItem.IconSvg) into a
/// frozen WPF geometry. Supports the SVG element subset Lucide-style stroke
/// icon sets use: path, rect, circle, ellipse and line. Results are cached by
/// content hash, so repeated trees re-sending the same SVG cost nothing.
/// </summary>
public static class SvgIcon
{
    private const int MaxCacheEntries = 4096;

    private static readonly Dictionary<string, Geometry> Cache = new(StringComparer.Ordinal);
    private static readonly object Gate = new();

    public static Geometry? FromContent(string? svg)
    {
        if (string.IsNullOrWhiteSpace(svg))
        {
            return null;
        }
        var key = Hash(svg);
        lock (Gate)
        {
            if (Cache.TryGetValue(key, out var cached))
            {
                return cached;
            }
            Geometry? geometry = null;
            try
            {
                geometry = ParseDocument(XDocument.Parse(svg));
            }
            catch (System.Xml.XmlException)
            {
                geometry = null;
            }
            if (geometry is not null && Cache.Count >= MaxCacheEntries)
            {
                Cache.Clear();
            }
            if (geometry is not null)
            {
                Cache[key] = geometry;
            }
            return geometry;
        }
    }

    public static GeometryGroup? ParseDocument(XDocument document)
    {
        try
        {
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

    public static Geometry? ParseElement(XElement element)
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

    private static string Hash(string content)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(content));
        return Convert.ToHexString(bytes);
    }
}
