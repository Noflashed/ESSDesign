using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ESSDesign.Server.Models;

namespace ESSDesign.Server.Services
{
    public class PushNotificationService
    {
        private readonly IConfiguration _configuration;
        private readonly SupabaseService _supabaseService;
        private readonly ILogger<PushNotificationService> _logger;
        private readonly HttpClient _httpClient;

        private static readonly object JwtLock = new();
        private static string? _cachedJwt;
        private static DateTime _cachedJwtExpiry = DateTime.MinValue;

        public PushNotificationService(
            IConfiguration configuration,
            SupabaseService supabaseService,
            IHttpClientFactory httpClientFactory,
            ILogger<PushNotificationService> logger)
        {
            _configuration = configuration;
            _supabaseService = supabaseService;
            _logger = logger;
            _httpClient = httpClientFactory.CreateClient();
            _httpClient.Timeout = TimeSpan.FromSeconds(10);
        }

        public bool IsConfigured()
        {
            return !string.IsNullOrWhiteSpace(_configuration["Apns:TeamId"]) &&
                   !string.IsNullOrWhiteSpace(_configuration["Apns:KeyId"]) &&
                   !string.IsNullOrWhiteSpace(_configuration["Apns:PrivateKey"]) &&
                   !string.IsNullOrWhiteSpace(_configuration["Apns:BundleId"]);
        }

        public async Task<int> SendDocumentUploadPushAsync(
            IEnumerable<string> recipientUserIds,
            string uploaderName,
            string client,
            string project,
            string scaffold,
            string document,
            string revisionNumber)
        {
            if (!IsConfigured())
            {
                _logger.LogWarning("APNs not configured. Skipping push notification.");
                return 0;
            }

            var tokens = await _supabaseService.GetActivePushTokensByUserIdsAsync(recipientUserIds, "ios");
            if (!tokens.Any())
            {
                _logger.LogInformation("No active iOS device tokens for selected recipients.");
                return 0;
            }

            var title = "New document uploaded";
            var body = $"{client} / {project} / {scaffold} - Rev {revisionNumber}";
            var sentCount = 0;

            foreach (var row in tokens)
            {
                var ok = await SendSinglePushAsync(
                    row.Token,
                    title,
                    body,
                    new Dictionary<string, object?>
                    {
                        ["type"] = "document_upload",
                        ["uploaderName"] = uploaderName,
                        ["client"] = client,
                        ["project"] = project,
                        ["scaffold"] = scaffold,
                        ["document"] = document,
                        ["revisionNumber"] = revisionNumber,
                    });

                if (ok)
                {
                    sentCount++;
                }
            }

            return sentCount;
        }

        public async Task<int> SendDocumentReplacementPushAsync(
            IEnumerable<string> recipientUserIds,
            string updaterName,
            string client,
            string project,
            string scaffold,
            string document,
            string revisionNumber)
        {
            return await SendDocumentPushAsync(
                recipientUserIds,
                "Document revision replaced",
                $"{client} / {project} / {scaffold} - Rev {revisionNumber}",
                new Dictionary<string, object?>
                {
                    ["type"] = "document_revision_replaced",
                    ["uploaderName"] = updaterName,
                    ["client"] = client,
                    ["project"] = project,
                    ["scaffold"] = scaffold,
                    ["document"] = document,
                    ["revisionNumber"] = revisionNumber,
                });
        }

        public async Task<int> SendDocumentSharePushAsync(
            IEnumerable<string> recipientUserIds,
            string sharedByName,
            string client,
            string project,
            string scaffold,
            string document,
            string revisionNumber)
        {
            return await SendDocumentPushAsync(
                recipientUserIds,
                "Document shared",
                $"{client} / {project} / {scaffold} - Rev {revisionNumber}",
                new Dictionary<string, object?>
                {
                    ["type"] = "document_shared",
                    ["uploaderName"] = sharedByName,
                    ["client"] = client,
                    ["project"] = project,
                    ["scaffold"] = scaffold,
                    ["document"] = document,
                    ["revisionNumber"] = revisionNumber,
                });
        }

        private async Task<int> SendDocumentPushAsync(
            IEnumerable<string> recipientUserIds,
            string title,
            string body,
            Dictionary<string, object?> data)
        {
            if (!IsConfigured())
            {
                _logger.LogWarning("APNs not configured. Skipping push notification.");
                return 0;
            }

            var tokens = await _supabaseService.GetActivePushTokensByUserIdsAsync(recipientUserIds, "ios");
            if (!tokens.Any())
            {
                _logger.LogInformation("No active iOS device tokens for selected recipients.");
                return 0;
            }

            var sentCount = 0;
            foreach (var row in tokens)
            {
                var ok = await SendSinglePushAsync(row.Token, title, body, data);
                if (ok)
                {
                    sentCount++;
                }
            }

            return sentCount;
        }

        private async Task<bool> SendSinglePushAsync(
            string deviceToken,
            string title,
            string body,
            Dictionary<string, object?> data)
        {
            try
            {
                var jwt = CreateOrGetJwt();
                var bundleId = _configuration["Apns:BundleId"]!;
                var useSandbox = bool.TryParse(_configuration["Apns:UseSandbox"], out var sandbox) && sandbox;
                var host = useSandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
                var url = $"https://{host}/3/device/{deviceToken}";

                var payload = JsonSerializer.Serialize(new
                {
                    aps = new
                    {
                        alert = new
                        {
                            title,
                            body
                        },
                        sound = "default"
                    },
                    data
                });

                using var request = new HttpRequestMessage(HttpMethod.Post, url);
                request.Version = new Version(2, 0);
                request.VersionPolicy = HttpVersionPolicy.RequestVersionOrLower;
                request.Headers.Authorization = new AuthenticationHeaderValue("bearer", jwt);
                request.Headers.Add("apns-topic", bundleId);
                request.Headers.Add("apns-push-type", "alert");
                request.Headers.Add("apns-priority", "10");
                request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    return true;
                }

                var reason = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("APNs send failed ({StatusCode}): {Reason}", (int)response.StatusCode, reason);

                // Invalid token cleanup hints from APNs
                if ((int)response.StatusCode is 400 or 410)
                {
                    await _supabaseService.DeactivatePushTokenAsync(deviceToken);
                }

                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send APNs notification");
                return false;
            }
        }

        private string CreateOrGetJwt()
        {
            lock (JwtLock)
            {
                if (!string.IsNullOrWhiteSpace(_cachedJwt) && _cachedJwtExpiry > DateTime.UtcNow)
                {
                    return _cachedJwt;
                }

                var teamId = _configuration["Apns:TeamId"]!;
                var keyId = _configuration["Apns:KeyId"]!;
                var privateKey = NormalizePrivateKey(_configuration["Apns:PrivateKey"]!);

                var headerJson = JsonSerializer.Serialize(new Dictionary<string, object>
                {
                    ["alg"] = "ES256",
                    ["kid"] = keyId
                });

                var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var claimsJson = JsonSerializer.Serialize(new Dictionary<string, object>
                {
                    ["iss"] = teamId,
                    ["iat"] = now
                });

                var header = Base64UrlEncode(Encoding.UTF8.GetBytes(headerJson));
                var claims = Base64UrlEncode(Encoding.UTF8.GetBytes(claimsJson));
                var signingInput = $"{header}.{claims}";

                using var ecdsa = ECDsa.Create();
                ecdsa.ImportFromPem(privateKey);
                var signature = ecdsa.SignData(
                    Encoding.UTF8.GetBytes(signingInput),
                    HashAlgorithmName.SHA256,
                    DSASignatureFormat.IeeeP1363FixedFieldConcatenation);

                var signed = $"{signingInput}.{Base64UrlEncode(signature)}";
                _cachedJwt = signed;
                _cachedJwtExpiry = DateTime.UtcNow.AddMinutes(50);
                return signed;
            }
        }

        private static string NormalizePrivateKey(string key)
        {
            var trimmed = key.Trim();
            if (trimmed.Contains("\\n", StringComparison.Ordinal))
            {
                return trimmed.Replace("\\n", "\n", StringComparison.Ordinal);
            }
            return trimmed;
        }

        private static string Base64UrlEncode(byte[] input)
        {
            return Convert.ToBase64String(input)
                .Replace('+', '-')
                .Replace('/', '_')
                .TrimEnd('=');
        }
    }
}
