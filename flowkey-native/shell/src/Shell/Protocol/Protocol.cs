using System.Text.Json;
using System.Text.Json.Serialization;

namespace FlowKey.Shell.Protocol;

public static class ProtocolVersion
{
    public const int Current = 1;
}

public static class JsonOptions
{
    public static JsonSerializerOptions Default { get; } = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
