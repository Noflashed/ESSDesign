// Derived from ESSApp/src/services/supabaseScaffoldRegister.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {deleteSafetyFormRecord, listSafetyForms, upsertSafetyForm} from './supabaseSafetyRecords';
import {deleteHandoverCertificateForm, listHandoverCertificateForms} from './supabaseHandoverCertificates';
import {ScaffoldLifecycleStatus} from '../utils/scaffoldLifecycle';

export interface ScaffoldRegisterRecord {
  id: string;
  builderId: string;
  builderName: string;
  projectId: string;
  projectName: string;
  scaffoldName: string;
  location: string;
  drawingNumber: string;
  drawingDocumentId: string;
  drawingDocumentType: 'ess' | 'thirdparty' | '';
  drawingDocumentName: string;
  drawingRevisionNumber: string;
  drawingFolderId: string;
  status: ScaffoldLifecycleStatus;
  activatedAt: string;
  dismantledAt: string;
  createdAt: string;
  updatedAt: string;
}

function createId(): string {
  return `scaffold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listScaffoldRegisterRecords(
  builderId: string,
  projectId: string,
): Promise<ScaffoldRegisterRecord[]> {
  const records = await listSafetyForms<ScaffoldRegisterRecord>('scaffold-register', builderId, projectId);
  return records.map(record => ({
    ...record,
    scaffoldName: record.scaffoldName?.trim() || '',
    location: record.location?.trim() || '',
    drawingNumber: record.drawingNumber?.trim() || '',
    drawingDocumentId: record.drawingDocumentId?.trim() || '',
    drawingDocumentType:
      record.drawingDocumentType === 'ess' || record.drawingDocumentType === 'thirdparty'
        ? record.drawingDocumentType
        : '',
    drawingDocumentName: record.drawingDocumentName?.trim() || '',
    drawingRevisionNumber: record.drawingRevisionNumber?.trim() || '',
    drawingFolderId: record.drawingFolderId?.trim() || '',
    status:
      record.status === 'dismantled' || record.dismantledAt
        ? 'dismantled'
        : record.status === 'active' || record.activatedAt
          ? 'active'
          : 'awaiting-qr',
    activatedAt: record.activatedAt?.trim() || '',
    dismantledAt: record.dismantledAt?.trim() || '',
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
  }));
}

export async function createScaffoldRegisterRecord(input: {
  builderId: string;
  builderName: string;
  projectId: string;
  projectName: string;
  scaffoldName: string;
  location?: string;
}): Promise<ScaffoldRegisterRecord> {
  const now = new Date().toISOString();
  const record: ScaffoldRegisterRecord = {
    id: createId(),
    builderId: input.builderId,
    builderName: input.builderName,
    projectId: input.projectId,
    projectName: input.projectName,
    scaffoldName: input.scaffoldName.trim(),
    location: input.location?.trim() || input.projectName,
    drawingNumber: '',
    drawingDocumentId: '',
    drawingDocumentType: '',
    drawingDocumentName: '',
    drawingRevisionNumber: '',
    drawingFolderId: '',
    status: 'awaiting-qr',
    activatedAt: '',
    dismantledAt: '',
    createdAt: now,
    updatedAt: now,
  };
  return upsertSafetyForm('scaffold-register', input.builderId, input.projectId, record, {
    title: record.scaffoldName,
    referenceNumber: '',
    requestedBy: '',
    projectLabel: input.projectName,
    eventDate: now,
    pdfPath: '',
  });
}

async function saveScaffoldRegisterRecord(record: ScaffoldRegisterRecord): Promise<ScaffoldRegisterRecord> {
  return upsertSafetyForm('scaffold-register', record.builderId, record.projectId, record, {
    title: record.scaffoldName,
    referenceNumber: record.drawingNumber,
    requestedBy: '',
    projectLabel: record.projectName,
    eventDate: record.activatedAt || record.updatedAt,
    pdfPath: '',
  });
}

export async function activateScaffoldRegisterRecord(
  record: ScaffoldRegisterRecord,
  activatedAt = new Date().toISOString(),
): Promise<ScaffoldRegisterRecord> {
  if (record.status === 'dismantled') {
    return record;
  }
  const next: ScaffoldRegisterRecord = {
    ...record,
    status: 'active',
    activatedAt: record.activatedAt || activatedAt,
    dismantledAt: '',
    updatedAt: new Date().toISOString(),
  };
  return saveScaffoldRegisterRecord(next);
}

export async function activateScaffoldRegisterRecordById(
  builderId: string,
  projectId: string,
  recordId: string,
  activatedAt?: string,
): Promise<ScaffoldRegisterRecord | null> {
  const normalizedId = recordId.trim();
  if (!normalizedId) {
    return null;
  }
  const records = await listScaffoldRegisterRecords(builderId, projectId);
  const record = records.find(candidate => candidate.id === normalizedId);
  return record ? activateScaffoldRegisterRecord(record, activatedAt) : null;
}

export async function dismantleScaffoldRegisterRecord(
  record: ScaffoldRegisterRecord,
  dismantledAt = new Date().toISOString(),
  activatedAt?: string,
): Promise<ScaffoldRegisterRecord> {
  const start = record.activatedAt || activatedAt || '';
  if (!start) {
    throw new Error('Link a QR label before declaring this scaffold dismantled.');
  }
  if (record.status === 'dismantled' && record.dismantledAt) {
    return record;
  }
  const next: ScaffoldRegisterRecord = {
    ...record,
    status: 'dismantled',
    activatedAt: start,
    dismantledAt,
    updatedAt: dismantledAt,
  };
  return saveScaffoldRegisterRecord(next);
}

export async function setScaffoldRegisterDrawing(input: {
  record: ScaffoldRegisterRecord;
  drawingNumber: string;
  drawingDocumentId: string;
  drawingDocumentType: 'ess' | 'thirdparty';
  drawingDocumentName: string;
  drawingRevisionNumber: string;
  drawingFolderId: string;
}): Promise<ScaffoldRegisterRecord> {
  const updatedAt = new Date().toISOString();
  const next: ScaffoldRegisterRecord = {
    ...input.record,
    drawingNumber: input.drawingNumber,
    drawingDocumentId: input.drawingDocumentId,
    drawingDocumentType: input.drawingDocumentType,
    drawingDocumentName: input.drawingDocumentName,
    drawingRevisionNumber: input.drawingRevisionNumber,
    drawingFolderId: input.drawingFolderId,
    updatedAt,
  };
  return upsertSafetyForm('scaffold-register', next.builderId, next.projectId, next, {
    title: next.scaffoldName,
    referenceNumber: next.drawingNumber,
    requestedBy: '',
    projectLabel: next.projectName,
    eventDate: updatedAt,
    pdfPath: '',
  });
}

export async function renameScaffoldRegisterRecord(
  record: ScaffoldRegisterRecord,
  scaffoldName: string,
): Promise<ScaffoldRegisterRecord> {
  const nextName = scaffoldName.trim();
  if (!nextName) {
    throw new Error('Enter a scaffold name before saving.');
  }
  const updatedAt = new Date().toISOString();
  const next: ScaffoldRegisterRecord = {
    ...record,
    scaffoldName: nextName,
    updatedAt,
  };
  return upsertSafetyForm('scaffold-register', next.builderId, next.projectId, next, {
    title: nextName,
    referenceNumber: next.drawingNumber,
    requestedBy: '',
    projectLabel: next.projectName,
    eventDate: updatedAt,
    pdfPath: '',
  });
}

export async function deleteScaffoldRegisterRecord(
  builderId: string,
  projectId: string,
  recordId: string,
): Promise<void> {
  const handovers = await listHandoverCertificateForms(builderId, projectId);
  const linkedHandovers = handovers.filter(handover => handover.scaffoldRegisterId.trim() === recordId.trim());
  const deletionResults = await Promise.allSettled(
    linkedHandovers.map(handover => deleteHandoverCertificateForm(builderId, projectId, handover.id)),
  );
  const failedHandoverCount = deletionResults.filter(result => result.status === 'rejected').length;
  if (failedHandoverCount > 0) {
    throw new Error(
      `Could not delete ${failedHandoverCount} linked handover ${failedHandoverCount === 1 ? 'form' : 'forms'}.`,
    );
  }

  await deleteSafetyFormRecord('scaffold-register', builderId, projectId, recordId);
}
