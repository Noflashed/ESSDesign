import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

const LABEL_WIDTH_MM = 63;
const LABEL_HEIGHT_MM = 100;
const CONTENT_LEFT_MM = 3.3;
const CONTENT_WIDTH_MM = 58.2;
const CONTENT_CENTER_X_MM = CONTENT_LEFT_MM + (CONTENT_WIDTH_MM / 2);

const DARK_GREY = [102, 102, 102];
const MID_GREY = [126, 126, 126];
const LIGHT_GREY = [196, 196, 196];
const BORDER_GREY = [218, 218, 218];
const TEXT_GREY = [61, 61, 61];

const imageDataCache = new Map();

async function loadGrayscaleLogo(url) {
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

                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const pixels = imageData.data;
                    for (let index = 0; index < pixels.length; index += 4) {
                        const luminance = Math.round(
                            (pixels[index] * 0.299) +
                            (pixels[index + 1] * 0.587) +
                            (pixels[index + 2] * 0.114)
                        );
                        pixels[index] = luminance;
                        pixels[index + 1] = luminance;
                        pixels[index + 2] = luminance;
                    }
                    context.putImageData(imageData, 0, 0);
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

function drawLabelFrame(pdf) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, LABEL_WIDTH_MM, LABEL_HEIGHT_MM, 'F');

    // Industrial side rail. The light end caps mirror the header and keep the
    // darker section clear of the QR's required white quiet zone.
    pdf.setFillColor(...DARK_GREY);
    pdf.rect(1.5, 1.5, 2, 97, 'F');
    pdf.setFillColor(...LIGHT_GREY);
    pdf.rect(1.5, 1.5, 2, 17.2, 'F');
    pdf.rect(1.5, 81.1, 2, 17.4, 'F');

    pdf.setFillColor(...LIGHT_GREY);
    pdf.rect(CONTENT_LEFT_MM, 1.5, CONTENT_WIDTH_MM, 5.4, 'F');
    pdf.setTextColor(28, 28, 28);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.6);
    pdf.setCharSpace(0.25);
    pdf.text('PRE-PRINTED DIGITAL LABEL', CONTENT_CENTER_X_MM, 4.9, { align: 'center' });
    pdf.setCharSpace(0);

    pdf.setFillColor(...DARK_GREY);
    pdf.rect(CONTENT_LEFT_MM, 87.1, CONTENT_WIDTH_MM, 11.4, 'F');

    pdf.setDrawColor(...DARK_GREY);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(1.5, 1.5, 60, 97, 2.7, 2.7, 'S');
}

async function drawLabel(pdf, label) {
    const company = companyDetails(label.companyEntityId);
    const logo = await loadGrayscaleLogo(company.logoUrl);
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
        CONTENT_CENTER_X_MM,
        8.4,
        company.logoMaxWidth,
        company.logoMaxHeight
    );

    pdf.setTextColor(...TEXT_GREY);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.6);
    pdf.setCharSpace(0.24);
    pdf.text(company.name, CONTENT_CENTER_X_MM, 24.6, { align: 'center' });
    pdf.setCharSpace(0);

    // The QR itself is deliberately untouched. A 4.2 mm physical quiet zone
    // surrounds the code to improve scanning when the label is on a curved tube.
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...BORDER_GREY);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(8.6, 33, 47.6, 47.6, 1, 1, 'FD');
    pdf.addImage(qrData, 'PNG', 12.8, 37.2, 39.2, 39.2, undefined, 'FAST');

    pdf.setFillColor(...LIGHT_GREY);
    pdf.roundedRect(51.2, 84.8, 5.8, 1.2, 0.6, 0.6, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.1);
    pdf.setCharSpace(0.2);
    pdf.text('DIGITAL SCAFF-TAG', 6.4, 93.7);
    pdf.setCharSpace(0);

    pdf.setFillColor(248, 248, 248);
    pdf.setDrawColor(...MID_GREY);
    pdf.setLineWidth(0.18);
    pdf.roundedRect(44.2, 90.1, 14.1, 5.2, 2.6, 2.6, 'FD');
    pdf.setTextColor(...TEXT_GREY);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.8);
    pdf.setCharSpace(0.15);
    pdf.text(label.displayNumber, 51.25, 93.35, { align: 'center' });
    pdf.setCharSpace(0);
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
