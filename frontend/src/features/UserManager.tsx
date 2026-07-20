import { useCallback, useEffect, useMemo, useState } from 'react';
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
  ShieldAlert,
  X,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { resolveApiBaseUrl } from '../utils/apiBase';
import eImzoIcon from '../assets/e-imzo.png';
import {
  bindEimzoKeyToUser,
  formatEimzoKeyLocation,
  getEimzoLocalhostUrl,
  getEimzoKeys,
  getEimzoKeyIdentity,
  isEimzoApiKeyErrorMessage,
} from '../features/auth/eimzo/eimzo.service';
import type { EimzoKey } from '../features/auth/eimzo/eimzo.types';
import {
  type AppRole,
  type PermissionLevel,
  type PermissionMap,
  type PermissionModule,
  buildRoleDefaultPermissions,
  getEffectivePermissionLevel,
  normalizePermissionMap,
  normalizePermissionSelection,
} from '../permissions';

type RoleKey = 'admin' | 'dispatcher' | 'user';
type StatusKey = 'active' | 'inactive';

type ApiUser = {
  id: number;
  username: string;
  email: string | null;
  fullName: string | null;
  role: RoleKey;
  permissions: PermissionMap;
  status: StatusKey;
  lastLoginAt: string | null;
  pinfl?: string | null;
  inn?: string | null;
  certificateSerial?: string | null;
  eimzoEnabled?: boolean;
  lastEimzoLoginAt?: string | null;
  createdAt: string;
};

type UserFormState = {
  username: string;
  fullName: string;
  email: string;
  role: RoleKey;
  status: StatusKey;
  password: string;
  pinfl: string;
  inn: string;
  certificateSerial: string;
  eimzoEnabled: boolean;
};

type UserManagerProps = {
  authToken: string;
  currentUserId: number | null;
  accessLevel: PermissionLevel;
  onPermissionsChanged?: () => Promise<void> | void;
  initialTab?: 'users' | 'roles';
};

const API_BASE = resolveApiBaseUrl();
const SUPERADMIN_USERNAME = String((import.meta as any).env?.VITE_SUPERADMIN_USERNAME ?? 'superadmin').trim().toLowerCase();

const modules: Array<{ id: PermissionModule; labelKey: string }> = [
  { id: 'dashboard', labelKey: 'dashboard' },
  { id: 'access', labelKey: 'accessControl' },
  { id: 'medical', labelKey: 'medicalChecks' },
  { id: 'tools', labelKey: 'tools' },
  { id: 'waybills', labelKey: 'waybills' },
  { id: 'fuel', labelKey: 'fuel' },
  { id: 'tracking', labelKey: 'liveTracking' },
  { id: 'fleet', labelKey: 'fleet' },
  { id: 'drivers', labelKey: 'drivers' },
  { id: 'mechanic', labelKey: 'vehicleInspections' },
  { id: 'settings', labelKey: 'settings' },
];

const createInitialForm = (): UserFormState => ({
  username: '',
  fullName: '',
  email: '',
  role: 'user',
  status: 'active',
  password: '',
  pinfl: '',
  inn: '',
  certificateSerial: '',
  eimzoEnabled: false,
});

const createRolePermissionState = (): Record<RoleKey, PermissionMap> => ({
  admin: buildRoleDefaultPermissions('admin'),
  dispatcher: buildRoleDefaultPermissions('dispatcher'),
  user: buildRoleDefaultPermissions('user'),
});

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

const formatDisplayName = (value: string): string =>
  value
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('uz-UZ')
    .replace(/(^|\s)(\S)/g, (match) => match.toLocaleUpperCase('uz-UZ'));

const formatEimzoCertificateOption = (key: EimzoKey, fallback: string): string => {
  const directName = key.CN || key.alias || key.ownerName;
  if (directName?.trim()) return formatDisplayName(directName);

  const rawName = key.name?.trim();
  if (rawName) {
    const afterUnderscore = rawName.split('_').slice(1).join(' ').trim();
    return formatDisplayName(afterUnderscore || rawName);
  }

  return fallback;
};

const formatEimzoDate = (value: Date | string | undefined, fallback: string): string => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const getEimzoOwnerType = (key: EimzoKey, legalLabel: string, individualLabel: string): string => {
  const raw = `${key.O ?? ''} ${key.type ?? ''}`.toLowerCase();
  if (raw.includes('yuridik') || raw.includes('юрид')) return legalLabel;
  return individualLabel;
};

export const UserManager = ({ authToken, currentUserId, accessLevel, onPermissionsChanged, initialTab = 'users' }: UserManagerProps) => {
  const { t, lang } = useI18n();
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>(initialTab);
  const [selectedRole, setSelectedRole] = useState<RoleKey>('admin');
  const [rolePermissions, setRolePermissions] = useState<Record<RoleKey, PermissionMap>>(() => createRolePermissionState());
  const [isLoadingRolePermissions, setIsLoadingRolePermissions] = useState(false);
  const [rolePermissionsError, setRolePermissionsError] = useState<string | null>(null);
  const [isSavingRolePermissions, setIsSavingRolePermissions] = useState(false);
  const [hasRolePermissionDraft, setHasRolePermissionDraft] = useState(false);
  const [rolePermissionsSuccess, setRolePermissionsSuccess] = useState<string | null>(null);

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userLoadError, setUserLoadError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [formState, setFormState] = useState<UserFormState>(() => createInitialForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [eimzoModalUser, setEimzoModalUser] = useState<ApiUser | null>(null);
  const [eimzoKeys, setEimzoKeys] = useState<EimzoKey[]>([]);
  const [selectedEimzoIndex, setSelectedEimzoIndex] = useState(-1);
  const [isLoadingEimzoKeys, setIsLoadingEimzoKeys] = useState(false);
  const [isBindingEimzo, setIsBindingEimzo] = useState(false);
  const [eimzoBindError, setEimzoBindError] = useState<string | null>(null);
  const [eimzoBindSuccess, setEimzoBindSuccess] = useState<string | null>(null);

  const roleItems = useMemo(() => ['admin', 'dispatcher', 'user'] as const, []);
  const canManage = accessLevel === 'full';
  const selectedEimzoKey = useMemo(() => eimzoKeys[selectedEimzoIndex] ?? null, [eimzoKeys, selectedEimzoIndex]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const formatLastActive = useCallback((user: ApiUser) => {
    if (!user.lastLoginAt) {
      return "Yangi";
    }

    const parsed = new Date(user.lastLoginAt);
    if (Number.isNaN(parsed.getTime())) {
      return user.lastLoginAt;
    }

    const locale = lang === 'uz' ? 'uz-UZ' : lang === 'ru' ? 'ru-RU' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }, [lang]);

  const loadUsers = useCallback(async (silent = false) => {
    if (!authToken) {
      setUserLoadError('Token topilmadi');
      return;
    }

    if (!silent) {
      setIsLoadingUsers(true);
    }

    try {
      const response = await fetch(`${API_BASE}/users`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, 'Foydalanuvchilarni olishda xatolik'));
      }

      const items = Array.isArray(payload?.items) ? payload.items : [];
      setUsers(items as ApiUser[]);
      setUserLoadError(null);
    } catch (error) {
      setUserLoadError(error instanceof Error ? error.message : 'Foydalanuvchilarni olishda xatolik');
    } finally {
      if (!silent) {
        setIsLoadingUsers(false);
      }
    }
  }, [authToken]);

  const loadRolePermissions = useCallback(async (silent = false) => {
    if (!authToken) {
      setRolePermissionsError('Token topilmadi');
      return;
    }

    if (!silent) {
      setIsLoadingRolePermissions(true);
    }

    try {
      const response = await fetch(`${API_BASE}/users/role-permissions`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, 'Ruxsatlarni olishda xatolik'));
      }

      const nextState = createRolePermissionState();
      const items = Array.isArray(payload?.items) ? payload.items : [];

      for (const item of items) {
        const roleRaw = String(item?.role ?? '').trim().toLowerCase();
        if (roleRaw === 'admin' || roleRaw === 'dispatcher' || roleRaw === 'user') {
          nextState[roleRaw] = normalizePermissionMap(item?.permissions, roleRaw);
        }
      }

      setRolePermissions(nextState);
      setRolePermissionsError(null);
      setHasRolePermissionDraft(false);
    } catch (error) {
      setRolePermissionsError(error instanceof Error ? error.message : 'Ruxsatlarni olishda xatolik');
    } finally {
      if (!silent) {
        setIsLoadingRolePermissions(false);
      }
    }
  }, [authToken]);

  useEffect(() => {
    if (activeTab === 'users') {
      void loadUsers();
      return;
    }
    void loadRolePermissions();
  }, [activeTab, loadRolePermissions, loadUsers]);

  useEffect(() => {
    void loadRolePermissions();
  }, [loadRolePermissions]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'users') {
        void loadUsers(true);
      } else {
        if (!hasRolePermissionDraft && !isSavingRolePermissions) {
          void loadRolePermissions(true);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, hasRolePermissionDraft, isSavingRolePermissions, loadRolePermissions, loadUsers]);

  useEffect(() => {
    if (!rolePermissionsSuccess) return;
    const timeout = setTimeout(() => setRolePermissionsSuccess(null), 2500);
    return () => clearTimeout(timeout);
  }, [rolePermissionsSuccess]);

  useEffect(() => {
    if (!eimzoBindSuccess) return;
    const timeout = setTimeout(() => {
      setEimzoModalUser(null);
      setEimzoKeys([]);
      setSelectedEimzoIndex(-1);
      setEimzoBindError(null);
      setEimzoBindSuccess(null);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [eimzoBindSuccess]);

  const openCreateModal = () => {
    if (!canManage) {
      return;
    }
    setEditingUser(null);
    setFormState(createInitialForm());
    setFormError(null);
    setShowPassword(false);
    setIsFormOpen(true);
  };

  const openEditModal = (user: ApiUser) => {
    if (!canManage) {
      return;
    }
    setEditingUser(user);
    setFormState({
      username: user.username,
      fullName: user.fullName || '',
      email: user.email || '',
      role: user.role,
      status: user.status,
      password: '',
      pinfl: user.pinfl || '',
      inn: user.inn || '',
      certificateSerial: user.certificateSerial || '',
      eimzoEnabled: Boolean(user.eimzoEnabled),
    });
    setFormError(null);
    setShowPassword(false);
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    if (isSubmittingForm) {
      return;
    }
    setIsFormOpen(false);
    setFormError(null);
    setShowPassword(false);
  };

  const loadEimzoKeysForBinding = async () => {
    setIsLoadingEimzoKeys(true);
    setEimzoBindError(null);
    setEimzoBindSuccess(null);
    try {
      const keys = await getEimzoKeys();
      setEimzoKeys(keys);
      setSelectedEimzoIndex(-1);
      if (keys.length === 0) {
        setEimzoBindError(t('eimzoKeyNotFound'));
      }
    } catch (error) {
      setEimzoKeys([]);
      setSelectedEimzoIndex(-1);
      setEimzoBindError(error instanceof Error ? error.message : t('eimzoKeysLoadError'));
    } finally {
      setIsLoadingEimzoKeys(false);
    }
  };

  const openEimzoBindModal = (user: ApiUser) => {
    const canBindUser = canManage || user.id === currentUserId;
    if (!canBindUser) {
      return;
    }
    setEimzoModalUser(user);
    setEimzoKeys([]);
    setSelectedEimzoIndex(-1);
    setEimzoBindError(null);
    setEimzoBindSuccess(null);
    void loadEimzoKeysForBinding();
  };

  const closeEimzoBindModal = () => {
    if (isBindingEimzo) {
      return;
    }
    setEimzoModalUser(null);
    setEimzoKeys([]);
    setSelectedEimzoIndex(-1);
    setEimzoBindError(null);
    setEimzoBindSuccess(null);
  };

  const bindSelectedEimzoKey = async () => {
    if (!eimzoModalUser || !selectedEimzoKey || !authToken) {
      setEimzoBindError(t('eimzoBindKeyMissing'));
      return;
    }

    setIsBindingEimzo(true);
    setEimzoBindError(null);
    setEimzoBindSuccess(null);
    try {
      const updatedUser = await bindEimzoKeyToUser(eimzoModalUser.id, selectedEimzoKey, authToken) as ApiUser;
      setUsers((prev) => prev.map((item) => item.id === updatedUser.id ? updatedUser : item));
      await loadUsers(true);
      setEimzoBindSuccess(t('eimzoBindSuccess'));
    } catch (error) {
      setEimzoBindError(error instanceof Error ? error.message : t('eimzoBindError'));
    } finally {
      setIsBindingEimzo(false);
    }
  };

  const submitForm = async () => {
    if (!canManage) {
      setFormError('Bu amallar uchun full ruxsat talab qilinadi');
      return;
    }

    if (!formState.username.trim()) {
      setFormError('Login kiritilishi shart');
      return;
    }

    if (!editingUser && !formState.password.trim()) {
      setFormError('Yangi foydalanuvchi uchun parol kiritilishi shart');
      return;
    }

    setIsSubmittingForm(true);
    setFormError(null);

    try {
      const payload: Record<string, unknown> = {
        username: formState.username,
        fullName: formState.fullName,
        email: formState.email,
        role: formState.role,
        permissions: rolePermissions[formState.role],
        pinfl: formState.pinfl,
        inn: formState.inn,
        certificateSerial: formState.certificateSerial,
        eimzoEnabled: formState.eimzoEnabled,
      };

      if (formState.password.trim()) {
        payload.password = formState.password;
      }

      if (editingUser) {
        payload.status = formState.status;
      }

      const isEdit = Boolean(editingUser);
      const endpoint = isEdit ? `${API_BASE}/users/${editingUser?.id}` : `${API_BASE}/users`;
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractErrorMessage(result, 'Foydalanuvchini saqlashda xatolik'));
      }

      setIsFormOpen(false);
      setEditingUser(null);
      setFormState(createInitialForm());
      await loadUsers();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Foydalanuvchini saqlashda xatolik');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const deleteUser = async (user: ApiUser) => {
    if (!canManage) {
      return;
    }

    const deleteConfirmed = window.confirm(`"${user.fullName || user.username}" foydalanuvchisini o'chirmoqchimisiz?`);
    if (!deleteConfirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, 'Foydalanuvchini o\'chirishda xatolik'));
      }

      await loadUsers();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Foydalanuvchini o\'chirishda xatolik');
    }
  };

  const selectedRolePermissions = rolePermissions[selectedRole];

  const updateRoleAccess = (moduleId: PermissionModule, access: PermissionLevel) => {
    if (!canManage) {
      return;
    }

    setRolePermissions((prev) => ({
      ...prev,
      [selectedRole]: {
        ...prev[selectedRole],
        [moduleId]: normalizePermissionSelection([access], ['none']),
      },
    }));
    setHasRolePermissionDraft(true);
    setRolePermissionsSuccess(null);
  };

  const saveRolePermissions = async () => {
    if (!canManage) {
      return;
    }

    if (!authToken) {
      setRolePermissionsError('Token topilmadi');
      setRolePermissionsSuccess(null);
      return;
    }

    setIsSavingRolePermissions(true);
    setRolePermissionsError(null);
    setRolePermissionsSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/users/role-permissions/${selectedRole}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          permissions: selectedRolePermissions,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, 'Ruxsatlarni saqlashda xatolik'));
      }

      const roleRaw = String(payload?.role ?? selectedRole).trim().toLowerCase();
      const permissions = normalizePermissionMap(payload?.permissions ?? selectedRolePermissions, selectedRole as AppRole);
      if (roleRaw === 'admin' || roleRaw === 'dispatcher' || roleRaw === 'user') {
        setRolePermissions((prev) => ({
          ...prev,
          [roleRaw]: permissions,
        }));
      }
      setHasRolePermissionDraft(false);
      setRolePermissionsSuccess('Ruxsatlar saqlandi');

      await loadUsers();
      if (onPermissionsChanged) {
        await onPermissionsChanged();
      }
    } catch (error) {
      setRolePermissionsError(error instanceof Error ? error.message : 'Ruxsatlarni saqlashda xatolik');
      setRolePermissionsSuccess(null);
    } finally {
      setIsSavingRolePermissions(false);
    }
  };

  const roleBadgeClass = (role: RoleKey): string => {
    if (role === 'admin') return 'bg-purple-500/10 text-purple-400';
    if (role === 'dispatcher') return 'bg-blue-500/10 text-blue-400';
    return 'bg-slate-500/10 text-slate-400';
  };

  if (accessLevel === 'none') {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
        Bu bo'lim uchun ruxsatingiz yo'q.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex p-1 bg-slate-800/50 rounded-2xl w-full sm:w-fit border border-slate-700/50">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users size={18} /> {t('users')}
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'roles' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
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
            {!canManage ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                Read rejimi: foydalanuvchilar ro'yxatini ko'rishingiz mumkin, lekin qo'shish/tahrirlash/o'chirish bloklangan.
              </div>
            ) : null}

            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">{t('users')}</h3>
                <p className="text-sm text-slate-500">Tizimga kirish huquqiga ega barcha xodimlar</p>
              </div>
              <button
                onClick={openCreateModal}
                disabled={!canManage}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UserPlus size={18} />
                Foydalanuvchi qo'shish
              </button>
            </div>

            <div className="glass-panel rounded-3xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-900/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Foydalanuvchi</th>
                    <th className="px-6 py-4">Roli</th>
                    <th className="px-6 py-4">Holati</th>
                    <th className="px-6 py-4">Oxirgi faollik</th>
                    <th className="px-6 py-4">E-IMZO</th>
                    <th className="px-6 py-4 text-right pr-8">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {isLoadingUsers ? (
                    <tr>
                      <td className="px-6 py-10 text-sm text-slate-500" colSpan={6}>Yuklanmoqda...</td>
                    </tr>
                  ) : userLoadError ? (
                    <tr>
                      <td className="px-6 py-10 text-sm text-red-400" colSpan={6}>{userLoadError}</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td className="px-6 py-10 text-sm text-slate-500" colSpan={6}>Foydalanuvchi topilmadi</td>
                    </tr>
                  ) : users.map((user) => {
                    const displayName = user.fullName || user.username;
                    const canDelete = canManage && user.id !== currentUserId && user.username.toLowerCase() !== SUPERADMIN_USERNAME;
                    const canBindEimzo = canManage || user.id === currentUserId;

                    return (
                      <tr key={user.id} className="hover:bg-blue-500/5 transition-all group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setActiveTab('roles')}
                              className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold hover:opacity-90 transition-opacity"
                              title="Rollar va huquqlar sahifasiga o'tish"
                            >
                              {displayName.charAt(0).toUpperCase()}
                            </button>
                            <div>
                              <p className="text-sm font-bold text-white user-manager-name">{displayName}</p>
                              <p className="text-xs text-slate-500">{user.email || user.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${roleBadgeClass(user.role)}`}>
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
                            <span className="text-sm text-slate-300 capitalize user-status-text">{user.status}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {formatLastActive(user)}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => openEimzoBindModal(user)}
                            disabled={!canBindEimzo}
                            className="inline-flex h-9 w-28 items-center justify-center border-0 bg-transparent p-0 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                            title={user.eimzoEnabled ? t('eimzoLinkedTitle') : t('eimzoLinkTitle')}
                            aria-label={user.eimzoEnabled ? t('eimzoLinkedTitle') : t('eimzoLinkTitle')}
                          >
                            <img src={eImzoIcon} alt="" className="h-8 w-28 object-contain" />
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right pr-8 space-x-2">
                          <button
                            onClick={() => openEditModal(user)}
                            disabled={!canManage}
                            className="p-2 text-slate-500 hover:text-blue-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Tahrirlash"
                          >
                            <Edit3 size={18} />
                          </button>
                          <button
                            onClick={() => canDelete && deleteUser(user)}
                            disabled={!canDelete}
                            className="p-2 text-slate-500 hover:text-red-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title={canDelete ? "O'chirish" : "Bu foydalanuvchini o'chirib bo'lmaydi"}
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-xl font-bold mb-6">{t('roles')}</h3>
              {roleItems.map((role) => (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between group ${
                    selectedRole === role
                      ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/5'
                      : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${
                      selectedRole === role ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600'
                    }`}>
                      <Lock size={20} />
                    </div>
                    <div>
                      <p className={`font-bold capitalize role-name-text ${selectedRole === role ? 'text-blue-400' : 'text-slate-100'}`}>
                        {t(role as any)}
                      </p>
                      <p className="text-xs text-slate-500">Tizim bo'limlariga kirish ruxsati</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className={selectedRole === role ? 'text-blue-400' : 'text-slate-600'} />
                </button>
              ))}
            </div>

            <div className="lg:col-span-2">
              <div className="glass-panel p-6 rounded-3xl border border-slate-700/50 h-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <div>
                    <h4 className="text-lg font-bold flex items-center gap-2">
                      <ShieldAlert size={20} className="text-blue-400" />
                      {t(selectedRole as any)} uchun {t('permissions')}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">Tanlangan rol uchun tizim modullarini ko'rish jadvali</p>
                  </div>
                  <button
                    type="button"
                    onClick={saveRolePermissions}
                    disabled={!canManage || isSavingRolePermissions}
                    className="w-full sm:w-auto rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSavingRolePermissions ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                </div>

                {!canManage ? (
                  <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    Read rejimi: ruxsatlarni ko'rishingiz mumkin, lekin o'zgartira olmaysiz.
                  </div>
                ) : null}

                {rolePermissionsError ? (
                  <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {rolePermissionsError}
                  </div>
                ) : null}

                {rolePermissionsSuccess ? (
                  <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                    {rolePermissionsSuccess}
                  </div>
                ) : null}

                {isLoadingRolePermissions ? (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-8 text-sm text-slate-400">
                    Ruxsatlar yuklanmoqda...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {modules.map((mod) => {
                      const currentSelection = selectedRolePermissions?.[mod.id] ?? ['none'];
                      const currentAccess = getEffectivePermissionLevel(currentSelection);
                      const isOn = currentAccess === 'full' || currentAccess === 'read';
                      const rowAccentClass = isOn ? 'border-blue-500/40' : 'border-slate-600/40';
                      return (
                        <div key={mod.id} className={`flex flex-row items-center justify-between p-4 rounded-2xl transition-all border border-transparent hover:border-slate-700/50 border-l-2 ${rowAccentClass} ${!isOn ? 'hover:bg-slate-800/30' : 'bg-slate-800/30 hover:bg-slate-800/50'}`}>
                          <div className="flex items-center gap-3 md:gap-4 min-w-0">
                            <div className={`w-2 h-2 rounded-full transition-colors ${isOn ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-slate-600'}`} />
                            <span className={`text-sm font-medium transition-colors break-words permission-name-text ${isOn ? 'text-slate-200' : 'text-slate-400'}`}>{t(mod.labelKey as any)}</span>
                          </div>
                          <div className="flex items-center">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={isOn}
                                onChange={(e) => updateRoleAccess(mod.id, e.target.checked ? 'full' : 'none')}
                                disabled={!canManage}
                              />
                              <div className="role-permission-track w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFormOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              className="glass-panel w-full max-w-xl rounded-3xl border border-slate-700/60 p-6"
            >
              <div className="mb-5 flex items-center justify-between">
                <h4 className="text-lg font-bold">
                  {editingUser ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi qo\'shish'}
                </h4>
                <button
                  onClick={closeFormModal}
                  className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white"
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="sm:col-span-1">
                  <span className="mb-1 block text-xs text-slate-500">Login</span>
                  <input
                    value={formState.username}
                    onChange={(event) => setFormState((prev) => ({ ...prev, username: event.target.value }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="login"
                  />
                </label>

                <label className="sm:col-span-1">
                  <span className="mb-1 block text-xs text-slate-500">
                    {editingUser ? 'Yangi parol (ixtiyoriy)' : 'Parol'}
                  </span>
                  <div className="relative">
                    <input
                      value={formState.password}
                      onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                      type={showPassword ? 'text' : 'password'}
                      disabled={!canManage}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 pr-10 text-sm outline-none focus:border-blue-500"
                      placeholder={editingUser ? 'Parolni almashtirish uchun kiriting' : 'Kamida 6 ta belgi'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={!canManage}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <label className="sm:col-span-2">
                  <span className="mb-1 block text-xs text-slate-500">Email</span>
                  <input
                    value={formState.email}
                    onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="example@smartroute.uz"
                  />
                </label>

                <label className="sm:col-span-1">
                  <span className="mb-1 block text-xs text-slate-500">Rol</span>
                  <select
                    value={formState.role}
                    onChange={(event) => setFormState((prev) => ({ ...prev, role: event.target.value as RoleKey }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    {roleItems.map((role) => (
                      <option key={role} value={role}>
                        {t(role as any)}
                      </option>
                    ))}
                  </select>
                </label>

                {editingUser ? (
                  <label className="sm:col-span-1">
                    <span className="mb-1 block text-xs text-slate-500">Holati</span>
                    <select
                      value={formState.status}
                      onChange={(event) => setFormState((prev) => ({ ...prev, status: event.target.value as StatusKey }))}
                      disabled={!canManage}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                ) : null}

                <label className="sm:col-span-2">
                  <span className="mb-1 block text-xs text-slate-500">To'liq ism</span>
                  <input
                    value={formState.fullName}
                    onChange={(event) => setFormState((prev) => ({ ...prev, fullName: event.target.value }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="F.I.O"
                  />
                </label>

                <label className="sm:col-span-1">
                  <span className="mb-1 block text-xs text-slate-500">E-IMZO PINFL</span>
                  <input
                    value={formState.pinfl}
                    onChange={(event) => setFormState((prev) => ({ ...prev, pinfl: event.target.value.replace(/\D+/g, '').slice(0, 14) }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="14 raqam"
                  />
                </label>

                <label className="sm:col-span-1">
                  <span className="mb-1 block text-xs text-slate-500">E-IMZO INN</span>
                  <input
                    value={formState.inn}
                    onChange={(event) => setFormState((prev) => ({ ...prev, inn: event.target.value.replace(/\D+/g, '').slice(0, 20) }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="INN"
                  />
                </label>

                <label className="sm:col-span-2">
                  <span className="mb-1 block text-xs text-slate-500">E-IMZO sertifikat serial</span>
                  <input
                    value={formState.certificateSerial}
                    onChange={(event) => setFormState((prev) => ({ ...prev, certificateSerial: event.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase() }))}
                    disabled={!canManage}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="Sertifikat serial raqami"
                  />
                </label>

                <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={formState.eimzoEnabled}
                    onChange={(event) => setFormState((prev) => ({ ...prev, eimzoEnabled: event.target.checked }))}
                    disabled={!canManage}
                    className="h-4 w-4 rounded border-slate-600 accent-emerald-500"
                  />
                  <span className="text-sm font-semibold text-emerald-200">{t('eimzoAllowLogin')}</span>
                </label>
              </div>

              {formError ? (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {formError}
                </div>
              ) : null}

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={closeFormModal}
                  type="button"
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={submitForm}
                  type="button"
                  disabled={!canManage || isSubmittingForm}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  {isSubmittingForm ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {eimzoModalUser ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4"
          >
            <motion.form
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              onSubmit={(event) => {
                event.preventDefault();
                void bindSelectedEimzoKey();
              }}
              className="glass-panel w-full max-w-xl rounded-[26px] border border-slate-700/60 p-6 shadow-2xl shadow-slate-950/50 eimzo-modal-container"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold eimzo-modal-title">{t('eimzoBindTitle')}</h4>
                  <p className="mt-1 text-sm text-slate-500 eimzo-modal-subtitle">
                    {eimzoModalUser.fullName || eimzoModalUser.username}
                  </p>
                </div>
                <button
                  onClick={closeEimzoBindModal}
                  className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 eimzo-modal-close-btn"
                  type="button"
                  disabled={isBindingEimzo}
                  aria-label="Yopish"
                >
                  <X size={16} />
                </button>
              </div>

              {eimzoBindSuccess ? (
                <div
                  className="mt-6 flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/12 px-6 py-10 text-center shadow-lg shadow-emerald-950/20"
                  role="status"
                  aria-live="polite"
                >
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-500/20 text-emerald-200">
                    <CheckCircle2 size={34} />
                  </div>
                  <p className="text-xl font-black text-emerald-100">{eimzoBindSuccess}</p>
                </div>
              ) : (
                <>
              <div className="grid grid-cols-[minmax(0,1fr)_3.75rem] items-end gap-3">
                <fieldset className="min-w-0 rounded-xl border border-slate-600/80 bg-slate-950/20 px-3 pb-2 pt-1 transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 eimzo-modal-select-wrapper">
                  <legend className="px-2 text-sm font-medium text-slate-300 eimzo-modal-select-legend">{t('eimzoSelectLabel')}</legend>
                  <select
                    value={selectedEimzoIndex}
                    disabled={isLoadingEimzoKeys || isBindingEimzo || eimzoKeys.length === 0}
                    onChange={(event) => setSelectedEimzoIndex(Number.parseInt(event.target.value, 10))}
                    className="w-full min-w-0 bg-transparent py-1 text-sm font-semibold text-slate-100 outline-none [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60 eimzo-modal-select"
                    aria-label={t('eimzoSelectLabel')}
                    data-color-scheme="dark"
                  >
                    {eimzoKeys.length === 0 ? (
                      <option value={-1} className="bg-white text-slate-900">
                        {isLoadingEimzoKeys ? t('eimzoKeysLoading') : t('eimzoKeyNotFound')}
                      </option>
                    ) : (
                      <>
                        <option value={-1} disabled className="bg-white text-slate-900">
                          {t('eimzoSelectPlaceholder')}
                        </option>
                        {eimzoKeys.map((key, index) => (
                          <option
                            key={`${key.serialNumber ?? key.name ?? key.alias ?? index}-${index}`}
                            value={index}
                            className={selectedEimzoIndex === index ? 'bg-blue-600 text-white' : 'bg-white text-slate-900'}
                          >
                            {formatEimzoCertificateOption(key, t('eimzoKeyFallback'))}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </fieldset>
                <button
                  type="button"
                  onClick={() => void loadEimzoKeysForBinding()}
                  disabled={isLoadingEimzoKeys || isBindingEimzo}
                  className="inline-flex h-[58px] w-[60px] items-center justify-center rounded-xl border border-slate-600/80 bg-slate-950/20 text-slate-200 transition-colors hover:border-blue-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-60 eimzo-modal-refresh-btn"
                  aria-label={t('eimzoRefreshKeys')}
                  title={t('refresh')}
                >
                  <RefreshCw size={20} className={isLoadingEimzoKeys ? 'animate-spin' : ''} />
                </button>
              </div>

              {selectedEimzoKey ? (
                (() => {
                  const identity = getEimzoKeyIdentity(selectedEimzoKey);
                  const ownerName = selectedEimzoKey.CN || selectedEimzoKey.alias || t('eimzoUnknown');
                  const serial = identity.certificateSerial || selectedEimzoKey.serialNumber || selectedEimzoKey.serial || t('eimzoUnknown');
                  const validity = `${formatEimzoDate(selectedEimzoKey.validFrom, t('eimzoUnknown'))} - ${formatEimzoDate(selectedEimzoKey.validTo, t('eimzoUnknown'))}`;
                  return (
                    <div className="mt-3 rounded-xl border border-slate-600/70 bg-slate-950/25 p-4 text-sm shadow-lg shadow-slate-950/20 eimzo-modal-details-box">
                      <div className="grid gap-2">
                        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
                          <span className="font-bold text-slate-200 eimzo-modal-details-label">{t('eimzoSerialNumber')}</span>
                          <span className="truncate text-slate-300 eimzo-modal-details-value" title={serial}>{serial}</span>
                        </div>
                        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
                          <span className="font-bold text-slate-200 eimzo-modal-details-label">{t('eimzoPinfl')}</span>
                          <span className="flex min-w-0 items-center gap-2 text-slate-300 eimzo-modal-details-value">
                            <span className="truncate" title={identity.pinfl ?? t('eimzoUnknown')}>{identity.pinfl ?? t('eimzoUnknown')}</span>
                            <span className="shrink-0 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold uppercase text-emerald-300">
                              {getEimzoOwnerType(selectedEimzoKey, t('eimzoLegal'), t('eimzoIndividual'))}
                            </span>
                          </span>
                        </div>
                        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
                          <span className="font-bold text-slate-200 eimzo-modal-details-label">{t('eimzoFullName')}</span>
                          <span className="truncate text-slate-300 eimzo-modal-details-value" title={ownerName}>{ownerName}</span>
                        </div>
                        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
                          <span className="font-bold text-slate-200 eimzo-modal-details-label">{t('eimzoValidityPeriod')}</span>
                          <span className="text-slate-300 eimzo-modal-details-value">{validity}</span>
                        </div>
                        <p className="mt-2 truncate border-t border-slate-700/70 pt-2 text-xs text-slate-500 eimzo-modal-details-path" title={formatEimzoKeyLocation(selectedEimzoKey)}>
                          {formatEimzoKeyLocation(selectedEimzoKey)}
                        </p>
                      </div>
                    </div>
                  );
                })()
              ) : null}

              {eimzoBindError ? (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
                  {eimzoBindError}
                  {isEimzoApiKeyErrorMessage(eimzoBindError) ? (
                    <a
                      href={getEimzoLocalhostUrl()}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-500/20"
                    >
                      {t('eimzoOpenLocalhost')}
                    </a>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-6">
                <button
                  type="submit"
                  disabled={!selectedEimzoKey || isLoadingEimzoKeys || isBindingEimzo || Boolean(eimzoBindSuccess)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-blue-950/30 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                >
                  {isBindingEimzo ? t('eimzoBinding') : eimzoBindSuccess ? t('eimzoClosing') : t('eimzoBindButton')}
                </button>
              </div>
                </>
              )}
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
