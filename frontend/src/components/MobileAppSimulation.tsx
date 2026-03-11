import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Smartphone,
    Battery,
    Wifi,
    MapPin,
    QrCode,
    Bell,
    Navigation2,
    Droplet,
    ShieldCheck,
    Activity,
    Lock,
    ChevronRight,
    Play
} from 'lucide-react';

export const MobileAppSimulation = () => {
    const [step, setStep] = useState(0); // 0: Home, 1: Smart Start, 2: Active Trip
    const [checks, setChecks] = useState({ face: false, medic: false, mechanic: false });

    const progress = Object.values(checks).filter(Boolean).length;

    return (
        <div className="flex flex-col items-center justify-center py-10 space-y-8 min-h-[600px]">
            <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-slate-100">Driver Mobile Pro</h3>
                <p className="text-slate-500 text-sm">Haydovchilar uchun mobil ilova simulyatsiyasi</p>
            </div>

            {/* Smartphone Frame */}
            <div className="relative w-[320px] h-[640px] bg-slate-900 rounded-[3rem] border-[8px] border-slate-800 shadow-2xl overflow-hidden ring-4 ring-slate-800/50">
                {/* Status Bar */}
                <div className="h-6 bg-transparent flex justify-between items-center px-6 mt-2 relative z-10">
                    <span className="text-[10px] font-bold text-white">09:41</span>
                    <div className="flex gap-1.5 items-center">
                        <Wifi size={12} className="text-white" />
                        <Battery size={12} className="text-white" />
                    </div>
                </div>

                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-800 rounded-b-2xl z-20"></div>

                {/* App Content */}
                <div className="h-full pt-10 px-4 pb-12 overflow-y-auto no-scrollbar">
                    <AnimatePresence mode="wait">
                        {step === 0 && (
                            <motion.div
                                key="home"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                {/* Header */}
                                <div className="flex justify-between items-center px-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">A</div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Xush kelibsiz</p>
                                            <p className="text-sm font-bold text-white">Azamat R.</p>
                                        </div>
                                    </div>
                                    <Bell size={20} className="text-slate-400" />
                                </div>

                                {/* Main Action Card */}
                                <div className="p-6 bg-blue-600 rounded-[2rem] text-white shadow-xl shadow-blue-600/20">
                                    <p className="text-xs opacity-80 mb-1">Bugungi holat</p>
                                    <h4 className="text-2xl font-bold mb-4">Navbatchilikda emassiz</h4>
                                    <button
                                        onClick={() => setStep(1)}
                                        className="w-full py-3 bg-white text-blue-600 rounded-xl font-bold text-sm shadow-md hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Play size={16} fill="currentColor" /> Ishni boshlash
                                    </button>
                                </div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-2xl">
                                        <Droplet className="text-cyan-400 mb-2" size={18} />
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">Yoqilg'i</p>
                                        <p className="text-lg font-bold">128 L</p>
                                    </div>
                                    <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-2xl">
                                        <Navigation2 className="text-emerald-400 mb-2" size={18} />
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">Safarlar</p>
                                        <p className="text-lg font-bold">12 ta</p>
                                    </div>
                                </div>

                                {/* Future Reservations */}
                                <div className="space-y-3">
                                    <h5 className="text-xs font-bold text-slate-500 uppercase px-2">Keyingi reja</h5>
                                    <div className="p-4 bg-slate-800/80 rounded-2xl flex items-center gap-4">
                                        <div className="p-2 bg-slate-700 rounded-xl"><MapPin size={18} className="text-blue-400" /></div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold">Toshkent - Samarqand</p>
                                            <p className="text-[10px] text-slate-500 italic">Ertaga, soat 06:00</p>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-600" />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 1 && (
                            <motion.div
                                key="workflow"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="px-2">
                                    <button onClick={() => setStep(0)} className="text-slate-500 text-xs mb-4">← Orqaga</button>
                                    <h4 className="text-xl font-bold mb-1">Smart Start</h4>
                                    <p className="text-xs text-slate-500">Iltimos, barcha bosqichlardan o'ting</p>
                                </div>

                                <div className="space-y-3">
                                    {/* Step 1: Face ID */}
                                    <div
                                        onClick={() => setChecks({ ...checks, face: true })}
                                        className={`p-4 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer ${checks.face ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-xl ${checks.face ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                            <Lock size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold">Face ID</p>
                                            <p className="text-[10px] text-slate-500">Shaxsingizni tasdiqlang</p>
                                        </div>
                                        {checks.face && <ShieldCheck size={20} className="text-emerald-500" />}
                                    </div>

                                    {/* Step 2: Medical */}
                                    <div
                                        onClick={() => checks.face && setChecks({ ...checks, medic: true })}
                                        className={`p-4 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer ${!checks.face ? 'opacity-50 grayscale' : checks.medic ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-xl ${checks.medic ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                            <Activity size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold">Medical Check</p>
                                            <p className="text-[10px] text-slate-500">Qon bosimi va puls</p>
                                        </div>
                                        {checks.medic && <ShieldCheck size={20} className="text-emerald-500" />}
                                    </div>

                                    {/* Step 3: Mechanic */}
                                    <div
                                        onClick={() => checks.medic && setChecks({ ...checks, mechanic: true })}
                                        className={`p-4 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer ${!checks.medic ? 'opacity-50 grayscale' : checks.mechanic ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-xl ${checks.mechanic ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                            <QrCode size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold">Mashina tekshiruvi</p>
                                            <p className="text-[10px] text-slate-500">QR-kod orqali tasdiqlash</p>
                                        </div>
                                        {checks.mechanic && <ShieldCheck size={20} className="text-emerald-500" />}
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button
                                        disabled={progress < 3}
                                        onClick={() => setStep(2)}
                                        className={`w-full py-4 rounded-2xl font-bold transition-all shadow-xl ${progress === 3 ? 'bg-blue-600 text-white shadow-blue-600/30' : 'bg-slate-800 text-slate-600'
                                            }`}
                                    >
                                        Yo'lvaraqasini olish
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="trip"
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                className="space-y-6"
                            >
                                <div className="px-2 text-center pb-4">
                                    <div className="w-16 h-1 bg-slate-700 mx-auto rounded-full mb-6"></div>
                                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest animate-pulse">Safar faol</p>
                                    <h4 className="text-xl font-bold">01 A 777 AA</h4>
                                </div>

                                <div className="p-6 bg-slate-800/80 rounded-[2.5rem] border border-slate-700 text-center relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <Navigation2 size={42} className="mx-auto text-blue-500 mb-4 animate-bounce" />
                                    <p className="text-3xl font-bold font-mono">12:44:05</p>
                                    <p className="text-xs text-slate-500">Safar davomiyligi</p>
                                </div>

                                <div className="p-5 bg-slate-800/40 rounded-3xl border border-slate-700/50 space-y-4">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Manzil:</span>
                                        <span className="font-bold">Samarqand ko'chasi, 24-uy</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Tezlik:</span>
                                        <span className="font-bold text-emerald-400">45 km/s</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Yoqilg'i:</span>
                                        <span className="font-bold text-blue-400">72%</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-4">
                                    <button className="py-3 bg-slate-800 text-white rounded-xl text-xs font-bold">Yoqilg'i quyish</button>
                                    <button className="py-3 bg-red-500 text-white rounded-xl text-xs font-bold">S.O.S</button>
                                </div>

                                <button
                                    onClick={() => { setStep(0); setChecks({ face: false, medic: false, mechanic: false }) }}
                                    className="w-full py-4 mt-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/20"
                                >
                                    Safarni yakunlash
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Home Indicator */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-slate-700 rounded-full"></div>
            </div>

            {/* Control Info */}
            <div className="max-w-md bg-blue-500/5 border border-blue-500/10 p-6 rounded-3xl">
                <h4 className="flex items-center gap-2 text-blue-400 font-bold mb-2">
                    <Smartphone size={18} /> Interaktiv Simulyatsiya
                </h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                    Ushbu mobil ilova haydovchi o'z ishini qanday boshlashini ko'rsatadi.
                    <strong> "Ishni boshlash"</strong> tugmasini bosing va Face ID, Tibbiy ko'rik bosqichlarini tasdiqlang.
                    Hammasi to'g'ri bo'lgach, haydovchi o'zining digital yo'lvaraqasini oladi va safarni boshlaydi.
                </p>
            </div>
        </div>
    );
};
