import { motion } from 'framer-motion';
import { Activity, Heart, Droplets, AlertCircle, CheckCircle2, Search, Calendar, Download } from 'lucide-react';

const medicalLogs = [
    { id: 1, name: 'Azamat Rasulov', time: '08:35', pulse: '72 bpm', bp: '120/80', alcohol: '0.00%', status: 'passed' },
    { id: 2, name: 'Sherzod Munirov', time: '08:50', pulse: '78 bpm', bp: '125/85', alcohol: '0.00%', status: 'passed' },
    { id: 3, name: 'Ilyos Tojirov', time: '09:18', pulse: '95 bpm', bp: '150/95', alcohol: '0.00%', status: 'flagged' },
    { id: 4, name: 'Jasur Bekov', time: '09:25', pulse: '80 bpm', bp: '130/85', alcohol: '0.12%', status: 'failed' },
    { id: 5, name: 'Otabek Mirzayev', time: '09:40', pulse: '68 bpm', bp: '118/76', alcohol: '0.00%', status: 'passed' },
];

export const MedicalManager = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Haydovchi bo'yicha qidiring..."
                            className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500 transition-all w-72"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-all text-sm">
                        <Calendar size={16} className="text-emerald-400" />
                        <span>Bugun (10-Mart)</span>
                    </button>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm font-bold">
                    <Download size={16} /> Tibbiy Hisobot (CSV)
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                    <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                        <h3 className="font-bold flex items-center gap-2 text-lg">
                            <Activity size={20} className="text-emerald-400" />
                            ESMO: Tibbiy ko'rik jurnali
                        </h3>
                        <div className="flex gap-2 text-[10px] font-bold">
                            <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">4 O'tdi</span>
                            <span className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full border border-red-500/20">1 O'tmadi</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-900/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="px-6 py-4">Haydovchi</th>
                                    <th className="px-6 py-4">Vaqt</th>
                                    <th className="px-6 py-4">Pulse (Yurak)</th>
                                    <th className="px-6 py-4">Qon bosimi</th>
                                    <th className="px-6 py-4">Alkogol testi</th>
                                    <th className="px-6 py-4">Xulosa</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                {medicalLogs.map((log) => (
                                    <motion.tr key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-800/40 transition-all group">
                                        <td className="px-6 py-4 font-bold text-slate-200 uppercase text-xs group-hover:text-emerald-400 transition-colors">
                                            {log.name}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-400 font-mono">{log.time}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Heart size={14} className={log.status === 'flagged' ? 'text-red-400' : 'text-emerald-400'} />
                                                <span className={log.status === 'flagged' ? 'text-red-400 font-bold' : ''}>{log.pulse}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-medium text-slate-300">{log.bp}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Droplets size={14} className={log.status === 'failed' ? 'text-red-400' : 'text-blue-400'} />
                                                <span className={log.status === 'failed' ? 'text-red-400 font-bold' : ''}>{log.alcohol} BAC</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border inline-flex items-center gap-1 ${log.status === 'passed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                    log.status === 'flagged' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                                        'bg-red-500/10 text-red-500 border-red-500/20'
                                                }`}>
                                                {log.status === 'passed' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                                {log.status === 'passed' ? 'RUXSAT' : log.status === 'flagged' ? 'QAYTA TEKSHIRUV' : 'RAD ETILDI'}
                                            </span>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-2xl border-t-4 border-emerald-500">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center justify-between">
                            Trend (So'nggi 7 kun) <Activity size={12} />
                        </h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-end gap-1 h-20">
                                {[45, 60, 48, 72, 85, 30, 55].map((h, i) => (
                                    <div key={i} className="bg-emerald-500/20 w-full rounded-t-sm relative group">
                                        <div
                                            className="absolute bottom-0 w-full bg-emerald-500 rounded-t-sm transition-all duration-1000"
                                            style={{ height: `${h}%` }}
                                        ></div>
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] invisible group-hover:visible">{h}</div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-center text-slate-500 italic">Sog'lomlik ko'rsatkichi (O'rtacha 88%)</p>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl bg-orange-500/5 border border-orange-500/20">
                        <h4 className="text-xs font-bold text-orange-400 uppercase mb-2">Tavsiya (AI Insight)</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Haydovchi **Ilyos Tojirov** qon bosimi me'yordan sezilarli darajada yuqori. Bugungi safardan ozod qilish tavsiya etiladi.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
