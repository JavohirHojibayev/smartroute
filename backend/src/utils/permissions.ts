import { UserRole } from '../entities/user.entity';

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
  | 'mobile';

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
  'mobile',
];
const PERMISSION_LEVELS: PermissionLevel[] = ['none', 'read', 'full'];

const pickSinglePermissionLevel = (levels: Iterable<PermissionLevel>): PermissionLevel => {
  const selected = new Set(levels);
  if (selected.has('full')) return 'full';
  if (selected.has('read')) return 'read';
  return 'none';
};

const ROLE_ENABLED_MODULES: Record<UserRole, PermissionModule[]> = {
  [UserRole.ADMIN]: [...PERMISSION_MODULES],
  [UserRole.DISPATCHER]: [
    'dashboard',
    'access',
    'medical',
    'shiftSchedule',
    'fleet',
    'drivers',
    'waybills',
    'tracking',
    'cargo',
    'mobile',
  ],
  [UserRole.MANAGER]: ['dashboard', 'fleet', 'fuel', 'cargo'],
  [UserRole.USER]: ['dashboard', 'fleet', 'waybills', 'tracking'],
};

const normalizePermissionSelection = (
  value: unknown,
  fallback: PermissionSelection,
): PermissionSelection => {
  const candidates: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[+,]/g)
      : [value];

  const selected = new Set<PermissionLevel>();
  for (const candidate of candidates) {
    const normalized = normalizePermissionLevel(candidate);
    if (normalized) {
      selected.add(normalized);
    }
  }

  if (selected.size === 0) {
    return [pickSinglePermissionLevel(fallback)];
  }

  return [pickSinglePermissionLevel(PERMISSION_LEVELS.filter((level) => selected.has(level)))];
};

const normalizePermissionLevel = (value: unknown): PermissionLevel | null => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'none' || raw === 'read' || raw === 'full') {
    return raw;
  }
  return null;
};

export const buildRoleDefaultPermissions = (role: UserRole): PermissionMap => {
  const enabled = new Set<PermissionModule>(ROLE_ENABLED_MODULES[role] ?? []);
  return PERMISSION_MODULES.reduce((acc, moduleKey) => {
    acc[moduleKey] = enabled.has(moduleKey) ? ['full'] : ['none'];
    return acc;
  }, {} as PermissionMap);
};

export const buildFullPermissions = (): PermissionMap =>
  PERMISSION_MODULES.reduce((acc, moduleKey) => {
    acc[moduleKey] = ['full'];
    return acc;
  }, {} as PermissionMap);

export const sanitizePermissionMap = (value: unknown, fallbackRole: UserRole): PermissionMap => {
  const fallback = buildRoleDefaultPermissions(fallbackRole);
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw = value as Record<string, unknown>;
  const next = { ...fallback };
  for (const moduleKey of PERMISSION_MODULES) {
    next[moduleKey] = normalizePermissionSelection(raw[moduleKey], fallback[moduleKey]);
  }

  return next;
};

export const toEffectivePermissionMap = (map: PermissionMap): EffectivePermissionMap =>
  PERMISSION_MODULES.reduce((acc, moduleKey) => {
    const selected = new Set(map[moduleKey] ?? []);
    if (selected.has('full')) {
      acc[moduleKey] = 'full';
    } else if (selected.has('read')) {
      acc[moduleKey] = 'read';
    } else {
      acc[moduleKey] = 'none';
    }
    return acc;
  }, {} as EffectivePermissionMap);
