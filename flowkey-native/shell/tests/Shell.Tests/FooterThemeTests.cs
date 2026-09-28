using System.Windows;
using System.Windows.Media;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class FooterThemeTests
{
    private static LinearGradientBrush ErrorGradient() => new()
    {
        StartPoint = new Point(0, 0),
        EndPoint = new Point(1, 0),
        GradientStops =
        {
            new GradientStop(Color.FromArgb(0x96, 0x46, 0x23, 0x23), 0),
            new GradientStop(Color.FromArgb(0x59, 0x46, 0x23, 0x23), 0.45),
            new GradientStop(Color.FromArgb(0x00, 0x46, 0x23, 0x23), 1),
        },
    };

    private static IReadOnlyDictionary<string, object> Resources()
    {
        SolidColorBrush Brush(byte r, byte g, byte b) => new(Color.FromRgb(r, g, b));
        return new Dictionary<string, object>
        {
            ["WindowBackgroundBrush"] = Brush(0x1F, 0x1F, 0x1F),
            ["TextPrimaryBrush"] = Brush(0xFF, 0xFF, 0xFF),
            ["TextSecondaryBrush"] = Brush(0xA6, 0xA6, 0xA6),
            ["DividerBrush"] = Brush(0x36, 0x36, 0x36),
            ["KeycapBackgroundBrush"] = Brush(0x35, 0x35, 0x35),
            ["KeycapBorderBrush"] = Brush(0x4B, 0x4B, 0x4B),
            ["EnterKeycapBackgroundBrush"] = Brush(0x1F, 0x1F, 0x1F),
            ["ActionPanelBackgroundBrush"] = Brush(0x1E, 0x1E, 0x1E),
            ["FooterToastDotBrush"] = Brush(0xFF, 0x5C, 0x5C),
            ["FooterToastErrorBrush"] = ErrorGradient(),
            ["FooterHeight"] = 40d,
            ["FooterFontSize"] = 13d,
            ["KeycapFontSize"] = 11d,
            ["GlyphFontSize"] = 12d,
            ["FooterIconSize"] = 16d,
            ["FooterDividerHeight"] = 16d,
            ["FooterPillHeight"] = 32d,
            ["KeycapCornerRadius"] = new CornerRadius(5),
            ["FooterPillCornerRadius"] = new CornerRadius(16),
            ["FooterPillPadding"] = new Thickness(12, 0, 16, 0),
            ["FooterPillIconPadding"] = new Thickness(12, 0, 12, 0),
            ["FooterPillMargin"] = new Thickness(12, 0, 12, 8),
            ["KeycapPadding"] = new Thickness(6, 2, 6, 2),
            ["KeycapMargin"] = new Thickness(8, 0, 0, 0),
            ["KeycapSpacing"] = new Thickness(0, 0, 4, 0),
            ["FooterDividerMargin"] = new Thickness(12, 0, 12, 0),
            ["ActionsLabelMargin"] = new Thickness(0, 0, 6, 0),
            ["IconMargin"] = new Thickness(0, 0, 10, 0),
        };
    }

    private static Func<string, object?> Lookup() =>
        key => Resources().TryGetValue(key, out var value) ? value : null;

    [Fact]
    public void ThicknessToCssUsesTopRightBottomLeftOrder()
    {
        Assert.Equal("0px 0px 0px 16px", FooterTheme.ThicknessToCss(new Thickness(16, 0, 0, 0)));
        Assert.Equal("2px 6px 2px 6px", FooterTheme.ThicknessToCss(new Thickness(6, 2, 6, 2)));
    }

    [Fact]
    public void BuildTokensMapsBrushesToHexColors()
    {
        var tokens = FooterTheme.BuildTokens(Lookup());

        Assert.Equal("#363636", tokens["DividerBrush"]);
        Assert.Equal("#1f1f1f", tokens["EnterKeycapBackgroundBrush"]);
        Assert.Equal("#1e1e1e", tokens["ActionPanelBackgroundBrush"]);
        Assert.Equal("#ff5c5c", tokens["FooterToastDotBrush"]);
    }

    [Fact]
    public void BuildTokensMapsSizesShapesAndSpacing()
    {
        var tokens = FooterTheme.BuildTokens(Lookup());

        Assert.Equal("40px", tokens["FooterHeight"]);
        Assert.Equal("13px", tokens["FooterFontSize"]);
        Assert.Equal("11px", tokens["KeycapFontSize"]);
        Assert.Equal("16px", tokens["FooterIconSize"]);
        Assert.Equal("32px", tokens["FooterPillHeight"]);
        Assert.Equal("5px", tokens["KeycapCornerRadius"]);
        Assert.Equal("16px", tokens["FooterPillCornerRadius"]);
        Assert.Equal("0px 16px 0px 12px", tokens["FooterPillPadding"]);
        Assert.Equal("0px 12px 0px 12px", tokens["FooterPillIconPadding"]);
        Assert.Equal("0px 12px 8px 12px", tokens["FooterPillMargin"]);
        Assert.Equal("2px 6px 2px 6px", tokens["KeycapPadding"]);
    }

    [Fact]
    public void BuildTokensMapsTheErrorToastGradient()
    {
        var tokens = FooterTheme.BuildTokens(Lookup());

        Assert.Equal(
            "linear-gradient(90deg, #96462323 0%, #59462323 45%, #00462323 100%)",
            tokens["FooterToastErrorBrush"]);
    }

    [Fact]
    public void BuildCssEmitsFooterVarsUnderRoot()
    {
        var css = FooterTheme.BuildCss(Lookup());

        Assert.StartsWith(":root", css);
        Assert.Contains("--fk-footer-height: 40px", css);
        Assert.Contains("--fk-footer-font-size: 13px", css);
        Assert.Contains("--fk-footer-pill-height: 32px", css);
        Assert.Contains("--fk-footer-pill-corner-radius: 16px", css);
        Assert.Contains("--fk-footer-pill-margin: 0px 12px 8px 12px", css);
        Assert.Contains("--fk-footer-pill-icon-padding: 0px 12px 0px 12px", css);
        Assert.Contains("--fk-action-panel-background: #1e1e1e", css);
        Assert.Contains("--fk-keycap-border: #4b4b4b", css);
        Assert.Contains("--fk-keycap-corner-radius: 5px", css);
        Assert.Contains("--fk-footer-toast-error: linear-gradient(90deg, #96462323 0%, #59462323 45%, #00462323 100%)", css);
    }

    [Fact]
    public void BuildTokensToleratesMissingResources()
    {
        var tokens = FooterTheme.BuildTokens(_ => null);

        Assert.Empty(tokens);
    }
}
