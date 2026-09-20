using System.Net;
using System.Text.RegularExpressions;

namespace FlowKey.Shell.Native;

public sealed record PolicyDecision(bool Allowed, string? ErrorCode, string? Message)
{
    public static PolicyDecision Ok() => new(true, null, null);
    public static PolicyDecision Deny(string code, string message) => new(false, code, message);
}

public static partial class HttpPolicy
{
    public sealed record HostRule(string Host, int Port, bool AllowCleartext);

    public static List<HostRule> ParseHostRules(IReadOnlyList<string> httpHosts)
    {
        var rules = new List<HostRule>();
        foreach (var raw in httpHosts)
        {
            var entry = raw.Trim();
            var allowCleartext = false;
            if (entry.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            {
                allowCleartext = true;
                entry = entry["http://".Length..];
            }
            else if (entry.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                entry = entry["https://".Length..];
            }
            var port = allowCleartext ? 80 : 443;
            var host = entry;
            var colon = entry.LastIndexOf(':');
            if (colon > 0 && int.TryParse(entry[(colon + 1)..], out var declaredPort))
            {
                host = entry[..colon];
                port = declaredPort;
            }
            if (host.Length > 0)
            {
                rules.Add(new HostRule(host.ToLowerInvariant(), port, allowCleartext));
            }
        }
        return rules;
    }

    public static PolicyDecision ValidateRequest(Uri uri, IReadOnlyList<string> httpHosts)
    {
        if (uri.Scheme is not ("http" or "https"))
        {
            return PolicyDecision.Deny("invalidUrl", $"unsupported scheme '{uri.Scheme}'");
        }
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            return PolicyDecision.Deny("userInfoBlocked", "URLs with embedded credentials are not allowed");
        }
        var host = uri.Host.ToLowerInvariant();
        var rule = ParseHostRules(httpHosts).FirstOrDefault(r => r.Host == host);
        if (rule is null)
        {
            return PolicyDecision.Deny("hostNotAllowed", $"host '{host}' is not in the extension's httpHosts allowlist");
        }
        if (uri.Scheme == "http" && !rule.AllowCleartext)
        {
            return PolicyDecision.Deny("insecureBlocked", $"cleartext http is not allowed for '{host}'");
        }
        if (uri.Port != -1 && uri.Port != rule.Port)
        {
            return PolicyDecision.Deny("portBlocked", $"port {uri.Port} is not allowed for '{host}' (allowed: {rule.Port})");
        }
        return PolicyDecision.Ok();
    }

    public static PolicyDecision ValidateResolvedAddresses(string host, IPAddress[] addresses)
    {
        foreach (var address in addresses)
        {
            if (IsBlockedAddress(address))
            {
                return PolicyDecision.Deny(
                    "privateAddressBlocked",
                    $"host '{host}' resolves to a blocked address ({address})");
            }
        }
        return PolicyDecision.Ok();
    }

    public static PolicyDecision ValidateRedirect(Uri current, Uri target, IReadOnlyList<string> httpHosts)
    {
        if (current.Scheme == "https" && target.Scheme == "http")
        {
            var rule = ParseHostRules(httpHosts).FirstOrDefault(r => r.Host == target.Host.ToLowerInvariant());
            if (rule is null || !rule.AllowCleartext)
            {
                return PolicyDecision.Deny("insecureBlocked", "redirect downgrades https to http");
            }
        }
        return ValidateRequest(target, httpHosts);
    }

    public static bool IsCrossHost(Uri a, Uri b) =>
        !string.Equals(a.Host, b.Host, StringComparison.OrdinalIgnoreCase);

    public static bool IsBlockedAddress(IPAddress address)
    {
        var ip = address;
        if (ip.IsIPv4MappedToIPv6)
        {
            ip = ip.MapToIPv4();
        }
        if (ip.Equals(IPAddress.Loopback) || ip.Equals(IPAddress.IPv6Loopback))
        {
            return true;
        }
        if (ip.AddressFamily is System.Net.Sockets.AddressFamily.InterNetwork or System.Net.Sockets.AddressFamily.InterNetworkV6)
        {
            var bytes = ip.GetAddressBytes();
            if (bytes.Length == 4)
            {
                if (bytes[0] == 127 || bytes[0] == 10 || bytes[0] == 0 || bytes[0] == 169 && bytes[1] == 254)
                {
                    return true;
                }
                if (bytes[0] == 172 && (bytes[1] & 0xF0) == 16)
                {
                    return true;
                }
                if (bytes[0] == 192 && bytes[1] == 168)
                {
                    return true;
                }
                if (bytes[0] == 100 && (bytes[1] & 0xC0) == 64)
                {
                    return true;
                }
                if (bytes[0] >= 224)
                {
                    return true;
                }
                return false;
            }
            if (bytes[0] == 0xfe && (bytes[1] & 0xC0) == 0x80)
            {
                return true;
            }
            if ((bytes[0] & 0xFE) == 0xFC)
            {
                return true;
            }
            if (bytes[0] == 0xff)
            {
                return true;
            }
        }
        return ip.Equals(IPAddress.IPv6Loopback);
    }

    [GeneratedRegex("^[a-zA-Z][a-zA-Z0-9+.-]*://")]
    private static partial Regex SchemeRegex();
}
