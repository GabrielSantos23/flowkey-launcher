using System.Net;
using System.Net.Http;
using System.Text.Json;
using FlowKey.Shell.Native;
using Xunit;

namespace FlowKey.Shell.Tests;

public class HttpFetchServiceUploadTests
{
    private sealed class RecordingHandler : HttpMessageHandler
    {
        public List<(string Url, long ContentLength, string Method)> Requests { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var length = request.Content is null ? 0 : request.Content.Headers.ContentLength ?? 0;
            Requests.Add((request.RequestUri!.ToString(), length, request.Method.Method));
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(new byte[] { 1, 2, 3 }),
            };
            return Task.FromResult(response);
        }
    }

    private static Dictionary<string, JsonElement> Params(string url, object? extra = null)
    {
        var parameters = new Dictionary<string, JsonElement>
        {
            ["url"] = JsonSerializer.SerializeToElement(url),
        };
        if (extra is not null)
        {
            foreach (var property in JsonSerializer.SerializeToElement(extra).EnumerateObject())
            {
                parameters[property.Name] = property.Value.Clone();
            }
        }
        return parameters;
    }

    private static readonly IReadOnlyList<string> Hosts = new[] { "speed.example.com" };

    [Fact]
    public async Task Upload_reports_sent_bytes_and_elapsed_time()
    {
        var handler = new RecordingHandler();
        var service = new HttpFetchService();

        var outcome = await service.UploadAsync(
            Params("https://speed.example.com/__up", new { bytes = 4096 }),
            Hosts,
            CancellationToken.None,
            handlerFactory: () => handler);

        Assert.True(outcome.Ok);
        var result = outcome.Result!.Value;
        Assert.Equal(200, result.GetProperty("status").GetInt32());
        Assert.Equal(4096, result.GetProperty("bytesSent").GetInt64());
        Assert.True(result.GetProperty("elapsedMs").GetDouble() >= 0);
        var request = Assert.Single(handler.Requests);
        Assert.Equal("POST", request.Method);
        Assert.Equal(4096, request.ContentLength);
    }

    [Fact]
    public async Task Upload_rejects_hosts_outside_the_allowlist()
    {
        var handler = new RecordingHandler();
        var service = new HttpFetchService();

        var outcome = await service.UploadAsync(
            Params("https://evil.example.com/__up"),
            Hosts,
            CancellationToken.None,
            handlerFactory: () => handler);

        Assert.False(outcome.Ok);
        Assert.Equal("hostNotAllowed", outcome.Error!.Code);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Upload_clamps_the_payload_to_the_maximum()
    {
        var handler = new RecordingHandler();
        var service = new HttpFetchService();

        var outcome = await service.UploadAsync(
            Params("https://speed.example.com/__up", new { bytes = HttpFetchService.MaxUploadBytes * 10 }),
            Hosts,
            CancellationToken.None,
            handlerFactory: () => handler);

        Assert.True(outcome.Ok);
        Assert.Equal(HttpFetchService.MaxUploadBytes, outcome.Result!.Value.GetProperty("bytesSent").GetInt64());
        Assert.Equal(HttpFetchService.MaxUploadBytes, handler.Requests[0].ContentLength);
    }

    [Fact]
    public async Task Upload_requires_a_url()
    {
        var service = new HttpFetchService();

        var outcome = await service.UploadAsync(
            new Dictionary<string, JsonElement>(),
            Hosts,
            CancellationToken.None,
            handlerFactory: () => new RecordingHandler());

        Assert.False(outcome.Ok);
        Assert.Equal("invalidParams", outcome.Error!.Code);
    }
}
