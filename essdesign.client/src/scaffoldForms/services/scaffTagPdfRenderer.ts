// Derived from ESSApp/src/services/scaffTagPdfRenderer.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import type {
  InspectionRecordEntry,
  ScaffTagForm,
  SignatureStroke,
} from './supabaseScaffTags';

export type ScaffTagPdfImage = {
  name: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  slot?: number;
};

export type ScaffTagPdfCompanyHeader = {
  officeAddress: string;
  legalName: string;
  phone: string;
};

const PAGE_WIDTH = 595.2;
const PAGE_HEIGHT = 841.8;
const GREEN = '0.043 0.310 0.184';
const GREEN_LIGHT = '0.722 0.851 0.780';
const YELLOW = '0.969 0.827 0.098';
const YELLOW_BORDER = '0.839 0.694 0';
const INK = '0.067 0.094 0.153';
const GRID = '0.553 0.663 0.745';

function pdfEsc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function clean(value: string | undefined, max = 64): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function textWidth(value: string, size: number, bold = false): number {
  return value.length * size * (bold ? 0.56 : 0.5);
}

const HELVETICA_BOLD_CAP_WIDTHS: Record<string, number> = {
  ' ': 278,
  '!': 333,
  A: 722,
  B: 722,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 556,
  K: 722,
  L: 611,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 722,
  W: 944,
  X: 722,
  Y: 722,
  Z: 611,
};

function helveticaBoldCapWidth(value: string, size: number): number {
  const units = Array.from(value).reduce(
    (total, character) => total + (HELVETICA_BOLD_CAP_WIDTHS[character] ?? 556),
    0,
  );
  return units * size / 1000;
}

function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 1) {
    output += bytes[index].toString(16).padStart(2, '0');
    if (index > 0 && index % 64 === 0) {
      output += '\n';
    }
  }
  return `${output}>`;
}

function drawImageCover(
  image: ScaffTagPdfImage,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  return `q\n${x} ${y} ${width} ${height} re W n\n${drawWidth} 0 0 ${drawHeight} ${drawX} ${drawY} cm\n/${image.name} Do\nQ`;
}

function drawSignature(
  x: number,
  top: number,
  width: number,
  height: number,
  strokes: SignatureStroke[] | undefined,
  leftAligned = false,
): string[] {
  if (!strokes?.length) {
    return [];
  }
  const points = strokes.flat().filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 2) {
    return [];
  }
  const minX = leftAligned ? Math.min(...points.map(point => point.x)) : 0;
  const output = ['q', '0.9 w', `${INK} RG`, '1 J', '1 j'];
  strokes.forEach(stroke => {
    if (stroke.length < 2) {
      return;
    }
    for (let index = 1; index < stroke.length; index += 1) {
      const previous = stroke[index - 1];
      const point = stroke[index];
      const x1 = x + Math.max(0, Math.min(1, previous.x - minX)) * width;
      const y1 = PAGE_HEIGHT - top - Math.max(0, Math.min(1, previous.y)) * height;
      const x2 = x + Math.max(0, Math.min(1, point.x - minX)) * width;
      const y2 = PAGE_HEIGHT - top - Math.max(0, Math.min(1, point.y)) * height;
      output.push(`${x1} ${y1} m ${x2} ${y2} l S`);
    }
  });
  output.push('Q');
  return output;
}

export function buildScaffTagPdfDocument(
  form: ScaffTagForm,
  images: ScaffTagPdfImage[] = [],
  companyHeader?: ScaffTagPdfCompanyHeader,
): string {
  const margin = 16;
  const gap = 12;
  const cardWidth = (PAGE_WIDTH - margin * 2 - gap) / 2;
  const cardTop = 70;
  const cardHeight = 704;
  const frontX = margin;
  const backX = margin + cardWidth + gap;
  const logo = images.find(image => image.slot === undefined);
  const photos = images.filter(image => image.slot !== undefined);
  const photoBySlot = new Map(photos.map(image => [image.slot, image]));

  const out: string[] = ['q', '1 J', '1 j'];
  const y = (top: number, height = 0) => PAGE_HEIGHT - top - height;
  const fill = (colour: string) => out.push(`${colour} rg`);
  const stroke = (colour: string) => out.push(`${colour} RG`);
  const fillRect = (x: number, top: number, width: number, height: number) =>
    out.push(`${x} ${y(top, height)} ${width} ${height} re f`);
  const strokeRect = (x: number, top: number, width: number, height: number) =>
    out.push(`${x} ${y(top, height)} ${width} ${height} re S`);
  const line = (x1: number, top1: number, x2: number, top2: number) =>
    out.push(`${x1} ${y(top1)} m ${x2} ${y(top2)} l S`);
  const drawText = (
    x: number,
    top: number,
    size: number,
    value: string,
    bold = false,
    colour = INK,
  ) => out.push(`${colour} rg`, `BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y(top + size)} Tm (${pdfEsc(value)}) Tj ET`);
  const centeredText = (
    x: number,
    top: number,
    width: number,
    size: number,
    value: string,
    bold = false,
    colour = INK,
  ) => drawText(x + Math.max(2, (width - textWidth(value, size, bold)) / 2), top, size, value, bold, colour);
  const preciselyCenteredBoldText = (
    centreX: number,
    top: number,
    size: number,
    value: string,
    colour = INK,
  ) => drawText(centreX - helveticaBoldCapWidth(value, size) / 2, top, size, value, true, colour);
  const warningSymbol = (
    centreX: number,
    boxTop: number,
    boxSize: number,
    fontSize: number,
    strokeWidth: number,
  ) => {
    const boxX = centreX - boxSize / 2;
    stroke(INK);
    out.push(`${strokeWidth} w`);
    strokeRect(boxX, boxTop, boxSize, boxSize);
    // Helvetica-Bold's exclamation glyph is 333/1000 em wide. Using the
    // actual metric keeps it optically centred instead of relying on the
    // general-purpose text estimate used for words.
    const glyphWidth = fontSize * 0.333;
    const glyphX = centreX - glyphWidth / 2;
    const glyphTop = boxTop + boxSize / 2 - fontSize * 0.641;
    drawText(glyphX, glyphTop, fontSize, '!', true);
  };
  const checkbox = (x: number, top: number, checked: boolean) => {
    fill('1 1 1');
    fillRect(x, top, 12, 12);
    stroke(GREEN_LIGHT);
    out.push('0.55 w');
    strokeRect(x, top, 12, 12);
    if (checked) {
      drawText(x + 2.1, top + 0.5, 9, 'X', true, GREEN);
    }
  };

  // Flat page and card backgrounds. Every rule is a single vector stroke: no
  // captured UIKit borders, shadows or nine-slice edge tiles are present.
  fill('1 1 1');
  fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  fill(GREEN);
  fillRect(frontX, cardTop, cardWidth, cardHeight);
  fill(YELLOW);
  fillRect(backX, cardTop, cardWidth, cardHeight);
  stroke(GREEN);
  out.push('0.8 w');
  strokeRect(frontX, cardTop, cardWidth, cardHeight);
  stroke(YELLOW_BORDER);
  strokeRect(backX, cardTop, cardWidth, cardHeight);

  // Front header.
  const headerHeight = 54;
  fill('1 1 1');
  fillRect(frontX, cardTop, cardWidth, headerHeight);
  if (logo) {
    const logoWidth = 62;
    const logoHeight = 38;
    out.push(drawImageCover(logo, frontX + 9, y(cardTop + 8, logoHeight), logoWidth, logoHeight));
  } else {
    drawText(frontX + 12, cardTop + 17, 16, 'ESS', true, GREEN);
  }
  drawText(frontX + 78, cardTop + 9, 16, 'SCAFFOLD TAG', true);
  drawText(
    frontX + 78,
    cardTop + 28,
    5.8,
    clean(companyHeader?.officeAddress || form.projectName || form.jobLocation, 48),
    true,
    '0.22 0.25 0.30',
  );
  const companyContact = companyHeader
    ? `${companyHeader.legalName} - ${companyHeader.phone}`
    : form.builderName;
  drawText(frontX + 78, cardTop + 38, 5.2, clean(companyContact, 62), true, GREEN);

  let top = cardTop + headerHeight;
  fill(GREEN);
  fillRect(frontX, top, cardWidth, 23);
  centeredText(frontX, top + 6, cardWidth, 8.3, 'ERECTION AND INSPECTION RECORD', true, '1 1 1');
  top += 23;

  const panelInset = 9;
  const labelWidth = 55;
  const fieldX = frontX + panelInset + labelWidth;
  const fieldWidth = cardWidth - panelInset * 2 - labelWidth;
  const detailRows: Array<[string, string]> = [
    ['Location:', form.jobLocation || form.projectName],
    ['Scaffold:', form.scaffoldNo],
    ['Ref. No.:', `No. ${form.tagNumber}`],
  ];
  top += 7;
  detailRows.forEach(([label, value]) => {
    drawText(frontX + panelInset, top + 7, 7.8, label, true, '1 1 1');
    fill('1 1 1');
    fillRect(fieldX, top, fieldWidth, 20);
    drawText(fieldX + 5, top + 6.5, 7.4, clean(value, 44), true);
    top += 24;
  });

  stroke(GREEN_LIGHT);
  out.push('0.55 w');
  line(frontX + panelInset, top + 1, frontX + cardWidth - panelInset, top + 1);
  drawText(frontX + panelInset, top + 8, 7, 'FALL PROTECTION REQUIRED', true, '1 1 1');
  checkbox(frontX + cardWidth - 70, top + 5, form.fallProtectionRequired === 'YES');
  drawText(frontX + cardWidth - 55, top + 8, 6.7, 'YES', true, '1 1 1');
  checkbox(frontX + cardWidth - 32, top + 5, form.fallProtectionRequired === 'NO');
  drawText(frontX + cardWidth - 17, top + 8, 6.7, 'NO', true, '1 1 1');
  top += 23;

  line(frontX + panelInset, top, frontX + cardWidth - panelInset, top);
  const loads: Array<[string, ScaffTagForm['loadRating']]> = [
    ['Light Duty 225KG', 'LIGHT_DUTY'],
    ['Medium Duty 450KG', 'MEDIUM_DUTY'],
    ['Heavy Duty 675KG', 'HEAVY_DUTY'],
    ['See Engineering Drawing', 'SEE_ENGINEERING'],
    [`Other ${clean(form.loadRatingOther, 14)}`, 'OTHER'],
  ];
  loads.forEach(([label, rating], index) => {
    drawText(frontX + panelInset, top + 7 + index * 16, 7.6, label, true, '1 1 1');
    checkbox(frontX + 116, top + 4 + index * 16, form.loadRating === rating);
  });
  drawText(frontX + 143, top + 9, 6.2, 'THE ABOVE WEIGHTS ARE FOR', true, '1 1 1');
  drawText(frontX + 143, top + 20, 6.2, 'ONE WORKING PLATFORM ONLY', true, '1 1 1');
  drawText(frontX + 143, top + 31, 6.2, 'AND INCLUDE MEN AND', true, '1 1 1');
  drawText(frontX + 143, top + 42, 6.2, 'MATERIALS.', true, '1 1 1');
  top += 84;

  line(frontX + panelInset, top, frontX + cardWidth - panelInset, top);
  drawText(frontX + panelInset, top + 7, 7.2, 'SCAFFOLD COMPONENTS COMPLETE', true, '1 1 1');
  const checks: Array<[string, boolean]> = [
    ['HANDRAILS', form.checkHandrails], ['PLATFORM', form.checkPlatform],
    ['MID RAILS', form.checkMidRails], ['LADDER', form.checkLadder],
    ['TOE BOARDS', form.checkToeBoards], ['OTHER', form.checkOther],
  ];
  checks.forEach(([label, checked], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const checkX = frontX + panelInset + column * 84;
    checkbox(checkX, top + 20 + row * 18, checked);
    drawText(checkX + 15, top + 23 + row * 18, 5.9, label, true, '1 1 1');
  });
  top += 61;

  // Front inspection table.
  fill('1 1 1');
  fillRect(frontX, top, cardWidth, 25);
  centeredText(frontX, top + 6, cardWidth, 10.5, 'AUTHORISED PERSON', true);
  top += 25;
  const columns = [52, 43, 78, cardWidth - 173];
  const headers = ['DATE', 'TIME', 'NAME', 'SIGNATURE'];
  const tableHeaderHeight = 24;
  const inspectionRowHeight = 25;
  fill('1 1 1');
  fillRect(frontX, top, cardWidth, tableHeaderHeight + 10 * inspectionRowHeight);
  stroke(GRID);
  out.push('0.5 w');
  line(frontX, top, frontX + cardWidth, top);
  let columnX = frontX;
  headers.forEach((header, index) => {
    centeredText(columnX, top + 7, columns[index], 6.5, header, true);
    columnX += columns[index];
    if (index < headers.length - 1) {
      line(columnX, top, columnX, top + tableHeaderHeight + 10 * inspectionRowHeight);
    }
  });
  line(frontX, top + tableHeaderHeight, frontX + cardWidth, top + tableHeaderHeight);
  for (let index = 0; index < 10; index += 1) {
    const row = form.inspectionRecords[index] ?? ({date: '', time: '', competentPerson: ''} as InspectionRecordEntry);
    const rowTop = top + tableHeaderHeight + index * inspectionRowHeight;
    line(frontX, rowTop + inspectionRowHeight, frontX + cardWidth, rowTop + inspectionRowHeight);
    centeredText(frontX, rowTop + 8.5, columns[0], 6.2, clean(row.date, 12), true);
    centeredText(frontX + columns[0], rowTop + 8.5, columns[1], 6.2, clean(row.time, 10), true);
    centeredText(frontX + columns[0] + columns[1], rowTop + 8.5, columns[2], 6.2, clean(row.competentPerson, 20), true);
    out.push(...drawSignature(frontX + columns[0] + columns[1] + columns[2] + 3, rowTop + 1.5, columns[3] - 6, 22, row.signatureStrokes));
  }
  top += tableHeaderHeight + 10 * inspectionRowHeight;
  fill(YELLOW);
  fillRect(frontX, top, cardWidth, cardTop + cardHeight - top);
  stroke(YELLOW_BORDER);
  line(frontX, top, frontX + cardWidth, top);
  const cautionHeight = cardTop + cardHeight - top;
  const cautionBoxSize = 24;
  const cautionBoxTop = top + Math.max(8, (cautionHeight - cautionBoxSize) / 2);
  warningSymbol(frontX + 17 + cautionBoxSize / 2, cautionBoxTop, cautionBoxSize, 16, 1.8);
  warningSymbol(frontX + cardWidth - 17 - cautionBoxSize / 2, cautionBoxTop, cautionBoxSize, 16, 1.8);
  centeredText(frontX + 44, top + 18, cardWidth - 88, 11, 'CAUTION', true);
  centeredText(frontX + 44, top + 36, cardWidth - 88, 5.5, 'BE AWARE OF THE FOLLOWING', true);
  centeredText(frontX + 44, top + 47, cardWidth - 88, 5.5, 'SCAFFOLD HAZARDS', true);

  // Back warning and details.
  top = cardTop;
  const warningBoxSize = 35;
  const backCardCentreX = backX + cardWidth / 2;
  warningSymbol(backCardCentreX, top + 12, warningBoxSize, 24, 2.2);
  preciselyCenteredBoldText(backCardCentreX, top + 51, 14, 'WARNING');
  preciselyCenteredBoldText(
    backCardCentreX,
    top + 70,
    6.7,
    'UNLAWFUL REMOVAL OR INTERFERENCE WITH THIS TAG',
  );
  preciselyCenteredBoldText(
    backCardCentreX,
    top + 82,
    6.7,
    'COULD MAKE YOU LIABLE TO PROSECUTION AND FINES',
  );
  top += 101;
  fill(GREEN);
  fillRect(backX, top, cardWidth, 23);
  centeredText(backX, top + 6, cardWidth, 7.6, 'MUST BE FILLED OUT BY AUTHORISED PERSON', true, '1 1 1');
  top += 23;

  const detailsX = backX + 8;
  const detailsWidth = cardWidth - 16;
  const backRows: Array<[string, string]> = [
    ['REQUESTED BY:', form.requestedBy],
    ['BUILT BY:', form.erectedBy],
    ['DATE:', form.dateErected],
    ['INSPECTED BY:', form.inspectedBy],
  ];
  fill(GREEN);
  fillRect(backX, top, cardWidth, 143);
  top += 5;
  const detailRowsTop = top;
  backRows.forEach(([label, value]) => {
    fill('1 1 1');
    fillRect(detailsX, top, detailsWidth, 22);
    drawText(detailsX + 6, top + 7, 6.7, label, true);
    drawText(detailsX + 78, top + 7, 7.1, clean(value, 34), true);
    stroke(GREEN);
    out.push('0.65 w');
    line(detailsX, top + 22, detailsX + detailsWidth, top + 22);
    top += 22;
  });
  fill('1 1 1');
  fillRect(detailsX, top, detailsWidth, 31);
  drawText(detailsX + 6, top + 10, 6.7, 'SIGNATURE:', true);
  out.push(...drawSignature(detailsX + 78, top + 1, detailsWidth - 84, 29, form.erectedBySignatureStrokes, true));
  // Draw the separators after every row fill so a following white cell can
  // never paint over the shared edge.
  stroke(GREEN);
  out.push('0.8 w');
  for (let index = 1; index <= backRows.length; index += 1) {
    line(detailsX, detailRowsTop + index * 22, detailsX + detailsWidth, detailRowsTop + index * 22);
  }
  top += 31;
  centeredText(backX, top + 7, cardWidth, 6.3, 'Built in accordance with AS/NZS 1576 & AS/NZS 4576', true, '1 1 1');
  top = cardTop + 101 + 23 + 143;

  fill('1 1 1');
  fillRect(backX, top, cardWidth, 25);
  centeredText(backX, top + 6, cardWidth, 10, 'COMPLIANCE NOTE', true);
  top += 25;
  const complianceHeader = 22;
  const complianceRow = 27;
  const dateWidth = 72;
  fill('1 1 1');
  fillRect(backX, top, cardWidth, complianceHeader + complianceRow * 8);
  stroke(GRID);
  out.push('0.5 w');
  line(backX, top, backX + cardWidth, top);
  line(backX + dateWidth, top, backX + dateWidth, top + complianceHeader + complianceRow * 8);
  centeredText(backX, top + 7, dateWidth, 6.8, 'DATE', true);
  centeredText(backX + dateWidth, top + 7, cardWidth - dateWidth, 6.8, 'NOTE', true);
  line(backX, top + complianceHeader, backX + cardWidth, top + complianceHeader);
  for (let index = 0; index < 8; index += 1) {
    const row = form.inspectionRecords[index] ?? ({date: '', note: ''} as InspectionRecordEntry);
    const rowTop = top + complianceHeader + index * complianceRow;
    line(backX, rowTop + complianceRow, backX + cardWidth, rowTop + complianceRow);
    centeredText(backX, rowTop + 9, dateWidth, 6.5, clean(row.date, 12), true);
    drawText(backX + dateWidth + 6, rowTop + 9, 6.3, clean(row.note, 44), true);
  }
  top += complianceHeader + complianceRow * 8;

  const photosHeight = cardTop + cardHeight - top;
  fill(YELLOW);
  fillRect(backX, top, cardWidth, photosHeight);
  stroke(YELLOW_BORDER);
  line(backX, top, backX + cardWidth, top);
  centeredText(backX, top + 6, cardWidth, 8, 'SITE PHOTOS', true);
  const photoTop = top + 21;
  const photoGap = 6;
  const photoWidth = (cardWidth - 16 - photoGap) / 2;
  const photoHeight = Math.max(20, photosHeight - 28);
  for (let slot = 0; slot < 2; slot += 1) {
    const photoX = backX + 8 + slot * (photoWidth + photoGap);
    fill('1 1 1');
    fillRect(photoX, photoTop, photoWidth, photoHeight);
    const photo = photoBySlot.get(slot);
    if (photo) {
      out.push(drawImageCover(photo, photoX, y(photoTop, photoHeight), photoWidth, photoHeight));
    } else {
      stroke(YELLOW_BORDER);
      out.push('0.5 w');
      strokeRect(photoX, photoTop, photoWidth, photoHeight);
    }
  }

  // The perimeter is intentionally the final painted layer. Drawing it here
  // prevents full-width headers, tables and photo panels from covering it.
  stroke(GREEN);
  out.push('1.25 w');
  strokeRect(frontX + 0.65, cardTop + 0.65, cardWidth - 1.3, cardHeight - 1.3);
  stroke(YELLOW_BORDER);
  strokeRect(backX + 0.65, cardTop + 0.65, cardWidth - 1.3, cardHeight - 1.3);

  out.push('Q');
  const content = out.join('\n');
  const encoder = new TextEncoder();
  const imageObjectStart = 7;
  const imageObjectNumbers = images.map((_, index) => imageObjectStart + index);
  const xObjects = images
    .map((image, index) => `/${image.name} ${imageObjectNumbers[index]} 0 R`)
    .join(' ');
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${xObjects ? ` /XObject << ${xObjects} >>` : ''} >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    ...images.map((image, index) => {
      const hex = bytesToHex(image.bytes);
      return `${imageObjectNumbers[index]} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${encoder.encode(hex).length} >>\nstream\n${hex}\nendstream\nendobj\n`;
    }),
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(object => {
    offsets.push(encoder.encode(pdf).length);
    pdf += object;
  });
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}
