import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfPageMetrics } from '../types';
import { PdfPageLayer } from './PdfPageLayer';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfDocumentRendererProps = {
  pdfUrl: string;
  zoom: number;
  children?: (params: { pageNumber: number; width: number; height: number }) => ReactNode;
};

type PdfPageData = {
  pageNumber: number;
  viewportWidth: number;
  viewportHeight: number;
  renderTask: Promise<HTMLCanvasElement>;
};

export const PdfDocumentRenderer = ({ pdfUrl, zoom, children }: PdfDocumentRendererProps) => {
  const [pages, setPages] = useState<PdfPageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const loadingTask = getDocument(pdfUrl);
        const doc = await loadingTask.promise;
        const pageDataPromises: Promise<PdfPageData>[] = [];

        for (let i = 1; i <= doc.numPages; i += 1) {
          pageDataPromises.push((async () => {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: zoom });
            const renderTask = (async () => {
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (!context) throw new Error('canvas_context_unavailable');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: context, viewport, canvas }).promise;
              return canvas;
            })();

            return {
              pageNumber: i,
              viewportWidth: viewport.width,
              viewportHeight: viewport.height,
              renderTask,
            };
          })());
        }

        const resolved = await Promise.all(pageDataPromises);
        if (!cancelled) setPages(resolved);
      } catch {
        if (!cancelled) setError('PDF rendering failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, zoom]);

  const metrics = useMemo<PdfPageMetrics[]>(
    () => pages.map((p) => ({ pageNumber: p.pageNumber, width: p.viewportWidth, height: p.viewportHeight })),
    [pages],
  );

  return (
    <div className="space-y-4 overflow-auto h-full pr-1">
      {loading ? <div className="text-xs text-slate-400">PDF yuklanmoqda...</div> : null}
      {error ? <div className="text-xs text-red-400">{error}</div> : null}
      {pages.map((page) => (
        <PdfPageLayer
          key={page.pageNumber}
          pageNumber={page.pageNumber}
          width={page.viewportWidth}
          height={page.viewportHeight}
          renderTask={page.renderTask}
        >
          {children?.({
            pageNumber: page.pageNumber,
            width: page.viewportWidth,
            height: page.viewportHeight,
          })}
        </PdfPageLayer>
      ))}
      <span className="hidden" data-pages={metrics.length} />
    </div>
  );
};
