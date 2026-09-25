namespace FlowKey.Shell;

public static class DebugLog
{
    private static readonly object Gate = new();
    private static readonly bool Enabled =
        Environment.GetEnvironmentVariable("FLOWKEY_LOG") == "1";
    private static readonly string Path =
        System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FlowKey.Shell", "log.txt");

    public static void Write(string message)
    {
        if (!Enabled)
        {
            return;
        }
        lock (Gate)
        {
            try
            {
                System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
                System.IO.File.AppendAllText(Path, $"{DateTime.Now:O} {message}\n");
            }
            catch
            {
                /* logging must never crash the shell */
            }
        }
    }
}
