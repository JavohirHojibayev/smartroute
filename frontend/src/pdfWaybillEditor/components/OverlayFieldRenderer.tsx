import { useLayoutEffect, useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type { WaybillFieldDefinition, WaybillPageCalibration } from '../types';
import { pdfToViewportRect } from '../utils/coordinates';

type OverlayFieldRendererProps = {
  pageNumber: number;
  pageHeight: number;
  fields: WaybillFieldDefinition[];
  values: Record<string, string>;
  onChange: (fieldKey: string, value: string) => void;
  calibration?: WaybillPageCalibration;
  readOnly?: boolean;
};

export const OverlayFieldRenderer = ({
  pageNumber,
  pageHeight,
  fields,
  values,
  onChange,
  calibration,
  readOnly = false,
}: OverlayFieldRendererProps) => {
  const pageFields = fields.filter((field) => field.pageNumber === pageNumber && field.isActive);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageFields.map((field) => {
        const rect = pdfToViewportRect(field.bboxPdf, pageHeight, calibration);
        const fieldLabel = field.label ?? field.fieldKey;

        const commonProps = {
          value: values[field.fieldKey] ?? '',
          disabled: readOnly,
          onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field.fieldKey, event.target.value),
          title: fieldLabel,
          'aria-label': fieldLabel,
          placeholder: fieldLabel,
          className:
            'pointer-events-auto w-full h-full rounded border border-blue-500/50 bg-blue-50/40 text-[11px] text-slate-900 px-1 outline-none focus:border-blue-600',
        };

        return (
          <OverlayBox key={field.fieldKey} left={rect.left} top={rect.top} width={rect.width} height={rect.height} title={fieldLabel}>
            {field.fieldType === 'textarea' ? (
              <textarea {...commonProps} />
            ) : field.fieldType === 'checkbox' ? (
              <input
                type="checkbox"
                checked={values[field.fieldKey] === 'true'}
                disabled={readOnly}
                title={fieldLabel}
                aria-label={fieldLabel}
                onChange={(event) => onChange(field.fieldKey, String(event.target.checked))}
                className="pointer-events-auto w-full h-full accent-blue-600"
              />
            ) : (
              <input
                type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                {...commonProps}
              />
            )}
          </OverlayBox>
        );
      })}
    </div>
  );
};

type OverlayBoxProps = {
  left: number;
  top: number;
  width: number;
  height: number;
  title: string;
  children: ReactNode;
};

const OverlayBox = ({ left, top, width, height, title, children }: OverlayBoxProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.style.left = `${left}px`;
    ref.current.style.top = `${top}px`;
    ref.current.style.width = `${width}px`;
    ref.current.style.height = `${height}px`;
  }, [left, top, width, height]);

  return (
    <div ref={ref} className="absolute" title={title}>
      {children}
    </div>
  );
};
