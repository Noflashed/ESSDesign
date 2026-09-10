// Derived from ESSApp/src/models/preStart.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
export type PreStartAnswer = boolean | null;
export type PreStartStroke = Array<{ x: number; y: number }>;
export const PRE_START_CHECKLIST = [
  { id: 'dailyRiskAssessment', label: 'Daily Risk Assessment Completed' },
  {
    id: 'qualifications',
    label: 'Qualifications/training of staff adequate for work activities',
  },
  { id: 'plantAndEquipment', label: 'Plant and Equipment on/off site' },
  { id: 'equipmentSafe', label: 'Equipment safe to use' },
  {
    id: 'workAreaSafe',
    label: 'Work area inspected and safe for staff to enter and work in today',
  },
  {
    id: 'ppe',
    label: 'Appropriate and adequate PPE supplied to work teams (SWMS/MSDS)',
  },
  {
    id: 'weather',
    label: 'Weather conditions for work to be conducted assessed',
  },
  {
    id: 'consulted',
    label:
      'Pre-start consulted to all work teams including Subcontractors & Trades listed in section 4',
  },
] as const;
export type PreStartCheckId = (typeof PRE_START_CHECKLIST)[number]['id'];
export interface PreStartForm {
  completedAt?: string;
  completedByUserId?: string;
  id: string;
  builderId: string;
  builderName: string;
  projectId: string;
  projectName: string;
  companyEntityId: 'ess' | 'maloo';
  preStartNumber: string;
  clientProjectName: string;
  date: string;
  representativeName: string;
  subject: string;
  previousIssues: PreStartAnswer;
  previousIssuesDetails: string;
  plannedActivities: string;
  swmsInPlace: PreStartAnswer;
  permitConditionsChanged: PreStartAnswer;
  permitDetails: string;
  hazardousSubstances: PreStartAnswer;
  hazardousSubstancesDetails: string;
  areaForeman: string;
  risks: string;
  checklist: Record<PreStartCheckId, PreStartAnswer>;
  workGroupCount: string;
  cleanupWorkerCount: string;
  generalNotes: string;
  photoSlots: Array<{ slot: number; path: string }>;
  attendees: Array<{ name: string; signatureStrokes: PreStartStroke[] }>;
  pdfPath: string;
  pdfLayoutVersion?: number;
  createdAt: string;
  updatedAt: string;
}
export function preStartRiskRows(risks: string): string[] {
  const lines = risks.split('\n');
  return Array.from({ length: 6 }, (_, index) =>
    index === 5 ? lines.slice(5).join('\n') : lines[index] || '',
  );
}

export function updatePreStartRisk(
  risks: string,
  index: number,
  value: string,
): string {
  const rows = preStartRiskRows(risks);
  rows[index] = value;
  return rows.join('\n');
}

export function preStartSubject(date: string): string {
  const [day, month, year] = date.split('/').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = calendarDate.toLocaleDateString('en-AU', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return `${weekday} ${date} Daily Pre-Start`;
}

export function createPreStartForm(
  context: Pick<
    PreStartForm,
    'builderId' | 'builderName' | 'projectId' | 'projectName'
  >,
  date: string,
  representativeName = '',
): PreStartForm {
  return {
    ...context,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    companyEntityId: 'ess',
    preStartNumber: '',
    clientProjectName: context.projectName,
    date,
    representativeName,
    subject: preStartSubject(date),
    previousIssues: null,
    previousIssuesDetails: '',
    plannedActivities: '',
    swmsInPlace: null,
    permitConditionsChanged: null,
    permitDetails: '',
    hazardousSubstances: null,
    hazardousSubstancesDetails: '',
    areaForeman: '',
    risks: '',
    checklist: Object.fromEntries(
      PRE_START_CHECKLIST.map(item => [item.id, null]),
    ) as PreStartForm['checklist'],
    workGroupCount: '',
    cleanupWorkerCount: '',
    generalNotes: '',
    photoSlots: [],
    attendees: Array.from({ length: 20 }, () => ({
      name: '',
      signatureStrokes: [],
    })),
    pdfPath: '',
    createdAt: '',
    updatedAt: '',
  };
}
