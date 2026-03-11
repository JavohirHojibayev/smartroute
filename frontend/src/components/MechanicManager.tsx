import { motion } from 'framer-motion';
import { Wrench, CheckCircle2, AlertTriangle, Search, Filter, ClipboardList, PenTool } from 'lucide-react';

const inspectionLogs = [
    { id: 1, plate: '01 A 777 AA', time: '07:20', score: 95, status: 'passed', tech: 'Kamol M.', notes: 'Barqaror holat, moy almashtirildi' },
    { id: 2, plate: '01 Z 123 BB', time: '07:45', score: 88, status: 'passed', tech: 'Kamol M.', notes: 'Tormoz kolodkalari tekshirildi' },
    { id: 3, plate: '01 F 555 FF', time: '08:10', score: 62, status: 'conditional', tech: 'Rustam J.', notes: 'Shina bosimi juda past, to\'ldirildi' },
    { id: 4, plate: '10 O 001 OO', time: '08:45', score: 35, status: 'failed', tech: 'Rustam J.', notes: 'Dvigatel moyi oqayapti. TA\'MIR ZARUR' },
    { id: 5, plate: '01 K 888 KK', time: '09:12', score: 100, status: 'passed', tech: 'Kamol M.', notes: 'MUKAMMAL holatda' },
];

export const MechanicManager = () => {
    return (
        <div className="space-y-6 pb-12">
            <div className="flex justify-between items-center bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Davlat raqami bo'yicha..."
                            className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-amber-500 transition-all w-64 uppercase"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-all text-sm">
                        <Filter size={16} className="text-amber-400" />
                        <span>Filter</span>
                    </button>
                </div>
                <button className="flex items-center gap-2 px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-all shadow-lg shadow-amber-500/20 font-bold text-sm">
                    + Yangi Tekshiruv (Checklist)
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 space-y-4">
                    <h3 className="font-bold flex items-center gap-2 text-lg pb-4 border-b border-slate-700/50">
                        <ClipboardList size={22} className="text-amber-400" />
                        Texnik ko'rik jurnali (Bugun)
                    </h3>
                    <div className="space-y-4">
                        {inspectionLogs.map((log) => (
                            <motion.div
                                key={log.id}
                                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                className="p-4 bg-slate-900/50 border border-slate-700/30 rounded-xl hover:bg-slate-800/50 transition-all group"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h4 className="font-bold text-lg text-blue-400 group-hover:text-amber-400 transition-colors">{log.plate}</h4>
                                        <p className="text-[10px] text-slate-500 font-mono italic">{log.time} • Mas'ul: {log.tech}</p>
                                    </div>
                                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border flex items-center gap-1 ${log.status === 'passed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                        log.status === 'conditional' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                            'bg-red-500/10 text-red-500 border-red-500/20'
                                        }`}>
                                        {log.status === 'passed' ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                        {log.status === 'passed' ? 'SOZ' : log.status === 'conditional' ? 'SHARTLI SOZ' : 'NOSOZ'}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Tekshiruv natijasi (Health Score)</span>
                                        <span className={`font-bold ${log.score > 80 ? 'text-emerald-400' : log.score > 50 ? 'text-orange-400' : 'text-red-400'}`}>{log.score}%</span>
                                    </div>
                                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 ${log.score > 80 ? 'bg-emerald-500' : log.score > 50 ? 'bg-orange-500' : 'bg-red-500'}`}
                                            style={{ width: `${log.score}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <p className="mt-3 text-[10px] text-slate-500 italic bg-slate-900 p-2 rounded-lg border border-slate-800">
                                    <PenTool size={10} className="inline mr-1 opacity-50" /> {log.notes}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-2xl border-t-4 border-amber-500">
                        <h4 className="text-sm font-bold text-slate-400 flex items-center gap-2 mb-6">
                            <Wrench size={18} className="text-amber-400" />
                            Ta'mirlash rejasidagilar (Repair Queue)
                        </h4>
                        <div className="space-y-3">
                            {[
                                { model: 'Chevrolet Tahoe', reason: 'Engine Leak', days: 2 },
                                { model: 'Isuzu NPR', reason: 'Brake Pad Change', days: 1 },
                            ].map((item, i) => (
                                <div key={i} className="flex justify-between items-center p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center font-bold">
                                            <Wrench size={16} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-200">{item.model}</p>
                                            <p className="text-[10px] text-slate-500 uppercase">{item.reason}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-mono text-amber-400">{item.days} kun qoldi</span>
                                        <div className="w-16 bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                                            <div className="bg-amber-400 h-full w-1/2"></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="w-full py-3 mt-6 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-xl transition-all border border-slate-700 hover:border-amber-500/30 flex items-center justify-center gap-2">
                            <ClipboardList size={16} /> Barcha vazifalar (7)
                        </button>
                    </div>

                    <div className="glass-panel p-8 rounded-3xl bg-amber-600/5 border border-amber-600/20 relative overflow-hidden group">
                        <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:scale-110 transition-transform">
                            <Wrench size={140} />
                        </div>
                        <h4 className="text-lg font-bold text-amber-500 mb-2">Muhim Eslatma</h4>
                        <p className="text-sm text-slate-400 leading-relaxed mb-4">
                            Haftalik texnik profilaktika kunlari o'zgartirildi. Keyingi "Heavy Duty" tekshiruvi 12-Mart (Payshanba) kuni soat 10:00 da boshlanadi.
                        </p>
                        <div className="flex gap-2">
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-1 rounded border border-amber-500/20">#TEZIK</span>
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">#YANGILANISH</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
