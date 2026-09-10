// Derived from ESSApp/src/services/supabaseHandoverCertificates.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {formatMetres} from '../utils/measurements';
import {AppConstants} from '../utils/constants';
import api from './apiService';
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
import {sydneyNowDisplayDateTime} from '../utils/sydneyTime';

export type HandoverChecklistStatus = 'YES' | 'NO' | 'NA' | '';
export type HandoverAccessType = 'stretcher-stair' | 'aluminium-access-stair' | 'ladder-access' | '';
export type HandoverScaffoldDuty = 'LIGHT' | 'MEDIUM' | 'HEAVY' | '';

export interface SignaturePoint {
  x: number;
  y: number;
}

export type SignatureStroke = SignaturePoint[];

export interface HandoverPhotoSlot {
  slot: number;
  path: string;
}

export interface HandoverActionRow {
  actionRequired: string;
  completedBy: string;
  date: string;
}

export interface HandoverCertificateForm {
  id: string;
  builderId: string;
  builderName: string;
  projectId: string;
  projectName: string;
  companyEntityId: CompanyEntityId;
  inspectionNumber: string;
  formReferenceName: string;
  scaffoldRegisterId: string;
  inspectionDateTime: string;
  projectNumberClient: string;
  sectionLocation: string;
  intendedUse: string;
  drawingNumber: string;
  scaffTagId: string;
  scaffTagFormId: string;
  drawingDocumentId: string;
  drawingDocumentType: 'ess' | 'thirdparty' | '';
  drawingDocumentName: string;
  drawingRevisionNumber: string;
  drawingFolderId: string;
  scaffoldLength: string;
  scaffoldIdNo: string;
  baysLong: string;
  scaffoldHeight: string;
  workingDecks: string;
  accessType: HandoverAccessType;
  scaffoldDuty: HandoverScaffoldDuty;
  checklist: Record<string, HandoverChecklistStatus>;
  correctiveActions: HandoverActionRow[];
  photoSlots: HandoverPhotoSlot[];
  comments: string;
  essRepresentativeName: string;
  essRepresentativeSignature: string;
  essRepresentativeSignatureStrokes: SignatureStroke[];
  clientName: string;
  clientSignature: string;
  clientSignatureStrokes: SignatureStroke[];
  hrwLicenceNumber: string;
  pdfPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface HandoverCertificateListItem {
  id: string;
  companyEntityId: CompanyEntityId;
  formReferenceName: string;
  scaffoldRegisterId: string;
  inspectionNumber: string;
  sectionLocation: string;
  drawingNumber: string;
  drawingDocumentId: string;
  drawingDocumentType: 'ess' | 'thirdparty' | '';
  drawingDocumentName: string;
  drawingRevisionNumber: string;
  drawingFolderId: string;
  scaffTagId: string;
  scaffTagFormId: string;
  essRepresentativeName: string;
  projectNumberClient: string;
  inspectionDateTime: string;
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

export const PDF_LOGO_JPEG_BASE64 =
  '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';

const HANDOVER_CHECKLIST_SECTIONS: Array<{title: string; items: Array<{id: string; label: string}>}> = [
  {
    title: 'SCAFFOLD VICINITY',
    items: [
      {id: 'publicProtection', label: 'Has public protection been provided?'},
      {id: 'powerlinesDistance', label: 'Does distance from powerlines meet requirements?'},
      {id: 'vehiclePlantControl', label: 'Is there sufficient control over vehicle/plant movements?'},
      {id: 'craneOperationControl', label: 'Is there sufficient control over crane operation?'},
      {id: 'excavationDistance', label: 'Are scaffolds erected a safe distance from excavations/trenches?'},
      {id: 'safeAccessPlatforms', label: 'Is safe access provided to all working platforms?'},
      {id: 'decksInternalHandrailMidrail', label: 'Are decks complete with internal handrail and midrail?'},
      {id: 'hopUpsComplete', label: 'Are hop-ups complete with planks and tie bars?'},
      {id: 'decksFreeLooseItems', label: 'Are scaffold decks free from loose items and debris?'},
      {id: 'penetrationsSecure', label: 'Are all penetrations hand railed and/or covered and secure?'},
    ],
  },
  {
    title: 'SUPPORTING STRUCTURES',
    items: [
      {id: 'supportingStructureCondition', label: 'Is the supporting structure in good condition?'},
      {id: 'supportingStructureAdequate', label: 'Is the supporting structure adequate to support the scaffold loads?'},
      {id: 'foundationAdequate', label: 'Is the foundation adequate to support the scaffolding (e.g. ground)?'},
      {id: 'soleboardsCondition', label: 'Are the soleboards in good condition and fully bearing the ground?'},
      {id: 'jacksBaseplatesBearing', label: 'Are all jacks/baseplates fully bearing on the soleboards/foundations?'},
      {id: 'needlesInstalledAccordingToDesign', label: 'Are needles/UB\'s installed according to design?'},
    ],
  },
  {
    title: 'SCAFFOLD STRUCTURES',
    items: [
      {id: 'decksInstalledEvery2m', label: 'Are decks installed every 2m?'},
      {id: 'lapPlanksSecured', label: 'Are lap planks secured to prevent movement during use?'},
      {id: 'incompleteAreasBlocked', label: 'Are incomplete areas fitted with signage and blocked off to access?'},
      {id: 'lapPlanksBearing', label: 'Are lap planks adequately bearing on the supporting decks (min. 150mm)?'},
      {id: 'bracingAdequate', label: 'Is the bracing fitted adequate and as per design?'},
      {id: 'containmentSheetingFixed', label: 'Is containment sheeting fixed and secured at 1m centres?'},
      {id: 'shadeClothFireRetardant', label: 'Is the shade cloth fire retardant?'},
      {id: 'tiesInstalledToSpecifications', label: 'Are ties installed to specifications?'},
      {id: 'upliftDevicesInstalledAndEngaged', label: 'Have the uplift devices been installed and are engaged, where required?'},
      {id: 'scaffoldTagInstalled', label: 'Has a scafftag been installed on scaffold?'},
      {id: 'scaffoldErectedToDesign', label: 'Is the scaffold erected as per design drawing?'},
      {id: 'ladderBeamsTied', label: 'Are ladder beams tied at each 1.2m? With cross bracing as per drawing?'},
      {id: 'scaffoldSquarePlumb', label: 'Is scaffold square and plumb?'},
      {id: 'gapBetweenPlatformsLess225', label: 'Is the gap between scaffold platforms (inc. Hop ups) and the workforce less than 225mm?'},
      {id: 'decksCompleteExternalHandrail', label: 'Are decks complete with external handrail, midrail and kickboards and/or mesh and chain & shade?'},
    ],
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function nowInspectionDateTime(): string {
  return sydneyNowDisplayDateTime();
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
  return `site-data/${builderId}/${projectId}/handover-certificates`;
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

function signUrl(path: string): string {
  return `${AppConstants.supabaseUrl}/storage/v1/object/sign/${AppConstants.safetyProjectsBucket}/${path}`;
}

function rpcUrl(name: string): string {
  return `${AppConstants.supabaseUrl}/rest/v1/rpc/${name}`;
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read selected image.');
  }
  return response.blob();
}

async function uploadObject(path: string, body: Blob | string, contentType: string): Promise<void> {
  const cacheControlHeaders = contentType === 'application/pdf'
    ? {'cache-control': 'no-cache, max-age=0, must-revalidate'}
    : {};
  const attempts: Array<{method: 'POST' | 'PUT'; url: string; headers: Record<string, string>}> = [
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
        ...cacheControlHeaders,
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

function drawSignatureStrokesPdf(
  x: number,
  y: number,
  w: number,
  h: number,
  strokes: SignatureStroke[],
): string[] {
  const lines: string[] = [];
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return lines;
  }
  lines.push('1.2 w');
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
    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
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

function drawImage(name: string, x: number, y: number, w: number, h: number): string {
  return `q\n${w} 0 0 ${h} ${x} ${y} cm\n/${name} Do\nQ`;
}

function drawImageCover(
  name: string,
  image: Pick<PdfImageResource, 'width' | 'height'>,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const scale = Math.max(w / image.width, h / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  return `q\n${x} ${y} ${w} ${h} re W n\n${drawW} 0 0 ${drawH} ${drawX} ${drawY} cm\n/${name} Do\nQ`;
}

export async function buildHandoverCertificatePdfBody(form: HandoverCertificateForm): Promise<string> {
  const pageW = 595.2;
  const pageH = 841.8;
  const sourceW = 704;
  const sourceCropX = 53;
  const sourceCropY = 40;
  const orangeFill = '0.949 0.549 0.157 rg';
  const greyFill = '0.933 0.933 0.933 rg';
  const paleFill = '0.973 0.973 0.973 rg';
  const commentsFill = '0.957 0.871 0.761 rg';
  const selectedFill = '0.800 0.812 0.831 rg';
  const border = '0.220 0.220 0.220 RG';
  const innerBorder = '0.790 0.790 0.790 RG';
  const redBorder = '0.941 0.267 0.220 RG';
  const dark = '0.067 0.067 0.067 rg';
  const muted = '0.540 0.560 0.590 rg';
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
    await Promise.all(
      form.photoSlots.map(item => readJpegResource(item.path, `Photo${item.slot + 1}`, item.slot)),
    )
  ).filter((item): item is PdfImageResource => Boolean(item));
  const imageResources = [logoImage, ...photoImages];
  const photoImageBySlot = new Map(photoImages.map(item => [item.slot, item]));

  const makeCanvas = (sourceHeight: number) => {
    const scale = Math.min(pageW / sourceW, pageH / sourceHeight);
    const offsetX = (pageW - sourceW * scale) / 2;
    const offsetY = (pageH - sourceHeight * scale) / 2;
    const x = (sourceX: number) => offsetX + (sourceX - sourceCropX) * scale;
    const y = (sourceY: number) => pageH - offsetY - (sourceY - sourceCropY) * scale;
    const rect = (sourceX: number, sourceY: number, width: number, height: number) =>
      `${x(sourceX)} ${y(sourceY + height)} ${width * scale} ${height * scale} re`;
    const fillRect = (sourceX: number, sourceY: number, width: number, height: number) =>
      `${rect(sourceX, sourceY, width, height)} f`;
    const strokeRect = (sourceX: number, sourceY: number, width: number, height: number) =>
      `${rect(sourceX, sourceY, width, height)} S`;
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      `${x(x1)} ${y(y1)} m ${x(x2)} ${y(y2)} l S`;
    const text = (
      sourceX: number,
      baselineY: number,
      size: number,
      value: string,
      font: 'F1' | 'F2' = 'F1',
    ) => drawText(x(sourceX), y(baselineY), size * scale, value, font);
    const centeredText = (
      sourceX: number,
      baselineY: number,
      width: number,
      size: number,
      value: string,
      font: 'F1' | 'F2' = 'F1',
    ) => drawText(
      x(sourceX) + ((width * scale) - estimatedTextWidth(value, size * scale, font)) / 2,
      y(baselineY),
      size * scale,
      value,
      font,
    );
    const rightText = (
      rightX: number,
      baselineY: number,
      size: number,
      value: string,
      font: 'F1' | 'F2' = 'F1',
    ) => drawText(
      x(rightX) - estimatedTextWidth(value, size * scale, font),
      y(baselineY),
      size * scale,
      value,
      font,
    );
    const image = (name: string, sourceX: number, sourceY: number, width: number, height: number) =>
      drawImage(name, x(sourceX), y(sourceY + height), width * scale, height * scale);
    const imageCover = (
      resource: PdfImageResource,
      sourceX: number,
      sourceY: number,
      width: number,
      height: number,
    ) => drawImageCover(
      resource.name,
      resource,
      x(sourceX),
      y(sourceY + height),
      width * scale,
      height * scale,
    );
    const signature = (
      sourceX: number,
      sourceY: number,
      width: number,
      height: number,
      strokes: SignatureStroke[],
    ) => drawSignatureStrokesPdf(
      x(sourceX),
      y(sourceY + height),
      width * scale,
      height * scale,
      strokes.map(stroke => stroke.map(point => ({x: point.x, y: 1 - point.y}))),
    );
    return {scale, fillRect, strokeRect, line, text, centeredText, rightText, image, imageCover, signature};
  };

  const pageOneCanvas = makeCanvas(1030);
  const pageTwoCanvas = makeCanvas(1000);
  const page1: string[] = [`${Math.max(0.45, pageOneCanvas.scale * 0.75)} w`, dark];
  const page2: string[] = [`${Math.max(0.45, pageTwoCanvas.scale * 0.75)} w`, dark];

  const drawHeader = (
    target: string[],
    canvas: ReturnType<typeof makeCanvas>,
    withInspection: boolean,
  ) => {
    target.push(canvas.image('Logo', 65, 50, 112, 62));
    target.push(dark);
    target.push(canvas.text(181, 69, 7.4, company.legalName));
    target.push(canvas.text(181, 80, 7.4, `ABN: ${company.abn}`));
    target.push(canvas.text(181, 91, 7.4, `Office Address: ${company.officeAddress}`));
    target.push(canvas.text(181, 102, 7.4, `PH: ${company.phone}   FAX: ${company.fax}`));
    target.push(canvas.rightText(744, 72, 15, companyFormTitle(company.id, 'Handover Certificate'), 'F2'));
    if (!withInspection) {
      return;
    }
    target.push('0.941 0.267 0.220 rg');
    target.push(canvas.rightText(673.5, 116, 9.4, 'INSPECTION NO.', 'F2'));
    target.push('1 1 1 rg', canvas.fillRect(684.5, 102.5, 51.5, 19));
    target.push(redBorder, `${Math.max(0.8, canvas.scale * 1.4)} w`);
    target.push(canvas.strokeRect(684.5, 102.5, 51.5, 19));
    target.push(dark, `${Math.max(0.45, canvas.scale * 0.75)} w`);
    target.push(canvas.centeredText(684.5, 116, 51.5, 9, truncate(form.inspectionNumber, 12), 'F2'));
  };

  drawHeader(page1, pageOneCanvas, true);
  drawHeader(page2, pageTwoCanvas, false);

  const drawDetails = () => {
    const canvas = pageOneCanvas;
    const left = 64;
    const right = 744;
    const labelRight = 201;
    const fullRows: Array<{top: number; bottom: number; label: string; value: string}> = [
      {top: 182.8, bottom: 204.8, label: 'Form Reference Name', value: form.formReferenceName},
      {top: 204.8, bottom: 226.8, label: 'Date/Time of inspection', value: form.inspectionDateTime},
      {top: 226.8, bottom: 248.8, label: 'Project Number / Client', value: form.projectNumberClient},
      {top: 248.8, bottom: 270.8, label: 'Section/location of scaffold', value: form.sectionLocation},
    ];
    page1.push(orangeFill, canvas.fillRect(64, 159.5, 680, 23.3));
    page1.push(border, canvas.strokeRect(64, 159.5, 680, 23.3));
    page1.push(dark, canvas.centeredText(64, 175.2, 680, 10, 'DETAILS', 'F2'));
    fullRows.forEach(row => {
      const height = row.bottom - row.top;
      page1.push(greyFill, canvas.fillRect(left, row.top, labelRight - left, height));
      page1.push(innerBorder, canvas.strokeRect(left, row.top, labelRight - left, height));
      page1.push('1 1 1 rg', canvas.fillRect(labelRight, row.top, right - labelRight, height));
      page1.push(innerBorder, canvas.strokeRect(labelRight, row.top, right - labelRight, height));
      page1.push(dark);
      page1.push(canvas.rightText(labelRight - 6, row.top + 14.4, 8.6, row.label, row.label === 'Form Reference Name' ? 'F2' : 'F1'));
      page1.push(canvas.text(labelRight + 5, row.top + 14.4, 8.6, truncate(row.value, 88)));
    });
    const metricRows: Array<{
      top: number;
      bottom: number;
      leftLabel: string;
      leftValue: string;
      rightLabel: string;
      rightValue: string;
    }> = [
      {top: 270.8, bottom: 292.8, leftLabel: 'Intended use', leftValue: form.intendedUse, rightLabel: 'No. of working decks', rightValue: form.workingDecks},
      {top: 292.8, bottom: 312.2, leftLabel: 'Scaffold Length', leftValue: formatMetres(form.scaffoldLength), rightLabel: 'Scaffold ID No', rightValue: form.scaffoldIdNo},
      {top: 312.2, bottom: 331.2, leftLabel: 'No. of bays long', leftValue: form.baysLong, rightLabel: 'Scaffold Height', rightValue: formatMetres(form.scaffoldHeight)},
      {top: 331.2, bottom: 350.2, leftLabel: 'Drawing Number', leftValue: form.drawingNumber, rightLabel: 'Scaff-Tag ID', rightValue: form.scaffTagId},
    ];
    metricRows.forEach(row => {
      const height = row.bottom - row.top;
      const cells: Array<{x: number; width: number; fill: string; value: string; alignRight?: boolean}> = [
        {x: 64, width: 137, fill: greyFill, value: row.leftLabel, alignRight: true},
        {x: 201, width: 193, fill: '1 1 1 rg', value: row.leftValue},
        {x: 394, width: 160, fill: greyFill, value: row.rightLabel, alignRight: true},
        {x: 554, width: 190, fill: '1 1 1 rg', value: row.rightValue},
      ];
      cells.forEach(cell => {
        page1.push(cell.fill, canvas.fillRect(cell.x, row.top, cell.width, height));
        page1.push(innerBorder, canvas.strokeRect(cell.x, row.top, cell.width, height));
        page1.push(dark);
        page1.push(cell.alignRight
          ? canvas.rightText(cell.x + cell.width - 6, row.top + 13, 8.5, cell.value)
          : canvas.text(cell.x + 5, row.top + 13, 8.5, truncate(cell.value, 30)));
      });
    });
    page1.push(border, canvas.strokeRect(64, 159.5, 680, 190.7));
  };

  drawDetails();

  const drawChoice = (
    target: string[],
    canvas: ReturnType<typeof makeCanvas>,
    label: string,
    labelRightX: number,
    baselineY: number,
    boxX: number,
    boxY: number,
    active: boolean,
  ) => {
    target.push(dark, canvas.rightText(labelRightX, baselineY, 10.4, label));
    target.push('1 1 1 rg', canvas.fillRect(boxX, boxY, 26, 23.5));
    target.push(border, `${Math.max(0.8, canvas.scale * 1.5)} w`, canvas.strokeRect(boxX, boxY, 26, 23.5));
    target.push(dark, `${Math.max(0.45, canvas.scale * 0.75)} w`);
    if (active) {
      target.push(canvas.centeredText(boxX, boxY + 17, 26, 13, 'X', 'F2'));
    }
  };

  page1.push(dark, pageOneCanvas.text(68, 376, 11, 'Access:', 'F2'));
  drawChoice(page1, pageOneCanvas, 'Stretcher Stair', 270, 376, 275, 358.7, form.accessType === 'stretcher-stair');
  drawChoice(page1, pageOneCanvas, 'Aluminium access stair', 469, 376, 474, 358.7, form.accessType === 'aluminium-access-stair');
  drawChoice(page1, pageOneCanvas, 'Ladder access', 643, 376, 648, 358.7, form.accessType === 'ladder-access');
  page1.push(dark, pageOneCanvas.text(68, 403, 11, 'Scaffold Duty:', 'F2'));
  drawChoice(page1, pageOneCanvas, 'Light 225kg', 270, 403, 275, 385.2, form.scaffoldDuty === 'LIGHT');
  drawChoice(page1, pageOneCanvas, 'Medium 450kg', 460, 403, 474, 385.2, form.scaffoldDuty === 'MEDIUM');
  drawChoice(page1, pageOneCanvas, 'Heavy 675kg', 636, 403, 648, 385.2, form.scaffoldDuty === 'HEAVY');

  const checklistSections = HANDOVER_CHECKLIST_SECTIONS;
  const vicinityItems = checklistSections[0].items;
  const supportingItems = checklistSections[1].items;
  const structureItems = checklistSections[2].items;
  const leftVicinityRows = [438.1, 459.2, 479.9, 506.8, 527.4, 554.3];
  const leftSupportRows = [575.4, 602.3, 628.7, 655.6, 682.4, 709, 730];
  const leftStructureRows = [751.1, 780.7, 817.1, 852];
  const rightStructureRows = [554.3, 575.4, 602.3, 628.7, 655.6, 682.4, 709, 730, 751.1, 778.1, 798.7, 826.1, 852];

  const drawSectionBand = (x: number, top: number, width: number, height: number, title: string) => {
    page1.push(orangeFill, pageOneCanvas.fillRect(x, top, width, height));
    page1.push(innerBorder, pageOneCanvas.strokeRect(x, top, width, height));
    page1.push(dark, pageOneCanvas.text(x + 4, top + 14, 9.6, title, 'F2'));
  };
  const drawChecklistRow = (
    item: {id: string; label: string},
    labelX: number,
    labelWidth: number,
    statusX: number,
    top: number,
    bottom: number,
  ) => {
    const height = bottom - top;
    page1.push(greyFill, pageOneCanvas.fillRect(labelX, top, labelWidth, height));
    page1.push(innerBorder, pageOneCanvas.strokeRect(labelX, top, labelWidth, height));
    page1.push('1 1 1 rg', pageOneCanvas.fillRect(statusX, top, 80, height));
    const status = form.checklist[item.id] || '';
    const statusWidth = 80 / 3;
    const statusValues: HandoverChecklistStatus[] = ['YES', 'NO', 'NA'];
    statusValues.forEach((value, index) => {
      const cellX = statusX + statusWidth * index;
      if (status === value) {
        page1.push(selectedFill, pageOneCanvas.fillRect(cellX, top, statusWidth, height));
      }
      page1.push(innerBorder, pageOneCanvas.strokeRect(cellX, top, statusWidth, height));
      page1.push(status === value ? dark : muted);
      page1.push(pageOneCanvas.centeredText(cellX, top + height / 2 + 3.2, statusWidth, 7.6, value === 'NA' ? 'N/A' : `${value[0]}${value.slice(1).toLowerCase()}`));
    });
    const maxChars = labelWidth > 260 ? 56 : 52;
    const labelLines = wrapText(item.label, maxChars, height >= 25 ? 2 : 1);
    page1.push(dark);
    labelLines.forEach((textLine, index) => {
      const lineGap = 9;
      const totalHeight = (labelLines.length - 1) * lineGap;
      const baseline = top + height / 2 + 3.1 - totalHeight / 2 + index * lineGap;
      page1.push(pageOneCanvas.text(labelX + 4, baseline, 8.1, textLine));
    });
  };

  drawSectionBand(64, 417.5, 682, 20.6, 'SCAFFOLD VICINITY');
  vicinityItems.slice(0, 5).forEach((item, index) => {
    drawChecklistRow(item, 64, 258, 322, leftVicinityRows[index], leftVicinityRows[index + 1]);
  });
  vicinityItems.slice(5, 10).forEach((item, index) => {
    drawChecklistRow(item, 402, 264, 666, leftVicinityRows[index], leftVicinityRows[index + 1]);
  });
  drawSectionBand(64, 554.3, 338, 21.1, 'SUPPORTING STRUCTURES');
  supportingItems.forEach((item, index) => {
    drawChecklistRow(item, 64, 258, 322, leftSupportRows[index], leftSupportRows[index + 1]);
  });
  structureItems.slice(0, 12).forEach((item, index) => {
    drawChecklistRow(item, 402, 264, 666, rightStructureRows[index], rightStructureRows[index + 1]);
  });
  drawSectionBand(64, 730, 338, 21.1, 'SCAFFOLD STRUCTURES');
  structureItems.slice(-3).forEach((item, index) => {
    drawChecklistRow(item, 64, 258, 322, leftStructureRows[index], leftStructureRows[index + 1]);
  });
  page1.push(border, `${Math.max(0.55, pageOneCanvas.scale)} w`, pageOneCanvas.strokeRect(64, 417.5, 682, 434.5));
  page1.push(`${Math.max(0.45, pageOneCanvas.scale * 0.75)} w`);

  drawSectionBand(64, 852, 682, 21.5, 'CORRECTIVE ACTIONS');
  const actionHeaderTop = 873.5;
  const actionHeaderBottom = 893.8;
  const actionColumns = [64, 402, 666, 746];
  const actionHeaders = ['Action Required', 'Completed by', 'Date'];
  actionHeaders.forEach((label, index) => {
    page1.push(greyFill, pageOneCanvas.fillRect(actionColumns[index], actionHeaderTop, actionColumns[index + 1] - actionColumns[index], actionHeaderBottom - actionHeaderTop));
    page1.push(innerBorder, pageOneCanvas.strokeRect(actionColumns[index], actionHeaderTop, actionColumns[index + 1] - actionColumns[index], actionHeaderBottom - actionHeaderTop));
    page1.push(dark, pageOneCanvas.text(actionColumns[index] + 4, 887.2, 8.6, label, 'F2'));
  });
  const actionRows = [893.8, 915.4, 937.4, 959.5, 981.1];
  actionRows.slice(0, 4).forEach((top, rowIndex) => {
    const bottom = actionRows[rowIndex + 1];
    const row = form.correctiveActions[rowIndex] ?? {actionRequired: '', completedBy: '', date: ''};
    const values = [row.actionRequired, row.completedBy, row.date];
    values.forEach((value, columnIndex) => {
      page1.push('1 1 1 rg', pageOneCanvas.fillRect(actionColumns[columnIndex], top, actionColumns[columnIndex + 1] - actionColumns[columnIndex], bottom - top));
      page1.push(innerBorder, pageOneCanvas.strokeRect(actionColumns[columnIndex], top, actionColumns[columnIndex + 1] - actionColumns[columnIndex], bottom - top));
      page1.push(dark, pageOneCanvas.text(actionColumns[columnIndex] + 4, top + 14, 7.8, truncate(value, columnIndex === 0 ? 64 : 28)));
    });
  });
  page1.push(border, pageOneCanvas.strokeRect(64, 852, 682, 129.1));

  const disclaimer = 'The above scaffolding has been erected in accordance with AS 1576 parts 1-6 and the model WHS Regulations and model Code of Practice: Managing Risks for Scaffolds; be informed by relevant technical standards; has been erected having regard to SWMS for this project and is suitable for its intended service. PLANT REGISTRATION NUMBER: PFS 65-60781/04';
  wrapText(disclaimer, 148, 3).forEach((textLine, index) => {
    page1.push(dark, pageOneCanvas.text(68, 1003 + index * 8.5, 6.8, textLine));
  });

  const photoCells = [
    {left: 65.5, top: 184.3, width: 225.8, height: 223.5},
    {left: 291.8, top: 184.3, width: 225.7, height: 223.5},
    {left: 518, top: 184.3, width: 225.8, height: 223.5},
    {left: 65.5, top: 408.3, width: 225.8, height: 223.5},
    {left: 291.8, top: 408.3, width: 225.7, height: 223.5},
    {left: 518, top: 408.3, width: 225.8, height: 223.5},
  ];
  page2.push(orangeFill, pageTwoCanvas.fillRect(65, 159.5, 679, 24.8));
  page2.push(border, pageTwoCanvas.strokeRect(65, 159.5, 679, 24.8));
  page2.push(dark, pageTwoCanvas.centeredText(65, 176.1, 679, 10, 'PHOTOS', 'F2'));
  photoCells.forEach((cell, slot) => {
    page2.push(paleFill, pageTwoCanvas.fillRect(cell.left, cell.top, cell.width, cell.height));
    const photoImage = photoImageBySlot.get(slot);
    if (photoImage) {
      page2.push(pageTwoCanvas.imageCover(photoImage, cell.left + 0.6, cell.top + 0.6, cell.width - 1.2, cell.height - 1.2));
    }
    page2.push(innerBorder, pageTwoCanvas.strokeRect(cell.left, cell.top, cell.width, cell.height));
  });
  page2.push(border, `${Math.max(0.55, pageTwoCanvas.scale)} w`, pageTwoCanvas.strokeRect(65, 159.5, 679, 472.3));
  page2.push(`${Math.max(0.45, pageTwoCanvas.scale * 0.75)} w`);

  page2.push(commentsFill, pageTwoCanvas.fillRect(65, 653.5, 680, 23));
  page2.push(border, pageTwoCanvas.strokeRect(65, 653.5, 680, 23));
  page2.push(dark, pageTwoCanvas.text(70, 669, 9.2, 'Comments / Alterations / Details', 'F2'));
  page2.push('1 1 1 rg', pageTwoCanvas.fillRect(65, 676.5, 680, 189.5));
  page2.push(innerBorder, pageTwoCanvas.strokeRect(65, 676.5, 680, 189.5));
  wrapText(form.comments, 135, 13).forEach((textLine, index) => {
    page2.push(dark, pageTwoCanvas.text(71, 692 + index * 12, 8.6, textLine));
  });

  page2.push(dark);
  const representativeLabel = companyRepresentativeLabel(company.id).toUpperCase();
  page2.push(pageTwoCanvas.rightText(190, 898, 8.8, `${representativeLabel} NAME:`, 'F2'));
  page2.push(pageTwoCanvas.text(222, 898, 8.8, truncate(form.essRepresentativeName, 34)));
  page2.push(innerBorder, pageTwoCanvas.line(216, 904, 414, 904));
  page2.push(pageTwoCanvas.rightText(509, 900, 8.8, 'CLIENT NAME:', 'F2'));
  page2.push(pageTwoCanvas.text(528, 900, 8.8, truncate(form.clientName, 31)));
  page2.push(innerBorder, pageTwoCanvas.line(522, 906, 707, 906));
  page2.push(dark, pageTwoCanvas.rightText(215, 940, 8.8, `${representativeLabel} SIGNATURE:`, 'F2'));
  page2.push(pageTwoCanvas.rightText(510, 940, 8.8, 'CLIENT SIGNATURE:', 'F2'));
  page2.push(innerBorder, pageTwoCanvas.strokeRect(245, 923, 169, 52));
  page2.push(pageTwoCanvas.strokeRect(523, 921, 186.5, 52));
  page2.push(...pageTwoCanvas.signature(249, 927, 161, 44, form.essRepresentativeSignatureStrokes));
  page2.push(...pageTwoCanvas.signature(527, 925, 178.5, 44, form.clientSignatureStrokes));

  type PdfPart = string;
  const encoder = new TextEncoder();
  const encodedLength = (part: PdfPart) => encoder.encode(part).length;
  const pageStreams = [page1.join('\n'), page2.join('\n')];
  const pageObjectNumbers = pageStreams.map((_, index) => 3 + index * 2);
  const streamObjectNumbers = pageStreams.map((_, index) => 4 + index * 2);
  let nextObjectNumber = 3 + pageStreams.length * 2;
  const imageObjectNumbers = new Map<string, number>();
  imageResources.forEach(image => {
    imageObjectNumbers.set(image.name, nextObjectNumber);
    nextObjectNumber += 1;
  });
  const font1ObjectNumber = nextObjectNumber;
  const font2ObjectNumber = nextObjectNumber + 1;
  const objectCount = font2ObjectNumber;
  const objects: PdfPart[][] = Array.from({length: objectCount + 1}, () => []);
  const setObject = (objectNumber: number, parts: PdfPart[]) => {
    objects[objectNumber] = parts;
  };
  const imageResourcesPdf = imageResources.length > 0
    ? `/XObject << ${imageResources
        .map(image => `/${image.name} ${imageObjectNumbers.get(image.name)} 0 R`)
        .join(' ')} >>`
    : '';

  setObject(1, ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n']);
  setObject(
    2,
    [`2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map(num => `${num} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>\nendobj\n`],
  );
  pageStreams.forEach((stream, index) => {
    const pageObjectNumber = pageObjectNumbers[index];
    const streamObjectNumber = streamObjectNumbers[index];
    const streamLength = encoder.encode(stream).length;
    setObject(pageObjectNumber, [
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${streamObjectNumber} 0 R /Resources << /Font << /F1 ${font1ObjectNumber} 0 R /F2 ${font2ObjectNumber} 0 R >> ${imageResourcesPdf} >> >>\nendobj\n`,
    ]);
    setObject(streamObjectNumber, [
      `${streamObjectNumber} 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    ]);
  });
  imageResources.forEach(image => {
    const objectNumber = imageObjectNumbers.get(image.name);
    if (!objectNumber) {
      return;
    }
    const imageStream = bytesToHex(image.bytes);
    setObject(objectNumber, [
      `${objectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${encodedLength(imageStream)} >>\nstream\n${imageStream}\nendstream\nendobj\n`,
    ]);
  });
  setObject(font1ObjectNumber, [`${font1ObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`]);
  setObject(font2ObjectNumber, [`${font2ObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`]);

  const parts: PdfPart[] = ['%PDF-1.4\n'];
  const offsets: number[] = [0];
  let byteOffset = encodedLength(parts[0]);
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    offsets[objectNumber] = byteOffset;
    const objectParts = objects[objectNumber];
    objectParts.forEach(part => {
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

async function allocateInspectionNumberViaRpc(builderId: string, projectId: string): Promise<string> {
  const response = await api.fetchSupabase(rpcUrl('allocate_handover_inspection_number'), {
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
      throw new Error('HANDOVER_COUNTER_RPC_MISSING');
    }
    throw new Error(body || 'Could not allocate handover inspection number.');
  }

  try {
    const parsed = JSON.parse(body) as string | {allocate_handover_inspection_number?: string};
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (typeof parsed?.allocate_handover_inspection_number === 'string') {
      return parsed.allocate_handover_inspection_number;
    }
  } catch {
    // Some PostgREST setups return plain text JSON scalars; handled below.
  }

  const trimmed = body.replace(/^"+|"+$/g, '').trim();
  if (!trimmed) {
    throw new Error('No inspection number returned from Supabase RPC.');
  }
  return trimmed;
}

async function previewInspectionNumberViaRpc(builderId: string, projectId: string): Promise<string> {
  const response = await api.fetchSupabase(rpcUrl('preview_handover_inspection_number'), {
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
      throw new Error('HANDOVER_PREVIEW_RPC_MISSING');
    }
    throw new Error(body || 'Could not preview handover inspection number.');
  }

  try {
    const parsed = JSON.parse(body) as string | {preview_handover_inspection_number?: string};
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (typeof parsed?.preview_handover_inspection_number === 'string') {
      return parsed.preview_handover_inspection_number;
    }
  } catch {
    // Some PostgREST setups return plain text JSON scalars; handled below.
  }

  const trimmed = body.replace(/^"+|"+$/g, '').trim();
  if (!trimmed) {
    throw new Error('No inspection number preview returned from Supabase RPC.');
  }
  return trimmed;
}

export async function listHandoverCertificateForms(
  builderId: string,
  projectId: string,
): Promise<HandoverCertificateListItem[]> {
  const forms = await listSafetyForms<HandoverCertificateForm>(
    'handover-certificates',
    builderId,
    projectId,
  );
  return forms.map(form => ({
    id: form.id,
    companyEntityId: normalizeCompanyEntityId(form.companyEntityId),
    formReferenceName: form.formReferenceName ?? '',
    scaffoldRegisterId: form.scaffoldRegisterId ?? '',
    inspectionNumber: form.inspectionNumber ?? '',
    sectionLocation: form.sectionLocation ?? '',
    drawingNumber: form.drawingNumber ?? '',
    drawingDocumentId: form.drawingDocumentId ?? '',
    drawingDocumentType: form.drawingDocumentType ?? '',
    drawingDocumentName: form.drawingDocumentName ?? '',
    drawingRevisionNumber: form.drawingRevisionNumber ?? '',
    drawingFolderId: form.drawingFolderId ?? '',
    scaffTagId: form.scaffTagId ?? '',
    scaffTagFormId: form.scaffTagFormId ?? '',
    essRepresentativeName: form.essRepresentativeName ?? '',
    projectNumberClient: form.projectNumberClient ?? '',
    inspectionDateTime: form.inspectionDateTime ?? '',
    updatedAt: form.updatedAt ?? nowIso(),
  }));
}

export async function previewNextHandoverInspectionNumber(
  builderId: string,
  projectId: string,
): Promise<string> {
  return previewInspectionNumberViaRpc(builderId, projectId);
}

export async function getHandoverCertificateForm(
  builderId: string,
  projectId: string,
  formId: string,
): Promise<HandoverCertificateForm | null> {
  const raw = await getSafetyForm<HandoverCertificateForm>(
    'handover-certificates',
    builderId,
    projectId,
    formId,
  );
  if (!raw) {
    return null;
  }

  const checklist = typeof raw.checklist === 'object' && raw.checklist ? raw.checklist : {};
  const photoSlots = Array.isArray(raw.photoSlots)
    ? raw.photoSlots
        .map(item => ({
          slot: typeof item?.slot === 'number' ? item.slot : -1,
          path: typeof item?.path === 'string' ? item.path : '',
        }))
        .filter(item => item.slot >= 0 && item.path)
    : [];

  return {
    ...raw,
    companyEntityId: normalizeCompanyEntityId(raw.companyEntityId),
    inspectionNumber: raw.inspectionNumber ?? '',
    formReferenceName: raw.formReferenceName ?? '',
    scaffoldRegisterId: raw.scaffoldRegisterId ?? '',
    inspectionDateTime: raw.inspectionDateTime ?? '',
    projectNumberClient: raw.projectNumberClient ?? '',
    sectionLocation: raw.sectionLocation ?? '',
    intendedUse: raw.intendedUse ?? '',
    drawingNumber: raw.drawingNumber ?? '',
    scaffTagId: raw.scaffTagId ?? '',
    scaffTagFormId: raw.scaffTagFormId ?? '',
    drawingDocumentId: raw.drawingDocumentId ?? '',
    drawingDocumentType: raw.drawingDocumentType === 'ess' || raw.drawingDocumentType === 'thirdparty' ? raw.drawingDocumentType : '',
    drawingDocumentName: raw.drawingDocumentName ?? '',
    drawingRevisionNumber: raw.drawingRevisionNumber ?? '',
    drawingFolderId: raw.drawingFolderId ?? '',
    scaffoldLength: raw.scaffoldLength ?? '',
    scaffoldIdNo: raw.scaffoldIdNo ?? '',
    baysLong: raw.baysLong ?? '',
    scaffoldHeight: raw.scaffoldHeight ?? '',
    workingDecks: raw.workingDecks ?? '',
    accessType: raw.accessType ?? '',
    scaffoldDuty: raw.scaffoldDuty ?? '',
    checklist: Object.entries(checklist).reduce<Record<string, HandoverChecklistStatus>>((acc, [key, value]) => {
      acc[key] = value === 'YES' || value === 'NO' || value === 'NA' ? value : '';
      return acc;
    }, {}),
    correctiveActions: Array.isArray(raw.correctiveActions)
      ? raw.correctiveActions.slice(0, 4).map(row => ({
          actionRequired: row?.actionRequired ?? '',
          completedBy: row?.completedBy ?? '',
          date: row?.date ?? '',
        }))
      : [],
    photoSlots,
    comments: raw.comments ?? '',
    essRepresentativeName: raw.essRepresentativeName ?? '',
    essRepresentativeSignature: raw.essRepresentativeSignature ?? '',
    essRepresentativeSignatureStrokes: normalizeSignatureStrokes(raw.essRepresentativeSignatureStrokes),
    clientName: raw.clientName ?? '',
    clientSignature: raw.clientSignature ?? '',
    clientSignatureStrokes: normalizeSignatureStrokes(raw.clientSignatureStrokes),
    hrwLicenceNumber: raw.hrwLicenceNumber ?? '',
    pdfPath: raw.pdfPath ?? pdfObjectPath(builderId, projectId, formId),
    createdAt: raw.createdAt ?? nowIso(),
    updatedAt: raw.updatedAt ?? nowIso(),
  };
}

export async function uploadHandoverCertificatePhoto(
  builderId: string,
  projectId: string,
  formId: string,
  slot: number,
  uri: string,
  fileName: string,
): Promise<string> {
  const path = photoObjectPath(builderId, projectId, formId, slot, fileName);
  const blob = await uriToBlob(uri);
  await uploadObject(path, blob, 'image/jpeg');
  return path;
}

export async function getHandoverCertificatePhotoUrl(path: string): Promise<string> {
  return signedPathUrl(path);
}

export async function getHandoverCertificatePdfUrl(
  form:
    | Pick<HandoverCertificateForm, 'pdfPath'>
    | {builderId: string; projectId: string; formId: string},
): Promise<string> {
  if ('pdfPath' in form) {
    return signedPathUrl(form.pdfPath, 60 * 60 * 24 * 14);
  }
  const saved = await getHandoverCertificateForm(form.builderId, form.projectId, form.formId);
  return signedPathUrl(saved?.pdfPath || pdfObjectPath(form.builderId, form.projectId, form.formId), 60 * 60 * 24 * 14);
}

export async function saveHandoverCertificateForm(
  form: Omit<HandoverCertificateForm, 'id' | 'createdAt' | 'updatedAt' | 'pdfPath'> & {
    id?: string;
    createdAt?: string;
    pdfBlob?: Blob | string;
  },
): Promise<HandoverCertificateForm> {
  const {pdfBlob, ...input} = form;
  const formId = form.id ?? id();
  const createdAt = form.createdAt ?? nowIso();
  const updatedAt = nowIso();
  const existing = form.id ? await getHandoverCertificateForm(form.builderId, form.projectId, formId) : null;
  const pdfPath = existing?.pdfPath ?? pdfObjectPath(form.builderId, form.projectId, formId);
  // A number shown while composing is only a preview. Supabase assigns the
  // authoritative global number on the first save; subsequent edits retain it.
  let inspectionNumber = existing?.inspectionNumber?.trim() ?? '';
  if (!inspectionNumber) {
    inspectionNumber = await allocateInspectionNumberViaRpc(form.builderId, form.projectId);
  }

  const nextForm: HandoverCertificateForm = {
    ...input,
    id: formId,
    inspectionNumber,
    // Inspection date/time represents the latest completed inspection. Every
    // successful save refreshes it before the PDF and list record are rebuilt.
    inspectionDateTime: nowInspectionDateTime(),
    correctiveActions: (form.correctiveActions ?? []).slice(0, 4),
    photoSlots: [...(form.photoSlots ?? [])].sort((a, b) => a.slot - b.slot),
    pdfPath,
    createdAt,
    updatedAt,
  };

  const nextPdfBody = pdfBlob ?? await buildHandoverCertificatePdfBody(nextForm);
  await uploadObject(
    pdfPath,
    nextPdfBody,
    'application/pdf',
  );
  await upsertSafetyForm(
    'handover-certificates',
    form.builderId,
    form.projectId,
    nextForm,
    {
      title: nextForm.formReferenceName,
      referenceNumber: nextForm.inspectionNumber,
      requestedBy: nextForm.essRepresentativeName,
      projectLabel: nextForm.projectNumberClient,
      eventDate: nextForm.inspectionDateTime,
      pdfPath,
      photoPaths: nextForm.photoSlots.map(item => item.path),
    },
  );
  return nextForm;
}

/**
 * Updates only the Scaff-Tag relationship on an existing Handover. This keeps
 * the original inspection timestamp/number intact while ensuring its stored
 * PDF reflects a link made from the Scaff-Tag workflow.
 */
export async function setHandoverCertificateScaffTagLink(
  builderId: string,
  projectId: string,
  formId: string,
  scaffTagFormId: string,
  scaffTagId: string,
): Promise<HandoverCertificateForm> {
  const existing = await getHandoverCertificateForm(builderId, projectId, formId);
  if (!existing) {
    throw new Error('The linked Handover Certificate could not be found.');
  }

  const nextForm: HandoverCertificateForm = {
    ...existing,
    scaffTagFormId,
    scaffTagId,
    updatedAt: nowIso(),
  };
  const pdfPath = nextForm.pdfPath || pdfObjectPath(builderId, projectId, formId);
  nextForm.pdfPath = pdfPath;

  await uploadObject(pdfPath, await buildHandoverCertificatePdfBody(nextForm), 'application/pdf');
  await upsertSafetyForm(
    'handover-certificates',
    builderId,
    projectId,
    nextForm,
    {
      title: nextForm.formReferenceName,
      referenceNumber: nextForm.inspectionNumber,
      requestedBy: nextForm.essRepresentativeName,
      projectLabel: nextForm.projectNumberClient,
      eventDate: nextForm.inspectionDateTime,
      pdfPath,
      photoPaths: nextForm.photoSlots.map(item => item.path),
    },
  );
  return nextForm;
}

export async function setHandoverCertificateDrawingLink(
  builderId: string,
  projectId: string,
  formId: string,
  drawing: {
    drawingNumber: string;
    drawingDocumentId: string;
    drawingDocumentType: 'ess' | 'thirdparty';
    drawingDocumentName: string;
    drawingRevisionNumber: string;
    drawingFolderId: string;
    scaffoldRegisterId?: string;
  },
): Promise<HandoverCertificateForm> {
  const existing = await getHandoverCertificateForm(builderId, projectId, formId);
  if (!existing) {
    throw new Error('The linked Handover Certificate could not be found.');
  }

  const {scaffoldRegisterId, ...drawingFields} = drawing;
  const nextForm: HandoverCertificateForm = {
    ...existing,
    ...drawingFields,
    scaffoldRegisterId: scaffoldRegisterId || existing.scaffoldRegisterId,
    updatedAt: nowIso(),
  };
  const pdfPath = nextForm.pdfPath || pdfObjectPath(builderId, projectId, formId);
  nextForm.pdfPath = pdfPath;

  await uploadObject(pdfPath, await buildHandoverCertificatePdfBody(nextForm), 'application/pdf');
  await upsertSafetyForm(
    'handover-certificates',
    builderId,
    projectId,
    nextForm,
    {
      title: nextForm.formReferenceName,
      referenceNumber: nextForm.inspectionNumber,
      requestedBy: nextForm.essRepresentativeName,
      projectLabel: nextForm.projectNumberClient,
      eventDate: nextForm.inspectionDateTime,
      pdfPath,
      photoPaths: nextForm.photoSlots.map(item => item.path),
    },
  );
  return nextForm;
}

export async function setHandoverCertificateScaffoldRecord(
  builderId: string,
  projectId: string,
  formId: string,
  scaffoldName: string,
  scaffoldRegisterId: string,
): Promise<HandoverCertificateForm> {
  const existing = await getHandoverCertificateForm(builderId, projectId, formId);
  if (!existing) {
    throw new Error('The linked Handover Certificate could not be found.');
  }

  const nextForm: HandoverCertificateForm = {
    ...existing,
    formReferenceName: scaffoldName.trim() || existing.formReferenceName,
    scaffoldRegisterId: scaffoldRegisterId || existing.scaffoldRegisterId,
    updatedAt: nowIso(),
  };
  const pdfPath = nextForm.pdfPath || pdfObjectPath(builderId, projectId, formId);
  nextForm.pdfPath = pdfPath;

  await uploadObject(pdfPath, await buildHandoverCertificatePdfBody(nextForm), 'application/pdf');
  await upsertSafetyForm(
    'handover-certificates',
    builderId,
    projectId,
    nextForm,
    {
      title: nextForm.formReferenceName,
      referenceNumber: nextForm.inspectionNumber,
      requestedBy: nextForm.essRepresentativeName,
      projectLabel: nextForm.projectNumberClient,
      eventDate: nextForm.inspectionDateTime,
      pdfPath,
      photoPaths: nextForm.photoSlots.map(item => item.path),
    },
  );
  return nextForm;
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

export async function deleteHandoverCertificateForm(
  builderId: string,
  projectId: string,
  formId: string,
): Promise<void> {
  const existing = await getHandoverCertificateForm(builderId, projectId, formId);
  await deleteSafetyFormRecord('handover-certificates', builderId, projectId, formId);

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
