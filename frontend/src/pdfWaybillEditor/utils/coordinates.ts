import type { PdfBBox, WaybillPageCalibration } from '../types';

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const getCalibration = (calibration?: WaybillPageCalibration) => ({
  offsetX: calibration?.offsetX ?? 0,
  offsetY: calibration?.offsetY ?? 0,
  scaleX: calibration?.scaleX ?? 1,
  scaleY: calibration?.scaleY ?? 1,
});

export const pdfToViewportRect = (
  bbox: PdfBBox,
  pageHeight: number,
  calibration?: WaybillPageCalibration,
): ViewportRect => {
  const c = getCalibration(calibration);
  const left = (bbox.x + c.offsetX) * c.scaleX;
  const width = bbox.width * c.scaleX;
  const bottom = (bbox.y + c.offsetY) * c.scaleY;
  const height = bbox.height * c.scaleY;
  const top = pageHeight - (bottom + height);
  return { left, top, width, height };
};

export const viewportToPdfRect = (
  rect: ViewportRect,
  pageHeight: number,
  calibration?: WaybillPageCalibration,
): PdfBBox => {
  const c = getCalibration(calibration);
  const x = rect.left / c.scaleX - c.offsetX;
  const width = rect.width / c.scaleX;
  const height = rect.height / c.scaleY;
  const bottom = pageHeight - (rect.top + rect.height);
  const y = bottom / c.scaleY - c.offsetY;
  return { x, y, width, height };
};
