// Derived from ESSApp/src/services/supabasePreStarts.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import api from './apiService';
import { AppConstants } from '../utils/constants';
import { PreStartForm } from '../models/preStart';
import { buildPreStartPdf, PreStartPdfImage } from './preStartPdfRenderer';
import {
  getCompanyEntity,
  getCompanyLogoJpegBase64,
} from '../config/companyEntities';
import { PDF_LOGO_JPEG_BASE64 } from './supabaseHandoverCertificates';
import {
  deleteSafetyFormRecord,
  getSafetyForm,
  listSafetyForms,
  upsertSafetyForm,
} from './supabaseSafetyRecords';

function headers(contentType?: string): Record<string, string> {
  if (!api.authToken) {
    throw new Error('Please sign in again before accessing pre-start forms.');
  }
  return {
    apikey: AppConstants.supabaseAnonKey,
    Authorization: `Bearer ${api.authToken}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}
const objectUrl = (path: string) =>
  `${AppConstants.supabaseUrl}/storage/v1/object/${AppConstants.safetyProjectsBucket}/${path}`;
async function upload(path: string, body: Blob | string, type: string) {
  const response = await api.fetchSupabase(objectUrl(path), {
    method: 'POST',
    headers: { ...headers(type), 'x-upsert': 'true' },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `Could not upload pre-start file: ${await response.text()}`,
    );
  }
}
export async function getPreStartFileUrl(path: string): Promise<string> {
  const response = await api.fetchSupabase(
    `${AppConstants.supabaseUrl}/storage/v1/object/sign/${AppConstants.safetyProjectsBucket}/${path}`,
    {
      method: 'POST',
      headers: headers('application/json'),
      body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 14 }),
    },
  );
  if (!response.ok) {
    throw new Error('Could not open the saved pre-start file.');
  }
  const result = await response.json();
  const url = result.signedURL || result.signedUrl;
  if (!url) {
    throw new Error('No signed pre-start file URL was returned.');
  }
  return /^https?:/.test(url)
    ? url
    : `${AppConstants.supabaseUrl}/storage/v1${url}`;
}
export const listPreStartForms = (builderId: string, projectId: string) =>
  listSafetyForms<PreStartForm>('pre-starts', builderId, projectId);
export const getPreStartForm = (
  builderId: string,
  projectId: string,
  id: string,
) => getSafetyForm<PreStartForm>('pre-starts', builderId, projectId, id);
export async function uploadPreStartPhoto(
  form: PreStartForm,
  slot: number,
  uri: string,
): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read the selected photo.');
  }
  const path = `site-data/${form.builderId}/${
    form.projectId
  }/pre-starts/photos/${form.id}/${slot}-${Date.now()}.jpg`;
  await upload(path, await response.blob(), 'image/jpeg');
  return path;
}
function base64ToBytes(value: string): Uint8Array {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
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

function parseJpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
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
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
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

export async function buildPreStartPdfBody(
  form: PreStartForm,
): Promise<string> {
  const logoBytes = base64ToBytes(
    await getCompanyLogoJpegBase64(form.companyEntityId, PDF_LOGO_JPEG_BASE64),
  );
  const logoSize = parseJpegDimensions(logoBytes);
  if (!logoSize) {
    throw new Error('Could not load the company logo.');
  }
  const images: PreStartPdfImage[] = [
    { name: 'Logo', bytes: logoBytes, ...logoSize },
  ];
  for (const photo of form.photoSlots) {
    const response = await fetch(await getPreStartFileUrl(photo.path));
    if (!response.ok) {
      throw new Error(
        `Could not load site photo ${
          photo.slot + 1
        } for the PDF. Please try again.`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = parseJpegDimensions(bytes);
    if (!size) {
      throw new Error(
        `Site photo ${
          photo.slot + 1
        } is not a supported JPEG. Please replace it.`,
      );
    }
    images.push({
      name: `Photo${photo.slot}`,
      bytes,
      ...size,
      slot: photo.slot,
    });
  }
  return buildPreStartPdf(form, getCompanyEntity(form.companyEntityId), images);
}
export async function previewNextPreStartNumber(
  builderId: string,
  projectId: string,
): Promise<string> {
  const response = await api.fetchSupabase(
    `${AppConstants.supabaseUrl}/rest/v1/rpc/preview_pre_start_number`,
    {
      method: 'POST',
      headers: headers('application/json'),
      body: JSON.stringify({
        p_builder_id: builderId,
        p_project_id: projectId,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Could not preview the pre-start number: ${await response.text()}`,
    );
  }
  const value = await response.json();
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('No pre-start number preview was returned.');
  }
  return value;
}

export async function savePreStartForm(
  form: PreStartForm,
): Promise<PreStartForm> {
  const existing = await getPreStartForm(
    form.builderId,
    form.projectId,
    form.id,
  );
  let preStartNumber = existing?.preStartNumber?.trim() || ''; // Only saved records own a number.
  if (!preStartNumber) {
    const response = await api.fetchSupabase(
      `${AppConstants.supabaseUrl}/rest/v1/rpc/allocate_pre_start_number`,
      {
        method: 'POST',
        headers: headers('application/json'),
        body: JSON.stringify({
          p_builder_id: form.builderId,
          p_project_id: form.projectId,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Could not allocate pre-start number: ${await response.text()}`,
      );
    }
    preStartNumber = String(await response.json());
  }
  // A distinct PDF per revision avoids stale previews and preserves already-shared links.
  const now = new Date().toISOString();
  const pdfPath = `site-data/${form.builderId}/${
    form.projectId
  }/pre-starts/pdf/${form.id}-${Date.now()}.pdf`;
  const saved = {
    ...form,
    preStartNumber,
    pdfPath,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await upload(pdfPath, await buildPreStartPdfBody(saved), 'application/pdf');
  try {
    await upsertSafetyForm(
      'pre-starts',
      saved.builderId,
      saved.projectId,
      saved,
      {
        title: saved.subject,
        referenceNumber: saved.preStartNumber,
        requestedBy: saved.representativeName,
        projectLabel: saved.clientProjectName,
        eventDate: saved.date,
        pdfPath,
        photoPaths: saved.photoSlots.map(photo => photo.path),
      },
    );
  } catch (error) {
    await api
      .fetchSupabase(objectUrl(pdfPath), {
        method: 'DELETE',
        headers: headers(),
      })
      .catch(() => {});
    throw error;
  }
  return saved;
}
export async function deletePreStartForm(
  builderId: string,
  projectId: string,
  id: string,
): Promise<void> {
  const form = await getPreStartForm(builderId, projectId, id);
  await deleteSafetyFormRecord('pre-starts', builderId, projectId, id);
  // The shared archive trigger retains the payload; remove the current PDF and photos as other forms do.
  await Promise.all(
    [form?.pdfPath, ...(form?.photoSlots || []).map(photo => photo.path)]
      .filter(Boolean)
      .map(path =>
        api
          .fetchSupabase(objectUrl(path!), {
            method: 'DELETE',
            headers: headers(),
          })
          .catch(() => {}),
      ),
  );
}
