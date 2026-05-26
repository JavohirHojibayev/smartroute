import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Car,
  Map,
  Users,
  Droplet,
  FileText,
  Wrench,
  Activity,
  Globe,
  Navigation,
  ScanFace,
  Stethoscope,
  CalendarDays,
  Smartphone,
  Box,
  Shield,
  AlertTriangle,
  ArrowUpRight,
  Zap,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
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
import { ShiftScheduleManager } from './components/ShiftScheduleManager';
import { MechanicManager } from './components/MechanicManager';
import { MobileAppSimulation } from './components/MobileAppSimulation';
import { CargoManager } from './components/CargoManager';
import { UserManager } from './components/UserManager';
import { LoginPage } from './components/LoginPage';
import { resolveApiBaseUrl } from './utils/apiBase';
import {
  type AppRole,
  type PermissionMap,
  type PermissionLevel,
  type PermissionModule,
  canViewModule,
  normalizePermissionMap,
  toEffectivePermissionMap,
} from './permissions';

type AuthUser = {
  id: number;
  username: string;
  email: string | null;
  fullName: string | null;
  role: AppRole;
  permissions: PermissionMap;
  status: 'active' | 'inactive';
  lastLoginAt: string | null;
  createdAt: string;
};

type AuthSession = {
  token: string;
  user: AuthUser;
};

type DashboardOverview = {
  generatedAt: string;
  mode: string;
  kpis: {
    totalVehicles: number;
    activeTrips: number;
    totalMovementToday: number;
    utilizationPercent: number;
  };
  access: {
    entrancesToday: number;
    exitsToday: number;
    failedToday: number;
  };
  medical: {
    totalToday: number;
    passedToday: number;
    reviewToday: number;
    failedToday: number;
  };
  pulse: {
    fleetReadinessPercent: number;
    flowToday: number;
    checksPassed: number;
    checksTotal: number;
    serviceQueue: Array<{
      plate: string;
      issue: string;
      eta: string;
      priority: 'high' | 'medium' | string;
    }>;
  };
  insight: {
    efficiencyPercent: number;
    activeVehicles: number;
    criticalRisk: number;
    nextRefreshSeconds: number;
  };
  telemetrySeries: Array<{
    time: string;
    turnstileEntrances: number;
    turnstileExits: number;
    esmoPassed: number;
    esmoFailed: number;
    fuel: number;
    efficiency: number;
  }>;
};

type DashboardFuelSummary = {
  health?: {
    status?: string;
    lastSyncAt?: string | null;
  };
  chart?: Array<{
    day: string;
    consumption: number;
    cost: number;
  }>;
  anomalies?: Array<{
    id?: number | string;
    vehicle?: string;
    time?: string;
    type?: string;
    amount?: string;
    status?: string;
  }>;
};

const AUTH_STORAGE_KEY = 'smartroute-auth-session';
const LANG_STORAGE_KEY = 'smartroute-lang';
const API_BASE = resolveApiBaseUrl();

const extractErrorMessage = (payload: any, fallback: string): string => {
  const message = payload?.message;
  if (Array.isArray(message) && message.length > 0) {
    return String(message[0]);
  }
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
};

function App() {
  const { t, lang, setLang } = useI18n();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const storedTheme = window.localStorage.getItem('smartroute-theme');
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'users' | 'roles'>('users');
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardOverview | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardFuelSummary, setDashboardFuelSummary] = useState<DashboardFuelSummary | null>(null);
  const [dashboardFuelLoading, setDashboardFuelLoading] = useState(false);
  const [dashboardFuelError, setDashboardFuelError] = useState<string | null>(null);
  const userRole: AppRole = authSession?.user.role ?? 'admin';
  const authToken = authSession?.token ?? '';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('smartroute-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedLang = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (storedLang === 'uz' || storedLang === 'ru' || storedLang === 'en') {
      setLang(storedLang);
    }
  }, [setLang]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    const restoreSession = async () => {
      if (typeof window === 'undefined') {
        setAuthLoading(false);
        return;
      }

      const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!rawSession) {
        setAuthLoading(false);
        return;
      }

      let parsed: AuthSession | null = null;
      try {
        const candidate = JSON.parse(rawSession);
        if (candidate?.token && candidate?.user) {
          parsed = candidate as AuthSession;
        }
      } catch {
        parsed = null;
      }

      if (!parsed?.token) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${parsed.token}`,
          },
        });

        if (!response.ok) {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthSession(null);
          setAuthLoading(false);
          return;
        }

        const payload = await response.json();
        if (!payload?.user) {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthSession(null);
          setAuthLoading(false);
          return;
        }

        const session = {
          token: parsed.token,
          user: payload.user as AuthUser,
        };

        setAuthSession(session);
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuthSession(null);
      } finally {
        setAuthLoading(false);
      }
    };

    void restoreSession();
  }, []);

  const loadDashboardOverview = useCallback(async (silent = false) => {
    if (!authToken) {
      setDashboardData(null);
      return;
    }

    if (!silent) {
      setDashboardLoading(true);
    }

    try {
      const response = await fetch(`${API_BASE}/dashboard/overview`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error(extractErrorMessage(payload, 'Dashboard ma\'lumotlarini olishda xatolik'));
      }

      setDashboardData(payload as DashboardOverview);
      setDashboardError(null);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Dashboard ma\'lumotlarini olishda xatolik');
    } finally {
      if (!silent) {
        setDashboardLoading(false);
      }
    }
  }, [authToken]);

  const loadDashboardFuelSummary = useCallback(async (silent = false) => {
    if (!authToken) {
      setDashboardFuelSummary(null);
      return;
    }

    if (!silent) {
      setDashboardFuelLoading(true);
    }

    try {
      const response = await fetch(`${API_BASE}/integrations/fuel/azs/summary`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error(extractErrorMessage(payload, "Yoqilg'i grafigi ma'lumotini olishda xatolik"));
      }

      setDashboardFuelSummary(payload as DashboardFuelSummary);
      setDashboardFuelError(null);
    } catch (error) {
      setDashboardFuelError(error instanceof Error ? error.message : "Yoqilg'i grafigi ma'lumotini olishda xatolik");
    } finally {
      if (!silent) {
        setDashboardFuelLoading(false);
      }
    }
  }, [authToken]);

  useEffect(() => {
    if (!authToken || activeTab !== 'dashboard') {
      return;
    }

    void loadDashboardOverview();
  }, [activeTab, authToken, loadDashboardOverview]);

  useEffect(() => {
    if (!authToken || activeTab !== 'dashboard') {
      return;
    }

    void loadDashboardFuelSummary();
  }, [activeTab, authToken, loadDashboardFuelSummary]);

  useEffect(() => {
    if (!authToken || activeTab !== 'dashboard') {
      return;
    }

    const refreshSeconds = Math.max(10, dashboardData?.insight?.nextRefreshSeconds ?? 30);
    const interval = setInterval(() => {
      void loadDashboardOverview(true);
    }, refreshSeconds * 1000);

    return () => clearInterval(interval);
  }, [activeTab, authToken, dashboardData?.insight?.nextRefreshSeconds, loadDashboardOverview]);

  useEffect(() => {
    if (!authToken || activeTab !== 'dashboard') {
      return;
    }

    const interval = setInterval(() => {
      void loadDashboardFuelSummary(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [activeTab, authToken, loadDashboardFuelSummary]);

  const toggleLang = () => {
    setLang(lang === 'uz' ? 'ru' : lang === 'ru' ? 'en' : 'uz');
  };

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  const handleLogin = async (credentials: { username: string; password: string }) => {
    setAuthSubmitting(true);
    setAuthError(null);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.token || !payload?.user) {
        throw new Error(extractErrorMessage(payload, 'Login yoki parol noto\'g\'ri'));
      }

      const session = {
        token: String(payload.token),
        user: payload.user as AuthUser,
      };

      setAuthSession(session);
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      setActiveTab('dashboard');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Kirishda xatolik yuz berdi');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    const token = authSession?.token;
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Ignore network errors on logout because local session is cleared anyway.
      }
    }

    setAuthSession(null);
    setAuthError(null);
    setActiveTab('dashboard');
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const openRoleManagement = () => {
    setSettingsInitialTab('roles');
    setActiveTab('settings');
  };

  const hideHeaderTitle =
    activeTab === 'dashboard' ||
    activeTab === 'waybills' ||
    activeTab === 'shiftSchedule' ||
    activeTab === 'fleet' ||
    activeTab === 'drivers' ||
    activeTab === 'fuel' ||
    activeTab === 'settings';

  const userPermissionSelections = normalizePermissionMap(authSession?.user.permissions, userRole);
  const userPermissions = toEffectivePermissionMap(userPermissionSelections);

  const allNavItems: Array<{ id: PermissionModule; icon: ReactNode; label: string }> = [
    { id: 'dashboard', icon: <Activity />, label: t('dashboard') },
    { id: 'access', icon: <ScanFace />, label: t('accessControl') },
    { id: 'medical', icon: <Stethoscope />, label: t('medicalChecks') },
    { id: 'shiftSchedule', icon: <CalendarDays />, label: t('shiftSchedule') },
    { id: 'fleet', icon: <Car />, label: t('fleet') },
    { id: 'drivers', icon: <Users />, label: t('drivers') },
    { id: 'waybills', icon: <FileText />, label: t('waybills') },
    { id: 'tracking', icon: <Navigation />, label: t('liveTracking') },
    { id: 'mechanic', icon: <Wrench />, label: t('vehicleInspections') },
    { id: 'fuel', icon: <Droplet />, label: t('fuel') },
    { id: 'cargo', icon: <Box />, label: t('cargoStats') },
    { id: 'settings', icon: <Shield />, label: t('settings') },
    { id: 'mobile', icon: <Smartphone />, label: t('mobileApp') },
  ];

  const navItems = allNavItems.filter((item) => canViewModule(userPermissions, item.id));

  useEffect(() => {
    if (navItems.length === 0) {
      return;
    }

    const hasAccessToActiveTab = navItems.some((item) => item.id === activeTab);
    if (!hasAccessToActiveTab) {
      setActiveTab(navItems[0].id);
    }
  }, [activeTab, navItems]);

  const locale = lang === 'uz' ? 'uz-UZ' : lang === 'ru' ? 'ru-RU' : 'en-US';
  const numberFormat = new Intl.NumberFormat(locale);
  const formatCount = (value: number | null | undefined) => numberFormat.format(Number(value ?? 0));
  const fuelChartTheme = theme === 'light'
    ? {
      containerClass: 'rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]',
      titleClass: 'text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3',
      grid: '#9aaec6',
      axis: '#6a82a3',
      tick: '#607995',
      tooltipBg: 'rgba(255, 255, 255, 0.96)',
      tooltipBorder: '#b6c7dc',
      tooltipText: '#1f2f45',
      tooltipLabel: '#294261',
      tooltipShadow: '0 10px 22px rgba(31, 47, 69, 0.16)',
      consumption: '#1d4ed8',
      consumptionStopOpacity: 0.34,
      syncClass: 'mt-3 text-xs text-slate-600',
    }
    : {
      containerClass: 'rounded-xl border border-slate-700/60 bg-slate-900/35 p-4',
      titleClass: 'text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3',
      grid: '#334155',
      axis: '#94a3b8',
      tick: '#94a3b8',
      tooltipBg: 'rgba(15, 23, 42, 0.9)',
      tooltipBorder: '#334155',
      tooltipText: '#e2e8f0',
      tooltipLabel: '#e2e8f0',
      tooltipShadow: '0 0 0 rgba(0,0,0,0)',
      consumption: '#2563eb',
      consumptionStopOpacity: 0.3,
      syncClass: 'mt-3 text-xs text-slate-500',
    };

  const statCards = [
    {
      id: 'access',
      title: t('dashboardTurnstileStatus'),
      value: `${formatCount(dashboardData?.access?.entrancesToday)}/${formatCount(dashboardData?.access?.exitsToday)}`,
      subValue: `${t('entrance')}/${t('exit')}`,
      color: 'from-purple-500 to-pink-400',
      icon: <ScanFace />,
    },
    {
      id: 'medical',
      title: t('dashboardEsmoStatus'),
      value: `${formatCount(dashboardData?.medical?.passedToday)}/${formatCount(dashboardData?.medical?.failedToday)}`,
      subValue: t('dashboardAllowedRejected'),
      color: 'from-orange-500 to-amber-400',
      icon: <Stethoscope />,
    },
    {
      id: 'fleet',
      title: t('dashboardActiveVehicles'),
      value: formatCount(dashboardData?.insight?.activeVehicles),
      subValue: `${t('dashboardTotalPrefix')}: ${formatCount(dashboardData?.kpis?.totalVehicles)}`,
      color: 'from-blue-500 to-cyan-400',
      icon: <Car />,
    },
    {
      id: 'waybills',
      title: t('dashboardActiveTrips'),
      value: formatCount(dashboardData?.kpis?.activeTrips),
      subValue: `${t('dashboardTodayMovement')}: ${formatCount(dashboardData?.kpis?.totalMovementToday)}`,
      color: 'from-emerald-500 to-teal-400',
      icon: <Map />,
    },
  ];

  const dashboardFuelChartData = dashboardFuelSummary?.chart?.length
    ? dashboardFuelSummary.chart
    : [{ day: '00:00', consumption: 0, cost: 0 }];

  const dashboardFuelDisplayData = (() => {
    let rows = dashboardFuelChartData;
    const isHourly = rows.length > 0 && rows.every((row) => /^\d{2}:00$/.test(row.day));
    if (isHourly) {
      const currentHour = new Date().getHours();
      rows = rows.filter((row) => {
        const hour = Number.parseInt(row.day.slice(0, 2), 10);
        return Number.isFinite(hour) && hour <= currentHour;
      });
    }
    return rows.length > 0 ? rows : [{ day: '00:00', consumption: 0, cost: 0 }];
  })();

  const serviceQueue = dashboardData?.pulse?.serviceQueue ?? [];
  const criticalServiceCount = serviceQueue.filter((item) => String(item.priority || '').toLowerCase() === 'high').length;
  const documentIssueCount = serviceQueue.filter((item) =>
    /hujjat|guvohnoma|pasport|id|license|litsenziya/i.test(String(item.issue || '')),
  ).length;
  const esmoRejectedCount = Number(dashboardData?.medical?.failedToday ?? 0);
  const turnstileSuspiciousCount = Number(dashboardData?.access?.failedToday ?? 0);
  const fuelHealthStatus = String(dashboardFuelSummary?.health?.status ?? '').toLowerCase();
  const integrationIssues: string[] = [];
  if (dashboardError) integrationIssues.push('Dashboard API');
  if (dashboardFuelError) integrationIssues.push(`${t('fuel')} API`);
  if (fuelHealthStatus && fuelHealthStatus !== 'online' && fuelHealthStatus !== 'syncing') {
    integrationIssues.push(`AZS ${fuelHealthStatus}`);
  }

  const dashboardAlerts = (() => {
    const existingAlerts = [
      {
        count: criticalServiceCount,
        type: 'danger',
        message: `Texnik ko'rik muddati o'tgan transportlar: ${formatCount(criticalServiceCount)} ta`,
        time: 'Bugun',
      },
      {
        count: esmoRejectedCount,
        type: 'danger',
        message: `ESMO rad holatlari: ${formatCount(esmoRejectedCount)} ta`,
        time: 'Bugun',
      },
      {
        count: turnstileSuspiciousCount,
        type: 'danger',
        message: `Turniketda shubhali kirish/chiqishlar: ${formatCount(turnstileSuspiciousCount)} ta`,
        time: 'Bugun',
      },
      {
        count: documentIssueCount,
        type: 'danger',
        message: `Hujjati tugagan transport/haydovchi: ${formatCount(documentIssueCount)} ta`,
        time: 'Bugun',
      },
      {
        count: criticalServiceCount,
        type: 'danger',
        message: t('dashboardCriticalIssuesToday').replace('{count}', formatCount(criticalServiceCount)),
        time: t('fuelPresetToday'),
      },
      {
        count: integrationIssues.length,
        type: 'danger',
        message: `Integratsiya uzilishlari: ${formatCount(integrationIssues.length)} ta (${integrationIssues.join(', ')})`,
        time: t('refresh'),
      },
    ]
      .filter((item) => item.count > 0)
      .map((item, index) => ({
        id: index + 1,
        type: item.type,
        message: item.message,
        time: item.time,
      }));

    if (existingAlerts.length > 0) {
      return existingAlerts;
    }

    return [{
      id: 1,
      type: 'warning',
      message: t('dashboardNoAlerts'),
      time: t('fuelPresetToday'),
    }];
  })();

  const dashboardActivity = [
    {
      id: 1,
      action: `Turniket oqimi: kirish ${formatCount(dashboardData?.access?.entrancesToday)}, chiqish ${formatCount(dashboardData?.access?.exitsToday)}`,
      user: 'Hikvision',
      time: t('fuelPresetToday'),
    },
    {
      id: 2,
      action: `ESMO natijalari: ${formatCount(dashboardData?.medical?.passedToday)} passed / ${formatCount(dashboardData?.medical?.failedToday)} failed`,
      user: 'ESMO',
      time: t('fuelPresetToday'),
    },
    {
      id: 3,
      action: `Texnik ko'rik: ${formatCount(dashboardData?.pulse?.checksPassed)} / ${formatCount(dashboardData?.pulse?.checksTotal)} muvaffaqiyatli`,
      user: 'Mexanik',
      time: t('fuelPresetToday'),
    },
  ];

  const getTabPermission = (tabId: string): PermissionLevel => {
    if (Object.prototype.hasOwnProperty.call(userPermissions, tabId)) {
      return userPermissions[tabId as PermissionModule];
    }

    return 'none';
  };

  const refreshCurrentSession = async () => {
    const token = authSession?.token;
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!payload?.user) {
        return;
      }

      setAuthSession((prev) => {
        if (!prev) return prev;
        const next = { ...prev, user: payload.user as AuthUser };
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    } catch {
      // Ignore transient refresh errors.
    }
  };

  const renderContent = () => {
    const activeTabPermission = getTabPermission(activeTab);
    if (activeTabPermission === 'none') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-red-400">
            <Shield size={36} />
          </div>
          <h2 className="text-2xl font-bold">{t('accessDenied')}</h2>
          <p className="text-slate-400 max-w-md">
            {t('noModulePermission')}
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {dashboardError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {dashboardError}
              </div>
            ) : null}
            {dashboardLoading && !dashboardData ? (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
                {t('dashboard')} ma'lumotlari yuklanmoqda...
              </div>
            ) : null}

            {/* Ayni damdagi ma'lumotlar (yuqori qism) */}
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statCards.map((stat, idx) => (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={idx}
                  onClick={() => {
                    const nextTab = stat.id.replace('_out', '') as PermissionModule;
                    if (canViewModule(userPermissions, nextTab)) {
                      setActiveTab(nextTab);
                    }
                  }}
                  className="glass-panel p-6 rounded-2xl relative overflow-hidden group cursor-pointer hover:border-slate-500/50 transition-colors"
                >
                  <div className={`absolute -right-6 -top-6 w-36 h-36 bg-gradient-to-br ${stat.color} rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500`}></div>
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <p className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">{stat.title}</p>
                      <h3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        {stat.value}
                      </h3>
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <ArrowUpRight size={12} className="text-emerald-400" />
                        {stat.subValue}
                      </p>
                    </div>
                    <div
                      data-stat={stat.id}
                      className={`dashboard-stat-icon p-4 rounded-xl bg-gradient-to-br ${stat.color} bg-opacity-10 shadow-xl [&>svg]:w-[26px] [&>svg]:h-[26px]`}
                    >
                      {stat.icon}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Middle Section: Chart and Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Chart */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col lg:col-span-2">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-200">{t('dashboardFuelCharts')}</h3>
                  {dashboardFuelLoading ? (
                    <span className="text-xs text-slate-400">{t('syncing')}</span>
                  ) : null}
                </div>
                {dashboardFuelError ? (
                  <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {dashboardFuelError}
                  </div>
                ) : null}
                <div className={fuelChartTheme.containerClass}>
                  <div className={fuelChartTheme.titleClass}>
                    {t('fuelChartSeriesIssued')} ({t('fuelUnitL')})
                  </div>
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dashboardFuelDisplayData}>
                        <defs>
                          <linearGradient id="colorFuelConsumptionDash" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={fuelChartTheme.consumption} stopOpacity={fuelChartTheme.consumptionStopOpacity} />
                            <stop offset="95%" stopColor={fuelChartTheme.consumption} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={fuelChartTheme.grid} vertical={false} />
                        <XAxis dataKey="day" stroke={fuelChartTheme.axis} tick={{ fill: fuelChartTheme.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis stroke={fuelChartTheme.axis} tick={{ fill: fuelChartTheme.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: fuelChartTheme.tooltipBg,
                            border: `1px solid ${fuelChartTheme.tooltipBorder}`,
                            borderRadius: '12px',
                            boxShadow: fuelChartTheme.tooltipShadow,
                          }}
                          itemStyle={{ color: fuelChartTheme.tooltipText, fontSize: 12 }}
                          labelStyle={{ color: fuelChartTheme.tooltipLabel }}
                        />
                        <Area type="monotone" name={`${t('fuelChartSeriesIssued')} (${t('fuelUnitL')})`} dataKey="consumption" stroke={fuelChartTheme.consumption} strokeWidth={2.6} fillOpacity={1} fill="url(#colorFuelConsumptionDash)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className={fuelChartTheme.syncClass}>
                  {t('dashboardLastSync')}: {dashboardFuelSummary?.health?.lastSyncAt ? new Date(dashboardFuelSummary.health.lastSyncAt).toLocaleString(locale) : '—'}
                </div>
              </div>

              {/* Alerts and Activity */}
              <div className="flex flex-col gap-6">
                <div className="glass-panel p-5 rounded-2xl border border-red-500/10 flex-1 overflow-hidden flex flex-col">
                  <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-400" />
                    {t('dashboardAlerts')}
                  </h3>
                  <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {dashboardAlerts.map((alert) => (
                      <div key={alert.id} className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 flex gap-3">
                        <div className={`mt-0.5 p-1 rounded-full aspect-square h-fit ${alert.type === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          <AlertTriangle size={12} />
                        </div>
                        <div>
                          <p className="text-xs text-slate-300 font-medium">{alert.message}</p>
                          <span className="text-[10px] text-slate-500">{alert.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex-1 overflow-hidden flex flex-col">
                  <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                    <Zap size={16} className="text-blue-400" />
                    {t('dashboardRecentActions')}
                  </h3>
                  <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {dashboardActivity.map((act) => (
                      <div key={act.id} className="relative pl-4 border-l-2 border-slate-700 pb-2">
                        <div className="absolute w-2 h-2 rounded-full bg-blue-500 -left-[5px] top-1" />
                        <p className="text-xs text-slate-300">{act.action}</p>
                        <div className="flex gap-2 text-[10px] text-slate-500 mt-1">
                          <span className="text-blue-400">{act.user}</span>
                          <span>вЂў</span>
                          <span>{act.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Analitika va Hisobotlar (pastki qism) */}
            <ReportsManager authToken={authSession?.token ?? ''} />
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
            <LiveTracker lang={lang} />
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
      case 'shiftSchedule':
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <ShiftScheduleManager />
          </motion.div>
        );
      case 'mechanic':
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <MechanicManager
              authToken={authSession?.token ?? ''}
              accessLevel={userPermissions.mechanic}
            />
          </motion.div>
        );
      case 'cargo':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CargoManager
              authToken={authSession?.token ?? ''}
              accessLevel={userPermissions.cargo}
            />
          </motion.div>
        );
      case 'settings':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UserManager
              authToken={authSession?.token ?? ''}
              currentUserId={authSession?.user.id ?? null}
              accessLevel={userPermissions.settings}
              onPermissionsChanged={refreshCurrentSession}
              initialTab={settingsInitialTab}
            />
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

  const currentUserName = authSession?.user.fullName?.trim() || authSession?.user.username || 'User';
  const currentUserInitial = currentUserName.charAt(0).toUpperCase();
  const activeTabPermission = getTabPermission(activeTab);
  const strictReadOnlyTabs = new Set(['fleet', 'drivers', 'shiftSchedule']);
  const shouldUseStrictReadOnly = activeTabPermission === 'read' && strictReadOnlyTabs.has(activeTab);

  if (authLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'light' ? 'theme-light' : 'theme-dark'}`}>
        <div className="glass-panel rounded-2xl px-8 py-6 text-sm font-medium text-slate-300">
          {t('sessionChecking')}
        </div>
      </div>
    );
  }

  if (!authSession) {
    return (
      <LoginPage
        lang={lang}
        theme={theme}
        isSubmitting={authSubmitting}
        errorMessage={authError}
        onToggleLang={toggleLang}
        onToggleTheme={toggleTheme}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className={`app-shell min-h-screen flex text-slate-100 bg-slate-900 ${theme === 'light' ? 'theme-light' : 'theme-dark'}`}>
      {/* Sidebar Navigation */}
      <aside className="w-64 glass-panel border-r border-slate-700/50 flex flex-col hidden md:flex">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="p-6 flex items-center gap-3 text-left group"
        >
          <img
            src="/smartroute-logo.svg"
            alt="SmartRoute logo"
            className="w-10 h-10 rounded-xl shadow-lg shadow-blue-500/30 transition-transform duration-300 group-hover:scale-105"
          />
          <h1 className="brand-title font-bold text-lg tracking-wide uppercase">
            SmartRoute
          </h1>
        </button>
        <nav className="flex-1 p-4 space-y-2 -mt-px">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'settings') {
                  setSettingsInitialTab('users');
                }
                setActiveTab(item.id);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border min-w-0 transition-colors duration-200
                ${activeTab === item.id
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
                  : 'text-slate-400 border-transparent hover:border-slate-700/60 hover:bg-slate-800/50 hover:text-slate-200'
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
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none -z-10 animate-float-delay-minus3"></div>

        {/* Top Header */}
        <header className="h-20 glass-panel px-3 sm:px-6 md:px-8 flex items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors"
              aria-label={t('menuOpen')}
            >
              <Menu className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="md:hidden flex items-center gap-2 text-left min-w-0"
            >
              <img
                src="/smartroute-logo.svg"
                alt="SmartRoute logo"
                className="w-8 h-8 rounded-lg shadow-lg shadow-blue-500/20 shrink-0"
              />
              <span className="brand-title font-bold text-base tracking-wide uppercase truncate max-w-[140px] max-[380px]:max-w-[92px]">
                SmartRoute
              </span>
            </button>
            {hideHeaderTitle ? <div className="hidden md:block" /> : <h2 className="hidden md:block text-2xl font-semibold">{t(activeTab as any)}</h2>}
          </div>

          <div className="hidden lg:flex flex-1 min-w-0 overflow-hidden items-center pr-2 md:-ml-8" role="status" aria-live="polite">
            <div className="test-mode-inline-track">
              <span>{t('platformTestMode')}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-4 md:gap-6 shrink-0">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-4 h-10 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer"
              title={theme === 'dark' ? t('themeSwitchToLight') : t('themeSwitchToDark')}
            >
              {theme === 'dark' ? (
                <Moon className="text-indigo-300 w-[18px] h-[18px] shrink-0" />
              ) : (
                <Sun className="text-amber-400 w-[18px] h-[18px] shrink-0" />
              )}
              <span className="hidden sm:inline font-medium">{theme === 'dark' ? t('themeNight') : t('themeDay')}</span>
            </button>
            <button
              onClick={toggleLang}
              className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-4 h-10 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer"
            >
              <Globe className="text-blue-400 w-[18px] h-[18px] shrink-0" />
              <span className="font-medium uppercase">{lang}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-4 h-10 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer"
              title={t('exit')}
            >
              <LogOut className="text-slate-300 w-[18px] h-[18px] shrink-0" />
              <span className="hidden sm:inline font-medium">{t('exit')}</span>
            </button>
            <button
              type="button"
              onClick={openRoleManagement}
              className="hidden lg:flex items-center gap-3 pl-6 border-l border-slate-700 text-left hover:opacity-90 transition-opacity"
              title="Rollar va huquqlar sahifasiga o'tish"
            >
              <div className="smartroute-profile-badge-ring w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 p-[2px]">
                <div className="smartroute-profile-badge-core w-full h-full rounded-full bg-slate-900 flex items-center justify-center font-bold">
                  {currentUserInitial}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold">{currentUserName}</p>
                <p className="text-xs text-slate-400 capitalize">{t(userRole as any)}</p>
              </div>
            </button>
          </div>
        </header>

        <AnimatePresence>
          {mobileNavOpen && (
            <>
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileNavOpen(false)}
                className="fixed inset-0 bg-slate-950/70 backdrop-blur-[1px] z-40 md:hidden"
                aria-label={t('menuOverlayClose')}
              />
              <motion.aside
                initial={{ x: -320, opacity: 0.9 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -320, opacity: 0.9 }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                className="fixed top-0 left-0 bottom-0 z-50 w-[280px] max-w-[86vw] glass-panel border-r border-slate-700/50 md:hidden flex flex-col"
              >
                <div className="p-5 flex items-center justify-between border-b border-slate-700/50">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('dashboard');
                      setMobileNavOpen(false);
                    }}
                    className="flex items-center gap-3 text-left"
                  >
                    <img
                      src="/smartroute-logo.svg"
                      alt="SmartRoute logo"
                      className="w-10 h-10 rounded-xl shadow-lg shadow-blue-500/30"
                    />
                    <h1 className="brand-title font-bold text-lg tracking-wide uppercase">SmartRoute</h1>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(false)}
                    className="p-2 rounded-lg bg-slate-800/60 border border-slate-700 hover:border-blue-500/50 transition-colors"
                    aria-label={t('menuClose')}
                  >
                    <X size={18} />
                  </button>
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-auto dark-scrollbar">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.id === 'settings') {
                          setSettingsInitialTab('users');
                        }
                        setActiveTab(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border min-w-0 transition-colors duration-200
                        ${activeTab === item.id
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
                          : 'text-slate-400 border-transparent hover:border-slate-700/60 hover:bg-slate-800/50 hover:text-slate-200'
                        }`}
                    >
                      <div className={activeTab === item.id ? 'text-blue-400' : ''}>{item.icon}</div>
                      <span className="font-medium text-sm leading-5">{item.label}</span>
                    </button>
                  ))}
                </nav>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Actual Content Area */}
        <div className={`app-content-surface flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-8 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-800/40 via-slate-900 to-slate-900 ${shouldUseStrictReadOnly ? 'permission-readonly' : ''}`}>
          {activeTabPermission === 'read' ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              Read rejimi: sahifa ko'rinadi, lekin ma'lumot kiritish va o'zgartirish amallari bloklangan.
            </div>
          ) : null}
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default App;



