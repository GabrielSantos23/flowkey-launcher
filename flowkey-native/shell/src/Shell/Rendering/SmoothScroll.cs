using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace FlowKey.Shell.Rendering;

/// <summary>
/// Browser-style smooth wheel scrolling driven by CompositionTarget.Rendering,
/// following the FluentScrollViewer model: mouse-wheel input adds velocity that
/// friction decays per frame (inertia), touchpad-style input scrolls 1:1 toward
/// an accumulated target. The live VerticalOffset is read every frame, so the
/// animation stays in sync with scrollbar and keyboard scrolling.
/// </summary>
public static class SmoothScroll
{
    /// <summary>
    /// Velocity added per wheel delta unit; higher scrolls faster and farther.
    /// One notch (delta 120) glides ~125px: 120 * 2.0 / 24 / (1 - 0.92).
    /// </summary>
    private const double VelocityFactor = 2.0;

    /// <summary>Velocity retained per reference frame; lower stops sooner.</summary>
    private const double Friction = 0.92;

    /// <summary>Fraction of the remaining distance covered per reference frame in precise mode.</summary>
    private const double LerpFactor = 0.5;

    private const double TargetFrameTime = 1.0 / 144.0;
    private const double VelocityStopThreshold = 0.1;
    private const double ConvergenceThreshold = 0.5;
    private const int WheelDeltaPerNotch = 120;
    private const double ItemStep = 2.0;

    public static readonly DependencyProperty EnabledProperty = DependencyProperty.RegisterAttached(
        "Enabled", typeof(bool), typeof(SmoothScroll), new PropertyMetadata(false, OnEnabledChanged));

    private sealed class ScrollState
    {
        public double TargetOffset;
        public double TargetVelocity;
        public bool Precise;
        public bool Hooked;
        public long LastTimestamp;
        public int LastScrollTick;
        public int LastScrollDelta;
        public EventHandler? Handler;
    }

    private static readonly ConditionalWeakTable<ScrollViewer, ScrollState> States = new();

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
        e.Handled = true;

        var state = States.GetOrCreateValue(viewer);
        var itemScrolling = viewer.CanContentScroll
            && VirtualizingPanel.GetScrollUnit(viewer) == ScrollUnit.Item;
        state.Precise = IsTouchpadScroll(e, state);

        if (state.Precise)
        {
            // Precise (1:1) scrolling toward a target; zero stale inertia.
            state.TargetVelocity = 0;
            var delta = itemScrolling
                ? -e.Delta / WheelDeltaPerNotch * ItemStep
                : (double)-e.Delta;
            state.TargetOffset = Math.Clamp(
                viewer.VerticalOffset + delta, 0, viewer.ScrollableHeight);
        }
        else
        {
            // Mouse wheel: accumulate velocity for inertia scrolling.
            state.TargetVelocity += -e.Delta * VelocityFactor;
        }

        if (!state.Hooked)
        {
            state.Hooked = true;
            state.LastTimestamp = Stopwatch.GetTimestamp();
            state.Handler = (_, _) => OnFrame(viewer, state);
            CompositionTarget.Rendering += state.Handler;
        }
    }

    private static bool IsTouchpadScroll(MouseWheelEventArgs e, ScrollState state)
    {
        // No direct API distinguishes touchpad from mouse; a non-multiple of the
        // standard wheel delta (or rapid such deltas) implies a touchpad.
        var isTouchpad = e.Delta % WheelDeltaPerNotch != 0
            || (e.Timestamp - state.LastScrollTick < 100
                && state.LastScrollDelta % WheelDeltaPerNotch != 0);
        state.LastScrollDelta = e.Delta;
        state.LastScrollTick = e.Timestamp;
        return isTouchpad;
    }

    private static void OnFrame(ScrollViewer viewer, ScrollState state)
    {
        if (!viewer.IsLoaded)
        {
            StopRendering(state);
            return;
        }
        var now = Stopwatch.GetTimestamp();
        var deltaTime = (now - state.LastTimestamp) / (double)Stopwatch.Frequency;
        state.LastTimestamp = now;

        var timeFactor = deltaTime / TargetFrameTime;
        var currentOffset = viewer.VerticalOffset;

        if (state.Precise)
        {
            var lerpAmount = 1.0 - Math.Pow(1.0 - LerpFactor, timeFactor);
            currentOffset += (state.TargetOffset - currentOffset) * lerpAmount;
            if (Math.Abs(state.TargetOffset - currentOffset) < ConvergenceThreshold)
            {
                currentOffset = state.TargetOffset;
                viewer.ScrollToVerticalOffset(currentOffset);
                StopRendering(state);
                return;
            }
        }
        else
        {
            if (Math.Abs(state.TargetVelocity) < VelocityStopThreshold)
            {
                StopRendering(state);
                return;
            }
            state.TargetVelocity *= Math.Pow(Friction, timeFactor);
            currentOffset = Math.Clamp(
                currentOffset + state.TargetVelocity * (timeFactor / 24.0), 0, viewer.ScrollableHeight);
        }

        viewer.ScrollToVerticalOffset(currentOffset);
    }

    private static void StopRendering(ScrollState state)
    {
        if (state.Handler is not null)
        {
            CompositionTarget.Rendering -= state.Handler;
        }
        state.Handler = null;
        state.Hooked = false;
        state.TargetVelocity = 0;
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
