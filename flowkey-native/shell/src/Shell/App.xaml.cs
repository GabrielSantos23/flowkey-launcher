using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows;
using System.Threading.Tasks;
using System.Windows.Threading;
using FlowKey.Shell.Windows;
using FlowKey.Shell.Native;
using Application = System.Windows.Application;

namespace FlowKey.Shell;

public partial class App : Application
{
    private const string SingleInstanceMutexName = "Local\\FlowKey.Shell.SingleInstance";
    private Mutex? singleInstanceMutex;
    private MainWindow? mainWindow;
    private System.Windows.Forms.NotifyIcon? trayIcon;

    protected override void OnStartup(StartupEventArgs e)
    {
        UpdateService.HookInstaller();

        singleInstanceMutex = new Mutex(true, SingleInstanceMutexName, out var isFirstInstance);
        if (!isFirstInstance)
        {
            singleInstanceMutex.Dispose();
            singleInstanceMutex = null;
            Shutdown(0);
            return;
        }

        DispatcherUnhandledException += (_, args) =>
        {
            var animationGlitch =
                args.Exception is System.ArgumentNullException
                && args.Exception.Message.Contains("defaultDestinationValue", StringComparison.Ordinal);
            if (!animationGlitch && args.Exception is System.InvalidOperationException)
            {
                animationGlitch = (args.Exception.StackTrace ?? string.Empty)
                    .Contains("Storyboard.ClockTreeWalkRecursive", StringComparison.Ordinal);
            }
            if (animationGlitch)
            {
                DebugLog.Write("swallowed decorative animation exception: "
                    + args.Exception.GetType().Name + ": " + args.Exception.Message);
                args.Handled = true;
                return;
            }
        };

        base.OnStartup(e);

        mainWindow = new MainWindow();
        MainWindow = mainWindow;
        if (e.Args.Contains("--settings", StringComparer.OrdinalIgnoreCase))
        {
            _ = Task.Run(async () =>
            {
                await Task.Delay(4000);
                mainWindow.Dispatcher.BeginInvoke(() => mainWindow.OpenSettings());
            });
        }

        trayIcon = new System.Windows.Forms.NotifyIcon
        {
            Icon = LoadAppIcon(),
            Visible = true,
            Text = "FlowKey",
        };
        // The WinForms ContextMenuStrip deadlocks when Quit disposes the icon
        // (and even showing it can ghost a taskbar entry) because it pumps its
        // own modal loop against the WPF dispatcher. Use a WPF ContextMenu on
        // right-click instead; it lives entirely on the dispatcher.
        trayIcon.MouseUp += (_, args) =>
        {
            if (args.Button == System.Windows.Forms.MouseButtons.Right)
            {
                Dispatcher.BeginInvoke(ShowTrayMenu, DispatcherPriority.Background);
            }
        };
        trayIcon.DoubleClick += (_, _) => mainWindow.Summon();
    }

    private static System.Drawing.Icon LoadAppIcon()
    {
        try
        {
            var resource = GetResourceStream(new Uri("pack://application:,,,/Assets/AppIcon.ico"));
            using (resource.Stream)
            {
                // The tray renders the 16px entry; the exe's ApplicationIcon
                // (same .ico) covers the taskbar, alt-tab and title bar.
                return new System.Drawing.Icon(resource.Stream, 16, 16);
            }
        }
        catch (Exception exception)
        {
            DebugLog.Write("tray icon load failed, falling back to system icon: "
                + exception.GetType().Name + ": " + exception.Message);
            return System.Drawing.SystemIcons.Application;
        }
    }

    private void ShowTrayMenu()
    {
        CloseTrayMenuHook(); // a previous menu may still be floating
        var menu = new System.Windows.Controls.ContextMenu
        {
            Placement = System.Windows.Controls.Primitives.PlacementMode.MousePoint,
            // Without a placement target the menu never joins the visual tree,
            // and ContextMenu's StaysOpen=true default relies on that tree for
            // outside-click dismissal. StaysOpen=false switches the popup to
            // capture-based dismissal: any click outside closes it.
            PlacementTarget = mainWindow,
            StaysOpen = false,
            Style = (Style)TryFindResource("TrayContextMenu"),
        };

        var open = new System.Windows.Controls.MenuItem
        {
            Header = "Open FlowKey",
            Style = (Style)TryFindResource("TrayMenuItem"),
            Icon = MakeTrayIconImage(),
        };
        open.Click += (_, _) => mainWindow?.Summon();
        menu.Items.Add(open);

        var settings = new System.Windows.Controls.MenuItem
        {
            Header = "Settings…",
            Style = (Style)TryFindResource("TrayMenuItem"),
            Icon = MakeTrayGlyph(""),
        };
        settings.Click += (_, _) => mainWindow?.OpenSettings();
        menu.Items.Add(settings);

        // Raycast-style info block: gray, non-clickable version line.
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";
        menu.Items.Add(new System.Windows.Controls.TextBlock
        {
            Text = "Version: " + version,
            FontSize = 12,
            Margin = new Thickness(10, 8, 10, 4),
            Foreground = (System.Windows.Media.Brush)TryFindResource("TextSecondaryBrush"),
        });

        var quit = new System.Windows.Controls.MenuItem
        {
            Header = "Quit",
            Style = (Style)TryFindResource("TrayMenuItem"),
            Icon = MakeTrayGlyph(""),
        };
        quit.Click += (_, _) => Quit();
        menu.Items.Add(quit);

        menu.IsOpen = true;
        StartTrayMenuOutsideClickHook(menu);
    }

    private static System.Windows.Controls.Image MakeTrayIconImage()
    {
        return new System.Windows.Controls.Image
        {
            Source = new System.Windows.Media.Imaging.BitmapImage(new Uri("pack://application:,,,/Assets/logo.png")),
            Width = 16,
            Height = 16,
        };
    }

    private static System.Windows.Controls.TextBlock MakeTrayGlyph(string glyph)
    {
        return new System.Windows.Controls.TextBlock
        {
            FontFamily = (System.Windows.Media.FontFamily)Application.Current.TryFindResource("GlyphFontFamily"),
            Text = glyph,
            FontSize = 14,
            Foreground = (System.Windows.Media.Brush)Application.Current.TryFindResource("TextSecondaryBrush"),
        };
    }

    private void Quit()
    {
        mainWindow?.Quit();
        // Shutdown must not run inside the menu click callback — the close
        // sequence still needs the dispatcher to pump.
        Dispatcher.BeginInvoke(new Action(() => Shutdown(0)), DispatcherPriority.ApplicationIdle);
    }

    // ---- tray menu outside-click closing --------------------------------
    // A ContextMenu opened from a NotifyIcon never engages WPF's built-in
    // popup dismissal (no focus/capture handshake with the tray click), so a
    // low-level mouse hook closes it when any button lands outside its
    // bounds — the same approach hardcodet's TaskbarIcon uses.

    private ContextMenu? trayMenu;
    private IntPtr trayMenuMouseHook;
    // The unmanaged hook must call a rooted delegate: a method group passed
    // straight to SetWindowsHookEx is collectable, and the next mouse event
    // after a GC FailFasts the process (reproduced: opening Settings).
    private readonly TrayMouseHookProc trayMouseHookProc;

    public App()
    {
        trayMouseHookProc = TrayMenuMouseHookProc;
    }
    private Rect trayMenuScreenBounds;

    private const int WH_MOUSE_LL = 14;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_MBUTTONDOWN = 0x0207;
    private const int WM_XBUTTONDOWN = 0x020B;

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT
    {
        public int X;
        public int Y;
        public uint MouseData;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int hook, TrayMouseHookProc procedure, IntPtr module, uint threadId);

    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? name);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out Win32Rect rect);

    [StructLayout(LayoutKind.Sequential)]
    private struct Win32Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private delegate IntPtr TrayMouseHookProc(int code, IntPtr wParam, IntPtr lParam);

    private void StartTrayMenuOutsideClickHook(ContextMenu menu)
    {
        trayMenu = menu;
        trayMenu.Closed += (_, _) => CloseTrayMenuHook();
        if (trayMenuMouseHook == IntPtr.Zero)
        {
            trayMenuMouseHook = SetWindowsHookEx(WH_MOUSE_LL, trayMouseHookProc, GetModuleHandle(null), 0);
        }
        // the popup HWND only exists after the menu's layout pass
        Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () =>
        {
            if (trayMenu is null || VisualTreeHelper.GetChildrenCount(trayMenu) == 0)
            {
                return;
            }
            if (VisualTreeHelper.GetChild(trayMenu, 0) is not System.Windows.Media.Visual root
                || System.Windows.PresentationSource.FromVisual(root) is not HwndSource source)
            {
                return;
            }
            if (GetWindowRect(source.Handle, out var rect))
            {
                trayMenuScreenBounds = new Rect(rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top);
            }
        });
    }

    private void CloseTrayMenuHook()
    {
        if (trayMenuMouseHook != IntPtr.Zero)
        {
            UnhookWindowsHookEx(trayMenuMouseHook);
            trayMenuMouseHook = IntPtr.Zero;
        }
        if (trayMenu is not null)
        {
            trayMenu.Closed -= (_, _) => CloseTrayMenuHook();
            trayMenu.IsOpen = false;
            trayMenu = null;
        }
    }

    private IntPtr TrayMenuMouseHookProc(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && trayMenu is not null)
        {
            var message = wParam.ToInt32();
            if (message is WM_LBUTTONDOWN or WM_RBUTTONDOWN or WM_MBUTTONDOWN or WM_XBUTTONDOWN)
            {
                var data = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                var inside = trayMenuScreenBounds.Contains(data.X, data.Y);
                if (!inside)
                {
                    Dispatcher.BeginInvoke(CloseTrayMenuHook);
                }
            }
        }
        return CallNextHookEx(trayMenuMouseHook, nCode, wParam, lParam);
    }

    /// <summary>
    /// Releases the single-instance mutex so a restart can claim it before
    /// this process fully exits.
    /// </summary>
    public void ReleaseSingleInstanceMutex()
    {
        try
        {
            singleInstanceMutex?.ReleaseMutex();
        }
        catch (ApplicationException)
        {
            // the startup thread already released it
        }
        singleInstanceMutex?.Dispose();
        singleInstanceMutex = null;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        trayIcon?.Dispose();
        singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }
}
