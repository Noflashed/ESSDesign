import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

const LABEL_WIDTH_MM = 63;
const LABEL_HEIGHT_MM = 100;
const LABEL_BLEED_MM = 2;
const PDF_WIDTH_MM = LABEL_WIDTH_MM + (LABEL_BLEED_MM * 2);
const PDF_HEIGHT_MM = LABEL_HEIGHT_MM + (LABEL_BLEED_MM * 2);
const LABEL_CENTER_X_MM = LABEL_BLEED_MM + (LABEL_WIDTH_MM / 2);
const CUT_CONTOUR_INSET_MM = 0.09;
const CUT_CONTOUR_STROKE_MM = 0.25;
const PRINTER_SAMPLE_PAGE_WIDTH_MM = 95.72;
const BATCH_OUTER_MARGIN_MM = (PRINTER_SAMPLE_PAGE_WIDTH_MM - PDF_WIDTH_MM) / 2;
// The sample repeats 104 mm bleed tiles on a 105.587 mm pitch.
const BATCH_TILE_GAP_MM = 1.587;
// Keeps each PDF page below the standard 14,400 pt media-box limit.
const MAX_LABELS_PER_VERTICAL_SHEET = 45;

// Brand orange supplied for the print artwork: rgb(243, 102, 33). The narrow
// top accent uses a restrained tint of the same colour to preserve its detail.
const LABEL_ORANGE = [243, 102, 33];
const LABEL_ORANGE_HIGHLIGHT = [245, 125, 66];
const LABEL_INK = ['0', '0', '0', '0.93'];
const LABEL_OFF_WHITE = ['0', '0.008', '0.008', '0'];

const imageDataCache = new Map();

export function registerCutContourSpotColor(pdf) {
    // jsPDF does not expose a public API for Separation colour spaces. Add the
    // named spot colour to the shared resource dictionary while it is written.
    // The placeholder dictionary keeps jsPDF's own /XObject dictionary balanced.
    pdf.internal.events.subscribe('putXobjectDict', () => {
        pdf.internal.write('>>');
        pdf.internal.write('/ColorSpace <<');
        pdf.internal.write('/CutContour [/Separation /CutContour /DeviceCMYK <<');
        pdf.internal.write('/FunctionType 2 /Domain [0 1]');
        pdf.internal.write('/C0 [0 0 0 0] /C1 [0 1 0 0] /N 1');
        pdf.internal.write('>>]');
        pdf.internal.write('>>');
        pdf.internal.write('/ESSCutContourResource <<');
    });
}

export function drawCutContour(pdf, offsetX = 0, offsetY = 0) {
    // The cutter reads the case-sensitive CutContour spot-colour name. The
    // magenta alternate colour is only an on-screen preview of that cut path.
    pdf.internal.write('q');
    pdf.internal.write('/CutContour CS');
    pdf.internal.write('1 SCN');
    pdf.setLineWidth(CUT_CONTOUR_STROKE_MM);
    pdf.rect(
        offsetX + LABEL_BLEED_MM + CUT_CONTOUR_INSET_MM,
        offsetY + LABEL_BLEED_MM + CUT_CONTOUR_INSET_MM,
        LABEL_WIDTH_MM - (CUT_CONTOUR_INSET_MM * 2),
        LABEL_HEIGHT_MM - (CUT_CONTOUR_INSET_MM * 2),
        'S'
    );
    pdf.internal.write('Q');
}

async function loadLogo(url) {
    if (imageDataCache.has(url)) return imageDataCache.get(url);

    const promise = fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`Could not load label logo (${response.status})`);
            return response.blob();
        })
        .then(blob => new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = image.naturalWidth;
                    canvas.height = image.naturalHeight;
                    const context = canvas.getContext('2d', { willReadFrequently: true });
                    context.drawImage(image, 0, 0);

                    resolve({
                        dataUrl: canvas.toDataURL('image/png'),
                        width: image.naturalWidth,
                        height: image.naturalHeight,
                    });
                } catch (error) {
                    reject(error);
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Could not decode the label logo.'));
            };
            image.src = objectUrl;
        }));

    imageDataCache.set(url, promise);
    return promise;
}

function companyDetails(companyEntityId) {
    if (companyEntityId === 'maloo') {
        return {
            name: 'MALOO ACCESS GROUP',
            logoUrl: 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/MALOO%20LOGO.png',
            logoMaxWidth: 31,
            logoMaxHeight: 10.2,
        };
    }
    return {
        name: 'ERECT SAFE SCAFFOLDING',
        logoUrl: 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png',
        logoMaxWidth: 18.4,
        logoMaxHeight: 10.2,
    };
}

function drawCenteredImage(pdf, image, centerX, top, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const left = centerX - (width / 2);
    const y = top + ((maxHeight - height) / 2);
    pdf.addImage(image.dataUrl, 'PNG', left, y, width, height, undefined, 'FAST');
}

function drawCenteredSpacedText(pdf, text, centerX, y, charSpace) {
    // jsPDF's built-in center alignment measures the glyphs but does not add
    // character spacing to that width. Offset by half of the added spacing so
    // the rendered text, rather than only its unspaced glyph box, is centred.
    const spacingWidth = charSpace * Math.max(0, text.length - 1);
    pdf.setCharSpace(charSpace);
    pdf.text(text, centerX - (spacingWidth / 2), y, { align: 'center' });
    pdf.setCharSpace(0);
}

function drawLabelBase(pdf, offsetX = 0, offsetY = 0) {
    // Extend the edge colours through the 2 mm bleed while keeping the
    // original 63 x 100 mm label artwork centred inside the cut boundary.
    pdf.setFillColor(...LABEL_ORANGE);
    pdf.rect(offsetX, offsetY, PDF_WIDTH_MM, PDF_HEIGHT_MM, 'F');

    pdf.setFillColor(...LABEL_ORANGE_HIGHLIGHT);
    pdf.rect(offsetX, offsetY, PDF_WIDTH_MM, LABEL_BLEED_MM + 2.2, 'F');

    pdf.setFillColor(...LABEL_OFF_WHITE);
    pdf.roundedRect(offsetX + LABEL_BLEED_MM + 8.5, offsetY + LABEL_BLEED_MM + 4.8, 46, 13.2, 2.5, 2.5, 'F');

    pdf.setFillColor(...LABEL_INK);
    pdf.rect(
        offsetX,
        offsetY + LABEL_BLEED_MM + 87.5,
        PDF_WIDTH_MM,
        PDF_HEIGHT_MM - (LABEL_BLEED_MM + 87.5),
        'F'
    );
}

async function drawLabel(pdf, label, offsetX = 0, offsetY = 0) {
    const company = companyDetails(label.companyEntityId);
    const logo = await loadLogo(company.logoUrl);
    const qrData = await QRCode.toDataURL(label.publicUrl, {
        errorCorrectionLevel: 'Q',
        margin: 0,
        // Short label URLs produce a 33-module Version 4 symbol. Rendering at
        // an exact multiple of 33 keeps every printed module equally sized.
        width: 990,
        color: { dark: '#000000', light: '#FFFFFF' },
    });

    drawLabelBase(pdf, offsetX, offsetY);

    drawCenteredImage(
        pdf,
        logo,
        offsetX + LABEL_CENTER_X_MM,
        offsetY + LABEL_BLEED_MM + 6.3,
        company.logoMaxWidth,
        company.logoMaxHeight
    );

    pdf.setTextColor(...LABEL_INK);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.4);
    drawCenteredSpacedText(pdf, 'DIGITAL SCAFF-TAG', offsetX + LABEL_CENTER_X_MM, offsetY + LABEL_BLEED_MM + 24.05, 0.1);

    pdf.setFillColor(...LABEL_INK);
    pdf.roundedRect(offsetX + LABEL_BLEED_MM + 15.7, offsetY + LABEL_BLEED_MM + 25.4, 31.6, 4.7, 2.35, 2.35, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7.5);
    drawCenteredSpacedText(pdf, 'SCAN TO OPEN', offsetX + LABEL_CENTER_X_MM, offsetY + LABEL_BLEED_MM + 28.75, 0.12);

    // A 28 mm symbol spans about 66 degrees of a 48.8 mm scaffold tube rather
    // than the 124 degrees covered by the former 53 mm symbol. This keeps all
    // three finder patterns visible while retaining a four-module quiet zone.
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(offsetX + LABEL_BLEED_MM + 14, offsetY + LABEL_BLEED_MM + 32.5, 35, 35, 1.5, 1.5, 'F');
    pdf.addImage(qrData, 'PNG', offsetX + LABEL_BLEED_MM + 17.5, offsetY + LABEL_BLEED_MM + 36, 28, 28, undefined, 'FAST');

    pdf.setTextColor(...LABEL_INK);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12.6);
    drawCenteredSpacedText(pdf, 'LIVE SCAFF-TAG', offsetX + LABEL_CENTER_X_MM, offsetY + LABEL_BLEED_MM + 77.56, 0.08);

    pdf.setFontSize(5.55);
    drawCenteredSpacedText(pdf, 'STATUS | INSPECTIONS | PHOTOS', offsetX + LABEL_CENTER_X_MM, offsetY + LABEL_BLEED_MM + 80.76, 0.12);

    pdf.setTextColor(...LABEL_ORANGE);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15.5);
    drawCenteredSpacedText(pdf, label.displayNumber, offsetX + LABEL_CENTER_X_MM, offsetY + LABEL_BLEED_MM + 95.45, 0.37);

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(4.9);
    drawCenteredSpacedText(pdf, 'PERMANENT LABEL ID', offsetX + LABEL_CENTER_X_MM, offsetY + LABEL_BLEED_MM + 97.82, 0.35);

    drawCutContour(pdf, offsetX, offsetY);
}

function verticalBatchPageSize(labelCount) {
    return {
        width: (BATCH_OUTER_MARGIN_MM * 2) + PDF_WIDTH_MM,
        height: (BATCH_OUTER_MARGIN_MM * 2)
            + (labelCount * PDF_HEIGHT_MM)
            + (Math.max(0, labelCount - 1) * BATCH_TILE_GAP_MM),
    };
}

export async function createScaffTagLabelPdf(labels) {
    if (!Array.isArray(labels) || labels.length === 0) {
        throw new Error('No QR labels were selected for printing.');
    }
    const isContinuousBatch = labels.length > 1;
    const firstSheetLabelCount = isContinuousBatch
        ? Math.min(labels.length, MAX_LABELS_PER_VERTICAL_SHEET)
        : 1;
    const firstPageSize = isContinuousBatch
        ? verticalBatchPageSize(firstSheetLabelCount)
        : { width: PDF_WIDTH_MM, height: PDF_HEIGHT_MM };
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [firstPageSize.width, firstPageSize.height],
        compress: true,
        putOnlyUsedFonts: true,
    });

    if (!isContinuousBatch) {
        await drawLabel(pdf, labels[0]);
    } else {
        for (let sheetStart = 0; sheetStart < labels.length; sheetStart += MAX_LABELS_PER_VERTICAL_SHEET) {
            const sheetLabels = labels.slice(sheetStart, sheetStart + MAX_LABELS_PER_VERTICAL_SHEET);
            if (sheetStart > 0) {
                const pageSize = verticalBatchPageSize(sheetLabels.length);
                pdf.addPage([pageSize.width, pageSize.height], 'portrait');
            }

            for (let index = 0; index < sheetLabels.length; index += 1) {
                const offsetY = BATCH_OUTER_MARGIN_MM + (index * (PDF_HEIGHT_MM + BATCH_TILE_GAP_MM));
                await drawLabel(pdf, sheetLabels[index], BATCH_OUTER_MARGIN_MM, offsetY);
            }
        }
    }

    // jsPDF registers its image XObject resource callback lazily on the first
    // addImage call. Register CutContour afterwards so logo/QR mappings remain
    // inside /XObject rather than being written into our placeholder dictionary.
    registerCutContourSpotColor(pdf);

    return pdf;
}

export async function downloadScaffTagLabelPdf(labels) {
    const orderedLabels = [...labels].sort((left, right) => left.labelNumber - right.labelNumber);
    const pdf = await createScaffTagLabelPdf(orderedLabels);
    const first = orderedLabels[0].displayNumber;
    const last = orderedLabels.at(-1).displayNumber;
    pdf.save(`ESS-Scaff-Tag-Labels-${first}-${last}.pdf`);
}
