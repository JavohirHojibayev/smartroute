import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { WaybillFieldDefinition, WaybillPageCalibration } from '../types';

const escapeFileName = (value: string) => value.replace(/[^\w.-]+/g, '_');

export const exportFilledPdf = async (params: {
  templatePdfUrl: string;
  fields: WaybillFieldDefinition[];
  values: Record<string, string>;
  calibrations: WaybillPageCalibration[];
  fileName?: string;
}) => {
  const response = await fetch(params.templatePdfUrl);
  const bytes = await response.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const calMap = new Map<number, WaybillPageCalibration>();
  params.calibrations.forEach((item) => calMap.set(item.pageNumber, item));

  for (const field of params.fields) {
    const page = pdf.getPage(field.pageNumber - 1);
    if (!page) continue;
    const raw = params.values[field.fieldKey] ?? '';
    if (!raw && field.fieldType !== 'checkbox') continue;

    const c = calMap.get(field.pageNumber);
    const scaleX = c?.scaleX ?? 1;
    const scaleY = c?.scaleY ?? 1;
    const offsetX = c?.offsetX ?? 0;
    const offsetY = c?.offsetY ?? 0;
    const x = (field.bboxPdf.x + offsetX) * scaleX + 2;
    const y = (field.bboxPdf.y + offsetY) * scaleY + 2;
    const size = Number((field.renderStyle as Record<string, unknown> | null)?.fontSize ?? 10);

    if (field.fieldType === 'checkbox') {
      if (raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes') {
        page.drawText('X', { x, y, font, size: Math.max(10, size), color: rgb(0, 0, 0) });
      }
      continue;
    }

    page.drawText(raw, {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
      maxWidth: field.bboxPdf.width * scaleX - 4,
      lineHeight: size + 1,
    });
  }

  const output = await pdf.save();
  const stableOutput = Uint8Array.from(output);
  const blob = new Blob([stableOutput], { type: 'application/pdf' });
  const downloadName = escapeFileName(params.fileName ?? 'waybill-filled.pdf');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return blob;
};
