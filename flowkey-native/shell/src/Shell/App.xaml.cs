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
            Icon = System.Drawing.SystemIcons.Application,
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

    private void ShowTrayMenu()
    {
        var menu = new System.Windows.Controls.ContextMenu
        {
            Placement = System.Windows.Controls.Primitives.PlacementMode.MousePoint,
        };
        var show = new System.Windows.Controls.MenuItem { Header = "Show" };
        show.Click += (_, _) => mainWindow?.Summon();
        var quit = new System.Windows.Controls.MenuItem { Header = "Quit" };
        quit.Click += (_, _) => Quit();
        menu.Items.Add(show);
        menu.Items.Add(quit);
        menu.IsOpen = true;
    }

    private void Quit()
    {
        mainWindow?.Quit();
        // Shutdown must not run inside the menu click callback — the close
        // sequence still needs the dispatcher to pump.
        Dispatcher.BeginInvoke(new Action(() => Shutdown(0)), DispatcherPriority.ApplicationIdle);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        trayIcon?.Dispose();
        singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }
}
