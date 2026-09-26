using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using Velopack;
using Velopack.Sources;

namespace FlowKey.Shell.Native;

/// <summary>
/// IUpdateSource backed by the GitHub Releases API. Velopack 1.x ships no
/// GitHub source (a plain repo URL becomes a SimpleWebSource that 404s on
/// /RELEASES), so this fetches releases.{channel}.json from the newest
/// non-draft release and downloads its assets. Prereleases are accepted —
/// every shell-v* tag publishes one.
/// </summary>
public sealed class GitHubReleasesSource : IUpdateSource
{
    private const string AcceptJson = "application/vnd.github+json";

    private readonly HttpClient http;
    private readonly string releasesApiUrl;

    public GitHubReleasesSource(string repoUrl)
    {
        // repoUrl: https://github.com/{owner}/{repo} — the API lives on
        // api.github.com; hitting github.com/.../releases with a JSON Accept
        // returns 406.
        var parts = repoUrl.TrimEnd('/').Split('/');
        var owner = parts[^2];
        var repo = parts[^1];
        releasesApiUrl = $"https://api.github.com/repos/{owner}/{repo}/releases?per_page=10";
        http = new HttpClient();
        http.DefaultRequestHeaders.UserAgent.ParseAdd("FlowKey-Shell-Updater");
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue(AcceptJson));
    }

    public async Task<VelopackAssetFeed> GetReleaseFeed(
        Velopack.Logging.IVelopackLogger logger,
        string? releaseName,
        string? channel,
        Guid? stagingId,
        VelopackAsset? latestLocalAsset)
    {
        // The API edge occasionally serves empty-body 4xx/5xx blips; one
        // retry keeps a transient edge failure from breaking the check.
        HttpResponseMessage? response = null;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            response = await http.GetAsync(releasesApiUrl);
            if (response.IsSuccessStatusCode)
            {
                break;
            }
            if (attempt == 0)
            {
                response.Dispose();
                await Task.Delay(500);
            }
        }
        if (response is null || !response.IsSuccessStatusCode)
        {
            var status = response?.StatusCode.ToString() ?? "no response";
            var req = response?.RequestMessage;
            var headers = req is null ? "" : string.Join(" | ",
                req.Headers.Select(h => h.Key + "=" + string.Join(",", h.Value)));
            throw new HttpRequestException($"GitHub releases request failed: {status} uri={req?.RequestUri} headers[{headers}]");
        }
        var releases = await response.Content.ReadFromJsonAsync<List<GitHubRelease>>(GitHubJsonOptions.Default)
            ?? new List<GitHubRelease>();

        foreach (var release in releases)
        {
            if (release.Draft)
            {
                continue;
            }
            var feedAsset = release.Assets.FirstOrDefault(a => a.Name == $"releases.{channel ?? "win"}.json");
            if (feedAsset is null)
            {
                logger.Log(Velopack.Logging.VelopackLogLevel.Information,
                    $"release {release.TagName} has no releases.{channel ?? "win"}.json asset "
                    + $"(assets: {string.Join(", ", release.Assets.Select(a => a.Name))})", null);
                continue;
            }
            var feedJson = await http.GetStringAsync(feedAsset.BrowserDownloadUrl);
            var feed = JsonSerializer.Deserialize<VelopackAssetFeed>(feedJson, GitHubJsonOptions.Default);
            if (feed?.Assets is { Length: > 0 })
            {
                // Remember which release owns these assets for DownloadReleaseEntry.
                latestAssetsUrl = release.AssetsUrl;
                return feed;
            }
            logger.Log(Velopack.Logging.VelopackLogLevel.Information,
                $"release {release.TagName} feed has no assets", null);
        }
        return new VelopackAssetFeed { Assets = Array.Empty<VelopackAsset>() };
    }

    // Asset list of the release the current feed came from (api url for the
    // asset collection); set during GetReleaseFeed, read during download.
    private string? latestAssetsUrl;

    public async Task DownloadReleaseEntry(
        Velopack.Logging.IVelopackLogger logger,
        VelopackAsset asset,
        string targetFile,
        Action<int> progress,
        CancellationToken cancellationToken)
    {
        if (latestAssetsUrl is null)
        {
            throw new InvalidOperationException("no release feed was fetched before downloading");
        }
        using var response = await http.GetAsync(latestAssetsUrl, cancellationToken);
        response.EnsureSuccessStatusCode();
        var assets = await response.Content.ReadFromJsonAsync<List<GitHubReleaseAsset>>(GitHubJsonOptions.Default)
            ?? new List<GitHubReleaseAsset>();
        var downloadUrl = assets.FirstOrDefault(a => a.Name == asset.FileName)?.BrowserDownloadUrl
            ?? throw new InvalidOperationException($"release asset '{asset.FileName}' was not found");

        using var download = await http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        download.EnsureSuccessStatusCode();
        var total = download.Content.Headers.ContentLength ?? -1;
        await using var source = await download.Content.ReadAsStreamAsync(cancellationToken);
        await using var target = File.Create(targetFile);
        var buffer = new byte[81920];
        long written = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
        {
            await target.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            written += read;
            if (total > 0)
            {
                progress((int)(100 * written / total));
            }
        }
    }

    public sealed class GitHubRelease
    {
        [JsonPropertyName("draft")]
        public bool Draft { get; set; }

        [JsonPropertyName("prerelease")]
        public bool Prerelease { get; set; }

        [JsonPropertyName("tag_name")]
        public string TagName { get; set; } = "";

        [JsonPropertyName("assets_url")]
        public string AssetsUrl { get; set; } = "";

        [JsonPropertyName("assets")]
        public List<GitHubReleaseAsset> Assets { get; set; } = new();
    }

    public sealed class GitHubReleaseAsset
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("browser_download_url")]
        public string BrowserDownloadUrl { get; set; } = "";

        [JsonPropertyName("url")]
        public string Url { get; set; } = "";
    }
}

public static class GitHubJsonOptions
{
    // No naming policy: GitHub REST models carry explicit [JsonPropertyName]
    // attributes and Velopack's releases.{channel}.json is PascalCase.
    public static JsonSerializerOptions Default { get; } = new()
    {
        Converters = { new SemanticVersionConverter(), new JsonStringEnumConverter() },
    };
}

public sealed class SemanticVersionConverter : JsonConverter<SemanticVersion>
{
    public override SemanticVersion Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var text = reader.GetString() ?? throw new JsonException("null is not a SemanticVersion");
        return SemanticVersion.Parse(text);
    }

    public override void Write(Utf8JsonWriter writer, SemanticVersion value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToNormalizedString());
    }
}
