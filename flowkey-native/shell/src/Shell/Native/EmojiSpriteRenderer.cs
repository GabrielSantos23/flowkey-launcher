using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace FlowKey.Shell.Native;

public static class EmojiSpriteRenderer
{
    public const int CellSize = 96;
    private const int Columns = 32;
    private const int BatchSize = 256;

    public static string CacheRoot =>
        Path.Combine(AppLauncherService.DataDirectory, "emoji-cache-96b");

    private static readonly object Gate = new();

    public static string CachePathFor(string emoji) =>
        Path.Combine(CacheRoot, AppIconCache.Hash(emoji) + ".png");

    public static bool IsCached(string emoji) => File.Exists(CachePathFor(emoji));

    public static bool EnsureSprites(IEnumerable<string> emojis, Action? batchRendered = null)
    {
        var edge = ResolveEdge();
        if (edge is null)
        {
            DebugLog.Write("emoji sprites: no chrome/edge found");
            return false;
        }
        lock (Gate)
        {
            Directory.CreateDirectory(CacheRoot);
            var missing = emojis
                .Where(e => e.Length > 0 && !IsCached(e))
                .Distinct()
                .ToList();
            if (missing.Count == 0)
            {
                return true;
            }

            var workDir = Path.Combine(Path.GetTempPath(), "flowkey-emoji-" + Guid.NewGuid().ToString("N"));
            try
            {
            for (var offset = 0; offset < missing.Count; offset += BatchSize)
            {
                var batch = missing.Skip(offset).Take(BatchSize).ToList();
                if (!GenerateBatch(edge, workDir, batch))
                {
                    return false;
                }
                batchRendered?.Invoke();
            }
            return true;
            }
            finally
            {
                try
                {
                    Directory.Delete(workDir, recursive: true);
                }
                catch
                {
                    /* temp cleanup is best-effort */
                }
            }
        }
    }

    private static bool GenerateBatch(string edge, string workDir, List<string> batch)
    {
            Directory.CreateDirectory(workDir);
            {
                var htmlPath = Path.Combine(workDir, "sheet.html");
                var pngPath = Path.Combine(workDir, "sheet.png");
                var rows = (batch.Count + Columns - 1) / Columns;
                File.WriteAllText(htmlPath, BuildHtml(batch), new UTF8Encoding(false));

                var psi = new ProcessStartInfo
                {
                    FileName = edge,
                    Arguments = $"--headless=new --disable-gpu --no-first-run --user-data-dir=\"{Path.Combine(workDir, "profile")}\" --default-background-color=00000000 --window-size={Columns * CellSize},{rows * CellSize} --screenshot=\"{pngPath}\" \"file:///{htmlPath.Replace('\\', '/')}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                using (var process = Process.Start(psi))
                {
                    if (process is null)
                    {
                        DebugLog.Write("emoji sprites: process null");
                        return false;
                    }
                    if (!process.WaitForExit(20000))
                    {
                        DebugLog.Write("emoji sprites: browser timed out");
                        process.Kill(true);
                        return false;
                    }
                    DebugLog.Write("emoji sprites: browser exit " + process.ExitCode);
                }
                if (!File.Exists(pngPath))
                {
                    DebugLog.Write("emoji sprites: no sheet png");
                    return false;
                }

                var sheet = LoadBitmap(pngPath);
                if (sheet is null)
                {
                    DebugLog.Write("emoji sprites: sheet decode failed");
                    return false;
                }
                var rows1 = (batch.Count + Columns - 1) / Columns;
                var pixels = new byte[Columns * CellSize * rows1 * CellSize * 4];
                Slice(sheet, batch, rows1, pixels);
                return true;
            }
    }

    private static string BuildHtml(List<string> emojis)
    {
        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset='utf-8'><style>");
        sb.Append("body{margin:0;background:rgba(0,0,0,0);overflow:hidden}");
        sb.Append($"div{{position:absolute;width:{CellSize}px;height:{CellSize}px;font:{CellSize * 4 / 5}px 'Segoe UI Emoji';text-align:center;line-height:{CellSize}px;overflow:hidden}}");
        sb.Append("</style></head><body>");
        for (var i = 0; i < emojis.Count; i++)
        {
            var x = (i % Columns) * CellSize;
            var y = (i / Columns) * CellSize;
            var escaped = emojis[i]
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;");
            sb.Append($"<div style='left:{x}px;top:{y}px'>{escaped}</div>");
        }
        sb.Append("</body></html>");
        return sb.ToString();
    }

    private static void Slice(BitmapSource sheet, List<string> emojis, int rows, byte[] pixels)
    {
        var stride = Columns * CellSize * 4;
        sheet.CopyPixels(new Int32Rect(0, 0, Columns * CellSize, rows * CellSize), pixels, stride, 0);
        for (var i = 0; i < emojis.Count; i++)
        {
            var x = (i % Columns) * CellSize;
            var y = (i / Columns) * CellSize;
            var hasInk = false;
            for (var py = 0; py < CellSize && !hasInk; py++)
            {
                var rowStart = (y + py) * stride + x * 4;
                for (var px = 0; px < CellSize * 4; px += 4)
                {
                    if (pixels[rowStart + px + 3] > 8)
                    {
                        hasInk = true;
                        break;
                    }
                }
            }
            if (!hasInk)
            {
                continue;
            }
            var cell = new byte[CellSize * CellSize * 4];
            for (var py = 0; py < CellSize; py++)
            {
                var src = (y + py) * stride + x * 4;
                var dst = py * CellSize * 4;
                Array.Copy(pixels, src, cell, dst, CellSize * 4);
            }
            var bitmap = BitmapSource.Create(CellSize, CellSize, 96, 96, PixelFormats.Pbgra32, null, cell, CellSize * 4);
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using var stream = File.Create(CachePathFor(emojis[i]));
            encoder.Save(stream);
        }
    }

    private static BitmapSource? LoadBitmap(string path)
    {
        try
        {
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.UriSource = new Uri(path);
            bitmap.EndInit();
            bitmap.Freeze();
            return bitmap;
        }
        catch
        {
            return null;
        }
    }

    private static string? ResolveEdge()
    {
        foreach (var candidate in new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
        })
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        return null;
    }
}
