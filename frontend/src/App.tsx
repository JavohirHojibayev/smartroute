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
  Stethoscope,
  ClipboardList,
  Smartphone,
  Weight,
  Box,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Truck,
  Sparkles,
  ShieldAlert,
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

type CargoFlowRow = {
  plate: string;
  route: string;
  weight: number;
  volume: number;
  efficiency: number;
  trend: 'up' | 'down';
};

type TechnicalCheckRow = {
  plate: string;
  checkedAt: string;
  score: number;
  status: 'passed' | 'warning' | 'failed';
  nextService: string;
};

type FleetStateRow = {
  label: string;
  count: number;
  percent: number;
  tone: 'emerald' | 'blue' | 'amber' | 'red';
};

type ServiceQueueRow = {
  plate: string;
  issue: string;
  eta: string;
  priority: 'high' | 'medium';
};

const cargoFlowRows: CargoFlowRow[] = [
  { plate: '10 O 001 OO', route: 'Toshkent - Angren', weight: 52, volume: 210, efficiency: 96, trend: 'up' },
  { plate: '01 A 777 AA', route: 'Toshkent - Farg\'ona', weight: 45, volume: 180, efficiency: 94, trend: 'up' },
  { plate: '40 L 444 LL', route: 'Toshkent - Samarqand', weight: 38, volume: 165, efficiency: 91, trend: 'up' },
  { plate: '01 Z 123 BB', route: 'Toshkent - Buxoro', weight: 34, volume: 152, efficiency: 88, trend: 'down' },
  { plate: '01 F 555 FF', route: 'Toshkent - Guliston', weight: 19, volume: 84, efficiency: 83, trend: 'up' },
];

const technicalCheckRows: TechnicalCheckRow[] = [
  { plate: '01 A 777 AA', checkedAt: '09:12', score: 95, status: 'passed', nextService: '14.03 08:00' },
  { plate: '01 Z 123 BB', checkedAt: '08:54', score: 86, status: 'passed', nextService: '13.03 07:30' },
  { plate: '10 O 001 OO', checkedAt: '08:33', score: 63, status: 'warning', nextService: 'Bugun 18:30' },
  { plate: '01 K 888 KK', checkedAt: '08:20', score: 58, status: 'warning', nextService: 'Bugun 16:10' },
  { plate: '40 L 444 LL', checkedAt: '07:58', score: 34, status: 'failed', nextService: 'Zudlik bilan' },
];

const fleetStateRows: FleetStateRow[] = [
  { label: 'Yo\'lda', count: 108, percent: 76, tone: 'emerald' },
  { label: 'Navbatda', count: 21, percent: 15, tone: 'blue' },
  { label: 'Ko\'rikda', count: 9, percent: 6, tone: 'amber' },
  { label: 'Ta\'mirda', count: 4, percent: 3, tone: 'red' },
];

const serviceQueueRows: ServiceQueueRow[] = [
  { plate: '10 O 001 OO', issue: 'Dvigatel moy sizishi', eta: '2 soat', priority: 'high' },
  { plate: '40 L 444 LL', issue: 'Old tormoz diski', eta: '4 soat', priority: 'high' },
  { plate: '01 K 888 KK', issue: 'Shina bosimi kalibrovka', eta: 'Bugun', priority: 'medium' },
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
    setLang(lang === 'uz' ? 'ru' : lang === 'ru' ? 'en' : 'uz');
  };

  const navItems = [
    { id: 'dashboard', icon: <Activity />, label: t('dashboard') },
    { id: 'access', icon: <ScanFace />, label: t('accessControl') },
    { id: 'medical', icon: <Stethoscope />, label: t('medicalChecks') },
    { id: 'fleet', icon: <Car />, label: t('fleet') },
    { id: 'tracking', icon: <Navigation />, label: t('liveTracking') },
    { id: 'drivers', icon: <Users />, label: t('drivers') },
    { id: 'mechanic', icon: <Wrench />, label: t('vehicleInspections') },
    { id: 'waybills', icon: <FileText />, label: t('waybills') },
    { id: 'fuel', icon: <Droplet />, label: t('fuel') },
    { id: 'cargo', icon: <Box />, label: t('cargoStats') },
    { id: 'settings', icon: <Settings />, label: t('settings') },
    { id: 'reports', icon: <ClipboardList />, label: t('reports') },
    { id: 'mobile', icon: <Smartphone />, label: t('mobileApp') },
  ].filter(item => rolePermissions[userRole].includes(item.id));

  const statCards = [
    { id: 'fleet', title: t('totalVehicles'), value: '142', color: 'from-blue-500 to-cyan-400', icon: <Car /> },
    { id: 'waybills', title: t('activeTrips'), value: liveStats.trips.toString(), color: 'from-emerald-500 to-teal-400', icon: <Map /> },
    { id: 'reports', title: t('totalWeight'), value: '1,240 t', color: 'from-orange-500 to-amber-400', icon: <Weight /> },
    { id: 'fuel', title: t('utilization'), value: `${liveStats.fuel.toFixed(1)}%`, color: 'from-purple-500 to-pink-400', icon: <Activity /> },
  ];

  const cargoWeightTotal = cargoFlowRows.reduce((acc, row) => acc + row.weight, 0);
  const cargoEfficiencyAvg = Math.round(cargoFlowRows.reduce((acc, row) => acc + row.efficiency, 0) / cargoFlowRows.length);
  const passedChecks = technicalCheckRows.filter((row) => row.status === 'passed').length;
  const criticalChecks = technicalCheckRows.filter((row) => row.status === 'failed').length;
  const fleetReadiness = Math.round((fleetStateRows[0].count / 142) * 100);

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

            <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
              <div className="2xl:col-span-2 glass-panel rounded-2xl p-6 border border-slate-700/50">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold">{t('fuelEfficiency')} & {t('telemetry')}</h3>
                  <span className="text-xs font-medium px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/20">
                    {t('liveData')}
                  </span>
                </div>
                <div className="h-[360px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceData}>
                      <defs>
                        <linearGradient id="colorFuel" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="time" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155', borderRadius: '12px' }}
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                      <Area type="monotone" dataKey="fuel" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorFuel)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-6 border border-slate-700/50 bg-gradient-to-b from-slate-800/50 to-slate-900/30">
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles size={17} className="text-cyan-300" />
                      Operatsion puls
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Kritik KPI holati (real vaqt)</p>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-cyan-400/30 text-cyan-300 bg-cyan-500/10">
                    LIVE
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                      <Gauge size={15} className="text-emerald-400" />
                      <span>Fleet readiness</span>
                    </div>
                    <span className="text-emerald-300 font-bold">{fleetReadiness}%</span>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                      <Truck size={15} className="text-blue-300" />
                      <span>Yuk oqimi (24h)</span>
                    </div>
                    <span className="text-blue-300 font-bold">{cargoWeightTotal} t</span>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                      <CheckCircle2 size={15} className="text-amber-300" />
                      <span>Ko'rikdan o'tgan</span>
                    </div>
                    <span className="text-amber-300 font-bold">{passedChecks}/{technicalCheckRows.length}</span>
                  </div>
                </div>

                <div className="mt-6 border-t border-slate-700/50 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Kritik servis navbati</h4>
                  <div className="space-y-2.5">
                    {serviceQueueRows.map((row) => (
                      <div key={row.plate} className="rounded-lg bg-slate-900/60 border border-slate-700/50 px-3 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-200 truncate">{row.plate}</p>
                          <p className="text-[11px] text-slate-500 truncate">{row.issue}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-[10px] font-bold uppercase ${row.priority === 'high' ? 'text-red-400' : 'text-amber-300'}`}>
                            {row.priority === 'high' ? 'Yuqori' : "O'rta"}
                          </p>
                          <p className="text-[11px] text-slate-400">{row.eta}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="glass-panel rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
                  <h3 className="font-semibold text-base">{t('cargoStats')} TOP reyslar</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded-full">
                    24 soat
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900/50 text-[10px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-5 py-3 text-left">Transport</th>
                        <th className="px-5 py-3 text-left">Yo'nalish</th>
                        <th className="px-5 py-3 text-right">{t('weight')}</th>
                        <th className="px-5 py-3 text-right">{t('volume')}</th>
                        <th className="px-5 py-3 text-right">{t('utilization')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                      {cargoFlowRows.map((row) => (
                        <tr key={row.plate} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3.5 font-semibold text-slate-200">{row.plate}</td>
                          <td className="px-5 py-3.5 text-slate-400">{row.route}</td>
                          <td className="px-5 py-3.5 text-right text-slate-200">{row.weight} t</td>
                          <td className="px-5 py-3.5 text-right text-slate-300">{row.volume} m3</td>
                          <td className="px-5 py-3.5">
                            <div className="flex justify-end items-center gap-1.5">
                              <span className={`font-semibold ${row.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {row.efficiency}%
                              </span>
                              {row.trend === 'up'
                                ? <ArrowUpRight size={14} className="text-emerald-400" />
                                : <ArrowDownRight size={14} className="text-red-400" />}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-panel rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
                  <h3 className="font-semibold text-base">{t('vehicleInspections')} holati</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
                    Bugun
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900/50 text-[10px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-5 py-3 text-left">Transport</th>
                        <th className="px-5 py-3 text-left">{t('time')}</th>
                        <th className="px-5 py-3 text-right">Health score</th>
                        <th className="px-5 py-3 text-left">Holat</th>
                        <th className="px-5 py-3 text-left">Keyingi servis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                      {technicalCheckRows.map((row) => (
                        <tr key={row.plate} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3.5 font-semibold text-slate-200">{row.plate}</td>
                          <td className="px-5 py-3.5 text-slate-400">{row.checkedAt}</td>
                          <td className="px-5 py-3.5 text-right">
                            <span className={`font-semibold ${row.score >= 85 ? 'text-emerald-400' : row.score >= 60 ? 'text-amber-300' : 'text-red-400'}`}>
                              {row.score}%
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase ${row.status === 'passed'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : row.status === 'warning'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                              }`}>
                              {row.status === 'failed' ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
                              {row.status === 'passed' ? 'Soz' : row.status === 'warning' ? 'Nazorat' : 'Nosoz'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-300">{row.nextService}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-700/50 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <ShieldAlert size={16} className="text-blue-300" />
                  Transport holati matritsasi
                </h3>
                <span className="text-[10px] uppercase tracking-wide font-bold px-2.5 py-1 rounded-full border border-blue-500/20 text-blue-300 bg-blue-500/10">
                  Fleet readiness {fleetReadiness}%
                </span>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-4">
                  {fleetStateRows.map((state) => (
                    <div key={state.label} className="rounded-xl border border-slate-700/50 bg-slate-900/30 px-4 py-3">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-slate-300">{state.label}</span>
                        <span className="font-semibold text-slate-200">{state.count} ta</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${state.tone === 'emerald'
                            ? 'bg-emerald-400'
                            : state.tone === 'blue'
                              ? 'bg-blue-400'
                              : state.tone === 'amber'
                                ? 'bg-amber-300'
                                : 'bg-red-400'
                            }`}
                          style={{ width: `${state.percent}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{state.percent}% ulush</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="text-xs text-emerald-300 uppercase tracking-wide font-bold mb-1">Samaradorlik</p>
                    <p className="text-2xl font-bold text-emerald-200">{cargoEfficiencyAvg}%</p>
                    <p className="text-xs text-slate-400 mt-1">Yuk tashish bo'yicha o'rtacha KPI</p>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                    <p className="text-xs text-blue-300 uppercase tracking-wide font-bold mb-1">Faol transport</p>
                    <p className="text-2xl font-bold text-blue-200">{fleetStateRows[0].count}</p>
                    <p className="text-xs text-slate-400 mt-1">Hozir marshrutda ishlayapti</p>
                  </div>
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <p className="text-xs text-red-300 uppercase tracking-wide font-bold mb-1">Kritik risk</p>
                    <p className="text-2xl font-bold text-red-200">{criticalChecks}</p>
                    <p className="text-xs text-slate-400 mt-1">Zudlik bilan texnik aralashuv kerak</p>
                  </div>
                  <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-300 text-sm">
                      <Clock3 size={14} className="text-cyan-300" />
                      Keyingi yangilanish
                    </div>
                    <span className="text-cyan-300 text-sm font-semibold">00:30</span>
                  </div>
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
                  <p className="text-slate-400 text-sm">{t('smartStartHubSubtitle')}</p>
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
              {t('moduleInDevelopment')}
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
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 min-w-0
                ${activeTab === item.id
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
                  : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
                }`}
            >
              <div className={activeTab === item.id ? 'text-blue-400' : ''}>{item.icon}</div>
              <span className="font-medium text-sm leading-5 whitespace-nowrap">{item.label}</span>
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

