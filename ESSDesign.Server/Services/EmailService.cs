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
                var subject = $"New Document Upload: {documentName} - Rev {revisionNumber}";

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
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2d3748; margin: 0; padding: 0; background-color: #edf2f7; -webkit-font-smoothing: antialiased; }}
        .wrapper {{ width: 100%; background-color: #edf2f7; padding: 40px 20px; }}
        .container {{ max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06), 0 0 1px rgba(0, 0, 0, 0.1); }}
        .header {{ background: #1a1a2e; padding: 36px 32px 32px; text-align: center; }}
        .header-logo {{ margin-bottom: 20px; }}
        .header-logo img {{ height: 52px; width: auto; }}
        .header-divider {{ width: 40px; height: 2px; background: #f5a623; margin: 0 auto 20px; }}
        .header h1 {{ color: #ffffff; font-size: 21px; font-weight: 600; letter-spacing: -0.2px; margin: 0; }}
        .header p {{ color: rgba(255, 255, 255, 0.6); font-size: 13px; margin-top: 6px; font-weight: 400; }}
        .badge {{ display: inline-block; background: #f5a623; color: #1a1a2e; padding: 5px 16px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin-top: 18px; }}
        .content {{ padding: 32px; }}
        .greeting {{ font-size: 14px; color: #4a5568; margin-bottom: 24px; line-height: 1.7; }}
        .greeting strong {{ color: #2d3748; }}
        .section-label {{ font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #a0aec0; font-weight: 600; margin-bottom: 12px; }}
        .detail-card {{ background: #f7fafc; border-radius: 8px; padding: 0; margin: 0 0 24px; border: 1px solid #e2e8f0; overflow: hidden; }}
        .detail-row {{ padding: 14px 20px; border-bottom: 1px solid #e2e8f0; }}
        .detail-row:last-child {{ border-bottom: none; }}
        .detail-label {{ font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #a0aec0; font-weight: 600; margin-bottom: 3px; }}
        .detail-value {{ font-size: 15px; color: #2d3748; font-weight: 500; }}
        .description-section {{ background: #fffbeb; border-radius: 8px; padding: 18px 20px; margin: 0 0 24px; border: 1px solid #fde68a; border-left: 3px solid #f5a623; }}
        .description-title {{ font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #b45309; font-weight: 700; margin-bottom: 6px; }}
        .description-text {{ font-size: 14px; color: #78350f; line-height: 1.6; white-space: pre-wrap; }}
        .divider {{ height: 1px; background: #e2e8f0; margin: 24px 0; }}
        .actions {{ margin: 0 0 8px; text-align: center; }}
        .actions-title {{ font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #a0aec0; font-weight: 600; margin-bottom: 16px; }}
        .btn {{ display: inline-block; padding: 12px 24px; margin: 5px; border-radius: 6px; font-weight: 600; font-size: 13px; text-decoration: none; }}
        .btn-primary {{ background: #f5a623; color: #1a1a2e !important; }}
        .btn-secondary {{ background: #ffffff; color: #2d3748 !important; border: 1px solid #cbd5e0; }}
        .btn-download {{ background: #1a1a2e; color: #ffffff !important; }}
        .footer {{ background: #f7fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0; }}
        .footer-brand {{ font-size: 12px; font-weight: 700; color: #2d3748; letter-spacing: 0.5px; margin-bottom: 6px; }}
        .footer-text {{ font-size: 11px; color: #a0aec0; line-height: 1.6; }}
        @media only screen and (max-width: 600px) {{
            .wrapper {{ padding: 16px 8px; }}
            .container {{ border-radius: 8px; }}
            .header {{ padding: 28px 20px 24px; }}
            .header h1 {{ font-size: 18px; }}
            .content {{ padding: 24px 20px; }}
            .btn {{ display: block; margin: 6px 0; text-align: center; }}
            .footer {{ padding: 20px; }}
        }}
    </style>
</head>
<body>
    <div class='wrapper'>
        <div class='container'>
            <div class='header'>
                <div class='header-logo'>
                    <img src='{logoUrl}' alt='ErectSafe Scaffolding' height='52' style='height:52px;width:auto;' />
                </div>
                <div class='header-divider'></div>
                <h1>New Document Uploaded</h1>
                <p>A new revision has been added to the design system</p>
                <span class='badge'>Rev {System.Web.HttpUtility.HtmlEncode(revisionNumber)}</span>
            </div>
            <div class='content'>
                <p class='greeting'>
                    <strong>{System.Web.HttpUtility.HtmlEncode(uploaderName)}</strong> has uploaded a new document revision. Here are the details:
                </p>

                <div class='section-label'>Document Details</div>
                <div class='detail-card'>
                    <div class='detail-row'>
                        <div class='detail-label'>Document</div>
                        <div class='detail-value'>{System.Web.HttpUtility.HtmlEncode(documentName)}</div>
                    </div>
                    <div class='detail-row'>
                        <div class='detail-label'>Revision</div>
                        <div class='detail-value'>Rev {System.Web.HttpUtility.HtmlEncode(revisionNumber)}</div>
                    </div>
                    <div class='detail-row'>
                        <div class='detail-label'>Uploaded By</div>
                        <div class='detail-value'>{System.Web.HttpUtility.HtmlEncode(uploaderName)}</div>
                    </div>
                    <div class='detail-row'>
                        <div class='detail-label'>Date &amp; Time</div>
                        <div class='detail-value'>{formattedDate} at {formattedTime} AEST</div>
                    </div>
                </div>";

            if (!string.IsNullOrWhiteSpace(description))
            {
                html += $@"
                <div class='description-section'>
                    <div class='description-title'>Change Notes</div>
                    <div class='description-text'>{System.Web.HttpUtility.HtmlEncode(description)}</div>
                </div>";
            }

            html += @"
                <div class='divider'></div>

                <div class='actions'>
                    <div class='actions-title'>Actions</div>";

            html += $@"
                    <a href='{System.Web.HttpUtility.HtmlAttributeEncode(folderLink)}' class='btn btn-primary'>
                        Open in ESS Design
                    </a>";

            if (hasEssDesign)
            {
                html += $@"
                    <a href='{System.Web.HttpUtility.HtmlAttributeEncode(essLink!)}' class='btn btn-download'>
                        Download ESS Design
                    </a>";
            }

            if (hasThirdPartyDesign)
            {
                html += $@"
                    <a href='{System.Web.HttpUtility.HtmlAttributeEncode(thirdPartyLink!)}' class='btn btn-secondary'>
                        Download Third-Party
                    </a>";
            }

            html += $@"
                </div>
            </div>
            <div class='footer'>
                <div class='footer-brand'>ESS Design</div>
                <div class='footer-text'>
                    Automated notification from the ESS Design document management system.<br>
                    &copy; {DateTime.Now.Year} ErectSafe Scaffolding. All rights reserved.
                </div>
            </div>
        </div>
    </div>
</body>
</html>";

            return html;
        }
    }
}
