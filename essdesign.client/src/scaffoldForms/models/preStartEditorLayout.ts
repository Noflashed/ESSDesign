// Derived from ESSApp/src/models/preStartEditorLayout.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import { PRE_START_CHECKLIST } from './preStart';
import {
  preStartDocumentPages,
  PreStartDocumentNode,
} from './preStartDocument';

export const PRE_START_EDITOR_WIDTH = 704;
export const PRE_START_EDITOR_HEIGHTS = [1030, 1000] as const;

/** Shared page geometry for the zoomable editor and matching PDF export. */
export function preStartEditorPages(
  brand: Parameters<typeof preStartDocumentPages>[0],
): PreStartDocumentNode[][] {
  return preStartDocumentPages(brand).map((nodes, page) => {
    if (page === 0) {
      return firstPage(brand);
    }
    const contentBottom = 809;
    const targetBottom = PRE_START_EDITOR_HEIGHTS[page] - 40;
    const verticalScale = (targetBottom - 20) / (contentBottom - 61);
    return nodes.map(node => {
      const footer = node.y >= 1100;
      const numberBox = node.kind === 'box' && node.x === 675 && node.y === 132;
      return {
        ...node,
        key: numberBox ? 'preStartNumberBox' : node.key,
        x: node.x - 52,
        y: footer
          ? PRE_START_EDITOR_HEIGHTS[page] - 22
          : 20 + (node.y - 61) * verticalScale,
        height: footer ? node.height : node.height * verticalScale,
      };
    });
  });
}

/** Fixed page-one grid: shared margins, field baselines and answer columns. */
function firstPage(
  brand: Parameters<typeof preStartDocumentPages>[0],
): PreStartDocumentNode[] {
  const nodes: PreStartDocumentNode[] = [];
  const left = 16,
    width = 672;
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill?: string,
    key?: string,
  ) => nodes.push({ kind: 'box', x, y, width: w, height: h, fill, key });
  const text = (
    label: string,
    x: number,
    y: number,
    w: number,
    h = 16,
    size = 10,
    bold = false,
    color?: string,
  ) =>
    nodes.push({
      kind: 'text',
      label,
      x,
      y,
      width: w,
      height: h,
      size,
      bold,
      color,
    });
  const field = (
    key: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    multiline = false,
    numeric = false,
  ) =>
    nodes.push({
      kind: 'field',
      key,
      label,
      x,
      y,
      width: w,
      height: h,
      size: 10,
      multiline,
      numeric,
    });
  const band = (label: string, y: number) => {
    box(left, y, width, 22, '#F28C28');
    text(label, left + 8, y + 5, width - 16, 14, 10, true);
  };
  const answers = (key: string, label: string, y: number, x = 614, w = 28) => {
    [true, false].forEach((choice, i) =>
      nodes.push({
        kind: 'choice',
        key,
        label,
        choice,
        x: x + i * (w + 6),
        y,
        width: w,
        height: 22,
        size: 9,
      }),
    );
  };
  const question = (key: string, label: string, y: number) => {
    box(left, y, width, 30);
    text(label, left + 8, y + 6, 574, 24, 10);
    answers(key, label, y + 4);
  };
  const entry = (key: string, label: string, y: number, h: number) => {
    box(left, y, width, h, '#FCFCFC');
    field(key, label, left + 8, y + 5, width - 16, h - 10, true);
  };
  nodes.push({ kind: 'logo', x: 20, y: 20, width: 108, height: 58 });
  text(brand.legalName, 140, 24, 330, 12, 9);
  text(`ABN: ${brand.abn}`, 140, 38, 330, 12, 9);
  text(`Office Address: ${brand.officeAddress}`, 140, 52, 345, 12, 9);
  text('RECORD OF DAILY PRE-START', 470, 24, 218, 20, 13, true);
  text('PRE-START NO.', 516, 78, 96, 16, 9, true);
  box(616, 72, 72, 22, undefined, 'preStartNumberBox');
  field('preStartNumber', 'Pre-start number', 619, 75, 66, 16);
  [
    ['Date', 'date'],
    ['Client / Project name', 'clientProjectName'],
    [`${brand.shortName} representative`, 'representativeName'],
    ['Subject', 'subject'],
  ].forEach(([label, key], i) => {
    const y = 100 + i * 22;
    box(left, y, width, 22);
    box(left, y, 144, 22, '#F7F7F7');
    text(label, left + 8, y + 5, 128, 15, 9, true);
    field(key, label, 168, y + 4, 512, 16);
  });
  band('1. ISSUES ARISING FROM PREVIOUS DAY', 200);
  question('previousIssues', 'Any issues arising from the previous day?', 222);
  entry('previousIssuesDetails', 'If yes, please state the issues', 252, 32);
  text(
    'If yes, describe above. Capture any SWMS changes and ensure relevant personnel are inducted.',
    24,
    289,
    656,
    23,
    9,
  );

  band('2. PLANNED WORK ACTIVITIES / TASKS TODAY', 320);
  entry('plannedActivities', 'Planned activities / tasks', 342, 60);

  band('3. SAFE WORK METHOD STATEMENTS', 414);
  box(left, 436, width, 30);
  text(
    'Have you got a SWMS in place for ALL activities?',
    24,
    442,
    300,
    24,
    10,
  );
  box(330, 440, 200, 22, '#FEE2E2', 'swmsWarningPill');
  text('IF NOT, STOP AND DEVELOP ONE!', 342, 445, 176, 12, 9, true, '#DC2626');
  answers(
    'swmsInPlace',
    'Have you got a SWMS in place for ALL activities?',
    440,
  );

  band('4. PERMITS', 494);
  text(
    "Permits for today's activities - permit number and description",
    24,
    519,
    656,
    14,
    9,
    true,
  );
  entry('permitDetails', 'Permit number and description', 532, 26);
  question(
    'permitConditionsChanged',
    'Have conditions changed since permit approval?',
    558,
  );

  band('5. HAZARDOUS SUBSTANCES', 600);
  question(
    'hazardousSubstances',
    'Any hazardous substances being used, brought to or stored on site today?',
    622,
  );
  text('If yes, list substances:', 24, 655, 656, 14, 9, true);
  entry('hazardousSubstancesDetails', 'Hazardous substances details', 668, 24);

  band('6. RISKS IDENTIFIED IN THE WORK AREA', 704);
  text('Area foreman:', 374, 710, 90, 14, 9, true);
  box(468, 706, 212, 18, '#F7F7F7');
  field('areaForeman', 'Area foreman', 468, 706, 212, 18);
  for (let index = 0; index < 6; index++) {
    const y = 726 + index * (94 / 6);
    box(left, y, width, 94 / 6, '#FCFCFC');
    text(`${index + 1}.`, left + 8, y + 2, 20, 12, 9, true);
    field(
      `risk.${index}`,
      `Identified risk ${index + 1}`,
      left + 32,
      y + 1,
      width - 40,
      14,
    );
  }

  band('7. CHECKLIST FOR ACTIVITIES', 832);
  nodes.push({
    kind: 'action',
    key: 'checklistYesToAll',
    x: 611,
    y: 835.5,
    width: 69,
    height: 15,
  });
  text(
    'Tick Yes or No. Detail incomplete activities or issues in section 8 notes.',
    24,
    859,
    656,
    14,
    9,
  );
  const y = 874,
    rowHeight = 32,
    column = 224;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 4; row++) {
      box(left + col * column, y + row * rowHeight, column, rowHeight);
    }
  }
  const checklistCell = (
    item: (typeof PRE_START_CHECKLIST)[number],
    col: number,
    row: number,
  ) => {
    const x = left + col * column,
      top = y + row * rowHeight;
    text(item.label, x + 6, top + 4, 156, 26, 8);
    answers(`checklist.${item.id}`, item.label, top + 5, x + 164, 25);
  };
  PRE_START_CHECKLIST.slice(0, 4).forEach((item, row) =>
    checklistCell(item, 0, row),
  );
  PRE_START_CHECKLIST.slice(4, 7).forEach((item, row) =>
    checklistCell(item, 1, row),
  );
  const third = left + 2 * column;
  [
    ['People in work group', 'workGroupCount'],
    ["Workers allocated to today's clean up", 'cleanupWorkerCount'],
  ].forEach(([label, key], row) => {
    const top = y + row * rowHeight;
    text(label, third + 6, top + 5, 154, 24, 8);
    box(third + 166, top + 5, 50, 22, '#F7F7F7');
    field(key, label, third + 170, top + 8, 42, 16, false, true);
  });
  // One taller final cell gives the consultation statement room to wrap.
  box(third, y + 64, column, 64, '#FFFFFF');
  text(PRE_START_CHECKLIST[7].label, third + 6, y + 70, 156, 52, 8);
  answers(
    'checklist.consulted',
    PRE_START_CHECKLIST[7].label,
    y + 69,
    third + 164,
    25,
  );
  text(`${brand.shortName} Daily Pre-Start`, 16, 1011, 400, 13, 8);
  text('Page 1', 640, 1011, 48, 13, 8);
  return nodes;
}
