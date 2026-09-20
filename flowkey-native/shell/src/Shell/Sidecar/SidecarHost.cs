using System.Diagnostics;
using System.IO;
using System.Text.Json;
using FlowKey.Shell.Native;

namespace FlowKey.Shell.Sidecar;

public sealed class SidecarFatalException : Exception
{
    public SidecarFatalException(string message) : base(message) { }
}

public sealed class SidecarHost : IDisposable
{
    private const int MaxRestartDelayMs = 10000;
    private static readonly int[] RestartBackoffMs = [500, 1000, 2000, 4000, 8000, MaxRestartDelayMs];

    private readonly string scriptPath;
    private readonly string extensionsDir;
    private readonly Action<string> log;

    private Process? process;
    private JobObject? job;
    private int restartAttempts;
    private bool disposed;
    private bool fatal;
    private long requestCounter;
    public event Action<Protocol.ReadyMessage>? Ready;
    public event Action<Protocol.UiMessage>? Ui;
    public event Action<Protocol.ErrorMessage>? Error;
    public event Action<Protocol.LogMessage>? Log;
    public event Action<string, string, string, Dictionary<string, JsonElement>?>? NativeCallRequested;
    public event Action<string>? SidecarCrashed;
    public event Action<string>? Fatal;

    public SidecarHost(string scriptPath, string extensionsDir, Action<string> log)
    {
        this.scriptPath = scriptPath;
        this.extensionsDir = extensionsDir;
        this.log = log;
    }

    public bool Running => process is { HasExited: false };

    private void RaiseFatal(string message)
    {
        fatal = true;
        Fatal?.Invoke(message);
    }

    public static string? ResolveBun()
    {
        var userBun = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".bun", "bin", "bun.exe");
        if (File.Exists(userBun))
        {
            return userBun;
        }

        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var candidate = Path.Combine(dir, "bun.exe");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    public void Start()
    {
        var bun = ResolveBun();
        if (bun is null)
        {
            RaiseFatal("bun was not found on PATH or at %USERPROFILE%\\.bun\\bin\\bun.exe. Install bun to run extensions.");
            return;
        }

        var psi = new ProcessStartInfo
        {
            FileName = bun,
            Arguments = $"\"{scriptPath}\"",
            WorkingDirectory = Path.GetDirectoryName(scriptPath)!,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
        };

        try
        {
            process = Process.Start(psi);
        }
        catch (Exception ex)
        {
            RaiseFatal($"failed to start sidecar: {ex.Message}");
            return;
        }

        if (process is null)
        {
            RaiseFatal("failed to start sidecar: process was null");
            return;
        }

        try
        {
            job = new JobObject();
            job.AddProcess(process.Handle);
        }
        catch (Exception ex)
        {
            log($"job object assignment failed: {ex.Message}");
        }

        _ = Task.Run(() => ReadLoop(process));
        _ = Task.Run(() => ErrorLoop(process));
        process.Exited += (_, _) => OnExited();
        process.EnableRaisingEvents = true;

        SendInit();
    }

    public void SendInit()
    {
        var init = new Protocol.InitMessage
        {
            ProtocolVersion = Protocol.ProtocolVersion.Current,
            ExtensionsDir = extensionsDir,
        };
        Send(init);
    }

    public string SendSearch(string extensionId, string query)
    {
        requestCounter++;
        var requestId = $"s{requestCounter}";
        Send(new Protocol.SearchMessage { RequestId = requestId, ExtensionId = extensionId, Query = query });
        return requestId;
    }

    public string SendAction(string extensionId, string actionId, Protocol.UiItem? item)
    {
        requestCounter++;
        var requestId = $"a{requestCounter}";
        Send(new Protocol.ActionMessage { RequestId = requestId, ExtensionId = extensionId, ActionId = actionId, Item = item });
        return requestId;
    }

    private void ReadLoop(Process p)
    {
        try
        {
            using var reader = new StreamReader(p.StandardOutput.BaseStream, System.Text.Encoding.UTF8);
            while (!reader.EndOfStream)
            {
                var line = reader.ReadLine();
                if (line is null)
                {
                    break;
                }
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }
                HandleLine(line);
            }
        }
        catch (Exception ex)
        {
            log($"sidecar read loop ended: {ex.Message}");
        }
    }

    private void ErrorLoop(Process p)
    {
        try
        {
            using var reader = new StreamReader(p.StandardError.BaseStream, System.Text.Encoding.UTF8);
            while (!reader.EndOfStream)
            {
                var line = reader.ReadLine();
                if (line is null)
                {
                    break;
                }
                Log?.Invoke(new Protocol.LogMessage { Level = "warn", Message = $"sidecar stderr: {line}" });
            }
        }
        catch
        {
            /* stream closed with the process */
        }
    }

    internal void HandleLine(string line)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            switch (type)
            {
                case "ready":
                    HandleReady(root.Deserialize<Protocol.ReadyMessage>(Protocol.JsonOptions.Default));
                    break;
                case "ui":
                    var ui = root.Deserialize<Protocol.UiMessage>(Protocol.JsonOptions.Default);
                    if (ui is not null)
                    {
                        Ui?.Invoke(ui);
                    }
                    break;
                case "error":
                    var err = root.Deserialize<Protocol.ErrorMessage>(Protocol.JsonOptions.Default);
                    if (err is not null)
                    {
                        Error?.Invoke(err);
                    }
                    break;
                case "nativeCall":
                    var call = root.Deserialize<Protocol.NativeCallMessage>(Protocol.JsonOptions.Default);
                    if (call is not null)
                    {
                        NativeCallRequested?.Invoke(call.RequestId, call.ExtensionId, call.Method, call.Params);
                    }
                    break;
                case "log":
                    var logMsg = root.Deserialize<Protocol.LogMessage>(Protocol.JsonOptions.Default);
                    if (logMsg is not null)
                    {
                        Log?.Invoke(logMsg);
                    }
                    break;
                default:
                    log($"unknown sidecar message type: {type}");
                    break;
            }
        }
        catch (JsonException ex)
        {
            log($"bad sidecar json: {ex.Message}");
        }
    }

    private void HandleReady(Protocol.ReadyMessage? ready)
    {
        if (ready is null)
        {
            RaiseFatal("sidecar sent an unreadable ready message");
            return;
        }
        if (ready.ProtocolVersion != Protocol.ProtocolVersion.Current)
        {
            RaiseFatal($"protocol version mismatch: shell v{Protocol.ProtocolVersion.Current}, sidecar v{ready.ProtocolVersion}. Update the sidecar or the shell.");
            return;
        }
        restartAttempts = 0;
        Ready?.Invoke(ready);
    }

    public void SendNativeResult(string requestId, NativeCallOutcome outcome)
    {
        Send(new Protocol.NativeResultMessage
        {
            RequestId = requestId,
            Ok = outcome.Ok,
            Result = outcome.Result,
            Error = outcome.Error,
        });
    }

    private void OnExited()
    {
        if (disposed || fatal)
        {
            return;
        }

        SidecarCrashed?.Invoke("The extension sidecar crashed. Restarting…");

        var attempt = Math.Min(restartAttempts, RestartBackoffMs.Length - 1);
        var delay = RestartBackoffMs[attempt];
        restartAttempts++;
        Task.Run(async () =>
        {
            await Task.Delay(delay);
            if (!disposed && !fatal)
            {
                Start();
            }
        });
    }

    public void Stop()
    {
        disposed = true;
        try
        {
            if (process is { HasExited: false })
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            /* already gone */
        }
        job?.Dispose();
        job = null;
    }

    private void Send<T>(T message)
    {
        var p = process;
        if (p is null || p.HasExited || p.StandardInput is null)
        {
            return;
        }
        try
        {
            p.StandardInput.WriteLine(JsonSerializer.Serialize(message, Protocol.JsonOptions.Default));
            p.StandardInput.Flush();
        }
        catch (Exception ex)
        {
            log($"send failed: {ex.Message}");
        }
    }

    public void Dispose()
    {
        Stop();
    }
}
