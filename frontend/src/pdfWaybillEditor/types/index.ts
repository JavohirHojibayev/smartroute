export type WaybillFieldType = 'text' | 'number' | 'date' | 'textarea' | 'checkbox';

export type PdfBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WaybillFieldDefinition = {
  fieldKey: string;
  label: string | null;
  pageNumber: number;
  fieldType: WaybillFieldType;
  bboxPdf: PdfBBox;
  renderStyle: Record<string, unknown> | null;
  isActive: boolean;
};

export type WaybillPageCalibration = {
  pageNumber: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
};

export type WaybillTemplatePayload = {
  templateKey: string;
  fields: WaybillFieldDefinition[];
  calibrations: WaybillPageCalibration[];
};

export type WaybillDraftPayload = {
  templateKey: string;
  values: Record<string, string>;
  updatedAt?: string;
};

export type PdfPageMetrics = {
  pageNumber: number;
  width: number;
  height: number;
};
