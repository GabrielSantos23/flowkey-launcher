using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using FlowKey.Shell.Sidecar;
using Application = System.Windows.Application;
using Brush = System.Windows.Media.Brush;

namespace FlowKey.Shell.Rendering;

/// <summary>
/// Builds the title TextBlock's inlines from the row's fuzzy match so the
/// query's hits render accent-tinted, Raycast-style. Bound directly to the
/// row, so a recycled list item re-runs when its DataContext changes.
/// </summary>
public static class MatchHighlight
{
    public static readonly DependencyProperty RowProperty = DependencyProperty.RegisterAttached(
        "Row",
        typeof(ItemRow),
        typeof(MatchHighlight),
        new PropertyMetadata(null, OnRowChanged));

    public static void SetRow(TextBlock textBlock, ItemRow? value) => textBlock.SetValue(RowProperty, value);

    public static ItemRow? GetRow(TextBlock textBlock) => (ItemRow?)textBlock.GetValue(RowProperty);

    private static void OnRowChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not TextBlock textBlock)
        {
            return;
        }
        textBlock.Inlines.Clear();
        if (e.NewValue is not ItemRow row)
        {
            return;
        }
        var title = row.Item.Title ?? "";
        var indices = row.MatchIndices;
        if (indices is not { Count: > 0 })
        {
            textBlock.Inlines.Add(new Run(title));
            return;
        }
        var highlighted = new HashSet<int>(indices);
        var accent = (Brush)Application.Current.FindResource("AccentBrush");
        var buffer = new StringBuilder();
        var currentHighlight = false;
        void Flush()
        {
            if (buffer.Length == 0)
            {
                return;
            }
            var run = new Run(buffer.ToString());
            if (currentHighlight)
            {
                run.Foreground = accent;
            }
            textBlock.Inlines.Add(run);
            buffer.Clear();
        }
        for (var i = 0; i < title.Length; i++)
        {
            var isHighlighted = highlighted.Contains(i);
            if (isHighlighted != currentHighlight)
            {
                Flush();
                currentHighlight = isHighlighted;
            }
            buffer.Append(title[i]);
        }
        Flush();
    }
}
