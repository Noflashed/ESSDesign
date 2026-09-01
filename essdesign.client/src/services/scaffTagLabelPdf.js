import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

const LABEL_WIDTH_MM = 63;
const LABEL_HEIGHT_MM = 100;
const LABEL_CENTER_X_MM = LABEL_WIDTH_MM / 2;

// Printer-approved palette sampled from the supplied reference artwork.
const LABEL_ORANGE = [242, 83, 27];
const LABEL_ORANGE_HIGHLIGHT = [243, 104, 23];
const LABEL_INK = [50, 47, 48];
const LABEL_BORDER = [50, 47, 48];
const LABEL_OFF_WHITE = [255, 253, 252];

const imageDataCache = new Map();

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

function drawLabelBase(pdf) {
    pdf.setFillColor(...LABEL_ORANGE);
    pdf.rect(0, 0, LABEL_WIDTH_MM, LABEL_HEIGHT_MM, 'F');

    pdf.setFillColor(...LABEL_ORANGE_HIGHLIGHT);
    pdf.rect(0, 0, LABEL_WIDTH_MM, 2.2, 'F');

    pdf.setFillColor(...LABEL_OFF_WHITE);
    pdf.roundedRect(8.5, 4.8, 46, 13.2, 2.5, 2.5, 'F');

    pdf.setFillColor(...LABEL_INK);
    pdf.rect(0, 87.5, LABEL_WIDTH_MM, 12.5, 'F');
}

async function drawLabel(pdf, label) {
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

    drawLabelBase(pdf);

    drawCenteredImage(
        pdf,
        logo,
        LABEL_CENTER_X_MM,
        6.3,
        company.logoMaxWidth,
        company.logoMaxHeight
    );

    pdf.setTextColor(...LABEL_INK);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.4);
    drawCenteredSpacedText(pdf, 'DIGITAL SCAFF-TAG', LABEL_CENTER_X_MM, 24.05, 0.1);

    pdf.setFillColor(...LABEL_INK);
    pdf.roundedRect(15.7, 25.4, 31.6, 4.7, 2.35, 2.35, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7.5);
    drawCenteredSpacedText(pdf, 'SCAN TO OPEN', LABEL_CENTER_X_MM, 28.75, 0.12);

    // A 28 mm symbol spans about 66 degrees of a 48.8 mm scaffold tube rather
    // than the 124 degrees covered by the former 53 mm symbol. This keeps all
    // three finder patterns visible while retaining a four-module quiet zone.
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(14, 32.5, 35, 35, 1.5, 1.5, 'F');
    pdf.addImage(qrData, 'PNG', 17.5, 36, 28, 28, undefined, 'FAST');

    pdf.setTextColor(...LABEL_INK);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12.6);
    drawCenteredSpacedText(pdf, 'LIVE SCAFF-TAG', LABEL_CENTER_X_MM, 77.56, 0.08);

    pdf.setFontSize(5.55);
    drawCenteredSpacedText(pdf, 'STATUS | INSPECTIONS | PHOTOS', LABEL_CENTER_X_MM, 80.76, 0.12);

    pdf.setTextColor(...LABEL_ORANGE);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15.5);
    drawCenteredSpacedText(pdf, label.displayNumber, LABEL_CENTER_X_MM, 95.45, 0.37);

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(4.9);
    drawCenteredSpacedText(pdf, 'PERMANENT LABEL ID', LABEL_CENTER_X_MM, 97.82, 0.35);

    pdf.setDrawColor(...LABEL_BORDER);
    pdf.setLineWidth(0.18);
    pdf.rect(0.09, 0.09, LABEL_WIDTH_MM - 0.18, LABEL_HEIGHT_MM - 0.18, 'S');
}

export async function createScaffTagLabelPdf(labels) {
    if (!Array.isArray(labels) || labels.length === 0) {
        throw new Error('No QR labels were selected for printing.');
    }
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [LABEL_WIDTH_MM, LABEL_HEIGHT_MM],
        compress: true,
        putOnlyUsedFonts: true,
    });

    for (let index = 0; index < labels.length; index += 1) {
        if (index > 0) pdf.addPage([LABEL_WIDTH_MM, LABEL_HEIGHT_MM], 'portrait');
        await drawLabel(pdf, labels[index]);
    }

    return pdf;
}

export async function downloadScaffTagLabelPdf(labels) {
    const orderedLabels = [...labels].sort((left, right) => left.labelNumber - right.labelNumber);
    const pdf = await createScaffTagLabelPdf(orderedLabels);
    const first = orderedLabels[0].displayNumber;
    const last = orderedLabels.at(-1).displayNumber;
    pdf.save(`ESS-Scaff-Tag-Labels-${first}-${last}.pdf`);
}
