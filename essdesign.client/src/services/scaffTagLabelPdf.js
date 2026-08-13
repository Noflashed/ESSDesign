import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

const LABEL_WIDTH_MM = 63;
const LABEL_HEIGHT_MM = 100;
const LABEL_CENTER_X_MM = LABEL_WIDTH_MM / 2;

const ESS_GREEN = [12, 127, 75];
const ESS_YELLOW = [255, 202, 24];
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

function drawLabelBase(pdf) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, LABEL_WIDTH_MM, LABEL_HEIGHT_MM, 'F');

    // Two clean brand bands replace the former decorative frame and side rail.
    pdf.setFillColor(...ESS_GREEN);
    pdf.rect(0, 0, LABEL_WIDTH_MM, 1.8, 'F');
    pdf.setFillColor(...ESS_YELLOW);
    pdf.rect(0, 1.8, LABEL_WIDTH_MM, 0.9, 'F');

    pdf.setFillColor(...ESS_GREEN);
    pdf.rect(0, 90, LABEL_WIDTH_MM, 10, 'F');
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
        3.6,
        Math.max(company.logoMaxWidth, 39),
        14.4
    );

    pdf.setTextColor(...ESS_GREEN);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.3);
    drawCenteredSpacedText(pdf, company.name, LABEL_CENTER_X_MM, 20.8, 0.2);

    // A 28 mm symbol spans about 66 degrees of a 48.8 mm scaffold tube rather
    // than the 124 degrees covered by the former 53 mm symbol. This keeps all
    // three finder patterns visible while retaining a four-module quiet zone.
    pdf.setFillColor(255, 255, 255);
    pdf.rect(14, 32.5, 35, 35, 'F');
    pdf.addImage(qrData, 'PNG', 17.5, 36, 28, 28, undefined, 'FAST');

    pdf.setFillColor(...ESS_YELLOW);
    pdf.rect(0, 87.5, LABEL_WIDTH_MM, 1.2, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.6);
    pdf.setCharSpace(0.15);
    pdf.text('DIGITAL SCAFF-TAG', 3.2, 96.2);
    pdf.setCharSpace(0);

    pdf.setFillColor(248, 248, 248);
    pdf.roundedRect(45.2, 92.2, 15.6, 5.7, 2.85, 2.85, 'F');
    pdf.setTextColor(...DEEP_GREEN);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.8);
    drawCenteredSpacedText(pdf, label.displayNumber, 53, 95.7, 0.15);
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
