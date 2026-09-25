namespace FlowKey.Shell.Native;

public enum UpdatePhase
{
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Ready,
    Error,
}

public sealed record UpdateStatus(
    UpdatePhase Phase,
    string? CurrentVersion,
    string? NewVersion,
    int? ProgressPercent,
    string? Message)
{
    public bool ShowBanner => Phase is UpdatePhase.Available or UpdatePhase.Downloading or UpdatePhase.Ready;
}

/// <summary>
/// Pure phase machine for the updater, kept free of Velopack and WPF dependencies
/// so Shell.Tests can drive every transition directly.
/// </summary>
public sealed class UpdateStateTracker
{
    private readonly object gate = new();

    public UpdateStatus Status { get; private set; }

    public UpdateStateTracker(string? currentVersion)
    {
        Status = new UpdateStatus(UpdatePhase.Idle, currentVersion, null, null, null);
    }

    public UpdateStatus BeginCheck()
    {
        lock (gate)
        {
            if (Status.Phase is UpdatePhase.Checking or UpdatePhase.Downloading)
            {
                return Status;
            }
            Status = Status with { Phase = UpdatePhase.Checking, Message = null, ProgressPercent = null };
            return Status;
        }
    }

    public UpdateStatus CheckCompleted(bool updateAvailable, string? newVersion, string? message = null)
    {
        lock (gate)
        {
            Status = updateAvailable
                ? new UpdateStatus(UpdatePhase.Available, Status.CurrentVersion, newVersion, null, message)
                : new UpdateStatus(UpdatePhase.UpToDate, Status.CurrentVersion, null, null, message);
            return Status;
        }
    }

    public UpdateStatus CheckFailed(string message)
    {
        lock (gate)
        {
            Status = new UpdateStatus(UpdatePhase.Error, Status.CurrentVersion, Status.NewVersion, null, message);
            return Status;
        }
    }

    public UpdateStatus BeginDownload()
    {
        lock (gate)
        {
            if (Status.Phase is not UpdatePhase.Available and not UpdatePhase.Error)
            {
                return Status;
            }
            Status = Status with { Phase = UpdatePhase.Downloading, ProgressPercent = 0, Message = null };
            return Status;
        }
    }

    public UpdateStatus DownloadProgress(int percent)
    {
        lock (gate)
        {
            if (Status.Phase != UpdatePhase.Downloading)
            {
                return Status;
            }
            Status = Status with { ProgressPercent = Math.Clamp(percent, 0, 100) };
            return Status;
        }
    }

    public UpdateStatus DownloadCompleted()
    {
        lock (gate)
        {
            Status = Status with { Phase = UpdatePhase.Ready, ProgressPercent = 100, Message = null };
            return Status;
        }
    }

    public UpdateStatus DownloadFailed(string message)
    {
        lock (gate)
        {
            Status = new UpdateStatus(UpdatePhase.Error, Status.CurrentVersion, Status.NewVersion, null, message);
            return Status;
        }
    }

    public UpdateStatus Installed()
    {
        lock (gate)
        {
            Status = new UpdateStatus(UpdatePhase.Idle, Status.CurrentVersion, null, null, null);
            return Status;
        }
    }
}
