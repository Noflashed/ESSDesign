# Accounts role

The shared role identifier is `accounts`; its display name is **Accounts**. Administrators can select it when adding or editing an employee or app user. Employee invitations retain the role through registration and later sign-ins.

| Web area | Page keys | Access |
| --- | --- | --- |
| Scaffold Dashboard | `scaffold-dashboard` | Scaffold and site document explorers, charts, linked files |
| Site Registry | `site-information` | Existing site and builder management workflows |
| Project data | `safety`, its four register pages, `safety-scaff-tags`, `safety-swms` | Existing project document workflows |
| ESS Design | `design`, `drawing-register` | Browse and open designs; design uploads, edits, and deletion retain their existing role requirements |
| ESS AI | `ess-ai` | Site, design, and project document lookups; own notifications and weather |

Home, personal profile, and settings remain available. Direct URLs and browser history targeting other modules return Accounts users to the Scaffold Dashboard. ESS AI enforces the same business scope in its server tool dispatcher and combined searches. Accounts does not receive administrator, employee-directory, rostering, or transport permissions.

The database migration `20260909055818_add_accounts_role.sql` adds the identifier to both `user_roles.role` and `ess_rostering_employees.invited_role`, preserving all existing roles. The backend's `AppRoles.All` is used by role updates, invitations, registration, and session normalization. No existing users are reassigned by the migration.

Mobile recognition is deferred. A later mobile change should use the same `accounts` identifier.

Validation:

```powershell
dotnet test ESSDesign.Server.Tests/ESSDesign.Server.Tests.csproj -p:SkipClientBuild=true
```

From `essdesign.client`:

```powershell
node --test src/utils/accountsAccess.test.js src/utils/scaffoldDashboard.test.js
npm run build
```
