# Scaffold forms shared with ESSApp

The register opens the iOS Handover Certificate and Scaff-Tag screens through React Native Web. Their document layouts, form state, checklists, signatures, numbering, photo limits, relationship updates, and PDF writers are copied from ESSApp. `source-manifest.json` records the source paths and SHA-256 hashes.

Regenerate the copied files after an intentional mobile form change:

```sh
python3 scripts/sync-ios-scaffold-forms.py /path/to/ESSApp
```

The sync script applies only browser import/asset adaptations, selects the iOS document editor on web, enables browser scrolling, and replaces native logo file reading. Browser-only adapters live in `browser/`, `context/`, `native/`, and the small service bridge files. Do not edit generated files directly.

Browser differences:

- Document zoom uses visible zoom controls and browser scrolling because UIScrollView pinch zoom is native-only.
- Photo selection uses a browser file picker, optionally requesting the camera, and converts images to JPEG for the original PDF writers.
- Signatures retain the original stroke format and signature-pad component.
- Email attachments use the browser share sheet when supported. Otherwise the PDF is downloaded and an email draft instructs the user to attach it. The browser cannot attach a file to a `mailto:` draft automatically.
- The web session and existing API client supply authentication. No new database schema or privileged credentials are introduced.

The original Safety record table, storage bucket, counter RPCs, and existing scaffold relationship migrations must be available, as they are for the mobile app. Opening older register rows promotes their linked forms to explicit scaffold IDs. Linking a drawing refreshes the associated handover PDFs and linked day-labour forms.

## Verification

Start the local web server, then run the browser test in another terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 5178
npm run test:scaffold-register
npm run build
```

The test uses Playwright with installed Chrome and a test-only fixture (excluded from the production build). All external traffic is intercepted or blocked. It checks blank-name validation, failed-save retry, drawing selection, handover and tag saves, generated PDF uploads, uploaded photos, drawn signature strokes, reciprocal form links, reopening saved data, zoom, and a phone-sized viewport. Screenshots are written to `/tmp/ess-*-web*.png`. It does not verify live database policies or send email.
