using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record ClipboardEntry(string Text, long TimestampUnixMs);

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
    private readonly object gate = new();
    private List<ClipboardEntry> entries;
    private bool loaded;

    public ClipboardHistoryStore(string directory)
    {
        Directory.CreateDirectory(directory);
        filePath = Path.Combine(directory, "clipboard-history.bin");
        entries = new List<ClipboardEntry>();
    }

    public int Count
    {
        get { lock (gate) { EnsureLoaded(); return entries.Count; } }
    }

    public void Record(string text, long timestampUnixMs)
    {
        if (string.IsNullOrEmpty(text) || text.Length > MaxTextChars)
        {
            return;
        }
        lock (gate)
        {
            EnsureLoaded();
            if (entries.Count > 0 && entries[0].Text == text && timestampUnixMs - entries[0].TimestampUnixMs < DuplicateWindowMs)
            {
                return;
            }
            entries.RemoveAll(e => e.Text == text);
            entries.Insert(0, new ClipboardEntry(text, timestampUnixMs));
            if (entries.Count > MaxEntries)
            {
                entries = entries.Take(MaxEntries).ToList();
            }
            Persist();
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
                : entries.Where(e => e.Text.Contains(q, StringComparison.OrdinalIgnoreCase));
            return selected.Take(Math.Clamp(limit, 1, MaxEntries)).ToList();
        }
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
            entries.RemoveAt(index);
            Persist();
            return true;
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
    public const int CF_UNICODETEXT = 13;
    private const uint RetryCount = 5;
    private const int RetryBackoffMs = 15;

    private static readonly uint ExcludeFormat = RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing");
    private static readonly uint CanIncludeFormat = RegisterClipboardFormat("CanIncludeInClipboardHistory");

    public static string? TryCaptureText()
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
                if (!IsClipboardFormatAvailable(CF_UNICODETEXT))
                {
                    return null;
                }
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
                    return Marshal.PtrToStringUni(pointer);
                }
                finally
                {
                    GlobalUnlock(handle);
                }
            }
            finally
            {
                CloseClipboard();
            }
        }
        return null;
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
    [DllImport("user32.dll")] private static extern uint RegisterClipboardFormat(string lpszFormat);
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalLock(IntPtr hMem);
    [DllImport("kernel32.dll")] private static extern bool GlobalUnlock(IntPtr hMem);
}
