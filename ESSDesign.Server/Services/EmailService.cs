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
        private readonly ILogger<EmailService> _logger;

        public EmailService(IResend? resend, IConfiguration configuration, ILogger<EmailService> logger)
        {
            _resend = resend;
            _fromEmail = configuration["Resend:FromEmail"] ?? "noreply@essdesign.com";
            _fromName = configuration["Resend:FromName"] ?? "ESS Design System";
            _appBaseUrl = configuration["AppSettings:BaseUrl"] ?? "https://localhost:7001";
            _logger = logger;
        }

        public async Task SendDocumentUploadNotificationAsync(
            List<string> recipientEmails,
            string documentName,
            string revisionNumber,
            string uploaderName,
            DateTime uploadDate,
            Guid documentId,
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
            bool hasEssDesign,
            bool hasThirdPartyDesign,
            string? description)
        {
            var essLink = hasEssDesign ? $"{_appBaseUrl}/api/folders/documents/{documentId}/download/ess?redirect=true" : null;
            var thirdPartyLink = hasThirdPartyDesign ? $"{_appBaseUrl}/api/folders/documents/{documentId}/download/thirdparty?redirect=true" : null;

            var html = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }}
        .container {{ max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 24px; font-weight: 600; }}
        .content {{ padding: 30px 20px; }}
        .intro {{ font-size: 16px; color: #555; margin-bottom: 20px; }}
        .info-box {{ background: #f9fafb; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; border-radius: 4px; }}
        .info-row {{ display: flex; margin: 10px 0; }}
        .info-label {{ font-weight: 600; min-width: 140px; color: #555; }}
        .info-value {{ color: #333; }}
        .description-box {{ background: #fff3cd; padding: 15px; margin: 20px 0; border-left: 4px solid #ffc107; border-radius: 4px; }}
        .description-box h3 {{ margin: 0 0 10px 0; color: #856404; font-size: 14px; font-weight: 600; text-transform: uppercase; }}
        .description-box p {{ margin: 0; color: #856404; white-space: pre-wrap; }}
        .button-container {{ margin: 25px 0; text-align: center; }}
        .button-container p {{ font-weight: 600; color: #333; margin-bottom: 15px; }}
        .button {{ display: inline-block; padding: 12px 24px; margin: 8px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; transition: background 0.2s; }}
        .button:hover {{ background: #5568d3; }}
        .footer {{ text-align: center; padding: 20px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }}
        @media only screen and (max-width: 600px) {{
            .container {{ margin: 0; border-radius: 0; }}
            .content {{ padding: 20px 15px; }}
            .info-row {{ flex-direction: column; }}
            .info-label {{ min-width: auto; margin-bottom: 4px; }}
        }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>📄 New Document Uploaded</h1>
        </div>
        <div class='content'>
            <p class='intro'>A new design document has been uploaded to the ESS Design System.</p>

            <div class='info-box'>
                <div class='info-row'>
                    <span class='info-label'>Document:</span>
                    <span class='info-value'>{System.Web.HttpUtility.HtmlEncode(documentName)}</span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Revision:</span>
                    <span class='info-value'>Rev {System.Web.HttpUtility.HtmlEncode(revisionNumber)}</span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Uploaded By:</span>
                    <span class='info-value'>{System.Web.HttpUtility.HtmlEncode(uploaderName)}</span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Upload Date:</span>
                    <span class='info-value'>{TimeZoneInfo.ConvertTimeFromUtc(uploadDate, TimeZoneInfo.FindSystemTimeZoneById("Australia/Sydney")):MMMM dd, yyyy 'at' h:mm tt} AEST</span>
                </div>
            </div>";

            if (!string.IsNullOrWhiteSpace(description))
            {
                html += $@"
            <div class='description-box'>
                <h3>📝 Change Description</h3>
                <p>{System.Web.HttpUtility.HtmlEncode(description)}</p>
            </div>";
            }

            html += @"
            <div class='button-container'>
                <p>View Documents:</p>";

            if (hasEssDesign)
            {
                html += $@"
                <a href='{essLink}' class='button'>📥 View ESS Design</a>";
            }

            if (hasThirdPartyDesign)
            {
                html += $@"
                <a href='{thirdPartyLink}' class='button'>📥 View Third-Party Design</a>";
            }

            html += $@"
            </div>
        </div>
        <div class='footer'>
            <p>This is an automated notification from the ESS Design System.</p>
            <p>© {DateTime.Now.Year} ESS Design. All rights reserved.</p>
        </div>
    </div>
</body>
</html>";

            return html;
        }
    }
}
