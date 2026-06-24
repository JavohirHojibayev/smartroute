import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Table2, FileText, CheckCircle2, HardHat, Clock, Filter, AlertCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from './LocalizedDateInput';

/* ---------- Row type used by lamp-self-rescuer API ---------- */
type ToolIssueRow = {
    id: string;
    employee_id: number;
    employee_no: string;
    full_name: string;
    turnstile_time: string | null;
    esmo_time: string | null;
    esmo_status: string;
    tool_name: string;
    quantity: number;
    issued_at: string | null;
    returned_at: string | null;
    issuer: string | null;
    status: string;
    /* ESMO medical readings (populated from ESMO journal) */
    esmo_bp: string | null;
    esmo_pulse: number | null;
    esmo_temperature: number | null;
    esmo_alcohol: number | null;
    esmo_alcohol_detected: boolean | null;
};

/* ---------- ESMO journal row (same shape as MedicalManager) ---------- */
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

const API_BASE = resolveApiBaseUrl();

const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatEmployeeNo = (no: string | null | undefined) => {
    if (!no) return '-';
    return String(no).padStart(6, '0');
};

const isActiveIssue = (row: ToolIssueRow): boolean => {
    if (!row.issued_at) return false;
    if (!row.returned_at) return true;
    const issued = new Date(row.issued_at).getTime();
    const returned = new Date(row.returned_at).getTime();
    if (Number.isNaN(issued)) return false;
    if (Number.isNaN(returned)) return true;
    return issued > returned;
};

/** Clean ESMO employee name (same logic as MedicalManager) */
const cleanEmployeeName = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw
        .replace(/^проверка\s+сотрудника\s+/i, '')
        .replace(/^РїСЂРѕРІРµСЂРєР°\s+СЃРѕС‚СЂСѓРґРЅРёРєР°\s+/i, '')
        .replace(/^proverka\s+sotrudnika\s+/i, '')
        .replace(/^employee\s+check\s+/i, '')
        .replace(/^xodim\s+tekshiruvi\s+/i, '')
        .trim();
};

/** Normalize ESMO status string */
const normalizeEsmoStatus = (status: string): string => {
    const v = String(status || '').toLowerCase();
    if (v === 'passed') return 'passed';
    if (v === 'review' || v === 'manual_review' || v === "ko'rik" || v === 'korik') return 'review';
    if (v === 'annulled') return 'annulled';
    return 'failed';
};

const formatNumber = (value: number | null | undefined, fractionDigits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return '-';
    const numeric = Number(value);
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(fractionDigits);
};

export const ToolsManager = () => {
    const { t, lang } = useI18n();
    const [rows, setRows] = useState<ToolIssueRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [headerFilter, setHeaderFilter] = useState<'ALL' | 'ISSUED' | 'NOT_ISSUED' | 'DONE' | 'RETURNED' | 'WIDGET_ALL' | 'WIDGET_ISSUED' | 'WIDGET_RETURNED' | 'WIDGET_NOT_ISSUED'>('ALL');
    const [topFilterDropdownOpen, setTopFilterDropdownOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState<Record<number, 'issue' | 'return' | undefined>>({});
    const [localUpdates, setLocalUpdates] = useState<Record<string, Partial<ToolIssueRow>>>(() => {
        try {
            const saved = localStorage.getItem('tools_local_updates');
            if (saved) return JSON.parse(saved);
        } catch { }
        return {};
    });

    useEffect(() => {
        localStorage.setItem('tools_local_updates', JSON.stringify(localUpdates));
    }, [localUpdates]);

    const tCols = {
        employeeNo: lang === 'uz' ? 'Tab. raqami' : lang === 'ru' ? 'Таб. номер' : 'Emp. No',
        name: lang === 'uz' ? 'F.I.SH' : lang === 'ru' ? 'Ф.И.О' : 'Name',
        turnstileTime: lang === 'uz' ? 'Turniket vaqti' : lang === 'ru' ? 'Время турникета' : 'Turnstile Time',
        esmoTime: lang === 'uz' ? 'ESMO vaqti' : lang === 'ru' ? 'Время ESMO' : 'ESMO Time',
        esmoStatus: lang === 'uz' ? 'ESMO Xulosasi' : lang === 'ru' ? 'Заключение ESMO' : 'ESMO Status',
        issuedAt: lang === 'uz' ? 'Berilgan vaqt' : lang === 'ru' ? 'Время выдачи' : 'Issued At',
        returnedAt: lang === 'uz' ? 'Qaytarilgan vaqt' : lang === 'ru' ? 'Время возврата' : 'Returned At',
        status: lang === 'uz' ? 'Holat' : lang === 'ru' ? 'Статус' : 'Status',
        issuer: lang === 'uz' ? 'Beruvchi' : lang === 'ru' ? 'Выдал' : 'Issuer',
        issueNow: lang === 'uz' ? 'Berish' : lang === 'ru' ? 'Выдать' : 'Issue',
        returnNow: lang === 'uz' ? 'Qaytarish' : lang === 'ru' ? 'Вернуть' : 'Return',
        statusIssued: lang === 'uz' ? 'BERILGAN' : lang === 'ru' ? 'ВЫДАНО' : 'ISSUED',
        statusDone: lang === 'uz' ? 'YAKUNLANGAN' : lang === 'ru' ? 'ЗАВЕРШЕНО' : 'DONE',
        statusFail: lang === 'uz' ? 'XATOLIK' : lang === 'ru' ? 'ОШИБКА' : 'FAIL',
        statusNotIssued: lang === 'uz' ? 'BERILMAGAN' : lang === 'ru' ? 'НЕ ВЫДАНО' : 'NOT ISSUED',
    };

    /* ------------------------------------------------------------------ */
    /*  Fetch ESMO journal (passed employees) and lamp-self-rescuer data  */
    /* ------------------------------------------------------------------ */
    const loadRows = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            /* ---------- 1. Fetch ESMO journal (approved/passed only) ---------- */
            const esmoParams = new URLSearchParams({ limit: '2000' });
            if (dateFrom) esmoParams.set('dateFrom', dateFrom);
            if (dateTo) esmoParams.set('dateTo', dateTo);

            const esmoUrl = `${API_BASE}/integrations/esmo/journal?${esmoParams.toString()}`;
            let esmoRows: EsmoJournalRow[] = [];

            try {
                const esmoRes = await fetch(esmoUrl);
                if (esmoRes.ok) {
                    const esmoData = await esmoRes.json();
                    esmoRows = (Array.isArray(esmoData) ? esmoData : []).map((row: any) => ({
                        ...row,
                        name: cleanEmployeeName(String(row?.name || '')),
                        status: normalizeEsmoStatus(String(row?.status || row?.statusCode || 'failed')),
                        time: String(row?.time || ''),
                        alcoholDetected: typeof row?.alcoholDetected === 'boolean' ? row.alcoholDetected : null,
                        timeMs: Number.isNaN(Date.parse(String(row?.time || '')))
                            ? Number.NEGATIVE_INFINITY
                            : Date.parse(String(row?.time || '')),
                        dayKey: null,
                    }));
                }
            } catch {
                // ESMO API may be unavailable; continue with empty
            }

            /* Keep only "passed" status rows from ESMO */
            const passedEsmo = esmoRows.filter((r) => {
                if (r.status !== 'passed') return false;
                return true;
            });

            /* Deduplicate by employee name — keep the latest examination per person */
            const bestByName = new Map<string, EsmoJournalRow>();
            for (const row of passedEsmo) {
                const key = row.name.trim().toLowerCase();
                if (!key) continue;
                const existing = bestByName.get(key);
                if (!existing || row.timeMs > existing.timeMs) {
                    bestByName.set(key, row);
                }
            }

            /* ---------- 2. Fetch lamp-self-rescuer (existing tool issue data) ---------- */
            let toolApiRows: any[] = [];
            try {
                const qs = new URLSearchParams();
                if (dateFrom) qs.set('start_date', dateFrom);
                if (dateTo) qs.set('end_date', dateTo);
                if (searchQuery) qs.set('search', searchQuery);
                const url = `${API_BASE}/reports/lamp-self-rescuer${qs.toString() ? `?${qs.toString()}` : ''}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    toolApiRows = Array.isArray(data) ? data : [];
                }
            } catch {
                // tool API may be unavailable
            }

            /* ---------- 3. Build merged row list ---------- */
            /* Index tool rows by name and employee_no for quick lookup */
            const toolByName = new Map<string, any>();
            const toolByNo = new Map<string, any>();
            for (const r of toolApiRows) {
                const nameKey = String(r.full_name || '').trim().toLowerCase();
                if (nameKey) toolByName.set(nameKey, r);

                const noKey = String(r.employee_no || '').trim().padStart(6, '0');
                if (noKey && noKey !== '000000') toolByNo.set(noKey, r);
            }

            const mergedRows: ToolIssueRow[] = [];
            let counter = 0;

            for (const [, esmo] of bestByName) {
                const nameKey = esmo.name.trim().toLowerCase();
                const noKey = String(esmo.passId || '').trim().padStart(6, '0');

                // Match by employee_no first, then fallback to name
                const tool = (noKey && noKey !== '000000' ? toolByNo.get(noKey) : null) || toolByName.get(nameKey);
                counter++;

                mergedRows.push({
                    id: tool ? `${tool.employee_id}-${tool.employee_no}` : `esmo-${esmo.id}-${counter}`,
                    employee_id: tool?.employee_id ?? esmo.id,
                    employee_no: tool?.employee_no ?? esmo.passId ?? String(counter),
                    full_name: esmo.name,
                    turnstile_time: tool?.turnstile_time ?? null,
                    esmo_time: esmo.time,
                    esmo_status: 'passed',
                    tool_name: tool?.tool_name ?? '',
                    quantity: tool?.quantity ?? 0,
                    issued_at: tool?.issued_at ?? null,
                    returned_at: tool?.returned_at ?? null,
                    issuer: tool?.issuer ?? null,
                    status: tool?.status ?? 'NOT_ISSUED',
                    esmo_bp: esmo.bp ?? null,
                    esmo_pulse: esmo.pulse ?? null,
                    esmo_temperature: esmo.temperature ?? null,
                    esmo_alcohol: esmo.alcohol ?? null,
                    esmo_alcohol_detected: esmo.alcoholDetected ?? null,
                });

                /* Remove from tool map so we don't duplicate */
                if (tool) {
                    toolByName.delete(nameKey);
                    if (noKey) toolByNo.delete(noKey);
                }
            }

            /* Append remaining tools that didn't have an ESMO record today/in range */
            const remainingTools = new Set([...toolByName.values(), ...toolByNo.values()]);
            for (const tool of remainingTools) {
                counter++;
                mergedRows.push({
                    id: `${tool.employee_id}-${tool.employee_no}-${counter}`,
                    employee_id: tool.employee_id,
                    employee_no: tool.employee_no,
                    full_name: tool.full_name,
                    turnstile_time: tool.turnstile_time ?? null,
                    esmo_time: '-',
                    esmo_status: '-',
                    tool_name: tool.tool_name ?? '',
                    quantity: tool.quantity ?? 0,
                    issued_at: tool.issued_at ?? null,
                    returned_at: tool.returned_at ?? null,
                    issuer: tool.issuer ?? null,
                    status: tool.status ?? 'NOT_ISSUED',
                    esmo_bp: null,
                    esmo_pulse: null,
                    esmo_temperature: null,
                    esmo_alcohol: null,
                    esmo_alcohol_detected: null,
                });
            }

            setRows(mergedRows);
            setError(null);
        } catch (err) {
            console.error(err);
            setRows([]);
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [dateFrom, dateTo, searchQuery]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setSearchQuery(searchInput);
            setCurrentPage(1);
        }, 300);
        return () => window.clearTimeout(timeout);
    }, [searchInput]);

    useEffect(() => {
        void loadRows(true);
    }, [dateFrom, dateTo, searchQuery]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            void loadRows(false);
        }, 10000);
        return () => window.clearInterval(timer);
    }, [loadRows]);

    const getCurrentUser = () => {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.toLowerCase().includes('auth')) {
                    const parsed = JSON.parse(localStorage.getItem(k) || '{}');
                    if (parsed?.user?.name) return parsed.user.name;
                    if (parsed?.user?.username) return parsed.user.username;
                }
            }
        } catch { }
        return 'Admin';
    };

    const handleIssue = async (row: ToolIssueRow) => {
        setActionLoading((prev) => ({ ...prev, [row.employee_id]: 'issue' }));

        // Optimistic UI Update
        const now = new Date().toISOString();
        const issuerName = getCurrentUser();
        const update = { status: 'ISSUED', issued_at: now, issuer: issuerName };

        setLocalUpdates(prev => ({ ...prev, [row.id]: update }));
        setRows((prev) => prev.map(r =>
            r.id === row.id ? { ...r, ...update } : r
        ));

        try {
            await fetch(`${API_BASE}/reports/lamp-self-rescuer/issue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: row.employee_id,
                    employee_no: row.employee_no,
                    full_name: row.full_name
                })
            });
            // We can optionally trigger a background reload, but no need to wait for it for UI update
            void loadRows(false);
        } catch (err) {
            console.error(err);
            // Revert optimistic update on error if needed
        } finally {
            setActionLoading((prev) => ({ ...prev, [row.employee_id]: undefined }));
        }
    };

    const handleReturn = async (row: ToolIssueRow) => {
        setActionLoading((prev) => ({ ...prev, [row.employee_id]: 'return' }));

        // Optimistic UI Update
        const now = new Date().toISOString();
        const update = { status: 'DONE', returned_at: now };

        setLocalUpdates(prev => ({ ...prev, [row.id]: update }));
        setRows((prev) => prev.map(r =>
            r.id === row.id ? { ...r, ...update } : r
        ));

        try {
            await fetch(`${API_BASE}/reports/lamp-self-rescuer/return`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: row.employee_id,
                    employee_no: row.employee_no
                })
            });
            void loadRows(false);
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading((prev) => ({ ...prev, [row.employee_id]: undefined }));
        }
    };

    const mergedRowsState = useMemo(() => {
        return rows.map(r => localUpdates[r.id] ? { ...r, ...localUpdates[r.id] } : r);
    }, [rows, localUpdates]);

    const filteredRows = useMemo(() => {
        let result = mergedRowsState;

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const isToday = (dateStr: string | null | undefined): boolean => {
            if (!dateStr || dateStr === '-') return false;
            const d = new Date(dateStr);
            if (Number.isNaN(d.getTime())) return false;
            const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return dStr === todayStr;
        };

        if (headerFilter === 'ISSUED') {
            result = result.filter(r => r.status === 'ISSUED');
        } else if (headerFilter === 'NOT_ISSUED') {
            result = result.filter(r => r.status !== 'ISSUED' && r.status !== 'DONE');
        } else if (headerFilter === 'DONE' || headerFilter === 'RETURNED') {
            result = result.filter(r => r.status === 'DONE');
        } else if (headerFilter === 'WIDGET_ALL') {
            result = result.filter(r => isToday(r.esmo_time));
        } else if (headerFilter === 'WIDGET_ISSUED') {
            result = result.filter(r => r.status === 'ISSUED' && isToday(r.issued_at));
        } else if (headerFilter === 'WIDGET_RETURNED') {
            result = result.filter(r => r.status === 'DONE' && isToday(r.returned_at));
        } else if (headerFilter === 'WIDGET_NOT_ISSUED') {
            result = result.filter(r => r.status !== 'ISSUED' && r.status !== 'DONE' && isToday(r.esmo_time));
        }

        const query = searchQuery.trim().toLowerCase();
        if (!query) return result;
        return result.filter((r) => {
            const haystack = `${r.full_name} ${r.employee_no}`.toLowerCase();
            return haystack.includes(query);
        });
    }, [mergedRowsState, searchQuery, headerFilter]);

    const totalRows = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

    const pagedRows = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredRows.slice(start, start + rowsPerPage);
    }, [filteredRows, currentPage, rowsPerPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, dateFrom, dateTo]);

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);



    const formatStatus = (value: string | null | undefined): string => {
        if (value === 'ISSUED') return tCols.statusIssued;
        if (value === 'DONE') return tCols.statusDone;
        if (value === 'FAIL') return tCols.statusFail;
        return tCols.statusNotIssued;
    };

    /** Format ESMO medical readings for the ESMO Xulosasi column */
    const formatEsmoReadings = (row: ToolIssueRow): string => {
        const parts: string[] = [];
        if (row.esmo_bp) parts.push(row.esmo_bp);
        if (row.esmo_pulse != null) parts.push(`P:${formatNumber(row.esmo_pulse, 0)}`);
        if (row.esmo_temperature != null) parts.push(`${formatNumber(row.esmo_temperature)}°C`);
        if (row.esmo_alcohol != null) {
            const alc = formatNumber(row.esmo_alcohol);
            parts.push(row.esmo_alcohol_detected ? `🔴 ${alc}‰` : `${alc}‰`);
        }
        return parts.length > 0 ? parts.join(' / ') : '-';
    };

    const buildExportFileName = (ext: 'xls' | 'pdf') => {
        const datePart = dateFrom || dateTo ? `${dateFrom || 'start'}_${dateTo || 'end'}` : new Date().toISOString().split('T')[0];
        return `tools_journal_${datePart}.${ext}`;
    };

    const handleExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            if (filteredRows.length === 0) return;
            const headers = [tCols.employeeNo, tCols.name, tCols.turnstileTime, tCols.esmoTime, tCols.esmoStatus, tCols.issuedAt, tCols.returnedAt, tCols.status, tCols.issuer];
            const dataRows = filteredRows.map((r) => [
                formatEmployeeNo(r.employee_no),
                r.full_name,
                formatDateTime(r.turnstile_time),
                formatDateTime(r.esmo_time),
                formatEsmoReadings(r),
                formatDateTime(r.issued_at),
                formatDateTime(r.returned_at),
                formatStatus(r.status),
                r.issuer || '-',
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
            doc.text(t('tools'), 14, 18);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`${t('createdAt')}: ${new Date().toLocaleString()}`, 14, 25);

            const tableData = filteredRows.map((r) => [
                formatEmployeeNo(r.employee_no),
                r.full_name,
                formatDateTime(r.turnstile_time),
                formatDateTime(r.esmo_time),
                formatEsmoReadings(r),
                formatDateTime(r.issued_at),
                formatDateTime(r.returned_at),
                formatStatus(r.status),
                r.issuer || '-',
            ]);
            autoTable(doc, {
                head: [[tCols.employeeNo, tCols.name, tCols.turnstileTime, tCols.esmoTime, tCols.esmoStatus, tCols.issuedAt, tCols.returnedAt, tCols.status, tCols.issuer]],
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



    const toolStatusClass = (status: string | null | undefined) => {
        if (status === 'DONE') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        if (status === 'ISSUED') return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
        if (status === 'FAIL') return 'bg-red-500/10 text-red-500 border-red-500/20';
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    };

    /* ---------- Stat cards (widget values from TODAY's data only) ---------- */
    const stats = useMemo(() => {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const isToday = (dateStr: string | null | undefined): boolean => {
            if (!dateStr || dateStr === '-') return false;
            const d = new Date(dateStr);
            if (Number.isNaN(d.getTime())) return false;
            const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return dStr === todayStr;
        };

        const total = mergedRowsState.filter(r => isToday(r.esmo_time)).length;
        const issued = mergedRowsState.filter(r => r.status === 'ISSUED' && isToday(r.issued_at)).length;
        const returned = mergedRowsState.filter(r => r.status === 'DONE' && isToday(r.returned_at)).length;
        const notIssued = mergedRowsState.filter(r => r.status !== 'ISSUED' && r.status !== 'DONE' && isToday(r.esmo_time)).length;
        
        return { total, issued, returned, notIssued };
    }, [mergedRowsState]);

    const handleWidgetClick = (filterId: 'WIDGET_ALL' | 'WIDGET_ISSUED' | 'WIDGET_RETURNED' | 'WIDGET_NOT_ISSUED') => {
        setHeaderFilter(prev => prev === filterId ? 'ALL' : filterId);
        setCurrentPage(1);
    };

    const toolStatCards = [
        {
            id: 'total' as const,
            filterId: 'WIDGET_ALL' as const,
            title: lang === 'uz' ? 'Jami xodimlar' : lang === 'ru' ? 'Всего сотрудников' : 'Total Employees',
            value: String(stats.total),
            color: 'from-blue-500 to-cyan-400',
            icon: <HardHat />,
        },
        {
            id: 'not_issued' as const,
            filterId: 'WIDGET_NOT_ISSUED' as const,
            title: lang === 'uz' ? 'Berilmagan' : lang === 'ru' ? 'Не выдано' : 'Not Issued',
            value: String(stats.notIssued),
            color: 'from-amber-500 to-orange-400',
            icon: <AlertCircle />,
        },
        {
            id: 'issued' as const,
            filterId: 'WIDGET_ISSUED' as const,
            title: lang === 'uz' ? 'Qaytarilmagan' : lang === 'ru' ? 'Не возвращено' : 'Not Returned',
            value: String(stats.issued),
            color: 'from-red-500 to-rose-400',
            icon: <Clock />,
        },
        {
            id: 'returned' as const,
            filterId: 'WIDGET_RETURNED' as const,
            title: lang === 'uz' ? 'Qaytarilgan' : lang === 'ru' ? 'Возвращено' : 'Returned',
            value: String(stats.returned),
            color: 'from-emerald-500 to-teal-400',
            icon: <CheckCircle2 />,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                {toolStatCards.map((card) => (
                    <div
                        key={card.id}
                        onClick={() => handleWidgetClick(card.filterId)}
                        className={`glass-panel rounded-2xl p-3 sm:p-4 border relative overflow-hidden group cursor-pointer transition-all duration-300 ${
                            headerFilter === card.filterId
                                ? 'border-blue-500/70 ring-2 ring-blue-500/30 scale-[1.02]'
                                : 'border-slate-700/50 hover:border-slate-600/60'
                        }`}
                    >
                        <div className={`absolute -right-6 -top-6 w-36 h-36 bg-gradient-to-br ${card.color} rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500`}></div>
                        <div className="relative z-10 flex items-start justify-between gap-2 sm:gap-4">
                            <div className="min-w-0">
                                <div className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 mb-1 sm:mb-2 truncate">{card.title}</div>
                                <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent truncate">{card.value}</div>
                            </div>
                            <div className={`p-2.5 sm:p-4 rounded-xl bg-gradient-to-br ${card.color} text-white shadow-xl [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-[26px] sm:[&>svg]:h-[26px] shrink-0`}>
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
                <div className="p-4 sm:p-6 border-b border-slate-700/50 space-y-7">
                    <h3 className="app-module-heading">
                        {t('tools')}
                    </h3>

                    <div className="flex flex-wrap xl:flex-nowrap items-center gap-2.5 sm:gap-3">
                        <div className="relative mt-4 flex w-full min-h-12 min-w-0 items-center sm:w-[300px] md:w-[330px] lg:w-[360px]">
                            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder={t('searchByEmployee')}
                                className="h-12 w-full rounded-lg border border-slate-700/60 bg-slate-900/50 pl-12 pr-3 text-base text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500/60"
                            />
                        </div>

                        <div className="mt-4 flex min-w-0 flex-1 flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:gap-2.5">
                            <LocalizedDateInput
                                label={t('dateFromSanadan')}
                                value={dateFrom}
                                maxDate={dateTo || undefined}
                                onChange={(v) => { setDateFrom(v); setCurrentPage(1); }}
                                minWidth={148}
                            />
                            <div className="flex items-end gap-2 sm:gap-2.5">
                                <LocalizedDateInput
                                    label={t('dateToSanagacha')}
                                    value={dateTo}
                                    minDate={dateFrom || undefined}
                                    onChange={(v) => { setDateTo(v); setCurrentPage(1); }}
                                    minWidth={148}
                                />
                                <div className="relative shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setTopFilterDropdownOpen(!topFilterDropdownOpen)}
                                        className={`flex h-[42px] w-[42px] items-center justify-center rounded-lg border transition-colors ${
                                            headerFilter !== 'ALL' || topFilterDropdownOpen 
                                            ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400' 
                                            : 'border-slate-700/60 bg-slate-900/50 text-yellow-500 hover:text-yellow-400'
                                        }`}
                                    >
                                        <Filter size={18} />
                                    </button>
                                    
                                    {topFilterDropdownOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-40"
                                                onClick={() => setTopFilterDropdownOpen(false)}
                                            />
                                            <div className="absolute top-full right-0 mt-2 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50 text-sm font-normal text-slate-300">
                                                <button
                                                    className={`w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors ${headerFilter === 'ALL' ? 'text-blue-400 bg-slate-900/50 font-medium' : ''}`}
                                                    onClick={() => { setHeaderFilter('ALL'); setTopFilterDropdownOpen(false); setCurrentPage(1); }}
                                                >
                                                    Barchasi
                                                </button>
                                                <button
                                                    className={`w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors ${headerFilter === 'ISSUED' ? 'text-blue-400 bg-slate-900/50 font-medium' : ''}`}
                                                    onClick={() => { setHeaderFilter('ISSUED'); setTopFilterDropdownOpen(false); setCurrentPage(1); }}
                                                >
                                                    Qaytarilmagan
                                                </button>
                                                <button
                                                    className={`w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors ${headerFilter === 'NOT_ISSUED' ? 'text-blue-400 bg-slate-900/50 font-medium' : ''}`}
                                                    onClick={() => { setHeaderFilter('NOT_ISSUED'); setTopFilterDropdownOpen(false); setCurrentPage(1); }}
                                                >
                                                    Berilmagan
                                                </button>
                                                <button
                                                    className={`w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors ${headerFilter === 'RETURNED' ? 'text-blue-400 bg-slate-900/50 font-medium' : ''}`}
                                                    onClick={() => { setHeaderFilter('RETURNED'); setTopFilterDropdownOpen(false); setCurrentPage(1); }}
                                                >
                                                    Qaytarilgan
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:flex-nowrap sm:justify-end sm:gap-3">
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={filteredRows.length === 0 || exportingXls || exportingPdf}
                                className="inline-flex h-10 min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 text-xs font-bold whitespace-nowrap text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:text-sm bg-emerald-600"
                            >
                                <Table2 size={16} />
                                {exportingXls ? t('exportingXls') : t('exportXls')}
                            </button>
                            <button
                                type="button"
                                onClick={handleExportPdf}
                                disabled={filteredRows.length === 0 || exportingPdf || exportingXls}
                                className="inline-flex h-10 min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 text-xs font-bold whitespace-nowrap text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:text-sm bg-blue-600"
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
                                <th className="px-4 md:px-6 py-4 text-center">{tCols.esmoTime}</th>
                                <th className="px-4 md:px-6 py-4 text-center">{tCols.esmoStatus}</th>
                                <th className="px-4 md:px-6 py-4 text-center">{tCols.issuedAt}</th>
                                <th className="px-4 md:px-6 py-4 text-center">{tCols.returnedAt}</th>
                                <th className="px-4 md:px-6 py-4 text-center">{tCols.status}</th>
                                <th className="hidden md:table-cell px-6 py-4 text-center">{tCols.issuer}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {pagedRows.map((row) => {
                                const active = isActiveIssue(row);
                                const isEsmoEligible = row.esmo_status === 'passed' || row.esmo_status === 'review';
                                const issueLoading = actionLoading[row.employee_id] === 'issue';
                                const returnLoading = actionLoading[row.employee_id] === 'return';
                                const hasAlcohol = row.esmo_alcohol_detected === true;

                                return (
                                    <motion.tr key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-800/40 transition-all text-sm group">
                                        <td className="px-4 md:px-6 py-4">
                                            <div className="!font-normal text-slate-300 group-hover:text-blue-400 transition-colors break-words whitespace-normal leading-6">
                                                {row.full_name}
                                            </div>
                                        </td>
                                        <td className="px-4 md:px-6 py-4 text-center font-mono text-sm text-slate-300">
                                            {formatDateTime(row.esmo_time)}
                                        </td>
                                        <td className="px-4 md:px-6 py-4 text-center">
                                            {row.esmo_bp || row.esmo_pulse != null || row.esmo_temperature != null || row.esmo_alcohol != null ? (
                                                <div className="inline-flex items-center gap-2 text-xs text-slate-300 font-mono">
                                                    {row.esmo_bp && (
                                                        <span className="whitespace-nowrap">{row.esmo_bp}</span>
                                                    )}
                                                    {row.esmo_bp && (row.esmo_pulse != null || row.esmo_temperature != null || row.esmo_alcohol != null) && (
                                                        <span className="text-slate-600">|</span>
                                                    )}
                                                    {row.esmo_pulse != null && (
                                                        <span className="whitespace-nowrap">P={formatNumber(row.esmo_pulse, 0)}</span>
                                                    )}
                                                    {row.esmo_pulse != null && (row.esmo_temperature != null || row.esmo_alcohol != null) && (
                                                        <span className="text-slate-600">|</span>
                                                    )}
                                                    {row.esmo_temperature != null && (
                                                        <span className="whitespace-nowrap">T={formatNumber(row.esmo_temperature)}°C</span>
                                                    )}
                                                    {row.esmo_temperature != null && row.esmo_alcohol != null && (
                                                        <span className="text-slate-600">|</span>
                                                    )}
                                                    {row.esmo_alcohol != null && (
                                                        <span className={`whitespace-nowrap ${hasAlcohol ? 'text-red-400 font-semibold' : ''}`}>
                                                            {formatNumber(row.esmo_alcohol)}‰
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-500">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 md:px-6 py-4 text-center">
                                            {row.issued_at ? (
                                                <span className="text-sm text-slate-300 font-mono">{formatDateTime(row.issued_at)}</span>
                                            ) : isEsmoEligible ? (
                                                <button
                                                    onClick={() => handleIssue(row)}
                                                    disabled={issueLoading}
                                                    className="px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                                                >
                                                    {issueLoading ? '...' : tCols.issueNow}
                                                </button>
                                            ) : (
                                                <span className="text-slate-500">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 md:px-6 py-4 text-center">
                                            {!active && row.returned_at ? (
                                                <span className="text-sm text-slate-300 font-mono">{formatDateTime(row.returned_at)}</span>
                                            ) : active ? (
                                                <button
                                                    onClick={() => handleReturn(row)}
                                                    disabled={returnLoading}
                                                    className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                                                >
                                                    {returnLoading ? '...' : tCols.returnNow}
                                                </button>
                                            ) : (
                                                <span className="text-slate-500">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 md:px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border inline-flex items-center gap-1 ${toolStatusClass(row.status)}`}>
                                                {formatStatus(row.status)}
                                            </span>
                                        </td>
                                        <td className="hidden md:table-cell px-6 py-4 text-center text-sm text-slate-400">
                                            {row.issuer || '-'}
                                        </td>
                                    </motion.tr>
                                );
                            })}
                            {!loading && totalRows === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400 text-sm">
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
        </div>
    );
};

