using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using FlowKey.Shell.Native;
using WpfImage = System.Windows.Controls.Image;
using Orientation = System.Windows.Controls.Orientation;

namespace FlowKey.Shell.Windows;

/// <summary>
/// Extension-facing toast surface (`toast.show`): a bottom-right, non-activating
/// notification with a style accent bar, optional icon, title and message.
/// One toast is visible at a time; a new request replaces the current one.
/// </summary>
public sealed class ToastWindow : Window
{
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int MONITOR_DEFAULTTONEAREST = 2;
    private const double ToastEdgeMargin = 12;

    private readonly DispatcherTimer dismissTimer;
    private readonly Border accentBar;
    private readonly Border iconHost;
    private readonly StackPanel textStack;
    private readonly TextBlock titleText;
    private readonly TextBlock messageText;

    public ToastWindow()
    {
        Title = "FlowKey Toast";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        ShowActivated = false;
        Focusable = false;
        Topmost = true;
        SizeToContent = SizeToContent.WidthAndHeight;
        // Without this the non-client area of a WindowStyle.None window renders
        // black behind the rounded border.
        AllowsTransparency = true;
        Background = System.Windows.Media.Brushes.Transparent;
        SetResourceReference(FontFamilyProperty, "AppFontFamily");

        titleText = new TextBlock
        {
            FontWeight = FontWeights.Medium,
            TextTrimming = TextTrimming.CharacterEllipsis,
            MaxWidth = 420,
        };
        titleText.SetResourceReference(TextBlock.ForegroundProperty, "TextPrimaryBrush");
        titleText.SetResourceReference(TextBlock.FontSizeProperty, "HudFontSize");

        messageText = new TextBlock
        {
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = 420,
            Margin = new Thickness(0, 4, 0, 0),
            Visibility = Visibility.Collapsed,
        };
        messageText.SetResourceReference(TextBlock.ForegroundProperty, "TextSecondaryBrush");
        messageText.SetResourceReference(TextBlock.FontSizeProperty, "FooterFontSize");

        iconHost = new Border
        {
            Width = 22,
            Height = 22,
            VerticalAlignment = VerticalAlignment.Top,
            Visibility = Visibility.Collapsed,
        };

        accentBar = new Border
        {
            Width = 4,
            CornerRadius = new CornerRadius(2),
            VerticalAlignment = VerticalAlignment.Stretch,
        };
        accentBar.SetResourceReference(Border.BackgroundProperty, "AccentBrush");

        textStack = new StackPanel { Margin = new Thickness(12, 0, 0, 0) };
        textStack.Children.Add(titleText);
        textStack.Children.Add(messageText);

        var contentStack = new StackPanel { Orientation = Orientation.Horizontal };
        contentStack.Children.Add(accentBar);
        contentStack.Children.Add(iconHost);
        contentStack.Children.Add(textStack);

        var root = new Border
        {
            Child = contentStack,
            BorderThickness = new Thickness(1),
        };
        root.SetResourceReference(Border.BackgroundProperty, "SurfaceBrush");
        root.SetResourceReference(Border.BorderBrushProperty, "TileBorderBrush");
        root.SetResourceReference(Border.CornerRadiusProperty, "WindowCornerRadius");
        root.SetResourceReference(FrameworkElement.MarginProperty, "ToastPadding");

        Content = root;

        dismissTimer = new DispatcherTimer();
        dismissTimer.Tick += (_, _) =>
        {
            dismissTimer.Stop();
            Hide();
        };
        SourceInitialized += (_, _) =>
        {
            // No DwmChrome here: the window is a layered (AllowsTransparency)
            // window, so the border Border owns the rounding and the click
            // through/no-activation styles do the rest.
            var source = HwndSource.FromHwnd(new WindowInteropHelper(this).Handle);
            var style = GetWindowLong(source!.Handle, GWL_EXSTYLE);
            SetWindowLong(source.Handle, GWL_EXSTYLE, style | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT);
        };
    }

    public void ShowToast(ToastRequest request)
    {
        titleText.Text = request.Title;
        messageText.Text = request.Message ?? "";
        messageText.Visibility = string.IsNullOrEmpty(request.Message)
            ? Visibility.Collapsed
            : Visibility.Visible;

        accentBar.SetResourceReference(
            Border.BackgroundProperty,
            request.Style switch
            {
                ToastStyle.Success => "SuccessBrush",
                ToastStyle.Failure => "DangerBrush",
                _ => "AccentBrush",
            });

        var icon = BuildIcon(request);
        iconHost.Child = icon;
        iconHost.Visibility = icon is null ? Visibility.Collapsed : Visibility.Visible;
        textStack.Margin = icon is null ? new Thickness(12, 0, 0, 0) : new Thickness(10, 0, 0, 0);

        dismissTimer.Stop();
        dismissTimer.Interval = TimeSpan.FromSeconds(request.DurationSeconds);
        Show();
        Dispatcher.BeginInvoke(DispatcherPriority.Loaded, PositionBottomRight);
        dismissTimer.Start();
    }

    private FrameworkElement? BuildIcon(ToastRequest request)
    {
        if (!string.IsNullOrEmpty(request.IconUri))
        {
            return BuildIconFromUri(request.IconUri);
        }
        if (!string.IsNullOrEmpty(request.Emoji))
        {
            return BuildEmojiIcon(request.Emoji);
        }
        return null;
    }

    private FrameworkElement? BuildIconFromUri(string iconUri)
    {
        if (!IconUriPolicy.TryGetLocalPath(iconUri, out var path) || !File.Exists(path))
        {
            return null;
        }
        try
        {
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.DecodePixelWidth = 44;
            bitmap.UriSource = new Uri(path);
            bitmap.EndInit();
            bitmap.Freeze();
            return new WpfImage { Source = bitmap, Width = 20, Height = 20, VerticalAlignment = VerticalAlignment.Center };
        }
        catch
        {
            return null;
        }
    }

    private FrameworkElement? BuildEmojiIcon(string emoji)
    {
        if (EmojiSpriteRenderer.IsCached(emoji))
        {
            return LoadSprite(emoji);
        }
        EmojiSpriteRenderer.EnsureSprites(new[] { emoji }, () => Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
        {
            if (IsVisible && iconHost.Child is null)
            {
                var sprite = LoadSprite(emoji);
                if (sprite is not null)
                {
                    iconHost.Child = sprite;
                    iconHost.Visibility = Visibility.Visible;
                    textStack.Margin = new Thickness(10, 0, 0, 0);
                }
            }
        }));
        return null;
    }

    private FrameworkElement? LoadSprite(string emoji)
    {
        try
        {
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.UriSource = new Uri(EmojiSpriteRenderer.CachePathFor(emoji));
            bitmap.EndInit();
            bitmap.Freeze();
            return new WpfImage { Source = bitmap, Width = 20, Height = 20, VerticalAlignment = VerticalAlignment.Center };
        }
        catch
        {
            return null;
        }
    }

    private void PositionBottomRight()
    {
        var foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero)
        {
            foreground = new WindowInteropHelper(this).Handle;
        }
        // Work area in DIPs — device pixels would misplace the toast on
        // scaled monitors.
        var monitor = Native.MonitorInfo.FromWindow(foreground);
        if (monitor is null)
        {
            return;
        }
        var work = monitor.WorkArea;
        Left = work.Right - ActualWidth - ToastEdgeMargin;
        Top = work.Bottom - ActualHeight - ToastEdgeMargin;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hwnd, int index);

    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hwnd, int index, int newStyle);
}
