using System.Diagnostics;
using System.IO;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Input;
using FontFamily = System.Windows.Media.FontFamily;
using Button = System.Windows.Controls.Button;
using Cursors = System.Windows.Input.Cursors;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Rendering;

public static class DetailRenderer
{
    public static FrameworkElement Render(DetailTree tree, Action<UiAction> onAction)
    {
        var left = new StackPanel { Margin = new Thickness(18, 14, 18, 14) };

        var title = PrimaryText(tree.Title);
        title.FontSize = 26;
        title.FontWeight = FontWeights.Bold;
        title.TextWrapping = TextWrapping.Wrap;
        left.Children.Add(title);

        if (!string.IsNullOrEmpty(tree.Subtitle))
        {
            var subtitle = SecondaryText(tree.Subtitle);
            subtitle.FontSize = 14;
            subtitle.Margin = new Thickness(0, 4, 0, 0);
            left.Children.Add(subtitle);
        }

        if (!string.IsNullOrEmpty(tree.ImageUri) && IconUriPolicy.TryGetLocalPath(tree.ImageUri, out var imagePath) && File.Exists(imagePath))
        {
            var image = new System.Windows.Controls.Image
            {
                Source = LoadBitmap(imagePath),
                MaxWidth = 200,
                MaxHeight = 200,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Left,
                Margin = new Thickness(0, 14, 0, 0),
            };
            left.Children.Add(image);
        }
        else if (!string.IsNullOrEmpty(tree.ImageUri) && IconUriPolicy.DecodeDataUri(tree.ImageUri) is { } bytes)
        {
            var image = new System.Windows.Controls.Image
            {
                Source = LoadBitmapFromBytes(bytes),
                MaxWidth = 200,
                MaxHeight = 200,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Left,
                Margin = new Thickness(0, 14, 0, 0),
            };
            left.Children.Add(image);
        }

        if (!string.IsNullOrEmpty(tree.Description))
        {
            var result = MarkdownLite.Parse(tree.Description);
            foreach (var node in result.Nodes)
            {
                left.Children.Add(RenderNode(node, onAction));
            }
        }

        var rail = new StackPanel { Margin = new Thickness(4, 16, 16, 14) };
        foreach (var field in tree.Fields)
        {
            var label = SecondaryText(field.Label);
            label.FontSize = 12;
            rail.Children.Add(label);
            var value = PrimaryText(field.Value);
            value.FontSize = 14;
            value.FontWeight = FontWeights.SemiBold;
            value.TextWrapping = TextWrapping.Wrap;
            value.Margin = new Thickness(0, 1, 0, 10);
            rail.Children.Add(value);
        }

        var railBorder = new Border();
        railBorder.SetResourceReference(Border.BorderBrushProperty, "SeparatorBrush");
        railBorder.BorderThickness = new Thickness(1, 0, 0, 0);
        railBorder.Child = rail;

        var columns = new Grid { Margin = new Thickness(0) };
        columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(280) });
        Grid.SetColumn(left, 0);
        Grid.SetColumn(railBorder, 1);
        columns.Children.Add(left);
        columns.Children.Add(railBorder);

        return new ScrollViewer
        {
            Content = columns,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        };
    }

    private static ImageSource? LoadBitmap(string path)
    {
        try
        {
            var bitmap = new System.Windows.Media.Imaging.BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
            bitmap.UriSource = new Uri(path, UriKind.Absolute);
            bitmap.EndInit();
            bitmap.Freeze();
            return bitmap;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static ImageSource? LoadBitmapFromBytes(byte[] bytes)
    {
        try
        {
            var image = new System.Windows.Media.Imaging.BitmapImage();
            using var stream = new MemoryStream(bytes);
            image.BeginInit();
            image.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
            image.StreamSource = stream;
            image.EndInit();
            image.Freeze();
            return image;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static FrameworkElement RenderNode(MdNode node, Action<UiAction> onAction)
    {
        switch (node)
        {
            case MdHeading heading:
                var headingBlock = WrapInlines(heading.Inlines, onAction, 15, FontWeights.SemiBold);
                return new StackPanel
                {
                    Margin = new Thickness(0, 10, 0, 2),
                    Children = { headingBlock },
                };
            case MdCodeBlock code:
                var codeBorder = new Border
                {
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(8),
                    Margin = new Thickness(0, 6, 0, 6),
                };
                codeBorder.SetResourceReference(Border.BackgroundProperty, "SurfaceAltBrush");
                var codeText = PrimaryText(code.Text);
                codeText.FontFamily = new FontFamily("Consolas");
                codeText.FontSize = 12;
                codeBorder.Child = codeText;
                return codeBorder;
            case MdListItem list:
                var bullet = SecondaryText(list.Number is null ? "•  " : list.Number + ".  ");
                return new StackPanel
                {
                    Orientation = System.Windows.Controls.Orientation.Horizontal,
                    Margin = new Thickness(10, 1, 0, 1),
                    Children =
                    {
                        bullet,
                        BuildInlinePanel(list.Inlines, onAction),
                    },
                };
            case MdTruncationNotice:
                var notice = SecondaryText("… document truncated (size limit)");
                notice.FontStyle = FontStyles.Italic;
                notice.Margin = new Thickness(0, 6, 0, 0);
                return notice;
            default:
            {
                var paragraph = (MdParagraph)node;
                return WrapInlines(paragraph.Inlines, onAction, 13, FontWeights.Normal, wrap: true);
            }
        }
    }

    private static TextBlock WrapInlines(MdInline[] inlines, Action<UiAction> onAction, double size, FontWeight weight, bool wrap = false)
    {
        var textBlock = new TextBlock
        {
            FontSize = size,
            FontWeight = weight,
            TextWrapping = wrap ? TextWrapping.Wrap : TextWrapping.NoWrap,
        };
        textBlock.SetResourceReference(TextBlock.ForegroundProperty, "TextPrimaryBrush");
        foreach (var inline in inlines)
        {
            switch (inline)
            {
                case MdInline.Text t:
                    textBlock.Inlines.Add(new Run(t.Value));
                    break;
                case MdInline.Bold b:
                    textBlock.Inlines.Add(new Run(b.Value) { FontWeight = FontWeights.Bold });
                    break;
                case MdInline.Italic i:
                    textBlock.Inlines.Add(new Run(i.Value) { FontStyle = FontStyles.Italic });
                    break;
                case MdInline.Code c:
                    var codeRun = new Run(c.Value)
                    {
                        FontFamily = new FontFamily("Consolas"),
                    };
                    codeRun.SetResourceReference(TextElement.BackgroundProperty, "SurfaceBrush");
                    textBlock.Inlines.Add(codeRun);
                    break;
                case MdInline.Link link:
                    textBlock.Inlines.Add(BuildLinkRun(link));
                    break;
            }
        }
        return textBlock;
    }

    private static Hyperlink BuildLinkRun(MdInline.Link link)
    {
        var openable = MarkdownLite.IsLinkOpenable(link.Href, out var canonical, out var reason);
        var run = new Run(link.Label);
        run.SetResourceReference(TextElement.ForegroundProperty, openable ? "AccentBrush" : "TextSecondaryBrush");
        run.TextDecorations = openable ? TextDecorations.Underline : null;
        if (openable)
        {
            var hyperlink = new Hyperlink(run)
            {
                ToolTip = canonical,
            };
            hyperlink.Click += (_, _) =>
            {
                try
                {
                    Process.Start(new ProcessStartInfo(canonical) { UseShellExecute = true });
                }
                catch
                {
                    /* browser launch is best-effort */
                }
            };
            return hyperlink;
        }
        var blocked = new Hyperlink(run)
        {
            ToolTip = "link blocked: " + reason,
            IsEnabled = false,
        };
        return blocked;
    }

    private static StackPanel BuildInlinePanel(MdInline[] inlines, Action<UiAction> onAction)
    {
        var panel = new StackPanel { Orientation = System.Windows.Controls.Orientation.Horizontal };
        foreach (var inline in inlines)
        {
            switch (inline)
            {
                case MdInline.Text t:
                    panel.Children.Add(InlineText(t.Value));
                    break;
                case MdInline.Bold b:
                    var bold = InlineText(b.Value);
                    bold.FontWeight = FontWeights.Bold;
                    panel.Children.Add(bold);
                    break;
                case MdInline.Italic i:
                    var italic = InlineText(i.Value);
                    italic.FontStyle = FontStyles.Italic;
                    panel.Children.Add(italic);
                    break;
                case MdInline.Code c:
                    var code = InlineText(c.Value);
                    code.FontFamily = new FontFamily("Consolas");
                    code.SetResourceReference(TextBlock.BackgroundProperty, "SurfaceBrush");
                    panel.Children.Add(code);
                    break;
                case MdInline.Link link:
                    panel.Children.Add(BuildLink(link, onAction));
                    break;
            }
        }
        return panel;
    }

    private static TextBlock InlineText(string value) => PrimaryText(value);

    private static TextBlock PrimaryText(string value)
    {
        var textBlock = new TextBlock { Text = value };
        textBlock.SetResourceReference(TextBlock.ForegroundProperty, "TextPrimaryBrush");
        return textBlock;
    }

    private static TextBlock SecondaryText(string value)
    {
        var textBlock = new TextBlock { Text = value };
        textBlock.SetResourceReference(TextBlock.ForegroundProperty, "TextSecondaryBrush");
        return textBlock;
    }

    private static TextBlock BuildLink(MdInline.Link link, Action<UiAction> onAction)
    {
        var openable = MarkdownLite.IsLinkOpenable(link.Href, out var canonical, out var reason);
        var textBlock = new TextBlock { Text = link.Label };
        textBlock.SetResourceReference(TextBlock.ForegroundProperty, openable ? "AccentBrush" : "TextSecondaryBrush");
        textBlock.Cursor = openable ? Cursors.Hand : Cursors.Arrow;
        textBlock.TextDecorations = openable ? TextDecorations.Underline : null;
        textBlock.ToolTip = openable ? canonical : $"link blocked: {reason}";
        if (openable)
        {
            textBlock.MouseLeftButtonDown += (_, _) =>
            {
                try
                {
                    Process.Start(new ProcessStartInfo(canonical) { UseShellExecute = true });
                }
                catch
                {
                    /* browser launch is best-effort */
                }
            };
        }
        return textBlock;
    }
}
