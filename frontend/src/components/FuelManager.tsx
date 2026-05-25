import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
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
    type LucideIcon,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { useI18n, numberLocaleFor, uz } from '../i18n';
import { LocalizedDateInput } from './LocalizedDateInput';

type FuelSummaryResponse = {
    health?: {
        status?: 'online' | 'offline' | 'disabled' | string;
        lastSyncAt?: string | null;
    };
    window?: {
        records?: number;
        totalLiters?: number;
        /** AZS "РС‚РѕРіРѕ" butun liter bilan moslashish */
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

/** AZS yuqori menyu вЂ” Р“Р»Р°РІРЅР°СЏ / РћС‚С‡РµС‚С‹ faqat to'liq kontent */
type FuelNavTab = 'main' | 'reports' | 'objects' | 'fuelCards' | 'reservoirs';

const FUEL_NAV_ITEMS: ReadonlyArray<{ id: FuelNavTab; labelKey: keyof typeof uz; icon: LucideIcon }> = [
    { id: 'main', labelKey: 'fuelNavMain', icon: LayoutGrid },
    { id: 'reports', labelKey: 'fuelNavReports', icon: FileText },
    { id: 'objects', labelKey: 'fuelNavObjects', icon: Fuel },
    { id: 'fuelCards', labelKey: 'fuelNavFuelCards', icon: Users },
    { id: 'reservoirs', labelKey: 'fuelNavReservoirs', icon: Database },
];

const API_BASE = resolveApiBaseUrl();

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

/** Gradient matn вЂ” glass-panel + overflow muhitida ham ishonchli (WebKit clip) */
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

const formatLiters = (value: number | null | undefined, locale: string) => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return '0';
    return numeric.toLocaleString(locale, { maximumFractionDigits: 2 });
};

/** AZS "РС‚РѕРіРѕ: вЂ¦ Р»" вЂ” odatda butun liter */
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

/** AZS В«РћР±СЉРµРј, Р»В» вЂ” 3 xona qoldiq */
const formatVolumeAzs = (value: number | null | undefined, locale: string) => {
    if (value == null || !Number.isFinite(Number(value))) return 'вЂ”';
    return Number(value).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const clampPct = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return null;
    return Math.min(100, Math.max(0, value));
};

const formatPctAzs = (value: number | null | undefined, locale: string) => {
    const p = clampPct(value);
    if (p == null) return 'вЂ”';
    return `${p.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

/** Rezervuar foizlari вЂ” tekis (3D gradient / ichki soyasiz) */
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

    return (
        <div className={`relative ${h} ${minW} w-full ${trackCls}`}>
            <div
                className={`absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-[width] duration-200 ease-out w-[${wInt}%]`}
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
    if (value == null || !Number.isFinite(Number(value))) return 'вЂ”';
    return Number(value).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const formatTempAzs = (value: number | null | undefined, locale: string) => {
    if (value == null || !Number.isFinite(Number(value))) return 'вЂ”';
    return Number(value).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const ReservoirPctCell = ({ value, numberLocale }: { value: number | null | undefined; numberLocale: string }) => (
    <AzsReservoirLevelBar fillPercent={value} text={formatPctAzs(value, numberLocale)} size="md" />
);

/** Ichki jadval вЂ” AZS В«РќР° СЃРІСЏР·Рё : N,N%В» (onlayn) / aloqa yoвЂq (oflayn) */
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
    /** AZS matni: В«РќР° СЃРІСЏР·Рё : 58,1%В» вЂ” ikki nuqta atrofida bo'shliq */
    const label = isOnline ? `${connectedLabel} : ${formatPctAzs(percent, numberLocale)}` : `${disconnectedLabel}: вЂ”`;
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

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: toDateInput(startOfMonth), dateTo: toDateInput(today) };
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
    const [levelPreset, setLevelPreset] = useState<RangePreset>('today');
    const [sectionLevelSummary, setSectionLevelSummary] = useState<FuelSummaryResponse | null>(null);
    const [fuelNavTab, setFuelNavTab] = useState<FuelNavTab>('main');
    const [summary, setSummary] = useState<FuelSummaryResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [operationsPage, setOperationsPage] = useState(1);
    const [operationsRowsPerPage, setOperationsRowsPerPage] = useState(10);
    const [todayRecordsCount, setTodayRecordsCount] = useState(0);
    const [operationsRows, setOperationsRows] = useState<FuelOperationsResponse['items']>([]);
    const [operationsTotalRows, setOperationsTotalRows] = useState(0);
    const [operationsTotalPages, setOperationsTotalPages] = useState(1);
    const [azsObjects, setAzsObjects] = useState<AzsListPayload<AzsObjectRow> | null>(null);
    const [azsReservoirs, setAzsReservoirs] = useState<AzsListPayload<AzsReservoirRow> | null>(null);
    const [expandedObjectIds, setExpandedObjectIds] = useState<Set<string>>(() => new Set());
    const [expandedReservoirIds, setExpandedReservoirIds] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        if (fuelNavTab !== 'objects') return;
        let active = true;
        const load = async () => {
            try {
                const response = await fetch(`${API_BASE}/integrations/fuel/azs/objects`);
                const payload = (await response.json().catch(() => null)) as AzsListPayload<AzsObjectRow> | null;
                if (!active) return;
                setAzsObjects(
                    payload && Array.isArray(payload.items)
                        ? payload
                        : { items: [], total: 0, fetchedAt: new Date().toISOString() },
                );
            } catch {
                if (active) setAzsObjects({ items: [], total: 0, error: 'fetch_failed', fetchedAt: new Date().toISOString() });
            }
        };
        void load();
        const interval = setInterval(() => void load(), 12_000);
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
        const load = async () => {
            try {
                const response = await fetch(`${API_BASE}/integrations/fuel/azs/reservoirs`);
                const payload = (await response.json().catch(() => null)) as AzsListPayload<AzsReservoirRow> | null;
                if (!active) return;
                setAzsReservoirs(
                    payload && Array.isArray(payload.items)
                        ? payload
                        : { items: [], total: 0, fetchedAt: new Date().toISOString() },
                );
            } catch {
                if (active) setAzsReservoirs({ items: [], total: 0, error: 'fetch_failed', fetchedAt: new Date().toISOString() });
            }
        };
        void load();
        /** Rezervuarlar вЂ” AZS bilan yaqin real-time (server keshi ~3s) */
        const interval = setInterval(() => void load(), 5_000);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [fuelNavTab]);

    useEffect(() => {
        let active = true;

        const loadSummary = async () => {
            try {
                const params = new URLSearchParams();
                if (dateFrom) params.set('dateFrom', dateFrom);
                if (dateTo) params.set('dateTo', dateTo);
                if (selectedStation !== 'all') params.set('station', selectedStation);
                params.set('recentLimit', '1000');

                const response = await fetch(`${API_BASE}/integrations/fuel/azs/summary?${params.toString()}`);
                if (!response.ok) throw new Error('fuel_summary_failed');
                const payload = await response.json();
                if (!active) return;
                setSummary(payload as FuelSummaryResponse);
                setError(null);
            } catch {
                if (active) setError("Yoqilg'i integratsiyasi bilan aloqa yo'q");
            }
        };

        const loadTodayCount = async () => {
            try {
                const params = new URLSearchParams();
                const todayAzs = azsCalendarYmdToday();
                params.set('dateFrom', todayAzs);
                params.set('dateTo', todayAzs);
                if (selectedStation !== 'all') params.set('station', selectedStation);
                params.set('recentLimit', '1');

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
                const params = new URLSearchParams();
                params.set('page', String(operationsPage));
                params.set('pageSize', String(operationsRowsPerPage));
                if (dateFrom) params.set('dateFrom', dateFrom);
                if (dateTo) params.set('dateTo', dateTo);
                if (selectedStation !== 'all') params.set('station', selectedStation);

                const response = await fetch(`${API_BASE}/integrations/fuel/azs/operations?${params.toString()}`);
                if (!response.ok) throw new Error('fuel_operations_failed');
                const payload = (await response.json()) as FuelOperationsResponse;
                if (!active) return;

                setOperationsRows(Array.isArray(payload?.items) ? payload.items : []);
                const total = Number(payload?.pagination?.total ?? 0);
                const totalPages = Number(payload?.pagination?.totalPages ?? 1);
                setOperationsTotalRows(Number.isFinite(total) ? total : 0);
                setOperationsTotalPages(Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1);
            } catch {
                if (!active) return;
                setOperationsRows([]);
                setOperationsTotalRows(0);
                setOperationsTotalPages(1);
            }
        };

        void loadSummary();
        void loadTodayCount();
        void loadOperations();
        const interval = setInterval(() => {
            void loadSummary();
            void loadTodayCount();
            void loadOperations();
        }, 5000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [dateFrom, dateTo, selectedStation, operationsPage, operationsRowsPerPage]);

    useEffect(() => {
        if (fuelNavTab !== 'main') return;
        let active = true;
        const loadSectionLevel = async () => {
            try {
                const params = new URLSearchParams();
                if (levelDateFrom) params.set('dateFrom', levelDateFrom);
                if (levelDateTo) params.set('dateTo', levelDateTo);
                if (selectedStation !== 'all') params.set('station', selectedStation);
                if (levelSelectedSection !== 'all') params.set('section', levelSelectedSection);
                params.set('recentLimit', '10');

                const response = await fetch(`${API_BASE}/integrations/fuel/azs/summary?${params.toString()}`);
                if (!response.ok) throw new Error('fuel_section_level_failed');
                const payload = (await response.json()) as FuelSummaryResponse;
                if (!active) return;
                setSectionLevelSummary(payload);
            } catch {
                if (active) setSectionLevelSummary(null);
            }
        };
        void loadSectionLevel();
        const interval = setInterval(() => void loadSectionLevel(), 5000);
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
        for (const name of sectionLevelSummary?.stats?.azsSectionNames ?? []) {
            const n = String(name ?? '').trim();
            if (n) merged.add(n);
        }
        for (const name of summary?.stats?.azsSectionNames ?? []) {
            const n = String(name ?? '').trim();
            if (n) merged.add(n);
        }
        if (merged.size === 0) {
            for (const row of sectionLevelSummary?.sections ?? []) {
                const name = String(row?.name ?? '').trim();
                if (name) merged.add(name);
            }
            for (const row of summary?.sections ?? []) {
                const name = String(row?.name ?? '').trim();
                if (name) merged.add(name);
            }
        }
        return Array.from(merged).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [summary, sectionLevelSummary]);

    const levelSectionSelectOptions = useMemo(() => {
        let list = levelSectionOptions;
        if (levelSelectedSection !== 'all' && !list.includes(levelSelectedSection)) {
            list = [levelSelectedSection, ...list];
        }
        return list;
    }, [levelSectionOptions, levelSelectedSection]);

    const chartData = useMemo(() => summary?.chart ?? [], [summary]);
    const levelChartData = useMemo(() => sectionLevelSummary?.levelChart ?? [], [sectionLevelSummary]);
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
    }, [dateFrom, dateTo, selectedStation, operationsRowsPerPage]);

    useEffect(() => {
        if (operationsPage > operationsTotalPages) {
            setOperationsPage(operationsTotalPages);
        }
    }, [operationsPage, operationsTotalPages]);

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
    const showFuelCardsStub = fuelNavTab === 'fuelCards';
    const showObjectsPanel = fuelNavTab === 'objects';
    const showReservoirsPanel = fuelNavTab === 'reservoirs';

    return (
        <div className="min-w-0 space-y-4 sm:space-y-6">
            {/* AZS uslubidagi yuqori navigatsiya вЂ” mobil: gorizontal scroll, desktop: teng kenglik */}
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
                                className={`flex min-h-[3.25rem] min-w-[4.5rem] max-w-[7.5rem] flex-shrink-0 flex-col items-center justify-center gap-1 border-b-[3px] px-1.5 py-2.5 text-center text-[10px] font-medium leading-tight transition-colors sm:min-h-[3.75rem] sm:min-w-[5rem] sm:max-w-[9rem] sm:gap-1.5 sm:px-2 sm:py-3 sm:text-xs md:max-w-none md:min-h-[4rem] md:min-w-0 md:flex-1 md:basis-0 md:gap-1.5 md:px-3 md:py-4 md:text-sm lg:text-base xl:text-lg ${
                                    active
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

            {showFuelCardsStub && (
                <div className="glass-panel rounded-2xl border border-slate-700/50 p-8 text-center text-slate-400">
                    <p className="mx-auto max-w-xl text-sm leading-relaxed sm:text-base">{t('fuelNavStubHint')}</p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={() => setFuelNavTab('main')}
                            className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/25 sm:text-base"
                        >
                            {t('fuelNavMain')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setFuelNavTab('reports')}
                            className="rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/80 sm:text-base"
                        >
                            {t('fuelNavReports')}
                        </button>
                    </div>
                </div>
            )}

            {showObjectsPanel && (
                <div className="glass-panel rounded-2xl border border-slate-700/50">
                    <div className="flex flex-col gap-1.5 border-b border-slate-700/40 px-3 py-2.5 md:px-4">
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
                                                            className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs ${
                                                                row.isOnline
                                                                    ? 'bg-emerald-500/15 text-emerald-400'
                                                                    : 'bg-slate-600/40 text-slate-400'
                                                            }`}
                                                        >
                                                            {row.isOnline ? t('fuelObjectsOnline') : t('fuelObjectsOffline')}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-300 sm:px-3 sm:py-2">
                                                        {row.lastSyncAt ? formatDateTime(row.lastSyncAt) : 'вЂ”'}
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
                    <div className="flex flex-col gap-1.5 border-b border-slate-700/40 px-3 py-2.5 md:px-4">
                        <FuelPanelGradientHeading>{t('fuelReservoirsTitle')}</FuelPanelGradientHeading>
                    </div>
                    <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] dark-scrollbar">
                        <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
                            <thead>
                                <tr className="border-b border-slate-700/50 bg-slate-900/50 text-[10px] uppercase tracking-wide text-slate-400 sm:text-xs">
                                    <th className="w-8 px-1 py-1.5 sm:w-9 sm:px-2 sm:py-2" aria-hidden />
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelObjectsColNo')}</th>
                                    <th className="px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelResColReservoirName')}</th>
                                    <th className="min-w-[7rem] whitespace-nowrap px-2 py-1.5 font-semibold sm:px-3 sm:py-2">{t('fuelResColVolume')}</th>
                                    <th className="min-w-[9rem] px-2 py-1.5 font-semibold sm:min-w-[10rem] sm:px-3 sm:py-2">{t('fuelResColLevelCalcPct')}</th>
                                    <th className="min-w-[9rem] px-2 py-1.5 font-semibold sm:min-w-[10rem] sm:px-3 sm:py-2">{t('fuelResColLevelPct')}</th>
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
                                                    className={`text-slate-200 transition-colors hover:bg-slate-800/30 ${
                                                        hasChildren ? 'cursor-pointer' : ''
                                                    } ${open ? 'bg-blue-500/10' : ''} ${
                                                        index % 2 === 0 ? 'bg-slate-900/25' : 'bg-slate-800/15'
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
                                                                                    {ch.lastSyncAt ? formatDateTime(ch.lastSyncAt) : 'вЂ”'}
                                                                                </td>
                                                                                <td className="px-2 py-1 text-slate-300 sm:px-2.5 sm:py-1.5">{ch.fuelTypeName || 'вЂ”'}</td>
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

            {/* 4 ta info card вЂ” AZS В«Р“Р»Р°РІРЅР°СЏВ» */}
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
                            <span className="font-semibold text-emerald-400">{devicesOnline}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400">{t('fuelDashColumnsOffline')}</span>
                            <span className={`font-semibold ${devicesOffline > 0 ? 'text-red-400' : 'text-slate-500'}`}>{devicesOffline}</span>
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
                            <span className="font-semibold text-red-400">{secCritical}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-400">
                                <span className="h-2 w-2 rounded-full bg-amber-400" />
                                {t('fuelDashLowShort')}
                            </span>
                            <span className="font-semibold text-amber-400">{secLow}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-400">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                {t('fuelDashNormalShort')}
                            </span>
                            <span className="font-semibold text-emerald-400">{secNormal}</span>
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
                            <span className="font-semibold text-emerald-400">{cardsSynced}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400">{t('fuelDashCardsUnsynced')}</span>
                            <span className="font-semibold text-slate-500">{cardsUnsynced}</span>
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
                {/* Sarlavha chapda, filtrlar qator oxirida (oвЂngda) */}
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
                                            className={`flex min-h-10 items-center justify-center border-r border-slate-700 px-1 py-2.5 text-[11px] font-semibold uppercase leading-snug tracking-wide last:border-r-0 sm:min-h-11 sm:px-2 sm:text-xs ${
                                                active ? 'fuel-preset-active bg-blue-500/25 text-blue-200' : 'bg-slate-900/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
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
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis
                                dataKey="day"
                                stroke="#94a3b8"
                                tick={{ fontSize: 10 }}
                                angle={chartData.length > 12 ? -40 : 0}
                                textAnchor={chartData.length > 12 ? 'end' : 'middle'}
                                height={chartData.length > 12 ? 56 : 28}
                                interval="preserveStartEnd"
                            />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} width={40} unit={t('fuelYAxisLiter')} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '10px',
                                    color: '#e2e8f0',
                                }}
                                formatter={(value) => {
                                    const n = typeof value === 'number' ? value : Number(value);
                                    const issued = t('fuelChartSeriesIssued');
                                    if (value == null || Number.isNaN(n)) return ['вЂ”', issued];
                                    return [`${n.toLocaleString(numLocale, { maximumFractionDigits: 2 })}${t('fuelYAxisLiter')}`, issued];
                                }}
                            />
                            <Area
                                isAnimationActive={false}
                                type="monotone"
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

            {showMainDashboard && (
            <div className="glass-panel overflow-hidden rounded-2xl border border-slate-700/50 p-4 md:p-5">
                <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                    <div className="min-w-0 shrink-0 lg:max-w-[min(100%,32rem)] lg:pr-2">
                        <FuelPanelGradientHeading>
                            {t('fuelChartSectionLevelTitle')}
                        </FuelPanelGradientHeading>
                    </div>
                    <div className="w-full min-w-0 shrink-0 sm:max-w-2xl lg:w-auto lg:max-w-[min(100%,48rem)]">
                        <div className="grid grid-cols-1 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(12.5rem,15rem)] sm:gap-x-3 sm:gap-y-2">
                            <div className="relative min-w-0 sm:col-start-1 sm:row-start-1">
                                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                                    <LocalizedDateInput
                                        label={t('dateFromSanadan')}
                                        value={levelDateFrom}
                                        maxDate={levelDateTo || undefined}
                                        minWidth={132}
                                        onChange={(v) => {
                                            setLevelPreset('today');
                                            setLevelDateFrom(v);
                                            if (levelDateTo && v > levelDateTo) setLevelDateTo(v);
                                        }}
                                    />
                                    <ArrowRight size={14} className="mx-auto shrink-0 text-slate-500 sm:mx-0.5" />
                                    <LocalizedDateInput
                                        label={t('dateToSanagacha')}
                                        value={levelDateTo}
                                        minDate={levelDateFrom || undefined}
                                        minWidth={132}
                                        onChange={(v) => {
                                            setLevelPreset('today');
                                            setLevelDateTo(v);
                                            if (levelDateFrom && v < levelDateFrom) setLevelDateFrom(v);
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-700 sm:col-start-1 sm:row-start-2 sm:grid-cols-4">
                                {(
                                    [
                                        { key: 'today' as const, labelKey: 'fuelPresetToday' as const },
                                        { key: 'yesterday' as const, labelKey: 'fuelPresetYesterday' as const },
                                        { key: 'week' as const, labelKey: 'fuelPresetWeek' as const },
                                        { key: 'month' as const, labelKey: 'fuelPresetMonth' as const },
                                    ] as const
                                ).map((item) => {
                                    const active = levelPreset === item.key;
                                    return (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => applyLevelPreset(item.key)}
                                            className={`flex min-h-10 items-center justify-center border-r border-slate-700 px-1 py-2.5 text-[11px] font-semibold uppercase leading-snug tracking-wide last:border-r-0 sm:min-h-11 sm:px-2 sm:text-xs ${
                                                active ? 'fuel-preset-active bg-blue-500/25 text-blue-200' : 'bg-slate-900/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                                            }`}
                                        >
                                            {t(item.labelKey)}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="min-w-0 space-y-2 sm:col-start-2 sm:row-span-2 sm:row-start-1">
                                <div className="relative">
                                    <select
                                        aria-label={t('fuelAriaFilterBySection')}
                                        value={levelSelectedSection}
                                        onChange={(event) => setLevelSelectedSection(event.target.value)}
                                        className="h-10 w-full appearance-none rounded-lg border border-slate-700 bg-slate-900/60 px-3 pr-9 text-sm text-slate-200 outline-none focus:border-blue-500 sm:h-11 sm:px-4 sm:pr-10 sm:text-base"
                                    >
                                        <option value="all">{t('fuelAllSections')}</option>
                                        {levelSectionSelectOptions.map((name) => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 sm:right-3" />
                                </div>
                                <div className="flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-2 text-center text-base font-bold text-blue-400 sm:text-lg">
                                    {t('fuelTotalPrefix')}{' '}
                                    {levelJamiLiters == null
                                        ? '-'
                                        : levelJamiLiters.toLocaleString(numLocale, {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                          })}{' '}
                                    {t('fuelUnitL')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-5 h-[220px] w-full rounded-xl border border-slate-700/50 bg-slate-900/40 p-1.5 sm:h-[260px] sm:p-2 md:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={levelChartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis
                                dataKey="day"
                                stroke="#94a3b8"
                                tick={{ fontSize: 10 }}
                                angle={levelChartData.length > 12 ? -40 : 0}
                                textAnchor={levelChartData.length > 12 ? 'end' : 'middle'}
                                height={levelChartData.length > 12 ? 56 : 28}
                                interval="preserveStartEnd"
                            />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} width={40} unit={t('fuelYAxisLiter')} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '10px',
                                    color: '#e2e8f0',
                                }}
                                formatter={(value) => {
                                    const level = t('fuelChartSeriesLevel');
                                    if (value == null) return ['вЂ”', level];
                                    const n = typeof value === 'number' ? value : Number(value);
                                    if (Number.isNaN(n)) return ['вЂ”', level];
                                    return [
                                        `${n.toLocaleString(numLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${t('fuelYAxisLiter')}`,
                                        level,
                                    ];
                                }}
                            />
                            <Area
                                isAnimationActive={false}
                                type="monotone"
                                dataKey="level"
                                name={t('fuelChartSeriesLevel')}
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

            {showReports && (
            <div className="glass-panel rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="flex flex-col gap-2 border-b border-slate-700/40 px-3 py-2.5 md:flex-row md:items-center md:justify-between md:px-4">
                    <FuelPanelGradientHeading className="min-w-0 max-w-full">{t('fuelReportsTitle')}</FuelPanelGradientHeading>
                    <span className="inline-flex w-full min-w-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-center text-xs font-semibold text-slate-100 shadow-sm sm:text-sm md:w-fit md:justify-start md:text-left">
                        {t('fuelReportsTodayCount')}{' '}
                        <span className="ml-1.5 tabular-nums text-cyan-200">{todayRecordsCount}</span>
                    </span>
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
                                    const value = Math.max(10, Number.parseInt(event.target.value, 10) || 10);
                                    setOperationsRowsPerPage(value);
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

