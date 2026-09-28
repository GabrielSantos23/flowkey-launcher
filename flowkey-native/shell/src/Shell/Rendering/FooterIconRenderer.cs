using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using FlowKey.Shell.Native;

namespace FlowKey.Shell.Rendering;

/// <summary>
/// Converts the footer's native icon element (built by MainWindow's
/// CreateExtensionIcon pipeline) into a payload the WebView footer page can
/// render: emoji text as-is, everything else rasterized to a PNG data URI.
/// </summary>
public static class FooterIconRenderer
{
    private const string PngDataUriPrefix = "data:image/png;base64,";
    private const double RenderScale = 2;

    public static FooterIconState? FromElement(FrameworkElement? element)
    {
        switch (element)
        {
            case TextBlock { Text: { Length: > 0 } text }:
                return new FooterIconState("emoji", Emoji: text);
            case System.Windows.Controls.Image { Source: not null } image:
                return Rasterize(image);
            default:
                return null;
        }
    }

    /// <summary>Renders the element offscreen at 2x so the 16px icon stays crisp under DPI scaling.</summary>
    private static FooterIconState? Rasterize(System.Windows.Controls.Image image)
    {
        try
        {
            image.Measure(new System.Windows.Size(double.PositiveInfinity, double.PositiveInfinity));
            var width = Math.Max(image.DesiredSize.Width, 1);
            var height = Math.Max(image.DesiredSize.Height, 1);
            image.Arrange(new System.Windows.Rect(0, 0, width, height));
            var bitmap = new RenderTargetBitmap(
                (int)Math.Ceiling(width * RenderScale),
                (int)Math.Ceiling(height * RenderScale),
                96 * RenderScale,
                96 * RenderScale,
                PixelFormats.Pbgra32);
            bitmap.Render(image);
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using var stream = new MemoryStream();
            encoder.Save(stream);
            return new FooterIconState("image", DataUri: PngDataUriPrefix + Convert.ToBase64String(stream.ToArray()));
        }
        catch (Exception)
        {
            return null;
        }
    }

    /// <summary>Decodes a data URI produced by <see cref="Rasterize"/> back into an Image for the native fallback.</summary>
    public static FrameworkElement? ToNativeElement(FooterIconState? icon, Func<string, object?> findResource)
    {
        if (icon is null)
        {
            return null;
        }
        if (icon.Kind == "emoji" && !string.IsNullOrEmpty(icon.Emoji))
        {
            var text = new TextBlock { Text = icon.Emoji, VerticalAlignment = VerticalAlignment.Center };
            text.SetResourceReference(TextBlock.FontSizeProperty, "FooterIconSize");
            return text;
        }
        if (icon.Kind == "image" && icon.DataUri is { } dataUri
            && dataUri.StartsWith(PngDataUriPrefix, StringComparison.Ordinal))
        {
            try
            {
                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.StreamSource = new MemoryStream(Convert.FromBase64String(dataUri[PngDataUriPrefix.Length..]));
                bitmap.EndInit();
                bitmap.Freeze();
                var image = new System.Windows.Controls.Image { Source = bitmap, VerticalAlignment = VerticalAlignment.Center };
                image.SetResourceReference(FrameworkElement.HeightProperty, "FooterIconSize");
                return image;
            }
            catch (Exception)
            {
                return null;
            }
        }
        return null;
    }
}
