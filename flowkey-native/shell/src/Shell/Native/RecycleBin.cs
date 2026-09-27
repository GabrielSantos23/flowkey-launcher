using System.IO;
using System.Runtime.InteropServices;

namespace FlowKey.Shell.Native;

/// <summary>
/// Moves files or directories to the Recycle Bin (SHFileOperation with
/// FOF_ALLOWUNDO), so extension-driven deletes are recoverable.
/// </summary>
public static class RecycleBin
{
    private const uint FO_DELETE = 3;
    private const ushort FOF_ALLOWUNDO = 0x40;
    private const ushort FOF_NOCONFIRMATION = 0x10;
    private const ushort FOF_SILENT = 0x4;
    private const ushort FOF_NOERRORUI = 0x400;

    public static bool TryTrash(string path, out string? error)
    {
        error = null;
        if (!File.Exists(path) && !Directory.Exists(path))
        {
            error = $"path '{path}' does not exist";
            return false;
        }
        var op = new SHFILEOPSTRUCTW
        {
            hwnd = IntPtr.Zero,
            wFunc = FO_DELETE,
            pFrom = path + '\0' + '\0',
            fFlags = (ushort)(FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI),
        };
        var result = SHFileOperationW(ref op);
        if (result == 0 && op.fAnyOperationsAborted == 0)
        {
            return true;
        }
        error = $"recycle bin operation failed (code {result})";
        return false;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEOPSTRUCTW
    {
        public IntPtr hwnd;
        public uint wFunc;
        public string pFrom;
        public string? pTo;
        public ushort fFlags;
        public int fAnyOperationsAborted;
        public IntPtr hNameMappings;
        public string? lpszProgressTitle;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHFileOperationW(ref SHFILEOPSTRUCTW op);
}
