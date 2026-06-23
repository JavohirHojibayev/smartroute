import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Table2, FileText, CheckCircle2, HardHat, Clock, AlertTriangle, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from './LocalizedDateInput';
import yolVaraqasiPdfUrl from "../assets/yo'l_varaqasi.pdf?url";
import { WaybillFormModal } from './WaybillFormModal';

type EsmoHealthStatus = 'passed' | 'review' | 'failed';

type EsmoJournalRow = {
    id?: number;
    esmoId?: number;
    passId?: string;
    time?: string;
    name?: string;
    status?: string;
    statusCode?: string;
    bp?: string | null;
    bloodPressure?: string | null;
    pulse?: number | null;
    temperature?: number | null;
};

type WaybillRow = {
    id: string;
    driver: string;
    passId: string;
    healthStatus: EsmoHealthStatus;
    plate: string;
    cargo: string;
    weight: string;
    tripTime: string;
    tripState: string;
    sourceTime: string;
    eventMs: number;
    bp: string | null;
    pulse: number | null;
    temperature: number | null;
};

const API_BASE = resolveApiBaseUrl();

const normalizeWhitespace = (value: string | null | undefined) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeDriverKey = (value: string | null | undefined) => normalizeWhitespace(value).toLowerCase();

const getTodayTashkent = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tashkent',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';

    return `${year}-${month}-${day}`;
};

const normalizeEsmoStatus = (value: string | null | undefined): EsmoHealthStatus => {
    const raw = normalizeWhitespace(value).toLowerCase();
    if (raw === 'passed' || raw === "o'tdi" || raw === 'otdi' || raw === 'allowed') return 'passed';
    if (raw === 'review' || raw === "ko'rik" || raw === 'korik' || raw === 'manual_review') return 'review';
    return 'failed';
};

const statusRank = (status: EsmoHealthStatus) => {
    if (status === 'passed') return 3;
    if (status === 'review') return 2;
    return 1;
};

const parseTimeMs = (value: string | null | undefined) => {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
};

const cleanEmployeeName = (value: string, fallback: string) => {
    const raw = normalizeWhitespace(value);
    if (!raw) return fallback;
    return raw
        .replace(/^проверка\s+сотрудника\s+/i, '')
        .replace(/^РїСЂРѕРІРµСЂРєР°\s+СЃРѕС‚СЂСѓРґРЅРёРєР°\s+/i, '')
        .replace(/^proverka\s+sotrudnika\s+/i, '')
        .replace(/^employee\s+check\s+/i, '')
        .replace(/^xodim\s+tekshiruvi\s+/i, '')
        .trim();
};

const formatDateTime = (iso: string) => {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatNumber = (value: number | null | undefined, fractionDigits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return '-';
    const numeric = Number(value);
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(fractionDigits);
};

export const WaybillManager = () => {
    const { t, lang } = useI18n();
    const [waybills, setWaybills] = useState<WaybillRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [isWaybillFormOpen, setIsWaybillFormOpen] = useState(false);
    const [waybillFormInitialValues, setWaybillFormInitialValues] = useState<Record<string, string> | undefined>(undefined);
    
    const [headerFilter, setHeaderFilter] = useState<'ALL' | 'PASSED' | 'REVIEW' | 'FAILED'>('ALL');

    const tCols = {
        name: lang === 'uz' ? 'F.I.SH' : lang === 'ru' ? 'Ф.И.О' : 'Name',
        passId: lang === 'uz' ? 'ID raqam' : lang === 'ru' ? 'ID номер' : 'Pass ID',
        esmoTime: lang === 'uz' ? 'ESMO vaqti' : lang === 'ru' ? 'Время ESMO' : 'ESMO Time',
        esmoStatus: lang === 'uz' ? 'ESMO Xulosasi' : lang === 'ru' ? 'Заключение ESMO' : 'ESMO Status',
        status: lang === 'uz' ? 'Holat' : lang === 'ru' ? 'Статус' : 'Status',
    };

    const loadWaybills = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);

        try {
            const params = new URLSearchParams({ limit: '5000' });
            if (dateFrom) params.set('dateFrom', dateFrom);
            if (dateTo) params.set('dateTo', dateTo);

            const response = await fetch(`${API_BASE}/integrations/esmo/journal?${params.toString()}`);
            if (!response.ok) throw new Error('esmo_journal_failed');

            const payload = await response.json();
            const rows = Array.isArray(payload) ? (payload as EsmoJournalRow[]) : [];

            const waybillRows: WaybillRow[] = rows.map(row => {
                const driverName = cleanEmployeeName(String(row?.name || ''), t('unknownEmployee'));
                const passIdRaw = normalizeWhitespace(row?.passId);
                const healthStatus = normalizeEsmoStatus(row?.statusCode || row?.status);
                const eventMs = parseTimeMs(String(row?.time || ''));
                const bp = normalizeWhitespace(row?.bp || row?.bloodPressure || '') || null;
                const pulse = row?.pulse == null || Number.isNaN(Number(row.pulse)) ? null : Number(row.pulse);
                const temperature = row?.temperature == null || Number.isNaN(Number(row.temperature)) ? null : Number(row.temperature);
                
                return {
                    id: `ESMO-${row?.esmoId ?? row?.id ?? `${passIdRaw || 'unknown'}-${eventMs}`}`,
                    driver: driverName,
                    passId: passIdRaw || '-',
                    healthStatus,
                    plate: '-',
                    cargo: '-',
                    weight: '-',
                    tripTime: '-',
                    tripState: '-',
                    sourceTime: String(row?.time || ''),
                    eventMs,
                    bp,
                    pulse,
                    temperature,
                };
            }).sort((a, b) => b.eventMs - a.eventMs);

            setWaybills(waybillRows);
            setError(null);
        } catch {
            setError(t('esmoServerError'));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [dateFrom, dateTo, t]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setSearchQuery(searchInput);
            setCurrentPage(1);
        }, 300);
        return () => window.clearTimeout(timeout);
    }, [searchInput]);

    useEffect(() => {
        void loadWaybills(false);
    }, [loadWaybills]);

    useEffect(() => {
        const interval = setInterval(() => {
            void loadWaybills(true);
        }, 5000);
        return () => clearInterval(interval);
    }, [loadWaybills]);

    const filteredRows = useMemo(() => {
        const query = normalizeDriverKey(searchQuery);
        let result = waybills;

        if (headerFilter === 'PASSED') result = result.filter(r => r.healthStatus === 'passed');
        else if (headerFilter === 'REVIEW') result = result.filter(r => r.healthStatus === 'review');
        else if (headerFilter === 'FAILED') result = result.filter(r => r.healthStatus === 'failed');

        if (!query) return result;
        return result.filter((row) => {
            return (
                normalizeDriverKey(row.driver).includes(query) ||
                normalizeDriverKey(row.passId).includes(query)
            );
        });
    }, [waybills, searchQuery, headerFilter]);

    const allRowPairs = useMemo(() => {
        const pairs: [WaybillRow, WaybillRow | null][] = [];
        for (let i = 0; i < filteredRows.length; i += 2) {
            pairs.push([filteredRows[i], filteredRows[i + 1] || null]);
        }
        return pairs;
    }, [filteredRows]);

    const totalRowsCount = allRowPairs.length;
    const totalPages = Math.max(1, Math.ceil(totalRowsCount / rowsPerPage));

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const pagedRowPairs = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return allRowPairs.slice(start, start + rowsPerPage);
    }, [allRowPairs, currentPage, rowsPerPage]);

    const stats = useMemo(() => {
        const todayStr = getTodayTashkent();
        const isToday = (isoStr: string) => {
            if (!isoStr || isoStr === '-') return false;
            const date = new Date(isoStr);
            if (Number.isNaN(date.getTime())) return false;
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Tashkent',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).formatToParts(date);
            const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
            const month = parts.find((p) => p.type === 'month')?.value ?? '01';
            const day = parts.find((p) => p.type === 'day')?.value ?? '01';
            return `${year}-${month}-${day}` === todayStr;
        };
        const todayWaybills = waybills.filter(r => isToday(r.sourceTime));
        
        const bestByEmployee = new Map<string, { status: EsmoHealthStatus; rank: number; eventMs: number }>();
        for (const row of todayWaybills) {
            const key = row.passId !== '-' ? `pass:${row.passId}` : `name:${row.driver}`;
            const rank = statusRank(row.healthStatus);
            const existing = bestByEmployee.get(key);
            if (!existing || rank > existing.rank || (rank === existing.rank && row.eventMs > existing.eventMs)) {
                bestByEmployee.set(key, { status: row.healthStatus, rank, eventMs: row.eventMs });
            }
        }

        let passed = 0;
        let review = 0;
        let failed = 0;
        for (const entry of bestByEmployee.values()) {
            if (entry.status === 'passed') passed++;
            else if (entry.status === 'review') review++;
            else failed++;
        }
        
        return { total: bestByEmployee.size, passed, review, failed };
    }, [waybills]);

    const handleWidgetClick = (filterId: 'ALL' | 'PASSED' | 'REVIEW' | 'FAILED') => {
        setHeaderFilter(prev => prev === filterId ? 'ALL' : filterId);
        setCurrentPage(1);
    };

    const handleDownloadClick = (row: WaybillRow) => {
        setWaybillFormInitialValues({
            haydovchi: row.driver,
            tabNo: row.passId === '-' ? '' : row.passId
        });
        setIsWaybillFormOpen(true);
    };

    const statCards = [
        {
            id: 'total' as const,
            filterId: 'ALL' as const,
            title: lang === 'uz' ? 'Jami xodimlar' : lang === 'ru' ? 'Всего' : 'Total',
            value: String(stats.total),
            color: 'from-blue-500 to-cyan-400',
            icon: <HardHat />,
        },
        {
            id: 'passed' as const,
            filterId: 'PASSED' as const,
            title: lang === 'uz' ? 'Ruxsat etildi' : lang === 'ru' ? 'Допущено' : 'Allowed',
            value: String(stats.passed),
            color: 'from-emerald-500 to-teal-400',
            icon: <CheckCircle2 />,
        },
        {
            id: 'review' as const,
            filterId: 'REVIEW' as const,
            title: lang === 'uz' ? "Ko'rikda" : lang === 'ru' ? 'Осмотр' : 'Review',
            value: String(stats.review),
            color: 'from-amber-500 to-orange-400',
            icon: <Clock />,
        },
        {
            id: 'failed' as const,
            filterId: 'FAILED' as const,
            title: lang === 'uz' ? 'Rad etildi' : lang === 'ru' ? 'Отклонено' : 'Rejected',
            value: String(stats.failed),
            color: 'from-red-500 to-rose-400',
            icon: <AlertTriangle />,
        },
    ];

    const formatEsmoReadings = (row: WaybillRow): string => {
        const parts: string[] = [];
        if (row.bp) parts.push(row.bp);
        if (row.pulse != null) parts.push(`P:${formatNumber(row.pulse, 0)}`);
        if (row.temperature != null) parts.push(`${formatNumber(row.temperature)}°C`);
        return parts.length > 0 ? parts.join(' | ') : '-';
    };

    const downloadButtonClass = (status: EsmoHealthStatus) => {
        if (status === 'passed') return 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400';
        if (status === 'review') return 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400';
        return 'bg-red-500/10 hover:bg-red-500/20 text-red-400';
    };

    const buildExportFileName = (ext: 'xls' | 'pdf') => {
        const datePart = new Date().toISOString().split('T')[0];
        return `waybill_${datePart}.${ext}`;
    };

    const handleExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            if (filteredRows.length === 0) return;
            const headers = [tCols.name, tCols.passId, tCols.esmoTime, tCols.status, 'Vitals'];
            const dataRows = filteredRows.map((row) => [
                row.driver, 
                row.passId, 
                formatDateTime(row.sourceTime),
                row.healthStatus === 'passed' ? t('allowed') : row.healthStatus === 'review' ? t('review') : t('rejected'),
                formatEsmoReadings(row)
            ]);
            downloadXls(headers, dataRows, buildExportFileName('xls'));
        } finally {
            setExportingXls(false);
        }
    };

    const handleExportPdf = async () => {
        if (exportingPdf || exportingXls) return;
        setExportingPdf(true);
        try {
            if (filteredRows.length === 0) return;
            const doc = new jsPDF({ orientation: 'landscape' });
            try {
                const fontRes = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf');
                const buf = await fontRes.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                doc.addFileToVFS('Roboto.ttf', base64);
                doc.addFont('Roboto.ttf', 'Roboto', 'normal');
                doc.setFont('Roboto');
            } catch {
                // Ignore font error
            }
            doc.setFontSize(16);
            doc.text(t('waybills'), 14, 18);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`${t('createdAt')}: ${new Date().toLocaleString()}`, 14, 25);

            const tableData = filteredRows.map((row) => [
                row.driver, 
                row.passId, 
                formatDateTime(row.sourceTime),
                row.healthStatus === 'passed' ? t('allowed') : row.healthStatus === 'review' ? t('review') : t('rejected'),
                formatEsmoReadings(row)
            ]);
            autoTable(doc, {
                head: [[tCols.name, tCols.passId, tCols.esmoTime, tCols.status, 'Vitals']],
                body: tableData,
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 8, font: 'Roboto' },
            });
            doc.save(buildExportFileName('pdf'));
        } finally {
            setExportingPdf(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <div
                        key={card.id}
                        onClick={() => handleWidgetClick(card.filterId)}
                        className={`glass-panel rounded-2xl p-4 border relative overflow-hidden group cursor-pointer transition-all duration-300 ${
                            headerFilter === card.filterId
                                ? 'border-blue-500/70 ring-2 ring-blue-500/30 scale-[1.02]'
                                : 'border-slate-700/50 hover:border-slate-600/60'
                        }`}
                    >
                        <div className={`absolute -right-6 -top-6 w-36 h-36 bg-gradient-to-br ${card.color} rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500`}></div>
                        <div className="relative z-10 flex items-start justify-between gap-4">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">{card.title}</div>
                                <div className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">{card.value}</div>
                            </div>
                            <div className={`p-4 rounded-xl bg-gradient-to-br ${card.color} text-white shadow-xl [&>svg]:w-[26px] [&>svg]:h-[26px]`}>
                                {card.icon}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}

            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                <div className="p-4 sm:p-6 border-b border-slate-700/50 flex flex-col gap-5">
                    <h3 className="app-module-heading">
                        {t('waybills')}
                    </h3>

                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3 flex-1">
                            <div className="relative flex-1 min-w-[200px] max-w-[280px]">
                                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    placeholder={t('searchByEmployee')}
                                    className="h-10 pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500 transition-all w-full text-sm text-slate-200"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <LocalizedDateInput
                                    label={t('dateFromSanadan')}
                                    value={dateFrom}
                                    maxDate={dateTo || undefined}
                                    onChange={(v) => { setDateFrom(v); setCurrentPage(1); }}
                                    minWidth={140}
                                />
                                <LocalizedDateInput
                                    label={t('dateToSanagacha')}
                                    value={dateTo}
                                    minDate={dateFrom || undefined}
                                    onChange={(v) => { setDateTo(v); setCurrentPage(1); }}
                                    minWidth={140}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={filteredRows.length === 0 || exportingXls || exportingPdf}
                                className="inline-flex min-w-0 flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Table2 size={16} />
                                {exportingXls ? t('exportingXls') : t('exportXls')}
                            </button>
                            <button
                                type="button"
                                onClick={handleExportPdf}
                                disabled={filteredRows.length === 0 || exportingPdf || exportingXls}
                                className="inline-flex min-w-0 flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <FileText size={16} />
                                {exportingPdf ? t('exportingPdf') : t('exportPdf')}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-300 text-xs uppercase tracking-wide">
                                <th className="px-4 md:px-6 py-4 !font-normal">{tCols.name}</th>
                                <th className="px-4 md:px-6 py-4 text-center">{t('download')}</th>
                                <th className="px-4 md:px-6 py-4 !font-normal border-l border-slate-700/50">{tCols.name}</th>
                                <th className="px-4 md:px-6 py-4 text-center">{t('download')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {pagedRowPairs.map(([rowA, rowB], index) => (
                                <motion.tr key={rowA.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-800/40 transition-all text-sm group">
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="relative inline-block group/tooltip max-w-full">
                                            <div className="!font-normal text-slate-300 group-hover/tooltip:text-blue-400 transition-colors break-words whitespace-normal leading-6 cursor-help">
                                                {rowA.driver}
                                            </div>
                                            <div className={`absolute left-4 hidden group-hover/tooltip:block z-50 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-3 w-52 text-xs text-slate-300 pointer-events-none select-none transition-all duration-200 backdrop-blur-md ${index === 0 ? 'top-full mt-1' : 'bottom-full mb-2'}`}>
                                                <div>
                                                    <div className="text-slate-400 mb-1.5 font-medium">{t('indicators')}:</div>
                                                    {rowA.bp || rowA.pulse != null || rowA.temperature != null ? (
                                                        <div className="space-y-1 font-mono text-[11px] text-slate-200 bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                                                            {rowA.bp && (
                                                                <div className="flex justify-between gap-4">
                                                                    <span className="text-slate-400">{t('bloodPressure')}:</span>
                                                                    <span>{rowA.bp}</span>
                                                                </div>
                                                            )}
                                                            {rowA.pulse != null && (
                                                                <div className="flex justify-between gap-4">
                                                                    <span className="text-slate-400">{t('pulse')}:</span>
                                                                    <span>{rowA.pulse} p/m</span>
                                                                </div>
                                                            )}
                                                            {rowA.temperature != null && (
                                                                <div className="flex justify-between gap-4">
                                                                    <span className="text-slate-400">{t('temperature')}:</span>
                                                                    <span>{formatNumber(rowA.temperature)}°C</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-500 italic">{t('noDataAvailable')}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-center">
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadClick(rowA)}
                                            className={`p-2.5 rounded-xl transition-colors inline-flex items-center justify-center ${downloadButtonClass(rowA.healthStatus)}`}
                                            title={t('downloadWaybill')}
                                        >
                                            <Download size={20} />
                                        </button>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 border-l border-slate-700/30">
                                        {rowB ? (
                                            <div className="relative inline-block group/tooltip max-w-full">
                                                <div className="!font-normal text-slate-300 group-hover/tooltip:text-blue-400 transition-colors break-words whitespace-normal leading-6 cursor-help">
                                                    {rowB.driver}
                                                </div>
                                                <div className={`absolute left-4 hidden group-hover/tooltip:block z-50 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-3 w-52 text-xs text-slate-300 pointer-events-none select-none transition-all duration-200 backdrop-blur-md ${index === 0 ? 'top-full mt-1' : 'bottom-full mb-2'}`}>
                                                    <div>
                                                        <div className="text-slate-400 mb-1.5 font-medium">{t('indicators')}:</div>
                                                        {rowB.bp || rowB.pulse != null || rowB.temperature != null ? (
                                                            <div className="space-y-1 font-mono text-[11px] text-slate-200 bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                                                                {rowB.bp && (
                                                                    <div className="flex justify-between gap-4">
                                                                        <span className="text-slate-400">{t('bloodPressure')}:</span>
                                                                        <span>{rowB.bp}</span>
                                                                    </div>
                                                                )}
                                                                {rowB.pulse != null && (
                                                                    <div className="flex justify-between gap-4">
                                                                        <span className="text-slate-400">{t('pulse')}:</span>
                                                                        <span>{rowB.pulse} p/m</span>
                                                                    </div>
                                                                )}
                                                                {rowB.temperature != null && (
                                                                    <div className="flex justify-between gap-4">
                                                                        <span className="text-slate-400">{t('temperature')}:</span>
                                                                        <span>{formatNumber(rowB.temperature)}°C</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-500 italic">{t('noDataAvailable')}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-slate-500">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-center">
                                        {rowB ? (
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadClick(rowB)}
                                                className={`p-2.5 rounded-xl transition-colors inline-flex items-center justify-center ${downloadButtonClass(rowB.healthStatus)}`}
                                                title={t('downloadWaybill')}
                                            >
                                                <Download size={20} />
                                            </button>
                                        ) : (
                                            <span className="text-slate-500">-</span>
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                            {!loading && totalRowsCount === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm">
                                        {t('dataNotFound')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="table-pagination-bar px-6 py-4 border-t border-slate-700/50 bg-slate-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p className="text-sm text-slate-400">
                        {totalRowsCount === 0
                            ? '0 / 0'
                            : `${(currentPage - 1) * rowsPerPage + 1}-${Math.min((currentPage - 1) * rowsPerPage + pagedRowPairs.length, totalRowsCount)} / ${totalRowsCount}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-sm text-slate-400 flex items-center gap-2">
                            <span>{t('rowsPerPage')}:</span>
                            <select
                                value={rowsPerPage}
                                onChange={(e) => {
                                    const value = Math.max(10, Number.parseInt(e.target.value, 10) || 10);
                                    setRowsPerPage(value);
                                    setCurrentPage(1);
                                }}
                                className="bg-slate-900/70 border border-slate-700/70 rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-700/70 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-blue-500/50 hover:text-blue-300 transition-colors"
                        >
                            {t('previous')}
                        </button>
                        <span className="text-sm text-slate-300 min-w-[80px] text-center">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={currentPage >= totalPages}
                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-700/70 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-blue-500/50 hover:text-blue-300 transition-colors"
                        >
                            {t('next')}
                        </button>
                    </div>
                </div>
            </div>

            <WaybillFormModal
                open={isWaybillFormOpen}
                onClose={() => setIsWaybillFormOpen(false)}
                templatePdfUrl={yolVaraqasiPdfUrl}
                initialValues={waybillFormInitialValues}
            />
        </div>
    );
};
