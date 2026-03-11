import { useState, useEffect } from 'react';
import {
  Car,
  Map,
  Users,
  Droplet,
  FileText,
  Wrench,
  Activity,
  Globe,
  Bell,
  Navigation,
  ScanFace,
  Heart,
  ClipboardList,
  Smartphone,
  Weight,
  Box,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useI18n } from './i18n';
import { SmartStartWorkflow } from './components/SmartStartWorkflow';
import { FleetManager } from './components/FleetManager';
import { DriverManager } from './components/DriverManager';
import { FuelManager } from './components/FuelManager';
import { WaybillManager } from './components/WaybillManager';
import { ReportsManager } from './components/ReportsManager';
import { LiveTracker } from './components/LiveTracker';
import { AccessControlManager } from './components/AccessControlManager';
import { MedicalManager } from './components/MedicalManager';
import { MechanicManager } from './components/MechanicManager';
import { MobileAppSimulation } from './components/MobileAppSimulation';
import { CargoManager } from './components/CargoManager';
import { UserManager } from './components/UserManager';

const performanceData = [
  { time: '08:00', fuel: 4000, efficiency: 2400 },
  { time: '10:00', fuel: 3000, efficiency: 1398 },
  { time: '12:00', fuel: 2000, efficiency: 9800 },
  { time: '14:00', fuel: 2780, efficiency: 3908 },
  { time: '16:00', fuel: 1890, efficiency: 4800 },
  { time: '18:00', fuel: 2390, efficiency: 3800 },
  { time: '20:00', fuel: 3490, efficiency: 4300 },
];

function App() {
  const { t, lang, setLang } = useI18n();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [liveStats, setLiveStats] = useState({ trips: 87, fuel: 94 });
  const userRole: 'admin' | 'dispatcher' | 'manager' = 'admin';

  // Role-based permissions mapping
  const rolePermissions: Record<string, string[]> = {
    admin: ['dashboard', 'fleet', 'tracking', 'drivers', 'access', 'medical', 'mechanic', 'waybills', 'fuel', 'cargo', 'settings', 'reports', 'mobile'],
    dispatcher: ['dashboard', 'fleet', 'tracking', 'drivers', 'access', 'waybills', 'cargo', 'mobile'],
    manager: ['dashboard', 'fleet', 'fuel', 'cargo', 'reports'],
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveStats(prev => ({
        trips: Math.max(80, Math.min(100, prev.trips + (Math.random() > 0.5 ? 1 : -1))),
        fuel: Math.max(90, Math.min(98, prev.fuel + (Math.random() > 0.5 ? 0.2 : -0.2)))
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleLang = () => {
    setLang(lang === 'uz' ? 'ru' : 'uz');
  };

  const navItems = [
    { id: 'dashboard', icon: <Activity />, label: t('dashboard') },
    { id: 'fleet', icon: <Car />, label: t('fleet') },
    { id: 'tracking', icon: <Navigation />, label: t('liveTracking') },
    { id: 'drivers', icon: <Users />, label: t('drivers') },
    { id: 'access', icon: <ScanFace />, label: t('accessControl') },
    { id: 'medical', icon: <Heart />, label: t('medicalChecks') },
    { id: 'mechanic', icon: <Wrench />, label: t('vehicleInspections') },
    { id: 'waybills', icon: <FileText />, label: t('waybills') },
    { id: 'fuel', icon: <Droplet />, label: t('fuel') },
    { id: 'cargo', icon: <Box />, label: t('cargoStats') },
    { id: 'settings', icon: <Settings />, label: t('settings') },
    { id: 'reports', icon: <ClipboardList />, label: t('reports') },
    { id: 'mobile', icon: <Smartphone />, label: 'Haydovchi App' },
  ].filter(item => rolePermissions[userRole].includes(item.id));

  const statCards = [
    { id: 'fleet', title: t('totalVehicles'), value: '142', color: 'from-blue-500 to-cyan-400', icon: <Car /> },
    { id: 'waybills', title: t('activeTrips'), value: liveStats.trips.toString(), color: 'from-emerald-500 to-teal-400', icon: <Map /> },
    { id: 'reports', title: t('totalWeight'), value: '1,240 t', color: 'from-orange-500 to-amber-400', icon: <Weight /> },
    { id: 'fuel', title: t('utilization'), value: `${liveStats.fuel.toFixed(1)}%`, color: 'from-purple-500 to-pink-400', icon: <Activity /> },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statCards.map((stat, idx) => (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={idx}
                  onClick={() => setActiveTab(stat.id)}
                  className="glass-panel p-6 rounded-2xl relative overflow-hidden group cursor-pointer hover:border-slate-500/50 transition-colors"
                >
                  <div className={`absolute -right-6 -top-6 w-32 h-32 bg-gradient-to-br ${stat.color} rounded-full opacity-10 blur-2xl group-hover:opacity-20 transition-opacity duration-500`}></div>
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <p className="text-slate-400 text-sm font-medium mb-1">{stat.title}</p>
                      <h3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        {stat.value}
                      </h3>
                    </div>
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color} bg-opacity-10 shadow-lg`}>
                      {stat.icon}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 gap-6 h-[450px]">
              <div className="glass-panel rounded-2xl p-6 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold">{t('fuelEfficiency')} & Telemetry</h3>
                  <span className="text-xs font-medium px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/20">
                    Live Data
                  </span>
                </div>
                <div className="flex-1 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceData}>
                      <defs>
                        <linearGradient id="colorFuel" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="time" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid #334155', borderRadius: '12px' }}
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                      <Area type="monotone" dataKey="fuel" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorFuel)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 'fleet':
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <FleetManager />
          </motion.div>
        );
      case 'drivers':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <DriverManager />
          </motion.div>
        );
      case 'tracking':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <LiveTracker />
          </motion.div>
        );
      case 'fuel':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <FuelManager />
          </motion.div>
        );
      case 'waybills':
        return (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <WaybillManager />
          </motion.div>
        );
      case 'access':
        return (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <AccessControlManager />
          </motion.div>
        );
      case 'medical':
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <MedicalManager />
          </motion.div>
        );
      case 'mechanic':
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <MechanicManager />
          </motion.div>
        );
      case 'reports':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <ReportsManager />
          </motion.div>
        );
      case 'cargo':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CargoManager />
          </motion.div>
        );
      case 'settings':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UserManager />
          </motion.div>
        );
      case 'mobile':
        return (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <MobileAppSimulation />
          </motion.div>
        );
      case 'smart-start':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex justify-center"
          >
            {/* The user can still see it as a hub if they somehow type the ID, but it's hidden from menu now as detail is better. 
                 Or maybe they want to see the workflow progress hub. I'll just keep it here but remove from navItems as requested individual ones.
             */}
            <div className="glass-panel rounded-3xl p-8 max-w-2xl w-full">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                    {t('smartStart')}
                  </h3>
                  <p className="text-slate-400 text-sm">Yo'lga chiqishdan oldingi barcha tekshiruvlar (Hub)</p>
                </div>
                <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl">
                  <Activity size={32} />
                </div>
              </div>
              <SmartStartWorkflow />
            </div>
          </motion.div>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-blue-400">
              <Activity size={40} />
            </div>
            <h2 className="text-2xl font-bold">{t(activeTab as any)}</h2>
            <p className="text-slate-400 max-w-md">
              Bu bo'lim hozirda ishlab chiqilmoqda. Tez orada ma'lumotlar bu yerda paydo bo'ladi.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex text-slate-100 bg-slate-900">
      {/* Sidebar Navigation */}
      <aside className="w-64 glass-panel border-r border-slate-700/50 flex flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3">
          <img
            src="/smartroute-logo.svg"
            alt="SmartRoute logo"
            className="w-10 h-10 rounded-xl shadow-lg shadow-blue-500/30"
          />
          <h1 className="font-bold text-lg tracking-wide uppercase bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            SmartRoute
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2 -mt-px">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300
                ${activeTab === item.id
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
                  : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
                }`}
            >
              <div className={activeTab === item.id ? 'text-blue-400' : ''}>{item.icon}</div>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none -z-10 animate-float"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none -z-10 animate-float" style={{ animationDelay: '-3s' }}></div>

        {/* Top Header */}
        <header className="h-20 glass-panel px-8 flex items-center justify-between z-10">
          <h2 className="text-2xl font-semibold">{t(activeTab as any)}</h2>

          <div className="flex items-center gap-6">
            <button
              onClick={toggleLang}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer"
            >
              <Globe size={18} className="text-blue-400" />
              <span className="font-medium uppercase">{lang}</span>
            </button>
            <div className="relative">
              <Bell className="text-slate-400 cursor-pointer hover:text-white transition-colors" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-900"></span>
            </div>
            <div className="flex items-center gap-3 pl-6 border-l border-slate-700">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 p-[2px]">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center font-bold">A</div>
              </div>
              <div>
                <p className="text-sm font-semibold">{userRole === 'admin' ? 'Nurbek Jumayev' : userRole === 'dispatcher' ? 'Sherzod Alimov' : 'Tahlilchi'}</p>
                <p className="text-xs text-slate-400 capitalize">{t(userRole as any)}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Actual Content Area */}
        <div className="flex-1 overflow-auto p-8 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-800/40 via-slate-900 to-slate-900">
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default App;

