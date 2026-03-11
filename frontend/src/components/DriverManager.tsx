import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ShieldCheck, Award, AlertTriangle, Search, Phone, Trash2, X, Plus, Pencil } from 'lucide-react';

const initialDrivers = [
    { id: 1, name: 'Azamat Rasulov', status: 'available', safety_score: 98, license: 'AB 1234567', phone: '+998 90 123-45-67', trips: 1450, avatar: 'A' },
    { id: 2, name: 'Sherzod Munirov', status: 'on_trip', safety_score: 85, license: 'BC 7654321', phone: '+998 93 321-65-43', trips: 890, avatar: 'S' },
    { id: 3, name: 'Ilyos Tojirov', status: 'on_trip', safety_score: 92, license: 'AD 9988776', phone: '+998 97 777-00-11', trips: 2100, avatar: 'I' },
    { id: 4, name: 'Jasur Bekov', status: 'rest', safety_score: 74, license: 'BA 5544332', phone: '+998 99 555-44-33', trips: 320, avatar: 'J' },
    { id: 5, name: 'Otabek Mirzayev', status: 'available', safety_score: 100, license: 'CE 1122334', phone: '+998 90 888-99-00', trips: 15, avatar: 'O' },
];

export const DriverManager = () => {
    const [drivers, setDrivers] = useState(initialDrivers);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [newDriver, setNewDriver] = useState({ name: '', license: '', phone: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');

    const deleteDriver = (id: number) => {
        if (confirm('Ushbu haydovchini o\'chirishni tasdiqlaysizmi?')) {
            setDrivers(drivers.filter(d => d.id !== id));
        }
    };

    const handleEdit = (d: any) => {
        setNewDriver({ name: d.name, license: d.license, phone: d.phone });
        setEditingId(d.id);
        setIsEditMode(true);
        setIsModalOpen(true);
    };

    const saveDriver = () => {
        if (!newDriver.name || !newDriver.license) return alert('Barcha maydonlarni to\'ldiring!');

        if (isEditMode && editingId) {
            setDrivers(drivers.map(d => d.id === editingId ? { ...d, ...newDriver, avatar: newDriver.name.charAt(0).toUpperCase() } : d));
        } else {
            const driver = {
                ...newDriver,
                id: Date.now(),
                status: 'available',
                safety_score: 100,
                trips: 0,
                avatar: newDriver.name.charAt(0).toUpperCase()
            };
            setDrivers([driver as any, ...drivers]);
        }

        closeModal();
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingId(null);
        setNewDriver({ name: '', license: '', phone: '' });
    };

    const filteredDrivers = drivers.filter(d =>
        (d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.license.toLowerCase().includes(searchTerm.toLowerCase())) &&
        (filterStatus === 'All' || d.status === filterStatus)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 gap-4">
                <div className="flex flex-wrap gap-4 flex-1">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="F.I.SH yoki Guvohnoma..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 transition-all w-full"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 transition-all text-sm text-slate-300"
                    >
                        <option value="All">Barcha holatlar</option>
                        <option value="available">Bo'sh</option>
                        <option value="on_trip">Safarda</option>
                        <option value="rest">Dam olmoqda</option>
                    </select>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
                >
                    <Plus size={18} /> Yangi haydovchi
                </button>
            </div>

            {filteredDrivers.length === 0 ? (
                <div className="text-center py-20 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
                    <Users size={48} className="mx-auto text-slate-600 mb-4 opacity-20" />
                    <p className="text-slate-500">Hech qanday haydovchi topilmadi</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {filteredDrivers.map((d) => (
                            <motion.div
                                key={d.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                className="glass-panel p-6 rounded-2xl border border-slate-700/50 hover:border-indigo-500/30 transition-all group relative"
                            >
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                                    <button
                                        onClick={() => handleEdit(d)}
                                        className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => deleteDriver(d.id)}
                                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 p-[2px] shadow-lg">
                                        <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-xl font-bold">
                                            {d.avatar}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-lg group-hover:text-indigo-400 transition-colors uppercase">{d.name}</h4>
                                        <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${d.status === 'available' ? 'text-emerald-400' :
                                                d.status === 'on_trip' ? 'text-blue-400' :
                                                    'text-orange-400'
                                            }`}>
                                            <div className={`w-2 h-2 rounded-full ${d.status === 'available' ? 'bg-emerald-400' :
                                                    d.status === 'on_trip' ? 'bg-blue-400' :
                                                        'bg-orange-400'
                                                } animate-pulse`}></div>
                                            {d.status === 'available' ? 'Bo\'sh' : d.status === 'on_trip' ? 'Safar ostida' : 'Dam olmoqda'}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center gap-1">
                                            <ShieldCheck size={12} /> Xavfsizlik
                                        </p>
                                        <p className={`text-lg font-bold ${d.safety_score > 90 ? 'text-emerald-400' : d.safety_score > 80 ? 'text-blue-400' : 'text-orange-400'}`}>
                                            {d.safety_score}%
                                        </p>
                                    </div>
                                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center gap-1">
                                            <Award size={12} /> Safarlar
                                        </p>
                                        <p className="text-lg font-bold text-slate-100">{d.trips}</p>
                                    </div>
                                </div>

                                <div className="space-y-3 text-sm border-t border-slate-700/50 pt-4">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Guvohnoma:</span>
                                        <span className="font-mono text-slate-300">{d.license}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500">Telefon:</span>
                                        <a href={`tel:${d.phone}`} className="text-indigo-400 flex items-center gap-1 hover:underline">
                                            <Phone size={12} /> {d.phone}
                                        </a>
                                    </div>
                                </div>

                                {d.safety_score < 80 && (
                                    <div className="mt-4 p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-center gap-2 text-[10px] text-orange-400 font-medium">
                                        <AlertTriangle size={14} /> Diqqat: Reyting past!
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Add/Edit Driver Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={closeModal}
                            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                        ></motion.div>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-panel w-full max-w-md p-8 rounded-3xl relative z-10 border border-slate-700 shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-bold">{isEditMode ? 'Haydovchini tahrirlash' : 'Yangi haydovchi'}</h3>
                                <button onClick={closeModal} className="p-2 hover:bg-slate-800 rounded-lg"><X size={20} /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">F.I.SH</label>
                                    <input
                                        type="text" value={newDriver.name} onChange={e => setNewDriver({ ...newDriver, name: e.target.value })}
                                        placeholder="Eshmatov Toshmat" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none transition-all uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Guvohnoma raqami</label>
                                    <input
                                        type="text" value={newDriver.license} onChange={e => setNewDriver({ ...newDriver, license: e.target.value })}
                                        placeholder="AA 1234567" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none transition-all uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Telefon raqam</label>
                                    <input
                                        type="text" value={newDriver.phone} onChange={e => setNewDriver({ ...newDriver, phone: e.target.value })}
                                        placeholder="+998 90 123-45-67" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                                <button
                                    onClick={saveDriver}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/20 transition-all mt-4"
                                >
                                    {isEditMode ? 'Yangilash' : 'Qo\'shish'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
