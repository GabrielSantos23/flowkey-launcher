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

    public void Record(string text, long timestampUnixMs, string? sourceApp)
    {
        if (string.IsNullOrEmpty(text) || text.Length > MaxTextChars)
        {
            return;
        }
        lock (gate)
        {
            EnsureLoaded();
            if (entries.Count > 0 && entries[0].Kind == "text" && entries[0].Text == text && timestampUnixMs - entries[0].TimestampUnixMs < DuplicateWindowMs)
            {
                return;
            }
            entries.RemoveAll(e => e.Kind == "text" && e.Text == text);
            entries.Insert(0, new ClipboardEntry { Text = text, TimestampUnixMs = timestampUnixMs, SourceApp = sourceApp });
            Trim();
            Persist();
        }
    }

    public void RecordImage(Image image, long timestampUnixMs, string? sourceApp)
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

    public string? ThumbnailUriFor(ClipboardEntry entry)
    {
        if (entry.Kind != "image" || entry.ImagePath is null || !File.Exists(entry.ImagePath))
        {
            return null;
        }
        var hash = Path.GetFileNameWithoutExtension(entry.ImagePath);
        var thumbPath = Path.Combine(thumbnailsDirectory, hash + "_32.png");
        return File.Exists(thumbPath) ? new Uri(thumbPath).AbsoluteUri : null;
    }

    public string? PreviewUriFor(ClipboardEntry entry)
    {
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
        return entry.Kind == "image"
            ? "image".Contains(query, StringComparison.OrdinalIgnoreCase)
            : entry.Text.Contains(query, StringComparison.OrdinalIgnoreCase);
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
    public const int CF_UNICODETEXT = 13;
    private const uint RetryCount = 5;
    private const int RetryBackoffMs = 15;

    private static readonly uint ExcludeFormat = RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing");
    private static readonly uint CanIncludeFormat = RegisterClipboardFormat("CanIncludeInClipboardHistory");

    public sealed record ClipboardCapture(string? Text, string? SourceApp, bool HasImage);

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
                var sourceApp = SourceAppOf(GetClipboardOwner());
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
                        return new ClipboardCapture(Marshal.PtrToStringUni(pointer), sourceApp, HasImage: false);
                    }
                    finally
                    {
                        GlobalUnlock(handle);
                    }
                }
                if (IsClipboardFormatAvailable(CF_DIB) || IsClipboardFormatAvailable(CF_DIBV5) || IsClipboardFormatAvailable(CF_BITMAP))
                {
                    return new ClipboardCapture(null, sourceApp, HasImage: true);
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

    private static string? SourceAppOf(IntPtr ownerWindow)
    {
        if (ownerWindow == IntPtr.Zero)
        {
            return null;
        }
        GetWindowThreadProcessId(ownerWindow, out var pid);
        if (pid == 0)
        {
            return null;
        }
        try
        {
            using var process = System.Diagnostics.Process.GetProcessById((int)pid);
            return process.ProcessName;
        }
        catch
        {
            return null;
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
