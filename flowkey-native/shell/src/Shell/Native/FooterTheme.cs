using System.Windows;

namespace FlowKey.Shell.Native;

/// <summary>
/// Turns the shell's keyed theme resources into --fk-* CSS custom properties
/// for the footer chrome page, so the WebView footer and the native fallback
/// layout share one source of truth for colors, sizes and spacing. The tokens
/// ride the same BuildThemeCss pipeline the extension webview uses.
/// </summary>
public static class FooterTheme
{
    private static readonly string[] BrushKeys =
    {
        "WindowBackgroundBrush", "TextPrimaryBrush", "TextSecondaryBrush", "TextTertiaryBrush",
        "DividerBrush", "KeycapBackgroundBrush", "KeycapBorderBrush", "EnterKeycapBackgroundBrush",
        "ActionPanelBackgroundBrush", "FooterToastDotBrush", "FooterToastErrorBrush",
    };

    private static readonly string[] SizeKeys =
    {
        "FooterHeight", "FooterFontSize", "KeycapFontSize", "GlyphFontSize",
        "FooterIconSize", "FooterDividerHeight", "FooterPillHeight", "FooterIconGap",
    };

    private static readonly string[] CornerRadiusKeys = { "KeycapCornerRadius", "FooterPillCornerRadius" };

    private static readonly string[] ThicknessKeys =
    {
        "FooterPillPadding", "FooterPillIconPadding", "FooterPillMargin", "KeycapPadding",
        "KeycapMargin", "KeycapSpacing", "FooterDividerMargin", "ActionsLabelMargin", "IconMargin",
    };

    public static IReadOnlyDictionary<string, string> BuildTokens(Func<string, object?> findResource)
    {
        var tokens = new Dictionary<string, string>();
        foreach (var key in BrushKeys)
        {
            if (findResource(key) is System.Windows.Media.Brush brush
                && BrushToCss(brush) is { } brushCss)
            {
                tokens[key] = brushCss;
            }
        }
        foreach (var key in SizeKeys)
        {
            if (findResource(key) is double size)
            {
                tokens[key] = $"{size:0.##}px";
            }
        }
        foreach (var key in CornerRadiusKeys)
        {
            if (findResource(key) is CornerRadius corner)
            {
                tokens[key] = $"{corner.TopLeft:0.##}px";
            }
        }
        foreach (var key in ThicknessKeys)
        {
            if (findResource(key) is Thickness thickness)
            {
                tokens[key] = ThicknessToCss(thickness);
            }
        }
        return tokens;
    }

    public static string BuildCss(Func<string, object?> findResource) =>
        WebViewProtocol.BuildThemeCss(BuildTokens(findResource));

    /// <summary>WPF thickness (l, t, r, b) → CSS shorthand (top right bottom left).</summary>
    public static string ThicknessToCss(Thickness thickness) =>
        $"{thickness.Top:0.##}px {thickness.Right:0.##}px {thickness.Bottom:0.##}px {thickness.Left:0.##}px";

    private static string? BrushToCss(System.Windows.Media.Brush brush) => brush switch
    {
        System.Windows.Media.SolidColorBrush solid => ColorToHex(solid.Color),
        System.Windows.Media.LinearGradientBrush gradient => GradientToCss(gradient),
        _ => null,
    };

    private static string ColorToHex(System.Windows.Media.Color color) =>
        $"#{color.R:x2}{color.G:x2}{color.B:x2}";

    private static string ColorToHexWithAlpha(System.Windows.Media.Color color) =>
        $"#{color.A:x2}{color.R:x2}{color.G:x2}{color.B:x2}";

    private static string GradientToCss(System.Windows.Media.LinearGradientBrush gradient)
    {
        var stops = string.Join(
            ", ",
            gradient.GradientStops.OrderBy(stop => stop.Offset).Select(stop =>
                $"{ColorToHexWithAlpha(stop.Color)} {stop.Offset * 100:0.##}%"));
        return $"linear-gradient({GradientAngleDegrees(gradient)}deg, {stops})";
    }

    /// <summary>WPF mapping-mode gradient vector → CSS gradient angle (0deg points up).</summary>
    private static int GradientAngleDegrees(System.Windows.Media.LinearGradientBrush gradient)
    {
        var dx = gradient.EndPoint.X - gradient.StartPoint.X;
        var dy = gradient.EndPoint.Y - gradient.StartPoint.Y;
        var degrees = Math.Atan2(dy, dx) * 180 / Math.PI + 90;
        return ((int)Math.Round(degrees) % 360 + 360) % 360;
    }
}
