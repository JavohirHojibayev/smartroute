import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Droplets, AlertCircle, CheckCircle2, Search, Table2, FileText, Server, HardHat, Clock, AlertTriangle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from './LocalizedDateInput';

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
    timeMs: number;
    dayKey: string | null;
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
type NormalizedStatus = 'passed' | 'review' | 'failed' | 'annulled';

const API_BASE = resolveApiBaseUrl();

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

const normalizeStatus = (status: string): NormalizedStatus => {
    const value = String(status || '').toLowerCase();
    if (value === 'passed') return 'passed';
    if (value === 'review' || value === 'manual_review' || value === "ko'rik" || value === 'korik') return 'review';
    if (value === 'annulled') return 'annulled';
    return 'failed';
};

const statusRank = (status: NormalizedStatus) => {
    if (status === 'passed') return 4;
    if (status === 'review') return 3;
    if (status === 'failed') return 2;
    return 1;
};

const effectiveStatusMatches = (filter: Exclude<SummaryStatusFilter, 'all'>, status: NormalizedStatus) => {
    if (filter === 'passed') return status === 'passed';
    if (filter === 'review') return status === 'review';
    return status === 'failed' || status === 'annulled';
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

const getEmployeeKey = (row: Pick<EsmoJournalRow, 'id' | 'name' | 'passId'>) => {
    const passKey = String(row.passId || '').trim().replace(/^0+/, '').toLowerCase();
    if (passKey) return `pass:${passKey}`;

    const nameKey = String(row.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    return nameKey ? `name:${nameKey}` : `row:${row.id}`;
};

const buildBestStatusByEmployee = (sourceRows: EsmoJournalRow[]) => {
    const bestByEmployee = new Map<string, { status: NormalizedStatus; rank: number; latestTimeMs: number }>();

    for (const row of sourceRows) {
        const key = getEmployeeKey(row);
        const status = normalizeStatus(row.status);
        const rank = statusRank(status);
        const existing = bestByEmployee.get(key);

        if (!existing || rank > existing.rank || (rank === existing.rank && row.timeMs > existing.latestTimeMs)) {
            bestByEmployee.set(key, { status, rank, latestTimeMs: row.timeMs });
        }
    }

    return bestByEmployee;
};

/** Jurnal / eksport: barcha terminallar bir xil qisqa format (ATX-1, TKM-3, …). */
const formatDeviceName = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const canonical = raw.match(/\b(ATX|TKM)\s*(\d+)\s*-\s*terminal\b/i);
    if (canonical) {
        return `${canonical[1].toUpperCase()}-${canonical[2]}`;
    }
    const loose = raw.trim().toLowerCase();
    if (loose === 'atx-1' || loose === 'axt-1') return 'ATX-1';
    if (loose === 'atx-2' || loose === 'axt-2') return 'ATX-2';
    const tkmLoose = loose.match(/^tkm-([1-9]\d*)$/);
    if (tkmLoose) return `TKM-${tkmLoose[1]}`;
    return raw;
};

const getDateKeyInTashkent = (value: string): string | null => {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Tashkent',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(parsed);

        const year = parts.find((p) => p.type === 'year')?.value;
        const month = parts.find((p) => p.type === 'month')?.value;
        const day = parts.find((p) => p.type === 'day')?.value;
        if (year && month && day) return `${year}-${month}-${day}`;
    }

    const isoMatch = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    const dotMatch = String(value).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (dotMatch) return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;

    return null;
};

export const MedicalManager = () => {
    const { t, lang } = useI18n();
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
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState(() => {
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('search') || '';
        }
        return '';
    });
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState<SummaryStatusFilter>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const smartRouteStatus: 'online' | 'offline' = error ? 'offline' : 'online';

    const loadSummaryAndJournal = async (showLoading = false) => {
        if (showLoading) setLoading(true);

        try {
            const summaryParams = new URLSearchParams();
            const journalParams = new URLSearchParams({ limit: dateFrom || dateTo ? '5000' : '1200' });
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

            const [summaryRes, journalRes] = await Promise.all([
                fetch(summaryUrl),
                fetch(journalUrl),
            ]);

            if (!summaryRes.ok || !journalRes.ok) {
                throw new Error(t('esmoApiError'));
            }

            const summaryData = await summaryRes.json();
            const journalData = await journalRes.json();

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
                    status: normalizeStatus(String(row?.status || row?.statusCode || 'failed')) as EsmoJournalRow['status'],
                    time: String(row?.time || ''),
                    device: String(row?.device || '-'),
                    deviceIp: String(row?.deviceIp || '-'),
                    alcoholDetected: typeof row?.alcoholDetected === 'boolean' ? row.alcoholDetected : null,
                    timeMs: Number.isNaN(Date.parse(String(row?.time || '')))
                        ? Number.NEGATIVE_INFINITY
                        : Date.parse(String(row?.time || '')),
                    dayKey: getDateKeyInTashkent(String(row?.time || '')),
                }))
                : [];

            setRows(mappedRows);
            setError(null);
        } catch {
            setError(t('esmoServerError'));
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        void loadSummaryAndJournal(true);
        const interval = setInterval(() => {
            void loadSummaryAndJournal(false);
        }, 10000);
        return () => clearInterval(interval);
    }, [dateFrom, dateTo]);

    const loadDevices = async () => {
        try {
            const response = await fetch(`${API_BASE}/integrations/esmo/devices`);
            if (!response.ok) {
                return;
            }
            const devicesData = await response.json();
            setDevices(Array.isArray(devicesData) ? devicesData : []);
        } catch {
            // Keep latest device snapshot when endpoint is temporarily unavailable.
        }
    };

    useEffect(() => {
        void loadDevices();
        const interval = setInterval(() => {
            void loadDevices();
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const todayKey = getTodayTashkent();

        const searchedRows = rows.filter((row) => {
            if (query) {
                const haystack = `${row.name} ${row.passId || ''} ${row.device || ''} ${row.deviceIp || ''}`.toLowerCase();
                if (!haystack.includes(query)) return false;
            }
            return true;
        });

        const scopedRows = statusFilter !== 'all' && !dateFrom && !dateTo
            ? searchedRows.filter((row) => {
                return Boolean(row.dayKey && row.dayKey === todayKey);
            })
            : searchedRows;

        if (statusFilter === 'all') {
            return scopedRows;
        }

        const bestByEmployee = buildBestStatusByEmployee(scopedRows);

        return scopedRows.filter((row) => {
            const effectiveStatus = bestByEmployee.get(getEmployeeKey(row))?.status ?? normalizeStatus(row.status);
            return effectiveStatusMatches(statusFilter, effectiveStatus);
        });
    }, [rows, searchQuery, statusFilter, dateFrom, dateTo]);

    const widgetSummary = useMemo<EsmoSummary>(() => {
        const todayKey = getTodayTashkent();
        const summaryRows = dateFrom || dateTo
            ? rows
            : rows.filter((row) => Boolean(row.dayKey && row.dayKey === todayKey));

        if (summaryRows.length === 0) {
            return summary;
        }

        const bestByEmployee = buildBestStatusByEmployee(summaryRows);
        let passedToday = 0;
        let reviewToday = 0;
        let failedToday = 0;

        for (const entry of bestByEmployee.values()) {
            if (entry.status === 'passed') {
                passedToday += 1;
            } else if (entry.status === 'review') {
                reviewToday += 1;
            } else {
                failedToday += 1;
            }
        }

        return {
            ...summary,
            totalToday: passedToday + reviewToday + failedToday,
            passedToday,
            reviewToday,
            failedToday,
        };
    }, [rows, summary, dateFrom, dateTo]);

    const totalRows = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

    const pagedRows = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredRows.slice(start, start + rowsPerPage);
    }, [filteredRows, currentPage, rowsPerPage]);

    const exportScopedRows = useMemo(() => {
        if (dateFrom || dateTo) return filteredRows;

        const todayKey = getTodayTashkent();
        return filteredRows.filter((row) => Boolean(row.dayKey && row.dayKey === todayKey));
    }, [filteredRows, dateFrom, dateTo]);

    useEffect(() => {
        setCurrentPage(1);
    }, [dateFrom, dateTo, searchQuery, statusFilter]);

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const mapRowsToExportRows = (inputRows: EsmoJournalRow[]) => {
        return inputRows.map((row) => ({
            name: row.name || t('unknownEmployee'),
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
        const datePart = dateFrom || dateTo
            ? `${dateFrom || 'start'}_${dateTo || 'end'}`
            : getTodayTashkent();
        return `esmo_journal_${datePart}.${ext}`;
    };

    const handleExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            const exportRows = mapRowsToExportRows(exportScopedRows);
            if (exportRows.length === 0) return;

            const headers = [t('employee'), t('time'), t('bloodPressure'), t('pulse'), t('temperature'), t('alcohol'), t('conclusion'), t('device')];
            const dataRows = exportRows.map((row) => [row.name, row.time, row.bp, row.pulse, row.temperature, row.alcohol, row.status, row.device]);
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
            const exportRows = mapRowsToExportRows(exportScopedRows);
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

            const tableData = exportRows.map((row) => [row.name, row.time, row.bp, row.pulse, row.temperature, row.alcohol, row.status, row.device]);
            autoTable(doc, {
                head: [[t('employee'), t('time'), t('bloodPressure'), t('pulse'), t('temperature'), t('alcohol'), t('conclusion'), t('device')]],
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
    const handleWidgetClick = (filterId: SummaryStatusFilter) => {
        setStatusFilter((prev) => (prev === filterId ? 'all' : filterId));
        setCurrentPage(1);
    };

    const statCards = [
        {
            id: 'ALL',
            filterId: 'all' as const,
            title: lang === 'uz' ? 'JAMI XODIMLAR' : 'ВСЕГО СОТРУДНИКОВ',
            value: formatNumber(widgetSummary.totalToday),
            color: 'from-blue-500 to-cyan-400',
            icon: <HardHat />,
        },
        {
            id: 'PASSED',
            filterId: 'passed' as const,
            title: lang === 'uz' ? 'RUXSAT ETILDI' : 'ДОПУЩЕНО',
            value: formatNumber(widgetSummary.passedToday),
            color: 'from-emerald-500 to-teal-400',
            icon: <CheckCircle2 />,
        },
        {
            id: 'REVIEW',
            filterId: 'review' as const,
            title: lang === 'uz' ? "KO'RIKDA" : 'НА ОСМОТРЕ',
            value: formatNumber(widgetSummary.reviewToday),
            color: 'from-orange-500 to-amber-400',
            icon: <Clock />,
        },
        {
            id: 'FAILED',
            filterId: 'failed' as const,
            title: lang === 'uz' ? 'RAD ETILDI' : 'ОТКЛОНЕНО',
            value: formatNumber(widgetSummary.failedToday),
            color: 'from-red-500 to-rose-400',
            icon: <AlertTriangle />,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <div
                        key={card.id}
                        onClick={() => handleWidgetClick(card.filterId)}
                        className={`glass-panel rounded-2xl p-4 border relative overflow-hidden group cursor-pointer transition-all duration-300 ${
                            statusFilter === card.filterId
                                ? 'border-blue-500/70 ring-2 ring-blue-500/30 scale-[1.02]'
                                : 'border-slate-700/50 hover:border-slate-600/60'
                        }`}
                    >
                        <div className={`absolute -right-6 -top-6 w-36 h-36 bg-gradient-to-br ${card.color} rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500`}></div>
                        <div className="relative z-10 flex items-start justify-between gap-4">
                            <div>
                                <div className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">{card.value}</div>
                                <div className="text-xs uppercase tracking-wider text-slate-400 mt-2">{card.title}</div>
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

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                <div className="lg:col-span-3 glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                    <div className="p-6 border-b border-slate-700/50 flex flex-col gap-5">
                        <h3 className="app-module-heading">
                            {t('esmoJournalTitle')}
                        </h3>
                        
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-3 flex-1">
                                <div className="relative flex-1 min-w-[200px] max-w-[280px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        placeholder={t('searchByEmployee')}
                                        className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500 transition-all w-full"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <LocalizedDateInput
                                        label={t('dateFromSanadan')}
                                        value={dateFrom}
                                        maxDate={dateTo || undefined}
                                        onChange={(v) => {
                                            setDateFrom(v);
                                            setCurrentPage(1);
                                        }}
                                        minWidth={140}
                                    />
                                    <LocalizedDateInput
                                        label={t('dateToSanagacha')}
                                        value={dateTo}
                                        minDate={dateFrom || undefined}
                                        onChange={(v) => {
                                            setDateTo(v);
                                            setCurrentPage(1);
                                        }}
                                        minWidth={140}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleExportExcel}
                                    disabled={exportScopedRows.length === 0 || exportingXls || exportingPdf}
                                    className="inline-flex min-w-0 flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Table2 size={16} />
                                    {exportingXls ? t('exportingXls') : t('exportXls')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportPdf}
                                    disabled={exportScopedRows.length === 0 || exportingPdf || exportingXls}
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
                                <tr className="bg-slate-900/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="px-6 py-4">{t('employee')}</th>
                                    <th className="px-6 py-4">{t('time')}</th>
                                    <th className="px-6 py-4">{t('bloodPressure')}</th>
                                    <th className="px-6 py-4">{t('pulse')}</th>
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
                                            <div className="!font-normal text-slate-300 group-hover:text-blue-400 transition-colors break-words whitespace-normal leading-6">{log.name || t('unknownEmployee')}</div>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-400 font-mono">{formatDateTime(log.time)}</td>
                                        <td className="px-6 py-4 text-xs font-medium text-slate-300">{log.bp || '-'}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs">{log.pulse == null ? '-' : `${log.pulse}`}</div>
                                        </td>
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
                    <div className="table-pagination-bar px-6 py-4 border-t border-slate-700/50 bg-slate-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <p className="text-sm text-slate-400">
                            {totalRows === 0
                                ? '0 / 0'
                                : `${(currentPage - 1) * rowsPerPage + 1}-${Math.min((currentPage - 1) * rowsPerPage + pagedRows.length, totalRows)} / ${totalRows}`}
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
                                    aria-label={t('rowsPerPage')}
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

                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-2xl border border-slate-700/50">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center justify-between">
                            {summaryTitle}
                            <Activity size={12} />
                        </h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-slate-400">{t('total')}</span><span className="font-bold">{widgetSummary.totalToday}</span></div>
                            <div className="flex justify-between"><span className="text-emerald-400">{t('allowed')}</span><span className="font-bold">{widgetSummary.passedToday}</span></div>
                            <div className="flex justify-between"><span className="text-orange-400">{t('review')}</span><span className="font-bold">{widgetSummary.reviewToday}</span></div>
                            <div className="flex justify-between"><span className="text-red-400">{t('rejected')}</span><span className="font-bold">{widgetSummary.failedToday}</span></div>
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


