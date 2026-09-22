using System.Text.Json;

namespace FlowKey.Shell.Native;

public sealed record OAuthProviderDefinition(
    string Id,
    string? ClientId,
    string AuthorizeUrl,
    string TokenUrl,
    string Scopes,
    string PinnedHost,
    int RedirectPort)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ClientId);
}

public static class OAuthProviderRegistry
{
    public const string SpotifyScopes =
        "playlist-modify-private playlist-modify-public playlist-read-collaborative playlist-read-private "
        + "user-follow-read user-library-modify user-library-read user-modify-playback-state "
        + "user-read-currently-playing user-read-playback-state user-read-private user-top-read";

    public static IReadOnlyDictionary<string, OAuthProviderDefinition> Load()
    {
        var config = SpotifyAuthConfig.Load();
        var spotify = new OAuthProviderDefinition(
            "spotify",
            config.ClientId,
            "https://accounts.spotify.com/authorize",
            "https://accounts.spotify.com/api/token",
            SpotifyScopes,
            "api.spotify.com",
            config.RedirectPort);
        return new Dictionary<string, OAuthProviderDefinition>(StringComparer.Ordinal)
        {
            [spotify.Id] = spotify,
        };
    }
}
