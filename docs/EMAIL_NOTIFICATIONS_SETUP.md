# Email Notifications Setup Guide

This guide will help you configure the email notification system for document uploads in the ESS Design application.

## Overview

The email notification system allows users to send automated email notifications when uploading documents. Recipients will receive:
- **Document details**: Folder path, revision number, upload date, and uploader name
- **Direct view links**: Clickable buttons to view ESS Design and/or Third-Party Design PDFs
- **Change description**: Optional notes about what changed in this revision

## Prerequisites

1. A SendGrid account (free tier available: 100 emails/day)
2. Access to your application's configuration settings
3. Database access to run the migration script

## Step 1: Create SendGrid Account & API Key

### 1.1 Sign up for SendGrid
1. Go to [https://sendgrid.com/](https://sendgrid.com/)
2. Click "Start for Free" and create an account
3. Verify your email address

### 1.2 Create API Key
1. Log in to SendGrid dashboard
2. Navigate to **Settings** → **API Keys**
3. Click **Create API Key**
4. Name it (e.g., "ESS Design Notifications")
5. Select **Full Access** or at minimum **Mail Send** permissions
6. Click **Create & View**
7. **IMPORTANT**: Copy the API key immediately - it won't be shown again!

### 1.3 Verify Sender Identity
SendGrid requires sender verification:

1. Navigate to **Settings** → **Sender Authentication**
2. Choose one of two options:

   **Option A - Single Sender Verification (Recommended for testing):**
   - Click **Verify a Single Sender**
   - Fill in your details:
     - From Name: `ESS Design System`
     - From Email Address: Your verified email (e.g., `notifications@yourdomain.com`)
   - Verify the email sent to this address

   **Option B - Domain Authentication (Recommended for production):**
   - Click **Authenticate Your Domain**
   - Follow the wizard to add DNS records to your domain
   - This provides better deliverability and professionalism

## Step 2: Configure Application Settings

### 2.1 Add SendGrid Configuration

Add the following to your `appsettings.json` or `appsettings.Production.json`:

```json
{
  "SendGrid": {
    "ApiKey": "YOUR_SENDGRID_API_KEY_HERE",
    "FromEmail": "notifications@yourdomain.com",
    "FromName": "ESS Design System"
  },
  "AppSettings": {
    "BaseUrl": "https://yourdomain.com"
  }
}
```

### 2.2 Environment Variables (Alternative)

For better security, use environment variables instead:

**Linux/Mac:**
```bash
export SendGrid__ApiKey="YOUR_SENDGRID_API_KEY_HERE"
export SendGrid__FromEmail="notifications@yourdomain.com"
export SendGrid__FromName="ESS Design System"
export AppSettings__BaseUrl="https://yourdomain.com"
```

**Windows:**
```powershell
$env:SendGrid__ApiKey="YOUR_SENDGRID_API_KEY_HERE"
$env:SendGrid__FromEmail="notifications@yourdomain.com"
$env:SendGrid__FromName="ESS Design System"
$env:AppSettings__BaseUrl="https://yourdomain.com"
```

**Docker Compose:**
```yaml
services:
  essdesign-api:
    environment:
      - SendGrid__ApiKey=YOUR_SENDGRID_API_KEY_HERE
      - SendGrid__FromEmail=notifications@yourdomain.com
      - SendGrid__FromName=ESS Design System
      - AppSettings__BaseUrl=https://yourdomain.com
```

### 2.3 Configuration Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `SendGrid:ApiKey` | Your SendGrid API key (keep secret!) | `SG.abc123...` |
| `SendGrid:FromEmail` | Email address notifications come from (must be verified in SendGrid) | `notifications@essdesign.com` |
| `SendGrid:FromName` | Display name for sender | `ESS Design System` |
| `AppSettings:BaseUrl` | Your application's base URL (for generating document links) | `https://essdesign.app` |

## Step 3: Run Database Migration

Apply the database migration to add the `description` column:

### Using Supabase Dashboard:
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `/database/migrations/002_add_description_to_documents.sql`
4. Click **Run**

### Using psql:
```bash
psql -h your-database-host -U your-username -d your-database-name -f database/migrations/002_add_description_to_documents.sql
```

## Step 4: Restart Application

After configuring settings, restart your application:

```bash
# If running directly
dotnet run

# If using Docker
docker-compose restart

# If using systemd
sudo systemctl restart essdesign-api
```

## Step 5: Test the Feature

1. **Log in** to your ESS Design application
2. **Navigate** to any folder
3. **Click** "Upload Document"
4. **Fill in** the upload form:
   - Select revision number
   - Upload at least one PDF
   - (Optional) Add a change description
   - **Select one or more users** to notify
5. **Click** "Upload"
6. **Check** recipient inboxes for the notification email

### Troubleshooting Email Delivery

If emails aren't being received:

1. **Check spam folders** - First emails may be filtered
2. **Verify SendGrid sender** - Ensure sender email is verified
3. **Check application logs** - Look for error messages
4. **Verify API key** - Ensure it's correctly configured
5. **Check SendGrid dashboard** - View activity logs
6. **Test with yourself first** - Select your own email as recipient

## Email Template Customization

The email template is defined in `/ESSDesign.Server/Services/EmailService.cs`.

### Customization Options:

**Colors & Branding:**
```csharp
// In BuildHtmlEmailContent method
.header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }}
.button {{ background: #667eea; }}
```

**Email Content:**
Modify the HTML/text in `BuildHtmlEmailContent()` and `BuildPlainTextEmailContent()` methods.

## Security Best Practices

1. ✅ **Never commit API keys** to version control
2. ✅ **Use environment variables** in production
3. ✅ **Restrict API key permissions** to only Mail Send
4. ✅ **Rotate API keys** periodically
5. ✅ **Monitor SendGrid usage** to detect abuse
6. ✅ **Implement rate limiting** if needed

## SendGrid Free Tier Limits

- **100 emails per day** (forever free)
- Email validation available
- Basic templates included
- Email activity feed for 3 days

For higher volume, consider upgrading to a paid plan.

## Production Checklist

- [ ] SendGrid API key configured via environment variable
- [ ] Sender domain authenticated (not just single sender)
- [ ] Database migration applied
- [ ] Email template tested and working
- [ ] Spam filters checked (test across Gmail, Outlook, etc.)
- [ ] Application logs monitored for email errors
- [ ] Rate limiting considered if needed
- [ ] Recipient selection tested with multiple users

## Support & Resources

- **SendGrid Documentation**: https://docs.sendgrid.com/
- **SendGrid Support**: https://support.sendgrid.com/
- **Email Deliverability Guide**: https://sendgrid.com/resource/email-deliverability-guide/

## Feature Architecture

```
┌─────────────────┐
│  User Uploads   │
│    Document     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ FoldersController│──┐
│  UploadDocument │  │
└─────────────────┘  │
         │           │
         ▼           ▼
┌─────────────────┐ ┌──────────────┐
│ SupabaseService │ │ EmailService │
│  Save Document  │ │ Send Emails  │
└─────────────────┘ └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   SendGrid   │
                    │  API (SMTP)  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Recipients  │
                    │   Receive    │
                    │    Email     │
                    └──────────────┘
```

---

**Created**: 2026-02-14
**Last Updated**: 2026-02-14
**Version**: 1.0
