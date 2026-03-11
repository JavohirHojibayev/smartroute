import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, Fuel, Activity, Search, Users, Trash2, X, Plus, Pencil, Weight, Box } from 'lucide-react';
import { useI18n } from '../i18n';

const initialVehicles = [
    { id: 1, plate: '01 A 777 AA', model: 'MAN TGS 18.400', category: 'Heavy Truck', capacity: '20t', volume: '80m³', status: 'active', fuel: 85, fuelType: 'diesel', driver: 'Azamat R.', odometer: '42,500 km' },
    { id: 2, plate: '01 Z 123 BB', model: 'Kamaz 6520', category: 'Heavy Truck', capacity: '25t', volume: '20m³', status: 'active', fuel: 42, fuelType: 'diesel', driver: 'Sherzod M.', odometer: '156,200 km' },
    { id: 3, plate: '10 O 001 OO', model: 'Volvo FH16', category: 'Heavy Truck', capacity: '30t', volume: '90m³', status: 'repair', fuel: 10, fuelType: 'diesel', driver: 'Nil', odometer: '12,000 km' },
    { id: 4, plate: '01 F 555 FF', model: 'Isuzu NPR82', category: 'Light Cargo', capacity: '5t', volume: '25m³', status: 'active', fuel: 68, fuelType: 'metan', driver: 'Ilyos T.', odometer: '98,000 km' },
    { id: 5, plate: '01 K 888 KK', model: 'Gazel Next', category: 'Light Cargo', capacity: '1.5t', volume: '12m³', status: 'standby', fuel: 100, fuelType: 'propan', driver: 'Nil', odometer: '5,400 km' },
];

export const FleetManager = () => {
    const { t } = useI18n();
    const [vehicles, setVehicles] = useState(initialVehicles);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [newVehicle, setNewVehicle] = useState({ plate: '', model: '', category: 'Heavy Truck', fuelType: 'diesel', capacity: '', volume: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');

    const deleteVehicle = (id: number) => {
        if (confirm('Ushbu transportni o\'chirishni tasdiqlaysizmi?')) {
            setVehicles(vehicles.filter(v => v.id !== id));
        }
    };

    const handleEdit = (v: any) => {
        setNewVehicle({ plate: v.plate, model: v.model, category: v.category, fuelType: v.fuelType, capacity: v.capacity, volume: v.volume });
        setEditingId(v.id);
        setIsEditMode(true);
        setIsModalOpen(true);
    };

    const saveVehicle = () => {
        if (!newVehicle.plate || !newVehicle.model) return alert('Barcha maydonlarni to\'ldiring!');

        if (isEditMode && editingId) {
            setVehicles(vehicles.map(v => v.id === editingId ? { ...v, ...newVehicle } : v));
        } else {
            const vehicle = {
                ...newVehicle,
                id: Date.now(),
                status: 'standby',
                fuel: 100,
                driver: 'Nil',
                odometer: '0 km'
            };
            setVehicles([vehicle as any, ...vehicles]);
        }

        closeModal();
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingId(null);
        setNewVehicle({ plate: '', model: '', category: 'Heavy Truck', fuelType: 'diesel', capacity: '', volume: '' });
    };

    const filteredVehicles = vehicles.filter(v =>
        (v.plate.toLowerCase().includes(searchTerm.toLowerCase()) || v.model.toLowerCase().includes(searchTerm.toLowerCase())) &&
        (filterCategory === 'All' || v.category === filterCategory)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 gap-4">
                <div className="flex flex-wrap gap-4 flex-1">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Qidiruv (Raqam yoki Model)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 transition-all w-full"
                        />
                    </div>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 transition-all text-sm text-slate-300"
                    >
                        <option value="All">Barcha kategoriyalar</option>
                        <option value="Heavy Truck">Heavy Truck</option>
                        <option value="Light Cargo">Light Cargo</option>
                        <option value="Refrigerator">Refrigerator</option>
                        <option value="Container">Container</option>
                    </select>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                >
                    <Plus size={18} /> Yangi transport
                </button>
            </div>

            {filteredVehicles.length === 0 ? (
                <div className="text-center py-20 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
                    <Car size={48} className="mx-auto text-slate-600 mb-4 opacity-20" />
                    <p className="text-slate-500">Hech qanday transport topilmadi</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {filteredVehicles.map((v) => (
                            <motion.div
                                key={v.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                className="glass-panel p-5 rounded-2xl border border-slate-700/50 hover:border-blue-500/30 transition-all group relative"
                            >
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                                    <button
                                        onClick={() => handleEdit(v)}
                                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => deleteVehicle(v.id)}
                                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                                        <Car size={24} />
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${v.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                        v.status === 'repair' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                            'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                        }`}>
                                        {v.status === 'active' ? 'Yo\'lda' : v.status === 'repair' ? 'Ta\'mirda' : 'Kutilmoqda'}
                                    </div>
                                </div>

                                <h4 className="text-xl font-bold mb-1 group-hover:text-blue-400 transition-colors uppercase">{v.plate}</h4>
                                <p className="text-slate-400 text-sm mb-3">
                                    {v.model} • {v.category} • <span className="text-blue-400 font-semibold">{t(v.fuelType as any)}</span>
                                </p>

                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="p-2 bg-slate-900/50 rounded-xl border border-slate-700/30">
                                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                                            <Weight size={12} className="text-blue-400" />
                                            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('tonnage')}</span>
                                        </div>
                                        <p className="font-bold text-slate-200 text-xs">{(v as any).capacity}</p>
                                    </div>
                                    <div className="p-2 bg-slate-900/50 rounded-xl border border-slate-700/30">
                                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                                            <Box size={12} className="text-blue-400" />
                                            <span className="text-[9px] font-bold uppercase tracking-tighter">{t('volume')}</span>
                                        </div>
                                        <p className="font-bold text-slate-200 text-xs">{(v as any).volume}</p>
                                    </div>
                                </div>

                                <div className="space-y-3 border-t border-slate-700/50 pt-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 flex items-center gap-2"><Fuel size={14} /> Yoqilg'i</span>
                                        <span className={`font-medium ${v.fuel < 20 ? 'text-red-400' : 'text-slate-100'}`}>{v.fuel}%</span>
                                    </div>
                                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                        <div className={`h-full rounded-full ${v.fuel < 20 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${v.fuel}%` }}></div>
                                    </div>
                                    <div className="flex justify-between items-center text-sm pt-2">
                                        <span className="text-slate-400 flex items-center gap-2"><Activity size={14} /> Odometer</span>
                                        <span className="font-medium text-slate-200">{v.odometer}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 flex items-center gap-2"><Users size={14} /> Haydovchi</span>
                                        <span className="font-medium text-blue-400">{v.driver}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Add/Edit Modal */}
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
                                <h3 className="text-2xl font-bold">{isEditMode ? 'Transportni tahrirlash' : 'Yangi transport'}</h3>
                                <button onClick={closeModal} className="p-2 hover:bg-slate-800 rounded-lg"><X size={20} /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Davlat raqami</label>
                                    <input
                                        type="text" value={newVehicle.plate} onChange={e => setNewVehicle({ ...newVehicle, plate: e.target.value })}
                                        placeholder="01 A 777 AA" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none transition-all uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Model va Marka</label>
                                    <input
                                        type="text" value={newVehicle.model} onChange={e => setNewVehicle({ ...newVehicle, model: e.target.value })}
                                        placeholder="Chevrolet Traverse" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">O'lchami</label>
                                        <input
                                            type="text" value={(newVehicle as any).volume} onChange={e => setNewVehicle({ ...newVehicle, volume: e.target.value })}
                                            placeholder="80m³" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Sig'imi</label>
                                        <input
                                            type="text" value={(newVehicle as any).capacity} onChange={e => setNewVehicle({ ...newVehicle, capacity: e.target.value })}
                                            placeholder="20t" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Kategoriya</label>
                                        <select
                                            value={newVehicle.category} onChange={e => setNewVehicle({ ...newVehicle, category: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none transition-all"
                                        >
                                            <option>Heavy Truck</option><option>Light Cargo</option><option>Refrigerator</option><option>Container</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Yoqilg'i turi</label>
                                        <select
                                            value={newVehicle.fuelType} onChange={e => setNewVehicle({ ...newVehicle, fuelType: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none transition-all"
                                        >
                                            <option value="benzin">Benzin</option><option value="diesel">Salyarka</option>
                                            <option value="metan">Metan</option><option value="propan">Propan</option>
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={saveVehicle}
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 transition-all mt-4"
                                >
                                    {isEditMode ? 'Yangilash' : 'Saqlash'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
