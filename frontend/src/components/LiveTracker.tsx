import { useEffect, useMemo, useRef, useState } from 'react';
import {
    CircleDot,
    Clock3,
    Fuel,
    Gauge,
    Info,
    KeyRound,
    MapPin,
    Satellite,
    Search,
    Truck,
} from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon, latLngBounds } from 'leaflet';
import { resolveApiBaseUrl } from '../utils/apiBase';
import 'leaflet/dist/leaflet.css';

type VehicleState = 'moving' | 'stopped' | 'offline';

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
    lastMessageAt: string | null;
    syncedAt: string | null;
};

type VehicleMarkerCluster = {
    id: string;
    lat: number;
    lng: number;
    status: VehicleState;
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

type LiveTrackerProps = {
    lang?: string;
};

const API_BASE = resolveApiBaseUrl();
const LIVE_AFTER_MS = 15 * 60 * 1000;
const SYNC_INTERVAL_MS = 10_000;
const MAP_FALLBACK_CENTER: [number, number] = [38.34, 66.44];

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

const buildVehicleIcon = (state: VehicleState, isSelected = false, count = 1) => {
    const countLabel = count > 1 ? String(count) : '';
    const cacheKey = `${state}:${isSelected ? 'selected' : 'normal'}:${countLabel}`;
    const cached = vehicleIconCache.get(cacheKey);
    if (cached) return cached;

    const icon = divIcon({
        className: '',
        iconSize: count > 1 ? [46, 46] : [38, 38],
        iconAnchor: count > 1 ? [23, 23] : [19, 19],
        html: `
            <div class="sr-garvex-marker ${stateStyles[state].marker} ${count > 1 ? 'is-cluster' : ''} ${isSelected ? 'is-selected' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M10 17h4V5H2v12h3"></path>
                    <path d="M14 17h1"></path>
                    <path d="M14 8h4l4 4v5h-3"></path>
                    <circle cx="7.5" cy="17.5" r="2.5"></circle>
                    <circle cx="17.5" cy="17.5" r="2.5"></circle>
                </svg>
                ${countLabel ? `<span class="sr-marker-count">${countLabel}</span>` : ''}
            </div>
        `,
    });
    vehicleIconCache.set(cacheKey, icon);
    return icon;
};

const getVehicleIcon = (state: VehicleState, isSelected: boolean, count = 1) =>
    buildVehicleIcon(state, isSelected, count);

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

const toVehicleState = (speed: number, lastMessageAt: string | null | undefined, lastMessageUnix: number | null | undefined): VehicleState => {
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
    return date.toLocaleString('uz-UZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
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

const makeClusterKey = (vehicle: TrackingVehicle) =>
    `${Math.round(vehicle.lat * 100) / 100}:${Math.round(vehicle.lng * 100) / 100}`;

const clusterVehicles = (items: TrackingVehicle[]): VehicleMarkerCluster[] => {
    const groups = new Map<string, TrackingVehicle[]>();
    for (const item of items) {
        const key = makeClusterKey(item);
        const group = groups.get(key);
        if (group) group.push(item);
        else groups.set(key, [item]);
    }

    const statusRank: Record<VehicleState, number> = { moving: 0, stopped: 1, offline: 2 };
    return Array.from(groups.entries()).map(([id, group]) => {
        const sorted = [...group].sort((a, b) => statusRank[a.status] - statusRank[b.status]);
        const lat = group.reduce((sum, item) => sum + item.lat, 0) / group.length;
        const lng = group.reduce((sum, item) => sum + item.lng, 0) / group.length;
        return { id, lat, lng, status: sorted[0]?.status ?? 'offline', vehicles: sorted };
    });
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
        status: toVehicleState(speed, item.lastMessageAt, item.lastMessageUnix),
        lastMessageAt: item.lastMessageAt || null,
        syncedAt: item.syncedAt || null,
    };
};

const MapAutoFit = ({
    vehicles,
    selectedVehicle,
}: {
    vehicles: TrackingVehicle[];
    selectedVehicle: TrackingVehicle | null;
}) => {
    const map = useMap();

    useEffect(() => {
        const t = window.setTimeout(() => map.invalidateSize(), 80);
        return () => window.clearTimeout(t);
    }, [map]);

    useEffect(() => {
        if (selectedVehicle) {
            map.setView([selectedVehicle.lat, selectedVehicle.lng], Math.max(map.getZoom(), 14), { animate: true });
            return;
        }

        if (vehicles.length === 0) {
            map.setView(MAP_FALLBACK_CENTER, 9, { animate: false });
            return;
        }

        const bounds = latLngBounds(vehicles.map((vehicle) => [vehicle.lat, vehicle.lng] as [number, number]));
        map.fitBounds(bounds.pad(0.22), { animate: true, maxZoom: 13 });
    }, [map, selectedVehicle, vehicles]);

    return null;
};

export const LiveTracker = ({ lang: _lang }: LiveTrackerProps) => {
    const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
    const [vehicles, setVehicles] = useState<TrackingVehicle[]>([]);
    const [query, setQuery] = useState('');
    const [source, setSource] = useState<'garvex' | 'stale' | 'empty'>('empty');
    const [syncMessage, setSyncMessage] = useState<string | null>('Garvexdan jonli GPS ma`lumotlari olinmoqda...');
    const [lastSyncAtLabel, setLastSyncAtLabel] = useState<string | null>(null);
    const [lastStats, setLastStats] = useState<GarvexHealthResponse['stats'] | null>(null);
    const cacheRef = useRef<TrackingVehicle[]>([]);
    const cacheAtRef = useRef<number>(0);
    const inFlightRef = useRef(false);

    const load = async (forceSync = false) => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;

        try {
            if (forceSync) {
                await fetch(`${API_BASE}/integrations/tracking/garvex/sync`, {
                    cache: 'no-store',
                }).catch(() => null);
            }

            const [healthResponse, vehiclesResponse] = await Promise.all([
                fetch(`${API_BASE}/integrations/tracking/garvex/health`, { cache: 'no-store' }),
                fetch(`${API_BASE}/integrations/tracking/garvex/vehicles`, { cache: 'no-store' }),
            ]);

            const health = healthResponse.ok
                ? await healthResponse.json().catch(() => null) as GarvexHealthResponse | null
                : null;
            const payload = vehiclesResponse.ok
                ? await vehiclesResponse.json().catch(() => null) as GarvexVehiclesResponse | null
                : null;

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
                setVehicles(mapped);
                setSource('garvex');
                setSyncMessage(null);
                setLastStats(health?.stats ?? null);
                cacheRef.current = mapped;
                cacheAtRef.current = Date.now();
                const syncAtIso = health?.lastSyncAt || mapped[0]?.syncedAt || new Date().toISOString();
                setLastSyncAtLabel(formatDateTime(syncAtIso));
                setSelectedVehicleId((prev) => (prev && mapped.some((vehicle) => vehicle.id === prev) ? prev : mapped[0].id));
                return;
            }

            const canUseCache = cacheRef.current.length > 0 && (Date.now() - cacheAtRef.current) <= (5 * 60 * 1000);
            if (canUseCache) {
                setVehicles(cacheRef.current);
                setSource('stale');
                setSyncMessage('Vaqtincha so`nggi ishonchli GPS nuqtalari ko`rsatilmoqda.');
                return;
            }

            setVehicles([]);
            setSource('empty');

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
                setVehicles(cacheRef.current);
                setSource('stale');
                setSyncMessage('Tarmoq uzilishi: so`nggi GPS nuqtalari saqlandi.');
            } else {
                setVehicles([]);
                setSource('empty');
                setSyncMessage('Garvex bilan ulanishda tarmoq xatosi.');
            }
        } finally {
            inFlightRef.current = false;
        }
    };

    useEffect(() => {
        void load(true);
        const timer = window.setInterval(() => {
            void load(true);
        }, SYNC_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (selectedVehicleId == null) return;
        const exists = vehicles.some((vehicle) => vehicle.id === selectedVehicleId);
        if (!exists) setSelectedVehicleId(vehicles[0]?.id ?? null);
    }, [vehicles, selectedVehicleId]);

    const selectedVehicle = useMemo(
        () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
        [vehicles, selectedVehicleId],
    );

    const counters = useMemo(() => {
        const moving = vehicles.filter((vehicle) => vehicle.status === 'moving').length;
        const stopped = vehicles.filter((vehicle) => vehicle.status === 'stopped').length;
        const offline = vehicles.filter((vehicle) => vehicle.status === 'offline').length;
        return { moving, stopped, offline, live: moving + stopped, total: vehicles.length };
    }, [vehicles]);

    const filteredVehicles = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return vehicles;
        return vehicles.filter((vehicle) =>
            `${vehicle.name} ${vehicle.imei ?? ''} ${vehicle.address} ${vehicle.region}`.toLowerCase().includes(q),
        );
    }, [query, vehicles]);

    const markerClusters = useMemo(() => clusterVehicles(filteredVehicles), [filteredVehicles]);

    const tileConfig = {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };

    return (
        <div className="flex h-full min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <h3 className="app-module-heading">Tezkor xarita (Garvex GPS)</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> {counters.live} Jonli
                    </span>
                    <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
                        {counters.moving} Harakatda
                    </span>
                    <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                        {counters.stopped} To`xtagan
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-700/25 px-3 py-1 text-xs font-bold text-slate-300">
                        {counters.offline} Aloqa yo`q
                    </span>
                </div>
            </div>

            {syncMessage ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
                    {syncMessage}
                </div>
            ) : null}

            <div className="grid min-h-[680px] grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                <aside className="glass-panel flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-700/55 xl:h-[calc(100vh-10.5rem)] xl:min-h-[680px]">
                    <div className="border-b border-slate-700/55 p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                                    <Truck size={18} className="text-blue-400" />
                                    Transportlar
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                    Kaliy zavod <span className="font-semibold text-blue-300">{filteredVehicles.length} / {counters.total}</span>
                                </div>
                            </div>
                            <div className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                                source === 'garvex'
                                    ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300'
                                    : source === 'stale'
                                        ? 'border-amber-400/30 bg-amber-500/10 text-amber-300'
                                        : 'border-slate-500/30 bg-slate-700/25 text-slate-300'
                            }`}>
                                {source === 'garvex' ? 'Garvex live' : source === 'stale' ? 'Keshlangan' : 'Kutilmoqda'}
                            </div>
                        </div>
                        <label className="relative block">
                            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950/50 pl-9 pr-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500"
                                placeholder="Transport, IMEI yoki manzil..."
                            />
                        </label>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-700/45 bg-slate-950/25 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <span className="inline-flex items-center gap-2">
                            <CircleDot size={13} /> Obyektlar
                        </span>
                        <span>{lastSyncAtLabel ? `Sync: ${lastSyncAtLabel}` : 'Sync kutilmoqda'}</span>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto dark-scrollbar">
                        {filteredVehicles.length === 0 ? (
                            <div className="m-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/35 p-4 text-sm text-slate-400">
                                Transport topilmadi.
                            </div>
                        ) : (
                            filteredVehicles.map((vehicle) => {
                                const selected = vehicle.id === selectedVehicleId;
                                const styles = stateStyles[vehicle.status];
                                return (
                                    <button
                                        key={vehicle.id}
                                        type="button"
                                        onClick={() => setSelectedVehicleId(vehicle.id)}
                                        className={`flex w-full min-w-0 items-start gap-3 border-b border-slate-800/70 px-3 py-2.5 text-left transition-colors ${
                                            selected ? 'bg-blue-500/14' : 'hover:bg-slate-800/45'
                                        }`}
                                    >
                                        <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-blue-500 bg-blue-500 text-[10px] text-white">
                                            OK
                                        </span>
                                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex min-w-0 items-center justify-between gap-2">
                                                <span className="truncate text-sm font-semibold text-slate-100">{vehicle.name}</span>
                                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${styles.badge}`}>
                                                    {styles.label}
                                                </span>
                                            </span>
                                            <span className="mt-0.5 line-clamp-1 text-xs text-slate-500">{vehicle.address}</span>
                                            <span className="mt-2 grid grid-cols-4 gap-1.5 text-[11px] text-slate-400">
                                                <span className="inline-flex items-center gap-1">
                                                    <Gauge size={12} className="text-blue-400" /> {formatMetric(vehicle.speed, '')}
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Satellite size={12} className="text-emerald-400" /> {formatMetric(vehicle.satellites)}
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <KeyRound size={12} className={vehicle.ignition ? 'text-emerald-400' : 'text-slate-500'} /> {vehicle.ignition ? 'On' : 'Off'}
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Fuel size={12} className="text-amber-400" /> {formatMetric(vehicle.fuelLevel)}
                                                </span>
                                            </span>
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
                        <MapAutoFit vehicles={filteredVehicles.length > 0 ? filteredVehicles : vehicles} selectedVehicle={selectedVehicle} />

                        {markerClusters.map((cluster) => {
                            const isSelected = cluster.vehicles.some((vehicle) => vehicle.id === selectedVehicleId);
                            const primary =
                                (isSelected ? cluster.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) : undefined) ??
                                cluster.vehicles[0];

                            if (!primary) {
                                return null;
                            }

                            return (
                                <Marker
                                    key={cluster.id}
                                    position={[cluster.lat, cluster.lng]}
                                    icon={getVehicleIcon(cluster.status, isSelected, cluster.vehicles.length)}
                                    eventHandlers={{ click: () => setSelectedVehicleId(primary.id) }}
                                >
                                    <Tooltip direction="top" offset={[0, -18]} opacity={1} className="sr-vehicle-tooltip">
                                        <div className="min-w-[170px] space-y-1">
                                            <p className="font-bold text-blue-300">
                                                {cluster.vehicles.length > 1 ? `${cluster.vehicles.length} ta transport` : primary.name}
                                            </p>
                                            <p className="text-[11px] text-slate-300">{primary.region}</p>
                                            <div className="flex justify-between gap-4">
                                                <span>Tezlik</span>
                                                <span className="font-mono text-slate-100">{formatMetric(primary.speed, ' km/s')}</span>
                                            </div>
                                        </div>
                                    </Tooltip>
                                    <Popup className="sr-vehicle-popup">
                                        <div className="w-[240px] space-y-2">
                                            <div className="font-bold text-slate-900">
                                                {cluster.vehicles.length > 1 ? `${cluster.vehicles.length} ta transport` : primary.name}
                                            </div>
                                            <div className="text-xs text-slate-600">{primary.address}</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>Tezlik: <b>{formatMetric(primary.speed, ' km/s')}</b></div>
                                                <div>Sun'iy yo'ldosh: <b>{formatMetric(primary.satellites)}</b></div>
                                                <div>Yoqilgi: <b>{formatMetric(primary.fuelLevel)}</b></div>
                                                <div>Holat: <b>{stateStyles[cluster.status].label}</b></div>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </MapContainer>

                    <div className="absolute bottom-4 left-4 z-[500] w-[min(360px,calc(100%-2rem))] rounded-2xl border border-slate-700/80 bg-slate-950/86 p-4 shadow-2xl backdrop-blur-md">
                        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                            <Info size={14} className="text-blue-400" /> Tanlangan obyekt
                        </h4>
                        {selectedVehicle ? (
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-bold text-slate-100">{selectedVehicle.name}</div>
                                        <div className="mt-0.5 truncate text-xs text-slate-500">{selectedVehicle.imei ?? 'IMEI yoq'}</div>
                                    </div>
                                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${stateStyles[selectedVehicle.status].badge}`}>
                                        {stateStyles[selectedVehicle.status].label}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-2">
                                        <p className="text-slate-500">Tezlik</p>
                                        <p className="font-bold text-slate-100">{formatMetric(selectedVehicle.speed, ' km/s')}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-2">
                                        <p className="text-slate-500">GPS</p>
                                        <p className="font-bold text-slate-100">{formatMetric(selectedVehicle.satellites)} sats</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-2">
                                        <p className="text-slate-500">Yoqilgi</p>
                                        <p className="font-bold text-slate-100">{formatMetric(selectedVehicle.fuelLevel)}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-2">
                                        <p className="text-slate-500">Xabar</p>
                                        <p className="font-bold text-slate-100">{formatAgo(selectedVehicle.lastMessageAt)}</p>
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-2 text-xs text-slate-300">
                                    <div className="mb-1 flex items-center gap-1.5 text-slate-500">
                                        <MapPin size={13} /> Manzil
                                    </div>
                                    <p className="line-clamp-2">{selectedVehicle.address}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-3 text-xs text-slate-300">
                                Transport tanlang.
                            </div>
                        )}
                    </div>

                    <div className="absolute bottom-4 right-4 z-[500] rounded-xl border border-slate-700/70 bg-slate-950/78 px-3 py-2 text-[11px] font-semibold text-slate-300 backdrop-blur">
                        <div className="flex items-center gap-1.5">
                            <Clock3 size={13} className="text-blue-400" />
                            {lastSyncAtLabel ? `So'nggi sync: ${lastSyncAtLabel}` : 'Sync kutilmoqda'}
                        </div>
                        {lastStats?.mode ? (
                            <div className="mt-1 text-slate-500">
                                {lastStats.mode} / fetched {lastStats.fetched ?? 0}
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>

            <style>{`
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
                    width: 34px;
                    height: 34px;
                    border-radius: 9999px;
                    border: 4px solid rgba(219, 234, 254, 0.98);
                    color: #ffffff;
                    background: #2b7cff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 5px 16px rgba(37, 99, 235, 0.42);
                    transition: transform 0.18s ease, box-shadow 0.18s ease;
                }
                .sr-garvex-marker.is-cluster {
                    width: 42px;
                    height: 42px;
                    background: #2f80ff;
                    box-shadow: 0 7px 20px rgba(37, 99, 235, 0.44);
                }
                .sr-garvex-marker::before {
                    display: none;
                }
                .sr-garvex-marker svg {
                    position: relative;
                    z-index: 1;
                    width: 18px;
                    height: 18px;
                }
                .sr-garvex-marker.is-moving {
                    background: #2b7cff;
                }
                .sr-garvex-marker.is-stopped {
                    background: #2f80ff;
                    box-shadow: 0 5px 16px rgba(37, 99, 235, 0.36);
                }
                .sr-garvex-marker.is-stopped::before {
                    display: none;
                }
                .sr-garvex-marker.is-offline {
                    background: #2f80ff;
                    opacity: 0.72;
                    box-shadow: 0 5px 16px rgba(37, 99, 235, 0.32);
                }
                .sr-garvex-marker.is-offline::before {
                    display: none;
                }
                .sr-garvex-marker.is-selected {
                    transform: scale(1.14);
                    box-shadow: 0 10px 28px rgba(59, 130, 246, 0.64);
                    z-index: 2;
                }
                .sr-garvex-marker.is-selected::after {
                    content: '';
                    position: absolute;
                    inset: -5px;
                    border-radius: 9999px;
                    border: 2px solid rgba(255, 255, 255, 0.92);
                }
                .sr-marker-count {
                    position: absolute;
                    right: -6px;
                    top: -8px;
                    z-index: 2;
                    min-width: 21px;
                    height: 21px;
                    border-radius: 9999px;
                    border: 2px solid #bfdbfe;
                    background: #1d4ed8;
                    color: #ffffff;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 5px;
                    font-size: 11px;
                    font-weight: 800;
                    line-height: 1;
                    box-shadow: 0 3px 10px rgba(30, 64, 175, 0.38);
                }
                .sr-vehicle-tooltip.leaflet-tooltip {
                    background: rgba(15, 23, 42, 0.96);
                    border: 1px solid rgba(71, 85, 105, 0.9);
                    color: #e2e8f0;
                    border-radius: 12px;
                    padding: 8px 10px;
                    box-shadow: 0 16px 30px rgba(2, 6, 23, 0.45);
                }
                .sr-vehicle-tooltip.leaflet-tooltip-top:before {
                    border-top-color: rgba(15, 23, 42, 0.96);
                }
                .sr-vehicle-popup .leaflet-popup-content-wrapper {
                    border-radius: 14px;
                }
            `}</style>
        </div>
    );
};
