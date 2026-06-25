import { X, Download as DownloadIcon, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState, useEffect } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

type WaybillFormModalProps = {
    open: boolean;
    onClose: () => void;
    templatePdfUrl: string;
    initialValues?: Record<string, string>;
};

export const WaybillFormModal = ({ open, onClose, templatePdfUrl, initialValues }: WaybillFormModalProps) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const driverName = initialValues?.haydovchi || '';
    const tabNo = initialValues?.tabNo || '';
    const time = initialValues?.time || '';
    
    const searchParam = tabNo ? encodeURIComponent(tabNo) : encodeURIComponent(driverName);
    const qrUrl = typeof window !== 'undefined' ? `${window.location.origin}/?tab=medical&search=${searchParam}` : '';

    useEffect(() => {
        if (!open || !svgRef.current) {
            if (!open) {
                setPdfPreviewUrl(null);
            }
            return;
        }

        let isCancelled = false;
        
        const generatePdf = async () => {
            setIsGenerating(true);
            try {
                // Generate QR code PNG
                const svgData = new XMLSerializer().serializeToString(svgRef.current!);
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const img = new Image();
                
                const pngDataUrl = await new Promise<string>((resolve, reject) => {
                    img.onload = () => {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        if (ctx) {
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0);
                        }
                        resolve(canvas.toDataURL("image/png"));
                    };
                    img.onerror = reject;
                    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
                });

                if (isCancelled) return;

                // Fetch template PDF
                const existingPdfBytes = await fetch(templatePdfUrl).then(res => res.arrayBuffer());
                const pdfDoc = await PDFDocument.load(existingPdfBytes);
                
                // Remove all pages except the first one
                while (pdfDoc.getPageCount() > 1) {
                    pdfDoc.removePage(1);
                }

                const firstPage = pdfDoc.getPage(0);
                const { width } = firstPage.getSize();

                // Cover everything below the header to completely erase old text and the old line
                firstPage.drawRectangle({
                    x: 0,
                    y: 0,
                    width: width,
                    height: 702,
                    color: rgb(1, 1, 1),
                });

                // Redraw the horizontal line cleanly
                firstPage.drawLine({
                    start: { x: 45, y: 696 },
                    end: { x: width - 45, y: 696 },
                    thickness: 1.5,
                    color: rgb(0, 0, 0),
                });

                // Embed Times Roman font
                const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

                // Draw ESMO Time on the top right
                const timeStr = time ? time : "Noma'lum";
                const topTimeWidth = fontTimesBold.widthOfTextAtSize(timeStr, 12);
                firstPage.drawText(timeStr, {
                    x: width - 50 - topTimeWidth,
                    y: 680,
                    size: 12,
                    font: fontTimesBold,
                    color: rgb(0, 0, 0),
                });

                // Draw "Yo'l varaqasi" title centered below the header
                const title = "Yo'l varaqasi";
                const titleWidth = fontTimesBold.widthOfTextAtSize(title, 14);
                firstPage.drawText(title, {
                    x: (width - titleWidth) / 2,
                    y: 640,
                    size: 14,
                    font: fontTimesBold,
                    color: rgb(0, 0, 0),
                });

                // Draw a horizontal line to separate the QR code section
                firstPage.drawLine({
                    start: { x: 45, y: 620 },
                    end: { x: width - 45, y: 620 },
                    thickness: 1.5,
                    color: rgb(0, 0, 0),
                });

                // Embed QR Code PNG
                const qrImage = await pdfDoc.embedPng(pngDataUrl);
                const qrSize = 70;
                const qrX = (width - qrSize) / 2;
                const qrY = 530;

                firstPage.drawImage(qrImage, {
                    x: qrX,
                    y: qrY,
                    width: qrSize,
                    height: qrSize,
                });

                // Draw left text
                const leftText = "Xodimning tibbiy ko'rik natijasi";
                firstPage.drawText(leftText, {
                    x: 50,
                    y: qrY + (qrSize / 2) - 4,
                    size: 12,
                    font: fontTimesBold,
                    color: rgb(0, 0, 0),
                });

                // Draw right text (Time)
                firstPage.drawText(timeStr, {
                    x: qrX + qrSize + 20,
                    y: qrY + (qrSize / 2) - 4,
                    size: 12,
                    font: fontTimesBold,
                    color: rgb(0, 0, 0),
                });

                // Save and generate preview URL
                const pdfBytes = await pdfDoc.save();
                if (isCancelled) return;
                
                const blob = new Blob([pdfBytes], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                setPdfPreviewUrl(url);

            } catch (error) {
                console.error("Error generating PDF:", error);
            } finally {
                if (!isCancelled) {
                    setIsGenerating(false);
                }
            }
        };

        const timeout = setTimeout(() => {
            generatePdf();
        }, 100);

        return () => {
            isCancelled = true;
            clearTimeout(timeout);
        };
    }, [open, driverName, time, templatePdfUrl]);

    useEffect(() => {
        return () => {
            if (pdfPreviewUrl) {
                URL.revokeObjectURL(pdfPreviewUrl);
            }
        };
    }, [pdfPreviewUrl]);

    if (!open) return null;

    const handleDownloadPdf = () => {
        if (!pdfPreviewUrl) return;
        const link = document.createElement('a');
        link.href = pdfPreviewUrl;
        link.download = `Yo'l_varaqasi_${driverName.replace(/\s+/g, '_')}.pdf`;
        link.click();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                onClick={onClose}
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                aria-label="Yopish"
            />

            <div className="relative flex flex-col w-full max-w-4xl h-[90vh] overflow-hidden border border-slate-700/60 bg-slate-900 rounded-2xl shadow-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-700/50 px-4 py-3 bg-slate-800/50">
                    <h3 className="text-sm font-semibold text-slate-100">
                        {driverName} — Yo'l varaqa
                    </h3>
                    
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={!pdfPreviewUrl || isGenerating}
                            className="inline-flex justify-center items-center gap-2 h-8 rounded-lg px-3 text-xs font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
                        >
                            <DownloadIcon size={14} />
                            PDF yuklash
                        </button>
                        <div className="w-px h-5 bg-slate-700/50"></div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-300 transition-colors"
                            aria-label="Yopish"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 bg-slate-950/50 p-3 overflow-hidden relative flex flex-col">
                    {/* Hidden QR Code to generate PNG */}
                    <div className="hidden">
                        <QRCodeSVG
                            value={qrUrl}
                            size={256}
                            bgColor={"#ffffff"}
                            fgColor={"#000000"}
                            level={"L"}
                            includeMargin={false}
                            ref={svgRef}
                        />
                    </div>
                    
                    {isGenerating && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-10">
                            <Loader2 className="animate-spin text-blue-500 mb-3" size={36} />
                            <div className="text-sm font-medium text-slate-300">PDF hujjat tayyorlanmoqda...</div>
                        </div>
                    )}

                    {pdfPreviewUrl && (
                        <iframe 
                            src={`${pdfPreviewUrl}#toolbar=0`} 
                            className="w-full h-full rounded-xl bg-white shadow-inner" 
                            title="PDF Preview"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
