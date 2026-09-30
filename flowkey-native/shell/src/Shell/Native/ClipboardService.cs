using System.Text;
using System.Windows;
using Clipboard = System.Windows.Clipboard;
using DataObject = System.Windows.DataObject;
using DataFormats = System.Windows.DataFormats;
using StringCollection = System.Collections.Specialized.StringCollection;

namespace FlowKey.Shell.Native;

public sealed record ClipboardWriteContent(string? Text, string? Html, IReadOnlyList<string>? Paths);

public sealed record ClipboardReadContent(string? Text, string? Html, IReadOnlyList<string>? Paths);

public static class ClipboardService
{
    /// <summary>
    /// When set (the test suite), clipboard writes carry the standard
    /// ExcludeClipboardContentFromMonitorProcessing format so clipboard
    /// managers — including a running launcher — skip them. Fixture strings
    /// must never land in a real clipboard history.
    /// </summary>
    public static bool ExcludeFromMonitor { get; set; }

    private const string ExcludeFromMonitorFormat = "ExcludeClipboardContentFromMonitorProcessing";

    public static void WriteText(string text)
    {
        for (var attempt = 0; attempt < 25; attempt++)
        {
            try
            {
                if (ExcludeFromMonitor)
                {
                    var data = new DataObject();
                    data.SetData(DataFormats.UnicodeText, text);
                    TagExcluded(data);
                    Clipboard.SetDataObject(data, true);
                }
                else
                {
                    Clipboard.SetDataObject(text, true);
                }
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

    /// <summary>
    /// Writes rich content: text, HTML (wrapped as CF_HTML) and/or a file drop
    /// list. Absent formats are omitted, so partial writes keep other formats.
    /// </summary>
    public static void WriteContent(ClipboardWriteContent content)
    {
        var data = new DataObject();
        if (!string.IsNullOrEmpty(content.Text))
        {
            data.SetData(DataFormats.UnicodeText, content.Text);
        }
        if (!string.IsNullOrEmpty(content.Html))
        {
            data.SetData(DataFormats.Html, CfHtml.ToCfHtml(content.Html));
        }
        if (content.Paths is { Count: > 0 })
        {
            var list = new StringCollection();
            list.AddRange(content.Paths.ToArray());
            data.SetFileDropList(list);
        }
        if (ExcludeFromMonitor)
        {
            TagExcluded(data);
        }
        for (var attempt = 0; attempt < 25; attempt++)
        {
            try
            {
                Clipboard.SetDataObject(data, true);
                return;
            }
            catch (System.Runtime.InteropServices.COMException)
            {
                Thread.Sleep(Math.Min(25 * (attempt + 1), 120));
            }
        }
        throw new InvalidOperationException("clipboard busy");
    }

    private static void TagExcluded(DataObject data) =>
        data.SetData(ExcludeFromMonitorFormat, Convert.ToInt32(1));

    /// <summary>Reads every rich format currently on the clipboard.</summary>
    public static ClipboardReadContent ReadContent()
    {
        for (var attempt = 0; attempt < 25; attempt++)
        {
            try
            {
                var data = Clipboard.GetDataObject();
                if (data is null)
                {
                    return new ClipboardReadContent(null, null, null);
                }
                var text = data.GetDataPresent(DataFormats.UnicodeText)
                    ? data.GetData(DataFormats.UnicodeText) as string
                    : null;
                var html = data.GetDataPresent(DataFormats.Html)
                    ? CfHtml.FromCfHtml(data.GetData(DataFormats.Html) as string ?? "")
                    : null;
                string[]? paths = null;
                if (data.GetDataPresent(DataFormats.FileDrop))
                {
                    paths = data.GetData(DataFormats.FileDrop) as string[];
                }
                return new ClipboardReadContent(
                    string.IsNullOrEmpty(text) ? null : text,
                    string.IsNullOrEmpty(html) ? null : html,
                    paths is { Length: > 0 } ? paths : null);
            }
            catch (System.Runtime.InteropServices.COMException)
            {
                Thread.Sleep(Math.Min(25 * (attempt + 1), 120));
            }
        }
        throw new InvalidOperationException("clipboard busy");
    }

    public static void Clear()
    {
        for (var attempt = 0; attempt < 25; attempt++)
        {
            try
            {
                Clipboard.Clear();
                return;
            }
            catch (System.Runtime.InteropServices.COMException)
            {
                Thread.Sleep(Math.Min(25 * (attempt + 1), 120));
            }
        }
        throw new InvalidOperationException("clipboard busy");
    }
}

/// <summary>
/// CF_HTML clipboard-format encoding (the "Version:0.9" header with
/// byte-offset fields that Windows requires for <see cref="DataFormats.Html"/>).
/// </summary>
public static class CfHtml
{
    public static string ToCfHtml(string fragment)
    {
        const string headerTemplate =
            "Version:0.9\r\n" +
            "StartHTML:{0:D10}\r\n" +
            "EndHTML:{1:D10}\r\n" +
            "StartFragment:{2:D10}\r\n" +
            "EndFragment:{3:D10}\r\n";
        const string startMarker = "<!--StartFragment-->";
        const string endMarker = "<!--EndFragment-->";

        var header = string.Format(headerTemplate, 0, 0, 0, 0);
        var headerBytes = Encoding.UTF8.GetByteCount(header);
        var context = "<html><body>\r\n";
        var contextBytes = Encoding.UTF8.GetByteCount(context);

        var startFragment = headerBytes + contextBytes + Encoding.UTF8.GetByteCount(startMarker);
        var endFragment = startFragment + Encoding.UTF8.GetByteCount(fragment);
        var endHtml = endFragment + Encoding.UTF8.GetByteCount(endMarker + "\r\n</body>\r\n</html>");

        return string.Format(headerTemplate, headerBytes, endHtml, startFragment, endFragment)
            + context
            + startMarker
            + fragment
            + endMarker
            + "\r\n</body>\r\n</html>";
    }

    public static string FromCfHtml(string cfHtml)
    {
        var startFragment = ExtractOffset(cfHtml, "StartFragment:");
        var endFragment = ExtractOffset(cfHtml, "EndFragment:");
        if (startFragment < 0 || endFragment < 0 || endFragment < startFragment)
        {
            return cfHtml;
        }
        var bytes = Encoding.UTF8.GetBytes(cfHtml);
        if (endFragment > bytes.Length)
        {
            return cfHtml;
        }
        return Encoding.UTF8.GetString(bytes, startFragment, endFragment - startFragment);
    }

    private static int ExtractOffset(string cfHtml, string field)
    {
        var at = cfHtml.IndexOf(field, StringComparison.Ordinal);
        if (at < 0)
        {
            return -1;
        }
        var digits = "";
        for (var i = at + field.Length; i < cfHtml.Length && char.IsAsciiDigit(cfHtml[i]) && digits.Length < 10; i++)
        {
            digits += cfHtml[i];
        }
        return digits.Length > 0 ? int.Parse(digits) : -1;
    }
}
