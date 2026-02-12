# Quick Start - ESS Design

## 🚀 Easy Way (One-Click Start)

1. **Double-click** `START.bat`
2. Wait for two windows to open (Backend + Frontend)
3. Open browser to: **https://localhost:5173**

That's it! ✅

---

## First Time Setup

Before using START.bat for the first time:

1. **Install frontend dependencies:**
   ```bash
   cd essdesign.client
   npm install
   ```

2. **Configure Supabase** (see SETUP_GUIDE.md):
   - Edit `ESSDesign.Server/appsettings.json`
   - Add your Supabase URL and keys

---

## Manual Start (Alternative)

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

---

## Troubleshooting

**"npm is not recognized"**
- Install Node.js from https://nodejs.org

**"dotnet is not recognized"**  
- Install .NET 8 SDK from https://dotnet.microsoft.com/download

**Port already in use**
- Close other instances
- Or change ports in `launchSettings.json` and `vite.config.js`

---

## What Gets Started

✅ Backend API: https://localhost:7001 (Swagger UI)  
✅ Frontend App: https://localhost:5173 (Main application)

Keep both windows open while using the app!
