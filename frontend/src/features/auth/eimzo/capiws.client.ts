import type { EimzoKey } from './eimzo.types';

type CapiwsRequest = {
  name: string;
  plugin?: string;
  arguments?: unknown[];
};

type CapiwsResponse = Record<string, any> & {
  success?: boolean;
  reason?: string;
};

type EimzoVersion = {
  major: number;
  minor: number;
};

type NativeCapiwsClient = {
  callFunction?: (request: CapiwsRequest, callback: (event: unknown, data: CapiwsResponse) => void, error: (error: unknown) => void) => void;
  version?: (callback: (event: unknown, data: CapiwsResponse) => void, error: (error: unknown) => void) => void;
  apikey?: (keys: string[], callback: (event: unknown, data: CapiwsResponse) => void, error: (error: unknown) => void) => void;
};

type BridgeMessage = {
  type?: string;
  id?: string;
  ok?: boolean;
  response?: CapiwsResponse;
  error?: string;
};

const DEFAULT_API_KEYS = [
  'localhost',
  '96D0C1491615C82B9A54D9989779DF825B690748224C2B04F500F370D51827CE2644D8D4A82C18184D73AB8530BB8ED537269603F61DB0D03D2104ABF789970B',
  '127.0.0.1',
  'A7BCFA5D490B351BE0754130DF03A068F855DB4333D43921125B9CF2670EF6A40370C646B90401955E1F7BC9CDBF59CE0B2C5467D820BE189C845D0B79CFC96F',
];

const MESSAGE_REQUEST = 'smartroute:eimzo:request';
const MESSAGE_RESPONSE = 'smartroute:eimzo:response';
const MESSAGE_READY = 'smartroute:eimzo:ready';
const LOCAL_EIMZO_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const bridgeDisabled = String(import.meta.env.VITE_EIMZO_DISABLE_LOCALHOST_BRIDGE ?? '').trim().toLowerCase() === 'true';

const ensureBrowserWebSocket = () => {
  if (!window.WebSocket) {
    throw new Error('WebSocket mavjud emas');
  }
};

const base64EncodeUtf8 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
};

const splitX500 = (value: string): string[] => {
  const parts: string[] = [];
  let current = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (
      char === ',' &&
      /^[A-Z0-9.]+=/i.test(value.slice(index + 1, index + 32))
    ) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
};

const getX500Value = (source: string, field: string): string => {
  const normalized = source
    .replace(/1\.2\.860\.3\.16\.1\.1=/gi, 'INN=')
    .replace(/1\.2\.860\.3\.16\.1\.2=/gi, 'PINFL=');
  const target = field.toUpperCase();
  for (const part of splitX500(normalized)) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = part.slice(0, separatorIndex).trim().toUpperCase();
    if (key === target) {
      return part.slice(separatorIndex + 1).trim();
    }
  }
  return '';
};

const parseEimzoDate = (value: string): Date | undefined => {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const normalized = raw.replace(/\./g, '-').replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
};

const normalizePfxCertificate = (certificate: any): EimzoKey | null => {
  const alias = String(certificate?.alias ?? '');
  const x500 = alias
    .replace(/1\.2\.860\.3\.16\.1\.1=/gi, 'INN=')
    .replace(/1\.2\.860\.3\.16\.1\.2=/gi, 'PINFL=');
  const pinfl = getX500Value(x500, 'PINFL');
  const tin = getX500Value(x500, 'INN') || getX500Value(x500, 'UID');
  if (!pinfl && !tin) return null;

  return {
    type: 'pfx',
    disk: String(certificate?.disk ?? ''),
    path: String(certificate?.path ?? ''),
    name: String(certificate?.name ?? ''),
    alias,
    serialNumber: getX500Value(x500, 'SERIALNUMBER'),
    validFrom: parseEimzoDate(getX500Value(x500, 'VALIDFROM')),
    validTo: parseEimzoDate(getX500Value(x500, 'VALIDTO')),
    CN: getX500Value(x500, 'CN'),
    TIN: tin,
    UID: getX500Value(x500, 'UID'),
    PINFL: pinfl,
    O: getX500Value(x500, 'O'),
    T: getX500Value(x500, 'T'),
  };
};

const normalizeTokenKey = (token: any): EimzoKey | null => {
  const info = String(token?.info ?? '');
  const x500 = info
    .replace(/1\.2\.860\.3\.16\.1\.1=/gi, 'INN=')
    .replace(/1\.2\.860\.3\.16\.1\.2=/gi, 'PINFL=');
  const pinfl = getX500Value(x500, 'PINFL');
  const tin = getX500Value(x500, 'INN') || getX500Value(x500, 'UID');
  if (!pinfl && !tin) return null;

  return {
    type: 'ftjc',
    cardUID: String(token?.cardUID ?? ''),
    serialNumber: getX500Value(x500, 'SERIALNUMBER'),
    validFrom: parseEimzoDate(getX500Value(x500, 'VALIDFROM')),
    validTo: parseEimzoDate(getX500Value(x500, 'VALIDTO')),
    CN: getX500Value(x500, 'CN') || String(token?.ownerName ?? ''),
    TIN: tin,
    UID: getX500Value(x500, 'UID'),
    PINFL: pinfl,
    O: getX500Value(x500, 'O'),
    T: getX500Value(x500, 'T'),
    ownerName: String(token?.ownerName ?? ''),
    statusInfo: String(token?.statusInfo ?? ''),
  };
};

const keyFingerprint = (key: EimzoKey): string => [
  key.type ?? '',
  key.disk ?? '',
  key.path ?? '',
  key.name ?? '',
  key.cardUID ?? '',
  key.serialNumber ?? key.certificateSerial ?? '',
].join('|');

const uniqueKeys = (keys: EimzoKey[]): EimzoKey[] => {
  const seen = new Set<string>();
  const out: EimzoKey[] = [];
  for (const key of keys) {
    const fingerprint = keyFingerprint(key);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(key);
  }
  return out;
};

class CapiwsLocalhostBridge {
  private readonly origin: string;
  private readonly url: string;
  private iframe: HTMLIFrameElement | null = null;
  private readyPromise: Promise<void> | null = null;
  private requestIndex = 0;
  private readonly pending = new Map<string, {
    resolve: (value: CapiwsResponse) => void;
    reject: (reason?: unknown) => void;
    timeout: number;
  }>();

  constructor(url: string) {
    this.url = url;
    this.origin = new URL(url).origin;
    window.addEventListener('message', this.handleMessage);
  }

  async call(request: CapiwsRequest, timeoutMs: number): Promise<CapiwsResponse> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const id = `eimzo-${Date.now()}-${this.requestIndex += 1}`;
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('E-IMZO localhost bridge javob bermadi'));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.iframe?.contentWindow?.postMessage({
        type: MESSAGE_REQUEST,
        id,
        request,
        timeoutMs,
      }, this.origin);
    });
  }

  private ensureReady(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.src = this.url;
      iframe.title = 'SmartRoute E-IMZO bridge';
      iframe.tabIndex = -1;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';

      const timeout = window.setTimeout(() => {
        reject(new Error('E-IMZO localhost bridge yuklanmadi'));
      }, 5000);

      const onReady = (event: MessageEvent) => {
        const data = event.data as BridgeMessage;
        if (event.origin !== this.origin || data?.type !== MESSAGE_READY) return;
        window.clearTimeout(timeout);
        window.removeEventListener('message', onReady);
        resolve();
      };

      iframe.onerror = () => {
        window.clearTimeout(timeout);
        window.removeEventListener('message', onReady);
        reject(new Error('E-IMZO localhost bridge yuklanmadi'));
      };

      window.addEventListener('message', onReady);
      document.body.appendChild(iframe);
      this.iframe = iframe;
    });

    return this.readyPromise;
  }

  private readonly handleMessage = (event: MessageEvent) => {
    const data = event.data as BridgeMessage;
    if (event.origin !== this.origin || data?.type !== MESSAGE_RESPONSE || !data.id) return;

    const pending = this.pending.get(data.id);
    if (!pending) return;
    this.pending.delete(data.id);
    window.clearTimeout(pending.timeout);

    if (data.ok) {
      pending.resolve(data.response ?? {});
      return;
    }
    pending.reject(new Error(data.error || 'E-IMZO bridge xatosi'));
  };
}

export class SmartRouteCapiwsClient {
  private apiKeys = [...DEFAULT_API_KEYS];
  private url: string | null = null;
  private newApi = false;
  private nativeClient: NativeCapiwsClient | null = null;
  private bridge: CapiwsLocalhostBridge | null = null;
  private hasExplicitHostApiKey = false;

  getKeys(): string[] {
    return [...this.apiKeys];
  }

  addKey(domain: string, key: string): void {
    const normalizedDomain = domain.trim();
    const normalizedKey = key.trim();
    if (!normalizedDomain || !normalizedKey || this.apiKeys.includes(normalizedDomain)) return;
    this.apiKeys.push(normalizedDomain, normalizedKey);
    if (this.matchesCurrentHost(normalizedDomain)) {
      this.hasExplicitHostApiKey = true;
    }
  }

  async selectWorkingUrl(): Promise<void> {
    if (this.shouldUseLocalhostBridge()) {
      const bridge = new CapiwsLocalhostBridge(this.localhostBridgeUrl());
      await bridge.call({ name: 'version' }, 3500);
      this.bridge = bridge;
      return;
    }

    const nativeClient = this.getNativeClient();
    if (nativeClient) {
      await this.callNative(nativeClient, { name: 'version' }, 2500);
      this.nativeClient = nativeClient;
      return;
    }

    const protocol = window.location.protocol.toLowerCase() === 'https:' ? 'wss' : 'ws';
    const port = protocol === 'wss' ? '64443' : '64646';
    const candidates = [
      `${protocol}://127.0.0.1:${port}/service/cryptapi`,
      `${protocol}://localhost:${port}/service/cryptapi`,
    ];

    for (const candidate of candidates) {
      try {
        await this.send(candidate, { name: 'version' }, 2500);
        this.url = candidate;
        return;
      } catch {
        // Try the next local E-IMZO endpoint.
      }
    }

    throw new Error('E-IMZO dasturi topilmadi yoki brauzer local E-IMZO WebSocket ulanishini bloklamoqda');
  }

  async checkVersion(): Promise<EimzoVersion> {
    const data = await this.call({ name: 'version' });
    if (!data.success) {
      throw new Error(String(data.reason ?? 'E-IMZO versiyasini tekshirib bo\'lmadi'));
    }
    const major = Number.parseInt(String(data.major ?? ''), 10);
    const minor = Number.parseInt(String(data.minor ?? ''), 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) {
      throw new Error('E-IMZO versiyasi aniqlanmadi');
    }
    this.newApi = major * 100 + minor >= 336;
    return { major, minor };
  }

  async installApiKeys(): Promise<void> {
    const data = await this.call({ name: 'apikey', arguments: this.apiKeys });
    if (!data.success) {
      throw new Error(String(data.reason ?? 'E-IMZO API-key o\'rnatilmadi'));
    }
  }

  async listAllUserKeys(): Promise<EimzoKey[]> {
    if (!this.newApi) {
      throw new Error('E-IMZO dasturining yangi versiyasini o\'rnating');
    }

    const errors: string[] = [];
    const pfxKeys = await this.listPfxCertificates().catch((error: unknown) => {
      errors.push(String((error as any)?.message ?? error));
      return [] as EimzoKey[];
    });
    const tokenKeys = await this.listTokenKeys().catch((error: unknown) => {
      errors.push(String((error as any)?.message ?? error));
      return [] as EimzoKey[];
    });
    const keys = uniqueKeys([...pfxKeys, ...tokenKeys]);
    if (keys.length === 0 && errors.length > 0) {
      throw new Error(errors[0]);
    }
    return keys;
  }

  async signPkcs7(key: EimzoKey, content: string): Promise<{ pkcs7_64: string; signature_hex?: string }> {
    const keyId = await this.loadKey(key);
    const data = await this.call({
      plugin: 'pkcs7',
      name: 'create_pkcs7',
      arguments: [base64EncodeUtf8(content), keyId, 'no'],
    });
    if (!data.success || !data.pkcs7_64) {
      throw new Error(String(data.reason ?? 'Imzo bekor qilindi'));
    }
    return {
      pkcs7_64: String(data.pkcs7_64),
      signature_hex: data.signature_hex ? String(data.signature_hex) : undefined,
    };
  }

  private async listPfxCertificates(): Promise<EimzoKey[]> {
    const data = await this.call({ plugin: 'pfx', name: 'list_all_certificates' });
    if (!data.success) {
      throw new Error(String(data.reason ?? 'PFX kalitlar olinmadi'));
    }
    return Object.values(data.certificates ?? {})
      .map(normalizePfxCertificate)
      .filter((key): key is EimzoKey => Boolean(key));
  }

  private async listTokenKeys(): Promise<EimzoKey[]> {
    const data = await this.call({ plugin: 'ftjc', name: 'list_all_keys', arguments: [''] });
    if (!data.success) {
      throw new Error(String(data.reason ?? 'Token kalitlar olinmadi'));
    }
    return Object.values(data.tokens ?? {})
      .map(normalizeTokenKey)
      .filter((key): key is EimzoKey => Boolean(key));
  }

  private async loadKey(key: EimzoKey): Promise<string> {
    if (key.type === 'pfx') {
      const loaded = await this.call({
        plugin: 'pfx',
        name: 'load_key',
        arguments: [key.disk ?? '', key.path ?? '', key.name ?? '', key.alias ?? ''],
      });
      if (!loaded.success || !loaded.keyId) {
        throw new Error(String(loaded.reason ?? 'Kalit yuklanmadi'));
      }
      const verified = await this.call({
        plugin: 'pfx',
        name: 'verify_password',
        arguments: [loaded.keyId],
      });
      if (!verified.success) {
        throw new Error(String(verified.reason ?? 'INVALID PASSWORD'));
      }
      return String(loaded.keyId);
    }

    if (key.type === 'ftjc') {
      const loaded = await this.call({
        plugin: 'ftjc',
        name: 'load_key',
        arguments: [key.cardUID ?? ''],
      });
      if (!loaded.success || !loaded.keyId) {
        throw new Error(String(loaded.reason ?? 'Token kalit yuklanmadi'));
      }
      const verified = await this.call({
        plugin: 'ftjc',
        name: 'verify_pin',
        arguments: [loaded.keyId, '1'],
      });
      if (!verified.success) {
        throw new Error(String(verified.reason ?? 'INVALID PASSWORD'));
      }
      return String(loaded.keyId);
    }

    throw new Error('Kalit turi qo\'llab-quvvatlanmaydi');
  }

  private async call(request: CapiwsRequest): Promise<CapiwsResponse> {
    if (!this.url && !this.nativeClient && !this.bridge) {
      await this.selectWorkingUrl();
    }
    if (this.bridge) {
      return this.bridge.call(request, 15000);
    }
    if (this.nativeClient) {
      return this.callNative(this.nativeClient, request, 15000);
    }
    return this.send(this.url as string, request, 15000);
  }

  private shouldUseLocalhostBridge(): boolean {
    if (bridgeDisabled || this.hasExplicitHostApiKey) return false;
    const host = window.location.hostname.toLowerCase();
    return window.location.protocol === 'http:' && !LOCAL_EIMZO_HOSTS.has(host);
  }

  private localhostBridgeUrl(): string {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//localhost${port}/eimzo-bridge.html`;
  }

  private matchesCurrentHost(domain: string): boolean {
    const normalized = domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    const currentHost = window.location.hostname.toLowerCase();
    const currentHostWithPort = window.location.host.toLowerCase();
    return normalized === currentHost || normalized === currentHostWithPort;
  }

  private getNativeClient(): NativeCapiwsClient | null {
    const nativeClient = (window as any).EIMZOEXT;
    if (!nativeClient || typeof nativeClient !== 'object') return null;
    if (typeof nativeClient.callFunction !== 'function') return null;
    return nativeClient as NativeCapiwsClient;
  }

  private callNative(
    nativeClient: NativeCapiwsClient,
    request: CapiwsRequest,
    timeoutMs: number,
  ): Promise<CapiwsResponse> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        callback();
      };
      const timeout = window.setTimeout(() => {
        finish(() => reject(new Error('E-IMZO ulanish vaqti tugadi')));
      }, timeoutMs);

      const callback = (_event: unknown, data: CapiwsResponse) => {
        finish(() => resolve(data));
      };
      const error = (value: unknown) => {
        finish(() => reject(value instanceof Error ? value : new Error(String(value ?? 'E-IMZO xatosi'))));
      };

      try {
        if (request.name === 'version' && typeof nativeClient.version === 'function') {
          nativeClient.version(callback, error);
          return;
        }
        if (request.name === 'apikey' && typeof nativeClient.apikey === 'function') {
          nativeClient.apikey(this.apiKeys, callback, error);
          return;
        }
        nativeClient.callFunction?.(request, callback, error);
      } catch (value) {
        error(value);
      }
    });
  }

  private send(url: string, request: CapiwsRequest, timeoutMs: number): Promise<CapiwsResponse> {
    ensureBrowserWebSocket();
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        try {
          socket.close();
        } catch {
          // Socket may already be closed.
        }
        callback();
      };
      const timeout = window.setTimeout(() => {
        finish(() => reject(new Error('E-IMZO ulanish vaqti tugadi')));
      }, timeoutMs);

      try {
        socket = new WebSocket(url);
      } catch (error) {
        window.clearTimeout(timeout);
        reject(error);
        return;
      }

      socket.onerror = () => {
        finish(() => reject(new Error('E-IMZO WebSocket ulanishida xatolik')));
      };
      socket.onmessage = (event) => {
        finish(() => {
          try {
            resolve(JSON.parse(String(event.data)) as CapiwsResponse);
          } catch {
            reject(new Error('E-IMZO javobi JSON formatida emas'));
          }
        });
      };
      socket.onopen = () => {
        socket.send(JSON.stringify(request));
      };
    });
  }
}
