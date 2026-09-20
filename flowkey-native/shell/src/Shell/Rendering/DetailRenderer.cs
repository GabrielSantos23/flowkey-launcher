using System.Diagnostics;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Input;
using FontFamily = System.Windows.Media.FontFamily;
using Color = System.Windows.Media.Color;
using ColorConverter = System.Windows.Media.ColorConverter;
using Button = System.Windows.Controls.Button;
using Cursors = System.Windows.Input.Cursors;
using System.Windows.Media;
using FlowKey.Shell.Native;
using FlowKey.Shell.Protocol;

namespace FlowKey.Shell.Rendering;

public static class DetailRenderer
{
    public static FrameworkElement Render(DetailTree tree, Action<UiAction> onAction)
    {
        var root = new StackPanel { Margin = new Thickness(14, 10, 14, 10) };

        var title = new TextBlock
        {
            Text = tree.Title,
            FontSize = 17,
            FontWeight = FontWeights.SemiBold,
            Foreground = Brush("#E6E6EF"),
            TextWrapping = TextWrapping.Wrap,
        };
        root.Children.Add(title);

        foreach (var field in tree.Fields)
        {
            var row = new StackPanel { Orientation = System.Windows.Controls.Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 0) };
            row.Children.Add(new TextBlock
            {
                Text = field.Label + ":",
                Foreground = Brush("#8A8A9A"),
                MinWidth = 110,
            });
            row.Children.Add(new TextBlock
            {
                Text = field.Value,
                Foreground = Brush("#E6E6EF"),
                TextWrapping = TextWrapping.Wrap,
            });
            root.Children.Add(row);
        }

        if (!string.IsNullOrEmpty(tree.Description))
        {
            var result = MarkdownLite.Parse(tree.Description);
            foreach (var node in result.Nodes)
            {
                root.Children.Add(RenderNode(node, onAction));
            }
        }

        if (tree.Actions.Count > 0)
        {
            var actionsPanel = new StackPanel { Orientation = System.Windows.Controls.Orientation.Horizontal, Margin = new Thickness(0, 12, 0, 0) };
            foreach (var action in tree.Actions)
            {
                var button = new Button
                {
                    Content = action.Title,
                    Padding = new Thickness(12, 4, 12, 4),
                    Margin = new Thickness(0, 0, 8, 0),
                };
                var captured = action;
                button.Click += (_, _) => onAction(captured);
                actionsPanel.Children.Add(button);
            }
            root.Children.Add(actionsPanel);
        }

        var scroll = new ScrollViewer
        {
            Content = root,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        };
        return scroll;
    }

    private static FrameworkElement RenderNode(MdNode node, Action<UiAction> onAction)
    {
        switch (node)
        {
            case MdHeading heading:
                return new StackPanel
                {
                    Margin = new Thickness(0, 10, 0, 2),
                    Children =
                    {
                        WrapInlines(heading.Inlines, onAction, 15, FontWeights.SemiBold),
                    },
                };
            case MdCodeBlock code:
                return new Border
                {
                    Background = Brush("#16161E"),
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(8),
                    Margin = new Thickness(0, 6, 0, 6),
                    Child = new TextBlock
                    {
                        Text = code.Text,
                        FontFamily = new FontFamily("Consolas"),
                        FontSize = 12,
                        Foreground = Brush("#D8D8E4"),
                    },
                };
            case MdListItem list:
                return new StackPanel
                {
                    Orientation = System.Windows.Controls.Orientation.Horizontal,
                    Margin = new Thickness(10, 1, 0, 1),
                    Children =
                    {
                        new TextBlock
                        {
                            Text = list.Number is null ? "•  " : list.Number + ".  ",
                            Foreground = Brush("#8A8A9A"),
                        },
                        BuildInlinePanel(list.Inlines, onAction),
                    },
                };
            case MdTruncationNotice:
                return new TextBlock
                {
                    Text = "… document truncated (size limit)",
                    FontStyle = FontStyles.Italic,
                    Foreground = Brush("#8A8A9A"),
                    Margin = new Thickness(0, 6, 0, 0),
                };
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
            Foreground = Brush("#E6E6EF"),
            TextWrapping = wrap ? TextWrapping.Wrap : TextWrapping.NoWrap,
        };
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
                    textBlock.Inlines.Add(new Run(c.Value)
                    {
                        FontFamily = new FontFamily("Consolas"),
                        Background = Brush("#26262E"),
                    });
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
        var run = new Run(link.Label)
        {
            Foreground = openable ? Brush("#4F8CFF") : Brush("#8A8A9A"),
            TextDecorations = openable ? TextDecorations.Underline : null,
        };
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
                    code.Background = Brush("#26262E");
                    panel.Children.Add(code);
                    break;
                case MdInline.Link link:
                    panel.Children.Add(BuildLink(link, onAction));
                    break;
            }
        }
        return panel;
    }

    private static TextBlock InlineText(string value) => new()
    {
        Text = value,
        Foreground = Brush("#E6E6EF"),
    };

    private static TextBlock BuildLink(MdInline.Link link, Action<UiAction> onAction)
    {
        var openable = MarkdownLite.IsLinkOpenable(link.Href, out var canonical, out var reason);
        var textBlock = new TextBlock
        {
            Text = link.Label,
            Foreground = openable ? Brush("#4F8CFF") : Brush("#8A8A9A"),
            Cursor = openable ? Cursors.Hand : Cursors.Arrow,
            TextDecorations = openable ? TextDecorations.Underline : null,
        };
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

    private static SolidColorBrush Brush(string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        brush.Freeze();
        return brush;
    }
}
