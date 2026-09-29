namespace FlowKey.Shell.Native;

/// <summary>
/// Turns the shell's keyed theme resources into --fk-* CSS custom properties
/// for the settings WebView page. Same pipeline as the footer
/// (<see cref="FooterTheme"/> via <see cref="WebViewProtocol.BuildThemeCss"/>):
/// the page never hardcodes a color, size or radius — it reads these tokens,
/// with fallback values mirroring Theme.xaml for the pre-theme first frame.
/// </summary>
public static class SettingsTheme
{
    private static readonly string[] BrushKeys =
    {
        "WindowBackgroundBrush", "ChromeBackgroundBrush", "ChromeDividerBrush", "ChromeNavDisabledBrush",
        "SurfaceBrush", "SurfaceAltBrush", "RowBackgroundBrush", "RowSelectedBackgroundBrush",
        "DividerBrush", "TextPrimaryBrush", "TextSecondaryBrush", "TextTertiaryBrush",
        "KeycapBackgroundBrush", "KeycapBorderBrush", "AccentBrush", "ActionPanelBackgroundBrush",
        "FooterToastErrorBrush",
    };

    private static readonly string[] SizeKeys =
    {
        "SettingsWindowWidth", "SettingsWindowHeight", "SearchFontSize", "TitleFontSize",
        "SecondaryFontSize", "KindFontSize", "HeaderFontSize", "KeycapFontSize",
    };

    private static readonly string[] CornerRadiusKeys =
    {
        "WindowCornerRadius", "RowCornerRadius", "KeycapCornerRadius", "IconTileCornerRadius",
    };

    public static IReadOnlyDictionary<string, string> BuildTokens(Func<string, object?> findResource)
    {
        var tokens = new Dictionary<string, string>();
        foreach (var key in BrushKeys)
        {
            if (findResource(key) is System.Windows.Media.Brush brush
                && FooterTheme.BrushToCss(brush) is { } brushCss)
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
            if (findResource(key) is System.Windows.CornerRadius corner)
            {
                tokens[key] = $"{corner.TopLeft:0.##}px";
            }
        }
        return tokens;
    }

    public static string BuildCss(Func<string, object?> findResource) =>
        WebViewProtocol.BuildThemeCss(BuildTokens(findResource));
}
