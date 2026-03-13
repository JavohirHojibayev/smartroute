import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, LogIn, ArrowLeftToLine, RefreshCw, Search, CalendarDays, Download, FileDown } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { useI18n } from '../i18n';

type AccessLogRow = {
    id: number;
    name: string;
    time: string;
    type: 'entrance' | 'exit' | string;
    device?: string;
    deviceIp?: string | null;
    status?: string;
    verificationStatus?: string;
};

type AccessSummary = {
    totalToday: number;
    flaggedToday: number;
    exitsToday: number;
    systemStatus: 'online' | 'offline' | string;
    turnstiles?: AccessSummaryTurnstile[];
};

type AccessSummaryTurnstile = {
    key?: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
    lastSeen?: string | null;
    status?: 'online' | 'offline' | string;
};

type LogsApiResponse = AccessLogRow[] | {
    items?: AccessLogRow[];
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
};

type TurnstileKey =
    | 'kirish-1'
    | 'kirish-2'
    | 'kirish-3'
    | 'chiqish-1'
    | 'chiqish-2'
    | 'chiqish-3';

const TOP_ROW_TURNSTILES: TurnstileKey[] = ['kirish-1', 'kirish-2', 'kirish-3'];
const BOTTOM_ROW_TURNSTILES: TurnstileKey[] = ['chiqish-1', 'chiqish-2', 'chiqish-3'];
const TURNSTILE_KEY_BY_IP: Record<string, TurnstileKey> = {
    '192.168.0.223': 'kirish-1',
    '192.168.0.221': 'kirish-2',
    '192.168.0.219': 'kirish-3',
    '192.168.0.224': 'chiqish-1',
    '192.168.0.222': 'chiqish-2',
    '192.168.0.220': 'chiqish-3',
};
const TURNSTILE_KEY_BY_DEVICE_ID: Record<string, TurnstileKey> = {
    'IN-1': 'kirish-1',
    'IN-2': 'kirish-2',
    'IN-3': 'kirish-3',
    'OUT-1': 'chiqish-1',
    'OUT-2': 'chiqish-2',
    'OUT-3': 'chiqish-3',
};

const fallbackHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, '') || `http://${fallbackHost}:3000`;
const TURNSTILE_OFFLINE_MINUTES = Math.max(
    Number.parseInt((import.meta as any).env?.VITE_TURNSTILE_OFFLINE_MINUTES ?? '480', 10) || 480,
    5,
);
const TURNSTILE_OFFLINE_AFTER_MS = TURNSTILE_OFFLINE_MINUTES * 60 * 1000;
const ID_ONLY_NAME_REGEX = /^ID-\d+$/i;

const toDisplayName = (value: string | null | undefined, unknownEmployeeLabel: string) => {
    const raw = String(value ?? '').trim();
    if (!raw || ID_ONLY_NAME_REGEX.test(raw)) return unknownEmployeeLabel;
    return raw;
};

export const AccessControlManager = () => {
    const { t } = useI18n();
    const [logs, setLogs] = useState<AccessLogRow[]>([]);
    const [summary, setSummary] = useState<AccessSummary>({
        totalToday: 0,
        flaggedToday: 0,
        exitsToday: 0,
        systemStatus: 'online',
        turnstiles: [],
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const isFetchingRef = useRef(false);
    const dateFromRef = useRef<HTMLInputElement | null>(null);
    const dateToRef = useRef<HTMLInputElement | null>(null);

    const loadData = async (showLoading = false) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        if (showLoading) setLoading(true);

        try {
            const [summaryRes, logsRes] = await Promise.all([
                fetch(`${API_BASE}/integrations/hikvision/summary`),
                fetch(`${API_BASE}/integrations/hikvision/logs?limit=500`),
            ]);

            if (!summaryRes.ok || !logsRes.ok) {
                throw new Error('API request failed');
            }

            const summaryData = await summaryRes.json();
            const logsData = await logsRes.json();

            setSummary({
                totalToday: Number(summaryData?.totalToday ?? 0),
                flaggedToday: Number(summaryData?.flaggedToday ?? 0),
                exitsToday: Number(summaryData?.exitsToday ?? 0),
                systemStatus: String(summaryData?.systemStatus ?? 'offline'),
                turnstiles: Array.isArray(summaryData?.turnstiles) ? summaryData.turnstiles : [],
            });

            if (Array.isArray(logsData)) {
                setLogs(logsData.map((row: AccessLogRow) => ({
                    ...row,
                    name: toDisplayName(row?.name, t('unknownEmployee')),
                })));
            } else {
                const apiItems = Array.isArray(logsData?.items) ? logsData.items : [];
                setLogs(apiItems.map((row: AccessLogRow) => ({
                    ...row,
                    name: toDisplayName(row?.name, t('unknownEmployee')),
                })));
            }

            setError(null);
            setIsLive(true);
        } catch (_e) {
            setError(t('serverDataError'));
            setIsLive(false);
        } finally {
            if (showLoading) setLoading(false);
            isFetchingRef.current = false;
        }
    };

    useEffect(() => {
        loadData(true);
        const interval = setInterval(() => loadData(false), 3000);
        return () => clearInterval(interval);
    }, []);

    const filteredLogs = useMemo(() => {
        const ordered = [...logs].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        const query = searchQuery.trim().toLowerCase();
        const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
        const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

        return ordered.filter((log) => {
            if (query && !String(log.name || '').toLowerCase().includes(query)) return false;

            if (fromMs !== null || toMs !== null) {
                const logMs = new Date(log.time).getTime();
                if (!Number.isNaN(logMs)) {
                    if (fromMs !== null && logMs < fromMs) return false;
                    if (toMs !== null && logMs > toMs) return false;
                }
            }

            return true;
        });
    }, [logs, searchQuery, dateFrom, dateTo]);

    const overallInOutTotal = Math.max(0, summary.totalToday + summary.exitsToday);
    const effectiveLogs = useMemo(() => {
        if (searchQuery.trim() || dateFrom || dateTo) return filteredLogs;
        if (overallInOutTotal <= 0) return filteredLogs;
        return filteredLogs.slice(0, overallInOutTotal);
    }, [filteredLogs, overallInOutTotal, searchQuery, dateFrom, dateTo]);

    const totalRows = effectiveLogs.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const pagedLogs = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return effectiveLogs.slice(start, start + rowsPerPage);
    }, [effectiveLogs, currentPage, rowsPerPage]);

    const formatDateTime = (iso: string) => {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

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

    const toDisplayTurnstileLabel = (key: TurnstileKey) => {
        const [group, number] = key.split('-');
        const prefix = group === 'kirish' ? t('turnstileLabelEntry') : t('turnstileLabelExit');
        return `${prefix}-${number}`;
    };

    const resolveTurnstileKey = (device?: string, deviceIp?: string | null): TurnstileKey | null => {
        const normalizedIp = String(deviceIp ?? '').trim();
        if (normalizedIp && TURNSTILE_KEY_BY_IP[normalizedIp]) {
            return TURNSTILE_KEY_BY_IP[normalizedIp];
        }

        const normalizedDevice = String(device ?? '')
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/_/g, '-');

        const match = normalizedDevice.match(/(kirish|chiqish)-?([123])/);
        if (!match) return null;
        const key = `${match[1]}-${match[2]}` as TurnstileKey;
        return key;
    };

    const resolveTurnstileKeyFromSummary = (row: AccessSummaryTurnstile): TurnstileKey | null => {
        const fromKey = String(row?.key ?? '').trim().toLowerCase();
        if (fromKey === 'kirish-1' || fromKey === 'kirish-2' || fromKey === 'kirish-3' || fromKey === 'chiqish-1' || fromKey === 'chiqish-2' || fromKey === 'chiqish-3') {
            return fromKey as TurnstileKey;
        }

        const normalizedIp = String(row?.ip ?? '').trim();
        if (normalizedIp && TURNSTILE_KEY_BY_IP[normalizedIp]) {
            return TURNSTILE_KEY_BY_IP[normalizedIp];
        }

        const normalizedDeviceId = String(row?.deviceId ?? '').trim().toUpperCase();
        if (normalizedDeviceId && TURNSTILE_KEY_BY_DEVICE_ID[normalizedDeviceId]) {
            return TURNSTILE_KEY_BY_DEVICE_ID[normalizedDeviceId];
        }

        const normalizedDeviceName = String(row?.deviceName ?? '')
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/_/g, '-');

        const match = normalizedDeviceName.match(/(kirish|chiqish)-?([123])/);
        if (!match) return null;
        return `${match[1]}-${match[2]}` as TurnstileKey;
    };

    const turnstileStatuses = useMemo(() => {
        const allTurnstiles: TurnstileKey[] = [...TOP_ROW_TURNSTILES, ...BOTTOM_ROW_TURNSTILES];
        const statusMap = allTurnstiles.reduce<Record<TurnstileKey, 'online' | 'offline'>>((acc, key) => {
            acc[key] = 'offline';
            return acc;
        }, {} as Record<TurnstileKey, 'online' | 'offline'>);

        if (!isLive) return statusMap;

        const summaryTurnstiles = Array.isArray(summary.turnstiles) ? summary.turnstiles : [];
        if (summaryTurnstiles.length > 0) {
            for (const turnstileRow of summaryTurnstiles) {
                const key = resolveTurnstileKeyFromSummary(turnstileRow);
                if (!key) continue;
                statusMap[key] = String(turnstileRow?.status || '').toLowerCase() === 'online' ? 'online' : 'offline';
            }
            return statusMap;
        }

        const latestSeenMs: Partial<Record<TurnstileKey, number>> = {};
        for (const row of logs) {
            const key = resolveTurnstileKey(row.device, row.deviceIp);
            if (!key) continue;
            const eventMs = new Date(row.time).getTime();
            if (Number.isNaN(eventMs)) continue;
            if (!latestSeenMs[key] || eventMs > (latestSeenMs[key] as number)) {
                latestSeenMs[key] = eventMs;
            }
        }

        const seenCount = Object.keys(latestSeenMs).length;
        if (seenCount === 0) {
            const fallbackStatus: 'online' | 'offline' = summary.systemStatus === 'online' ? 'online' : 'offline';
            for (const key of allTurnstiles) statusMap[key] = fallbackStatus;
            return statusMap;
        }

        const now = Date.now();
        for (const key of allTurnstiles) {
            const lastSeen = latestSeenMs[key];
            if (!lastSeen) {
                statusMap[key] = 'offline';
                continue;
            }
            statusMap[key] = now - lastSeen <= TURNSTILE_OFFLINE_AFTER_MS ? 'online' : 'offline';
        }

        return statusMap;
    }, [isLive, logs, summary.systemStatus, summary.turnstiles]);

    const mapLogsToExportRows = (inputLogs: AccessLogRow[]) => {
        return inputLogs.map((log) => {
            const isEntrance = (log.type || 'entrance') === 'entrance';
            return {
                name: toDisplayName(log.name, t('unknownEmployee')),
                time: formatDateTime(String(log.time ?? '')),
                action: String(log.device || (isEntrance ? t('entrance') : t('exit'))),
                deviceIp: String(log.deviceIp || '-'),
            };
        });
    };

    const buildExportFileName = (ext: 'xls' | 'pdf') => {
        const datePart = new Date().toISOString().split('T')[0];
        return `turnstile_journal_${datePart}.${ext}`;
    };

    const filterLogsByDate = (inputLogs: AccessLogRow[]) => {
        const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
        const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

        if (fromMs === null && toMs === null) return inputLogs;

        return inputLogs.filter((log) => {
            const logMs = new Date(log.time).getTime();
            if (Number.isNaN(logMs)) return false;
            if (fromMs !== null && logMs < fromMs) return false;
            if (toMs !== null && logMs > toMs) return false;
            return true;
        });
    };

    const fetchAllLogsForExport = async (): Promise<AccessLogRow[]> => {
        const searchValue = searchQuery.trim();
        const pageLimit = 500;
        let page = 1;
        let totalPages = 1;
        const allRows: AccessLogRow[] = [];

        while (page <= totalPages) {
            const params = new URLSearchParams({
                limit: String(pageLimit),
                page: String(page),
            });
            if (searchValue) params.set('search', searchValue);

            const response = await fetch(`${API_BASE}/integrations/hikvision/logs?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Export logs request failed');
            }

            const payload = (await response.json()) as LogsApiResponse;
            if (Array.isArray(payload)) {
                return filterLogsByDate(payload);
            }

            const items = Array.isArray(payload?.items) ? payload.items : [];
            allRows.push(...items);

            const apiTotalPages = Number.parseInt(String(payload?.totalPages ?? 1), 10);
            totalPages = Number.isFinite(apiTotalPages) ? Math.max(1, apiTotalPages) : 1;
            page += 1;
        }

        const uniqueById = new Map<number, AccessLogRow>();
        for (const row of allRows) {
            if (!uniqueById.has(row.id)) {
                uniqueById.set(row.id, row);
            }
        }

        const sorted = [...uniqueById.values()].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        return filterLogsByDate(sorted);
    };

    const handleExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            const sourceLogs = await fetchAllLogsForExport();
            const exportRows = mapLogsToExportRows(sourceLogs);
            if (exportRows.length === 0) return;

            const headers = [t('employeeDriver'), t('time'), t('action'), t('device')];
            const dataRows = exportRows.map((row) => [row.name, row.time, row.action, row.deviceIp]);
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
            const sourceLogs = await fetchAllLogsForExport();
            const exportRows = mapLogsToExportRows(sourceLogs);
            if (exportRows.length === 0) return;

            const doc = new jsPDF({ orientation: 'landscape' });

            // MineTrack-style Cyrillic support via Roboto font.
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
                // If font loading fails, keep default font.
            }

            doc.setFontSize(16);
            doc.text(t('turnstileJournalTitle'), 14, 18);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`${t('createdAt')}: ${new Date().toLocaleString()}`, 14, 25);

            const tableData = exportRows.map((row) => [row.name, row.time, row.action, row.deviceIp]);

            autoTable(doc, {
                head: [[t('employeeDriver'), t('time'), t('action'), t('device')]],
                body: tableData,
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 9, font: 'Roboto' },
                columnStyles: { 0: { cellWidth: 170 } },
            });

            doc.save(buildExportFileName('pdf'));
        } catch (_error) {
            setError(t('pdfExportError'));
        } finally {
            setExportingPdf(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-2xl flex items-center gap-4 border-l-4 border-l-blue-500">
                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl"><LogIn size={24} /></div>
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase">{t('todayEntrances')}</p>
                        <p className="text-2xl font-bold">{summary.totalToday}</p>
                    </div>
                </div>
                <div className="glass-panel p-6 rounded-2xl flex items-center gap-4 border-l-4 border-l-orange-500">
                    <div className="p-3 bg-orange-500/10 text-orange-400 rounded-xl"><ArrowLeftToLine size={24} /></div>
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase">{t('todayExits')}</p>
                        <p className="text-2xl font-bold">{summary.exitsToday}</p>
                    </div>
                </div>
                <div className="glass-panel p-4 rounded-2xl flex items-center gap-4 border-l-4 border-l-slate-500">
                    <div className="p-3 bg-slate-500/10 text-slate-400 rounded-xl"><Shield size={24} /></div>
                    <div className="flex-1 min-w-0">
                        <div className="grid grid-cols-3 gap-x-10 gap-y-2 w-full text-base leading-none text-slate-200 font-semibold">
                            {[...TOP_ROW_TURNSTILES, ...BOTTOM_ROW_TURNSTILES].map((turnstileKey) => {
                                const isOnline = turnstileStatuses[turnstileKey] === 'online';
                                return (
                                    <div key={turnstileKey} className="flex items-center gap-2">
                                        <span
                                            className={`${isOnline ? 'bg-emerald-400' : 'bg-amber-400'} w-2.5 h-2.5 rounded-full animate-pulse`}
                                            aria-hidden="true"
                                        />
                                        <span className={isOnline ? 'text-emerald-300' : 'text-amber-300'}>
                                            {toDisplayTurnstileLabel(turnstileKey)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                <div className="p-6 border-b border-slate-700/50 flex justify-between items-center gap-4 bg-slate-800/20">
                    <div className="flex items-center gap-4 min-w-0 flex-1 flex-wrap">
                        <h3 className="font-bold text-2xl md:text-[30px] leading-none shrink-0 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                            {t('turnstileJournalTitle')}
                        </h3>
                        <div className="relative w-full max-w-md min-w-[260px] ml-2 md:ml-auto">
                            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder={t('searchEmployee')}
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
                                        onChange={(e) => {
                                            setDateFrom(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="date-input-system bg-slate-900/50 border border-slate-700/60 rounded-lg pl-3 pr-11 py-3 text-sm text-slate-200 outline-none focus:border-blue-500/60"
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
                                        className="date-input-system bg-slate-900/50 border border-slate-700/60 rounded-lg pl-3 pr-11 py-3 text-sm text-slate-200 outline-none focus:border-blue-500/60"
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

                {error && (
                    <div className="px-6 py-3 text-xs text-red-400 bg-red-500/5 border-b border-red-500/20">
                        {error}
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-left">
                        <colgroup>
                            <col className="w-[32%]" />
                            <col className="w-[28%]" />
                            <col className="w-[23%]" />
                            <col className="w-[17%]" />
                        </colgroup>
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-300 text-xs uppercase tracking-wide">
                                <th className="px-6 py-4 !font-normal">{t('employees')}</th>
                                <th className="px-6 py-4 text-center">{t('time')}</th>
                                <th className="px-6 py-4 text-center">{t('action')}</th>
                                <th className="px-6 py-4 text-center">{t('device')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {effectiveLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-10 text-center text-slate-500 text-sm">
                                        {(searchQuery.trim() || dateFrom || dateTo) ? t('noEventsForFilter') : t('noEventsYet')}
                                    </td>
                                </tr>
                            ) : (
                                pagedLogs.map((log) => {
                                    const isEntrance = (log.type || 'entrance') === 'entrance';
                                    return (
                                        <motion.tr
                                            key={log.id}
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                            className="hover:bg-slate-800/40 transition-all text-sm group"
                                        >
                                            <td className="px-6 py-4 !font-normal">
                                                <div className="!font-normal text-slate-300 group-hover:text-blue-400 transition-colors break-words whitespace-normal leading-6">{log.name}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono text-sm text-slate-300">{formatDateTime(log.time)}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-center">
                                                    {isEntrance ? (
                                                        <span className="text-emerald-400 font-semibold inline-flex items-center gap-1.5"><LogIn size={15} /> {log.device || t('entrance')}</span>
                                                    ) : (
                                                        <span className="text-amber-400 font-semibold inline-flex items-center gap-1.5"><ArrowLeftToLine size={15} /> {log.device || t('exit')}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="font-mono text-sm text-slate-300">{log.deviceIp || '-'}</div>
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p className="text-sm text-slate-400">
                        {totalRows === 0
                            ? '0 / 0'
                            : `${(currentPage - 1) * rowsPerPage + 1}-${Math.min((currentPage - 1) * rowsPerPage + pagedLogs.length, totalRows)} / ${totalRows}`}
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
        </div>
    );
};
