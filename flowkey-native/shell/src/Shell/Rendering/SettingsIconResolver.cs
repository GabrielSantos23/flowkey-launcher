using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Brush = System.Windows.Media.Brush;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Rendering;

/// <summary>
/// Resolves an extension's brand mark into a payload the settings WebView page
/// can render (PNG data URI or emoji text). The chain mirrors the main app's
/// footer icon pipeline (MainWindow.CreateFooterIconElement) in the same
/// order, so settings shows exactly the icon the launcher shows:
/// built-in multicolor brand SVG → brand geometry → brand bitmap → the
/// extension's lucide glyph tinted → shipped icon file → emoji text. Must run
/// on the UI thread (offscreen rasterization).
/// </summary>
public static class SettingsIconResolver
{
    public static FooterIconState? Resolve(
        ReadyExtension extension,
        Func<string, string?> assetsDirResolver,
        Func<string, object?> findResource)
    {
        if (BrandIcons.TryGetDrawing(extension.Id, out var brandDrawing))
        {
            return FromImage(new System.Windows.Controls.Image { Source = brandDrawing });
        }
        if (BrandIcons.TryGet(extension.Id, out var geometry, out var brandBrush))
        {
            return FromDrawing(geometry, brandBrush);
        }
        if (BrandIcons.TryGetBitmap(extension.Id, out var brandBitmap))
        {
            return FromImage(new System.Windows.Controls.Image { Source = brandBitmap });
        }
        if (!string.IsNullOrWhiteSpace(extension.Icon)
            && LucideIcon.Load(extension.Icon) is { } glyph)
        {
            var tint = LucideIcon.ColorFromHex(
                null,
                (Brush?)findResource("TextSecondaryBrush") ?? System.Windows.Media.Brushes.Gray);
            return FromDrawing(glyph, tint);
        }
        if (assetsDirResolver(extension.Id) is { } assetsDir
            && ExtensionAssets.LoadIcon(assetsDir, extension.Icon) is { } extensionImage)
        {
            return FromImage(new System.Windows.Controls.Image { Source = extensionImage });
        }
        if (!string.IsNullOrEmpty(extension.Icon))
        {
            return new FooterIconState("emoji", Emoji: extension.Icon);
        }
        return null;
    }

    private static FooterIconState? FromImage(System.Windows.Controls.Image image) =>
        FooterIconRenderer.FromElement(image);

    private static FooterIconState? FromDrawing(Geometry geometry, Brush brush)
    {
        var image = new System.Windows.Controls.Image
        {
            Source = new DrawingImage(new GeometryDrawing { Geometry = geometry, Brush = brush }),
        };
        return FooterIconRenderer.FromElement(image);
    }
}
