import { motion } from 'framer-motion';
import { Navigation, Info, Car, ZoomIn, ZoomOut, Layers } from 'lucide-react';

const trackingVehicles = [
    { id: 1, plate: '01 A 777 AA', model: 'Traverse', lat: 41.2995, lng: 69.2401, speed: 45, status: 'moving', angle: 45 },
    { id: 2, plate: '01 Z 123 BB', model: 'Damas', lat: 41.3111, lng: 69.2797, speed: 0, status: 'stopped', angle: 0 },
    { id: 3, plate: '01 F 555 FF', model: 'Isuzu', lat: 41.3250, lng: 69.2100, speed: 62, status: 'moving', angle: 180 },
];

export const LiveTracker = () => {
    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <Navigation size={22} className="text-blue-400" />
                    Real-vaqtda kuzatuv (Live GPS)
                </h3>
                <div className="flex gap-2">
                    <div className="px-3 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> 12 Faol
                    </div>
                    <div className="px-3 py-1 bg-slate-800 text-slate-400 text-xs rounded-full border border-slate-700 font-bold">
                        3 To'xtagan
                    </div>
                </div>
            </div>

            <div className="flex-1 relative glass-panel rounded-3xl overflow-hidden border border-slate-700/50 bg-[#0f172a]">
                {/* Mock Map Background */}
                <div className="absolute inset-0 opacity-40 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/69.2401,41.2995,12,0/1000x600?access_token=YOUR_MAPBOX_TOKEN')] bg-cover"></div>

                {/* Grid Overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px] opacity-20"></div>

                {/* Vehicles on Map */}
                {trackingVehicles.map((v) => (
                    <motion.div
                        key={v.id}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute"
                        style={{
                            left: `${(v.lng - 69.15) * 500}px`,
                            top: `${(41.4 - v.lat) * 500}px`
                        }}
                    >
                        <div className="relative group cursor-pointer">
                            {/* Pulse Effect for moving vehicles */}
                            {v.status === 'moving' && (
                                <div className="absolute -inset-4 bg-blue-500/20 rounded-full animate-ping"></div>
                            )}

                            <div className={`p-2 rounded-xl border-2 shadow-2xl transition-all ${v.status === 'moving' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-300'
                                }`}>
                                <Car
                                    size={20}
                                    style={{ transform: `rotate(${v.angle}deg)` }}
                                    className="transition-transform duration-500"
                                />
                            </div>

                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-slate-900/95 border border-slate-700 rounded-lg text-[10px] invisible group-hover:visible z-50 shadow-xl backdrop-blur-md">
                                <p className="font-bold text-blue-400 mb-1">{v.plate}</p>
                                <div className="flex justify-between">
                                    <span>Tezlik:</span>
                                    <span className="text-white font-mono">{v.speed} km/s</span>
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span>Holat:</span>
                                    <span className={v.status === 'moving' ? 'text-green-400' : 'text-orange-400'}>{v.status}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}

                {/* Map Controls */}
                <div className="absolute right-4 bottom-4 flex flex-col gap-2">
                    <button className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 backdrop-blur-md transition-all">
                        <ZoomIn size={18} />
                    </button>
                    <button className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 backdrop-blur-md transition-all">
                        <ZoomOut size={18} />
                    </button>
                    <button className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 backdrop-blur-md transition-all mt-2">
                        <Layers size={18} />
                    </button>
                </div>

                {/* Legend/Info Panel */}
                <div className="absolute left-4 bottom-4 p-4 bg-slate-900/80 border border-slate-700 rounded-2xl backdrop-blur-md w-64 shadow-2xl">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Info size={14} className="text-blue-400" /> Tanlangan obyekt
                    </h4>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm font-medium">
                            <span>01 A 777 AA</span>
                            <span className="text-blue-400 font-mono">Traverse</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1">
                            <div className="bg-blue-500 h-full w-2/3"></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="p-2 bg-slate-800/50 rounded-lg">
                                <p className="text-slate-500">Marshrut</p>
                                <p className="font-bold">Toshkent - Samarqand</p>
                            </div>
                            <div className="p-2 bg-slate-800/50 rounded-lg">
                                <p className="text-slate-500">Masofa</p>
                                <p className="font-bold">142 km</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
