using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace FlowKey.Shell.Native;

public static class AppIconCache
{
    private static readonly string CacheRoot = IconUriPolicy.IconCacheRoot;

    public static string? ExtractToCache(IntPtr pidl, string iconKey, int pixelSize)
    {
        Directory.CreateDirectory(CacheRoot);
        var target = Path.Combine(CacheRoot, Hash(iconKey) + "_" + pixelSize + ".png");
        if (File.Exists(target))
        {
            return target;
        }

        var factoryGuid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
        SHCreateItemFromIDList(pidl, factoryGuid, out IntPtr unk).ThrowOnFail("SHCreateItemFromIDList(factory)");
        try
        {
            var factory = (IShellItemImageFactory)Marshal.GetObjectForIUnknown(unk);
            GetImageWithAlpha(factory, pixelSize, out var bitmap);
            if (bitmap is null)
            {
                return null;
            }
            bitmap.Save(target, ImageFormat.Png);
            bitmap.Dispose();
            return target;
        }
        finally
        {
            Marshal.Release(unk);
        }
    }

    private static void GetImageWithAlpha(IShellItemImageFactory factory, int size, out Bitmap? bitmap)
    {
        var hr = factory.GetImage(new SIZE(size, size), 0, out var hbitmap);
        bitmap = null;
        if (hr < 0 || hbitmap == IntPtr.Zero)
        {
            return;
        }
        try
        {
            bitmap = HBitmapToArgb(hbitmap);
        }
        finally
        {
            DeleteObject(hbitmap);
        }
    }

    internal static Bitmap? HBitmapToArgb(IntPtr hbitmap)
    {
        var header = new BITMAP();
        if (GetObject(hbitmap, Marshal.SizeOf<BITMAP>(), ref header) == 0)
        {
            return null;
        }
        var width = header.bmWidth;
        var height = Math.Abs(header.bmHeight);
        var bmi = new BITMAPINFO
        {
            biSize = (uint)Marshal.SizeOf<BITMAPINFOHEADER>(),
            biWidth = width,
            biHeight = -height,
            biPlanes = 1,
            biBitCount = 32,
        };
        var hdc = GetDC(IntPtr.Zero);
        try
        {
            var bits = Marshal.AllocHGlobal(width * height * 4);
            try
            {
                if (GetDIBits(hdc, hbitmap, 0, (uint)height, bits, ref bmi, 0) == 0)
                {
                    return null;
                }
                var managed = new byte[width * height * 4];
                Marshal.Copy(bits, managed, 0, managed.Length);
                var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
                var data = bitmap.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                Marshal.Copy(managed, 0, data.Scan0, managed.Length);
                bitmap.UnlockBits(data);
                return bitmap;
            }
            finally
            {
                Marshal.FreeHGlobal(bits);
            }
        }
        finally
        {
            ReleaseDC(IntPtr.Zero, hdc);
        }
    }

    public static string Hash(string key)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(key);
        var hash = System.Security.Cryptography.SHA256.HashData(bytes);
        return Convert.ToHexString(hash)[..24].ToLowerInvariant();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SIZE
    {
        public int cx;
        public int cy;

        public SIZE(int cx, int cy) { this.cx = cx; this.cy = cy; }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAP
    {
        public int bmType;
        public int bmWidth;
        public int bmHeight;
        public int bmWidthBytes;
        public ushort bmPlanes;
        public ushort bmBitsPixel;
        public IntPtr bmBits;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAPINFOHEADER
    {
        public uint biSize;
        public int biWidth;
        public int biHeight;
        public ushort biPlanes;
        public ushort biBitCount;
        public uint biCompression;
        public uint biSizeImage;
        public int biXPelsPerMeter;
        public int biYPelsPerMeter;
        public uint biClrUsed;
        public uint biClrImportant;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAPINFO
    {
        public uint biSize;
        public int biWidth;
        public int biHeight;
        public ushort biPlanes;
        public ushort biBitCount;
        public uint biCompression;
        public uint biSizeImage;
        public int biXPelsPerMeter;
        public int biYPelsPerMeter;
        public uint biClrUsed;
        public uint biClrImportant;
    }

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemImageFactory
    {
        [PreserveSig] int GetImage(SIZE size, uint flags, out IntPtr phbm);
    }

    [DllImport("shell32.dll")]
    private static extern int SHCreateItemFromIDList(IntPtr pidl, in Guid riid, out IntPtr ppv);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern int GetObject(IntPtr hgdiobj, int cbBuffer, ref BITMAP lpvObject);

    [DllImport("gdi32.dll")]
    private static extern uint GetDIBits(IntPtr hdc, IntPtr hbm, uint start, uint cLines, IntPtr lpvBits, ref BITMAPINFO lpbmi, uint usage);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
}
