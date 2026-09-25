using System.Diagnostics;
using System.IO;
using FlowKey.Shell.Sidecar;
using Xunit;
using Xunit.Abstractions;

namespace FlowKey.Shell.Tests;

public class SidecarPipeDeadlockTests
{
    private readonly ITestOutputHelper output;

    public SidecarPipeDeadlockTests(ITestOutputHelper output)
    {
        this.output = output;
    }

    private static string FindSidecarScript()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "sidecar", "src", "main.ts");
            if (File.Exists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent!;
        }
        throw new InvalidOperationException("sidecar script not found");
    }

    [Fact]
    public async Task LargeBidirectionalTrafficDoesNotHangWithBusyCaller()
    {
        var host = new SidecarHost(FindSidecarScript(), Path.Combine(Path.GetDirectoryName(FindSidecarScript())!, "..", "extensions"), _ => { });
        var received = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var uiResponseCount = 0;
        var receivedLock = new object();

        host.Ui += message =>
        {

            lock (receivedLock)
            {
                uiResponseCount++;
                if (uiResponseCount == TotalSearches)
                {
                    received.TrySetResult(uiResponseCount);
                }
            }
        };
        host.Start();

        var bigQuery = new string('x', 100_000);
        var sendMilliseconds = 0L;
        try
        {
            for (var i = 0; i < TotalSearches; i++)
            {
                if (i % 2 == 0)
                {
                    Thread.SpinWait(20_000_000);
                }
                var sendStopwatch = Stopwatch.StartNew();
                host.SendSearch("emoji", i % 2 == 0 ? "" : bigQuery);
                sendMilliseconds += sendStopwatch.ElapsedMilliseconds;
            }

            var winner = await Task.WhenAny(received.Task, Task.Delay(TimeoutMs));
            Assert.True(received.Task.IsCompleted, $"only {uiResponseCount}/{TotalSearches} responses arrived within {TimeoutMs} ms");

            Assert.True(sendMilliseconds < SendBudgetMs,
                $"Send blocked the caller for {sendMilliseconds} ms total; Send must enqueue, never write on the caller");
            output.WriteLine($"send time {sendMilliseconds} ms; all {TotalSearches} responses received");
        }
        finally
        {
            host.Dispose();
        }
    }

    private const int TotalSearches = 20;
    private const int TimeoutMs = 60_000;
    private const int SendBudgetMs = 5_000;
}
