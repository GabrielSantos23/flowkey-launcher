using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media.Imaging;
using WpfImage = System.Windows.Controls.Image;
using System.Windows.Threading;
using FlowKey.Shell.Native;

namespace FlowKey.Shell.Windows;

public partial class HudWindow : Window
{
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int MONITOR_DEFAULTTONEAREST = 2;
    private const double HudBottomMargin = 12;

    private readonly DispatcherTimer dismissTimer;

    public HudWindow()
    {
        InitializeComponent();
        dismissTimer = new DispatcherTimer();
        dismissTimer.Tick += (_, _) =>
        {
            dismissTimer.Stop();
            Hide();
        };
        SourceInitialized += (_, _) =>
        {
            var source = HwndSource.FromHwnd(new WindowInteropHelper(this).Handle);
            Native.DwmChrome.Apply(source!);
            var style = GetWindowLong(source!.Handle, GWL_EXSTYLE);
            SetWindowLong(source.Handle, GWL_EXSTYLE, style | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT);
        };
    }

    public void ShowHud(HudRequest request)
    {
        TitleText.Text = request.Title;
        var icon = BuildIcon(request);
        IconHost.Child = icon;
        IconHost.Visibility = icon is null ? Visibility.Collapsed : Visibility.Visible;
        TitleText.Margin = icon is null ? new Thickness(0, 0, 0, 0) : new Thickness(12, 0, 0, 0);

        dismissTimer.Stop();
        dismissTimer.Interval = TimeSpan.FromSeconds(request.DurationSeconds);
        if (IsVisible)
        {
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, PositionOverForeground);
        }
        else
        {
            Show();
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, PositionOverForeground);
        }
        dismissTimer.Start();
    }

    private FrameworkElement? BuildIcon(HudRequest request)
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
            return new WpfImage { Source = bitmap, Width = 22, Height = 22, VerticalAlignment = VerticalAlignment.Center };
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
            if (IsVisible && (IconHost.Child is null || IconHost.Visibility == Visibility.Collapsed))
            {
                var sprite = LoadSprite(emoji);
                if (sprite is not null)
                {
                    IconHost.Child = sprite;
                    IconHost.Visibility = Visibility.Visible;
                    TitleText.Margin = new Thickness(12, 0, 0, 0);
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
            return new WpfImage { Source = bitmap, Width = 22, Height = 22, VerticalAlignment = VerticalAlignment.Center };
        }
        catch
        {
            return null;
        }
    }

    private void PositionOverForeground()
    {
        var foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero)
        {
            foreground = new WindowInteropHelper(this).Handle;
        }
        var monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
        var info = MONITORINFO.Create();
        if (!GetMonitorInfo(monitor, ref info))
        {
            return;
        }
        Left = info.rcWork.Left + (info.rcWork.Right - info.rcWork.Left - ActualWidth) / 2;
        Top = info.rcWork.Bottom - ActualHeight - HudBottomMargin;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;

        public static MONITORINFO Create() => new() { cbSize = Marshal.SizeOf<MONITORINFO>() };
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hwnd, int index);

    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hwnd, int index, int newStyle);
}
