// Derived from ESSApp/src/services/supabaseScaffTags.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {AppConstants} from '../utils/constants';
import api from './apiService';
import {deleteSafetyFormRecord, getSafetyForm, listSafetyForms, upsertSafetyForm} from './supabaseSafetyRecords';
import {invalidateStorageJsonCache} from './supabaseStorageJsonCache';
import {
  CompanyEntityId,
  getCompanyEntity,
  getCompanyLogoJpegBase64,
  normalizeCompanyEntityId,
} from '../config/companyEntities';
import {SYDNEY_TIME_ZONE, getSydneyDateTimeParts} from '../utils/sydneyTime';
import {PDF_LOGO_JPEG_BASE64} from './supabaseHandoverCertificates';
import {buildScaffTagPdfDocument, ScaffTagPdfImage} from './scaffTagPdfRenderer';
import {getAssignedScaffTagQrLabel, listAssignedScaffTagQrLabels} from './supabaseScaffTagQrLabels';

export type FallProtectionRequired = 'YES' | 'NO' | '';
export type LoadRating = 'LIGHT_DUTY' | 'MEDIUM_DUTY' | 'HEAVY_DUTY' | 'SEE_ENGINEERING' | 'OTHER' | '';
const SCAFF_TAG_PHOTO_LIMIT = 2;

export interface SignaturePoint {
  x: number;
  y: number;
}

export type SignatureStroke = SignaturePoint[];

export interface InspectionRecordEntry {
  date: string;
  time: string;
  competentPerson: string;
  note: string;
  inspectedAt?: string;
  timeZone?: string;
  signatureStrokes?: SignatureStroke[];
}

export interface ScaffTagForm {
  id: string;
  status?: 'active' | 'retired';
  retiredAt?: string;
  retiredReason?: string;
  builderId: string;
  builderName: string;
  projectId: string;
  projectName: string;
  companyEntityId: CompanyEntityId;
  tagNumber: string;
  scaffoldNo: string;
  scaffoldRegisterId: string;
  handoverFormId: string;
  handoverInspectionNumber: string;
  handoverReferenceName: string;
  jobLocation: string;
  dateErected: string;
  requestedBy: string;
  erectedBy: string;
  inspectedBy: string;
  erectedBySignature: string;
  erectedBySignatureStrokes?: SignatureStroke[];
  fallProtectionRequired: FallProtectionRequired;
  loadRating: LoadRating;
  loadRatingOther: string;
  checkHandrails: boolean;
  checkPlatform: boolean;
  checkMidRails: boolean;
  checkLadder: boolean;
  checkToeBoards: boolean;
  checkOther: boolean;
  checkOtherText: string;
  inspectionRecords: InspectionRecordEntry[];
  latestInspectionAt?: string;
  photoPaths: string[];
  pdfPath: string;
  qrTargetUrl: string;
  sharePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScaffTagListItem {
  id: string;
  status: 'active' | 'retired';
  retiredAt: string;
  retiredReason: string;
  companyEntityId: CompanyEntityId;
  tagNumber: string;
  scaffoldNo: string;
  scaffoldRegisterId: string;
  handoverFormId: string;
  handoverInspectionNumber: string;
  handoverReferenceName: string;
  jobLocation: string;
  latestInspectionDate: string;
  inspectedBy: string;
  proximityAlertEnabled?: boolean;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  qrTargetUrl?: string;
  qrLabelId?: string;
  qrLabelNumber?: string;
  qrLabelStatus?: 'unassigned' | 'assigned' | 'retired';
  qrLabelAssignedAt?: string;
  qrLabelRetiredAt?: string;
  qrLabelRetiredReason?: string;
  updatedAt: string;
}

const signedUrlCache = new Map<string, {url: string; expiresAt: number}>();

function clearSignedUrlCacheForPath(path: string) {
  Array.from(signedUrlCache.keys()).forEach(key => {
    if (key.startsWith(`${path}:`)) {
      signedUrlCache.delete(key);
    }
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeTagNumber(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^\d{5,}$/.test(text) ? text : '';
}

function inspectionHasContent(row: InspectionRecordEntry): boolean {
  return !!(
    (row.date ?? '').trim() ||
    (row.time ?? '').trim() ||
    (row.competentPerson ?? '').trim() ||
    (row.note ?? '').trim() ||
    (row.signatureStrokes?.length ?? 0) > 0
  );
}

function stampInspectionRecord(row: InspectionRecordEntry, savedAt: Date): InspectionRecordEntry {
  if (!inspectionHasContent(row)) {
    return row;
  }
  const parts = getSydneyDateTimeParts(
    row.inspectedAt && !Number.isNaN(new Date(row.inspectedAt).getTime()) ? new Date(row.inspectedAt) : savedAt,
  );
  return {
    ...row,
    date: (row.date ?? '').trim() || parts.isoDate,
    time: (row.time ?? '').trim() || parts.displayTime,
    inspectedAt: row.inspectedAt || parts.instant,
    timeZone: SYDNEY_TIME_ZONE,
  };
}

function id(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function authHeaders(contentType = false): Record<string, string> {
  const token = api.authToken ?? AppConstants.supabaseAnonKey;
  return {
    apikey: AppConstants.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    ...(contentType ? {'Content-Type': 'application/json'} : {}),
  };
}

function sitePrefix(builderId: string, projectId: string): string {
  return `site-data/${builderId}/${projectId}/scaff-tags`;
}

function shareObjectPath(builderId: string, projectId: string, formId: string): string {
  return `${sitePrefix(builderId, projectId)}/share/${formId}.html`;
}

function pdfObjectPath(builderId: string, projectId: string, formId: string): string {
  return `${sitePrefix(builderId, projectId)}/pdf/${formId}.pdf`;
}

function photoObjectPath(builderId: string, projectId: string, formId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${sitePrefix(builderId, projectId)}/photos/${formId}/${Date.now()}-${safeName}`;
}

function objectUrl(path: string): string {
  return `${AppConstants.supabaseUrl}/storage/v1/object/${AppConstants.safetyProjectsBucket}/${path}`;
}

function rpcUrl(name: string): string {
  return `${AppConstants.supabaseUrl}/rest/v1/rpc/${name}`;
}

function signUrl(path: string): string {
  return `${AppConstants.supabaseUrl}/storage/v1/object/sign/${AppConstants.safetyProjectsBucket}/${path}`;
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read selected image.');
  }
  return response.blob();
}

async function uploadObject(path: string, body: Blob | string, contentType: string): Promise<void> {
  const attempts: Array<{
    method: 'POST' | 'PUT';
    url: string;
    headers: Record<string, string>;
  }> = [
    {
      method: 'POST',
      url: objectUrl(path),
      headers: {...authHeaders(true), 'x-upsert': 'true'},
    },
    {
      method: 'POST',
      url: `${objectUrl(path)}?upsert=true`,
      headers: authHeaders(true),
    },
    {
      method: 'PUT',
      url: objectUrl(path),
      headers: {...authHeaders(true), 'x-upsert': 'true'},
    },
  ];

  let lastError = '';
  for (const attempt of attempts) {
    const response = await api.fetchSupabase(attempt.url, {
      method: attempt.method,
      headers: {
        ...attempt.headers,
        'Content-Type': contentType,
      },
      body,
    });
    if (response.ok) {
      clearSignedUrlCacheForPath(path);
      return;
    }
    lastError = await response.text();
  }
  throw new Error(`Upload failed: ${lastError || 'unknown error'}`);
}

async function signedPathUrl(path: string, expiresInSeconds = 60 * 60 * 24 * 365): Promise<string> {
  const cacheKey = `${path}:${expiresInSeconds}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 15_000) {
    return cached.url;
  }

  const response = await api.fetchSupabase(signUrl(path), {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({expiresIn: expiresInSeconds}),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Failed to generate signed URL.');
  }
  const payload = (await response.json()) as {signedURL?: string};
  if (!payload.signedURL) {
    throw new Error('No signed URL returned.');
  }
  const url = `${AppConstants.supabaseUrl}/storage/v1${payload.signedURL}`;
  signedUrlCache.set(cacheKey, {
    url,
    expiresAt: Date.now() + Math.max(60, expiresInSeconds - 300) * 1000,
  });
  return url;
}

async function scaffTagNumberViaRpc(
  functionName: 'allocate_scaff_tag_number' | 'preview_scaff_tag_number',
  builderId: string,
  projectId: string,
): Promise<string> {
  const response = await api.fetchSupabase(rpcUrl(functionName), {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      p_builder_id: builderId,
      p_project_id: projectId,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    const lower = body.toLowerCase();
    if (lower.includes('pgrst202') || lower.includes('could not find the function') || lower.includes('schema cache')) {
      throw new Error(
        functionName === 'allocate_scaff_tag_number'
          ? 'SCAFF_TAG_COUNTER_RPC_MISSING'
          : 'SCAFF_TAG_PREVIEW_RPC_MISSING',
      );
    }
    throw new Error(body || 'Could not generate the Scaff-tag reference number.');
  }

  try {
    const parsed = JSON.parse(body) as string | Record<string, string>;
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (typeof parsed?.[functionName] === 'string') {
      return parsed[functionName];
    }
  } catch {
    // PostgREST may return a plain JSON scalar; handled below.
  }

  const trimmed = body.replace(/^"+|"+$/g, '').trim();
  if (!trimmed) {
    throw new Error('No Scaff-tag reference number returned from Supabase.');
  }
  return trimmed;
}

export async function previewNextScaffTagNumber(builderId: string, projectId: string): Promise<string> {
  return scaffTagNumberViaRpc('preview_scaff_tag_number', builderId, projectId);
}

export async function allocateNextScaffTagNumber(builderId: string, projectId: string): Promise<string> {
  return scaffTagNumberViaRpc('allocate_scaff_tag_number', builderId, projectId);
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadRatingLabel(value: LoadRating): string {
  switch (value) {
    case 'LIGHT_DUTY':
      return 'Light Duty (225 kg/bay)';
    case 'MEDIUM_DUTY':
      return 'Medium Duty (450 kg/bay)';
    case 'HEAVY_DUTY':
      return 'Heavy Duty (675 kg/bay)';
    case 'SEE_ENGINEERING':
      return 'See Engineering Drawing';
    case 'OTHER':
      return 'Other';
    default:
      return '';
  }
}

function renderScaffTagHtml(form: ScaffTagForm): string {
  const inspections = form.inspectionRecords
    .map(
      row =>
        `<tr><td>${esc(row.date)}</td><td>${esc(row.time)}</td><td>${esc(row.competentPerson)}</td><td>${esc(
          row.note,
        )}</td></tr>`,
    )
    .join('');

  const signatureLabel =
    (form.erectedBySignatureStrokes?.length ?? 0) > 0 ? 'Captured digitally' : form.erectedBySignature;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scaffold Inspection Tag</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f3f4f6; margin:0; padding:20px; color:#111827; }
    .sheet { max-width:960px; margin:0 auto; background:#fff; border:1px solid #d1d5db; border-radius:12px; padding:18px; }
    h1 { margin:0 0 8px; font-size:22px; text-align:center; }
    .sub { text-align:center; color:#6b7280; margin:0 0 16px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .field { border:1px solid #d1d5db; border-radius:8px; padding:8px; background:#fafafa; }
    .label { font-size:11px; color:#6b7280; text-transform:uppercase; margin-bottom:4px; }
    .value { font-size:14px; font-weight:600; min-height:20px; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th, td { border:1px solid #d1d5db; padding:8px; text-align:left; font-size:13px; }
    th:nth-child(-n+2), td:nth-child(-n+2) { text-align:center; }
    .full { grid-column:1 / -1; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>SCAFFOLD INSPECTION</h1>
    <p class="sub">Builder: ${esc(form.builderName)} | Project: ${esc(form.projectName)}</p>
    <div class="grid">
      <div class="field"><div class="label">Reference Number</div><div class="value">${esc(form.tagNumber)}</div></div>
      <div class="field"><div class="label">Scaffold Name</div><div class="value">${esc(form.scaffoldNo)}</div></div>
      <div class="field"><div class="label">Job Location</div><div class="value">${esc(form.jobLocation)}</div></div>
      <div class="field"><div class="label">Date Erected</div><div class="value">${esc(form.dateErected)}</div></div>
      <div class="field"><div class="label">Requested By</div><div class="value">${esc(form.requestedBy)}</div></div>
      <div class="field"><div class="label">Erected By</div><div class="value">${esc(form.erectedBy)}</div></div>
      <div class="field"><div class="label">Inspected By</div><div class="value">${esc(form.inspectedBy)}</div></div>
      <div class="field"><div class="label">Erected Signature</div><div class="value">${esc(signatureLabel)}</div></div>
      <div class="field"><div class="label">Fall Protection Required</div><div class="value">${esc(
        form.fallProtectionRequired,
      )}</div></div>
      <div class="field"><div class="label">Load Rating</div><div class="value">${esc(
        loadRatingLabel(form.loadRating),
      )} ${form.loadRating === 'OTHER' ? `- ${esc(form.loadRatingOther)}` : ''}</div></div>
      <div class="field full"><div class="label">Complete Items</div><div class="value">Handrails: ${
        form.checkHandrails ? 'Yes' : 'No'
      } | Platform: ${form.checkPlatform ? 'Yes' : 'No'} | Mid Rails: ${form.checkMidRails ? 'Yes' : 'No'} | Ladder: ${
    form.checkLadder ? 'Yes' : 'No'
  } | Toe Boards: ${form.checkToeBoards ? 'Yes' : 'No'} | Other: ${form.checkOther ? 'Yes' : 'No'} ${esc(
    form.checkOtherText,
  )}</div></div>
      <div class="field full"><div class="label">Inspection Record</div>
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Competent Person</th><th>Compliance Note</th></tr></thead>
          <tbody>${inspections}</tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function pdfEsc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** @deprecated Scaff-Tags now use the flat vector renderer below. */
export function buildScaffTagPdfBlob(form: ScaffTagForm): Blob {
  const pageW = 595.2;
  const pageH = 841.8;
  const designW = 792;
  const designH = 612;
  const pageMargin = 10;
  const pageScale = Math.min((pageW - pageMargin * 2) / designW, (pageH - pageMargin * 2) / designH);
  const pageOffsetX = (pageW - designW * pageScale) / 2;
  const pageOffsetY = (pageH - designH * pageScale) / 2;
  const panelW = 330;
  const panelH = 560;
  const panelY = 26;
  const leftX = 60;
  const rightX = 402;

  const val = (v: string, max = 64) => (v || '').trim().slice(0, max);
  const white = '1 1 1 rg';
  const greenText = '0 0.42 0.23 rg';
  const greenFill = '0 0.67 0.33 rg';
  const greenStroke = '0 0.39 0.21 RG';

  const text = (x: number, y: number, size: number, value: string, font: 'F1' | 'F2' | 'F3' = 'F1') =>
    `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEsc(value)}) Tj ET`;
  const centeredText = (
    x: number,
    width: number,
    y: number,
    size: number,
    value: string,
    font: 'F1' | 'F2' | 'F3' = 'F1',
  ) => {
    const estimatedWidth = value.length * size * (font === 'F2' ? 0.56 : 0.52);
    return text(x + Math.max(2, (width - estimatedWidth) / 2), y, size, value, font);
  };
  const rect = (x: number, y: number, w: number, h: number) => `${x} ${y} ${w} ${h} re S`;
  const fillRect = (x: number, y: number, w: number, h: number) => `${x} ${y} ${w} ${h} re f`;
  const line = (x1: number, y1: number, x2: number, y2: number) => `${x1} ${y1} m ${x2} ${y2} l S`;
  const f = (flag: boolean) => (flag ? 'YES' : 'NO');
  const signatureLabel =
    (form.erectedBySignatureStrokes?.length ?? 0) > 0 ? 'Captured digitally' : form.erectedBySignature;

  const contentLines: string[] = [];
  contentLines.push('q');
  contentLines.push(`${pageScale} 0 0 ${pageScale} ${pageOffsetX} ${pageOffsetY} cm`);
  contentLines.push('1.4 w');
  contentLines.push(greenStroke);
  contentLines.push(greenFill);
  contentLines.push(fillRect(leftX, panelY, panelW, panelH));
  contentLines.push(fillRect(rightX, panelY, panelW, panelH));
  contentLines.push(white);
  contentLines.push(rect(leftX + 8, panelY + 8, panelW - 16, panelH - 16));
  contentLines.push(rect(rightX + 8, panelY + 8, panelW - 16, panelH - 16));

  // Left side: front tag
  const lx = leftX + 18;
  const lyTop = panelY + panelH - 24;
  contentLines.push(text(lx + 24, lyTop - 8, 23, 'SCAFFOLD INSPECTION', 'F2'));
  contentLines.push(line(lx, lyTop - 16, lx + panelW - 36, lyTop - 16));
  contentLines.push(text(lx + 18, lyTop - 48, 15, 'SCAFFOLD COMPLETE', 'F2'));
  contentLines.push(text(lx + 43, lyTop - 68, 15, 'READY FOR USE', 'F2'));
  contentLines.push(text(lx + 218, lyTop - 48, 9, `NO. ${val(form.tagNumber, 12)}`, 'F2'));

  const labelSize = 11;
  const vlineYStart = lyTop - 84;
  const fieldGap = 22;
  const fields = [
    `SCAFFOLD NAME: ${val(form.scaffoldNo, 30)}`,
    `JOB LOCATION: ${val(form.jobLocation, 28)}`,
    `DATE ERECTED: ${val(form.dateErected, 12)}`,
    `REQUESTED BY: ${val(form.requestedBy, 28)}`,
    `ERECTED BY: ${val(form.erectedBy, 30)}`,
    `INSPECTED BY: ${val(form.inspectedBy, 28)}`,
    `SIGNATURE: ${val(signatureLabel, 30)}`,
  ];
  fields.forEach((field, idx) => {
    const y = vlineYStart - idx * fieldGap;
    contentLines.push(text(lx, y, labelSize, field, 'F2'));
    contentLines.push(line(lx + 105, y - 3, lx + panelW - 36, y - 3));
  });

  const secY = vlineYStart - fields.length * fieldGap - 8;
  contentLines.push(text(lx, secY, 11, 'FALL PROTECTION REQUIRED', 'F2'));
  contentLines.push(text(lx, secY - 14, 10, '(ARREST OR RESTRAINT):', 'F2'));
  contentLines.push(text(lx + 180, secY - 8, 11, f(form.fallProtectionRequired === 'YES'), 'F2'));

  const lrY = secY - 38;
  contentLines.push(text(lx + 85, lrY, 12, 'LOAD RATING', 'F2'));
  contentLines.push(text(lx, lrY - 22, 11, 'LIGHT DUTY  225 KG/BAY', 'F2'));
  contentLines.push(text(lx, lrY - 40, 11, 'MEDIUM DUTY 450 KG/BAY', 'F2'));
  contentLines.push(text(lx, lrY - 58, 11, 'HEAVY DUTY  675 KG/BAY', 'F2'));
  contentLines.push(text(lx, lrY - 76, 11, 'SEE ENGINEERING DRAWING', 'F2'));
  contentLines.push(text(lx, lrY - 94, 11, `OTHER ${val(form.loadRatingOther, 14)}`, 'F2'));
  contentLines.push(text(lx + 210, lrY - 22, 12, form.loadRating === 'LIGHT_DUTY' ? 'X' : '', 'F2'));
  contentLines.push(text(lx + 210, lrY - 40, 12, form.loadRating === 'MEDIUM_DUTY' ? 'X' : '', 'F2'));
  contentLines.push(text(lx + 210, lrY - 58, 12, form.loadRating === 'HEAVY_DUTY' ? 'X' : '', 'F2'));
  contentLines.push(text(lx + 210, lrY - 76, 12, form.loadRating === 'SEE_ENGINEERING' ? 'X' : '', 'F2'));
  contentLines.push(text(lx + 210, lrY - 94, 12, form.loadRating === 'OTHER' ? 'X' : '', 'F2'));

  const ciY = lrY - 125;
  contentLines.push(text(lx + 60, ciY, 12, 'CHECK COMPLETE ITEMS', 'F2'));
  const checksLeft = [
    ['HANDRAILS', form.checkHandrails],
    ['MID RAILS', form.checkMidRails],
    ['TOE BOARDS', form.checkToeBoards],
  ] as const;
  const checksRight = [
    ['PLATFORM', form.checkPlatform],
    ['LADDER', form.checkLadder],
    ['OTHER', form.checkOther],
  ] as const;

  checksLeft.forEach(([label, checked], i) => {
    const y = ciY - 24 - i * 20;
    contentLines.push(rect(lx, y - 3, 12, 12));
    contentLines.push(text(lx + 16, y, 10, label, 'F2'));
    if (checked) {
      contentLines.push(text(lx + 2, y - 1, 12, 'X', 'F2'));
    }
  });
  checksRight.forEach(([label, checked], i) => {
    const y = ciY - 24 - i * 20;
    contentLines.push(rect(lx + 155, y - 3, 12, 12));
    contentLines.push(text(lx + 171, y, 10, label, 'F2'));
    if (checked) {
      contentLines.push(text(lx + 157, y - 1, 12, 'X', 'F2'));
    }
  });
  contentLines.push(line(lx, panelY + 52, lx + panelW - 36, panelY + 52));
  contentLines.push(text(lx, panelY + 36, 10, `OTHER: ${val(form.checkOtherText, 36)}`, 'F2'));
  contentLines.push(text(lx + 10, panelY + 12, 9, 'SEE OTHER SIDE FOR INSPECTION RECORD', 'F2'));

  // Right side: inspection record tag
  const rx = rightX + 18;
  const ryTop = panelY + panelH - 24;
  contentLines.push(text(rx + 24, ryTop - 8, 23, 'SCAFFOLD INSPECTION', 'F2'));
  contentLines.push(line(rx, ryTop - 16, rx + panelW - 36, ryTop - 16));
  contentLines.push(text(rx + 2, ryTop - 45, 9, 'THIS SCAFFOLD HAS BEEN INSPECTED BY A', 'F2'));
  contentLines.push(text(rx + 0, ryTop - 58, 9, 'COMPETENT PERSON AND FOUND SAFE FOR WORK', 'F2'));
  contentLines.push(text(rx + 35, ryTop - 71, 9, 'IN THE LAST 7 DAYS AND', 'F2'));
  contentLines.push(text(rx + 18, ryTop - 84, 9, 'IT IS UNLAWFUL TO REMOVE OR INTERFERE', 'F2'));
  contentLines.push(text(rx + 95, ryTop - 97, 9, 'WITH THIS TAG.', 'F2'));

  const tableX = rx + 2;
  const tableTop = ryTop - 116;
  const tableW = panelW - 42;
  const tableH = 388;
  const dateCol = 72;
  const timeCol = 58;
  contentLines.push(rect(tableX, tableTop - tableH, tableW, tableH));
  contentLines.push(fillRect(tableX, tableTop - 24, tableW, 24));
  contentLines.push(greenText);
  contentLines.push(text(tableX + 95, tableTop - 16, 13, 'INSPECTION RECORD', 'F2'));
  contentLines.push(white);
  contentLines.push(line(tableX + dateCol, tableTop - tableH, tableX + dateCol, tableTop - 24));
  contentLines.push(line(tableX + dateCol + timeCol, tableTop - tableH, tableX + dateCol + timeCol, tableTop - 24));
  contentLines.push(line(tableX, tableTop - 24, tableX + tableW, tableTop - 24));
  contentLines.push(centeredText(tableX, dateCol, tableTop - 40, 10, 'DATE', 'F2'));
  contentLines.push(centeredText(tableX + dateCol, timeCol, tableTop - 40, 9, 'TIME', 'F2'));
  contentLines.push(text(tableX + dateCol + timeCol + 8, tableTop - 40, 10, 'COMPETENT PERSON', 'F2'));

  const rowH = 31;
  for (let i = 0; i < 10; i += 1) {
    const y = tableTop - 48 - i * rowH;
    contentLines.push(line(tableX, y - rowH, tableX + tableW, y - rowH));
    const row = form.inspectionRecords[i] ?? {
      date: '',
      time: '',
      competentPerson: '',
      note: '',
    };
    contentLines.push(centeredText(tableX, dateCol, y - 18, 10, val(row.date, 12), 'F1'));
    contentLines.push(centeredText(tableX + dateCol, timeCol, y - 18, 9, val(row.time, 10), 'F1'));
    contentLines.push(text(tableX + dateCol + timeCol + 6, y - 18, 10, val(row.competentPerson, 24), 'F1'));
  }

  const footer = `Builder: ${val(form.builderName, 20)} | Project: ${val(form.projectName, 26)}`;
  contentLines.push(text(rightX + 20, panelY + 12, 9, footer, 'F3'));
  contentLines.push('Q');

  const content = contentLines.join('\n');
  const streamLength = new TextEncoder().encode(content).length;

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${content}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += obj;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf]);
}

function pdfBase64ToBytes(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleanValue = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  for (let index = 0; index < cleanValue.length; index += 4) {
    const c1 = alphabet.indexOf(cleanValue[index]);
    const c2 = alphabet.indexOf(cleanValue[index + 1]);
    const c3 = cleanValue[index + 2] === '=' ? -1 : alphabet.indexOf(cleanValue[index + 2]);
    const c4 = cleanValue[index + 3] === '=' ? -1 : alphabet.indexOf(cleanValue[index + 3]);
    if (c1 < 0 || c2 < 0) {
      continue;
    }
    bytes.push(c1 * 4 + Math.floor(c2 / 16));
    if (c3 >= 0) {
      bytes.push((c2 % 16) * 16 + Math.floor(c3 / 4));
    }
    if (c4 >= 0 && c3 >= 0) {
      bytes.push((c3 % 4) * 64 + c4);
    }
  }
  return new Uint8Array(bytes);
}

function jpegDimensions(bytes: Uint8Array): {width: number; height: number} | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset < bytes.length - 9) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    const length = bytes[offset + 2] * 256 + bytes[offset + 3];
    if (length < 2) {
      break;
    }
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: bytes[offset + 5] * 256 + bytes[offset + 6],
        width: bytes[offset + 7] * 256 + bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

async function readScaffTagPdfImage(path: string, name: string, slot?: number): Promise<ScaffTagPdfImage | null> {
  try {
    const response = await fetch(await signedPathUrl(path));
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const dimensions = jpegDimensions(bytes);
    return dimensions ? {name, bytes, ...dimensions, slot} : null;
  } catch {
    return null;
  }
}

async function buildRenderedScaffTagPdf(form: ScaffTagForm): Promise<string> {
  const company = getCompanyEntity(form.companyEntityId);
  const logoBytes = pdfBase64ToBytes(await getCompanyLogoJpegBase64(company.id, PDF_LOGO_JPEG_BASE64));
  const logoDimensions = jpegDimensions(logoBytes) ?? {
    width: 260,
    height: 144,
  };
  const photoImages = (
    await Promise.all(
      form.photoPaths
        .slice(0, SCAFF_TAG_PHOTO_LIMIT)
        .map((path, slot) => readScaffTagPdfImage(path, `Photo${slot + 1}`, slot)),
    )
  ).filter((image): image is ScaffTagPdfImage => Boolean(image));
  return buildScaffTagPdfDocument(form, [{name: 'Logo', bytes: logoBytes, ...logoDimensions}, ...photoImages], {
    officeAddress: company.officeAddress,
    legalName: company.legalName,
    phone: company.phone,
  });
}

export async function listScaffTagForms(builderId: string, projectId: string): Promise<ScaffTagListItem[]> {
  const forms = await listSafetyForms<ScaffTagForm>('scaff-tags', builderId, projectId);
  const labels = await listAssignedScaffTagQrLabels(builderId, projectId).catch(() => []);
  return forms.map(form => {
    const linkedLabels = labels.filter(candidate => candidate.assignedFormId === form.id);
    const label = linkedLabels.find(candidate => candidate.status === 'assigned') ?? linkedLabels[0];
    return {
      id: form.id,
      status: form.status === 'retired' || form.retiredAt ? 'retired' : 'active',
      retiredAt: form.retiredAt ?? '',
      retiredReason: form.retiredReason ?? '',
      companyEntityId: normalizeCompanyEntityId(form.companyEntityId),
      tagNumber: normalizeTagNumber(form.tagNumber),
      scaffoldNo: form.scaffoldNo || (!normalizeTagNumber(form.tagNumber) ? form.tagNumber : '') || '',
      scaffoldRegisterId: form.scaffoldRegisterId ?? '',
      handoverFormId: form.handoverFormId ?? '',
      handoverInspectionNumber: form.handoverInspectionNumber ?? '',
      handoverReferenceName: form.handoverReferenceName ?? '',
      jobLocation: form.jobLocation ?? '',
      latestInspectionDate:
        form.latestInspectionAt ||
        ([...(form.inspectionRecords ?? [])]
          .filter(record => inspectionHasContent(record))
          .map(record => record.inspectedAt || record.date?.trim())
          .filter(Boolean)
          .slice(-1)[0] ??
          ''),
      inspectedBy: form.inspectedBy || form.erectedBy || '',
      proximityAlertEnabled: !!form.proximityAlertEnabled,
      locationLatitude: form.locationLatitude ?? null,
      locationLongitude: form.locationLongitude ?? null,
      qrTargetUrl: label?.publicUrl ?? '',
      qrLabelId: label?.id ?? '',
      qrLabelNumber: label?.displayNumber ?? '',
      qrLabelStatus: label?.status ?? 'unassigned',
      qrLabelAssignedAt: label?.assignedAt ?? '',
      qrLabelRetiredAt: label?.retiredAt ?? '',
      qrLabelRetiredReason: label?.retiredReason ?? '',
      updatedAt: form.updatedAt ?? nowIso(),
    };
  });
}

export async function getScaffTagForm(
  builderId: string,
  projectId: string,
  formId: string,
): Promise<ScaffTagForm | null> {
  const raw = await getSafetyForm<ScaffTagForm>('scaff-tags', builderId, projectId, formId);
  if (!raw) {
    return null;
  }

  return {
    ...raw,
    tagNumber: normalizeTagNumber(raw.tagNumber),
    companyEntityId: normalizeCompanyEntityId(raw.companyEntityId),
    scaffoldNo: raw.scaffoldNo || (!normalizeTagNumber(raw.tagNumber) ? raw.tagNumber : '') || '',
    scaffoldRegisterId: raw.scaffoldRegisterId ?? '',
    handoverFormId: raw.handoverFormId ?? '',
    handoverInspectionNumber: raw.handoverInspectionNumber ?? '',
    handoverReferenceName: raw.handoverReferenceName ?? '',
    jobLocation: raw.jobLocation ?? '',
    dateErected: raw.dateErected ?? '',
    requestedBy: raw.requestedBy ?? '',
    erectedBy: raw.erectedBy ?? '',
    inspectedBy: raw.inspectedBy ?? raw.erectedBy ?? '',
    erectedBySignature: raw.erectedBySignature ?? '',
    erectedBySignatureStrokes: Array.isArray(raw.erectedBySignatureStrokes)
      ? raw.erectedBySignatureStrokes
          .map(stroke =>
            Array.isArray(stroke)
              ? stroke
                  .map(point => ({
                    x: typeof point?.x === 'number' ? point.x : 0,
                    y: typeof point?.y === 'number' ? point.y : 0,
                  }))
                  .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
              : [],
          )
          .filter(stroke => stroke.length > 0)
      : [],
    fallProtectionRequired: raw.fallProtectionRequired ?? '',
    loadRating: raw.loadRating ?? '',
    loadRatingOther: raw.loadRatingOther ?? '',
    checkHandrails: !!raw.checkHandrails,
    checkPlatform: !!raw.checkPlatform,
    checkMidRails: !!raw.checkMidRails,
    checkLadder: !!raw.checkLadder,
    checkToeBoards: !!raw.checkToeBoards,
    checkOther: !!raw.checkOther,
    checkOtherText: raw.checkOtherText ?? '',
    inspectionRecords: Array.isArray(raw.inspectionRecords)
      ? raw.inspectionRecords.slice(0, 10).map(row => ({
          date: row?.date ?? '',
          time: row?.time ?? '',
          competentPerson: row?.competentPerson ?? '',
          note: row?.note ?? '',
          inspectedAt: row?.inspectedAt ?? '',
          timeZone: row?.timeZone ?? SYDNEY_TIME_ZONE,
          signatureStrokes: Array.isArray(row?.signatureStrokes) ? row.signatureStrokes : [],
        }))
      : Array.from({length: 10}, () => ({
          date: '',
          time: '',
          competentPerson: '',
          note: '',
          inspectedAt: '',
          timeZone: SYDNEY_TIME_ZONE,
          signatureStrokes: [],
        })),
    latestInspectionAt: raw.latestInspectionAt ?? '',
    photoPaths: Array.isArray(raw.photoPaths) ? raw.photoPaths : [],
    pdfPath: raw.pdfPath ?? pdfObjectPath(builderId, projectId, formId),
    qrTargetUrl: (await getAssignedScaffTagQrLabel(builderId, projectId, formId).catch(() => null))?.publicUrl ?? '',
    sharePath: raw.sharePath,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function uploadScaffTagPhoto(
  builderId: string,
  projectId: string,
  formId: string,
  uri: string,
  fileName: string,
): Promise<string> {
  const path = photoObjectPath(builderId, projectId, formId, fileName);
  const blob = await uriToBlob(uri);
  await uploadObject(path, blob, 'image/jpeg');
  return path;
}

export async function getScaffTagPhotoUrl(path: string): Promise<string> {
  return signedPathUrl(path, 60 * 60 * 24 * 14);
}

export async function saveScaffTagForm(
  form: Omit<ScaffTagForm, 'id' | 'createdAt' | 'updatedAt' | 'sharePath' | 'pdfPath' | 'qrTargetUrl'> & {
    id?: string;
    createdAt?: string;
  },
): Promise<ScaffTagForm> {
  const input = form;
  const formId = form.id ?? id();
  const existing = form.id ? await getScaffTagForm(form.builderId, form.projectId, formId) : null;
  const createdAt = form.createdAt ?? nowIso();
  const updatedAt = nowIso();
  const savedAt = new Date(updatedAt);
  const sharePath = shareObjectPath(form.builderId, form.projectId, formId);
  const pdfPath = existing?.pdfPath ?? pdfObjectPath(form.builderId, form.projectId, formId);
  // A compose-screen number is only accepted when it has already been reserved
  // through the allocator. Other callers still receive an authoritative number
  // here on first save; edits always retain the original number.
  let tagNumber = existing?.tagNumber?.trim() || input.tagNumber?.trim() || '';
  if (!tagNumber) {
    tagNumber = await allocateNextScaffTagNumber(form.builderId, form.projectId);
  }
  const inspectionRecords = (input.inspectionRecords ?? [])
    .slice(0, 10)
    .map(row => stampInspectionRecord(row, savedAt));
  const latestInspectionRecord = [...inspectionRecords].reverse().find(record => inspectionHasContent(record));
  const latestInspectionAt = latestInspectionRecord?.inspectedAt || existing?.latestInspectionAt || '';
  const baseForm: ScaffTagForm = {
    ...input,
    id: formId,
    status: existing?.status ?? input.status ?? 'active',
    retiredAt: existing?.retiredAt ?? input.retiredAt ?? '',
    retiredReason: existing?.retiredReason ?? input.retiredReason ?? '',
    tagNumber,
    inspectionRecords,
    latestInspectionAt,
    photoPaths: (input.photoPaths ?? []).slice(0, SCAFF_TAG_PHOTO_LIMIT),
    pdfPath,
    qrTargetUrl: existing?.qrTargetUrl ?? '',
    createdAt,
    updatedAt,
    sharePath,
  };

  // Upload PDF first so signed URL generation does not fail with 404 on new forms.
  await uploadObject(pdfPath, await buildRenderedScaffTagPdf(baseForm), 'application/pdf');

  const qrTargetUrl =
    (await getAssignedScaffTagQrLabel(form.builderId, form.projectId, formId).catch(() => null))?.publicUrl ?? '';
  const nextForm: ScaffTagForm = {
    ...baseForm,
    qrTargetUrl,
  };

  const latestInspectionDate = nextForm.latestInspectionAt || latestInspectionRecord?.date || '';
  await Promise.all([
    uploadObject(sharePath, renderScaffTagHtml(nextForm), 'text/html'),
    upsertSafetyForm('scaff-tags', form.builderId, form.projectId, nextForm, {
      title: nextForm.scaffoldNo,
      referenceNumber: nextForm.tagNumber,
      requestedBy: nextForm.inspectedBy,
      projectLabel: nextForm.jobLocation,
      eventDate: latestInspectionDate,
      pdfPath,
      sharePath,
      photoPaths: nextForm.photoPaths,
    }),
  ]);

  const removedPhotoPaths = (existing?.photoPaths ?? []).filter(path => !nextForm.photoPaths.includes(path));
  await Promise.all(
    removedPhotoPaths.map(async path => {
      try {
        await removeObject(path);
      } catch {
        // Best effort cleanup after the updated record has been saved.
      }
    }),
  );

  return nextForm;
}

export async function setScaffTagScaffoldRecord(
  builderId: string,
  projectId: string,
  formId: string,
  scaffold: {
    scaffoldName: string;
    scaffoldRegisterId: string;
    handoverReferenceName?: string;
  },
): Promise<ScaffTagForm> {
  const existing = await getScaffTagForm(builderId, projectId, formId);
  if (!existing) {
    throw new Error('The linked Scaff-Tag could not be found.');
  }

  const nextForm: ScaffTagForm = {
    ...existing,
    scaffoldNo: scaffold.scaffoldName.trim() || existing.scaffoldNo,
    scaffoldRegisterId: scaffold.scaffoldRegisterId || existing.scaffoldRegisterId,
    handoverReferenceName:
      scaffold.handoverReferenceName === undefined ? existing.handoverReferenceName : scaffold.handoverReferenceName,
    updatedAt: nowIso(),
  };
  const pdfPath = nextForm.pdfPath || pdfObjectPath(builderId, projectId, formId);
  const sharePath = nextForm.sharePath || shareObjectPath(builderId, projectId, formId);
  nextForm.pdfPath = pdfPath;
  nextForm.sharePath = sharePath;

  await uploadObject(pdfPath, await buildRenderedScaffTagPdf(nextForm), 'application/pdf');
  await Promise.all([
    uploadObject(sharePath, renderScaffTagHtml(nextForm), 'text/html'),
    upsertSafetyForm('scaff-tags', builderId, projectId, nextForm, {
      title: nextForm.scaffoldNo,
      referenceNumber: nextForm.tagNumber,
      requestedBy: nextForm.inspectedBy,
      projectLabel: nextForm.jobLocation,
      eventDate: nextForm.latestInspectionAt || '',
      pdfPath,
      sharePath,
      photoPaths: nextForm.photoPaths,
    }),
  ]);
  return nextForm;
}

export async function getScaffTagShareUrl(form: ScaffTagForm): Promise<string> {
  return signedPathUrl(form.sharePath, 60 * 60 * 24 * 365);
}

export async function getScaffTagPdfUrl(form: ScaffTagForm): Promise<string> {
  return signedPathUrl(form.pdfPath, 60 * 60 * 24 * 14);
}

async function removeObject(path: string): Promise<void> {
  const response = await api.fetchSupabase(objectUrl(path), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (response.status === 404) {
    await invalidateStorageJsonCache(path);
    return;
  }
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Delete failed: ${details || response.status}`);
  }
  await invalidateStorageJsonCache(path);
}

export async function deleteScaffTagForm(builderId: string, projectId: string, formId: string): Promise<void> {
  const existing = await getScaffTagForm(builderId, projectId, formId);
  await deleteSafetyFormRecord('scaff-tags', builderId, projectId, formId);

  const cleanupPaths = [
    existing?.sharePath || shareObjectPath(builderId, projectId, formId),
    existing?.pdfPath || pdfObjectPath(builderId, projectId, formId),
    ...(existing?.photoPaths ?? []),
  ];

  await Promise.all(
    cleanupPaths.map(async path => {
      try {
        await removeObject(path);
      } catch {
        // Best effort cleanup; item is already removed from index.
      }
    }),
  );
}
