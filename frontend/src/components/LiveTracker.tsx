import { useEffect, useMemo, useRef, useState } from 'react';
import { startTransition } from 'react';
import {
    ChevronDown,
    CircleDot,
    Fuel,
    Gauge,
    KeyRound,
    LayoutGrid,
    List,
    LocateFixed,
    MessageSquare,
    MoreVertical,
    Navigation,
    Pencil,
    Radio,
    RotateCw,
    Satellite,
    Search,
    Truck,
    X,
    type LucideIcon,
} from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { divIcon, latLngBounds, type Map as LeafletMap } from 'leaflet';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend as ChartLegend,
    Pie,
    Sector,
    PieChart,
    ResponsiveContainer,
    XAxis,
    YAxis,
} from 'recharts';
import { useI18n } from '../i18n';
import { resolveApiBaseUrl } from '../utils/apiBase';

import 'leaflet/dist/leaflet.css';
// (No local CSS variables needed here)
import isuzuPng from '../assets/icon/avtobus(isuzu).png';
import karaPng from '../assets/icon/kara.png';
import pogruzchikPng from '../assets/icon/pagruzchik.png';
import gazelPng from '../assets/icon/gazel.png';
import manPng from '../assets/icon/man.png';
import chakmanPng from '../assets/icon/man.png';
import sedanPng from '../assets/icon/sedan.png';
import traktorPng from '../assets/icon/traktor.png';
import ekskovatorPng from '../assets/icon/ekskovator.png';
import vodavozPng from '../assets/icon/vodavoz.png';

type VehicleState = 'moving' | 'stopped' | 'offline';
type VehicleKind = 'car' | 'truck' | 'forklift' | 'loader';

type TrackingVehicle = {
    id: number;
    name: string;
    imei: string | null;
    address: string;
    region: string;
    lat: number;
    lng: number;
    speed: number;
    direction: number | null;
    ignition: boolean | null;
    satellites: number | null;
    fuelLevel: number | null;
    status: VehicleState;
    kind: VehicleKind;
    lastMessageAt: string | null;
    syncedAt: string | null;
};

type VehicleMarkerCluster = {
    id: string;
    lat: number;
    lng: number;
    vehicles: TrackingVehicle[];
};

type GarvexVehicleApi = {
    unitId?: number;
    name?: string | null;
    objectCode?: string | null;
    status?: string | null;
    point?: {
        x?: number | null;
        y?: number | null;
        a?: string | null;
        speed?: number | null;
        dir?: number | null;
        ign?: boolean | null;
        sats?: number | null;
        fuelLevel?: number | null;
    } | null;
    lastMessageUnix?: number | null;
    lastMessageAt?: string | null;
    syncedAt?: string | null;
};

type GarvexVehiclesResponse = {
    count?: number;
    items?: GarvexVehicleApi[];
};

type GarvexHealthResponse = {
    enabled?: boolean;
    status?: string;
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
    permission?: {
        getUnit?: boolean;
    } | null;
    stats?: {
        mode?: string;
        fetched?: number;
        upserted?: number;
        pages?: number;
    } | null;
};

type GarvexDashboardRouteStat = {
    unitId?: number | null;
    name: string;
    mileage: number;
    avgSpeed: number;
    spentFuel: number;
    spentAbsoluteFuel: number;
    refueled: number;
    drained: number;
    refuelCount: number;
    drainCount: number;
    moveTime: number;
    parkTime: number;
    stopTime: number;
    stopCount: number;
    parkCount: number;
    motoHours: number;
    engineIdle: number;
};

type GarvexDashboardResponse = {
    source?: string;
    generatedAt?: string;
    reportError?: string | null;
    period?: {
        startIso?: string;
        endIso?: string;
    };
    connection?: {
        total?: number;
        online?: number;
        offline?: number;
        noData?: number;
    };
    movement?: {
        total?: number;
        moving?: number;
        parking?: number;
        offline?: number;
    };
    mileage?: {
        total?: number;
        averageSpeed?: number;
        objectCount?: number;
        top?: GarvexDashboardRouteStat[];
        items?: GarvexDashboardRouteStat[];
        chart?: {
            series?: Array<{
                key: string;
                name: string;
            }>;
            buckets?: Array<{
                label: string;
                startIso?: string;
                endIso?: string;
                values?: Record<string, number>;
            }>;
        };
    };
    fuel?: {
        refueled?: number;
        drained?: number;
        total?: number;
        refuelCount?: number;
        drainCount?: number;
    };
    current?: {
        fuelKnown?: number;
        latestSyncAt?: string | null;
    };
};

type LiveTrackerProps = {
    lang?: string;
    dashboardOnly?: boolean;
};

type TrackingNavTab = 'dashboard' | 'monitoring';
type TrackingStatusFilter = VehicleState | 'all';

const TRACKING_NAV_ITEMS: ReadonlyArray<{ id: TrackingNavTab; label: string; icon: LucideIcon }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'monitoring', label: 'GPS Monitoring', icon: Navigation },
];

const API_BASE = resolveApiBaseUrl();
const LIVE_AFTER_MS = 15 * 60 * 1000;
const SYNC_INTERVAL_MS = 15_000;
const HEALTH_REFRESH_MS = 60_000;
const SYNC_TRIGGER_MS = 45_000;
const DASHBOARD_REFRESH_MS = 60_000;
const MAP_FALLBACK_CENTER: [number, number] = [38.34, 66.44];
const DASHBOARD_COLORS = {
    green: '#4caf50',
    blue: '#2d9bf0',
    red: '#f44336',
    gray: '#9ca3af',
};
// card background color used as segment border to create a dark gap between slices
const CARD_BG_COLOR = '#1e2330';
const DASHBOARD_BAR_COLORS = ['#174ea6', '#1f67c2', '#287bd4', '#2f8ee6', '#35a4f5'];
// Tooltip styles were previously defined here but are unused because we render a custom floating tooltip.
// NOTE: using custom floating tooltips for single-bar hover. Recharts global Tooltip removed for clarity.

type DashboardPreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
const GARVEX_DASHBOARD_TZ_OFFSET_MINUTES = 180;

const padDatePart = (value: number) => String(value).padStart(2, '0');
const formatDashboardDate = (date: Date) =>
    `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;

const formatLongDate = (date: Date) => {
    const d = date.getUTCDate();
    const m = date.getUTCMonth() + 1;
    const y = date.getUTCFullYear();
    return `${padDatePart(d)}.${padDatePart(m)}.${y}`;
};

const getDashboardRange = (preset: DashboardPreset) => {
    const shiftedNow = new Date(Date.now() + GARVEX_DASHBOARD_TZ_OFFSET_MINUTES * 60_000);
    const start = new Date(Date.UTC(
        shiftedNow.getUTCFullYear(),
        shiftedNow.getUTCMonth(),
        shiftedNow.getUTCDate(),
    ));
    const end = new Date(start);

    if (preset === 'yesterday') {
        start.setUTCDate(start.getUTCDate() - 1);
        end.setUTCDate(end.getUTCDate() - 1);
    } else if (preset === 'week') {
        start.setUTCDate(start.getUTCDate() - 6);
    } else if (preset === 'month') {
        start.setUTCMonth(start.getUTCMonth() - 1);
    }

    return {
        from: `${formatDashboardDate(start)}T00:00`,
        to: `${formatDashboardDate(end)}T23:59`,
    };
};

/*
const toDashboardDateDraft = (range: { from: string; to: string }) => ({
    from: range.from.slice(0, 10),
    to: range.to.slice(0, 10),
});
*/

const vehicleSvgByKind: Record<VehicleKind, string> = {
    car: `
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <ellipse cx="24" cy="39.5" rx="15" ry="3.8" fill="rgba(15,23,42,.16)"></ellipse>
            <path d="M16 9.5h16l4.5 9v17.2c0 2.1-1.7 3.8-3.8 3.8H15.3a3.8 3.8 0 0 1-3.8-3.8V18.5L16 9.5Z" fill="#f8fafc" stroke="#263849" stroke-width="2"></path>
            <path d="M18.2 12.7h11.6l2.7 6.1h-17l2.7-6.1Z" fill="#1f9d55"></path>
            <path d="M15.6 22h16.8v10.8H15.6V22Z" fill="#22c55e"></path>
            <path d="M16.5 34.7h15" stroke="#0f172a" stroke-width="2" stroke-linecap="round"></path>
            <rect x="9.4" y="19.4" width="4" height="9.2" rx="1.3" fill="#111827"></rect>
            <rect x="34.6" y="19.4" width="4" height="9.2" rx="1.3" fill="#111827"></rect>
            <path d="M19.5 15.3h9" stroke="#e0f2fe" stroke-width="2.4" stroke-linecap="round"></path>
        </svg>
    `,
    truck: `
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <ellipse cx="24" cy="40" rx="17" ry="4" fill="rgba(15,23,42,.16)"></ellipse>
            <rect x="10" y="12" width="28" height="25" rx="3.5" fill="#f8fafc" stroke="#263849" stroke-width="2"></rect>
            <path d="M14 16h20v13H14V16Z" fill="#16a34a"></path>
            <path d="M16.5 17.8h15" stroke="#dcfce7" stroke-width="1.6" stroke-linecap="round"></path>
            <path d="M16.5 22.2h15" stroke="#dcfce7" stroke-width="1.6" stroke-linecap="round"></path>
            <path d="M14 31.2h20v3.3H14v-3.3Z" fill="#111827"></path>
            <path d="M17.5 9.5h13L34 16H14l3.5-6.5Z" fill="#f1f5f9" stroke="#263849" stroke-width="2" stroke-linejoin="round"></path>
            <path d="M19.2 12.2h9.6" stroke="#38bdf8" stroke-width="2.3" stroke-linecap="round"></path>
            <rect x="6.6" y="18.6" width="4" height="11" rx="1.4" fill="#111827"></rect>
            <rect x="37.4" y="18.6" width="4" height="11" rx="1.4" fill="#111827"></rect>
        </svg>
    `,
    forklift: `
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <ellipse cx="24" cy="39.5" rx="16" ry="4" fill="rgba(15,23,42,.16)"></ellipse>
            <path d="M13 15h17.5c2.2 0 4 1.8 4 4v12.4c0 2.2-1.8 4-4 4H13a4 4 0 0 1-4-4V19c0-2.2 1.8-4 4-4Z" fill="#f97316" stroke="#263849" stroke-width="2"></path>
            <path d="M17 10.5h10.5L31.6 17H14.4L17 10.5Z" fill="#fff7ed" stroke="#263849" stroke-width="2" stroke-linejoin="round"></path>
            <path d="M18.2 13.4h8.2" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"></path>
            <path d="M13.2 23.2h15.6v7.5H13.2v-7.5Z" fill="#fed7aa"></path>
            <path d="M34.5 14.5h3.3v22h-3.3z" fill="#111827"></path>
            <path d="M37.8 34.8h6.2" stroke="#111827" stroke-width="3" stroke-linecap="round"></path>
            <rect x="6" y="21" width="4.3" height="9.4" rx="1.4" fill="#111827"></rect>
            <rect x="29.5" y="21" width="4.3" height="9.4" rx="1.4" fill="#111827"></rect>
        </svg>
    `,
    loader: `
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <ellipse cx="24" cy="39.5" rx="16" ry="4" fill="rgba(15,23,42,.16)"></ellipse>
            <path d="M10.5 17.5h21.2a5 5 0 0 1 5 5v9.2a5 5 0 0 1-5 5H10.5a5 5 0 0 1-5-5v-9.2a5 5 0 0 1 5-5Z" fill="#f97316" stroke="#263849" stroke-width="2"></path>
            <path d="M16 11.2h11.5l5 7.3H12.8l3.2-7.3Z" fill="#fff7ed" stroke="#263849" stroke-width="2" stroke-linejoin="round"></path>
            <path d="M18 14.2h8.2" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"></path>
            <path d="M12.2 25h18.2v6.5H12.2V25Z" fill="#fed7aa"></path>
            <path d="M36.5 20.5 43 15.8l1.5 3.4-6 5.3" fill="#f59e0b" stroke="#263849" stroke-width="1.7" stroke-linejoin="round"></path>
            <path d="M38.3 25.2H45l-1.6 5.5h-6.1" fill="#f59e0b" stroke="#263849" stroke-width="1.7" stroke-linejoin="round"></path>
            <rect x="6.2" y="23" width="4.4" height="9.4" rx="1.4" fill="#111827"></rect>
            <rect x="29.7" y="23" width="4.4" height="9.4" rx="1.4" fill="#111827"></rect>
        </svg>
    `,
};

const stateStyles: Record<VehicleState, { label: string; marker: string; badge: string; dot: string }> = {
    moving: {
        label: 'Harakatda',
        marker: 'is-moving',
        badge: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
        dot: 'bg-emerald-400',
    },
    stopped: {
        label: "To'xtagan",
        marker: 'is-stopped',
        badge: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
        dot: 'bg-amber-400',
    },
    offline: {
        label: 'Aloqa yoq',
        marker: 'is-offline',
        badge: 'border-slate-500/30 bg-slate-700/25 text-slate-300',
        dot: 'bg-slate-500',
    },
};

const vehicleIconCache = new Map<string, ReturnType<typeof divIcon>>();

const getVehicleSvgForName = (name?: string): string | null => {
    if (!name) return null;
    const n = name.toLowerCase();
    if (n.includes('vodavoz') || n.includes('водовоз')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${vodavozPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('nexia') || n.includes('damas') || n.includes('tracker') || n.includes('niva') || n.includes('chevrolet') || n.includes('kia sorento') || n.includes('bongo') || n.includes('gentra')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${sedanPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('maz') && !n.includes('kamaz')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${manPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('shantui') || n.includes('traktor')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${traktorPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('chakman')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${chakmanPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('isuz') || n.includes('isuzu')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${isuzuPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('kara')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${karaPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('man')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${manPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('pogruz') || n.includes('pogruzchik') || n.includes('pagruz')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${pogruzchikPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('газел') || n.includes('gazel') || n.includes('gazelle') || n.includes('dong fen')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${gazelPng}" x="4" y="4" width="40" height="40"/></svg>`;
    if (n.includes('ekskovartor') || n.includes('ekskovator') || n.includes('ekskavator') || n.includes('excavator') || n.includes('эксковатор') || n.includes('экскаватор')) return `<svg viewBox="0 0 48 48" aria-hidden="true"><image href="${ekskovatorPng}" x="4" y="4" width="40" height="40"/></svg>`;
    return null;
};

const getVehicleInnerSvg = (name?: string, kind?: VehicleKind) => getVehicleSvgForName(name) ?? vehicleSvgByKind[kind ?? 'car'];

const buildVehicleIcon = (state: VehicleState, kind: VehicleKind, isSelected = false, count = 1, direction: number | null = null, name?: string) => {
    const countLabel = count > 1 ? String(count) : '';
    const rotation = Number.isFinite(Number(direction)) ? Math.round(Number(direction)) : 0;
    const cacheKey = `${state}:${kind}:${isSelected ? 'selected' : 'normal'}:${countLabel}:${rotation}:${String(name || '')}`;
    const cached = vehicleIconCache.get(cacheKey);
    if (cached) return cached;

    // prefer name-based icon when available
    const nameSvg = getVehicleSvgForName(name);
    const innerSvg = nameSvg ?? vehicleSvgByKind[kind];

    const icon = divIcon({
        className: '',
        iconSize: count > 1 ? [44, 44] : [38, 38],
        iconAnchor: count > 1 ? [22, 22] : [19, 19],
        html: `
            <div class="sr-garvex-marker ${stateStyles[state].marker} kind-${kind} ${isSelected ? 'is-selected' : ''}">
                <span class="sr-garvex-marker-icon" style="--sr-vehicle-rotation:${rotation}deg">${innerSvg}</span>
                ${countLabel ? `<span class="sr-cluster-count">${countLabel}</span>` : ''}
            </div>
        `,
    });
    vehicleIconCache.set(cacheKey, icon);
    return icon;
};

const getVehicleIcon = (state: VehicleState, kind: VehicleKind, isSelected: boolean, count = 1, direction: number | null = null, name?: string) =>
    buildVehicleIcon(state, kind, isSelected, count, direction, name);

const extractRegion = (address: string | null | undefined): string => {
    const normalized = String(address || '').trim();
    if (!normalized) return "Noma'lum hudud";
    const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
    const region = parts.find((part) => /viloyati|tumani|qashqadaryo|samarqand/i.test(part));
    return region || parts[0] || "Noma'lum hudud";
};

const toSeenAtMs = (lastMessageAt: string | null | undefined, lastMessageUnix: number | null | undefined) => {
    const isoMs = lastMessageAt ? new Date(lastMessageAt).getTime() : NaN;
    if (Number.isFinite(isoMs)) return isoMs;
    const unixRaw = typeof lastMessageUnix === 'number' ? lastMessageUnix : NaN;
    if (!Number.isFinite(unixRaw)) return NaN;
    return unixRaw > 9_999_999_999 ? unixRaw : unixRaw * 1000;
};

const toVehicleState = (
    apiStatus: string | number | null | undefined,
    speed: number,
    lastMessageAt: string | null | undefined,
    lastMessageUnix: number | null | undefined,
): VehicleState => {
    const normalizedStatus = String(apiStatus ?? '').trim().toLowerCase();
    if (normalizedStatus === '1' || normalizedStatus === 'moving' || normalizedStatus === 'active') return 'moving';
    if (normalizedStatus === '2' || normalizedStatus === 'stopped' || normalizedStatus === 'stop') return 'stopped';
    if (!normalizedStatus || normalizedStatus === '0' || normalizedStatus === 'offline') return 'offline';

    const seenAt = toSeenAtMs(lastMessageAt, lastMessageUnix);
    if (!Number.isFinite(seenAt) || Date.now() - seenAt > LIVE_AFTER_MS) return 'offline';
    if (speed > 2) return 'moving';
    return 'stopped';
};

const asOptionalNumber = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).replace(',', '');
};

const formatAgo = (value: string | null | undefined) => {
    if (!value) return '-';
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms)) return '-';
    const diffSeconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (diffSeconds < 60) return `${diffSeconds}s oldin`;
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} daq oldin`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} soat oldin`;
    return `${Math.round(diffHours / 24)} kun oldin`;
};

const formatMetric = (value: number | null | undefined, suffix = '') => {
    if (value == null || !Number.isFinite(Number(value))) return '-';
    return `${Number(value).toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}${suffix}`;
};

const formatChartNumber = (value: number | null | undefined, digits = 1) => {
    if (value == null || !Number.isFinite(Number(value))) return '0';
    return Number(value).toLocaleString('uz-UZ', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    });
};

// Render a small percent label inside each slice (midway between inner and outer radius)
// Always render the percent (show 0% for empty slices) and use integer percent for compact display.
const createLabelRenderer = (total: number) => (props: any) => {
    const { midAngle, innerRadius, outerRadius, percent, value } = props;

    // By using props.cx as SVG 'x' and xOffset as SVG 'dx', it works flawlessly
    // whether recharts passes a string like "50%" or parsed pixel number like 150.
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5; // EXACT center of the ring
    const mAngle = midAngle !== undefined ? midAngle : ((props.startAngle || 0) + (props.endAngle || 0)) / 2;
    const xOffset = radius * Math.cos(-RADIAN * mAngle);
    const yOffset = radius * Math.sin(-RADIAN * mAngle);

    let p = 0;
    if (typeof percent === 'number') p = percent;
    else if (total > 0 && typeof value === 'number') p = value / total;

    if (p <= 0) return null; // do not show for 0

    // format to 1 decimal place like "46.1%"
    const pctString = (p * 100).toFixed(1).replace(/\.0$/, '') + '%';

    return (
        <text x={props.cx} y={props.cy} dx={xOffset} dy={yOffset} fill="#ffffff" fontWeight={800} fontSize={13} textAnchor="middle" dominantBaseline="central" pointerEvents="none" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}>
            {pctString}
        </text>
    );
};

// Active slice renderer: only enlarge the slice and add a subtle halo; labels are shown by `renderLabelInside`
const createActiveShapeRenderer = (total: number) => (props: any) => {
    const {
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle,
        endAngle,
        fill,
        midAngle,
        percent,
        value,
    } = props;

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const mAngle = midAngle !== undefined ? midAngle : (startAngle + endAngle) / 2;
    const xOffset = radius * Math.cos(-RADIAN * mAngle);
    const yOffset = radius * Math.sin(-RADIAN * mAngle);

    let p = 0;
    if (typeof percent === 'number') p = percent;
    else if (total > 0 && typeof value === 'number') p = value / total;

    const pctString = (p * 100).toFixed(1).replace(/\.0$/, '') + '%';

    return (
        <g>
            <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
            <Sector cx={cx} cy={cy} innerRadius={outerRadius + 9} outerRadius={outerRadius + 12} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.12} />
            {p > 0 && (
                <text x={cx} y={cy} dx={xOffset} dy={yOffset} fill="#ffffff" fontWeight={800} fontSize={14} textAnchor="middle" dominantBaseline="central" pointerEvents="none" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}>
                    {pctString}
                </text>
            )}
        </g>
    );
};

const shortChartLabel = (value: string) => {
    const clean = String(value || '').trim();
    if (clean.length <= 16) return clean;
    return `${clean.slice(0, 15)}...`;
};

const getVehicleKind = (nameRaw: string): VehicleKind => {
    const name = nameRaw.toLowerCase();
    if (/kara|кара/.test(name)) return 'forklift';
    if (/pagruz|pogruz|погруз|excavator|ekskavator|экскаватор|shantui|шант/i.test(name)) return 'loader';
    if (/chacman|dong|feng|isuzu|gazel|камаз|truck|howo|shacman/.test(name)) return 'truck';
    return 'car';
};

const formatVehicleLabel = (name: string) => {
    const clean = name.trim();
    if (clean.length <= 12) return clean;
    return `${clean.slice(0, 11)}...`;
};

const formatCoordinates = (vehicle: TrackingVehicle) =>
    `${vehicle.lat.toFixed(6)}, ${vehicle.lng.toFixed(6)}`;

const getClusterRadiusPx = (zoom: number) => {
    if (zoom <= 9) return 72;
    if (zoom <= 12) return 62;
    if (zoom <= 15) return 52;
    if (zoom <= 17) return 44;
    return 38;
};

const buildDisplayClusters = (items: TrackingVehicle[], map: LeafletMap, zoom: number): VehicleMarkerCluster[] => {
    const radiusPx = getClusterRadiusPx(zoom);
    const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const clusters: Array<VehicleMarkerCluster & { x: number; y: number }> = [];

    for (const vehicle of sortedItems) {
        const point = map.project([vehicle.lat, vehicle.lng], zoom);
        let target: (VehicleMarkerCluster & { x: number; y: number }) | undefined;

        for (const cluster of clusters) {
            const dx = point.x - cluster.x;
            const dy = point.y - cluster.y;
            if (Math.sqrt((dx * dx) + (dy * dy)) <= radiusPx) {
                target = cluster;
                break;
            }
        }

        if (target) {
            const nextCount = target.vehicles.length + 1;
            target.vehicles.push(vehicle);
            target.lat = ((target.lat * (nextCount - 1)) + vehicle.lat) / nextCount;
            target.lng = ((target.lng * (nextCount - 1)) + vehicle.lng) / nextCount;
            target.x = ((target.x * (nextCount - 1)) + point.x) / nextCount;
            target.y = ((target.y * (nextCount - 1)) + point.y) / nextCount;
        } else {
            clusters.push({
                id: String(vehicle.id),
                lat: vehicle.lat,
                lng: vehicle.lng,
                vehicles: [vehicle],
                x: point.x,
                y: point.y,
            });
        }
    }

    return clusters.map(({ x: _x, y: _y, ...cluster }) => ({
        ...cluster,
        id: cluster.vehicles.map((vehicle) => vehicle.id).join('-'),
    }));
};

const mapApiVehicle = (item: GarvexVehicleApi): TrackingVehicle | null => {
    const id = Number(item.unitId ?? 0);
    const lat = Number(item.point?.y);
    const lng = Number(item.point?.x);
    if (!Number.isFinite(id) || id <= 0) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const speed = asOptionalNumber(item.point?.speed) ?? 0;
    const address = String(item.point?.a || '').trim();
    const name = String(item.name || item.objectCode || `#${id}`).trim();

    return {
        id,
        name,
        imei: item.objectCode ? String(item.objectCode) : null,
        address: address || "Manzil ma'lumoti yo'q",
        region: extractRegion(address),
        lat,
        lng,
        speed,
        direction: asOptionalNumber(item.point?.dir),
        ignition: typeof item.point?.ign === 'boolean' ? item.point.ign : null,
        satellites: asOptionalNumber(item.point?.sats),
        fuelLevel: asOptionalNumber(item.point?.fuelLevel),
        status: toVehicleState(item.status, speed, item.lastMessageAt, item.lastMessageUnix),
        kind: getVehicleKind(name),
        lastMessageAt: item.lastMessageAt || null,
        syncedAt: item.syncedAt || null,
    };
};

const MapAutoFit = ({
    vehicles,
    selectedVehicle,
    fitKey,
}: {
    vehicles: TrackingVehicle[];
    selectedVehicle: TrackingVehicle | null;
    fitKey: string;
}) => {
    const map = useMap();
    const lastFitKeyRef = useRef<string | null>(null);
    const lastCenteredVehicleIdRef = useRef<number | null>(null);

    useEffect(() => {
        const t = window.setTimeout(() => map.invalidateSize(), 80);
        return () => window.clearTimeout(t);
    }, [map]);

    useEffect(() => {
        if (selectedVehicle) {
            if (lastCenteredVehicleIdRef.current !== selectedVehicle.id) {
                lastCenteredVehicleIdRef.current = selectedVehicle.id;
                map.setView([selectedVehicle.lat, selectedVehicle.lng], Math.max(map.getZoom(), 14), { animate: true });
            }
            return;
        }

        lastCenteredVehicleIdRef.current = null;

        const nextFitKey = `${fitKey}:${vehicles.length}`;
        if (lastFitKeyRef.current === nextFitKey) {
            return;
        }
        lastFitKeyRef.current = nextFitKey;

        if (vehicles.length === 0) {
            map.setView(MAP_FALLBACK_CENTER, 9, { animate: false });
            return;
        }

        const bounds = latLngBounds(vehicles.map((vehicle) => [vehicle.lat, vehicle.lng] as [number, number]));
        map.fitBounds(bounds.pad(0.22), { animate: true, maxZoom: 13 });
    }, [map, selectedVehicle, vehicles, fitKey]);

    return null;
};

const MapResizeHandler = () => {
    const map = useMap();
    useEffect(() => {
        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
        });
        resizeObserver.observe(map.getContainer());
        return () => resizeObserver.disconnect();
    }, [map]);
    return null;
};

const VehicleMarkers = ({
    vehicles,
    selectedVehicleId,
    onSelect,
}: {
    vehicles: TrackingVehicle[];
    selectedVehicleId: number | null;
    onSelect: (id: number | null) => void;
}) => {
    const map = useMap();
    const [zoom, setZoom] = useState(() => map.getZoom());

    useMapEvents({
        zoomend: () => setZoom(map.getZoom()),
    });

    const clusters = useMemo(
        () => buildDisplayClusters(vehicles, map, zoom),
        [vehicles, map, zoom],
    );

    return (
        <>
            {clusters.map((cluster) => {
                const isCluster = cluster.vehicles.length > 1;
                const representative = cluster.vehicles[0];
                const isSelected = cluster.vehicles.some((vehicle) => vehicle.id === selectedVehicleId);
                const markerState = isCluster ? 'stopped' : representative.status;
                const markerKind = representative.kind;

                return (
                    <Marker
                        key={cluster.id}
                        position={[cluster.lat, cluster.lng]}
                        icon={getVehicleIcon(
                            markerState,
                            markerKind,
                            isSelected,
                            cluster.vehicles.length,
                            isCluster ? null : representative.direction,
                            representative.name,
                        )}
                        eventHandlers={{
                            click: () => {
                                if (!isCluster) {
                                    onSelect(representative.id);
                                }
                            },
                        }}
                    >
                        {!isCluster ? (
                            <>
                                <Tooltip permanent direction="bottom" offset={[0, 16]} opacity={1} className="sr-garvex-label">
                                    {formatVehicleLabel(representative.name)}
                                </Tooltip>
                                <Popup className="sr-garvex-popup" minWidth={420} maxWidth={460}>
                                    <div className="sr-garvex-popup-card">
                                        <div className="sr-popup-header">
                                            <div className="min-w-0">
                                                <div className="sr-popup-title-row">
                                                    <div 
                                                        className="sr-popup-vehicle-image"
                                                        dangerouslySetInnerHTML={{ __html: getVehicleInnerSvg(representative.name, representative.kind) }}
                                                    />
                                                    <span className="sr-popup-title">{representative.name}</span>
                                                </div>
                                                <div className={`sr-popup-status ${stateStyles[representative.status].marker}`}>
                                                    {stateStyles[representative.status].label}
                                                </div>
                                            </div>
                                            <div className="sr-popup-time">
                                                <div>~ {formatAgo(representative.lastMessageAt)}</div>
                                                <div>{formatDateTime(representative.lastMessageAt)}</div>
                                            </div>
                                        </div>

                                        <div className="sr-popup-metrics">
                                            <div><Gauge size={16} /> <b>{formatMetric(representative.speed, ' км/ч')}</b></div>
                                            <div><KeyRound size={16} /> <b>{representative.ignition == null ? 'N/A' : representative.ignition ? 'вкл' : 'выкл'}</b></div>
                                            <div><Satellite size={16} /> <b>{representative.satellites ?? 'N/A'}</b></div>
                                        </div>

                                        <div className="sr-popup-details">
                                            <div className="sr-popup-detail-row">
                                                <span><span>Координаты:</span> {formatCoordinates(representative)}</span>
                                            </div>
                                            <div className="sr-popup-address">
                                                <span>Адрес:</span> {representative.address}
                                            </div>
                                        </div>

                                        <div className="sr-popup-sensors">
                                            <div className="sr-popup-sensors-header">
                                                <span>Датчики</span>
                                                <ChevronDown size={16} />
                                            </div>
                                            <div className="sr-popup-sensor-grid">
                                                <div>Зажигание: <b>{representative.ignition == null ? 'N/A' : representative.ignition ? 'вкл' : 'выкл'}</b></div>
                                                <div>Напряжение: <b>N/A</b></div>
                                                <div>Сигнал GMS (1-5) : <b>N/A</b></div>
                                                <div>Скорость: <b>{representative.speed == null ? 'N/A' : formatMetric(representative.speed, ' км/ч')}</b></div>
                                                <div>Спутники: <b>{representative.satellites ?? 'N/A'}</b></div>
                                                <div>Уровень топлива: <b>{representative.fuelLevel == null ? 'N/A' : `${representative.fuelLevel.toFixed(3)}л`}</b></div>
                                            </div>
                                        </div>

                                        <div className="sr-popup-toolbar">
                                            <span><LocateFixed size={17} /></span>
                                            <span><RotateCw size={17} /></span>
                                            <span><List size={17} /></span>
                                            <span><LayoutGrid size={17} /></span>
                                            <span><MessageSquare size={17} /></span>
                                            <span><Radio size={17} /></span>
                                            <span><Pencil size={17} /></span>
                                            <span><X size={17} /></span>
                                        </div>
                                    </div>
                                </Popup>
                            </>
                        ) : (
                            <Popup className="sr-cluster-popup" minWidth={240} maxWidth={280}>
                                <div className="sr-cluster-list">
                                    {cluster.vehicles.map(vehicle => (
                                        <div key={vehicle.id} className="sr-cluster-list-item" onClick={() => onSelect(vehicle.id)}>
                                            <div 
                                                className="sr-cluster-item-image"
                                                dangerouslySetInnerHTML={{ __html: getVehicleInnerSvg(vehicle.name, vehicle.kind) }} 
                                            />
                                            <div className="sr-cluster-item-info">
                                                <div className="sr-cluster-item-title">{vehicle.name}</div>
                                                <div className={`sr-cluster-item-status ${stateStyles[vehicle.status].marker}`}>
                                                    {stateStyles[vehicle.status].label}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Popup>
                        )}
                    </Marker>
                );
            })}
        </>
    );
};

const buildVehicleSignature = (vehicles: TrackingVehicle[]): string =>
    vehicles
        .map((vehicle) =>
            [
                vehicle.id,
                vehicle.status,
                vehicle.lat.toFixed(5),
                vehicle.lng.toFixed(5),
                vehicle.speed,
                vehicle.fuelLevel ?? '',
                vehicle.lastMessageAt ?? '',
                vehicle.syncedAt ?? '',
            ].join(':'),
        )
        .join('|');

export const LiveTracker = ({ lang: _lang, dashboardOnly }: LiveTrackerProps) => {
    const t = useI18n((state) => state.t);
    const [trackingNavTab, setTrackingNavTab] = useState<TrackingNavTab>(dashboardOnly ? 'dashboard' : 'dashboard');
    const [statusFilter, setStatusFilter] = useState<TrackingStatusFilter>('all');
    const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
    const [vehicles, setVehicles] = useState<TrackingVehicle[]>([]);
    const [query, setQuery] = useState('');
    const [syncMessage, setSyncMessage] = useState<string | null>('Garvexdan jonli GPS ma`lumotlari olinmoqda...');
    const cacheRef = useRef<TrackingVehicle[]>([]);
    const cacheAtRef = useRef<number>(0);
    const inFlightRef = useRef(false);
    const syncInFlightRef = useRef(false);
    const lastHealthFetchAtRef = useRef(0);
    const lastSyncRequestAtRef = useRef(0);
    const healthRef = useRef<GarvexHealthResponse | null>(null);
    const vehiclesSignatureRef = useRef('');
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [dashboardPreset] = useState<DashboardPreset>('today');
    const [dashboardRange] = useState(() => getDashboardRange('today'));
    // const [dashboardDraftDates, setDashboardDraftDates] = useState(() => toDashboardDateDraft(getDashboardRange('today')));
    const [dashboardData, setDashboardData] = useState<GarvexDashboardResponse | null>(null);

    const [dashboardError, setDashboardError] = useState<string | null>(null);
    const [activeConnectionIndex, setActiveConnectionIndex] = useState<number | null>(null);
    const [activeMovementIndex, setActiveMovementIndex] = useState<number | null>(null);
    const [activeFuelIndex, setActiveFuelIndex] = useState<number | null>(null);
    // Hover state for mileage time series: which vehicle series and which bucket index
    const [hoveredSeriesKey, setHoveredSeriesKey] = useState<string | null>(null);
    const [hoveredBucketIndex, setHoveredBucketIndex] = useState<number | null>(null);
    const [hoveredTopIndex, setHoveredTopIndex] = useState<number | null>(null);
    // Ref and position for time-series tooltip (so tooltip appears next to hovered bar)
    const timeChartRef = useRef<HTMLDivElement | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!tooltipRef.current) return;
        if (tooltipPos) {
            tooltipRef.current.style.left = `${tooltipPos.left}px`;
            tooltipRef.current.style.top = `${tooltipPos.top}px`;
            tooltipRef.current.style.visibility = 'visible';
        } else {
            tooltipRef.current.style.visibility = 'hidden';
        }
    }, [tooltipPos]);

    const handleCellEnter = (e: any, seriesKey: string, bIndex: number) => {
        setHoveredSeriesKey(seriesKey);
        setHoveredBucketIndex(bIndex);
        if (timeChartRef.current && e && typeof e.clientX === 'number') {
            const rect = timeChartRef.current.getBoundingClientRect();
            const tooltipEl = tooltipRef.current;
            const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : 200; // fallback to min width
            const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : 80;
            // center tooltip horizontally over the pointer and clamp within container
            const desiredLeft = Math.round(e.clientX - rect.left - tooltipWidth / 2);
            const clampedLeft = Math.max(8, Math.min(desiredLeft, Math.round(rect.width - tooltipWidth - 8)));
            // position tooltip above the point using tooltip height; clamp to top
            const desiredTop = Math.round(e.clientY - rect.top - tooltipHeight - 8);
            const clampedTop = Math.max(8, desiredTop);
            setTooltipPos({ left: clampedLeft, top: clampedTop });
        }
    };

    const handleCellMove = (e: any) => {
        if (!timeChartRef.current) return;
        if (e && typeof e.clientX === 'number') {
            const rect = timeChartRef.current.getBoundingClientRect();
            const tooltipEl = tooltipRef.current;
            const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : 200;
            const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : 80;
            const desiredLeft = Math.round(e.clientX - rect.left - tooltipWidth / 2);
            const clampedLeft = Math.max(8, Math.min(desiredLeft, Math.round(rect.width - tooltipWidth - 8)));
            const desiredTop = Math.round(e.clientY - rect.top - tooltipHeight - 8);
            const clampedTop = Math.max(8, desiredTop);
            setTooltipPos({ left: clampedLeft, top: clampedTop });
        }
    };

    const handleCellLeave = () => {
        setHoveredBucketIndex(null);
        setHoveredSeriesKey(null);
        setTooltipPos(null);
    };

    const load = async (includeHealth = false) => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;

        try {
            const [healthResponse, vehiclesResponse] = await Promise.all([
                includeHealth
                    ? fetch(`${API_BASE}/integrations/tracking/garvex/health`, { cache: 'no-store' })
                    : Promise.resolve(null),
                fetch(`${API_BASE}/integrations/tracking/garvex/vehicles`, { cache: 'no-store' }),
            ]);

            const health = healthResponse && healthResponse.ok
                ? await healthResponse.json().catch(() => null) as GarvexHealthResponse | null
                : healthRef.current;
            const payload = vehiclesResponse.ok
                ? await vehiclesResponse.json().catch(() => null) as GarvexVehiclesResponse | null
                : null;

            if (includeHealth) {
                healthRef.current = health;
                lastHealthFetchAtRef.current = Date.now();
            }

            const mapped = (payload?.items || [])
                .map(mapApiVehicle)
                .filter((item): item is TrackingVehicle => Boolean(item))
                .sort((a, b) => {
                    const statusRank: Record<VehicleState, number> = { moving: 0, stopped: 1, offline: 2 };
                    const byStatus = statusRank[a.status] - statusRank[b.status];
                    if (byStatus !== 0) return byStatus;
                    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                });

            if (mapped.length > 0) {
                const nextSignature = buildVehicleSignature(mapped);
                if (nextSignature !== vehiclesSignatureRef.current) {
                    vehiclesSignatureRef.current = nextSignature;
                    startTransition(() => {
                        setVehicles(mapped);
                    });
                }
                setSyncMessage(null);
                cacheRef.current = mapped;
                cacheAtRef.current = Date.now();
                setSelectedVehicleId((prev) => (prev && mapped.some((vehicle) => vehicle.id === prev) ? prev : null));
                return;
            }

            const canUseCache = cacheRef.current.length > 0 && (Date.now() - cacheAtRef.current) <= (5 * 60 * 1000);
            if (canUseCache) {
                startTransition(() => {
                    setVehicles(cacheRef.current);
                });
                setSyncMessage('Vaqtincha so`nggi ishonchli GPS nuqtalari ko`rsatilmoqda.');
                return;
            }

            vehiclesSignatureRef.current = '';
            startTransition(() => {
                setVehicles([]);
            });

            if (!health?.enabled) {
                setSyncMessage('Garvex integratsiyasi o`chiq.');
            } else if (health?.status === 'permission_denied' || health?.permission?.getUnit === false) {
                setSyncMessage('Garvex akkauntida transportlarni o`qish huquqi yo`q.');
            } else if (health?.lastSyncError) {
                setSyncMessage(`Garvex sync xatosi: ${health.lastSyncError}`);
            } else {
                setSyncMessage('Garvexdan transport koordinatalari kelmadi.');
            }
        } catch {
            const canUseCache = cacheRef.current.length > 0 && (Date.now() - cacheAtRef.current) <= (5 * 60 * 1000);
            if (canUseCache) {
                startTransition(() => {
                    setVehicles(cacheRef.current);
                });
                setSyncMessage('Tarmoq uzilishi: so`nggi GPS nuqtalari saqlandi.');
            } else {
                vehiclesSignatureRef.current = '';
                startTransition(() => {
                    setVehicles([]);
                });
                setSyncMessage('Garvex bilan ulanishda tarmoq xatosi.');
            }
        } finally {
            inFlightRef.current = false;
        }
    };

    const syncInBackground = () => {
        if (syncInFlightRef.current) return;
        syncInFlightRef.current = true;
        lastSyncRequestAtRef.current = Date.now();
        void fetch(`${API_BASE}/integrations/tracking/garvex/sync`, {
            cache: 'no-store',
            priority: 'low',
        } as RequestInit & { priority?: 'low' })
            .catch(() => null)
            .finally(() => {
                syncInFlightRef.current = false;
            });
    };

    const loadDashboard = async () => {
        try {
            const params = new URLSearchParams();
            params.set('preset', dashboardPreset);
            if (dashboardRange.from) params.set('dateFrom', dashboardRange.from);
            if (dashboardRange.to) params.set('dateTo', dashboardRange.to);

            const response = await fetch(`${API_BASE}/integrations/tracking/garvex/dashboard?${params.toString()}`, {
                cache: 'no-store',
            });
            if (!response.ok) {
                throw new Error(`Dashboard API xatoligi: ${response.status}`);
            }
            const payload = await response.json().catch(() => null) as GarvexDashboardResponse | null;
            setDashboardData(payload);
            setDashboardError(null);
        } catch (error) {
            setDashboardError(error instanceof Error ? error.message : 'Dashboard ma\'lumotlarini olishda xatolik');
        }
    };

    /*
    const applyDashboardPreset = (preset: DashboardPreset) => {
        if (preset === 'custom') return;
        const nextRange = getDashboardRange(preset);
        setDashboardPreset(preset);
        setDashboardDraftDates(toDashboardDateDraft(nextRange));
        setDashboardRange(nextRange);
    };

    const applyDashboardRange = () => {
        const fromDate = dashboardDraftDates.from || dashboardDraftDates.to;
        const toDate = dashboardDraftDates.to || dashboardDraftDates.from;
        if (!fromDate || !toDate) {
            const nextRange = getDashboardRange('today');
            setDashboardPreset('today');
            setDashboardDraftDates(toDashboardDateDraft(nextRange));
            setDashboardRange(nextRange);
            return;
        }
        setDashboardPreset('custom');
        setDashboardRange({
            from: `${fromDate}T00:00`,
            to: `${toDate}T23:59`,
        });
    };
    */

    useEffect(() => {
        void load(true);
        syncInBackground();
        const timer = window.setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
                return;
            }
            const now = Date.now();
            const includeHealth = now - lastHealthFetchAtRef.current >= HEALTH_REFRESH_MS;
            if (now - lastSyncRequestAtRef.current >= SYNC_TRIGGER_MS) {
                syncInBackground();
            }
            void load(includeHealth);
        }, SYNC_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (trackingNavTab !== 'dashboard') return;
        void loadDashboard();
        const timer = window.setInterval(() => {
            void loadDashboard();
        }, DASHBOARD_REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [trackingNavTab, dashboardPreset, dashboardRange.from, dashboardRange.to]);

    useEffect(() => {
        if (selectedVehicleId == null) return;
        const exists = vehicles.some((vehicle) => vehicle.id === selectedVehicleId);
        if (!exists) setSelectedVehicleId(null);
    }, [vehicles, selectedVehicleId]);

    const selectedVehicle = useMemo(
        () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
        [vehicles, selectedVehicleId],
    );

    const counters = useMemo(() => {
        const moving = vehicles.filter((vehicle) => vehicle.status === 'moving').length;
        const stopped = vehicles.filter((vehicle) => vehicle.status === 'stopped').length;
        const offline = vehicles.filter((vehicle) => vehicle.status === 'offline').length;
        return { moving, stopped, offline, total: vehicles.length };
    }, [vehicles]);

    const dashboardMetrics = useMemo(() => {
        const averageSpeed = vehicles.length
            ? vehicles.reduce((sum, vehicle) => sum + vehicle.speed, 0) / vehicles.length
            : 0;
        const fuelKnown = vehicles.filter((vehicle) => vehicle.fuelLevel != null).length;
        const latestSync = vehicles
            .map((vehicle) => vehicle.syncedAt || vehicle.lastMessageAt)
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

        return {
            averageSpeed,
            fuelKnown,
            latestSync,
            livePercent: counters.total > 0 ? Math.round(((counters.moving + counters.stopped) / counters.total) * 100) : 0,
        };
    }, [vehicles, counters]);

    const dashboardChartData = useMemo(() => {
        const connection = dashboardData?.connection ?? {
            total: counters.total,
            online: counters.moving + counters.stopped,
            offline: counters.offline,
            noData: 0,
        };
        const movement = dashboardData?.movement ?? {
            total: counters.total,
            moving: counters.moving,
            parking: counters.stopped,
            offline: counters.offline,
        };
        const mileageChart = (dashboardData?.mileage?.top?.length ? dashboardData.mileage.top : dashboardData?.mileage?.items || [])
            .filter((item) => item.mileage > 0)
            .sort((a, b) => b.mileage - a.mileage)
            .slice(0, 5)
            .map((item) => ({
                ...item,
                shortName: shortChartLabel(item.name),
                mileage: Number(item.mileage.toFixed(1)),
            }));
        const mileageTimeSeries = (dashboardData?.mileage?.chart?.series || mileageChart.map((item, index) => ({
            key: `fallback_${index}`,
            name: item.name,
        }))).slice(0, 5);
        const mileageTimeBuckets = (dashboardData?.mileage?.chart?.buckets || [])
            .map((bucket) => ({
                label: bucket.label,
                ...(bucket.values || {}),
            }))
            .filter((bucket) => mileageTimeSeries.some((series) => Number(bucket[series.key as keyof typeof bucket] || 0) > 0));
        const fallbackMileageBucket = mileageChart.length > 0
            ? [{
                label: 'Jami',
                ...Object.fromEntries(mileageTimeSeries.map((series, index) => [series.key, mileageChart[index]?.mileage ?? 0])),
            }]
            : [];
        const fuel = dashboardData?.fuel ?? {
            refueled: 0,
            drained: 0,
            total: 0,
            refuelCount: 0,
            drainCount: 0,
        };

        return {
            connection,
            movement,
            connectionDonut: [
                { name: 'Tarmoqda', value: connection.online ?? 0, color: DASHBOARD_COLORS.green },
                { name: "Aloqa yo'q", value: connection.offline ?? 0, color: DASHBOARD_COLORS.red },
                { name: "Ma'lumot yo'q", value: connection.noData ?? 0, color: DASHBOARD_COLORS.gray },
            ].filter((item) => item.value > 0),
            movementDonut: [
                { name: 'Harakatda', value: movement.moving ?? 0, color: DASHBOARD_COLORS.green },
                { name: "To'xtagan", value: movement.parking ?? 0, color: DASHBOARD_COLORS.blue },
                { name: "Aloqa yo'q", value: movement.offline ?? 0, color: DASHBOARD_COLORS.red },
            ].filter((item) => item.value > 0),
            mileageChart,
            mileageTimeSeries,
            mileageTimeBuckets: mileageTimeBuckets.length > 0 ? mileageTimeBuckets : fallbackMileageBucket,
            fuelDonut: [
                { name: 'Zapravka', value: fuel.refueled ?? 0, color: DASHBOARD_COLORS.green },
                { name: 'Sliv', value: fuel.drained ?? 0, color: DASHBOARD_COLORS.red },
            ].filter((item) => item.value > 0),
            fuel,
            totalMileage: dashboardData?.mileage?.total ?? 0,
            averageSpeed: dashboardData?.mileage?.averageSpeed ?? dashboardMetrics.averageSpeed,
            latestSync: dashboardData?.current?.latestSyncAt ?? dashboardMetrics.latestSync,
            fuelKnown: dashboardData?.current?.fuelKnown ?? dashboardMetrics.fuelKnown,
            onlinePercent: connection.total ? Math.round(((connection.online ?? 0) / connection.total) * 100) : dashboardMetrics.livePercent,
        };
    }, [counters, dashboardData, dashboardMetrics]);

    const filteredVehicles = useMemo(() => {
        const q = query.trim().toLowerCase();
        return vehicles.filter((vehicle) => {
            if (statusFilter !== 'all' && vehicle.status !== statusFilter) return false;
            if (!q) return true;
            return `${vehicle.name} ${vehicle.imei ?? ''} ${vehicle.address} ${vehicle.region}`.toLowerCase().includes(q);
        });
    }, [query, statusFilter, vehicles]);

    useEffect(() => {
        if (selectedVehicleId == null) return;
        const exists = filteredVehicles.some((vehicle) => vehicle.id === selectedVehicleId);
        if (!exists) setSelectedVehicleId(null);
    }, [filteredVehicles, selectedVehicleId]);

    const tileConfig = {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };

    return (
        <div className="min-w-0 space-y-4">
            <style>{`
                .mileage-chart-tooltip span[style] { background-color: var(--sr-color); }
                /* tooltip container for mileage chart; position set via JS to avoid JSX inline styles */
                .mileage-tooltip { position: absolute; z-index: 50; pointer-events: none; visibility: hidden; }
                /* Center text inside the mileage tooltip only (do not affect other components) */
                .mileage-chart-tooltip { text-align: center; }
                /* Center the small header row (colored square + label) */
                .mileage-chart-tooltip > .mb-2 { display: flex; justify-content: center; align-items: center; gap: 0.5rem; }
                .mileage-chart-tooltip svg { margin-right: 0; }
            `}</style>
            {!dashboardOnly && (
                <div className="glass-panel overflow-hidden rounded-2xl border border-slate-700/50">
                    <nav
                        className="flex w-full min-w-0 overflow-x-auto overscroll-x-contain border-b border-slate-700/60 dark-scrollbar [-webkit-overflow-scrolling:touch] sm:overflow-x-visible"
                        aria-label="GPS monitoring bo'limlari"
                    >
                        {TRACKING_NAV_ITEMS.map((item) => {
                            const active = trackingNavTab === item.id;
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setTrackingNavTab(item.id)}
                                    className={`flex min-h-[3.5rem] min-w-[9.5rem] flex-1 flex-col items-center justify-center gap-1.5 border-b-[3px] px-4 py-3 text-center text-sm font-semibold transition-colors sm:min-h-[4.25rem] sm:text-base lg:text-lg ${active
                                        ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                                        : 'border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                                        }`}
                                    aria-current={active ? 'page' : undefined}
                                >
                                    <Icon
                                        size={22}
                                        className={`shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`}
                                        strokeWidth={active ? 2.2 : 2}
                                    />
                                    <span className="line-clamp-2 max-w-full text-balance">
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </div>
            )}

            {trackingNavTab === 'dashboard' ? (
                <div className="space-y-4 pb-10">
                    {syncMessage || dashboardError || dashboardData?.reportError ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
                            {dashboardError || dashboardData?.reportError || syncMessage}
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                        <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                            <div className="mb-2 flex items-start justify-between gap-2">
                                <h3 className="text-lg font-semibold text-slate-100">Ulanish holati</h3>
                            </div>
                            <div className="grid h-[270px] grid-cols-[minmax(210px,1fr)_max-content] items-center gap-3 overflow-visible">
                                <div className="relative h-full min-w-0 overflow-visible">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                            <Pie
                                                {...({ activeIndex: activeConnectionIndex ?? undefined } as any)}
                                                activeShape={createActiveShapeRenderer(dashboardChartData.connection.total ?? counters.total) as any}
                                                label={createLabelRenderer(dashboardChartData.connection.total ?? counters.total) as any}
                                                // rounded segments with a dark stroke to create a gap
                                                cornerRadius={8}
                                                stroke={CARD_BG_COLOR}
                                                strokeWidth={2}
                                                labelLine={false}
                                                data={dashboardChartData.connectionDonut}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={62}
                                                outerRadius={98}
                                                paddingAngle={3}
                                                onMouseEnter={(_, index) => setActiveConnectionIndex(index)}
                                                onMouseLeave={() => setActiveConnectionIndex(null)}
                                            >
                                                {dashboardChartData.connectionDonut.map((entry) => (
                                                    <Cell key={entry.name} fill={entry.color} stroke={CARD_BG_COLOR} strokeWidth={2} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <div className="text-center text-3xl font-black text-slate-100">{dashboardChartData.connection.total ?? counters.total}</div>
                                    </div>
                                </div>
                                <div className="flex min-w-[112px] flex-col gap-2 text-xs font-bold">
                                    {dashboardChartData.connectionDonut.map((entry) => (
                                        <span key={entry.name} className="inline-flex items-center gap-2 text-slate-300">
                                            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={entry.color} /></svg>
                                            {entry.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                            <div className="mb-2 flex items-start justify-between gap-2">
                                <h3 className="text-lg font-semibold text-slate-100">Harakat holati</h3>
                            </div>
                            <div className="grid h-[270px] grid-cols-[minmax(210px,1fr)_max-content] items-center gap-3 overflow-visible">
                                <div className="relative h-full min-w-0 overflow-visible">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                            <Pie
                                                {...({ activeIndex: activeMovementIndex ?? undefined } as any)}
                                                activeShape={createActiveShapeRenderer(dashboardChartData.movement.total ?? counters.total) as any}
                                                label={createLabelRenderer(dashboardChartData.movement.total ?? counters.total) as any}
                                                cornerRadius={8}
                                                stroke={CARD_BG_COLOR}
                                                strokeWidth={2}
                                                labelLine={false}
                                                data={dashboardChartData.movementDonut}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={62}
                                                outerRadius={98}
                                                paddingAngle={3}
                                                onMouseEnter={(_, index) => setActiveMovementIndex(index)}
                                                onMouseLeave={() => setActiveMovementIndex(null)}
                                            >
                                                {dashboardChartData.movementDonut.map((entry) => (
                                                    <Cell key={entry.name} fill={entry.color} stroke={CARD_BG_COLOR} strokeWidth={2} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <div className="text-center text-3xl font-black text-slate-100">{dashboardChartData.movement.total ?? counters.total}</div>
                                    </div>
                                </div>
                                <div className="flex min-w-[112px] flex-col gap-2 text-xs font-bold">
                                    {dashboardChartData.movementDonut.map((entry) => (
                                        <span key={entry.name} className="inline-flex items-center gap-2 text-slate-300">
                                            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={entry.color} /></svg>
                                            {entry.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                            <h3 className="mb-2 text-lg font-semibold text-slate-100">Top obyektlar probegi</h3>
                            {dashboardChartData.mileageChart.length > 0 ? (
                                <>
                                    <div className={`chart-container relative h-[285px] ${hoveredTopIndex != null ? 'show-tooltip' : ''}`}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={dashboardChartData.mileageChart} layout="vertical" margin={{ top: 10, right: 18, left: 12, bottom: 12 }}>
                                                <CartesianGrid stroke="rgba(148,163,184,.18)" horizontal={false} />
                                                <XAxis type="number" tick={{ fill: '#cbd5e1', fontSize: 11 }} tickFormatter={(value) => `${formatChartNumber(Number(value), 0)} km`} />
                                                <YAxis type="category" dataKey="shortName" width={104} tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                                                {/* Use per-bar Cells with unique colors and single-bar tooltip (no global ChartTooltip) */}
                                                <Bar dataKey="mileage" radius={[0, 4, 4, 0]} barSize={38}>
                                                    {dashboardChartData.mileageChart.map((item, idx) => {
                                                        const color = DASHBOARD_BAR_COLORS[idx % DASHBOARD_BAR_COLORS.length];
                                                        const isHovered = hoveredTopIndex === idx;
                                                        const dim = hoveredTopIndex != null && hoveredTopIndex !== idx;
                                                        return (
                                                            <Cell
                                                                key={String(item.name || idx)}
                                                                fill={color}
                                                                opacity={isHovered ? 1 : dim ? 0.35 : 0.95}
                                                                onMouseEnter={() => setHoveredTopIndex(idx)}
                                                                onMouseLeave={() => setHoveredTopIndex(null)}
                                                            />
                                                        );
                                                    })}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>

                                        {/* Floating tooltip for single bar hover */}
                                        {hoveredTopIndex != null && (() => {
                                            const item = dashboardChartData.mileageChart[hoveredTopIndex];
                                            const color = DASHBOARD_BAR_COLORS[hoveredTopIndex % DASHBOARD_BAR_COLORS.length];
                                            return (
                                                <div className="absolute z-50 pointer-events-none right-6 top-10">
                                                    <div className="rounded-md border border-slate-700 bg-slate-900/90 p-3 text-sm text-slate-100 shadow-lg min-w-[220px]">
                                                        <div className="mb-2 flex items-center gap-2">
                                                            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={color} /></svg>
                                                            <div className="text-xs text-slate-300">{formatLongDate(new Date())}</div>
                                                        </div>
                                                        <div className="text-sm font-bold text-slate-100">{item.name}</div>
                                                        <div className="text-xs text-slate-400">{(() => {
                                                            const parts = String(item.name || '').trim().split(/\s+/);
                                                            const lastParts = parts.slice(-3).join(' ');
                                                            return /\d/.test(lastParts) ? lastParts : '';
                                                        })()}</div>
                                                        <div className="mt-2 text-lg font-black text-white">{formatChartNumber(item.mileage ?? 0, 1)} km</div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-3">
                                        {dashboardChartData.mileageChart.map((item, idx) => (
                                            <div key={item.name} className="inline-flex items-center gap-2 text-xs text-slate-300">
                                                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={DASHBOARD_BAR_COLORS[idx % DASHBOARD_BAR_COLORS.length]} /></svg>
                                                <span className="max-w-[220px] truncate">{item.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex h-[285px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm font-semibold text-slate-500">
                                    Probeg ma'lumoti yo'q
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
                        <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-lg font-semibold text-slate-100">Probeg, km</h3>
                                <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-400">
                                    <span>Jami: {formatChartNumber(dashboardChartData.totalMileage, 1)} km</span>
                                    <span>O'rtacha tezlik: {formatChartNumber(dashboardChartData.averageSpeed, 1)} km/h</span>
                                </div>
                            </div>
                            {dashboardChartData.mileageTimeBuckets.length > 0 ? (
                                <div className="relative h-[340px]" ref={timeChartRef} onMouseLeave={handleCellLeave}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={dashboardChartData.mileageTimeBuckets}
                                            margin={{ top: 20, right: 24, left: 8, bottom: 34 }}
                                            barGap={8}
                                            barCategoryGap="16%"
                                            onMouseLeave={handleCellLeave}
                                        >
                                            <CartesianGrid stroke="rgba(148,163,184,.2)" vertical={false} />
                                            <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 12 }} interval={0} />
                                            <YAxis tick={{ fill: '#cbd5e1', fontSize: 12 }} tickFormatter={(value) => formatChartNumber(Number(value), 0)} />
                                            {/* Legend kept; tooltip is the custom floating one shown only on hover */}
                                            <ChartLegend wrapperStyle={{ color: '#cbd5e1', fontSize: 12 }} />
                                            {dashboardChartData.mileageTimeSeries.map((series, index) => {
                                                const color = DASHBOARD_BAR_COLORS[index % DASHBOARD_BAR_COLORS.length];
                                                return (
                                                    <Bar
                                                        key={series.key}
                                                        dataKey={series.key}
                                                        name={series.name}
                                                        fill={color}
                                                        radius={[6, 6, 0, 0]}
                                                        maxBarSize={72}
                                                        onMouseEnter={() => setHoveredSeriesKey(series.key)}
                                                        onMouseLeave={() => { setHoveredSeriesKey(null); setHoveredBucketIndex(null); setTooltipPos(null); }}
                                                    >
                                                        {dashboardChartData.mileageTimeBuckets.map((_, bIndex) => {
                                                            const isHovered = hoveredSeriesKey === series.key && hoveredBucketIndex === bIndex;
                                                            const dim = hoveredSeriesKey && hoveredSeriesKey !== series.key;
                                                            return (
                                                                <Cell
                                                                    key={`${series.key}-${bIndex}`}
                                                                    fill={color}
                                                                    opacity={isHovered ? 1 : dim ? 0.32 : 0.95}
                                                                    onMouseEnter={(e) => handleCellEnter(e, series.key, bIndex)}
                                                                    onMouseMove={(e) => handleCellMove(e)}
                                                                    onMouseLeave={() => handleCellLeave()}
                                                                />
                                                            );
                                                        })}
                                                    </Bar>
                                                );
                                            })}
                                        </BarChart>
                                    </ResponsiveContainer>

                                    {/* Floating tooltip: visible when hoveredSeriesKey and hoveredBucketIndex are set */}
                                    {hoveredSeriesKey != null && hoveredBucketIndex != null && tooltipPos != null && (() => {
                                        const seriesIndex = dashboardChartData.mileageTimeSeries.findIndex(s => s.key === hoveredSeriesKey);
                                        const series = dashboardChartData.mileageTimeSeries[seriesIndex];
                                        const bucket = dashboardChartData.mileageTimeBuckets[hoveredBucketIndex];
                                        const color = DASHBOARD_BAR_COLORS[seriesIndex % DASHBOARD_BAR_COLORS.length];
                                        const mileageValue = Number(bucket[series.key as keyof typeof bucket] || 0);
                                        const label = bucket.label;
                                        // Place tooltip next to hovered bar using tooltipPos
                                        return (
                                            <div ref={tooltipRef} className="mileage-tooltip">
                                                <div className="mileage-chart-tooltip rounded-md border border-slate-700 bg-slate-900/90 p-3 text-sm text-slate-100 shadow-lg min-w-[200px]">
                                                    <div className="mb-2 flex items-center gap-2">
                                                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0"><rect width="12" height="12" rx="2" fill={color} /></svg>
                                                        <div className="text-xs text-slate-300">{label}</div>
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-100">{series.name}</div>
                                                    {/* Attempt to extract plate from series.name if present (heuristic) */}
                                                    <div className="text-xs text-slate-400">{(() => {
                                                        const parts = String(series.name || '').trim().split(/\s+/);
                                                        const lastParts = parts.slice(-3).join(' ');
                                                        return /\d/.test(lastParts) ? lastParts : '';
                                                    })()}</div>
                                                    <div className="mt-2 text-lg font-black text-white">{formatChartNumber(mileageValue, 1)} km</div>
                                                    <div className="mt-1 text-xs text-slate-400">{label}</div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="flex h-[340px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm font-semibold text-slate-500">
                                    Tanlangan davrda probeg ma'lumoti yo'q
                                </div>
                            )}
                        </section>

                        <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                            <h3 className="mb-2 text-lg font-semibold text-slate-100">Zapravka / Sliv</h3>
                            <div className="grid h-[280px] grid-cols-[minmax(210px,1fr)_max-content] items-center gap-3 overflow-visible">
                                {dashboardChartData.fuelDonut.length > 0 ? (
                                    <>
                                        <div className="relative h-full min-w-0 overflow-visible">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                                    <Pie
                                                        {...({ activeIndex: activeFuelIndex ?? undefined } as any)}
                                                        activeShape={createActiveShapeRenderer(dashboardChartData.fuelDonut.reduce((s, i) => s + i.value, 0)) as any}
                                                        label={createLabelRenderer(dashboardChartData.fuelDonut.reduce((s, i) => s + i.value, 0)) as any}
                                                        cornerRadius={8}
                                                        stroke={CARD_BG_COLOR}
                                                        strokeWidth={2}
                                                        labelLine={false}
                                                        data={dashboardChartData.fuelDonut}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={62}
                                                        outerRadius={98}
                                                        paddingAngle={3}
                                                        onMouseEnter={(_, index) => setActiveFuelIndex(index)}
                                                        onMouseLeave={() => setActiveFuelIndex(null)}
                                                    >
                                                        {dashboardChartData.fuelDonut.map((entry) => (
                                                            <Cell key={entry.name} fill={entry.color} stroke={CARD_BG_COLOR} strokeWidth={2} />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                <div className="text-center text-2xl font-black text-slate-100">{formatChartNumber(dashboardChartData.fuel.total, 1)}</div>
                                            </div>
                                        </div>
                                        <div className="flex min-w-[112px] flex-col gap-2 text-xs font-bold">
                                            {dashboardChartData.fuelDonut.map((entry) => (
                                                <span key={entry.name} className="inline-flex items-center gap-2 text-slate-300">
                                                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={entry.color} /></svg>
                                                    {entry.name}
                                                </span>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="col-span-2 flex h-full items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm font-semibold text-slate-500">
                                        Yoqilg'i hodisalari yo'q
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
                                <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-300">
                                    Zapravka: {formatChartNumber(dashboardChartData.fuel.refueled, 1)} l
                                </div>
                                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-red-300">
                                    Sliv: {formatChartNumber(dashboardChartData.fuel.drained, 1)} l
                                </div>
                            </div>
                        </section>
                    </div>


                </div>
            ) : (
                <>
                    {syncMessage ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
                            {syncMessage}
                        </div>
                    ) : null}

                    <div className="grid min-h-[680px] grid-cols-1 gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
                        <aside className="sr-garvex-sidebar">
                            <div className="sr-sidebar-tab">
                                <div className="sr-sidebar-tab-content">
                                    <button type="button" className="sr-sidebar-tab-button">
                                        <Truck size={20} />
                                        <span>{t('trackingObjects')}</span>
                                    </button>
                                    <label className="sr-sidebar-search sr-sidebar-search-inline">
                                        <Search size={18} />
                                        <input
                                            ref={searchInputRef}
                                            value={query}
                                            onChange={(event) => setQuery(event.target.value)}
                                            placeholder={t('trackingSearchPlaceholder')}
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="sr-sidebar-toolbar">
                                <div className="sr-sidebar-toolbar-left">
                                    <ChevronDown size={16} />
                                    <span className="sr-sort-icon">A/Z</span>
                                    <List size={18} />
                                    <RotateCw size={17} />
                                </div>
                                <div className="sr-sidebar-toolbar-right">
                                    <LocateFixed size={18} />
                                    <CircleDot size={17} />
                                    <KeyRound size={17} />
                                    <Satellite size={17} />
                                    <Gauge size={17} />
                                    <Fuel size={17} />
                                    <X size={17} />
                                </div>
                            </div>

                            <div className="sr-sidebar-group-row">
                                <ChevronDown size={16} />
                                <span className="sr-group-title">Kaliy zavod</span>
                                <span className="sr-group-count">{filteredVehicles.length} / {counters.total}</span>
                                <span className="sr-group-status-badges">
                                    <button
                                        type="button"
                                        className={`sr-group-status-badge is-total ${statusFilter === 'all' ? 'is-active' : ''}`}

                                        onClick={() => setStatusFilter('all')}
                                    >
                                        <span className="sr-group-status-dot" /> {counters.total} Transport
                                    </button>
                                    <button
                                        type="button"
                                        className={`sr-group-status-badge is-moving ${statusFilter === 'moving' ? 'is-active' : ''}`}

                                        onClick={() => setStatusFilter('moving')}
                                    >
                                        {counters.moving} Harakatda
                                    </button>
                                    <button
                                        type="button"
                                        className={`sr-group-status-badge is-stopped ${statusFilter === 'stopped' ? 'is-active' : ''}`}

                                        onClick={() => setStatusFilter('stopped')}
                                    >
                                        {counters.stopped} To'xtagan
                                    </button>
                                    <button
                                        type="button"
                                        className={`sr-group-status-badge is-offline ${statusFilter === 'offline' ? 'is-active' : ''}`}

                                        onClick={() => setStatusFilter('offline')}
                                    >
                                        {counters.offline} Aloqa yo'q
                                    </button>
                                </span>
                            </div>

                            <div className="sr-sidebar-list">
                                {filteredVehicles.length === 0 ? (
                                    <div className="sr-sidebar-empty">
                                        {t('trackingNotFound')}
                                    </div>
                                ) : (
                                    filteredVehicles.map((vehicle) => {
                                        return (
                                            <button
                                                key={vehicle.id}
                                                type="button"
                                                onClick={() => setSelectedVehicleId(vehicle.id)}
                                                className="sr-object-row"
                                            >
                                                <span className="sr-tree-branch" aria-hidden="true" />
                                                <span
                                                    className={`sr-list-vehicle-icon ${stateStyles[vehicle.status].marker} kind-${vehicle.kind}`}
                                                    dangerouslySetInnerHTML={{ __html: getVehicleInnerSvg(vehicle.name, vehicle.kind) }}
                                                />
                                                <span className="sr-object-main">
                                                    <span className="sr-object-name">{vehicle.name}</span>
                                                    <span className="sr-object-address">{vehicle.address}</span>
                                                </span>
                                                <span className="sr-object-telemetry">
                                                    <LocateFixed size={17} className="sr-muted-icon" />
                                                    <Radio size={16} className={vehicle.status === 'offline' ? 'sr-red-icon' : 'sr-green-icon'} />
                                                    <KeyRound size={16} className={vehicle.ignition ? 'sr-green-icon' : 'sr-muted-icon'} />
                                                    <span className={vehicle.satellites == null ? 'sr-muted-text' : 'sr-green-text'}>
                                                        {vehicle.satellites ?? '?'}
                                                    </span>
                                                    <span className="sr-blue-text">{formatMetric(vehicle.speed, '')}</span>
                                                    <span className={vehicle.fuelLevel == null ? 'sr-muted-text' : 'sr-slate-text'}>
                                                        {vehicle.fuelLevel == null ? '?' : formatMetric(vehicle.fuelLevel)}
                                                    </span>
                                                    <MoreVertical size={17} className="sr-muted-icon" />
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </aside>

                        <section className="glass-panel relative min-h-[560px] overflow-hidden rounded-2xl border border-slate-700/55 xl:h-[calc(100vh-10.5rem)] xl:min-h-[680px]">
                            <MapContainer
                                center={MAP_FALLBACK_CENTER}
                                zoom={9}
                                minZoom={4}
                                maxZoom={18}
                                scrollWheelZoom
                                className="absolute inset-0 h-full w-full sr-live-map"
                            >
                                <TileLayer attribution={tileConfig.attribution} url={tileConfig.url} />
                                <MapResizeHandler />
                                <MapAutoFit
                                    vehicles={filteredVehicles}
                                    selectedVehicle={filteredVehicles.some((vehicle) => vehicle.id === selectedVehicle?.id) ? selectedVehicle : null}
                                    fitKey={`${statusFilter}:${query.trim().toLowerCase() || 'all'}`}
                                />

                                <VehicleMarkers
                                    vehicles={filteredVehicles}
                                    selectedVehicleId={selectedVehicleId}
                                    onSelect={setSelectedVehicleId}
                                />
                            </MapContainer>

                        </section>
                    </div>
                </>
            )}

            <style>{`
                .sr-garvex-sidebar {
                    display: flex;
                    min-width: 0;
                    min-height: 520px;
                    flex-direction: column;
                    overflow: hidden;
                    border: 1px solid rgba(71, 85, 105, 0.6);
                    border-radius: 1rem;
                    background: linear-gradient(180deg, rgba(30, 41, 59, 0.96) 0%, rgba(15, 23, 42, 0.98) 100%);
                    color: #e2e8f0;
                    box-shadow: 0 22px 42px rgba(2, 6, 23, 0.28);
                    color-scheme: dark;
                }
                @media (min-width: 1280px) {
                    .sr-garvex-sidebar {
                        height: calc(100vh - 10.5rem);
                        min-height: 680px;
                    }
                }
                .sr-sidebar-tab {
                    display: flex;
                    height: 58px;
                    align-items: center;
                    justify-content: center;
                    border-bottom: 1px solid rgba(71, 85, 105, 0.55);
                    background: rgba(15, 23, 42, 0.24);
                    padding: 0 12px;
                }
                .sr-sidebar-tab-content {
                    display: flex;
                    width: 100%;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }
                .sr-sidebar-tab-button {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    height: 58px;
                    border-bottom: 2px solid #38bdf8;
                    color: #60a5fa;
                    font-size: 15px;
                    font-weight: 700;
                    line-height: 1;
                    letter-spacing: 0;
                }
                .sr-sidebar-search {
                    display: flex;
                    height: 40px;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                    border: 1px solid rgba(71, 85, 105, 0.7);
                    border-radius: 0.875rem;
                    background: rgba(15, 23, 42, 0.72);
                    padding: 0 12px;
                    color: #94a3b8;
                }
                .sr-sidebar-search-inline {
                    width: min(300px, 58%);
                    flex: 0 1 300px;
                }
                .sr-sidebar-search input {
                    width: 100%;
                    min-width: 0;
                    border: 0;
                    outline: none;
                    color: #e2e8f0;
                    font-size: 14px;
                    font-weight: 500;
                    background: transparent;
                }
                .sr-sidebar-search input::placeholder {
                    color: #94a3b8;
                }
                .sr-sidebar-toolbar {
                    display: flex;
                    height: 40px;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    border-bottom: 1px solid rgba(71, 85, 105, 0.45);
                    background: rgba(15, 23, 42, 0.08);
                    color: #94a3b8;
                    padding: 0 12px;
                }
                .sr-sidebar-toolbar-left,
                .sr-sidebar-toolbar-right {
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                }
                .sr-sidebar-toolbar-right {
                    gap: 13px;
                }
                .sr-sort-icon {
                    color: #cbd5e1;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0;
                }
                .sr-sidebar-group-row {
                    display: flex;
                    min-height: 44px;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                    border-bottom: 1px solid rgba(71, 85, 105, 0.45);
                    background: rgba(37, 99, 235, 0.12);
                    padding: 8px 12px;
                    color: #e2e8f0;
                }
                .sr-group-title {
                    font-size: 15px;
                    font-weight: 700;
                }
                .sr-group-count {
                    border: 1px solid rgba(96, 165, 250, 0.3);
                    border-radius: 999px;
                    background: rgba(15, 23, 42, 0.42);
                    color: #cbd5e1;
                    padding: 2px 8px;
                    font-size: 12px;
                    line-height: 1.15;
                }
                .sr-group-status-badges {
                    display: inline-flex;
                    min-width: 0;
                    flex: 1 1 auto;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                }
                .sr-group-status-badge {
                    display: inline-flex;
                    min-height: 24px;
                    align-items: center;
                    gap: 5px;
                    border-radius: 999px;
                    border: 1px solid rgba(71, 85, 105, 0.58);
                    background: rgba(15, 23, 42, 0.36);
                    padding: 3px 8px;
                    color: #cbd5e1;
                    font-size: 11px;
                    font-weight: 800;
                    line-height: 1;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
                }
                .sr-group-status-badge:hover {
                    transform: translateY(-1px);
                    border-color: rgba(147, 197, 253, 0.62);
                    background: rgba(37, 99, 235, 0.2);
                    color: #e2e8f0;
                }
                .sr-group-status-badge:focus-visible {
                    outline: 2px solid #60a5fa;
                    outline-offset: 2px;
                }
                .sr-group-status-badge.is-active {
                    border-color: rgba(96, 165, 250, 0.9);
                    background: rgba(37, 99, 235, 0.28);
                    box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.18), 0 0 0 1px rgba(37, 99, 235, 0.12);
                }
                .sr-group-status-badge.is-total {
                    border-color: rgba(34, 211, 238, 0.38);
                    background: rgba(6, 182, 212, 0.12);
                    color: #67e8f9;
                }
                .sr-group-status-badge.is-total.is-active {
                    border-color: rgba(34, 211, 238, 0.75);
                    background: rgba(6, 182, 212, 0.22);
                }
                .sr-group-status-badge.is-moving {
                    border-color: rgba(96, 165, 250, 0.42);
                    background: rgba(37, 99, 235, 0.14);
                    color: #93c5fd;
                }
                .sr-group-status-badge.is-moving.is-active {
                    border-color: rgba(96, 165, 250, 0.8);
                    background: rgba(37, 99, 235, 0.28);
                }
                .sr-group-status-badge.is-stopped {
                    border-color: rgba(245, 158, 11, 0.45);
                    background: rgba(245, 158, 11, 0.13);
                    color: #fcd34d;
                }
                .sr-group-status-badge.is-stopped.is-active {
                    border-color: rgba(245, 158, 11, 0.85);
                    background: rgba(245, 158, 11, 0.25);
                }
                .sr-group-status-badge.is-offline {
                    color: #cbd5e1;
                }
                .sr-group-status-badge.is-offline.is-active {
                    border-color: rgba(148, 163, 184, 0.8);
                    background: rgba(100, 116, 139, 0.24);
                }
                .sr-group-status-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 999px;
                    background: #22d3ee;
                }
                .sr-sidebar-list {
                    min-height: 0;
                    flex: 1;
                    overflow-y: auto;
                    background: transparent;
                    --scrollbar-thumb: rgba(100, 116, 139, 0.85);
                    --scrollbar-track: rgba(15, 23, 42, 0.55);
                    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
                    scrollbar-width: thin;
                    scrollbar-gutter: stable;
                }
                @supports not (scrollbar-color: auto) {
                    .sr-sidebar-list::-webkit-scrollbar {
                        width: 10px;
                    }
                    .sr-sidebar-list::-webkit-scrollbar-track {
                        background: var(--scrollbar-track);
                    }
                    .sr-sidebar-list::-webkit-scrollbar-thumb {
                        border-radius: 999px;
                        border: 2px solid var(--scrollbar-track);
                        background: var(--scrollbar-thumb);
                    }
                }
                .sr-sidebar-empty {
                    margin: 12px;
                    border: 1px dashed rgba(100, 116, 139, 0.6);
                    border-radius: 0.875rem;
                    color: #94a3b8;
                    padding: 14px;
                    font-size: 14px;
                    background: rgba(15, 23, 42, 0.36);
                }
                .sr-object-row {
                    position: relative;
                    display: grid;
                    width: 100%;
                    min-width: 0;
                    grid-template-columns: 17px 23px minmax(0, 1fr) 198px;
                    align-items: center;
                    column-gap: 8px;
                    min-height: 52px;
                    border-bottom: 0;
                    background: transparent;
                    padding: 6px 12px 6px 12px;
                    text-align: left;
                    transition: background-color 0.16s ease;
                }
                .sr-object-row:hover {
                    background: rgba(37, 99, 235, 0.16);
                }
                .sr-tree-branch {
                    position: relative;
                    display: block;
                    width: 17px;
                    height: 52px;
                    border-left: 1px solid rgba(71, 85, 105, 0.55);
                }
                .sr-tree-branch::after {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 50%;
                    width: 12px;
                    border-top: 1px solid rgba(71, 85, 105, 0.55);
                }
                .sr-list-vehicle-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 34px;
                    height: 28px;
                    color: #1169ff;
                    opacity: 1;
                }
                .sr-list-vehicle-icon svg,
                .sr-list-vehicle-icon img {
                    width: 28px;
                    height: 28px;
                    fill: currentColor;
                    stroke: none;
                    object-fit: contain;
                    opacity: 1;
                }
                .sr-list-vehicle-icon svg image {
                    filter: brightness(0) saturate(100%) invert(67%) sepia(91%) saturate(1210%) hue-rotate(1deg) brightness(104%) contrast(104%);
                }
                .sr-list-vehicle-icon.kind-forklift,
                .sr-list-vehicle-icon.kind-loader {
                    color: #d97706;
                }
                .sr-list-vehicle-icon.kind-truck {
                    color: #2563eb;
                }
                .sr-list-vehicle-icon.is-offline {
                    color: #9ca3af;
                }
                .sr-object-main {
                    display: flex;
                    min-width: 0;
                    flex-direction: column;
                    justify-content: center;
                }
                .sr-object-name {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #f8fafc;
                    font-size: 15px;
                    font-weight: 700;
                    line-height: 1.15;
                }
                .sr-object-address {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #94a3b8;
                    font-size: 12px;
                    line-height: 1.2;
                    margin-top: 2px;
                }
                .sr-object-telemetry {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    align-items: center;
                    justify-items: center;
                    gap: 7px;
                    color: #94a3b8;
                    font-size: 12px;
                    font-weight: 500;
                }
                .sr-muted-icon,
                .sr-muted-text {
                    color: #94a3b8;
                }
                .sr-green-icon,
                .sr-green-text {
                    color: #22c55e;
                }
                .sr-red-icon {
                    color: #f87171;
                }
                .sr-blue-text {
                    color: #60a5fa;
                }
                .sr-slate-text {
                    color: #cbd5e1;
                }
                @media (max-width: 700px) {
                    .sr-sidebar-tab {
                        height: auto;
                        padding-top: 10px;
                        padding-bottom: 10px;
                    }
                    .sr-sidebar-tab-content {
                        flex-wrap: wrap;
                    }
                    .sr-sidebar-tab-button {
                        height: 36px;
                    }
                    .sr-sidebar-search-inline {
                        width: 100%;
                        flex-basis: 100%;
                    }
                    .sr-object-row {
                        grid-template-columns: 17px 23px minmax(0, 1fr);
                    }
                    .sr-object-telemetry,
                    .sr-sidebar-toolbar-right {
                        display: none;
                    }
                }
                .sr-live-map .leaflet-control-zoom {
                    margin-top: 14px;
                    margin-left: 14px;
                    border: 1px solid rgba(15, 23, 42, 0.18);
                }
                .sr-live-map .leaflet-tile {
                    filter: saturate(1.03) contrast(1.02);
                }
                .sr-garvex-marker {
                    position: relative;
                    width: 40px;
                    height: 40px;
                    border-radius: 9999px;
                    border: 4px solid #7fb0ff;
                    background: #ffffff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.95);
                    transition: transform 0.16s ease, box-shadow 0.16s ease;
                }
                .sr-garvex-marker::before {
                    content: '';
                    position: absolute;
                    inset: -5px;
                    border-radius: 9999px;
                    background: rgba(37, 99, 235, 0.16);
                    z-index: -1;
                }
                .sr-garvex-marker-icon,
                .sr-popup-vehicle-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .sr-garvex-marker-icon {
                    transform: rotate(var(--sr-vehicle-rotation, 0deg));
                    transform-origin: center;
                    transition: transform 0.16s ease;
                }
                .sr-garvex-marker svg,
                .sr-popup-vehicle-icon svg,
                .sr-garvex-marker img,
                .sr-popup-vehicle-icon img {
                    width: 24px;
                    height: 24px;
                    stroke: none;
                    object-fit: contain;
                }
                .sr-garvex-marker.is-moving {
                    border-color: #49d17b;
                    box-shadow: 0 3px 11px rgba(34, 197, 94, 0.32);
                }
                .sr-garvex-marker.is-moving::before {
                    background: rgba(34, 197, 94, 0.18);
                }
                .sr-garvex-marker.is-stopped {
                    border-color: #79b7ff;
                    box-shadow: 0 3px 11px rgba(37, 99, 235, 0.28);
                }
                .sr-garvex-marker.is-stopped::before {
                    background: rgba(37, 99, 235, 0.16);
                }
                .sr-garvex-marker.is-offline {
                    border-color: #fb7777;
                    box-shadow: 0 3px 11px rgba(239, 68, 68, 0.3);
                }
                .sr-garvex-marker.is-offline::before {
                    background: rgba(239, 68, 68, 0.16);
                }
                .sr-garvex-marker.is-selected {
                    transform: scale(1.08);
                    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.42);
                    z-index: 2;
                }
                .sr-cluster-count {
                    position: absolute;
                    top: -9px;
                    right: -8px;
                    display: inline-flex;
                    min-width: 22px;
                    height: 22px;
                    align-items: center;
                    justify-content: center;
                    border-radius: 999px;
                    border: 2px solid #ffffff;
                    background: #1169ff;
                    color: #ffffff;
                    padding: 0 5px;
                    font-size: 12px;
                    font-weight: 800;
                    line-height: 1;
                    box-shadow: 0 2px 7px rgba(17, 105, 255, 0.4);
                }
                .sr-garvex-label.leaflet-tooltip {
                    border: 0;
                    border-radius: 5px;
                    background: #ffffff;
                    color: #4b5563;
                    padding: 4px 7px;
                    font-size: 11.5px;
                    font-weight: 800;
                    line-height: 1.05;
                    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.22);
                }
                .sr-garvex-label.leaflet-tooltip-bottom::before {
                    display: none;
                }
                .sr-garvex-popup .leaflet-popup-content-wrapper {
                    border-radius: 4px;
                    padding: 0;
                    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25);
                }
                .sr-garvex-popup .leaflet-popup-content {
                    margin: 0;
                    width: 420px !important;
                }
                .sr-garvex-popup-card {
                    overflow: hidden;
                    border-radius: 4px;
                    background: #ffffff;
                    color: #4b5563;
                    font-size: 14px;
                }
                .sr-popup-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 12px 14px 8px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .sr-popup-title-row {
                    display: flex;
                    align-items: center;
                    min-width: 0;
                    gap: 8px;
                }
                .sr-popup-vehicle-icon,
                .sr-popup-vehicle-image {
                    width: 24px;
                    height: 24px;
                    flex: 0 0 auto;
                    color: #2563eb;
                }
                .sr-popup-vehicle-image svg,
                .sr-popup-vehicle-image img {
                    width: 24px;
                    height: 24px;
                    object-fit: contain;
                }
                .sr-popup-title {
                    color: #4b5563;
                    font-size: 16px;
                    font-weight: 800;
                }
                .sr-popup-status {
                    margin-left: 32px;
                    margin-top: 2px;
                    font-size: 12px;
                    font-weight: 700;
                }
                .sr-popup-status.is-moving {
                    color: #16a34a;
                }
                .sr-popup-status.is-stopped {
                    color: #2563eb;
                }
                .sr-popup-status.is-offline {
                    color: #dc2626;
                }
                .sr-popup-time {
                    flex: 0 0 auto;
                    text-align: right;
                    color: #9ca3af;
                    font-size: 12px;
                    font-weight: 700;
                    line-height: 1.35;
                }
                .sr-popup-metrics {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    margin: 10px 12px;
                    border: 1px solid #d9dde3;
                    border-radius: 4px;
                    overflow: hidden;
                }
                .sr-popup-metrics div {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 7px;
                    min-height: 32px;
                    color: #4b5563;
                    border-right: 1px solid #e5e7eb;
                    font-size: 13px;
                }
                .sr-popup-metrics div:last-child {
                    border-right: 0;
                }
                .sr-popup-details {
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .sr-popup-details span {
                    color: #64748b;
                    font-weight: 500;
                    margin-right: 4px;
                }
                .sr-popup-detail-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }
                .sr-popup-address {
                    position: relative;
                    padding-right: 42px;
                    margin-top: 4px;
                }
                .sr-popup-detail-actions {
                    position: absolute;
                    top: 0;
                    right: 0;
                    display: inline-flex;
                    gap: 7px;
                    color: #6b7280;
                }
                .sr-popup-sensors {
                    margin: 0 12px 10px;
                    border-radius: 5px;
                    overflow: hidden;
                    background: #f4f6f9;
                }
                .sr-popup-sensors-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 9px 10px;
                    background: #edf3fb;
                    color: #374151;
                    font-weight: 800;
                }
                .sr-popup-sensor-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    color: #4b5563;
                    font-size: 12px;
                }
                .sr-popup-sensor-grid div {
                    padding: 8px 10px;
                    border-top: 1px solid #e5e7eb;
                }
                .sr-popup-sensor-grid div:nth-child(odd) {
                    border-right: 1px solid #e5e7eb;
                }
                .sr-popup-toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 14px;
                    padding: 8px 14px 10px;
                    color: #6b7280;
                    border-top: 1px solid #eef0f3;
                }
                .sr-popup-toolbar span {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 34px;
                    height: 34px;
                    border-radius: 4px;
                    background: #f8f9fa;
                    color: #6b7280;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .sr-popup-toolbar span:hover {
                    background: #e5e7eb;
                    color: #1f2937;
                }
                .sr-cluster-popup .leaflet-popup-content {
                    width: 260px !important;
                    max-height: 350px;
                    overflow-y: auto;
                    margin: 0;
                    padding: 8px 0;
                }
                .sr-cluster-list {
                    display: flex;
                    flex-direction: column;
                }
                .sr-cluster-list-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 16px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .sr-cluster-list-item:hover {
                    background: #f3f4f6;
                }
                .sr-cluster-item-image {
                    width: 24px;
                    height: 24px;
                    flex: 0 0 auto;
                }
                .sr-cluster-item-image svg,
                .sr-cluster-item-image img {
                    width: 24px;
                    height: 24px;
                    object-fit: contain;
                }
                .sr-cluster-item-info {
                    flex: 1;
                    min-width: 0;
                }
                .sr-cluster-item-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #4b5563;
                }
                .sr-cluster-item-status {
                    font-size: 12px;
                    font-weight: 600;
                    margin-top: 2px;
                }
                .sr-cluster-item-status.is-moving { color: #16a34a; }
                .sr-cluster-item-status.is-stopped { color: #2563eb; }
                .sr-cluster-item-status.is-offline { color: #dc2626; }
            `}</style>
        </div>
    );
};
