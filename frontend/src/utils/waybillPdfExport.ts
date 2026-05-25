import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { WAYBILL_PDF_LAYOUT } from '../data/waybillPdfLayout';

async function embedRoboto(pdf: PDFDocument): Promise<PDFFont> {
    return pdf.embedFont(StandardFonts.Helvetica);
}

/** Shablon sahifalari o‘zgarmaydi; faqat AcroForm text field qo‘shiladi. */
export async function buildFillableWaybillPdfBytes(templateBytes: Uint8Array): Promise<Uint8Array> {
    const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    const pages = pdf.getPages();
    if (pages.length === 0) throw new Error('PDF sahifalari topilmadi');

    const font = await embedRoboto(pdf);
    const form = pdf.getForm();

    for (let i = 0; i < WAYBILL_PDF_LAYOUT.length; i += 1) {
        const spec = WAYBILL_PDF_LAYOUT[i];
        const page = pages[spec.page];
        if (!page) continue;
        const { height } = page.getSize();
        const size = spec.size ?? 8;
        const fieldHeight = Math.max(size + 4, 10);
        const y = height - spec.yFromTop - fieldHeight * 0.75;
        const width = Math.max(spec.maxWidth ?? 120, 24);
        const field = form.createTextField(`wb_${i}_${spec.key}`);
        field.addToPage(page, {
            x: spec.x,
            y,
            width,
            height: fieldHeight,
            borderWidth: 0,
            textColor: rgb(0, 0, 0),
        });
        field.setFontSize(size);
        field.updateAppearances(font);
    }
    return pdf.save({ useObjectStreams: false });
}

export function triggerPdfDownload(bytes: Uint8Array, fileName: string) {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
