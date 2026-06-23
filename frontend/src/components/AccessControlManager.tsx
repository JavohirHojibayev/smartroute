import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, LogIn, ArrowLeftToLine, Search, Table2, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from './LocalizedDateInput';

type AccessLogRow = {
    id: number;
    name: string;
    department?: string | null;
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
    incremental?: boolean;
    latestId?: number;
};

type TurnstileKey =
    | 'kirish-1'
    | 'kirish-2'
    | 'kirish-3'
    | 'chiqish-1'
    | 'chiqish-2'
    | 'chiqish-3'
    | 'shaxta-kirish'
    | 'shaxta-chiqish';

const TOP_ROW_TURNSTILES: TurnstileKey[] = ['kirish-1', 'kirish-2', 'kirish-3', 'shaxta-kirish'];
const BOTTOM_ROW_TURNSTILES: TurnstileKey[] = ['chiqish-1', 'chiqish-2', 'chiqish-3', 'shaxta-chiqish'];
const TURNSTILE_KEY_BY_IP: Record<string, TurnstileKey> = {};
const TURNSTILE_KEY_BY_DEVICE_ID: Record<string, TurnstileKey> = {
    'IN-1': 'kirish-1',
    'IN-2': 'kirish-2',
    'IN-3': 'kirish-3',
    'OUT-1': 'chiqish-1',
    'OUT-2': 'chiqish-2',
    'OUT-3': 'chiqish-3',
    'IN-MINE-1': 'shaxta-kirish',
    'OUT-MINE-1': 'shaxta-chiqish',
};

/** Backend `HIKVISION_EXTRA_DEVICE_MAP` dagi `key` → UI turnstile kaliti */
const SUMMARY_DEVICE_KEY_TO_TURNSTILE: Record<string, TurnstileKey> = {
    'shaxta-kirish': 'shaxta-kirish',
    'shaxta-chiqish': 'shaxta-chiqish',
    'mine-shahta-kirish': 'shaxta-kirish',
    'mine-shahta-chiqish': 'shaxta-chiqish',
};

const API_BASE = resolveApiBaseUrl();
const TURNSTILE_OFFLINE_MINUTES = Math.max(
    Number.parseInt((import.meta as any).env?.VITE_TURNSTILE_OFFLINE_MINUTES ?? '480', 10) || 480,
    5,
);
const TURNSTILE_OFFLINE_AFTER_MS = TURNSTILE_OFFLINE_MINUTES * 60 * 1000;
/** Jurnalni turniket bilan yaqin real vaqtda ushlash: polling oralig‘i (ms). */
const TURNSTILE_POLL_MS = Math.min(
    60_000,
    Math.max(800, Number.parseInt((import.meta as any).env?.VITE_TURNSTILE_POLL_MS ?? '2000', 10) || 2000),
);
/** Eksportda bir API so‘rovidagi qatorlar (backend `HIKVISION_LOGS_MAX_LIMIT` bilan mos). */
const TURNSTILE_EXPORT_PAGE_SIZE = Math.min(
    5_000_000,
    Math.max(500, Number.parseInt((import.meta as any).env?.VITE_TURNSTILE_EXPORT_PAGE_SIZE ?? '20000', 10) || 20_000),
);
const TURNSTILE_ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
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
    const [error, setError] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(true);
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState<number>(10);
    const [totalRows, setTotalRows] = useState(0);
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [tabVisible, setTabVisible] = useState(
        () => typeof document !== 'undefined' && document.visibilityState === 'visible',
    );
    const [filterType, setFilterType] = useState<'all' | 'entrance' | 'exit'>('all');
    const isFetchingRef = useRef(false);
    const latestLogIdRef = useRef(0);
    const normalizeLogRows = (rows: AccessLogRow[]) =>
        rows.map((row) => ({
            ...row,
            name: toDisplayName(row?.name, t('unknownEmployee')),
        }));

    const parseLogsPayload = (payload: LogsApiResponse): { items: AccessLogRow[]; totalPages: number; total: number; page: number } => {
        if (Array.isArray(payload)) {
            return { items: payload, totalPages: 1, total: payload.length, page: 1 };
        }

        const items = Array.isArray(payload?.items) ? payload.items : [];
        const parsedTotalPages = Number.parseInt(String(payload?.totalPages ?? 1), 10);
        const totalPages = Number.isFinite(parsedTotalPages) ? Math.max(1, parsedTotalPages) : 1;
        const parsedTotal = Number.parseInt(String(payload?.total ?? items.length), 10);
        const total = Number.isFinite(parsedTotal) ? Math.max(0, parsedTotal) : items.length;
        const parsedPage = Number.parseInt(String(payload?.page ?? 1), 10);
        const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
        return { items, totalPages, total, page };
    };

    const mergeLogRowsById = (incoming: AccessLogRow[], existing: AccessLogRow[]) => {
        const byId = new Map<number, AccessLogRow>();
        for (const row of [...incoming, ...existing]) {
            byId.set(row.id, row);
        }
        return Array.from(byId.values()).sort(
            (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
        );
    };

    const loadData = useCallback(async (options?: { incremental?: boolean }) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        const useIncremental =
            options?.incremental === true &&
            currentPage === 1 &&
            !searchQuery.trim() &&
            !dateFrom &&
            !dateTo &&
            latestLogIdRef.current > 0;

        try {
            const summaryParams = new URLSearchParams();
            if (dateFrom) summaryParams.set('dateFrom', dateFrom);
            if (dateTo) summaryParams.set('dateTo', dateTo);
            const summaryQs = summaryParams.toString();

            const logsParams = new URLSearchParams({
                limit: String(useIncremental ? 100 : rowsPerPage),
                page: String(useIncremental ? 1 : currentPage),
            });
            const searchValue = searchQuery.trim();
            if (searchValue) logsParams.set('search', searchValue);
            if (dateFrom) logsParams.set('dateFrom', dateFrom);
            if (dateTo) logsParams.set('dateTo', dateTo);
            if (useIncremental) {
                logsParams.set('sinceId', String(latestLogIdRef.current));
            }
            if (filterType !== 'all') {
                logsParams.set('eventType', filterType);
            }

            const [summaryRes, logsRes] = await Promise.all([
                fetch(`${API_BASE}/integrations/hikvision/summary${summaryQs ? `?${summaryQs}` : ''}`),
                fetch(`${API_BASE}/integrations/hikvision/logs?${logsParams.toString()}`),
            ]);

            if (!summaryRes.ok || !logsRes.ok) {
                throw new Error('API request failed');
            }

            const summaryData = await summaryRes.json();
            const logsData = (await logsRes.json()) as LogsApiResponse;

            setSummary({
                totalToday: Number(summaryData?.totalToday ?? 0),
                flaggedToday: Number(summaryData?.flaggedToday ?? 0),
                exitsToday: Number(summaryData?.exitsToday ?? 0),
                systemStatus: String(summaryData?.systemStatus ?? 'offline'),
                turnstiles: Array.isArray(summaryData?.turnstiles) ? summaryData.turnstiles : [],
            });

            if (!Array.isArray(logsData) && logsData?.incremental && Array.isArray(logsData?.items)) {
                const incoming = normalizeLogRows(logsData.items);
                if (incoming.length > 0) {
                    setLogs((prev) => mergeLogRowsById(incoming, prev).slice(0, rowsPerPage));
                    setTotalRows((prev) => prev + incoming.length);
                    latestLogIdRef.current = Math.max(
                        latestLogIdRef.current,
                        Number(logsData.latestId ?? 0),
                        ...incoming.map((r) => r.id),
                    );
                }
            } else {
                const pageData = parseLogsPayload(logsData);
                const normalized = normalizeLogRows(pageData.items);
                setLogs(normalized);
                setTotalRows(pageData.total);
                if (pageData.page !== currentPage) {
                    setCurrentPage(pageData.page);
                }
                latestLogIdRef.current = normalized.reduce((max, row) => Math.max(max, row.id), 0);
            }

            setError(null);
            setIsLive(true);
        } catch (_e) {
            setError(t('serverDataError'));
            setIsLive(false);
        } finally {
            isFetchingRef.current = false;
        }
    }, [currentPage, dateFrom, dateTo, rowsPerPage, searchQuery, filterType, t]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setSearchQuery(searchInput);
            setCurrentPage(1);
        }, 300);
        return () => window.clearTimeout(timeout);
    }, [searchInput]);

    useEffect(() => {
        const onVisibility = () => {
            const visible = document.visibilityState === 'visible';
            setTabVisible(visible);
            if (visible) {
                loadData();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [loadData]);

    useEffect(() => {
        if (!tabVisible) return;
        if (searchQuery.trim() || dateFrom || dateTo) return;
        const interval = setInterval(() => {
            void loadData({ incremental: true });
        }, TURNSTILE_POLL_MS);
        return () => clearInterval(interval);
    }, [dateFrom, dateTo, loadData, searchQuery, tabVisible]);

    const effectiveLogs = logs;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const pagedLogs = effectiveLogs;

    const formatDateTime = (iso: string) => {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const toDisplayTurnstileLabel = (key: TurnstileKey) => {
        if (key === 'shaxta-kirish') return t('turnstileMineEntrance');
        if (key === 'shaxta-chiqish') return t('turnstileMineExit');
        const [group, number] = key.split('-');
        const prefix = group === 'kirish' ? t('turnstileLabelEntry') : t('turnstileLabelExit');
        return `${prefix}-${number}`;
    };

    const resolveTurnstileKey = (device?: string, deviceIp?: string | null): TurnstileKey | null => {
        const normalizedIp = String(deviceIp ?? '').trim();
        if (normalizedIp && TURNSTILE_KEY_BY_IP[normalizedIp]) {
            return TURNSTILE_KEY_BY_IP[normalizedIp];
        }

        const deviceIdUpper = String(device ?? '').trim().toUpperCase();
        if (deviceIdUpper && TURNSTILE_KEY_BY_DEVICE_ID[deviceIdUpper]) {
            return TURNSTILE_KEY_BY_DEVICE_ID[deviceIdUpper];
        }

        const normalizedDevice = String(device ?? '')
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/_/g, '-');

        const mineNorm = normalizedDevice.replace(/[^a-z0-9]/g, '');
        if (mineNorm.includes('shaxta') && mineNorm.includes('kirish')) {
            return 'shaxta-kirish';
        }
        if (mineNorm.includes('shaxta') && mineNorm.includes('chiqish')) {
            return 'shaxta-chiqish';
        }

        const match = normalizedDevice.match(/(kirish|chiqish)-?([123])/);
        if (!match) return null;
        const key = `${match[1]}-${match[2]}` as TurnstileKey;
        return key;
    };

    /** «Harakat» ustuni: shaxta kalitlari `TURNSTILE_KEY_BY_IP` orqali. */
    const formatJournalMovementLabel = (log: AccessLogRow) => {
        const key = resolveTurnstileKey(log.device, log.deviceIp);
        if (key) return toDisplayTurnstileLabel(key);
        const isEntrance = (log.type || 'entrance') === 'entrance';
        return String(log.device || '').trim() || (isEntrance ? t('entrance') : t('exit'));
    };

    const resolveTurnstileKeyFromSummary = (row: AccessSummaryTurnstile): TurnstileKey | null => {
        const fromKey = String(row?.key ?? '').trim().toLowerCase();
        if (
            fromKey === 'kirish-1' ||
            fromKey === 'kirish-2' ||
            fromKey === 'kirish-3' ||
            fromKey === 'chiqish-1' ||
            fromKey === 'chiqish-2' ||
            fromKey === 'chiqish-3' ||
            fromKey === 'shaxta-kirish' ||
            fromKey === 'shaxta-chiqish'
        ) {
            return fromKey as TurnstileKey;
        }
        const fromExtra = SUMMARY_DEVICE_KEY_TO_TURNSTILE[fromKey];
        if (fromExtra) return fromExtra;

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

        if (normalizedDeviceName.includes('shaxta') && normalizedDeviceName.includes('kirish')) {
            return 'shaxta-kirish';
        }
        if (normalizedDeviceName.includes('shaxta') && normalizedDeviceName.includes('chiqish')) {
            return 'shaxta-chiqish';
        }

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
            return {
                name: toDisplayName(log.name, t('unknownEmployee')),
                department: String(log.department || '-'),
                time: formatDateTime(String(log.time ?? '')),
                action: formatJournalMovementLabel(log),
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
        const pageLimit = TURNSTILE_EXPORT_PAGE_SIZE;
        let page = 1;
        let totalPages = 1;
        const allRows: AccessLogRow[] = [];

        while (page <= totalPages) {
            const params = new URLSearchParams({
                limit: String(pageLimit),
                page: String(page),
            });
            if (searchValue) params.set('search', searchValue);
            if (dateFrom) params.set('dateFrom', dateFrom);
            if (dateTo) params.set('dateTo', dateTo);
            if (filterType !== 'all') params.set('eventType', filterType);

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

            const headers = [t('employees'), t('department'), t('time'), t('action'), t('device')];
            const dataRows = exportRows.map((row) => [row.name, row.department, row.time, row.action, row.deviceIp]);
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
            doc.setTextColor(11, 127, 81);
            doc.text(t('turnstileJournalTitle'), 14, 18);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`${t('createdAt')}: ${new Date().toLocaleString()}`, 14, 25);

            const tableData = exportRows.map((row) => [row.name, row.department, row.time, row.action, row.deviceIp]);

            autoTable(doc, {
                head: [[t('employees'), t('department'), t('time'), t('action'), t('device')]],
                body: tableData,
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 9, font: 'Roboto' },
                columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 90 } },
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
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_max-content] gap-4 md:gap-5">
                <div 
                    onClick={() => {
                        setFilterType(prev => prev === 'entrance' ? 'all' : 'entrance');
                        setCurrentPage(1);
                    }}
                    className={`glass-panel p-5 w-full rounded-2xl flex items-center gap-4 border-l-4 border-l-blue-500 relative overflow-hidden group isolate min-w-0 cursor-pointer transition-all ${filterType === 'entrance' ? 'ring-2 ring-blue-500 scale-[1.02]' : 'hover:scale-[1.01]'}`}
                >
                    <div className="absolute -left-6 -top-6 w-36 h-36 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500 z-0"></div>
                    <div className="relative z-10 p-2.5 bg-blue-500/10 text-blue-400 rounded-xl shadow-xl shrink-0">
                        <LogIn size={24} />
                    </div>
                    <div className="relative z-10 min-w-0">
                        <p className="text-xs text-slate-500 font-bold uppercase leading-tight line-clamp-2">{t('todayEntrances')}</p>
                        <p className="text-2xl sm:text-3xl font-bold tabular-nums">{summary.totalToday}</p>
                    </div>
                </div>
                <div 
                    onClick={() => {
                        setFilterType(prev => prev === 'exit' ? 'all' : 'exit');
                        setCurrentPage(1);
                    }}
                    className={`glass-panel p-5 w-full rounded-2xl flex items-center gap-4 border-l-4 border-l-blue-500 relative overflow-hidden group isolate min-w-0 cursor-pointer transition-all ${filterType === 'exit' ? 'ring-2 ring-blue-500 scale-[1.02]' : 'hover:scale-[1.01]'}`}
                >
                    <div className="absolute -left-6 -top-6 w-36 h-36 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500 z-0"></div>
                    <div className="relative z-10 p-2.5 bg-blue-500/10 text-blue-400 rounded-xl shadow-xl shrink-0">
                        <ArrowLeftToLine size={24} />
                    </div>
                    <div className="relative z-10 min-w-0">
                        <p className="text-xs text-slate-500 font-bold uppercase leading-tight line-clamp-2">{t('todayExits')}</p>
                        <p className="text-2xl sm:text-3xl font-bold tabular-nums">{summary.exitsToday}</p>
                    </div>
                </div>
                <div className="glass-panel p-4 rounded-2xl flex items-center gap-3 border-l-4 border-l-slate-500 w-full md:w-max max-w-full min-w-0 shrink-0">
                    <div className="p-2.5 bg-slate-500/10 text-slate-400 rounded-xl shrink-0"><Shield size={24} /></div>
                    <div className="min-w-0 flex-1 md:flex-none md:overflow-x-auto [scrollbar-width:thin]">
                        <div className="turnstile-device-grid grid w-full md:w-max gap-x-3 sm:gap-x-4 gap-y-2.5 text-sm sm:text-base leading-snug text-slate-200 font-semibold [grid-auto-flow:column] md:[grid-auto-flow:row] [grid-template-columns:repeat(2,minmax(0,1fr))] md:[grid-template-columns:repeat(4,max-content)] [grid-template-rows:repeat(4,auto)] md:[grid-template-rows:none]">
                            {[...TOP_ROW_TURNSTILES, ...BOTTOM_ROW_TURNSTILES].map((turnstileKey) => {
                                const isOnline = turnstileStatuses[turnstileKey] === 'online';
                                return (
                                    <div key={turnstileKey} className="flex items-start gap-2 sm:gap-2.5 min-w-0">
                                        <span
                                            className={`${isOnline ? 'bg-[var(--export-green-text)]' : 'bg-slate-500'} shrink-0 w-3 h-3 rounded-full mt-1 ${isOnline ? 'animate-pulse' : ''}`}
                                            aria-hidden="true"
                                        />
                                        <span className="text-[var(--export-green-text)] whitespace-nowrap min-w-0 overflow-hidden text-ellipsis md:overflow-visible">
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
                <div className="p-4 sm:p-6 border-b border-slate-700/50 space-y-7">
                    <h3 className="app-module-heading">
                        {t('turnstileJournalTitle')}
                    </h3>

                    <div className="flex flex-wrap xl:flex-nowrap items-center gap-2.5 sm:gap-3">
                        <div className="relative mt-4 flex w-full min-h-12 min-w-0 items-center sm:w-[300px] md:w-[330px] lg:w-[360px]">
                            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => {
                                    setSearchInput(e.target.value);
                                }}
                                placeholder={t('searchEmployee')}
                                className="h-12 w-full rounded-lg border border-slate-700/60 bg-slate-900/50 pl-12 pr-3 text-base text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500/60"
                            />
                        </div>

                        <div className="mt-4 flex min-w-0 flex-1 flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:gap-2.5">
                            <LocalizedDateInput
                                label={t('dateFromSanadan')}
                                value={dateFrom}
                                maxDate={dateTo || undefined}
                                onChange={(v) => {
                                    setDateFrom(v);
                                    setCurrentPage(1);
                                }}
                                minWidth={148}
                            />
                            <LocalizedDateInput
                                label={t('dateToSanagacha')}
                                value={dateTo}
                                minDate={dateFrom || undefined}
                                onChange={(v) => {
                                    setDateTo(v);
                                    setCurrentPage(1);
                                }}
                                minWidth={148}
                            />
                        </div>

                        <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:flex-nowrap sm:justify-end sm:gap-3">
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={totalRows === 0 || exportingXls || exportingPdf}
                                className="inline-flex h-10 min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 text-xs font-bold whitespace-nowrap text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:text-sm bg-emerald-600"
                            >
                                <Table2 size={16} />
                                {exportingXls ? t('exportingXls') : t('exportXls')}
                            </button>
                            <button
                                type="button"
                                onClick={handleExportPdf}
                                disabled={totalRows === 0 || exportingPdf || exportingXls}
                                className="inline-flex h-10 min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 text-xs font-bold whitespace-nowrap text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:text-sm bg-blue-600"
                            >
                                <FileText size={16} />
                                {exportingPdf ? t('exportingPdf') : t('exportPdf')}
                            </button>
                        </div>
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
                            <col className="w-[50%] md:w-[32%]" />
                            <col className="w-[30%] md:w-[24%]" />
                            <col className="w-[20%] md:w-[27%]" />
                            <col className="hidden md:table-column md:w-[17%]" />
                        </colgroup>
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-300 text-xs uppercase tracking-wide">
                                <th className="px-4 md:px-6 py-4 !font-normal">{t('employees')}</th>
                                <th className="px-4 md:px-6 py-4 text-center">{t('time')}</th>
                                <th className="px-4 md:px-6 py-4 text-center">{t('action')}</th>
                                <th className="hidden md:table-cell px-6 py-4 text-center">{t('device')}</th>
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
                                    const movementLabel = formatJournalMovementLabel(log);
                                    return (
                                        <motion.tr
                                            key={log.id}
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                            className="hover:bg-slate-800/40 transition-all text-sm group"
                                        >
                                            <td className="px-4 md:px-6 py-4 !font-normal">
                                                <div className="!font-normal text-slate-300 group-hover:text-blue-400 transition-colors break-words whitespace-normal leading-6">{log.name}</div>
                                            </td>
                                            <td className="px-4 md:px-6 py-4 text-center font-mono text-sm text-slate-300">{formatDateTime(log.time)}</td>
                                            <td className="px-4 md:px-6 py-4">
                                                <div className="flex justify-center">
                                                    {isEntrance ? (
                                                        <span className="turnstile-action-text turnstile-action-text--entrance font-semibold inline-flex items-center gap-1.5"><LogIn size={15} /> {movementLabel}</span>
                                                    ) : (
                                                        <span className="turnstile-action-text turnstile-action-text--exit font-semibold inline-flex items-center gap-1.5"><ArrowLeftToLine size={15} /> {movementLabel}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell px-6 py-4 text-center">
                                                <div className="font-mono text-sm text-slate-300">{log.deviceIp || '-'}</div>
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="table-pagination-bar px-6 py-4 border-t border-slate-700/50 bg-slate-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p className="text-sm text-slate-400">
                        {totalRows === 0
                            ? '0 / 0'
                            : `${(currentPage - 1) * rowsPerPage + 1}-${Math.min((currentPage - 1) * rowsPerPage + pagedLogs.length, totalRows)} / ${totalRows}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-sm text-slate-400 flex items-center gap-2">
                            <span>{t('rowsPerPage')}:</span>
                            <select
                                value={rowsPerPage}
                                onChange={(e) => {
                                    const parsed = Number.parseInt(e.target.value, 10);
                                    const next = TURNSTILE_ROWS_PER_PAGE_OPTIONS.includes(parsed as 10 | 20 | 50 | 100) ? parsed : 10;
                                    setRowsPerPage(next);
                                    setCurrentPage(1);
                                }}
                                aria-label={t('rowsPerPage')}
                                className="bg-slate-900/70 border border-slate-700/70 rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                            >
                            {TURNSTILE_ROWS_PER_PAGE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
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
        </div>
    );
};
