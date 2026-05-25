import { ExternalLink, X } from 'lucide-react';
import { PdfOverlayEditorPage } from '../pdfWaybillEditor/components/PdfOverlayEditorPage';

type WaybillFormModalProps = {
    open: boolean;
    onClose: () => void;
    templatePdfUrl: string;
};

export const WaybillFormModal = ({ open, onClose, templatePdfUrl }: WaybillFormModalProps) => {
    const openBlankTemplate = () => {
        window.open(templatePdfUrl, '_blank', 'noopener,noreferrer');
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <button
                type="button"
                onClick={onClose}
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                aria-label="Yopish"
            />

            <div className="relative flex h-full w-full flex-col overflow-hidden border border-slate-700/60 bg-slate-900">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 px-3 py-2">
                    <h3 className="text-sm font-semibold text-slate-100">Yo&apos;l varaqa</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={openBlankTemplate}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                        >
                            <ExternalLink size={16} />
                            Yangi oynada tahrirlash
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300"
                            aria-label="Yopish"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2 flex flex-col gap-2">
                    <div className="flex-1 overflow-hidden border border-slate-600 bg-slate-950 shadow-inner p-2">
                        <PdfOverlayEditorPage templatePdfUrl={templatePdfUrl} onClose={onClose} />
                    </div>
                </div>
            </div>
        </div>
    );
};
