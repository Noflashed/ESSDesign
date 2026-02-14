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
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f0f2f5; -webkit-font-smoothing: antialiased; }}
        .wrapper {{ width: 100%; background-color: #f0f2f5; padding: 40px 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); }}
        .header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px 32px; text-align: center; }}
        .header-logo {{ margin-bottom: 16px; }}
        .header-logo img {{ height: 48px; }}
        .header h1 {{ color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; margin: 0; }}
        .header p {{ color: rgba(255, 255, 255, 0.7); font-size: 14px; margin-top: 8px; font-weight: 400; }}
        .badge {{ display: inline-block; background: rgba(255, 255, 255, 0.15); color: #ffffff; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 16px; border: 1px solid rgba(255, 255, 255, 0.2); }}
        .content {{ padding: 32px; }}
        .greeting {{ font-size: 15px; color: #555; margin-bottom: 24px; line-height: 1.7; }}
        .detail-card {{ background: #f8f9fb; border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid #e8eaef; }}
        .detail-row {{ display: flex; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #e8eaef; }}
        .detail-row:last-child {{ border-bottom: none; }}
        .detail-icon {{ width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 14px; flex-shrink: 0; font-size: 16px; }}
        .detail-icon.doc {{ background: #e8f0fe; }}
        .detail-icon.rev {{ background: #e6f4ea; }}
        .detail-icon.user {{ background: #fce8e6; }}
        .detail-icon.date {{ background: #fef7e0; }}
        .detail-text {{ flex: 1; }}
        .detail-label {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; font-weight: 600; margin-bottom: 2px; }}
        .detail-value {{ font-size: 15px; color: #1a1a2e; font-weight: 500; }}
        .description-section {{ background: linear-gradient(135deg, #fff8e1 0%, #fff3cd 100%); border-radius: 12px; padding: 20px 24px; margin: 24px 0; border-left: 4px solid #f9a825; }}
        .description-title {{ font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: #f57f17; font-weight: 700; margin-bottom: 8px; }}
        .description-text {{ font-size: 14px; color: #5d4037; line-height: 1.6; white-space: pre-wrap; }}
        .actions {{ margin: 32px 0 8px; text-align: center; }}
        .actions-title {{ font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 600; margin-bottom: 16px; }}
        .btn {{ display: inline-block; padding: 14px 28px; margin: 6px; border-radius: 10px; font-weight: 600; font-size: 14px; text-decoration: none; transition: all 0.2s; }}
        .btn-primary {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #ffffff !important; box-shadow: 0 4px 14px rgba(26, 26, 46, 0.3); }}
        .btn-secondary {{ background: #ffffff; color: #1a1a2e !important; border: 2px solid #1a1a2e; }}
        .btn-download {{ background: linear-gradient(135deg, #0f3460 0%, #1a5276 100%); color: #ffffff !important; box-shadow: 0 4px 14px rgba(15, 52, 96, 0.25); }}
        .divider {{ height: 1px; background: #e8eaef; margin: 28px 0; }}
        .folder-link {{ text-align: center; margin: 24px 0 8px; }}
        .folder-link a {{ color: #0f3460; font-weight: 600; text-decoration: none; font-size: 14px; border-bottom: 2px solid #0f3460; padding-bottom: 2px; }}
        .footer {{ background: #f8f9fb; padding: 28px 32px; text-align: center; border-top: 1px solid #e8eaef; }}
        .footer-brand {{ font-size: 13px; font-weight: 700; color: #1a1a2e; letter-spacing: 0.5px; margin-bottom: 8px; }}
        .footer-text {{ font-size: 12px; color: #999; line-height: 1.6; }}
        .footer-link {{ color: #0f3460; text-decoration: none; font-weight: 500; }}
        @media only screen and (max-width: 600px) {{
            .wrapper {{ padding: 16px 8px; }}
            .container {{ border-radius: 12px; }}
            .header {{ padding: 28px 20px; }}
            .header h1 {{ font-size: 19px; }}
            .content {{ padding: 24px 20px; }}
            .detail-card {{ padding: 16px; }}
            .btn {{ display: block; margin: 8px 0; text-align: center; }}
            .footer {{ padding: 20px; }}
        }}
    </style>
</head>
<body>
    <div class='wrapper'>
        <div class='container'>
            <div class='header'>
                <h1>New Document Uploaded</h1>
                <p>A new revision has been added to the design system</p>
                <span class='badge'>Rev {System.Web.HttpUtility.HtmlEncode(revisionNumber)}</span>
            </div>
            <div class='content'>
                <p class='greeting'>
                    <strong>{System.Web.HttpUtility.HtmlEncode(uploaderName)}</strong> has uploaded a new document revision. Here are the details:
                </p>

                <div class='detail-card'>
                    <div class='detail-row'>
                        <div class='detail-icon doc'>
                            <span>&#128196;</span>
                        </div>
                        <div class='detail-text'>
                            <div class='detail-label'>Document</div>
                            <div class='detail-value'>{System.Web.HttpUtility.HtmlEncode(documentName)}</div>
                        </div>
                    </div>
                    <div class='detail-row'>
                        <div class='detail-icon rev'>
                            <span>&#128204;</span>
                        </div>
                        <div class='detail-text'>
                            <div class='detail-label'>Revision</div>
                            <div class='detail-value'>Rev {System.Web.HttpUtility.HtmlEncode(revisionNumber)}</div>
                        </div>
                    </div>
                    <div class='detail-row'>
                        <div class='detail-icon user'>
                            <span>&#128100;</span>
                        </div>
                        <div class='detail-text'>
                            <div class='detail-label'>Uploaded By</div>
                            <div class='detail-value'>{System.Web.HttpUtility.HtmlEncode(uploaderName)}</div>
                        </div>
                    </div>
                    <div class='detail-row'>
                        <div class='detail-icon date'>
                            <span>&#128197;</span>
                        </div>
                        <div class='detail-text'>
                            <div class='detail-label'>Date &amp; Time</div>
                            <div class='detail-value'>{formattedDate} at {formattedTime} AEST</div>
                        </div>
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
                    <div class='actions-title'>Quick Actions</div>";

            html += $@"
                    <a href='{System.Web.HttpUtility.HtmlAttributeEncode(folderLink)}' class='btn btn-primary'>
                        &#128193; Open in ESS Design
                    </a>";

            if (hasEssDesign)
            {
                html += $@"
                    <a href='{System.Web.HttpUtility.HtmlAttributeEncode(essLink!)}' class='btn btn-download'>
                        &#128229; Download ESS Design
                    </a>";
            }

            if (hasThirdPartyDesign)
            {
                html += $@"
                    <a href='{System.Web.HttpUtility.HtmlAttributeEncode(thirdPartyLink!)}' class='btn btn-secondary'>
                        &#128229; Download Third-Party
                    </a>";
            }

            html += $@"
                </div>
            </div>
            <div class='footer'>
                <div class='footer-brand'>ESS Design</div>
                <div class='footer-text'>
                    This is an automated notification from the ESS Design document management system.<br>
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
