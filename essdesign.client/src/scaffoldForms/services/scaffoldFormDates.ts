// Derived from ESSApp/src/services/scaffoldFormDates.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {getSafetyForm, listSafetyForms} from './supabaseSafetyRecords';
import {scaffoldDateIso, handoverDateWithCalendarDate} from '../utils/scaffoldFormDates';
import {sydneyNowDisplayDateTime, sydneyTodayIsoDate} from '../utils/sydneyTime';

type DatedFormType = 'scaff-tags' | 'handover-certificates';

export async function getLinkedScaffoldFormDate(
  type: DatedFormType,
  builderId: string,
  projectId: string,
  linkedFormId: string,
): Promise<string> {
  const linkedType = type === 'scaff-tags' ? 'handover-certificates' : 'scaff-tags';
  const linked = await getSafetyForm<{dateErected?: string; inspectionDateTime?: string; createdAt?: string}>(
    linkedType, builderId, projectId, linkedFormId,
  );
  if (!linked) {
    throw new Error('The linked form could not be found. Check the link before saving.');
  }
  const date = scaffoldDateIso(
    (type === 'scaff-tags' ? linked.inspectionDateTime : linked.dateErected) || linked.createdAt || '',
  );
  if (!date) {
    throw new Error('The linked form has no valid date. Set its date before creating this form.');
  }
  return date;
}

/** Resolve before rendering so the database, PDF and share page receive the same date. */
export async function resolveScaffoldFormDate(options: {
  type: DatedFormType;
  builderId: string;
  projectId: string;
  linkedFormId: string;
  value: string;
  existingValue?: string;
  isNew: boolean;
  dateManuallySet?: boolean;
}): Promise<string> {
  const {type, builderId, projectId, linkedFormId, isNew, dateManuallySet} = options;
  const value = (!isNew && !dateManuallySet ? options.existingValue?.trim() : options.value.trim())
    || options.value.trim() || options.existingValue?.trim()
    || (type === 'scaff-tags' ? sydneyTodayIsoDate() : sydneyNowDisplayDateTime());
  const calendarDate = isNew && linkedFormId && !dateManuallySet
    ? await getLinkedScaffoldFormDate(type, builderId, projectId, linkedFormId)
    : scaffoldDateIso(value);
  if (!calendarDate) {
    throw new Error('Select a valid date before saving.');
  }
  return type === 'scaff-tags' ? calendarDate : handoverDateWithCalendarDate(value, calendarDate, dateManuallySet);
}

/** The database updates linked dates atomically; rebuild their stored documents afterwards. */
export async function refreshLinkedScaffoldDateDocuments(type: DatedFormType, form: {
  id: string; builderId: string; projectId: string; scaffoldRegisterId?: string;
  handoverFormId?: string; scaffTagFormId?: string;
}): Promise<void> {
  const peerType = type === 'scaff-tags' ? 'handover-certificates' : 'scaff-tags';
  const peerId = type === 'scaff-tags' ? form.handoverFormId : form.scaffTagFormId;
  const peers = await listSafetyForms<{
    id: string; scaffoldRegisterId?: string; handoverFormId?: string; scaffTagFormId?: string;
  }>(peerType, form.builderId, form.projectId);
  const linked = peers.filter(peer => {
    const reverseId = type === 'scaff-tags' ? peer.scaffTagFormId : peer.handoverFormId;
    return peer.id === peerId || reverseId === form.id || (
      !peerId && !reverseId && !!form.scaffoldRegisterId && peer.scaffoldRegisterId === form.scaffoldRegisterId
    );
  });
  for (const peer of linked) {
    if (peerType === 'scaff-tags') {
      const {refreshScaffTagDateDocuments} = await import('./supabaseScaffTags');
      await refreshScaffTagDateDocuments(form.builderId, form.projectId, peer.id);
    } else {
      const {refreshHandoverDateDocument} = await import('./supabaseHandoverCertificates');
      await refreshHandoverDateDocument(form.builderId, form.projectId, peer.id);
    }
  }
}
