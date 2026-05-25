import { Fragment, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Table2, FileText, RefreshCw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from './LocalizedDateInput';
import yolVaraqasiPdfUrl from "../assets/yo'l_varaqasi.pdf?url";
import { WaybillFormModal } from './WaybillFormModal';

type EsmoHealthStatus = 'passed' | 'failed' | 'review';

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
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const hasVitalsData = (row: Pick<WaybillRow, 'bp' | 'pulse' | 'temperature'>) =>
    Boolean((row.bp && String(row.bp).trim()) || row.pulse != null || row.temperature != null);

const formatTemperature = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(Number(value))) return '-';
    const numeric = Number(value);
    return Number.isInteger(numeric) ? `${numeric}°C` : `${numeric.toFixed(1)}°C`;
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
    const [isWaybillFormOpen, setIsWaybillFormOpen] = useState(false);
    useEffect(() => {
        let active = true;

        const loadWaybills = async (silent = false) => {
            if (active && !silent) setLoading(true);

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
                    const bp = normalizeWhitespace(row?.bp || row?.bloodPressure || '') || null;
                    const pulse = row?.pulse == null || Number.isNaN(Number(row.pulse)) ? null : Number(row.pulse);
                    const temperature = row?.temperature == null || Number.isNaN(Number(row.temperature)) ? null : Number(row.temperature);
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
                        bp,
                        pulse,
                        temperature,
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
                    } else if (!hasVitalsData(existing) && hasVitalsData(candidate)) {
                        byPerson.set(dedupeKey, { ...existing, bp: candidate.bp, pulse: candidate.pulse, temperature: candidate.temperature });
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
                if (active && !silent) setLoading(false);
            }
        };

        void loadWaybills(false);
        const interval = setInterval(() => {
            void loadWaybills(true);
        }, 3000);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [t, dateFrom, dateTo]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateFrom, dateTo]);

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

    const groupedWaybills = useMemo(() => {
        const grouped: Array<Array<WaybillRow | undefined>> = [];
        for (let index = 0; index < filteredWaybills.length; index += 3) {
            grouped.push([filteredWaybills[index], filteredWaybills[index + 1], filteredWaybills[index + 2]]);
        }
        return grouped;
    }, [filteredWaybills]);

    const totalGroupedRows = groupedWaybills.length;
    const totalEmployees = filteredWaybills.length;
    const totalPages = Math.max(1, Math.ceil(totalGroupedRows / rowsPerPage));

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const pagedRows = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return groupedWaybills.slice(start, start + rowsPerPage);
    }, [groupedWaybills, currentPage, rowsPerPage]);

    const pagedRowsFlat = useMemo(
        () =>
            pagedRows.flatMap((group) =>
                group.filter((row): row is WaybillRow => Boolean(row)),
            ),
        [pagedRows],
    );

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
                    <div className="flex flex-wrap justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1 flex-wrap w-full lg:w-auto">
                            <h3 className="app-module-heading">
                                {t('waybills')}
                            </h3>
                            <div className="relative w-full md:max-w-md min-w-0 md:min-w-[260px] ml-0 md:ml-2 lg:ml-auto">
                                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder={t('searchByEmployee')}
                                    className="w-full bg-slate-900/50 border border-slate-700/60 rounded-lg pl-11 pr-4 py-3 text-base text-slate-200 placeholder:text-slate-500 outline-none focus:border-blue-500/60"
                                />
                            </div>
                            <div className="flex w-full md:w-auto items-stretch md:items-center gap-2 flex-wrap md:flex-nowrap ml-0 md:ml-2">
                                <div className="flex w-full flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <LocalizedDateInput
                                        label={t('dateFromSanadan')}
                                        value={dateFrom}
                                        maxDate={dateTo || undefined}
                                        onChange={setDateFrom}
                                        minWidth={168}
                                    />
                                    <LocalizedDateInput
                                        label={t('dateToSanagacha')}
                                        value={dateTo}
                                        minDate={dateFrom || undefined}
                                        onChange={setDateTo}
                                        minWidth={168}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap w-full lg:w-auto shrink-0">
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={totalEmployees === 0 || exportingXls || exportingPdf}
                                className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Table2 size={16} />
                                {exportingXls ? t('exportingXls') : t('exportXls')}
                            </button>
                            <button
                                type="button"
                                onClick={handleExportPdf}
                                disabled={totalEmployees === 0 || exportingPdf || exportingXls}
                                className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <FileText size={16} />
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

                <div className="overflow-hidden">
                    <table className="hidden md:table w-full table-fixed text-left">
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                <th className="w-[22%] px-4 py-4">{t('employee')}</th>
                                <th className="w-[11%] px-4 py-4">ESMO</th>
                                <th className="w-[22%] px-4 py-4">{t('employee')}</th>
                                <th className="w-[11%] px-4 py-4">ESMO</th>
                                <th className="w-[22%] px-4 py-4">{t('employee')}</th>
                                <th className="w-[11%] px-4 py-4">ESMO</th>
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
                                pagedRows.map((group, groupIndex) => (
                                    <motion.tr
                                        key={`${group[0]?.id ?? 'row'}-${groupIndex}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="transition-all text-sm"
                                    >
                                        {group.map((row, columnIndex) => (
                                            <Fragment key={`${row?.id ?? `empty-${groupIndex}-${columnIndex}`}`}>
                                                <td className="px-4 py-4 !font-normal">
                                                    <div className="!font-normal text-slate-300 hover:text-blue-400 transition-colors break-words whitespace-normal leading-6">
                                                        {row?.driver ?? '-'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    {row ? (
                                                        <div className="relative inline-flex group/esmo">
                                                            <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border ${statusBadgeClass(row.healthStatus)}`}>
                                                                {row.healthStatus === 'passed' ? t('allowed') : row.healthStatus === 'review' ? t('review') : t('rejected')}
                                                            </span>
                                                            <div
                                                                className={`waybill-esmo-tooltip pointer-events-none absolute left-1/2 z-40 w-44 -translate-x-1/2 rounded-xl border border-slate-700/70 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 opacity-0 shadow-[0_8px_24px_rgba(2,6,23,0.55)] transition-opacity duration-150 group-hover/esmo:opacity-100 ${
                                                                    groupIndex === 0 ? 'top-full mt-2' : 'bottom-full mb-2'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-slate-400">{t('bloodPressure')}</span>
                                                                    <span>{row.bp || '-'}</span>
                                                                </div>
                                                                <div className="mt-1 flex items-center justify-between gap-2">
                                                                    <span className="text-slate-400">{t('pulse')}</span>
                                                                    <span>{row.pulse == null ? '-' : row.pulse}</span>
                                                                </div>
                                                                <div className="mt-1 flex items-center justify-between gap-2">
                                                                    <span className="text-slate-400">{t('temperature')}</span>
                                                                    <span>{formatTemperature(row.temperature)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-500">-</span>
                                                    )}
                                                </td>
                                            </Fragment>
                                        ))}
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    <div className="md:hidden p-3 space-y-3">
                        {pagedRowsFlat.length === 0 ? (
                            <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 px-4 py-8 text-center text-slate-500 text-sm">
                                {loading ? t('syncing') : (searchTerm.trim() || dateFrom || dateTo ? t('noEventsForFilter') : t('dataNotFound'))}
                            </div>
                        ) : (
                            pagedRowsFlat.map((row) => (
                                <motion.div
                                    key={`mobile-${row.id}`}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="rounded-2xl border border-slate-700/50 bg-slate-900/30 p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-100 break-words">{row.driver}</p>
                                            <p className="mt-1 text-xs text-slate-400 break-all">{t('passId')}: {row.passId}</p>
                                        </div>
                                        <span className={`shrink-0 inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border ${statusBadgeClass(row.healthStatus)}`}>
                                            {row.healthStatus === 'passed' ? t('allowed') : row.healthStatus === 'review' ? t('review') : t('rejected')}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 px-2.5 py-2">
                                            <span className="text-slate-400">{t('time')}</span>
                                            <p className="mt-1 text-slate-200 break-words">{formatDateTime(row.sourceTime)}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 px-2.5 py-2">
                                            <span className="text-slate-400">{t('bloodPressure')}</span>
                                            <p className="mt-1 text-slate-200">{row.bp || '-'}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 px-2.5 py-2">
                                            <span className="text-slate-400">{t('pulse')}</span>
                                            <p className="mt-1 text-slate-200">{row.pulse == null ? '-' : row.pulse}</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 px-2.5 py-2">
                                            <span className="text-slate-400">{t('temperature')}</span>
                                            <p className="mt-1 text-slate-200">{formatTemperature(row.temperature)}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>

                <div className="table-pagination-bar px-6 py-4 border-t border-slate-700/50 bg-slate-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p className="text-sm text-slate-400">
                        {totalEmployees === 0
                            ? '0 / 0'
                            : `${(currentPage - 1) * rowsPerPage * 3 + 1}-${Math.min((currentPage - 1) * rowsPerPage * 3 + pagedRowsFlat.length, totalEmployees)} / ${totalEmployees}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <span id="waybill-rows-per-page-label" className="text-sm text-slate-400">
                            {t('rowsPerPage')}:
                        </span>
                        <select
                            aria-labelledby="waybill-rows-per-page-label"
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

            <div className="flex justify-start">
                <button
                    type="button"
                    onClick={() => setIsWaybillFormOpen(true)}
                    className="inline-flex items-center justify-center gap-2 h-10 rounded-full px-5 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                >
                    Yo'l varaqa shakllantirish
                </button>
            </div>

            <WaybillFormModal
                open={isWaybillFormOpen}
                onClose={() => setIsWaybillFormOpen(false)}
                templatePdfUrl={yolVaraqasiPdfUrl}
            />
        </div>
    );
};
