// Derived from ESSApp/src/services/supabaseDayLabourForms.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {formatMetres} from '../utils/measurements';
import {AppConstants} from '../utils/constants';
import {buildMaterialListColumns} from '../utils/materialSelection';
import api from './apiService';
import {PDF_LOGO_JPEG_BASE64} from './supabaseHandoverCertificates';
import {
  deleteSafetyFormRecord,
  getSafetyForm,
  listSafetyForms,
  upsertSafetyForm,
} from './supabaseSafetyRecords';
import {invalidateStorageJsonCache} from './supabaseStorageJsonCache';
import {
  CompanyEntityId,
  companyFormTitle,
  companyRepresentativeLabel,
  getCompanyEntity,
  getCompanyLogoJpegBase64,
  normalizeCompanyEntityId,
} from '../config/companyEntities';

export type DayLabourWorkType = 'erect' | 'dismantle' | 'modification' | 'hopUps';
export type DayLabourMaterialMode = 'attached' | 'below' | '';

export interface SignaturePoint {
  x: number;
  y: number;
}

export type SignatureStroke = SignaturePoint[];

export interface DayLabourPhotoSlot {
  slot: number;
  path: string;
}

export interface DayLabourLabourRow {
  date: string;
  men: string;
  hours: string;
  total: string;
}

export interface DayLabourVariationForm {
  id: string;
  builderId: string;
  builderName: string;
  projectId: string;
  projectName: string;
  companyEntityId: CompanyEntityId;
  variationNumber: string;
  formReferenceName: string;
  clientProjectName: string;
  date: string;
  requestedBy: string;
  siteInstructionNumber: string;
  handoverDocumentNumber: string;
  handoverDocumentId: string;
  handoverDocumentTitle: string;
  drawingDocumentId: string;
  drawingDocumentType: 'ess' | 'thirdparty' | '';
  drawingDocumentName: string;
  drawingRevisionNumber: string;
  drawingFolderId: string;
  locationLevelGridLine: string;
  scaffoldLength: string;
  scaffoldWidth: string;
  scaffoldHeight: string;
  workingDecks: string;
  access: string;
  descriptionOfWork: string;
  workTypes: Record<DayLabourWorkType, boolean>;
  labourRows: DayLabourLabourRow[];
  transportIncluded: string;
  engineerRequired: boolean | null;
  additionalMaterialMode: DayLabourMaterialMode;
  materialList: string;
  photoSlots: DayLabourPhotoSlot[];
  essRepresentativeName: string;
  essRepresentativeSignature: string;
  essRepresentativeSignatureStrokes: SignatureStroke[];
  clientName: string;
  clientSignature: string;
  clientSignatureStrokes: SignatureStroke[];
  pdfPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface DayLabourVariationListItem {
  id: string;
  variationNumber: string;
  formReferenceName: string;
  requestedBy: string;
  essRepresentativeName: string;
  clientProjectName: string;
  date: string;
  handoverDocumentNumber: string;
  handoverDocumentId: string;
  handoverDocumentTitle: string;
  updatedAt: string;
}

type PdfImageResource = {
  name: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  slot?: number;
};

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
  return `site-data/${builderId}/${projectId}/day-labour-variations`;
}

function pdfObjectPath(builderId: string, projectId: string, formId: string): string {
  return `${sitePrefix(builderId, projectId)}/pdf/${formId}.pdf`;
}

function photoObjectPath(builderId: string, projectId: string, formId: string, slot: number, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${sitePrefix(builderId, projectId)}/photos/${formId}/${slot}-${Date.now()}-${safeName}`;
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
  const attempts: Array<{method: 'POST' | 'PUT'; url: string; headers: Record<string, string>}> = [
    {method: 'POST', url: objectUrl(path), headers: {...authHeaders(true), 'x-upsert': 'true'}},
    {method: 'POST', url: `${objectUrl(path)}?upsert=true`, headers: authHeaders(true)},
    {method: 'PUT', url: objectUrl(path), headers: {...authHeaders(true), 'x-upsert': 'true'}},
  ];

  let lastError = '';
  for (const attempt of attempts) {
    const response = await api.fetchSupabase(attempt.url, {
      method: attempt.method,
      headers: {...attempt.headers, 'Content-Type': contentType},
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

async function signedPathUrl(path: string, expiresInSeconds = 60 * 60 * 24 * 14): Promise<string> {
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

function normalizeSignatureStrokes(value: unknown): SignatureStroke[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
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
    .filter(stroke => stroke.length > 0);
}

async function allocateVariationNumberViaRpc(
  builderId: string,
  projectId: string,
): Promise<string> {
  const response = await api.fetchSupabase(rpcUrl('allocate_day_labour_variation_number'), {
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
    if (
      lower.includes('pgrst202') ||
      lower.includes('could not find the function') ||
      lower.includes('schema cache')
    ) {
      throw new Error('DAY_LABOUR_COUNTER_RPC_MISSING');
    }
    throw new Error(body || 'Could not allocate day-labour variation number.');
  }

  try {
    const parsed = JSON.parse(body) as
      | string
      | {allocate_day_labour_variation_number?: string};
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (typeof parsed?.allocate_day_labour_variation_number === 'string') {
      return parsed.allocate_day_labour_variation_number;
    }
  } catch {
    // PostgREST may return a JSON scalar; the plain-text fallback handles it.
  }

  const trimmed = body.replace(/^"+|"+$/g, '').trim();
  if (!trimmed) {
    throw new Error('No variation number returned from Supabase RPC.');
  }
  return trimmed;
}

async function previewVariationNumberViaRpc(
  builderId: string,
  projectId: string,
): Promise<string> {
  const response = await api.fetchSupabase(rpcUrl('preview_day_labour_variation_number'), {
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
    if (
      lower.includes('pgrst202') ||
      lower.includes('could not find the function') ||
      lower.includes('schema cache')
    ) {
      throw new Error('DAY_LABOUR_PREVIEW_RPC_MISSING');
    }
    throw new Error(body || 'Could not preview the day-labour variation number.');
  }

  try {
    const parsed = JSON.parse(body) as
      | string
      | {preview_day_labour_variation_number?: string};
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (typeof parsed?.preview_day_labour_variation_number === 'string') {
      return parsed.preview_day_labour_variation_number;
    }
  } catch {
    // PostgREST may return a JSON scalar; the plain-text fallback handles it.
  }

  const trimmed = body.replace(/^"+|"+$/g, '').trim();
  if (!trimmed) {
    throw new Error('No variation number preview returned from Supabase RPC.');
  }
  return trimmed;
}

function pdfEsc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function truncate(value: string, max: number): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wrapText(value: string, maxLineLength: number, maxLines: number): string[] {
  const words = (value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength) {
      current = next;
      continue;
    }
    lines.push(current || word.slice(0, maxLineLength));
    current = current ? word : word.slice(maxLineLength);
    if (lines.length === maxLines) {
      return lines;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

function drawText(x: number, y: number, size: number, value: string, font: 'F1' | 'F2' = 'F1') {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEsc(value)}) Tj ET`;
}

function estimatedTextWidth(value: string, size: number, font: 'F1' | 'F2' = 'F1'): number {
  return value.length * size * (font === 'F2' ? 0.56 : 0.50);
}

function drawCenteredBoxText(x: number, y: number, width: number, size: number, value: string, font: 'F1' | 'F2' = 'F1') {
  return drawText(x + (width - estimatedTextWidth(value, size, font)) / 2, y, size, value, font);
}

function truncateToWidth(value: string, maxWidth: number, size: number, font: 'F1' | 'F2' = 'F1'): string {
  const clean = (value || '').replace(/\s+/g, ' ').trim();
  if (estimatedTextWidth(clean, size, font) <= maxWidth) {
    return clean;
  }

  let output = clean;
  while (output.length > 3 && estimatedTextWidth(`${output}...`, size, font) > maxWidth) {
    output = output.slice(0, -1).trimEnd();
  }
  return `${output}...`;
}

function base64ToBytes(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = alphabet.indexOf(clean[i]);
    const c2 = alphabet.indexOf(clean[i + 1]);
    const c3 = clean[i + 2] === '=' ? -1 : alphabet.indexOf(clean[i + 2]);
    const c4 = clean[i + 3] === '=' ? -1 : alphabet.indexOf(clean[i + 3]);
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

function drawSignatureStrokesPdf(x: number, y: number, w: number, h: number, strokes: SignatureStroke[]): string[] {
  const lines: string[] = [];
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return lines;
  }
  lines.push('1.4 w');
  lines.push('0.067 0.067 0.067 RG');
  strokes.forEach(stroke => {
    if (!Array.isArray(stroke) || stroke.length < 2) {
      return;
    }
    const points = stroke.map(point => ({
      px: x + Math.max(0, Math.min(1, point.x)) * w,
      py: y + Math.max(0, Math.min(1, point.y)) * h,
    }));
    for (let i = 1; i < points.length; i += 1) {
      lines.push(`${points[i - 1].px} ${points[i - 1].py} m ${points[i].px} ${points[i].py} l S`);
    }
  });
  lines.push('1 w');
  return lines;
}

function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 1) {
    output += bytes[i].toString(16).padStart(2, '0');
    if (i > 0 && i % 64 === 0) {
      output += '\n';
    }
  }
  return `${output}>`;
}

function parseJpegDimensions(bytes: Uint8Array): {width: number; height: number} | null {
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

async function readJpegResource(path: string, name: string, slot?: number): Promise<PdfImageResource | null> {
  try {
    const url = await signedPathUrl(path);
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const dimensions = parseJpegDimensions(bytes);
    if (!dimensions) {
      return null;
    }
    return {name, bytes, width: dimensions.width, height: dimensions.height, slot};
  } catch {
    return null;
  }
}

function drawImageCover(name: string, image: Pick<PdfImageResource, 'width' | 'height'>, x: number, y: number, w: number, h: number): string {
  const scale = Math.max(w / image.width, h / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  return `q\n${x} ${y} ${w} ${h} re W n\n${drawW} 0 0 ${drawH} ${drawX} ${drawY} cm\n/${name} Do\nQ`;
}

function drawImage(name: string, x: number, y: number, w: number, h: number): string {
  return `q\n${w} 0 0 ${h} ${x} ${y} cm\n/${name} Do\nQ`;
}

export async function buildDayLabourVariationPdfBody(form: DayLabourVariationForm): Promise<string> {
  const pageW = 768;
  const pageH = 1092;
  const margin = 20;
  const contentW = pageW - margin * 2;
  const orange = '0.949 0.549 0.157 rg';
  const paleOrange = '0.980 0.884 0.780 rg';
  const grey = '0.957 0.957 0.957 rg';
  const dark = '0.067 0.067 0.067 rg';
  const red = '0.925 0.118 0.118 rg';
  const blue = '0.196 0.514 0.871 rg';
  const lineColor = '0.180 0.180 0.180 RG';
  const white = '1 1 1 rg';
  const rect = (x: number, y: number, w: number, h: number) => `${x} ${y} ${w} ${h} re`;
  const strokeRect = (x: number, y: number, w: number, h: number) => `${rect(x, y, w, h)} S`;
  const fillRect = (x: number, y: number, w: number, h: number) => `${rect(x, y, w, h)} f`;
  const line = (x1: number, y1: number, x2: number, y2: number) => `${x1} ${y1} m ${x2} ${y2} l S`;
  const company = getCompanyEntity(form.companyEntityId);
  const logoBytes = base64ToBytes(await getCompanyLogoJpegBase64(company.id, PDF_LOGO_JPEG_BASE64));
  const logoDimensions = parseJpegDimensions(logoBytes) ?? {width: 260, height: 144};
  const logoImage: PdfImageResource = {
    name: 'Logo',
    bytes: logoBytes,
    width: logoDimensions.width,
    height: logoDimensions.height,
  };
  const photoImages = (
    await Promise.all(form.photoSlots.map(item => readJpegResource(item.path, `Photo${item.slot + 1}`, item.slot)))
  ).filter((item): item is PdfImageResource => Boolean(item));
  const imageResources = [logoImage, ...photoImages];
  const photoImageBySlot = new Map(photoImages.map(item => [item.slot, item]));
  const page: string[] = ['1 w', lineColor, dark];

  page.push(drawImage('Logo', margin + 4, pageH - 113, 96, 54));
  page.push(drawText(margin + 116, pageH - 70, 10.5, company.legalName, 'F2'));
  page.push(drawText(margin + 116, pageH - 84, 10.5, `ABN: ${company.abn}`));
  page.push(drawText(margin + 116, pageH - 98, 10.5, `Office Address: ${company.officeAddress}`));
  page.push(drawText(margin + 116, pageH - 112, 10.5, `PH: ${company.phone}   FAX: ${company.fax}`));
  page.push(drawText(pageW - margin - 252, pageH - 78, 19, companyFormTitle(company.id, 'Variation / Day Labour'), 'F2'));
  page.push(red);
  page.push(drawText(pageW - margin - 202, pageH - 112, 14, 'VARIATION NO. A', 'F2'));
  page.push('2 w');
  page.push('0.925 0.118 0.118 RG');
  page.push(strokeRect(pageW - margin - 56, pageH - 125, 54, 28));
  page.push('1 w');
  page.push(dark);
  page.push(drawCenteredBoxText(pageW - margin - 56, pageH - 115, 54, 10.5, truncate(form.variationNumber, 8), 'F2'));
  page.push(lineColor);
  page.push(line(margin, pageH - 140, pageW - margin, pageH - 140));

  const cleanHandoverNumber = (value: string) => {
    const digits = (value || '').replace(/\D/g, '');
    return digits || truncate(value, 24);
  };
  const handoverNumber = cleanHandoverNumber(form.handoverDocumentNumber);

  const underlineField = (label: string, value: string, x: number, y: number, w: number, labelW: number, max = 42) => {
    page.push(drawText(x, y, 10.5, `${label}:`, 'F2'));
    page.push(line(x + labelW, y - 3, x + w, y - 3));
    page.push(drawText(x + labelW + 5, y + 1, 9.5, truncate(value, max)));
  };

  const metaLeftX = margin;
  const metaRightX = margin + 380;
  underlineField('FORM REFERENCE NAME', form.formReferenceName, metaLeftX, pageH - 170, 360, 142, 44);
  underlineField('CLIENT / PROJECT NAME', form.clientProjectName, metaLeftX, pageH - 198, 360, 150, 44);
  underlineField('DATE', form.date, metaLeftX, pageH - 226, 360, 48, 18);
  underlineField('REQUESTED BY', form.requestedBy, metaRightX, pageH - 170, 348, 108, 36);
  underlineField('SITE INSTRUCTION NO', form.siteInstructionNumber, metaRightX, pageH - 198, 348, 132, 30);
  underlineField('HANDOVER DOCUMENT NO', handoverNumber ? `No. ${handoverNumber}` : '', metaRightX, pageH - 226, 348, 160, 30);

  let y = pageH - 276;
  page.push(orange);
  page.push(fillRect(margin, y, contentW, 26));
  page.push(lineColor);
  page.push(strokeRect(margin, y, contentW, 26));
  page.push(dark);
  page.push(drawCenteredBoxText(margin, y + 8, contentW, 13, 'INFORMATION', 'F2'));
  y -= 312;

  const infoTop = pageH - 276;
  const infoBottom = y;
  const leftW = contentW - 190;
  const rightX = margin + leftW;
  const rightW = contentW - leftW;
  page.push(strokeRect(margin, infoBottom, contentW, infoTop - infoBottom));
  page.push(line(rightX, infoBottom, rightX, infoTop));
  page.push(drawText(margin + 8, infoTop - 18, 11, 'LOCATION / LEVEL / GRID LINE:', 'F2'));
  page.push(strokeRect(margin + 8, infoTop - 102, leftW - 16, 72));
  wrapText(form.locationLevelGridLine, 88, 4).forEach((text, index) => page.push(drawText(margin + 16, infoTop - 46 - index * 13, 9.5, text)));
  page.push(drawText(margin + 8, infoTop - 124, 11, 'DESCRIPTION OF WORK:', 'F2'));
  page.push(strokeRect(margin + 8, infoBottom + 12, leftW - 16, infoTop - 148 - infoBottom));
  wrapText(form.descriptionOfWork, 92, 8).forEach((text, index) => page.push(drawText(margin + 16, infoTop - 148 - index * 14, 9.5, text)));

  page.push(drawCenteredBoxText(rightX + 10, infoTop - 24, rightW - 20, 10.5, 'LENGTH, WIDTH, HEIGHT', 'F2'));
  page.push(drawCenteredBoxText(rightX + 10, infoTop - 38, rightW - 20, 10.5, 'DECKS & ACCESS', 'F2'));
  [
    ['L', formatMetres(form.scaffoldLength)],
    ['W', formatMetres(form.scaffoldWidth)],
    ['H', formatMetres(form.scaffoldHeight)],
    ['D', form.workingDecks],
    ['A', form.access],
  ].forEach(([label, value], index) => {
    const fieldY = infoTop - 64 - index * 25;
    page.push(drawText(rightX + 22, fieldY, 10.5, `${label} -`, 'F2'));
    page.push(line(rightX + 50, fieldY - 3, rightX + rightW - 18, fieldY - 3));
    page.push(drawText(rightX + 56, fieldY + 1, 9.5, truncate(String(value), 12)));
  });

  const checkbox = (x: number, cy: number, active: boolean) => {
    page.push(grey);
    page.push(fillRect(x, cy - 12, 20, 20));
    page.push(lineColor);
    page.push(strokeRect(x, cy - 12, 20, 20));
    if (active) {
      page.push(blue);
      page.push('3 w');
      page.push(`${x + 4} ${cy - 1} m ${x + 9} ${cy - 7} l ${x + 17} ${cy + 7} l S`);
      page.push('1 w');
    }
    page.push(lineColor);
    page.push(dark);
  };
  const workTypeCheckboxX = rightX + rightW - 36;
  const pleaseTickText = '(please tick)';
  const pleaseTickSize = 8.5;
  page.push(red);
  page.push(drawText(workTypeCheckboxX + 10 - estimatedTextWidth(pleaseTickText, pleaseTickSize, 'F2') / 2, infoTop - 178, pleaseTickSize, pleaseTickText, 'F2'));
  page.push(dark);
  [
    ['ERECT', form.workTypes.erect, infoTop - 192],
    ['DISMANTLE', form.workTypes.dismantle, infoTop - 220],
    ['MODIFICATION /\nALTERATION', form.workTypes.modification, infoTop - 250],
    ['HOP UPS', form.workTypes.hopUps, infoTop - 286],
  ].forEach(([label, active, cy]) => {
    String(label).split('\n').forEach((text, textIndex) => {
      page.push(drawText(rightX + 22, Number(cy) - textIndex * 12, 10.5, `${text}:`, 'F2'));
    });
    checkbox(workTypeCheckboxX, Number(cy) - 1, Boolean(active));
  });

  y = infoBottom;
  const rowH = 32;
  const labourRows = form.labourRows.length > 0 ? form.labourRows.slice(0, 4) : [{date: '', men: '', hours: '', total: ''}];
  labourRows.forEach((row, index) => {
    const rowY = y - index * rowH;
    page.push(index % 2 === 0 ? paleOrange : white);
    page.push(fillRect(margin, rowY - rowH, contentW, rowH));
    page.push(lineColor);
    page.push(strokeRect(margin, rowY - rowH, contentW, rowH));
    page.push(dark);
    const baseY = rowY - 20;
    page.push(drawText(margin + 8, baseY, 10, 'DATE:', 'F2'));
    page.push(line(margin + 48, baseY - 3, margin + 250, baseY - 3));
    page.push(drawText(margin + 54, baseY + 1, 9.5, truncate(row.date, 14)));
    page.push(drawText(margin + 266, baseY, 10, 'MEN:', 'F2'));
    page.push(line(margin + 306, baseY - 3, margin + 406, baseY - 3));
    page.push(drawText(margin + 312, baseY + 1, 9.5, truncate(row.men, 8)));
    page.push(drawText(margin + 424, baseY, 10, 'X HOURS:', 'F2'));
    page.push(line(margin + 492, baseY - 3, margin + 592, baseY - 3));
    page.push(drawText(margin + 498, baseY + 1, 9.5, truncate(row.hours, 8)));
    page.push(drawText(margin + 606, baseY, 10, '= TOTAL:', 'F2'));
    page.push('1.5 w');
    page.push('0.925 0.118 0.118 RG');
    page.push(strokeRect(margin + 668, rowY - 27, 54, 22));
    page.push('1 w');
    page.push(lineColor);
    page.push(drawCenteredBoxText(margin + 668, rowY - 20, 54, 9.5, truncate(row.total, 8), 'F2'));
  });
  y -= labourRows.length * rowH;
  page.push(strokeRect(margin, y - 38, contentW, 38));
  page.push(drawText(margin + 8, y - 24, 11, 'TRANSPORT INCLUDED :', 'F2'));
  page.push(grey);
  page.push(fillRect(margin + 148, y - 31, 235, 24));
  page.push(lineColor);
  page.push(strokeRect(margin + 148, y - 31, 235, 24));
  page.push(dark);
  page.push(drawText(margin + 158, y - 22, 9.5, truncate(form.transportIncluded, 34)));
  page.push(drawText(margin + 438, y - 24, 10.5, 'ENGINEER REQUIRED', 'F2'));
  page.push(red);
  page.push(drawText(margin + 554, y - 24, 8.5, '(please tick):', 'F2'));
  page.push(dark);
  page.push(drawText(margin + 626, y - 24, 9.5, 'YES', 'F2'));
  checkbox(margin + 650, y - 16, form.engineerRequired === true);
  page.push(drawText(margin + 678, y - 24, 9.5, 'NO', 'F2'));
  checkbox(margin + 700, y - 16, form.engineerRequired === false);

  const basePhotoH = labourRows.length >= 4 ? 88 : labourRows.length === 3 ? 112 : 145;
  const minPhotoH = 54;
  const minSignatureY = 92;
  const materialColumns = buildMaterialListColumns(form.materialList, {maxRows: 4, maxColumns: 4});
  const materialRowCount = Math.max(1, ...materialColumns.map(column => column.length));
  const maxMaterialBoxH = Math.max(76, y - minPhotoH - 92 - minSignatureY);
  const desiredMaterialBoxH = Math.max(76, 20 + materialRowCount * 10);
  const materialBoxH = Math.min(desiredMaterialBoxH, maxMaterialBoxH);
  const materialLineH = Math.max(7.2, Math.min(14, (materialBoxH - 18) / materialRowCount));
  const materialFontSize = Math.max(5.8, Math.min(8.8, materialLineH - 2.2));

  y -= 46;
  page.push(paleOrange);
  page.push(fillRect(margin, y - 30, contentW, 30));
  page.push(lineColor);
  page.push(strokeRect(margin, y - 30, contentW, 30));
  page.push(dark);
  page.push(drawText(margin + 8, y - 20, 11, 'ADDITIONAL MATERIAL USED', 'F2'));
  y -= 30;
  page.push(dark);
  page.push(strokeRect(margin, y - materialBoxH, contentW, materialBoxH));
  const materialColumnGap = 12;
  const materialColumnWidth = materialColumns.length
    ? (contentW - 16 - materialColumnGap * (materialColumns.length - 1)) / materialColumns.length
    : contentW - 16;
  materialColumns.forEach((column, columnIndex) => {
    const columnX = margin + 8 + columnIndex * (materialColumnWidth + materialColumnGap);
    column.forEach((text, rowIndex) => {
      const textY = y - 14 - rowIndex * materialLineH;
      if (textY > y - materialBoxH + 6) {
        page.push(drawText(columnX, textY, materialFontSize, truncateToWidth(text, materialColumnWidth, materialFontSize)));
      }
    });
  });

  y -= materialBoxH + 12;
  page.push(orange);
  page.push(fillRect(margin, y - 26, contentW, 26));
  page.push(lineColor);
  page.push(strokeRect(margin, y - 26, contentW, 26));
  page.push(dark);
  page.push(drawCenteredBoxText(margin, y - 18, contentW, 13, 'SITE PHOTOS', 'F2'));
  y -= 26;
  const photoW = contentW / 3;
  const availablePhotoH = Math.max(minPhotoH, y - 24 - minSignatureY);
  const photoH = Math.min(basePhotoH, availablePhotoH);
  [0, 1, 2].forEach(slot => {
    const x = margin + slot * photoW;
    page.push(strokeRect(x, y - photoH, photoW, photoH));
    const photo = photoImageBySlot.get(slot);
    if (photo) {
      page.push(drawImageCover(photo.name, photo, x + 6, y - photoH + 6, photoW - 12, photoH - 12));
    } else {
      page.push(grey);
      page.push(fillRect(x + 1, y - photoH + 1, photoW - 2, photoH - 2));
      page.push(dark);
      page.push(drawCenteredBoxText(x, y - photoH / 2, photoW, 9.5, 'Photo'));
    }
  });

  y -= photoH + 24;
  const sigW = (contentW - 28) / 2;
  const signatureBlock = (x: number, label: string, name: string, strokes: SignatureStroke[]) => {
    const nameLabelW = label === 'CLIENT' ? 112 : 158;
    const signatureLabelW = label === 'CLIENT' ? 136 : 196;
    page.push(drawText(x, y, 10.5, `${label} NAME:`, 'F2'));
    page.push(line(x + nameLabelW, y - 3, x + sigW, y - 3));
    page.push(drawText(x + nameLabelW + 5, y + 1, 9.5, truncate(name, 34)));
    page.push(drawText(x, y - 42, 10.5, `${label} SIGNATURE:`, 'F2'));
    page.push(strokeRect(x + signatureLabelW, y - 72, sigW - signatureLabelW, 52));
    page.push(...drawSignatureStrokesPdf(x + signatureLabelW + 4, y - 68, sigW - signatureLabelW - 8, 44, strokes));
  };
  signatureBlock(
    margin + 6,
    companyRepresentativeLabel(company.id),
    form.essRepresentativeName,
    form.essRepresentativeSignatureStrokes,
  );
  signatureBlock(margin + sigW + 22, 'CLIENT', form.clientName, form.clientSignatureStrokes);

  type PdfPart = string;
  const encoder = new TextEncoder();
  const encodedLength = (part: PdfPart) => encoder.encode(part).length;
  const pageStream = page.join('\n');
  let nextObjectNumber = 5;
  const imageObjectNumbers = new Map<string, number>();
  imageResources.forEach(image => {
    imageObjectNumbers.set(image.name, nextObjectNumber);
    nextObjectNumber += 1;
  });
  const font1ObjectNumber = nextObjectNumber;
  const font2ObjectNumber = nextObjectNumber + 1;
  const objectCount = font2ObjectNumber;
  const objects: PdfPart[][] = Array.from({length: objectCount + 1}, () => []);
  const imageResourcesPdf = imageResources.length > 0
    ? `/XObject << ${imageResources.map(image => `/${image.name} ${imageObjectNumbers.get(image.name)} 0 R`).join(' ')} >>`
    : '';
  const setObject = (objectNumber: number, parts: PdfPart[]) => {
    objects[objectNumber] = parts;
  };

  setObject(1, ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n']);
  setObject(2, ['2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n']);
  setObject(3, [`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /Font << /F1 ${font1ObjectNumber} 0 R /F2 ${font2ObjectNumber} 0 R >> ${imageResourcesPdf} >> >>\nendobj\n`]);
  setObject(4, [`4 0 obj\n<< /Length ${encoder.encode(pageStream).length} >>\nstream\n${pageStream}\nendstream\nendobj\n`]);
  imageResources.forEach(image => {
    const objectNumber = imageObjectNumbers.get(image.name);
    if (!objectNumber) {
      return;
    }
    const imageStream = bytesToHex(image.bytes);
    setObject(objectNumber, [`${objectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${encodedLength(imageStream)} >>\nstream\n${imageStream}\nendstream\nendobj\n`]);
  });
  setObject(font1ObjectNumber, [`${font1ObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`]);
  setObject(font2ObjectNumber, [`${font2ObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`]);

  const parts: PdfPart[] = ['%PDF-1.4\n'];
  const offsets: number[] = [0];
  let byteOffset = encodedLength(parts[0]);
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    offsets[objectNumber] = byteOffset;
    objects[objectNumber].forEach(part => {
      parts.push(part);
      byteOffset += encodedLength(part);
    });
  }
  const xrefOffset = byteOffset;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objectCount; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(xref);
  return parts.join('');
}

export async function listDayLabourVariationForms(builderId: string, projectId: string): Promise<DayLabourVariationListItem[]> {
  const forms = await listSafetyForms<DayLabourVariationForm>(
    'day-labour-variations',
    builderId,
    projectId,
  );
  return forms.map(form => ({
      id: form.id,
      variationNumber: form.variationNumber ?? '',
      formReferenceName: form.formReferenceName ?? '',
      requestedBy: form.requestedBy ?? '',
      essRepresentativeName: form.essRepresentativeName ?? '',
      clientProjectName: form.clientProjectName ?? '',
      date: form.date ?? '',
      handoverDocumentNumber: form.handoverDocumentNumber,
      handoverDocumentId: form.handoverDocumentId,
      handoverDocumentTitle: form.handoverDocumentTitle,
      updatedAt: form.updatedAt ?? nowIso(),
  }));
}

export async function previewNextDayLabourVariationNumber(
  builderId: string,
  projectId: string,
): Promise<string> {
  return previewVariationNumberViaRpc(builderId, projectId);
}

export async function getDayLabourVariationForm(builderId: string, projectId: string, formId: string): Promise<DayLabourVariationForm | null> {
  const raw = await getSafetyForm<DayLabourVariationForm>(
    'day-labour-variations',
    builderId,
    projectId,
    formId,
  );
  if (!raw) {
    return null;
  }

  return {
    ...raw,
    companyEntityId: normalizeCompanyEntityId(raw.companyEntityId),
    variationNumber: raw.variationNumber ?? '',
    formReferenceName: raw.formReferenceName ?? '',
    clientProjectName: raw.clientProjectName ?? '',
    date: raw.date ?? '',
    requestedBy: raw.requestedBy ?? '',
    siteInstructionNumber: raw.siteInstructionNumber ?? '',
    handoverDocumentNumber: raw.handoverDocumentNumber ?? '',
    handoverDocumentId: raw.handoverDocumentId ?? '',
    handoverDocumentTitle: raw.handoverDocumentTitle ?? '',
    drawingDocumentId: raw.drawingDocumentId ?? '',
    drawingDocumentType: raw.drawingDocumentType === 'ess' || raw.drawingDocumentType === 'thirdparty' ? raw.drawingDocumentType : '',
    drawingDocumentName: raw.drawingDocumentName ?? '',
    drawingRevisionNumber: raw.drawingRevisionNumber ?? '',
    drawingFolderId: raw.drawingFolderId ?? '',
    locationLevelGridLine: raw.locationLevelGridLine ?? '',
    scaffoldLength: raw.scaffoldLength ?? '',
    scaffoldWidth: raw.scaffoldWidth ?? '',
    scaffoldHeight: raw.scaffoldHeight ?? '',
    workingDecks: raw.workingDecks ?? '',
    access: raw.access ?? '',
    descriptionOfWork: raw.descriptionOfWork ?? '',
    workTypes: {
      erect: !!raw.workTypes?.erect,
      dismantle: !!raw.workTypes?.dismantle,
      modification: !!raw.workTypes?.modification,
      hopUps: !!raw.workTypes?.hopUps,
    },
    labourRows: Array.isArray(raw.labourRows)
      ? raw.labourRows.slice(0, 4).map(row => ({
          date: row?.date ?? '',
          men: row?.men ?? '',
          hours: row?.hours ?? '',
          total: row?.total ?? '',
        }))
      : [],
    transportIncluded: raw.transportIncluded ?? '',
    engineerRequired: typeof raw.engineerRequired === 'boolean' ? raw.engineerRequired : null,
    additionalMaterialMode: raw.additionalMaterialMode === 'attached' || raw.additionalMaterialMode === 'below' ? raw.additionalMaterialMode : '',
    materialList: raw.materialList ?? '',
    photoSlots: Array.isArray(raw.photoSlots)
      ? raw.photoSlots
          .map(item => ({
            slot: typeof item?.slot === 'number' ? item.slot : -1,
            path: typeof item?.path === 'string' ? item.path : '',
          }))
          .filter(item => item.slot >= 0 && item.path)
      : [],
    essRepresentativeName: raw.essRepresentativeName ?? '',
    essRepresentativeSignature: raw.essRepresentativeSignature ?? '',
    essRepresentativeSignatureStrokes: normalizeSignatureStrokes(raw.essRepresentativeSignatureStrokes),
    clientName: raw.clientName ?? '',
    clientSignature: raw.clientSignature ?? '',
    clientSignatureStrokes: normalizeSignatureStrokes(raw.clientSignatureStrokes),
    pdfPath: raw.pdfPath ?? pdfObjectPath(builderId, projectId, formId),
    createdAt: raw.createdAt ?? nowIso(),
    updatedAt: raw.updatedAt ?? nowIso(),
  };
}

export async function uploadDayLabourVariationPhoto(builderId: string, projectId: string, formId: string, slot: number, uri: string, fileName: string): Promise<string> {
  const path = photoObjectPath(builderId, projectId, formId, slot, fileName);
  const blob = await uriToBlob(uri);
  await uploadObject(path, blob, 'image/jpeg');
  return path;
}

export async function getDayLabourVariationPhotoUrl(path: string): Promise<string> {
  return signedPathUrl(path);
}

export async function getDayLabourVariationPdfUrl(
  form: Pick<DayLabourVariationForm, 'pdfPath'> | {builderId: string; projectId: string; formId: string},
): Promise<string> {
  if ('pdfPath' in form) {
    return signedPathUrl(form.pdfPath, 60 * 60 * 24 * 14);
  }
  const saved = await getDayLabourVariationForm(form.builderId, form.projectId, form.formId);
  return signedPathUrl(saved?.pdfPath || pdfObjectPath(form.builderId, form.projectId, form.formId), 60 * 60 * 24 * 14);
}

export async function saveDayLabourVariationForm(
  form: Omit<DayLabourVariationForm, 'id' | 'createdAt' | 'updatedAt' | 'pdfPath'> & {
    id?: string;
    createdAt?: string;
    pdfBlob?: Blob | string;
  },
): Promise<DayLabourVariationForm> {
  const {pdfBlob, ...input} = form;
  const formId = form.id ?? id();
  const createdAt = form.createdAt ?? nowIso();
  const updatedAt = nowIso();
  const existing = form.id ? await getDayLabourVariationForm(form.builderId, form.projectId, formId) : null;
  const pdfPath = existing?.pdfPath ?? pdfObjectPath(form.builderId, form.projectId, formId);
  // The number displayed while composing is only a preview. Supabase assigns
  // the authoritative global number on first save; edits retain that number.
  let variationNumber = existing?.variationNumber?.trim() ?? '';
  if (!variationNumber) {
    variationNumber = await allocateVariationNumberViaRpc(form.builderId, form.projectId);
  }

  const nextForm: DayLabourVariationForm = {
    ...input,
    id: formId,
    variationNumber,
    labourRows: (form.labourRows ?? []).slice(0, 4),
    photoSlots: [...(form.photoSlots ?? [])].sort((a, b) => a.slot - b.slot),
    pdfPath,
    createdAt,
    updatedAt,
  };

  const nextPdfBody = pdfBlob ?? await buildDayLabourVariationPdfBody(nextForm);
  await uploadObject(pdfPath, nextPdfBody, 'application/pdf');
  await upsertSafetyForm(
    'day-labour-variations',
    form.builderId,
    form.projectId,
    nextForm,
    {
      title: nextForm.formReferenceName,
      referenceNumber: nextForm.variationNumber,
      requestedBy: nextForm.requestedBy,
      projectLabel: nextForm.clientProjectName || nextForm.handoverDocumentTitle,
      eventDate: nextForm.date,
      pdfPath,
      photoPaths: nextForm.photoSlots.map(item => item.path),
    },
  );
  return nextForm;
}

async function persistLinkedDayLabourForm(
  form: DayLabourVariationForm,
): Promise<DayLabourVariationForm> {
  const pdfPath = form.pdfPath || pdfObjectPath(form.builderId, form.projectId, form.id);
  const nextForm = {...form, pdfPath, updatedAt: nowIso()};
  await uploadObject(pdfPath, await buildDayLabourVariationPdfBody(nextForm), 'application/pdf');
  await upsertSafetyForm(
    'day-labour-variations',
    nextForm.builderId,
    nextForm.projectId,
    nextForm,
    {
      title: nextForm.formReferenceName,
      referenceNumber: nextForm.variationNumber,
      requestedBy: nextForm.requestedBy,
      projectLabel: nextForm.clientProjectName || nextForm.handoverDocumentTitle,
      eventDate: nextForm.date,
      pdfPath,
      photoPaths: nextForm.photoSlots.map(item => item.path),
    },
  );
  return nextForm;
}

export async function setDayLabourVariationScaffoldName(
  builderId: string,
  projectId: string,
  formId: string,
  previousScaffoldName: string,
  scaffoldName: string,
): Promise<DayLabourVariationForm> {
  const existing = await getDayLabourVariationForm(builderId, projectId, formId);
  if (!existing) {
    throw new Error('The linked Day Labour/Variation form could not be found.');
  }
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const existingReference = normalize(existing.formReferenceName);
  const shouldRenameReference = !existingReference
    || existingReference === normalize(previousScaffoldName)
    || existingReference === normalize(existing.handoverDocumentTitle)
    || existingReference === normalize(scaffoldName);
  return persistLinkedDayLabourForm({
    ...existing,
    formReferenceName: shouldRenameReference ? scaffoldName.trim() : existing.formReferenceName,
    handoverDocumentTitle: scaffoldName.trim(),
  });
}

export async function setDayLabourVariationDrawingLink(
  builderId: string,
  projectId: string,
  formId: string,
  drawing: {
    drawingDocumentId: string;
    drawingDocumentType: 'ess' | 'thirdparty';
    drawingDocumentName: string;
    drawingRevisionNumber: string;
    drawingFolderId: string;
  },
): Promise<DayLabourVariationForm> {
  const existing = await getDayLabourVariationForm(builderId, projectId, formId);
  if (!existing) {
    throw new Error('The linked Day Labour/Variation form could not be found.');
  }
  return persistLinkedDayLabourForm({...existing, ...drawing});
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

export async function deleteDayLabourVariationForm(builderId: string, projectId: string, formId: string): Promise<void> {
  const existing = await getDayLabourVariationForm(builderId, projectId, formId);
  await deleteSafetyFormRecord('day-labour-variations', builderId, projectId, formId);

  const cleanupPaths = [
    existing?.pdfPath || pdfObjectPath(builderId, projectId, formId),
    ...((existing?.photoSlots ?? []).map(item => item.path)),
  ];
  await Promise.all(
    cleanupPaths.map(async path => {
      try {
        await removeObject(path);
      } catch {
        // Best effort cleanup after removing list entry.
      }
    }),
  );
}
