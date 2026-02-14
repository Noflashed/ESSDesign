# Email Notifications Setup Guide

This guide will help you configure the email notification system for document uploads in the ESS Design application using **Resend**.

## Overview

The email notification system allows users to send automated email notifications when uploading documents. Recipients will receive:
- **Document details**: Folder path, revision number, upload date, and uploader name
- **Direct view links**: Clickable buttons to view ESS Design and/or Third-Party Design PDFs
- **Change description**: Optional notes about what changed in this revision

## Prerequisites

1. A Resend account (free tier: 3,000 emails/month, 100 emails/day)
2. Access to your application's configuration settings
3. Database access to run the migration script

## Step 1: Create Resend Account & API Key

### 1.1 Sign up for Resend
1. Go to [https://resend.com/](https://resend.com/)
2. Click "Start Building" or "Sign Up"
3. Create an account (can use GitHub to sign in)
4. Verify your email address

### 1.2 Add Your Domain (Recommended) or Use Onboarding Domain

**Option A - Use Onboarding Domain (Quick Start for Testing):**
- Resend provides an onboarding domain for immediate testing
- Limited to 1 email per day
- Emails can only be sent to your verified email address
- Good for development/testing only

**Option B - Add Your Own Domain (Recommended for Production):**

1. In Resend dashboard, go to **Domains** → **Add Domain**
2. Enter your domain (e.g., `essdesign.com`)
3. Add the DNS records to your domain provider:
   - **SPF Record** (TXT): Prevents email spoofing
   - **DKIM Records** (TXT): Verifies email authenticity
   - **MX Record** (optional): For bounce handling

Example DNS Records:
```
Type: TXT
Name: @
Value: v=spf1 include:resend.com ~all

Type: TXT
Name: resend._domainkey
Value: [Provided by Resend]

Type: TXT
Name: _dmarc
Value: [Provided by Resend]
```

4. Click **Verify DNS Records** (may take a few minutes to propagate)
5. Once verified, your domain is ready to send emails!

### 1.3 Create API Key

1. Go to **API Keys** in the Resend dashboard
2. Click **Create API Key**
3. Name it (e.g., "ESS Design Notifications")
4. Select permissions:
   - **Sending access**: Required
   - **Full access**: Optional (only if you need other features)
5. Click **Create**
6. **IMPORTANT**: Copy the API key immediately - it won't be shown again!
   - Format: `re_xxxxxxxxxxxx`

## Step 2: Configure Application Settings

### 2.1 Add Resend Configuration

Add the following to your `appsettings.json` or `appsettings.Production.json`:

```json
{
  "Resend": {
    "ApiKey": "re_your_api_key_here",
    "FromEmail": "notifications@yourdomain.com",
    "FromName": "ESS Design System"
  },
  "AppSettings": {
    "BaseUrl": "https://yourdomain.com"
  }
}
```

**Important Notes:**
- `FromEmail` must use a verified domain (either your custom domain or Resend's onboarding domain)
- For testing with onboarding domain, use: `onboarding@resend.dev`
- For production, use your verified domain: `notifications@yourdomain.com`

### 2.2 Environment Variables (Recommended for Production)

For better security, use environment variables instead:

**Linux/Mac:**
```bash
export Resend__ApiKey="re_your_api_key_here"
export Resend__FromEmail="notifications@yourdomain.com"
export Resend__FromName="ESS Design System"
export AppSettings__BaseUrl="https://yourdomain.com"
```

**Windows:**
```powershell
$env:Resend__ApiKey="re_your_api_key_here"
$env:Resend__FromEmail="notifications@yourdomain.com"
$env:Resend__FromName="ESS Design System"
$env:AppSettings__BaseUrl="https://yourdomain.com"
```

**Docker Compose:**
```yaml
services:
  essdesign-api:
    environment:
      - Resend__ApiKey=re_your_api_key_here
      - Resend__FromEmail=notifications@yourdomain.com
      - Resend__FromName=ESS Design System
      - AppSettings__BaseUrl=https://yourdomain.com
```

### 2.3 Configuration Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `Resend:ApiKey` | Your Resend API key (keep secret!) | `re_abc123...` |
| `Resend:FromEmail` | Email address notifications come from (must be from verified domain) | `notifications@essdesign.com` |
| `Resend:FromName` | Display name for sender | `ESS Design System` |
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

### Migration SQL:
```sql
ALTER TABLE design_documents
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN design_documents.description IS 'Optional description of changes made in this revision';
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

### Quick Test Steps:

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

### Testing with Onboarding Domain:

If using Resend's onboarding domain:
- You can only send to your own verified email
- Select yourself as the recipient to test
- Check your email inbox (may take 1-2 minutes)

### Troubleshooting Email Delivery

If emails aren't being received:

1. **Check application logs** - Look for error messages in server logs
   ```bash
   # Check for email-related errors
   grep -i "email" logs/app.log
   ```

2. **Verify Resend Dashboard**:
   - Go to **Emails** tab in Resend dashboard
   - Check email status (Sent, Delivered, Failed, etc.)
   - View delivery details and error messages

3. **Common Issues**:
   - ❌ **Domain not verified**: Add and verify your domain
   - ❌ **Wrong from email**: Ensure it matches verified domain
   - ❌ **API key invalid**: Generate a new key
   - ❌ **Rate limit exceeded**: Check Resend dashboard for limits
   - ❌ **Recipient email invalid**: Verify recipient email addresses

4. **Check spam folders** - First emails may be filtered

5. **Test with yourself first** - Select your own email as recipient

## Email Template Customization

The email template is defined in `/ESSDesign.Server/Services/EmailService.cs`.

### Customization Options:

**Colors & Branding:**
```csharp
// In BuildHtmlEmailContent method, modify the CSS:
.header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.button { background: #667eea; }
.info-box { border-left: 4px solid #667eea; }
```

**Email Structure:**
The template uses responsive HTML with:
- Mobile-friendly design (media queries)
- Gradient header
- Information box with document details
- Optional description box (yellow highlight)
- Download buttons
- Footer with branding

**Modify Content:**
Edit the HTML in `BuildHtmlEmailContent()` method to customize the layout and text.

## Security Best Practices

1. ✅ **Never commit API keys** to version control
2. ✅ **Use environment variables** in production
3. ✅ **Restrict API key permissions** to Sending Access only
4. ✅ **Rotate API keys** periodically (every 3-6 months)
5. ✅ **Monitor Resend usage** to detect abuse
6. ✅ **Implement rate limiting** if needed (application-level)
7. ✅ **Use HTTPS** for all document download links
8. ✅ **Verify sender domain** with SPF/DKIM/DMARC

## Resend Free Tier Limits

- **3,000 emails per month** (free forever)
- **100 emails per day**
- Email activity logs for 30 days
- Webhook support
- Email testing in sandbox
- React email templates supported

For higher volume, paid plans start at $20/month for 50,000 emails.

## Production Checklist

- [ ] Resend account created and verified
- [ ] Custom domain added and verified (DNS records configured)
- [ ] API key configured via environment variable (not hardcoded)
- [ ] Database migration applied successfully
- [ ] Email template tested and working
- [ ] Spam filters checked (test across Gmail, Outlook, etc.)
- [ ] Application logs monitored for email errors
- [ ] Rate limiting considered if needed
- [ ] Recipient selection tested with multiple users
- [ ] Document download links tested (HTTPS working)
- [ ] DMARC policy configured for domain
- [ ] Bounce handling configured (optional)

## Resend Advantages

✅ **Modern API** - Simple, developer-friendly REST API
✅ **React Email** - Use React components for emails (optional)
✅ **Generous Free Tier** - 3,000 emails/month free
✅ **Fast Setup** - Domain verification in minutes
✅ **Great Deliverability** - High inbox placement rates
✅ **Real-time Logs** - See email status instantly
✅ **Webhooks** - Get notified of bounces, opens, clicks
✅ **No Complex Setup** - Much simpler than SendGrid/AWS SES

## Support & Resources

- **Resend Documentation**: https://resend.com/docs
- **Resend API Reference**: https://resend.com/docs/api-reference
- **Domain Setup Guide**: https://resend.com/docs/dashboard/domains/introduction
- **Resend Status Page**: https://status.resend.com/
- **Support Email**: support@resend.com

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
                    │   Resend API │
                    │              │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Recipients  │
                    │   Receive    │
                    │    Email     │
                    └──────────────┘
```

## Quick Start Summary

1. **Sign up** at resend.com
2. **Create API key** in Resend dashboard
3. **Add to config**: `Resend:ApiKey`, `Resend:FromEmail`, `Resend:FromName`
4. **Run migration**: Add description column to database
5. **Restart app** and test!

---

**Created**: 2026-02-14
**Last Updated**: 2026-02-14
**Version**: 2.0 (Resend)
**Previous Version**: 1.0 (SendGrid)
