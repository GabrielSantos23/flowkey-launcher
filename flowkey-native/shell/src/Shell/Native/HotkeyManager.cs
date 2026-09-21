using System.Collections.Concurrent;
using System.Runtime.InteropServices;

namespace FlowKey.Shell.Native;

public sealed class HotkeyManager : IDisposable
{
    public const uint MOD_ALT = 0x0001;
    public const uint MOD_CONTROL = 0x0002;
    public const uint MOD_SHIFT = 0x0004;
    public const uint MOD_WIN = 0x0008;

    private const uint WM_HOTKEY = 0x0312;

    private readonly BlockingCollection<HotkeyRequest> requests = new();
    private readonly Action<int> onHotkey;
    private readonly Action<string> log;
    private Thread? thread;

    public HotkeyManager(Action<int> onHotkey, Action<string> log)
    {
        this.onHotkey = onHotkey;
        this.log = log;
    }

    public void Start()
    {
        thread = new Thread(Pump)
        {
            Name = "flowkey-hotkeys",
            IsBackground = true,
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
    }

    public bool Register(int id, uint modifier, uint virtualKey)
    {
        var request = new HotkeyRequest { Kind = RequestKind.Register, Id = id, Modifier = modifier, VirtualKey = virtualKey };
        return Execute(request);
    }

    public bool Unregister(int id)
    {
        var request = new HotkeyRequest { Kind = RequestKind.Unregister, Id = id };
        return Execute(request);
    }

    private bool Execute(HotkeyRequest request)
    {
        if (thread is null || !thread.IsAlive)
        {
            return false;
        }
        requests.Add(request);
        return request.Completion.Task.Wait(2000) && request.Completion.Task.Result;
    }

    private void Pump()
    {
        CoInitializeEx(IntPtr.Zero, COINIT_APARTMENTTHREADED);
        while (!requests.IsCompleted)
        {
            while (requests.TryTake(out var request, 15))
            {
                switch (request.Kind)
                {
                    case RequestKind.Register:
                        var registered = RegisterHotKey(IntPtr.Zero, request.Id, request.Modifier, request.VirtualKey);
                        if (!registered)
                        {
                            log("RegisterHotKey(" + request.Id + ") failed: " + Marshal.GetLastWin32Error());
                        }
                        request.Completion.TrySetResult(registered);
                        break;
                    case RequestKind.Unregister:
                        UnregisterHotKey(IntPtr.Zero, request.Id);
                        request.Completion.TrySetResult(true);
                        break;
                }
            }
            var msg = default(MSG);
            while (PeekMessageW(out msg, IntPtr.Zero, 0, 0, 1))
            {
                if (msg.message == WM_HOTKEY)
                {
                    onHotkey((int)msg.wParam);
                }
                TranslateMessage(ref msg);
                DispatchMessageW(ref msg);
            }
        }
    }

    public void Dispose()
    {
        requests.CompleteAdding();
    }

    public static bool IsReservedCombo(uint modifier, uint virtualKey)
    {
        if ((modifier & (MOD_CONTROL | MOD_ALT | MOD_WIN)) == 0)
        {
            return true;
        }
        if (virtualKey is >= 0x70 and <= 0x87 && modifier == MOD_SHIFT)
        {
            return true;
        }
        if (virtualKey is 0x1B or 0x09 or 0x08 or 0x0D or 0x20 or 0x2E)
        {
            return modifier == 0 || modifier == MOD_SHIFT;
        }
        return false;
    }

    public static bool IsAltGrRisky(uint modifier, uint virtualKey) =>
        modifier == (MOD_CONTROL | MOD_ALT) && virtualKey is >= 0x41 and <= 0x5A or >= 0x30 and <= 0x39;

    private const uint COINIT_APARTMENTTHREADED = 0x2;

    private enum RequestKind
    {
        Register,
        Unregister,
    }

    private sealed class HotkeyRequest
    {
        public RequestKind Kind { get; init; }
        public int Id { get; init; }
        public uint Modifier { get; init; }
        public uint VirtualKey { get; init; }
        public TaskCompletionSource<bool> Completion { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int ptX;
        public int ptY;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    private static extern bool PeekMessageW(out MSG message, IntPtr hWnd, uint minimum, uint maximum, uint remove);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG message);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessageW(ref MSG message);

    [DllImport("ole32.dll")]
    private static extern int CoInitializeEx(IntPtr pvReserved, uint dwCoInit);
}
