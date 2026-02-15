using Resend;
using ESSDesign.Server.Models;

namespace ESSDesign.Server.Services
{
    public class EmailService
    {
        private readonly IResend? _resend;
        private readonly string _fromEmail;
        private readonly string _fromName;
        private readonly string _appBaseUrl;
        private readonly string _frontendUrl;
        private readonly ILogger<EmailService> _logger;

        public EmailService(IResend? resend, IConfiguration configuration, ILogger<EmailService> logger)
        {
            _resend = resend;
            _fromEmail = configuration["Resend:FromEmail"] ?? "noreply@essdesign.com";
            _fromName = configuration["Resend:FromName"] ?? "ESS Design System";
            _appBaseUrl = configuration["AppSettings:BaseUrl"] ?? "https://localhost:7001";
            _frontendUrl = configuration["AppSettings:FrontendUrl"] ?? "https://essdesign.app";
            _logger = logger;
        }

        public async Task SendDocumentUploadNotificationAsync(
            List<string> recipientEmails,
            string documentName,
            string revisionNumber,
            string uploaderName,
            DateTime uploadDate,
            Guid documentId,
            Guid folderId,
            bool hasEssDesign,
            bool hasThirdPartyDesign,
            string? description = null)
        {
            if (recipientEmails == null || !recipientEmails.Any())
            {
                _logger.LogWarning("No recipients provided for email notification");
                return;
            }

            if (_resend == null)
            {
                _logger.LogWarning("Email service is not configured (missing Resend:ApiKey). Skipping notifications.");
                return;
            }

            try
            {
                var subject = $"New Document Upload: {documentName} - Revision {revisionNumber}";

                // Build email content
                var htmlContent = BuildHtmlEmailContent(
                    documentName,
                    revisionNumber,
                    uploaderName,
                    uploadDate,
                    documentId,
                    folderId,
                    hasEssDesign,
                    hasThirdPartyDesign,
                    description
                );

                // Send individual emails to each recipient
                foreach (var recipientEmail in recipientEmails)
                {
                    var message = new EmailMessage();
                    message.From = $"{_fromName} <{_fromEmail}>";
                    message.To.Add(recipientEmail);
                    message.Subject = subject;
                    message.HtmlBody = htmlContent;

                    await _resend.EmailSendAsync(message);
                    _logger.LogInformation("Email sent to {Email}", recipientEmail);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending email notifications");
                // Don't throw - we don't want email failures to break the upload
            }
        }

        private string BuildHtmlEmailContent(
            string documentName,
            string revisionNumber,
            string uploaderName,
            DateTime uploadDate,
            Guid documentId,
            Guid folderId,
            bool hasEssDesign,
            bool hasThirdPartyDesign,
            string? description)
        {
            var essLink = hasEssDesign ? $"{_appBaseUrl}/api/folders/documents/{documentId}/download/ess?redirect=true" : null;
            var thirdPartyLink = hasThirdPartyDesign ? $"{_appBaseUrl}/api/folders/documents/{documentId}/download/thirdparty?redirect=true" : null;
            var folderLink = $"{_frontendUrl}?folder={folderId}";

            var logoUrl = "https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png";

            var aestTime = TimeZoneInfo.ConvertTimeFromUtc(uploadDate, TimeZoneInfo.FindSystemTimeZoneById("Australia/Sydney"));
            var formattedDate = aestTime.ToString("dd MMMM yyyy");
            var formattedTime = aestTime.ToString("h:mm tt");

            // All styles are inlined because email clients (Gmail, Outlook, etc.) strip <style> tags
            var html = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style=""margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d3748;background-color:#edf2f7;-webkit-font-smoothing:antialiased;"">
    <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" border=""0"" width=""100%"" style=""background-color:#edf2f7;padding:40px 20px;"">
        <tr>
            <td align=""center"">
                <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" border=""0"" width=""620"" style=""max-width:620px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;"">
                    <!-- Header -->
                    <tr>
                        <td align=""center"" style=""background-color:#1a1a2e;padding:36px 32px 32px;"">
                            <img src=""{logoUrl}"" alt=""ErectSafe Scaffolding"" height=""52"" style=""display:block;height:52px;width:auto;margin:0 auto 20px;filter:brightness(0) invert(1) brightness(2);-webkit-filter:brightness(0) invert(1) brightness(2);"" />
                            <h1 style=""color:#ffffff;font-size:21px;font-weight:600;letter-spacing:-0.2px;margin:0 0 6px;"">New Document Uploaded</h1>
                            <p style=""color:#9a9ab0;font-size:13px;margin:6px 0 0;font-weight:400;"">A new revision has been added to the design system</p>
                            <p style=""color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin:18px 0 0;"">Revision {System.Web.HttpUtility.HtmlEncode(revisionNumber)}</p>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style=""padding:32px;"">
                            <p style=""font-size:14px;color:#4a5568;margin:0 0 24px;line-height:1.7;"">
                                <strong style=""color:#2d3748;"">{System.Web.HttpUtility.HtmlEncode(uploaderName)}</strong> has uploaded a new document revision. Here are the details:
                            </p>

                            <p style=""font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#a0aec0;font-weight:600;margin:0 0 12px;"">Document Details</p>
                            <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" border=""0"" width=""100%"" style=""background-color:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 24px;"">
                                <tr>
                                    <td style=""padding:14px 20px;border-bottom:1px solid #e2e8f0;"">
                                        <p style=""font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#a0aec0;font-weight:600;margin:0 0 3px;"">Document</p>
                                        <p style=""font-size:15px;color:#2d3748;font-weight:500;margin:0;"">{System.Web.HttpUtility.HtmlEncode(documentName)}</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style=""padding:14px 20px;border-bottom:1px solid #e2e8f0;"">
                                        <p style=""font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#a0aec0;font-weight:600;margin:0 0 3px;"">Revision</p>
                                        <p style=""font-size:15px;color:#2d3748;font-weight:500;margin:0;"">Revision {System.Web.HttpUtility.HtmlEncode(revisionNumber)}</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style=""padding:14px 20px;border-bottom:1px solid #e2e8f0;"">
                                        <p style=""font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#a0aec0;font-weight:600;margin:0 0 3px;"">Uploaded By</p>
                                        <p style=""font-size:15px;color:#2d3748;font-weight:500;margin:0;"">{System.Web.HttpUtility.HtmlEncode(uploaderName)}</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style=""padding:14px 20px;"">
                                        <p style=""font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#a0aec0;font-weight:600;margin:0 0 3px;"">Date &amp; Time</p>
                                        <p style=""font-size:15px;color:#2d3748;font-weight:500;margin:0;"">{formattedDate} at {formattedTime} AEST</p>
                                    </td>
                                </tr>
                            </table>";

            if (!string.IsNullOrWhiteSpace(description))
            {
                html += $@"
                            <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" border=""0"" width=""100%"" style=""margin:0 0 24px;border:1px solid #fde68a;border-left:3px solid #f5a623;border-radius:8px;background-color:#fffbeb;"">
                                <tr>
                                    <td style=""padding:18px 20px;"">
                                        <p style=""font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#b45309;font-weight:700;margin:0 0 6px;"">Change Notes</p>
                                        <p style=""font-size:14px;color:#78350f;line-height:1.6;margin:0;white-space:pre-wrap;"">{System.Web.HttpUtility.HtmlEncode(description)}</p>
                                    </td>
                                </tr>
                            </table>";
            }

            html += @"
                            <!-- Divider -->
                            <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" border=""0"" width=""100%"" style=""margin:24px 0;"">
                                <tr><td style=""height:1px;background-color:#e2e8f0;font-size:0;line-height:0;"">&nbsp;</td></tr>
                            </table>

                            <p style=""font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#a0aec0;font-weight:600;margin:0 0 16px;text-align:center;"">Actions</p>
                            <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" border=""0"" width=""100%"">
                                <tr><td align=""center"">";

            html += $@"
                                    <a href=""{System.Web.HttpUtility.HtmlAttributeEncode(folderLink)}"" style=""display:inline-block;padding:12px 24px;margin:5px;border-radius:6px;font-weight:600;font-size:13px;text-decoration:none;background-color:#f5a623;color:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"">
                                        Open in ESS Design
                                    </a>";

            if (hasEssDesign)
            {
                html += $@"
                                    <a href=""{System.Web.HttpUtility.HtmlAttributeEncode(essLink!)}"" style=""display:inline-block;padding:12px 24px;margin:5px;border-radius:6px;font-weight:600;font-size:13px;text-decoration:none;background-color:#1a1a2e;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"">
                                        Download ESS Design
                                    </a>";
            }

            if (hasThirdPartyDesign)
            {
                html += $@"
                                    <a href=""{System.Web.HttpUtility.HtmlAttributeEncode(thirdPartyLink!)}"" style=""display:inline-block;padding:12px 24px;margin:5px;border-radius:6px;font-weight:600;font-size:13px;text-decoration:none;background-color:#ffffff;color:#2d3748;border:1px solid #cbd5e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"">
                                        Download Third-Party
                                    </a>";
            }

            html += $@"
                                </td></tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td align=""center"" style=""background-color:#f7fafc;padding:24px 32px;border-top:1px solid #e2e8f0;"">
                            <p style=""font-size:12px;font-weight:700;color:#2d3748;letter-spacing:0.5px;margin:0 0 6px;"">ESS Design</p>
                            <p style=""font-size:11px;color:#a0aec0;line-height:1.6;margin:0;"">
                                Automated notification from the ESS Design document management system.<br>
                                &copy; {DateTime.Now.Year} ErectSafe Scaffolding. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>";

            return html;
        }
    }
}
