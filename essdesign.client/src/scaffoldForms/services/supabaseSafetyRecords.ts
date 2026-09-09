// Derived from ESSApp/src/services/supabaseSafetyRecords.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import AsyncStorage from '../browser/storage';
import {AppConstants} from '../utils/constants';
import api from './apiService';

export type SafetyFormType =
  | 'scaff-tags'
  | 'handover-certificates'
  | 'day-labour-variations'
  | 'scaffold-register';

export interface SafetyFormMetadata {
  title: string;
  referenceNumber: string;
  requestedBy: string;
  projectLabel: string;
  eventDate: string;
  pdfPath: string;
  sharePath?: string;
  photoPaths?: string[];
}

export interface SafetyFileRecord {
  name: string;
  path: string;
  kind: string;
  updatedAt: string;
  size: number | null;
}

interface SafetyFormRow {
  form_type: SafetyFormType;
  id: string;
  builder_id: string;
  project_id: string;
  title?: string;
  reference_number?: string;
  requested_by?: string;
  project_label?: string;
  event_date?: string;
  pdf_path?: string;
  share_path?: string;
  photo_paths?: string[];
  payload?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface SafetyFileRow {
  storage_path: string;
  module_kind: string;
  file_name: string;
  file_size?: number | null;
  created_at?: string;
  updated_at?: string;
}

const ACCESS_TOKEN_KEY = 'access_token';
const SAFETY_FORMS_TABLE = 'ess_safety_forms';
const SAFETY_FILES_TABLE = 'ess_safety_files';

function restUrl(table: string, query = ''): string {
  return `${AppConstants.supabaseUrl}/rest/v1/${table}${query}`;
}

async function authHeaders(contentType = false): Promise<Record<string, string>> {
  const token = api.authToken ?? await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) {
    throw new Error('Your session has expired. Sign in again before accessing Safety records.');
  }
  return {
    apikey: AppConstants.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    ...(contentType ? {'Content-Type': 'application/json'} : {}),
  };
}

async function freshReadHeaders(): Promise<Record<string, string>> {
  return {
    ...(await authHeaders()),
    'Cache-Control': 'no-cache, no-store',
    Pragma: 'no-cache',
  };
}

async function responseError(response: Response, action: string): Promise<Error> {
  const details = await response.text();
  const lower = details.toLowerCase();
  const relationalTables = [SAFETY_FORMS_TABLE, SAFETY_FILES_TABLE];
  const isMissingRelationalTable =
    lower.includes('pgrst205') ||
    relationalTables.some(table =>
      lower.includes(`relation "${table}" does not exist`) ||
      lower.includes(`relation "public.${table}" does not exist`) ||
      lower.includes(`could not find the table 'public.${table}'`) ||
      (response.status === 404 && lower.includes(table)),
    );

  if (isMissingRelationalTable) {
    return new Error(
      'The relational Safety migration is not installed. Run migration 040 in Supabase.',
    );
  }

  try {
    const parsed = JSON.parse(details) as {
      message?: string;
      details?: string;
      hint?: string;
    };
    const message = [parsed.message, parsed.details, parsed.hint]
      .filter(Boolean)
      .join(' ');
    if (message) {
      return new Error(message);
    }
  } catch {
    // Supabase can also return plain-text errors; preserve those below.
  }

  return new Error(details || `${action} failed (${response.status})`);
}

function mapSafetyForm<T extends object>(row: SafetyFormRow): T {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    ...payload,
    id: row.id,
    builderId: row.builder_id,
    projectId: row.project_id,
    title: row.title ?? '',
    referenceNumber: row.reference_number ?? '',
    requestedBy: row.requested_by ?? '',
    projectLabel: row.project_label ?? '',
    eventDate: row.event_date ?? '',
    pdfPath: row.pdf_path ?? '',
    sharePath: row.share_path ?? '',
    photoPaths: Array.isArray(row.photo_paths) ? row.photo_paths : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as unknown as T;
}

export async function listSafetyForms<T extends object>(
  formType: SafetyFormType,
  builderId: string,
  projectId: string,
): Promise<T[]> {
  const query =
    `?select=*&form_type=eq.${encodeURIComponent(formType)}` +
    `&builder_id=eq.${encodeURIComponent(builderId)}` +
    `&project_id=eq.${encodeURIComponent(projectId)}` +
    '&order=updated_at.desc';
  const response = await api.fetchSupabase(restUrl(SAFETY_FORMS_TABLE, query), {
    method: 'GET',
    headers: await freshReadHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, 'Loading Safety forms');
  }
  const rows = (await response.json()) as SafetyFormRow[];
  return rows.map(row => mapSafetyForm<T>(row));
}

export async function getSafetyForm<T extends object>(
  formType: SafetyFormType,
  builderId: string,
  projectId: string,
  formId: string,
): Promise<T | null> {
  const query =
    `?select=*&form_type=eq.${encodeURIComponent(formType)}` +
    `&id=eq.${encodeURIComponent(formId)}` +
    `&builder_id=eq.${encodeURIComponent(builderId)}` +
    `&project_id=eq.${encodeURIComponent(projectId)}` +
    '&limit=1';
  const response = await api.fetchSupabase(restUrl(SAFETY_FORMS_TABLE, query), {
    method: 'GET',
    headers: await freshReadHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, 'Loading the Safety form');
  }
  const rows = (await response.json()) as SafetyFormRow[];
  return rows[0] ? mapSafetyForm<T>(rows[0]) : null;
}

export async function upsertSafetyForm<T extends object>(
  formType: SafetyFormType,
  builderId: string,
  projectId: string,
  form: T & {id: string},
  metadata: SafetyFormMetadata,
): Promise<T> {
  const response = await api.fetchSupabase(
    restUrl(SAFETY_FORMS_TABLE, '?on_conflict=form_type%2Cid'),
    {
      method: 'POST',
      headers: {
        ...(await authHeaders(true)),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([{
        form_type: formType,
        id: form.id,
        builder_id: builderId,
        project_id: projectId,
        title: metadata.title,
        reference_number: metadata.referenceNumber,
        requested_by: metadata.requestedBy,
        project_label: metadata.projectLabel,
        event_date: metadata.eventDate,
        pdf_path: metadata.pdfPath,
        share_path: metadata.sharePath ?? '',
        photo_paths: metadata.photoPaths ?? [],
        payload: form,
        created_by_user_id: api.currentUser?.id ?? null,
        updated_at: new Date().toISOString(),
      }]),
    },
  );
  if (!response.ok) {
    throw await responseError(response, 'Saving the Safety form');
  }
  const rows = (await response.json()) as SafetyFormRow[];
  return rows[0] ? mapSafetyForm<T>(rows[0]) : form;
}

export async function deleteSafetyFormRecord(
  formType: SafetyFormType,
  builderId: string,
  projectId: string,
  formId: string,
): Promise<void> {
  const query =
    `?form_type=eq.${encodeURIComponent(formType)}` +
    `&id=eq.${encodeURIComponent(formId)}` +
    `&builder_id=eq.${encodeURIComponent(builderId)}` +
    `&project_id=eq.${encodeURIComponent(projectId)}`;
  const response = await api.fetchSupabase(restUrl(SAFETY_FORMS_TABLE, query), {
    method: 'DELETE',
    headers: {
      ...(await authHeaders()),
      Prefer: 'return=representation',
    },
  });
  if (!response.ok) {
    throw await responseError(response, 'Deleting the Safety form');
  }
}

export async function listSafetyFileRecords(
  builderId: string,
  projectId: string,
  kind: string,
): Promise<SafetyFileRecord[]> {
  const query =
    `?select=*&builder_id=eq.${encodeURIComponent(builderId)}` +
    `&project_id=eq.${encodeURIComponent(projectId)}` +
    `&module_kind=eq.${encodeURIComponent(kind)}` +
    '&order=updated_at.desc';
  const response = await api.fetchSupabase(restUrl(SAFETY_FILES_TABLE, query), {
    method: 'GET',
    headers: await freshReadHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, 'Loading Safety files');
  }
  const rows = (await response.json()) as SafetyFileRow[];
  return rows.map(row => ({
    name: row.file_name,
    path: row.storage_path,
    kind: row.module_kind,
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    size: typeof row.file_size === 'number' ? row.file_size : null,
  }));
}

export async function upsertSafetyFileRecord(input: {
  builderId: string;
  projectId: string;
  kind: string;
  path: string;
  fileName: string;
  contentType: string;
  fileSize: number | null;
}): Promise<void> {
  const response = await api.fetchSupabase(
    restUrl(SAFETY_FILES_TABLE, '?on_conflict=storage_path'),
    {
      method: 'POST',
      headers: {
        ...(await authHeaders(true)),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{
        storage_path: input.path,
        builder_id: input.builderId,
        project_id: input.projectId,
        module_kind: input.kind,
        file_name: input.fileName,
        content_type: input.contentType,
        file_size: input.fileSize,
        uploaded_by_user_id: api.currentUser?.id ?? null,
        updated_at: new Date().toISOString(),
      }]),
    },
  );
  if (!response.ok) {
    throw await responseError(response, 'Saving Safety file metadata');
  }
}
