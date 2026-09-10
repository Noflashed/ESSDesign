// Derived from ESSApp/src/services/preStartPdfRenderer.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import { PreStartForm } from '../models/preStart';
import {
  preStartDocumentPages,
  preStartDocumentValue,
} from '../models/preStartDocument';

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
const W = 810;
const H = 1146;
const M = 64;
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
export function wrapPreStartPdfText(
  value: string,
  width: number,
  size = 10,
): string[] {
  const max = Math.max(1, Math.floor(width / (size * 0.56)));
  return String(value || '')
    .split('\n')
    .flatMap(paragraph => {
      const lines: string[] = [];
      let rest = paragraph;
      while (rest.length > max) {
        const space = rest.lastIndexOf(' ', max);
        const split = space > max / 3 ? space : max;
        lines.push(rest.slice(0, split));
        rest = rest.slice(split).replace(/^ /, '');
      }
      lines.push(rest);
      return lines;
    });
}
export function buildPreStartPdf(
  form: PreStartForm,
  brand: PreStartPdfBrand,
  images: PreStartPdfImage[] = [],
): string {
  const pages: string[][] = [];
  const overflow: Array<{ label: string; lines: string[] }> = [];
  const text = (
    page: string[],
    x: number,
    y: number,
    value: string,
    size = 10,
    bold = false,
  ) =>
    page.push(
      `0.08 0.08 0.08 rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${
        H - y - size
      } Tm (${pdfText(value)}) Tj ET`,
    );
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
      `q ${w} 0 0 ${h} ${x + (width - w) / 2} ${H - y - (height + h) / 2} cm /${
        img.name
      } Do Q`,
    );
  };
  preStartDocumentPages(brand).forEach(nodes => {
    const page: string[] = [];
    pages.push(page);
    nodes.forEach(node => {
      const { x, y, width, height } = node;
      const value = preStartDocumentValue(form, node.key);
      if (node.kind === 'box' || node.kind === 'choice') {
        if (node.fill) {
          const rgb = [1, 3, 5]
            .map(
              offset =>
                parseInt(node.fill!.slice(offset, offset + 2), 16) / 255,
            )
            .join(' ');
          page.push(`${rgb} rg ${x} ${H - y - height} ${width} ${height} re f`);
        }
        page.push(
          `0.5 w 0.65 0.65 0.65 RG ${x} ${
            H - y - height
          } ${width} ${height} re S`,
        );
      }
      if (node.kind === 'text') {
        const size = node.size || 10;
        wrapPreStartPdfText(node.label || '', width, size).forEach((line, i) =>
          text(page, x, y + i * size * 1.2, line, size, node.bold),
        );
      }
      if (node.kind === 'field') {
        const size = node.size || 10;
        const lines = wrapPreStartPdfText(
          String(value || (node.key === 'preStartNumber' ? 'DRAFT' : '')),
          width,
          size,
        );
        const capacity = Math.max(1, Math.floor(height / (size * 1.2)));
        const hasOverflow = lines.length > capacity;
        const visible = hasOverflow
          ? lines.slice(0, Math.max(0, capacity - 1))
          : lines;
        visible.forEach((line, i) =>
          text(page, x, y + i * size * 1.2, line, size, true),
        );
        if (hasOverflow) {
          text(
            page,
            x,
            y + Math.max(0, capacity - 1) * size * 1.2,
            '[Continued in attached notes]',
            Math.min(8, size),
          );
          overflow.push({ label: node.label || node.key || 'Details', lines });
        }
      }
      if (node.kind === 'choice') {
        text(page, x + 4, y + 5, node.choice ? 'Yes' : 'No', 8);
        if (value === node.choice) {
          page.push(
            `q 0.2 0.45 0.8 RG 1.2 w ${x + 4} ${H - y - 11} m ${x + 10} ${
              H - y - 16
            } l ${x + 21} ${H - y - 4} l S Q`,
          );
        }
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
        } else {
          text(
            page,
            x + width / 2 - 30,
            y + height / 2,
            `Site photo ${node.index! + 1}`,
            10,
          );
        }
      }
      if (node.kind === 'signature') {
        page.push('q 0.07 0.07 0.07 RG 0.8 w 1 J 1 j');
        (form.attendees[node.index!]?.signatureStrokes || []).forEach(
          stroke => {
            if (stroke.length < 2) {
              return;
            }
            page.push(
              stroke
                .map(
                  (point, i) =>
                    `${x + Math.max(0, Math.min(1, point.x)) * width} ${
                      H - y - Math.max(0, Math.min(1, point.y)) * height
                    } ${i ? 'l' : 'm'}`,
                )
                .join(' ') + ' S',
            );
          },
        );
        page.push('Q');
      }
    });
  });
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
  pages.forEach((page, i) =>
    text(
      page,
      300,
      H - 35,
      `${form.preStartNumber || 'DRAFT'} | Page ${i + 1} of ${pages.length}`,
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
