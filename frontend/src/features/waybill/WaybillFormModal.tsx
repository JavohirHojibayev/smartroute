import { X, Download as DownloadIcon, Loader2, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState, useEffect } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

type WaybillFormModalProps = {
    open: boolean;
    onClose: () => void;
    templatePdfUrl: string;
    initialValues?: Record<string, string>;
    signedBy?: string;
    signedAt?: string;
    isApproved?: boolean;
    autoDownload?: boolean;
};

export const WaybillFormModal = ({ open, onClose, templatePdfUrl, initialValues, signedBy, signedAt, isApproved, autoDownload }: WaybillFormModalProps) => {
    const svgRefMedical = useRef<SVGSVGElement>(null);
    const svgRefWaybill = useRef<SVGSVGElement>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const driverName = initialValues?.name || initialValues?.haydovchi || '';
    const tabNo = initialValues?.passId || initialValues?.tabNo || '';
    const time = initialValues?.time || '';

    const searchParam = tabNo ? encodeURIComponent(tabNo) : encodeURIComponent(driverName);
    const qrUrlMedical = initialValues?.esmoQrData || (typeof window !== 'undefined' ? `${window.location.origin}/?tab=medical&search=${searchParam}` : '');
    const qrUrlWaybill = initialValues?.eImzoQrData || (typeof window !== 'undefined' ? `${window.location.origin}/?tab=waybills&search=${searchParam}` : '');

    const formatSignedDate = (isoStr?: string) => {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        if (Number.isNaN(d.getTime())) return isoStr;
        const pad = (v: number) => String(v).padStart(2, '0');
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    useEffect(() => {
        if (!open || !svgRefMedical.current || !svgRefWaybill.current) {
            if (!open) {
                setPdfPreviewUrl(null);
            }
            return;
        }

        let isCancelled = false;

        const generatePdf = async () => {
            setIsGenerating(true);
            try {
                const getPngDataUrl = async (svgElement: SVGSVGElement) => {
                    const svgData = new XMLSerializer().serializeToString(svgElement);
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    const img = new Image();

                    return await new Promise<string>((resolve, reject) => {
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
                };

                // Capture current refs to satisfy TypeScript inside the async callback
                const medicalSvg = svgRefMedical.current;
                const waybillSvg = svgRefWaybill.current;
                if (!medicalSvg || !waybillSvg) return;

                // Generate QR code PNGs
                const pngDataUrlMedical = await getPngDataUrl(medicalSvg);
                const pngDataUrlWaybill = await getPngDataUrl(waybillSvg);

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

                // Embed Times Roman font
                const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

                // Initialize timeStr for later use
                const timeStr = time ? time : "Noma'lum";

                // Draw "Yo'l varaqasi" title centered below the header
                const title = "YO'L VARAQASI";
                const titleFontSize = 14;
                const titleWidth = fontTimesBold.widthOfTextAtSize(title, titleFontSize);
                firstPage.drawText(title, {
                    x: (width - titleWidth) / 2,
                    y: 665,
                    size: titleFontSize,
                    font: fontTimesBold,
                    color: rgb(0, 0, 0),
                });

                // Embed Times Roman normal font
                const fontTimesNormal = await pdfDoc.embedFont(StandardFonts.TimesRoman);

                // Draw 1C Trip Data
                const has1cData = initialValues?.plate && initialValues.plate !== '-';

                let currentY = 644;
                const marginLeft = 75; // ~2.6 cm
                const marginRight = 35; // ~1.2 cm

                if (has1cData) {
                    const details = [
                        { label: 'Marshrut:', value: initialValues?.route || '-' },
                        { label: 'Avtomobil:', value: initialValues?.plate || '-' },
                        { label: 'Yuk nomi:', value: initialValues?.cargo || '-' },
                        { label: "Yuk og'irligi:", value: initialValues?.weight || '-' }
                    ];
                    for (const detail of details) {
                        firstPage.drawText(detail.label, { x: marginLeft, y: currentY, size: 14, font: fontTimesBold, color: rgb(0, 0, 0) });
                        firstPage.drawText(detail.value, { x: marginLeft + 100, y: currentY, size: 14, font: fontTimesNormal, color: rgb(0, 0, 0) });
                        currentY -= 21; // 1.5 line spacing
                    }
                } else {
                    firstPage.drawText("Yo'l varaqasi ma'lumotlari shakllantirilmagan", {
                        x: marginLeft,
                        y: currentY,
                        size: 14,
                        font: fontTimesNormal,
                        color: rgb(0, 0, 0)
                    });
                    currentY = 525; // Keep the bottom line at the same fixed position
                }

                // Draw a horizontal line to separate the 1C details from the QR code section
                firstPage.drawLine({
                    start: { x: marginLeft, y: currentY - 5 },
                    end: { x: width - marginRight, y: currentY - 5 },
                    thickness: 1.5,
                    color: rgb(0, 0, 0),
                });

                // ===== ESMO QR Code Section =====
                const qrImageMedical = await pdfDoc.embedPng(pngDataUrlMedical);
                const qrSize = 70;
                const qrX = (width - qrSize) / 2;
                const qrYMedical = 440;

                // Reusable function to draw a "Not Approved" / "Rejected" placeholder (Red cross with corners)
                const drawPlaceholder = (yPos: number) => {
                    const cx = qrX + qrSize / 2;
                    const cy = yPos + qrSize / 2;
                    const cornerLen = 15;
                    const cornerColor = rgb(0.5, 0.6, 0.65); // Muted blue-gray

                    // Draw 4 corners
                    firstPage.drawLine({ start: { x: qrX, y: yPos + qrSize }, end: { x: qrX + cornerLen, y: yPos + qrSize }, thickness: 2, color: cornerColor });
                    firstPage.drawLine({ start: { x: qrX, y: yPos + qrSize }, end: { x: qrX, y: yPos + qrSize - cornerLen }, thickness: 2, color: cornerColor });
                    firstPage.drawLine({ start: { x: qrX + qrSize, y: yPos + qrSize }, end: { x: qrX + qrSize - cornerLen, y: yPos + qrSize }, thickness: 2, color: cornerColor });
                    firstPage.drawLine({ start: { x: qrX + qrSize, y: yPos + qrSize }, end: { x: qrX + qrSize, y: yPos + qrSize - cornerLen }, thickness: 2, color: cornerColor });
                    firstPage.drawLine({ start: { x: qrX, y: yPos }, end: { x: qrX + cornerLen, y: yPos }, thickness: 2, color: cornerColor });
                    firstPage.drawLine({ start: { x: qrX, y: yPos }, end: { x: qrX, y: yPos + cornerLen }, thickness: 2, color: cornerColor });
                    firstPage.drawLine({ start: { x: qrX + qrSize, y: yPos }, end: { x: qrX + qrSize - cornerLen, y: yPos }, thickness: 2, color: cornerColor });
                    firstPage.drawLine({ start: { x: qrX + qrSize, y: yPos }, end: { x: qrX + qrSize, y: yPos + cornerLen }, thickness: 2, color: cornerColor });

                    // Draw Red X
                    const crossSize = 12;
                    const crossColor = rgb(0.85, 0.1, 0.1);
                    firstPage.drawLine({ start: { x: cx - crossSize, y: cy - crossSize }, end: { x: cx + crossSize, y: cy + crossSize }, thickness: 4, color: crossColor });
                    firstPage.drawLine({ start: { x: cx - crossSize, y: cy + crossSize }, end: { x: cx + crossSize, y: cy - crossSize }, thickness: 4, color: crossColor });
                };

                const esmoPassed = initialValues?.statusCode === 'passed';

                if (!esmoPassed) {
                    drawPlaceholder(qrYMedical);
                } else {
                    firstPage.drawImage(qrImageMedical, {
                        x: qrX,
                        y: qrYMedical,
                        width: qrSize,
                        height: qrSize,
                    });
                }

                // ESMO Left text
                const leftTextMedical = "Xodimning tibbiy ko'rik natijasi";
                firstPage.drawText(leftTextMedical, {
                    x: 50,
                    y: qrYMedical + (qrSize / 2) - 4,
                    size: 12,
                    font: fontTimesBold,
                    color: rgb(0, 0, 0),
                });

                // ESMO Right text (Time)
                firstPage.drawText(timeStr, {
                    x: qrX + qrSize + 45,
                    y: qrYMedical + (qrSize / 2) - 4,
                    size: 12,
                    font: fontTimesBold,
                    color: rgb(0, 0, 0),
                });

                // ===== E-IMZO QR Code Section =====
                const eimzoStartY = qrYMedical - 20;
                const qrYWaybill = eimzoStartY - 10 - qrSize;

                if (isApproved && signedBy) {
                    const qrImageWaybill = await pdfDoc.embedPng(pngDataUrlWaybill);
                    firstPage.drawImage(qrImageWaybill, {
                        x: qrX,
                        y: qrYWaybill,
                        width: qrSize,
                        height: qrSize,
                    });

                    // Wrap long names to fit on the left side
                    const maxLeftWidth = qrX - 50 - 10;
                    const leftFontSize = 11;
                    const leftWords = signedBy.split(' ');
                    const leftLines: string[] = [];
                    let currentLeftLine = '';
                    for (const word of leftWords) {
                        const testLine = currentLeftLine ? `${currentLeftLine} ${word}` : word;
                        if (fontTimesBold.widthOfTextAtSize(testLine, leftFontSize) > maxLeftWidth && currentLeftLine) {
                            leftLines.push(currentLeftLine);
                            currentLeftLine = word;
                        } else {
                            currentLeftLine = testLine;
                        }
                    }
                    if (currentLeftLine) leftLines.push(currentLeftLine);

                    const leftTextBlockHeight = leftLines.length * (leftFontSize + 3);
                    const leftTextStartY = qrYWaybill + (qrSize / 2) + (leftTextBlockHeight / 2) - leftFontSize;
                    leftLines.forEach((line, i) => {
                        firstPage.drawText(line, {
                            x: 50,
                            y: leftTextStartY - i * (leftFontSize + 3),
                            size: leftFontSize,
                            font: fontTimesBold,
                            color: rgb(0, 0, 0),
                        });
                    });

                    // Draw right text (signed date)
                    const rightLabel = signedAt ? formatSignedDate(signedAt) : '';
                    if (rightLabel) {
                        firstPage.drawText(rightLabel, {
                            x: qrX + qrSize + 45,
                            y: qrYWaybill + (qrSize / 2) - 4,
                            size: 12,
                            font: fontTimesBold,
                            color: rgb(0, 0, 0),
                        });
                    }
                } else {
                    // Draw "Not Approved" placeholder instead of QR code
                    drawPlaceholder(qrYWaybill);

                    // Left text indicating not approved
                    const leftText = "E-imzo orqali tasdiqlanmagan";
                    firstPage.drawText(leftText, {
                        x: 50,
                        y: qrYWaybill + (qrSize / 2) - 4,
                        size: 12,
                        font: fontTimesBold,
                        color: rgb(0, 0, 0),
                    });
                }

                // Save and generate preview URL
                const pdfBytes = await pdfDoc.save();
                if (isCancelled) return;

                const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
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
    }, [open, driverName, time, templatePdfUrl, isApproved, signedBy, signedAt]);

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

    useEffect(() => {
        if (pdfPreviewUrl && autoDownload) {
            handleDownloadPdf();
            onClose();
        }
    }, [pdfPreviewUrl, autoDownload, driverName, onClose]);

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${autoDownload ? 'opacity-0 pointer-events-none' : ''}`}>
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
                        {isApproved && (
                            <div className="inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <ShieldCheck size={14} />
                                Tasdiqlangan
                            </div>
                        )}
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
                    {/* Hidden QR Codes to generate PNGs */}
                    <div className="hidden">
                        <QRCodeSVG
                            value={qrUrlMedical}
                            size={256}
                            bgColor={"#ffffff"}
                            fgColor={"#000066"}
                            level={"L"}
                            includeMargin={false}
                            ref={svgRefMedical}
                        />
                        <QRCodeSVG
                            value={qrUrlWaybill}
                            size={256}
                            bgColor={"#ffffff"}
                            fgColor={"#003300"}
                            level={"L"}
                            includeMargin={false}
                            ref={svgRefWaybill}
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
