// Derived from ESSApp/src/models/preStartDocument.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {
  PreStartForm,
  PRE_START_CHECKLIST,
  preStartRiskRows,
} from './preStart';

export const PRE_START_PAGE_WIDTH = 810;
export const PRE_START_PAGE_HEIGHT = 1146;
export type DocumentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type PreStartDocumentNode = DocumentBox & {
  kind:
    | 'text'
    | 'box'
    | 'field'
    | 'choice'
    | 'logo'
    | 'photo'
    | 'signature'
    | 'action';
  label?: string;
  key?: string;
  size?: number;
  bold?: boolean;
  color?: string;
  fill?: string;
  choice?: boolean;
  index?: number;
  multiline?: boolean;
  numeric?: boolean;
};
export function preStartDocumentValue(
  form: PreStartForm,
  key = '',
): string | boolean | null {
  if (key.startsWith('checklist.')) {
    return form.checklist[key.slice(10) as keyof PreStartForm['checklist']];
  }
  if (key.startsWith('risk.')) {
    return preStartRiskRows(form.risks)[Number(key.slice(5))] || '';
  }
  if (key.startsWith('attendee.')) {
    return form.attendees[Number(key.slice(9))]?.name || '';
  }
  return (form[key as keyof PreStartForm] as string | boolean | null) ?? '';
}
export function preStartDocumentPages(brand: {
  shortName: string;
  legalName: string;
  abn: string;
  officeAddress: string;
}): PreStartDocumentNode[][] {
  let nodes: PreStartDocumentNode[] = [];
  const pages: PreStartDocumentNode[][] = [];
  const box = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill?: string,
  ) => nodes.push({ kind: 'box', x, y, width, height, fill });
  const text = (
    label: string,
    x: number,
    y: number,
    width: number,
    height = 20,
    size = 10,
    bold = false,
  ) => nodes.push({ kind: 'text', label, x, y, width, height, size, bold });
  const field = (
    key: string,
    label: string,
    x: number,
    y: number,
    width: number,
    height: number,
    multiline = false,
    numeric = false,
  ) =>
    nodes.push({
      kind: 'field',
      key,
      label,
      x,
      y,
      width,
      height,
      multiline,
      numeric,
      size: 10,
    });
  const band = (label: string, y: number) => {
    box(64, y, 682, 21, '#F28C28');
    text(label, 68, y + 3, 672, 16, 10, true);
  };
  const choices = (
    key: string,
    label: string,
    x: number,
    y: number,
    small = false,
  ) => {
    [true, false].forEach((choice, i) =>
      nodes.push({
        kind: 'choice',
        key,
        label,
        choice,
        x: x + i * (small ? 29 : 34),
        y,
        width: small ? 25 : 25,
        height: 20,
        size: 8,
      }),
    );
  };
  const header = (second = false) => {
    nodes = [];
    pages.push(nodes);
    nodes.push({ kind: 'logo', x: 64, y: 61, width: 108, height: 62 });
    text(brand.legalName, 180, 78, 330, 12, 9);
    text(`ABN: ${brand.abn}`, 180, 91, 330, 12, 9);
    text(`Office Address: ${brand.officeAddress}`, 180, 104, 365, 12, 9);
    if (!second) {
      text(`${brand.shortName} Daily Pre-Start`, 566, 97, 180, 27, 14, true);
      text('RECORD OF DAILY PRE-START', 64, 135, 510, 22, 16, true);
      box(675, 132, 71, 18);
      field('preStartNumber', 'Pre-start number', 679, 133, 63, 16);
    }
    text(`${brand.shortName} Daily Pre-Start`, 64, 1103, 350, 13, 8);
    text(second ? 'Page 2' : 'Page 1', 695, 1103, 51, 13, 8);
  };
  header();
  [
    ['Date', 'date', 105],
    ['Client / Project name', 'clientProjectName', 181],
    [`${brand.shortName} representative`, 'representativeName', 170],
    ['Subject', 'subject', 111],
  ].forEach(([label, key, left], i) => {
    const y = 156 + i * 20;
    box(64, y, 682, 20);
    text(`${label}:`, 68, y + 4, Number(left) - 70, 14, 9, true);
    field(
      String(key),
      String(label),
      Number(left),
      y + 2,
      742 - Number(left),
      17,
    );
  });
  box(64, 236, 682, 92);
  text('1.   ISSUES ARISING FROM PREVIOUS DAY?', 68, 241, 387, 16, 10, true);
  text('If yes, please state:', 87, 254, 350, 14, 9);
  choices('previousIssues', 'Issues arising from previous day', 458, 241);
  field(
    'previousIssuesDetails',
    'Issues from previous day',
    68,
    270,
    674,
    38,
    true,
  );
  text(
    'NOTE: If this requires a change to the SWMS then please ensure this is captured and relevant personnel inducted.',
    68,
    313,
    674,
    13,
    9,
  );
  text(
    '2.   PLANNED WORK ACTIVITIES / TASKS BEING CARRIED OUT TODAY',
    68,
    333,
    674,
    17,
    10,
    true,
  );
  band('ACTIVITY / TASK', 349);
  box(64, 370, 682, 93);
  field(
    'plannedActivities',
    'Planned activities / tasks',
    68,
    374,
    674,
    85,
    true,
  );
  box(64, 463, 682, 35);
  text(
    '3.   Have you got a SWMS in place for ALL activities?',
    68,
    468,
    390,
    15,
    10,
    true,
  );
  text('IF NOT, STOP AND DEVELOP ONE!', 80, 482, 376, 14, 10, true);
  choices('swmsInPlace', 'SWMS in place for all activities', 464, 470);
  box(64, 498, 682, 72);
  text(
    "4.   Permits in place for today's Activities - Stating Permit No. and Description",
    68,
    503,
    674,
    15,
    10,
    true,
  );
  text(
    'Have conditions changed since permit approval? Tick Yes or No',
    80,
    518,
    340,
    15,
    9,
    true,
  );
  choices('permitConditionsChanged', 'Permit conditions changed', 392, 516);
  field(
    'permitDetails',
    'Permit number and description',
    68,
    540,
    674,
    26,
    true,
  );
  box(64, 570, 682, 71);
  text(
    '5.   Are any Hazardous Substances being used, or brought to / stored on site today?',
    68,
    575,
    390,
    27,
    9,
    true,
  );
  choices('hazardousSubstances', 'Hazardous substances', 464, 576);
  text('If yes, list substances:', 80, 598, 365, 13, 9);
  field(
    'hazardousSubstancesDetails',
    'Hazardous substances details',
    68,
    612,
    674,
    25,
    true,
  );
  box(64, 641, 682, 135);
  text(
    '6. What risks have been identified in the work area? List, and if necessary, contact',
    68,
    646,
    527,
    14,
    9,
    true,
  );
  field('areaForeman', 'Area foreman', 596, 643, 94, 18);
  text('area foreman', 690, 646, 54, 14, 8);
  field('risks', 'Identified risks', 68, 666, 674, 106, true);
  box(64, 776, 682, 32);
  text(
    '7. Checklist for Activities (Tick Yes or No)',
    68,
    780,
    285,
    24,
    10,
    true,
  );
  text(
    'Incomplete activities or issues must be detailed in section 8 notes',
    347,
    790,
    395,
    14,
    9,
  );
  const colWidth = 235;
  PRE_START_CHECKLIST.slice(0, 4).forEach((item, i) => {
    box(64, 808 + i * 31, colWidth, 31);
    text(item.label, 68, 813 + i * 31, 168, 24, 9);
    choices(`checklist.${item.id}`, item.label, 240, 813 + i * 31, true);
  });
  PRE_START_CHECKLIST.slice(4, 7).forEach((item, i) => {
    box(299, 808 + i * 31, 231, i === 2 ? 62 : 31);
    text(item.label, 303, 811 + i * 31, 166, 28, 8);
    choices(`checklist.${item.id}`, item.label, 471, 813 + i * 31, true);
  });
  box(530, 808, 216, 31);
  text('Indicate number of people in your work group', 534, 811, 154, 27, 9);
  field(
    'workGroupCount',
    'People in work group',
    690,
    817,
    52,
    18,
    false,
    true,
  );
  box(530, 839, 216, 31);
  text(
    "Indicate number of workers allocated for today's clean up",
    534,
    842,
    154,
    27,
    9,
  );
  field(
    'cleanupWorkerCount',
    'Workers allocated to clean up',
    690,
    848,
    52,
    18,
    false,
    true,
  );
  box(530, 870, 216, 62);
  text(
    'Pre-start consulted to all work teams including Subcontractors & Trades listed in section 4',
    534,
    874,
    155,
    54,
    9,
  );
  choices('checklist.consulted', PRE_START_CHECKLIST[7].label, 686, 875, true);
  header(true);
  box(64, 138, 682, 156);
  box(64, 138, 682, 21, '#F9E1C8');
  text('8. GENERAL NOTES', 68, 141, 674, 17, 10, true);
  field('generalNotes', 'General notes', 68, 164, 674, 126, true);
  band('SITE PHOTOS', 310);
  for (let i = 0; i < 3; i++) {
    box(64 + (i * 682) / 3, 331, 682 / 3, 220);
    nodes.push({
      kind: 'photo',
      index: i,
      x: 68 + (i * 682) / 3,
      y: 335,
      width: 682 / 3 - 8,
      height: 212,
    });
  }
  box(64, 568, 682, 21, '#F28C28');
  for (let col = 0; col < 2; col++) {
    const x = 64 + col * 341;
    text('Print Name', x + 4, 571, 255, 16, 10, true);
    text('Initial', x + 265, 571, 72, 16, 10, true);
    for (let row = 0; row < 10; row++) {
      const i = col * 10 + row,
        y = 589 + row * 22;
      box(x, y, 259, 22);
      box(x + 259, y, 82, 22);
      text(`${i + 1}:`, x + 3, y + 4, 22, 16, 9, true);
      field(`attendee.${i}`, `Attendee ${i + 1} name`, x + 24, y + 2, 232, 18);
      nodes.push({
        kind: 'signature',
        index: i,
        x: x + 262,
        y: y + 2,
        width: 76,
        height: 18,
      });
    }
  }
  return pages;
}
