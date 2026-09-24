using System.IO;
using System.Net.Http;
using System.Text.Json;
using FlowKey.Shell.Native;

namespace FlowKey.Shell.Search.Calculator;

public sealed class CurrencyRates
{
    private const string ApiBase = "https://api.frankfurter.app/latest?from=USD";
    private static readonly string[] AllowedHosts = ["api.frankfurter.app"];
    private const int MaxResponseBytes = 1_000_000;
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromHours(12);

    private readonly string cachePath;
    private readonly Func<HttpMessageHandler>? handlerFactory;
    private readonly object gate = new();
    private Dictionary<string, decimal>? rates;
    private DateTimeOffset fetchedAt;
    private bool refreshStarted;

    public event Action? Updated;

    public CurrencyRates(string directory, Func<HttpMessageHandler>? handlerFactory = null)
    {
        this.handlerFactory = handlerFactory;
        cachePath = Path.Combine(directory, "rates.json");
        LoadCache();
    }

    public bool TryGetRate(string currency, out decimal rate)
    {
        lock (gate)
        {
            if (rates is not null && rates.TryGetValue(currency.ToUpperInvariant(), out rate))
            {
                return true;
            }
        }
        rate = 0;
        return false;
    }

    public void EnsureFresh()
    {
        var shouldRefresh = false;
        lock (gate)
        {
            shouldRefresh = rates is null
                || (!refreshStarted && DateTimeOffset.UtcNow - fetchedAt > RefreshInterval);
            if (shouldRefresh)
            {
                refreshStarted = true;
            }
        }
        if (!shouldRefresh)
        {
            return;
        }
        Task.Run(async () =>
        {
            try
            {
                await FetchAsync();
            }
            catch (Exception ex)
            {
                DebugLog.Write("currency rates refresh failed: " + ex.Message);
            }
            finally
            {
                lock (gate)
                {
                    refreshStarted = false;
                }
            }
        });
    }

    private async Task FetchAsync()
    {
        var uri = new Uri(ApiBase);
        if (!HttpPolicy.ValidateRequest(uri, AllowedHosts).Allowed)
        {
            return;
        }
        using var client = handlerFactory is null ? new HttpClient() : new HttpClient(handlerFactory());
        client.Timeout = TimeSpan.FromSeconds(10);
        using var response = await client.GetAsync(uri);
        if (!response.IsSuccessStatusCode)
        {
            return;
        }
        var buffer = new MemoryStream();
        await using (var stream = await response.Content.ReadAsStreamAsync())
        {
            var chunk = new byte[8192];
            while (true)
            {
                var read = await stream.ReadAsync(chunk);
                if (read == 0)
                {
                    break;
                }
                if (buffer.Length + read > MaxResponseBytes)
                {
                    return;
                }
                buffer.Write(chunk, 0, read);
            }
        }
        using var document = JsonDocument.Parse(buffer.ToArray());
        if (!document.RootElement.TryGetProperty("rates", out var element) || element.ValueKind != JsonValueKind.Object)
        {
            return;
        }
        var parsed = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase) { ["USD"] = 1m };
        foreach (var rate in element.EnumerateObject())
        {
            if (rate.Value.TryGetDecimal(out var value))
            {
                parsed[rate.Name] = value;
            }
        }
        if (parsed.Count <= 1)
        {
            return;
        }
        lock (gate)
        {
            rates = parsed;
            fetchedAt = DateTimeOffset.UtcNow;
        }
        SaveCache(parsed);
        Updated?.Invoke();
    }

    private void LoadCache()
    {
        try
        {
            if (!File.Exists(cachePath))
            {
                return;
            }
            using var document = JsonDocument.Parse(File.ReadAllBytes(cachePath));
            if (!document.RootElement.TryGetProperty("rates", out var element) || element.ValueKind != JsonValueKind.Object)
            {
                return;
            }
            if (!document.RootElement.TryGetProperty("fetchedAtUnixMs", out var stamp)
                || !stamp.TryGetInt64(out var unixMs))
            {
                return;
            }
            var parsed = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
            foreach (var rate in element.EnumerateObject())
            {
                if (rate.Value.TryGetDecimal(out var value))
                {
                    parsed[rate.Name] = value;
                }
            }
            if (parsed.Count == 0)
            {
                return;
            }
            lock (gate)
            {
                rates = parsed;
                fetchedAt = DateTimeOffset.FromUnixTimeMilliseconds(unixMs);
            }
        }
        catch (Exception ex)
        {
            DebugLog.Write("currency rates cache load failed: " + ex.Message);
        }
    }

    private void SaveCache(Dictionary<string, decimal> parsed)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(cachePath)!);
            var payload = new
            {
                fetchedAtUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                rates = parsed,
            };
            File.WriteAllText(cachePath, JsonSerializer.Serialize(payload));
        }
        catch (Exception ex)
        {
            DebugLog.Write("currency rates cache save failed: " + ex.Message);
        }
    }
}
