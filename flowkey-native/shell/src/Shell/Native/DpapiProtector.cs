using System.Security.Cryptography;
using System.Text;

namespace FlowKey.Shell.Native;

public static class DpapiProtector
{
    public const string Prefix = "dpapi:";

    public static string Encrypt(string plain)
    {
        var encrypted = ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), null, DataProtectionScope.CurrentUser);
        return Prefix + Convert.ToBase64String(encrypted);
    }

    public static string? TryDecrypt(string stored)
    {
        if (!stored.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return null;
        }
        try
        {
            var encrypted = Convert.FromBase64String(stored[Prefix.Length..]);
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser));
        }
        catch (FormatException)
        {
            return null;
        }
        catch (CryptographicException)
        {
            return null;
        }
    }
}
