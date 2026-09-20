using System.Runtime.InteropServices;

namespace FlowKey.Shell.Native;

public sealed record AppEntry(string Id, string Name, string LaunchPath, bool IsUwp, bool IsPerUser, string IconKey);

public static class AppsFolderEnumerator
{
    public static List<AppEntry> Enumerate()
    {
        CoInitializeEx(IntPtr.Zero, COINIT_APARTMENTTHREADED);
        var shellType = Type.GetTypeFromProgID("Shell.Application")
            ?? throw new COMException("Shell.Application is not registered");
        var shell = Activator.CreateInstance(shellType)
            ?? throw new COMException("Shell.Application could not be created");
        try
        {
            dynamic shellDynamic = shell;
            dynamic folder = shellDynamic.Namespace("shell:AppsFolder")
                ?? throw new COMException("shell:AppsFolder namespace unavailable");
            dynamic items = folder.Items();
            var results = new List<AppEntry>();
            foreach (dynamic item in items)
            {
                var name = (string)item.Name;
                if (string.IsNullOrWhiteSpace(name) || IsFiltered(name))
                {
                    continue;
                }
                string aumid;
                try
                {
                    aumid = (string)(item.ExtendedProperty("System.AppUserModel.ID") ?? item.Path);
                }
                catch
                {
                    aumid = (string)item.Path;
                }
                if (string.IsNullOrWhiteSpace(aumid))
                {
                    continue;
                }
                results.Add(new AppEntry(
                    Id: aumid,
                    Name: name,
                    LaunchPath: @"shell:AppsFolder\" + aumid,
                    IsUwp: true,
                    IsPerUser: true,
                    IconKey: aumid.ToLowerInvariant()));
            }
            return results;
        }
        finally
        {
            Marshal.ReleaseComObject(shell);
        }
    }

    private static bool IsFiltered(string name)
    {
        var lowered = name.ToLowerInvariant();
        return lowered.Contains("uninstall") || lowered.Contains("desinstalar") || lowered.Contains("desinstalação")
            || lowered.Contains("help") || lowered.Contains("ajuda")
            || lowered.Contains("documentation") || lowered.Contains("documentação") || lowered.Contains("readme");
    }

    private const uint COINIT_APARTMENTTHREADED = 0x2;

    [DllImport("ole32.dll")]
    private static extern int CoInitializeEx(IntPtr pvReserved, uint dwCoInit);
}

internal static class HResultExtensions
{
    public static void ThrowOnFail(this int hr, string what)
    {
        if (hr < 0)
        {
            throw new COMException(what, hr);
        }
    }
}
