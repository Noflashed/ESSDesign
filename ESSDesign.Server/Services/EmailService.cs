using SendGrid;
using SendGrid.Helpers.Mail;
using ESSDesign.Server.Models;

namespace ESSDesign.Server.Services
{
    public class EmailService
    {
        private readonly string _sendGridApiKey;
        private readonly string _fromEmail;
        private readonly string _fromName;
        private readonly string _appBaseUrl;
        private readonly ILogger<EmailService> _logger;

        public EmailService(IConfiguration configuration, ILogger<EmailService> logger)
        {
            _sendGridApiKey = configuration["SendGrid:ApiKey"] ?? throw new ArgumentNullException("SendGrid:ApiKey not configured");
            _fromEmail = configuration["SendGrid:FromEmail"] ?? "noreply@essdesign.com";
            _fromName = configuration["SendGrid:FromName"] ?? "ESS Design System";
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

            try
            {
                var client = new SendGridClient(_sendGridApiKey);
                var from = new EmailAddress(_fromEmail, _fromName);
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

                var plainTextContent = BuildPlainTextEmailContent(
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
                    var to = new EmailAddress(recipientEmail);
                    var msg = MailHelper.CreateSingleEmail(from, to, subject, plainTextContent, htmlContent);

                    var response = await client.SendEmailAsync(msg);

                    if (response.IsSuccessStatusCode)
                    {
                        _logger.LogInformation("Email sent successfully to {Email}", recipientEmail);
                    }
                    else
                    {
                        _logger.LogError("Failed to send email to {Email}. Status: {Status}", recipientEmail, response.StatusCode);
                    }
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
            var essLink = hasEssDesign ? $"{_appBaseUrl}/api/folders/documents/{documentId}/download/ess" : null;
            var thirdPartyLink = hasThirdPartyDesign ? $"{_appBaseUrl}/api/folders/documents/{documentId}/download/thirdparty" : null;

            var html = $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }}
        .info-box {{ background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #667eea; border-radius: 4px; }}
        .info-row {{ display: flex; margin: 8px 0; }}
        .info-label {{ font-weight: bold; width: 150px; color: #555; }}
        .info-value {{ color: #333; }}
        .description-box {{ background: #fff3cd; padding: 12px; margin: 15px 0; border-left: 4px solid #ffc107; border-radius: 4px; }}
        .description-box h3 {{ margin: 0 0 8px 0; color: #856404; font-size: 14px; }}
        .description-box p {{ margin: 0; color: #856404; }}
        .button-container {{ margin: 20px 0; }}
        .button {{ display: inline-block; padding: 12px 24px; margin: 5px 10px 5px 0; background: #667eea; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; }}
        .button:hover {{ background: #5568d3; }}
        .footer {{ text-align: center; margin-top: 20px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>📄 New Document Uploaded</h1>
        </div>
        <div class='content'>
            <p>A new design document has been uploaded to the ESS Design System.</p>

            <div class='info-box'>
                <div class='info-row'>
                    <span class='info-label'>Document:</span>
                    <span class='info-value'>{documentName}</span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Revision:</span>
                    <span class='info-value'>Rev {revisionNumber}</span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Uploaded By:</span>
                    <span class='info-value'>{uploaderName}</span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Upload Date:</span>
                    <span class='info-value'>{uploadDate:MMMM dd, yyyy 'at' h:mm tt} UTC</span>
                </div>
            </div>";

            if (!string.IsNullOrWhiteSpace(description))
            {
                html += $@"
            <div class='description-box'>
                <h3>📝 Change Description:</h3>
                <p>{System.Web.HttpUtility.HtmlEncode(description)}</p>
            </div>";
            }

            html += @"
            <div class='button-container'>
                <p><strong>View Documents:</strong></p>";

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

            <div class='footer'>
                <p>This is an automated notification from the ESS Design System.</p>
                <p>© {DateTime.Now.Year} ESS Design. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>";

            return html;
        }

        private string BuildPlainTextEmailContent(
            string documentName,
            string revisionNumber,
            string uploaderName,
            DateTime uploadDate,
            Guid documentId,
            bool hasEssDesign,
            bool hasThirdPartyDesign,
            string? description)
        {
            var essLink = hasEssDesign ? $"{_appBaseUrl}/api/folders/documents/{documentId}/download/ess" : null;
            var thirdPartyLink = hasThirdPartyDesign ? $"{_appBaseUrl}/api/folders/documents/{documentId}/download/thirdparty" : null;

            var text = $@"NEW DOCUMENT UPLOADED
===================

A new design document has been uploaded to the ESS Design System.

Document: {documentName}
Revision: Rev {revisionNumber}
Uploaded By: {uploaderName}
Upload Date: {uploadDate:MMMM dd, yyyy 'at' h:mm tt} UTC
";

            if (!string.IsNullOrWhiteSpace(description))
            {
                text += $@"
CHANGE DESCRIPTION:
{description}
";
            }

            text += "\nVIEW DOCUMENTS:\n";

            if (hasEssDesign)
            {
                text += $"ESS Design: {essLink}\n";
            }

            if (hasThirdPartyDesign)
            {
                text += $"Third-Party Design: {thirdPartyLink}\n";
            }

            text += $@"
---
This is an automated notification from the ESS Design System.
© {DateTime.Now.Year} ESS Design. All rights reserved.";

            return text;
        }
    }
}
