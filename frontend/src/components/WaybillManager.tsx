import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, Eye, Download, Printer, ShieldCheck, Stethoscope, Plus, Fingerprint } from 'lucide-react';

const initialWaybills = [
    { id: 'WL-00892', plate: '01 A 777 AA', driver: 'Azamat Rasulov', status: 'active', cargo: 'Qurilish mollari', weight: '18.5t', medic: 'PASSED', mechanics: 'PASSED', faceId: 'PASSED', esmo: 'PASSED', time: 'Bugun, 08:30', duration: '2s 15m' },
    { id: 'WL-00891', plate: '01 Z 123 BB', driver: 'Sherzod Munirov', status: 'active', cargo: 'G\'isht', weight: '22.0t', medic: 'PASSED', mechanics: 'PASSED', faceId: 'PASSED', esmo: 'PASSED', time: 'Bugun, 08:45', duration: '1s 50m' },
    { id: 'WL-00888', plate: '40 L 444 LL', driver: 'Ilyos Tojirov', status: 'completed', cargo: 'Oziq-ovqat', weight: '15.0t', medic: 'PASSED', mechanics: 'PASSED', faceId: 'PASSED', esmo: 'PASSED', time: 'Kecha, 18:20', duration: '6s 10m' },
    { id: 'WL-00885', plate: '10 O 001 OO', driver: 'Nil', status: 'rejected', cargo: '-', weight: '-', medic: 'FAILED', mechanics: 'PASSED', faceId: 'PENDING', esmo: 'FAILED', time: 'Kecha, 09:15', duration: '-' },
    { id: 'WL-00880', plate: '01 K 888 KK', status: 'pending', cargo: 'Maishiy texnika', weight: '1.2t', medic: 'PENDING', mechanics: 'PENDING', faceId: 'PENDING', esmo: 'PENDING', time: 'Kutilmoqda', duration: '-' },
];

export const WaybillManager = () => {
    const [waybills, setWaybills] = useState(initialWaybills);
    const [isIssuing, setIsIssuing] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');

    const filteredWaybills = waybills.filter(w =>
        (w.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (w.driver && w.driver.toLowerCase().includes(searchTerm.toLowerCase()))) &&
        (filterStatus === 'All' || w.status === filterStatus)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 gap-4">
                <div className="flex flex-wrap gap-4 flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Varaqa ID, Mashina yoki Haydovchi..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 transition-all w-full"
                        />
                    </div>
                    <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-700">
                        {['All', 'active', 'completed', 'rejected'].map((s) => (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(s)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase ${filterStatus === s ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'
                                    }`}
                            >
                                {s === 'All' ? 'Barchasi' : s === 'active' ? 'Faol' : s === 'completed' ? 'Yopilgan' : 'Rad etilgan'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => alert('Yangi yo\'l varaqasi ochish oynasi (Hozircha simulyatsiya)')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/20"
                    >
                        <Plus size={18} /> Yangi varaqa
                    </button>
                    <button className="p-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-all">
                        <Printer size={18} />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all">
                        <Download size={18} /> Eksport
                    </button>
                </div>
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-900/80 text-slate-400 text-[10px] font-bold uppercase tracking-widest border-b border-slate-700/50">
                                <th className="px-6 py-5">Varaqa ID</th>
                                <th className="px-6 py-5">Transport</th>
                                <th className="px-6 py-5">Haydovchi</th>
                                <th className="px-6 py-5">Yuk va Og'irlik</th>
                                <th className="px-6 py-5 text-center">Nazorat (F/E)</th>
                                <th className="px-6 py-5">Safar vaqti</th>
                                <th className="px-6 py-5 text-right">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {filteredWaybills.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center">
                                        <FileText size={48} className="mx-auto text-slate-700 mb-4 opacity-20" />
                                        <p className="text-slate-500">Hech qanday yo'l varaqasi topilmadi</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredWaybills.map((w) => (
                                    <motion.tr
                                        key={w.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="hover:bg-blue-500/5 transition-all group"
                                    >
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-blue-400 font-bold">{w.id}</span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-200 uppercase">{w.plate}</td>
                                        <td className="px-6 py-4">
                                            <span className={w.driver === 'Nil' ? 'text-slate-600 italic' : 'text-slate-300'}>{w.driver}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs font-bold text-slate-200">{(w as any).cargo}</p>
                                            <p className="text-[10px] text-blue-400 font-mono">{(w as any).weight}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-1.5 justify-center">
                                                {/* Face ID (F) */}
                                                <div className={`p-1.5 rounded-lg border ${(w as any).faceId === 'PASSED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                                    (w as any).faceId === 'FAILED' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-500'
                                                    }`} title="Face ID">
                                                    <ShieldCheck size={14} />
                                                </div>
                                                {/* ESMO (E) */}
                                                <div className={`p-1.5 rounded-lg border ${(w as any).esmo === 'PASSED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                                    (w as any).esmo === 'FAILED' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-500'
                                                    }`} title="ESMO">
                                                    <Stethoscope size={14} />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs">
                                            <p className="text-slate-300 mb-0.5">{w.time}</p>
                                            <p className="text-slate-500 font-mono">{w.duration}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border ${w.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                                w.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                                    w.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                                                        'bg-slate-800 text-slate-500 border-slate-700'
                                                }`}>
                                                {w.status === 'active' ? 'Yo\'lda' : w.status === 'completed' ? 'Yakunlangan' : w.status === 'rejected' ? 'Rad etilgan' : 'Kutilmoqda'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {w.status === 'pending' && (
                                                    <button
                                                        onClick={() => {
                                                            if ((w as any).faceId === 'PASSED' && (w as any).esmo === 'PASSED') {
                                                                setIsIssuing(w.id);
                                                                setTimeout(() => {
                                                                    setWaybills(prev => prev.map(item => item.id === w.id ? { ...item, status: 'active' as any } : item));
                                                                    setIsIssuing(null);
                                                                    alert(`${w.id} raqamli yo'l varaqasi muvaffaqiyatli berildi! 🖨️✅`);
                                                                }, 2000);
                                                            } else {
                                                                alert('Xatolik: Haydovchi Face ID va ESMO nazoratidan o\'tmagan! ❌');
                                                            }
                                                        }
                                                        }
                                                        disabled={isIssuing === w.id}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${((w as any).faceId === 'PASSED' && (w as any).esmo === 'PASSED')
                                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                                                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                                            }`}
                                                    >
                                                        {isIssuing === w.id ? (
                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <Fingerprint size={14} />
                                                        )}
                                                        Berish
                                                    </button>
                                                )}
                                                <button className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all">
                                                    <Eye size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
