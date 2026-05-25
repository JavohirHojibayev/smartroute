/**
 * Turniket "bugungi kirish/chiqish" va `flagged` вЂ” dashboard/overview va
 * GET /integrations/hikvision/summary uchun bitta hisoblash mantiqasi.
 * `getEffectiveTurnstileDeviceIpMap`: `HIKVISION_DEVICE_IP_MAP` + `HIKVISION_EXTRA_DEVICE_MAP`.
 */
import {
  getAccessControllerEventFromPayload,
  getLenientAcsMinor,
  getStrictAcsMinorOnly,
  isMineShahtaFromStoredDevices,
  readTurnstileNoiseEnvFromProcess,
  shouldIgnoreHikvisionTurnstilePayload,
} from './hikvision/hikvision-access-event-filter';
import { CheckStatus } from './medical.entity';
import type { AccessLog } from './integrations.module';

export type HikvisionEventType = 'entrance' | 'exit';

export type TurnstileDeviceMapEntry = {
  key: string;
  deviceId: string;
  deviceName: string;
  eventType: HikvisionEventType;
};

export const TURNSTILE_DEVICE_IP_MAP: Record<string, TurnstileDeviceMapEntry> = parseDeviceMapFromEnv(
  process.env.HIKVISION_DEVICE_IP_MAP,
);

let cachedEffectiveDeviceIpMap: Record<string, TurnstileDeviceMapEntry> | null = null;

/** Shaxta segmenti IP xaritasi local env orqali beriladi. */
const BUILTIN_MINE_SHAHTA_BY_IP: Record<string, TurnstileDeviceMapEntry> = {};

function parseDeviceMapFromEnv(value: unknown): Record<string, TurnstileDeviceMapEntry> {
  const raw = String(value ?? '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, TurnstileDeviceMapEntry> = {};
    for (const [ip, entry] of Object.entries(parsed as Record<string, unknown>)) {
      const cleanIp = String(ip ?? '').trim();
      if (!cleanIp || !entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const key = String(e.key ?? '').trim();
      const deviceId = String(e.deviceId ?? e.device_id ?? '').trim();
      const deviceName = String(e.deviceName ?? e.device_name ?? '').trim();
      const et = String(e.eventType ?? e.event_type ?? 'entrance').toLowerCase();
      const eventType: HikvisionEventType = et === 'exit' ? 'exit' : 'entrance';
      if (!key || !deviceId || !deviceName) continue;
      out[cleanIp] = { key, deviceId, deviceName, eventType };
    }
    return out;
  } catch {
    return {};
  }
}

function parseExtraDeviceMapFromEnv(): Record<string, TurnstileDeviceMapEntry> {
  return parseDeviceMapFromEnv(process.env.HIKVISION_EXTRA_DEVICE_MAP);
}

/** Asosiy xarita + ixtiyoriy shaxta + `HIKVISION_EXTRA_DEVICE_MAP` (bir xil IP boвЂlsa asosiy `TURNSTILE_DEVICE_IP_MAP` ustun). */
export function getEffectiveTurnstileDeviceIpMap(): Record<string, TurnstileDeviceMapEntry> {
  if (!cachedEffectiveDeviceIpMap) {
    const extra = parseExtraDeviceMapFromEnv();
    const useBuiltinMine =
      String(process.env.HIKVISION_BUILTIN_MINE_SHAHTA_DEVICES ?? 'true').toLowerCase() !== 'false';
    const builtin = useBuiltinMine ? BUILTIN_MINE_SHAHTA_BY_IP : {};
    cachedEffectiveDeviceIpMap = { ...builtin, ...extra, ...TURNSTILE_DEVICE_IP_MAP };
  }
  return cachedEffectiveDeviceIpMap;
}

export function getAccessKpisTashkentDayBounds(): { dayKey: string; start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';

  const dayKey = `${year}-${month}-${day}`;
  const start = new Date(`${dayKey}T00:00:00+05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { dayKey, start, end };
}

function readKpiEnv() {
  const noise = readTurnstileNoiseEnvFromProcess();
  return {
    ...noise,
    dedupSeconds: Math.max(Number.parseInt(process.env.HIKVISION_DEDUP_SECONDS ?? '30', 10) || 30, 1),
    pairDedupSeconds: Math.max(Number.parseInt(process.env.HIKVISION_PAIR_DEDUP_SECONDS ?? '12', 10) || 12, 1),
    crossDeviceDedupSeconds: Math.max(Number.parseInt(process.env.HIKVISION_CROSS_DEVICE_DEDUP_SECONDS ?? '90', 10) || 90, 1),
  };
}

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\t+/g, ' ').trim();
}

function normalizePersonName(value: string | null | undefined): string {
  const raw = normalizeWhitespace(value);
  if (!raw) return '';
  return raw
    .replace(/'{2,}/g, "'")
    .replace(/"{2,}/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeExternalId(value: string | null | undefined): string {
  const raw = normalizeWhitespace(value);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) {
    const stripped = raw.replace(/^0+/, '');
    return stripped || '0';
  }
  return raw;
}

function normalizeIp(value: any): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim() ?? '';
  const cleaned = first.replace(/^::ffff:/i, '').trim();
  if (!cleaned) return null;
  return cleaned;
}

function parseRawPayload(rawPayload: any): any {
  if (!rawPayload) return null;
  if (typeof rawPayload === 'object') return rawPayload;
  if (typeof rawPayload !== 'string') return null;
  try {
    return JSON.parse(rawPayload);
  } catch {
    return null;
  }
}

function detectEventTypeFromSourceText(value: string | null | undefined): HikvisionEventType | null {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return null;
  if (/\b(exit|leave|chiq|chiqish|vyhod|РІС‹С…РѕРґ)\b/i.test(source)) return 'exit';
  if (/\b(entrance|entry|kirish|vhod|РІС…РѕРґ)\b/i.test(source)) return 'entrance';
  return null;
}

function resolveDeviceIp(
  deviceId: string | null | undefined,
  deviceName: string | null | undefined,
  rawPayload: any,
): string | null {
  const parsed = parseRawPayload(rawPayload);
  const payloadIp = normalizeIp(
    parsed?.sourcePayloadIp ?? parsed?.ipAddress ?? parsed?.deviceIp ?? parsed?.host,
  );
  if (payloadIp) return payloadIp;

  const normalizedId = normalizeWhitespace(deviceId).toUpperCase();
  const normalizedName = normalizeWhitespace(deviceName).toUpperCase();
  if (!normalizedId && !normalizedName) return null;

  for (const [ip, mapped] of Object.entries(getEffectiveTurnstileDeviceIpMap())) {
    const mappedId = normalizeWhitespace(mapped.deviceId).toUpperCase();
    const mappedName = normalizeWhitespace(mapped.deviceName).toUpperCase();
    if ((normalizedId && mappedId === normalizedId) || (normalizedName && mappedName === normalizedName)) {
      return ip;
    }
  }

  return null;
}

export function resolveTurnstileMovementType(row: AccessLog): HikvisionEventType {
  return resolveNormalizedEventType(row.event_type, row.device_id, row.device_name, row.raw_payload);
}

function resolveNormalizedEventType(
  eventType: string | null | undefined,
  deviceId: string | null | undefined,
  deviceName: string | null | undefined,
  rawPayload: any,
): HikvisionEventType {
  const explicit = detectEventTypeFromSourceText(eventType);
  if (explicit) return explicit;

  const deviceHint = detectEventTypeFromSourceText(`${normalizeWhitespace(deviceId)} ${normalizeWhitespace(deviceName)}`);
  if (deviceHint) return deviceHint;

  const ip = resolveDeviceIp(deviceId, deviceName, rawPayload);
  const ipMapped = ip ? getEffectiveTurnstileDeviceIpMap()[ip]?.eventType : null;
  if (ipMapped) return ipMapped;

  return 'entrance';
}

function shouldIgnoreNoisyReaderEvent(payload: any, row: AccessLog): { ignore: boolean; reason?: string } {
  const isMine = isMineShahtaFromStoredDevices(row.device_id, row.device_name);
  return shouldIgnoreHikvisionTurnstilePayload(payload, isMine, readTurnstileNoiseEnvFromProcess());
}

function shouldIgnoreStoredLogRow(row: AccessLog): boolean {
  const payload = parseRawPayload(row.raw_payload);
  if (!payload) return false;
  return shouldIgnoreNoisyReaderEvent(payload, row).ignore;
}

function hasSuccessfulAcsMinorFromStored(row: AccessLog): boolean {
  const env = readTurnstileNoiseEnvFromProcess();
  if (!env.requireMinor75) return true;
  const payload = parseRawPayload(row.raw_payload);
  if (!payload) return true;
  const accessEvent = getAccessControllerEventFromPayload(payload);
  const isMine = isMineShahtaFromStoredDevices(row.device_id, row.device_name);
  if (isMine && env.shahtaStrictMinor) {
    return getStrictAcsMinorOnly(payload, accessEvent) === 75;
  }
  return getLenientAcsMinor(payload, accessEvent) === 75;
}

function isFallbackIdName(value: string | null | undefined): boolean {
  return /^ID-\d+$/i.test(normalizeWhitespace(value));
}

function extractIdFromFallbackName(value: string | null | undefined): string {
  const raw = normalizeWhitespace(value);
  const match = raw.match(/^ID-(\d+)$/i);
  return match?.[1] ?? '';
}

function extractLaneKey(deviceId: string | null | undefined, deviceName: string | null | undefined): string {
  const source = `${normalizeWhitespace(deviceId)} ${normalizeWhitespace(deviceName)}`.toUpperCase();
  const idMatch = source.match(/\b(?:IN|OUT|KIRISH|CHIQISH)[-_ ]?(\d+)\b/i);
  return idMatch?.[1] ?? '';
}

function toUnixSeconds(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const timeMs = new Date(value).getTime();
  if (!Number.isFinite(timeMs)) return null;
  return Math.floor(timeMs / 1000);
}

function buildIdentityKey(payload: {
  faceIdHash?: string | null;
  personName?: string | null;
  driverName?: string | null;
}): string {
  const normalizedPersonName = normalizeWhitespace(payload.driverName ?? payload.personName);
  if (normalizedPersonName && !isFallbackIdName(normalizedPersonName)) {
    return `name:${normalizedPersonName.toLowerCase()}`;
  }

  const normalizedFaceId = normalizeExternalId(payload.faceIdHash);
  if (normalizedFaceId) return `id:${normalizedFaceId}`;

  const fallbackId = extractIdFromFallbackName(normalizedPersonName);
  const normalizedFallbackId = normalizeExternalId(fallbackId);
  if (normalizedFallbackId) return `id:${normalizedFallbackId}`;

  return '';
}

export function dedupeRows(rows: AccessLog[]): AccessLog[] {
  if (rows.length <= 1) return rows;

  const { dedupSeconds, pairDedupSeconds, crossDeviceDedupSeconds } = readKpiEnv();
  const result: AccessLog[] = [];
  const recentByIdentity = new Map<string, AccessLog[]>();
  const maxWindowSeconds = Math.max(dedupSeconds, pairDedupSeconds, crossDeviceDedupSeconds);

  for (const row of rows) {
    const identityKey = buildIdentityKey({
      faceIdHash: row.face_id_hash,
      personName: row.person_name,
      driverName: row.driver?.full_name ?? null,
    });

    if (!identityKey) {
      result.push(row);
      continue;
    }

    const rowSeconds = toUnixSeconds(row.access_time);
    if (rowSeconds == null) {
      result.push(row);
      continue;
    }

    const rowLane = extractLaneKey(row.device_id, row.device_name);
    const rowTurnstile = normalizeWhitespace(row.device_id || row.device_name).toUpperCase();
    const rowEventType = resolveNormalizedEventType(row.event_type, row.device_id, row.device_name, row.raw_payload);
    const recentRows = recentByIdentity.get(identityKey) ?? [];
    let duplicate = false;

    for (const recentRow of recentRows) {
      const recentSeconds = toUnixSeconds(recentRow.access_time);
      if (recentSeconds == null) continue;
      const diff = Math.abs(rowSeconds - recentSeconds);
      const recentLane = extractLaneKey(recentRow.device_id, recentRow.device_name);
      const recentTurnstile = normalizeWhitespace(recentRow.device_id || recentRow.device_name).toUpperCase();
      const recentEventType = resolveNormalizedEventType(
        recentRow.event_type,
        recentRow.device_id,
        recentRow.device_name,
        recentRow.raw_payload,
      );
      const differentTurnstile =
        (!!rowTurnstile && !!recentTurnstile && rowTurnstile !== recentTurnstile) ||
        (!!rowLane && !!recentLane && rowLane !== recentLane);

      if (differentTurnstile && diff <= crossDeviceDedupSeconds) {
        duplicate = true;
        break;
      }

      if (rowEventType === recentEventType && diff <= dedupSeconds) {
        duplicate = true;
        break;
      }

      if (rowEventType !== recentEventType && diff <= pairDedupSeconds) {
        if (rowEventType === 'exit' && recentEventType === 'entrance') {
          const resultIndex = result.findIndex((item) => item.id === recentRow.id);
          if (resultIndex >= 0) {
            result[resultIndex] = row;
          }
          const recentIndex = recentRows.findIndex((item) => item.id === recentRow.id);
          if (recentIndex >= 0) {
            recentRows[recentIndex] = row;
          }
        }
        duplicate = true;
        break;
      }
    }

    if (duplicate) {
      continue;
    }

    result.push(row);
    recentRows.push(row);

    const filtered = recentRows.filter((recentRow) => {
      const recentSeconds = toUnixSeconds(recentRow.access_time);
      if (recentSeconds == null) return false;
      return Math.abs(rowSeconds - recentSeconds) <= maxWindowSeconds;
    });
    recentByIdentity.set(identityKey, filtered);
  }

  return result;
}

export type TurnstileDailyAccessKpis = {
  entrancesToday: number;
  exitsToday: number;
  flaggedToday: number;
  /** Dashboard telemetriya oynalari: dedupe qilingan haqiqiy oвЂtishlar */
  passMovementRowsDeduped: AccessLog[];
};

/**
 * @param accessRowsToday вЂ” `access_time` berilgan `bounds` oraligвЂidagi qatorlar (GET /summary jurnal sanalari bilan mos)
 * @param bounds вЂ” `start` inklyuziv, `end` eksklyuziv (`getAccessKpisTashkentDayBounds()` yoki jurnal oraligвЂi + 1 ms)
 */
export function computeTurnstileDailyAccessKpis(
  accessRowsToday: AccessLog[],
  bounds: { start: Date; end: Date },
): TurnstileDailyAccessKpis {
  const { start, end } = bounds;

  const strictlyTodayRows = accessRowsToday
    .filter((row) => {
      const rowMs = new Date(row.access_time).getTime();
      return !Number.isNaN(rowMs) && rowMs >= start.getTime() && rowMs < end.getTime();
    })
    .filter((row) => !shouldIgnoreStoredLogRow(row));

  const dedupedTodayRows = dedupeRows(strictlyTodayRows);
  const flaggedToday = dedupedTodayRows.filter((row) => row.status === CheckStatus.FAILED).length;

  const passRows = strictlyTodayRows.filter(
    (row) => row.status === CheckStatus.PASSED && hasSuccessfulAcsMinorFromStored(row),
  );
  const passMovementRowsDeduped = dedupeRows(passRows);

  const entrancesToday = passMovementRowsDeduped.filter((row) => resolveTurnstileMovementType(row) === 'entrance').length;
  const exitsToday = passMovementRowsDeduped.filter((row) => resolveTurnstileMovementType(row) === 'exit').length;

  return { entrancesToday, exitsToday, flaggedToday, passMovementRowsDeduped };
}
