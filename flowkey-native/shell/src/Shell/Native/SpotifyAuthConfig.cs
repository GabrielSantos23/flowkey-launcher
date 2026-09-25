using System.IO;
using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record SpotifyAuthConfig(string? ClientId, int RedirectPort)
{
    public const string ClientIdEnvVar = "FLOWKEY_SPOTIFY_CLIENT_ID";
    public const string ClientIdDocs =
        "Spotify client id is not configured. Set the FLOWKEY_SPOTIFY_CLIENT_ID environment variable "
        + "or create '" + ConfigFileName + "' with {\"clientId\":\"...\"} — see README 'Bring your own Spotify app'.";

    public const string ConfigFileName = "spotify-auth.json";

    public static SpotifyAuthConfig Load(string? directory = null)
    {
        var fromEnv = Environment.GetEnvironmentVariable(ClientIdEnvVar);
        var redirectPort = 0;
        string? fromFile = null;
        try
        {
            var path = Path.Combine(directory ?? AppLauncherService.DataDirectory, ConfigFileName);
            if (File.Exists(path))
            {
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                if (document.RootElement.TryGetProperty("clientId", out var clientId) && clientId.ValueKind == JsonValueKind.String)
                {
                    fromFile = clientId.GetString();
                }
                if (document.RootElement.TryGetProperty("redirectPort", out var port) && port.ValueKind == JsonValueKind.Number && port.TryGetInt32(out var parsed))
                {
                    redirectPort = Math.Clamp(parsed, 0, 65535);
                }
            }
        }
        catch (JsonException)
        {
        }
        catch (IOException)
        {
        }
        return new SpotifyAuthConfig(FirstNonEmpty(fromEnv, fromFile), redirectPort);
    }

    private static string? FirstNonEmpty(string? first, string? second) =>
        !string.IsNullOrWhiteSpace(first) ? first : (!string.IsNullOrWhiteSpace(second) ? second : null);
}
