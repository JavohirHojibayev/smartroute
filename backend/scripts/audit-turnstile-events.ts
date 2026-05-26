/**
 * Compares Hikvision ACS pass events with rows saved in access_logs.
 *
 * Usage from backend:
 *   npx ts-node scripts/audit-turnstile-events.ts --minutes=45
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

type AcsEventRow = {
  employeeNoString?: string;
  name?: string;
  time?: string;
  serialNo?: string;
  cardNo?: string;
  doorNo?: string;
  minor?: number | string;
  [key: string]: unknown;
};

type DeviceMapEntry = {
  key: string;
  deviceId: string;
  deviceName: string;
  eventType: string;
};

const { fetchLatestAcsEvents } = require('../src/hikvision/hikvision-acsevent-fetcher') as {
  fetchLatestAcsEvents: (params: {
    deviceIp: string;
    devicePort: number;
    username: string;
    password: string;
    start: Date;
    end: Date;
    maxResults: number;
  }) => Promise<AcsEventRow[]>;
};

const { getEffectiveTurnstileDeviceIpMap } = require('../src/turnstile-daily-access-kpis.util') as {
  getEffectiveTurnstileDeviceIpMap: () => Record<string, DeviceMapEntry>;
};

type DbRow = {
  id: number;
  device_id: string | null;
  device_name: string | null;
  event_type: string | null;
  person_name: string | null;
  face_id_hash: string | null;
  event_serial: string | null;
  access_time: string;
  source_ip: string | null;
  raw_name: string | null;
};

type ExpectedEvent = {
  ip: string;
  mapped: DeviceMapEntry;
  row: AcsEventRow;
  timeMs: number;
  serial: string;
  employeeNo: string;
  normalizedEmployeeNo: string;
  name: string;
};

function getArgNumber(name: string, envName: string, fallback: number): number {
  const prefix = `--${name}=`;
  const fromArg = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const raw = fromArg ?? process.env[envName] ?? '';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.some((arg) => arg === `--${name}`);
}

function normalizeWhitespace(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeExternalId(value: unknown): string {
  const raw = normalizeWhitespace(value);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) {
    const stripped = raw.replace(/^0+/, '');
    return stripped || '0';
  }
  return raw;
}

function normalizePersonName(value: unknown): string {
  return normalizeWhitespace(value).replace(/'{2,}/g, "'").replace(/"{2,}/g, '"').trim();
}

function normalizeUnicodeFold(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\u2019\u2018\u02bc`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function looksLikeMojibake(value: unknown): boolean {
  const name = normalizePersonName(value);
  return !!name && (/[�]/.test(name) || /(Ð|Ñ|Ã|Â)/.test(name) || /(?:Р.|С.){3,}/.test(name));
}

function isFallbackIdName(value: unknown): boolean {
  return /^ID-\d+$/i.test(normalizeWhitespace(value));
}

function isLikelyValidPersonName(value: unknown): boolean {
  const name = normalizePersonName(value);
  if (!name || isFallbackIdName(name) || looksLikeMojibake(name)) return false;
  const tokens = name.split(' ').filter(Boolean);
  return tokens.length >= 2 && /[\p{L}]/u.test(name);
}

function normalizeIp(value: unknown): string {
  return normalizeWhitespace(value).replace(/^::ffff:/i, '');
}

function isMineDevice(mapped: DeviceMapEntry): boolean {
  const key = normalizeWhitespace(mapped?.key).toLowerCase();
  const id = normalizeWhitespace(mapped?.deviceId).toUpperCase();
  const name = normalizeWhitespace(mapped?.deviceName).toLowerCase();
  return (
    key.includes('mine') ||
    key.includes('shaxta') ||
    key.includes('shahta') ||
    id.includes('MINE') ||
    name.includes('shaxta') ||
    name.includes('shahta')
  );
}

function resolveDbPath(): string {
  const fromEnv = normalizeWhitespace(process.env.SQLITE_DATABASE ?? process.env.DB_PATH);
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const defaultSqlite = path.join(__dirname, '..', 'database.sqlite');
  if (fs.existsSync(defaultSqlite)) return defaultSqlite;
  throw new Error(`SQLite database not found: ${defaultSqlite}`);
}

function queryAll<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runSql(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(this: sqlite3.RunResult, err: Error | null) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function closeDb(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function configuredDeviceIps(deviceMap: Record<string, DeviceMapEntry>): string[] {
  const raw = normalizeWhitespace(process.env.HIKVISION_POLLER_DEVICE_IPS);
  const ips = raw
    ? raw.split(/[,;]/g).map((ip) => normalizeIp(ip)).filter(Boolean)
    : Object.keys(deviceMap);
  return Array.from(new Set(ips)).filter((ip) => !!deviceMap[ip]);
}

function rowSourceIp(row: DbRow): string {
  return normalizeIp(row.source_ip);
}

function parseDbAccessTimeMs(value: string): number {
  const raw = normalizeWhitespace(value);
  if (!raw) return Number.NaN;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) return new Date(raw).getTime();
  return new Date(`${raw.replace(' ', 'T')}Z`).getTime();
}

function twoTokenLowerPrefix(value: unknown): string {
  const parts = normalizeUnicodeFold(value).split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : '';
}

function namesCompatible(a: unknown, b: unknown): boolean {
  const na = normalizeUnicodeFold(a);
  const nb = normalizeUnicodeFold(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = twoTokenLowerPrefix(na);
  const tb = twoTokenLowerPrefix(nb);
  return (!!ta && !!tb && ta === tb) || na.startsWith(`${nb} `) || nb.startsWith(`${na} `);
}

function eventMatchesRow(event: ExpectedEvent, row: DbRow): boolean {
  if (row.device_id !== event.mapped.deviceId) return false;
  if (event.serial && normalizeWhitespace(row.event_serial) === event.serial) return true;

  const rowTime = parseDbAccessTimeMs(row.access_time);
  if (!Number.isFinite(rowTime) || Math.abs(rowTime - event.timeMs) > 3000) return false;

  const rowIdentity = normalizeExternalId(row.face_id_hash);
  if (event.normalizedEmployeeNo && rowIdentity && rowIdentity === event.normalizedEmployeeNo) return true;

  const rowName = normalizePersonName(row.person_name).toLowerCase();
  return !!event.name && !!rowName && rowName === event.name.toLowerCase();
}

function formatTime(ms: number): string {
  return new Date(ms).toISOString();
}

async function main(): Promise<void> {
  const minutes = getArgNumber('minutes', 'AUDIT_MINUTES', 45);
  const maxPerDevice = getArgNumber('max-per-device', 'AUDIT_MAX_PER_DEVICE', 200);
  const port = getArgNumber('device-port', 'HIKVISION_POLLER_DEVICE_PORT', 80);
  const fixNames = hasFlag('fix-names');
  const username = normalizeWhitespace(process.env.HIKVISION_POLLER_USERNAME);
  const password = normalizeWhitespace(process.env.HIKVISION_POLLER_PASSWORD);
  if (!username || !password) {
    throw new Error('HIKVISION_POLLER_USERNAME/HIKVISION_POLLER_PASSWORD must be set.');
  }

  const deviceMap = getEffectiveTurnstileDeviceIpMap();
  const ips = configuredDeviceIps(deviceMap);
  if (ips.length === 0) {
    throw new Error('No Hikvision devices are configured.');
  }

  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);

  const perDevice = await Promise.all(
    ips.map(async (ip) => {
      const mapped = deviceMap[ip];
      try {
        const rows = await fetchLatestAcsEvents({
          deviceIp: ip,
          devicePort: port,
          username,
          password,
          start,
          end,
          maxResults: maxPerDevice,
        });
        return { ip, mapped, rows, error: null as string | null };
      } catch (error) {
        return { ip, mapped, rows: [] as AcsEventRow[], error: String((error as Error)?.message ?? error) };
      }
    }),
  );

  const expected: ExpectedEvent[] = [];
  const ignored = {
    nonPassMinor: 0,
    invalidName: 0,
    mineMissingEmployeeNo: 0,
    badTime: 0,
  };

  for (const item of perDevice) {
    for (const row of item.rows) {
      const minor = Number.parseInt(String(row?.minor ?? ''), 10);
      if (!Number.isFinite(minor) || minor !== 75) {
        ignored.nonPassMinor += 1;
        continue;
      }

      const timeMs = new Date(String(row?.time ?? '')).getTime();
      if (!Number.isFinite(timeMs)) {
        ignored.badTime += 1;
        continue;
      }

      const employeeNo = normalizeWhitespace(row?.employeeNoString);
      if (isMineDevice(item.mapped) && !employeeNo) {
        ignored.mineMissingEmployeeNo += 1;
        continue;
      }

      const name = normalizePersonName(row?.name);
      if (!isLikelyValidPersonName(name)) {
        ignored.invalidName += 1;
        continue;
      }

      expected.push({
        ip: item.ip,
        mapped: item.mapped,
        row,
        timeMs,
        serial: normalizeWhitespace(row?.serialNo),
        employeeNo,
        normalizedEmployeeNo: normalizeExternalId(employeeNo),
        name,
      });
    }
  }

  const db = new sqlite3.Database(resolveDbPath());
  try {
    const rows = await queryAll<DbRow>(
      db,
      `
      SELECT
        id,
        device_id,
        device_name,
        event_type,
        person_name,
        face_id_hash,
        event_serial,
        access_time,
        COALESCE(
          json_extract(raw_payload, '$.sourcePhysicalIp'),
          json_extract(raw_payload, '$.sourcePayloadIp'),
          json_extract(raw_payload, '$.ipAddress')
        ) AS source_ip,
        COALESCE(
          json_extract(raw_payload, '$.employeeName'),
          json_extract(raw_payload, '$.personName'),
          json_extract(raw_payload, '$.fullName'),
          json_extract(raw_payload, '$.rawObject.AccessControllerEvent.name')
        ) AS raw_name
      FROM access_logs
      WHERE datetime(access_time) >= datetime(?)
        AND datetime(access_time) <= datetime(?)
      ORDER BY access_time ASC, id ASC
      `,
      [start.toISOString(), new Date(end.getTime() + 5 * 60 * 1000).toISOString()],
    );

    const missing = expected.filter((event) => !rows.some((row) => eventMatchesRow(event, row)));
    const wrongDeviceRows = rows.filter((row) => {
      const ip = rowSourceIp(row);
      if (!ip || !deviceMap[ip]) return false;
      return row.device_id !== deviceMap[ip].deviceId;
    });
    const fixableNameRows = rows.filter((row) => {
      if (!isLikelyValidPersonName(row.raw_name)) return false;
      return !namesCompatible(row.person_name, row.raw_name);
    });
    const legacyInvalidRawNameRows = rows.filter((row) => {
      return !isLikelyValidPersonName(row.person_name) && !isLikelyValidPersonName(row.raw_name);
    });
    let fixedNameRows = 0;
    let fixedIdentities = 0;
    if (fixNames) {
      for (const row of fixableNameRows) {
        fixedNameRows += await runSql(db, 'UPDATE access_logs SET person_name = ? WHERE id = ?', [
          normalizePersonName(row.raw_name),
          row.id,
        ]);
        const externalId = normalizeExternalId(row.face_id_hash);
        if (externalId) {
          fixedIdentities += await runSql(
            db,
            "UPDATE turnstile_identities SET full_name = ?, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE external_id = ? AND LOWER(TRIM(full_name)) <> LOWER(TRIM(?))",
            [normalizePersonName(row.raw_name), externalId, normalizePersonName(row.raw_name)],
          );
        }
      }
    }

    const summary = {
      windowMinutes: minutes,
      devices: perDevice.map((item) => ({
        ip: item.ip,
        deviceId: item.mapped.deviceId,
        deviceName: item.mapped.deviceName,
        fetchedRows: item.rows.length,
        error: item.error,
      })),
      expectedPassEvents: expected.length,
      savedRowsInWindow: rows.length,
      missingExpectedEvents: missing.length,
      wrongDeviceRows: wrongDeviceRows.length,
      fixableNameRows: fixableNameRows.length,
      legacyInvalidRawNameRows: legacyInvalidRawNameRows.length,
      fixedNameRows,
      fixedIdentities,
      ignored,
      sampleMissing: missing.slice(0, 20).map((event) => ({
        ip: event.ip,
        deviceId: event.mapped.deviceId,
        deviceName: event.mapped.deviceName,
        time: formatTime(event.timeMs),
        employeeNo: event.employeeNo,
        name: event.name,
        serialNo: event.serial,
      })),
      sampleWrongDeviceRows: wrongDeviceRows.slice(0, 20).map((row) => ({
        id: row.id,
        sourceIp: rowSourceIp(row),
        expectedDeviceId: deviceMap[rowSourceIp(row)]?.deviceId,
        savedDeviceId: row.device_id,
        savedDeviceName: row.device_name,
        time: row.access_time,
        name: row.person_name,
      })),
      sampleLegacyInvalidRawNameRows: legacyInvalidRawNameRows.slice(0, 20).map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        deviceName: row.device_name,
        time: row.access_time,
        name: row.person_name,
        serialNo: row.event_serial,
      })),
      sampleFixableNameRows: fixableNameRows.slice(0, 20).map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        deviceName: row.device_name,
        time: row.access_time,
        savedName: row.person_name,
        rawName: row.raw_name,
        employeeNo: row.face_id_hash,
        serialNo: row.event_serial,
      })),
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));

    if (
      missing.length ||
      wrongDeviceRows.length ||
      fixableNameRows.length ||
      perDevice.some((item) => item.error)
    ) {
      process.exitCode = 2;
    }
  } finally {
    await closeDb(db);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
