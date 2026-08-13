import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

const LABEL_WIDTH_MM = 63;
const LABEL_HEIGHT_MM = 100;
const ESS_GREEN = [5, 116, 64];
const ESS_YELLOW = [255, 211, 38];

const imageDataCache = new Map();

async function loadImageData(url) {
    if (imageDataCache.has(url)) return imageDataCache.get(url);
    const promise = fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`Could not load label logo (${response.status})`);
            return response.arrayBuffer();
        })
        .then(buffer => new Uint8Array(buffer));
    imageDataCache.set(url, promise);
    return promise;
}

function companyDetails(companyEntityId) {
    if (companyEntityId === 'maloo') {
        return {
            name: 'MALOO ACCESS GROUP',
            logoUrl: 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/MALOO%20LOGO.png',
        };
    }
    return {
        name: 'ERECT SAFE SCAFFOLDING',
        logoUrl: 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png',
    };
}

async function drawLabel(pdf, label) {
    const company = companyDetails(label.companyEntityId);
    const logoData = await loadImageData(company.logoUrl);
    const qrData = await QRCode.toDataURL(label.publicUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 900,
        color: { dark: '#07110C', light: '#FFFFFF' },
    });

    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, LABEL_WIDTH_MM, LABEL_HEIGHT_MM, 'F');
    pdf.setDrawColor(...ESS_GREEN);
    pdf.setLineWidth(1.1);
    pdf.roundedRect(1.7, 1.7, LABEL_WIDTH_MM - 3.4, LABEL_HEIGHT_MM - 3.4, 2.8, 2.8, 'S');

    pdf.setFillColor(246, 249, 247);
    pdf.roundedRect(4.5, 4.5, 54, 13.2, 2.2, 2.2, 'F');
    const isMaloo = label.companyEntityId === 'maloo';
    pdf.addImage(logoData, 'PNG', isMaloo ? 20 : 18, 6.3, isMaloo ? 23 : 27, 7.2, undefined, 'FAST');

    pdf.setTextColor(...ESS_GREEN);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.text(company.name, LABEL_WIDTH_MM / 2, 21.8, { align: 'center' });

    pdf.setDrawColor(212, 221, 216);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(6.2, 25, 50.6, 50.6, 2, 2, 'FD');
    pdf.addImage(qrData, 'PNG', 7.7, 26.5, 47.6, 47.6, undefined, 'FAST');

    pdf.setFillColor(15, 23, 42);
    pdf.roundedRect(12.8, 77.4, 37.4, 8.5, 2.1, 2.1, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13.5);
    pdf.text(label.displayNumber, LABEL_WIDTH_MM / 2, 83.1, { align: 'center' });

    pdf.setFillColor(...ESS_YELLOW);
    pdf.roundedRect(6.2, 88, 50.6, 7.2, 3.6, 3.6, 'F');
    pdf.setTextColor(22, 43, 32);
    pdf.setFontSize(7.1);
    pdf.text('LIVE DIGITAL SCAFF-TAG', LABEL_WIDTH_MM / 2, 92.7, { align: 'center' });

    pdf.setTextColor(94, 108, 100);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(4.4);
    pdf.text('Scan to view the current scaffold status and inspection record', LABEL_WIDTH_MM / 2, 97.1, { align: 'center' });
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
