using System.Windows;
using Clipboard = System.Windows.Clipboard;

namespace FlowKey.Shell.Native;

public static class ClipboardService
{
    public static void WriteText(string text)
    {
        for (var attempt = 0; attempt < 25; attempt++)
        {
            try
            {
                Clipboard.SetDataObject(text, true);
                return;
            }
            catch (System.Runtime.InteropServices.COMException)
            {
                Thread.Sleep(Math.Min(25 * (attempt + 1), 120));
            }
        }
        // Known real-world cause of exhausting the retry window: another process
        // holding the clipboard open the whole time. ShareX (clipboard watcher) and
        // a second FlowKey.Shell tray instance both reproduced it (2026-09: a
        // "clipboard busy" shell-test failure cleared once those two were closed).
        // Check those before suspecting the retry logic itself.
        throw new InvalidOperationException("clipboard busy");
    }
}
