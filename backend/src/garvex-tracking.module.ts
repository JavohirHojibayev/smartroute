import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
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

type LastSyncStats = {
  mode: 'full' | 'delta';
  fetched: number;
  upserted: number;
  pages: number;
  removed?: number;
};

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
      status: this.normalizeWhitespace(unit?.status || '') || null,
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
