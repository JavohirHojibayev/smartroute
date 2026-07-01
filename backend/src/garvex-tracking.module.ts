import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GarvexTrackingPoint } from './garvex-tracking-point.entity';

type GarvexTrackingConfig = {
  enabled: boolean;
  authBaseUrl: string;
  apiBaseUrl: string;
  loginPath: string;
  permissionPath: string;
  unitsPath: string;
  lastDataPath: string;
  username: string;
  password: string;
  timeoutMs: number;
  requestRetries: number;
  autoSyncMs: number;
  fullSyncEveryMs: number;
  fetchPageSize: number;
  fetchMaxPages: number;
  showAddresses: boolean;
  reportTimezoneOffsetMinutes: number;
};

type GarvexSelfPermission = {
  accountId?: number;
  getUnit?: boolean;
  [key: string]: any;
};

type GarvexUnitPoint = {
  x?: number;
  y?: number;
  a?: string;
  speed?: number;
  dir?: number;
  ign?: boolean;
  sats?: number;
  fuelLevel?: number;
};

type GarvexUnit = {
  id?: number;
  name?: string;
  idObject?: string;
  status?: string;
  lastMessageTime?: number;
  point?: GarvexUnitPoint | null;
  [key: string]: any;
};

type GarvexUnitsPage = {
  objectCount?: number;
  pageCount?: number;
  currentPage?: number;
  objects?: GarvexUnit[];
};

type GarvexHealthStatus = 'disabled' | 'config_error' | 'permission_denied' | 'online' | 'error' | 'idle';
const GARVEX_LIVE_AFTER_MS = 15 * 60 * 1000;

type LastSyncStats = {
  mode: 'full' | 'delta';
  fetched: number;
  upserted: number;
  pages: number;
  removed?: number;
};

type GarvexRouteStats = {
  unitId?: number | null;
  unitName?: string | null;
  mileage?: number | null;
  avgSpeed?: number | null;
  spentFuel?: number | null;
  spentAbsoluteFuel?: number | null;
  refueled?: number | null;
  drained?: number | null;
  refuelCount?: number | null;
  drainCount?: number | null;
  moveTime?: number | null;
  parkTime?: number | null;
  stopTime?: number | null;
  stopCount?: number | null;
  parkCount?: number | null;
  motoHours?: number | null;
  engineIdle?: number | null;
  [key: string]: any;
};

type GarvexRouteStatsPage = {
  objectCount?: number;
  pageCount?: number;
  currentPage?: number;
  objects?: GarvexRouteStats[];
};

type GarvexTripRow = {
  startTime?: number | null;
  endTime?: number | null;
  moveTime?: number | null;
  startMotoHours?: number | null;
  endMotoHours?: number | null;
  motoHours?: number | null;
  engineIdle?: number | null;
  mileage?: number | null;
  avgSpeed?: number | null;
  avgFuel?: number | null;
  spentFuel?: number | null;
  stopTime?: number | null;
  stopCount?: number | null;
  parkTime?: number | null;
  parkCount?: number | null;
  refuelCount?: number | null;
  drainCount?: number | null;
  speedCount?: number | null;
  refueled?: number | null;
  drained?: number | null;
  maxSpeed?: number | null;
  startFuelLevel?: number | null;
  endFuelLevel?: number | null;
  unitName?: string | null;
  idObject?: string | null;
  unitId?: number | null;
  [key: string]: any;
};

type GarvexTripPage = {
  objectCount?: number;
  pageCount?: number;
  currentPage?: number;
  objects?: GarvexTripRow[];
};

type GarvexTripEvent = {
  tripEventType?: number | null;
  sensorName?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  duration?: number | null;
  value?: string | number | null;
  unitName?: string | null;
  idObject?: string | null;
  unitId?: number | null;
  [key: string]: any;
};

type GarvexTripEventPage = {
  objectCount?: number;
  pageCount?: number;
  currentPage?: number;
  objects?: GarvexTripEvent[];
};

type NormalizedRouteStats = {
  unitId: number | null;
  name: string;
  mileage: number;
  avgSpeed: number;
  spentFuel: number;
  spentAbsoluteFuel: number;
  refueled: number;
  drained: number;
  refuelCount: number;
  drainCount: number;
  moveTime: number;
  parkTime: number;
  stopTime: number;
  stopCount: number;
  parkCount: number;
  motoHours: number;
  engineIdle: number;
};

type NormalizedTripRow = {
  unitId: number | null;
  name: string;
  mileage: number;
  avgSpeed: number;
  spentFuel: number;
  refueled: number;
  drained: number;
  refuelCount: number;
  drainCount: number;
  moveTime: number;
  parkTime: number;
  stopTime: number;
  stopCount: number;
  parkCount: number;
  motoHours: number;
  engineIdle: number;
  speedCount: number;
  startUnix: number | null;
  endUnix: number | null;
};

type NormalizedTripEvent = {
  unitId: number | null;
  name: string;
  eventType: number;
  value: number;
  duration: number;
  startUnix: number | null;
  endUnix: number | null;
};

type MileageSeries = {
  key: string;
  name: string;
};

type MileageBucket = {
  label: string;
  startIso: string;
  endIso: string;
  values: Record<string, number>;
};

type DashboardRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

@Injectable()
export class GarvexTrackingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GarvexTrackingService.name);
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private syncInFlight: Promise<void> | null = null;
  private lastSyncAt = 0;
  private lastSyncAttemptAt = 0;
  private lastSyncError: string | null = null;
  private lastPermission: GarvexSelfPermission | null = null;
  private lastSyncStats: LastSyncStats | null = null;
  private lastFullSyncAt = 0;
  private status: GarvexHealthStatus = 'idle';

  constructor(
    @InjectRepository(GarvexTrackingPoint)
    private readonly pointsRepo: Repository<GarvexTrackingPoint>,
  ) {}

  onModuleInit(): void {
    const config = this.getConfig();
    if (!config.enabled) {
      this.status = 'disabled';
      return;
    }

    this.scheduler = setInterval(() => {
      void this.syncNow().catch(() => undefined);
    }, config.autoSyncMs);

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

  private getConfig(): GarvexTrackingConfig {
    const enabledRaw = this.normalizeWhitespace(process.env.GARVEX_MT_ENABLED ?? 'false').toLowerCase();
    const enabled = enabledRaw === 'true' || enabledRaw === '1' || enabledRaw === 'on';

    return {
      enabled,
      authBaseUrl: this.normalizeBaseUrl(process.env.GARVEX_MT_AUTH_BASE_URL || 'https://api.auth.garvex.tech'),
      apiBaseUrl: this.normalizeBaseUrl(process.env.GARVEX_MT_API_BASE_URL || 'https://api.mt.garvex.tech'),
      loginPath: this.normalizePath(process.env.GARVEX_MT_LOGIN_PATH || '/api/Authenticate/Login', '/api/Authenticate/Login'),
      permissionPath: this.normalizePath(
        process.env.GARVEX_MT_PERMISSION_PATH || '/api/Permissions/GetSelfAccountPermission',
        '/api/Permissions/GetSelfAccountPermission',
      ),
      unitsPath: this.normalizePath(process.env.GARVEX_MT_UNITS_PATH || '/api/Units/GetUnits', '/api/Units/GetUnits'),
      lastDataPath: this.normalizePath(process.env.GARVEX_MT_LAST_DATA_PATH || '/api/Units/GetLastData', '/api/Units/GetLastData'),
      username: this.normalizeWhitespace(process.env.GARVEX_MT_USERNAME || ''),
      password: String(process.env.GARVEX_MT_PASSWORD ?? ''),
      timeoutMs: Math.max(5000, Math.min(45000, Number.parseInt(process.env.GARVEX_MT_TIMEOUT_MS ?? '12000', 10) || 12000)),
      requestRetries: Math.max(0, Math.min(5, Number.parseInt(process.env.GARVEX_MT_REQUEST_RETRIES ?? '1', 10) || 1)),
      autoSyncMs: Math.max(30000, Math.min(300000, Number.parseInt(process.env.GARVEX_MT_AUTO_SYNC_MS ?? '120000', 10) || 120000)),
      fullSyncEveryMs: Math.max(300000, Math.min(3600000, Number.parseInt(process.env.GARVEX_MT_FULL_SYNC_MS ?? '900000', 10) || 900000)),
      fetchPageSize: Math.max(1, Math.min(50, Number.parseInt(process.env.GARVEX_MT_FETCH_PAGE_SIZE ?? '5', 10) || 5)),
      fetchMaxPages: Math.max(1, Math.min(50, Number.parseInt(process.env.GARVEX_MT_FETCH_MAX_PAGES ?? '10', 10) || 10)),
      showAddresses: (this.normalizeWhitespace(process.env.GARVEX_MT_SHOW_ADDRESSES ?? 'true').toLowerCase() === 'true'),
      reportTimezoneOffsetMinutes: Math.max(-720, Math.min(840, Number.parseInt(process.env.GARVEX_MT_REPORT_TZ_OFFSET_MINUTES ?? '180', 10) || 180)),
    };
  }

  private ensureConfigForSync(config: GarvexTrackingConfig): void {
    if (!config.enabled) {
      throw new BadRequestException('Garvex MT integratsiyasi o\'chirilgan (GARVEX_MT_ENABLED=false)');
    }
    if (!config.authBaseUrl || !config.apiBaseUrl) {
      throw new BadRequestException('GARVEX_MT_AUTH_BASE_URL yoki GARVEX_MT_API_BASE_URL sozlanmagan');
    }
    if (!config.username || !config.password) {
      throw new BadRequestException('GARVEX_MT_USERNAME va GARVEX_MT_PASSWORD sozlanmagan');
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
          await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt <= retries) {
          await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Garvex so\'rovida tarmoq xatoligi');
  }

  private async requestToken(config: GarvexTrackingConfig): Promise<string> {
    const url = `${config.authBaseUrl}${config.loginPath}`;
    const body = JSON.stringify({ login: config.username, password: config.password });
    const response = await this.fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body,
      },
      config.timeoutMs,
      config.requestRetries,
    );

    if (!response.ok) {
      throw new BadRequestException(`Garvex auth xatoligi: ${response.status}`);
    }

    const payload: any = await response.json().catch(() => ({}));
    const token = this.normalizeWhitespace(payload?.accessToken ?? payload?.access_token ?? payload?.token ?? '');
    if (!token) {
      throw new BadRequestException('Garvex auth javobida access token topilmadi');
    }
    return token;
  }

  private async getSelfPermission(config: GarvexTrackingConfig, token: string): Promise<GarvexSelfPermission> {
    const url = `${config.apiBaseUrl}${config.permissionPath}`;
    const response = await this.fetchWithRetry(
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      },
      config.timeoutMs,
      config.requestRetries,
    );

    if (!response.ok) {
      throw new BadRequestException(`Garvex permission so'rovi xatoligi: ${response.status}`);
    }

    const payload: GarvexSelfPermission = await response.json().catch(() => ({}));
    return payload && typeof payload === 'object' ? payload : {};
  }

  private buildUnitsUrl(config: GarvexTrackingConfig, page: number): string {
    const params = new URLSearchParams();
    params.set('Page', String(page));
    params.set('CountOnPage', String(config.fetchPageSize));
    params.set('ShowAddresses', config.showAddresses ? 'true' : 'false');
    params.set('OrderBy', 'name');
    return `${config.apiBaseUrl}${config.unitsPath}?${params.toString()}`;
  }

  private async fetchUnitsPage(config: GarvexTrackingConfig, token: string, page: number): Promise<GarvexUnitsPage> {
    const response = await this.fetchWithRetry(
      this.buildUnitsUrl(config, page),
      {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      },
      config.timeoutMs,
      config.requestRetries,
    );

    if (response.status === 403) {
      this.status = 'permission_denied';
      throw new BadRequestException('Garvex read-only user da Units/GetUnits huquqi yo\'q (getUnit=false)');
    }

    if (!response.ok) {
      throw new BadRequestException(`Garvex Units/GetUnits xatoligi: ${response.status}`);
    }

    const payload: GarvexUnitsPage = await response.json().catch(() => ({}));
    return payload && typeof payload === 'object' ? payload : {};
  }

  private async fetchLastData(
    config: GarvexTrackingConfig,
    token: string,
    unitIds: number[],
    lastMessageTime: number,
  ): Promise<GarvexUnit[]> {
    const response = await this.fetchWithRetry(
      `${config.apiBaseUrl}${config.lastDataPath}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          unitIds,
          lastMessageTime,
        }),
      },
      config.timeoutMs,
      config.requestRetries,
    );

    if (response.status === 403) {
      this.status = 'permission_denied';
      throw new BadRequestException('Garvex read-only user da Units/GetLastData huquqi yo\'q');
    }

    if (!response.ok) {
      throw new BadRequestException(`Garvex Units/GetLastData xatoligi: ${response.status}`);
    }

    const payload: any = await response.json().catch(() => []);
    if (Array.isArray(payload)) return payload as GarvexUnit[];
    if (Array.isArray(payload?.objects)) return payload.objects as GarvexUnit[];
    return [];
  }

  private toOptionalNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value == null) return null;
    const parsed = Number.parseFloat(String(value).replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toOptionalInteger(value: unknown): number | null {
    const number = this.toOptionalNumber(value);
    if (number == null) return null;
    const integer = Math.trunc(number);
    return Number.isFinite(integer) ? integer : null;
  }

  private toOptionalBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (value == null) return null;
    const normalized = this.normalizeWhitespace(value).toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return null;
  }

  private parseLastMessage(lastMessageUnix: number | null): Date | null {
    if (lastMessageUnix == null) return null;
    // API may return seconds or milliseconds.
    const ms = lastMessageUnix > 9_999_999_999 ? lastMessageUnix : lastMessageUnix * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private normalizeUnit(unit: GarvexUnit): Omit<GarvexTrackingPoint, 'id' | 'created_at' | 'updated_at'> | null {
    const unitId = this.toOptionalInteger(unit?.id);
    if (!unitId || unitId <= 0) return null;

    const point = unit?.point || {};
    const rawUnix = this.toOptionalInteger(unit?.lastMessageTime);

    return {
      unit_id: unitId,
      unit_name: this.normalizeWhitespace(unit?.name || '') || null,
      object_code: this.normalizeWhitespace(unit?.idObject || '') || null,
      status: this.normalizeWhitespace(unit?.status ?? '') || null,
      lat: this.toOptionalNumber(point?.y),
      lng: this.toOptionalNumber(point?.x),
      speed: this.toOptionalNumber(point?.speed),
      direction: this.toOptionalInteger(point?.dir),
      ignition: this.toOptionalBoolean(point?.ign),
      satellites: this.toOptionalInteger(point?.sats),
      fuel_level: this.toOptionalNumber(point?.fuelLevel),
      address: this.normalizeWhitespace(point?.a || '') || null,
      last_message_unix: rawUnix,
      last_message_at: this.parseLastMessage(rawUnix),
      payload: unit || null,
    };
  }

  private async persistUnits(rows: Array<Omit<GarvexTrackingPoint, 'id' | 'created_at' | 'updated_at'>>): Promise<number> {
    if (rows.length === 0) return 0;
    const unitIds = rows.map((row) => row.unit_id);
    const existing = await this.pointsRepo.find({ where: { unit_id: In(unitIds) } });
    const existingByUnitId = new Map(existing.map((row) => [row.unit_id, row]));

    const toSave = rows.map((row) => {
      const prev = existingByUnitId.get(row.unit_id);
      return this.pointsRepo.create({
        id: prev?.id,
        unit_id: row.unit_id,
        unit_name: row.unit_name ?? prev?.unit_name ?? null,
        object_code: row.object_code ?? prev?.object_code ?? null,
        status: row.status ?? prev?.status ?? null,
        lat: row.lat ?? prev?.lat ?? null,
        lng: row.lng ?? prev?.lng ?? null,
        speed: row.speed ?? prev?.speed ?? null,
        direction: row.direction ?? prev?.direction ?? null,
        ignition: row.ignition ?? prev?.ignition ?? null,
        satellites: row.satellites ?? prev?.satellites ?? null,
        fuel_level: row.fuel_level ?? prev?.fuel_level ?? null,
        address: row.address ?? prev?.address ?? null,
        last_message_unix: row.last_message_unix ?? prev?.last_message_unix ?? null,
        last_message_at: row.last_message_at ?? prev?.last_message_at ?? null,
        payload: row.payload ?? prev?.payload ?? null,
      });
    });

    await this.pointsRepo.save(toSave, { chunk: 200 });
    return toSave.length;
  }

  private async removeMissingUnits(unitIds: number[]): Promise<number> {
    if (unitIds.length === 0) return 0;
    const existing = await this.pointsRepo.find({ select: ['id', 'unit_id'] });
    const keep = new Set(unitIds);
    const removeIds = existing.filter((row) => !keep.has(row.unit_id)).map((row) => row.id);
    if (removeIds.length === 0) return 0;
    await this.pointsRepo.delete(removeIds);
    return removeIds.length;
  }

  private async fetchAllUnits(config: GarvexTrackingConfig, token: string): Promise<GarvexUnit[]> {
    // Garvex Units/GetUnits sahifalari 0-indexed: Page=1 dan boshlansa birinchi 5 transport tushib qoladi.
    const firstPage = await this.fetchUnitsPage(config, token, 0);
    const pageCount = Math.max(1, this.toOptionalInteger(firstPage?.pageCount) ?? 1);
    const objectCount = Math.max(0, this.toOptionalInteger(firstPage?.objectCount) ?? 0);
    const expectedPages = objectCount > 0
      ? Math.max(pageCount, Math.ceil(objectCount / config.fetchPageSize))
      : pageCount;
    const limit = Math.min(expectedPages, config.fetchMaxPages);
    const all: GarvexUnit[] = Array.isArray(firstPage?.objects) ? firstPage.objects : [];
    if (objectCount > 0 && all.length === 0) {
      throw new BadRequestException(
        `Garvex Units/GetUnits objectCount=${objectCount}, lekin objects bo'sh. ` +
        `GARVEX_MT_FETCH_PAGE_SIZE=${config.fetchPageSize} ni kichraytirish kerak.`,
      );
    }

    for (let page = 1; page < limit; page += 1) {
      const current = await this.fetchUnitsPage(config, token, page);
      const chunk = Array.isArray(current?.objects) ? current.objects : [];
      all.push(...chunk);
    }

    return all;
  }

  private async fetchUnitsIncremental(config: GarvexTrackingConfig, token: string): Promise<GarvexUnit[]> {
    const cursorRows = await this.pointsRepo.find({
      select: ['unit_id', 'unit_name', 'object_code', 'last_message_unix'],
      order: { unit_id: 'ASC' },
    });

    const unitIds = cursorRows.map((row) => row.unit_id).filter((id) => Number.isFinite(id) && id > 0);
    if (unitIds.length === 0) {
      return [];
    }

    const lastMessageTime = cursorRows.reduce((acc, row) => {
      const value = this.toOptionalInteger(row.last_message_unix) ?? 0;
      return value > acc ? value : acc;
    }, 0);

    const updated = await this.fetchLastData(config, token, unitIds, lastMessageTime);
    if (updated.length === 0) return [];

    const snapshotById = new Map(cursorRows.map((row) => [row.unit_id, row]));
    return updated.map((unit) => {
      const id = this.toOptionalInteger(unit?.id);
      if (!id) return unit;
      const snapshot = snapshotById.get(id);
      if (!snapshot) return unit;
      return {
        ...unit,
        name: this.normalizeWhitespace(unit?.name || '') || snapshot.unit_name || undefined,
        idObject: this.normalizeWhitespace(unit?.idObject || '') || snapshot.object_code || undefined,
      };
    });
  }

  async syncNow(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;

    this.syncInFlight = (async () => {
      const config = this.getConfig();
      this.lastSyncAttemptAt = Date.now();
      this.lastSyncError = null;

      if (!config.enabled) {
        this.status = 'disabled';
        return;
      }

      try {
        this.ensureConfigForSync(config);
      } catch (error) {
        this.status = 'config_error';
        this.lastSyncError = error instanceof Error ? error.message : 'Konfiguratsiya xatosi';
        return;
      }

      try {
        const token = await this.requestToken(config);
        const permission = await this.getSelfPermission(config, token);
        this.lastPermission = permission;

        if (!permission?.getUnit) {
          this.status = 'permission_denied';
          this.lastSyncError = 'Garvex account da getUnit huquqi yo\'q';
          return;
        }

        const hasStoredData = (await this.pointsRepo.count()) > 0;
        const shouldRunFullSync =
          !hasStoredData ||
          !this.lastFullSyncAt ||
          (Date.now() - this.lastFullSyncAt) >= config.fullSyncEveryMs;

        const syncMode: 'full' | 'delta' = shouldRunFullSync ? 'full' : 'delta';
        const units = shouldRunFullSync
          ? await this.fetchAllUnits(config, token)
          : await this.fetchUnitsIncremental(config, token);

        const normalized: Array<Omit<GarvexTrackingPoint, 'id' | 'created_at' | 'updated_at'>> = [];

        for (const unit of units) {
          const row = this.normalizeUnit(unit);
          if (row) normalized.push(row);
        }

        const upserted = await this.persistUnits(normalized);
        let removed = 0;
        if (syncMode === 'full') {
          this.lastFullSyncAt = Date.now();
          const unitIds = normalized.map((row) => row.unit_id);
          if (unitIds.length > 0) {
            removed = await this.removeMissingUnits(unitIds);
          }
        }

        this.lastSyncAt = Date.now();
        this.lastSyncStats = {
          mode: syncMode,
          fetched: units.length,
          upserted,
          pages: syncMode === 'full' ? Math.max(1, Math.ceil(Math.max(units.length, 1) / config.fetchPageSize)) : 1,
          removed,
        };
        this.status = 'online';
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Garvex sync xatoligi';
        this.lastSyncError = message;
        if (this.status !== 'permission_denied') {
          this.status = 'error';
        }
        this.logger.warn(`Garvex tracking sync failed: ${message}`);
      }
    })();

    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private normalizeDashboardPreset(value?: string): DashboardRangePreset {
    const preset = this.normalizeWhitespace(value).toLowerCase();
    if (preset === 'today' || preset === 'yesterday' || preset === 'week' || preset === 'month' || preset === 'custom') {
      return preset;
    }
    return 'custom';
  }

  private getTrackingRange(dateFrom?: string, dateTo?: string, presetRaw?: string) {
    const config = this.getConfig();
    const offsetMs = config.reportTimezoneOffsetMinutes * 60_000;
    const buildOffsetDate = (
      year: number,
      monthIndex: number,
      day: number,
      hours: number,
      minutes: number,
      seconds: number,
      milliseconds: number,
    ) => new Date(Date.UTC(year, monthIndex, day, hours, minutes, seconds, milliseconds) - offsetMs);
    const parseDate = (value?: string, boundary: 'start' | 'end' = 'start') => {
      if (!value) return null;
      const raw = this.normalizeWhitespace(value);
      const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      if (localMatch) {
        const [
          ,
          yearRaw,
          monthRaw,
          dayRaw,
          hourRaw,
          minuteRaw,
          secondRaw,
        ] = localMatch;
        const hasExplicitTime = hourRaw != null && minuteRaw != null;
        const hours = hasExplicitTime ? Number.parseInt(hourRaw, 10) || 0 : (boundary === 'end' ? 23 : 0);
        const minutes = hasExplicitTime ? Number.parseInt(minuteRaw, 10) || 0 : (boundary === 'end' ? 59 : 0);
        const seconds = hasExplicitTime
          ? Number.parseInt(secondRaw ?? '0', 10) || 0
          : (boundary === 'end' ? 59 : 0);
        const milliseconds = boundary === 'end' ? 999 : 0;
        return buildOffsetDate(
          Number.parseInt(yearRaw, 10),
          Number.parseInt(monthRaw, 10) - 1,
          Number.parseInt(dayRaw, 10),
          hours,
          minutes,
          seconds,
          milliseconds,
        );
      }
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const now = new Date();
    const preset = this.normalizeDashboardPreset(presetRaw);
    let start: Date | null = null;
    let requestedEnd: Date | null = null;

    if (preset !== 'custom') {
      const shiftedNow = new Date(now.getTime() + offsetMs);
      const currentDay = new Date(Date.UTC(
        shiftedNow.getUTCFullYear(),
        shiftedNow.getUTCMonth(),
        shiftedNow.getUTCDate(),
      ));
      const startDay = new Date(currentDay);
      const endDay = new Date(currentDay);

      if (preset === 'yesterday') {
        startDay.setUTCDate(startDay.getUTCDate() - 1);
        endDay.setUTCDate(endDay.getUTCDate() - 1);
      } else if (preset === 'week') {
        startDay.setUTCDate(startDay.getUTCDate() - 6);
      } else if (preset === 'month') {
        startDay.setUTCMonth(startDay.getUTCMonth() - 1);
      }

      start = buildOffsetDate(
        startDay.getUTCFullYear(),
        startDay.getUTCMonth(),
        startDay.getUTCDate(),
        0,
        0,
        0,
        0,
      );
      requestedEnd = buildOffsetDate(
        endDay.getUTCFullYear(),
        endDay.getUTCMonth(),
        endDay.getUTCDate(),
        23,
        59,
        59,
        999,
      );
    }

    const fallbackShiftedNow = new Date(now.getTime() + offsetMs);
    const fallbackStart = buildOffsetDate(
      fallbackShiftedNow.getUTCFullYear(),
      fallbackShiftedNow.getUTCMonth(),
      fallbackShiftedNow.getUTCDate(),
      0,
      0,
      0,
      0,
    );
    const fallbackEnd = buildOffsetDate(
      fallbackShiftedNow.getUTCFullYear(),
      fallbackShiftedNow.getUTCMonth(),
      fallbackShiftedNow.getUTCDate(),
      23,
      59,
      59,
      999,
    );

    start = start ?? parseDate(dateFrom, 'start') ?? fallbackStart;
    requestedEnd = requestedEnd ?? parseDate(dateTo, 'end') ?? fallbackEnd;
    const chronologicalEnd = requestedEnd.getTime() >= start.getTime() ? requestedEnd : fallbackEnd;

    return {
      preset,
      start,
      end: chronologicalEnd,
      requestedEnd: chronologicalEnd,
      startUnix: Math.floor(start.getTime() / 1000),
      endUnix: Math.floor(chronologicalEnd.getTime() / 1000),
    };
  }

  private buildStatsUrl(config: GarvexTrackingConfig, startUnix: number, endUnix: number, page: number, unitIds: number[] = []): string {
    const params = new URLSearchParams();
    params.set('StartTimeUnix', String(startUnix));
    params.set('EndTimeUnix', String(endUnix));
    params.set('Page', String(page));
    params.set('CountOnPage', '50');
    params.set('ShowAddresses', 'false');
    for (const unitId of unitIds) {
      params.append('UnitIds', String(unitId));
    }
    return `${config.apiBaseUrl}/api/Reports/GetStats?${params.toString()}`;
  }

  private appendUnitIds(params: URLSearchParams, unitIds: number[]): void {
    for (const unitId of unitIds) {
      if (Number.isFinite(unitId) && unitId > 0) {
        params.append('UnitIds', String(unitId));
      }
    }
  }

  private buildTripsUrl(config: GarvexTrackingConfig, startUnix: number, endUnix: number, page: number, unitIds: number[] = []): string {
    const params = new URLSearchParams();
    params.set('StartTimeUnix', String(startUnix));
    params.set('EndTimeUnix', String(endUnix));
    params.set('Page', String(page));
    params.set('CountOnPage', '50');
    params.set('ShowAddresses', 'false');
    params.set('ShowTrackPoints', 'false');
    params.set('OrderBy', 'Mileage');
    params.set('OrderByDescending', 'true');
    this.appendUnitIds(params, unitIds);
    return `${config.apiBaseUrl}/api/Reports/GetTrips?${params.toString()}`;
  }

  private buildTripEventsUrl(config: GarvexTrackingConfig, startUnix: number, endUnix: number, page: number, unitIds: number[] = []): string {
    const params = new URLSearchParams();
    params.set('StartTimeUnix', String(startUnix));
    params.set('EndTimeUnix', String(endUnix));
    params.set('Page', String(page));
    params.set('CountOnPage', '50');
    params.set('ShowAddresses', 'false');
    params.append('EventTypes', '2');
    params.append('EventTypes', '3');
    params.append('EventTypes', '0');
    this.appendUnitIds(params, unitIds);
    return `${config.apiBaseUrl}/api/Reports/GetTripEvents?${params.toString()}`;
  }

  private async fetchStatsPage(
    config: GarvexTrackingConfig,
    token: string,
    startUnix: number,
    endUnix: number,
    page: number,
    unitIds: number[] = [],
  ): Promise<GarvexRouteStatsPage> {
    const response = await this.fetchWithRetry(
      this.buildStatsUrl(config, startUnix, endUnix, page, unitIds),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sensorsMask: [] }),
      },
      Math.max(config.timeoutMs, 20000),
      config.requestRetries,
    );

    if (!response.ok) {
      throw new BadRequestException(`Garvex Reports/GetStats xatoligi: ${response.status}`);
    }

    const payload: GarvexRouteStatsPage = await response.json().catch(() => ({}));
    return payload && typeof payload === 'object' ? payload : {};
  }

  private async fetchRouteStats(config: GarvexTrackingConfig, token: string, startUnix: number, endUnix: number, unitIds: number[] = []): Promise<GarvexRouteStats[]> {
    const firstPage = await this.fetchStatsPage(config, token, startUnix, endUnix, 0, unitIds);
    const pageCount = Math.max(1, this.toOptionalInteger(firstPage?.pageCount) ?? 1);
    const limit = Math.min(pageCount, config.fetchMaxPages);
    const rows = Array.isArray(firstPage?.objects) ? [...firstPage.objects] : [];

    for (let page = 1; page < limit; page += 1) {
      const nextPage = await this.fetchStatsPage(config, token, startUnix, endUnix, page, unitIds);
      if (Array.isArray(nextPage?.objects)) {
        rows.push(...nextPage.objects);
      }
    }

    return rows;
  }

  private async fetchTripsPage(
    config: GarvexTrackingConfig,
    token: string,
    startUnix: number,
    endUnix: number,
    page: number,
    unitIds: number[] = [],
  ): Promise<GarvexTripPage> {
    const response = await this.fetchWithRetry(
      this.buildTripsUrl(config, startUnix, endUnix, page, unitIds),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sensorsMask: [] }),
      },
      Math.max(config.timeoutMs, 45_000),
      Math.max(config.requestRetries, 3),
    );

    if (!response.ok) {
      throw new BadRequestException(`Garvex Reports/GetTrips xatoligi: ${response.status}`);
    }

    const payload: GarvexTripPage = await response.json().catch(() => ({}));
    return payload && typeof payload === 'object' ? payload : {};
  }

  /** Split unitIds into batches and fetch trips for each batch, merging results. */
  private async fetchTrips(
    config: GarvexTrackingConfig,
    token: string,
    startUnix: number,
    endUnix: number,
    unitIds: number[] = [],
  ): Promise<GarvexTripRow[]> {
    const BATCH_SIZE = 3;
    const batches: number[][] = [];
    for (let i = 0; i < unitIds.length; i += BATCH_SIZE) {
      batches.push(unitIds.slice(i, i + BATCH_SIZE));
    }
    if (batches.length === 0) batches.push([]);

    const allRows: GarvexTripRow[] = [];
    for (const batch of batches) {
      try {
        const firstPage = await this.fetchTripsPage(config, token, startUnix, endUnix, 0, batch);
        const pageCount = Math.max(1, this.toOptionalInteger(firstPage?.pageCount) ?? 1);
        const limit = Math.min(pageCount, config.fetchMaxPages);
        if (Array.isArray(firstPage?.objects)) allRows.push(...firstPage.objects);

        for (let page = 1; page < limit; page += 1) {
          const nextPage = await this.fetchTripsPage(config, token, startUnix, endUnix, page, batch);
          if (Array.isArray(nextPage?.objects)) {
            allRows.push(...nextPage.objects);
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Garvex batch trips xatoligi';
        this.logger.warn(`Garvex GetTrips batch [${batch.join(',')}] failed: ${msg}`);
        // Continue with remaining batches instead of failing entirely
      }
    }

    return allRows;
  }

  private async fetchTripEventsPage(
    config: GarvexTrackingConfig,
    token: string,
    startUnix: number,
    endUnix: number,
    page: number,
    unitIds: number[] = [],
  ): Promise<GarvexTripEventPage> {
    const response = await this.fetchWithRetry(
      this.buildTripEventsUrl(config, startUnix, endUnix, page, unitIds),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      },
      Math.max(config.timeoutMs, 45_000),
      Math.max(config.requestRetries, 3),
    );

    if (!response.ok) {
      throw new BadRequestException(`Garvex Reports/GetTripEvents xatoligi: ${response.status}`);
    }

    const payload: GarvexTripEventPage = await response.json().catch(() => ({}));
    return payload && typeof payload === 'object' ? payload : {};
  }

  /** Split unitIds into batches and fetch trip events for each batch, merging results. */
  private async fetchTripEvents(
    config: GarvexTrackingConfig,
    token: string,
    startUnix: number,
    endUnix: number,
    unitIds: number[] = [],
  ): Promise<GarvexTripEvent[]> {
    const BATCH_SIZE = 3;
    const batches: number[][] = [];
    for (let i = 0; i < unitIds.length; i += BATCH_SIZE) {
      batches.push(unitIds.slice(i, i + BATCH_SIZE));
    }
    if (batches.length === 0) batches.push([]);

    const allRows: GarvexTripEvent[] = [];
    for (const batch of batches) {
      try {
        const firstPage = await this.fetchTripEventsPage(config, token, startUnix, endUnix, 0, batch);
        const pageCount = Math.max(1, this.toOptionalInteger(firstPage?.pageCount) ?? 1);
        const limit = Math.min(pageCount, config.fetchMaxPages);
        if (Array.isArray(firstPage?.objects)) allRows.push(...firstPage.objects);

        for (let page = 1; page < limit; page += 1) {
          const nextPage = await this.fetchTripEventsPage(config, token, startUnix, endUnix, page, batch);
          if (Array.isArray(nextPage?.objects)) {
            allRows.push(...nextPage.objects);
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Garvex batch trip events xatoligi';
        this.logger.warn(`Garvex GetTripEvents batch [${batch.join(',')}] failed: ${msg}`);
        // Continue with remaining batches instead of failing entirely
      }
    }

    return allRows;
  }

  private normalizeRouteStats(routeStats: GarvexRouteStats[]): NormalizedRouteStats[] {
    return routeStats.map((item) => ({
      unitId: this.toOptionalInteger(item.unitId) ?? null,
      name: this.normalizeWhitespace(item.unitName || '') || 'Noma\'lum transport',
      mileage: this.toOptionalNumber(item.mileage) ?? 0,
      avgSpeed: this.toOptionalNumber(item.avgSpeed) ?? 0,
      spentFuel: this.toOptionalNumber(item.spentFuel) ?? 0,
      spentAbsoluteFuel: this.toOptionalNumber(item.spentAbsoluteFuel) ?? 0,
      refueled: this.toOptionalNumber(item.refueled) ?? 0,
      drained: this.toOptionalNumber(item.drained) ?? 0,
      refuelCount: this.toOptionalInteger(item.refuelCount) ?? 0,
      drainCount: this.toOptionalInteger(item.drainCount) ?? 0,
      moveTime: this.toOptionalInteger(item.moveTime) ?? 0,
      parkTime: this.toOptionalInteger(item.parkTime) ?? 0,
      stopTime: this.toOptionalInteger(item.stopTime) ?? 0,
      stopCount: this.toOptionalInteger(item.stopCount) ?? 0,
      parkCount: this.toOptionalInteger(item.parkCount) ?? 0,
      motoHours: this.toOptionalInteger(item.motoHours) ?? 0,
      engineIdle: this.toOptionalInteger(item.engineIdle) ?? 0,
    }));
  }

  private normalizeTripRows(rows: GarvexTripRow[]): NormalizedTripRow[] {
    return rows.map((item) => ({
      unitId: this.toOptionalInteger(item.unitId) ?? null,
      name: this.normalizeWhitespace(item.unitName || '') || 'Noma\'lum transport',
      mileage: this.toOptionalNumber(item.mileage) ?? 0,
      avgSpeed: this.toOptionalNumber(item.avgSpeed) ?? 0,
      spentFuel: this.toOptionalNumber(item.spentFuel) ?? 0,
      refueled: this.toOptionalNumber(item.refueled) ?? 0,
      drained: this.toOptionalNumber(item.drained) ?? 0,
      refuelCount: this.toOptionalInteger(item.refuelCount) ?? 0,
      drainCount: this.toOptionalInteger(item.drainCount) ?? 0,
      moveTime: this.toOptionalInteger(item.moveTime) ?? 0,
      parkTime: this.toOptionalInteger(item.parkTime) ?? 0,
      stopTime: this.toOptionalInteger(item.stopTime) ?? 0,
      stopCount: this.toOptionalInteger(item.stopCount) ?? 0,
      parkCount: this.toOptionalInteger(item.parkCount) ?? 0,
      motoHours: this.toOptionalInteger(item.motoHours) ?? 0,
      engineIdle: this.toOptionalInteger(item.engineIdle) ?? 0,
      speedCount: this.toOptionalInteger(item.speedCount) ?? 0,
      startUnix: this.toOptionalInteger(item.startTime) ?? null,
      endUnix: this.toOptionalInteger(item.endTime) ?? null,
    }));
  }

  private normalizeTripEvents(rows: GarvexTripEvent[]): NormalizedTripEvent[] {
    return rows.map((item) => ({
      unitId: this.toOptionalInteger(item.unitId) ?? null,
      name: this.normalizeWhitespace(item.unitName || '') || 'Noma\'lum transport',
      eventType: this.toOptionalInteger(item.tripEventType) ?? -1,
      value: this.toOptionalNumber(item.value) ?? 0,
      duration: this.toOptionalInteger(item.duration) ?? 0,
      startUnix: this.toOptionalInteger(item.startTime) ?? null,
      endUnix: this.toOptionalInteger(item.endTime) ?? null,
    }));
  }

  private getStatsKey(item: Pick<NormalizedRouteStats, 'unitId' | 'name'>): string {
    return item.unitId ? `u${item.unitId}` : `n${item.name}`;
  }

  private aggregateRouteStatsFromTrips(rows: NormalizedTripRow[]): NormalizedRouteStats[] {
    const grouped = new Map<string, NormalizedRouteStats & { speedWeight: number }>();

    for (const row of rows) {
      const key = this.getStatsKey(row);
      const current = grouped.get(key) ?? {
        unitId: row.unitId,
        name: row.name,
        mileage: 0,
        avgSpeed: 0,
        spentFuel: 0,
        spentAbsoluteFuel: 0,
        refueled: 0,
        drained: 0,
        refuelCount: 0,
        drainCount: 0,
        moveTime: 0,
        parkTime: 0,
        stopTime: 0,
        stopCount: 0,
        parkCount: 0,
        motoHours: 0,
        engineIdle: 0,
        speedWeight: 0,
      };

      current.mileage += row.mileage;
      current.spentFuel += row.spentFuel;
      current.refueled += row.refueled;
      current.drained += row.drained;
      current.refuelCount += row.refuelCount;
      current.drainCount += row.drainCount;
      current.moveTime += row.moveTime;
      current.parkTime += row.parkTime;
      current.stopTime += row.stopTime;
      current.stopCount += row.stopCount;
      current.parkCount += row.parkCount;
      current.motoHours += row.motoHours;
      current.engineIdle += row.engineIdle;
      current.speedWeight += row.avgSpeed * Math.max(row.moveTime, 1);
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .map(({ speedWeight, ...item }) => ({
        ...item,
        avgSpeed: item.moveTime > 0 ? speedWeight / item.moveTime : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }

  private formatBucketLabel(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  }

  private getMileageBucketRanges(start: Date, end: Date): Array<{ label: string; start: Date; end: Date }> {
    const dayMs = 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() < dayMs) {
      return [{ label: this.formatBucketLabel(start), start, end }];
    }

    const ranges: Array<{ label: string; start: Date; end: Date }> = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= end.getTime()) {
      const bucketStart = new Date(Math.max(cursor.getTime(), start.getTime()));
      const bucketEnd = new Date(cursor);
      bucketEnd.setHours(23, 59, 59, 999);
      const safeBucketEnd = new Date(Math.min(bucketEnd.getTime(), end.getTime()));
      if (safeBucketEnd.getTime() >= bucketStart.getTime()) {
        ranges.push({
          label: this.formatBucketLabel(bucketStart),
          start: bucketStart,
          end: safeBucketEnd,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return ranges;
  }

  private tripUnixToDate(value: number | null): Date | null {
    if (!value || value <= 0) return null;
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private async buildMileageChartFromTrips(
    config: GarvexTrackingConfig,
    token: string,
    start: Date,
    end: Date,
    topStats: NormalizedRouteStats[],
  ): Promise<{ series: MileageSeries[]; buckets: MileageBucket[] }> {
    const series = topStats.map((item) => ({
      key: this.getStatsKey(item),
      name: item.name,
    }));
    const unitIds = topStats
      .map((item) => item.unitId)
      .filter((unitId): unitId is number => Number.isFinite(unitId) && unitId > 0);
    const ranges = this.getMileageBucketRanges(start, end);

    const buckets: MileageBucket[] = [];
    for (const range of ranges) {
      const rows = this.aggregateRouteStatsFromTrips(this.normalizeTripRows(await this.fetchTrips(
        config,
        token,
        Math.floor(range.start.getTime() / 1000),
        Math.floor(range.end.getTime() / 1000),
        unitIds,
      )));
      const byKey = new Map(rows.map((item) => [this.getStatsKey(item), item]));
      const values = Object.fromEntries(series.map((item) => {
        const mileage = byKey.get(item.key)?.mileage ?? 0;
        return [item.key, Number(mileage.toFixed(1))];
      }));

      buckets.push({
        label: range.label,
        startIso: range.start.toISOString(),
        endIso: range.end.toISOString(),
        values,
      });
    }

    return { series, buckets };
  }

  private getPointState(row: Pick<GarvexTrackingPoint, 'lat' | 'lng' | 'last_message_at' | 'status' | 'speed'>): 'moving' | 'parking' | 'offline' | 'noData' {
    if (row.lat == null || row.lng == null || !row.last_message_at) return 'noData';

    const seenAt = row.last_message_at.getTime();
    if (!Number.isFinite(seenAt) || Date.now() - seenAt > GARVEX_LIVE_AFTER_MS) return 'offline';
    return (row.speed ?? 0) > 2 ? 'moving' : 'parking';
  }

  private getDashboardConnectionState(row: Pick<GarvexTrackingPoint, 'last_message_at'>): 'online' | 'offline' | 'noData' {
    if (!row.last_message_at) return 'noData';
    const seenAt = row.last_message_at.getTime();
    if (!Number.isFinite(seenAt) || Date.now() - seenAt > GARVEX_LIVE_AFTER_MS) return 'offline';
    return 'online';
  }

  private getDashboardMovementState(row: Pick<GarvexTrackingPoint, 'last_message_at' | 'speed'>): 'moving' | 'parking' | 'offline' | 'noData' {
    if (!row.last_message_at) return 'noData';
    const seenAt = row.last_message_at.getTime();
    if (!Number.isFinite(seenAt) || Date.now() - seenAt > GARVEX_LIVE_AFTER_MS) return 'offline';
    return (row.speed ?? 0) > 2 ? 'moving' : 'parking';
  }

  async getDashboard(dateFrom?: string, dateTo?: string, preset?: string) {
    const range = this.getTrackingRange(dateFrom, dateTo, preset);
    let rows: Array<Pick<GarvexTrackingPoint,
      'unit_id' | 'unit_name' | 'status' | 'lat' | 'lng' | 'speed' | 'ignition' | 'fuel_level' | 'last_message_at' | 'updated_at'
    >> = await this.pointsRepo.find({
      order: { unit_name: 'ASC', unit_id: 'ASC' },
    });

    let normalizedTripStats: NormalizedRouteStats[] = [];
    let normalizedTripEvents: NormalizedTripEvent[] = [];
    let configForReport: GarvexTrackingConfig | null = null;
    let tokenForReport: string | null = null;
    let reportError: string | null = null;

    try {
      const config = this.getConfig();
      this.ensureConfigForSync(config);
      const token = await this.requestToken(config);
      configForReport = config;
      tokenForReport = token;
      const liveUnits = await this.fetchAllUnits(config, token);
      const liveRows = liveUnits
        .map((unit) => this.normalizeUnit(unit))
        .filter((row): row is Omit<GarvexTrackingPoint, 'id' | 'created_at' | 'updated_at'> => Boolean(row))
        .map((row) => ({ ...row, updated_at: new Date() }));
      if (liveRows.length > 0) {
        rows = liveRows;
        void this.persistUnits(liveRows).catch((error) => {
          const message = error instanceof Error ? error.message : 'Garvex live dashboard persist xatoligi';
          this.logger.warn(message);
        });
      }
      const unitIds = rows
        .map((row) => row.unit_id)
        .filter((unitId): unitId is number => Number.isFinite(unitId) && unitId > 0);
      const [trips, tripEvents] = await Promise.all([
        this.fetchTrips(config, token, range.startUnix, range.endUnix, unitIds),
        this.fetchTripEvents(config, token, range.startUnix, range.endUnix, unitIds),
      ]);
      normalizedTripStats = this.aggregateRouteStatsFromTrips(this.normalizeTripRows(trips));
      normalizedTripEvents = this.normalizeTripEvents(tripEvents);
    } catch (error) {
      reportError = error instanceof Error ? error.message : 'Garvex dashboard hisoboti xatoligi';
    }

    const connectionStates = rows.map((row) => this.getDashboardConnectionState(row));
    const movementStates = rows.map((row) => this.getDashboardMovementState(row));
    const online = connectionStates.filter((state) => state === 'online').length;
    const offline = connectionStates.filter((state) => state === 'offline').length;
    const noData = connectionStates.filter((state) => state === 'noData').length;
    const moving = movementStates.filter((state) => state === 'moving').length;
    const parking = movementStates.filter((state) => state === 'parking').length;
    const latestSyncAt = rows
      .map((row) => row.updated_at || row.last_message_at)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const totalMileage = normalizedTripStats.reduce((sum, item) => sum + item.mileage, 0);
    const totalMoveTime = normalizedTripStats.reduce((sum, item) => sum + item.moveTime, 0);
    const weightedSpeed = normalizedTripStats.reduce((sum, item) => sum + (item.avgSpeed * Math.max(item.moveTime, 1)), 0);
    const totalRefueled = normalizedTripEvents
      .filter((item) => item.eventType === 2)
      .reduce((sum, item) => sum + item.value, 0);
    const totalDrained = normalizedTripEvents
      .filter((item) => item.eventType === 3)
      .reduce((sum, item) => sum + item.value, 0);

    const topMileage = [...normalizedTripStats]
      .sort((a, b) => b.mileage - a.mileage)
      .slice(0, 5);
    let mileageChart: { series: MileageSeries[]; buckets: MileageBucket[] } = {
      series: topMileage.map((item) => ({ key: this.getStatsKey(item), name: item.name })),
      buckets: [],
    };
    if (configForReport && tokenForReport && topMileage.length > 0) {
      try {
        mileageChart = await this.buildMileageChartFromTrips(configForReport, tokenForReport, range.start, range.end, topMileage);
      } catch (error) {
        reportError = reportError || (error instanceof Error ? error.message : 'Garvex chart ma\'lumotlari xatoligi');
      }
    }

    return {
      source: 'garvex_mt',
      generatedAt: new Date().toISOString(),
      reportError,
      period: {
        preset: range.preset,
        startIso: range.start.toISOString(),
        endIso: range.end.toISOString(),
        requestedEndIso: range.requestedEnd.toISOString(),
        startUnix: range.startUnix,
        endUnix: range.endUnix,
      },
      connection: {
        total: rows.length,
        online,
        offline,
        noData,
      },
      movement: {
        total: rows.length,
        moving,
        parking,
        offline: offline + noData,
      },
      mileage: {
        total: totalMileage,
        averageSpeed: totalMoveTime > 0 ? weightedSpeed / totalMoveTime : 0,
        objectCount: normalizedTripStats.length,
        top: topMileage,
        items: normalizedTripStats,
        chart: mileageChart,
      },
      fuel: {
        refueled: totalRefueled,
        drained: totalDrained,
        total: totalRefueled + totalDrained,
        refuelCount: normalizedTripStats.reduce((sum, item) => sum + item.refuelCount, 0),
        drainCount: normalizedTripStats.reduce((sum, item) => sum + item.drainCount, 0),
      },
      current: {
        fuelKnown: rows.filter((row) => row.fuel_level != null).length,
        latestSyncAt: latestSyncAt ? latestSyncAt.toISOString() : null,
      },
    };
  }

  async getVehicles() {
    const rows = await this.pointsRepo.find({
      order: { unit_name: 'ASC', unit_id: 'ASC' },
    });

    return {
      source: 'garvex_mt',
      count: rows.length,
      items: rows.map((row) => ({
        unitId: row.unit_id,
        name: row.unit_name,
        objectCode: row.object_code,
        status: row.status,
        point: {
          x: row.lng,
          y: row.lat,
          a: row.address,
          speed: row.speed,
          dir: row.direction,
          ign: row.ignition,
          sats: row.satellites,
          fuelLevel: row.fuel_level,
        },
        lastMessageUnix: row.last_message_unix,
        lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
        syncedAt: row.updated_at ? row.updated_at.toISOString() : null,
      })),
    };
  }

  getHealth() {
    const config = this.getConfig();
    const staleAfterMs = Math.max(config.autoSyncMs * 3, 90_000);
    const isStale = this.lastSyncAt > 0 ? Date.now() - this.lastSyncAt > staleAfterMs : true;
    const effectiveStatus: GarvexHealthStatus =
      this.status === 'online' && isStale ? 'error' : this.status;

    return {
      status: effectiveStatus,
      enabled: config.enabled,
      authBaseUrl: config.authBaseUrl,
      apiBaseUrl: config.apiBaseUrl,
      lastSyncAt: this.lastSyncAt ? new Date(this.lastSyncAt).toISOString() : null,
      lastFullSyncAt: this.lastFullSyncAt ? new Date(this.lastFullSyncAt).toISOString() : null,
      lastSyncAttemptAt: this.lastSyncAttemptAt ? new Date(this.lastSyncAttemptAt).toISOString() : null,
      lastSyncError: this.lastSyncError,
      permission: this.lastPermission,
      stats: this.lastSyncStats,
      syncInFlight: Boolean(this.syncInFlight),
      stale: isStale,
    };
  }
}

@Controller('integrations/tracking/garvex')
export class GarvexTrackingController {
  constructor(private readonly service: GarvexTrackingService) {}

  @Get('health')
  async health() {
    return this.service.getHealth();
  }

  @Get('vehicles')
  async vehicles() {
    return this.service.getVehicles();
  }

  @Get('dashboard')
  async dashboard(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('preset') preset?: string,
  ) {
    return this.service.getDashboard(dateFrom, dateTo, preset);
  }

  @Get('sync')
  async sync() {
    await this.service.syncNow();
    return this.service.getHealth();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([GarvexTrackingPoint])],
  providers: [GarvexTrackingService],
  controllers: [GarvexTrackingController],
})
export class GarvexTrackingModule {}
