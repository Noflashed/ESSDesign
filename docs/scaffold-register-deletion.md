# Scaffold Register deletion

The web right-click action follows `ScaffoldRegisterScreen.deleteScaffold` and
`supabaseScaffoldRegister.deleteScaffoldRegisterRecord` in
[ESS-Mobile-App commit 81218f4](https://github.com/Noflashed/ESS-Mobile-App/commit/81218f4).

- Delete all linked Scaff-Tags and handovers, including older versions and legacy rows without a register entry.
- Wait for all linked operations. Keep the register entry if any fail and report the failures for retry.
- Before deleting a register entry, re-read handovers and remove any remaining explicit scaffold links.
- Use the existing safety-form deletion service for project-scoped database deletion and generated-file cleanup. File cleanup is best effort, as on iOS.
- Keep design drawings and Day Labour forms. Retain QR labels as Retired and preserve deleted-form metadata through the shared database triggers.

The current shared database already includes the iOS archive-type extension and
handover cascade (`028_archive_deleted_scaffold_register_records.sql` and
`032_cascade_scaffold_register_deletes_to_handovers.sql` in the mobile repository).
No database schema change is required for this web action.

Validation:

```sh
node --test src/services/scaffoldDeletion.test.js src/utils/scaffoldDashboard.test.js
npm run build
```

Browser checks covered right-click and Shift+F10, Escape, cancellation, error/retry,
and successful refresh. A rolled-back transaction using temporary builder/project,
scaffold, form and QR records verified archiving, handover cascade, QR retirement,
and retention of unrelated forms in the shared database. No customer records were deleted.
