/**
 * Hikvision turniket webhook / saqlangan jurnal uchun shovqin va soxta o‘tishlarni kesish.
 * Shaxta (mine) qurilmalarida uzoqdan yuz / ikkinchi o‘qlovchi / noto‘g‘ri `subEventType` sababli
 * `minor=75` bo‘lishi mumkin — bu yerda qat’iyroq qoidalar qo‘llanadi.
 */

export type HikvisionTurnstileNoiseEnv = {
  requireMinor75: boolean;
  verifyModeAllowlist: string[];
  /** Shaxtada `minor` faqat to‘g‘ridan-to‘g‘ri maydondan (subEventType fallback yo‘q). Default true. */
  shahtaStrictMinor: boolean;
  /** Bo‘sh = cheklovsiz. Masalan `1` yoki `1,2` — faqat shu cardReaderNo. */
  shahtaCardReaderAllowlist: number[];
  /**
   * Bo‘sh (null) — shaxta uchun ham global `verifyModeAllowlist` ishlatiladi.
   * To‘ldirilsa — faqat shaxta shu ro‘yxat bilan cheklanadi (masalan `face`).
   */
  shahtaVerifyModeAllowlist: string[] | null;
  /** Shaxta jurnalida bir xil xodim + turniket uchun minimal interval (sek). Default 60. */
  shahtaDedupSeconds: number;
};

function splitList(raw: string): string[] {
  return raw
    .split(/[,;]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function readTurnstileNoiseEnvFromProcess(): HikvisionTurnstileNoiseEnv {
  const verifyRaw = (process.env.HIKVISION_VERIFY_MODE_ALLOWLIST ?? '').trim();
  const verifyModeAllowlist = verifyRaw ? splitList(verifyRaw) : [];

  const shahtaVerifyRaw = (process.env.HIKVISION_SHAHTA_VERIFY_MODE_ALLOWLIST ?? '').trim();
  const shahtaVerifyModeAllowlist = shahtaVerifyRaw ? splitList(shahtaVerifyRaw) : null;

  const readerRaw = (process.env.HIKVISION_SHAHTA_CARD_READER_ALLOWLIST ?? '').trim();
  const shahtaCardReaderAllowlist = readerRaw
    ? readerRaw
        .split(/[,;]/g)
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n))
    : [];

  return {
    requireMinor75: String(process.env.HIKVISION_REQUIRE_MINOR_75 ?? 'true').toLowerCase() === 'true',
    verifyModeAllowlist,
    /** Default `true` — shaxtada soxta `minor=75` kamaytirish; yumshatish: `false`. */
    shahtaStrictMinor: String(process.env.HIKVISION_SHAHTA_STRICT_MINOR ?? 'true').toLowerCase() !== 'false',
    shahtaCardReaderAllowlist,
    shahtaVerifyModeAllowlist,
    shahtaDedupSeconds: Math.max(
      Number.parseInt(process.env.HIKVISION_SHAHTA_DEDUP_SECONDS ?? '60', 10) || 60,
      5,
    ),
  };
}

export function isMineShahtaFromStoredDevices(
  deviceId: string | null | undefined,
  deviceName: string | null | undefined,
): boolean {
  const id = String(deviceId ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\t+/g, ' ')
    .trim()
    .toUpperCase();
  if (id.includes('MINE')) return true;
  const dn = String(deviceName ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\t+/g, ' ')
    .trim()
    .toLowerCase();
  if (/\bshaxta\b/.test(dn) || /\bshahta\b/.test(dn) || /шахта/i.test(dn)) return true;
  return false;
}

export function getAccessControllerEventFromPayload(payload: any): Record<string, any> | null {
  if (!payload || typeof payload !== 'object') return null;
  const fromRaw = payload?.rawObject?.AccessControllerEvent;
  if (fromRaw && typeof fromRaw === 'object') return fromRaw as Record<string, any>;
  const direct = payload?.AccessControllerEvent;
  if (direct && typeof direct === 'object') return direct as Record<string, any>;
  return null;
}

function toOptionalNumber(value: any): number | null {
  if (value == null) return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePersonNameLite(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\t+/g, ' ')
    .trim();
}

/** ISAPI: `minor` — tafsilot kodi (75 = autentifikatsiyalangan o‘tish). */
export function getLenientAcsMinor(payload: any, accessEvent: Record<string, any> | null): number | null {
  const fromMinor = toOptionalNumber(accessEvent?.minor ?? payload?.minor);
  if (fromMinor != null) return fromMinor;
  return toOptionalNumber(accessEvent?.subEventType ?? payload?.subEventType);
}

export function getStrictAcsMinorOnly(payload: any, accessEvent: Record<string, any> | null): number | null {
  return toOptionalNumber(accessEvent?.minor ?? payload?.minor);
}

export function shouldIgnoreHikvisionTurnstilePayload(
  payload: any,
  isMineShahtaDevice: boolean,
  env: HikvisionTurnstileNoiseEnv,
): { ignore: boolean; reason?: string } {
  const accessEvent = getAccessControllerEventFromPayload(payload);

  const effectiveMinor = (() => {
    if (isMineShahtaDevice && env.shahtaStrictMinor) {
      return getStrictAcsMinorOnly(payload, accessEvent);
    }
    return getLenientAcsMinor(payload, accessEvent);
  })();

  if (env.requireMinor75 && effectiveMinor !== 75) {
    return {
      ignore: true,
      reason:
        effectiveMinor == null
          ? isMineShahtaDevice && env.shahtaStrictMinor
            ? 'shahta_missing_explicit_minor'
            : 'missing_acs_minor'
          : 'non_pass_acs_event',
    };
  }

  const verifyListForMine =
    isMineShahtaDevice && env.shahtaVerifyModeAllowlist && env.shahtaVerifyModeAllowlist.length > 0
      ? env.shahtaVerifyModeAllowlist
      : env.verifyModeAllowlist;

  if (verifyListForMine.length > 0) {
    const mode = String(
      accessEvent?.currentVerifyMode ??
        accessEvent?.verifyMode ??
        payload?.currentVerifyMode ??
        payload?.verifyMode ??
        '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (mode && !verifyListForMine.includes(mode)) {
      return {
        ignore: true,
        reason: isMineShahtaDevice && env.shahtaVerifyModeAllowlist?.length ? 'shahta_verify_mode_not_allowed' : 'verify_mode_not_allowed',
      };
    }
  }

  if (!accessEvent) return { ignore: false };

  const subEventType = toOptionalNumber(accessEvent?.subEventType);
  const cardReaderNo = toOptionalNumber(accessEvent?.cardReaderNo ?? payload?.cardReaderNo);
  const verifyMode = String(accessEvent?.currentVerifyMode ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const payloadName = normalizePersonNameLite(
    accessEvent?.name ?? payload?.employeeName ?? payload?.personName ?? payload?.fullName,
  );

  if (subEventType === 9 && cardReaderNo === 2 && (!payloadName || verifyMode === 'card')) {
    return { ignore: true, reason: 'secondary_reader_noise' };
  }

  if (isMineShahtaDevice && subEventType === 9 && cardReaderNo === 2) {
    return { ignore: true, reason: 'shahta_secondary_reader_noise' };
  }

  if (isMineShahtaDevice && env.shahtaCardReaderAllowlist.length > 0) {
    if (cardReaderNo == null || !env.shahtaCardReaderAllowlist.includes(cardReaderNo)) {
      return { ignore: true, reason: 'shahta_card_reader_not_allowed' };
    }
  }

  return { ignore: false };
}
