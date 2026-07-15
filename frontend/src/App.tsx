import React, { Suspense, lazy, startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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

  Box,
  Shield,
  AlertTriangle,
  Zap,
  Sun,
  Moon,
  LogOut,
  Bell,
  Menu,
  X,
  HardHat,
  ChevronLeft,
  ChevronRight,
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
import { LoginPage } from './features/auth/LoginPage';
import { resolveApiBaseUrl } from './utils/apiBase';
import type { EimzoLoginResponse } from './features/auth/eimzo/eimzo.types';
import {
  type AppRole,
  type PermissionMap,
  type PermissionLevel,
  type PermissionModule,
  canViewModule,
  normalizePermissionMap,
  toEffectivePermissionMap,
} from './permissions';

const SmartStartWorkflow = lazy(() =>
  import('./features/SmartStartWorkflow').then((module) => ({ default: module.SmartStartWorkflow })),
);
const FleetManager = lazy(() =>
  import('./features/FleetManager').then((module) => ({ default: module.FleetManager })),
);
const DispatcherDashboard = lazy(() =>
  import('./features/DispatcherDashboard').then((module) => ({ default: module.DispatcherDashboard })),
);
const DriverManager = lazy(() =>
  import('./features/DriverManager').then((module) => ({ default: module.DriverManager })),
);
const FuelManager = lazy(() =>
  import('./features/FuelManager').then((module) => ({ default: module.FuelManager })),
);
const WaybillManager = lazy(() =>
  import('./features/waybill/WaybillManager').then((module) => ({ default: module.WaybillManager })),
);
const LiveTracker = lazy(() =>
  import('./features/LiveTracker').then((module) => ({ default: module.LiveTracker })),
);
const AccessControlManager = lazy(() =>
  import('./features/AccessControlManager').then((module) => ({ default: module.AccessControlManager })),
);
const MedicalManager = lazy(() =>
  import('./features/MedicalManager').then((module) => ({ default: module.MedicalManager })),
);
const ShiftScheduleManager = lazy(() =>
  import('./features/ShiftScheduleManager').then((module) => ({ default: module.ShiftScheduleManager })),
);
const ToolsManager = lazy(() =>
  import('./features/ToolsManager').then((module) => ({ default: module.ToolsManager })),
);
const MechanicManager = lazy(() =>
  import('./features/MechanicManager').then((module) => ({ default: module.MechanicManager })),
);
const CargoManager = lazy(() =>
  import('./features/CargoManager').then((module) => ({ default: module.CargoManager })),
);
const UserManager = lazy(() =>
  import('./features/UserManager').then((module) => ({ default: module.UserManager })),
);

type AuthUser = {
  id: number;
  username: string;
  email: string | null;
  fullName: string | null;
  role: AppRole;
  permissions: PermissionMap;
  status: 'active' | 'inactive';
  lastLoginAt: string | null;
  pinfl?: string | null;
  inn?: string | null;
  certificateSerial?: string | null;
  eimzoEnabled?: boolean;
  lastEimzoLoginAt?: string | null;
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
    checksPending: number;
    checksFailed: number;
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
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get('tab');
      if (tab && ['dashboard', 'access', 'medical', 'tools', 'waybills', 'fuel', 'tracking', 'fleet', 'drivers', 'mechanic', 'cargo', 'settings'].includes(tab)) {
        return tab;
      }
    }
    return 'dashboard';
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const storedTheme = window.localStorage.getItem('smartroute-theme');
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('smartroute-sidebar-collapsed') === 'true';
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('smartroute-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('smartroute-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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
    if (!notificationsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (notificationsRef.current?.contains(event.target as Node)) {
        return;
      }
      setNotificationsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen]);

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
          // Agar server ishga tushayotgan bo'lsa (502/504), tokenni o'chirmaymiz.
          if (response.status !== 502 && response.status !== 504) {
            window.localStorage.removeItem(AUTH_STORAGE_KEY);
            setAuthSession(null);
          } else {
            // Server hali tayyor emas, lekin localda sessiya bor, shunchaki o'tkazib yuboramiz.
            setAuthSession(parsed);
          }
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

      startTransition(() => {
        setDashboardData(payload as DashboardOverview);
      });
      setDashboardError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dashboard ma\'lumotlarini olishda xatolik';
      // Tarmoq xatoliklarida (backend hali ishga tushmagan) foydalanuvchiga tushunarli xabar
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setDashboardError("Server bilan aloqa yo'q. Backend ishga tushishini kuting.");
      } else {
        setDashboardError(message);
      }
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
      const response = await fetch(`${API_BASE}/integrations/fuel/azs/summary?compact=1`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error(extractErrorMessage(payload, "Yoqilg'i grafigi ma'lumotini olishda xatolik"));
      }

      startTransition(() => {
        setDashboardFuelSummary(payload as DashboardFuelSummary);
      });
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
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void loadDashboardOverview(true);
    }, refreshSeconds * 1000);

    return () => clearInterval(interval);
  }, [activeTab, authToken, dashboardData?.insight?.nextRefreshSeconds, loadDashboardOverview]);

  useEffect(() => {
    if (!authToken || activeTab !== 'dashboard') {
      return;
    }

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
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

      if (response.status === 502 || response.status === 504) {
        throw new Error("Server ishga tushmoqda yoki aloqa yo'q. Iltimos biroz kuting va qayta urinib ko'ring.");
      }

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

  const handleEimzoLogin = async (payload: EimzoLoginResponse) => {
    const token = String(payload.token || payload.accessToken || '');
    if (!token || !payload.user) {
      throw new Error('E-IMZO login javobi yaroqsiz');
    }

    const user = {
      id: Number(payload.user.id),
      username: String(payload.user.username || payload.user.pinfl || payload.user.inn || `eimzo-${payload.user.id}`),
      email: payload.user.email ?? null,
      fullName: payload.user.fullName ?? null,
      role: payload.user.role as AppRole,
      permissions: normalizePermissionMap(payload.user.permissions, payload.user.role as AppRole),
      status: (payload.user.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
      lastLoginAt: payload.user.lastLoginAt ?? new Date().toISOString(),
      pinfl: payload.user.pinfl ?? null,
      inn: payload.user.inn ?? null,
      createdAt: payload.user.createdAt ?? new Date().toISOString(),
    };

    const session = { token, user };
    setAuthSession(session);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    setAuthError(null);
    setActiveTab('dashboard');
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
    activeTab === 'dispatch' ||
    activeTab === 'shiftSchedule' ||
    activeTab === 'fleet' ||
    activeTab === 'drivers' ||
    activeTab === 'fuel' ||
    activeTab === 'tools' ||
    activeTab === 'settings';

  const userPermissionSelections = normalizePermissionMap(authSession?.user.permissions, userRole);
  const userPermissions = toEffectivePermissionMap(userPermissionSelections);

  const openAlertTarget = (targetTab: PermissionModule | null | undefined) => {
    if (!targetTab || !canViewModule(userPermissions, targetTab)) {
      setNotificationsOpen(false);
      return;
    }
    setActiveTab(targetTab);
    setNotificationsOpen(false);
  };

  const allNavItems: Array<{ id: PermissionModule; icon: ReactNode; label: string }> = [
    { id: 'dashboard', icon: <Activity />, label: t('dashboard') },
    { id: 'access', icon: <ScanFace />, label: t('accessControl') },
    { id: 'medical', icon: <Stethoscope />, label: t('medicalChecks') },
    { id: 'tools', icon: <HardHat />, label: t('tools') },
    { id: 'waybills', icon: <FileText />, label: t('waybills') },
    { id: 'fuel', icon: <Droplet />, label: t('fuel') },
    { id: 'tracking', icon: <Navigation />, label: t('liveTracking') },
    { id: 'dispatch', icon: <Map />, label: t('dispatch') },
    { id: 'fleet', icon: <Car />, label: t('fleet') },
    { id: 'drivers', icon: <Users />, label: t('drivers') },
    { id: 'mechanic', icon: <Wrench />, label: t('vehicleInspections') },
    { id: 'cargo', icon: <Box />, label: t('cargoStats') },
    { id: 'settings', icon: <Shield />, label: t('settings') },
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
  const mechanicInspectionCount = Number(dashboardData?.pulse?.checksPending ?? 0);
  const faultyVehicleCount = Number(dashboardData?.pulse?.checksFailed ?? 0);
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
  const integrationAlertTarget: PermissionModule = integrationIssues.some((item) => /azs|yoqilg'i|fuel/i.test(item)) ? 'fuel' : 'dashboard';

  const dashboardAlerts = (() => {
    const existingAlerts = [
      {
        count: mechanicInspectionCount,
        type: 'danger',
        message: `Texnik ko'rikdagi avtomobillar: ${formatCount(mechanicInspectionCount)} ta`,
        time: 'Bugun',
        targetTab: 'mechanic' as PermissionModule,
      },
      {
        count: faultyVehicleCount,
        type: 'danger',
        message: `Nosoz avtomobillar: ${formatCount(faultyVehicleCount)} ta`,
        time: 'Bugun',
        targetTab: 'mechanic' as PermissionModule,
      },
      {
        count: criticalServiceCount,
        type: 'danger',
        message: `Texnik ko'rik muddati o'tgan transportlar: ${formatCount(criticalServiceCount)} ta`,
        time: 'Bugun',
        targetTab: 'mechanic' as PermissionModule,
      },
      {
        count: esmoRejectedCount,
        type: 'danger',
        message: `ESMO rad holatlari: ${formatCount(esmoRejectedCount)} ta`,
        time: 'Bugun',
        targetTab: 'medical' as PermissionModule,
      },
      {
        count: turnstileSuspiciousCount,
        type: 'danger',
        message: `Turniketda shubhali kirish/chiqishlar: ${formatCount(turnstileSuspiciousCount)} ta`,
        time: 'Bugun',
        targetTab: 'access' as PermissionModule,
      },
      {
        count: documentIssueCount,
        type: 'danger',
        message: `Hujjati tugagan transport/haydovchi: ${formatCount(documentIssueCount)} ta`,
        time: 'Bugun',
        targetTab: 'fleet' as PermissionModule,
      },
      {
        count: criticalServiceCount,
        type: 'danger',
        message: t('dashboardCriticalIssuesToday').replace('{count}', formatCount(criticalServiceCount)),
        time: t('fuelPresetToday'),
        targetTab: 'mechanic' as PermissionModule,
      },
      {
        count: integrationIssues.length,
        type: 'danger',
        message: `Integratsiya uzilishlari: ${formatCount(integrationIssues.length)} ta (${integrationIssues.join(', ')})`,
        time: t('refresh'),
        targetTab: integrationAlertTarget,
      },
    ]
      .filter((item) => item.count > 0)
      .map((item, index) => ({
        id: index + 1,
        type: item.type,
        message: item.message,
        time: item.time,
        targetTab: item.targetTab,
      }));

    if (existingAlerts.length > 0) {
      return existingAlerts;
    }

    return [{
      id: 1,
      type: 'warning',
      message: t('dashboardNoAlerts'),
      time: t('fuelPresetToday'),
      targetTab: null,
    }];
  })();
  const notificationsCount = dashboardAlerts[0]?.message === t('dashboardNoAlerts') ? 0 : dashboardAlerts.length;

  const dashboardActivity = [
    {
      id: 1,
      action: t('dashboardTurnstileFlow').replace('{in}', formatCount(dashboardData?.access?.entrancesToday)).replace('{out}', formatCount(dashboardData?.access?.exitsToday)),
      user: 'Hikvision',
      time: t('fuelPresetToday'),
    },
    {
      id: 2,
      action: t('dashboardEsmoResults').replace('{passed}', formatCount(dashboardData?.medical?.passedToday)).replace('{failed}', formatCount(dashboardData?.medical?.failedToday)),
      user: 'ESMO',
      time: t('fuelPresetToday'),
    },
    {
      id: 3,
      action: t('dashboardTechCheck').replace('{passed}', formatCount(dashboardData?.pulse?.checksPassed)).replace('{total}', formatCount(dashboardData?.pulse?.checksTotal)),
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
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
                  className="glass-panel p-4 sm:p-6 rounded-2xl relative overflow-hidden group cursor-pointer hover:border-slate-500/50 transition-colors"
                >
                  <div className={`absolute -right-6 -top-6 w-36 h-36 bg-gradient-to-br ${stat.color} rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500`}></div>
                  <div className="flex justify-between items-start relative z-10 gap-2">
                    <div className="min-w-0">
                      <h3 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 truncate">
                        {stat.value}
                      </h3>
                      <p className="text-slate-400 text-[10px] sm:text-xs font-medium mt-1 uppercase tracking-wider truncate">{stat.title}</p>
                    </div>
                    <div
                      data-stat={stat.id}
                      className={`dashboard-stat-icon p-2.5 sm:p-4 rounded-xl bg-gradient-to-br ${stat.color} bg-opacity-10 shadow-xl [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-[26px] sm:[&>svg]:h-[26px] shrink-0`}
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
                        {/* custom dark tooltip to match Probeg chart */}
                        {(() => {
                          const FuelTooltip = (props: any) => {
                            const { active, payload, label, coordinate } = props;
                            const tooltipRef = React.useRef<HTMLDivElement | null>(null);
                            React.useEffect(() => {
                              if (!tooltipRef.current) return;
                              if (!active || !coordinate) {
                                tooltipRef.current.style.visibility = 'hidden';
                                return;
                              }
                              const left = Math.max(8, Math.round(coordinate.x));
                              const top = Math.max(8, Math.round(coordinate.y) - 64);
                              tooltipRef.current.style.left = `${left}px`;
                              tooltipRef.current.style.top = `${top}px`;
                              tooltipRef.current.style.visibility = 'visible';
                            }, [active, coordinate]);
                            if (!active || !payload || !payload.length) return <div ref={tooltipRef} className="fuel-tooltip-pos" />;
                            const entry = payload[0];
                            const value = typeof entry.value === 'number' ? entry.value : Number(entry.value || 0);
                            const color = entry.color || fuelChartTheme.consumption;
                            return (
                              <div ref={tooltipRef} className="fuel-tooltip-pos absolute z-50 pointer-events-none">
                                <div className="rounded-md border border-slate-700 bg-slate-900/90 p-3 text-sm text-slate-100 shadow-lg min-w-[180px]">
                                  <div className="mb-2 flex items-center gap-2">
                                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={color} /></svg>
                                    <div className="text-xs text-slate-300">{label}</div>
                                  </div>
                                  <div className="text-sm font-bold text-slate-100">{t('fuelChartSeriesIssued')}</div>
                                  <div className="mt-2 text-lg font-black text-white">{Number.isFinite(value) ? value.toLocaleString(locale, { maximumFractionDigits: 2 }) : '—'}{t('fuelUnitL')}</div>
                                </div>
                              </div>
                            );
                          };
                          return <Tooltip content={(props) => <FuelTooltip {...props} />} />;
                        })()}
                        <style>{`.fuel-tooltip-pos { visibility: hidden; }`}</style>
                        <Area type="monotone" name={`${t('fuelChartSeriesIssued')} (${t('fuelUnitL')})`} dataKey="consumption" stroke={fuelChartTheme.consumption} strokeWidth={2.6} fillOpacity={1} fill="url(#colorFuelConsumptionDash)" isAnimationActive={false} />
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
                      <button
                        key={alert.id}
                        type="button"
                        onClick={() => openAlertTarget(alert.targetTab)}
                        disabled={!alert.targetTab}
                        className={`w-full p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 flex gap-3 text-left transition-colors ${alert.targetTab
                          ? 'hover:border-blue-500/40 hover:bg-slate-900/70 cursor-pointer'
                          : 'cursor-default'
                          }`}
                      >
                        <div className={`mt-0.5 p-1 rounded-full aspect-square h-fit ${alert.type === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          <AlertTriangle size={12} />
                        </div>
                        <div>
                          <p className="text-xs text-slate-300 font-medium">{alert.message}</p>
                          <span className="text-[10px] text-slate-500">{alert.time}</span>
                        </div>
                      </button>
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

            {/* GPS Monitoring Charts on Dashboard */}
            <LiveTracker lang={lang} dashboardOnly={true} />

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
      case 'dispatch':
        return (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <DispatcherDashboard />
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
      case 'tools':
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <ToolsManager />
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
      // 'mobile' page removed
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


  const currentUserInitial = String(t(userRole as any)).charAt(0).toUpperCase();
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
        onEimzoLogin={handleEimzoLogin}
      />
    );
  }

  return (
    <div className={`app-shell min-h-screen w-full overflow-x-hidden flex text-slate-100 bg-slate-900 ${theme === 'light' ? 'theme-light' : 'theme-dark'}`}>
      {/* Sidebar Navigation */}
      <aside className={`glass-panel border-r border-slate-700/50 h-screen flex-shrink-0 flex flex-col hidden md:flex transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`p-6 flex items-center text-left group transition-all duration-300 ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}
        >
          <img
            src="/logo1.png"
            alt="MainTrack logo"
            className="h-7 w-auto object-contain shrink-0 transition-transform duration-300 group-hover:scale-105"
          />
          {!sidebarCollapsed && (
            <h1 className="brand-title text-blue-500 font-extrabold text-lg tracking-wide uppercase whitespace-nowrap overflow-hidden text-ellipsis">
              MainTrack
            </h1>
          )}
        </button>
        <nav className="flex-1 p-4 space-y-2 -mt-px overflow-x-hidden overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'settings') {
                  setSettingsInitialTab('users');
                }
                setActiveTab(item.id);
              }}
              title={sidebarCollapsed ? item.label : undefined}
              className={`w-full flex items-center px-4 py-3 rounded-xl border min-w-0 transition-all duration-200
                ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3'}
                ${activeTab === item.id
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
                  : 'text-slate-400 border-transparent hover:border-slate-700/60 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
            >
              <div className={`shrink-0 ${activeTab === item.id ? 'text-blue-400' : ''}`}>{item.icon}</div>
              {!sidebarCollapsed && <span className="font-medium text-sm leading-5 whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className={`p-4 flex items-center shrink-0 ${sidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white transition-all shadow-sm shrink-0"
            aria-label="Toggle Sidebar"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden relative">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none -z-10 animate-float"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none -z-10 animate-float-delay-minus3"></div>

        {/* Top Header */}
        <header className="h-16 sm:h-20 glass-panel flex items-center justify-between z-10">
          <div className={`flex items-center min-w-0 shrink-0 pl-3 sm:pl-6 md:pl-8 ${hideHeaderTitle ? 'lg:pl-0 lg:gap-0' : 'gap-1.5 sm:gap-3 pr-2 lg:pr-4'}`}>
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden h-8 w-8 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors shrink-0"
              aria-label={t('menuOpen')}
            >
              <Menu className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="md:hidden flex items-center gap-1.5 sm:gap-2 text-left min-w-0"
            >
              <img
                src="/logo1.png"
                alt="MainTrack logo"
                className="h-6 w-auto sm:h-7 object-contain shrink-0"
              />
              <span className="brand-title text-blue-500 font-extrabold text-sm sm:text-base tracking-wide uppercase truncate max-w-[80px] min-[380px]:max-w-[140px]">
                MainTrack
              </span>
            </button>
            {hideHeaderTitle ? <div className="hidden md:block" /> : <h2 className="hidden md:block text-2xl font-semibold">{t(activeTab as any)}</h2>}
          </div>

          {/* Platforma test mode indicator restored */}
          <div className="hidden lg:flex flex-1 min-w-0 overflow-hidden items-center h-full" role="status" aria-live="polite">
            <div className="test-mode-inline-track">
              <span>{t('platformTestMode')}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-4 md:gap-6 shrink-0 pr-3 sm:pr-6 md:pr-8">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 w-9 sm:w-auto sm:px-4 h-9 sm:h-10 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer shrink-0"
              title={theme === 'dark' ? t('themeSwitchToLight') : t('themeSwitchToDark')}
            >
              {theme === 'dark' ? (
                <Moon className="text-indigo-300 w-[16px] h-[16px] sm:w-[18px] sm:h-[18px] shrink-0" />
              ) : (
                <Sun className="text-amber-400 w-[16px] h-[16px] sm:w-[18px] sm:h-[18px] shrink-0" />
              )}
              <span className="hidden sm:inline font-medium">{theme === 'dark' ? t('themeNight') : t('themeDay')}</span>
            </button>
            <button
              onClick={toggleLang}
              className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 w-9 sm:w-auto sm:px-4 h-9 sm:h-10 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer shrink-0"
            >
              <Globe className="text-blue-400 w-[16px] h-[16px] sm:w-[18px] sm:h-[18px] shrink-0 hidden sm:block" />
              <span className="font-bold sm:font-medium uppercase text-[11px] sm:text-base leading-none">{lang}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 w-9 sm:w-auto sm:px-4 h-9 sm:h-10 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-100 hover:border-red-500/50 hover:text-red-500 transition-colors cursor-pointer shrink-0"
              title={t('exit')}
            >
              <LogOut className="w-[16px] h-[16px] sm:w-[18px] sm:h-[18px] shrink-0" />
              <span className="hidden sm:inline font-medium">{t('exit')}</span>
            </button>
            <div ref={notificationsRef} className="relative shrink-0">
              {/* eslint-disable-next-line jsx-a11y/aria-proptypes */}
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className={`relative flex items-center justify-center w-9 sm:w-auto sm:px-3 h-9 sm:h-10 rounded-lg bg-slate-800/50 border transition-colors cursor-pointer shrink-0 ${notificationsOpen
                  ? 'border-blue-500/50 text-slate-200'
                  : 'border-slate-700 hover:border-blue-500/50 text-slate-300'
                  }`}
                title={t('notifications')}
                aria-label={t('notifications')}
                aria-haspopup="dialog"
              >
                <Bell className="text-blue-400 w-[16px] h-[16px] sm:w-[18px] sm:h-[18px] shrink-0" />
                {notificationsCount > 0 ? (
                  <span className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 min-w-4 sm:min-w-5 h-4 sm:h-5 px-1 rounded-full bg-red-500 text-white text-[9px] sm:text-[10px] font-bold inline-flex items-center justify-center shadow-lg shadow-red-500/20">
                    {notificationsCount > 9 ? '9+' : notificationsCount}
                  </span>
                ) : null}
              </button>

              <AnimatePresence>
                {notificationsOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-full mt-3 w-[min(92vw,24rem)] rounded-2xl border border-slate-700/70 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-slate-950/50 overflow-hidden z-50"
                    role="dialog"
                    aria-label={t('dashboardAlerts')}
                  >
                    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-300 inline-flex items-center justify-center">
                          <Bell size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{t('dashboardAlerts')}</p>
                          <p className="text-[11px] text-slate-500">
                            {notificationsCount > 0 ? `${notificationsCount} ${t('dashboardTotalPrefix').toLowerCase()}` : t('dashboardNoAlerts')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className="w-8 h-8 rounded-lg border border-slate-700/70 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors inline-flex items-center justify-center"
                        aria-label={t('menuClose')}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                      {dashboardAlerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() => openAlertTarget(alert.targetTab)}
                          disabled={!alert.targetTab}
                          className={`w-full rounded-xl border border-slate-800 bg-slate-950/50 p-3 flex gap-3 text-left transition-colors ${alert.targetTab
                            ? 'hover:border-blue-500/40 hover:bg-slate-950/70 cursor-pointer'
                            : 'cursor-default'
                            }`}
                        >
                          <div className={`mt-0.5 p-1.5 rounded-full aspect-square h-fit ${alert.type === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            <AlertTriangle size={12} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-200 font-medium leading-5">{alert.message}</p>
                            <span className="text-[10px] text-slate-500">{alert.time}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
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
                <p className="text-sm font-semibold capitalize">{t(userRole as any)}</p>
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
                      src="/logo1.png"
                      alt="MainTrack logo"
                      className="h-7 w-auto object-contain shrink-0"
                    />
                    <h1 className="brand-title text-blue-500 font-extrabold text-lg tracking-wide uppercase">MainTrack</h1>
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
          <Suspense
            fallback={
              <div className="glass-panel rounded-2xl border border-slate-700/50 p-6 text-sm font-medium text-slate-300">
                {t('syncing')}
              </div>
            }
          >
            <AnimatePresence mode="wait">
              {renderContent()}
            </AnimatePresence>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default App;
// Trigger Vite reload










