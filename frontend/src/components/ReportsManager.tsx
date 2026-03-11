import { BarChart3, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, FileSpreadsheet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const kpiData = [
    { name: 'Yan', total: 4000 },
    { name: 'Fev', total: 3000 },
    { name: 'Mar', total: 2000 },
    { name: 'Apr', total: 2780 },
    { name: 'May', total: 1890 },
    { name: 'Iyun', total: 2390 },
];

const COLORS = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];

export const ReportsManager = () => {
    return (
        <div className="space-y-6 pb-10">
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold">Analitika va Hisobotlar</h3>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-all text-sm">
                        <Calendar size={16} /> Oxirgi 30 kun
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all text-sm font-medium">
                        <FileSpreadsheet size={16} /> PDF Yuklash
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-2xl space-y-2">
                    <div className="flex justify-between items-start">
                        <span className="text-slate-400 text-sm">Jami masofa</span>
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><ArrowUpRight size={16} /></div>
                    </div>
                    <p className="text-3xl font-bold font-mono">128,450 km</p>
                    <p className="text-emerald-400 text-xs flex items-center gap-1">
                        <TrendingUp size={12} /> +12% o'tgan oydan
                    </p>
                </div>
                <div className="glass-panel p-6 rounded-2xl space-y-2">
                    <div className="flex justify-between items-start">
                        <span className="text-slate-400 text-sm">O'rtacha xarajat</span>
                        <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg"><ArrowDownRight size={16} /></div>
                    </div>
                    <p className="text-3xl font-bold font-mono">2,450,000 UZS</p>
                    <p className="text-red-400 text-xs flex items-center gap-1">
                        -5% tejamkorlik pasaygan
                    </p>
                </div>
                <div className="glass-panel p-6 rounded-2xl space-y-2">
                    <div className="flex justify-between items-start">
                        <span className="text-slate-400 text-sm">Xizmat muddati</span>
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><BarChart3 size={16} /></div>
                    </div>
                    <p className="text-3xl font-bold font-mono">98.2%</p>
                    <p className="text-emerald-400 text-xs flex items-center gap-1">
                        <TrendingUp size={12} /> Yuqori tayyorgarlik
                    </p>
                </div>
            </div>

            {/* Analytics Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-2xl space-y-6">
                    <h4 className="font-bold flex items-center gap-2">
                        Safarlar dinamikasi
                    </h4>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={kpiData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="name" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}
                                />
                                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                                    {kpiData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl space-y-6">
                    <h4 className="font-bold">Xarajatlar tarkibi</h4>
                    <div className="space-y-4">
                        {[
                            { label: 'Yoqilg\'i', value: 65, color: 'bg-blue-500' },
                            { label: 'Xizmat ko\'rsatish', value: 20, color: 'bg-purple-500' },
                            { label: 'Sug\'urta', value: 10, color: 'bg-emerald-500' },
                            { label: 'Boshqa', value: 5, color: 'bg-slate-500' },
                        ].map((item) => (
                            <div key={item.label} className="space-y-1.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-400">{item.label}</span>
                                    <span className="font-bold">{item.value}%</span>
                                </div>
                                <div className="w-full bg-slate-800 rounded-full h-2">
                                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="pt-4 border-t border-slate-700/50">
                        <p className="text-xs text-slate-500 italic">
                            * Ma'lumotlar oxirgi kvartal asosida hisoblangan.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
