import { useMemo, useState } from 'react';
import type { WaybillFieldDefinition, WaybillPageCalibration } from '../types';
import { pdfToViewportRect, viewportToPdfRect } from '../utils/coordinates';

type CalibrationLayerProps = {
  pageNumber: number;
  pageHeight: number;
  fields: WaybillFieldDefinition[];
  onFieldsChange: (next: WaybillFieldDefinition[]) => void;
  calibration?: WaybillPageCalibration;
};

type DragState =
  | { mode: 'move'; fieldKey: string; startX: number; startY: number; originLeft: number; originTop: number }
  | { mode: 'resize'; fieldKey: string; startX: number; startY: number; originWidth: number; originHeight: number; originLeft: number; originTop: number }
  | null;

export const CalibrationLayer = ({
  pageNumber,
  pageHeight,
  fields,
  onFieldsChange,
  calibration,
}: CalibrationLayerProps) => {
  const [drag, setDrag] = useState<DragState>(null);
  const pageFields = useMemo(
    () => fields.filter((field) => field.pageNumber === pageNumber && field.isActive),
    [fields, pageNumber],
  );

  const updateFieldByRect = (fieldKey: string, rect: { left: number; top: number; width: number; height: number }) => {
    const next = fields.map((field) => {
      if (field.fieldKey !== fieldKey) return field;
      return {
        ...field,
        bboxPdf: viewportToPdfRect(rect, pageHeight, calibration),
      };
    });
    onFieldsChange(next);
  };

  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!drag) return;
    event.preventDefault();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === 'move') {
      const target = pageFields.find((item) => item.fieldKey === drag.fieldKey);
      if (!target) return;
      const base = pdfToViewportRect(target.bboxPdf, pageHeight, calibration);
      updateFieldByRect(drag.fieldKey, {
        left: Math.max(0, drag.originLeft + dx),
        top: Math.max(0, drag.originTop + dy),
        width: base.width,
        height: base.height,
      });
      return;
    }
    if (drag.mode === 'resize') {
      updateFieldByRect(drag.fieldKey, {
        left: drag.originLeft,
        top: drag.originTop,
        width: Math.max(20, drag.originWidth + dx),
        height: Math.max(14, drag.originHeight + dy),
      });
    }
  };

  const addField = () => {
    const fieldKey = `field_${Date.now()}`;
    const next: WaybillFieldDefinition[] = [
      ...fields,
      {
        fieldKey,
        label: fieldKey,
        pageNumber,
        fieldType: 'text',
        bboxPdf: viewportToPdfRect({ left: 40, top: 40, width: 120, height: 24 }, pageHeight, calibration),
        renderStyle: null,
        isActive: true,
      },
    ];
    onFieldsChange(next);
  };

  return (
    <div
      className="absolute inset-0 pointer-events-auto"
      onMouseMove={onMouseMove}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
    >
      <button
        type="button"
        onClick={addField}
        className="absolute right-2 top-2 z-20 rounded bg-amber-500 px-2 py-1 text-[10px] font-semibold text-black"
      >
        Add field
      </button>
      {pageFields.map((field) => {
        const rect = pdfToViewportRect(field.bboxPdf, pageHeight, calibration);
        return (
          <div
            key={field.fieldKey}
            className="absolute border border-amber-500 bg-amber-300/10"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          >
            <button
              type="button"
              className="absolute inset-0 w-full h-full cursor-move text-[10px] text-amber-300 text-left px-1"
              onMouseDown={(event) =>
                setDrag({
                  mode: 'move',
                  fieldKey: field.fieldKey,
                  startX: event.clientX,
                  startY: event.clientY,
                  originLeft: rect.left,
                  originTop: rect.top,
                })
              }
            >
              {field.label ?? field.fieldKey}
            </button>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 h-3 w-3 rounded bg-amber-500"
              onMouseDown={(event) => {
                event.stopPropagation();
                setDrag({
                  mode: 'resize',
                  fieldKey: field.fieldKey,
                  startX: event.clientX,
                  startY: event.clientY,
                  originLeft: rect.left,
                  originTop: rect.top,
                  originWidth: rect.width,
                  originHeight: rect.height,
                });
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
