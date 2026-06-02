import { initModuleEimzo } from '@shohrux_saidov/eimzo-client';
import { resolveApiBaseUrl } from '../../../utils/apiBase';
import type { EimzoChallengeResponse, EimzoKey, EimzoLoginResponse } from './eimzo.types';

type EimzoModule = Awaited<ReturnType<typeof initModuleEimzo>>;

const API_BASE = resolveApiBaseUrl();

let modulePromise: Promise<EimzoModule> | null = null;

export const getEimzoLocalhostUrl = () =>
  `${window.location.protocol}//localhost:${window.location.port || '5173'}${window.location.pathname}${window.location.search}`;

export const isEimzoApiKeyErrorMessage = (message: string | null | undefined): boolean => {
  const lower = String(message ?? '').toLowerCase();
  return lower.includes('api-key') || lower.includes('localhost') || lower.includes('127.0.0.1');
};

const errorToText = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return [
      record.message,
      record.reason,
      record.error,
      record.err,
      JSON.stringify(record),
    ].filter(Boolean).map(String).join(' ');
  }
  return String(error ?? '');
};

const normalizeErrorMessage = (error: unknown): string => {
  const text = errorToText(error);
  const lower = text.toLowerCase();
  if (lower.includes('invalid password') || lower.includes('password')) return "Parol noto'g'ri";
  if (lower.includes('cancel') || lower.includes('отмен')) return 'Imzo bekor qilindi';
  if (lower.includes('expired') || lower.includes('muddati')) return 'Kalit muddati tugagan';
  if (lower.includes('cert_required')) return 'Kalit topilmadi';
  if (
    lower.includes('api key') ||
    lower.includes('api-key') ||
    lower.includes('apikey') ||
    lower.includes('domain') ||
    lower.includes('домен') ||
    lower.includes('недействител') ||
    lower.includes('not registered')
  ) {
    return `${window.location.hostname} uchun E-IMZO API-key kerak. E-IMZO default kalitlari faqat localhost/127.0.0.1 uchun ishlaydi. E-IMZO bilan ishlash uchun ${getEimzoLocalhostUrl()} manzilidan kiring yoki 192.168.0.3 uchun rasmiy API-key qo'shing.`;
  }
  if (lower.includes('websocket') || lower.includes('e-imzo') || lower.includes('connection')) {
    return 'E-IMZO dasturi topilmadi';
  }
  return 'E-IMZO orqali kirishda xatolik yuz berdi';
};

const addApiKeyPair = (module: EimzoModule, domain: string, key: string) => {
  const normalizedDomain = String(domain || '').trim();
  const normalizedKey = String(key || '').trim();
  if (!normalizedDomain || !normalizedKey) return;
  if (!module.getKeys().includes(normalizedDomain)) {
    module.addKey(normalizedDomain, normalizedKey);
  }
};

const addConfiguredApiKeys = (module: EimzoModule) => {
  const host = window.location.hostname;
  const hostKey = String(import.meta.env.VITE_EIMZO_API_KEY ?? '').trim();
  if (hostKey) {
    addApiKeyPair(module, host, hostKey);
  }

  const rawPairs = String(import.meta.env.VITE_EIMZO_API_KEYS ?? '').trim();
  for (const pair of rawPairs.split(/[;,]+/g)) {
    if (!pair.trim()) continue;
    const separatorIndex = pair.search(/[:=]/);
    if (separatorIndex <= 0) continue;
    addApiKeyPair(module, pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
  }

};

const probeCapiwsUrl = (url: string): Promise<boolean> => new Promise((resolve) => {
  if (!window.WebSocket) {
    resolve(false);
    return;
  }

  let settled = false;
  const finish = (value: boolean) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };

  try {
    const socket = new WebSocket(url);
    const timeout = window.setTimeout(() => {
      socket.close();
      finish(false);
    }, 2500);

    socket.onerror = () => {
      window.clearTimeout(timeout);
      finish(false);
    };
    socket.onmessage = (event) => {
      window.clearTimeout(timeout);
      socket.close();
      try {
        const payload = JSON.parse(String(event.data));
        finish(Boolean(payload?.success));
      } catch {
        finish(false);
      }
    };
    socket.onopen = () => {
      socket.send(JSON.stringify({ name: 'version' }));
    };
  } catch {
    finish(false);
  }
});

const selectWorkingCapiwsUrl = async () => {
  const capiws = (window as any).CAPIWS;
  if (!capiws) return;

  const protocol = window.location.protocol.toLowerCase() === 'https:' ? 'wss' : 'ws';
  const port = protocol === 'wss' ? '64443' : '64646';
  const candidates = [
    capiws.URL,
    `${protocol}://127.0.0.1:${port}/service/cryptapi`,
    `${protocol}://localhost:${port}/service/cryptapi`,
  ].filter((url, index, all) => typeof url === 'string' && url && all.indexOf(url) === index);

  for (const url of candidates) {
    if (await probeCapiwsUrl(url)) {
      capiws.URL = url;
      return;
    }
  }

  throw new Error('E-IMZO dasturi topilmadi yoki brauzer local E-IMZO WebSocket ulanishini bloklamoqda');
};

const getModule = async (): Promise<EimzoModule> => {
  if (!modulePromise) {
    modulePromise = initModuleEimzo()
      .then(async (module) => {
        addConfiguredApiKeys(module);
        await selectWorkingCapiwsUrl();
        await module.checkVersion().catch((error: unknown) => {
          throw new Error(normalizeErrorMessage(error));
        });
        await module.installApiKeys().catch((error: unknown) => {
          throw new Error(normalizeErrorMessage(error));
        });
        return module;
      });
  }
  return modulePromise;
};

export const getEimzoKeys = async (): Promise<EimzoKey[]> => {
  try {
    const module = await getModule();
    const keys = await module.listAllUserKeys() as EimzoKey[];
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error('Kalit topilmadi');
    }
    return keys;
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
};

const keyIsExpired = (key: EimzoKey): boolean => {
  if (!key.validTo) return false;
  const date = key.validTo instanceof Date ? key.validTo : new Date(key.validTo);
  return Number.isFinite(date.getTime()) && date.getTime() < Date.now();
};

export const formatEimzoKeyLabel = (key: EimzoKey): string => {
  const fileName = key.name || key.cardUID || '';
  const ownerName = key.CN || key.alias || fileName || 'E-IMZO kalit';
  const innOrPinfl = key.PINFL || key.TIN || key.INN || key.UID || key.serialNumber || '';
  const label = fileName && fileName !== ownerName ? `${fileName} - ${ownerName}` : ownerName;
  return innOrPinfl ? `${label} - ${innOrPinfl}` : label;
};

export const formatEimzoKeyLocation = (key: EimzoKey): string => {
  if (key.type === 'ftjc') return key.cardUID ? `Token: ${key.cardUID}` : 'Token kalit';
  const disk = key.disk ? `${key.disk}:` : '';
  const path = String(key.path || '').replace(/^[\\/]+/, '');
  const name = key.name || '';
  const location = `${disk}${path ? `\\${path}` : ''}${name ? `\\${name}` : ''}`.replace(/\\+/g, '\\');
  return location || key.alias || 'DSKEYS/PFX kalit';
};

const buildCertificatePayload = (key: EimzoKey) => ({
  type: key.type,
  disk: key.disk,
  path: key.path,
  name: key.name,
  alias: key.alias,
  cardUID: key.cardUID,
  serialNumber: key.serialNumber ?? key.certificateSerial ?? key.serial,
  CN: key.CN,
  O: key.O,
  PINFL: key.PINFL,
  TIN: key.TIN ?? key.INN,
  INN: key.INN ?? key.TIN,
  UID: key.UID,
  validFrom: key.validFrom,
  validTo: key.validTo,
});

export const getEimzoKeyIdentity = (key: EimzoKey) => {
  const pinfl = String(key.PINFL ?? '').replace(/\D+/g, '').slice(0, 14) || null;
  const inn = String(key.TIN ?? key.INN ?? key.UID ?? '').replace(/\D+/g, '').slice(0, 20) || null;
  const certificateSerial = String(key.serialNumber ?? key.certificateSerial ?? key.serial ?? '')
    .replace(/[^0-9a-fA-F]/g, '')
    .replace(/^0+/, '')
    .toUpperCase() || null;
  return { pinfl, inn, certificateSerial };
};

export const bindEimzoKeyToUser = async (userId: number, key: EimzoKey, authToken: string) => {
  const identity = getEimzoKeyIdentity(key);
  if (!identity.pinfl && !identity.inn && !identity.certificateSerial) {
    throw new Error('Tanlangan E-IMZO kalitidan PINFL, INN yoki sertifikat seriali olinmadi');
  }

  const response = await fetch(`${API_BASE}/users/${userId}/eimzo`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      key: buildCertificatePayload(key),
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.user) {
    const message = String(payload?.message ?? payload?.error ?? 'E-IMZO kalitni biriktirishda xatolik yuz berdi');
    throw new Error(message);
  }
  return payload.user;
};

const getChallenge = async (): Promise<string> => {
  const response = await fetch(`${API_BASE}/auth/eimzo/challenge`, { cache: 'no-store' });
  const payload = await response.json().catch(() => null) as EimzoChallengeResponse | null;
  if (!response.ok || !payload?.challenge) {
    throw new Error('E-IMZO challenge olishda xatolik yuz berdi');
  }
  return payload.challenge;
};

const signChallenge = async (key: EimzoKey, challenge: string): Promise<string> => {
  if (keyIsExpired(key)) throw new Error('Kalit muddati tugagan');
  try {
    const module = await getModule();
    const result = await module.signPkcs7(key as any, challenge) as any;
    const signature = result?.hash?.pkcs7_64 ?? result?.hash?.pkcs7 ?? result?.hash?.signature_hex ?? result?.pkcs7_64;
    if (!signature) {
      throw new Error('Imzo bekor qilindi');
    }
    return String(signature);
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
};

export const loginWithEimzo = async (key: EimzoKey): Promise<EimzoLoginResponse> => {
  const challenge = await getChallenge();
  const signature = await signChallenge(key, challenge);
  const response = await fetch(`${API_BASE}/auth/eimzo/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge,
      signature,
      certificate: JSON.stringify(buildCertificatePayload(key)),
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.user || !(payload?.accessToken || payload?.token)) {
    const message = String(payload?.message ?? payload?.error ?? 'Ushbu E-IMZO foydalanuvchiga biriktirilmagan');
    throw new Error(message);
  }
  return payload as EimzoLoginResponse;
};
