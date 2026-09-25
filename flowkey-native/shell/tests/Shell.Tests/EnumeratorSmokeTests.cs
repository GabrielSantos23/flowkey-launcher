using System.IO;
using System.Runtime.InteropServices;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class EnumeratorSmokeTests
{
    [Fact]
    public void AppsFolderEnumeratesSomeApps()
    {
        try
        {
            var apps = AppsFolderEnumerator.Enumerate();
            Assert.NotEmpty(apps);
        }
        catch (Exception ex)
        {
            Assert.Fail(ex.ToString());
        }
    }

    [Fact]
    public void IconExtractionProducesFile()
    {
        var apps = AppsFolderEnumerator.Enumerate();
        var entry = apps[0];
        IntPtr pidl = IntPtr.Zero;
        try
        {
            var hr = ShellParse(entry.LaunchPath, IntPtr.Zero, out pidl, 0, out _);
            Assert.True(hr >= 0, "SHParseDisplayName failed: 0x" + hr.ToString("X8"));
            var path = AppIconCache.ExtractToCache(pidl, entry.IconKey, 32);
            Assert.NotNull(path);
            Assert.True(File.Exists(path));
        }
        finally
        {
            if (pidl != IntPtr.Zero) ILFree(pidl);
        }
    }

    [DllImport("shell32.dll", EntryPoint = "SHParseDisplayName")]
    private static extern int ShellParse([MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr pbc, out IntPtr ppidl, uint sfgaoIn, out uint psfgaoOut);

    [DllImport("shell32.dll")]
    private static extern void ILFree(IntPtr pidl);
}
