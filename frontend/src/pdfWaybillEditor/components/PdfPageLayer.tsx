import { useEffect, useRef } from 'react';

type PdfPageLayerProps = {
  pageNumber: number;
  width: number;
  height: number;
  renderTask: Promise<HTMLCanvasElement>;
  children?: React.ReactNode;
};

export const PdfPageLayer = ({ pageNumber, width, height, renderTask, children }: PdfPageLayerProps) => {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = canvasHostRef.current;
    if (!host) return;
    host.innerHTML = '';
    void renderTask.then((canvas) => {
      if (cancelled) return;
      host.innerHTML = '';
      host.appendChild(canvas);
    });
    return () => {
      cancelled = true;
    };
  }, [renderTask]);

  return (
    <div className="flex justify-center">
      <div className="relative shadow-2xl border border-slate-700/50" style={{ width, height }} data-page={pageNumber}>
        <div ref={canvasHostRef} className="absolute inset-0 bg-white" />
        <div className="absolute inset-0 pointer-events-none">{children}</div>
      </div>
    </div>
  );
};
