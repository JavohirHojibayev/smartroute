import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Driver } from '../entities/people/driver.entity';
import { CheckStatus } from '../entities/people/medical.entity';
import { Module, Controller, Post, Body, Get, Query, UnauthorizedException, Headers, Req, Logger, Res, HttpCode, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Response } from 'express';
import {
  computeTurnstileDailyAccessKpis,
  getAccessKpisTashkentDayBounds,
  getEffectiveTurnstileDeviceIpMap,
} from '../utils/turnstile-daily-access-kpis.util';
import { HikvisionPollerService } from '../hikvision/hikvision-poller.service';
import {
  isMineShahtaFromStoredDevices,
  readTurnstileNoiseEnvFromProcess,
  shouldIgnoreHikvisionTurnstilePayload,
} from '../hikvision/hikvision-access-event-filter';
import {
  isMineShahtaDeviceEntry,
  resolveWebhookJournalDevice,
} from '../hikvision/turnstile-webhook-device.util';

type HikvisionEventType = 'entrance' | 'exit';
type DeviceMapEntry = {
  key: string;
  deviceId: string;
  deviceName: string;
  eventType: HikvisionEventType;
};

@Entity('access_logs')
export class AccessLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column({ length: 100, nullable: true })
  device_id: string;

  @Column({ length: 100, nullable: true })
  device_name: string;

  @Column({ length: 32, default: 'entrance' })
  event_type: string;

  @Column({ length: 32, nullable: true })
  temperature: string;

  @Column({ length: 255, nullable: true })
  person_name: string;

  @Column({ length: 128, nullable: true })
  department: string | null;

  @Column({ length: 255, nullable: true })
  face_id_hash: string;

  @Column({ length: 64, nullable: true })
  event_serial: string;

  @Column({ type: 'simple-json', nullable: true })
  raw_payload: any;

  @Column({
    type: 'simple-enum',
    enum: CheckStatus,
    default: CheckStatus.PENDING,
  })
  status: CheckStatus;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  access_time: Date;
}

@Entity('turnstile_identities')
export class TurnstileIdentity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 128 })
  external_id: string;

  @Column({ length: 255 })
  full_name: string;

  @Column({ length: 128, nullable: true })
  department: string | null;

  @Column({ length: 64, nullable: true })
  source_ip: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  last_seen: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}

@Entity('turnstile_status_events')
export class TurnstileStatusEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 100 })
  device_id: string;

  @Column({ length: 100 })
  device_name: string;

  @Column({ length: 64, nullable: true })
  source_ip: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  last_seen: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}

@Controller(['integrations/hikvision', 'api/v1/hikvision'])
export class HikvisionController implements OnModuleInit {
  private readonly logger = new Logger(HikvisionController.name);
  /** Asosiy + `HIKVISION_EXTRA_DEVICE_MAP` (MineTrack / boshqa segmentlar). */
  private readonly deviceIpMap: Record<string, DeviceMapEntry> = getEffectiveTurnstileDeviceIpMap();
  private readonly dedupSeconds = Math.max(Number.parseInt(process.env.HIKVISION_DEDUP_SECONDS ?? '30', 10) || 30, 1);
  private readonly shahtaDedupSeconds = Math.max(
    Number.parseInt(process.env.HIKVISION_SHAHTA_DEDUP_SECONDS ?? '60', 10) || 60,
    this.dedupSeconds,
  );
  private readonly pairDedupSeconds = Math.max(Number.parseInt(process.env.HIKVISION_PAIR_DEDUP_SECONDS ?? '12', 10) || 12, 1);
  private readonly crossDeviceDedupSeconds = Math.max(Number.parseInt(process.env.HIKVISION_CROSS_DEVICE_DEDUP_SECONDS ?? '12', 10) || 12, 1);
  private readonly mineFactoryDedupSeconds = Math.max(Number.parseInt(process.env.HIKVISION_MINE_FACTORY_DEDUP_SECONDS ?? '120', 10) || 120, 10);
  private readonly strictSourceIp = String(process.env.HIKVISION_STRICT_SOURCE_IP ?? 'true').toLowerCase() === 'true';
  private readonly maxEventAgeMinutes = Math.max(Number.parseInt(process.env.HIKVISION_MAX_EVENT_AGE_MINUTES ?? '180', 10) || 180, 1);
  private readonly maxFutureSkewMinutes = Math.max(Number.parseInt(process.env.HIKVISION_MAX_FUTURE_SKEW_MINUTES ?? '5', 10) || 5, 1);
  private readonly turnstileOfflineMinutes = Math.max(Number.parseInt(process.env.HIKVISION_DEVICE_OFFLINE_MINUTES ?? '480', 10) || 480, 5);
  private readonly recordAllEvents = String(process.env.HIKVISION_RECORD_ALL_EVENTS ?? 'false').toLowerCase() === 'true';
  /**
   * Eski (>maxEventAgeMinutes) hodisalar qabul qilinmaydi. `true` o‘rnatilsa, eski hodisaga server vaqti
   * qo‘yib yoziladi (eski xatti-harakat). Defaultda yozish to‘xtatiladi — bu qurilma navbatidagi 2-3
   * haftalik tarixiy o‘tishlarni "hozir o‘tdi" deb ko‘rsatishini va xato turniketga yozilishini oldini oladi.
   */
  private readonly adjustStaleEventToServerTime = String(
    process.env.HIKVISION_ADJUST_STALE_TO_SERVER_TIME ?? 'false',
  ).toLowerCase() === 'true';
  /** Hikvision webhook shovqin filtri (zavod + shaxta; shaxta uchun qo‘shimcha qat’iyat). */
  private readonly turnstileNoiseEnv = readTurnstileNoiseEnvFromProcess();
  /**
   * GET /logs sahifalash: bir so‘rovda qaytariladigan maksimal qatorlar.
   * `HIKVISION_LOGS_MAX_LIMIT=0` yoki bo‘sh — amalda cheklovsiz (5_000_000 gacha xavfsizlik limiti).
   * Aniq son berilsa, 1..5_000_000 oralig‘ida qabul qilinadi.
   */
  private readonly logsMaxPageSize = (() => {
    const raw = (process.env.HIKVISION_LOGS_MAX_LIMIT ?? '').trim();
    if (raw === '' || raw === '0') return 5_000_000;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 5_000_000;
    return Math.min(n, 5_000_000);
  })();
  /**
   * `dateFrom` va `dateTo` bo‘lmasa, jurnal GET /logs va eksport uchun yashirin oralik (butun jadvalni skanerlamaslik).
   * `HIKVISION_LOGS_DEFAULT_RANGE_DAYS=0` — cheklov yo‘q (eski xatti-harakat).
   */
  private readonly logsDefaultRangeDays = (() => {
    const raw = (process.env.HIKVISION_LOGS_DEFAULT_RANGE_DAYS ?? '120').trim();
    if (raw === '' || raw === '0') return 0;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 120;
    return Math.min(n, 3650);
  })();

  constructor(
    @InjectRepository(AccessLog)
    private accessRepo: Repository<AccessLog>,
    @InjectRepository(Driver)
    private driverRepo: Repository<Driver>,
    @InjectRepository(TurnstileIdentity)
    private identityRepo: Repository<TurnstileIdentity>,
    @InjectRepository(TurnstileStatusEvent)
    private turnstileStatusRepo: Repository<TurnstileStatusEvent>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAccessLogSerialUniqueness();
  }

  private async ensureAccessLogSerialUniqueness(): Promise<void> {
    try {
      const duplicateStats = await this.accessRepo.query(`
        SELECT COALESCE(SUM(cnt - 1), 0) AS extra_rows
        FROM (
          SELECT COUNT(*) AS cnt
          FROM access_logs
          WHERE event_serial IS NOT NULL
            AND TRIM(event_serial) <> ''
            AND device_id IS NOT NULL
            AND TRIM(device_id) <> ''
          GROUP BY event_serial, device_id
          HAVING COUNT(*) > 1
        ) t
      `);
      const duplicateExtraRows = Number(duplicateStats?.[0]?.extra_rows ?? 0);

      if (duplicateExtraRows > 0) {
        await this.accessRepo.query(`
          DELETE FROM access_logs
          WHERE id IN (
            SELECT d.id
            FROM access_logs d
            JOIN (
              SELECT MIN(id) AS keep_id, event_serial, device_id
              FROM access_logs
              WHERE event_serial IS NOT NULL
                AND TRIM(event_serial) <> ''
                AND device_id IS NOT NULL
                AND TRIM(device_id) <> ''
              GROUP BY event_serial, device_id
              HAVING COUNT(*) > 1
            ) g
              ON d.event_serial = g.event_serial
             AND d.device_id = g.device_id
             AND d.id <> g.keep_id
          )
        `);
        this.logger.warn(`Removed ${duplicateExtraRows} duplicate access log rows by event_serial+device_id.`);
      }

      await this.accessRepo.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_access_logs_event_serial_device_unique
        ON access_logs(event_serial, device_id)
        WHERE event_serial IS NOT NULL
          AND TRIM(event_serial) <> ''
          AND device_id IS NOT NULL
          AND TRIM(device_id) <> ''
      `);
      await this.accessRepo.query(`
        CREATE INDEX IF NOT EXISTS idx_access_logs_access_time_id
        ON access_logs(access_time DESC, id DESC)
      `);
      await this.accessRepo.query(`
        CREATE INDEX IF NOT EXISTS idx_access_logs_device_id_time
        ON access_logs(device_id, access_time DESC)
      `);
      await this.accessRepo.query(`
        CREATE INDEX IF NOT EXISTS idx_access_logs_person_name
        ON access_logs(person_name)
      `);
    } catch (error) {
      this.logger.error(`Failed to enforce access log uniqueness: ${(error as Error)?.message ?? error}`);
    }
  }

  private isAccessLogUniqueConstraintError(error: unknown): boolean {
    const message = String((error as any)?.message ?? '');
    return message.includes('idx_access_logs_event_serial_device_unique') ||
      message.includes('UNIQUE constraint failed: access_logs.event_serial, access_logs.device_id');
  }

  private normalizeWhitespace(value: string | null | undefined): string {
    return String(value ?? '').replace(/\s+/g, ' ').replace(/\t+/g, ' ').trim();
  }

  /** GET /logs va GET /summary jurnal sanalari bilan bir xil `YYYY-MM-DD` → vaqt oralig‘i. */
  private parseAccessLogDateFilters(
    dateFrom?: string,
    dateTo?: string,
  ): { fromStart: Date | null; toEnd: Date | null } {
    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
    const normalizedDateFrom = this.normalizeWhitespace(dateFrom);
    const normalizedDateTo = this.normalizeWhitespace(dateTo);

    let fromStart: Date | null = null;
    if (dateOnlyPattern.test(normalizedDateFrom)) {
      const parsedFrom = new Date(`${normalizedDateFrom}T00:00:00`);
      if (!Number.isNaN(parsedFrom.getTime())) {
        fromStart = parsedFrom;
      }
    }

    let toEnd: Date | null = null;
    if (dateOnlyPattern.test(normalizedDateTo)) {
      const parsedTo = new Date(`${normalizedDateTo}T23:59:59.999`);
      if (!Number.isNaN(parsedTo.getTime())) {
        toEnd = parsedTo;
      }
    }

    if (fromStart && toEnd && fromStart.getTime() > toEnd.getTime()) {
      const tmp = fromStart;
      fromStart = new Date(toEnd.getTime());
      toEnd = new Date(tmp.getTime());
    }

    return { fromStart, toEnd };
  }

  private normalizeExternalId(value: string | null | undefined): string {
    const raw = this.normalizeWhitespace(value);
    if (!raw) return '';
    if (/^\d+$/.test(raw)) {
      const stripped = raw.replace(/^0+/, '');
      return stripped || '0';
    }
    return raw;
  }

  private normalizePersonName(value: string | null | undefined): string {
    const raw = this.normalizeWhitespace(value);
    if (!raw) return '';

    // Clean broken quote bursts from some Hikvision payloads.
    return raw
      .replace(/'{2,}/g, "'")
      .replace(/"{2,}/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeDepartment(value: string | null | undefined): string | null {
    const raw = this.normalizeWhitespace(value);
    return raw || null;
  }

  private findFirstStringByKeys(input: unknown, keyCandidates: string[]): string | null {
    if (!input) return null;
    const wanted = new Set(keyCandidates.map((k) => k.toLowerCase()));
    const queue: unknown[] = [input];
    const seen = new Set<unknown>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || seen.has(current)) continue;
      seen.add(current);

      if (Array.isArray(current)) {
        current.forEach((item) => queue.push(item));
        continue;
      }

      if (typeof current === 'object') {
        const record = current as Record<string, unknown>;
        for (const [key, value] of Object.entries(record)) {
          if (wanted.has(key.toLowerCase())) {
            const normalized = this.normalizeDepartment(this.normalizeWhitespace(String(value ?? '')));
            if (normalized) return normalized;
          }
          if (value && typeof value === 'object') {
            queue.push(value);
          }
        }
      }
    }

    return null;
  }

  private extractDepartmentFromPayload(payload: unknown): string | null {
    return this.findFirstStringByKeys(payload, [
      'department',
      'departmentName',
      'dept',
      'deptName',
      'division',
      'divisionName',
      'org',
      'orgName',
      'organization',
      'organizationName',
      'company',
      'companyName',
      'enterpriseName',
      'officeName',
      'unit',
      'unitName',
      'group',
      'groupName',
      'userGroup',
      'userGroupName',
      'personGroup',
      'personGroupName',
      'belongGroup',
      'belongGroupName',
      'team',
      'teamName',
      'workshop',
      'workshopName',
      'section',
      'sectionName',
    ]);
  }

  private looksLikeMojibake(value: string | null | undefined): boolean {
    const name = this.normalizePersonName(value);
    if (!name) return false;

    // Typical UTF-8/CP1251 corruption markers seen in turnstile payloads.
    if (/[�]/.test(name)) return true;
    if (/(Ð|Ñ|Ã|Â)/.test(name)) return true;
    if (/(?:Р.|С.){3,}/.test(name)) return true;

    return false;
  }

  private isLikelyValidPersonName(value: string | null | undefined): boolean {
    const name = this.normalizePersonName(value);
    if (!name) return false;
    if (this.isFallbackIdName(name)) return false;
    if (this.looksLikeMojibake(name)) return false;

    const tokens = name.split(' ').filter(Boolean);
    if (tokens.length < 2) return false;
    return /[\p{L}]/u.test(name);
  }

  private scorePersonName(value: string | null | undefined): number {
    const name = this.normalizePersonName(value);
    if (!name) return 0;
    if (this.isFallbackIdName(name)) return -1000;

    const tokens = name.split(' ').filter(Boolean).length;
    const hasCyrillic = /[\u0400-\u04FF]/.test(name) ? 1 : 0;
    const hasLatin = /[A-Za-z]/.test(name) ? 1 : 0;
    const badChars = /[?]{2,}|UNKNOWN|TEST|DRIVER/i.test(name) ? 1 : 0;
    const mojibake = this.looksLikeMojibake(name) ? 1 : 0;

    let score = 0;
    score += Math.min(tokens, 4) * 10;
    score += Math.min(name.length, 60);
    score += hasCyrillic * 8;
    score += hasLatin * 2;
    score -= badChars * 25;
    score -= mojibake * 40;

    return score;
  }

  private pickPreferredPersonName(currentName: string | null | undefined, nextName: string | null | undefined): string {
    const current = this.normalizePersonName(currentName);
    const next = this.normalizePersonName(nextName);

    if (!current) return next;
    if (!next) return current;

    const currentValid = this.isLikelyValidPersonName(current);
    const nextValid = this.isLikelyValidPersonName(next);
    if (currentValid && !nextValid) return current;
    if (nextValid && !currentValid) return next;
    if (currentValid && nextValid && !this.personNamesCompatibleForDedupe(current, next)) {
      return next;
    }

    return this.scorePersonName(next) >= this.scorePersonName(current) ? next : current;
  }

  private async upsertIdentity(
    externalIdRaw: string | null | undefined,
    fullNameRaw: string | null | undefined,
    sourceIp?: string | null,
    departmentRaw?: string | null,
  ): Promise<void> {
    const externalId = this.normalizeExternalId(externalIdRaw);
    const fullName = this.normalizePersonName(fullNameRaw);
    const department = this.normalizeDepartment(departmentRaw);
    if (!externalId || !this.isLikelyValidPersonName(fullName)) return;

    const existing = await this.identityRepo.findOne({ where: { external_id: externalId } });
    if (!existing) {
      await this.identityRepo.save(this.identityRepo.create({
        external_id: externalId,
        full_name: fullName,
        department,
        source_ip: this.normalizeIp(sourceIp) ?? null,
        last_seen: new Date(),
      }));
      return;
    }

    const preferred = this.pickPreferredPersonName(existing.full_name, fullName);
    existing.full_name = preferred;
    existing.department = department ?? existing.department ?? null;
    existing.source_ip = this.normalizeIp(sourceIp) ?? existing.source_ip;
    existing.last_seen = new Date();
    await this.identityRepo.save(existing);
  }

  private async resolveIdentityName(externalIdRaw: string | null | undefined): Promise<string | null> {
    const externalId = this.normalizeExternalId(externalIdRaw);
    if (!externalId) return null;

    const row = await this.identityRepo.findOne({ where: { external_id: externalId } });
    if (!row?.full_name) return null;

    const name = this.normalizePersonName(row.full_name);
    return this.isLikelyValidPersonName(name) ? name : null;
  }

  private async resolveIdentityDepartment(externalIdRaw: string | null | undefined): Promise<string | null> {
    const externalId = this.normalizeExternalId(externalIdRaw);
    if (!externalId) return null;
    const row = await this.identityRepo.findOne({ where: { external_id: externalId } });
    return this.normalizeDepartment(row?.department ?? null);
  }

  private async upsertTurnstileLastSeen(
    deviceIdRaw: string | null | undefined,
    deviceNameRaw: string | null | undefined,
    sourceIpRaw: string | null | undefined,
    seenAtRaw: Date | string | null | undefined,
  ): Promise<void> {
    const deviceId = this.normalizeWhitespace(deviceIdRaw);
    const deviceName = this.normalizeWhitespace(deviceNameRaw);
    if (!deviceId || !deviceName) return;

    const sourceIp = this.normalizeIp(sourceIpRaw);
    const parsedSeenAt = seenAtRaw ? new Date(seenAtRaw) : null;
    const seenAt =
      parsedSeenAt && Number.isFinite(parsedSeenAt.getTime())
        ? parsedSeenAt
        : new Date();

    const existing = await this.turnstileStatusRepo.findOne({ where: { device_id: deviceId } });
    if (!existing) {
      await this.turnstileStatusRepo.save(this.turnstileStatusRepo.create({
        device_id: deviceId,
        device_name: deviceName,
        source_ip: sourceIp ?? null,
        last_seen: seenAt,
      }));
      return;
    }

    existing.device_name = deviceName || existing.device_name;
    existing.source_ip = sourceIp ?? existing.source_ip;

    const existingMs = this.parseTimestampMs(existing.last_seen) ?? 0;
    const nextMs = this.parseTimestampMs(seenAt) ?? Date.now();
    if (nextMs >= existingMs) {
      existing.last_seen = seenAt;
    }

    await this.turnstileStatusRepo.save(existing);
  }

  private async buildIdentityNameMap(normalizedIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const ids = Array.from(new Set(normalizedIds.map((x) => this.normalizeExternalId(x)).filter(Boolean)));
    if (ids.length === 0) return map;

    const rows = await this.identityRepo
      .createQueryBuilder('identity')
      .where('identity.external_id IN (:...ids)', { ids })
      .orderBy('identity.updated_at', 'DESC')
      .getMany();

    for (const row of rows) {
      const id = this.normalizeExternalId(row.external_id);
      const name = this.normalizePersonName(row.full_name);
      if (!id || !name || map.has(id)) continue;
      map.set(id, name);
    }

    return map;
  }

  private buildIdentityCandidates(values: Array<string | null | undefined>): { raw: string[]; normalized: string[] } {
    const rawSet = new Set<string>();
    const normSet = new Set<string>();

    for (const value of values) {
      const raw = this.normalizeWhitespace(value);
      if (!raw) continue;
      rawSet.add(raw);
      const normalized = this.normalizeExternalId(raw);
      if (normalized) normSet.add(normalized);
    }

    return { raw: Array.from(rawSet), normalized: Array.from(normSet) };
  }

  private isFallbackIdName(value: string | null | undefined): boolean {
    return /^ID-\d+$/i.test(this.normalizeWhitespace(value));
  }

  private extractIdFromFallbackName(value: string | null | undefined): string {
    const raw = this.normalizeWhitespace(value);
    const match = raw.match(/^ID-(\d+)$/i);
    return match?.[1] ?? '';
  }

  private extractLaneKey(deviceId: string | null | undefined, deviceName: string | null | undefined): string {
    const source = `${this.normalizeWhitespace(deviceId)} ${this.normalizeWhitespace(deviceName)}`.toUpperCase();
    const idMatch = source.match(/\b(?:IN|OUT|KIRISH|CHIQISH)[-_ ]?(\d+)\b/i);
    if (idMatch?.[1]) return idMatch[1];
    return '';
  }

  /** FIO: bitta maydondagi qisqa nom o‘rniga familiya+ism+otasining ismi va nested AccessControllerEvent dan eng to‘liq qator. */
  private resolveBestPersonNameFromNormalizedPayload(normalizedPayload: any): string | null {
    if (!normalizedPayload || typeof normalizedPayload !== 'object') return null;

    const lastName = this.normalizeWhitespace(
      normalizedPayload?.lastName ?? normalizedPayload?.last_name ?? normalizedPayload?.familyName,
    );
    const firstName = this.normalizeWhitespace(
      normalizedPayload?.firstName ?? normalizedPayload?.first_name ?? normalizedPayload?.givenName,
    );
    const middleName = this.normalizeWhitespace(
      normalizedPayload?.middleName ??
      normalizedPayload?.middle_name ??
      normalizedPayload?.patronymic ??
      normalizedPayload?.otchestvo ??
      normalizedPayload?.fatherName ??
      normalizedPayload?.secondName,
    );
    const fromParts = this.normalizeWhitespace([lastName, firstName, middleName].filter(Boolean).join(' '));

    const singles: string[] = [];
    const pushSingle = (v: any) => {
      const s = this.normalizeWhitespace(v);
      if (s) singles.push(s);
    };

    pushSingle(normalizedPayload?.employeeName);
    pushSingle(normalizedPayload?.personName);
    pushSingle(normalizedPayload?.name);
    pushSingle(normalizedPayload?.fullName);
    pushSingle(normalizedPayload?.employeeNameUTF8);
    pushSingle(normalizedPayload?.userName);

    const ae =
      normalizedPayload?.rawObject?.AccessControllerEvent ??
      normalizedPayload?.AccessControllerEvent ??
      null;
    if (ae && typeof ae === 'object') {
      pushSingle(ae.name ?? ae.personName ?? ae.employeeName ?? ae.fullName ?? ae.userName);
      const ael = this.normalizeWhitespace(ae.lastName ?? ae.familyName ?? ae.personFamilyName);
      const aef = this.normalizeWhitespace(ae.firstName ?? ae.givenName ?? ae.personGivenName);
      const aem = this.normalizeWhitespace(
        ae.middleName ?? ae.patronymic ?? ae.fatherName ?? ae.otchestvo ?? ae.secondName,
      );
      const fromAeParts = this.normalizeWhitespace([ael, aef, aem].filter(Boolean).join(' '));
      if (fromAeParts) singles.push(fromAeParts);
    }

    const candidates = [fromParts, ...singles].filter((x) => x && String(x).trim());
    if (candidates.length === 0) return null;

    const bestRaw = candidates.reduce((a, b) => {
      const wa = a.split(/\s+/).filter(Boolean).length;
      const wb = b.split(/\s+/).filter(Boolean).length;
      if (wb !== wa) return wb > wa ? b : a;
      return b.length > a.length ? b : a;
    });

    const normalized = this.normalizePersonName(bestRaw);
    return normalized || null;
  }

  private pickRicherPersonName(current: string | null | undefined, candidate: string | null | undefined): string | null {
    const a = this.normalizePersonName(this.normalizeWhitespace(current));
    const b = this.normalizePersonName(this.normalizeWhitespace(candidate));
    if (!b) return a || null;
    if (!a) return b || null;
    const wa = a.split(/\s+/).filter(Boolean).length;
    const wb = b.split(/\s+/).filter(Boolean).length;
    if (wb > wa) return b;
    if (wb < wa) return a;
    return b.length > a.length ? b : a;
  }

  private twoTokenLowerPrefix(fullName: string | null | undefined): string | null {
    const folded = this.normalizeUnicodeFold(fullName);
    const parts = folded.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]} ${parts[1]}`;
  }

  /** Dedup / FIO taqqoslash: NFC + apostrof variantlari (o‘zbek/кирилл). */
  private normalizeUnicodeFold(value: string | null | undefined): string {
    return String(value ?? '')
      .normalize('NFC')
      .replace(/[\u2019\u2018\u02bc`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private buildAccessLogSearchVariants(search: string): string[] {
    const normalized = this.normalizeWhitespace(search).normalize('NFC');
    if (!normalized) return [];

    const titleCase = normalized
      .split(/\s+/)
      .map((part) => {
        const chars = Array.from(part);
        if (chars.length === 0) return '';
        return `${chars[0].toLocaleUpperCase()}${chars.slice(1).join('').toLocaleLowerCase()}`;
      })
      .join(' ');

    return Array.from(new Set([
      normalized,
      normalized.toLocaleLowerCase(),
      normalized.toLocaleUpperCase(),
      titleCase,
    ].filter(Boolean)));
  }

  private accessTimeWithinSeconds(rowTime: Date | string, center: Date, windowSeconds: number): boolean {
    const rowMs = new Date(rowTime).getTime();
    const centerMs = center.getTime();
    if (!Number.isFinite(rowMs) || !Number.isFinite(centerMs)) return false;
    return Math.abs(rowMs - centerMs) <= Math.max(1, windowSeconds) * 1000;
  }

  /**
   * So‘nggi `limit` qator ichidan vaqt oynasi + shaxs mos keladiganini qaytaradi.
   * Vaqt tekshiruvi JS da (SQLite strftime / vaqt zonasi farqlaridan qochish).
   */
  private async findRecentDuplicateByDeviceAndIdentity(params: {
    deviceId: string | null;
    deviceName: string | null;
    eventType: string;
    /** true: log.event_type <> eventType */
    oppositeEventType: boolean;
    /** mirrored exit: faqat exit, boshqa qurilma */
    mirroredExitOnly: boolean;
    /** true: qurilmaga bog'lamasdan barcha loglar ichidan qidiradi. */
    acrossAnyDevice?: boolean;
    /** true: shaxta/mine device rows are ignored while looking for a duplicate. */
    excludeMineDevices?: boolean;
    excludeDeviceId: string | null;
    centerTime: Date;
    windowSeconds: number;
    identity: { faceIdHash?: string | null; personName?: string | null };
    fetchLimit: number;
  }): Promise<AccessLog | null> {
    const qb = this.accessRepo.createQueryBuilder('log');

    if (params.mirroredExitOnly) {
      qb.where('log.event_type = :exitType', { exitType: 'exit' });
      if (params.excludeDeviceId) {
        qb.andWhere('(log.device_id IS NULL OR log.device_id <> :exDev)', { exDev: params.excludeDeviceId });
      }
    } else if (params.oppositeEventType) {
      qb.where('log.event_type <> :eventType', { eventType: params.eventType });
    } else {
      qb.where('log.event_type = :eventType', { eventType: params.eventType });
    }

    if (!params.mirroredExitOnly) {
      const hasId = !!this.normalizeWhitespace(params.deviceId);
      const hasNm = !!this.normalizeWhitespace(params.deviceName);
      if (!hasId && !hasNm && !params.acrossAnyDevice) {
        return null;
      }
      if (!params.acrossAnyDevice) {
        qb.andWhere(
          new Brackets((b) => {
            if (hasId && hasNm) {
              b.where('log.device_id = :deviceId', { deviceId: params.deviceId }).orWhere(
                "LOWER(TRIM(COALESCE(log.device_name, ''))) = LOWER(TRIM(:deviceName))",
                { deviceName: params.deviceName },
              );
            } else if (hasId) {
              b.where('log.device_id = :deviceId', { deviceId: params.deviceId });
            } else {
              b.where("LOWER(TRIM(COALESCE(log.device_name, ''))) = LOWER(TRIM(:deviceName))", {
                deviceName: params.deviceName,
              });
            }
          }),
        );
      }
      if (params.excludeDeviceId) {
        qb.andWhere('(log.device_id IS NULL OR log.device_id <> :exDev)', { exDev: params.excludeDeviceId });
      }
    }

    const centerMs = params.centerTime.getTime();
    if (Number.isFinite(centerMs)) {
      const windowMs = Math.max(1, params.windowSeconds) * 1000;
      const dupFrom = new Date(centerMs - windowMs).toISOString();
      const dupTo = new Date(centerMs + windowMs).toISOString();
      qb.andWhere(`datetime(log.access_time) >= datetime(:dupFrom)`, { dupFrom }).andWhere(
        `datetime(log.access_time) <= datetime(:dupTo)`,
        { dupTo },
      );
    }

    const rows = await qb
      .orderBy('log.access_time', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .take(params.fetchLimit)
      .getMany();

    return (
      rows.find((row) => {
        if (!this.accessTimeWithinSeconds(row.access_time, params.centerTime, params.windowSeconds)) {
          return false;
        }
        if (params.excludeMineDevices && this.isMineShahtaAccessLogRow(row)) {
          return false;
        }
        return this.logMatchesIdentityForDedupe(row, params.identity);
      }) ?? null
    );
  }

  private isMineShahtaAccessLogRow(row: AccessLog): boolean {
    const parsed = this.parseRawPayload(row.raw_payload);
    const rowIp = this.resolveDeviceIp(row.device_id, row.device_name, row.raw_payload);
    const mapped = this.mapKnownDevice(this.normalizeIp(rowIp), null);
    if (this.isMineShahtaMappedDevice(mapped)) return true;
    return isMineShahtaDeviceEntry({
      key: this.resolveTurnstileKey(row.device_id, row.device_name, rowIp) ?? '',
      deviceId: row.device_id ?? '',
      deviceName: row.device_name ?? '',
      eventType: row.event_type === 'exit' ? 'exit' : 'entrance',
    }) || isMineShahtaFromStoredDevices(
      row.device_id,
      row.device_name ?? this.normalizeWhitespace(parsed?.deviceName ?? parsed?.device_name),
    );
  }

  /** Qisqa/uzun FIO va bir xil yuz ID uchun takroriy webhookni kesish. */
  private logMatchesIdentityForDedupe(
    row: AccessLog,
    identity: { faceIdHash?: string | null; personName?: string | null },
  ): boolean {
    const fh = this.normalizeWhitespace(identity.faceIdHash);
    const pn = this.normalizeUnicodeFold(identity.personName);
    const rowFh = this.normalizeWhitespace(row.face_id_hash);
    const rowPn = this.normalizeUnicodeFold(row.person_name);

    if (fh && rowFh) {
      const normFh = this.normalizeExternalId(fh);
      const normRow = this.normalizeExternalId(rowFh);
      if (rowFh === fh || (normFh && normRow && normFh === normRow)) {
        return true;
      }
    }

    if (pn && rowPn) {
      if (pn === rowPn) return true;
      if (!fh && !rowFh && this.personNamesCompatibleForDedupe(row.person_name, identity.personName)) return true;
    }

    return false;
  }

  private personNamesCompatibleForDedupe(aRaw: string, bRaw: string): boolean {
    const na = this.normalizeUnicodeFold(aRaw);
    const nb = this.normalizeUnicodeFold(bRaw);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const ta = this.twoTokenLowerPrefix(na);
    const tb = this.twoTokenLowerPrefix(nb);
    if (ta && tb && ta === tb) return true;
    return na.startsWith(`${nb} `) || nb.startsWith(`${na} `);
  }

  private normalizeIp(value: any): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const first = raw.split(',')[0]?.trim() ?? '';
    const cleaned = first.replace(/^::ffff:/i, '').trim();
    if (!cleaned) return null;
    return cleaned;
  }

  private extractRequestIp(req: any): string | null {
    const forwarded = this.normalizeIp(req?.headers?.['x-forwarded-for']);
    if (forwarded) return forwarded;

    const realIp = this.normalizeIp(req?.headers?.['x-real-ip']);
    if (realIp) return realIp;

    return (
      this.normalizeIp(req?.ip) ??
      this.normalizeIp(req?.socket?.remoteAddress) ??
      this.normalizeIp(req?.connection?.remoteAddress) ??
      this.normalizeIp(req?.client?.host) ??
      null
    );
  }

  private mapKnownDevice(payloadIp: string | null, requestIp: string | null): DeviceMapEntry | null {
    if (payloadIp && this.deviceIpMap[payloadIp]) return this.deviceIpMap[payloadIp];
    if (requestIp && this.deviceIpMap[requestIp]) return this.deviceIpMap[requestIp];
    return null;
  }

  private resolveMappedIpForDevice(mapped: DeviceMapEntry | null | undefined): string | null {
    if (!mapped) return null;
    for (const [ip, device] of Object.entries(this.deviceIpMap)) {
      if (device.deviceId === mapped.deviceId) return ip;
    }
    return null;
  }

  /** Shaxta segmenti (`mine-shahta-*`); zavod turniketi bilan qurilma kaliti orqali aralashganda ajratish uchun. */
  private isMineShahtaMappedDevice(device: DeviceMapEntry | null | undefined): boolean {
    if (!device) return false;
    const key = this.normalizeWhitespace(device.key).toLowerCase();
    if (key.startsWith('mine-shahta') || key === 'shaxta-kirish' || key === 'shaxta-chiqish') return true;
    return isMineShahtaFromStoredDevices(device.deviceId, device.deviceName);
  }

  private findKnownDeviceByIdOrName(deviceId: string | null | undefined, deviceName: string | null | undefined): DeviceMapEntry | null {
    const id = this.normalizeWhitespace(deviceId).toUpperCase();
    const name = this.normalizeWhitespace(deviceName).toUpperCase();
    if (!id && !name) return null;

    for (const mapped of Object.values(this.deviceIpMap)) {
      const mappedId = this.normalizeWhitespace(mapped.deviceId).toUpperCase();
      const mappedName = this.normalizeWhitespace(mapped.deviceName).toUpperCase();
      if ((id && mappedId === id) || (name && mappedName === name)) {
        return mapped;
      }
    }

    const laneKey = this.extractLaneKey(id, name);
    const source = `${id} ${name}`;
    const isExitHint = /\b(CHIQ|CHIQISH|EXIT|OUT|ВЫХОД)\b/i.test(source);
    const isEntryHint = /\b(KIRISH|ENTRY|ENTRANCE|IN|ВХОД)\b/i.test(source);

    if (laneKey && (isExitHint || isEntryHint)) {
      const expectedType: HikvisionEventType = isExitHint ? 'exit' : 'entrance';
      for (const mapped of Object.values(this.deviceIpMap)) {
        const mappedLane = this.extractLaneKey(mapped.deviceId, mapped.deviceName);
        if (mappedLane === laneKey && mapped.eventType === expectedType) {
          return mapped;
        }
      }
    }

    const shaxtaMapped = this.findMappedShaxtaDeviceByHeuristic(deviceId, deviceName);
    if (shaxtaMapped) {
      return shaxtaMapped;
    }

    return null;
  }

  /** Xaritada «shaxta» turniketi bo‘lsa, Hikvision nomi biroz farq qilganda (kirish/chiqish kalit so‘zlari). */
  private findMappedShaxtaDeviceByHeuristic(
    deviceId: string | null | undefined,
    deviceName: string | null | undefined,
  ): DeviceMapEntry | null {
    const mappedShaxtas = Object.values(this.deviceIpMap).filter((m) => {
      const dn = this.normalizeWhitespace(m.deviceName);
      return /\bshaxta\b/i.test(dn) || /\bshahta\b/i.test(dn) || /шахта/i.test(dn);
    });
    if (mappedShaxtas.length === 0) return null;

    const blob = `${this.normalizeWhitespace(deviceId)} ${this.normalizeWhitespace(deviceName)}`;
    if (!blob.trim()) return null;

    const hintsMine =
      /\bshaxta\b/i.test(blob) ||
      /\bshahta\b/i.test(blob) ||
      /шахта/i.test(blob) ||
      /\bin-mine\b/i.test(blob) ||
      /\bout-mine\b/i.test(blob);
    if (!hintsMine) return null;

    const wantsExit =
      /\bchiqish\b/i.test(blob) ||
      /\bchiq\b/i.test(blob) ||
      /\bexit\b/i.test(blob) ||
      /\bout-mine\b/i.test(blob) ||
      /\bvyhod\b|\bвыход\b/i.test(blob);
    const wantsEntrance =
      /\bkirish\b/i.test(blob) ||
      /\bentry\b/i.test(blob) ||
      /\bentrance\b/i.test(blob) ||
      /\bin-mine\b/i.test(blob) ||
      /\bvxod\b|\bвход\b/i.test(blob);

    if (wantsExit && !wantsEntrance) {
      return mappedShaxtas.find((m) => m.eventType === 'exit') ?? null;
    }
    if (wantsEntrance && !wantsExit) {
      return mappedShaxtas.find((m) => m.eventType === 'entrance') ?? null;
    }

    return null;
  }

  private resolveDeviceIp(
    deviceId: string | null | undefined,
    deviceName: string | null | undefined,
    rawPayload: any,
  ): string | null {
    const parsed = this.parseRawPayload(rawPayload);
    const physicalIp = this.normalizeIp(
      parsed?.sourcePhysicalIp ?? parsed?.sourcePayloadIp ?? parsed?.sourceRequestIp,
    );
    if (physicalIp && this.deviceIpMap[physicalIp]) {
      return physicalIp;
    }
    const resolvedIp = this.normalizeIp(parsed?.sourceResolvedDeviceIp);
    if (resolvedIp) return resolvedIp;
    const payloadIp = this.normalizeIp(
      parsed?.sourcePayloadIp ??
      parsed?.ipAddress ??
      parsed?.deviceIp ??
      parsed?.host,
    );
    if (payloadIp) {
      return payloadIp;
    }

    const normalizedId = this.normalizeWhitespace(deviceId).toUpperCase();
    const normalizedName = this.normalizeWhitespace(deviceName).toUpperCase();
    if (!normalizedId && !normalizedName) return null;

    for (const [ip, mapped] of Object.entries(this.deviceIpMap)) {
      const mappedId = this.normalizeWhitespace(mapped.deviceId).toUpperCase();
      const mappedName = this.normalizeWhitespace(mapped.deviceName).toUpperCase();
      if ((normalizedId && mappedId === normalizedId) || (normalizedName && mappedName === normalizedName)) {
        return ip;
      }
    }

    return null;
  }

  private parseTimestampMs(value: Date | string | null | undefined): number | null {
    if (!value) return null;
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms)) return null;
    return ms;
  }

  private resolveTurnstileKey(
    deviceId: string | null | undefined,
    deviceName: string | null | undefined,
    ip: string | null | undefined,
  ): string | null {
    const normalizedIp = this.normalizeIp(ip);
    if (normalizedIp && this.deviceIpMap[normalizedIp]) {
      return this.deviceIpMap[normalizedIp].key;
    }

    const normalizedDeviceId = this.normalizeWhitespace(deviceId).toUpperCase();
    const normalizedDeviceName = this.normalizeWhitespace(deviceName).toUpperCase();
    if (!normalizedDeviceId && !normalizedDeviceName) return null;

    for (const mapped of Object.values(this.deviceIpMap)) {
      const mappedId = this.normalizeWhitespace(mapped.deviceId).toUpperCase();
      const mappedName = this.normalizeWhitespace(mapped.deviceName).toUpperCase();
      if ((normalizedDeviceId && mappedId === normalizedDeviceId) || (normalizedDeviceName && mappedName === normalizedDeviceName)) {
        return mapped.key;
      }
    }

    return null;
  }

  private createSyntheticSerial(source: {
    eventTime: Date | null;
    eventType: HikvisionEventType;
    deviceId: string | null;
    faceIdHash: string | null;
    employeeNo: string | null;
    personName: string | null;
    extra?: string | null;
  }): string | null {
    const seed = [
      source.eventTime ? source.eventTime.toISOString() : '',
      source.eventType,
      source.deviceId ?? '',
      source.faceIdHash ?? '',
      source.employeeNo ?? '',
      source.personName ?? '',
      source.extra ?? '',
    ].join('|');

    if (!seed.replace(/\|/g, '').trim()) return null;
    return createHash('sha1').update(seed).digest('hex').slice(0, 40);
  }

  private normalizeNameForLookup(value: string | null | undefined): string {
    return this.normalizeWhitespace(value).toLowerCase();
  }

  private extractBestExternalIdFromRawPayload(rawPayload: any): string {
    const parsed = this.parseRawPayload(rawPayload);
    if (!parsed) return '';

    const accessEvent = parsed?.rawObject?.AccessControllerEvent ?? parsed?.AccessControllerEvent ?? null;
    const candidates = [
      parsed?.employeeNoString,
      accessEvent?.employeeNoString,
      accessEvent?.employeeNo,
      parsed?.employeeNo,
      parsed?.personId,
      parsed?.faceId,
      parsed?.face_id,
      parsed?.cardNo,
      accessEvent?.cardNo,
    ];

    for (const value of candidates) {
      const normalized = this.normalizeExternalId(value);
      if (normalized) return normalized;
    }

    return '';
  }

  private tryExtractJsonFromMultipart(body: string): any | null {
    const text = body.trim();
    if (!text) return null;

    const candidates: string[] = [];
    const direct = text.match(/(\{[\s\S]*"AccessControllerEvent"[\s\S]*\})/i);
    if (direct?.[1]) candidates.push(direct[1]);

    if (text.includes('--')) {
      const parts = text.split(/\r?\n--[^\r\n]*/g);
      for (const part of parts) {
        const start = part.indexOf('{');
        const end = part.lastIndexOf('}');
        if (start >= 0 && end > start) {
          candidates.push(part.slice(start, end + 1));
        }
      }
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && (parsed.AccessControllerEvent || parsed.eventType || parsed.event_type)) {
          return parsed;
        }
      } catch {
        // Ignore malformed multipart blocks.
      }
    }

    return null;
  }

  private detectEventTypeFromSourceText(value: string | null | undefined): HikvisionEventType | null {
    const source = String(value || '').trim().toLowerCase();
    if (!source) return null;

    if (/\b(exit|leave|chiq|chiqish|vyhod|выход)\b/i.test(source)) return 'exit';
    if (/\b(entrance|entry|kirish|vhod|вход)\b/i.test(source)) return 'entrance';
    return null;
  }

  private getIdentityDedupSeconds(device: DeviceMapEntry | null): number {
    return isMineShahtaDeviceEntry(device) ? this.shahtaDedupSeconds : this.dedupSeconds;
  }

  private shouldIgnoreNoisyReaderEvent(
    payload: any,
    knownDevice: DeviceMapEntry | null = null,
  ): { ignore: boolean; reason?: string } {
    const isMine = isMineShahtaDeviceEntry(knownDevice);
    return shouldIgnoreHikvisionTurnstilePayload(payload, isMine, this.turnstileNoiseEnv);
  }

  private shouldIgnoreStoredLogRow(row: AccessLog): boolean {
    if (this.recordAllEvents) return false;
    const payload = this.parseRawPayload(row.raw_payload);
    const rawPayloadName =
      payload && typeof payload === 'object'
        ? this.resolveBestPersonNameFromNormalizedPayload(payload)
        : this.normalizePersonName(this.getNameFromRawPayload(row.raw_payload));
    const hasValidName =
      this.isLikelyValidPersonName(row.person_name) ||
      this.isLikelyValidPersonName(rawPayloadName) ||
      this.isLikelyValidPersonName(row.driver?.full_name);
    if (!hasValidName) return true;
    if (!payload) return false;
    const isMine = isMineShahtaFromStoredDevices(row.device_id, row.device_name);
    return shouldIgnoreHikvisionTurnstilePayload(payload, isMine, this.turnstileNoiseEnv).ignore;
  }

  private normalizeEventType(payload: any, forcedType?: string, mappedType?: HikvisionEventType): HikvisionEventType {
    if (mappedType) return mappedType;

    const payloadTypeSource = [
      payload?.eventType,
      payload?.event_type,
      payload?.accessType,
      payload?.type,
      payload?.eventDescription,
      payload?.majorEventTypeName,
      payload?.subEventTypeName,
    ].filter(Boolean).join(' ');

    const payloadDeviceSource = [
      payload?.deviceName,
      payload?.device_name,
      payload?.terminalName,
      payload?.doorName,
      payload?.deviceId,
      payload?.device_id,
      payload?.terminalId,
      payload?.doorNo,
    ].filter(Boolean).join(' ');

    const payloadDetected =
      this.detectEventTypeFromSourceText(payloadTypeSource) ??
      this.detectEventTypeFromSourceText(payloadDeviceSource);

    if (payloadDetected) return payloadDetected;

    if (forcedType) {
      const forcedDetected = this.detectEventTypeFromSourceText(forcedType);
      if (forcedDetected) return forcedDetected;
    }

    return 'entrance';
  }

  private resolveNormalizedEventType(
    eventType: string | null | undefined,
    deviceId: string | null | undefined,
    deviceName: string | null | undefined,
    rawPayload: any,
  ): HikvisionEventType {
    const explicit = this.detectEventTypeFromSourceText(eventType);
    if (explicit) return explicit;

    const deviceHint = this.detectEventTypeFromSourceText(`${this.normalizeWhitespace(deviceId)} ${this.normalizeWhitespace(deviceName)}`);
    if (deviceHint) return deviceHint;

    const ip = this.resolveDeviceIp(deviceId, deviceName, rawPayload);
    const ipMapped = ip ? this.deviceIpMap[ip]?.eventType : null;
    if (ipMapped) return ipMapped;

    return 'entrance';
  }

  private mapStatus(status: CheckStatus): 'verified' | 'flagged' | 'pending' {
    if (status === CheckStatus.PASSED) return 'verified';
    if (status === CheckStatus.FAILED) return 'flagged';
    return 'pending';
  }

  private parseEventTime(value: any): Date | null {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private shouldReturnJson(req: any): boolean {
    const header = String(req?.headers?.['x-smartroute-sync'] ?? '').trim();
    const query = String(req?.query?.response ?? '').trim().toLowerCase();
    return header === '1' || query === 'json';
  }

  private ensureWebhookToken(authHeader?: string) {
    const requiredToken = process.env.HIKVISION_WEBHOOK_TOKEN;
    if (!requiredToken) return;

    if (!authHeader || authHeader !== requiredToken) {
      throw new UnauthorizedException('Invalid webhook token');
    }
  }

  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  private extractXmlTag(xml: string, tagName: string): string | null {
    const match = xml.match(new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, 'i'));
    if (!match || !match[1]) return null;
    return this.decodeXmlEntities(match[1].trim());
  }

  private extractXmlPayload(rawBody: string): string | null {
    const body = rawBody.trim();
    if (body.startsWith('<')) return body;

    const eventMatch = body.match(/<EventNotificationAlert[\s\S]*?<\/EventNotificationAlert>/i);
    if (eventMatch?.[0]) return eventMatch[0];

    const accessEventMatch = body.match(/<AccessControllerEvent[\s\S]*?<\/AccessControllerEvent>/i);
    if (accessEventMatch?.[0]) return accessEventMatch[0];

    return null;
  }

  private extractPrimitive(value: any): string | number | boolean | null {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
      for (const item of value) {
        const extracted = this.extractPrimitive(item);
        if (extracted != null && String(extracted).trim() !== '') return extracted;
      }
      return null;
    }

    if (typeof value === 'object') {
      const directTextKeys = ['#text', '_text', '$text', 'text', 'value', '_', 'Value'];
      for (const key of directTextKeys) {
        if (key in value) {
          const extracted = this.extractPrimitive((value as Record<string, any>)[key]);
          if (extracted != null && String(extracted).trim() !== '') return extracted;
        }
      }

      for (const nested of Object.values(value)) {
        const extracted = this.extractPrimitive(nested);
        if (extracted != null && String(extracted).trim() !== '') return extracted;
      }
    }

    return null;
  }

  private findFirstByKey(obj: any, targetKey: string): string | number | boolean | null {
    const target = targetKey.toLowerCase();
    let found: string | number | boolean | null = null;

    const walk = (node: any) => {
      if (found != null || node == null) return;

      if (Array.isArray(node)) {
        for (const item of node) {
          walk(item);
          if (found != null) return;
        }
        return;
      }

      if (typeof node !== 'object') return;

      // First pass: direct key match only (preserves key priority).
      for (const [key, rawValue] of Object.entries(node)) {
        if (key.toLowerCase() !== target) continue;
        const extracted = this.extractPrimitive(rawValue);
        if (extracted != null && String(extracted).trim() !== '') {
          found = extracted;
          return;
        }
      }

      // Second pass: deep traversal.
      for (const rawValue of Object.values(node)) {
        if (rawValue && typeof rawValue === 'object') {
          walk(rawValue);
          if (found != null) return;
        }
      }
    };

    walk(obj);
    return found;
  }

  private findFirstByKeys(obj: any, keys: string[]): string | number | boolean | null {
    for (const key of keys) {
      const value = this.findFirstByKey(obj, key);
      if (value != null && String(value).trim() !== '') {
        return value;
      }
    }
    return null;
  }

  private fromObjectPayload(payloadObj: any): any {
    const accessEvent = payloadObj?.AccessControllerEvent ?? payloadObj?.accessControllerEvent ?? null;
    const source = accessEvent && typeof accessEvent === 'object'
      ? { ...payloadObj, ...accessEvent }
      : payloadObj;
    const pick = (...keys: string[]) => this.findFirstByKeys(source, keys);

    return {
      eventType: pick('eventType', 'event_type', 'accesstype', 'type', 'majorEventTypeName', 'subEventTypeName'),
      employeeNo: pick('employeeNoString', 'employeeNo', 'personId', 'cardNo', 'employeeID', 'personCode'),
      employeeName: pick('employeeName', 'personName', 'name', 'fullName', 'personFullName', 'employeeNameUTF8', 'userName'),
      firstName: pick('firstName', 'first_name', 'givenName', 'personGivenName'),
      lastName: pick('lastName', 'last_name', 'familyName', 'personFamilyName'),
      middleName: pick('middleName', 'middle_name', 'fatherName', 'patronymic', 'otchestvo', 'secondName'),
      deviceName: pick('deviceName', 'device_name', 'terminalName', 'readerName', 'channelName', 'doorName'),
      deviceId: pick('deviceID', 'deviceId', 'device_id', 'terminalId', 'serialNo', 'ipAddress', 'doorNo'),
      ipAddress: pick('ipAddress', 'ip', 'host'),
      cardNo: pick('cardNo'),
      cardReaderNo: pick('cardReaderNo'),
      doorNo: pick('doorNo'),
      currentVerifyMode: pick('currentVerifyMode', 'verifyMode', 'verifyType'),
      eventDescription: pick('eventDescription', 'eventName', 'majorEventTypeName', 'subEventTypeName'),
      temperature: pick('temperature', 'temp', 'bodyTemp', 'currTemperature'),
      dateTime: pick('dateTime', 'eventTime', 'time'),
      serialNo: pick('serialNo', 'eventSerialNo', 'eventId', 'logID'),
      minor: pick('minor'),
      subEventType: pick('subEventType', 'subEventTypeNo'),
      majorEventType: pick('majorEventType', 'major'),
      department: pick(
        'department',
        'departmentName',
        'orgName',
        'companyName',
        'company',
        'enterpriseName',
        'userGroup',
        'userGroupName',
        'groupName',
        'division',
        'divisionName',
        'unit',
        'unitName',
      ),
      rawObject: payloadObj,
    };
  }

  private normalizeIncomingPayload(body: any): any {
    if (!body) return {};
    if (Buffer.isBuffer(body)) {
      return this.normalizeIncomingPayload(body.toString('utf8'));
    }
    if (typeof body === 'object') return this.fromObjectPayload(body);
    if (typeof body !== 'string') return {};

    const trimmed = body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return this.fromObjectPayload(parsed);
      } catch {
        // Ignore JSON parse failure and continue XML extraction fallback.
      }
    }

    const multipartJson = this.tryExtractJsonFromMultipart(body);
    if (multipartJson) {
      return this.fromObjectPayload(multipartJson);
    }

    const xml = this.extractXmlPayload(body);
    if (!xml) return {};

    return {
      eventType:
        this.extractXmlTag(xml, 'eventType') ??
        this.extractXmlTag(xml, 'attendanceStatus') ??
        this.extractXmlTag(xml, 'eventName') ??
        this.extractXmlTag(xml, 'majorEventTypeName') ??
        this.extractXmlTag(xml, 'subEventTypeName'),
      employeeNo:
        this.extractXmlTag(xml, 'employeeNoString') ??
        this.extractXmlTag(xml, 'employeeNo') ??
        this.extractXmlTag(xml, 'personId') ??
        this.extractXmlTag(xml, 'cardNo') ??
        this.extractXmlTag(xml, 'personCode'),
      employeeName:
        this.extractXmlTag(xml, 'employeeName') ??
        this.extractXmlTag(xml, 'personName') ??
        this.extractXmlTag(xml, 'name') ??
        this.extractXmlTag(xml, 'fullName') ??
        this.extractXmlTag(xml, 'userName'),
      firstName: this.extractXmlTag(xml, 'firstName') ?? this.extractXmlTag(xml, 'personGivenName'),
      lastName: this.extractXmlTag(xml, 'lastName') ?? this.extractXmlTag(xml, 'personFamilyName'),
      middleName:
        this.extractXmlTag(xml, 'middleName') ??
        this.extractXmlTag(xml, 'fatherName') ??
        this.extractXmlTag(xml, 'patronymic') ??
        this.extractXmlTag(xml, 'otchestvo') ??
        this.extractXmlTag(xml, 'secondName'),
      deviceName:
        this.extractXmlTag(xml, 'deviceName') ??
        this.extractXmlTag(xml, 'readerName') ??
        this.extractXmlTag(xml, 'channelName') ??
        this.extractXmlTag(xml, 'doorName'),
      deviceId:
        this.extractXmlTag(xml, 'deviceID') ??
        this.extractXmlTag(xml, 'serialNo') ??
        this.extractXmlTag(xml, 'ipAddress') ??
        this.extractXmlTag(xml, 'doorNo'),
      ipAddress: this.extractXmlTag(xml, 'ipAddress'),
      cardNo: this.extractXmlTag(xml, 'cardNo'),
      cardReaderNo: this.extractXmlTag(xml, 'cardReaderNo'),
      doorNo: this.extractXmlTag(xml, 'doorNo'),
      currentVerifyMode:
        this.extractXmlTag(xml, 'currentVerifyMode') ??
        this.extractXmlTag(xml, 'verifyMode') ??
        this.extractXmlTag(xml, 'verifyType'),
      eventDescription:
        this.extractXmlTag(xml, 'eventDescription') ??
        this.extractXmlTag(xml, 'eventName') ??
        this.extractXmlTag(xml, 'subEventTypeName'),
      temperature:
        this.extractXmlTag(xml, 'temperature') ??
        this.extractXmlTag(xml, 'currTemperature'),
      dateTime:
        this.extractXmlTag(xml, 'dateTime') ??
        this.extractXmlTag(xml, 'eventTime') ??
        this.extractXmlTag(xml, 'time'),
      serialNo:
        this.extractXmlTag(xml, 'serialNo') ??
        this.extractXmlTag(xml, 'eventSerialNo') ??
        this.extractXmlTag(xml, 'eventId') ??
        this.extractXmlTag(xml, 'logID'),
      minor: this.extractXmlTag(xml, 'minor'),
      subEventType: this.extractXmlTag(xml, 'subEventType'),
      majorEventType: this.extractXmlTag(xml, 'majorEventType') ?? this.extractXmlTag(xml, 'major'),
      department:
        this.extractXmlTag(xml, 'department') ??
        this.extractXmlTag(xml, 'departmentName') ??
        this.extractXmlTag(xml, 'orgName') ??
        this.extractXmlTag(xml, 'companyName') ??
        this.extractXmlTag(xml, 'company') ??
        this.extractXmlTag(xml, 'enterpriseName') ??
        this.extractXmlTag(xml, 'userGroup') ??
        this.extractXmlTag(xml, 'userGroupName') ??
        this.extractXmlTag(xml, 'groupName') ??
        this.extractXmlTag(xml, 'division') ??
        this.extractXmlTag(xml, 'divisionName'),
      rawXml: xml,
    };
  }

  private parseRawPayload(rawPayload: any): any {
    if (!rawPayload) return null;
    if (typeof rawPayload === 'object') return rawPayload;
    if (typeof rawPayload !== 'string') return null;
    try {
      return JSON.parse(rawPayload);
    } catch {
      return null;
    }
  }

  private getNameFromRawPayload(rawPayload: any): string | null {
    const parsed = this.parseRawPayload(rawPayload);
    if (!parsed) return null;

    const accessEvent = parsed?.rawObject?.AccessControllerEvent ?? parsed?.AccessControllerEvent ?? null;
    const name = this.normalizeWhitespace(
      accessEvent?.name ??
      accessEvent?.employeeName ??
      accessEvent?.personName ??
      parsed?.name ??
      parsed?.personName ??
      parsed?.employeeName ??
      parsed?.fullName,
    );
    if (name) return name;

    const full = this.normalizeWhitespace([
      parsed?.lastName ?? parsed?.last_name,
      parsed?.firstName ?? parsed?.first_name,
      parsed?.middleName ?? parsed?.middle_name ?? parsed?.patronymic,
    ].filter(Boolean).join(' '));
    return full || null;
  }

  private hasUsefulValue(value: any): boolean {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'number' || typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return false;
  }

  @Post('webhook')
  @HttpCode(200)
  async handleEvent(
    @Body() payload: any,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('eventType') eventTypeQuery?: string,
    @Query('deviceName') deviceNameQuery?: string,
    @Query('deviceId') deviceIdQuery?: string,
    @Headers('x-webhook-token') webhookToken?: string,
  ) {
    this.ensureWebhookToken(webhookToken);
    const returnJson = this.shouldReturnJson(req);
    const respond = (jsonPayload: any) => {
      if (returnJson) return jsonPayload;
      res.type('text/plain');
      return 'OK';
    };

    const normalizedPayload = this.normalizeIncomingPayload(
      typeof payload === 'undefined' ? req?.body : payload,
    );

    const hasPayloadData = Object.values(normalizedPayload).some((value) => this.hasUsefulValue(value));

    if (!hasPayloadData) {
      return respond({ ok: true, ignored: true, reason: 'empty_payload' });
    }

    const requestIp = this.extractRequestIp(req);
    const payloadIp = this.normalizeIp(
      normalizedPayload?.ipAddress ??
      normalizedPayload?.deviceIp ??
      normalizedPayload?.host,
    );
    const isSyncRequest = String(req?.headers?.['x-smartroute-sync'] ?? '').trim() === '1';
    const declaredKnownDevice = this.findKnownDeviceByIdOrName(deviceIdQuery, deviceNameQuery);
    const payloadKnownDevice = this.findKnownDeviceByIdOrName(
      normalizedPayload?.deviceId ??
      normalizedPayload?.device_id ??
      normalizedPayload?.terminalId ??
      normalizedPayload?.doorNo,
      normalizedPayload?.deviceName ??
      normalizedPayload?.device_name ??
      normalizedPayload?.terminalName ??
      normalizedPayload?.doorName,
    );
    const ipMappedKnownDevice = this.mapKnownDevice(payloadIp, requestIp);
    if (
      declaredKnownDevice &&
      ipMappedKnownDevice &&
      declaredKnownDevice.deviceId !== ipMappedKnownDevice.deviceId
    ) {
      this.logger.warn(
        `Device source mismatch: declared=${declaredKnownDevice.deviceId} ipMapped=${ipMappedKnownDevice.deviceId} requestIp=${requestIp ?? 'none'} payloadIp=${payloadIp ?? 'none'}. Regular webhook uses IP/payload first when set.`,
      );
    }
    const journalDevice = resolveWebhookJournalDevice({
      isSyncRequest,
      ipMappedDevice: ipMappedKnownDevice,
      payloadKnownDevice,
      declaredDevice: declaredKnownDevice,
    });

    if (
      payloadKnownDevice &&
      ipMappedKnownDevice &&
      payloadKnownDevice.deviceId !== ipMappedKnownDevice.deviceId
    ) {
      this.logger.debug(
        `Turniket manba: IP→${ipMappedKnownDevice.deviceId} (${payloadIp ?? requestIp ?? '?'}), yuklama→${payloadKnownDevice.deviceId}; jurnal=${journalDevice?.deviceId ?? 'none'}`,
      );
    }

    if (this.strictSourceIp && !journalDevice) {
      this.logger.warn(`Ignoring webhook from unknown source ip: request=${requestIp ?? 'none'} payload=${payloadIp ?? 'none'}`);
      return respond({ ok: true, ignored: true, reason: 'unknown_source_ip' });
    }

    const parsedDeviceTime = this.parseEventTime(normalizedPayload?.dateTime ?? normalizedPayload?.eventTime ?? normalizedPayload?.time);
    let accessTime = parsedDeviceTime;

    // Hikvision panels often drift or lose NTP; a "stale" device timestamp would otherwise drop every real pass
    // after maxEventAgeMinutes (default 3h). For mapped turnstiles, prefer server time over losing audit data.
    if (!returnJson && parsedDeviceTime) {
      const nowMs = Date.now();
      const eventMs = parsedDeviceTime.getTime();
      const tooOldMs = this.maxEventAgeMinutes * 60 * 1000;
      const tooFutureMs = this.maxFutureSkewMinutes * 60 * 1000;

      if (eventMs - nowMs > tooFutureMs) {
        return respond({ ok: true, ignored: true, reason: 'future_event' });
      }

      if (nowMs - eventMs > tooOldMs) {
        if (journalDevice && this.adjustStaleEventToServerTime) {
          (normalizedPayload as Record<string, unknown>).originalDeviceEventTime = parsedDeviceTime.toISOString();
          (normalizedPayload as Record<string, unknown>).accessTimeAdjustedToServer = true;
          this.logger.warn(
            `Hikvision webhook: stale device timestamp (>${this.maxEventAgeMinutes}m); using server time (device=${journalDevice.deviceId}, was=${String((normalizedPayload as Record<string, unknown>).originalDeviceEventTime)})`,
          );
          accessTime = new Date();
        } else {
          this.logger.debug(
            `Hikvision webhook: stale event ignored (>${this.maxEventAgeMinutes}m; device=${journalDevice?.deviceId ?? 'unknown'}, time=${parsedDeviceTime.toISOString()})`,
          );
          return respond({ ok: true, ignored: true, reason: 'stale_event' });
        }
      }
    }

    // Online holati: xaritalangan qurilma signal olganini darhol yozamiz (jurnal filtri rad etsa ham).
    const heartbeatAt = accessTime ?? new Date();
    const heartbeatTargets: DeviceMapEntry[] = [];
    const pushHeartbeatTarget = (device: DeviceMapEntry | null | undefined) => {
      if (!device) return;
      if (heartbeatTargets.some((d) => d.deviceId === device.deviceId)) return;
      heartbeatTargets.push(device);
    };
    pushHeartbeatTarget(journalDevice);
    if (ipMappedKnownDevice && ipMappedKnownDevice.deviceId !== journalDevice?.deviceId) {
      pushHeartbeatTarget(ipMappedKnownDevice);
    }
    for (const hbDevice of heartbeatTargets) {
      try {
        const heartbeatIp = this.resolveMappedIpForDevice(hbDevice) ?? payloadIp ?? requestIp;
        await this.upsertTurnstileLastSeen(
          hbDevice.deviceId,
          hbDevice.deviceName,
          heartbeatIp,
          heartbeatAt,
        );
      } catch (error) {
        this.logger.debug(`Failed to update turnstile heartbeat: ${String(error)}`);
      }
    }

    if (!this.recordAllEvents) {
      const noisyEventCheck = this.shouldIgnoreNoisyReaderEvent(normalizedPayload, journalDevice);
      if (noisyEventCheck.ignore) {
        return respond({ ok: true, ignored: true, reason: noisyEventCheck.reason ?? 'ignored_event' });
      }
    }

    const employeeNo = this.normalizeWhitespace(normalizedPayload?.employeeNo);
    const rawFaceId = this.normalizeWhitespace(
      normalizedPayload?.faceId ??
      normalizedPayload?.face_id ??
      normalizedPayload?.personId ??
      employeeNo,
    );
    const faceIdHash = rawFaceId || employeeNo || null;
    const isMineShahtaDevice = isMineShahtaDeviceEntry(journalDevice);
    const identityDedupSeconds = this.getIdentityDedupSeconds(journalDevice);

    // Shaxta qurilmalarida faqat identifikatorli (employeeNo/faceId) o'tishlarni qabul qilamiz.
    // Bu noto'g'ri "faqat ism" bilan keladigan shovqin yozuvlarini kamaytiradi.
    if (!this.recordAllEvents && isMineShahtaDevice && !employeeNo && !rawFaceId) {
      return respond({ ok: true, ignored: true, reason: 'shahta_missing_identity_id' });
    }

    const firstName = this.normalizeWhitespace(normalizedPayload?.firstName ?? normalizedPayload?.first_name);
    const lastName = this.normalizeWhitespace(normalizedPayload?.lastName ?? normalizedPayload?.last_name);
    const middleName = this.normalizeWhitespace(
      normalizedPayload?.middleName ??
        normalizedPayload?.middle_name ??
        normalizedPayload?.patronymic ??
        normalizedPayload?.otchestvo ??
        normalizedPayload?.fatherName ??
        normalizedPayload?.secondName,
    );
    const fullNameFromParts = this.normalizeWhitespace([lastName, firstName, middleName].filter(Boolean).join(' '));

    let personName = this.normalizePersonName(
      normalizedPayload?.name ??
      normalizedPayload?.personName ??
      normalizedPayload?.employeeName ??
      normalizedPayload?.fullName ??
      fullNameFromParts,
    ) || null;
    personName = this.pickRicherPersonName(personName, this.resolveBestPersonNameFromNormalizedPayload(normalizedPayload));
    const departmentFromPayload = this.extractDepartmentFromPayload(normalizedPayload);

    const normalizedExternalId = this.normalizeExternalId(faceIdHash || employeeNo);

    if (normalizedExternalId && this.isLikelyValidPersonName(personName)) {
      await this.upsertIdentity(normalizedExternalId, personName, payloadIp ?? requestIp, departmentFromPayload);
    }

    const identityName = await this.resolveIdentityName(normalizedExternalId);
    const identityDepartment = await this.resolveIdentityDepartment(normalizedExternalId);
    if (identityName && !this.isLikelyValidPersonName(personName)) {
      personName = identityName;
    } else if (identityName && personName && this.personNamesCompatibleForDedupe(personName, identityName)) {
      personName = this.pickRicherPersonName(personName, identityName);
    } else if (identityName && personName) {
      this.logger.warn(
        `Turniket identity mismatch ignored: externalId=${normalizedExternalId || 'none'} payloadName="${personName}" cachedName="${identityName}"`,
      );
    }

    if (!personName && (faceIdHash || employeeNo)) {
      const identityCandidates = this.buildIdentityCandidates([faceIdHash, employeeNo]);
      if (identityCandidates.raw.length > 0 || identityCandidates.normalized.length > 0) {
        const knownPerson = await this.accessRepo
          .createQueryBuilder('log')
          .where('log.person_name IS NOT NULL')
          .andWhere("TRIM(log.person_name) <> ''")
          .andWhere("log.person_name NOT LIKE 'ID-%'")
          .andWhere(
            `(
              log.face_id_hash IN (:...rawCandidates)
              OR (CASE WHEN ltrim(log.face_id_hash, '0') = '' THEN '0' ELSE ltrim(log.face_id_hash, '0') END) IN (:...normalizedCandidates)
            )`,
            {
              rawCandidates: identityCandidates.raw.length > 0 ? identityCandidates.raw : [''],
              normalizedCandidates: identityCandidates.normalized.length > 0 ? identityCandidates.normalized : [''],
            },
          )
          .orderBy('log.id', 'DESC')
          .getOne();
        if (knownPerson?.person_name) {
          personName = this.pickRicherPersonName(personName, this.normalizePersonName(knownPerson.person_name));
          if (normalizedExternalId && this.isLikelyValidPersonName(personName)) {
            await this.upsertIdentity(normalizedExternalId, personName, payloadIp ?? requestIp, departmentFromPayload);
          }
        }
      }
    }

    const eventType = this.normalizeEventType(normalizedPayload, eventTypeQuery, journalDevice?.eventType);
    const deviceId = this.normalizeWhitespace(
      journalDevice?.deviceId ??
      deviceIdQuery ??
      normalizedPayload?.deviceId ??
      normalizedPayload?.device_id ??
      normalizedPayload?.terminalId,
    ) || null;
    const deviceName = this.normalizeWhitespace(
      journalDevice?.deviceName ??
      deviceNameQuery ??
      normalizedPayload?.deviceName ??
      normalizedPayload?.device_name ??
      normalizedPayload?.terminalName,
    ) || null;

    const serialFromPayload = this.normalizeWhitespace(
      normalizedPayload?.serialNo ?? normalizedPayload?.eventSerialNo ?? normalizedPayload?.eventId,
    ) || null;
    // Use device-reported time for dedupe keys so buffered replays after accessTime adjustment do not create new rows.
    const dedupTime = parsedDeviceTime ?? accessTime;
    const syntheticSerial = this.createSyntheticSerial({
      eventTime: dedupTime,
      eventType,
      deviceId,
      faceIdHash,
      employeeNo,
      personName,
      extra: [
        serialFromPayload,
        normalizedPayload?.cardNo,
        normalizedPayload?.doorNo,
        normalizedPayload?.minor,
        normalizedPayload?.subEventType,
      ].map((value) => this.normalizeWhitespace(value)).filter(Boolean).join('|'),
    });
    const eventSerial = this.recordAllEvents
      ? syntheticSerial ?? serialFromPayload
      : serialFromPayload ?? syntheticSerial;

    if (!this.recordAllEvents && !faceIdHash && !employeeNo && !personName) {
      return respond({ ok: true, ignored: true, reason: 'no_identity_fields' });
    }

    const temperatureValue = normalizedPayload?.temperature ?? normalizedPayload?.temp ?? normalizedPayload?.bodyTemp;
    const temperature = temperatureValue != null ? String(temperatureValue) : null;

    if (!this.recordAllEvents && eventSerial) {
      const duplicateQuery = this.accessRepo
        .createQueryBuilder('log')
        .where('log.event_serial = :eventSerial', { eventSerial });

      if (deviceId) {
        duplicateQuery.andWhere('log.device_id = :deviceId', { deviceId });
      }

      const duplicate = await duplicateQuery.orderBy('log.id', 'DESC').getOne();

      if (duplicate) {
        return respond({
          ok: true,
          duplicate: true,
          id: duplicate.id,
          status: this.mapStatus(duplicate.status),
          eventType: duplicate.event_type,
          accessTime: duplicate.access_time,
        });
      }
    }

    // Same pass can arrive multiple times via retries or lane cross-triggering.
    if (!this.recordAllEvents && dedupTime && (faceIdHash || personName)) {
      if (deviceId || deviceName) {
        const duplicateByIdentityOnDevice = await this.findRecentDuplicateByDeviceAndIdentity({
          deviceId,
          deviceName,
          eventType,
          oppositeEventType: false,
          mirroredExitOnly: false,
          excludeDeviceId: null,
          centerTime: dedupTime,
          windowSeconds: identityDedupSeconds,
          identity: { faceIdHash, personName },
          fetchLimit: 200,
        });

        if (duplicateByIdentityOnDevice) {
          return respond({
            ok: true,
            duplicate: true,
            id: duplicateByIdentityOnDevice.id,
            status: this.mapStatus(duplicateByIdentityOnDevice.status),
            eventType: duplicateByIdentityOnDevice.event_type,
            accessTime: duplicateByIdentityOnDevice.access_time,
          });
        }
      }

      // Cross-device same-direction protection.
      // Factory rows ignore mine rows so a noisy mine panel cannot hide a real factory pass.
      if (this.crossDeviceDedupSeconds > 0 && !isMineShahtaDevice) {
        const duplicateAcrossDevices = await this.findRecentDuplicateByDeviceAndIdentity({
          deviceId: null,
          deviceName: null,
          eventType,
          oppositeEventType: false,
          mirroredExitOnly: false,
          acrossAnyDevice: true,
          excludeMineDevices: true,
          excludeDeviceId: deviceId,
          centerTime: dedupTime,
          windowSeconds: this.crossDeviceDedupSeconds,
          identity: { faceIdHash, personName },
          fetchLimit: 300,
        });

        if (duplicateAcrossDevices) {
          return respond({
            ok: true,
            duplicate: true,
            id: duplicateAcrossDevices.id,
            status: this.mapStatus(duplicateAcrossDevices.status),
            eventType: duplicateAcrossDevices.event_type,
            accessTime: duplicateAcrossDevices.access_time,
          });
        }
      }

      // Mine panels can occasionally replay or mirror factory identities. If the same identity was just
      // accepted by a factory turnstile, keep the factory row and suppress the mine copy.
      if (this.mineFactoryDedupSeconds > 0 && isMineShahtaDevice) {
        const duplicateFactory = await this.findRecentDuplicateByDeviceAndIdentity({
          deviceId: null,
          deviceName: null,
          eventType,
          oppositeEventType: false,
          mirroredExitOnly: false,
          acrossAnyDevice: true,
          excludeMineDevices: true,
          excludeDeviceId: deviceId,
          centerTime: dedupTime,
          windowSeconds: this.mineFactoryDedupSeconds,
          identity: { faceIdHash, personName },
          fetchLimit: 300,
        });

        if (duplicateFactory) {
          return respond({
            ok: true,
            duplicate: true,
            id: duplicateFactory.id,
            status: this.mapStatus(duplicateFactory.status),
            eventType: duplicateFactory.event_type,
            accessTime: duplicateFactory.access_time,
            reason: 'mine_duplicate_of_factory',
          });
        }
      }

      // Opposite-direction bounce is only deduped within the same physical turnstile.
      if (deviceId || deviceName) {
        const pairByIdentity = await this.findRecentDuplicateByDeviceAndIdentity({
          deviceId,
          deviceName,
          eventType,
          oppositeEventType: true,
          mirroredExitOnly: false,
          excludeDeviceId: null,
          centerTime: dedupTime,
          windowSeconds: this.pairDedupSeconds,
          identity: { faceIdHash, personName },
          fetchLimit: 200,
        });
        if (pairByIdentity) {
          return respond({
            ok: true,
            duplicate: true,
            id: pairByIdentity.id,
            status: this.mapStatus(pairByIdentity.status),
            eventType: pairByIdentity.event_type,
            accessTime: pairByIdentity.access_time,
          });
        }
      }

      // Cross-device mirror protection:
      // if an entrance comes right after an exit for the same identity, ignore the entrance bounce.
      if (eventType === 'entrance') {
        const mirroredExit = await this.findRecentDuplicateByDeviceAndIdentity({
          deviceId: null,
          deviceName: null,
          eventType,
          oppositeEventType: false,
          mirroredExitOnly: true,
          excludeDeviceId: deviceId,
          centerTime: dedupTime,
          windowSeconds: this.pairDedupSeconds,
          identity: { faceIdHash, personName },
          fetchLimit: 200,
        });
        if (mirroredExit) {
          return respond({
            ok: true,
            duplicate: true,
            id: mirroredExit.id,
            status: this.mapStatus(mirroredExit.status),
            eventType: mirroredExit.event_type,
            accessTime: mirroredExit.access_time,
          });
        }
      }
    }

    let driver = null;
    if (faceIdHash) {
      driver = await this.driverRepo.findOneBy({ face_id_hash: faceIdHash });
    }
    if (!driver && employeeNo) {
      driver = await this.driverRepo.findOne({
        where: [{ face_id_hash: employeeNo }, { license_number: employeeNo }],
      });
    }
    if (!driver && personName) {
      const normalizedPersonName = this.normalizeNameForLookup(personName);
      driver = await this.driverRepo
        .createQueryBuilder('driver')
        .where("LOWER(TRIM(REPLACE(driver.full_name, '\t', ' '))) = :normalizedPersonName", {
          normalizedPersonName,
        })
        .getOne();
    }

    const resolvedPersonName =
      personName ||
      driver?.full_name ||
      null;
    const resolvedDepartment = departmentFromPayload ?? driver?.department ?? identityDepartment ?? null;

    if (!this.recordAllEvents && !this.isLikelyValidPersonName(resolvedPersonName)) {
      return respond({ ok: true, ignored: true, reason: 'invalid_person_name' });
    }

    const log = this.accessRepo.create({
      driver: driver || null,
      device_id: deviceId,
      device_name: deviceName,
      event_type: eventType,
      temperature,
      person_name: resolvedPersonName,
      department: resolvedDepartment,
      face_id_hash: faceIdHash,
      event_serial: eventSerial,
      status: CheckStatus.PASSED,
      access_time: accessTime ?? undefined,
      raw_payload: {
        ...normalizedPayload,
        sourceRequestIp: requestIp,
        sourcePayloadIp: payloadIp,
        sourcePhysicalIp: payloadIp ?? requestIp ?? null,
        sourceDeviceMapped: journalDevice ? true : false,
        sourceResolvedDeviceIp: this.resolveMappedIpForDevice(journalDevice),
        sourcePayloadDeviceId: payloadKnownDevice?.deviceId ?? null,
        sourceDeviceQueryId: this.normalizeWhitespace(deviceIdQuery) || null,
        sourceDeviceQueryName: this.normalizeWhitespace(deviceNameQuery) || null,
        sourceEventTypeQuery: this.normalizeWhitespace(eventTypeQuery) || null,
      },
    });

    let saved: AccessLog;
    try {
      saved = await this.accessRepo.save(log);
    } catch (error) {
      if (eventSerial && deviceId && this.isAccessLogUniqueConstraintError(error)) {
        const alreadySaved = await this.accessRepo
          .createQueryBuilder('log')
          .where('log.event_serial = :eventSerial', { eventSerial })
          .andWhere('log.device_id = :deviceId', { deviceId })
          .orderBy('log.id', 'DESC')
          .getOne();

        if (alreadySaved) {
          return respond({
            ok: true,
            duplicate: true,
            id: alreadySaved.id,
            status: this.mapStatus(alreadySaved.status),
            eventType: alreadySaved.event_type,
            accessTime: alreadySaved.access_time,
          });
        }
      }

      throw error;
    }

    if (normalizedExternalId && this.isLikelyValidPersonName(resolvedPersonName)) {
      await this.upsertIdentity(normalizedExternalId, resolvedPersonName, payloadIp ?? requestIp, resolvedDepartment);
    }

    return respond({
      ok: true,
      id: saved.id,
      status: this.mapStatus(saved.status),
      eventType: saved.event_type,
      accessTime: saved.access_time,
    });
  }


  @Post('identities/bulk')
  @HttpCode(200)
  async upsertIdentities(@Body() body: any) {
    const items = Array.isArray(body?.items) ? body.items : [];
    const applyToLogs = body?.applyToLogs === true;

    let created = 0;
    let updated = 0;
    let appliedToLogs = 0;
    let skipped = 0;

    for (const item of items) {
      const externalId = this.normalizeExternalId(item?.externalId ?? item?.employeeNo ?? item?.faceId ?? item?.id);
      const fullName = this.normalizePersonName(item?.fullName ?? item?.name ?? item?.personName);
      const department = this.normalizeDepartment(item?.department ?? item?.departmentName ?? item?.division ?? item?.unit);
      const sourceIp = this.normalizeIp(item?.sourceIp ?? item?.ipAddress ?? item?.host);

      if (!externalId || !this.isLikelyValidPersonName(fullName)) {
        skipped += 1;
        continue;
      }

      const existing = await this.identityRepo.findOne({ where: { external_id: externalId } });
      if (!existing) {
        await this.identityRepo.save(this.identityRepo.create({
          external_id: externalId,
          full_name: fullName,
          department,
          source_ip: sourceIp ?? null,
          last_seen: new Date(),
        }));
        created += 1;
      } else {
        const preferredName = this.pickPreferredPersonName(existing.full_name, fullName);
        const shouldUpdate =
          preferredName !== this.normalizePersonName(existing.full_name) ||
          (department ?? null) !== (existing.department ?? null) ||
          !!(sourceIp && sourceIp !== existing.source_ip);

        existing.full_name = preferredName;
        existing.department = department ?? existing.department ?? null;
        existing.source_ip = sourceIp ?? existing.source_ip;
        existing.last_seen = new Date();
        await this.identityRepo.save(existing);

        if (shouldUpdate) {
          updated += 1;
        }
      }

      if (applyToLogs) {
        const updatePayload: Partial<AccessLog> = { person_name: fullName };
        if (department != null) {
          updatePayload.department = department;
        }
        const updateResult = await this.accessRepo
          .createQueryBuilder()
          .update(AccessLog)
          .set(updatePayload)
          .where("(CASE WHEN ltrim(face_id_hash, '0') = '' THEN '0' ELSE ltrim(face_id_hash, '0') END) = :externalId", { externalId })
          .andWhere(
            department != null
              ? "((person_name IS NULL OR TRIM(person_name) = '' OR person_name LIKE 'ID-%' OR LOWER(person_name) <> LOWER(:fullName)) OR COALESCE(department, '') <> COALESCE(:department, ''))"
              : "(person_name IS NULL OR TRIM(person_name) = '' OR person_name LIKE 'ID-%' OR LOWER(person_name) <> LOWER(:fullName))",
            department != null ? { fullName, department } : { fullName },
          )
          .execute();

        appliedToLogs += Number(updateResult.affected ?? 0);
      }
    }

    return {
      ok: true,
      total: items.length,
      created,
      updated,
      appliedToLogs,
      skipped,
    };
  }
  @Get('logs')
  async getLogs(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sinceId') sinceId?: string,
    @Query('eventType') eventType?: string,
  ) {
    const parsedLimit = Number.parseInt(limit ?? '50', 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, this.logsMaxPageSize))
      : 50;
    const parsedPage = Number.parseInt(page ?? '', 10);
    const safePage = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : null;
    const normalizedSearch = this.normalizeWhitespace(search);
    const searchVariants = this.buildAccessLogSearchVariants(normalizedSearch);
    const { fromStart, toEnd } = this.parseAccessLogDateFilters(dateFrom, dateTo);
    const normalizedDateFrom = this.normalizeWhitespace(dateFrom);
    const normalizedDateTo = this.normalizeWhitespace(dateTo);
    const useImplicitLogRange =
      !normalizedDateFrom && !normalizedDateTo && this.logsDefaultRangeDays > 0;
    const implicitRangeStart = useImplicitLogRange
      ? new Date(Date.now() - this.logsDefaultRangeDays * 86_400_000)
      : null;
    const rangeFrom = fromStart ?? implicitRangeStart;

    let baseQuery = this.accessRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.driver', 'driver');

    if (searchVariants.length > 0) {
      const searchParams = searchVariants.reduce<Record<string, string>>((acc, variant, index) => {
        acc[`q${index}`] = `%${variant}%`;
        return acc;
      }, {});
      const perVariantClauses = searchVariants.map((_, index) => {
        const param = `q${index}`;
        return `(
          COALESCE(log.person_name, '') LIKE :${param}
          OR COALESCE(driver.full_name, '') LIKE :${param}
          OR COALESCE(driver.license_number, '') LIKE :${param}
          OR COALESCE(driver.department, '') LIKE :${param}
          OR COALESCE(log.department, '') LIKE :${param}
          OR COALESCE(log.face_id_hash, '') LIKE :${param}
          OR COALESCE(log.device_name, '') LIKE :${param}
          OR COALESCE(log.device_id, '') LIKE :${param}
        )`;
      });
      baseQuery = baseQuery.andWhere(
        `(${perVariantClauses.join(' OR ')})`,
        searchParams,
      );
    }

    if (eventType === 'entrance' || eventType === 'exit') {
      baseQuery = baseQuery.andWhere('log.event_type = :eventType', { eventType });
    } else if (eventType === 'zavod-entrance' || eventType === 'zavod-exit') {
      baseQuery = baseQuery.andWhere('log.event_type = :eventType', { eventType: eventType === 'zavod-entrance' ? 'entrance' : 'exit' });
      baseQuery = baseQuery.andWhere('(LOWER(log.device_name) NOT LIKE :shaxta AND LOWER(log.device_id) NOT LIKE :shaxta)', { shaxta: '%shaxta%' });
      baseQuery = baseQuery.andWhere('(LOWER(log.device_name) NOT LIKE :mine AND LOWER(log.device_id) NOT LIKE :mine)', { mine: '%mine%' });
    } else if (eventType === 'mine-entrance' || eventType === 'mine-exit') {
      baseQuery = baseQuery.andWhere('log.event_type = :eventType', { eventType: eventType === 'mine-entrance' ? 'entrance' : 'exit' });
      baseQuery = baseQuery.andWhere('(LOWER(log.device_name) LIKE :shaxta OR LOWER(log.device_id) LIKE :shaxta OR LOWER(log.device_name) LIKE :mine OR LOWER(log.device_id) LIKE :mine)', { shaxta: '%shaxta%', mine: '%mine%' });
    }

    if (rangeFrom) {
      baseQuery = baseQuery.andWhere(`datetime(log.access_time) >= datetime(:fromStart)`, {
        fromStart: rangeFrom.toISOString(),
      });
    }

    if (toEnd) {
      baseQuery = baseQuery.andWhere(`datetime(log.access_time) <= datetime(:toEnd)`, {
        toEnd: toEnd.toISOString(),
      });
    }

    const mapRow = (row: AccessLog) => {
      const parsedPayload = this.parseRawPayload(row.raw_payload);
      const rawPayloadName =
        parsedPayload && typeof parsedPayload === 'object'
          ? this.resolveBestPersonNameFromNormalizedPayload(parsedPayload)
          : this.normalizePersonName(this.getNameFromRawPayload(row.raw_payload));
      const nameFromDriver = this.normalizePersonName(row.driver?.full_name);
      const nameFromRow = row.person_name && !this.isFallbackIdName(row.person_name)
        ? this.normalizePersonName(row.person_name)
        : '';

      const merged = this.pickPreferredPersonName(this.pickPreferredPersonName(nameFromRow || null, rawPayloadName), nameFromDriver);
      const resolvedName =
        (merged && this.isLikelyValidPersonName(merged) ? merged : '') ||
        (this.isLikelyValidPersonName(rawPayloadName) ? rawPayloadName : '') ||
        (this.isLikelyValidPersonName(nameFromRow) ? nameFromRow : '') ||
        (this.isLikelyValidPersonName(nameFromDriver) ? nameFromDriver : '') ||
        '';
      const resolvedEventType = this.resolveNormalizedEventType(
        row.event_type,
        row.device_id,
        row.device_name,
        row.raw_payload,
      );
      const resolvedDepartment =
        this.normalizeDepartment(row.department) ??
        this.normalizeDepartment(row.driver?.department) ??
        null;

      return {
        id: row.id,
        name: resolvedName || "Noma'lum xodim",
        department: resolvedDepartment,
        time: row.access_time,
        type: resolvedEventType,
        temp: row.temperature || 'N/A',
        status: resolvedEventType === 'exit' ? 'exited' : 'entered',
        verificationStatus: this.mapStatus(row.status),
        device: row.device_name || row.device_id || 'Unknown Device',
        deviceIp: this.resolveDeviceIp(row.device_id, row.device_name, row.raw_payload),
        driverId: row.driver?.id ?? null,
      };
    };

    const dedupeMappedRows = <T extends {
      name: string;
      deviceIp: string | null;
      type: string;
      time: Date | string;
    }>(items: T[]): T[] => {
      const dedupWindowSec = Math.max(
        Number.parseInt(process.env.HIKVISION_LOGS_DEDUP_SECONDS ?? '20', 10) || 20,
        1,
      );
      const seen = new Map<string, number>();
      const out: T[] = [];

      for (const item of items) {
        const keyName = this.normalizeWhitespace(item.name).toLowerCase();
        const keyIp = this.normalizeIp(item.deviceIp) ?? this.normalizeWhitespace(item.deviceIp).toLowerCase();
        const keyType = this.normalizeWhitespace(item.type).toLowerCase();
        const ts = new Date(item.time).getTime();
        if (!keyName || !keyIp || !keyType || !Number.isFinite(ts)) {
          out.push(item);
          continue;
        }

        const key = `${keyName}|${keyIp}|${keyType}`;
        const lastTs = seen.get(key);
        if (lastTs != null && Math.abs(lastTs - ts) <= dedupWindowSec * 1000) {
          continue;
        }
        seen.set(key, ts);
        out.push(item);
      }

      return out;
    };

    const parsedSinceId = Number.parseInt(sinceId ?? '', 10);
    if (Number.isFinite(parsedSinceId) && parsedSinceId > 0) {
      const incrementalLimit = Math.min(safeLimit, 200);
      const rows = await baseQuery
        .clone()
        .andWhere('log.id > :sinceId', { sinceId: parsedSinceId })
        .orderBy('log.id', 'ASC')
        .take(incrementalLimit)
        .getMany();

      const items = dedupeMappedRows(
        rows
          .filter((row) => !this.shouldIgnoreStoredLogRow(row))
          .map(mapRow),
      );
      const latestId = items.length > 0 ? Math.max(...items.map((item) => item.id)) : parsedSinceId;

      return {
        items,
        latestId,
        incremental: true,
        total: items.length,
        page: 1,
        totalPages: 1,
      };
    }

    // Backward compatibility for existing callers that expect array shape.
    if (safePage === null) {
      const rows = await baseQuery
        .clone()
        .orderBy('log.access_time', 'DESC')
        .addOrderBy('log.id', 'DESC')
        .take(Math.min(this.logsMaxPageSize, safeLimit * 4))
        .getMany();

      return dedupeMappedRows(
        rows
        .filter((row) => !this.shouldIgnoreStoredLogRow(row))
        .slice(0, safeLimit)
        .map(mapRow),
      );
    }

    const total = await baseQuery.clone().getCount();
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const clampedPage = Math.min(safePage, totalPages);
    const start = (clampedPage - 1) * safeLimit;
    const rows = await baseQuery
      .clone()
      .orderBy('log.access_time', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip(start)
      .take(Math.min(this.logsMaxPageSize, safeLimit * 4))
      .getMany();

    const items = dedupeMappedRows(
      rows
        .filter((row) => !this.shouldIgnoreStoredLogRow(row))
        .map(mapRow),
    ).slice(0, safeLimit);

    return {
      items,
      total,
      page: clampedPage,
      limit: safeLimit,
      totalPages,
    };
  }

  @Get('summary')
  async getSummary(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    const { fromStart, toEnd } = this.parseAccessLogDateFilters(dateFrom, dateTo);
    const useJournalDates = fromStart != null || toEnd != null;

    let kpiRowsQuery = this.accessRepo.createQueryBuilder('log');
    let kpiBounds: { start: Date; end: Date };

    if (!useJournalDates) {
      const bounds = getAccessKpisTashkentDayBounds();
      kpiBounds = { start: bounds.start, end: bounds.end };
      kpiRowsQuery = kpiRowsQuery
        .where(`datetime(log.access_time) >= datetime(:start)`, {
          start: bounds.start.toISOString(),
        })
        .andWhere(`datetime(log.access_time) < datetime(:end)`, {
          end: bounds.end.toISOString(),
        });
    } else {
      const rangeStart = fromStart ?? new Date(0);
      const rangeEndExclusive = toEnd != null ? new Date(toEnd.getTime() + 1) : new Date(8640000000000000);
      kpiBounds = { start: rangeStart, end: rangeEndExclusive };

      if (fromStart) {
        kpiRowsQuery = kpiRowsQuery.where(`datetime(log.access_time) >= datetime(:fromStart)`, {
          fromStart: fromStart.toISOString(),
        });
      }
      if (toEnd) {
        const clause = `datetime(log.access_time) <= datetime(:toEnd)`;
        const params = { toEnd: toEnd.toISOString() };
        kpiRowsQuery = fromStart
          ? kpiRowsQuery.andWhere(clause, params)
          : kpiRowsQuery.where(clause, params);
      }
    }

    const todayRows = await kpiRowsQuery.orderBy('log.access_time', 'DESC').getMany();

    const { 
      entrancesToday: totalToday, 
      exitsToday, 
      zavodEntrancesToday, 
      zavodExitsToday, 
      mineEntrancesToday, 
      mineExitsToday, 
      flaggedToday: flagged 
    } = computeTurnstileDailyAccessKpis(
      todayRows,
      kpiBounds,
    );

    const knownTurnstiles = Object.entries(this.deviceIpMap).map(([ip, mapped]) => ({
      ip,
      ...mapped,
    }));
    const knownDeviceIds = Array.from(new Set(knownTurnstiles.map((device) => device.deviceId)));
    const knownDeviceNames = Array.from(new Set(knownTurnstiles.map((device) => device.deviceName)));

    const lastSeenByDeviceId = new Map<string, number>();
    if (knownDeviceIds.length > 0) {
      const lastSeenRowsById = await this.accessRepo
        .createQueryBuilder('log')
        .select('log.device_id', 'device_id')
        .addSelect('MAX(log.access_time)', 'last_seen')
        .where('log.device_id IN (:...ids)', { ids: knownDeviceIds })
        .groupBy('log.device_id')
        .getRawMany();

      for (const row of lastSeenRowsById) {
        const normalizedDeviceId = this.normalizeWhitespace(row?.device_id).toUpperCase();
        const seenMs = this.parseTimestampMs(row?.last_seen);
        if (!normalizedDeviceId || seenMs == null) continue;
        lastSeenByDeviceId.set(normalizedDeviceId, seenMs);
      }
    }

    const lastSeenByDeviceName = new Map<string, number>();
    if (knownDeviceNames.length > 0) {
      const lastSeenRowsByName = await this.accessRepo
        .createQueryBuilder('log')
        .select('log.device_name', 'device_name')
        .addSelect('MAX(log.access_time)', 'last_seen')
        .where('log.device_name IN (:...names)', { names: knownDeviceNames })
        .groupBy('log.device_name')
        .getRawMany();

      for (const row of lastSeenRowsByName) {
        const normalizedDeviceName = this.normalizeWhitespace(row?.device_name).toUpperCase();
        const seenMs = this.parseTimestampMs(row?.last_seen);
        if (!normalizedDeviceName || seenMs == null) continue;
        lastSeenByDeviceName.set(normalizedDeviceName, seenMs);
      }
    }

    if (knownDeviceIds.length > 0) {
      const statusRows = await this.turnstileStatusRepo
        .createQueryBuilder('status')
        .where('status.device_id IN (:...ids)', { ids: knownDeviceIds })
        .getMany();

      for (const row of statusRows) {
        const normalizedDeviceId = this.normalizeWhitespace(row.device_id).toUpperCase();
        const normalizedDeviceName = this.normalizeWhitespace(row.device_name).toUpperCase();
        const seenMs = this.parseTimestampMs(row.last_seen);
        if (seenMs == null) continue;

        if (normalizedDeviceId) {
          const current = lastSeenByDeviceId.get(normalizedDeviceId);
          if (current == null || seenMs > current) {
            lastSeenByDeviceId.set(normalizedDeviceId, seenMs);
          }
        }

        if (normalizedDeviceName) {
          const current = lastSeenByDeviceName.get(normalizedDeviceName);
          if (current == null || seenMs > current) {
            lastSeenByDeviceName.set(normalizedDeviceName, seenMs);
          }
        }
      }
    }

    const offlineAfterMs = this.turnstileOfflineMinutes * 60 * 1000;
    const nowMs = Date.now();
    const turnstiles = knownTurnstiles.map((device) => {
      const byDeviceId = lastSeenByDeviceId.get(this.normalizeWhitespace(device.deviceId).toUpperCase());
      const byDeviceName = lastSeenByDeviceName.get(this.normalizeWhitespace(device.deviceName).toUpperCase());
      const lastSeenMs = byDeviceId ?? byDeviceName ?? null;

      return {
        key: this.resolveTurnstileKey(device.deviceId, device.deviceName, device.ip) || device.key,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        ip: device.ip,
        eventType: device.eventType,
        lastSeen: lastSeenMs == null ? null : new Date(lastSeenMs).toISOString(),
        status: lastSeenMs != null && nowMs - lastSeenMs <= offlineAfterMs ? 'online' : 'offline',
      };
    });
    const systemStatus = turnstiles.some((device) => device.status === 'online') ? 'online' : 'offline';

    return {
      totalToday,
      flaggedToday: flagged,
      exitsToday,
      zavodEntrancesToday,
      zavodExitsToday,
      mineEntrancesToday,
      mineExitsToday,
      systemStatus,
      turnstiles,
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AccessLog, Driver, TurnstileIdentity, TurnstileStatusEvent])],
  controllers: [HikvisionController],
  providers: [HikvisionPollerService],
})
export class IntegrationsModule {}

















