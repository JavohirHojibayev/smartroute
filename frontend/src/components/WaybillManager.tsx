import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Download, FileDown, RefreshCw, CalendarDays } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { useI18n } from '../i18n';

type EsmoHealthStatus = 'passed' | 'failed' | 'review';

type EsmoJournalRow = {
    id?: number;
    esmoId?: number;
    passId?: string;
    time?: string;
    name?: string;
    status?: string;
    statusCode?: string;
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
};

const fallbackHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, '') || `http://${fallbackHost}:3000`;

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
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const statusBadgeClass = (status: EsmoHealthStatus) => {
    if (status === 'passed') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (status === 'review') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
    return 'bg-red-500/10 text-red-400 border-red-500/30';
};

export const WaybillManager = () => {
    const { t } = useI18n();
    const [waybills, setWaybills] = useState<WaybillRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const dateFromRef = useRef<HTMLInputElement | null>(null);
    const dateToRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let active = true;

        const loadWaybills = async () => {
            if (active) setLoading(true);

            try {
                const params = new URLSearchParams({ limit: '5000' });
                if (dateFrom) params.set('dateFrom', dateFrom);
                if (dateTo) params.set('dateTo', dateTo);
                if (!dateFrom && !dateTo) params.set('day', getTodayTashkent());

                const response = await fetch(`${API_BASE}/integrations/esmo/journal?${params.toString()}`);
                if (!response.ok) throw new Error('esmo_journal_failed');

                const payload = await response.json();
                const rows = Array.isArray(payload) ? (payload as EsmoJournalRow[]) : [];
                const byPerson = new Map<string, WaybillRow>();

                for (const row of rows) {
                    const driverName = cleanEmployeeName(String(row?.name || ''), t('unknownEmployee'));
                    const passIdRaw = normalizeWhitespace(row?.passId);
                    const passKey = normalizeDriverKey(passIdRaw);
                    const nameKey = normalizeDriverKey(driverName);

                    const dedupeKey = passKey
                        ? `id:${passKey}`
                        : nameKey
                            ? `name:${nameKey}`
                            : `row:${String(row?.id ?? row?.esmoId ?? Math.random())}`;

                    const healthStatus = normalizeEsmoStatus(row?.statusCode || row?.status);
                    const eventMs = parseTimeMs(String(row?.time || ''));
                    const candidate: WaybillRow = {
                        id: `ESMO-${passIdRaw || String(row?.esmoId ?? row?.id ?? dedupeKey).replace(/\s+/g, '')}`,
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
                    };

                    const existing = byPerson.get(dedupeKey);
                    if (!existing) {
                        byPerson.set(dedupeKey, candidate);
                        continue;
                    }

                    const existingRank = statusRank(existing.healthStatus);
                    const nextRank = statusRank(candidate.healthStatus);

                    if (nextRank > existingRank || (nextRank === existingRank && candidate.eventMs > existing.eventMs)) {
                        byPerson.set(dedupeKey, candidate);
                    } else if (existing.passId === '-' && candidate.passId !== '-') {
                        byPerson.set(dedupeKey, { ...existing, passId: candidate.passId, id: candidate.id });
                    }
                }

                const merged = Array.from(byPerson.values()).sort((a, b) => b.eventMs - a.eventMs);
                if (active) {
                    setWaybills(merged);
                    setError(null);
                }
            } catch {
                if (active) setError(t('esmoServerError'));
            } finally {
                if (active) setLoading(false);
            }
        };

        loadWaybills();
        const interval = setInterval(loadWaybills, 30000);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [t, dateFrom, dateTo]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateFrom, dateTo]);

    const openDatePicker = (ref: { current: HTMLInputElement | null }) => {
        const input = ref.current;
        if (!input) return;
        const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
        if (typeof pickerInput.showPicker === 'function') {
            pickerInput.showPicker();
            return;
        }
        input.focus();
    };

    const filteredWaybills = useMemo(() => {
        const query = normalizeDriverKey(searchTerm);
        const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
        const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

        return waybills.filter((row) => {
            if (fromMs !== null || toMs !== null) {
                const rowMs = parseTimeMs(row.sourceTime);
                if (!rowMs) return false;
                if (fromMs !== null && rowMs < fromMs) return false;
                if (toMs !== null && rowMs > toMs) return false;
            }
            if (!query) return true;
            return (
                normalizeDriverKey(row.driver).includes(query) ||
                normalizeDriverKey(row.passId).includes(query)
            );
        });
    }, [waybills, searchTerm, dateFrom, dateTo]);

    const totalRows = filteredWaybills.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const pagedRows = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredWaybills.slice(start, start + rowsPerPage);
    }, [filteredWaybills, currentPage, rowsPerPage]);

    const mapRowsToExport = (rows: WaybillRow[]) => {
        return rows.map((row) => ({
            driver: row.driver,
            passId: row.passId,
            health: row.healthStatus === 'passed' ? t('allowed') : row.healthStatus === 'review' ? t('review') : t('rejected'),
            plate: row.plate,
            cargoWeight: `${row.cargo} / ${row.weight}`,
            eventTime: formatDateTime(row.sourceTime),
        }));
    };

    const buildExportFileName = (ext: 'xls' | 'pdf') => {
        const datePart = new Date().toISOString().split('T')[0];
        return `waybill_${datePart}.${ext}`;
    };

    const handleExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            const exportRows = mapRowsToExport(filteredWaybills);
            if (exportRows.length === 0) return;

            const headers = [t('employee'), t('passId'), 'ESMO', t('fleet'), `${t('cargoType')} / ${t('weight')}`, t('time')];
            const dataRows = exportRows.map((row) => [row.driver, row.passId, row.health, row.plate, row.cargoWeight, row.eventTime]);
            downloadXls(headers, dataRows, buildExportFileName('xls'));
        } catch {
            setError(t('exportDataError'));
        } finally {
            setExportingXls(false);
        }
    };

    const handleExportPdf = async () => {
        if (exportingPdf || exportingXls) return;
        setExportingPdf(true);
        try {
            const exportRows = mapRowsToExport(filteredWaybills);
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
            doc.text(t('waybills'), 14, 18);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`${t('createdAt')}: ${new Date().toLocaleString()}`, 14, 25);

            const tableData = exportRows.map((row) => [row.driver, row.passId, row.health, row.plate, row.cargoWeight, row.eventTime]);
            autoTable(doc, {
                head: [[t('employee'), t('passId'), 'ESMO', t('fleet'), `${t('cargoType')} / ${t('weight')}`, t('time')]],
                body: tableData,
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 8, font: 'Roboto' },
                columnStyles: { 0: { cellWidth: 85 } },
            });

            doc.save(buildExportFileName('pdf'));
        } catch {
            setError(t('pdfExportError'));
        } finally {
            setExportingPdf(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                <div className="p-6 border-b border-slate-700/50 bg-slate-800/20 space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1 flex-wrap">
                            <h3 className="font-bold text-2xl md:text-[30px] leading-none shrink-0 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                                {t('waybills')}
                            </h3>
                            <div className="relative w-full max-w-md min-w-[260px] ml-2 md:ml-auto">
                                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder={t('searchByEmployee')}
                                    className="w-full bg-slate-900/50 border border-slate-700/60 rounded-lg pl-11 pr-4 py-3 text-base text-slate-200 placeholder:text-slate-500 outline-none focus:border-blue-500/60"
                                />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap ml-2">
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <input
                                            ref={dateFromRef}
                                            type="date"
                                            value={dateFrom}
                                            max={dateTo || undefined}
                                            onChange={(event) => setDateFrom(event.target.value)}
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
                                            onChange={(event) => setDateTo(event.target.value)}
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
                            </div>
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
                            {loading && <RefreshCw size={14} className="animate-spin text-blue-400" />}
                        </div>
                    </div>

                </div>

                {error && (
                    <div className="px-6 py-3 text-xs text-red-400 bg-red-500/5 border-b border-red-500/20">
                        {error}
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                <th className="px-6 py-4">{t('employee')}</th>
                                <th className="px-6 py-4">ESMO</th>
                                <th className="px-6 py-4">{t('fleet')}</th>
                                <th className="px-6 py-4">{t('cargoType')} / {t('weight')}</th>
                                <th className="px-6 py-4">Safar vaqti</th>
                                <th className="px-6 py-4">Holat</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {pagedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500 text-sm">
                                        {loading ? t('syncing') : (searchTerm.trim() || dateFrom || dateTo ? t('noEventsForFilter') : t('dataNotFound'))}
                                    </td>
                                </tr>
                            ) : (
                                pagedRows.map((row) => (
                                    <motion.tr
                                        key={row.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="hover:bg-slate-800/40 transition-all text-sm group"
                                    >
                                        <td className="px-6 py-4 !font-normal">
                                            <div className="!font-normal text-slate-300 group-hover:text-blue-400 transition-colors break-words whitespace-normal leading-6">
                                                {row.driver}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border ${statusBadgeClass(row.healthStatus)}`}>
                                                {row.healthStatus === 'passed' ? t('allowed') : row.healthStatus === 'review' ? t('review') : t('rejected')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-300 font-semibold uppercase">{row.plate}</td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs font-bold text-slate-200">{row.cargo}</p>
                                            <p className="text-[10px] text-blue-400 font-mono">{row.weight}</p>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">{row.tripTime}</td>
                                        <td className="px-6 py-4 text-slate-500">{row.tripState}</td>
                                    </motion.tr>
                                ))
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
                            onChange={(event) => {
                                const value = Math.max(10, Number.parseInt(event.target.value, 10) || 10);
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
        </div>
    );
};
