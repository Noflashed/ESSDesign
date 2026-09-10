// Derived from ESSApp/src/services/preStartPdfRenderer.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import { PreStartForm } from '../models/preStart';
import { preStartDocumentValue } from '../models/preStartDocument';
import {
  preStartEditorPages,
  PRE_START_EDITOR_WIDTH,
  PRE_START_EDITOR_HEIGHTS,
} from '../models/preStartEditorLayout';

export type PreStartPdfImage = {
  name: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  slot?: number;
};
export type PreStartPdfBrand = {
  shortName: string;
  legalName: string;
  abn: string;
  officeAddress: string;
};
const W = 595.2;
const H = 841.8;
const M = 36;
export const PRE_START_PDF_LAYOUT_VERSION = 2;
// WinAnsi encoding keeps punctuation and accented names valid in the PDF's built-in fonts.
function pdfText(value: string): string {
  const special: Record<string, number> = {
    '€': 128,
    '‘': 145,
    '’': 146,
    '“': 147,
    '”': 148,
    '–': 150,
    '—': 151,
    '•': 149,
  };
  return Array.from(value)
    .map(c => {
      const code = special[c] ?? c.charCodeAt(0);
      if (code > 255) {
        return '?';
      }
      if (code > 126 || code < 32) {
        return `\\${code.toString(8).padStart(3, '0')}`;
      }
      return /[\\()]/.test(c) ? `\\${c}` : c;
    })
    .join('');
}
// Standard Helvetica WinAnsi advance widths, in 1/1000 em, keep wrapping faithful to the exported font.
const FONT_WIDTHS = [
  [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
    278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
    584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
    833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
    278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
    500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
    500, 334, 260, 334, 584, 761, 556, 761, 222, 556, 333, 1000, 556, 556, 333,
    1000, 667, 333, 1000, 761, 611, 761, 761, 222, 222, 333, 333, 350, 556,
    1000, 333, 1000, 500, 333, 944, 761, 500, 667, 278, 333, 556, 556, 556, 556,
    260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333,
    556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667,
    667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778,
    778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556,
    556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556,
    556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
  ],
  [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
    278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
    584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
    833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
    278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
    556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
    500, 389, 280, 389, 584, 761, 556, 761, 278, 556, 500, 1000, 556, 556, 333,
    1000, 667, 333, 1000, 761, 611, 761, 761, 278, 278, 500, 500, 350, 556,
    1000, 333, 1000, 556, 333, 944, 761, 500, 667, 278, 333, 556, 556, 556, 556,
    280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333,
    611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722,
    722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778,
    778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556,
    556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611,
    611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
  ],
] as const;
function textWidth(value: string, size: number, bold = false): number {
  const encoded = pdfText(value)
    .replace(/\\([0-7]{3})/g, (_, octal) =>
      String.fromCharCode(parseInt(octal, 8)),
    )
    .replace(/\\([\\()])/g, '$1');
  return (
    (Array.from(encoded).reduce(
      (width, char) =>
        width + (FONT_WIDTHS[bold ? 1 : 0][char.charCodeAt(0) - 32] || 556),
      0,
    ) *
      size) /
    1000
  );
}
export function wrapPreStartPdfText(
  value: string,
  width: number,
  size = 10,
  bold = false,
): string[] {
  return String(value || '')
    .split('\n')
    .flatMap(paragraph => {
      const lines: string[] = [];
      let rest = paragraph;
      while (textWidth(rest, size, bold) > width) {
        let end = 1;
        while (
          end < rest.length &&
          textWidth(rest.slice(0, end + 1), size, bold) <= width
        ) {
          end++;
        }
        const space = rest.lastIndexOf(' ', end);
        const split = space > 0 ? space : end;
        lines.push(rest.slice(0, split));
        rest = rest.slice(split).replace(/^ /, '');
      }
      lines.push(rest);
      return lines;
    });
}
const rgb = (hex: string) =>
  [1, 3, 5]
    .map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .join(' ');
export function buildPreStartPdf(
  form: PreStartForm,
  brand: PreStartPdfBrand,
  images: PreStartPdfImage[] = [],
): string {
  const pages: string[][] = [];
  const overflow: Array<{ label: string; lines: string[] }> = [];
  let canvasHeight = H;
  const text = (
    page: string[],
    x: number,
    y: number,
    value: string,
    size = 10,
    bold = false,
    color = '#111111',
  ) => {
    page.push(
      `${rgb(color)} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${
        canvasHeight - y - size
      } Tm (${pdfText(value)}) Tj ET`,
    );
  };
  const shape = (
    x: number,
    y: number,
    width: number,
    height: number,
    radius = 0,
  ) => {
    const bottom = canvasHeight - y - height;
    if (!radius) {
      return `${x} ${bottom} ${width} ${height} re`;
    }
    const r = Math.min(radius, width / 2, height / 2),
      c = r * 0.55228475;
    const right = x + width,
      top = bottom + height;
    return `${x + r} ${bottom} m ${right - r} ${bottom} l ${
      right - r + c
    } ${bottom} ${right} ${bottom + r - c} ${right} ${bottom + r} c ${right} ${
      top - r
    } l ${right} ${top - r + c} ${right - r + c} ${top} ${right - r} ${top} c ${
      x + r
    } ${top} l ${x + r - c} ${top} ${x} ${top - r + c} ${x} ${top - r} c ${x} ${
      bottom + r
    } l ${x} ${bottom + r - c} ${x + r - c} ${bottom} ${x + r} ${bottom} c h`;
  };
  const image = (
    page: string[],
    img: PreStartPdfImage,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const scale = Math.min(width / img.width, height / img.height),
      w = img.width * scale,
      h = img.height * scale;
    page.push(
      `q ${w} 0 0 ${h} ${x + (width - w) / 2} ${
        canvasHeight - y - (height + h) / 2
      } cm /${img.name} Do Q`,
    );
  };
  preStartEditorPages(brand).forEach((nodes, index) => {
    canvasHeight = PRE_START_EDITOR_HEIGHTS[index];
    const scale = Math.min(W / PRE_START_EDITOR_WIDTH, H / canvasHeight);
    const page = [
      `q ${scale} 0 0 ${scale} ${(W - PRE_START_EDITOR_WIDTH * scale) / 2} ${
        (H - canvasHeight * scale) / 2
      } cm`,
    ];
    pages.push(page);
    nodes.forEach(node => {
      const { x, y, width, height } = node;
      const value = preStartDocumentValue(form, node.key);
      // Editing shortcuts and empty-field prompts are not part of the signed document.
      if (node.kind === 'action') {
        return;
      }
      if (node.kind === 'box' || node.kind === 'choice') {
        const number = node.key === 'preStartNumberBox',
          pill = node.key === 'swmsWarningPill';
        const fill =
          node.kind === 'choice'
            ? value === node.choice
              ? '#CDCFD3'
              : '#F7F7F7'
            : node.fill;
        const outline = number
          ? '#F04438'
          : pill
          ? '#FCA5A5'
          : node.kind === 'choice'
          ? '#111111'
          : '#C6C6C6';
        const path = shape(x, y, width, height, pill ? 11 : 0);
        if (fill) {
          page.push(`${rgb(fill)} rg ${path} f`);
        }
        page.push(
          `${number || pill || node.kind === 'choice' ? 1 : 0.6} w ${rgb(
            outline,
          )} RG ${path} S`,
        );
      }
      if (node.kind === 'text') {
        let size = node.size || 10;
        let lines = wrapPreStartPdfText(
          node.label || '',
          width,
          size,
          node.bold,
        );
        while (
          lines.length * size * 1.2 > height + 1 &&
          size > (node.size || 10) * 0.8
        ) {
          size *= 0.95;
          lines = wrapPreStartPdfText(node.label || '', width, size, node.bold);
        }
        lines.forEach((line, i) =>
          text(page, x, y + i * size * 1.2, line, size, node.bold, node.color),
        );
      }
      if (node.kind === 'field') {
        const number = node.key === 'preStartNumber',
          foreman = node.key === 'areaForeman';
        let size = number ? 8.5 : node.size || 10;
        const content = String(value || (number ? 'DRAFT' : ''));
        const inset = foreman ? 8 : number ? 1 : 0;
        const availableWidth = width - inset * 2;
        if (!node.multiline) {
          while (textWidth(content, size, true) > availableWidth && size > 8) {
            size = Math.max(8, size - 0.5);
          }
        }
        const lines = wrapPreStartPdfText(content, availableWidth, size, true);
        const capacity = Math.max(1, Math.floor(height / (size * 1.2)));
        const hasOverflow = lines.length > capacity;
        const visible = lines.slice(0, capacity);
        if (hasOverflow) {
          const marker = ' [see notes]';
          let last = visible[visible.length - 1];
          while (
            last &&
            textWidth(last + marker, size, true) > availableWidth
          ) {
            last = last.slice(0, -1);
          }
          visible[visible.length - 1] = last + marker;
          overflow.push({
            label: node.label || node.key || 'Details',
            lines: wrapPreStartPdfText(content, W - M * 2, 10),
          });
        }
        visible.forEach((line, i) =>
          text(
            page,
            number ? x + (width - textWidth(line, size, true)) / 2 : x + inset,
            y +
              (node.multiline ? 0 : Math.max(0, (height - size * 1.2) / 2)) +
              i * size * 1.2,
            line,
            size,
            true,
          ),
        );
      }
      if (node.kind === 'choice') {
        const label = node.choice ? 'Yes' : 'No',
          size = 9;
        text(
          page,
          x + (width - textWidth(label, size)) / 2,
          y + (height - size * 1.2) / 2,
          label,
          size,
          false,
          '#6B7280',
        );
      }
      if (node.kind === 'logo') {
        const logo = images.find(img => img.name === 'Logo');
        if (logo) {
          image(page, logo, x, y, width, height);
        } else {
          text(page, x, y, brand.shortName, 28, true);
        }
      }
      if (node.kind === 'photo') {
        const photo = images.find(img => img.slot === node.index);
        if (photo) {
          image(page, photo, x, y, width, height);
        }
      }
      if (node.kind === 'signature') {
        const signatureScale = Math.min(width / 200, height / 70);
        const signatureWidth = 200 * signatureScale,
          signatureHeight = 70 * signatureScale;
        const signatureX = x + (width - signatureWidth) / 2,
          signatureY = y + (height - signatureHeight) / 2;
        page.push(
          `q ${shape(x, y, width, height)} W n 0.067 0.067 0.067 RG ${
            2 * signatureScale
          } w 1 J 1 j`,
        );
        (form.attendees[node.index!]?.signatureStrokes || []).forEach(
          stroke => {
            if (stroke.length < 2) {
              return;
            }
            page.push(
              stroke
                .map(
                  (point, i) =>
                    `${
                      signatureX +
                      Math.max(0, Math.min(1, point.x)) * signatureWidth
                    } ${
                      canvasHeight -
                      signatureY -
                      Math.max(0, Math.min(1, point.y)) * signatureHeight
                    } ${i ? 'l' : 'm'}`,
                )
                .join(' ') + ' S',
            );
          },
        );
        page.push('Q');
      }
    });
    page.push('Q');
  });
  canvasHeight = H;
  if (overflow.length) {
    let page: string[] = [],
      y = 0;
    const next = () => {
      page = [];
      pages.push(page);
      text(
        page,
        M,
        60,
        `${brand.shortName} DAILY PRE-START - CONTINUATION`,
        15,
        true,
      );
      text(
        page,
        M,
        85,
        `Pre-Start ${form.preStartNumber || 'DRAFT'} | ${form.date}`,
        10,
      );
      y = 120;
    };
    next();
    overflow.forEach(section => {
      if (y > H - 100) {
        next();
      }
      text(page, M, y, section.label, 11, true);
      y += 22;
      // Re-wrap for the continuation page's full width, retaining line breaks.
      section.lines.forEach(line => {
        if (y > H - 70) {
          next();
          text(page, M, y, `${section.label} (continued)`, 11, true);
          y += 22;
        }
        text(page, M, y, line, 10);
        y += 14;
      });
      y += 18;
    });
  }
  pages
    .slice(2)
    .forEach((page, i) =>
      text(
        page,
        W / 2 - 70,
        H - 24,
        `${form.preStartNumber || 'DRAFT'} | Page ${i + 3} of ${pages.length}`,
        8,
      ),
    );
  return assemblePdf(pages, images);
}
function assemblePdf(pages: string[][], images: PreStartPdfImage[]): string {
  const objects: string[] = ['', '<< /Type /Catalog /Pages 2 0 R >>', ''];
  const add = (body: string) => {
    objects.push(body);
    return objects.length - 1;
  };
  const font1 = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const font2 = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  const imageRefs = images.map(img => {
    const hex =
      Array.from(img.bytes, b => b.toString(16).padStart(2, '0')).join('') +
      '>';
    const id = add(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length} >>\nstream\n${hex}\nendstream`,
    );
    return `/${img.name} ${id} 0 R`;
  });
  const pageIds = pages.map(commands => {
    const stream = commands.join('\n');
    const contents = add(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    return add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> /XObject << ${imageRefs.join(
        ' ',
      )} >> >> /Contents ${contents} 0 R >>`,
    );
  });
  objects[2] = `<< /Type /Pages /Kids [${pageIds
    .map(id => `${id} 0 R`)
    .join(' ')}] /Count ${pageIds.length} >>`;
  let result = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(result.length);
    result += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = result.length;
  result += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  result += offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  return (
    result +
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  );
}
