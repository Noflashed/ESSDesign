import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

const LABEL_WIDTH_MM = 63;
const LABEL_HEIGHT_MM = 100;
const CONTENT_LEFT_MM = 3.3;
const CONTENT_WIDTH_MM = 58.2;
const LABEL_CENTER_X_MM = LABEL_WIDTH_MM / 2;

const ESS_GREEN = [12, 127, 75];
const ESS_YELLOW = [255, 202, 24];
const BORDER_GREEN_GREY = [218, 228, 222];
const DEEP_GREEN = [49, 68, 58];

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
            logoMaxWidth: 36.8,
            logoMaxHeight: 13.2,
        };
    }
    return {
        name: 'ERECT SAFE SCAFFOLDING',
        logoUrl: 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png',
        logoMaxWidth: 35.2,
        logoMaxHeight: 12.8,
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

function drawLabelFrame(pdf) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, LABEL_WIDTH_MM, LABEL_HEIGHT_MM, 'F');

    // Keep every colour layer inside the same rounded silhouette as the final
    // border so square fill corners cannot protrude at the label edges.
    pdf.saveGraphicsState();
    pdf.roundedRect(1.5, 1.5, 60, 97, 2.7, 2.7, null);
    pdf.clip();
    pdf.discardPath();

    // Industrial side rail. The light end caps mirror the header and keep the
    // darker section clear of the QR's required white quiet zone.
    pdf.setFillColor(...ESS_GREEN);
    pdf.rect(1.5, 1.5, 2, 97, 'F');
    pdf.setFillColor(...ESS_YELLOW);
    pdf.rect(1.5, 1.5, 2, 17.2, 'F');
    pdf.rect(1.5, 81.1, 2, 17.4, 'F');

    pdf.setFillColor(...ESS_YELLOW);
    pdf.rect(CONTENT_LEFT_MM, 1.5, CONTENT_WIDTH_MM, 5.4, 'F');
    pdf.setTextColor(...DEEP_GREEN);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.6);
    drawCenteredSpacedText(pdf, 'PRE-PRINTED DIGITAL LABEL', LABEL_CENTER_X_MM, 4.9, 0.25);

    pdf.setFillColor(...ESS_GREEN);
    pdf.rect(CONTENT_LEFT_MM, 87.1, CONTENT_WIDTH_MM, 11.4, 'F');

    pdf.restoreGraphicsState();

    pdf.setDrawColor(...ESS_GREEN);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(1.5, 1.5, 60, 97, 2.7, 2.7, 'S');
}

async function drawLabel(pdf, label) {
    const company = companyDetails(label.companyEntityId);
    const logo = await loadLogo(company.logoUrl);
    const qrData = await QRCode.toDataURL(label.publicUrl, {
        errorCorrectionLevel: 'H',
        margin: 0,
        width: 1000,
        color: { dark: '#000000', light: '#FFFFFF' },
    });

    drawLabelFrame(pdf);

    drawCenteredImage(
        pdf,
        logo,
        LABEL_CENTER_X_MM,
        8.4,
        company.logoMaxWidth,
        company.logoMaxHeight
    );

    pdf.setTextColor(...ESS_GREEN);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.6);
    drawCenteredSpacedText(pdf, company.name, LABEL_CENTER_X_MM, 24.6, 0.24);

    // The QR itself is deliberately untouched. A 4.2 mm physical quiet zone
    // surrounds the code to improve scanning when the label is on a curved tube.
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...BORDER_GREEN_GREY);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(7.7, 33, 47.6, 47.6, 1, 1, 'FD');
    pdf.addImage(qrData, 'PNG', 11.9, 37.2, 39.2, 39.2, undefined, 'FAST');

    pdf.setFillColor(...ESS_YELLOW);
    pdf.roundedRect(51.2, 84.8, 5.8, 1.2, 0.6, 0.6, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.1);
    pdf.setCharSpace(0.2);
    pdf.text('DIGITAL SCAFF-TAG', 6.4, 93.7);
    pdf.setCharSpace(0);

    pdf.setFillColor(248, 248, 248);
    pdf.setDrawColor(...ESS_GREEN);
    pdf.setLineWidth(0.18);
    pdf.roundedRect(44.2, 90.1, 14.1, 5.2, 2.6, 2.6, 'FD');
    pdf.setTextColor(...DEEP_GREEN);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.8);
    drawCenteredSpacedText(pdf, label.displayNumber, 51.25, 93.35, 0.15);
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
    const pdf = await createScaffTagLabelPdf(labels);
    const first = labels[0].displayNumber;
    const last = labels.at(-1).displayNumber;
    pdf.save(`ESS-Scaff-Tag-Labels-${first}-${last}.pdf`);
}
