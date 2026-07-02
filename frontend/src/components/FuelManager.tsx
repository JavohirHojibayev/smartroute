import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { startTransition } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    ArrowRight,
    ChevronDown,
    ChevronRight,
    Fuel,
    Layers,
    CreditCard,
    Droplets,
    LayoutGrid,
    FileText,
    Users,
    Database,
    Table2,
    type LucideIcon,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { useI18n, numberLocaleFor, uz } from '../i18n';
import { downloadXls } from '../utils/exportXls';
import { LocalizedDateInput } from './LocalizedDateInput';

type FuelSummaryResponse = {
    health?: {
        status?: 'online' | 'offline' | 'disabled' | string;
        lastSyncAt?: string | null;
    };
    window?: {
        records?: number;
        totalLiters?: number;
        /** AZS jami qiymati bilan moslashish */
        totalLitersRounded?: number;
        totalAmount?: number;
        liveLevelGaugeLiters?: number | null;
    };
    stats?: {
        devices?: { total?: number; online?: number; offline?: number };
        sectionLevels?: { critical?: number; low?: number; normal?: number; total?: number; totalLevelLiters?: number };
        cards?: { total?: number; synced?: number; unsynced?: number };
        refuels?: { today?: number; week?: number; month?: number };
        posts?: Array<{ id: number; name: string }>;
        objectKinds?: Array<{ key: string; label: string }>;
        azsSectionNames?: string[];
    };
    chart?: Array<{ day: string; consumption: number; cost: number }>;
    levelChart?: Array<{ day: string; level: number }>;
    stations?: Array<{ name: string; records: number; liters: number }>;
    sections?: Array<{ name: string; records: number }>;
};

type FuelOperationsResponse = {
    items: Array<{
        id: number;
        vehicle: string;
        fuelType: string;
        liters: number | null;
        issuedValue: number | null;
        station: string;
        driver: string;
        time: string;
        eventType?: number | null;
        payType?: string | null;
        cardId?: string | null;
        cardNumber?: string | null;
        cardName?: string | null;
        groupName?: string | null;
        fuelSectionName?: string | null;
        levelStartDut?: number | null;
        levelEndDut?: number | null;
        devicePostId?: string | null;
    }>;
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    summary?: {
        liters?: number;
    };
};

type RangePreset = 'today' | 'yesterday' | 'week' | 'month';

type AzsObjectChildRow = {
    id: string;
    name: string;
    stateLabel: string;
};

type AzsObjectRow = {
    id: string;
    controllerName: string;
    objectKindLabel: string;
    isOnline: boolean;
    lastSyncAt: string | null;
    children?: AzsObjectChildRow[];
};

type AzsReservoirSectionRow = {
    id: string;
    name: string;
    sectionVolumeLiters: number | null;
    levelLiters: number | null;
    levelCalcPercent: number | null;
    levelPercent: number | null;
    isOnline: boolean;
    dutAvailableLiters: number | null;
    dutMassKg: number | null;
    temperature: number | null;
    lastSyncAt: string | null;
    fuelTypeName: string;
};

type AzsReservoirRow = {
    id: string;
    name: string;
    volumeLiters: number | null;
    levelCalcPercent: number | null;
    levelPercent: number | null;
    children?: AzsReservoirSectionRow[];
};

type AzsListPayload<T> = {
    items?: T[];
    total?: number;
    fetchedAt?: string | null;
    error?: string;
    enabled?: boolean;
};

type FuelCardsView = 'groups' | 'limits';

type FuelCardRow = {
    id: string;
    no: number;
    cardId?: number | null;
    groupName?: string;
    cardNumber?: string;
    cardName?: string;
    devicePostId?: number | null;
    devicePostName?: string;
    limitType: number | null;
    limitTypeLabel: string;
    limitStartAt: string | null;
    limitEndAt: string | null;
    setLiters: number | null;
    availableLiters: number | null;
    issuedLiters: number | null;
    limitState: number | null;
    limitStateLabel: string;
    syncAt: string | null;
    cardsCount?: number | null;
    cards?: Array<{
        no: number;
        cardId?: number | null;
        cardName: string;
        cardNumber: string;
        cardType: string;
    }>;
};

type FuelCardsResponse = {
    view?: FuelCardsView;
    items?: FuelCardRow[];
    pagination?: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    fetchedAt?: string | null;
    error?: string;
    enabled?: boolean;
};

/** AZS yuqori menyu: asosiy bo'limlar uchun to'liq kontent */
type FuelNavTab = 'main' | 'reports' | 'objects' | 'fuelCards' | 'reservoirs';

const FUEL_NAV_ITEMS: ReadonlyArray<{ id: FuelNavTab; labelKey: keyof typeof uz; icon: LucideIcon }> = [
    { id: 'main', labelKey: 'fuelNavMain', icon: LayoutGrid },
    { id: 'reports', labelKey: 'fuelNavReports', icon: FileText },
    { id: 'objects', labelKey: 'fuelNavObjects', icon: Fuel },
    { id: 'fuelCards', labelKey: 'fuelNavFuelCards', icon: Users },
    { id: 'reservoirs', labelKey: 'fuelNavReservoirs', icon: Database },
];

const API_BASE = resolveApiBaseUrl();
const FUEL_SUMMARY_REFRESH_MS = 30_000;
const FUEL_LEVEL_REFRESH_MS = 45_000;
const FUEL_REPORTS_REFRESH_MS = 45_000;
const FUEL_OBJECTS_REFRESH_MS = 60_000;
const FUEL_RESERVOIRS_REFRESH_MS = 30_000;
const FUEL_CARDS_REFRESH_MS = 60_000;
const FUEL_OPERATIONS_EXPORT_PAGE_SIZE = 500;

/** Backend `AZS_CALENDAR_UTC_OFFSET_HOURS` bilan mos (standart 5 = Toshkent) */
const AZS_CALENDAR_OFFSET_H = Number.isFinite(Number(import.meta.env.VITE_AZS_CALENDAR_OFFSET_HOURS))
    ? Number(import.meta.env.VITE_AZS_CALENDAR_OFFSET_HOURS)
    : 5;

const azsCalendarYmdToday = () => {
    const shifted = new Date(Date.now() + AZS_CALENDAR_OFFSET_H * 3600000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/** Gradient matn: glass-panel + overflow muhitida ham ishonchli (WebKit clip) */
const FuelPanelGradientHeading = ({ children, className }: { children: ReactNode; className?: string }) => (
    <h3 className={`app-module-heading inline-block max-w-full text-balance ${className ?? ''}`.trim()}>
        {children}
    </h3>
);

const toDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
};

const formatDateOnly = (value: string | null | undefined) => {
    if (!value) return '---';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

const formatTimeOnly = (value: string | null | undefined) => {
    if (!value) return '---';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

const formatLimitPeriod = (start: string | null | undefined, end: string | null | undefined) =>
    start || end ? `${formatTimeOnly(start)} - ${formatTimeOnly(end)}` : '---';

const formatDateInputDisplay = (value: string) => {
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return value;
    return `${day}.${month}.${year}`;
};

const formatLiters = (value: number | null | undefined, locale: string) => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return '0';
    return numeric.toLocaleString(locale, { maximumFractionDigits: 2 });
};

/** AZS jami liter ko'rsatkichi: odatda butun liter */
/** `summary.stations` va AZS `stats.posts` nomlarini bir xil kalitga keltirish (bo‘sh joy / tartib) */
const normStationLabel = (value: string | null | undefined) =>
    String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

const formatLitersInt = (value: number | null | undefined, locale: string) => {
    const numeric = Math.round(Number(value ?? 0));
    if (!Number.isFinite(numeric)) return '0';
    return numeric.toLocaleString(locale, { maximumFractionDigits: 0 });
};

/** AZS hajm/litr qiymatlari: 3 xona qoldiq */
const formatVolumeAzs = (value: number | null | undefined, locale: string) => {
    if (value == null || !Number.isFinite(Number(value))) return '---';
    return Number(value).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const formatFuelCardLiters = (value: number | null | undefined, locale: string) => {
    if (value == null || !Number.isFinite(Number(value))) return '---';
    return Number(value).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const AZS_LIMITS_NUMBER_LOCALE = 'ru-RU';

const formatFuelCardLimitBalanceLiters = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(Number(value))) return '---';
    const numeric = Number(value);
    return numeric.toLocaleString(AZS_LIMITS_NUMBER_LOCALE, {
        minimumFractionDigits: Number.isInteger(numeric) ? 0 : 3,
        maximumFractionDigits: 3,
    });
};

const formatFuelCardLimitIssuedLiters = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(Number(value))) return '---';
    return Number(value).toLocaleString(AZS_LIMITS_NUMBER_LOCALE, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
    });
};

// Keep helper (no-op reference) to avoid unused declaration errors after removing the chart block
const formatAzsChartDateTimeLabel = (day: string, dateFrom: string, dateTo: string) => {
    if (/^\d{2}:\d{2}$/.test(day) && dateFrom && dateFrom === dateTo) {
        const [year, month, date] = dateFrom.split('-');
        if (year && month && date) {
            return `${date}.${month}.${year} ${day}`;
        }
    }
    return day;
};
// noop reference to keep TypeScript from complaining when the section chart is removed
void formatAzsChartDateTimeLabel;

const buildNiceAxis = (values: number[], intervalCount = 5) => {
    const safeValues = values.filter((value) => Number.isFinite(value) && value >= 0);
    const maxValue = safeValues.length ? Math.max(...safeValues) : 0;
    if (maxValue <= 0) {
        const ticks = Array.from({ length: intervalCount + 1 }, (_, index) => index);
        return { max: intervalCount, ticks };
    }

    const rawStep = maxValue / intervalCount;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / magnitude;
    const candidates = [1, 2, 2.5, 4, 5, 8, 10];
    const stepBase = candidates.find((candidate) => normalized <= candidate) ?? 10;
    const step = stepBase * magnitude;
    const max = step * intervalCount;
    const ticks = Array.from({ length: intervalCount + 1 }, (_, index) => index * step);
    return { max, ticks };
};

const fuelCardLimitStatusClass = (state: number | null | undefined) => {
    if (state === 0) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
    if (state === 4) return 'border-slate-500/25 bg-slate-500/10 text-slate-300';
    return 'border-red-500/25 bg-red-500/10 text-red-300';
};

const clampPct = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return null;
    return Math.min(100, Math.max(0, value));
};

const formatPctAzs = (value: number | null | undefined, locale: string) => {
    const p = clampPct(value);
    if (p == null) return '---';
    return `${p.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

/** Rezervuar foizlari: tekis (3D gradient / ichki soyasiz) */
const AzsReservoirLevelBar = ({
    fillPercent,
    text,
    size = 'md',
}: {
    fillPercent: number | null | undefined;
    text: string;
    size?: 'md' | 'sm';
}) => {
    const p = clampPct(fillPercent);
    const h = size === 'md' ? 'h-8 min-h-[2rem]' : 'h-7 min-h-[1.75rem]';
    const minW =
        size === 'md'
            ? 'w-full min-w-0 max-w-full sm:max-w-[280px] sm:min-w-[140px] md:min-w-[168px]'
            : 'w-full min-w-0 max-w-full sm:max-w-[300px] sm:min-w-[130px] md:min-w-[148px]';
    const textCls =
        size === 'md'
            ? 'text-[13px] sm:text-sm'
            : 'text-[11px] sm:text-xs';
    const trackCls = 'overflow-hidden rounded-full border border-slate-600/55 bg-slate-800/80';

    if (p == null) {
        return (
            <div
                className={`flex ${h} ${minW} w-full items-center justify-center ${trackCls} px-2 text-center font-semibold tabular-nums text-slate-400 ${textCls}`}
            >
                {text}
            </div>
        );
    }

    const wInt = Math.round(Math.min(100, Math.max(0, p)));

    // Use a generated class name and inject a small <style> block so we avoid using
    // inline `style={{ ... }}` props which trigger the Edge linter rule about
    // inline styles. The generated class encodes the percentage as part of the
    // class name which keeps the implementation simple and predictable.
    const fillClass = `sr-fuel-progress-fill-${wInt}`;
    const fillCss = `.${fillClass} { width: ${wInt}%; }`;

    return (
        <div className={`relative ${h} ${minW} w-full ${trackCls}`}>
            <style>{fillCss}</style>
            <div
                className={`absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-[width] duration-200 ease-out ${fillClass}`}
            />
            <div
                className={`relative z-10 flex h-full w-full items-center justify-center px-2 text-center font-semibold tabular-nums text-slate-100 ${textCls}`}
            >
                {text}
            </div>
        </div>
    );
};

const formatMassAzs = (value: number | null | undefined, locale: string) => {
    if (value == null || !Number.isFinite(Number(value))) return '---';
    return Number(value).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const formatTempAzs = (value: number | null | undefined, locale: string) => {
    if (value == null || !Number.isFinite(Number(value))) return '---';
    return Number(value).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const ReservoirPctCell = ({ value, numberLocale }: { value: number | null | undefined; numberLocale: string }) => (
    <AzsReservoirLevelBar fillPercent={value} text={formatPctAzs(value, numberLocale)} size="md" />
);

/** Ichki jadval: online/offline seksiyalar foizlari */
const ReservoirSectionLevelCell = ({
    isOnline,
    percent,
    connectedLabel,
    disconnectedLabel,
    numberLocale,
}: {
    isOnline: boolean;
    percent: number | null | undefined;
    connectedLabel: string;
    disconnectedLabel: string;
    numberLocale: string;
}) => {
    /** AZSga yaqin label: "Tarmoqda: 58.1%" */
    const label = isOnline ? `${connectedLabel}: ${formatPctAzs(percent, numberLocale)}` : `${disconnectedLabel}: ---`;
    if (!isOnline) {
        return (
            <div className="flex h-7 min-h-[1.75rem] w-full min-w-[148px] max-w-[300px] items-center justify-center overflow-hidden rounded-full border border-slate-600/45 bg-slate-800/55 px-1.5 text-center text-[11px] font-semibold leading-tight text-slate-400">
                {label}
            </div>
        );
    }
    return <AzsReservoirLevelBar fillPercent={percent} text={label} size="sm" />;
};

const getPresetRange = (preset: RangePreset) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'today') {
        const date = toDateInput(today);
        return { dateFrom: date, dateTo: date };
    }

    if (preset === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const date = toDateInput(yesterday);
        return { dateFrom: date, dateTo: date };
    }

    if (preset === 'week') {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return { dateFrom: toDateInput(start), dateTo: toDateInput(today) };
    }

    const rollingMonthStart = new Date(today);
    rollingMonthStart.setDate(rollingMonthStart.getDate() - 29);
    return { dateFrom: toDateInput(rollingMonthStart), dateTo: toDateInput(today) };
};

export const FuelManager = () => {
    const { t, lang } = useI18n();
    const numLocale = useMemo(() => numberLocaleFor(lang), [lang]);
    const initialRange = getPresetRange('today');
    const [dateFrom, setDateFrom] = useState(initialRange.dateFrom);
    const [dateTo, setDateTo] = useState(initialRange.dateTo);
    const [preset, setPreset] = useState<RangePreset>('today');
    const [selectedStation, setSelectedStation] = useState('all');
    const [levelSelectedSection, setLevelSelectedSection] = useState('all');
    const levelInitial = getPresetRange('today');
    const [levelDateFrom, setLevelDateFrom] = useState(levelInitial.dateFrom);
    const [levelDateTo, setLevelDateTo] = useState(levelInitial.dateTo);
    // state reserved for the (removed) section-level chart; keep to avoid refactor churn
    const [levelPreset, setLevelPreset] = useState<RangePreset>('today');
    const [sectionLevelSummary, setSectionLevelSummary] = useState<FuelSummaryResponse | null>(null);
    const [fuelNavTab, setFuelNavTab] = useState<FuelNavTab>('main');
    const [summary, setSummary] = useState<FuelSummaryResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [operationsDateFrom, setOperationsDateFrom] = useState('');
    const [operationsDateTo, setOperationsDateTo] = useState('');
    const [operationsPage, setOperationsPage] = useState(1);
    const [operationsRowsPerPage, setOperationsRowsPerPage] = useState(15);
    const [todayRecordsCount, setTodayRecordsCount] = useState(0);
    const [operationsExportingXls, setOperationsExportingXls] = useState(false);
    const [operationsExportingPdf, setOperationsExportingPdf] = useState(false);
    const [operationsRows, setOperationsRows] = useState<FuelOperationsResponse['items']>([]);
    const [operationsTotalRows, setOperationsTotalRows] = useState(0);
    const [operationsTotalPages, setOperationsTotalPages] = useState(1);
    const [operationsTotalLiters, setOperationsTotalLiters] = useState(0);
    const [azsObjects, setAzsObjects] = useState<AzsListPayload<AzsObjectRow> | null>(null);
    const [azsReservoirs, setAzsReservoirs] = useState<AzsListPayload<AzsReservoirRow> | null>(null);
    const [fuelCardsView, setFuelCardsView] = useState<FuelCardsView>('groups');
    const fuelCardsSearch = '';
    const [fuelCardsRows, setFuelCardsRows] = useState<FuelCardRow[]>([]);
    const [fuelCardsPage, setFuelCardsPage] = useState(1);
    const [fuelCardsRowsPerPage, setFuelCardsRowsPerPage] = useState(100);
    const [fuelCardsTotalRows, setFuelCardsTotalRows] = useState(0);
    const [fuelCardsTotalPages, setFuelCardsTotalPages] = useState(1);
    const [fuelCardsLoading, setFuelCardsLoading] = useState(false);
    const [fuelCardsError, setFuelCardsError] = useState<string | null>(null);
    const [expandedFuelCardGroupIds, setExpandedFuelCardGroupIds] = useState<Set<string>>(() => new Set());
    const [expandedObjectIds, setExpandedObjectIds] = useState<Set<string>>(() => new Set());
    const [expandedReservoirIds, setExpandedReservoirIds] = useState<Set<string>>(() => new Set());

    const fuelCardLimitGroups = useMemo(() => {
        const groups = new Map<string, { key: string; no: number; cardName: string; rows: FuelCardRow[] }>();
        for (const row of fuelCardsRows) {
            const key = String(row.cardId ?? row.cardNumber ?? row.cardName ?? row.id);
            const current = groups.get(key);
            if (current) {
                current.rows.push(row);
                current.no = Math.min(current.no, row.no);
                continue;
            }
            groups.set(key, {
                key,
                no: row.no,
                cardName: row.cardName || '—',
                rows: [row],
            });
        }
        return Array.from(groups.values()).sort((a, b) => a.no - b.no);
    }, [fuelCardsRows]);

    useEffect(() => {
        setFuelCardsPage(1);
    }, [fuelCardsView, fuelCardsSearch, fuelCardsRowsPerPage]);

    useEffect(() => {
        if (fuelCardsPage > fuelCardsTotalPages) {
            setFuelCardsPage(fuelCardsTotalPages);
        }
    }, [fuelCardsPage, fuelCardsTotalPages]);

    useEffect(() => {
        if (fuelCardsView !== 'groups') return;
        setExpandedFuelCardGroupIds((previous) => {
            const available = new Set(fuelCardsRows.map((row) => row.id));
            const next = new Set(Array.from(previous).filter((id) => available.has(id)));
            if (next.size === 0 && fuelCardsRows[0]) next.add(fuelCardsRows[0].id);
            return next;
        });
    }, [fuelCardsRows, fuelCardsView]);

    useEffect(() => {
        if (fuelNavTab !== 'fuelCards') return;
        let active = true;
        let busy = false;
        const load = async () => {
            if (busy) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            busy = true;
            if (active) setFuelCardsLoading(true);
            try {
                const params = new URLSearchParams();
                params.set('view', fuelCardsView);
                params.set('page', String(fuelCardsPage));
                params.set('pageSize', String(fuelCardsRowsPerPage));
                params.set('language', lang);
                if (fuelCardsSearch) params.set('search', fuelCardsSearch);

                const response = await fetch(`${API_BASE}/integrations/fuel/azs/fuel-cards?${params.toString()}`);
                if (!response.ok) throw new Error('fuel_cards_failed');
                const payload = (await response.json()) as FuelCardsResponse;
                if (!active) return;

                const total = Number(payload?.pagination?.total ?? 0);
                const totalPages = Number(payload?.pagination?.totalPages ?? 1);
                startTransition(() => {
                    setFuelCardsRows(Array.isArray(payload?.items) ? payload.items : []);
                    setFuelCardsTotalRows(Number.isFinite(total) ? total : 0);
                    setFuelCardsTotalPages(Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1);
                    setFuelCardsError(payload?.error ?? null);
                });
            } catch {
                if (!active) return;
                startTransition(() => {
                    setFuelCardsRows([]);
                    setFuelCardsTotalRows(0);
                    setFuelCardsTotalPages(1);
                    setFuelCardsError('fetch_failed');
                });
            } finally {
                busy = false;
                if (active) setFuelCardsLoading(false);
            }
        };

        void load();
        const interval = setInterval(() => void load(), FUEL_CARDS_REFRESH_MS);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [fuelNavTab, fuelCardsView, fuelCardsPage, fuelCardsRowsPerPage, fuelCardsSearch, lang]);

    useEffect(() => {
        if (fuelNavTab !== 'objects') return;
        let active = true;
        let busy = false;
        const load = async () => {
            if (busy) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            busy = true;
            try {
                const response = await fetch(`${API_BASE}/integrations/fuel/azs/objects`);
                const payload = (await response.json().catch(() => null)) as AzsListPayload<AzsObjectRow> | null;
                if (!active) return;
                startTransition(() => {
                    setAzsObjects(
                        payload && Array.isArray(payload.items)
                            ? payload
                            : { items: [], total: 0, fetchedAt: new Date().toISOString() },
                    );
                });
            } catch {
                if (active) {
                    startTransition(() => {
                        setAzsObjects({ items: [], total: 0, error: 'fetch_failed', fetchedAt: new Date().toISOString() });
                    });
                }
            } finally {
                busy = false;
            }
        };
        void load();
        const interval = setInterval(() => void load(), FUEL_OBJECTS_REFRESH_MS);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [fuelNavTab]);

    useEffect(() => {
        setExpandedObjectIds(new Set());
    }, [fuelNavTab]);

    useEffect(() => {
        if (fuelNavTab !== 'reservoirs') return;
        let active = true;
        let busy = false;
        const load = async () => {
            if (busy) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            busy = true;
            try {
                const response = await fetch(`${API_BASE}/integrations/fuel/azs/reservoirs`);
                const payload = (await response.json().catch(() => null)) as AzsListPayload<AzsReservoirRow> | null;
                if (!active) return;
                startTransition(() => {
                    setAzsReservoirs(
                        payload && Array.isArray(payload.items)
                            ? payload
                            : { items: [], total: 0, fetchedAt: new Date().toISOString() },
                    );
                });
            } catch {
                if (active) {
                    startTransition(() => {
                        setAzsReservoirs({ items: [], total: 0, error: 'fetch_failed', fetchedAt: new Date().toISOString() });
                    });
                }
            } finally {
                busy = false;
            }
        };
        void load();
        const interval = setInterval(() => void load(), FUEL_RESERVOIRS_REFRESH_MS);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [fuelNavTab]);

    useEffect(() => {
        if (fuelNavTab !== 'main' && fuelNavTab !== 'reports') return;
        let active = true;
        let busy = false;

        const loadSummary = async () => {
            if (busy) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            busy = true;
            try {
                const params = new URLSearchParams();
                if (dateFrom) params.set('dateFrom', dateFrom);
                if (dateTo) params.set('dateTo', dateTo);
                if (selectedStation !== 'all') params.set('station', selectedStation);
                params.set('compact', '1');

                const response = await fetch(`${API_BASE}/integrations/fuel/azs/summary?${params.toString()}`);
                if (!response.ok) throw new Error('fuel_summary_failed');
                const payload = await response.json();
                if (!active) return;
                startTransition(() => {
                    setSummary(payload as FuelSummaryResponse);
                });
                setError(null);
            } catch {
                if (active) setError("Yoqilg'i integratsiyasi bilan aloqa yo'q");
            } finally {
                busy = false;
            }
        };

        void loadSummary();
        const interval = setInterval(() => {
            void loadSummary();
        }, FUEL_SUMMARY_REFRESH_MS);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [fuelNavTab, dateFrom, dateTo, selectedStation]);

    useEffect(() => {
        if (fuelNavTab !== 'reports') return;
        let active = true;
        let busy = false;

        const loadTodayCount = async () => {
            try {
                if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
                const params = new URLSearchParams();
                const todayAzs = azsCalendarYmdToday();
                params.set('dateFrom', todayAzs);
                params.set('dateTo', todayAzs);
                if (selectedStation !== 'all') params.set('station', selectedStation);
                params.set('compact', '1');

                const response = await fetch(`${API_BASE}/integrations/fuel/azs/summary?${params.toString()}`);
                if (!response.ok) return;
                const payload = await response.json().catch(() => null);
                const records = Number(payload?.window?.records ?? 0);
                if (active) setTodayRecordsCount(Number.isFinite(records) ? records : 0);
            } catch {
                // Ignore silent errors for today's counter.
            }
        };

        const loadOperations = async () => {
            try {
                if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
                const params = new URLSearchParams();
                params.set('page', String(operationsPage));
                params.set('pageSize', String(operationsRowsPerPage));
                if (operationsDateFrom) params.set('dateFrom', operationsDateFrom);
                if (operationsDateTo) params.set('dateTo', operationsDateTo);
                if (selectedStation !== 'all') params.set('station', selectedStation);

                const response = await fetch(`${API_BASE}/integrations/fuel/azs/operations?${params.toString()}`);
                if (!response.ok) throw new Error('fuel_operations_failed');
                const payload = (await response.json()) as FuelOperationsResponse;
                if (!active) return;

                const total = Number(payload?.pagination?.total ?? 0);
                const totalPages = Number(payload?.pagination?.totalPages ?? 1);
                const totalLiters = Number(payload?.summary?.liters ?? 0);
                startTransition(() => {
                    setOperationsRows(Array.isArray(payload?.items) ? payload.items : []);
                    setOperationsTotalRows(Number.isFinite(total) ? total : 0);
                    setOperationsTotalPages(Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1);
                    setOperationsTotalLiters(Number.isFinite(totalLiters) ? totalLiters : 0);
                });
            } catch {
                if (!active) return;
                startTransition(() => {
                    setOperationsRows([]);
                    setOperationsTotalRows(0);
                    setOperationsTotalPages(1);
                    setOperationsTotalLiters(0);
                });
            }
        };

        const loadReports = async () => {
            if (busy) return;
            busy = true;
            try {
                await Promise.all([loadTodayCount(), loadOperations()]);
            } finally {
                busy = false;
            }
        };

        void loadReports();
        const interval = setInterval(() => {
            void loadReports();
        }, FUEL_REPORTS_REFRESH_MS);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [fuelNavTab, operationsDateFrom, operationsDateTo, selectedStation, operationsPage, operationsRowsPerPage]);

    useEffect(() => {
        if (fuelNavTab !== 'main') return;
        let active = true;
        let busy = false;
        const loadSectionLevel = async () => {
            if (busy) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            busy = true;
            try {
                const params = new URLSearchParams();
                if (levelDateFrom) params.set('dateFrom', levelDateFrom);
                if (levelDateTo) params.set('dateTo', levelDateTo);
                if (selectedStation !== 'all') params.set('station', selectedStation);
                if (levelSelectedSection !== 'all') params.set('section', levelSelectedSection);
                params.set('compact', '1');

                const response = await fetch(`${API_BASE}/integrations/fuel/azs/summary?${params.toString()}`);
                if (!response.ok) throw new Error('fuel_section_level_failed');
                const payload = (await response.json()) as FuelSummaryResponse;
                if (!active) return;
                startTransition(() => {
                    setSectionLevelSummary(payload);
                });
            } catch {
                if (active) setSectionLevelSummary(null);
            } finally {
                busy = false;
            }
        };
        void loadSectionLevel();
        const interval = setInterval(() => void loadSectionLevel(), FUEL_LEVEL_REFRESH_MS);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [fuelNavTab, levelDateFrom, levelDateTo, levelSelectedSection, selectedStation]);

    const stations = useMemo(() => {
        const azsPosts = summary?.stats?.posts ?? [];
        const dbStations = summary?.stations ?? [];
        if (azsPosts.length > 0) {
            return azsPosts.map((p) => {
                const key = normStationLabel(p.name);
                const match = dbStations.find((s) => normStationLabel(s.name) === key);
                return { name: p.name, records: match?.records ?? 0, liters: match?.liters ?? 0 };
            });
        }
        return dbStations;
    }, [summary]);

    const levelSectionOptions = useMemo(() => {
        const merged = new Set<string>();
        const pushName = (value: string | null | undefined) => {
            const name = String(value ?? '').trim();
            if (name) merged.add(name);
        };

        for (const name of sectionLevelSummary?.stats?.azsSectionNames ?? []) pushName(name);
        for (const name of summary?.stats?.azsSectionNames ?? []) pushName(name);
        for (const row of sectionLevelSummary?.sections ?? []) pushName(row?.name);
        for (const row of summary?.sections ?? []) pushName(row?.name);

        return Array.from(merged);
    }, [summary, sectionLevelSummary]);

    // preserve select options computation for potential future reuse
    const levelSectionSelectOptions = useMemo(() => {
        let list = levelSectionOptions;
        if (levelSelectedSection !== 'all' && !list.includes(levelSelectedSection)) {
            list = [levelSelectedSection, ...list];
        }
        return list;
    }, [levelSectionOptions, levelSelectedSection]);

    const chartData = useMemo(() => summary?.chart ?? [], [summary]);
    const levelChartData = useMemo(() => sectionLevelSummary?.levelChart ?? [], [sectionLevelSummary]);
    // keep levelChartAxis calculation in place (unused after removal) to avoid refactor churn
    const levelChartAxis = useMemo(
        () => buildNiceAxis(levelChartData.map((point) => Number(point?.level ?? 0)), 5),
        [levelChartData],
    );
    const chartYAxisMax = useMemo(() => {
        const seriesMax = chartData.reduce((max, point) => {
            const value = Number(point?.consumption ?? 0);
            return Number.isFinite(value) ? Math.max(max, value) : max;
        }, 0);
        const step = seriesMax > 1000 ? 1000 : 200;
        const paddedMax = seriesMax > 0 ? seriesMax * 1.1 : step;
        const roundedMax = Math.ceil(paddedMax / step) * step;
        return Math.max(step * 4, roundedMax);
    }, [chartData]);
    const chartYAxisTicks = useMemo(() => {
        const step = chartYAxisMax > 1000 ? 1000 : 200;
        const ticks: number[] = [];
        for (let value = 0; value <= chartYAxisMax; value += step) {
            ticks.push(value);
        }
        return ticks;
    }, [chartYAxisMax]);
    const totalLiters = Number(summary?.window?.totalLiters ?? 0);
    const totalLitersDisplay =
        summary?.window?.totalLitersRounded != null
            ? Number(summary.window.totalLitersRounded)
            : Math.round(totalLiters);

    const levelJamiLiters = useMemo(() => {
        const live = sectionLevelSummary?.window?.liveLevelGaugeLiters;
        if (live != null && Number.isFinite(Number(live))) return Number(live);
        const points = sectionLevelSummary?.levelChart ?? [];
        for (let i = points.length - 1; i >= 0; i -= 1) {
            const v = Number(points[i]?.level);
            if (Number.isFinite(v)) return v;
        }
        return null;
    }, [sectionLevelSummary]);

    useEffect(() => {
        if (selectedStation === 'all') return;
        const exists = stations.some((station) => station.name === selectedStation);
        if (!exists) setSelectedStation('all');
    }, [stations, selectedStation]);

    useEffect(() => {
        if (levelSelectedSection === 'all') return;
        const exists = levelSectionOptions.includes(levelSelectedSection);
        if (!exists) setLevelSelectedSection('all');
    }, [levelSectionOptions, levelSelectedSection]);

    useEffect(() => {
        setOperationsPage(1);
    }, [operationsDateFrom, operationsDateTo, selectedStation, operationsRowsPerPage]);

    useEffect(() => {
        if (operationsPage > operationsTotalPages) {
            setOperationsPage(operationsTotalPages);
        }
    }, [operationsPage, operationsTotalPages]);

    const buildOperationsExportFileName = (ext: 'xls' | 'pdf') => {
        const from = operationsDateFrom || azsCalendarYmdToday();
        const to = operationsDateTo || from;
        return `fuel_operations_${from}_${to}.${ext}`;
    };

    const operationsSummaryFrom = operationsDateFrom || azsCalendarYmdToday();
    const operationsSummaryTo = operationsDateTo || operationsSummaryFrom;
    const operationsSummaryPeriod =
        operationsSummaryFrom === operationsSummaryTo
            ? formatDateInputDisplay(operationsSummaryFrom)
            : `${formatDateInputDisplay(operationsSummaryFrom)} - ${formatDateInputDisplay(operationsSummaryTo)}`;

    const operationExportHeaders = () => [
        t('fuelOpsColStartTime'),
        t('fuelOpsColCardNumber'),
        t('fuelOpsColCardName'),
        t('fuelOpsColGroup'),
        t('fuelOpsColPost'),
        t('fuelOpsColSection'),
        t('fuelOpsColStartDut'),
        t('fuelOpsColEndDut'),
        t('fuelOpsColIssued'),
    ];

    const operationExportRow = (row: FuelOperationsResponse['items'][number]) => [
        formatDateTime(row.time),
        row.cardNumber || row.cardId || '-',
        row.cardName || row.vehicle || '-',
        row.groupName || '-',
        row.station || '-',
        row.fuelSectionName || '-',
        row.levelStartDut != null ? formatLiters(row.levelStartDut, numLocale) : '-',
        row.levelEndDut != null ? formatLiters(row.levelEndDut, numLocale) : '-',
        `${formatLiters(row.issuedValue ?? row.liters, numLocale)} ${t('fuelUnitL')}`,
    ];

    const fetchOperationsForExport = async () => {
        const rows: FuelOperationsResponse['items'] = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('pageSize', String(FUEL_OPERATIONS_EXPORT_PAGE_SIZE));
            if (operationsDateFrom) params.set('dateFrom', operationsDateFrom);
            if (operationsDateTo) params.set('dateTo', operationsDateTo);
            if (selectedStation !== 'all') params.set('station', selectedStation);

            const response = await fetch(`${API_BASE}/integrations/fuel/azs/operations?${params.toString()}`);
            if (!response.ok) throw new Error('fuel_operations_export_failed');
            const payload = (await response.json()) as FuelOperationsResponse;
            const items = Array.isArray(payload?.items) ? payload.items : [];
            rows.push(...items);
            totalPages = Math.max(1, Number(payload?.pagination?.totalPages ?? 1) || 1);
            if (items.length === 0) break;
            page += 1;
        }

        return rows;
    };

    const handleOperationsExportXls = async () => {
        if (operationsExportingXls || operationsExportingPdf || operationsTotalRows === 0) return;
        setOperationsExportingXls(true);
        try {
            const rows = await fetchOperationsForExport();
            if (rows.length === 0) return;
            downloadXls(operationExportHeaders(), rows.map(operationExportRow), buildOperationsExportFileName('xls'));
        } catch {
            setError(t('exportDataError'));
        } finally {
            setOperationsExportingXls(false);
        }
    };

    const handleOperationsExportPdf = async () => {
        if (operationsExportingPdf || operationsExportingXls || operationsTotalRows === 0) return;
        setOperationsExportingPdf(true);
        try {
            const rows = await fetchOperationsForExport();
            if (rows.length === 0) return;

            const doc = new jsPDF({ orientation: 'landscape' });
            try {
                const fontRes = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf');
                const buf = await fontRes.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                doc.addFileToVFS('Roboto.ttf', base64);
                doc.addFont('Roboto.ttf', 'Roboto', 'normal');
                doc.setFont('Roboto');
            } catch {
                // Keep default font if loading fails.
            }

            doc.setFontSize(16);
            doc.text(t('fuelReportsTitle'), 14, 18);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(
                `${operationsDateFrom || azsCalendarYmdToday()} - ${operationsDateTo || operationsDateFrom || azsCalendarYmdToday()}`,
                14,
                25,
            );

            autoTable(doc, {
                head: [operationExportHeaders()],
                body: rows.map(operationExportRow),
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235], font: 'Roboto' },
                styles: { fontSize: 7, font: 'Roboto' },
            });

            doc.save(buildOperationsExportFileName('pdf'));
        } catch {
            setError(t('pdfExportError'));
        } finally {
            setOperationsExportingPdf(false);
        }
    };

    const applyPreset = (nextPreset: RangePreset) => {
        setPreset(nextPreset);
        const range = getPresetRange(nextPreset);
        setDateFrom(range.dateFrom);
        setDateTo(range.dateTo);
    };

    const applyLevelPreset = (nextPreset: RangePreset) => {
        setLevelPreset(nextPreset);
        const range = getPresetRange(nextPreset);
        setLevelDateFrom(range.dateFrom);
        setLevelDateTo(range.dateTo);
    };

    // No-op references to prevent TypeScript 'declared but never used' errors
    // These variables/functions were used by the removed 'Seksiya darajasi' chart block.
    void levelPreset;
    void levelSectionSelectOptions;
    void levelChartAxis;
    void levelJamiLiters;
    void applyLevelPreset;

    const stats = summary?.stats;
    const devicesTotal = stats?.devices?.total ?? 0;
    const devicesOnline = stats?.devices?.online ?? devicesTotal;
    const devicesOffline = stats?.devices?.offline ?? 0;
    const secCritical = stats?.sectionLevels?.critical ?? 0;
    const secLow = stats?.sectionLevels?.low ?? 0;
    const secNormal = stats?.sectionLevels?.normal ?? 0;
    const cardsTotal = stats?.cards?.total ?? 0;
    const cardsSynced = stats?.cards?.synced ?? 0;
    const cardsUnsynced = stats?.cards?.unsynced ?? 0;
    const refuelToday = stats?.refuels?.today ?? 0;
    const refuelWeek = stats?.refuels?.week ?? 0;
    const refuelMonth = stats?.refuels?.month ?? 0;

    const showMainDashboard = fuelNavTab === 'main';
    const showReports = fuelNavTab === 'reports';
    const showFuelCardsPanel = fuelNavTab === 'fuelCards';
    const showObjectsPanel = fuelNavTab === 'objects';
    const showReservoirsPanel = fuelNavTab === 'reservoirs';

    return (
        <div className="min-w-0 space-y-4 sm:space-y-6">
            {/* AZS uslubidagi yuqori navigatsiya: mobil scroll, desktop teng kenglik */}
            <div className="glass-panel overflow-hidden rounded-2xl border border-slate-700/50">
                <nav
                    className="flex w-full min-w-0 overflow-x-auto overscroll-x-contain border-b border-slate-700/60 dark-scrollbar [-webkit-overflow-scrolling:touch] md:overflow-x-visible"
                    aria-label={t('fuelNavAria')}
                >
                    {FUEL_NAV_ITEMS.map((item) => {
                        const active = fuelNavTab === item.id;
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setFuelNavTab(item.id)}
                                className={`flex min-h-[3.25rem] min-w-[4.5rem] max-w-[7.5rem] flex-shrink-0 flex-col items-center justify-center gap-1 border-b-[3px] px-1.5 py-2.5 text-center text-[10px] font-medium leading-tight transition-colors sm:min-h-[3.75rem] sm:min-w-[5rem] sm:max-w-[9rem] sm:gap-1.5 sm:px-2 sm:py-3 sm:text-xs md:max-w-none md:min-h-[4rem] md:min-w-0 md:flex-1 md:basis-0 md:gap-1.5 md:px-3 md:py-4 md:text-sm lg:text-base xl:text-lg ${active
                                    ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                                    : 'border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                                    }`}
                            >
                                <Icon
                                    size={22}
                                    className={`shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`}
                                    strokeWidth={active ? 2.2 : 2}
                                />
                                <span className="line-clamp-2 max-w-full text-balance hyphens-auto sm:line-clamp-none md:max-w-[10rem] lg:max-w-none">
                                    {t(item.labelKey)}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            {showFuelCardsPanel && (
                <div className="glass-panel overflow-hidden rounded-2xl border border-slate-700/50">
                    <div className="border-b border-slate-700/50">
                        <div className="flex min-w-0 overflow-x-auto overscroll-x-contain px-4 pt-3 dark-scrollbar sm:px-5">
                            {([
                                ['groups', t('fuelCardsGroupsTab'), CreditCard],
                                ['limits', t('fuelCardsLimitsTab'), Layers],
                            ] as const).map(([view, label, Icon]) => {
                                const active = fuelCardsView === view;
                                return (
                                    <button
                                        key={view}
                                        type="button"
                                        onClick={() => setFuelCardsView(view)}
                                        className={`inline-flex min-h-[3.4rem] min-w-[11rem] items-center justify-center gap-2.5 border-b-2 px-5 text-base font-semibold transition-colors sm:min-h-[3.7rem] sm:px-6 sm:text-lg ${active
                                            ? 'border-blue-500 text-blue-300'
                                            : 'border-transparent text-slate-400 hover:text-slate-200'
                                            }`}
                                    >
                                        <Icon size={19} />
                                        <span className={`fuel-tab-heading ${active ? '' : 'opacity-80'}`.trim()}>{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] dark-scrollbar">
                        <table className="w-full min-w-[1160px] text-left text-xs sm:text-sm">
                            <thead>
                                <tr className="border-b border-slate-700/50 bg-slate-900/50 text-[10px] uppercase tracking-wide text-slate-400 sm:text-xs">
                                    {fuelCardsView === 'groups' ? (
                                        <>
                                            <th className="w-10 px-2 py-2.5 font-semibold sm:px-3 sm:py-3" />
                                            <th className="w-14 px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelObjectsColNo')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColGroupName')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColLimitType')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColLimitStart')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColLimitEnd')}</th>
                                            <th className="px-2 py-2.5 text-right font-semibold sm:px-3 sm:py-3">{t('fuelCardsColSet')}</th>
                                            <th className="px-2 py-2.5 pr-8 text-right font-semibold sm:px-3 sm:py-3 sm:pr-10">{t('fuelCardsColAvailable')}</th>
                                            <th className="px-2 py-2.5 pr-8 text-right font-semibold sm:px-3 sm:py-3 sm:pr-10">{t('fuelCardsColIssued')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColLimitStatus')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelObjectsColSync')}</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="w-10 px-2 py-2.5 font-semibold sm:px-3 sm:py-3" />
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColPost')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColLimitType')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColLimitStart')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColLimitEnd')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColPeriod')}</th>
                                            <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelCardsColLimitStatus')}</th>
                                            <th className="w-[8.5rem] px-2 py-2.5 text-left font-semibold sm:px-3 sm:py-3">{t('fuelCardsColAvailable')}</th>
                                            <th className="w-[8.5rem] px-2 py-2.5 text-left font-semibold sm:px-3 sm:py-3">{t('fuelCardsColIssued')}</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/40">
                                {fuelCardsRows.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={fuelCardsView === 'groups' ? 11 : 9}
                                            className="px-3 py-8 text-center text-xs text-slate-500 sm:text-sm"
                                        >
                                            {fuelCardsLoading ? t('syncing') : fuelCardsError ? t('fuelCardsError') : t('fuelCardsNoData')}
                                        </td>
                                    </tr>
                                ) : fuelCardsView === 'limits' ? (
                                    fuelCardLimitGroups.map((group) => (
                                        <Fragment key={group.key}>
                                            <tr className="border-t border-blue-400/10 bg-blue-500/10 text-slate-200">
                                                <td className="w-10 px-2 py-2 text-center text-slate-300 sm:px-3">
                                                    <ChevronDown size={16} className="inline-block" />
                                                </td>
                                                <td colSpan={8} className="px-2 py-2 font-semibold text-slate-100 sm:px-3">
                                                    {t('fuelCardsColCardName')}: {group.cardName}
                                                </td>
                                            </tr>
                                            {group.rows.map((row, index) => (
                                                <tr
                                                    key={row.id || `${group.key}-${index}`}
                                                    className={`${index % 2 === 0 ? 'bg-slate-900/10' : 'bg-slate-800/10'} text-slate-200 transition-colors hover:bg-slate-800/35`}
                                                >
                                                    <td className="px-2 py-2 text-slate-500 sm:px-3" />
                                                    <td className="px-2 py-2 text-slate-300 sm:px-3">{row.devicePostName || '—'}</td>
                                                    <td className="px-2 py-2 sm:px-3">
                                                        <span className="inline-flex rounded-full border border-blue-500/15 bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-300">
                                                            {row.limitTypeLabel || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-slate-300 sm:px-3">
                                                        {formatDateOnly(row.limitStartAt)}
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-slate-300 sm:px-3">
                                                        {formatDateOnly(row.limitEndAt)}
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-slate-300 sm:px-3">
                                                        {formatLimitPeriod(row.limitStartAt, row.limitEndAt)}
                                                    </td>
                                                    <td className="px-2 py-2 sm:px-3">
                                                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${fuelCardLimitStatusClass(row.limitState)}`}>
                                                            {row.limitStateLabel || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="w-[8.5rem] px-2 py-2 text-left tabular-nums text-slate-300 sm:px-3">
                                                        {formatFuelCardLimitBalanceLiters(row.availableLiters)}
                                                    </td>
                                                    <td className="w-[8.5rem] px-2 py-2 text-left tabular-nums text-blue-200 sm:px-3">
                                                        {formatFuelCardLimitIssuedLiters(row.issuedLiters)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </Fragment>
                                    ))
                                ) : (
                                    fuelCardsRows.map((row, index) => {
                                        const expanded = expandedFuelCardGroupIds.has(row.id);
                                        const cards = Array.isArray(row.cards) ? row.cards : [];
                                        const visibleCards = cards.slice(0, 10);
                                        return (
                                            <Fragment key={row.id || `${fuelCardsView}-${index}`}>
                                                <tr
                                                    onClick={() => {
                                                        setExpandedFuelCardGroupIds((previous) => {
                                                            const next = new Set(previous);
                                                            if (next.has(row.id)) next.delete(row.id);
                                                            else next.add(row.id);
                                                            return next;
                                                        });
                                                    }}
                                                    className={`${expanded ? 'bg-blue-500/15' : index % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-800/10'} cursor-pointer text-slate-200 transition-colors hover:bg-blue-500/10`}
                                                >
                                                    <td className="w-10 px-2 py-2 text-center text-slate-300 sm:px-3">
                                                        {expanded ? <ChevronDown size={16} className="inline-block" /> : <ChevronRight size={16} className="inline-block" />}
                                                    </td>
                                                    <td className="px-2 py-2 tabular-nums text-slate-400 sm:px-3">{row.no}</td>
                                                    <td className="min-w-[14rem] px-2 py-2 font-medium text-slate-100 sm:px-3">
                                                        {row.groupName || '—'}
                                                    </td>
                                                    <td className="px-2 py-2 sm:px-3">
                                                        <span className="inline-flex rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                                                            {row.limitTypeLabel || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-slate-300 sm:px-3">
                                                        {row.limitStartAt ? formatDateTime(row.limitStartAt) : '---'}
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-slate-300 sm:px-3">
                                                        {row.limitEndAt ? formatDateTime(row.limitEndAt) : '---'}
                                                    </td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-slate-300 sm:px-3">
                                                        {formatFuelCardLiters(row.setLiters, numLocale)}
                                                    </td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-slate-300 sm:px-3">
                                                        {formatFuelCardLiters(row.availableLiters, numLocale)}
                                                    </td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-blue-200 sm:px-3">
                                                        {formatFuelCardLiters(row.issuedLiters, numLocale)}
                                                    </td>
                                                    <td className="px-2 py-2 sm:px-3">
                                                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${fuelCardLimitStatusClass(row.limitState)}`}>
                                                            {row.limitStateLabel || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-2 text-slate-300 sm:px-3">
                                                        {row.syncAt ? formatDateTime(row.syncAt) : '---'}
                                                    </td>
                                                </tr>
                                                {expanded && (
                                                    <tr className="bg-slate-950/20">
                                                        <td colSpan={11} className="p-0">
                                                            <div className="border-y border-slate-700/45 bg-slate-950/10">
                                                                <table className="w-full text-left text-xs sm:text-sm">
                                                                    <thead>
                                                                        <tr className="border-b border-slate-700/45 bg-slate-900/35 text-[10px] uppercase tracking-wide text-slate-400 sm:text-xs">
                                                                            <th className="w-10 px-2 py-2 sm:px-3" />
                                                                            <th className="w-24 px-2 py-2 font-semibold sm:px-3">{t('fuelObjectsColNo')}</th>
                                                                            <th className="px-2 py-2 font-semibold sm:px-3">{t('fuelCardsColCardName')}</th>
                                                                            <th className="px-2 py-2 font-semibold sm:px-3">{t('fuelCardsColCardNumber')}</th>
                                                                            <th className="px-2 py-2 font-semibold sm:px-3">{t('fuelCardsColCardType')}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-700/35">
                                                                        {visibleCards.length === 0 ? (
                                                                            <tr>
                                                                                <td colSpan={5} className="px-3 py-5 text-center text-slate-500">
                                                                                    {t('fuelCardsNoData')}
                                                                                </td>
                                                                            </tr>
                                                                        ) : (
                                                                            visibleCards.map((card, cardIndex) => (
                                                                                <tr
                                                                                    key={`${row.id}-card-${card.cardId ?? card.cardNumber ?? cardIndex}`}
                                                                                    className={cardIndex % 2 === 0 ? 'bg-slate-900/10' : 'bg-slate-800/10'}
                                                                                >
                                                                                    <td className="px-2 py-2 sm:px-3" />
                                                                                    <td className="px-2 py-2 tabular-nums text-slate-300 sm:px-3">{card.no}</td>
                                                                                    <td className="px-2 py-2 text-slate-200 sm:px-3">{card.cardName || '—'}</td>
                                                                                    <td className="px-2 py-2 tabular-nums text-slate-300 sm:px-3">{card.cardNumber || '—'}</td>
                                                                                    <td className="px-2 py-2 text-slate-300 sm:px-3">{card.cardType || '—'}</td>
                                                                                </tr>
                                                                            ))
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                                {cards.length > 0 && (
                                                                    <div className="flex items-center justify-end border-t border-slate-700/40 px-3 py-2 text-xs font-semibold text-slate-300">
                                                                        1-{Math.min(10, cards.length)} / {cards.length}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="table-pagination-bar border-t border-slate-700/50 bg-slate-900/30 px-3 py-2.5 md:px-4">
                        <div className="flex flex-col items-center gap-2 text-center md:flex-row md:items-center md:justify-between md:text-left">
                            <p className="w-full text-xs text-slate-400 tabular-nums sm:text-sm md:w-auto">
                                {fuelCardsTotalRows === 0
                                    ? '0 / 0'
                                    : `${(fuelCardsPage - 1) * fuelCardsRowsPerPage + 1}-${Math.min(fuelCardsPage * fuelCardsRowsPerPage, fuelCardsTotalRows)} / ${fuelCardsTotalRows}`}
                            </p>
                            <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-1.5 sm:gap-2 md:w-auto md:max-w-none md:justify-end">
                                <label className="text-xs text-slate-400 sm:text-sm" htmlFor="fuel-cards-rows-per-page">
                                    {t('rowsPerPage')}:
                                </label>
                                <select
                                    id="fuel-cards-rows-per-page"
                                    value={fuelCardsRowsPerPage}
                                    onChange={(event) => {
                                        const value = Math.max(10, Number.parseInt(event.target.value, 10) || 100);
                                        setFuelCardsRowsPerPage(value);
                                    }}
                                    className="rounded-md border border-slate-700/70 bg-slate-900/70 px-1.5 py-1 text-xs text-slate-200 outline-none focus:border-blue-500/60 sm:px-2 sm:py-1.5 sm:text-sm"
                                >
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setFuelCardsPage((prev) => Math.max(1, prev - 1))}
                                    disabled={fuelCardsPage <= 1}
                                    className="rounded-md border border-slate-700/70 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-sm"
                                >
                                    {t('previous')}
                                </button>
                                <span className="min-w-[72px] text-center text-xs text-slate-300 sm:min-w-[80px] sm:text-sm">
                                    {fuelCardsPage} / {fuelCardsTotalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setFuelCardsPage((prev) => Math.min(fuelCardsTotalPages, prev + 1))}
                                    disabled={fuelCardsPage >= fuelCardsTotalPages}
                                    className="rounded-md border border-slate-700/70 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-sm"
                                >
                                    {t('next')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showObjectsPanel && (
                <div className="glass-panel rounded-2xl border border-slate-700/50">
                    <div className="flex min-h-[88px] flex-col justify-center gap-2 border-b border-slate-700/40 px-4 py-4 md:px-5">
                        <FuelPanelGradientHeading>{t('fuelObjectsTitle')}</FuelPanelGradientHeading>
                    </div>
                    <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] dark-scrollbar">
                        <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
                            <thead>
                                <tr className="border-b border-slate-700/50 bg-slate-900/50 text-[10px] uppercase tracking-wide text-slate-400 sm:text-xs">
                                    <th className="w-8 px-1 py-1.5 sm:w-9 sm:px-2 sm:py-2" aria-hidden />
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelObjectsColNo')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelObjectsColController')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelObjectsColObject')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelObjectsColStatus')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelObjectsColSync')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/40">
                                {(azsObjects?.items ?? []).length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-500 sm:py-8 sm:text-sm">
                                            {t('fuelObjectsNoData')}
                                        </td>
                                    </tr>
                                ) : (
                                    (azsObjects?.items ?? []).map((row, index) => {
                                        const hasChildren = Array.isArray(row.children) && row.children.length > 0;
                                        const open = expandedObjectIds.has(row.id);
                                        const objectsExpandPanelId = `fuel-object-children-${row.id}`;
                                        const toggleObjectRow = () =>
                                            setExpandedObjectIds((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(row.id)) next.delete(row.id);
                                                else next.add(row.id);
                                                return next;
                                            });
                                        return (
                                            <Fragment key={row.id}>
                                                <tr
                                                    className={`text-slate-200 hover:bg-slate-800/30 ${open ? 'bg-blue-500/10' : ''}`}
                                                >
                                                    <td className="px-1 py-1.5 align-middle sm:px-2 sm:py-2">
                                                        {hasChildren ? (
                                                            <button
                                                                type="button"
                                                                aria-controls={objectsExpandPanelId}
                                                                aria-label={t('fuelObjectsExpandRow')}
                                                                onClick={toggleObjectRow}
                                                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 sm:h-8 sm:w-8"
                                                            >
                                                                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                            </button>
                                                        ) : (
                                                            <span className="inline-block w-7 sm:w-8" />
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-1.5 tabular-nums text-slate-400 sm:px-3 sm:py-2">{index + 1}</td>
                                                    <td className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">{row.controllerName}</td>
                                                    <td className="px-2 py-1.5 text-slate-300 sm:px-3 sm:py-2">{row.objectKindLabel}</td>
                                                    <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                                                        <span
                                                            className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs ${row.isOnline
                                                                ? 'bg-emerald-500/15 text-emerald-400'
                                                                : 'bg-slate-600/40 text-slate-400'
                                                                }`}
                                                        >
                                                            {row.isOnline ? t('fuelObjectsOnline') : t('fuelObjectsOffline')}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-300 sm:px-3 sm:py-2">
                                                        {row.lastSyncAt ? formatDateTime(row.lastSyncAt) : '---'}
                                                    </td>
                                                </tr>
                                                {open && hasChildren && (
                                                    <tr key={`${row.id}-detail`} className="bg-slate-950/50">
                                                        <td
                                                            id={objectsExpandPanelId}
                                                            colSpan={6}
                                                            className="px-2 py-2 pl-2 sm:px-3 sm:pl-6 md:pl-10"
                                                        >
                                                            <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] rounded-lg border border-slate-700/60 bg-slate-900/80">
                                                                <table className="w-full min-w-[280px] text-left text-xs sm:text-sm">
                                                                    <thead>
                                                                        <tr className="border-b border-slate-700/50 text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
                                                                            <th className="px-2 py-1 font-semibold sm:py-1.5">{t('fuelObjectsColNo')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:py-1.5">{t('fuelObjectsColPostName')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:py-1.5">{t('fuelObjectsColCondition')}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-700/40">
                                                                        {row.children!.map((ch, ci) => (
                                                                            <tr key={ch.id}>
                                                                                <td className="px-2 py-1 text-slate-500 sm:py-1.5">{ci + 1}</td>
                                                                                <td className="px-2 py-1 text-slate-200 sm:py-1.5">{ch.name}</td>
                                                                                <td className="px-2 py-1 text-slate-300 sm:py-1.5">{ch.stateLabel}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-slate-700/40 px-4 py-2 text-right text-xs text-slate-500">
                        {azsObjects?.total != null ? `${(azsObjects.items ?? []).length} / ${azsObjects.total}` : ''}
                    </div>
                </div>
            )}

            {showReservoirsPanel && (
                <div className="glass-panel rounded-2xl border border-slate-700/50">
                    <div className="flex min-h-[88px] flex-col justify-center gap-2 border-b border-slate-700/40 px-4 py-5 md:px-5">
                        <FuelPanelGradientHeading>{t('fuelReservoirsTitle')}</FuelPanelGradientHeading>
                    </div>
                    <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] dark-scrollbar">
                        <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
                            <thead>
                                <tr className="border-b border-slate-700/50 bg-slate-900/50 text-[10px] uppercase tracking-wide text-slate-400 sm:text-xs">
                                    <th className="w-8 px-1 py-2.5 sm:w-9 sm:px-2 sm:py-3" aria-hidden />
                                    <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelObjectsColNo')}</th>
                                    <th className="px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelResColReservoirName')}</th>
                                    <th className="min-w-[7rem] whitespace-nowrap px-2 py-2.5 font-semibold sm:px-3 sm:py-3">{t('fuelResColVolume')}</th>
                                    <th className="min-w-[9rem] px-2 py-2.5 font-semibold sm:min-w-[10rem] sm:px-3 sm:py-3">{t('fuelResColLevelCalcPct')}</th>
                                    <th className="min-w-[9rem] px-2 py-2.5 font-semibold sm:min-w-[10rem] sm:px-3 sm:py-3">{t('fuelResColLevelPct')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/40">
                                {(azsReservoirs?.items ?? []).length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-500 sm:py-8 sm:text-sm">
                                            {t('fuelResNoData')}
                                        </td>
                                    </tr>
                                ) : (
                                    (azsReservoirs?.items ?? []).map((row, index) => {
                                        const hasChildren = Array.isArray(row.children) && row.children.length > 0;
                                        const open = expandedReservoirIds.has(row.id);
                                        const reservoirsExpandPanelId = `fuel-reservoir-children-${row.id}`;
                                        const toggleOpen = () => {
                                            if (!hasChildren) return;
                                            setExpandedReservoirIds((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(row.id)) next.delete(row.id);
                                                else next.add(row.id);
                                                return next;
                                            });
                                        };
                                        return (
                                            <Fragment key={row.id}>
                                                <tr
                                                    onClick={hasChildren ? toggleOpen : undefined}
                                                    className={`text-slate-200 transition-colors hover:bg-slate-800/30 ${hasChildren ? 'cursor-pointer' : ''
                                                        } ${open ? 'bg-blue-500/10' : ''} ${index % 2 === 0 ? 'bg-slate-900/25' : 'bg-slate-800/15'
                                                        }`}
                                                >
                                                    <td className="px-1 py-1.5 align-middle sm:px-2 sm:py-2">
                                                        {hasChildren ? (
                                                            <button
                                                                type="button"
                                                                aria-controls={reservoirsExpandPanelId}
                                                                aria-label={t('fuelResExpandRow')}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleOpen();
                                                                }}
                                                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 sm:h-8 sm:w-8"
                                                            >
                                                                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                            </button>
                                                        ) : (
                                                            <span className="inline-block w-7 sm:w-8" />
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-1.5 tabular-nums text-slate-400 sm:px-3 sm:py-2">{index + 1}</td>
                                                    <td className="px-2 py-1.5 font-medium text-slate-100 break-words sm:px-3 sm:py-2">{row.name}</td>
                                                    <td className="px-2 py-1.5 tabular-nums text-slate-200 sm:px-3 sm:py-2">{formatVolumeAzs(row.volumeLiters, numLocale)}</td>
                                                    <td className="px-2 py-1.5 align-middle sm:px-3 sm:py-2">
                                                        <ReservoirPctCell value={row.levelCalcPercent} numberLocale={numLocale} />
                                                    </td>
                                                    <td className="px-2 py-1.5 align-middle sm:px-3 sm:py-2">
                                                        <ReservoirPctCell value={row.levelPercent} numberLocale={numLocale} />
                                                    </td>
                                                </tr>
                                                {open && hasChildren && (
                                                    <tr className="bg-slate-950/50">
                                                        <td
                                                            id={reservoirsExpandPanelId}
                                                            colSpan={6}
                                                            className="px-2 py-2 pl-2 sm:px-3 sm:py-2 sm:pl-6 md:pl-10"
                                                        >
                                                            <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] rounded-lg border border-slate-700/60 bg-slate-900/80">
                                                                <table className="w-full min-w-[860px] text-left text-[11px] sm:text-xs md:text-sm">
                                                                    <thead>
                                                                        <tr className="border-b border-slate-700/50 text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelObjectsColNo')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelResColSectionName')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelResColSectionVolume')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelResColLevel')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelResColLevelPct')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelResColDutAvailable')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelResColDutMass')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelResColTemperature')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelObjectsColSync')}</th>
                                                                            <th className="px-2 py-1 font-semibold sm:px-2.5 sm:py-1.5">{t('fuelResColFuelKind')}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-700/40">
                                                                        {row.children!.map((ch, ci) => (
                                                                            <tr key={ch.id}>
                                                                                <td className="px-2 py-1 text-slate-500 sm:px-2.5 sm:py-1.5">{ci + 1}</td>
                                                                                <td className="px-2 py-1 font-medium text-slate-200 sm:px-2.5 sm:py-1.5">{ch.name}</td>
                                                                                <td className="px-2 py-1 tabular-nums text-slate-300 sm:px-2.5 sm:py-1.5">
                                                                                    {formatVolumeAzs(ch.sectionVolumeLiters, numLocale)}
                                                                                </td>
                                                                                <td className="px-2 py-1 tabular-nums text-slate-300 sm:px-2.5 sm:py-1.5">
                                                                                    {formatVolumeAzs(ch.levelLiters, numLocale)}
                                                                                </td>
                                                                                <td className="px-2 py-1 sm:px-2.5 sm:py-1.5">
                                                                                    <ReservoirSectionLevelCell
                                                                                        isOnline={ch.isOnline}
                                                                                        percent={ch.levelPercent}
                                                                                        connectedLabel={t('fuelResSectionConnected')}
                                                                                        disconnectedLabel={t('fuelResSectionDisconnected')}
                                                                                        numberLocale={numLocale}
                                                                                    />
                                                                                </td>
                                                                                <td className="px-2 py-1 tabular-nums text-slate-300 sm:px-2.5 sm:py-1.5">
                                                                                    {formatVolumeAzs(ch.dutAvailableLiters, numLocale)}
                                                                                </td>
                                                                                <td className="px-2 py-1 tabular-nums text-slate-300 sm:px-2.5 sm:py-1.5">{formatMassAzs(ch.dutMassKg, numLocale)}</td>
                                                                                <td className="px-2 py-1 tabular-nums text-slate-300 sm:px-2.5 sm:py-1.5">{formatTempAzs(ch.temperature, numLocale)}</td>
                                                                                <td className="px-2 py-1 whitespace-nowrap text-slate-300 sm:px-2.5 sm:py-1.5">
                                                                                    {ch.lastSyncAt ? formatDateTime(ch.lastSyncAt) : '---'}
                                                                                </td>
                                                                                <td className="px-2 py-1 text-slate-300 sm:px-2.5 sm:py-1.5">{ch.fuelTypeName || '---'}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-slate-700/40 px-4 py-2 text-right text-xs text-slate-500">
                        {azsReservoirs?.total != null ? `${(azsReservoirs.items ?? []).length} / ${azsReservoirs.total}` : ''}
                    </div>
                </div>
            )}

            {/* 4 ta info card: AZS asosiy sahifasi */}
            {showMainDashboard && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
                    {/* Kolonnalar */}
                    <div className="glass-panel rounded-xl border border-slate-700/50 p-3 sm:rounded-2xl sm:p-3.5">
                        <div className="mb-2 flex items-center gap-1.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 sm:h-9 sm:w-9">
                                <Fuel size={17} />
                            </div>
                            <span className="text-xs font-semibold text-slate-300 sm:text-sm">{t('fuelDashColumnsTitle')}</span>
                        </div>
                        <div className="space-y-1 text-xs sm:text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashColumnsTotal')}</span>
                                <span className="font-bold text-slate-100">{devicesTotal}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashColumnsOnline')}</span>
                                <span className="font-semibold text-slate-100">{devicesOnline}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashColumnsOffline')}</span>
                                <span className="font-semibold text-slate-100">{devicesOffline}</span>
                            </div>
                        </div>
                    </div>

                    {/* Seksiya darajasi */}
                    <div className="glass-panel rounded-xl border border-slate-700/50 p-3 sm:rounded-2xl sm:p-3.5">
                        <div className="mb-2 flex items-center gap-1.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 sm:h-9 sm:w-9">
                                <Layers size={17} />
                            </div>
                            <span className="text-xs font-semibold text-slate-300 sm:text-sm">{t('fuelDashSectionLevelsTitle')}</span>
                        </div>
                        <div className="space-y-1 text-xs sm:text-sm">
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-400">
                                    <span className="h-2 w-2 rounded-full bg-red-500" />
                                    {t('fuelDashCriticalShort')}
                                </span>
                                <span className="font-semibold text-slate-100">{secCritical}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-400">
                                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                                    {t('fuelDashLowShort')}
                                </span>
                                <span className="font-semibold text-slate-100">{secLow}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-slate-400">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                    {t('fuelDashNormalShort')}
                                </span>
                                <span className="font-semibold text-slate-100">{secNormal}</span>
                            </div>
                        </div>
                    </div>

                    {/* Yoqilg'i kartalari */}
                    <div className="glass-panel rounded-xl border border-slate-700/50 p-3 sm:rounded-2xl sm:p-3.5">
                        <div className="mb-2 flex items-center gap-1.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400 sm:h-9 sm:w-9">
                                <CreditCard size={17} />
                            </div>
                            <span className="text-xs font-semibold text-slate-300 sm:text-sm">{t('fuelNavFuelCards')}</span>
                        </div>
                        <div className="space-y-1 text-xs sm:text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashCardsTotal')}</span>
                                <span className="font-bold text-slate-100">{cardsTotal}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashCardsSynced')}</span>
                                <span className="font-semibold text-slate-100">{cardsSynced}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashCardsUnsynced')}</span>
                                <span className="font-semibold text-slate-100">{cardsUnsynced}</span>
                            </div>
                        </div>
                    </div>

                    {/* Zapravkalar */}
                    <div className="glass-panel rounded-xl border border-slate-700/50 p-3 sm:rounded-2xl sm:p-3.5">
                        <div className="mb-2 flex items-center gap-1.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 sm:h-9 sm:w-9">
                                <Droplets size={17} />
                            </div>
                            <span className="text-xs font-semibold text-slate-300 sm:text-sm">{t('fuelDashRefuelsTitle')}</span>
                        </div>
                        <div className="space-y-1 text-xs sm:text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashRefuelToday')}</span>
                                <span className="font-bold text-slate-100">{refuelToday}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashRefuelWeek')}</span>
                                <span className="font-semibold text-slate-200">{refuelWeek}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-400">{t('fuelDashRefuelMonth')}</span>
                                <span className="font-semibold text-slate-200">{refuelMonth}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showMainDashboard && (
                <div className="glass-panel rounded-2xl border border-slate-700/50 p-4 md:p-5">
                    {/* Sarlavha chapda, filtrlar qator oxirida */}
                    <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                        <div className="min-w-0 shrink-0 lg:max-w-[min(100%,32rem)] lg:pr-2">
                            <FuelPanelGradientHeading>
                                {t('fuelChartByColumnsTitle')}
                            </FuelPanelGradientHeading>
                        </div>
                        <div className="w-full min-w-0 shrink-0 sm:max-w-2xl lg:w-auto lg:max-w-[min(100%,48rem)]">
                            <div className="grid grid-cols-1 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)] sm:gap-x-3 sm:gap-y-2">
                                <div className="relative min-w-0 sm:col-start-1 sm:row-start-1">
                                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                                        <LocalizedDateInput
                                            label={t('dateFromSanadan')}
                                            value={dateFrom}
                                            maxDate={dateTo || undefined}
                                            minWidth={132}
                                            onChange={(v) => {
                                                setPreset('today');
                                                setDateFrom(v);
                                                if (dateTo && v > dateTo) setDateTo(v);
                                            }}
                                        />
                                        <ArrowRight size={14} className="mx-auto shrink-0 text-slate-500 sm:mx-0.5" />
                                        <LocalizedDateInput
                                            label={t('dateToSanagacha')}
                                            value={dateTo}
                                            minDate={dateFrom || undefined}
                                            minWidth={132}
                                            onChange={(v) => {
                                                setPreset('today');
                                                setDateTo(v);
                                                if (dateFrom && v < dateFrom) setDateFrom(v);
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 rounded-lg border border-slate-700 sm:col-start-1 sm:row-start-2 sm:grid-cols-4">
                                    {(
                                        [
                                            { key: 'today' as const, labelKey: 'fuelPresetToday' as const },
                                            { key: 'yesterday' as const, labelKey: 'fuelPresetYesterday' as const },
                                            { key: 'week' as const, labelKey: 'fuelPresetWeek' as const },
                                            { key: 'month' as const, labelKey: 'fuelPresetMonth' as const },
                                        ] as const
                                    ).map((item) => {
                                        const active = preset === item.key;
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => applyPreset(item.key)}
                                                className={`flex min-h-10 items-center justify-center border-r border-slate-700 px-1 py-2.5 text-[11px] font-semibold uppercase leading-snug tracking-wide last:border-r-0 sm:min-h-11 sm:px-2 sm:text-xs ${active ? 'fuel-preset-active bg-blue-500/25 text-blue-200' : 'bg-slate-900/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                                                    }`}
                                            >
                                                {t(item.labelKey)}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="relative min-w-0 sm:col-start-2 sm:row-start-1 sm:self-end">
                                    <select
                                        aria-label={t('fuelAriaFilterByPost')}
                                        value={selectedStation}
                                        onChange={(event) => setSelectedStation(event.target.value)}
                                        className="h-10 w-full appearance-none rounded-lg border border-slate-700 bg-slate-900/60 px-3 pr-9 text-sm text-slate-200 outline-none focus:border-blue-500 sm:h-11 sm:px-4 sm:pr-10 sm:text-base"
                                    >
                                        <option value="all">{t('fuelAllPosts')}</option>
                                        {stations.map((station) => (
                                            <option key={station.name} value={station.name}>{station.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 sm:right-3" />
                                </div>
                                <div className="flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-2 text-center text-base font-bold text-blue-400 sm:col-start-2 sm:row-start-2 sm:self-stretch sm:text-lg md:text-xl">
                                    {t('fuelTotalPrefix')} {formatLitersInt(totalLitersDisplay, numLocale)} {t('fuelUnitL')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                            <span className="text-red-400">{error}</span>
                        </div>
                    )}

                    <div className="mt-5 h-[200px] w-full rounded-xl border border-slate-700/50 bg-slate-900/40 p-1.5 sm:h-[240px] sm:p-2 md:h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                                <CartesianGrid stroke="rgba(148,163,184,0.2)" />
                                <XAxis
                                    dataKey="day"
                                    stroke="#94a3b8"
                                    tick={{ fontSize: 10 }}
                                    angle={chartData.length > 12 ? -40 : 0}
                                    textAnchor={chartData.length > 12 ? 'end' : 'middle'}
                                    height={chartData.length > 12 ? 56 : 28}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    stroke="#94a3b8"
                                    tick={{ fontSize: 11 }}
                                    width={40}
                                    unit={t('fuelYAxisLiter')}
                                    domain={['auto', chartYAxisMax]}
                                    ticks={chartYAxisTicks}
                                    allowDecimals={false}
                                />
                                {/* custom dark tooltip to match Probeg chart tooltip */}
                                {(() => {
                                    const FuelTooltip = (props: any) => {
                                        const { active, payload, label, coordinate } = props;
                                        const tooltipRef = useRef<HTMLDivElement | null>(null);
                                        useEffect(() => {
                                            if (!tooltipRef.current) return;
                                            if (!active || !coordinate) {
                                                tooltipRef.current.style.visibility = 'hidden';
                                                return;
                                            }
                                            const left = Math.max(8, Math.round(coordinate.x));
                                            const top = Math.max(8, Math.round(coordinate.y) - 64);
                                            tooltipRef.current.style.left = `${left}px`;
                                            tooltipRef.current.style.top = `${top}px`;
                                            tooltipRef.current.style.visibility = 'visible';
                                        }, [active, coordinate]);
                                        if (!active || !payload || !payload.length) return <div ref={tooltipRef} className="fuel-tooltip-pos" />;
                                        const entry = payload[0];
                                        const value = typeof entry.value === 'number' ? entry.value : Number(entry.value || 0);
                                        const color = entry.color || '#2563eb';
                                        return (
                                            <div ref={tooltipRef} className="fuel-tooltip-pos absolute z-50 pointer-events-none">
                                                <div className="rounded-md border border-slate-700 bg-slate-900/90 p-3 text-sm text-slate-100 shadow-lg min-w-[180px]">
                                                    <div className="mb-2 flex items-center gap-2">
                                                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={color} /></svg>
                                                        <div className="text-xs text-slate-300">{label}</div>
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-100">{t('fuelChartSeriesIssued')}</div>
                                                    <div className="mt-2 text-lg font-black text-white">{Number.isFinite(value) ? value.toLocaleString(numLocale, { maximumFractionDigits: 2 }) : '---'}{t('fuelYAxisLiter')}</div>
                                                </div>
                                            </div>
                                        );
                                    };

                                    return <>
                                        <style>{`
                                        /* Center text only inside fuel tooltip */
                                        .fuel-tooltip-pos > div { text-align: center; }
                                        .fuel-tooltip-pos > div > .mb-2 { display: flex; justify-content: center; align-items: center; gap: 0.5rem; }
                                        .fuel-tooltip-pos svg { margin-right: 0; }
                                    `}</style>
                                        <Tooltip content={(props) => <FuelTooltip {...props} />} />
                                    </>;
                                })()}
                                <Area
                                    isAnimationActive={false}
                                    type="monotoneX"
                                    dataKey="consumption"
                                    name={t('fuelChartSeriesIssued')}
                                    stroke="#2563eb"
                                    fill="#3b82f6"
                                    fillOpacity={0.2}
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#60a5fa', stroke: '#1e3a8a', strokeWidth: 1 }}
                                    activeDot={{ r: 4 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* 'Seksiya darajasi grafigi' removed as requested */}

            {showReports && (
                <div className="glass-panel rounded-2xl border border-slate-700/50 overflow-hidden">
                    <div className="flex min-h-[96px] flex-col gap-4 border-b border-slate-700/50 bg-slate-800/20 px-5 py-5 sm:px-6 sm:py-6 xl:flex-row xl:items-center xl:justify-between">
                        <FuelPanelGradientHeading className="min-w-0 max-w-full flex-1 xl:min-w-[520px]">{t('fuelReportsTitle')}</FuelPanelGradientHeading>
                        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
                            <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
                                <LocalizedDateInput
                                    label={t('dateFromSanadan')}
                                    value={operationsDateFrom}
                                    maxDate={operationsDateTo || undefined}
                                    onChange={(v) => {
                                        setOperationsDateFrom(v);
                                        if (v && operationsDateTo && v > operationsDateTo) setOperationsDateTo(v);
                                    }}
                                    minWidth={152}
                                />
                                <LocalizedDateInput
                                    label={t('dateToSanagacha')}
                                    value={operationsDateTo}
                                    minDate={operationsDateFrom || undefined}
                                    onChange={(v) => {
                                        setOperationsDateTo(v);
                                        if (v && operationsDateFrom && v < operationsDateFrom) setOperationsDateFrom(v);
                                    }}
                                    minWidth={152}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleOperationsExportXls()}
                                disabled={operationsTotalRows === 0 || operationsExportingXls || operationsExportingPdf}
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                            >
                                <Table2 size={16} />
                                {operationsExportingXls ? t('exportingXls') : t('exportXls')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleOperationsExportPdf()}
                                disabled={operationsTotalRows === 0 || operationsExportingPdf || operationsExportingXls}
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                            >
                                <FileText size={16} />
                                {operationsExportingPdf ? t('exportingPdf') : t('exportPdf')}
                            </button>
                        </div>
                    </div>
                    <div className="border-b border-slate-700/45 bg-slate-950/15 px-5 py-3 sm:px-6">
                        <div className="flex flex-col gap-2 text-sm text-slate-200 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                                <p className="text-sm text-slate-300">
                                    <span className="font-bold text-slate-100">{t('fuelOpsSummaryTitle')}</span>{' '}
                                    <span className="tabular-nums">{operationsSummaryPeriod}</span>
                                </p>
                                <div className="mt-2 grid max-w-5xl grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[minmax(220px,1fr)_minmax(120px,220px)]">
                                    <span className="text-slate-300">{t('fuelOpsCounterIssued')}</span>
                                    <strong className="text-left text-base font-bold tabular-nums text-slate-100 sm:text-center">
                                        {formatLiters(operationsTotalLiters, numLocale)}
                                    </strong>
                                </div>
                            </div>
                            <span className="inline-flex min-h-9 w-full min-w-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-center text-xs font-semibold text-slate-100 shadow-sm sm:w-auto sm:text-sm">
                                {t('fuelReportsTodayCount')}{' '}
                                <span className="ml-1.5 tabular-nums text-cyan-200">{todayRecordsCount}</span>
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] dark-scrollbar">
                        <table className="w-full min-w-[1080px] text-left text-xs sm:text-sm">
                            <thead>
                                <tr className="bg-slate-900/45 text-[10px] uppercase tracking-[0.06em] text-slate-400 sm:text-[11px]">
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColStartTime')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColCardNumber')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColCardName')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColGroup')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColPost')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColSection')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColStartDut')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColEndDut')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelOpsColIssued')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/35">
                                {operationsRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-3 py-6 text-center text-xs text-slate-500 sm:py-7 sm:text-sm">
                                            {t('dataNotFound')}
                                        </td>
                                    </tr>
                                ) : (
                                    operationsRows.map((row, index) => (
                                        <tr key={row.id} className={`text-xs text-slate-200 transition-colors hover:bg-slate-800/35 sm:text-sm ${index % 2 === 0 ? 'bg-transparent' : 'bg-slate-900/10'}`}>
                                            <td className="whitespace-nowrap px-2 py-1.5 text-slate-300 sm:px-3 sm:py-2">{formatDateTime(row.time)}</td>
                                            <td className="px-2 py-1.5 text-slate-300 sm:px-3 sm:py-2">{row.cardNumber || row.cardId || '-'}</td>
                                            <td className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">{row.cardName || row.vehicle || '-'}</td>
                                            <td className="px-2 py-1.5 text-slate-300 sm:px-3 sm:py-2">{row.groupName || '-'}</td>
                                            <td className="px-2 py-1.5 sm:px-3 sm:py-2">{row.station || '-'}</td>
                                            <td className="px-2 py-1.5 text-slate-300 sm:px-3 sm:py-2">{row.fuelSectionName || '-'}</td>
                                            <td className="px-2 py-1.5 text-slate-300 sm:px-3 sm:py-2">
                                                {row.levelStartDut != null ? formatLiters(row.levelStartDut, numLocale) : '-'}
                                            </td>
                                            <td className="px-2 py-1.5 text-slate-300 sm:px-3 sm:py-2">
                                                {row.levelEndDut != null ? formatLiters(row.levelEndDut, numLocale) : '-'}
                                            </td>
                                            <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                                                <span className="inline-flex items-center rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-blue-300 sm:px-2 sm:text-xs">
                                                    {formatLiters(row.issuedValue ?? row.liters, numLocale)} {t('fuelUnitL')}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="table-pagination-bar border-t border-slate-700/50 bg-slate-900/30 px-3 py-2.5 md:px-4">
                        <div className="flex flex-col items-center gap-2 text-center md:flex-row md:items-center md:justify-between md:text-left">
                            <p className="w-full text-xs text-slate-400 tabular-nums sm:text-sm md:w-auto">
                                {operationsTotalRows === 0
                                    ? '0 / 0'
                                    : `${(operationsPage - 1) * operationsRowsPerPage + 1}-${Math.min(operationsPage * operationsRowsPerPage, operationsTotalRows)} / ${operationsTotalRows}`}
                            </p>
                            <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-1.5 sm:gap-2 md:w-auto md:max-w-none md:justify-end">
                                <label className="text-xs text-slate-400 sm:text-sm" htmlFor="fuel-ops-rows-per-page">
                                    {t('rowsPerPage')}:
                                </label>
                                <select
                                    id="fuel-ops-rows-per-page"
                                    aria-label="Har sahifadagi yozuvlar soni"
                                    value={operationsRowsPerPage}
                                    onChange={(event) => {
                                        const value = Math.max(1, Number.parseInt(event.target.value, 10) || 15);
                                        setOperationsRowsPerPage(value);
                                    }}
                                    className="rounded-md border border-slate-700/70 bg-slate-900/70 px-1.5 py-1 text-xs text-slate-200 outline-none focus:border-blue-500/60 sm:px-2 sm:py-1.5 sm:text-sm"
                                >
                                    <option value={15}>15</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setOperationsPage((prev) => Math.max(1, prev - 1))}
                                    disabled={operationsPage <= 1}
                                    className="rounded-md border border-slate-700/70 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-sm"
                                >
                                    {t('previous')}
                                </button>
                                <span className="min-w-[72px] text-center text-xs text-slate-300 sm:min-w-[80px] sm:text-sm">
                                    {operationsPage} / {operationsTotalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setOperationsPage((prev) => Math.min(operationsTotalPages, prev + 1))}
                                    disabled={operationsPage >= operationsTotalPages}
                                    className="rounded-md border border-slate-700/70 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-sm"
                                >
                                    {t('next')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

