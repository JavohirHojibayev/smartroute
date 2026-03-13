import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Droplets, AlertCircle, CheckCircle2, Search, CalendarDays, Download, FileDown, RefreshCw, Server } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { useI18n } from '../i18n';

type EsmoSummary = {
    day: string;
    totalToday: number;
    passedToday: number;
    reviewToday: number;
    failedToday: number;
    systemStatus: 'online' | 'offline' | string;
};

type EsmoJournalRow = {
    id: number;
    esmoId?: number;
    name: string;
    passId?: string;
    time: string;
    pulse: number | null;
    bp: string | null;
    temperature: number | null;
    alcohol: number | null;
    alcoholDetected?: boolean | null;
    status: 'passed' | 'review' | 'failed' | 'annulled' | string;
    statusCode?: string;
    device: string;
    deviceIp: string;
};

type EsmoDevice = {
    name: string;
    host: string;
    model: string;
    serial: string;
    apiKey: string;
    isOnline: boolean;
    lastSeen: string | null;
};

type SummaryStatusFilter = 'all' | 'passed' | 'review' | 'failed';

const fallbackHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, '') || `http://${fallbackHost}:3000`;

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

const normalizeStatus = (status: string): 'passed' | 'review' | 'failed' | 'annulled' => {
    const value = String(status || '').toLowerCase();
    if (value === 'passed') return 'passed';
    if (value === 'review' || value === 'manual_review' || value === "ko'rik" || value === 'korik') return 'review';
    if (value === 'annulled') return 'annulled';
    return 'failed';
};

const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;

    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatNumber = (value: number | null | undefined, fractionDigits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return '-';
    const numeric = Number(value);
    return Number.isInteger(numeric)
        ? String(numeric)
        : numeric.toFixed(fractionDigits);
};

const hasAlcoholDetected = (row: Pick<EsmoJournalRow, 'alcoholDetected'>) => row.alcoholDetected === true;

const cleanEmployeeName = (value: string, unknownEmployeeLabel: string) => {
    const raw = String(value || '').trim();
    if (!raw) return unknownEmployeeLabel;
    return raw
        .replace(/^проверка\s+сотрудника\s+/i, '')
        .replace(/^РїСЂРѕРІРµСЂРєР°\s+СЃРѕС‚СЂСѓРґРЅРёРєР°\s+/i, '')
        .replace(/^proverka\s+sotrudnika\s+/i, '')
        .replace(/^employee\s+check\s+/i, '')
        .replace(/^xodim\s+tekshiruvi\s+/i, '')
        .trim();
};

const formatDeviceName = (value: string) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '-';
    if (raw.includes('atx 1-terminal')) return 'AXT-1';
    if (raw.includes('atx 2-terminal')) return 'ATX-2';
    return value;
};

export const MedicalManager = () => {
    const { t } = useI18n();
    const [summary, setSummary] = useState<EsmoSummary>({
        day: getTodayTashkent(),
        totalToday: 0,
        passedToday: 0,
        reviewToday: 0,
        failedToday: 0,
        systemStatus: 'offline',
    });
    const [rows, setRows] = useState<EsmoJournalRow[]>([]);
    const [devices, setDevices] = useState<EsmoDevice[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState<SummaryStatusFilter>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const dateFromRef = useRef<HTMLInputElement | null>(null);
    const dateToRef = useRef<HTMLInputElement | null>(null);
    const smartRouteStatus: 'online' | 'offline' = error ? 'offline' : 'online';

    const syncNow = async () => {
        try {
            setSyncing(true);
            await fetch(`${API_BASE}/integrations/esmo/sync`, { method: 'POST' });
        } catch {
            // Sync fail should not block UI read.
        } finally {
            setSyncing(false);
        }
    };

    const loadData = async (showLoading = false) => {
        if (showLoading) setLoading(true);

        try {
            const summaryParams = new URLSearchParams();
            const journalParams = new URLSearchParams({ limit: '5000' });
            if (dateFrom) {
                summaryParams.set('dateFrom', dateFrom);
                journalParams.set('dateFrom', dateFrom);
            }
            if (dateTo) {
                summaryParams.set('dateTo', dateTo);
                journalParams.set('dateTo', dateTo);
            }

            const summaryUrl = `${API_BASE}/integrations/esmo/summary${summaryParams.toString() ? `?${summaryParams.toString()}` : ''}`;
            const journalUrl = `${API_BASE}/integrations/esmo/journal?${journalParams.toString()}`;

            const [summaryRes, journalRes, devicesRes] = await Promise.all([
                fetch(summaryUrl),
                fetch(journalUrl),
                fetch(`${API_BASE}/integrations/esmo/devices`),
            ]);

            if (!summaryRes.ok || !journalRes.ok || !devicesRes.ok) {
                throw new Error(t('esmoApiError'));
            }

            const summaryData = await summaryRes.json();
            const journalData = await journalRes.json();
            const devicesData = await devicesRes.json();

            setSummary({
                day: String(summaryData?.day || getTodayTashkent()),
                totalToday: Number(summaryData?.totalToday ?? 0),
                passedToday: Number(summaryData?.passedToday ?? 0),
                reviewToday: Number(summaryData?.reviewToday ?? 0),
                failedToday: Number(summaryData?.failedToday ?? 0),
                systemStatus: String(summaryData?.systemStatus || 'offline'),
            });

            const mappedRows = Array.isArray(journalData)
                ? journalData.map((row: EsmoJournalRow) => ({
                    ...row,
                    name: cleanEmployeeName(String(row?.name || t('unknownEmployee')), t('unknownEmployee')),
                    status: normalizeStatus(String(row?.status || row?.statusCode || 'failed')),
                    time: String(row?.time || ''),
                    device: String(row?.device || '-'),
                    deviceIp: String(row?.deviceIp || '-'),
                    alcoholDetected: typeof row?.alcoholDetected === 'boolean' ? row.alcoholDetected : null,
                }))
                : [];

            setRows(mappedRows);
            setDevices(Array.isArray(devicesData) ? devicesData : []);
            setError(null);
        } catch {
            setError(t('esmoServerError'));
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const handleManualRefresh = async () => {
        await syncNow();
        await loadData(true);
    };

    useEffect(() => {
        loadData(true);
        const interval = setInterval(() => loadData(false), 30000);
        return () => clearInterval(interval);
    }, [dateFrom, dateTo]);

    const openDatePicker = (ref: { current: HTMLInputElement | null }) => {
        const input = ref.current;
        if (!input) return;
        const candidate = input as HTMLInputElement & { showPicker?: () => void };
        if (typeof candidate.showPicker === 'function') {
            candidate.showPicker();
        } else {
            input.focus();
        }
    };

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return rows.filter((row) => {
            if (query) {
                const haystack = `${row.name} ${row.passId || ''} ${row.device || ''} ${row.deviceIp || ''}`.toLowerCase();
                if (!haystack.includes(query)) return false;
            }

            const normalizedStatus = normalizeStatus(row.status);
            if (statusFilter === 'passed') return normalizedStatus === 'passed';
            if (statusFilter === 'review') return normalizedStatus === 'review';
            if (statusFilter === 'failed') return normalizedStatus === 'failed' || normalizedStatus === 'annulled';
            return true;
        });
    }, [rows, searchQuery, statusFilter]);

    const totalRows = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

    const pagedRows = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredRows.slice(start, start + rowsPerPage);
    }, [filteredRows, currentPage, rowsPerPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [dateFrom, dateTo, searchQuery, statusFilter]);

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const mapRowsToExportRows = (inputRows: EsmoJournalRow[]) => {
        return inputRows.map((row) => ({
            name: cleanEmployeeName(row.name, t('unknownEmployee')),
            passId: row.passId || '',
            time: formatDateTime(row.time),
            pulse: row.pulse == null ? '-' : `${row.pulse}`,
            bp: row.bp || '-',
            temperature: row.temperature == null ? '-' : `${formatNumber(row.temperature)}°C`,
            alcohol: row.alcoholDetected === true ? t('detected') : t('notDetected'),
            status: normalizeStatus(row.status) === 'passed'
                ? t('allowed')
                : normalizeStatus(row.status) === 'review'
                    ? t('review')
                    : normalizeStatus(row.status) === 'annulled'
                        ? t('annulled')
                        : t('rejected'),
            device: formatDeviceName(row.device),
        }));
    };

    const buildExportFileName = (ext: 'xls' | 'pdf') => {
        const datePart = new Date().toISOString().split('T')[0];
        return `esmo_journal_${datePart}.${ext}`;
    };

    const handleExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            const exportRows = mapRowsToExportRows(filteredRows);
            if (exportRows.length === 0) return;

            const headers = [t('employee'), t('passId'), t('time'), t('pulse'), t('bloodPressure'), t('temperature'), t('alcohol'), t('conclusion'), t('device')];
            const dataRows = exportRows.map((row) => [row.name, row.passId, row.time, row.pulse, row.bp, row.temperature, row.alcohol, row.status, row.device]);
            downloadXls(headers, dataRows, buildExportFileName('xls'));
        } catch (_error) {
            setError(t('exportDataError'));
        } finally {
            setExportingXls(false);
        }
    };

    const handleExportPdf = async () => {
        if (exportingPdf || exportingXls) return;
        setExportingPdf(true);
        try {
            const exportRows = mapRowsToExportRows(filteredRows);
            if (exportRows.length === 0) return;

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
                // Keep default font if loading fails.
            }

            doc.setFontSize(16);
            doc.text(t('esmoJournalTitle'), 14, 18);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`${t('createdAt')}: ${new Date().toLocaleString()}`, 14, 25);

            const tableData = exportRows.map((row) => [row.name, row.passId, row.time, row.pulse, row.bp, row.temperature, row.alcohol, row.status, row.device]);
            autoTable(doc, {
                head: [[t('employee'), t('passId'), t('time'), t('pulse'), t('bloodPressure'), t('temperature'), t('alcohol'), t('conclusion'), t('device')]],
                body: tableData,
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 8, font: 'Roboto' },
                columnStyles: { 0: { cellWidth: 80 } },
            });

            doc.save(buildExportFileName('pdf'));
        } catch (_error) {
            setError(t('pdfExportError'));
        } finally {
            setExportingPdf(false);
        }
    };

    const statusBadgeClass = (status: string) => {
        const normalized = normalizeStatus(status);
        if (normalized === 'passed') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        if (normalized === 'review') return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
        return 'bg-red-500/10 text-red-500 border-red-500/20';
    };

    const statusLabel = (status: string) => {
        const normalized = normalizeStatus(status);
        if (normalized === 'passed') return t('allowed');
        if (normalized === 'review') return t('recheck');
        if (normalized === 'annulled') return t('annulled');
        return t('rejected');
    };

    const statusIcon = (status: string) => {
        const normalized = normalizeStatus(status);
        return normalized === 'passed' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />;
    };

    const summaryTitle = dateFrom || dateTo ? t('selectedPeriodSummary') : t('todaySummary');
    const toggleStatusFilter = (value: Exclude<SummaryStatusFilter, 'all'>) => {
        setStatusFilter((prev) => (prev === value ? 'all' : value));
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            placeholder={t('searchByEmployee')}
                            className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500 transition-all w-72"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <input
                                ref={dateFromRef}
                                type="date"
                                value={dateFrom}
                                max={dateTo || undefined}
                                onChange={(e) => {
                                    setDateFrom(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="date-input-system w-[170px] bg-slate-900/50 border border-slate-700/60 rounded-lg pl-3 pr-11 py-3 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                                aria-label={t('startDate')}
                            />
                            <button
                                type="button"
                                onClick={() => openDatePicker(dateFromRef)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-200 hover:text-white transition-colors"
                                aria-label={t('selectStartDate')}
                            >
                                <CalendarDays size={16} />
                            </button>
                        </div>
                        <span className="text-slate-500 text-sm">-</span>
                        <div className="relative">
                            <input
                                ref={dateToRef}
                                type="date"
                                value={dateTo}
                                min={dateFrom || undefined}
                                onChange={(e) => {
                                    setDateTo(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="date-input-system w-[170px] bg-slate-900/50 border border-slate-700/60 rounded-lg pl-3 pr-11 py-3 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                                aria-label={t('endDate')}
                            />
                            <button
                                type="button"
                                onClick={() => openDatePicker(dateToRef)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-200 hover:text-white transition-colors"
                                aria-label={t('selectEndDate')}
                            >
                                <CalendarDays size={16} />
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={handleManualRefresh}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-all text-sm"
                    >
                        <RefreshCw size={16} className={syncing ? 'text-blue-400 animate-spin' : 'text-blue-400'} />
                        <span>{syncing ? t('syncing') : t('refresh')}</span>
                    </button>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={totalRows === 0 || exportingXls || exportingPdf}
                        className="inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Download size={16} />
                        {exportingXls ? t('exportingXls') : t('exportXls')}
                    </button>
                    <button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={totalRows === 0 || exportingPdf || exportingXls}
                        className="inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <FileDown size={16} />
                        {exportingPdf ? t('exportingPdf') : t('exportPdf')}
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                    <div className="p-6 border-b border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-bold text-2xl md:text-[30px] leading-none shrink-0 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                            {t('esmoJournalTitle')}
                        </h3>
                        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                            <button
                                type="button"
                                onClick={() => toggleStatusFilter('passed')}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-full border transition-colors ${
                                    statusFilter === 'passed'
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/60'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15'
                                }`}
                            >
                                {summary.passedToday} {t('allowed')}
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleStatusFilter('review')}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-full border transition-colors ${
                                    statusFilter === 'review'
                                        ? 'bg-orange-500/20 text-orange-300 border-orange-400/60'
                                        : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/15'
                                }`}
                            >
                                {summary.reviewToday} {t('review')}
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleStatusFilter('failed')}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-full border transition-colors ${
                                    statusFilter === 'failed'
                                        ? 'bg-red-500/20 text-red-300 border-red-400/60'
                                        : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/15'
                                }`}
                            >
                                {summary.failedToday} {t('rejected')}
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-900/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="px-6 py-4">{t('employee')}</th>
                                    <th className="px-6 py-4">{t('time')}</th>
                                    <th className="px-6 py-4">{t('pulse')}</th>
                                    <th className="px-6 py-4">{t('bloodPressure')}</th>
                                    <th className="px-6 py-4">{t('temperature')}</th>
                                    <th className="px-6 py-4">{t('alcohol')}</th>
                                    <th className="px-6 py-4">{t('device')}</th>
                                    <th className="px-6 py-4">{t('conclusion')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                {pagedRows.map((log) => (
                                    <motion.tr key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-800/40 transition-all text-sm group">
                                        <td className="px-6 py-4 !font-normal">
                                            <div className="!font-normal text-slate-300 group-hover:text-blue-400 transition-colors break-words whitespace-normal leading-6">{cleanEmployeeName(log.name, t('unknownEmployee'))}</div>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-400 font-mono">{formatDateTime(log.time)}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs">{log.pulse == null ? '-' : `${log.pulse}`}</div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-medium text-slate-300">{log.bp || '-'}</td>
                                        <td className="px-6 py-4 text-xs font-medium text-slate-300">{log.temperature == null ? '-' : `${formatNumber(log.temperature)}°C`}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center">
                                                <Droplets
                                                    size={14}
                                                    className={hasAlcoholDetected(log) ? 'text-red-400' : 'text-blue-400'}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-300">
                                            <div>{formatDeviceName(log.device)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border inline-flex items-center gap-1 ${statusBadgeClass(log.status)}`}>
                                                {statusIcon(log.status)}
                                                {statusLabel(log.status)}
                                            </span>
                                        </td>
                                    </motion.tr>
                                ))}
                                {!loading && totalRows === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-8 text-center text-slate-400 text-sm">
                                            {t('dataNotFound')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <p className="text-sm text-slate-400">
                            {totalRows === 0
                                ? '0 / 0'
                                : `${(currentPage - 1) * rowsPerPage + 1}-${Math.min((currentPage - 1) * rowsPerPage + pagedRows.length, totalRows)} / ${totalRows}`}
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="text-sm text-slate-400">{t('rowsPerPage')}:</label>
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

                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-2xl border border-slate-700/50">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center justify-between">
                            {summaryTitle}
                            <Activity size={12} />
                        </h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-slate-400">{t('total')}</span><span className="font-bold">{summary.totalToday}</span></div>
                            <div className="flex justify-between"><span className="text-emerald-400">{t('allowed')}</span><span className="font-bold">{summary.passedToday}</span></div>
                            <div className="flex justify-between"><span className="text-orange-400">{t('review')}</span><span className="font-bold">{summary.reviewToday}</span></div>
                            <div className="flex justify-between"><span className="text-red-400">{t('rejected')}</span><span className="font-bold">{summary.failedToday}</span></div>
                            <div className="pt-2 mt-2 border-t border-slate-700/50 flex justify-between">
                                <span className="text-slate-400">{t('smartRouteStatus')}</span>
                                <span className={`${smartRouteStatus === 'online' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'} inline-flex items-center gap-1.5`}>
                                    <span className={`w-2 h-2 rounded-full animate-pulse ${smartRouteStatus === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                                    {smartRouteStatus === 'online' ? t('online') : t('offline')}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                        <h4 className="text-xs font-bold text-blue-300 uppercase mb-3 flex items-center gap-2">
                            <Server size={12} /> {t('esmoDevices')}
                        </h4>
                        <div className="space-y-3">
                            {devices.map((device) => (
                                <div key={device.host} className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-3 py-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-200">{device.name}</span>
                                        <span className={`${device.isOnline ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'} inline-flex items-center gap-1.5`}>
                                            <span className={`w-2 h-2 rounded-full animate-pulse ${device.isOnline ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                                            {device.isOnline ? t('online') : t('offline')}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-400 font-mono">{device.host}</div>
                                    <div className="mt-1 text-[11px] text-slate-500">{device.model} | {device.serial}</div>
                                </div>
                            ))}
                            {devices.length === 0 && <div className="text-xs text-slate-500">{t('devicesNotFound')}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


