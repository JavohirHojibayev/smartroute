import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
  OnModuleDestroy,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { FuelEntry } from './fuel-entry.entity';

type AzsConfig = {
  enabled: boolean;
  baseUrl: string;
  authBaseUrl: string;
  username: string;
  password: string;
  tokenPath: string;
  eventsPath: string;
  timeoutMs: number;
  autoSyncEveryMs: number;
  staleAfterMs: number;
  anomalyLiters: number;
  fetchPageSize: number;
  fetchMaxPages: number;
  initialBackfillHours: number;
  overlapSeconds: number;
  retryMaxMs: number;
  requestRetries: number;
  historyStartDate: string;
  historyChunkDays: number;
  historySleepMs: number;
};

type SyncMode = 'incremental' | 'history';

type LastSyncStats = {
  mode: SyncMode;
  fetched: number;
  inserted: number;
  updated: number;
  chunks?: number;
};

type ExternalFuelRow = {
  externalId: string;
  eventTime: Date;
  vehicleNumber: string | null;
  fuelType: string | null;
  liters: number | null;
  amount: number | null;
  stationName: string | null;
  driverName: string | null;
  eventType: number | null;
  payType: string | null;
  cardId: string | null;
  deviceId: string | null;
  devicePostId: string | null;
  eventMessage: string | null;
  entityId: string | null;
  ownerId: string | null;
  isBroken: boolean | null;
  eventDuration: number | null;
  payload: any;
};

type AzsObjectKindFilter = {
  kindAll: boolean;
  deviceIds: string[];
  postIds: string[];
  postNames: string[];
};

type AzsKindContext = {
  token: string;
  kindFilter: AzsObjectKindFilter;
  objectKinds: Array<{ key: string; label: string }>;
  devicesAll: any[];
  devicesFiltered: any[];
  devicesData: any;
  kindAll: boolean;
  postsRaw: any[];
  postsForKind: any[];
};

type AzsDashboardStatsResult = {
  stats: Record<string, any>;
  kindFilter: AzsObjectKindFilter;
  token?: string;
};

type AzsFuelCardsView = 'groups' | 'limits';

@Injectable()
export class AzsFuelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AzsFuelService.name);
  private readonly currentDayRepairIntervalMs = 10 * 60 * 1000;
  private syncInFlight: Promise<any> | null = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private lastSyncAt = 0;
  private lastSyncAttemptAt = 0;
  private lastSyncStartedAt = 0;
  private lastSyncDurationMs = 0;
  private lastSyncError: string | null = null;
  private failureStreak = 0;
  private nextSyncAt = 0;
  private lastSyncStats: LastSyncStats | null = null;
  private currentDayRepairCheckedAt = 0;
  private currentDayRepairYmd = '';

  // Token keshi: AZS serveriga har so'rovda yangi token so'ramaslik uchun
  private cachedToken: string | null = null;
  private cachedTokenExpiresAt = 0;
  private readonly TOKEN_TTL_MS = 55 * 60 * 1000; // 55 daqiqa

  constructor(
    @InjectRepository(FuelEntry)
    private readonly fuelRepo: Repository<FuelEntry>,
  ) {}

  onModuleInit(): void {
    const config = this.getConfig();
    if (!config.enabled) return;
    void this.ensurePerformanceIndexes().catch((error) => {
      this.logger.warn(`AZS index yaratishda xatolik: ${String((error as any)?.message ?? error)}`);
    });
    this.nextSyncAt = Date.now();
    this.scheduler = setInterval(() => {
      if (Date.now() < this.nextSyncAt) return;
      void this.syncNow().catch(() => undefined);
    }, config.autoSyncEveryMs);
    this.refreshAzsDashboardStatsInBackground(
      config,
      undefined,
      this.azsDashboardStatsCacheKey(config, undefined),
    );
    void this.syncNow().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (!this.scheduler) return;
    clearInterval(this.scheduler);
    this.scheduler = null;
  }

  private normalizeWhitespace(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  private normalizeBaseUrl(value: string): string {
    return this.normalizeWhitespace(value).replace(/\/+$/, '');
  }

  private normalizePath(value: string, fallback: string): string {
    const raw = this.normalizeWhitespace(value || fallback);
    if (!raw) return fallback;
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  private deriveAzsDeviceEventsPath(eventsPath: string): string {
    const normalized = this.normalizePath(eventsPath, '/events/DeviceEvents');
    if (/devicerefill?events$/i.test(normalized)) {
      return normalized.replace(/devicerefill?events$/i, 'DeviceEvents');
    }
    if (/refill?events$/i.test(normalized)) {
      return normalized.replace(/refill?events$/i, 'DeviceEvents');
    }
    return normalized;
  }

  private getConfig(): AzsConfig {
    const enabledRaw = this.normalizeWhitespace(process.env.AZS_ENABLED ?? 'false').toLowerCase();
    const enabled = enabledRaw === 'true' || enabledRaw === '1' || enabledRaw === 'on';
    // tantiazsonline.uz production appsettings endpointlari.
    const baseUrl = this.normalizeBaseUrl(process.env.AZS_BASE_URL || 'https://api.azs.garvex.tech/api');
    const authBaseUrl = this.normalizeBaseUrl(process.env.AZS_AUTH_BASE_URL || 'https://api.auth.garvex.tech/api');
    const username = this.normalizeWhitespace(process.env.AZS_USERNAME || '');
    const password = String(process.env.AZS_PASSWORD ?? '');
    const tokenPath = this.normalizePath(process.env.AZS_TOKEN_PATH || '/Authenticate/Login', '/Authenticate/Login');
    const eventsPath = this.normalizePath(process.env.AZS_EVENTS_PATH || '/events/deviceRefillEvents', '/events/deviceRefillEvents');

    return {
      enabled,
      baseUrl,
      authBaseUrl,
      username,
      password,
      tokenPath,
      eventsPath,
      timeoutMs: Math.max(3000, Math.min(30000, Number.parseInt(process.env.AZS_TIMEOUT_MS ?? '12000', 10) || 12000)),
      autoSyncEveryMs: Math.max(10000, Math.min(3600000, Number.parseInt(process.env.AZS_AUTO_SYNC_MS ?? '60000', 10) || 60000)),
      staleAfterMs: Math.max(15000, Math.min(3600000, Number.parseInt(process.env.AZS_STALE_AFTER_MS ?? '120000', 10) || 120000)),
      anomalyLiters: Math.max(1, Number.parseFloat(process.env.AZS_ANOMALY_LITERS ?? '120') || 120),
      fetchPageSize: Math.max(10, Math.min(200, Number.parseInt(process.env.AZS_FETCH_PAGE_SIZE ?? '50', 10) || 50)),
      fetchMaxPages: Math.max(1, Math.min(50, Number.parseInt(process.env.AZS_FETCH_MAX_PAGES ?? '5', 10) || 5)),
      initialBackfillHours: Math.max(1, Math.min(87600, Number.parseInt(process.env.AZS_INITIAL_BACKFILL_HOURS ?? '24', 10) || 24)),
      overlapSeconds: Math.max(30, Math.min(3600, Number.parseInt(process.env.AZS_OVERLAP_SECONDS ?? '120', 10) || 120)),
      retryMaxMs: Math.max(30000, Math.min(3600000, Number.parseInt(process.env.AZS_RETRY_MAX_MS ?? '300000', 10) || 300000)),
      requestRetries: Math.max(0, Math.min(5, Number.parseInt(process.env.AZS_REQUEST_RETRIES ?? '2', 10) || 2)),
      historyStartDate: this.normalizeWhitespace(process.env.AZS_HISTORY_START_DATE || ''),
      historyChunkDays: Math.max(1, Math.min(31, Number.parseInt(process.env.AZS_HISTORY_CHUNK_DAYS ?? '3', 10) || 3)),
      historySleepMs: Math.max(0, Math.min(5000, Number.parseInt(process.env.AZS_HISTORY_SLEEP_MS ?? '300', 10) || 300)),
    };
  }

  private async ensurePerformanceIndexes(): Promise<void> {
    await this.fuelRepo.query(
      'CREATE INDEX IF NOT EXISTS idx_fuel_entries_event_time ON fuel_entries(event_time)',
    );
    await this.fuelRepo.query(
      'CREATE INDEX IF NOT EXISTS idx_fuel_entries_station_event_time ON fuel_entries(station_name, event_time)',
    );
    await this.fuelRepo.query(
      'CREATE INDEX IF NOT EXISTS idx_fuel_entries_vehicle_event_time ON fuel_entries(vehicle_number, event_time)',
    );
  }

  private addJitter(ms: number): number {
    const jitter = 0.15;
    const factor = 1 - jitter + Math.random() * jitter * 2;
    return Math.max(1000, Math.round(ms * factor));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private ensureConfigForSync(config: AzsConfig): void {
    if (!config.enabled) {
      throw new BadRequestException("AZS yoqilg'i integratsiyasi o'chirilgan (AZS_ENABLED=false)");
    }
    if (!config.baseUrl) {
      throw new BadRequestException('AZS_BASE_URL sozlanmagan');
    }
    if (!config.username || !config.password) {
      throw new BadRequestException('AZS_USERNAME va AZS_PASSWORD sozlanmagan');
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
  }

  private async fetchWithRetry(
    tag: string,
    url: string,
    init: RequestInit,
    timeoutMs: number,
    retries: number,
  ): Promise<Response> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= retries) {
      attempt += 1;
      try {
        const response = await this.fetchWithTimeout(url, init, timeoutMs);
        if (this.shouldRetryStatus(response.status) && attempt <= retries) {
          const delay = this.addJitter(Math.min(5000, 400 * Math.pow(2, attempt - 1)));
          this.logger.warn(`AZS ${tag} retry ${attempt}/${retries + 1} (status=${response.status})`);
          await this.sleep(delay);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt > retries) break;
        const delay = this.addJitter(Math.min(5000, 400 * Math.pow(2, attempt - 1)));
        this.logger.warn(`AZS ${tag} retry ${attempt}/${retries + 1} (network error)`);
        await this.sleep(delay);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`AZS ${tag} request failed`);
  }

  private async requestFreshToken(config: AzsConfig): Promise<string> {
    const url = `${config.authBaseUrl}${config.tokenPath}`;
    const body = JSON.stringify({
      login: config.username,
      password: config.password,
    });

    const response = await this.fetchWithRetry(
      'token',
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body,
      },
      config.timeoutMs,
      config.requestRetries,
    );

    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new BadRequestException(`AZS token olishda xatolik: ${response.status}`);
    }

    const token = this.normalizeWhitespace(
      payload?.access_token ?? payload?.accessToken ?? payload?.token ?? payload?.Token ?? '',
    );
    if (!token) {
      throw new BadRequestException('AZS token javobida access token topilmadi');
    }
    return token;
  }

  // Keshdan token qaytaradi; muddati o'tgan yoki yo'q bo'lsa yangilaydi
  private async requestToken(config: AzsConfig, forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cachedToken && Date.now() < this.cachedTokenExpiresAt) {
      return this.cachedToken;
    }
    const token = await this.requestFreshToken(config);
    this.cachedToken = token;
    this.cachedTokenExpiresAt = Date.now() + this.TOKEN_TTL_MS;
    return token;
  }

  private pickFirst(obj: Record<string, any>, aliases: string[]): any {
    const keys = Object.keys(obj || {});
    const normalizedAlias = aliases.map((a) => a.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    const normalizedKeys = keys.map((key) => ({
      key,
      norm: key.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    }));

    for (const alias of normalizedAlias) {
      const exact = normalizedKeys.find((entry) => entry.norm === alias);
      if (exact) return obj[exact.key];
    }

    for (const alias of normalizedAlias) {
      const suffix = normalizedKeys.find((entry) => entry.norm.endsWith(alias));
      if (suffix) return obj[suffix.key];
    }

    return null;
  }

  private parseNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = this.normalizeWhitespace(value).replace(',', '.');
    if (!text) return null;
    const normalized = text.replace(/[^0-9.\-]/g, '');
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalizedMs = value < 1_000_000_000_000 ? value * 1000 : value;
      const asDate = new Date(normalizedMs);
      return Number.isNaN(asDate.getTime()) ? null : asDate;
    }

    const raw = this.normalizeWhitespace(value);
    if (!raw) return null;

    if (/^\d{9,16}$/.test(raw)) {
      const asNumber = Number.parseInt(raw, 10);
      if (Number.isFinite(asNumber)) {
        const normalizedMs = asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
        const date = new Date(normalizedMs);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }

    const odataMatch = raw.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//i);
    if (odataMatch) {
      const ms = Number.parseInt(odataMatch[1], 10);
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    const raw = this.normalizeWhitespace(value).toLowerCase();
    if (!raw) return null;
    if (['true', '1', 'yes', 'ha'].includes(raw)) return true;
    if (['false', '0', 'no', "yo'q", 'yoq'].includes(raw)) return false;
    return null;
  }

  private extractRows(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const candidates = [payload.value, payload.values, payload.data, payload.items, payload.results, payload.events, payload.objects];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  /** GetFuelTankSections javobi: objects / value / umumiy extractRows */
  private normalizeFuelTankSectionsListPayload(payload: any): any[] {
    if (Array.isArray(payload?.objects)) return payload.objects;
    if (Array.isArray(payload?.value)) return payload.value;
    return this.extractRows(payload);
  }

  /**
   * AZS kabinetidagi seksiya nomi bilan mos tartibda maydonlar (tire/underscore farqlarini kamaytirish).
   */
  private azsSectionRowPrimaryName(row: Record<string, any>, idx: number): string {
    const nm = this.normalizeWhitespace(
      String(
        this.pickFirst(row, [
          'sectionName',
          'fuelSectionName',
          'fuelTankSectionName',
          'name',
          'displayName',
          'title',
          'sectionTitle',
        ]) ?? '',
      ),
    );
    if (nm) return nm;
    const id = this.normalizeWhitespace(
      String(row?.fuelTankSectionId ?? row?.id ?? row?.deviceFuelTankSectionId ?? ''),
    );
    return id || `Section ${idx + 1}`;
  }

  /** Barcha seksiya qatorlari (sahifalash — AZS default limitdan oshib ketmasin) */
  private async fetchAllFuelTankSections(config: AzsConfig, token: string): Promise<any[]> {
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    const pageSize = Math.max(
      50,
      Math.min(5000, Number.parseInt(process.env.AZS_FUEL_TANK_SECTIONS_PAGE_SIZE ?? '500', 10) || 500),
    );
    const maxPages = Math.max(
      1,
      Math.min(50, Number.parseInt(process.env.AZS_FUEL_TANK_SECTIONS_MAX_PAGES ?? '20', 10) || 20),
    );
    const aggregated: any[] = [];
    let page = 0;

    while (page < maxPages) {
      const url = `${config.baseUrl}/FuelTankSections/GetFuelTankSections?page=${page}&countOnPage=${pageSize}`;
      const resp = await this.fetchWithTimeout(url, { method: 'GET', headers }, config.timeoutMs);
      if (!resp.ok) {
        if (page === 0) {
          this.logger.warn(`GetFuelTankSections HTTP ${resp.status}`);
        }
        break;
      }
      const payload = await resp.json().catch(() => null);
      const rows = this.normalizeFuelTankSectionsListPayload(payload);
      if (rows.length === 0) break;

      aggregated.push(...rows);

      const reportedTotal = Number.parseInt(String(payload?.objectCount ?? payload?.totalCount ?? 0), 10) || 0;
      const pageCount = Math.max(1, Number.parseInt(String(payload?.pageCount ?? payload?.totalPages ?? 1), 10) || 1);
      if (reportedTotal > 0 && aggregated.length >= reportedTotal) break;
      if (page + 1 >= pageCount && pageCount > 1) break;
      if (rows.length < pageSize) break;
      page += 1;
    }

    return aggregated;
  }

  private normalizeExternalRow(row: Record<string, any>, fallbackKey: string): ExternalFuelRow | null {
    const externalIdRaw = row?.deviceEventId ?? this.pickFirst(row, ['eventId', 'id', 'eventNumber', 'event_id', 'uid', 'guid', 'transactionId', 'docNo']);
    const externalId = this.normalizeWhitespace(externalIdRaw) || fallbackKey;
    // AZS "Дата начала" = timeStart (zapravka boshlanishi) — timeEnd emas
    const eventTimeRaw = this.pickFirst(row, ['timeStart', 'timeEnd', 'dateCreate', 'dateUpdate', 'date', 'time', 'eventTime', 'createdAt', 'timestamp', 'documentDate']);
    const eventTime = this.parseDate(eventTimeRaw) || new Date();

    const vehicleNumber = this.normalizeWhitespace(
      this.pickFirst(row, ['trackerName', 'vehicleNumber', 'plate', 'carNumber', 'vehicle', 'govNumber', 'truck', 'cardName', 'idCard']),
    ) || null;
    const fuelType = this.normalizeWhitespace(
      this.pickFirst(row, ['fuelType', 'fuelName', 'product', 'productName', 'brand', 'fuelSectionName', 'devicePostName']),
    ) || null;
    const stationName = this.normalizeWhitespace(
      this.pickFirst(row, ['station', 'stationName', 'azs', 'gasStation', 'devicePostName', 'deviceName', 'groupName', 'fuelTankName']),
    ) || null;
    const driverName = this.normalizeWhitespace(
      this.pickFirst(row, ['driver', 'driverName', 'employee', 'operator']),
    ) || null;
    // AZS "Выдано по счётчику" grafik Итого = issuedDut (DUT sensori bilan o'lchangan)
    // value = hisoblagich buyurmasi (zakazano), issuedDut = haqiqiy berilgan
    let liters = this.parseNumber(
      row?.issuedDut ?? row?.issuedVirtual ?? row?.differenceRefuel ?? row?.issuedValue ?? row?.liters ?? row?.volume ?? row?.quantity ?? row?.amountL ?? row?.fuelVolume,
    );
    if (liters == null) {
      const volumeVirtual = this.parseNumber(row?.issuedVolumeVirtual ?? row?.differenceRefuelVolume);
      if (volumeVirtual != null) liters = volumeVirtual * 1000;
    }
    const eventTypeForLiters = this.parseNumber(row?.eventsType);
    if (liters == null && (eventTypeForLiters === 131 || eventTypeForLiters === 132 || eventTypeForLiters === 130)) {
      liters = this.parseNumber(row?.value);
    }
    if (liters != null && (liters <= 0 || liters > 2000)) {
      liters = null;
    }
    const amount = this.parseNumber(this.pickFirst(row, ['totalCost', 'amount', 'sum', 'priceTotal', 'cost']));
    const eventTypeValue = this.parseNumber(
      row?.eventsType ?? this.pickFirst(row, ['eventsType', 'eventType', 'type']),
    );
    const eventType = eventTypeValue == null ? null : Math.trunc(eventTypeValue);
    const payType = this.normalizeWhitespace(
      row?.payType ?? this.pickFirst(row, ['payType', 'paymentType', 'pay_type']),
    ) || null;
    const cardId = this.normalizeWhitespace(
      row?.cardId ?? this.pickFirst(row, ['cardId', 'cardID', 'idCard', 'rfid']),
    ) || null;
    const deviceId = this.normalizeWhitespace(
      row?.deviceId ?? this.pickFirst(row, ['deviceId', 'terminalId', 'controllerId']),
    ) || null;
    const devicePostId = this.normalizeWhitespace(
      row?.devicePostId ?? this.pickFirst(row, ['devicePostId', 'postId', 'device_post_id']),
    ) || null;
    const eventMessage = this.normalizeWhitespace(
      row?.eventMessage ?? this.pickFirst(row, ['eventMessage', 'message', 'description']),
    ) || null;
    const entityId = this.normalizeWhitespace(
      row?.entityId ?? this.pickFirst(row, ['entityId', 'entity_id']),
    ) || null;
    const ownerId = this.normalizeWhitespace(
      row?.ownerId ?? this.pickFirst(row, ['ownerId', 'owner_id']),
    ) || null;
    const isBroken = this.parseBoolean(
      row?.isBroken ?? this.pickFirst(row, ['isBroken', 'broken']),
    );
    const eventDuration = this.parseNumber(
      row?.eventDuration ?? this.pickFirst(row, ['eventDuration', 'duration']),
    );

    return {
      externalId,
      eventTime,
      vehicleNumber,
      fuelType,
      liters,
      amount,
      stationName,
      driverName,
      eventType,
      payType,
      cardId,
      deviceId,
      devicePostId,
      eventMessage,
      entityId,
      ownerId,
      isBroken,
      eventDuration,
      payload: row,
    };
  }

  private makeFallbackId(row: any): string {
    const hash = createHash('sha256').update(JSON.stringify(row ?? {})).digest('hex').slice(0, 40);
    return `azs_${hash}`;
  }

  private toUnixSeconds(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

  /** AZS "Все объекты" filtri: qurilma turini barqaror kalitga aylantirish */
  private inferObjectKindKey(device: any): string {
    const n = this.parseNumber(
      device?.objectType ?? device?.objectTypeId ?? device?.deviceObjectType ?? device?.typeObject ?? device?.objectKind,
    );
    if (n != null && Number.isFinite(n)) return `n:${Math.trunc(n)}`;
    const name = this.normalizeWhitespace(
      String(device?.objectTypeName ?? device?.objectTypeString ?? device?.deviceTypeName ?? device?.typeName ?? ''),
    );
    if (name) return `s:${name.toLowerCase()}`;
    return 'unknown';
  }

  private deviceMatchesObjectKind(device: any, kind: string | undefined): boolean {
    const k = this.normalizeWhitespace(kind || 'all').toLowerCase();
    if (!k || k === 'all') return true;
    return this.inferObjectKindKey(device) === k;
  }

  private emptyAzsStats() {
    return {
      devices: { total: 0, online: 0, offline: 0 },
      sectionLevels: { critical: 0, low: 0, normal: 0, total: 0, totalLevelLiters: 0 },
      cards: { total: 0, synced: 0, unsynced: 0 },
      refuels: { today: 0, week: 0, month: 0 },
      posts: [] as Array<{ id: number; name: string }>,
      objectKinds: [{ key: 'all', label: "Barcha ob'ektlar" }] as Array<{ key: string; label: string }>,
      azsSectionNames: [] as string[],
      sectionGaugeRows: [] as Array<{ name: string; liters: number }>,
    };
  }

  private applyObjectKindToFuelQuery<T extends { andWhere: any }>(qb: T, filter: AzsObjectKindFilter): T {
    if (filter.kindAll) return qb;
    const { deviceIds, postIds, postNames } = filter;
    const hasDevices = deviceIds.length > 0;
    const hasPosts = postIds.length > 0;
    const hasNames = postNames.length > 0;
    if (!hasDevices && !hasPosts && !hasNames) {
      return qb.andWhere('1 = 0') as T;
    }
    return qb.andWhere(
      new Brackets((sub) => {
        let first = true;
        const add = (sql: string, params: Record<string, any>) => {
          if (first) {
            sub.where(sql, params);
            first = false;
          } else {
            sub.orWhere(sql, params);
          }
        };
        if (hasDevices) {
          add(
            "COALESCE(json_extract(entry.payload, '$.deviceId'), entry.device_id, '') IN (:...azsKindDids)",
            { azsKindDids: deviceIds },
          );
        }
        if (hasPosts) {
          add(
            "COALESCE(json_extract(entry.payload, '$.devicePostId'), entry.device_post_id, '') IN (:...azsKindPids)",
            { azsKindPids: postIds },
          );
        }
        if (hasNames) {
          add(
            "COALESCE(json_extract(entry.payload, '$.devicePostName'), entry.station_name, '') IN (:...azsKindPnames)",
            { azsKindPnames: postNames },
          );
        }
      }),
    ) as T;
  }

  /** Raw SQL (fuel_entries) uchun ob'ekt turi filtri */
  private objectKindSqlFragment(filter: AzsObjectKindFilter): { sql: string; params: string[] } {
    if (filter.kindAll) return { sql: '', params: [] };
    const { deviceIds, postIds, postNames } = filter;
    const parts: string[] = [];
    const params: string[] = [];
    if (deviceIds.length) {
      parts.push(
        `COALESCE(json_extract(payload, '$.deviceId'), COALESCE(device_id, ''), '') IN (${deviceIds.map(() => '?').join(',')})`,
      );
      params.push(...deviceIds);
    }
    if (postIds.length) {
      parts.push(
        `COALESCE(json_extract(payload, '$.devicePostId'), COALESCE(device_post_id, ''), '') IN (${postIds.map(() => '?').join(',')})`,
      );
      params.push(...postIds);
    }
    if (postNames.length) {
      parts.push(
        `COALESCE(json_extract(payload, '$.devicePostName'), COALESCE(station_name, ''), '') IN (${postNames.map(() => '?').join(',')})`,
      );
      params.push(...postNames);
    }
    if (!parts.length) return { sql: ' AND 1=0', params: [] };
    return { sql: ` AND (${parts.join(' OR ')})`, params };
  }

  private async countRefuelEventsDb(filter: AzsObjectKindFilter, startSql: string, endSql: string): Promise<number> {
    let qb = this.fuelRepo
      .createQueryBuilder('entry')
      .where("json_extract(entry.payload, '$.eventsType') IN (131, 132)")
      .andWhere('entry.event_time >= :start', { start: startSql })
      .andWhere('entry.event_time <= :end', { end: endSql });
    qb = this.applyObjectKindToFuelQuery(qb, filter);
    return qb.getCount();
  }

  /** GetCards javobi — sinxron / sinxron emas (maydon nomlari turlicha bo‘lishi mumkin) */
  private aggregateCardSyncFromAzs(cardsData: any): { total: number; synced: number; unsynced: number } {
    const total = Math.max(0, Number.parseInt(String(cardsData?.objectCount ?? 0), 10) || 0);
    const objs = cardsData?.objects;
    if (!Array.isArray(objs) || objs.length === 0) {
      return { total, synced: total, unsynced: 0 };
    }
    let synced = 0;
    let unsynced = 0;
    let decided = 0;
    for (const c of objs) {
      const row = c as Record<string, any>;
      const flags = [
        row?.isSynchronized,
        row?.IsSynchronized,
        row?.synchronized,
        row?.Synchronized,
        row?.fromDatabase,
        row?.FromDatabase,
        row?.isFromDatabase,
        row?.isSend,
        row?.IsSend,
      ];
      let tri: boolean | null = null;
      for (const f of flags) {
        if (f === true || f === 1) {
          tri = true;
          break;
        }
        if (f === false || f === 0) {
          tri = false;
          break;
        }
        if (typeof f === 'string') {
          const s = f.toLowerCase();
          if (s === 'true' || s === '1') {
            tri = true;
            break;
          }
          if (s === 'false' || s === '0') {
            tri = false;
            break;
          }
        }
      }
      if (tri === true) {
        synced += 1;
        decided += 1;
      } else if (tri === false) {
        unsynced += 1;
        decided += 1;
      }
    }
    if (decided === 0) {
      return { total, synced: total, unsynced: 0 };
    }
    if (total > objs.length) {
      // Birinchi sahifa yetarli emas — noto‘g‘ri bo‘linish bermaslik uchun
      return { total, synced: total, unsynced: 0 };
    }
    return { total, synced, unsynced };
  }

  /** AZS «За месяц» — joriy kalendar oyining 1-kuni (UTC+5 va h.k.) */
  private refuelMonthStartUnix(): number {
    const ymd = this.azsCalendarYmdFromInstant(new Date());
    const [yy, mm] = ymd.split('-').map((x) => Number.parseInt(x, 10));
    const tz = this.azsCalendarTzOffsetString();
    const first = new Date(`${yy}-${String(mm).padStart(2, '0')}-01T00:00:00.000${tz}`);
    return Math.floor(first.getTime() / 1000);
  }

  private refuelWindowBounds(daysBackOrMonth: number | 'month'): {
    startSql: string;
    endSql: string;
    startUtc: number;
    endUtc: number;
  } {
    const TZ_OFFSET = this.getAzsCalendarOffsetHours() * 3600;
    const nowUtc = Math.floor(Date.now() / 1000);
    const nowLocal = nowUtc + TZ_OFFSET;
    const todayLocalMidnight = nowLocal - (nowLocal % 86400);
    const todayStartUtc = todayLocalMidnight - TZ_OFFSET;

    let startUtc: number;
    if (daysBackOrMonth === 'month') {
      // AZS «За месяц» — odatda so‘nggi 30 kun (bugun + oldingi 29 kun). Kalendar oyi: AZS_REFUEL_MONTH_MODE=calendar
      const mode = this.normalizeWhitespace(process.env.AZS_REFUEL_MONTH_MODE || 'rolling').toLowerCase();
      startUtc = mode === 'calendar' ? this.refuelMonthStartUnix() : todayStartUtc - 29 * 86400;
    } else if (daysBackOrMonth === 0) {
      startUtc = todayStartUtc;
    } else {
      startUtc = todayStartUtc - daysBackOrMonth * 86400;
    }

    const endUtc = nowUtc + 60;
    const start = new Date(startUtc * 1000);
    const end = new Date(endUtc * 1000);
    return {
      startSql: this.toSqliteDateTime(start),
      endSql: this.toSqliteDateTime(end),
      startUtc,
      endUtc,
    };
  }

  /**
   * AZS kabinetidagi zapravkalar soni: RefuelEvents birinchi sahifadagi objectCount/totalCount
   * (lokal DB sinxroni kechiksa ham AZS bilan bir xil).
   */
  private async fetchAzsRefuelEventsObjectCount(
    config: AzsConfig,
    token: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number | null> {
    const eventsPath = config.eventsPath;
    const params = new URLSearchParams();
    const isDeviceRefill = eventsPath.toLowerCase().includes('devicerefill');
    if (isDeviceRefill) {
      params.set('dateStart', String(this.toUnixSeconds(startDate)));
      params.set('dateEnd', String(this.toUnixSeconds(endDate)));
      params.set('page', '0');
      params.set('countOnPage', String(Math.min(config.fetchPageSize, 50)));
      params.set('orderByDescending', 'true');
    } else {
      params.set('DateStart', String(this.toUnixSeconds(startDate)));
      params.set('DateEnd', String(this.toUnixSeconds(endDate)));
      params.set('Page', '0');
      params.set('CountOnPage', String(Math.min(config.fetchPageSize, 50)));
      params.set('OrderByDescending', 'true');
    }
    const url = `${config.baseUrl}${eventsPath}?${params.toString()}`;
    try {
      const response = await this.fetchWithRetry(
        'refuel-month-count',
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'ru',
            Authorization: `Bearer ${token}`,
          },
        },
        config.timeoutMs,
        config.requestRetries,
      );
      const text = await response.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
      if (!response.ok) return null;
      const raw = payload?.objectCount ?? payload?.totalCount;
      if (raw == null || raw === '') return null;
      const n = Number.parseInt(String(raw), 10);
      return Number.isFinite(n) && n >= 0 ? n : null;
    } catch {
      return null;
    }
  }

  private readonly azsKindFilterAll: AzsObjectKindFilter = {
    kindAll: true,
    deviceIds: [],
    postIds: [],
    postNames: [],
  };

  private azsKindContextCache: { key: string; at: number; value: AzsKindContext } | null = null;
  private readonly AZS_KIND_CACHE_MS = Math.max(
    3000,
    Math.min(120_000, Number.parseInt(process.env.AZS_KIND_CACHE_MS ?? '12000', 10) || 12_000),
  );

  /** GetDevices + GetDevicePosts — post/jami filtrlari uchun (qisqa muddatli kesh) */
  private readonly AZS_DASHBOARD_CACHE_MS = Math.max(
    10_000,
    Math.min(300_000, Number.parseInt(process.env.AZS_DASHBOARD_CACHE_MS ?? '60000', 10) || 60_000),
  );
  private readonly AZS_LEVEL_CHART_CACHE_MS = Math.max(
    10_000,
    Math.min(300_000, Number.parseInt(process.env.AZS_LEVEL_CHART_CACHE_MS ?? '60000', 10) || 60_000),
  );
  private azsDashboardStatsCache = new Map<string, { at: number; value: AzsDashboardStatsResult }>();
  private azsDashboardStatsRefreshInFlight = new Map<string, Promise<void>>();
  private azsLevelMapCache = new Map<string, { at: number; value: Map<string, number> | null }>();
  private azsLevelMapRefreshInFlight = new Map<string, Promise<void>>();

  private async loadAzsObjectKindContext(config: AzsConfig, objectKind?: string): Promise<AzsKindContext> {
    const cacheKey = `${config.baseUrl}|${this.normalizeWhitespace(objectKind || 'all').toLowerCase() || 'all'}`;
    const now = Date.now();
    if (this.azsKindContextCache && this.azsKindContextCache.key === cacheKey && now - this.azsKindContextCache.at < this.AZS_KIND_CACHE_MS) {
      return this.azsKindContextCache.value;
    }

    if (!config.enabled || !config.username || !config.password) {
      const empty: AzsKindContext = {
        token: '',
        kindFilter: this.azsKindFilterAll,
        objectKinds: [{ key: 'all', label: "Barcha ob'ektlar" }],
        devicesAll: [],
        devicesFiltered: [],
        devicesData: null,
        kindAll: true,
        postsRaw: [],
        postsForKind: [],
      };
      this.azsKindContextCache = { key: cacheKey, at: now, value: empty };
      return empty;
    }

    const token = await this.requestToken(config);
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    const fetchJson = async (path: string, params?: string): Promise<any> => {
      const url = `${config.baseUrl}${path}${params ? `?${params}` : ''}`;
      const resp = await this.fetchWithTimeout(url, { method: 'GET', headers }, config.timeoutMs);
      if (!resp.ok) return null;
      return resp.json().catch(() => null);
    };

    const [devicesData, postsData] = await Promise.all([
      fetchJson('/Devices/GetDevices'),
      fetchJson('/DevicePosts/GetDevicePosts'),
    ]);

    const devicesAll = Array.isArray(devicesData?.objects) ? devicesData.objects : [];
    const selectedKind = this.normalizeWhitespace(objectKind || 'all').toLowerCase();
    const kindAll = !selectedKind || selectedKind === 'all';
    const devicesFiltered = kindAll ? devicesAll : devicesAll.filter((d: any) => this.deviceMatchesObjectKind(d, selectedKind));

    const kindLabels = new Map<string, string>();
    for (const d of devicesAll) {
      const key = this.inferObjectKindKey(d);
      const label =
        this.normalizeWhitespace(
          String(d?.objectTypeName ?? d?.objectTypeString ?? d?.deviceTypeName ?? d?.typeName ?? ''),
        ) || key;
      if (!kindLabels.has(key)) kindLabels.set(key, label);
    }
    const objectKinds = [
      { key: 'all', label: "Barcha ob'ektlar" },
      ...[...kindLabels.entries()]
        .filter(([key]) => key !== 'unknown')
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    ];

    const allowedDeviceIds = new Set<string>();
    for (const d of devicesFiltered) {
      const id = this.normalizeWhitespace(d?.deviceId ?? d?.id ?? d?.deviceID ?? '');
      if (id) allowedDeviceIds.add(id);
    }

    const postsRaw = Array.isArray(postsData?.objects) ? postsData.objects : [];
    const postsForKind = kindAll
      ? postsRaw
      : postsRaw.filter((p: any) => {
          const did = this.normalizeWhitespace(p?.deviceId ?? p?.DeviceId ?? p?.controllerDeviceId ?? '');
          return did && allowedDeviceIds.has(did);
        });

    const kindFilter: AzsObjectKindFilter = {
      kindAll,
      deviceIds: [...allowedDeviceIds],
      postIds: [
        ...new Set(
          postsForKind
            .map((p: any) => this.normalizeWhitespace(p?.devicePostId ?? p?.devicePostID ?? ''))
            .filter(Boolean),
        ),
      ] as string[],
      postNames: [
        ...new Set(
          postsForKind.map((p: any) => this.normalizeWhitespace(p?.devicePostName ?? '')).filter(Boolean),
        ),
      ] as string[],
    };

    const value: AzsKindContext = {
      token,
      kindFilter,
      objectKinds,
      devicesAll,
      devicesFiltered,
      devicesData,
      kindAll,
      postsRaw,
      postsForKind,
    };
    this.azsKindContextCache = { key: cacheKey, at: now, value };
    return value;
  }

  private azsDashboardStatsCacheKey(config: AzsConfig, objectKind?: string): string {
    return `${config.baseUrl}|${this.normalizeWhitespace(objectKind || 'all').toLowerCase() || 'all'}`;
  }

  private emptyAzsDashboardStatsResult(): AzsDashboardStatsResult {
    const fallback = this.emptyAzsStats();
    fallback.objectKinds = [{ key: 'all', label: "Barcha ob'ektlar" }];
    return { stats: fallback, kindFilter: this.azsKindFilterAll, token: '' };
  }

  private refreshAzsDashboardStatsInBackground(config: AzsConfig, objectKind: string | undefined, cacheKey: string): void {
    if (this.azsDashboardStatsRefreshInFlight.has(cacheKey)) return;

    const task = this.fetchAzsDashboardStatsFresh(config, objectKind)
      .then((value) => {
        this.azsDashboardStatsCache.set(cacheKey, { at: Date.now(), value });
      })
      .catch((error) => {
        this.logger.warn(`AZS dashboard background refresh: ${String((error as any)?.message ?? error)}`);
      })
      .finally(() => {
        this.azsDashboardStatsRefreshInFlight.delete(cacheKey);
      });

    this.azsDashboardStatsRefreshInFlight.set(cacheKey, task);
  }

  private fetchAzsDashboardStats(
    config: AzsConfig,
    objectKind?: string,
  ): AzsDashboardStatsResult {
    if (!config.enabled || !config.username || !config.password) {
      return this.emptyAzsDashboardStatsResult();
    }

    const cacheKey = this.azsDashboardStatsCacheKey(config, objectKind);
    const cached = this.azsDashboardStatsCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.at < this.AZS_DASHBOARD_CACHE_MS) {
      return cached.value;
    }

    this.refreshAzsDashboardStatsInBackground(config, objectKind, cacheKey);
    return cached?.value ?? this.emptyAzsDashboardStatsResult();
  }

  private async fetchAzsDashboardStatsFresh(
    config: AzsConfig,
    objectKind?: string,
  ): Promise<AzsDashboardStatsResult> {
    const fallback = this.emptyAzsStats();
    fallback.objectKinds = [{ key: 'all', label: "Barcha ob'ektlar" }];
    if (!config.enabled || !config.username || !config.password) {
      return { stats: fallback, kindFilter: this.azsKindFilterAll, token: '' };
    }

    try {
      const ctx = await this.loadAzsObjectKindContext(config, objectKind);
      if (!ctx.token) {
        return { stats: fallback, kindFilter: this.azsKindFilterAll, token: '' };
      }

      const headers = { Accept: 'application/json', Authorization: `Bearer ${ctx.token}` };
      const fetchJson = async (path: string, params?: string): Promise<any> => {
        const url = `${config.baseUrl}${path}${params ? `?${params}` : ''}`;
        const resp = await this.fetchWithTimeout(url, { method: 'GET', headers }, config.timeoutMs);
        if (!resp.ok) return null;
        return resp.json().catch(() => null);
      };

      const { devicesData, devicesAll, devicesFiltered, kindAll, postsForKind, objectKinds, kindFilter } = ctx;

      const devOnline = devicesFiltered.filter((d: any) => d?.isOnline === true).length;
      const devTotal = kindAll
        ? Number(devicesData?.objectCount ?? devicesAll.length)
        : devicesFiltered.length;

      const cardSample = Math.max(50, Math.min(3000, Number.parseInt(process.env.AZS_CARDS_SYNC_SAMPLE_SIZE ?? '500', 10) || 500));
      const [cardsData, sections] = await Promise.all([
        fetchJson('/Cards/GetCards', `page=0&countOnPage=${cardSample}`),
        this.fetchAllFuelTankSections(config, ctx.token),
      ]);

      // Grafik va jadval bilan bir manba: sinxronlangan fuel_entries (131/132), AZS API objectCount emas
      const w0 = this.refuelWindowBounds(0);
      const w6 = this.refuelWindowBounds(6);
      const wm = this.refuelWindowBounds('month');
      const [refuelTodayDb, refuelWeekDb, refuelMonthDb] = await Promise.all([
        this.countRefuelEventsDb(kindFilter, w0.startSql, w0.endSql),
        this.countRefuelEventsDb(kindFilter, w6.startSql, w6.endSql),
        this.countRefuelEventsDb(kindFilter, wm.startSql, wm.endSql),
      ]);
      let refuelTodayData = refuelTodayDb;
      let refuelWeekData = refuelWeekDb;
      let refuelMonthData = refuelMonthDb;
      /** Bugun / hafta / oy zapravkalar soni: AZS RefuelEvents objectCount (DB kechiksa ham kabinet bilan bir xil) */
      const refuelCountSrc = this.normalizeWhitespace(
        process.env.AZS_REFUEL_EVENTS_COUNT_SOURCE || process.env.AZS_REFUEL_MONTH_COUNT_SOURCE || 'api',
      ).toLowerCase();
      if (kindFilter.kindAll && refuelCountSrc !== 'db' && ctx.token) {
        const [apiToday, apiWeek, apiMonth] = await Promise.all([
          this.fetchAzsRefuelEventsObjectCount(config, ctx.token, new Date(w0.startUtc * 1000), new Date(w0.endUtc * 1000)),
          this.fetchAzsRefuelEventsObjectCount(config, ctx.token, new Date(w6.startUtc * 1000), new Date(w6.endUtc * 1000)),
          this.fetchAzsRefuelEventsObjectCount(config, ctx.token, new Date(wm.startUtc * 1000), new Date(wm.endUtc * 1000)),
        ]);
        if (apiToday != null) refuelTodayData = apiToday;
        if (apiWeek != null) refuelWeekData = apiWeek;
        if (apiMonth != null) refuelMonthData = apiMonth;
      }

      // Seksiya darajasi: warningLevel/blockedLevel asosida (AZS bilan aynan mos)
      let critical = 0, low = 0, normal = 0, totalLevelLiters = 0;
      for (const sec of sections) {
        const level = Number(sec?.levelGaugeLevel ?? 0);
        const blocked = Number(sec?.blockedLevel ?? 0);
        const warning = Number(sec?.warningLevel ?? 0);
        if (Number.isFinite(level) && level > 0) totalLevelLiters += level;
        if (level <= blocked) critical += 1;
        else if (level < warning) low += 1;
        else normal += 1;
      }

      const posts = postsForKind
        .map((p: any) => ({
          id: Number(p?.devicePostId ?? 0),
          name: String(p?.devicePostName ?? ''),
        }))
        .filter((p: { id: number; name: string }) => p.name);

      const azsSectionNames = Array.from(
        new Set<string>(
          sections.map((s: any, i: number) => this.azsSectionRowPrimaryName(s && typeof s === 'object' ? s : {}, i)),
        ),
      );

      const sectionGaugeRows = sections
        .map((s: any, i: number) => {
          const row = s && typeof s === 'object' ? (s as Record<string, any>) : {};
          const name = this.azsSectionRowPrimaryName(row, i);
          const liters = Number(s?.levelGaugeLevel ?? 0);
          return { name, liters: Number.isFinite(liters) ? liters : 0 };
        })
        .filter((r: { name: string; liters: number }) => Boolean(r.name));

      const cardAgg = this.aggregateCardSyncFromAzs(cardsData);

      const stats = {
        devices: { total: devTotal, online: devOnline, offline: Math.max(0, devTotal - devOnline) },
        sectionLevels: { critical, low, normal, total: critical + low + normal, totalLevelLiters: Math.round(totalLevelLiters) },
        cards: { total: cardAgg.total, synced: cardAgg.synced, unsynced: cardAgg.unsynced },
        refuels: { today: refuelTodayData, week: refuelWeekData, month: refuelMonthData },
        posts,
        objectKinds,
        azsSectionNames,
        sectionGaugeRows,
      };
      return { stats, kindFilter, token: ctx.token };
    } catch (error) {
      this.logger.warn(`AZS dashboard stats olishda xatolik: ${String((error as any)?.message ?? error)}`);
      throw error;
    }
  }

  private issuedLitersFromExternalRow(row: ExternalFuelRow): number {
    const payload = row?.payload && typeof row.payload === 'object' ? (row.payload as Record<string, any>) : {};
    const mode = this.normalizeWhitespace(process.env.AZS_SUMMARY_LITERS_MODE || 'hybrid').toLowerCase();
    if (mode === 'dut') {
      return this.parseNumber(payload?.issuedDut) ?? 0;
    }
    const num = (x: unknown) => {
      const v = this.parseNumber(x);
      return v && v > 0 ? v : null;
    };
    if (mode === 'counter') {
      return (
        num(payload?.value) ??
        num(payload?.issuedValue) ??
        num(payload?.issuedDut) ??
        num(payload?.issuedVirtual) ??
        num(payload?.differenceRefuel) ??
        this.parseNumber(row?.liters) ??
        0
      );
    }
    return (
      num(payload?.issuedDut) ??
      num(payload?.issuedVirtual) ??
      num(payload?.differenceRefuel) ??
      num(payload?.issuedValue) ??
      this.parseNumber(row?.liters) ??
      0
    );
  }

  private externalRowMatchesKindFilter(row: ExternalFuelRow, filter: AzsObjectKindFilter): boolean {
    if (filter.kindAll) return true;
    const did = this.normalizeWhitespace(row?.deviceId ?? '');
    const pid = this.normalizeWhitespace(row?.devicePostId ?? '');
    const pnm = this.normalizeWhitespace(row?.stationName ?? '');
    return (
      (did && filter.deviceIds.includes(did)) ||
      (pid && filter.postIds.includes(pid)) ||
      (pnm && filter.postNames.includes(pnm))
    );
  }

  private externalRowMatchesStationFilter(row: ExternalFuelRow, stationFilterRaw: string): boolean {
    const stationFilter = this.normalizeWhitespace(stationFilterRaw);
    if (!stationFilter || stationFilter.toLowerCase() === 'all') return true;
    return this.normalizeWhitespace(row?.stationName ?? '').toLowerCase() === stationFilter.toLowerCase();
  }

  private async fetchAzsRefuelChartRows(
    config: AzsConfig,
    token: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ExternalFuelRow[]> {
    const pageSize = Math.max(
      config.fetchPageSize,
      Math.min(2000, Number.parseInt(process.env.AZS_CHART_PAGE_SIZE ?? '1000', 10) || 1000),
    );
    const maxPages = Math.max(
      config.fetchMaxPages,
      Math.min(80, Number.parseInt(process.env.AZS_CHART_MAX_PAGES ?? '50', 10) || 50),
    );
    const chartConfig: AzsConfig = {
      ...config,
      fetchPageSize: pageSize,
      fetchMaxPages: maxPages,
    };
    return this.fetchEventsInRange(chartConfig, token, startDate, endDate);
  }

  private async getWindowStart(config: AzsConfig): Promise<Date> {
    // Faqat zapravka yozuvlari (eventsType=131/132) ning oxirgi event_time'sini olish
    // Barcha eventTypelardan MAX olish noto'g'ri — 216-type (soatlik o'lchov) har daqiqa yangilanadi
    // va 131-type yozuvlarning yangilarini o'tkazib yuboradi
    const latest = await this.fuelRepo.query(
      `SELECT MAX(event_time) as event_time FROM fuel_entries
       WHERE json_extract(payload, '$.eventsType') IN (131, 132)`,
    ) as Array<{ event_time?: string }>;

    const eventTimeStr = latest?.[0]?.event_time;
    if (eventTimeStr) {
      // SQLite "YYYY-MM-DD HH:MM:SS" formatini UTC deb o'qiymiz
      const iso = eventTimeStr.replace(' ', 'T') + (eventTimeStr.includes('.') ? 'Z' : '.000Z');
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) {
        return new Date(parsed.getTime() - config.overlapSeconds * 1000);
      }
    }

    return new Date(Date.now() - config.initialBackfillHours * 3600 * 1000);
  }

  private async fetchEventsByPath(
    config: AzsConfig,
    token: string,
    eventsPath: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ rows: ExternalFuelRow[]; objectCount: number }> {
    const aggregated: ExternalFuelRow[] = [];
    const seen = new Set<string>();
    let page = 0;
    let totalPages = 1;
    let objectCount = 0;

    while (page < totalPages && page < config.fetchMaxPages) {
      const params = new URLSearchParams();
      // Garveks events API: 0-indexed pages; legacy deviceRefillEvents uses lowercase params.
      const isDeviceRefill = eventsPath.toLowerCase().includes('devicerefill');
      if (isDeviceRefill) {
        params.set('dateStart', String(this.toUnixSeconds(startDate)));
        params.set('dateEnd', String(this.toUnixSeconds(endDate)));
        params.set('page', String(page));
        params.set('countOnPage', String(config.fetchPageSize));
        params.set('orderByDescending', 'true');
      } else {
        params.set('DateStart', String(this.toUnixSeconds(startDate)));
        params.set('DateEnd', String(this.toUnixSeconds(endDate)));
        params.set('Page', String(page));
        params.set('CountOnPage', String(config.fetchPageSize));
        params.set('OrderByDescending', 'true');
      }

      const url = `${config.baseUrl}${eventsPath}?${params.toString()}`;
      const response = await this.fetchWithRetry(
        `events page=${page}`,
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'uz',
            Authorization: `Bearer ${token}`,
          },
        },
        config.timeoutMs,
        config.requestRetries,
      );

      const text = await response.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      if (response.status === 401) {
        // Token muddati o'tgan — keshni tozalab qayta sinxronlashga yo'l qo'yamiz
        this.cachedToken = null;
        this.cachedTokenExpiresAt = 0;
        throw new BadRequestException('AZS token muddati o\'tgan (401), keyingi siklda yangilanadi');
      }
      if (!response.ok) {
        throw new BadRequestException(`AZS events olishda xatolik: ${response.status}`);
      }

      objectCount = Math.max(
        objectCount,
        Number.parseInt(String(payload?.objectCount ?? payload?.totalCount ?? 0), 10) || 0,
      );
      const reportedPageCount = Math.max(
        1,
        Number.parseInt(String(payload?.pageCount ?? payload?.totalPages ?? 1), 10) || 1,
      );
      const objectCountPageCount =
        objectCount > 0 ? Math.max(1, Math.ceil(objectCount / config.fetchPageSize)) : 1;
      totalPages = Math.max(reportedPageCount, objectCountPageCount);
      const rows = this.extractRows(payload);

      for (const row of rows) {
        const normalized = this.normalizeExternalRow(row, this.makeFallbackId(row));
        if (!normalized?.externalId) continue;
        if (seen.has(normalized.externalId)) continue;
        seen.add(normalized.externalId);
        aggregated.push(normalized);
      }

      if (rows.length === 0) break;
      page += 1;
    }

    return { rows: aggregated, objectCount };
  }

  private async fetchEvents(config: AzsConfig, token: string): Promise<ExternalFuelRow[]> {
    const startDate = await this.getWindowStart(config);
    const endDate = new Date(Date.now() + 60_000);
    return this.fetchEventsInRange(config, token, startDate, endDate);
  }

  /**
   * Bugungi AZS kunida DB to'liq to'ldirilmagan bo'lsa, kun boshidan eng birinchi yozuvgacha
   * tushib qolgan hodisalarni qayta olib keladi. Bu chart / "Итого" ko'rsatkichlarini
   * kabinet bilan bir xil ushlab turadi.
   */
  private async fetchCurrentDayRepairRows(config: AzsConfig, token: string): Promise<ExternalFuelRow[]> {
    const now = new Date();
    const todayYmd = this.azsCalendarYmdFromInstant(now);
    if (
      this.currentDayRepairYmd === todayYmd &&
      now.getTime() - this.currentDayRepairCheckedAt < this.currentDayRepairIntervalMs
    ) {
      return [];
    }

    this.currentDayRepairYmd = todayYmd;
    this.currentDayRepairCheckedAt = now.getTime();

    const { start, end } = this.parseDateBoundaries(todayYmd, todayYmd);
    const startSql = this.toSqliteDateTime(start);
    const endSql = this.toSqliteDateTime(end);
    const gapRows = (await this.fuelRepo.query(
      `
        SELECT COUNT(1) AS count, MIN(event_time) AS min_time
        FROM fuel_entries
        WHERE event_time >= ?
          AND event_time <= ?
          AND json_extract(payload, '$.eventsType') IN (131, 132)
      `,
      [startSql, endSql],
    )) as Array<{ count?: string; min_time?: string | null }>;

    const count = Number.parseInt(String(gapRows?.[0]?.count ?? '0'), 10) || 0;
    let repairEnd = new Date(Math.min(end.getTime(), Date.now() + 60_000));
    if (count > 0) {
      const earliestIso = this.sqliteToIso(gapRows?.[0]?.min_time);
      if (!earliestIso) return [];
      const earliestDate = new Date(earliestIso);
      if (Number.isNaN(earliestDate.getTime())) return [];
      if (earliestDate.getTime() <= start.getTime() + 60_000) {
        return [];
      }
      repairEnd = new Date(earliestDate.getTime() - 1000);
    }

    if (repairEnd.getTime() <= start.getTime()) {
      return [];
    }

    return this.fetchEventsInRange(config, token, start, repairEnd);
  }

  private async fetchEventsInRange(
    config: AzsConfig,
    token: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ExternalFuelRow[]> {
    const primary = await this.fetchEventsByPath(config, token, config.eventsPath, startDate, endDate);
    if (primary.rows.length > 0) return primary.rows;

    const normalizedPath = config.eventsPath.toLowerCase();
    if (
      (normalizedPath.includes('/events/refuelevents') || normalizedPath.includes('/events/devicerefillevents')) &&
      primary.objectCount > 0
    ) {
      const fallbackPath = this.deriveAzsDeviceEventsPath(config.eventsPath);
      const fallback = await this.fetchEventsByPath(config, token, fallbackPath, startDate, endDate);
      return fallback.rows;
    }

    return primary.rows;
  }

  private async persistRows(rows: ExternalFuelRow[]): Promise<{ inserted: number; updated: number }> {
    if (rows.length === 0) return { inserted: 0, updated: 0 };

    const latestById = new Map<string, ExternalFuelRow>();
    for (const row of rows) {
      const prev = latestById.get(row.externalId);
      if (!prev) {
        latestById.set(row.externalId, row);
        continue;
      }
      const prevTime = prev.eventTime?.getTime?.() ?? 0;
      const nextTime = row.eventTime?.getTime?.() ?? 0;
      if (nextTime >= prevTime) {
        latestById.set(row.externalId, row);
      }
    }

    const dedupedRows = [...latestById.values()];
    const externalIds = dedupedRows.map((row) => row.externalId);
    const chunkSize = 500;
    const existingRows: FuelEntry[] = [];
    for (let idx = 0; idx < externalIds.length; idx += chunkSize) {
      const ids = externalIds.slice(idx, idx + chunkSize);
      if (ids.length === 0) continue;
      const found = await this.fuelRepo
        .createQueryBuilder('entry')
        .where('entry.external_id IN (:...ids)', { ids })
        .getMany();
      existingRows.push(...found);
    }

    const existingById = new Map(existingRows.map((row) => [row.external_id, row]));
    const toInsert: FuelEntry[] = [];
    const toUpdate: FuelEntry[] = [];
    let inserted = 0;
    let updated = 0;

    for (const row of dedupedRows) {
      const existing = existingById.get(row.externalId);
      if (!existing) {
        toInsert.push(this.fuelRepo.create({
          external_id: row.externalId,
          source_system: 'azs-online',
          event_time: row.eventTime,
          vehicle_number: row.vehicleNumber,
          fuel_type: row.fuelType,
          liters: row.liters,
          amount: row.amount,
          station_name: row.stationName,
          driver_name: row.driverName,
          event_type: row.eventType,
          pay_type: row.payType,
          card_id: row.cardId,
          device_id: row.deviceId,
          device_post_id: row.devicePostId,
          event_message: row.eventMessage,
          entity_id: row.entityId,
          owner_id: row.ownerId,
          is_broken: row.isBroken,
          event_duration: row.eventDuration,
          payload: row.payload,
        }));
        inserted += 1;
        continue;
      }

      const nextEventTime = row.eventTime?.toISOString?.() || '';
      const prevEventTime = existing.event_time?.toISOString?.() || '';
      const changed =
        existing.vehicle_number !== row.vehicleNumber ||
        existing.fuel_type !== row.fuelType ||
        existing.liters !== row.liters ||
        existing.amount !== row.amount ||
        existing.station_name !== row.stationName ||
        existing.driver_name !== row.driverName ||
        existing.event_type !== row.eventType ||
        existing.pay_type !== row.payType ||
        existing.card_id !== row.cardId ||
        existing.device_id !== row.deviceId ||
        existing.device_post_id !== row.devicePostId ||
        existing.event_message !== row.eventMessage ||
        existing.entity_id !== row.entityId ||
        existing.owner_id !== row.ownerId ||
        existing.is_broken !== row.isBroken ||
        existing.event_duration !== row.eventDuration ||
        prevEventTime !== nextEventTime;

      if (!changed) continue;

      existing.event_time = row.eventTime;
      existing.vehicle_number = row.vehicleNumber;
      existing.fuel_type = row.fuelType;
      existing.liters = row.liters;
      existing.amount = row.amount;
      existing.station_name = row.stationName;
      existing.driver_name = row.driverName;
      existing.event_type = row.eventType;
      existing.pay_type = row.payType;
      existing.card_id = row.cardId;
      existing.device_id = row.deviceId;
      existing.device_post_id = row.devicePostId;
      existing.event_message = row.eventMessage;
      existing.entity_id = row.entityId;
      existing.owner_id = row.ownerId;
      existing.is_broken = row.isBroken;
      existing.event_duration = row.eventDuration;
      existing.payload = row.payload;
      toUpdate.push(existing);
      updated += 1;
    }

    if (toInsert.length > 0) {
      await this.fuelRepo.save(toInsert, { chunk: 200 });
    }
    if (toUpdate.length > 0) {
      await this.fuelRepo.save(toUpdate, { chunk: 200 });
    }

    return { inserted, updated };
  }

  async syncNow() {
    if (this.syncInFlight) return this.syncInFlight;

    this.syncInFlight = (async () => {
      const config = this.getConfig();
      this.lastSyncAttemptAt = Date.now();
      this.lastSyncStartedAt = this.lastSyncAttemptAt;
      this.ensureConfigForSync(config);

      try {
        const token = await this.requestToken(config);
        const [rows, repairRows] = await Promise.all([
          this.fetchEvents(config, token),
          this.fetchCurrentDayRepairRows(config, token),
        ]);
        const mergedRows = repairRows.length > 0 ? [...repairRows, ...rows] : rows;
        const persisted = await this.persistRows(mergedRows);
        this.lastSyncAt = Date.now();
        this.lastSyncDurationMs = this.lastSyncAt - this.lastSyncStartedAt;
        this.lastSyncError = null;
        this.failureStreak = 0;
        this.nextSyncAt = Date.now() + this.addJitter(config.autoSyncEveryMs);
        this.lastSyncStats = {
          mode: 'incremental',
          fetched: mergedRows.length,
          inserted: persisted.inserted,
          updated: persisted.updated,
        };
        return {
          status: 'ok',
          fetched: mergedRows.length,
          inserted: persisted.inserted,
          updated: persisted.updated,
          syncedAt: new Date(this.lastSyncAt).toISOString(),
        };
      } catch (error) {
        const message = String((error as any)?.message ?? error);
        this.lastSyncError = message;
        this.failureStreak += 1;
        const expMultiplier = Math.pow(2, Math.min(this.failureStreak - 1, 6));
        const delay = Math.min(config.retryMaxMs, config.autoSyncEveryMs * expMultiplier);
        this.nextSyncAt = Date.now() + this.addJitter(delay);
        this.logger.error(`AZS sync error: ${message}`);
        throw error;
      } finally {
        this.lastSyncDurationMs = Date.now() - this.lastSyncStartedAt;
        this.syncInFlight = null;
      }
    })();

    return this.syncInFlight;
  }

  private resolveHistoryStart(config: AzsConfig, dateFrom?: string): Date {
    if (dateFrom) {
      const parsed = this.parseDate(`${dateFrom}T00:00:00`);
      if (parsed) return parsed;
    }

    if (config.historyStartDate) {
      const parsed = this.parseDate(`${config.historyStartDate}T00:00:00`);
      if (parsed) return parsed;
    }

    return new Date(Date.now() - config.initialBackfillHours * 3600 * 1000);
  }

  private resolveHistoryEnd(dateTo?: string): Date {
    if (dateTo) {
      const parsed = this.parseDate(`${dateTo}T23:59:59.999`);
      if (parsed) return parsed;
    }
    return new Date(Date.now() + 60_000);
  }

  async syncHistory(dateFrom?: string, dateTo?: string, chunkDaysRaw?: string) {
    if (this.syncInFlight) return this.syncInFlight;

    this.syncInFlight = (async () => {
      const config = this.getConfig();
      this.lastSyncAttemptAt = Date.now();
      this.lastSyncStartedAt = this.lastSyncAttemptAt;
      this.ensureConfigForSync(config);

      try {
        const chunkDays = Math.max(
          1,
          Math.min(31, Number.parseInt(chunkDaysRaw ?? String(config.historyChunkDays), 10) || config.historyChunkDays),
        );

        let start = this.resolveHistoryStart(config, dateFrom);
        let end = this.resolveHistoryEnd(dateTo);
        if (end < start) {
          const tmp = start;
          start = end;
          end = tmp;
        }

        const token = await this.requestToken(config);
        const chunkMs = chunkDays * 24 * 3600 * 1000;
        let cursor = new Date(start);
        let fetched = 0;
        let inserted = 0;
        let updated = 0;
        let chunks = 0;

        while (cursor <= end) {
          const chunkStart = new Date(cursor);
          const chunkEnd = new Date(Math.min(end.getTime(), chunkStart.getTime() + chunkMs - 1000));
          const rows = await this.fetchEventsInRange(config, token, chunkStart, chunkEnd);
          const persisted = await this.persistRows(rows);
          fetched += rows.length;
          inserted += persisted.inserted;
          updated += persisted.updated;
          chunks += 1;

          cursor = new Date(chunkEnd.getTime() + 1000);
          if (cursor <= end && config.historySleepMs > 0) {
            await this.sleep(config.historySleepMs);
          }
        }

        this.lastSyncAt = Date.now();
        this.lastSyncDurationMs = this.lastSyncAt - this.lastSyncStartedAt;
        this.lastSyncError = null;
        this.failureStreak = 0;
        this.nextSyncAt = Date.now() + this.addJitter(config.autoSyncEveryMs);
        this.lastSyncStats = {
          mode: 'history',
          fetched,
          inserted,
          updated,
          chunks,
        };
        return {
          status: 'ok',
          mode: 'history',
          chunks,
          fetched,
          inserted,
          updated,
          from: start.toISOString(),
          to: end.toISOString(),
          syncedAt: new Date(this.lastSyncAt).toISOString(),
        };
      } catch (error) {
        const message = String((error as any)?.message ?? error);
        this.lastSyncError = message;
        this.failureStreak += 1;
        const expMultiplier = Math.pow(2, Math.min(this.failureStreak - 1, 6));
        const delay = Math.min(config.retryMaxMs, config.autoSyncEveryMs * expMultiplier);
        this.nextSyncAt = Date.now() + this.addJitter(delay);
        this.logger.error(`AZS history sync error: ${message}`);
        throw error;
      } finally {
        this.lastSyncDurationMs = Date.now() - this.lastSyncStartedAt;
        this.syncInFlight = null;
      }
    })();

    return this.syncInFlight;
  }

  private azsObjectsCache: { at: number; payload: Record<string, unknown> } | null = null;
  private azsReservoirsCache: { at: number; payload: Record<string, unknown> } | null = null;
  private azsFuelCardsCache = new Map<string, { at: number; payload: Record<string, unknown> }>();
  private readonly AZS_LIST_CACHE_MS = 8_000;
  private readonly AZS_FUEL_CARDS_CACHE_MS = 15_000;
  /** Rezervuarlar — AZS bilan yaqin real-time; ob'ektlar keshidan mustaqil */
  private readonly AZS_RESERVOIRS_CACHE_MS = 3_000;

  private deviceLastSyncIso(d: Record<string, any>): string | null {
    const raw = this.pickFirst(d ?? {}, [
      'lastSyncTime',
      'utcLastSync',
      'lastConnectionTime',
      'lastTransactionTime',
      'utcLastConnect',
      'synchronizationTime',
      'syncTime',
      'lastOnlineTime',
      'lastDataTime',
      'lastMessageTime',
      'lastPacketTime',
      'lastPing',
      'deviceUtcTime',
      'lastSuccessfulConnection',
    ]);
    const parsed = this.parseDate(raw);
    return parsed ? parsed.toISOString() : null;
  }

  private deviceDisplayName(d: Record<string, any>, index: number): string {
    const name = this.normalizeWhitespace(
      this.pickFirst(d, ['deviceName', 'name', 'controllerName', 'title', 'deviceTitle', 'displayName']) ??
        d?.deviceName ??
        d?.name,
    );
    if (name) return name;
    const id = this.normalizeWhitespace(d?.deviceId ?? d?.id ?? d?.deviceID ?? '');
    return id || `Device ${index + 1}`;
  }

  private deviceObjectKindLabel(d: Record<string, any>): string {
    const picked = this.pickFirst(d, [
      'objectTypeName',
      'objectTypeString',
      'deviceTypeName',
      'typeName',
      'objectKindName',
      'deviceObjectTypeName',
      'typeObjectName',
      'objectCategoryName',
    ]);
    const label = this.normalizeWhitespace(
      String(
        picked ??
          d?.objectTypeName ??
          d?.objectTypeString ??
          d?.deviceTypeName ??
          d?.typeName ??
          d?.objectKindName ??
          '',
      ),
    );
    if (label) return label;

    const n = this.parseNumber(
      d?.objectType ?? d?.objectTypeId ?? d?.deviceObjectType ?? d?.typeObject ?? d?.ObjectType ?? d?.objectKind,
    );
    const map: Record<number, string> = {
      1: 'АЗС',
      2: 'АТЗ',
      3: 'ТРК',
      4: 'Бустер',
      5: 'Калибровочная станция',
      6: 'Контроллер',
    };
    if (n != null) {
      const k = Math.trunc(n);
      if (k === 0) return 'АЗС';
      if (map[k]) return map[k];
      return `Тип ${k}`;
    }

    const raw = this.normalizeWhitespace(String(d?.objectType ?? d?.deviceObjectType ?? d?.kind ?? '')).toLowerCase();
    if (raw.includes('азс') || raw === 'azs' || raw === 'gasstation') return 'АЗС';
    if (raw.includes('атз') || raw === 'atz') return 'АТЗ';
    if (raw.includes('трк') || raw === 'trk') return 'ТРК';
    if (raw.includes('бустер') || raw.includes('booster')) return 'Бустер';
    if (raw.includes('калибр') || raw.includes('calibr')) return 'Калибровочная станция';
    if (raw.includes('контрол') || raw.includes('controller')) return 'Контроллер';

    // AZS hisobotida ko'pincha barcha qatorlar «АЗС» — API turini bermasa ham moslashish
    return 'АЗС';
  }

  /** TRK/post holati (AZS «Объекты» ichki jadval) — Garvex/TANTI kodlari */
  private devicePostStateLabel(p: Record<string, any>): string {
    const text = this.normalizeWhitespace(
      String(
        this.pickFirst(p, [
          'lastTrkStateName',
          'trkStateName',
          'devicePostStateName',
          'postStatusName',
          'stateName',
          'conditionName',
          'dispenserStateName',
          'devicePostStatusName',
          'trkStatusName',
        ]) ??
          p?.lastTrkStateName ??
          p?.trkStateName ??
          p?.devicePostStateName ??
          p?.stateName ??
          '',
      ),
    );
    if (text) return text;

    const code = this.parseNumber(
      p?.devicePostState ?? p?.trkState ?? p?.state ?? p?.postState ?? p?.dispenserState ?? p?.trkStatus,
    );
    if (code == null) return '—';
    const states: Record<number, string> = {
      1: 'Неисправность',
      2: 'Ожидание',
      3: 'Заблокирована',
      4: 'Ожидание',
      5: 'Остановка',
      6: 'Калибровка',
      7: 'Заправка',
      8: 'Свободен',
    };
    return states[Math.trunc(code)] ?? `Состояние ${Math.trunc(code)}`;
  }

  /** AZS «Объекты» — GetDevices */
  private azsClientLanguage(language?: string): 'uz' | 'ru' | 'en' {
    const raw = this.normalizeWhitespace(language || '').toLowerCase();
    if (raw.startsWith('ru')) return 'ru';
    if (raw.startsWith('en')) return 'en';
    return 'uz';
  }

  private azsUnixIso(value: unknown): string | null {
    const parsed = this.parseDate(value);
    return parsed ? parsed.toISOString() : null;
  }

  private azsLimitTypeLabel(value: unknown, language?: string): string {
    const code = Math.trunc(this.parseNumber(value) ?? -1);
    const lang = this.azsClientLanguage(language);
    const labels: Record<'uz' | 'ru' | 'en', Record<number, string>> = {
      uz: {
        0: 'Limitsiz',
        1: 'Kunlik limit',
        3: 'Oylik limit',
        4: 'Belgilangan davr',
        5: "Noma'lum muddat",
      },
      ru: {
        0: 'Безлимит',
        1: 'Лимит на день',
        3: 'Лимит на месяц',
        4: 'На определенный период',
        5: 'На неопределенный период',
      },
      en: {
        0: 'Unlimited',
        1: 'Daily limit',
        3: 'Monthly limit',
        4: 'Fixed period',
        5: 'Open period',
      },
    };
    return labels[lang][code] ?? (code >= 0 ? String(code) : '—');
  }

  private azsLimitStateLabel(value: unknown, language?: string): string {
    const code = Math.trunc(this.parseNumber(value) ?? -1);
    const lang = this.azsClientLanguage(language);
    const labels: Record<'uz' | 'ru' | 'en', Record<number, string>> = {
      uz: {
        0: 'Faol',
        1: 'Muddati tugagan',
        2: 'Tugagan',
        3: 'Limitdan oshgan',
        4: 'Sinxronlanmagan',
      },
      ru: {
        0: 'Активен',
        1: 'Истек',
        2: 'Исчерпан',
        3: 'Превышение лимита',
        4: 'Не синхронизован',
      },
      en: {
        0: 'Active',
        1: 'Expired',
        2: 'Depleted',
        3: 'Limit exceeded',
        4: 'Not synchronized',
      },
    };
    return labels[lang][code] ?? (code >= 0 ? String(code) : '—');
  }

  private azsCardGroupRow(row: Record<string, any>, index: number, page: number, pageSize: number, language?: string) {
    const limit = row?.groupLimit && typeof row.groupLimit === 'object' ? (row.groupLimit as Record<string, any>) : {};
    const limitType = this.parseNumber(limit.limitType);
    const limitState = this.parseNumber(limit.limitState);
    const cards = Array.isArray(row?.cards) ? row.cards : [];
    const cardRows = cards.map((card: any, cardIndex: number) => {
      const safeCard = card && typeof card === 'object' ? (card as Record<string, any>) : {};
      const typeRaw = this.normalizeWhitespace(
        String(
          this.pickFirst(safeCard, ['cardTypeName', 'typeName', 'cardKindName', 'kindName', 'type', 'cardType']) ?? '',
        ),
      );
      return {
        no: cardIndex + 1,
        cardId: this.parseNumber(safeCard.cardId ?? safeCard.id),
        cardName:
          this.normalizeWhitespace(
            String(this.pickFirst(safeCard, ['cardName', 'name', 'vehicleNumber', 'objectName']) ?? ''),
          ) || '—',
        cardNumber:
          this.normalizeWhitespace(
            String(this.pickFirst(safeCard, ['idCard', 'cardNumber', 'number', 'cardNo']) ?? ''),
          ) || '—',
        cardType: typeRaw && !/^\d+$/.test(typeRaw) ? typeRaw : 'MIFARE',
      };
    });
    return {
      id: this.normalizeWhitespace(String(row?.groupId ?? `group-${page}-${index}`)),
      no: (page - 1) * pageSize + index + 1,
      groupId: this.parseNumber(row?.groupId),
      groupName: this.normalizeWhitespace(row?.groupName) || '—',
      limitType,
      limitTypeLabel: this.azsLimitTypeLabel(limitType, language),
      limitStartAt: this.azsUnixIso(limit.startTime),
      limitEndAt: this.azsUnixIso(limit.endTime),
      setLiters: this.parseNumber(limit.setValue),
      availableLiters: this.parseNumber(limit.availableValue),
      issuedLiters: this.parseNumber(limit.amountValue),
      limitState,
      limitStateLabel: this.azsLimitStateLabel(limitState, language),
      syncAt: this.azsUnixIso(limit.syncTime),
      cardsCount: cards.length,
      cards: cardRows,
    };
  }

  private azsCardLimitRow(row: Record<string, any>, index: number, page: number, pageSize: number, language?: string) {
    const limitType = this.parseNumber(row?.limitType);
    const limitState = this.parseNumber(row?.limitState);
    return {
      id: this.normalizeWhitespace(String(row?.cardLimitId ?? `limit-${page}-${index}`)),
      no: (page - 1) * pageSize + index + 1,
      cardLimitId: this.parseNumber(row?.cardLimitId),
      cardId: this.parseNumber(row?.cardId),
      cardNumber: this.normalizeWhitespace(row?.idCard) || '—',
      cardName: this.normalizeWhitespace(row?.cardName) || '—',
      devicePostId: this.parseNumber(row?.devicePostId),
      devicePostName: this.normalizeWhitespace(row?.devicePostName) || '—',
      limitType,
      limitTypeLabel: this.azsLimitTypeLabel(limitType, language),
      limitStartAt: this.azsUnixIso(row?.startTime),
      limitEndAt: this.azsUnixIso(row?.endTime),
      setLiters: this.parseNumber(row?.setValue),
      availableLiters: this.parseNumber(row?.availableValue),
      issuedLiters: this.parseNumber(row?.amountValue),
      limitState,
      limitStateLabel: this.azsLimitStateLabel(limitState, language),
      syncAt: this.azsUnixIso(row?.syncTime),
      lastUpdateAt: this.azsUnixIso(row?.lastUpdateTime),
      isCommonLimit: this.parseBoolean(row?.isCommonLimit),
      isIndividualLimit: this.parseBoolean(row?.isIndividualLimit),
    };
  }

  async getAzsFuelCards(
    viewRaw?: string,
    pageRaw?: string,
    pageSizeRaw?: string,
    searchRaw?: string,
    languageRaw?: string,
  ): Promise<Record<string, unknown>> {
    const config = this.getConfig();
    const empty = {
      items: [] as unknown[],
      pagination: { total: 0, page: 1, pageSize: 100, totalPages: 1 },
      fetchedAt: new Date().toISOString(),
    };
    if (!config.enabled || !config.username || !config.password) {
      return { ...empty, enabled: false };
    }

    const view: AzsFuelCardsView = this.normalizeWhitespace(viewRaw).toLowerCase() === 'limits' ? 'limits' : 'groups';
    const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
    const pageSize = Math.max(10, Math.min(500, Number.parseInt(pageSizeRaw ?? '100', 10) || 100));
    const search = this.normalizeWhitespace(searchRaw || '');
    const language = this.azsClientLanguage(languageRaw);
    const cacheKey = `v3|${view}|${page}|${pageSize}|${search}|${language}`;
    const now = Date.now();
    const cached = this.azsFuelCardsCache.get(cacheKey);
    if (cached && now - cached.at < this.AZS_FUEL_CARDS_CACHE_MS) {
      return cached.payload;
    }

    const path = view === 'limits' ? '/CardsLimits/GetLimitsCards' : '/CardGroups/GetCardGroups';
    const params = new URLSearchParams();
    params.set('Page', String(page - 1));
    params.set('CountOnPage', String(pageSize));
    if (search) params.set('Search', search);

    const fetchPage = async (token: string) =>
      this.fetchWithRetry(
        `fuel-cards:${view}`,
        `${config.baseUrl}${path}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'Accept-Language': language,
          },
        },
        config.timeoutMs,
        config.requestRetries,
      );

    try {
      let token = await this.requestToken(config);
      let response = await fetchPage(token);
      if (response.status === 401) {
        token = await this.requestToken(config, true);
        response = await fetchPage(token);
      }
      if (!response.ok) {
        return {
          ...empty,
          pagination: { total: 0, page, pageSize, totalPages: 1 },
          error: `http_${response.status}`,
          enabled: true,
        };
      }

      const payload = await response.json().catch(() => null);
      const rows = Array.isArray(payload?.objects) ? payload.objects : this.extractRows(payload);
      const total = Math.max(0, Number.parseInt(String(payload?.objectCount ?? rows.length ?? 0), 10) || 0);
      const totalPages = Math.max(
        1,
        Number.parseInt(String(payload?.pageCount ?? (Math.ceil(total / pageSize) || 1)), 10) || 1,
      );
      const items = rows.map((row: any, index: number) => {
        const safeRow = row && typeof row === 'object' ? (row as Record<string, any>) : {};
        return view === 'limits'
          ? this.azsCardLimitRow(safeRow, index, page, pageSize, language)
          : this.azsCardGroupRow(safeRow, index, page, pageSize, language);
      });
      const result = {
        view,
        items,
        pagination: { total, page, pageSize, totalPages },
        fetchedAt: new Date().toISOString(),
        enabled: true,
      };
      this.azsFuelCardsCache.set(cacheKey, { at: now, payload: result });
      if (this.azsFuelCardsCache.size > 30) {
        const oldest = this.azsFuelCardsCache.keys().next().value;
        if (oldest) this.azsFuelCardsCache.delete(oldest);
      }
      return result;
    } catch (error) {
      this.logger.warn(`AZS fuel cards: ${String((error as any)?.message ?? error)}`);
      return {
        ...empty,
        pagination: { total: 0, page, pageSize, totalPages: 1 },
        error: 'fetch_failed',
        enabled: true,
      };
    }
  }

  async getAzsObjects(): Promise<Record<string, unknown>> {
    const config = this.getConfig();
    const empty = { items: [] as unknown[], total: 0, fetchedAt: new Date().toISOString() };
    if (!config.enabled || !config.username || !config.password) {
      return { ...empty, enabled: false };
    }
    const now = Date.now();
    if (this.azsObjectsCache && now - this.azsObjectsCache.at < this.AZS_LIST_CACHE_MS) {
      return this.azsObjectsCache.payload;
    }
    try {
      const token = await this.requestToken(config);
      const url = `${config.baseUrl}/Devices/GetDevices`;
      const resp = await this.fetchWithTimeout(
        url,
        { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } },
        config.timeoutMs,
      );
      if (!resp.ok) {
        return { ...empty, error: `http_${resp.status}`, fetchedAt: new Date().toISOString() };
      }
      const data = await resp.json().catch(() => null);
      const objects = Array.isArray(data?.objects) ? data.objects : [];

      let postsByDevice = new Map<string, Record<string, any>[]>();
      try {
        const postsUrl = `${config.baseUrl}/DevicePosts/GetDevicePosts`;
        const postsResp = await this.fetchWithTimeout(
          postsUrl,
          { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } },
          config.timeoutMs,
        );
        if (postsResp.ok) {
          const postsData = await postsResp.json().catch(() => null);
          const postsRaw = Array.isArray(postsData?.objects) ? postsData.objects : [];
          postsByDevice = new Map();
          for (const p of postsRaw) {
            const pr = p && typeof p === 'object' ? (p as Record<string, any>) : {};
            const did = this.normalizeWhitespace(String(pr?.deviceId ?? pr?.DeviceId ?? pr?.controllerId ?? ''));
            if (!did) continue;
            if (!postsByDevice.has(did)) postsByDevice.set(did, []);
            postsByDevice.get(did)!.push(pr);
          }
        }
      } catch {
        postsByDevice = new Map();
      }

      const items = objects.map((d: any, idx: number) => {
        const row = d && typeof d === 'object' ? (d as Record<string, any>) : {};
        const deviceId = this.normalizeWhitespace(String(row?.deviceId ?? row?.id ?? row?.deviceID ?? idx));
        const childPosts = postsByDevice.get(deviceId) ?? [];
        const children = childPosts.map((p, cidx) => {
          const name =
            this.normalizeWhitespace(
              String(
                p?.devicePostName ?? p?.postName ?? p?.name ?? '',
              ),
            ) || `Пост ${cidx + 1}`;
          return {
            id: this.normalizeWhitespace(String(p?.devicePostId ?? p?.id ?? `${deviceId}_${cidx}`)),
            name,
            stateLabel: this.devicePostStateLabel(p),
          };
        });
        return {
          id: deviceId,
          controllerName: this.deviceDisplayName(row, idx),
          objectKindLabel: this.deviceObjectKindLabel(row),
          isOnline: row?.isOnline === true || row?.isOnline === 1 || String(row?.connectionState).toLowerCase() === 'online',
          lastSyncAt: this.deviceLastSyncIso(row),
          children,
        };
      });
      const payload = {
        items,
        total: Number(data?.objectCount ?? items.length) || items.length,
        fetchedAt: new Date().toISOString(),
        enabled: true,
      };
      this.azsObjectsCache = { at: now, payload };
      return payload;
    } catch (error) {
      this.logger.warn(`AZS GetDevices (objects): ${String((error as any)?.message ?? error)}`);
      return { ...empty, error: 'fetch_failed', fetchedAt: new Date().toISOString(), enabled: true };
    }
  }

  /** Rezervuar hajmi (l) — AZS «Объем, л» */
  private reservoirVolumeLiters(row: Record<string, any>): number | null {
    return this.parseNumber(
      this.pickFirst(row, [
        'fullVolume',
        'maxVolume',
        'fuelTankVolume',
        'volume',
        'totalVolume',
        'capacity',
        'tankVolume',
        'maxFuelVolume',
        'nominalVolume',
        'maxSectionVolume',
        'sectionMaxVolume',
      ]),
    );
  }

  /** Hozirgi yoqilg'i hajmi (l) — foiz hisobi uchun */
  private reservoirCurrentLiters(row: Record<string, any>): number | null {
    return this.parseNumber(
      this.pickFirst(row, [
        'currentVolume',
        'fuelVolume',
        'volumeCurrent',
        'fuelCurrentVolume',
        'levelGaugeLevel',
        'currentLevel',
        'level',
      ]),
    );
  }

  /**
   * API ba'zan 0–1 oralig'ida foiz yuboradi (0,581 → 58,1%).
   * 100 dan katta qiymat — odatda litr yoki noto‘g‘ri maydon; foiz sifatida ishlatilmaydi.
   */
  private normalizeApiPercent(value: number | null): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    if (value < 0) return null;
    if (value > 100) return null;
    if (value > 0 && value <= 1) return value * 100;
    return value;
  }

  /** Hisoblangan / DUT foiz (AZS «Уровень расч. %» / «Уровень, %») — bir-birini buzmasdan */
  private reservoirPercents(row: Record<string, any>): { calc: number | null; actual: number | null } {
    const calcRaw = this.parseNumber(
      this.pickFirst(row, [
        'levelCalculatedPercent',
        'calculatedLevelPercent',
        'levelCalculationPercent',
        'virtualLevelPercent',
        'virtualFuelLevelPercent',
        'levelVirtualPercent',
        'calculatedFuelLevelPercent',
        'calcLevelPercent',
        'calcPercent',
        'levelPercentCalculated',
        'percentCalculated',
        'fuelTankCalculatedPercent',
        'gaugeCalculatedPercent',
        'calculatedLevel',
      ]),
    );
    const actualRaw = this.parseNumber(
      this.pickFirst(row, [
        'levelGaugePercent',
        'gaugeLevelPercent',
        'dutLevelPercent',
        'levelMeterPercent',
        'actualLevelPercent',
        'fuelLevelPercent',
        'levelPercent',
        'gaugeFuelLevelPercent',
        'realLevelPercent',
        'physLevelPercent',
        'fuelTankLevelPercent',
        'tankLevelPercent',
        'deviceFuelLevelPercent',
      ]),
    );
    const calcDirect = this.normalizeApiPercent(calcRaw);
    const actualDirect = this.normalizeApiPercent(actualRaw);

    let calc = calcDirect;
    let actual = actualDirect;

    /** Avvalo API dan kelgan aniq signalni birlashtiramiz — keyin hajmdan hisob */
    if (calc == null && actual != null) calc = actual;
    if (actual == null && calc != null) actual = calc;

    const maxL = this.reservoirVolumeLiters(row);
    const curL = this.reservoirCurrentLiters(row);
    if (maxL != null && maxL > 0 && curL != null) {
      const fromVol = (curL / maxL) * 100;
      if (calc == null) calc = fromVol;
      if (actual == null) actual = fromVol;
    }

    return { calc, actual };
  }

  private reservoirDisplayName(row: Record<string, any>, index: number): string {
    const nm = this.normalizeWhitespace(
      String(
        this.pickFirst(row, ['fuelTankName', 'name', 'tankName', 'deviceName', 'title']) ??
          row?.fuelTankName ??
          row?.name ??
          '',
      ),
    );
    if (nm) return nm;
    const sid = this.normalizeWhitespace(String(row?.fuelTankSectionId ?? row?.id ?? ''));
    return sid || `Резервуар ${index + 1}`;
  }

  /** Seksiya qatori → qaysi rezervuarga tegishli */
  private sectionParentTankId(row: Record<string, any>): string {
    const direct =
      row?.fuelTankId ??
      row?.deviceFuelTankId ??
      row?.FuelTankId ??
      this.pickFirst(row, ['fuelTankId', 'deviceFuelTankId', 'parentFuelTankId', 'tankId', 'fuelTankID']);
    return this.normalizeWhitespace(String(direct ?? ''));
  }

  /** AZS ichki jadval — seksiya (DUT, massa, harorat, sinxron, GSM) */
  private mapFuelTankSectionChild(row: Record<string, any>, idx: number): Record<string, unknown> {
    const id = this.normalizeWhitespace(
      String(row?.fuelTankSectionId ?? row?.id ?? row?.deviceFuelTankSectionId ?? idx),
    );
    const { calc, actual } = this.reservoirPercents(row);
    const sectionVolumeLiters = this.reservoirVolumeLiters(row);
    const dutAvailableLiters = this.parseNumber(
      this.pickFirst(row, [
        'sectionAvailableLevelDut',
        'sectionAvailableLevel',
        'levelDutLevel',
        'dutLevel',
        'dutAvailableLiters',
        'availableByDut',
        'availableDut',
        'fuelDutVolume',
        'volumeDut',
        'fuelVolumeDut',
        'diffDutLevel',
      ]),
    );
    const dutMassKg = this.parseNumber(
      this.pickFirst(row, ['massDut', 'dutMass', 'dutMassKg', 'weightDut', 'fuelMassDut', 'massByDut']),
    );
    const temperature = this.parseNumber(
      this.pickFirst(row, ['temperature', 'sectionTemperature', 'temp', 'fuelTemperature', 'productTemperature']),
    );
    const fuelTypeName = this.normalizeWhitespace(
      String(this.pickFirst(row, ['fuelTypeName', 'fuelName', 'gsmTypeName', 'productName']) ?? ''),
    );
    const explicitOnline =
      row?.isOnline === true ||
      row?.isOnline === 1 ||
      String(row?.connectionState ?? '').toLowerCase() === 'online' ||
      String(row?.connectionStatus ?? '').toLowerCase() === 'connected' ||
      String(row?.deviceConnectionState ?? '').toLowerCase() === 'online' ||
      row?.deviceIsOnline === true ||
      row?.deviceIsOnline === 1;

    const lastSyncIso = this.deviceLastSyncIso(row);
    const syncMs = lastSyncIso ? new Date(lastSyncIso).getTime() : NaN;
    const syncRecent = Number.isFinite(syncMs) && Date.now() - syncMs < 72 * 3600 * 1000;
    const levelL = this.reservoirCurrentLiters(row);
    const hasSensorReading =
      actual != null ||
      calc != null ||
      dutMassKg != null ||
      dutAvailableLiters != null ||
      temperature != null ||
      (levelL != null && levelL >= 0);

    /** AZS «На связи» — bayroq bo‘lmasa-yu, DUT/sinxron bo‘lsa ham aloqada deb ko‘rsatiladi */
    const isOnline = explicitOnline || (syncRecent && hasSensorReading);

    const name = this.azsSectionRowPrimaryName(row, idx);

    return {
      id,
      name,
      sectionVolumeLiters,
      levelLiters: this.reservoirCurrentLiters(row),
      levelCalcPercent: calc,
      levelPercent: actual,
      isOnline,
      dutAvailableLiters,
      dutMassKg,
      temperature,
      lastSyncAt: this.deviceLastSyncIso(row),
      fuelTypeName,
    };
  }

  /**
   * AZS «Резервуары» bir qator — bir nechta seksiya bo‘lsa, foizlar odatda seksiya hajmi bo‘yicha og‘irliklangan.
   * (ДКЗ_ТКМ: veb 58,1% — yagona tank qatoridagi 7,6% dan farq qilishi mumkin).
   */
  private aggregateTankPercentsFromSections(sectionRows: Record<string, any>[]): {
    calc: number | null;
    actual: number | null;
  } {
    if (!sectionRows.length) return { calc: null, actual: null };
    let sc = 0;
    let wc = 0;
    let sa = 0;
    let wa = 0;
    let sumC = 0;
    let cntC = 0;
    let sumA = 0;
    let cntA = 0;
    for (const srow of sectionRows) {
      const { calc, actual } = this.reservoirPercents(srow);
      const vol = this.reservoirVolumeLiters(srow);
      if (vol != null && vol > 0) {
        if (calc != null && Number.isFinite(calc)) {
          sc += calc * vol;
          wc += vol;
        }
        if (actual != null && Number.isFinite(actual)) {
          sa += actual * vol;
          wa += vol;
        }
      }
      if (calc != null && Number.isFinite(calc)) {
        sumC += calc;
        cntC += 1;
      }
      if (actual != null && Number.isFinite(actual)) {
        sumA += actual;
        cntA += 1;
      }
    }
    return {
      calc: wc > 0 ? sc / wc : cntC > 0 ? sumC / cntC : null,
      actual: wa > 0 ? sa / wa : cntA > 0 ? sumA / cntA : null,
    };
  }

  /** Tank qatori uchun foizlar: seksiya agregati + tank API + hajmdan */
  private tankLevelPercentsForRow(
    tankRow: Record<string, any>,
    sectionRowsForTank: Record<string, any>[],
  ): { calc: number | null; actual: number | null } {
    const fromTank = this.reservoirPercents(tankRow);
    let calc = fromTank.calc;
    let actual = fromTank.actual;

    if (sectionRowsForTank.length > 0) {
      const agg = this.aggregateTankPercentsFromSections(sectionRowsForTank);
      if (agg.calc != null) calc = agg.calc;
      if (agg.actual != null) actual = agg.actual;
    }

    if (calc == null && actual != null) calc = actual;
    if (actual == null && calc != null) actual = calc;

    const maxL = this.reservoirVolumeLiters(tankRow);
    const curL = this.reservoirCurrentLiters(tankRow);
    if (maxL != null && maxL > 0 && curL != null) {
      const fromVol = (curL / maxL) * 100;
      if (calc == null) calc = fromVol;
      if (actual == null) actual = fromVol;
    }

    return { calc, actual };
  }

  /** AZS «Резервуары» — asosan GetFuelTanks (nom, объём, 2x foiz); bo'lmasa seksiyalar */
  async getAzsReservoirs(): Promise<Record<string, unknown>> {
    const config = this.getConfig();
    const empty = { items: [] as unknown[], total: 0, fetchedAt: new Date().toISOString() };
    if (!config.enabled || !config.username || !config.password) {
      return { ...empty, enabled: false };
    }
    const now = Date.now();
    if (this.azsReservoirsCache && now - this.azsReservoirsCache.at < this.AZS_RESERVOIRS_CACHE_MS) {
      return this.azsReservoirsCache.payload;
    }
    try {
      const token = await this.requestToken(config);
      const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
      const fetchJson = async (path: string, params?: string): Promise<any> => {
        const url = `${config.baseUrl}${path}${params ? `?${params}` : ''}`;
        const resp = await this.fetchWithTimeout(url, { method: 'GET', headers }, config.timeoutMs);
        if (!resp.ok) return null;
        return resp.json().catch(() => null);
      };
      const [tanksData, sectionsRaw] = await Promise.all([
        fetchJson('/FuelTanks/GetFuelTanks', 'page=0&countOnPage=500'),
        this.fetchAllFuelTankSections(config, token),
      ]);
      const tanks = Array.isArray(tanksData?.objects) ? tanksData.objects : this.extractRows(tanksData);
      const sectionsByTankId = new Map<string, Record<string, unknown>[]>();
      const sectionRawRowsByTankId = new Map<string, Record<string, any>[]>();
      for (let si = 0; si < sectionsRaw.length; si++) {
        const s = sectionsRaw[si];
        const srow = s && typeof s === 'object' ? (s as Record<string, any>) : {};
        const tid = this.sectionParentTankId(srow);
        if (!tid) continue;
        const child = this.mapFuelTankSectionChild(srow, si);
        const bucket = sectionsByTankId.get(tid) ?? [];
        bucket.push(child);
        sectionsByTankId.set(tid, bucket);
        const rawBucket = sectionRawRowsByTankId.get(tid) ?? [];
        rawBucket.push(srow);
        sectionRawRowsByTankId.set(tid, rawBucket);
      }
      for (const [, list] of sectionsByTankId) {
        list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
      }

      let items: unknown[] = [];

      if (tanks.length > 0) {
        items = tanks.map((t: any, idx: number) => {
          const row = t && typeof t === 'object' ? (t as Record<string, any>) : {};
          const id = this.normalizeWhitespace(String(row?.fuelTankId ?? row?.id ?? row?.deviceFuelTankId ?? idx));
          const sectionRowsForTank = sectionRawRowsByTankId.get(id) ?? [];
          const { calc, actual } = this.tankLevelPercentsForRow(row, sectionRowsForTank);
          const volumeLiters = this.reservoirVolumeLiters(row);
          const children = sectionsByTankId.get(id) ?? [];
          return {
            id,
            name: this.reservoirDisplayName(row, idx),
            volumeLiters,
            levelCalcPercent: calc,
            levelPercent: actual,
            children,
          };
        });
      } else {
        items = sectionsRaw.map((s: any, idx: number) => {
          const row = s && typeof s === 'object' ? (s as Record<string, any>) : {};
          const id = this.normalizeWhitespace(String(row?.fuelTankSectionId ?? row?.id ?? row?.deviceFuelTankSectionId ?? idx));
          const { calc, actual } = this.reservoirPercents(row);
          const volumeLiters =
            this.reservoirVolumeLiters(row) ??
            this.parseNumber(row?.maxSectionVolume ?? row?.sectionMaxVolume ?? row?.fullVolume);
          const name = this.azsSectionRowPrimaryName(row, idx);
          return {
            id,
            name,
            volumeLiters,
            levelCalcPercent: calc,
            levelPercent: actual,
          };
        });
      }

      const payload = {
        items,
        total:
          (tanks.length > 0 ? Number(tanksData?.objectCount ?? items.length) : Number(items.length)) || items.length,
        fetchedAt: new Date().toISOString(),
        enabled: true,
      };
      this.azsReservoirsCache = { at: now, payload };
      return payload;
    } catch (error) {
      this.logger.warn(`AZS reservoirs: ${String((error as any)?.message ?? error)}`);
      return { ...empty, error: 'fetch_failed', fetchedAt: new Date().toISOString(), enabled: true };
    }
  }

  async getHealth() {
    const config = this.getConfig();
    const total = await this.fuelRepo.count();
    const syncing = Boolean(this.syncInFlight);
    const status = !config.enabled
      ? 'disabled'
      : syncing
        ? 'syncing'
        : this.lastSyncAt && !this.lastSyncError && Date.now() - this.lastSyncAt <= config.staleAfterMs
          ? 'online'
          : 'offline';

    return {
      source: 'AZS-Online',
      status,
      enabled: config.enabled,
      totalRecords: total,
      lastSyncAt: this.lastSyncAt ? new Date(this.lastSyncAt).toISOString() : null,
      lastSyncAttemptAt: this.lastSyncAttemptAt ? new Date(this.lastSyncAttemptAt).toISOString() : null,
      lastSyncStartedAt: this.lastSyncStartedAt ? new Date(this.lastSyncStartedAt).toISOString() : null,
      lastSyncDurationMs: this.lastSyncDurationMs || null,
      lastSyncError: this.lastSyncError,
      failureStreak: this.failureStreak,
      nextSyncAt: this.nextSyncAt ? new Date(this.nextSyncAt).toISOString() : null,
      syncInProgress: syncing,
      schedulerActive: Boolean(this.scheduler),
      requestRetries: config.requestRetries,
      lastSyncStats: this.lastSyncStats,
    };
  }

  /**
   * AZS va integratsiya jadvallari bir xil kun chegarasi: server TZ dan mustaqil,
   * standart UTC+5 (Toshkent). `AZS_CALENDAR_UTC_OFFSET_HOURS` bilan o'zgartirish mumkin.
   */
  private getAzsCalendarOffsetHours(): number {
    const n = Number.parseInt(process.env.AZS_CALENDAR_UTC_OFFSET_HOURS ?? '5', 10);
    if (!Number.isFinite(n) || n < -12 || n > 14) return 5;
    return n;
  }

  private azsCalendarTzOffsetString(): string {
    const h = this.getAzsCalendarOffsetHours();
    const sign = h >= 0 ? '+' : '-';
    const ah = Math.abs(h);
    return `${sign}${String(ah).padStart(2, '0')}:00`;
  }

  /** IANA zona — soat/sana qutisi; `AZS_CALENDAR_TIMEZONE` (default Asia/Toshkent) */
  private getAzsCalendarTimeZoneId(): string {
    const z = this.normalizeWhitespace(process.env.AZS_CALENDAR_TIMEZONE || 'Asia/Tashkent');
    return z || 'Asia/Tashkent';
  }

  /** Berilgan instant uchun AZS kalendar sanasi YYYY-MM-DD */
  private azsCalendarYmdFromInstant(d: Date): string {
    const tz = this.getAzsCalendarTimeZoneId();
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find((p) => p.type === 'year')?.value;
      const m = parts.find((p) => p.type === 'month')?.value;
      const day = parts.find((p) => p.type === 'day')?.value;
      if (y && m && day) return `${y}-${m}-${day}`;
    } catch {
      /* Intl (eski Node) */
    }
    const shifted = new Date(d.getTime() + this.getAzsCalendarOffsetHours() * 3600000);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
  }

  /** Soat qutisi `HH:00` — SQL `strftime` + offset bilan bir xil mantiq (Asia/Tashkent) */
  private azsCalendarHourBucketFromInstant(d: Date): string {
    const tz = this.getAzsCalendarTimeZoneId();
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: 'numeric',
        hourCycle: 'h23',
      }).formatToParts(d);
      const h = parts.find((p) => p.type === 'hour')?.value ?? '0';
      return `${h.padStart(2, '0')}:00`;
    } catch {
      const shifted = new Date(d.getTime() + this.getAzsCalendarOffsetHours() * 3600000);
      return `${String(shifted.getUTCHours()).padStart(2, '0')}:00`;
    }
  }

  /** DeviceEvents vaqt maydoni tartibi — `AZS_LEVEL_CHART_TIME_FIELDS` (vergul bilan) */
  private parseAzsLevelChartTimeFields(): string[] {
    const raw = this.normalizeWhitespace(
      process.env.AZS_LEVEL_CHART_TIME_FIELDS || 'timeStart,timeEnd,dateCreate,dateUpdate,date,time,eventTime,createdAt',
    );
    const parts = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : ['timeStart', 'timeEnd', 'dateCreate'];
  }

  private eachAzsDayKeyBetween(start: Date, end: Date): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();
    let t = start.getTime();
    const endT = end.getTime();
    while (t <= endT && keys.length < 370) {
      const k = this.azsCalendarYmdFromInstant(new Date(t));
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
      t += 86400000;
    }
    return keys;
  }

  private azsBucketKeyFromInstant(d: Date, sameDay: boolean): string {
    return sameDay ? this.azsCalendarHourBucketFromInstant(d) : this.azsCalendarYmdFromInstant(d);
  }

  /**
   * DeviceEvents (216 «ежечасная фиксация», 65468 «фиксация уровня») — AZS grafik tooltip bilan mos:
   * default `gauge` (levelGaugeLevel), keyin DUT/virtual.
   * `AZS_LEVEL_DEVICE_LITERS_MODE`: gauge | dut | virtual
   */
  private levelLitersFromAzsEventRow(row: Record<string, any>): number | null {
    /** AZS «уровень секций» / DeviceEvents — odatda DUT; `gauge` faqat `AZS_LEVEL_DEVICE_LITERS_MODE=gauge` bilan */
    const mode = this.normalizeWhitespace(process.env.AZS_LEVEL_DEVICE_LITERS_MODE || 'dut').toLowerCase();
    const chains: Record<string, unknown[]> = {
      gauge: [
        row?.levelGaugeLevel,
        row?.levelEndDut,
        row?.levelEndVirtual,
        row?.levelStartDut,
        row?.levelStartVirtual,
        row?.levelDutLevel,
        row?.dutLevel,
        row?.level,
        row?.volume,
        row?.value,
      ],
      dut: [
        row?.levelEndDut,
        row?.levelStartDut,
        row?.levelGaugeLevel,
        row?.levelEndVirtual,
        row?.levelStartVirtual,
        row?.levelDutLevel,
        row?.dutLevel,
        row?.level,
        row?.volume,
        row?.value,
      ],
      virtual: [
        row?.levelEndVirtual,
        row?.levelStartVirtual,
        row?.levelGaugeLevel,
        row?.levelEndDut,
        row?.levelStartDut,
        row?.levelDutLevel,
        row?.dutLevel,
        row?.level,
        row?.volume,
        row?.value,
      ],
    };
    const candidates = chains[mode] ?? chains.gauge;
    for (const c of candidates) {
      const n = this.parseNumber(c);
      if (n != null && Number.isFinite(n) && n >= 0) return n;
    }
    return null;
  }

  /** `AZS_LEVEL_DEVICE_EVENT_TYPES` — default 216 (soatlik fiksatsiya); 65468 qo‘shilsa, `216,65468` */
  private parseAzsLevelDeviceEventTypes(): number[] {
    const raw = this.normalizeWhitespace(process.env.AZS_LEVEL_DEVICE_EVENT_TYPES || '216');
    const parts = raw.split(/[,;\s]+/).map((s) => Number.parseInt(s.trim(), 10));
    const out = parts.filter((n) => Number.isFinite(n) && n > 0);
    return out.length ? out : [216];
  }

  /** Level grafik: post/rezervuar nomini seksiya deb aralashtirmaslik (AZS «секция») */
  private sectionNameFromAzsLevelEventRow(row: Record<string, any>): string {
    return this.normalizeWhitespace(
      String(
        this.pickFirst(row, ['fuelSectionName', 'sectionName', 'fuelTankSectionName']) ?? '',
      ),
    );
  }

  private sectionNameFromAzsEventRow(row: Record<string, any>): string {
    return this.normalizeWhitespace(
      String(
        this.pickFirst(row, [
          'fuelSectionName',
          'sectionName',
          'fuelTankSectionName',
          'fuelTankName',
          'name',
        ]) ?? '',
      ),
    );
  }

  /**
   * AZS «График уровня секций» uchun manba:
   * DeviceEventsdan level qatorlarini olib, vaqt qutisiga (soat/kun) tushiramiz.
   * DBdan hisoblangan qiymat bilan farq bo'lsa, API qiymati ustun.
   */
  private azsLevelMapCacheKey(
    config: AzsConfig,
    kindFilter: AzsObjectKindFilter,
    start: Date,
    end: Date,
    sameDay: boolean,
    stationFilterRaw: string,
    sectionFilterRaw: string,
    allSectionNames: string[],
  ): string {
    const kindKey = kindFilter.kindAll
      ? 'all'
      : [
          ...kindFilter.deviceIds.map((v) => `d:${this.normalizeWhitespace(v)}`),
          ...kindFilter.postIds.map((v) => `p:${this.normalizeWhitespace(v)}`),
          ...kindFilter.postNames.map((v) => `n:${this.normalizeWhitespace(v)}`),
        ]
          .filter(Boolean)
          .sort()
          .join(',');
    return [
      config.baseUrl,
      kindKey,
      start.toISOString(),
      end.toISOString(),
      sameDay ? 'day' : 'range',
      this.normalizeWhitespace(stationFilterRaw).toLowerCase() || 'all',
      this.normalizeWhitespace(sectionFilterRaw).toLowerCase() || 'all',
      allSectionNames.map((v) => this.normalizeWhitespace(v).toLowerCase()).filter(Boolean).sort().join(','),
    ].join('|');
  }

  private refreshAzsLevelMapInBackground(
    config: AzsConfig,
    token: string,
    kindFilter: AzsObjectKindFilter,
    start: Date,
    end: Date,
    sameDay: boolean,
    stationFilterRaw: string,
    sectionFilterRaw: string,
    allSectionNames: string[],
    cacheKey: string,
  ): void {
    if (this.azsLevelMapRefreshInFlight.has(cacheKey)) return;

    const task = this.fetchAzsLevelMapFromApi(
      config,
      token,
      kindFilter,
      start,
      end,
      sameDay,
      stationFilterRaw,
      sectionFilterRaw,
      allSectionNames,
    )
      .then((value) => {
        this.azsLevelMapCache.set(cacheKey, { at: Date.now(), value });
      })
      .catch((error) => {
        this.logger.warn(`AZS level chart background refresh: ${String((error as any)?.message ?? error)}`);
      })
      .finally(() => {
        this.azsLevelMapRefreshInFlight.delete(cacheKey);
      });

    this.azsLevelMapRefreshInFlight.set(cacheKey, task);
  }

  private async getAzsLevelMapFromApiCached(
    config: AzsConfig,
    token: string,
    kindFilter: AzsObjectKindFilter,
    start: Date,
    end: Date,
    sameDay: boolean,
    stationFilterRaw: string,
    sectionFilterRaw: string,
    allSectionNames: string[],
  ): Promise<Map<string, number> | null> {
    if (!token) return null;
    const cacheKey = this.azsLevelMapCacheKey(
      config,
      kindFilter,
      start,
      end,
      sameDay,
      stationFilterRaw,
      sectionFilterRaw,
      allSectionNames,
    );
    const cached = this.azsLevelMapCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.at < this.AZS_LEVEL_CHART_CACHE_MS) {
      return cached.value;
    }

    try {
      const value = await this.fetchAzsLevelMapFromApi(
        config,
        token,
        kindFilter,
        start,
        end,
        sameDay,
        stationFilterRaw,
        sectionFilterRaw,
        allSectionNames,
      );
      this.azsLevelMapCache.set(cacheKey, { at: Date.now(), value });
      return value;
    } catch (error) {
      this.logger.warn(`AZS level chart cache refresh: ${String((error as any)?.message ?? error)}`);
      if (cached) {
        this.refreshAzsLevelMapInBackground(
          config,
          token,
          kindFilter,
          start,
          end,
          sameDay,
          stationFilterRaw,
          sectionFilterRaw,
          allSectionNames,
          cacheKey,
        );
        return cached.value;
      }
      return null;
    }
  }

  private async fetchAzsLevelMapFromApi(
    config: AzsConfig,
    token: string,
    kindFilter: AzsObjectKindFilter,
    start: Date,
    end: Date,
    sameDay: boolean,
    stationFilterRaw: string,
    sectionFilterRaw: string,
    allSectionNames: string[],
  ): Promise<Map<string, number> | null> {
    const stationFilter = this.normalizeWhitespace(stationFilterRaw);
    const sectionFilter = this.normalizeWhitespace(sectionFilterRaw);
    const sectionAll = !sectionFilter || sectionFilter.toLowerCase() === 'all';
    const sectionTarget = sectionFilter;
    const explicitPaths = this.normalizeWhitespace(process.env.AZS_LEVEL_EVENTS_PATHS || '');
    const levelEventsPaths = (
      explicitPaths
        ? explicitPaths.split(',').map((p) => this.normalizePath(p, '')).filter(Boolean)
        : [
            this.normalizePath(
              process.env.AZS_LEVEL_EVENTS_PATH || this.deriveAzsDeviceEventsPath(config.eventsPath),
              '/events/DeviceEvents',
            ),
            this.deriveAzsDeviceEventsPath(config.eventsPath),
            this.normalizePath('/events/DeviceEvents', '/events/DeviceEvents'),
            this.normalizePath('/api/Events/GetDeviceEvents', '/api/Events/GetDeviceEvents'),
          ]
    ).filter((p, i, arr) => arr.indexOf(p) === i);

    const pageSize = Math.max(
      100,
      Math.min(2000, Number.parseInt(process.env.AZS_LEVEL_EVENTS_PAGE_SIZE ?? '1000', 10) || 1000),
    );
    const maxPages = Math.max(
      1,
      Math.min(80, Number.parseInt(process.env.AZS_LEVEL_EVENTS_MAX_PAGES ?? '50', 10) || 50),
    );

    const headers = {
      Accept: 'application/json',
      'Accept-Language': 'ru',
      Authorization: `Bearer ${token}`,
    };

    const deviceIds = new Set(kindFilter.deviceIds.map((x) => this.normalizeWhitespace(x)));
    const postIds = new Set(kindFilter.postIds.map((x) => this.normalizeWhitespace(x)));
    const postNames = new Set(kindFilter.postNames.map((x) => this.normalizeWhitespace(x)));

    // section -> chronological level points
    const sectionPoints = new Map<string, Array<{ at: number; level: number }>>();
    const sectionsSeen = new Set<string>();
    const allSectionBucketFirst = new Map<string, { at: number; seq: number; level: number }>();

    let pickedPath = '';
    const queryStart = new Date(start.getTime() - 48 * 3600 * 1000); // bucket boshidagi carry qiymat uchun
    const levelEventTypes = this.parseAzsLevelDeviceEventTypes();
    const sectionIdsForQuery: string[] = [];
    const sectionNameById = new Map<string, string>();
    if (!sectionAll && sectionTarget) {
      try {
        const secs = await this.fetchAllFuelTankSections(config, token);
        for (let i = 0; i < secs.length; i += 1) {
          const s = secs[i];
          const row = s && typeof s === 'object' ? (s as Record<string, any>) : {};
          const nm = this.azsSectionRowPrimaryName(row, i);
          const id = this.normalizeWhitespace(String(row?.fuelTankSectionId ?? row?.id ?? row?.deviceFuelTankSectionId ?? ''));
          if (id && nm) sectionNameById.set(id, nm);
          if (this.normalizeWhitespace(nm).toLowerCase() !== sectionTarget.toLowerCase()) continue;
          if (id && !sectionIdsForQuery.includes(id)) sectionIdsForQuery.push(id);
        }
      } catch {
        /* seksiya ro‘yxati — ixtiyoriy */
      }
    }

    const timeFields = this.parseAzsLevelChartTimeFields();

    for (const levelEventsPath of levelEventsPaths) {
      const localPoints = new Map<string, Array<{ at: number; level: number }>>();
      const localSecs = new Set<string>();
      const localAllSectionBucketFirst = new Map<string, { at: number; seq: number; level: number }>();
      const isDeviceRefill = levelEventsPath.toLowerCase().includes('devicerefill');
      let rowSeq = 0;

      const ingestRows = (rows: any[], pathLower: string, eventDedupe: Set<string> | null) => {
        for (const raw of rows) {
          const seq = rowSeq;
          rowSeq += 1;
          const row = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
          if (pathLower.includes('deviceevents')) {
            const etNum = this.parseNumber(this.pickFirst(row, ['eventsType', 'eventType', 'EventsType']));
            if (etNum != null && levelEventTypes.length && !levelEventTypes.includes(Math.trunc(etNum))) continue;
            const evId = this.normalizeWhitespace(String(row?.deviceEventId ?? row?.DeviceEventId ?? ''));
            if (evId && eventDedupe) {
              if (eventDedupe.has(evId)) continue;
              eventDedupe.add(evId);
            }
          }
          const eventTime = this.parseDate(this.pickFirst(row, timeFields));
          if (!eventTime) continue;
          const t = eventTime.getTime();
          if (t > end.getTime()) continue;

          if (!kindFilter.kindAll) {
            const did = this.normalizeWhitespace(String(this.pickFirst(row, ['deviceId', 'terminalId', 'controllerId']) ?? ''));
            const pid = this.normalizeWhitespace(String(this.pickFirst(row, ['devicePostId', 'postId']) ?? ''));
            const pnm = this.normalizeWhitespace(String(this.pickFirst(row, ['devicePostName']) ?? ''));
            const kindOk =
              (did && deviceIds.has(did)) ||
              (pid && postIds.has(pid)) ||
              (pnm && postNames.has(pnm));
            if (!kindOk) continue;
          }

          if (stationFilter && stationFilter.toLowerCase() !== 'all') {
            const rowStation = this.normalizeWhitespace(String(this.pickFirst(row, ['devicePostName', 'stationName', 'station']) ?? ''));
            if (rowStation.toLowerCase() !== stationFilter.toLowerCase()) continue;
          }

          const secId = this.normalizeWhitespace(
            String(this.pickFirst(row, ['fuelTankSectionId', 'deviceFuelTankSectionId', 'sectionId']) ?? ''),
          );
          let sec = this.sectionNameFromAzsLevelEventRow(row);
          if (!sec && secId) {
            const mapped = sectionNameById.get(secId);
            if (mapped) sec = mapped;
          }
          if (!sec && !sectionAll && sectionTarget && secId && sectionIdsForQuery.includes(secId)) {
            sec = sectionTarget;
          }
          if (!sec) continue;
          if (!sectionAll) {
            const sameByName = sec.toLowerCase() === sectionTarget.toLowerCase();
            const sameById = secId && sectionIdsForQuery.includes(secId);
            if (!sameByName && !sameById) continue;
          }

          const lvl = this.levelLitersFromAzsEventRow(row);
          if (lvl == null) continue;

          if (sectionAll && t >= start.getTime() && t <= end.getTime()) {
            const bucket = this.azsBucketKeyFromInstant(new Date(t), sameDay);
            const prevFirst = localAllSectionBucketFirst.get(bucket);
            if (!prevFirst || t < prevFirst.at || (t === prevFirst.at && seq < prevFirst.seq)) {
              localAllSectionBucketFirst.set(bucket, { at: t, seq, level: lvl });
            }
          }

          const arr = localPoints.get(sec) ?? [];
          arr.push({ at: t, level: lvl });
          localPoints.set(sec, arr);
          localSecs.add(sec);
        }
      };

      if (isDeviceRefill) {
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= maxPages) {
          const params = new URLSearchParams();
          params.set('dateStart', String(this.toUnixSeconds(queryStart)));
          params.set('dateEnd', String(this.toUnixSeconds(end)));
          params.set('page', String(page - 1));
          params.set('countOnPage', String(pageSize));
          params.set('orderByDescending', 'false');

          const url = `${config.baseUrl}${levelEventsPath}?${params.toString()}`;
          const response = await this.fetchWithTimeout(url, { method: 'GET', headers }, config.timeoutMs);
          if (!response.ok) break;
          const payload = await response.json().catch(() => null);
          const rows = this.extractRows(payload);
          if (!rows.length) break;

          totalPages = Math.max(1, Number.parseInt(String(payload?.pageCount ?? payload?.totalPages ?? 1), 10) || 1);
          ingestRows(rows, levelEventsPath.toLowerCase(), null);
          page += 1;
        }
      } else {
        /** Garvex ko‘pincha 0-sahifa; boshqa serverlar uchun `AZS_LEVEL_EVENTS_PAGE_ZERO_BASED=false` */
        const usePageZero = this.normalizeWhitespace(process.env.AZS_LEVEL_EVENTS_PAGE_ZERO_BASED ?? 'true').toLowerCase() !== 'false';
        const eventDedupe = new Set<string>();
        let pageIdx = usePageZero ? 0 : 1;
        let totalPages = 1;
        while (true) {
          if (usePageZero) {
            if (pageIdx >= totalPages || pageIdx >= maxPages) break;
          } else if (pageIdx > totalPages || pageIdx > maxPages) {
            break;
          }

          const params = new URLSearchParams();
          params.set('DateStart', String(this.toUnixSeconds(queryStart)));
          params.set('DateEnd', String(this.toUnixSeconds(end)));
          params.set('Page', String(pageIdx));
          params.set('CountOnPage', String(pageSize));
          params.set('OrderByDescending', 'false');
          const pathLower = levelEventsPath.toLowerCase();
          if (pathLower.includes('deviceevents')) {
            const orderBy = this.normalizeWhitespace(process.env.AZS_LEVEL_DEVICE_EVENTS_ORDER_BY ?? 'TimeStart');
            if (orderBy && orderBy.toLowerCase() !== 'off' && orderBy !== '-') {
              params.set('OrderBy', orderBy);
            }
            for (const et of levelEventTypes) {
              params.append('EventTypes', String(et));
            }
            for (const sid of sectionIdsForQuery) {
              params.append('FuelTankSectionIds', sid);
            }
          }

          const url = `${config.baseUrl}${levelEventsPath}?${params.toString()}`;
          const response = await this.fetchWithTimeout(url, { method: 'GET', headers }, config.timeoutMs);
          if (!response.ok) break;
          const payload = await response.json().catch(() => null);
          const rows = this.extractRows(payload);
          if (!rows.length) break;

          totalPages = Math.max(1, Number.parseInt(String(payload?.pageCount ?? payload?.totalPages ?? 1), 10) || 1);
          ingestRows(rows, pathLower, eventDedupe);
          pageIdx += 1;
        }
      }
      if (localPoints.size > 0) {
        pickedPath = levelEventsPath;
        for (const [sec, pts] of localPoints.entries()) {
          sectionPoints.set(sec, pts);
        }
        for (const s of localSecs) sectionsSeen.add(s);
        for (const [bucket, point] of localAllSectionBucketFirst.entries()) {
          allSectionBucketFirst.set(bucket, point);
        }
        break;
      }
    }

    if (sectionPoints.size === 0) return null;
    if (pickedPath) {
      this.logger.debug?.(`AZS level chart source path: ${pickedPath}`);
    }

    const bucketsOrdered = sameDay
      ? Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)
      : this.eachAzsDayKeyBetween(start, end);
    /** Soat qutisi / seksiya → shu soatdagi oxirgi o‘lchov (216 bir necha marta kelsa — AZS oxirgisiga yaqin) */
    const bucketSecLast = new Map<string, Map<string, { at: number; level: number }>>();
    const sectionBeforeStart = new Map<string, { at: number; level: number }>();
    for (const [sec, pts] of sectionPoints.entries()) {
      const sortedPts = [...pts].sort((a, b) => a.at - b.at);
      for (const p of sortedPts) {
        if (p.at < start.getTime()) {
          const prevBeforeStart = sectionBeforeStart.get(sec);
          if (!prevBeforeStart || p.at >= prevBeforeStart.at) {
            sectionBeforeStart.set(sec, { at: p.at, level: p.level });
          }
          continue;
        }
        if (p.at > end.getTime()) continue;
        const b = this.azsBucketKeyFromInstant(new Date(p.at), sameDay);
        let secMap = bucketSecLast.get(b);
        if (!secMap) {
          secMap = new Map();
          bucketSecLast.set(b, secMap);
        }
        const prev = secMap.get(sec);
        if (!prev || p.at >= prev.at) secMap.set(sec, { at: p.at, level: p.level });
      }
    }

    const imputedNames = allSectionNames.map((n) => this.normalizeWhitespace(String(n ?? ''))).filter(Boolean);
    /** AZS ro‘yxati tartibini saqlaymiz, keyin eventlarda ko‘ringan qo‘shimcha seksiyalarni append qilamiz. */
    const orderedSections = Array.from(
      new Set<string>([
        ...imputedNames,
        ...sectionPoints.keys(),
      ]),
    );

    /** «Все секции»: AZS grafikdagi xulq amalda eng katta seksiya leveliga yaqin. */
    const aggAll = this.normalizeWhitespace(process.env.AZS_LEVEL_ALL_SECTIONS_AGG || 'max').toLowerCase();
    const allSectionsUseMax = aggAll !== 'avg';

    const levelMap = new Map<string, number>();
    if (sectionAll && allSectionBucketFirst.size > 0) {
      for (const [bucket, point] of allSectionBucketFirst.entries()) {
        if (Number.isFinite(point.level)) {
          levelMap.set(bucket, point.level);
        }
      }
      return levelMap;
    }

    const sectionCarryLevel = new Map<string, number>();
    for (const sec of orderedSections) {
      const prev = sectionBeforeStart.get(sec);
      if (prev && Number.isFinite(prev.level)) {
        sectionCarryLevel.set(sec, prev.level);
      }
    }
    if (sectionAll) {
      for (const b of bucketsOrdered) {
        const secMap = bucketSecLast.get(b);
        if (secMap) {
          for (const [sec, pick] of secMap.entries()) {
            if (Number.isFinite(pick.level)) {
              sectionCarryLevel.set(sec, pick.level);
            }
          }
        }
        let max = Number.NEGATIVE_INFINITY;
        let sum = 0;
        let cnt = 0;
        for (const sec of orderedSections) {
          const level = sectionCarryLevel.get(sec);
          if (level == null || !Number.isFinite(level)) continue;
          max = Math.max(max, level);
          sum += level;
          cnt += 1;
        }
        if (cnt > 0) {
          levelMap.set(b, allSectionsUseMax ? max : sum / cnt);
        }
      }
    } else {
      const target = this.normalizeWhitespace(sectionTarget);
      const lowerTarget = target.toLowerCase();
      for (const b of bucketsOrdered) {
        const secMap = bucketSecLast.get(b);
        if (secMap) {
          for (const [sec, pick] of secMap.entries()) {
            if (Number.isFinite(pick.level)) {
              sectionCarryLevel.set(sec, pick.level);
            }
          }
        }
        let level = sectionCarryLevel.get(target);
        if (level == null) {
          for (const [k, value] of sectionCarryLevel.entries()) {
            if (k.toLowerCase() === lowerTarget) {
              level = value;
              break;
            }
          }
        }
        if (level == null && secMap) {
          for (const [k, a] of secMap.entries()) {
            if (k.toLowerCase() === lowerTarget) {
              level = a.level;
              break;
            }
          }
        }
        if (level != null && Number.isFinite(level)) {
          levelMap.set(b, level);
        }
      }
    }

    return levelMap;
  }

  /** Ingest / operator ko‘rinishi — bir nechta maydon */
  private issuedLitersSql(alias: string): string {
    const j = (path: string) => `CAST(json_extract(${alias}.payload, '${path}') AS REAL)`;
    return `COALESCE(NULLIF(${j('$.issuedDut')}, 0), NULLIF(${j('$.issuedVirtual')}, 0), NULLIF(${j('$.differenceRefuel')}, 0), NULLIF(${j('$.issuedValue')}, 0), ${alias}.liters, 0)`;
  }

  /**
   * AZS «Итого» / grafik / postlar jadvali — kabinetdagi chiqarilgan hajm bilan mos: standart `hybrid`
   * (issuedDut → issuedVirtual → differenceRefuel → issuedValue → liters). Faqat DUT: `AZS_SUMMARY_LITERS_MODE=dut`.
   */
  private issuedLitersSummarySql(alias: string): string {
    const mode = this.normalizeWhitespace(process.env.AZS_SUMMARY_LITERS_MODE || 'hybrid').toLowerCase();
    const j = (path: string) => `CAST(json_extract(${alias}.payload, '${path}') AS REAL)`;
    if (mode === 'dut') {
      const dut = `CAST(json_extract(${alias}.payload, '$.issuedDut') AS REAL)`;
      return `COALESCE(${dut}, 0)`;
    }
    if (mode === 'counter') {
      return `COALESCE(NULLIF(${j('$.value')}, 0), NULLIF(${j('$.issuedValue')}, 0), NULLIF(${j('$.issuedDut')}, 0), NULLIF(${j('$.issuedVirtual')}, 0), NULLIF(${j('$.differenceRefuel')}, 0), ${alias}.liters, 0)`;
    }
    return this.issuedLitersSql(alias);
  }

  /** Operations table AZS counter mode: value -> issuedValue -> DUT/virtual fallback. */
  private issuedLitersOperationsSql(alias: string): string {
    const mode = this.normalizeWhitespace(process.env.AZS_OPERATIONS_LITERS_MODE || 'counter').toLowerCase();
    const j = (path: string) => `CAST(json_extract(${alias}.payload, '${path}') AS REAL)`;
    if (mode === 'dut') {
      return `COALESCE(NULLIF(${j('$.issuedDut')}, 0), NULLIF(${j('$.issuedVirtual')}, 0), ${alias}.liters, 0)`;
    }
    if (mode === 'hybrid') {
      return `COALESCE(NULLIF(${j('$.issuedDut')}, 0), NULLIF(${j('$.issuedVirtual')}, 0), NULLIF(${j('$.differenceRefuel')}, 0), NULLIF(${j('$.issuedValue')}, 0), NULLIF(${j('$.value')}, 0), ${alias}.liters, 0)`;
    }
    return `COALESCE(NULLIF(${j('$.value')}, 0), NULLIF(${j('$.issuedValue')}, 0), NULLIF(${j('$.issuedDut')}, 0), NULLIF(${j('$.issuedVirtual')}, 0), NULLIF(${j('$.differenceRefuel')}, 0), ${alias}.liters, 0)`;
  }

  private sqlDatetimeShiftHoursSqlite(columnSql: string): string {
    const h = this.getAzsCalendarOffsetHours();
    if (h === 0) return `datetime(${columnSql})`;
    const mod = `${h >= 0 ? '+' : ''}${h} hours`;
    return `datetime(${columnSql}, '${mod}')`;
  }

  private sqlEntryBucketHour(): string {
    return `strftime('%H:00', ${this.sqlDatetimeShiftHoursSqlite('entry.event_time')})`;
  }

  private sqlEntryBucketDay(): string {
    return `strftime('%Y-%m-%d', ${this.sqlDatetimeShiftHoursSqlite('entry.event_time')})`;
  }

  private sqlRawEventTimeBucketHour(): string {
    return `strftime('%H:00', ${this.sqlDatetimeShiftHoursSqlite('event_time')})`;
  }

  private sqlRawEventTimeBucketDay(): string {
    return `strftime('%Y-%m-%d', ${this.sqlDatetimeShiftHoursSqlite('event_time')})`;
  }

  private litersFromStoredEntry(row: FuelEntry): number {
    const p = row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {};
    const num = (x: unknown): number | null => {
      if (x == null || x === '') return null;
      const v = typeof x === 'number' ? x : Number.parseFloat(String(x).replace(',', '.'));
      return Number.isFinite(v) && v > 0 ? v : null;
    };
    const mode = this.normalizeWhitespace(process.env.AZS_SUMMARY_LITERS_MODE || 'hybrid').toLowerCase();
    if (mode === 'dut') {
      return num(p.issuedDut) ?? row.liters ?? 0;
    }
    if (mode === 'counter') {
      return (
        num(p.value) ??
        num(p.issuedValue) ??
        num(p.issuedDut) ??
        num(p.issuedVirtual) ??
        num(p.differenceRefuel) ??
        row.liters ??
        0
      );
    }
    return (
      num(p.issuedDut) ??
      num(p.issuedVirtual) ??
      num(p.differenceRefuel) ??
      num(p.issuedValue) ??
      row.liters ??
      0
    );
  }

  private parseDateBoundaries(dateFrom?: string, dateTo?: string): { start: Date; end: Date } {
    const tz = this.azsCalendarTzOffsetString();
    const now = new Date();
    if (!dateFrom && !dateTo) {
      const ymd = this.azsCalendarYmdFromInstant(now);
      const start = new Date(`${ymd}T00:00:00.000${tz}`);
      const end = new Date(`${ymd}T23:59:59.999${tz}`);
      return { start, end };
    }

    const fromStr = dateFrom ?? dateTo;
    const toStr = dateTo ?? dateFrom ?? fromStr;
    const start = new Date(`${fromStr}T00:00:00.000${tz}`);
    const end = new Date(`${toStr}T23:59:59.999${tz}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      const ymd = this.azsCalendarYmdFromInstant(now);
      const s = new Date(`${ymd}T00:00:00.000${tz}`);
      const e = new Date(`${ymd}T23:59:59.999${tz}`);
      return { start: s, end: e };
    }
    if (end < start) return { start: end, end: start };
    return { start, end };
  }

  private formatShortDate(isoDay: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
    if (m) return `${m[3]}.${m[2]}`;
    const date = new Date(`${isoDay}T00:00:00`);
    if (Number.isNaN(date.getTime())) return isoDay;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
  }

  private toSqliteDateTime(date: Date): string {
    // fuel_entries.event_time is stored in UTC-like datetime text;
    // convert local boundary dates to UTC before SQL filtering.
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    const second = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  // SQLite "YYYY-MM-DD HH:MM:SS" → ISO UTC string "YYYY-MM-DDTHH:MM:SS.000Z"
  private sqliteToIso(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const str = String(value).trim();
    if (!str) return null;
    // Already ISO format
    if (str.includes('T') && str.endsWith('Z')) return str;
    // SQLite format: "2026-04-10 09:59:35.000" — treat as UTC
    const iso = str.replace(' ', 'T') + (str.includes('.') ? 'Z' : '.000Z');
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  async getOperations(
    pageRaw?: string,
    pageSizeRaw?: string,
    station?: string,
    section?: string,
    dateFrom?: string,
    dateTo?: string,
    objectKind?: string,
  ) {
    const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(pageSizeRaw ?? '10', 10) || 10));

    const { start, end } = this.parseDateBoundaries(dateFrom, dateTo);
    const startSql = this.toSqliteDateTime(start);
    const endSql = this.toSqliteDateTime(end);

    const config = this.getConfig();
    const { kindFilter } = await this.loadAzsObjectKindContext(config, objectKind);

    let query = this.fuelRepo
      .createQueryBuilder('entry')
      .where("json_extract(entry.payload, '$.eventsType') IN (131, 132)")
      .andWhere('entry.event_time >= :start', { start: startSql })
      .andWhere('entry.event_time <= :end', { end: endSql })
      .orderBy('entry.event_time', 'DESC')
      .addOrderBy('entry.id', 'DESC');
    query = this.applyObjectKindToFuelQuery(query, kindFilter);

    const stationFilter = this.normalizeWhitespace(station);
    if (stationFilter && stationFilter.toLowerCase() !== 'all') {
      query = query.andWhere(
        "COALESCE(json_extract(entry.payload, '$.devicePostName'), entry.station_name, '') = :station",
        { station: stationFilter },
      );
    }

    const sectionFilter = this.normalizeWhitespace(section);
    if (sectionFilter && sectionFilter.toLowerCase() !== 'all') {
      query = query.andWhere(
        `COALESCE(
          json_extract(entry.payload, '$.fuelSectionName'),
          json_extract(entry.payload, '$.devicePostName'),
          json_extract(entry.payload, '$.fuelTankName'),
          'Noma''lum'
        ) = :section`,
        { section: sectionFilter },
      );
    }

    const total = await query.getCount();
    const totalLitersRow = await query
      .clone()
      .select(`COALESCE(SUM(${this.issuedLitersOperationsSql('entry')}), 0)`, 'liters')
      .getRawOne<{ liters: string }>();
    const totalLiters = Math.round((Number.parseFloat(String(totalLitersRow?.liters ?? '0')) || 0) * 100) / 100;
    const rows = await query
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany();

    return {
      items: rows.map((row) => {
        const p: Record<string, any> = row.payload && typeof row.payload === 'object' ? row.payload : {};
        const cardNumber = this.normalizeWhitespace(p.idCard ?? p.cardNumber ?? '') || null;
        const cardName = this.normalizeWhitespace(p.cardName ?? '') || null;
        const groupName = this.normalizeWhitespace(p.groupName ?? '') || null;
        const fuelSectionName = this.normalizeWhitespace(p.fuelSectionName ?? '') || null;
        const levelStartDut = p.levelStartDut != null ? Number(p.levelStartDut) : null;
        const levelEndDut = p.levelEndDut != null ? Number(p.levelEndDut) : null;
        const n = (x: unknown): number | null => {
          if (x == null || x === '') return null;
          const v = typeof x === 'number' ? x : Number.parseFloat(String(x).replace(',', '.'));
          return Number.isFinite(v) ? v : null;
        };
        /**
         * Operatsiyalar jadvali ("Выдано по счётчику, л") uchun default — counter:
         * value -> issuedValue -> DUT/virtual fallback.
         * Kerak bo'lsa `AZS_OPERATIONS_LITERS_MODE=dut|hybrid|counter` bilan boshqariladi.
         */
        const opsMode = this.normalizeWhitespace(process.env.AZS_OPERATIONS_LITERS_MODE || 'counter').toLowerCase();
        const issuedValue =
          opsMode === 'dut'
            ? (n(p.issuedDut) ?? n(p.issuedVirtual) ?? row.liters ?? null)
            : opsMode === 'hybrid'
              ? (n(p.issuedDut) ??
                  n(p.issuedVirtual) ??
                  n(p.differenceRefuel) ??
                  n(p.issuedValue) ??
                  n(p.value) ??
                  row.liters ??
                  null)
              : (n(p.value) ??
                  n(p.issuedValue) ??
                  n(p.issuedDut) ??
                  n(p.issuedVirtual) ??
                  n(p.differenceRefuel) ??
                  row.liters ??
                  null);
        const stationDisplay =
          this.normalizeWhitespace(String(p.devicePostName ?? p.DevicePostName ?? row.station_name ?? '')) || '-';
        return {
          id: row.id,
          vehicle: row.vehicle_number || '-',
          fuelType: row.fuel_type || "Noma'lum",
          liters: row.liters,
          issuedValue: issuedValue ?? row.liters ?? null,
          station: stationDisplay,
          driver: row.driver_name || '-',
          time: this.sqliteToIso(row.event_time),
          eventType: row.event_type,
          payType: row.pay_type,
          cardId: row.card_id,
          cardNumber,
          cardName,
          groupName,
          fuelSectionName,
          levelStartDut,
          levelEndDut,
          deviceId: row.device_id,
          devicePostId: row.device_post_id,
          eventMessage: row.event_message,
          entityId: row.entity_id,
          ownerId: row.owner_id,
          isBroken: row.is_broken,
          eventDuration: row.event_duration,
        };
      }),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      summary: {
        liters: totalLiters,
      },
    };
  }

  async getSummary(
    dateFrom?: string,
    dateTo?: string,
    station?: string,
    recentLimitRaw?: string,
    section?: string,
    objectKind?: string,
    compactRaw?: string,
  ) {
    const config = this.getConfig();
    const compact = ['1', 'true', 'yes', 'on'].includes(
      this.normalizeWhitespace(compactRaw).toLowerCase(),
    );

    const { start, end } = this.parseDateBoundaries(dateFrom, dateTo);
    const startSql = this.toSqliteDateTime(start);
    const endSql = this.toSqliteDateTime(end);
    const dashboardStats = this.fetchAzsDashboardStats(config, objectKind);
    const { stats: azsStats, kindFilter } = dashboardStats;
    const azsToken = dashboardStats.token || '';
    // AZS "Заправки" = eventsType 131 (Выдача по карте) va 132 (Выдача без карты)
    let baseQb = this.fuelRepo
      .createQueryBuilder('entry')
      .where('entry.event_time >= :start', { start: startSql })
      .andWhere('entry.event_time <= :end', { end: endSql })
      .andWhere("json_extract(entry.payload, '$.eventsType') IN (131, 132)");
    baseQb = this.applyObjectKindToFuelQuery(baseQb, kindFilter);
    let qb = baseQb.clone();

    const stationFilter = this.normalizeWhitespace(station);
    if (stationFilter && stationFilter.toLowerCase() !== 'all') {
      qb = qb.andWhere(
        "COALESCE(json_extract(entry.payload, '$.devicePostName'), entry.station_name, '') = :station",
        { station: stationFilter },
      );
    }

    const issuedExpr = this.issuedLitersSummarySql('entry');

    const totalRow = await qb
      .clone()
      .select('COUNT(entry.id)', 'count')
      .addSelect(`COALESCE(SUM(${issuedExpr}), 0)`, 'liters')
      .addSelect('COALESCE(SUM(entry.amount), 0)', 'amount')
      .getRawOne<{ count: string; liters: string; amount: string }>();

    let totalCountResolved = Number.parseInt(String(totalRow?.count ?? '0'), 10) || 0;
    let totalLitersResolved = Number.parseFloat(String(totalRow?.liters ?? '0')) || 0;
    let totalAmountResolved = Number.parseFloat(String(totalRow?.amount ?? '0')) || 0;

    const fuelTypeRows = compact
      ? []
      : await qb
          .clone()
          .select('COALESCE(entry.fuel_type, :fallback)', 'fuelType')
          .addSelect(`COALESCE(SUM(${issuedExpr}), 0)`, 'liters')
          .setParameter('fallback', "Noma'lum")
          .groupBy('COALESCE(entry.fuel_type, :fallback)')
          .orderBy('liters', 'DESC')
          .getRawMany<{ fuelType: string; liters: string }>();

    // Postlar: devicePostName payload dan olinadi (AZS bilan mos)
    const stationRows = await baseQb
      .clone()
      .select(`COALESCE(json_extract(entry.payload, '$.devicePostName'), entry.station_name, :fallback)`, 'station')
      .addSelect('COUNT(entry.id)', 'records')
      .addSelect(`COALESCE(SUM(${issuedExpr}), 0)`, 'liters')
      .setParameter('fallback', "Noma'lum")
      .groupBy(`COALESCE(json_extract(entry.payload, '$.devicePostName'), entry.station_name, :fallback)`)
      .orderBy('liters', 'DESC')
      .getRawMany<{ station: string; records: string; liters: string }>();

    const recentLimit = Math.max(10, Math.min(5000, Number.parseInt(recentLimitRaw ?? '1000', 10) || 1000));
    const recentRows = compact
      ? []
      : await qb
          .clone()
          .orderBy('entry.event_time', 'DESC')
          .limit(recentLimit)
          .getMany();

    const sameDay = this.azsCalendarYmdFromInstant(start) === this.azsCalendarYmdFromInstant(end);
    const chart: Array<{ day: string; consumption: number; cost: number }> = [];

    if (sameDay) {
      const bucketHour = this.sqlEntryBucketHour();
      const hourlyRows = await qb
        .clone()
        .select(bucketHour, 'bucket')
        .addSelect(`COALESCE(SUM(${issuedExpr}), 0)`, 'liters')
        .addSelect('COALESCE(SUM(entry.amount), 0)', 'amount')
        .groupBy(bucketHour)
        .orderBy('bucket', 'ASC')
        .getRawMany<{ bucket: string; liters: string; amount: string }>();

      for (const row of hourlyRows) {
        const liters = Number.parseFloat(String(row.liters || '0')) || 0;
        const amount = Number.parseFloat(String(row.amount || '0')) || 0;
        chart.push({
          day: String(row.bucket),
          consumption: Math.round(liters * 100) / 100,
          cost: Math.round(amount * 100) / 100,
        });
      }
    } else {
      let apiChartRows: ExternalFuelRow[] | null = null;
      if (config.enabled && azsToken) {
        try {
          apiChartRows = await this.fetchAzsRefuelChartRows(config, azsToken, start, end);
        } catch (error) {
          this.logger.warn(`AZS refuel chart API fallback: ${String((error as any)?.message ?? error)}`);
        }
      }

      if (apiChartRows && apiChartRows.length > 0) {
        const dailyMap = new Map<string, { liters: number; amount: number; records: number }>();
        for (const row of apiChartRows) {
          if (!this.externalRowMatchesKindFilter(row, kindFilter)) continue;
          if (!this.externalRowMatchesStationFilter(row, stationFilter)) continue;
          const key = this.azsCalendarYmdFromInstant(row.eventTime);
          const entry = dailyMap.get(key) ?? { liters: 0, amount: 0, records: 0 };
          entry.liters += this.issuedLitersFromExternalRow(row);
          entry.amount += this.parseNumber(row.amount) ?? 0;
          entry.records += 1;
          dailyMap.set(key, entry);
        }

        totalCountResolved = 0;
        totalLitersResolved = 0;
        totalAmountResolved = 0;
        for (const key of this.eachAzsDayKeyBetween(start, end)) {
          const entry = dailyMap.get(key) ?? { liters: 0, amount: 0, records: 0 };
          totalCountResolved += entry.records;
          totalLitersResolved += entry.liters;
          totalAmountResolved += entry.amount;
          chart.push({
            day: this.formatShortDate(key),
            consumption: Math.round(entry.liters * 100) / 100,
            cost: Math.round(entry.amount * 100) / 100,
          });
        }
      } else {
        const bucketDay = this.sqlEntryBucketDay();
        const dailyRows = await qb
          .clone()
          .select(bucketDay, 'bucket')
          .addSelect(`COALESCE(SUM(${issuedExpr}), 0)`, 'liters')
          .addSelect('COALESCE(SUM(entry.amount), 0)', 'amount')
          .groupBy(bucketDay)
          .orderBy('bucket', 'ASC')
          .getRawMany<{ bucket: string; liters: string; amount: string }>();

        const dailyMap = new Map<string, { liters: number; amount: number }>();
        for (const row of dailyRows) {
          const key = String(row.bucket || '');
          if (!key) continue;
          dailyMap.set(key, {
            liters: Number.parseFloat(String(row.liters || '0')) || 0,
            amount: Number.parseFloat(String(row.amount || '0')) || 0,
          });
        }

        for (const key of this.eachAzsDayKeyBetween(start, end)) {
          const entry = dailyMap.get(key) ?? { liters: 0, amount: 0 };
          chart.push({
            day: this.formatShortDate(key),
            consumption: Math.round(entry.liters * 100) / 100,
            cost: Math.round(entry.amount * 100) / 100,
          });
        }
      }
    }

    /** DUT darajasi: zapravka (131/132) yozuvlari — AZS «График уровня секций» ga yaqin agregatsiya */
    const levelExpr = `
      COALESCE(
        NULLIF(CAST(json_extract(payload, '$.levelEndDut') AS REAL), 0),
        NULLIF(CAST(json_extract(payload, '$.levelStartDut') AS REAL), 0)
      )
    `;
    const sectionExpr = `
      COALESCE(
        json_extract(payload, '$.fuelSectionName'),
        json_extract(payload, '$.devicePostName'),
        json_extract(payload, '$.fuelTankName'),
        'Noma''lum'
      )
    `;
    /** Grafik: faqat rezervuar/seksiya nomi — post nomini «seksiya» deb aralashtirmaslik (AZS bilan mos) */
    const sectionExprForLevel = `
      COALESCE(
        NULLIF(TRIM(json_extract(payload, '$.fuelSectionName')), ''),
        NULLIF(TRIM(json_extract(payload, '$.fuelTankName')), '')
      )
    `;
    const sectionFilter = this.normalizeWhitespace(section);

    const okFrag = this.objectKindSqlFragment(kindFilter);
    const sectionSqlBase = `
      FROM fuel_entries
      WHERE event_time >= ? AND event_time <= ?
        AND ${levelExpr} IS NOT NULL
        ${okFrag.sql}
    `;
    const levelRefuelFilter = ` AND json_extract(payload, '$.eventsType') IN (131, 132) `;
    const levelChartSqlBase = `
      FROM fuel_entries
      WHERE event_time >= ? AND event_time <= ?
        AND ${levelExpr} IS NOT NULL
        AND ${sectionExprForLevel} IS NOT NULL
        ${levelRefuelFilter}
        ${okFrag.sql}
    `;

    const sectionsParams: any[] = [startSql, endSql, ...okFrag.params];
    let sectionsStationTail = '';
    if (stationFilter && stationFilter.toLowerCase() !== 'all') {
      sectionsStationTail = `AND COALESCE(json_extract(payload, '$.devicePostName'), COALESCE(station_name, ''), '') = ?`;
      sectionsParams.push(stationFilter);
    }
    const sectionsRaw = await this.fuelRepo.query(
      `
      SELECT ${sectionExpr} AS section,
             COUNT(1) AS records
      ${sectionSqlBase}
      ${sectionsStationTail}
      GROUP BY section
      ORDER BY section ASC
      `,
      sectionsParams,
    );

    const levelBucketExpr = sameDay ? this.sqlRawEventTimeBucketHour() : this.sqlRawEventTimeBucketDay();

    let stationWhereTail = '';
    if (stationFilter && stationFilter.toLowerCase() !== 'all') {
      stationWhereTail += ` AND COALESCE(json_extract(payload, '$.devicePostName'), COALESCE(station_name, ''), '') = ?`;
    }
    let sectionWhereTail = stationWhereTail;
    if (sectionFilter && sectionFilter.toLowerCase() !== 'all') {
      sectionWhereTail += ` AND (${sectionExprForLevel}) = ?`;
    }

    const levelParamsBase: any[] = [startSql, endSql, ...okFrag.params];
    if (stationFilter && stationFilter.toLowerCase() !== 'all') {
      levelParamsBase.push(stationFilter);
    }
    if (sectionFilter && sectionFilter.toLowerCase() !== 'all') {
      levelParamsBase.push(sectionFilter);
    }

    const levelParamsAllOnly: any[] = [startSql, endSql, ...okFrag.params];
    if (stationFilter && stationFilter.toLowerCase() !== 'all') {
      levelParamsAllOnly.push(stationFilter);
    }

    const gaugeRows = Array.isArray((azsStats as { sectionGaugeRows?: Array<{ name: string; liters: number }> }).sectionGaugeRows)
      ? ((azsStats as { sectionGaugeRows: Array<{ name: string; liters: number }> }).sectionGaugeRows ?? [])
      : [];
    const azsNamesForLevel: string[] = Array.isArray((azsStats as { azsSectionNames?: string[] })?.azsSectionNames)
      ? ((azsStats as { azsSectionNames: string[] }).azsSectionNames ?? [])
      : [];
    const imputeSectionNames = Array.from(
      new Set<string>(
        [
          ...azsNamesForLevel.map((n) => this.normalizeWhitespace(String(n ?? ''))),
          ...gaugeRows.map((r) => this.normalizeWhitespace(String(r?.name ?? ''))),
        ].filter((n): n is string => Boolean(n)),
      ),
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const levelMap = new Map<string, number>();
    const allSectionsMode = !sectionFilter || sectionFilter.toLowerCase() === 'all';
    const levelAllSectionsAggMode = this.normalizeWhitespace(process.env.AZS_LEVEL_ALL_SECTIONS_AGG || 'max').toLowerCase();
    const apiLevelMap =
      config.enabled && azsToken
        ? await this.getAzsLevelMapFromApiCached(
            config,
            azsToken,
            kindFilter,
            start,
            end,
            sameDay,
            stationFilter,
            sectionFilter,
            imputeSectionNames,
          )
        : null;

    /**
     * Refuel (131/132) SQL grafigi AZS «График уровня секций» bilan mos emas.
     * Shuning uchun fallback faqat explicit yoqilganda ishlaydi.
     */
    const sqlLevelFallbackAllowed =
      this.normalizeWhitespace(process.env.AZS_LEVEL_CHART_SQL_FALLBACK || '').toLowerCase() === 'true';

    if (apiLevelMap && apiLevelMap.size > 0) {
      for (const [k, v] of apiLevelMap.entries()) {
        if (k && Number.isFinite(v)) levelMap.set(k, v);
      }
    } else if (sqlLevelFallbackAllowed) {
      const levelBucketSecRows = await this.fuelRepo.query(
        `
      SELECT ${levelBucketExpr} AS bucket,
             ${sectionExprForLevel} AS sec,
             AVG(${levelExpr}) AS section_avg
      ${levelChartSqlBase}
      ${stationWhereTail}
      GROUP BY 1, 2
      ORDER BY bucket ASC
      `,
        levelParamsAllOnly,
      );

      const bucketSecAvg = new Map<string, Map<string, number>>();
      const secsSeen = new Set<string>();
      for (const row of levelBucketSecRows as Array<{ bucket: string; sec: string; section_avg: string }>) {
        const b = String(row.bucket || '');
        const sec = this.normalizeWhitespace(String(row.sec || ''));
        const v = Number.parseFloat(String(row.section_avg || '0'));
        if (!b || !sec || !Number.isFinite(v)) continue;
        secsSeen.add(sec);
        if (!bucketSecAvg.has(b)) bucketSecAvg.set(b, new Map());
        bucketSecAvg.get(b)!.set(sec, v);
      }

      if (allSectionsMode) {
        /** «Barcha seksiyalar»: AZS dagi «Все секции»ga mos o‘rtacha qiymat */
        const buckets = new Set<string>([...bucketSecAvg.keys()]);
        if (sameDay) {
          for (let hour = 0; hour < 24; hour += 1) {
            buckets.add(`${String(hour).padStart(2, '0')}:00`);
          }
        } else {
          for (const k of this.eachAzsDayKeyBetween(start, end)) {
            buckets.add(k);
          }
        }
        for (const b of buckets) {
          const m = bucketSecAvg.get(b);
          if (m && m.size > 0) {
            let max = Number.NEGATIVE_INFINITY;
            let sum = 0;
            for (const v of m.values()) {
              max = Math.max(max, v);
              sum += v;
            }
            /** API yo‘q: `max` — AZS ga yaqin, `avg` — alternativ fallback. */
            levelMap.set(b, levelAllSectionsAggMode === 'avg' ? sum / m.size : max);
          } else {
            levelMap.set(b, 0);
          }
        }
      } else {
        const levelRowsFiltered = await this.fuelRepo.query(
          `
      SELECT ${levelBucketExpr} AS bucket,
             AVG(${levelExpr}) AS level
      ${levelChartSqlBase}
      ${sectionWhereTail}
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
          levelParamsBase,
        );
        for (const row of levelRowsFiltered as Array<{ bucket: string; level: string }>) {
          const key = String(row.bucket || '');
          const value = Number.parseFloat(String(row.level || '0'));
          if (!key || !Number.isFinite(value)) continue;
          levelMap.set(key, value);
        }
      }
    } else if (config.enabled) {
      this.logger.warn(
        'AZS seksiya darajasi: DeviceEvents dan nuqta kelmayapti yoki xato; SQL fallback explicit yoqilmagan. ' +
          'Token/URL tekshiring yoki vaqt uchun `AZS_LEVEL_CHART_TIME_FIELDS`, sahifa uchun `AZS_LEVEL_EVENTS_PAGE_ZERO_BASED=false` sinang. ' +
          'Zarurat bo‘lsa `AZS_LEVEL_CHART_SQL_FALLBACK=true` (refuel grafigi, AZS bilan mos emas).',
      );
    }

    const ymdQueryDay = this.azsCalendarYmdFromInstant(start);
    const ymdToday = this.azsCalendarYmdFromInstant(new Date());
    const sameDayToday = sameDay && ymdQueryDay === ymdToday;
    const levelChart: Array<{ day: string; level: number }> = [];
    if (sameDay) {
      const nowBucket = this.azsCalendarHourBucketFromInstant(new Date());
      const nowHour = Number.parseInt(nowBucket.slice(0, 2), 10);
      const maxHour = sameDayToday && Number.isFinite(nowHour) ? Math.max(0, Math.min(23, nowHour)) : 23;
      for (let hour = 0; hour <= maxHour; hour += 1) {
        const key = `${String(hour).padStart(2, '0')}:00`;
        levelChart.push({
          day: key,
          level: levelMap.get(key) ?? 0,
        });
      }
    } else {
      for (const key of this.eachAzsDayKeyBetween(start, end)) {
        levelChart.push({
          day: this.formatShortDate(key),
          level: levelMap.get(key) ?? 0,
        });
      }
    }

    let liveLevelGaugeLiters: number | null = null;
    if (gaugeRows.length > 0) {
      if (!sectionFilter || sectionFilter.toLowerCase() === 'all') {
        /** «Barcha seksiyalar» — grafik bilan bir xil agregatsiya: default `max` */
        const vals = gaugeRows.map((r) => r.liters).filter((v) => Number.isFinite(v));
        if (vals.length) {
          const aggMode = this.normalizeWhitespace(process.env.AZS_LEVEL_ALL_SECTIONS_AGG || 'max').toLowerCase();
          if (aggMode === 'avg') {
            const sum = vals.reduce((s, v) => s + v, 0);
            liveLevelGaugeLiters = sum / vals.length;
          } else {
            liveLevelGaugeLiters = Math.max(...vals);
          }
        } else {
          liveLevelGaugeLiters = null;
        }
      } else {
        liveLevelGaugeLiters = gaugeRows
          .filter((r) => r.name === sectionFilter)
          .reduce((s, r) => s + (Number.isFinite(r.liters) ? r.liters : 0), 0);
      }
      if (!Number.isFinite(liveLevelGaugeLiters)) liveLevelGaugeLiters = null;
    }

    if (
      sameDayToday &&
      liveLevelGaugeLiters != null &&
      levelChart.length > 0 &&
      gaugeRows.length > 0
    ) {
      const bucketNow = this.azsCalendarHourBucketFromInstant(new Date());
      const idx = levelChart.findIndex((p) => p.day === bucketNow);
      if (idx >= 0) {
        levelChart[idx] = { ...levelChart[idx], level: liveLevelGaugeLiters };
      }
    }

    const anomalies = compact
      ? []
      : recentRows
          .filter((row) => this.litersFromStoredEntry(row) >= config.anomalyLiters)
          .slice(0, 5)
          .map((row) => ({
            id: row.id,
            vehicle: row.vehicle_number || '-',
            time: this.sqliteToIso(row.event_time),
            type: "Me'yordan ortiq sarf",
            amount: `${this.litersFromStoredEntry(row)}L`,
            status: 'warning',
          }));

    return {
      health: await this.getHealth(),
      window: {
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        records: totalCountResolved,
        totalLiters: totalLitersResolved,
        totalLitersRounded: Math.round(totalLitersResolved),
        totalAmount: totalAmountResolved,
        liveLevelGaugeLiters,
      },
      stats: azsStats,
      chart,
      levelChart,
      sections: (() => {
        const fromQuery = (sectionsRaw as Array<{ section: string; records: string }>).map((row) => ({
          name: String(row.section || "Noma'lum"),
          records: Number.parseInt(String(row.records || '0'), 10) || 0,
        }));
        const azsNames: string[] = Array.isArray((azsStats as { azsSectionNames?: string[] })?.azsSectionNames)
          ? ((azsStats as { azsSectionNames: string[] }).azsSectionNames ?? [])
          : [];
        const merged = new Map<string, { name: string; records: number }>();
        for (const row of fromQuery) {
          if (row.name && row.name !== "Noma'lum") merged.set(row.name, row);
        }
        for (const n of azsNames) {
          if (!merged.has(n)) merged.set(n, { name: n, records: 0 });
        }
        const ordered: Array<{ name: string; records: number }> = [];
        for (const n of azsNames) {
          const row = merged.get(n);
          if (row) {
            ordered.push(row);
            merged.delete(n);
          }
        }
        ordered.push(...Array.from(merged.values()));
        return ordered;
      })(),
      ...(compact
        ? {}
        : {
            fuelTypes: fuelTypeRows.map((row) => ({
              key: String(row.fuelType || "Noma'lum").toLowerCase().replace(/\s+/g, '_'),
              type: String(row.fuelType || "Noma'lum"),
              liters: Number.parseFloat(String(row.liters || '0')) || 0,
            })),
          }),
      // Postlar: AZS API dan barcha postlar + DB dan bugungi statistikalar
      stations: (() => {
        const dbMap = new Map<string, { records: number; liters: number }>();
        for (const row of stationRows) {
          dbMap.set(String(row.station || ''), {
            records: Number.parseInt(String(row.records || '0'), 10) || 0,
            liters: Number.parseFloat(String(row.liters || '0')) || 0,
          });
        }
        const azsPosts = azsStats.posts ?? [];
        if (azsPosts.length === 0) {
          return stationRows.map((row) => ({
            name: String(row.station || "Noma'lum"),
            records: Number.parseInt(String(row.records || '0'), 10) || 0,
            liters: Number.parseFloat(String(row.liters || '0')) || 0,
          }));
        }
        return azsPosts.map((p) => {
          const stats = dbMap.get(p.name);
          return { name: p.name, records: stats?.records ?? 0, liters: stats?.liters ?? 0 };
        });
      })(),
      ...(compact
        ? {}
        : {
            anomalies,
            recent: recentRows.map((row) => ({
              id: row.id,
              vehicle: row.vehicle_number || '-',
              fuelType: row.fuel_type || "Noma'lum",
              liters: row.liters,
              amount: row.amount,
              station: row.station_name || '-',
              driver: row.driver_name || '-',
              time: this.sqliteToIso(row.event_time),
            })),
          }),
    };
  }
}

@Controller('integrations/fuel/azs')
export class AzsFuelController {
  constructor(private readonly service: AzsFuelService) {}

  @Get('health')
  async health() {
    return this.service.getHealth();
  }

  @Post('sync')
  async sync() {
    return this.service.syncNow();
  }

  @Post('sync/history')
  async syncHistory(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('chunkDays') chunkDays?: string,
  ) {
    return this.service.syncHistory(dateFrom, dateTo, chunkDays);
  }

  @Get('summary')
  async summary(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('station') station?: string,
    @Query('recentLimit') recentLimit?: string,
    @Query('section') section?: string,
    @Query('objectKind') objectKind?: string,
    @Query('compact') compact?: string,
  ) {
    return this.service.getSummary(dateFrom, dateTo, station, recentLimit, section, objectKind, compact);
  }

  @Get('operations')
  async operations(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('station') station?: string,
    @Query('section') section?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('objectKind') objectKind?: string,
  ) {
    return this.service.getOperations(page, pageSize, station, section, dateFrom, dateTo, objectKind);
  }

  @Get('fuel-cards')
  async fuelCards(
    @Query('view') view?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('language') language?: string,
  ) {
    return this.service.getAzsFuelCards(view, page, pageSize, search, language);
  }

  /** AZS «Объекты» — kontrollerlar ro'yxati */
  @Get('objects')
  async azsObjects() {
    return this.service.getAzsObjects();
  }

  /** AZS «Резервуары» — rezervuar seksiyalari */
  @Get('reservoirs')
  async azsReservoirs() {
    return this.service.getAzsReservoirs();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([FuelEntry])],
  controllers: [AzsFuelController],
  providers: [AzsFuelService],
})
export class AzsFuelModule {}
