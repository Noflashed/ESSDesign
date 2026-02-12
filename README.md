# ESS Design - PDF Management System

A hierarchical folder-based PDF management system for engineering design documents with unlimited nesting, built with ASP.NET Core, React, and Supabase.

## Features

- 📁 **Unlimited folder nesting** - Create any folder structure (Builder → Project → Scaffold → etc.)
- 📄 **Revision management** - Upload multiple revisions per folder
- 🏷️ **Two document types** per revision:
  - ESS Design Issue
  - Third-Party Engineer Design Set
- ✏️ **Rename folders** - Right-click context menu
- 🗑️ **Delete folders and documents** - Cascade delete support
- 🔍 **Breadcrumb navigation** - Easy folder traversal
- 🎨 **Google Drive inspired UI** - Clean, modern interface
- 🔥 **100% FREE with Supabase**

## Why Supabase?

- **Free Tier Benefits:**
  - 500MB PostgreSQL database
  - 1GB file storage  
  - 2GB bandwidth/month
  - Never expires
  - No credit card required

- **Easier Setup:**
  - No service account keys
  - Simple API keys
  - Auto-generated REST API
  - Built-in admin dashboard

## Prerequisites

- [.NET 8.0 SDK](https://dotnet.microsoft.com/download)
- [Node.js 18+](https://nodejs.org/)
- [Visual Studio 2022](https://visualstudio.microsoft.com/) (recommended)
- [Supabase Account](https://supabase.com/) (FREE)

## Quick Start - Supabase Setup

### 1. Create Supabase Project (2 minutes)

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign in with GitHub
4. Click "New project"
5. Fill in:
   - **Name**: ESSDesign
   - **Database Password**: (save this!)
   - **Region**: Choose closest to you
6. Click "Create new project"
7. Wait ~2 minutes for setup

### 2. Create Database Tables

1. In Supabase dashboard, click "**SQL Editor**" (left sidebar)
2. Click "+ New query"
3. Paste this SQL:

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

-- Create indexes
CREATE INDEX idx_revisions_design_set_id ON revisions(design_set_id);

-- Enable Row Level Security (optional, for production)
ALTER TABLE design_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisions ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now)
CREATE POLICY "Enable read access for all users" ON design_sets FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON design_sets FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable read access for all users" ON revisions FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON revisions FOR INSERT WITH CHECK (true);
```

4. Click "**Run**" (bottom right)
5. You should see "Success. No rows returned"

### 3. Create Storage Bucket

1. Click "**Storage**" (left sidebar)
2. Click "+ New bucket"
3. Fill in:
   - **Name**: design-pdfs
   - **Public bucket**: ❌ **UNCHECK** (keep private)
4. Click "Create bucket"

### 4. Set Storage Policies

1. Click on "design-pdfs" bucket
2. Click "Policies" tab
3. Click "New policy"
4. Select "**For full customization**"
5. Fill in:
   - **Policy name**: Allow all operations
   - **Allowed operation**: SELECT, INSERT, UPDATE, DELETE
   - **Target roles**: Default to anon, authenticated
   - **Policy definition**: `true`
6. Click "Review"
7. Click "Save policy"

### 5. Get API Keys

1. Click "**Settings**" (gear icon, left sidebar)
2. Click "**API**"
3. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJh...` (long key)
   - **service_role key**: `eyJh...` (different long key)

## Installation

### 1. Download and Extract Project

```bash
# Extract ESSDesign.zip
cd ESSDesign
```

### 2. Configure Backend

Edit `ESSDesign.Server/appsettings.json`:

```json
{
  "Supabase": {
    "Url": "https://YOUR_PROJECT.supabase.co",
    "Key": "YOUR_ANON_PUBLIC_KEY",
    "ServiceRoleKey": "YOUR_SERVICE_ROLE_KEY"
  }
}
```

Replace with your values from Step 5 above.

### 3. Install Dependencies

**Backend:**
```bash
cd ESSDesign.Server
dotnet restore
```

**Frontend:**
```bash
cd ../essdesign.client
npm install
```

## Running the Application

### Visual Studio (Recommended)

1. Open `ESSDesign.sln`
2. Press `F5`
3. App opens at `https://localhost:7001`

### Command Line

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

Navigate to `https://localhost:5173`

## Testing the App

1. Click "Upload New Design Set"
2. Fill in:
   - Design Set Name: "Test Building"
   - Revision Number: "Rev A"
   - Upload a PDF
3. Click "Upload Design Set"
4. See your file appear in the list!
5. Click to download

## Project Structure

```
ESSDesign/
├── ESSDesign.Server/          # ASP.NET Core Backend
│   ├── Controllers/
│   │   └── DesignSetsController.cs  # API endpoints
│   ├── Models/
│   │   └── DesignSet.cs             # Data models
│   ├── Services/
│   │   └── SupabaseService.cs       # Supabase integration
│   ├── Program.cs                   
│   └── appsettings.json             # ← ADD YOUR KEYS HERE
│
├── essdesign.client/          # React Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── DesignViewer.jsx     
│   │   │   └── UploadForm.jsx       
│   │   ├── services/
│   │   │   └── api.js               
│   │   └── App.jsx                  
│   └── package.json
```

## API Endpoints

### `GET /api/designsets`
Returns all design sets with revisions

### `POST /api/designsets/upload`
Upload new design set (multipart/form-data)

### `GET /api/designsets/download/{designSetId}/{revisionId}/{type}`
Get signed download URL (type: "a" or "b")

## Database Schema

```
folders
├── id (UUID, PRIMARY KEY)
├── name (TEXT)
├── parent_folder_id (UUID, FOREIGN KEY → folders.id, NULLABLE)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

design_documents
├── id (UUID, PRIMARY KEY)
├── folder_id (UUID, FOREIGN KEY → folders.id)
├── revision_number (TEXT)
├── ess_design_issue_path (TEXT, NULLABLE)
├── ess_design_issue_name (TEXT, NULLABLE)
├── third_party_design_path (TEXT, NULLABLE)
├── third_party_design_name (TEXT, NULLABLE)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

**Folder Hierarchy Example:**
```
Builders/
├── Builder ABC/
│   ├── Project 123/
│   │   ├── Scaffold North/
│   │   │   ├── Rev 01
│   │   │   └── Rev 02
│   │   └── Scaffold South/
│   └── Project 456/
└── Builder XYZ/
```

## Supabase Dashboard Features

Access your Supabase dashboard to:

- **Table Editor**: View/edit data directly
- **SQL Editor**: Run queries
- **Storage**: Browse uploaded files
- **Logs**: Monitor API requests
- **Database**: See usage stats

## Free Tier Limits

- **Database**: 500MB (plenty for ~10,000 records)
- **Storage**: 1GB (~20-50 design sets depending on PDF size)
- **Bandwidth**: 2GB/month downloads
- **API Requests**: Unlimited!

## Upgrading Storage (if needed)

If you hit 1GB storage limit:

**Option 1: Clean up old revisions** in Supabase dashboard

**Option 2: Upgrade to Pro** ($25/month)
- 8GB database
- 100GB storage
- 250GB bandwidth

**Option 3: Compress PDFs** before upload

## Troubleshooting

### "Failed to load design sets"
- Check `appsettings.json` has correct Supabase URL and keys
- Verify tables exist in Supabase SQL Editor
- Check browser console for errors

### "Upload failed"
- Verify storage bucket "design-pdfs" exists
- Check storage policies allow INSERT
- Ensure PDF is under 50MB

### CORS Error
- Ensure backend is running on https://localhost:7001
- Ensure frontend is running on https://localhost:5173
- Check CORS policy in Program.cs

### Cannot connect to Supabase
- Check internet connection
- Verify Supabase project is active (not paused)
- Confirm API keys are correct

## Production Deployment

1. Update Supabase policies for authentication
2. Deploy backend to Azure/AWS/Railway
3. Deploy frontend to Vercel/Netlify
4. Update CORS origins in Program.cs
5. Set environment variables for Supabase keys

## Advantages over Firebase

✅ SQL database (easier queries)  
✅ More generous free tier  
✅ No service account files  
✅ Built-in database browser  
✅ Real-time subscriptions included  
✅ Open source (can self-host)  
✅ Better pricing for scale  

## Support

Check Supabase dashboard for:
- Table data in Table Editor
- API logs in Logs section
- File uploads in Storage browser

## License

MIT License

---

**Built for ESS Design with Supabase** 🚀
