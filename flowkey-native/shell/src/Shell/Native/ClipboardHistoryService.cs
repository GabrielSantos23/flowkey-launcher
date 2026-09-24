using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using Image = System.Drawing.Image;

namespace FlowKey.Shell.Native;

public sealed record ClipboardEntry
{
    public string Text { get; init; } = "";
    public long TimestampUnixMs { get; init; }
    public string Kind { get; init; } = "text";
    public string? ImagePath { get; init; }
    public int ImageWidth { get; init; }
    public int ImageHeight { get; init; }
    public string? SourceApp { get; init; }
    public string? SourceIconUri { get; init; }
}

public static class ClipboardExclusions
{
    public static bool ShouldRecord(bool excludeFromMonitorPresent, bool canIncludePresent, bool canIncludeZero) =>
        !excludeFromMonitorPresent && !(canIncludePresent && canIncludeZero);
}

public sealed class ClipboardHistoryStore
{
    public const int MaxEntries = 200;
    public const int MaxTextChars = 100_000;
    private const long DuplicateWindowMs = 400;

    private readonly string filePath;
    private readonly string imagesDirectory;
    private readonly string thumbnailsDirectory;
    private readonly object gate = new();
    private List<ClipboardEntry> entries;
    private bool loaded;

    public ClipboardHistoryStore(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "clipboard-history.bin");
        imagesDirectory = Path.Combine(directory, "clipboard-images");
        thumbnailsDirectory = Path.Combine(IconUriPolicy.IconCacheRoot, "clipboard");
        Directory.CreateDirectory(imagesDirectory);
        Directory.CreateDirectory(thumbnailsDirectory);
        entries = new List<ClipboardEntry>();
    }

    public int Count
    {
        get { lock (gate) { EnsureLoaded(); return entries.Count; } }
    }

    public void Record(string text, long timestampUnixMs, string? sourceApp, string? sourceIconUri = null)
    {
        if (string.IsNullOrEmpty(text) || text.Length > MaxTextChars)
        {
            return;
        }
        var kind = ClassifyText(text);
        lock (gate)
        {
            EnsureLoaded();
            if (entries.Count > 0 && entries[0].Kind == kind && entries[0].Text == text && timestampUnixMs - entries[0].TimestampUnixMs < DuplicateWindowMs)
            {
                return;
            }
            entries.RemoveAll(e => e.Kind == kind && e.Text == text);
            entries.Insert(0, new ClipboardEntry { Text = text, Kind = kind, TimestampUnixMs = timestampUnixMs, SourceApp = sourceApp, SourceIconUri = sourceIconUri });
            Trim();
            Persist();
        }
    }

    public static string ClassifyText(string text)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0 || trimmed.Length != text.Length || trimmed.Contains('\n') || trimmed.Contains('\r'))
        {
            return "text";
        }
        if (trimmed.StartsWith('#') && trimmed.Length is 4 or 7
            && trimmed[1..].All(ch => Uri.IsHexDigit(ch)))
        {
            return "color";
        }
        if (Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            return "link";
        }
        if (trimmed.Contains('@') && !trimmed.Contains(' ')
            && System.Text.RegularExpressions.Regex.IsMatch(trimmed, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        {
            return "email";
        }
        return "text";
    }

    public void RecordFiles(IReadOnlyList<string> paths, long timestampUnixMs, string? sourceApp, string? sourceIconUri = null)
    {
        if (paths.Count == 0)
        {
            return;
        }
        var text = string.Join("\n", paths);
        lock (gate)
        {
            EnsureLoaded();
            if (entries.Count > 0 && entries[0].Kind == "file" && entries[0].Text == text && timestampUnixMs - entries[0].TimestampUnixMs < DuplicateWindowMs)
            {
                return;
            }
            entries.RemoveAll(e => e.Kind == "file" && e.Text == text);
            entries.Insert(0, new ClipboardEntry { Text = text, Kind = "file", TimestampUnixMs = timestampUnixMs, SourceApp = sourceApp, SourceIconUri = sourceIconUri });
            Trim();
            Persist();
        }
    }

    public void RecordImage(Image image, long timestampUnixMs, string? sourceApp, string? sourceIconUri = null)
    {
        if (image is null)
        {
            return;
        }
        lock (gate)
        {
            EnsureLoaded();
            var imagePath = SaveImage(image, imagesDirectory);
            if (imagePath is null)
            {
                return;
            }
            if (entries.Count > 0 && entries[0].Kind == "image" && entries[0].ImagePath == imagePath && timestampUnixMs - entries[0].TimestampUnixMs < DuplicateWindowMs)
            {
                return;
            }
            entries.RemoveAll(e => e.Kind == "image" && e.ImagePath == imagePath);
            entries.Insert(0, new ClipboardEntry
            {
                Kind = "image",
                ImagePath = imagePath,
                ImageWidth = image.Width,
                ImageHeight = image.Height,
                TimestampUnixMs = timestampUnixMs,
                SourceApp = sourceApp,
                SourceIconUri = sourceIconUri,
            });
            SaveThumbnail(imagePath);
            Trim();
            Persist();
        }
    }

    private void Trim()
    {
        while (entries.Count > MaxEntries)
        {
            var removed = entries[^1];
            entries.RemoveAt(entries.Count - 1);
            DeleteEntryFiles(removed);
        }
    }

    private static string ImageHash(string imagePath)
    {
        var bytes = File.ReadAllBytes(imagePath);
        return Convert.ToHexString(SHA256.HashData(bytes))[..32].ToLowerInvariant();
    }

    private static string? SaveImage(Image image, string directory)
    {
        try
        {
            var tempPath = Path.Combine(directory, "pending-" + Guid.NewGuid().ToString("N") + ".png");
            image.Save(tempPath, System.Drawing.Imaging.ImageFormat.Png);
            var hash = ImageHash(tempPath);
            var finalPath = Path.Combine(directory, hash + ".png");
            if (File.Exists(finalPath))
            {
                File.Delete(tempPath);
            }
            else
            {
                File.Move(tempPath, finalPath);
            }
            return finalPath;
        }
        catch
        {
            return null;
        }
    }

    private void SaveThumbnail(string imagePath)
    {
        try
        {
            var hash = Path.GetFileNameWithoutExtension(imagePath);
            var thumbPath = Path.Combine(thumbnailsDirectory, hash + "_32.png");
            if (File.Exists(thumbPath))
            {
                return;
            }
            using var original = Image.FromFile(imagePath);
            using var thumb = new System.Drawing.Bitmap(original, 32, Math.Max(1, 32 * original.Height / Math.Max(1, original.Width)));
            thumb.Save(thumbPath, System.Drawing.Imaging.ImageFormat.Png);
        }
        catch
        {
            /* thumbnails are best-effort */
        }
    }

    private string? ColorSwatchUriFor(ClipboardEntry entry)
    {
        try
        {
            var id = ComputeEntryId(entry).ToLowerInvariant();
            var swatchPath = Path.Combine(thumbnailsDirectory, "color-" + id + "_card.png");
            if (File.Exists(swatchPath))
            {
                return new Uri(swatchPath).AbsoluteUri;
            }
            using var block = new System.Drawing.SolidBrush(System.Drawing.ColorTranslator.FromHtml(entry.Text.Trim()));
            using var card = new System.Drawing.Bitmap(320, 250);
            using (var graphics = System.Drawing.Graphics.FromImage(card))
            {
                graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                graphics.Clear(System.Drawing.Color.Transparent);
                var radius = 14;
                var path = new System.Drawing.Drawing2D.GraphicsPath();
                path.AddArc(0, 0, radius * 2, radius * 2, 180, 90);
                path.AddArc(320 - radius * 2, 0, radius * 2, radius * 2, 270, 90);
                path.AddArc(320 - radius * 2, 200 - radius * 2, radius * 2, radius * 2, 0, 90);
                path.AddArc(0, 200 - radius * 2, radius * 2, radius * 2, 90, 90);
                path.CloseFigure();
                graphics.FillPath(block, path);
                using var font = new System.Drawing.Font("Consolas", 13, System.Drawing.FontStyle.Regular);
                graphics.DrawString(entry.Text.Trim(), font, System.Drawing.Brushes.White, 6, 214);
            }
            card.Save(swatchPath, System.Drawing.Imaging.ImageFormat.Png);
            return new Uri(swatchPath).AbsoluteUri;
        }
        catch
        {
            return null;
        }
    }

    public string? ThumbnailUriFor(ClipboardEntry entry)
    {
        if (entry.Kind != "image" || entry.ImagePath is null || !File.Exists(entry.ImagePath))
        {
            return null;
        }
        var hash = Path.GetFileNameWithoutExtension(entry.ImagePath);
        var thumbPath = Path.Combine(thumbnailsDirectory, hash + "_32.png");
        if (!File.Exists(thumbPath))
        {
            try
            {
                using var original = Image.FromFile(entry.ImagePath);
                using var thumb = new System.Drawing.Bitmap(original, 32, Math.Max(1, 32 * original.Height / Math.Max(1, original.Width)));
                thumb.Save(thumbPath, System.Drawing.Imaging.ImageFormat.Png);
            }
            catch
            {
                return null;
            }
        }
        return File.Exists(thumbPath) ? new Uri(thumbPath).AbsoluteUri : null;
    }

    public string? PreviewUriFor(ClipboardEntry entry)
    {
        if (entry.Kind == "color")
        {
            return ColorSwatchUriFor(entry);
        }
        if (entry.Kind != "image" || entry.ImagePath is null || !File.Exists(entry.ImagePath))
        {
            return null;
        }
        var hash = Path.GetFileNameWithoutExtension(entry.ImagePath);
        var previewPath = Path.Combine(thumbnailsDirectory, hash + "_320.png");
        if (!File.Exists(previewPath))
        {
            try
            {
                using var original = Image.FromFile(entry.ImagePath);
                var scale = Math.Min(1.0, 320.0 / Math.Max(original.Width, 1));
                using var preview = new System.Drawing.Bitmap(original, Math.Max(1, (int)(original.Width * scale)), Math.Max(1, (int)(original.Height * scale)));
                preview.Save(previewPath, System.Drawing.Imaging.ImageFormat.Png);
            }
            catch
            {
                return null;
            }
        }
        return File.Exists(previewPath) ? new Uri(previewPath).AbsoluteUri : null;
    }

    public ClipboardEntry? GetById(string id)
    {
        lock (gate)
        {
            EnsureLoaded();
            return entries.FirstOrDefault(e => ComputeEntryId(e) == id);
        }
    }

    public IReadOnlyList<ClipboardEntry> Query(string query, int limit)
    {
        lock (gate)
        {
            EnsureLoaded();
            var q = query.Trim();
            IEnumerable<ClipboardEntry> selected = q.Length == 0
                ? entries
                : entries.Where(e => MatchesQuery(e, q));
            return selected.Take(Math.Clamp(limit, 1, MaxEntries)).ToList();
        }
    }

    private static bool MatchesQuery(ClipboardEntry entry, string query)
    {
        if (entry.Kind == "text")
        {
            return entry.Text.Contains(query, StringComparison.OrdinalIgnoreCase);
        }
        return entry.Kind.Contains(query, StringComparison.OrdinalIgnoreCase);
    }

    public string? Latest()
    {
        lock (gate)
        {
            EnsureLoaded();
            return entries.Count > 0 ? entries[0].Text : null;
        }
    }

    public static string ComputeEntryId(ClipboardEntry entry)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(entry);
        return Convert.ToHexString(SHA256.HashData(bytes))[..32];
    }

    public bool Delete(string id)
    {
        lock (gate)
        {
            EnsureLoaded();
            var index = entries.FindIndex(e => ComputeEntryId(e) == id);
            if (index < 0)
            {
                return false;
            }
            var removed = entries[index];
            entries.RemoveAt(index);
            DeleteEntryFiles(removed);
            Persist();
            return true;
        }
    }

    private void DeleteEntryFiles(ClipboardEntry entry)
    {
        try
        {
            if (entry.Kind == "image" && entry.ImagePath is not null)
            {
                if (File.Exists(entry.ImagePath))
                {
                    File.Delete(entry.ImagePath);
                }
                var hash = Path.GetFileNameWithoutExtension(entry.ImagePath);
                foreach (var derived in new[] { "_32.png", "_320.png" })
                {
                    var derivedPath = Path.Combine(thumbnailsDirectory, hash + derived);
                    if (File.Exists(derivedPath))
                    {
                        File.Delete(derivedPath);
                    }
                }
            }
        }
        catch
        {
            /* best-effort cleanup */
        }
    }

    public void Clear()
    {
        lock (gate)
        {
            entries = new List<ClipboardEntry>();
            try
            {
                if (File.Exists(filePath))
                {
                    File.Delete(filePath);
                }
                if (Directory.Exists(imagesDirectory))
                {
                    Directory.Delete(imagesDirectory, recursive: true);
                }
                if (Directory.Exists(thumbnailsDirectory))
                {
                    Directory.Delete(thumbnailsDirectory, recursive: true);
                }
                Directory.CreateDirectory(imagesDirectory);
                Directory.CreateDirectory(thumbnailsDirectory);
            }
            catch
            {
                /* best-effort */
            }
        }
    }

    private void EnsureLoaded()
    {
        if (loaded)
        {
            return;
        }
        loaded = true;
        try
        {
            if (!File.Exists(filePath))
            {
                return;
            }
            var encrypted = File.ReadAllBytes(filePath);
            var plain = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
            entries = JsonSerializer.Deserialize<List<ClipboardEntry>>(plain) ?? new List<ClipboardEntry>();
        }
        catch
        {
            entries = new List<ClipboardEntry>();
        }
    }

    private void Persist()
    {
        try
        {
            var plain = JsonSerializer.SerializeToUtf8Bytes(entries);
            var encrypted = ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(filePath, encrypted);
        }
        catch
        {
            /* best-effort persistence */
        }
    }
}

public static class ClipboardReader
{
    public const int CF_BITMAP = 2;
    public const int CF_DIB = 8;
    public const int CF_DIBV5 = 17;
    public const int CF_HDROP = 15;
    public const int CF_UNICODETEXT = 13;
    private const uint RetryCount = 5;
    private const int RetryBackoffMs = 15;

    private static readonly uint ExcludeFormat = RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing");
    private static readonly uint CanIncludeFormat = RegisterClipboardFormat("CanIncludeInClipboardHistory");

    public sealed record ClipboardCapture(string? Text, string? SourceApp, string? SourceIconUri, bool HasImage, bool HasFiles);

    public static ClipboardCapture? TryCapture()
    {
        for (var attempt = 0; attempt < RetryCount; attempt++)
        {
            if (!OpenClipboard(IntPtr.Zero))
            {
                Thread.Sleep(RetryBackoffMs * (attempt + 1));
                continue;
            }
            try
            {
                var excludePresent = IsClipboardFormatAvailable(ExcludeFormat);
                var canIncludePresent = IsClipboardFormatAvailable(CanIncludeFormat);
                var canIncludeZero = canIncludePresent && GetClipboardDword(CanIncludeFormat) is 0;
                if (!ClipboardExclusions.ShouldRecord(excludePresent, canIncludePresent, canIncludeZero))
                {
                    return null;
                }
                var (sourceApp, sourceIcon) = SourceOf(GetClipboardOwner());
                if (IsClipboardFormatAvailable(CF_UNICODETEXT))
                {
                    var handle = GetClipboardData(CF_UNICODETEXT);
                    if (handle == IntPtr.Zero)
                    {
                        return null;
                    }
                    var pointer = GlobalLock(handle);
                    if (pointer == IntPtr.Zero)
                    {
                        return null;
                    }
                    try
                    {
                        return new ClipboardCapture(Marshal.PtrToStringUni(pointer), sourceApp, sourceIcon, HasImage: false, HasFiles: false);
                    }
                    finally
                    {
                        GlobalUnlock(handle);
                    }
                }
                if (IsClipboardFormatAvailable(CF_HDROP))
                {
                    return new ClipboardCapture(null, sourceApp, sourceIcon, HasImage: false, HasFiles: true);
                }
                if (IsClipboardFormatAvailable(CF_DIB) || IsClipboardFormatAvailable(CF_DIBV5) || IsClipboardFormatAvailable(CF_BITMAP))
                {
                    return new ClipboardCapture(null, sourceApp, sourceIcon, HasImage: true, HasFiles: false);
                }
                return null;
            }
            finally
            {
                CloseClipboard();
            }
        }
        return null;
    }

    private static (string? Name, string? IconUri) SourceOf(IntPtr ownerWindow)
    {
        if (ownerWindow == IntPtr.Zero)
        {
            return (null, null);
        }
        GetWindowThreadProcessId(ownerWindow, out var pid);
        if (pid == 0)
        {
            return (null, null);
        }
        try
        {
            using var process = System.Diagnostics.Process.GetProcessById((int)pid);
            var name = process.ProcessName;
            var exePath = process.MainModule?.FileName;
            if (name is null || exePath is null)
            {
                return (name, null);
            }
            var directory = Path.Combine(IconUriPolicy.IconCacheRoot, "sources");
            Directory.CreateDirectory(directory);
            var iconPath = Path.Combine(directory, name + ".png");
            if (!File.Exists(iconPath))
            {
                using var icon = System.Drawing.Icon.ExtractAssociatedIcon(exePath);
                if (icon is not null)
                {
                    using var bitmap = icon.ToBitmap();
                    bitmap.Save(iconPath, System.Drawing.Imaging.ImageFormat.Png);
                }
            }
            var iconUri = File.Exists(iconPath) ? new Uri(iconPath).AbsoluteUri : null;
            return (name, iconUri);
        }
        catch
        {
            return (null, null);
        }
    }

    private static uint? GetClipboardDword(uint format)
    {
        if (!IsClipboardFormatAvailable(format))
        {
            return null;
        }
        var handle = GetClipboardData(format);
        if (handle == IntPtr.Zero)
        {
            return null;
        }
        var pointer = GlobalLock(handle);
        if (pointer == IntPtr.Zero)
        {
            return null;
        }
        try
        {
            return (uint)Marshal.ReadInt32(pointer);
        }
        finally
        {
            GlobalUnlock(handle);
        }
    }

    [DllImport("user32.dll")] private static extern bool OpenClipboard(IntPtr hWndNewOwner);
    [DllImport("user32.dll")] private static extern bool CloseClipboard();
    [DllImport("user32.dll")] private static extern bool IsClipboardFormatAvailable(uint format);
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardData(uint format);
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] private static extern uint RegisterClipboardFormat(string lpszFormat);
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalLock(IntPtr hMem);
    [DllImport("kernel32.dll")] private static extern bool GlobalUnlock(IntPtr hMem);
}
