/**
 * READ-ONLY: Hikvision ISAPI AcsEvent qidiruvi (POST).
 * `curl --digest` ishlatiladi — `scripts/sync-turnstile-events.ps1` bilan bir xil ishonch.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type AcsEventRow = {
  employeeNoString?: string;
  name?: string;
  time?: string;
  serialNo?: string;
  cardNo?: string;
  doorNo?: string;
  minor?: number | string;
  [key: string]: unknown;
};

function curlBinary(): string {
  return process.platform === 'win32' ? 'curl.exe' : 'curl';
}

function formatTashkentIso(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+05:00`;
}

async function curlDigestPostJson(
  ip: string,
  port: number,
  username: string,
  password: string,
  body: object,
): Promise<string | null> {
  const tmp = path.join(os.tmpdir(), `sr-acs-${ip.replace(/\./g, '-')}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(body), 'utf8');

  const url = `http://${ip}:${port}/ISAPI/AccessControl/AcsEvent?format=json`;
  const args = [
    '-sS',
    '--connect-timeout',
    '2',
    '--max-time',
    '6',
    '--digest',
    '-u',
    `${username}:${password}`,
    '-H',
    'Content-Type: application/json',
    '-X',
    'POST',
    '--data-binary',
    `@${tmp}`,
    url,
  ];

  return await new Promise((resolve) => {
    const child = spawn(curlBinary(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf8');
    });
    child.stderr?.on('data', () => {
      /* curl progress/diag — yashirin */
    });
    child.on('error', () => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      resolve(null);
    });
    child.on('close', (code) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(stdout || null);
    });
  });
}

/**
 * Turniket qurilmasi soatini serverning Toshkent vaqti bilan millisekund darajasida sinxronlashtirish.
 */
export async function syncDeviceTime(params: {
  deviceIp: string;
  devicePort: number;
  username: string;
  password: string;
}): Promise<boolean> {
  const { deviceIp, devicePort, username, password } = params;
  const timeIso = formatTashkentIso(new Date());
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><timeMode>manual</timeMode><localTime>${timeIso}</localTime><timeZone>CST-5:00:00</timeZone></Time>`;
  const url = `http://${deviceIp}:${devicePort}/ISAPI/System/time`;
  const args = [
    '-sS',
    '--connect-timeout',
    '2',
    '--max-time',
    '4',
    '--digest',
    '-u',
    `${username}:${password}`,
    '-H',
    'Content-Type: application/xml',
    '-X',
    'PUT',
    '-d',
    xml,
    url,
  ];

  return await new Promise((resolve) => {
    const child = spawn(curlBinary(), args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf8');
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => {
      resolve(code === 0 && (stdout.includes('<statusString>OK</statusString>') || stdout.includes('OK')));
    });
  });
}

function parseInfoList(raw: string | null): AcsEventRow[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  const acs = (parsed as Record<string, unknown>)?.AcsEvent as Record<string, unknown> | undefined;
  if (!acs) return [];
  const list = acs.InfoList as unknown;
  if (Array.isArray(list)) return list as AcsEventRow[];
  if (list && typeof list === 'object') return [list as AcsEventRow];
  return [];
}

/**
 * `sync-turnstile-events.ps1` dagi ikki bosqichli qidiruv: totalMatches, keyin oxirgi oynadagi yozuvlar.
 */
export async function fetchLatestAcsEvents(params: {
  deviceIp: string;
  devicePort: number;
  username: string;
  password: string;
  start: Date;
  end: Date;
  maxResults: number;
  minor?: number;
}): Promise<AcsEventRow[]> {
  const { deviceIp, devicePort, username, password, start, end, maxResults, minor = 75 } = params;
  const startTime = formatTashkentIso(start);
  const endTime = formatTashkentIso(end);
  const searchId = `smartroute-poller-${deviceIp.replace(/\./g, '-')}`;

  const baseCond = (position: number, max: number) => ({
    AcsEventCond: {
      searchID: searchId,
      searchResultPosition: position,
      maxResults: max,
      major: 5,
      minor,
      startTime,
      endTime,
    },
  });

  const first = await curlDigestPostJson(deviceIp, devicePort, username, password, baseCond(0, 1));
  if (!first) {
    throw new Error(`Hikvision ISAPI device unreachable: ${deviceIp}:${devicePort}`);
  }

  let totalMatches = 0;
  try {
    const j = JSON.parse(first) as Record<string, unknown>;
    const acs = j.AcsEvent as Record<string, unknown> | undefined;
    if (!acs) {
      throw new Error(`Invalid AcsEvent payload from ${deviceIp}:${devicePort}`);
    }
    totalMatches = Number.parseInt(String(acs?.totalMatches ?? '0'), 10) || 0;
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (totalMatches <= 0) return [];

  const startPosition = Math.max(0, totalMatches - maxResults);
  const second = await curlDigestPostJson(
    deviceIp,
    devicePort,
    username,
    password,
    baseCond(startPosition, maxResults),
  );
  return parseInfoList(second);
}
