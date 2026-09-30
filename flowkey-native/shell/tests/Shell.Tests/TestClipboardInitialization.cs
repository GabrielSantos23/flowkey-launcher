using FlowKey.Shell.Native;

namespace FlowKey.Shell.Tests;

/// <summary>
/// Runs once when the test assembly loads: clipboard writes made by any test
/// carry the ExcludeClipboardContentFromMonitorProcessing format, so the
/// launcher (if open during a test run) never records fixture strings as if
/// the user had copied them.
/// </summary>
internal static class TestClipboardInitialization
{
    [System.Runtime.CompilerServices.ModuleInitializer]
    internal static void Initialize() => ClipboardService.ExcludeFromMonitor = true;
}
