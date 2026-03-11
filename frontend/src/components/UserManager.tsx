import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    ShieldCheck,
    UserPlus,
    Lock,
    Edit3,
    Trash2,
    CheckCircle2,
    XCircle,
    ChevronRight,
    ShieldAlert
} from 'lucide-react';
import { useI18n } from '../i18n';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'dispatcher' | 'user' | 'manager';
    status: 'active' | 'inactive';
    lastActive: string;
}



const mockUsers: User[] = [
    { id: '1', name: 'Nurbek Jumayev', email: 'nurbekjon1982@gmail.com', role: 'admin', status: 'active', lastActive: 'Respublika' },
    { id: '2', name: 'Sherzod Alimov', email: 'sherzod@smartroute.uz', role: 'dispatcher', status: 'active', lastActive: 'Bugun, 09:45' },
    { id: '3', name: 'Javohir Karimov', email: 'javohir@smartroute.uz', role: 'manager', status: 'inactive', lastActive: 'Kecha' },
    { id: '4', name: 'Ali Valiyev', email: 'ali@smartroute.uz', role: 'user', status: 'active', lastActive: 'Hozir' },
];

const modules = [
    'fleet', 'drivers', 'fuel', 'waybills', 'cargoStats', 'liveTracking', 'accessControl'
];

export const UserManager = () => {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
    const [selectedRole, setSelectedRole] = useState<string>('admin');

    return (
        <div className="space-y-6 pb-10">
            {/* Tab Switcher */}
            <div className="flex p-1 bg-slate-800/50 rounded-2xl w-fit border border-slate-700/50">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                        }`}
                >
                    <Users size={18} /> {t('users')}
                </button>
                <button
                    onClick={() => setActiveTab('roles')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'roles' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                        }`}
                >
                    <ShieldCheck size={18} /> {t('roles')}
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'users' ? (
                    <motion.div
                        key="users-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        {/* User List Header */}
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold">{t('users')}</h3>
                                <p className="text-sm text-slate-500">Tizimga kirish huquqiga ega barcha xodimlar</p>
                            </div>
                            <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20">
                                <UserPlus size={18} />
                                Foydalanuvchi qo'shish
                            </button>
                        </div>

                        {/* Users Table */}
                        <div className="glass-panel rounded-3xl border border-slate-700/50 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-900/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Foydalanuvchi</th>
                                        <th className="px-6 py-4">Roli</th>
                                        <th className="px-6 py-4">Holati</th>
                                        <th className="px-6 py-4">Oxirgi faollik</th>
                                        <th className="px-6 py-4 text-right pr-8">Amallar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/30">
                                    {mockUsers.map((user) => (
                                        <tr key={user.id} className="hover:bg-blue-500/5 transition-all group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{user.name}</p>
                                                        <p className="text-xs text-slate-500">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${user.role === 'admin' ? 'bg-purple-500/10 text-purple-400' :
                                                    user.role === 'dispatcher' ? 'bg-blue-500/10 text-blue-400' :
                                                        'bg-slate-500/10 text-slate-400'
                                                    }`}>
                                                    {t(user.role as any)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {user.status === 'active' ? (
                                                        <CheckCircle2 size={16} className="text-emerald-500" />
                                                    ) : (
                                                        <XCircle size={16} className="text-red-500" />
                                                    )}
                                                    <span className="text-sm text-slate-300 capitalize">{user.status}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-400">
                                                {user.lastActive}
                                            </td>
                                            <td className="px-6 py-4 text-right pr-8 space-x-2">
                                                <button className="p-2 text-slate-500 hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100">
                                                    <Edit3 size={18} />
                                                </button>
                                                <button className="p-2 text-slate-500 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100">
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="roles-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                    >
                        {/* Roles Selection */}
                        <div className="lg:col-span-1 space-y-4">
                            <h3 className="text-xl font-bold mb-6">{t('roles')}</h3>
                            {(['admin', 'dispatcher', 'manager', 'user'] as const).map((role) => (
                                <button
                                    key={role}
                                    onClick={() => setSelectedRole(role)}
                                    className={`w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between group ${selectedRole === role
                                        ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/5'
                                        : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${selectedRole === role ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600'
                                            }`}>
                                            <Lock size={20} />
                                        </div>
                                        <div>
                                            <p className={`font-bold capitalize ${selectedRole === role ? 'text-blue-400' : 'text-white'}`}>
                                                {t(role as any)}
                                            </p>
                                            <p className="text-xs text-slate-500">Tizim bo'limlariga kirish ruxsati</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className={selectedRole === role ? 'text-blue-400' : 'text-slate-600'} />
                                </button>
                            ))}
                        </div>

                        {/* Permissions Matrix */}
                        <div className="lg:col-span-2">
                            <div className="glass-panel p-6 rounded-3xl border border-slate-700/50 h-full">
                                <div className="flex justify-between items-center mb-8">
                                    <div>
                                        <h4 className="text-lg font-bold flex items-center gap-2">
                                            <ShieldAlert size={20} className="text-blue-400" />
                                            {t(selectedRole as any)} uchun {t('permissions')}
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-1">Tanlangan rol uchun tizim modullarini sozlash</p>
                                    </div>
                                    <button className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all">
                                        {t('save')}
                                    </button>
                                </div>

                                <div className="space-y-1">
                                    {modules.map((mod) => (
                                        <div key={mod} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-800/40 transition-all border border-transparent hover:border-slate-700/50">
                                            <div className="flex items-center gap-4">
                                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                <span className="text-sm font-medium text-slate-200">{t(mod as any)}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                {['none', 'read', 'full'].map((access) => (
                                                    <button
                                                        key={access}
                                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${access === 'full' ? 'hover:bg-emerald-500/10 hover:border-emerald-500/50' :
                                                            access === 'read' ? 'hover:bg-blue-500/10 hover:border-blue-500/50' :
                                                                'hover:bg-red-500/10 hover:border-red-500/50'
                                                            } ${(selectedRole === 'admin') ? (access === 'full' ? 'bg-emerald-500 text-white' : 'text-slate-500') :
                                                                (access === 'read' ? 'bg-blue-600 text-white' : 'text-slate-500')
                                                            }`}
                                                    >
                                                        {access}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
