import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  Logger,
  Module,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthModule, AuthService } from './auth.module';
import { OneCWeightEntry } from '../entities/hr/onec-weight-entry.entity';
import { UserRole } from '../entities/people/user.entity';

type OneCWeightParsedRow = {
  externalId: string;
  measuredAt: Date;
  sourceUpdatedAt: Date | null;
  plate: string | null;
  documentNo: string | null;
  cargoType: string | null;
  grossWeight: number | null;
  tareWeight: number | null;
  netWeight: number | null;
  payload: any;
};

type OneCConfig = {
  enabled: boolean;
  baseUrl: string;
  username: string;
  password: string;
  entitySet: string;
  top: number;
  timeoutMs: number;
  autoSyncEveryMs: number;
};

@Injectable()
export class OneCWeightsService {
  private readonly logger = new Logger(OneCWeightsService.name);
  private syncInFlight: Promise<any> | null = null;
  private lastSyncAt = 0;
  private lastSyncError: string | null = null;
  private lastDiscoveredEntitySets: string[] = [];
  private lastResolvedEntitySet: string | null = null;
  private lastSyncAttemptAt = 0;

  constructor(
    @InjectRepository(OneCWeightEntry)
    private readonly onecWeightRepo: Repository<OneCWeightEntry>,
  ) {}

  private normalizeWhitespace(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  private normalizeBaseUrl(value: string): string {
    return this.normalizeWhitespace(value).replace(/\/+$/, '');
  }

  private getConfig(): OneCConfig {
    const enabledRaw = this.normalizeWhitespace(process.env.ONEC_WEIGHTS_ENABLED ?? 'false').toLowerCase();
    const enabled = enabledRaw !== 'false' && enabledRaw !== '0' && enabledRaw !== 'off';
    const baseUrl = this.normalizeBaseUrl(process.env.ONEC_BASE_URL || '');
    const username = this.normalizeWhitespace(process.env.ONEC_USERNAME || '');
    const password = String(process.env.ONEC_PASSWORD ?? '');
    const entitySet = this.normalizeWhitespace(process.env.ONEC_WEIGHT_ENTITY_SET || '');

    return {
      enabled,
      baseUrl,
      username,
      password,
      entitySet,
      top: Math.max(50, Math.min(5000, Number.parseInt(process.env.ONEC_WEIGHT_TOP ?? '1000', 10) || 1000)),
      timeoutMs: Math.max(3000, Math.min(60000, Number.parseInt(process.env.ONEC_TIMEOUT_MS ?? '15000', 10) || 15000)),
      autoSyncEveryMs: Math.max(
        5000,
        Math.min(10000, Number.parseInt(process.env.ONEC_AUTO_SYNC_MS ?? '5000', 10) || 5000),
      ),
    };
  }

  private ensureConfigForSync(config: OneCConfig) {
    if (!config.enabled) {
      throw new BadRequestException('1C tarozi integratsiyasi o\'chirilgan');
    }
    if (!config.baseUrl) {
      throw new BadRequestException('ONEC_BASE_URL sozlanmagan');
    }
    if (!config.username || !config.password) {
      throw new BadRequestException('ONEC_USERNAME va ONEC_PASSWORD sozlanmagan');
    }
  }

  private toBasicAuthHeader(username: string, password: string): string {
    const token = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
    return `Basic ${token}`;
  }

  private async onecFetch(config: OneCConfig, path = '') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const target = `${config.baseUrl}${path ? `/${path}` : ''}`;

    try {
      const response = await fetch(target, {
        method: 'GET',
        headers: {
          Accept: 'application/json, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
          Authorization: this.toBasicAuthHeader(config.username, config.password),
        },
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseEntitySetsFromServiceDoc(xml: string): string[] {
    const matches = [...xml.matchAll(/<collection[^>]*href="([^"]+)"/gi)];
    return matches
      .map((match) => this.normalizeWhitespace(match[1]))
      .filter(Boolean);
  }

  private parseEntitySetsFromServiceDocJson(payload: any): string[] {
    const value = Array.isArray(payload?.value) ? payload.value : [];
    const unique = new Set<string>();

    for (const row of value) {
      if (typeof row === 'string') {
        const normalized = this.normalizeWhitespace(row);
        if (normalized) unique.add(normalized);
        continue;
      }
      if (!row || typeof row !== 'object') continue;

      const candidates = [
        row.name,
        row.Name,
        row.url,
        row.Url,
        row.href,
        row.Href,
        row.entitySet,
        row.EntitySet,
      ];
      for (const candidate of candidates) {
        const normalized = this.normalizeWhitespace(candidate);
        if (normalized) unique.add(normalized);
      }
    }

    return [...unique];
  }

  private parseEntitySetsFromMetadata(xml: string): string[] {
    const matches = [...xml.matchAll(/<EntitySet\b[^>]*\bName=(?:"([^"]+)"|'([^']+)')/gi)];
    const names = matches
      .map((match) => this.normalizeWhitespace(match[1] || match[2]))
      .filter(Boolean);
    return [...new Set(names)];
  }

  private async discoverEntitySets(config: OneCConfig): Promise<string[]> {
    const response = await this.onecFetch(config);
    if (!response.ok) {
      throw new BadRequestException(`1C service doc xatoligi: ${response.status}`);
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const body = await response.text();

    if (contentType.includes('json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
      try {
        const jsonPayload = JSON.parse(body);
        const fromJson = this.parseEntitySetsFromServiceDocJson(jsonPayload);
        if (fromJson.length > 0) return fromJson;
      } catch {
        // Continue with XML fallback parsing.
      }
    }

    const fromXmlServiceDoc = this.parseEntitySetsFromServiceDoc(body);
    if (fromXmlServiceDoc.length > 0) return fromXmlServiceDoc;

    const metadataResponse = await this.onecFetch(config, '$metadata');
    if (!metadataResponse.ok) {
      return [];
    }
    const metadataXml = await metadataResponse.text();
    return this.parseEntitySetsFromMetadata(metadataXml);
  }

  private getSystemStatus(config: OneCConfig): 'online' | 'offline' {
    if (!config.enabled) return 'offline';
    if (!this.lastSyncAt) return 'offline';
    if (this.lastSyncError) return 'offline';
    const staleAfterMs = Math.max(config.autoSyncEveryMs * 3, 60_000);
    if (Date.now() - this.lastSyncAt > staleAfterMs) return 'offline';
    return 'online';
  }

  private resolveEntitySet(config: OneCConfig, discovered: string[]): string {
    if (config.entitySet) return config.entitySet;
    if (discovered.length === 1) return discovered[0];
    throw new BadRequestException(
      `ONEC_WEIGHT_ENTITY_SET aniqlanmadi. Topilgan EntitySet lar: ${discovered.length ? discovered.join(', ') : 'yo\'q'}`,
    );
  }

  private normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
  }

  private findFieldByAliases(obj: Record<string, any>, aliases: string[]): string | null {
    const keys = Object.keys(obj);
    const normalizedAliases = aliases.map((alias) => this.normalizeKey(alias));
    for (const key of keys) {
      const normKey = this.normalizeKey(key);
      if (normalizedAliases.some((alias) => normKey.includes(alias))) {
        return key;
      }
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
    if (value == null) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === 'number' && Number.isFinite(value)) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const raw = this.normalizeWhitespace(value);
    if (!raw) return null;
    const odataMatch = raw.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//i);
    if (odataMatch) {
      const ms = Number.parseInt(odataMatch[1], 10);
      if (Number.isFinite(ms)) {
        const date = new Date(ms);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseODataPayload(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.value)) return payload.value;
    if (Array.isArray(payload?.d?.results)) return payload.d.results;
    if (Array.isArray(payload?.d)) return payload.d;
    return [];
  }

  private parseOneCWeightRow(row: Record<string, any>, idx: number): OneCWeightParsedRow | null {
    const externalIdField =
      this.findFieldByAliases(row, ['Ref_Key', 'Ссылка_Key', 'RefKey', 'id', 'key']) ||
      null;
    const plateField = this.findFieldByAliases(row, [
      'plate',
      'gosnomer',
      'avto',
      'transport',
      'госномер',
      'авто',
      'машина',
    ]);
    const docNoField = this.findFieldByAliases(row, ['number', 'docnumber', 'номер']);
    const cargoField = this.findFieldByAliases(row, ['cargo', 'gruz', 'nomenklatura', 'material', 'груз']);
    const grossField = this.findFieldByAliases(row, ['gross', 'brutto', 'весбрутто', 'брутто', 'vesbrutto']);
    const tareField = this.findFieldByAliases(row, ['tare', 'tara', 'вес тары', 'тара', 'vestari']);
    const netField = this.findFieldByAliases(row, ['net', 'netto', 'веснетто', 'нетто', 'vesnetto']);
    const measuredAtField = this.findFieldByAliases(row, ['date', 'datetime', 'time', 'дата', 'время']);
    const updatedAtField = this.findFieldByAliases(row, ['modified', 'updated', 'версияданных', 'modification']);

    const externalIdRaw = externalIdField ? row[externalIdField] : null;
    const externalId = this.normalizeWhitespace(externalIdRaw) || `row-${idx}-${Date.now()}`;
    const measuredAt = this.parseDate(measuredAtField ? row[measuredAtField] : null);
    if (!measuredAt) return null;

    const grossWeight = this.parseNumber(grossField ? row[grossField] : null);
    const tareWeight = this.parseNumber(tareField ? row[tareField] : null);
    let netWeight = this.parseNumber(netField ? row[netField] : null);
    if (netWeight == null && grossWeight != null && tareWeight != null) {
      netWeight = grossWeight - tareWeight;
    }

    return {
      externalId,
      measuredAt,
      sourceUpdatedAt: this.parseDate(updatedAtField ? row[updatedAtField] : null),
      plate: plateField ? this.normalizeWhitespace(row[plateField]).toUpperCase() || null : null,
      documentNo: docNoField ? this.normalizeWhitespace(row[docNoField]) || null : null,
      cargoType: cargoField ? this.normalizeWhitespace(row[cargoField]) || null : null,
      grossWeight,
      tareWeight,
      netWeight,
      payload: row,
    };
  }

  private async fetchRawOneCRows(config: OneCConfig) {
    const discoveredEntitySets = await this.discoverEntitySets(config);
    const entitySet = this.resolveEntitySet(config, discoveredEntitySets);

    const path = `${entitySet}?$format=json&$top=${config.top}`;
    const response = await this.onecFetch(config, path);
    if (!response.ok) {
      throw new BadRequestException(`1C tarozi ma'lumotini olishda xatolik: ${response.status}`);
    }
    const payload = await response.json().catch(() => null);
    const rows = this.parseODataPayload(payload);
    return { entitySet, rows, discoveredEntitySets };
  }

  private async upsertRows(rows: OneCWeightParsedRow[]) {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const existing = await this.onecWeightRepo.findOne({ where: { external_id: row.externalId } });
      if (!existing) {
        const created = this.onecWeightRepo.create({
          external_id: row.externalId,
          measured_at: row.measuredAt,
          source_updated_at: row.sourceUpdatedAt,
          plate: row.plate,
          document_no: row.documentNo,
          cargo_type: row.cargoType,
          gross_weight: row.grossWeight,
          tare_weight: row.tareWeight,
          net_weight: row.netWeight,
          source_payload: row.payload,
        });
        await this.onecWeightRepo.save(created);
        inserted += 1;
        continue;
      }

      const existingUpdatedAtMs = existing.source_updated_at ? new Date(existing.source_updated_at).getTime() : 0;
      const nextUpdatedAtMs = row.sourceUpdatedAt ? row.sourceUpdatedAt.getTime() : 0;
      const shouldUpdate = nextUpdatedAtMs >= existingUpdatedAtMs;

      if (!shouldUpdate) {
        skipped += 1;
        continue;
      }

      existing.measured_at = row.measuredAt;
      existing.source_updated_at = row.sourceUpdatedAt;
      existing.plate = row.plate;
      existing.document_no = row.documentNo;
      existing.cargo_type = row.cargoType;
      existing.gross_weight = row.grossWeight;
      existing.tare_weight = row.tareWeight;
      existing.net_weight = row.netWeight;
      existing.source_payload = row.payload;
      await this.onecWeightRepo.save(existing);
      updated += 1;
    }

    return { inserted, updated, skipped };
  }

  async syncNow() {
    const config = this.getConfig();
    this.ensureConfigForSync(config);
    this.lastSyncAttemptAt = Date.now();

    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = (async () => {
      const startedAt = new Date();
      const { entitySet, rows: rawRows, discoveredEntitySets } = await this.fetchRawOneCRows(config);
      const parsedRows: OneCWeightParsedRow[] = [];
      let parseSkipped = 0;

      rawRows.forEach((item: any, idx: number) => {
        const parsed = this.parseOneCWeightRow(item, idx);
        if (parsed) parsedRows.push(parsed);
        else parseSkipped += 1;
      });

      const upserted = await this.upsertRows(parsedRows);
      this.lastSyncAt = Date.now();
      this.lastSyncError = null;
      this.lastResolvedEntitySet = entitySet;
      this.lastDiscoveredEntitySets = discoveredEntitySets;

      return {
        ok: true,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        entitySet,
        discoveredEntitySets,
        fetched: rawRows.length,
        parsed: parsedRows.length,
        parseSkipped,
        ...upserted,
      };
    })();

    try {
      return await this.syncInFlight;
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error);
      this.logger.warn(`1C sync failed: ${String(error)}`);
      throw error;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async ensureFreshData() {
    const config = this.getConfig();
    if (!config.enabled) return;
    if (Date.now() - this.lastSyncAt < config.autoSyncEveryMs) return;

    await this.syncNow().catch((error) => {
      this.logger.warn(`1C background sync warning: ${String(error)}`);
    });
  }

  private parseDateRange(dateFrom?: string, dateTo?: string) {
    const parse = (value?: string): Date | null => {
      const normalized = this.normalizeWhitespace(value);
      if (!normalized) return null;
      const parsed = new Date(normalized);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const from = parse(dateFrom);
    const to = parse(dateTo);
    return {
      from,
      to: to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null,
    };
  }

  async getSummary(params: { dateFrom?: string; dateTo?: string; cargoType?: string }) {
    await this.ensureFreshData();
    const config = this.getConfig();

    const range = this.parseDateRange(params.dateFrom, params.dateTo);
    let query = this.onecWeightRepo.createQueryBuilder('entry');

    if (range.from) {
      query = query.andWhere('datetime(entry.measured_at) >= datetime(:from)', { from: range.from.toISOString() });
    }
    if (range.to) {
      query = query.andWhere('datetime(entry.measured_at) < datetime(:to)', { to: range.to.toISOString() });
    }
    const cargoType = this.normalizeWhitespace(params.cargoType);
    if (cargoType && cargoType.toLowerCase() !== 'all') {
      query = query.andWhere('LOWER(COALESCE(entry.cargo_type, \'\')) = :cargoType', {
        cargoType: cargoType.toLowerCase(),
      });
    }

    const rows = await query.orderBy('entry.measured_at', 'DESC').limit(5000).getMany();
    const toNumber = (value: any) => (value == null ? 0 : Number(value) || 0);

    const totalGross = rows.reduce((sum, row) => sum + toNumber(row.gross_weight), 0);
    const totalTare = rows.reduce((sum, row) => sum + toNumber(row.tare_weight), 0);
    const totalNet = rows.reduce((sum, row) => sum + toNumber(row.net_weight), 0);

    const byVehicleMap = new Map<string, { plate: string; count: number; totalNet: number; totalGross: number; totalTare: number }>();
    const byCargoMap = new Map<string, { cargoType: string; count: number; totalNet: number; totalGross: number }>();

    for (const row of rows) {
      const plate = this.normalizeWhitespace(row.plate) || '-';
      const cargo = this.normalizeWhitespace(row.cargo_type) || "Noma'lum";
      const net = toNumber(row.net_weight);
      const gross = toNumber(row.gross_weight);
      const tare = toNumber(row.tare_weight);

      const vehicleBucket = byVehicleMap.get(plate) || { plate, count: 0, totalNet: 0, totalGross: 0, totalTare: 0 };
      vehicleBucket.count += 1;
      vehicleBucket.totalNet += net;
      vehicleBucket.totalGross += gross;
      vehicleBucket.totalTare += tare;
      byVehicleMap.set(plate, vehicleBucket);

      const cargoBucket = byCargoMap.get(cargo) || { cargoType: cargo, count: 0, totalNet: 0, totalGross: 0 };
      cargoBucket.count += 1;
      cargoBucket.totalNet += net;
      cargoBucket.totalGross += gross;
      byCargoMap.set(cargo, cargoBucket);
    }

    const byVehicle = [...byVehicleMap.values()].sort((a, b) => b.totalNet - a.totalNet).slice(0, 20);
    const byCargo = [...byCargoMap.values()].sort((a, b) => b.totalNet - a.totalNet);

    return {
      source: '1c',
      totalRecords: rows.length,
      totalGross,
      totalTare,
      totalNet,
      byVehicle,
      byCargo,
      lastSyncAt: this.lastSyncAt ? new Date(this.lastSyncAt).toISOString() : null,
      systemStatus: this.getSystemStatus(config),
      syncError: this.lastSyncError,
    };
  }

  async getJournal(params: {
    dateFrom?: string;
    dateTo?: string;
    cargoType?: string;
    search?: string;
    page?: string;
    pageSize?: string;
  }) {
    await this.ensureFreshData();
    const config = this.getConfig();

    const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(params.pageSize || '50', 10) || 50));
    const search = this.normalizeWhitespace(params.search).toLowerCase();
    const cargoType = this.normalizeWhitespace(params.cargoType).toLowerCase();
    const range = this.parseDateRange(params.dateFrom, params.dateTo);

    let query = this.onecWeightRepo.createQueryBuilder('entry');

    if (range.from) {
      query = query.andWhere('datetime(entry.measured_at) >= datetime(:from)', { from: range.from.toISOString() });
    }
    if (range.to) {
      query = query.andWhere('datetime(entry.measured_at) < datetime(:to)', { to: range.to.toISOString() });
    }
    if (cargoType && cargoType !== 'all') {
      query = query.andWhere('LOWER(COALESCE(entry.cargo_type, \'\')) = :cargoType', { cargoType });
    }
    if (search) {
      query = query.andWhere(
        '(LOWER(COALESCE(entry.plate, \'\')) LIKE :q OR LOWER(COALESCE(entry.document_no, \'\')) LIKE :q OR LOWER(COALESCE(entry.cargo_type, \'\')) LIKE :q)',
        { q: `%${search}%` },
      );
    }

    const total = await query.getCount();
    const rows = await query
      .orderBy('entry.measured_at', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany();

    return {
      items: rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        measuredAt: row.measured_at ? new Date(row.measured_at).toISOString() : null,
        plate: row.plate,
        documentNo: row.document_no,
        cargoType: row.cargo_type,
        grossWeight: row.gross_weight == null ? null : Number(row.gross_weight),
        tareWeight: row.tare_weight == null ? null : Number(row.tare_weight),
        netWeight: row.net_weight == null ? null : Number(row.net_weight),
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      lastSyncAt: this.lastSyncAt ? new Date(this.lastSyncAt).toISOString() : null,
      systemStatus: this.getSystemStatus(config),
      syncError: this.lastSyncError,
    };
  }

  async getHealth() {
    const config = this.getConfig();
    const discoveredEntitySets = config.enabled && config.username && config.password
      ? await this.discoverEntitySets(config).catch(() => this.lastDiscoveredEntitySets)
      : [];

    if (discoveredEntitySets.length > 0) {
      this.lastDiscoveredEntitySets = discoveredEntitySets;
    }

    return {
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      entitySet: config.entitySet || this.lastResolvedEntitySet || null,
      discoveredEntitySets,
      lastSyncAt: this.lastSyncAt ? new Date(this.lastSyncAt).toISOString() : null,
      lastSyncAttemptAt: this.lastSyncAttemptAt ? new Date(this.lastSyncAttemptAt).toISOString() : null,
      lastSyncError: this.lastSyncError,
      systemStatus: this.getSystemStatus(config),
    };
  }
}

@Controller('integrations/1c/weights')
export class OneCWeightsController {
  constructor(
    private readonly onecService: OneCWeightsService,
    private readonly authService: AuthService,
  ) {}

  @Get('health')
  async health(@Headers('authorization') authorization?: string) {
    await this.authService.requireUserFromAuthorization(authorization);
    return this.onecService.getHealth();
  }

  @Post('sync')
  async sync(@Headers('authorization') authorization?: string) {
    const actor = await this.authService.requireUserFromAuthorization(authorization);
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Sync faqat admin uchun ruxsat etilgan');
    }
    return this.onecService.syncNow();
  }

  @Get('summary')
  async summary(
    @Headers('authorization') authorization?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('cargoType') cargoType?: string,
  ) {
    await this.authService.requireUserFromAuthorization(authorization);
    return this.onecService.getSummary({ dateFrom, dateTo, cargoType });
  }

  @Get('journal')
  async journal(
    @Headers('authorization') authorization?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('cargoType') cargoType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    await this.authService.requireUserFromAuthorization(authorization);
    return this.onecService.getJournal({ dateFrom, dateTo, cargoType, search, page, pageSize });
  }
}

import { Trip, TripStatus } from '../entities/fleet/trip.entity';
import { Driver } from '../entities/people/driver.entity';

@Controller('integrations/1c/trips')
export class OneCTripsController {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
  ) {}

  @Post('sync')
  async receiveFrom1C(@Headers('authorization') authorization?: string, @Query('api_key') apiKey?: string, @Body() payload?: any) {
    if (apiKey !== (process.env.ONEC_API_KEY || 'secret-1c-key')) {
      throw new ForbiddenException('Invalid API Key');
    }

    if (!payload || !payload.id) {
      throw new BadRequestException('Invalid payload from 1C');
    }

    let trip = await this.tripRepo.findOne({ where: { external_1c_id: payload.id }, relations: ['driver'] });
    if (!trip) {
      trip = this.tripRepo.create({
        external_1c_id: payload.id,
        status: TripStatus.PENDING,
      });
    }

    trip.route_description = payload.route || trip.route_description;
    trip.plate = payload.plate || trip.plate;
    trip.cargo = payload.cargo || trip.cargo;
    trip.weight = payload.weight || trip.weight;

    // A. Xodimning ismidan izlab topish (Driver lookup by full name)
    const driverName = String(payload.driver || '').trim();
    if (driverName) {
      let driver = await this.driverRepo
        .createQueryBuilder('driver')
        .where('LOWER(driver.full_name) = :fullName', { fullName: driverName.toLowerCase() })
        .getOne();
        
      if (!driver) {
        // Create a basic driver record if it doesn't exist
        driver = this.driverRepo.create({
          full_name: driverName,
          license_number: `1C-${Date.now()}`, // Temporary fallback pass ID
          is_active: true,
        });
        driver = await this.driverRepo.save(driver);
      }
      trip.driver = driver;
    }

    if (!trip.esmo_qr_data) {
       trip.esmo_qr_data = 'https://esmo.uz/verify?id=' + payload.id;
    }
    if (!trip.e_imzo_qr_data) {
       trip.e_imzo_qr_data = 'https://e-imzo.uz/verify?doc=' + payload.id;
    }

    await this.tripRepo.save(trip);
    return { success: true, tripId: trip.id };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([OneCWeightEntry, Trip, Driver]), AuthModule],
  controllers: [OneCWeightsController, OneCTripsController],
  providers: [OneCWeightsService],
})
export class OneCModule {}
