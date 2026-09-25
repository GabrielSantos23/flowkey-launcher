using System.Globalization;
using System.Windows.Data;
using Brush = System.Windows.Media.Brush;
using Color = System.Windows.Media.Color;
using ColorConverter = System.Windows.Media.ColorConverter;
using SolidColorBrush = System.Windows.Media.SolidColorBrush;

namespace FlowKey.Shell.Rendering;

/// <summary>
/// Converts a manifest icon color hex string into a soft tile background:
/// the color at reduced alpha over the standard surface. Returns the plain
/// surface brush when there is no color, so tiles stay uniform for items
/// that only carry extracted bitmaps (installed apps).
/// </summary>
public sealed class IconTileBackgroundConverter : IValueConverter
{
    private const byte TileAlpha = 51; // 20%

    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (System.Windows.Application.Current is null)
        {
            return null;
        }
        var surface = System.Windows.Application.Current.TryFindResource("SurfaceBrush") as Brush;
        if (value is not string hex || hex.Length == 0 || !hex.StartsWith('#'))
        {
            return surface;
        }
        try
        {
            var color = (Color)ColorConverter.ConvertFromString(hex);
            var tile = new SolidColorBrush(Color.FromArgb(TileAlpha, color.R, color.G, color.B));
            tile.Freeze();
            return tile;
        }
        catch (FormatException)
        {
            return surface;
        }
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}
