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
} from 'lucide-react';
import { useI18n } from '../i18n';
import { resolveApiBaseUrl } from '../utils/apiBase';
import {
  type PermissionLevel,
  type PermissionMap,
  type PermissionModule,
  buildRoleDefaultPermissions,
  getEffectivePermissionLevel,
  normalizePermissionMap,
  normalizePermissionSelection,
} from '../permissions';

type RoleKey = 'admin' | 'dispatcher' | 'user' | 'manager';
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
  createdAt: string;
};

type UserFormState = {
  username: string;
  fullName: string;
  email: string;
  role: RoleKey;
  status: StatusKey;
  password: string;
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
  { id: 'shiftSchedule', labelKey: 'shiftSchedule' },
  { id: 'fleet', labelKey: 'fleet' },
  { id: 'drivers', labelKey: 'drivers' },
  { id: 'waybills', labelKey: 'waybills' },
  { id: 'tracking', labelKey: 'liveTracking' },
  { id: 'mechanic', labelKey: 'vehicleInspections' },
  { id: 'fuel', labelKey: 'fuel' },
  { id: 'cargo', labelKey: 'cargoStats' },
  { id: 'settings', labelKey: 'settings' },
  { id: 'mobile', labelKey: 'mobileApp' },
];

const createInitialForm = (): UserFormState => ({
  username: '',
  fullName: '',
  email: '',
  role: 'user',
  status: 'active',
  password: '',
});

const createRolePermissionState = (): Record<RoleKey, PermissionMap> => ({
  admin: buildRoleDefaultPermissions('admin'),
  dispatcher: buildRoleDefaultPermissions('dispatcher'),
  manager: buildRoleDefaultPermissions('manager'),
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

  const roleItems = useMemo(() => ['admin', 'dispatcher', 'manager', 'user'] as const, []);
  const canManage = accessLevel === 'full';

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
        if (roleRaw === 'admin' || roleRaw === 'dispatcher' || roleRaw === 'manager' || roleRaw === 'user') {
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
      const permissions = normalizePermissionMap(payload?.permissions ?? selectedRolePermissions, selectedRole);
      if (roleRaw === 'admin' || roleRaw === 'dispatcher' || roleRaw === 'manager' || roleRaw === 'user') {
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
    if (role === 'manager') return 'bg-cyan-500/10 text-cyan-400';
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
                    <th className="px-6 py-4 text-right pr-8">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {isLoadingUsers ? (
                    <tr>
                      <td className="px-6 py-10 text-sm text-slate-500" colSpan={5}>Yuklanmoqda...</td>
                    </tr>
                  ) : userLoadError ? (
                    <tr>
                      <td className="px-6 py-10 text-sm text-red-400" colSpan={5}>{userLoadError}</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td className="px-6 py-10 text-sm text-slate-500" colSpan={5}>Foydalanuvchi topilmadi</td>
                    </tr>
                  ) : users.map((user) => {
                    const displayName = user.fullName || user.username;
                    const canDelete = canManage && user.id !== currentUserId && user.username.toLowerCase() !== SUPERADMIN_USERNAME;

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
                              <p className="text-sm font-bold text-white">{displayName}</p>
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
                            <span className="text-sm text-slate-300 capitalize">{user.status}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {formatLastActive(user)}
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
                      const rowAccentClass =
                        currentAccess === 'full'
                          ? 'border-emerald-500/40'
                          : currentAccess === 'read'
                            ? 'border-blue-500/40'
                            : 'border-slate-600/40';
                      return (
                        <div key={mod.id} className={`flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-4 rounded-2xl transition-all border border-transparent hover:border-slate-700/50 border-l-2 ${rowAccentClass} ${currentAccess === 'none' ? 'hover:bg-slate-800/30' : 'bg-slate-800/30 hover:bg-slate-800/50'}`}>
                          <div className="flex items-center gap-3 md:gap-4 min-w-0">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-sm font-medium text-slate-200 break-words">{t(mod.labelKey as any)}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 w-full md:w-auto md:flex md:gap-2">
                            {(['none', 'read', 'full'] as const).map((access) => {
                              const isActive = currentSelection.includes(access);
                              const activeClass =
                                access === 'full'
                                  ? 'text-emerald-300 border-emerald-400/50 bg-emerald-500/20 shadow-[0_0_16px_rgba(16,185,129,0.42)]'
                                  : access === 'read'
                                    ? 'text-blue-300 border-blue-400/50 bg-blue-500/20 shadow-[0_0_16px_rgba(59,130,246,0.42)]'
                                    : 'text-slate-200 border-slate-500/60 bg-slate-700/50 shadow-[0_0_12px_rgba(148,163,184,0.34)]';

                              const inactiveClass =
                                access === 'full'
                                  ? 'text-emerald-300 border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/15'
                                  : access === 'read'
                                    ? 'text-blue-300 border-blue-500/25 bg-blue-500/5 hover:bg-blue-500/15'
                                    : 'text-slate-400 border-slate-700/60 bg-slate-900/40 hover:bg-slate-700/40';
                              return (
                                <button
                                  key={access}
                                  type="button"
                                  disabled={!canManage}
                                  onClick={() => updateRoleAccess(mod.id, access)}
                                  className={`w-full md:min-w-[68px] px-2 md:px-4 py-2 md:py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all disabled:opacity-45 disabled:cursor-not-allowed ${isActive ? activeClass : inactiveClass}`}
                                >
                                  <span className="inline-flex items-center justify-center gap-1">
                                    {access}
                                    {isActive ? <span className="text-[11px] leading-none">✓</span> : null}
                                  </span>
                                </button>
                              );
                            })}
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
    </div>
  );
};
