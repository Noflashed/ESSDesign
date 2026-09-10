# Measurement units in forms and PDFs

Handover length/height and Day Labour length/width use `formatMetres` in both editors and PDF generators. Day Labour height uses the same formatter. Numeric values gain `m` when rendered. Empty fields, notes and existing units are preserved. Stored values are not migrated or rewritten.

The matching mobile changes are published to ESS-Mobile-App `main`. Release both web and mobile changes before repairing saved PDFs. The vendor sync includes the shared measurement utility.

## Existing PDFs and QR links

Saved PDFs are stored artifacts: deploying a renderer fix does not rewrite them. The public QR routes resolve the linked handover's current `pdf_path`; the QR renderer itself is unchanged. Correcting that reference makes subsequent QR requests use the corrected PDF, with a new object path to avoid stale previews. QR IDs, tokens, assignments, retirement and navigation are unchanged.

`essdesign.client/scripts/repair-measurement-pdf.mjs` repairs one explicitly identified form. It does not call the normal save functions, allocate document numbers, refresh inspection dates or write QR tables. It keeps the original PDF at its original path and produces a new PDF object. A guarded database update changes only `pdf_path` and `payload.pdfPath`. If another process changes the row, it leaves the reference untouched. The database may update its own modification timestamp through its existing trigger; inspection dates and form payload fields are preserved.

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` through the operator's environment, never in a command, source file or log. From `essdesign.client`:

```powershell
node scripts/repair-measurement-pdf.mjs --id FORM_ID --type handover-certificates --output ../output/pdf-review
```

The default run makes no remote changes. It writes the original PDF, candidate PDF and original row to the chosen directory. These contain site data and must be stored appropriately. Review both PDFs, including photographs and signatures. The utility refuses missing photographs, unsupported legacy signature data, and digitally signed PDFs. Do not use it for externally annotated/custom PDFs that the original form renderer cannot reproduce.

After reviewing, run the same command with `--apply`. The original object remains available. The saved JSON records the original reference for a guarded rollback if required. Do not blindly restore the entire row, as it may contain newer edits.

Use `--type day-labour-variations` for Day Labour PDFs. On 10 September 2026, the authorised live repair pass corrected two handovers and one Day Labour PDF. All original PDFs remain stored. Before/after checksums matched for the form payloads (excluding the PDF path), dates, reference numbers and all 250 QR records. The temporary scoped repair endpoint was disabled after verification.

## Validation

- `npm run test:measurement-pdfs`: production renderer formatting, preservation of legacy data, repair review/apply, concurrent edits and photo failure.
- Scaffold Register and Day Labour browser workflows.
- Mobile measurement and QR-token unit tests.
