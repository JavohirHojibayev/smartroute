import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Weight,
    Box,
    Truck,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Download,
    Printer,
    FileText,
    Droplet
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { useI18n } from '../i18n';

const periods = {
    weekly: [
        { id: 1, plate: '01 A 777 AA', model: 'MAN TGS', totalWeight: 45, totalVolume: 180, efficiency: 94, trend: 'up', fuelConsumed: 1200 },
        { id: 2, plate: '01 Z 123 BB', model: 'Kamaz 6520', totalWeight: 38, totalVolume: 120, efficiency: 88, trend: 'down', fuelConsumed: 1450 },
        { id: 3, plate: '10 O 001 OO', model: 'Volvo FH16', totalWeight: 52, totalVolume: 210, efficiency: 96, trend: 'up', fuelConsumed: 1100 },
        { id: 4, plate: '40 L 444 LL', model: 'Scania R450', totalWeight: 31, totalVolume: 155, efficiency: 91, trend: 'up', fuelConsumed: 950 },
        { id: 5, plate: '01 F 555 FF', model: 'Isuzu NPR', totalWeight: 12, totalVolume: 62, efficiency: 82, trend: 'stable', fuelConsumed: 450 },
        { id: 6, plate: '01 K 888 KK', model: 'Gazel Next', totalWeight: 5, totalVolume: 32, efficiency: 75, trend: 'up', fuelConsumed: 220 },
    ],
    monthly: [
        { id: 1, plate: '01 A 777 AA', model: 'MAN TGS', totalWeight: 190, totalVolume: 760, efficiency: 92, trend: 'up', fuelConsumed: 4800 },
        { id: 2, plate: '01 Z 123 BB', model: 'Kamaz 6520', totalWeight: 165, totalVolume: 520, efficiency: 85, trend: 'up', fuelConsumed: 5900 },
        { id: 3, plate: '10 O 001 OO', model: 'Volvo FH16', totalWeight: 230, totalVolume: 940, efficiency: 95, trend: 'up', fuelConsumed: 4600 },
        { id: 4, plate: '40 L 444 LL', model: 'Scania R450', totalWeight: 145, totalVolume: 720, efficiency: 89, trend: 'down', fuelConsumed: 4100 },
        { id: 5, plate: '01 F 555 FF', model: 'Isuzu NPR', totalWeight: 58, totalVolume: 290, efficiency: 84, trend: 'up', fuelConsumed: 1900 },
        { id: 6, plate: '01 K 888 KK', model: 'Gazel Next', totalWeight: 22, totalVolume: 140, efficiency: 78, trend: 'stable', fuelConsumed: 950 },
    ],
    yearly: [
        { id: 1, plate: '01 A 777 AA', model: 'MAN TGS', totalWeight: 2100, totalVolume: 8400, efficiency: 93, trend: 'up', fuelConsumed: 52000 },
        { id: 2, plate: '01 Z 123 BB', model: 'Kamaz 6520', totalWeight: 1850, totalVolume: 6100, efficiency: 87, trend: 'up', fuelConsumed: 64000 },
        { id: 3, plate: '10 O 001 OO', model: 'Volvo FH16', totalWeight: 2600, totalVolume: 10500, efficiency: 96, trend: 'up', fuelConsumed: 51000 },
        { id: 4, plate: '40 L 444 LL', model: 'Scania R450', totalWeight: 1720, totalVolume: 8600, efficiency: 90, trend: 'up', fuelConsumed: 46000 },
        { id: 5, plate: '01 F 555 FF', model: 'Isuzu NPR', totalWeight: 680, totalVolume: 3400, efficiency: 85, trend: 'up', fuelConsumed: 21000 },
        { id: 6, plate: '01 K 888 KK', model: 'Gazel Next', totalWeight: 280, totalVolume: 1800, efficiency: 80, trend: 'up', fuelConsumed: 11000 },
    ]
};

const COLORS = ['#3b82f6', '#0ea5e9', '#06b6d4', '#2dd4bf', '#10b981', '#34d399'];

export const CargoManager = () => {
    const { t } = useI18n();
    const [activePeriod, setActivePeriod] = useState<keyof typeof periods>('monthly');
    const [isExporting, setIsExporting] = useState<string | null>(null);

    const cargoData = periods[activePeriod];

    const handleExport = (type: 'pdf' | 'excel') => {
        setIsExporting(type);
        setTimeout(() => {
            setIsExporting(null);
            alert(`${activePeriod.toUpperCase()} hisoboti ${type.toUpperCase()} formatida muvaffaqiyatli yuklab olindi! ✅`);
        }, 2000);
    };

    const totalWeight = cargoData.reduce((acc, curr) => acc + curr.totalWeight, 0);
    const totalVolume = cargoData.reduce((acc, curr) => acc + curr.totalVolume, 0);

    return (
        <div className="space-y-6 pb-10">
            {/* Period Selector */}
            <div className="flex justify-between items-center bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50">
                <div className="flex items-center gap-3 px-3 border-r border-slate-700 h-8 mr-2 text-blue-400">
                    <Calendar size={18} />
                    <span className="text-sm font-bold text-slate-200">Davr:</span>
                </div>
                <div className="flex-1 flex gap-2">
                    {(['weekly', 'monthly', 'yearly'] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setActivePeriod(p)}
                            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${activePeriod === p ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-700/50'
                                }`}
                        >
                            {p === 'weekly' ? 'Haftalik' : p === 'monthly' ? 'Oylik' : 'Yillik'}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 ml-4 pl-4 border-l border-slate-700">
                    <button
                        disabled={!!isExporting}
                        onClick={() => handleExport('excel')}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20"
                    >
                        {isExporting === 'excel' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileText size={16} />}
                        Excel
                    </button>
                    <button
                        disabled={!!isExporting}
                        onClick={() => handleExport('pdf')}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-red-600/20"
                    >
                        {isExporting === 'pdf' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download size={16} />}
                        PDF
                    </button>
                    <button className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-all">
                        <Printer size={18} />
                    </button>
                </div>
            </div>

            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`w-${activePeriod}`}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="glass-panel p-6 rounded-3xl border border-slate-700/50 bg-gradient-to-br from-blue-500/10 to-transparent"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-blue-600/20 text-blue-400 rounded-2xl">
                                <Weight size={24} />
                            </div>
                            <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                <ArrowUpRight size={12} /> {activePeriod === 'yearly' ? '+15.2%' : '+11.8%'}
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{t('totalWeight')}</p>
                        <h3 className="text-3xl font-bold mt-1">{totalWeight.toLocaleString()} <span className="text-lg font-normal text-slate-500">t</span></h3>
                    </motion.div>

                    <motion.div
                        key={`v-${activePeriod}`}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ delay: 0.05 }}
                        className="glass-panel p-6 rounded-3xl border border-slate-700/50 bg-gradient-to-br from-purple-500/10 to-transparent"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-purple-600/20 text-purple-400 rounded-2xl">
                                <Box size={24} />
                            </div>
                            <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                <ArrowUpRight size={12} /> {activePeriod === 'yearly' ? '+10.4%' : '+6.7%'}
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Umumiy hajm</p>
                        <h3 className="text-3xl font-bold mt-1">{totalVolume.toLocaleString()} <span className="text-lg font-normal text-slate-500">m³</span></h3>
                    </motion.div>

                    <motion.div
                        key={`e-${activePeriod}`}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ delay: 0.1 }}
                        className="glass-panel p-6 rounded-3xl border border-slate-700/50 bg-gradient-to-br from-emerald-500/10 to-transparent"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-emerald-600/20 text-emerald-400 rounded-2xl">
                                <Droplet size={24} />
                            </div>
                            <span className="text-slate-400 text-[10px] font-bold bg-slate-800 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                Eco-Efficiency
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">1t yuk uchun yoqilg'i</p>
                        <h3 className="text-3xl font-bold mt-1">{(cargoData.reduce((a, c) => a + c.fuelConsumed, 0) / totalWeight).toFixed(1)} <span className="text-lg font-normal text-slate-500">L</span></h3>
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Chart Section */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-700/50">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h4 className="text-lg font-bold">Avtomobillar bo'yicha hajm</h4>
                            <p className="text-xs text-slate-500 mt-1">Tashilgan yukning {activePeriod} taqsimoti</p>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={cargoData} layout="vertical" margin={{ left: -20, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="plate" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={100} />
                                <Tooltip
                                    cursor={{ fill: '#334155', opacity: 0.4 }}
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}
                                />
                                <Bar dataKey="totalVolume" radius={[0, 8, 8, 0]} barSize={24}>
                                    {cargoData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Detailed List */}
                <div className="glass-panel rounded-3xl border border-slate-700/50 overflow-hidden">
                    <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                        <h4 className="text-lg font-bold">Statistika tafsilotlari</h4>
                        <span className="text-[10px] text-blue-400 font-bold bg-blue-500/10 px-3 py-1 rounded-full uppercase tracking-widest">{activePeriod}</span>
                    </div>
                    <div className="overflow-y-auto max-h-[350px] no-scrollbar">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky top-0">
                                <tr>
                                    <th className="px-6 py-4">Transport</th>
                                    <th className="px-6 py-4">Og'irlik (t)</th>
                                    <th className="px-6 py-4">Yoqilg'i (L)</th>
                                    <th className="px-6 py-4 text-right pr-8">L / 1 t</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                <AnimatePresence mode="popLayout">
                                    {cargoData.map((v) => (
                                        <motion.tr
                                            key={v.id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="hover:bg-blue-500/5 transition-all group"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-slate-800 rounded-lg text-blue-400"><Truck size={16} /></div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white uppercase">{v.plate}</p>
                                                        <p className="text-[10px] text-slate-500">{v.model}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-200">{v.totalWeight.toLocaleString()}</span>
                                                    {v.trend === 'up' ? <ArrowUpRight size={14} className="text-emerald-500" /> : <ArrowDownRight size={14} className="text-red-500" />}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-200">
                                                {v.fuelConsumed.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right pr-8">
                                                <span className={`text-xs font-bold ${(v.fuelConsumed / v.totalWeight) < 25 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                                    {(v.fuelConsumed / v.totalWeight).toFixed(1)}
                                                </span>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
