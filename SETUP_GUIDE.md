# Supabase Setup Guide - ESS Design

This guide will walk you through setting up Supabase for the ESS Design PDF Management System from scratch.

## Step 1: Create Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click "**Start your project**" (top right)
3. Sign in with:
   - GitHub (recommended)
   - Or Google
   - Or email
4. Authorize Supabase to access your GitHub

## Step 2: Create New Project

1. Click "**New project**" (green button)
2. Select your organization (or create one)
3. Fill in project details:
   - **Name**: `ESSDesign`
   - **Database Password**: Create a strong password (SAVE THIS!)
   - **Region**: Select closest to you:
     - 🇺🇸 US West (Oregon)
     - 🇺🇸 US East (N. Virginia)  
     - 🇪🇺 Europe (Frankfurt)
     - 🇦🇺 Southeast Asia (Singapore)
     - etc.
   - **Pricing Plan**: Free (default)
4. Click "**Create new project**"
5. ⏱️ Wait 2-3 minutes while project initializes

## Step 3: Create Database Tables

Once your project is ready:

1. Click "**SQL Editor**" in the left sidebar (icon: `</>`)
2. Click "+ New query" button
3. Delete any example SQL
4. Copy and paste this **EXACT** SQL:

```sql
-- Create design_sets table
CREATE TABLE design_sets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create revisions table  
CREATE TABLE revisions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    design_set_id UUID REFERENCES design_sets(id) ON DELETE CASCADE,
    revision_number TEXT NOT NULL,
    pdf_type_a_path TEXT,
    pdf_type_b_path TEXT,
    pdf_type_a_name TEXT,
    pdf_type_b_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_revisions_design_set_id ON revisions(design_set_id);
CREATE INDEX idx_design_sets_created_at ON design_sets(created_at DESC);
CREATE INDEX idx_revisions_created_at ON revisions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE design_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisions ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (allow all for development)
CREATE POLICY "Enable all operations for anon users" ON design_sets FOR ALL USING (true);
CREATE POLICY "Enable all operations for anon users" ON revisions FOR ALL USING (true);
```

5. Click "**Run**" (bottom right corner)
6. You should see: ✅ "**Success. No rows returned**"
7. Click "**Save**" and name it "Create Tables"

### Verify Tables Created

1. Click "**Table Editor**" in left sidebar
2. You should see two tables:
   - `design_sets`
   - `revisions`
3. Click on each table to see the columns

## Step 4: Create Storage Bucket

1. Click "**Storage**" in the left sidebar (icon: folder)
2. Click "+ **New bucket**" button
3. Fill in:
   - **Name**: `design-pdfs` (EXACTLY this)
   - **Public bucket**: ❌ **LEAVE UNCHECKED** (private)
   - **Allowed MIME types**: Leave empty (allows all)
   - **File size limit**: Leave default or set to 52428800 (50MB)
4. Click "**Create bucket**"
5. You should see "design-pdfs" in your buckets list

## Step 5: Configure Storage Policies

1. Click on the "**design-pdfs**" bucket
2. Click "**Policies**" tab (or Configuration → Policies)
3. Click "+ **New policy**"
4. Click "**For full customization**" (bottom option)
5. Fill in:

   **Policy for SELECT (reading files):**
   - Policy name: `Allow all to read`
   - Allowed operation: ☑️ SELECT only
   - Policy definition: `true`
   - Click "Review" → "Save policy"

6. Click "+ **New policy**" again
7. Click "**For full customization**"

   **Policy for INSERT (uploading files):**
   - Policy name: `Allow all to upload`
   - Allowed operation: ☑️ INSERT only  
   - Policy definition: `true`
   - Click "Review" → "Save policy"

8. You should now have 2 policies listed

**Alternative (simpler but less secure):**

Instead of steps 5-7, create ONE policy:
- Policy name: `Allow all operations`
- Allowed operations: SELECT, INSERT, UPDATE, DELETE
- Policy definition: `true`

## Step 6: Get Your API Keys

1. Click the **Settings** icon (⚙️ gear icon) in bottom left
2. Click "**API**"
3. You'll see this screen with your keys:

### Copy These Values:

**Project URL:**
```
https://xxxxxxxxxxxxx.supabase.co
```
Copy this entire URL

**anon public (public):**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3Mi...
```
This is a LONG string starting with "eyJh..." - copy the entire thing

**service_role (secret):**  
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3Mi...
```
This is also LONG and starts with "eyJh..." - copy the entire thing

⚠️ **IMPORTANT**: 
- The `service_role` key is SECRET - never commit to Git!
- Each key is ~200+ characters long
- Make sure you copy the FULL key

## Step 7: Configure Your Application

1. Open the ESSDesign project folder
2. Navigate to `ESSDesign.Server/appsettings.json`
3. Open in any text editor
4. Replace the Supabase section:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "Supabase": {
    "Url": "https://xxxxxxxxxxxxx.supabase.co",
    "Key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...[ANON KEY]",
    "ServiceRoleKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...[SERVICE ROLE KEY]"
  }
}
```

5. **Save the file** (Ctrl+S / Cmd+S)

## Step 8: Install Project Dependencies

### Backend (ASP.NET Core):

```bash
cd ESSDesign/ESSDesign.Server
dotnet restore
```

You should see: "Restore succeeded"

### Frontend (React):

```bash
cd ../essdesign.client
npm install
```

Wait for npm to install all packages (~1 minute)

## Step 9: Run the Application

### Option A: Visual Studio (Easiest)

1. Open `ESSDesign.sln` in Visual Studio 2022
2. Press `F5` or click the green ▶️ "Start" button
3. The application will:
   - Start the backend (opens Swagger at https://localhost:7001)
   - Start the frontend (opens browser at https://localhost:5173)

### Option B: Command Line

**Terminal 1 - Backend:**
```bash
cd ESSDesign.Server
dotnet run
```

**Terminal 2 - Frontend:**
```bash
cd essdesign.client
npm run dev
```

Then open browser to: `https://localhost:5173`

## Step 10: Test Your Setup!

1. You should see the app with a purple gradient background
2. Click "**Upload New Design Set**" (green header)
3. Fill in:
   - **Design Set Name**: "Test Project"
   - **Revision Number**: "Rev A"
   - **PDF Type A**: Upload any PDF file
4. Click "**📤 Upload Design Set**"
5. You should see: "Files uploaded successfully!"
6. The file appears in the list below
7. Click the file name to download it

### Verify in Supabase Dashboard:

1. Go back to Supabase dashboard
2. Click "**Table Editor**"
3. Click "**design_sets**" - you should see your "Test Project" entry
4. Click "**revisions**" - you should see the revision
5. Click "**Storage**" → "**design-pdfs**"
6. Browse to `designs/[guid]/[guid]/` - you should see your uploaded PDF!

## Common Issues & Solutions

### Issue 1: "Failed to load design sets"

**Cause**: API keys not configured correctly

**Solution**:
1. Go to Supabase → Settings → API
2. Copy the keys again (make sure to copy ENTIRE key)
3. Update `appsettings.json`
4. Restart the application

### Issue 2: "Upload failed"

**Cause**: Storage bucket or policies not set up

**Solution**:
1. Go to Supabase → Storage
2. Verify "design-pdfs" bucket exists
3. Click bucket → Policies
4. Make sure you have at least one policy
5. If no policies, follow Step 5 again

### Issue 3: Tables not found

**Cause**: SQL didn't run successfully

**Solution**:
1. Go to Supabase → SQL Editor
2. Run this query to check tables:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
```
3. If you don't see `design_sets` and `revisions`, run Step 3 SQL again

### Issue 4: CORS errors in browser

**Solution**:
- Make sure frontend is on https://localhost:5173
- Make sure backend is on https://localhost:7001  
- Check browser console for the actual error
- Restart both frontend and backend

### Issue 5: "Policy violation" errors

**Solution**:
1. Go to Supabase → Authentication → Policies
2. Disable RLS temporarily for testing:
```sql
ALTER TABLE design_sets DISABLE ROW LEVEL SECURITY;
ALTER TABLE revisions DISABLE ROW LEVEL SECURITY;
```
3. Test again
4. Re-enable later with proper policies

## Next Steps

✅ Your app is now running!
✅ You can upload and download PDFs
✅ Everything is stored in Supabase (free!)

### What to do next:

1. **Test with real PDFs**: Upload actual design documents
2. **Create multiple revisions**: Upload Rev B, Rev C, etc.
3. **Share with team**: They can access at https://localhost:5173 (if on same network)
4. **Deploy to production**: See README.md for deployment guides

## Checking Your Usage

To see how much of your free tier you're using:

1. Go to Supabase dashboard
2. Click "**Settings**" → "**Billing**"
3. Click "**Usage**"
4. See your:
   - Database size
   - Storage size
   - Bandwidth used
   - API requests

## Security Tips for Production

Once you've tested everything:

1. **Update Row Level Security policies** to require authentication
2. **Never commit** `appsettings.json` with real keys to GitHub
3. Use **environment variables** for production keys
4. Enable **email confirmation** in Supabase if adding user auth

## Need More Help?

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- Check the main README.md for more troubleshooting

---

## Summary Checklist

- [ ] Created Supabase account
- [ ] Created new project
- [ ] Created database tables (SQL Editor)
- [ ] Created storage bucket "design-pdfs"
- [ ] Set storage policies
- [ ] Copied Project URL, anon key, service_role key
- [ ] Updated appsettings.json
- [ ] Ran `dotnet restore`
- [ ] Ran `npm install`
- [ ] Started application
- [ ] Uploaded test PDF successfully
- [ ] Verified data in Supabase dashboard

**Congratulations! You're all set up!** 🎉
