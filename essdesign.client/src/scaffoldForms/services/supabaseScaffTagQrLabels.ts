// Derived from ESSApp/src/services/supabaseScaffTagQrLabels.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import AsyncStorage from '../browser/storage';
import {AppConstants} from '../utils/constants';
import api from './apiService';
import {CompanyEntityId, normalizeCompanyEntityId} from '../config/companyEntities';

export {extractScaffTagQrLabelToken} from '../utils/scaffTagQrLabelToken';

const ACCESS_TOKEN_KEY = 'access_token';
const TABLE_NAME = 'ess_scaff_tag_qr_labels';

export type ScaffTagQrLabelStatus = 'unassigned' | 'assigned' | 'retired';

interface ScaffTagQrLabelRow {
  id: string;
  label_number: number | string;
  public_token: string;
  short_code?: string | null;
  company_entity_id: string;
  status: ScaffTagQrLabelStatus;
  assigned_builder_id?: string | null;
  assigned_project_id?: string | null;
  assigned_form_id?: string | null;
  assigned_at?: string | null;
  retired_at?: string | null;
  retired_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScaffTagQrLabel {
  id: string;
  labelNumber: number;
  displayNumber: string;
  publicToken: string;
  shortCode: string;
  companyEntityId: CompanyEntityId;
  status: ScaffTagQrLabelStatus;
  assignedBuilderId: string;
  assignedProjectId: string;
  assignedFormId: string;
  assignedAt: string;
  retiredAt: string;
  retiredReason: string;
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
}

function restUrl(path: string): string {
  return `${AppConstants.supabaseUrl}/rest/v1/${path}`;
}

async function headers(contentType = false): Promise<Record<string, string>> {
  const token = api.authToken ?? await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) {
    throw new Error('Your session has expired. Sign in again before linking a QR label.');
  }
  return {
    apikey: AppConstants.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    ...(contentType ? {'Content-Type': 'application/json'} : {}),
  };
}

function publicUrl(token: string): string {
  const base = AppConstants.scaffTagQrRedirectBaseUrl.replace(/\/$/, '');
  return `${base}/q/${encodeURIComponent(token)}`;
}

function mapLabel(row: ScaffTagQrLabelRow): ScaffTagQrLabel {
  const labelNumber = Number(row.label_number);
  const labelCode = row.short_code || row.public_token;
  return {
    id: row.id,
    labelNumber,
    displayNumber: `ST-${String(labelNumber).padStart(5, '0')}`,
    publicToken: row.public_token,
    shortCode: row.short_code ?? '',
    companyEntityId: normalizeCompanyEntityId(row.company_entity_id),
    status: row.status,
    assignedBuilderId: row.assigned_builder_id ?? '',
    assignedProjectId: row.assigned_project_id ?? '',
    assignedFormId: row.assigned_form_id ?? '',
    assignedAt: row.assigned_at ?? '',
    retiredAt: row.retired_at ?? '',
    retiredReason: row.retired_reason ?? '',
    publicUrl: publicUrl(labelCode),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function rpc(name: string, body: Record<string, unknown>): Promise<ScaffTagQrLabel> {
  const response = await api.fetchSupabase(restUrl(`rpc/${name}`), {
    method: 'POST',
    headers: await headers(true),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Could not update the QR label.');
  }
  return mapLabel(await response.json() as ScaffTagQrLabelRow);
}

export async function getAssignedScaffTagQrLabel(
  builderId: string,
  projectId: string,
  formId: string,
): Promise<ScaffTagQrLabel | null> {
  const query =
    `${TABLE_NAME}?select=*&status=eq.assigned` +
    `&assigned_builder_id=eq.${encodeURIComponent(builderId)}` +
    `&assigned_project_id=eq.${encodeURIComponent(projectId)}` +
    `&assigned_form_id=eq.${encodeURIComponent(formId)}` +
    '&limit=1';
  const response = await api.fetchSupabase(restUrl(query), {
    method: 'GET',
    headers: {...await headers(), 'Cache-Control': 'no-store'},
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Could not check the assigned QR label.');
  }
  const rows = await response.json() as ScaffTagQrLabelRow[];
  return rows[0] ? mapLabel(rows[0]) : null;
}

export async function listAssignedScaffTagQrLabels(
  builderId: string,
  projectId: string,
): Promise<ScaffTagQrLabel[]> {
  const query =
    `${TABLE_NAME}?select=*&status=in.(assigned,retired)` +
    `&assigned_builder_id=eq.${encodeURIComponent(builderId)}` +
    `&assigned_project_id=eq.${encodeURIComponent(projectId)}` +
    '&order=updated_at.desc';
  const response = await api.fetchSupabase(restUrl(query), {
    method: 'GET',
    headers: {...await headers(), 'Cache-Control': 'no-store'},
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Could not load linked QR labels.');
  }
  return (await response.json() as ScaffTagQrLabelRow[]).map(mapLabel);
}

export async function assignScaffTagQrLabel(
  labelCode: string,
  builderId: string,
  projectId: string,
  formId: string,
  reassign = false,
): Promise<ScaffTagQrLabel> {
  const isLegacyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(labelCode);
  return rpc(isLegacyUuid ? 'assign_scaff_tag_qr_label' : 'assign_scaff_tag_qr_label_by_code', {
    [isLegacyUuid ? 'p_public_token' : 'p_short_code']: labelCode,
    p_builder_id: builderId,
    p_project_id: projectId,
    p_form_id: formId,
    p_retire_existing: reassign,
  });
}
