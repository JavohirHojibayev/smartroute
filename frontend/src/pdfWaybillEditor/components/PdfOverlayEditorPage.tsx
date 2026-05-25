import { useMemo, useState } from 'react';
import type { PdfPageMetrics } from '../types';
import { exportFilledPdf } from '../utils/pdfExport';
import { printPdfBlob } from '../utils/print';
import { useFieldDefinitions } from '../hooks/useFieldDefinitions';
import { useWaybillDraft } from '../hooks/useWaybillDraft';
import { CalibrationLayer } from './CalibrationLayer';
import { OverlayFieldRenderer } from './OverlayFieldRenderer';
import { PdfDocumentRenderer } from './PdfDocumentRenderer';

type PdfOverlayEditorPageProps = {
  templatePdfUrl: string;
  onClose?: () => void;
};

export const PdfOverlayEditorPage = ({ templatePdfUrl, onClose }: PdfOverlayEditorPageProps) => {
  const [zoom, setZoom] = useState(1.2);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pageMetricsMap, setPageMetricsMap] = useState<Record<number, PdfPageMetrics>>({});
  const {
    fields,
    setFields,
    calibrations,
    calibrationByPage,
    save: saveDefinitions,
    loading: fieldsLoading,
  } = useFieldDefinitions();
  const { values, updateValue, saving, forceSave, loading: draftLoading } = useWaybillDraft();

  const upsertMetric = (metric: PdfPageMetrics) => {
    setPageMetricsMap((prev) => {
      if (prev[metric.pageNumber]?.width === metric.width && prev[metric.pageNumber]?.height === metric.height) {
        return prev;
      }
      return { ...prev, [metric.pageNumber]: metric };
    });
  };

  const saveCalibration = async () => {
    await saveDefinitions(fields, calibrations);
    setCalibrationMode(false);
  };

  const handleExport = async (printAfter = false) => {
    setExporting(true);
    try {
      await forceSave();
      const blob = await exportFilledPdf({
        templatePdfUrl,
        fields,
        values,
        calibrations,
        fileName: `waybill-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      if (printAfter) {
        printPdfBlob(blob);
      }
    } finally {
      setExporting(false);
    }
  };

  const pageNumbers = useMemo(() => Object.keys(pageMetricsMap).map((item) => Number(item)).sort((a, b) => a - b), [pageMetricsMap]);

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700/60 bg-slate-900/60 px-2 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.max(0.6, Number((prev - 0.1).toFixed(2))))}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
          >
            -
          </button>
          <span className="text-xs text-slate-300 min-w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.min(2.5, Number((prev + 0.1).toFixed(2))))}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
          >
            +
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCalibrationMode((prev) => !prev)}
            className={`rounded px-2 py-1 text-xs font-semibold ${calibrationMode ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-200'}`}
          >
            Calibration
          </button>
          {calibrationMode ? (
            <button
              type="button"
              onClick={() => void saveCalibration()}
              className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-black"
            >
              Save fields
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleExport(false)}
            disabled={exporting}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => void handleExport(true)}
            disabled={exporting}
            className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Print
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      <div className="text-[11px] text-slate-400 flex items-center justify-between">
        <span>{fieldsLoading || draftLoading ? 'Yuklanmoqda...' : 'Tayyor'}</span>
        <span>{saving ? 'Autosave...' : 'Autosave synced'}</span>
      </div>

      <div className="flex-1 min-h-0">
        <PdfDocumentRenderer pdfUrl={templatePdfUrl} zoom={zoom}>
          {({ pageNumber, width, height }) => {
            upsertMetric({ pageNumber, width, height });
            return (
              <>
                <OverlayFieldRenderer
                  pageNumber={pageNumber}
                  pageHeight={height}
                  fields={fields}
                  values={values}
                  onChange={updateValue}
                  calibration={calibrationByPage.get(pageNumber)}
                  readOnly={calibrationMode}
                />
                {calibrationMode ? (
                  <CalibrationLayer
                    pageNumber={pageNumber}
                    pageHeight={height}
                    fields={fields}
                    onFieldsChange={setFields}
                    calibration={calibrationByPage.get(pageNumber)}
                  />
                ) : null}
              </>
            );
          }}
        </PdfDocumentRenderer>
      </div>
      <div className="text-[10px] text-slate-500">
        Pages: {pageNumbers.length > 0 ? pageNumbers.join(', ') : '-'}
      </div>
    </div>
  );
};
