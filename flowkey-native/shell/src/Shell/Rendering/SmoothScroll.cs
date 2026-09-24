using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace FlowKey.Shell.Rendering;

public static class SmoothScroll
{
    private const int AnimationMs = 160;
    private const double ItemStep = 2.0;

    public static readonly DependencyProperty EnabledProperty = DependencyProperty.RegisterAttached(
        "Enabled", typeof(bool), typeof(SmoothScroll), new PropertyMetadata(false, OnEnabledChanged));

    private static readonly DependencyProperty TargetProperty = DependencyProperty.RegisterAttached(
        "Target", typeof(double), typeof(SmoothScroll), new PropertyMetadata(double.NaN, OnTargetChanged));

    public static bool GetEnabled(DependencyObject obj) => (bool)obj.GetValue(EnabledProperty);

    public static void SetEnabled(DependencyObject obj, bool value) => obj.SetValue(EnabledProperty, value);

    private static void OnEnabledChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is FrameworkElement element)
        {
            if ((bool)e.NewValue)
            {
                element.PreviewMouseWheel += OnPreviewMouseWheel;
            }
            else
            {
                element.PreviewMouseWheel -= OnPreviewMouseWheel;
            }
        }
    }

    private static void OnPreviewMouseWheel(object sender, MouseWheelEventArgs e)
    {
        if (e.Delta == 0)
        {
            return;
        }
        var viewer = FindScrollViewer(sender as DependencyObject);
        if (viewer is null || viewer.ScrollableHeight <= 0)
        {
            return;
        }
        var current = (double)viewer.GetValue(TargetProperty);
        if (double.IsNaN(current) || Math.Abs(current - viewer.VerticalOffset) > 3)
        {
            current = viewer.VerticalOffset;
        }
        var step = viewer.CanContentScroll ? e.Delta / 120.0 * ItemStep : e.Delta;
        var target = Math.Clamp(current - step, 0, viewer.ScrollableHeight);
        var animation = new DoubleAnimation(current, target, TimeSpan.FromMilliseconds(AnimationMs))
        {
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        viewer.SetValue(TargetProperty, target);
        viewer.BeginAnimation(TargetProperty, animation);
        e.Handled = true;
    }

    private static void OnTargetChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is ScrollViewer viewer)
        {
            viewer.ScrollToVerticalOffset((double)e.NewValue);
        }
    }

    private static ScrollViewer? FindScrollViewer(DependencyObject root)
    {
        if (root is ScrollViewer direct)
        {
            return direct;
        }
        var count = VisualTreeHelper.GetChildrenCount(root);
        for (var i = 0; i < count; i++)
        {
            var found = FindScrollViewer(VisualTreeHelper.GetChild(root, i));
            if (found is not null)
            {
                return found;
            }
        }
        return null;
    }
}
