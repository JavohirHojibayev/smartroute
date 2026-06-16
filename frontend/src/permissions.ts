export type AppRole = 'admin' | 'dispatcher' | 'manager' | 'user';
export type PermissionLevel = 'none' | 'read' | 'full';
export type PermissionSelection = PermissionLevel[];

export type PermissionModule =
  | 'dashboard'
  | 'access'
  | 'medical'
  | 'shiftSchedule'
  | 'fleet'
  | 'drivers'
  | 'waybills'
  | 'tracking'
  | 'mechanic'
  | 'fuel'
  | 'cargo'
  | 'settings'
  ;

export type PermissionMap = Record<PermissionModule, PermissionSelection>;
export type EffectivePermissionMap = Record<PermissionModule, PermissionLevel>;

export const PERMISSION_MODULES: PermissionModule[] = [
  'dashboard',
  'access',
  'medical',
  'shiftSchedule',
  'fleet',
  'drivers',
  'waybills',
  'tracking',
  'mechanic',
  'fuel',
  'cargo',
  'settings',
  
];

const ROLE_ENABLED_MODULES: Record<AppRole, PermissionModule[]> = {
  admin: [...PERMISSION_MODULES],
  dispatcher: ['dashboard', 'access', 'medical', 'shiftSchedule', 'fleet', 'drivers', 'waybills', 'tracking', 'cargo'],
  manager: ['dashboard', 'fleet', 'fuel', 'cargo'],
  user: ['dashboard', 'fleet', 'waybills', 'tracking'],
};
const PERMISSION_LEVELS: PermissionLevel[] = ['none', 'read', 'full'];

const pickSinglePermissionLevel = (levels: Iterable<PermissionLevel>): PermissionLevel => {
  const selected = new Set(levels);
  if (selected.has('full')) return 'full';
  if (selected.has('read')) return 'read';
  return 'none';
};

const normalizeLevel = (value: unknown): PermissionLevel | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'none' || normalized === 'read' || normalized === 'full') {
    return normalized;
  }
  return null;
};

export const normalizePermissionSelection = (
  value: unknown,
  fallback: PermissionSelection = ['none'],
): PermissionSelection => {
  const tokens: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[+,]/g)
      : [value];

  const selected = new Set<PermissionLevel>();
  for (const token of tokens) {
    const normalized = normalizeLevel(token);
    if (normalized) {
      selected.add(normalized);
    }
  }

  if (selected.size === 0) {
    return [pickSinglePermissionLevel(fallback)];
  }

  return [pickSinglePermissionLevel(PERMISSION_LEVELS.filter((level) => selected.has(level)))];
};

export const buildRoleDefaultPermissions = (role: AppRole): PermissionMap => {
  const enabled = new Set<PermissionModule>(ROLE_ENABLED_MODULES[role] ?? []);
  return PERMISSION_MODULES.reduce((acc, moduleKey) => {
    acc[moduleKey] = enabled.has(moduleKey) ? ['full'] : ['none'];
    return acc;
  }, {} as PermissionMap);
};

export const normalizePermissionMap = (value: unknown, role: AppRole): PermissionMap => {
  const fallback = buildRoleDefaultPermissions(role);
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw = value as Record<string, unknown>;
  const merged = { ...fallback };
  for (const moduleKey of PERMISSION_MODULES) {
    merged[moduleKey] = normalizePermissionSelection(raw[moduleKey], fallback[moduleKey]);
  }

  return merged;
};

export const getEffectivePermissionLevel = (selection: PermissionSelection): PermissionLevel => {
  const selected = new Set(selection);
  if (selected.has('full')) return 'full';
  if (selected.has('read')) return 'read';
  return 'none';
};

export const toEffectivePermissionMap = (permissions: PermissionMap): EffectivePermissionMap =>
  PERMISSION_MODULES.reduce((acc, moduleKey) => {
    acc[moduleKey] = getEffectivePermissionLevel(permissions[moduleKey]);
    return acc;
  }, {} as EffectivePermissionMap);

export const canViewModule = (permissions: EffectivePermissionMap, moduleKey: PermissionModule): boolean =>
  permissions[moduleKey] !== 'none';

export const canEditModule = (permissions: EffectivePermissionMap, moduleKey: PermissionModule): boolean =>
  permissions[moduleKey] === 'full';
