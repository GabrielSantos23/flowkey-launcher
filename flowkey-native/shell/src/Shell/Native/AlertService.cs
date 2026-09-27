using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record AlertRequest(
    string Title,
    string? Message,
    string ConfirmTitle,
    string CancelTitle,
    bool Destructive);

/// <summary>
/// Parses `alert.confirm` parameters for the extension confirmation modal.
/// Pure logic; the dialog lives in Windows/ExtensionAlertDialog.
/// </summary>
public static class AlertService
{
    public const string DefaultConfirmTitle = "OK";
    public const string DefaultCancelTitle = "Cancel";

    public static bool TryParseRequest(Dictionary<string, JsonElement>? parameters, out AlertRequest? request, out string? error)
    {
        request = null;
        error = null;
        if (parameters is null
            || !parameters.TryGetValue("title", out var titleElement)
            || titleElement.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(titleElement.GetString()))
        {
            error = "alert.confirm requires a non-empty string 'title' parameter";
            return false;
        }

        string? message = null;
        if (parameters.TryGetValue("message", out var messageElement))
        {
            if (messageElement.ValueKind != JsonValueKind.String)
            {
                error = "alert.confirm 'message' must be a string";
                return false;
            }
            message = messageElement.GetString();
        }

        string confirmTitle = DefaultConfirmTitle;
        if (parameters.TryGetValue("confirmTitle", out var confirmElement))
        {
            if (confirmElement.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(confirmElement.GetString()))
            {
                error = "alert.confirm 'confirmTitle' must be a non-empty string";
                return false;
            }
            confirmTitle = confirmElement.GetString()!;
        }

        string cancelTitle = DefaultCancelTitle;
        if (parameters.TryGetValue("cancelTitle", out var cancelElement))
        {
            if (cancelElement.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(cancelElement.GetString()))
            {
                error = "alert.confirm 'cancelTitle' must be a non-empty string";
                return false;
            }
            cancelTitle = cancelElement.GetString()!;
        }

        var destructive = false;
        if (parameters.TryGetValue("destructive", out var destructiveElement))
        {
            if (destructiveElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            {
                error = "alert.confirm 'destructive' must be a boolean";
                return false;
            }
            destructive = destructiveElement.GetBoolean();
        }

        request = new AlertRequest(
            titleElement.GetString()!.TrimEnd(),
            string.IsNullOrEmpty(message) ? null : message,
            confirmTitle,
            cancelTitle,
            destructive);
        return true;
    }
}
