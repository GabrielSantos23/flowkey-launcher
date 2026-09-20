using System.Windows;
using Clipboard = System.Windows.Clipboard;

namespace FlowKey.Shell.Native;

public static class ClipboardService
{
    public static void WriteText(string text)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            try
            {
                Clipboard.SetDataObject(text, true);
                return;
            }
            catch (System.Runtime.InteropServices.COMException)
            {
                Thread.Sleep(20);
            }
        }
        throw new InvalidOperationException("clipboard busy");
    }
}
