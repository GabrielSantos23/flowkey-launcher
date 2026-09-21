using System.Windows;
using System.Windows.Threading;
using FlowKey.Shell.Windows;
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
        singleInstanceMutex = new Mutex(true, SingleInstanceMutexName, out var isFirstInstance);
        if (!isFirstInstance)
        {
            singleInstanceMutex.Dispose();
            singleInstanceMutex = null;
            Shutdown(0);
            return;
        }

        base.OnStartup(e);

        mainWindow = new MainWindow();
        MainWindow = mainWindow;
        if (e.Args.Contains("--settings", StringComparer.OrdinalIgnoreCase))
        {
            mainWindow.Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.ApplicationIdle, () => mainWindow.OpenSettings());
        }

        trayIcon = new System.Windows.Forms.NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Visible = true,
            Text = "FlowKey",
        };
        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("Show", null, (_, _) => mainWindow.Summon());
        menu.Items.Add("Quit", null, (_, _) => mainWindow.Quit());
        trayIcon.ContextMenuStrip = menu;
        trayIcon.DoubleClick += (_, _) => mainWindow.Summon();
    }

    private void Quit()
    {
        trayIcon?.Dispose();
        trayIcon = null;
        mainWindow?.Quit();
        Shutdown(0);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        trayIcon?.Dispose();
        singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }
}
