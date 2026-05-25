import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet';
import { divIcon, type LatLngBoundsExpression } from 'leaflet';
import { resolveApiBaseUrl } from '../utils/apiBase';
import 'leaflet/dist/leaflet.css';

type VehicleStatus = 'moving' | 'stopped';

type TrackingVehicle = {
    id: number;
    plate: string;
    model: string;
    region: string;
    lat: number;
    lng: number;
    speed: number;
    status: VehicleStatus;
    route: string;
    distanceKm: number;
};

const UZBEKISTAN_VIEW_BOUNDS: LatLngBoundsExpression = [
    [37.17, 56.00],
    [45.65, 73.20],
];

const API_BASE = resolveApiBaseUrl();
const STALE_AFTER_MS = 15 * 60 * 1000;

const buildVehicleIcon = (status: VehicleStatus, isSelected = false) =>
    divIcon({
        className: '',
        iconSize: [46, 46],
        iconAnchor: [23, 23],
        html: `
            <div class="sr-vehicle-marker ${status === 'moving' ? 'is-moving' : 'is-stopped'} ${isSelected ? 'is-selected' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M14 16H9"></path>
                    <path d="M19 16h2a1 1 0 0 0 1-1v-3c0-.3-.1-.5-.3-.7l-1.7-1.7a1 1 0 0 0-.7-.3H4a2 2 0 0 0-2 2v3a1 1 0 0 0 1 1h2"></path>
                    <circle cx="6.5" cy="16.5" r="2.5"></circle>
                    <circle cx="16.5" cy="16.5" r="2.5"></circle>
                </svg>
            </div>
        `,
    });

const markerIcons = {
    moving: {
        default: buildVehicleIcon('moving'),
        selected: buildVehicleIcon('moving', true),
    },
    stopped: {
        default: buildVehicleIcon('stopped'),
        selected: buildVehicleIcon('stopped', true),
    },
};

const getVehicleIcon = (status: VehicleStatus, isSelected: boolean) => {
    if (status === 'moving') {
        return isSelected ? markerIcons.moving.selected : markerIcons.moving.default;
    }

    return isSelected ? markerIcons.stopped.selected : markerIcons.stopped.default;
};

const getStatusLabel = (status: VehicleStatus) => (status === 'moving' ? 'Harakatda' : "To'xtagan");

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
    } | null;
    lastMessageUnix?: number | null;
    lastMessageAt?: string | null;
};

type GarvexVehiclesResponse = {
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
};

type LiveTrackerProps = {
    lang?: string;
};

const extractRegion = (address: string | null | undefined): string => {
    const normalized = String(address || '').trim();
    if (!normalized) return 'Noma`lum';
    const first = normalized.split(',')[0]?.trim();
    return first || 'Noma`lum';
};

const toVehicleStatus = (speed: number, lastMessageAt: string | null, lastMessageUnix: number | null | undefined): VehicleStatus => {
    if (speed > 2) return 'moving';
    const fromIso = lastMessageAt ? new Date(lastMessageAt).getTime() : NaN;
    const fromUnixRaw = typeof lastMessageUnix === 'number' ? lastMessageUnix : NaN;
    const fromUnixMs = Number.isFinite(fromUnixRaw) ? (fromUnixRaw > 9_999_999_999 ? fromUnixRaw : fromUnixRaw * 1000) : NaN;
    const seenAt = Number.isFinite(fromIso) ? fromIso : fromUnixMs;
    if (!Number.isFinite(seenAt)) return 'stopped';
    return (Date.now() - seenAt) <= STALE_AFTER_MS ? 'moving' : 'stopped';
};

const mapApiVehicle = (item: GarvexVehicleApi): TrackingVehicle | null => {
    const id = Number(item.unitId ?? 0);
    const latRaw = Number(item.point?.y);
    const lngRaw = Number(item.point?.x);
    if (!Number.isFinite(id) || id <= 0) return null;
    if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) return null;

    const speed = Number.isFinite(Number(item.point?.speed)) ? Number(item.point?.speed) : 0;
    const address = (item.point?.a || '').trim();

    return {
        id,
        plate: (item.objectCode || item.name || `#${id}`).trim(),
        model: 'Garvex MT',
        region: extractRegion(address),
        lat: latRaw,
        lng: lngRaw,
        speed,
        status: toVehicleStatus(speed, item.lastMessageAt || null, item.lastMessageUnix),
        route: address || 'Marshrut ma`lumoti yo`q',
        distanceKm: 0,
    };
};

export const LiveTracker = ({ lang: _lang }: LiveTrackerProps) => {
    const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
    const [vehicles, setVehicles] = useState<TrackingVehicle[]>([]);
    const [source, setSource] = useState<'garvex' | 'stale' | 'empty'>('empty');
    const [syncMessage, setSyncMessage] = useState<string | null>('Garvexdan ma`lumot kutilmoqda...');
    const [lastSyncAtLabel, setLastSyncAtLabel] = useState<string | null>(null);
    const cacheRef = useRef<TrackingVehicle[]>([]);
    const cacheAtRef = useRef<number>(0);

    useEffect(() => {
        let disposed = false;

        const load = async () => {
            try {
                const [healthResponse, vehiclesResponse] = await Promise.all([
                    fetch(`${API_BASE}/integrations/tracking/garvex/health`),
                    fetch(`${API_BASE}/integrations/tracking/garvex/vehicles`),
                ]);

                const health = healthResponse.ok
                    ? await healthResponse.json().catch(() => null) as GarvexHealthResponse | null
                    : null;
                const payload = vehiclesResponse.ok
                    ? await vehiclesResponse.json().catch(() => null) as GarvexVehiclesResponse | null
                    : null;

                const mapped = (payload?.items || [])
                    .map(mapApiVehicle)
                    .filter((item): item is TrackingVehicle => Boolean(item));

                if (disposed) return;

                if (mapped.length > 0) {
                    setVehicles(mapped);
                    setSource('garvex');
                    setSyncMessage(null);
                    cacheRef.current = mapped;
                    cacheAtRef.current = Date.now();
                    const syncAtIso = health?.lastSyncAt || new Date().toISOString();
                    setLastSyncAtLabel(new Date(syncAtIso).toLocaleTimeString());
                    return;
                }

                const canUseCache = cacheRef.current.length > 0 && (Date.now() - cacheAtRef.current) <= (5 * 60 * 1000);
                if (canUseCache) {
                    setVehicles(cacheRef.current);
                    setSource('stale');
                    setSyncMessage('Vaqtincha so`nggi ishonchli nuqtalar ko`rsatilmoqda.');
                    return;
                }

                setVehicles([]);
                setSource('empty');

                if (!health?.enabled) {
                    setSyncMessage('Garvex integratsiyasi o`chiq.');
                } else if (health?.status === 'permission_denied' || health?.permission?.getUnit === false) {
                    setSyncMessage('Garvex akkauntida getUnit huquqi yo`q. Real koordinatalar olinmaydi.');
                } else if (health?.lastSyncError) {
                    setSyncMessage(`Garvex sync xatosi: ${health.lastSyncError}`);
                } else {
                    setSyncMessage('Garvexdan transport koordinatalari kelmadi.');
                }
            } catch {
                if (disposed) return;
                const canUseCache = cacheRef.current.length > 0 && (Date.now() - cacheAtRef.current) <= (5 * 60 * 1000);
                if (canUseCache) {
                    setVehicles(cacheRef.current);
                    setSource('stale');
                    setSyncMessage('Tarmoq uzilishi: so`nggi ishonchli nuqtalar saqlandi.');
                } else {
                    setVehicles([]);
                    setSource('empty');
                    setSyncMessage('Garvex bilan ulanishda tarmoq xatosi.');
                }
            }
        };

        void load();
        const timer = setInterval(() => {
            void load();
        }, 30000);

        return () => {
            disposed = true;
            clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (selectedVehicleId == null) return;
        const exists = vehicles.some((vehicle) => vehicle.id === selectedVehicleId);
        if (!exists) {
            setSelectedVehicleId(null);
        }
    }, [vehicles, selectedVehicleId]);

    const selectedVehicle = useMemo(
        () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
        [vehicles, selectedVehicleId],
    );

    const movingCount = useMemo(
        () => vehicles.filter((vehicle) => vehicle.status === 'moving').length,
        [vehicles],
    );
    const stoppedCount = vehicles.length - movingCount;
    const selectedSpeedProgress = selectedVehicle ? Math.min((selectedVehicle.speed / 120) * 100, 100) : 0;
    const tileConfig = {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex justify-between items-center gap-3">
                <h3 className="app-module-heading">
                    Tezkor Xotira (Live GPS)
                </h3>
                <div className="flex gap-2">
                    <div className="px-3 py-1 bg-green-500/10 text-green-300 text-xs rounded-full border border-green-400/30 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span> {movingCount} Faol
                    </div>
                    <div className="px-3 py-1 bg-amber-500/10 text-amber-300 text-xs rounded-full border border-amber-400/30 font-bold">
                        {stoppedCount} To'xtagan
                    </div>
                    <div className={`px-3 py-1 text-xs rounded-full border font-bold ${source === 'garvex'
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30'
                        : source === 'stale'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-400/30'
                            : 'bg-slate-700/30 text-slate-300 border-slate-500/30'
                        }`}>
                        {source === 'garvex' ? 'Garvex: jonli' : source === 'stale' ? 'Garvex: so`nggi holat' : 'Garvex: ma`lumot yo`q'}
                    </div>
                </div>
            </div>

            {syncMessage ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    {syncMessage}
                </div>
            ) : null}
            {lastSyncAtLabel ? (
                <div className="text-xs text-slate-400 -mt-2">So`nggi sinxron: {lastSyncAtLabel}</div>
            ) : null}

            <div className="flex-1 relative rounded-3xl overflow-hidden border border-slate-700/60 bg-[#091121]">
                <div className="sr-map-overlay-sheen absolute inset-0 pointer-events-none z-[390]" />

                <MapContainer
                    bounds={UZBEKISTAN_VIEW_BOUNDS}
                    boundsOptions={{ padding: [18, 18] }}
                    minZoom={4.2}
                    maxZoom={16}
                    scrollWheelZoom
                    className="absolute inset-0 h-full w-full sr-live-map"
                >
                    <TileLayer
                        attribution={tileConfig.attribution}
                        url={tileConfig.url}
                    />

                    {vehicles.map((vehicle) => {
                        const isSelected = vehicle.id === selectedVehicleId;

                        return (
                            <Marker
                                key={vehicle.id}
                                position={[vehicle.lat, vehicle.lng]}
                                icon={getVehicleIcon(vehicle.status, isSelected)}
                                eventHandlers={{ click: () => setSelectedVehicleId(vehicle.id) }}
                            >
                                {isSelected && (
                                    <Tooltip
                                        permanent
                                        direction="top"
                                        offset={[0, -24]}
                                        className="sr-vehicle-tooltip"
                                        opacity={1}
                                    >
                                        <div className="space-y-1 min-w-[170px]">
                                            <p className="font-bold text-blue-300">{vehicle.plate}</p>
                                            <div className="flex justify-between gap-5">
                                                <span className="text-slate-300">Hudud:</span>
                                                <span className="text-cyan-300 font-semibold">{vehicle.region}</span>
                                            </div>
                                            <div className="flex justify-between gap-5">
                                                <span className="text-slate-300">Tezlik:</span>
                                                <span className="text-slate-100 font-mono">{vehicle.speed} km/soat</span>
                                            </div>
                                            <div className="flex justify-between gap-5">
                                                <span className="text-slate-300">Holat:</span>
                                                <span className={vehicle.status === 'moving' ? 'text-emerald-300' : 'text-amber-300'}>
                                                    {getStatusLabel(vehicle.status)}
                                                </span>
                                            </div>
                                        </div>
                                    </Tooltip>
                                )}
                            </Marker>
                        );
                    })}
                </MapContainer>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28 }}
                    className="absolute left-4 bottom-4 p-4 bg-slate-900/84 border border-slate-700/80 rounded-2xl backdrop-blur-md w-64 shadow-2xl z-[500]"
                >
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Info size={14} className="text-blue-400" /> Tanlangan obyekt
                    </h4>

                    {selectedVehicle ? (
                        <motion.div
                            key={selectedVehicle.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3"
                        >
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span>{selectedVehicle.plate}</span>
                                <span className="text-blue-300 font-mono">{selectedVehicle.model}</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5">
                                <svg className="h-full w-full" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
                                    <rect
                                        x="0"
                                        y="0"
                                        rx="3"
                                        ry="3"
                                        width={Math.max(0, Math.min(selectedSpeedProgress, 100))}
                                        height="6"
                                        className={selectedVehicle.status === 'moving' ? 'fill-blue-500' : 'fill-amber-500'}
                                    />
                                </svg>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/70">
                                    <p className="text-slate-500">Marshrut</p>
                                    <p className="font-bold">{selectedVehicle.route}</p>
                                </div>
                                <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/70">
                                    <p className="text-slate-500">Masofa</p>
                                    <p className="font-bold">{selectedVehicle.distanceKm} km</p>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-3 text-xs text-slate-300">
                            {vehicles.length > 0
                                ? 'Xaritadagi transport ikonkasini bosing. Ma`lumot shu yerda chiqadi.'
                                : 'Ko`rsatish uchun real transport nuqtalari hali kelmadi.'}
                        </div>
                    )}
                </motion.div>
            </div>

            <style>{`
                .sr-live-map .leaflet-control-zoom {
                    margin-top: 12px;
                    margin-left: 12px;
                }
                .sr-live-map .leaflet-tile {
                    filter: saturate(1.06) contrast(1.03);
                }
                .sr-map-overlay-sheen {
                    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.03));
                }
                .sr-vehicle-marker {
                    position: relative;
                    width: 50px;
                    height: 50px;
                    border-radius: 9999px;
                    border: 2px solid rgba(191, 219, 254, 0.95);
                    color: #f8fafc;
                    background: linear-gradient(165deg, #3b82f6, #2563eb);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 10px 30px rgba(37, 99, 235, 0.5);
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .sr-vehicle-marker::before {
                    content: '';
                    position: absolute;
                    inset: -12px;
                    border-radius: 9999px;
                    background: rgba(59, 130, 246, 0.26);
                    animation: srPulse 2.1s ease-in-out infinite;
                }
                .sr-vehicle-marker svg {
                    width: 20px;
                    height: 20px;
                    z-index: 1;
                }
                .sr-vehicle-marker.is-stopped {
                    border-color: rgba(254, 243, 199, 0.95);
                    background: linear-gradient(170deg, #f59e0b, #d97706);
                    box-shadow: 0 10px 28px rgba(245, 158, 11, 0.48);
                }
                .sr-vehicle-marker.is-stopped::before {
                    background: rgba(251, 191, 36, 0.28);
                }
                .sr-vehicle-marker.is-selected {
                    transform: scale(1.12);
                    box-shadow: 0 12px 34px rgba(30, 64, 175, 0.7);
                }
                .sr-vehicle-marker.is-selected::after {
                    content: '';
                    position: absolute;
                    inset: -4px;
                    border-radius: 9999px;
                    border: 2px solid rgba(255, 255, 255, 0.9);
                }
                .sr-vehicle-marker.is-selected.is-stopped::after {
                    border-color: rgba(254, 243, 199, 0.92);
                }
                .sr-vehicle-tooltip.leaflet-tooltip {
                    background: rgba(15, 23, 42, 0.96);
                    border: 1px solid rgba(71, 85, 105, 0.9);
                    color: #e2e8f0;
                    border-radius: 14px;
                    padding: 10px 12px;
                    box-shadow: 0 16px 30px rgba(2, 6, 23, 0.56);
                }
                .sr-vehicle-tooltip.leaflet-tooltip-top:before {
                    border-top-color: rgba(15, 23, 42, 0.96);
                }
                @keyframes srPulse {
                    0% {
                        transform: scale(0.9);
                        opacity: 0.56;
                    }
                    50% {
                        transform: scale(1.05);
                        opacity: 0.82;
                    }
                    100% {
                        transform: scale(0.9);
                        opacity: 0.56;
                    }
                }
            `}</style>
        </div>
    );
};
