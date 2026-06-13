import { useEffect, useMemo, useRef, useState } from 'react';
import { startTransition } from 'react';
import {
    Check,
    ChevronDown,
    CircleDot,
    Copy,
    ExternalLink,
    Fuel,
    Gauge,
    KeyRound,
    List,
    LocateFixed,
    MessageSquare,
    MoreVertical,
    Pencil,
    Radio,
    RotateCw,
    Satellite,
    Search,
    Truck,
    Wrench,
    X,
} from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { divIcon, latLngBounds, type Map as LeafletMap } from 'leaflet';
import { useI18n } from '../i18n';
import { resolveApiBaseUrl } from '../utils/apiBase';
import 'leaflet/dist/leaflet.css';

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

type LiveTrackerProps = {
    lang?: string;
};

const API_BASE = resolveApiBaseUrl();
const LIVE_AFTER_MS = 15 * 60 * 1000;
const SYNC_INTERVAL_MS = 15_000;
const HEALTH_REFRESH_MS = 60_000;
const SYNC_TRIGGER_MS = 45_000;
const MAP_FALLBACK_CENTER: [number, number] = [38.34, 66.44];

const vehicleSvgByKind: Record<VehicleKind, string> = {
    car: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.1 10.7 7.4 7.2C7.8 6.1 8.8 5.4 10 5.4h4c1.2 0 2.2.7 2.6 1.8l1.3 3.5h.8c.9 0 1.6.7 1.6 1.6v3.2c0 .6-.5 1.1-1.1 1.1h-1.1a2.7 2.7 0 0 1-5.2 0H11a2.7 2.7 0 0 1-5.2 0H4.7c-.6 0-1.1-.5-1.1-1.1v-3.2c0-.9.7-1.6 1.6-1.6h.9Zm3.6-3.2c-.3 0-.6.2-.8.6l-.9 2.6h8l-.9-2.6c-.2-.4-.5-.6-.8-.6H9.7Z"></path>
            <path d="M7.6 16.8a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm8.8 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"></path>
        </svg>
    `,
    truck: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.4 6.4h10.4c.5 0 .9.4.9.9v8.2H10a2.8 2.8 0 0 0-5.4 0H3.4c-.5 0-.9-.4-.9-.9V7.3c0-.5.4-.9.9-.9Z"></path>
            <path d="M15.7 9.4h3l2.8 3.3v2.8h-1.2a2.8 2.8 0 0 0-5.4 0h-.2V10.4c0-.6.4-1 1-1Z"></path>
            <path d="M7.3 18.2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10.3 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path>
        </svg>
    `,
    forklift: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.2 9.4h4.5c.5 0 .9.4.9.9v4.2h2.2V6.6c0-.6.5-1 1-1s1 .4 1 1v9.8h3.4c.6 0 1 .5 1 1s-.4 1-1 1H15c-.6 0-1-.4-1-1v-.9H9.7a2.7 2.7 0 0 1-5.3-.1H3.2c-.5 0-.9-.4-.9-.9v-2.7c0-.5.4-.9.9-.9H5V10.6c0-.7.5-1.2 1.2-1.2Z"></path>
            <path d="M11.6 9.4h-3l1.8-2.6h2.7v2.6h-1.5Zm-4.6 8a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"></path>
            <path d="M18.9 5.8c.6 0 1 .4 1 1v8.5h-2V6.8c0-.6.4-1 1-1Z"></path>
        </svg>
    `,
    loader: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.4 13.1h4.2l1.6-3.7h3.7l2.8 3.7h2.1l1.3-3h2.4l-1.2 5.3h-3.5a3 3 0 0 0-5.8 0H9.8a3 3 0 0 0-5.8 0H2.5c-.5 0-.9-.4-.9-.9v-.5c0-.5.4-.9.9-.9h.9Z"></path>
            <path d="M6.9 17.7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM4.5 12.1l-1.7-3h4.7l.8 3H4.5Z"></path>
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

const buildVehicleIcon = (state: VehicleState, kind: VehicleKind, isSelected = false, count = 1) => {
    const countLabel = count > 1 ? String(count) : '';
    const cacheKey = `${state}:${kind}:${isSelected ? 'selected' : 'normal'}:${countLabel}`;
    const cached = vehicleIconCache.get(cacheKey);
    if (cached) return cached;

    const icon = divIcon({
        className: '',
        iconSize: count > 1 ? [44, 44] : [38, 38],
        iconAnchor: count > 1 ? [22, 22] : [19, 19],
        html: `
            <div class="sr-garvex-marker ${stateStyles[state].marker} kind-${kind} ${isSelected ? 'is-selected' : ''}">
                <span class="sr-garvex-marker-icon">${vehicleSvgByKind[kind]}</span>
                ${countLabel ? `<span class="sr-cluster-count">${countLabel}</span>` : ''}
            </div>
        `,
    });
    vehicleIconCache.set(cacheKey, icon);
    return icon;
};

const getVehicleIcon = (state: VehicleState, kind: VehicleKind, isSelected: boolean, count = 1) =>
    buildVehicleIcon(state, kind, isSelected, count);

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
                const markerKind = isCluster ? 'car' : representative.kind;

                return (
                    <Marker
                        key={cluster.id}
                        position={[cluster.lat, cluster.lng]}
                        icon={getVehicleIcon(markerState, markerKind, isSelected, cluster.vehicles.length)}
                        eventHandlers={{
                            click: () => {
                                if (isCluster) {
                                    map.setView([cluster.lat, cluster.lng], Math.min(map.getZoom() + 2, 18), { animate: true });
                                } else {
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
                                                    <span
                                                        className={`sr-popup-vehicle-icon ${stateStyles[representative.status].marker} kind-${representative.kind}`}
                                                        dangerouslySetInnerHTML={{ __html: vehicleSvgByKind[representative.kind] }}
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
                                            <div><Gauge size={16} /> <b>{formatMetric(representative.speed, ' km/h')}</b></div>
                                            <div><KeyRound size={16} /> <b>{representative.ignition ? 'On' : 'Off'}</b></div>
                                            <div><Satellite size={16} /> <b>{formatMetric(representative.satellites)}</b></div>
                                        </div>

                                        <div className="sr-popup-details">
                                            <div><span>Koordinatalar:</span> {formatCoordinates(representative)}</div>
                                            <div className="sr-popup-address">
                                                <span>Adres:</span> {representative.address}
                                                <span className="sr-popup-detail-actions">
                                                    <Copy size={15} />
                                                    <ExternalLink size={15} />
                                                </span>
                                            </div>
                                        </div>

                                        <div className="sr-popup-sensors">
                                            <div className="sr-popup-sensors-header">
                                                <span>Datchiklar</span>
                                                <span>v</span>
                                            </div>
                                            <div className="sr-popup-sensor-grid">
                                                <div>DART: <b>N/A</b></div>
                                                <div>Zajiganie: <b>{representative.ignition == null ? 'N/A' : representative.ignition ? 'On' : 'Off'}</b></div>
                                                <div>Moment rashod: <b>N/A</b></div>
                                                <div>Kuchlanish: <b>N/A</b></div>
                                                <div>Skorost: <b>{formatMetric(representative.speed, ' km/h')}</b></div>
                                                <div>Sputniklar: <b>{formatMetric(representative.satellites)}</b></div>
                                            </div>
                                        </div>

                                        <div className="sr-popup-toolbar">
                                            <span><CircleDot size={17} /></span>
                                            <span><Wrench size={17} /></span>
                                            <span><Satellite size={17} /></span>
                                            <span><MessageSquare size={17} /></span>
                                            <span><Radio size={17} /></span>
                                            <span><Pencil size={17} /></span>
                                            <span><X size={17} /></span>
                                        </div>
                                    </div>
                                </Popup>
                            </>
                        ) : null}
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

export const LiveTracker = ({ lang: _lang }: LiveTrackerProps) => {
    const t = useI18n((state) => state.t);
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

    const filteredVehicles = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return vehicles;
        return vehicles.filter((vehicle) =>
            `${vehicle.name} ${vehicle.imei ?? ''} ${vehicle.address} ${vehicle.region}`.toLowerCase().includes(q),
        );
    }, [query, vehicles]);

    const tileConfig = {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };

    return (
        <div className="flex h-full min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-700/50 bg-slate-800/40 p-4 sm:items-center sm:p-5">
                <h3 className="app-module-heading">{t('liveTracking')}</h3>
                <div className="flex w-full md:w-auto">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
                            <span className="h-2 w-2 rounded-full bg-cyan-400" /> {counters.total} Transport
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
            </div>

            {syncMessage ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
                    {syncMessage}
                </div>
            ) : null}

            <div className="grid min-h-[680px] grid-cols-1 gap-4 xl:grid-cols-[570px_minmax(0,1fr)]">
                <aside className="sr-garvex-sidebar">
                    <div className="sr-sidebar-tab">
                        <div className="sr-sidebar-tab-content">
                            <button type="button" className="sr-sidebar-tab-button">
                                <Truck size={20} />
                                <span>{t('trackingObjects')}</span>
                            </button>
                            <button
                                type="button"
                                className="sr-sidebar-tab-search"
                                aria-label={t('trackingSearchPlaceholder')}
                                onClick={() => searchInputRef.current?.focus()}
                            >
                                <Search size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="sr-sidebar-search-row">
                        <label className="sr-sidebar-search">
                            <input
                                ref={searchInputRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t('trackingSearchPlaceholder')}
                            />
                        </label>
                    </div>

                    <div className="sr-sidebar-toolbar">
                        <div className="sr-sidebar-toolbar-left">
                            <ChevronDown size={16} />
                            <span className="sr-garvex-checkbox"><Check size={13} /></span>
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
                        <span className="sr-garvex-checkbox"><Check size={13} /></span>
                        <span className="sr-group-title">Kaliy zavod</span>
                        <span className="sr-group-count">{filteredVehicles.length} / {counters.total}</span>
                    </div>

                    <div className="sr-sidebar-list">
                        {filteredVehicles.length === 0 ? (
                            <div className="sr-sidebar-empty">
                                {t('trackingNotFound')}
                            </div>
                        ) : (
                            filteredVehicles.map((vehicle) => {
                                const selected = vehicle.id === selectedVehicleId;
                                return (
                                    <button
                                        key={vehicle.id}
                                        type="button"
                                        onClick={() => setSelectedVehicleId(vehicle.id)}
                                        className={`sr-object-row ${selected ? 'is-selected' : ''}`}
                                    >
                                        <span className="sr-tree-branch" aria-hidden="true" />
                                        <span className="sr-garvex-checkbox"><Check size={13} /></span>
                                        <span
                                            className={`sr-list-vehicle-icon ${stateStyles[vehicle.status].marker} kind-${vehicle.kind}`}
                                            dangerouslySetInnerHTML={{ __html: vehicleSvgByKind[vehicle.kind] }}
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
                        <MapAutoFit
                            vehicles={filteredVehicles.length > 0 ? filteredVehicles : vehicles}
                            selectedVehicle={selectedVehicle}
                            fitKey={query.trim().toLowerCase() || 'all'}
                        />

                        <VehicleMarkers
                            vehicles={filteredVehicles}
                            selectedVehicleId={selectedVehicleId}
                            onSelect={setSelectedVehicleId}
                        />
                    </MapContainer>

                </section>
            </div>

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
                .sr-sidebar-tab-search {
                    display: inline-flex;
                    height: 38px;
                    width: 38px;
                    flex: 0 0 auto;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid rgba(71, 85, 105, 0.7);
                    border-radius: 0.875rem;
                    background: rgba(15, 23, 42, 0.72);
                    color: #60a5fa;
                    transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;
                }
                .sr-sidebar-tab-search:hover {
                    border-color: rgba(96, 165, 250, 0.85);
                    background: rgba(30, 41, 59, 0.92);
                }
                .sr-sidebar-search-row {
                    display: block;
                    padding: 12px;
                    border-bottom: 1px solid rgba(71, 85, 105, 0.45);
                    background: rgba(15, 23, 42, 0.12);
                }
                .sr-sidebar-search {
                    display: flex;
                    height: 42px;
                    align-items: center;
                    min-width: 0;
                    border: 1px solid rgba(71, 85, 105, 0.7);
                    border-radius: 0.875rem;
                    background: rgba(15, 23, 42, 0.72);
                    padding: 0 12px;
                    color: #94a3b8;
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
                .sr-garvex-checkbox {
                    display: inline-flex;
                    width: 16px;
                    height: 16px;
                    flex: 0 0 auto;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    background: #2563eb;
                    color: #ffffff;
                }
                .sr-sidebar-group-row {
                    display: flex;
                    height: 44px;
                    align-items: center;
                    gap: 8px;
                    border-bottom: 1px solid rgba(71, 85, 105, 0.45);
                    background: rgba(37, 99, 235, 0.12);
                    padding: 0 12px;
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
                    grid-template-columns: 17px 16px 23px minmax(0, 1fr) 198px;
                    align-items: center;
                    column-gap: 8px;
                    min-height: 52px;
                    border-bottom: 0;
                    background: transparent;
                    padding: 6px 12px 6px 12px;
                    text-align: left;
                    transition: background-color 0.16s ease;
                }
                .sr-object-row:hover,
                .sr-object-row.is-selected {
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
                    width: 22px;
                    height: 18px;
                    color: #1169ff;
                }
                .sr-list-vehicle-icon svg {
                    width: 22px;
                    height: 18px;
                    fill: currentColor;
                    stroke: none;
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
                    .sr-object-row {
                        grid-template-columns: 17px 16px 23px minmax(0, 1fr);
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
                    width: 34px;
                    height: 34px;
                    border-radius: 9999px;
                    border: 4px solid #7fb0ff;
                    color: #2563eb;
                    background: #ffffff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.22);
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
                .sr-garvex-marker svg,
                .sr-popup-vehicle-icon svg {
                    width: 22px;
                    height: 22px;
                    fill: currentColor;
                    stroke: none;
                }
                .sr-garvex-marker.kind-forklift,
                .sr-garvex-marker.kind-loader,
                .sr-popup-vehicle-icon.kind-forklift,
                .sr-popup-vehicle-icon.kind-loader {
                    color: #d97706;
                }
                .sr-garvex-marker.kind-truck,
                .sr-popup-vehicle-icon.kind-truck {
                    color: #2563eb;
                }
                .sr-garvex-marker.is-moving {
                    border-color: #22c55e;
                    box-shadow: 0 3px 11px rgba(34, 197, 94, 0.32);
                }
                .sr-garvex-marker.is-moving::before {
                    background: rgba(34, 197, 94, 0.18);
                }
                .sr-garvex-marker.is-stopped {
                    border-color: #7fb0ff;
                    box-shadow: 0 3px 11px rgba(37, 99, 235, 0.28);
                }
                .sr-garvex-marker.is-stopped::before {
                    background: rgba(37, 99, 235, 0.16);
                }
                .sr-garvex-marker.is-offline {
                    border-color: #ef4444;
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
                .sr-popup-vehicle-icon {
                    width: 24px;
                    height: 24px;
                    flex: 0 0 auto;
                    color: #2563eb;
                }
                .sr-popup-title {
                    min-width: 0;
                    color: #4b5563;
                    font-size: 16px;
                    font-weight: 800;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
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
                    padding: 4px 14px 10px;
                    color: #4b5563;
                    line-height: 1.35;
                }
                .sr-popup-details span {
                    color: #374151;
                    font-weight: 700;
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
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
            `}</style>
        </div>
    );
};
