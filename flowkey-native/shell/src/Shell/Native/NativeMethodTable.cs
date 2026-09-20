using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record NativeCallOutcome(bool Ok, JsonElement? Result, Protocol.ProtocolError? Error)
{
    public static NativeCallOutcome Success(JsonElement? result = null) => new(true, result, null);

    public static NativeCallOutcome Failure(string code, string message) =>
        new(false, null, new Protocol.ProtocolError { Code = code, Message = message });
}

public sealed class NativeMethodTable
{
    private readonly Dictionary<string, Func<Dictionary<string, JsonElement>?, NativeCallOutcome>> methods;

    public NativeMethodTable()
    {
        methods = new Dictionary<string, Func<Dictionary<string, JsonElement>?, NativeCallOutcome>>(StringComparer.Ordinal)
        {
            ["clipboard.write"] = WriteClipboard,
        };
    }

    public void Register(string method, Func<Dictionary<string, JsonElement>?, NativeCallOutcome> handler)
    {
        methods[method] = handler;
    }

    public NativeCallOutcome Execute(string method, IReadOnlyList<string> declaredMethods, Dictionary<string, JsonElement>? parameters)
    {
        if (!declaredMethods.Contains(method, StringComparer.Ordinal))
        {
            return NativeCallOutcome.Failure("methodNotDeclared", $"extension did not declare native method '{method}' in its manifest");
        }

        if (!methods.TryGetValue(method, out var handler))
        {
            return NativeCallOutcome.Failure("notImplemented", $"native method '{method}' is not implemented by this shell");
        }

        return handler(parameters);
    }

    private static NativeCallOutcome WriteClipboard(Dictionary<string, JsonElement>? parameters)
    {
        if (parameters is null || !parameters.TryGetValue("text", out var text) || text.ValueKind != JsonValueKind.String)
        {
            return NativeCallOutcome.Failure("invalidParams", "clipboard.write requires a string 'text' parameter");
        }

        try
        {
            ClipboardService.WriteText(text.GetString()!);
            return NativeCallOutcome.Success();
        }
        catch (Exception ex)
        {
            return NativeCallOutcome.Failure("clipboardFailed", ex.Message);
        }
    }
}
