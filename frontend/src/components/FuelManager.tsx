import { Droplet, TrendingUp, AlertCircle, Calendar, Download } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useI18n } from '../i18n';

const fuelData = [
    { day: 'Dush', consumption: 450, cost: 4500000 },
    { day: 'Sesh', consumption: 520, cost: 5200000 },
    { day: 'Chor', consumption: 480, cost: 4800000 },
    { day: 'Pay', consumption: 610, cost: 6100000 },
    { day: 'Jum', consumption: 550, cost: 5500000 },
    { day: 'Shan', consumption: 320, cost: 3200000 },
    { day: 'Yak', consumption: 210, cost: 2100000 },
];

const anomalies = [
    { id: 1, vehicle: '01 A 777 AA', time: 'Bugun, 02:30', type: 'Keskin kamayish', amount: '15L', status: 'critical' },
    { id: 2, vehicle: '01 Z 123 BB', time: 'Kecha, 22:15', type: 'Me\'yordan ortiq sarf', amount: '8L', status: 'warning' },
];

export const FuelManager = () => {
    const { t } = useI18n();
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart */}
                <div className="glass-panel p-6 rounded-2xl lg:col-span-2 space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <TrendingUp className="text-blue-400" size={20} />
                            Haftalik yoqilg'i sarfi
                        </h3>
                        <button className="text-xs bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-700 transition-all flex items-center gap-2">
                            <Download size={14} /> Eksport (Excel)
                        </button>
                    </div>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={fuelData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="day" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}
                                />
                                <Area type="monotone" dataKey="consumption" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Anomaly Alerts */}
                <div className="glass-panel p-6 rounded-2xl space-y-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-orange-400">
                        <AlertCircle size={20} />
                        Shubhali holatlar
                    </h3>
                    <div className="space-y-3">
                        {anomalies.map((a) => (
                            <div key={a.id} className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-sm">{a.vehicle}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${a.status === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                        }`}>
                                        {a.type}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-400">
                                    <span>{a.time}</span>
                                    <span className="font-bold text-slate-200">-{a.amount}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold transition-all">
                        Barcha xatolar (12)
                    </button>
                </div>
            </div>

            {/* Fuel Cards Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl">
                        <Droplet size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-medium">O'rtacha sarf</p>
                        <p className="text-xl font-bold">12.5 L/100km</p>
                    </div>
                </div>
                <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border-l-4 border-l-emerald-500">
                    <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-medium">Tejamkorlik (Hafta)</p>
                        <p className="text-xl font-bold text-emerald-400">+4.2%</p>
                    </div>
                </div>
                <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
                        <Calendar size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-medium">Jami xarajat</p>
                        <p className="text-xl font-bold">32,450,000 UZS</p>
                    </div>
                </div>
            </div>
            {/* Fuel Type Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { key: 'benzin', val: '1,240 L', color: 'border-blue-500' },
                    { key: 'diesel', val: '2,850 L', color: 'border-emerald-500' },
                    { key: 'propan', val: '840 L', color: 'border-orange-500' },
                    { key: 'metan', val: '3,120 m³', color: 'border-purple-500' },
                ].map((f) => (
                    <div key={f.key} className={`glass-panel p-4 rounded-xl border-t-2 ${f.color}`}>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">{t(f.key as any)}</p>
                        <p className="text-lg font-bold">{f.val}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};
