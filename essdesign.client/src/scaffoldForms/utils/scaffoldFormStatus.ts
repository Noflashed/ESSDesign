// Derived from ESSApp/src/utils/scaffoldFormStatus.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
type ScaffoldForm = {
  id?: string;
  builderId?: string;
  projectId?: string;
  scaffoldRegisterId?: string;
  scaffTagFormId?: string;
  scaffoldNo?: string;
  formReferenceName?: string;
  status?: string;
  retiredAt?: string;
  retiredReason?: string;
  dismantledAt?: string;
};

type RegisterRecord = {
  id: string;
  builderId?: string;
  projectId?: string;
  scaffoldName: string;
  status?: string;
  dismantledAt?: string;
  updatedAt?: string;
};

export type ScaffoldFormStatus = 'Active' | 'Dismantled' | 'Retired';

const normalized = (value?: string) => (value || '').trim().toLowerCase();

/** Sharing never changes a scaffold's lifecycle. Prefer its canonical register link. */
export function resolveScaffoldFormStatus(
  form: ScaffoldForm,
  records: RegisterRecord[],
  tags: ScaffoldForm[] = [],
): ScaffoldFormStatus {
  const inProject = (candidate: ScaffoldForm | RegisterRecord) =>
    (!form.builderId || candidate.builderId === form.builderId) &&
    (!form.projectId || candidate.projectId === form.projectId);
  const tag = tags.find(candidate => candidate.id === form.scaffTagFormId && inProject(candidate));
  const registerId = form.scaffoldRegisterId?.trim() || tag?.scaffoldRegisterId?.trim();
  const name = normalized(form.scaffoldNo || form.formReferenceName);
  const record = records.filter(inProject).filter(candidate => registerId
    ? candidate.id === registerId
    : !!name && normalized(candidate.scaffoldName) === name,
  ).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];

  if (record?.status === 'dismantled' || record?.dismantledAt ||
      form.status === 'dismantled' || form.dismantledAt ||
      normalized(form.retiredReason) === 'scaffold dismantled' ||
      normalized(tag?.retiredReason) === 'scaffold dismantled') {
    return 'Dismantled';
  }
  return form.status === 'retired' || form.retiredAt ? 'Retired' : 'Active';
}
