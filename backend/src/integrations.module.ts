import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Driver } from './driver.entity';
import { CheckStatus } from './medical.entity';
import { Module, Controller, Post, Body, Get, Query, UnauthorizedException, Headers, Req, Logger, Res, HttpCode } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { createHash } from 'crypto';
import { Response } from 'express';

type HikvisionEventType = 'entrance' | 'exit';
type DeviceMapEntry = {
  deviceId: string;
  deviceName: string;
  eventType: HikvisionEventType;
};

const DEVICE_IP_MAP: Record<string, DeviceMapEntry> = {
  '192.168.0.223': { deviceId: 'IN-1', deviceName: 'Kirish-1', eventType: 'entrance' },
  '192.168.0.221': { deviceId: 'IN-2', deviceName: 'Kirish-2', eventType: 'entrance' },
  '192.168.0.219': { deviceId: 'IN-3', deviceName: 'Kirish-3', eventType: 'entrance' },
  '192.168.0.224': { deviceId: 'OUT-1', deviceName: 'Chiqish-1', eventType: 'exit' },
  '192.168.0.222': { deviceId: 'OUT-2', deviceName: 'Chiqish-2', eventType: 'exit' },
  '192.168.0.220': { deviceId: 'OUT-3', deviceName: 'Chiqish-3', eventType: 'exit' },
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

  @Column({ length: 64, nullable: true })
  source_ip: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  last_seen: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}

@Controller('integrations/hikvision')
export class HikvisionController {
  private readonly logger = new Logger(HikvisionController.name);
  private readonly dedupSeconds = Math.max(Number.parseInt(process.env.HIKVISION_DEDUP_SECONDS ?? '20', 10) || 20, 1);
  private readonly pairDedupSeconds = Math.max(Number.parseInt(process.env.HIKVISION_PAIR_DEDUP_SECONDS ?? '12', 10) || 12, 1);
  private readonly strictSourceIp = String(process.env.HIKVISION_STRICT_SOURCE_IP ?? 'true').toLowerCase() === 'true';
  private readonly maxEventAgeMinutes = Math.max(Number.parseInt(process.env.HIKVISION_MAX_EVENT_AGE_MINUTES ?? '180', 10) || 180, 1);
  private readonly maxFutureSkewMinutes = Math.max(Number.parseInt(process.env.HIKVISION_MAX_FUTURE_SKEW_MINUTES ?? '5', 10) || 5, 1);

  constructor(
    @InjectRepository(AccessLog)
    private accessRepo: Repository<AccessLog>,
    @InjectRepository(Driver)
    private driverRepo: Repository<Driver>,
    @InjectRepository(TurnstileIdentity)
    private identityRepo: Repository<TurnstileIdentity>,
  ) {}

  private normalizeWhitespace(value: string | null | undefined): string {
    return String(value ?? '').replace(/\s+/g, ' ').replace(/\t+/g, ' ').trim();
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

  private isLikelyValidPersonName(value: string | null | undefined): boolean {
    const name = this.normalizePersonName(value);
    if (!name) return false;
    if (this.isFallbackIdName(name)) return false;

    const tokens = name.split(' ').filter(Boolean);
    if (tokens.length < 2) return false;
    return /[\p{L}]/u.test(name);
  }

  private scorePersonName(value: string | null | undefined): number {
    const name = this.normalizePersonName(value);
    if (!name) return 0;

    const tokens = name.split(' ').filter(Boolean).length;
    const hasCyrillic = /[\u0400-\u04FF]/.test(name) ? 1 : 0;
    const hasLatin = /[A-Za-z]/.test(name) ? 1 : 0;
    const badChars = /[?]{2,}|UNKNOWN|TEST|DRIVER/i.test(name) ? 1 : 0;

    let score = 0;
    score += Math.min(tokens, 4) * 10;
    score += Math.min(name.length, 60);
    score += hasCyrillic * 8;
    score += hasLatin * 2;
    score -= badChars * 25;

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

    return this.scorePersonName(next) >= this.scorePersonName(current) ? next : current;
  }

  private async upsertIdentity(externalIdRaw: string | null | undefined, fullNameRaw: string | null | undefined, sourceIp?: string | null): Promise<void> {
    const externalId = this.normalizeExternalId(externalIdRaw);
    const fullName = this.normalizePersonName(fullNameRaw);
    if (!externalId || !this.isLikelyValidPersonName(fullName)) return;

    const existing = await this.identityRepo.findOne({ where: { external_id: externalId } });
    if (!existing) {
      await this.identityRepo.save(this.identityRepo.create({
        external_id: externalId,
        full_name: fullName,
        source_ip: this.normalizeIp(sourceIp) ?? null,
        last_seen: new Date(),
      }));
      return;
    }

    const preferred = this.pickPreferredPersonName(existing.full_name, fullName);
    existing.full_name = preferred;
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

  private toUnixSeconds(value: Date | string | null | undefined): number | null {
    if (!value) return null;
    const timeMs = new Date(value).getTime();
    if (!Number.isFinite(timeMs)) return null;
    return Math.floor(timeMs / 1000);
  }

  private buildIdentityKey(payload: {
    faceIdHash?: string | null;
    personName?: string | null;
    driverName?: string | null;
  }): string {
    const normalizedPersonName = this.normalizeWhitespace(payload.driverName ?? payload.personName);
    if (normalizedPersonName && !this.isFallbackIdName(normalizedPersonName)) {
      return `name:${normalizedPersonName.toLowerCase()}`;
    }

    const normalizedFaceId = this.normalizeExternalId(payload.faceIdHash);
    if (normalizedFaceId) return `id:${normalizedFaceId}`;

    const fallbackId = this.extractIdFromFallbackName(normalizedPersonName);
    const normalizedFallbackId = this.normalizeExternalId(fallbackId);
    if (normalizedFallbackId) return `id:${normalizedFallbackId}`;

    return '';
  }

  private dedupeRows(rows: AccessLog[]): AccessLog[] {
    if (rows.length <= 1) return rows;

    const result: AccessLog[] = [];
    const recentByIdentity = new Map<string, AccessLog[]>();
    const maxWindowSeconds = Math.max(this.dedupSeconds, this.pairDedupSeconds);

    for (const row of rows) {
      const identityKey = this.buildIdentityKey({
        faceIdHash: row.face_id_hash,
        personName: row.person_name,
        driverName: row.driver?.full_name ?? null,
      });

      if (!identityKey) {
        result.push(row);
        continue;
      }

      const rowSeconds = this.toUnixSeconds(row.access_time);
      if (rowSeconds == null) {
        result.push(row);
        continue;
      }

      const rowLane = this.extractLaneKey(row.device_id, row.device_name);
      const recentRows = recentByIdentity.get(identityKey) ?? [];
      let duplicate = false;

      for (const recentRow of recentRows) {
        const recentSeconds = this.toUnixSeconds(recentRow.access_time);
        if (recentSeconds == null) continue;
        const diff = Math.abs(rowSeconds - recentSeconds);

        if (row.event_type === recentRow.event_type && diff <= this.dedupSeconds) {
          duplicate = true;
          break;
        }

        if (row.event_type !== recentRow.event_type && diff <= this.pairDedupSeconds) {
          duplicate = true;
          break;
        }
      }

      if (duplicate) {
        continue;
      }

      result.push(row);
      recentRows.push(row);

      const filtered = recentRows.filter((recentRow) => {
        const recentSeconds = this.toUnixSeconds(recentRow.access_time);
        if (recentSeconds == null) return false;
        return Math.abs(rowSeconds - recentSeconds) <= maxWindowSeconds;
      });
      recentByIdentity.set(identityKey, filtered);
    }

    return result;
  }

  private applyIdentityMatch(
    query: SelectQueryBuilder<AccessLog>,
    alias: string,
    identity: { faceIdHash?: string | null; personName?: string | null },
  ): SelectQueryBuilder<AccessLog> {
    const faceIdHash = this.normalizeWhitespace(identity.faceIdHash);
    const normalizedFaceId = this.normalizeExternalId(faceIdHash);
    const personName = this.normalizeWhitespace(identity.personName);

    if (faceIdHash && personName && normalizedFaceId) {
      return query.andWhere(
        `(
          ${alias}.face_id_hash = :identityFaceIdHash
          OR (CASE WHEN ltrim(${alias}.face_id_hash, '0') = '' THEN '0' ELSE ltrim(${alias}.face_id_hash, '0') END) = :identityNormalizedFaceId
          OR LOWER(${alias}.person_name) = LOWER(:identityPersonName)
        )`,
        {
          identityFaceIdHash: faceIdHash,
          identityNormalizedFaceId: normalizedFaceId,
          identityPersonName: personName,
        },
      );
    }

    if (faceIdHash && normalizedFaceId) {
      return query.andWhere(
        `(
          ${alias}.face_id_hash = :identityFaceIdHash
          OR (CASE WHEN ltrim(${alias}.face_id_hash, '0') = '' THEN '0' ELSE ltrim(${alias}.face_id_hash, '0') END) = :identityNormalizedFaceId
        )`,
        {
          identityFaceIdHash: faceIdHash,
          identityNormalizedFaceId: normalizedFaceId,
        },
      );
    }

    if (personName) {
      return query.andWhere(`LOWER(${alias}.person_name) = LOWER(:identityPersonName)`, {
        identityPersonName: personName,
      });
    }

    return query.andWhere('1 = 0');
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
    if (payloadIp && DEVICE_IP_MAP[payloadIp]) return DEVICE_IP_MAP[payloadIp];
    if (requestIp && DEVICE_IP_MAP[requestIp]) return DEVICE_IP_MAP[requestIp];
    return null;
  }

  private findKnownDeviceByIdOrName(deviceId: string | null | undefined, deviceName: string | null | undefined): DeviceMapEntry | null {
    const id = this.normalizeWhitespace(deviceId).toUpperCase();
    const name = this.normalizeWhitespace(deviceName).toUpperCase();
    if (!id && !name) return null;

    for (const mapped of Object.values(DEVICE_IP_MAP)) {
      const mappedId = this.normalizeWhitespace(mapped.deviceId).toUpperCase();
      const mappedName = this.normalizeWhitespace(mapped.deviceName).toUpperCase();
      if ((id && mappedId === id) || (name && mappedName === name)) {
        return mapped;
      }
    }

    return null;
  }

  private resolveDeviceIp(
    deviceId: string | null | undefined,
    deviceName: string | null | undefined,
    rawPayload: any,
  ): string | null {
    const parsed = this.parseRawPayload(rawPayload);
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

    for (const [ip, mapped] of Object.entries(DEVICE_IP_MAP)) {
      const mappedId = this.normalizeWhitespace(mapped.deviceId).toUpperCase();
      const mappedName = this.normalizeWhitespace(mapped.deviceName).toUpperCase();
      if ((normalizedId && mappedId === normalizedId) || (normalizedName && mappedName === normalizedName)) {
        return ip;
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
  }): string | null {
    const seed = [
      source.eventTime ? source.eventTime.toISOString() : '',
      source.eventType,
      source.deviceId ?? '',
      source.faceIdHash ?? '',
      source.employeeNo ?? '',
      source.personName ?? '',
    ].join('|');

    if (!seed.replace(/\|/g, '').trim()) return null;
    return createHash('sha1').update(seed).digest('hex').slice(0, 40);
  }

  private normalizeNameForLookup(value: string | null | undefined): string {
    return this.normalizeWhitespace(value).toLowerCase();
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

  private normalizeEventType(payload: any, forcedType?: string, mappedType?: HikvisionEventType): HikvisionEventType {
    if (mappedType) return mappedType;

    if (forcedType) {
      const normalizedForced = String(forcedType).toLowerCase();
      if (['exit', 'out', 'chiqish'].includes(normalizedForced)) return 'exit';
      if (['entrance', 'in', 'kirish'].includes(normalizedForced)) return 'entrance';
    }

    const source = String(
      payload?.eventType ??
      payload?.event_type ??
      payload?.accessType ??
      payload?.type ??
      payload?.eventDescription ??
      '',
    ).toLowerCase();

    if (source.includes('exit') || source.includes('leave') || source.includes('out') || source.includes('chiq')) {
      return 'exit';
    }

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

  private findFirstByKeys(obj: any, keys: string[]): string | number | boolean | null {
    const keySet = new Set(keys.map((key) => key.toLowerCase()));
    let found: string | number | boolean | null = null;

    const walk = (node: any) => {
      if (found != null || node == null) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node !== 'object') return;

      for (const [key, rawValue] of Object.entries(node)) {
        if (found != null) break;

        if (keySet.has(key.toLowerCase())) {
          const extracted = this.extractPrimitive(rawValue);
          if (extracted != null && String(extracted).trim() !== '') {
            found = extracted;
            break;
          }
        }

        if (rawValue && typeof rawValue === 'object') {
          walk(rawValue);
        }
      }
    };

    walk(obj);
    return found;
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
      eventDescription: pick('eventDescription', 'eventName', 'majorEventTypeName', 'subEventTypeName'),
      temperature: pick('temperature', 'temp', 'bodyTemp', 'currTemperature'),
      dateTime: pick('dateTime', 'eventTime', 'time'),
      serialNo: pick('serialNo', 'eventSerialNo', 'eventId', 'logID'),
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

    const name = this.normalizeWhitespace(
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
    const declaredKnownDevice = this.findKnownDeviceByIdOrName(deviceIdQuery, deviceNameQuery);
    const knownDevice = this.mapKnownDevice(payloadIp, requestIp) ?? declaredKnownDevice;

    if (this.strictSourceIp && !knownDevice) {
      this.logger.warn(`Ignoring webhook from unknown source ip: request=${requestIp ?? 'none'} payload=${payloadIp ?? 'none'}`);
      return respond({ ok: true, ignored: true, reason: 'unknown_source_ip' });
    }

    const employeeNo = this.normalizeWhitespace(normalizedPayload?.employeeNo);
    const rawFaceId = this.normalizeWhitespace(
      normalizedPayload?.faceId ??
      normalizedPayload?.face_id ??
      normalizedPayload?.personId ??
      employeeNo,
    );
    const faceIdHash = rawFaceId || employeeNo || null;

    const firstName = this.normalizeWhitespace(normalizedPayload?.firstName ?? normalizedPayload?.first_name);
    const lastName = this.normalizeWhitespace(normalizedPayload?.lastName ?? normalizedPayload?.last_name);
    const middleName = this.normalizeWhitespace(normalizedPayload?.middleName ?? normalizedPayload?.middle_name);
    const fullNameFromParts = this.normalizeWhitespace([lastName, firstName, middleName].filter(Boolean).join(' '));

    let personName = this.normalizePersonName(
      normalizedPayload?.name ??
      normalizedPayload?.personName ??
      normalizedPayload?.employeeName ??
      normalizedPayload?.fullName ??
      fullNameFromParts,
    ) || null;

    const normalizedExternalId = this.normalizeExternalId(faceIdHash || employeeNo);

    if (normalizedExternalId && this.isLikelyValidPersonName(personName)) {
      await this.upsertIdentity(normalizedExternalId, personName, payloadIp ?? requestIp);
    }

    const identityName = await this.resolveIdentityName(normalizedExternalId);
    if (identityName) {
      personName = this.pickPreferredPersonName(personName, identityName);
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
          personName = this.normalizePersonName(knownPerson.person_name);
          if (normalizedExternalId && this.isLikelyValidPersonName(personName)) {
            await this.upsertIdentity(normalizedExternalId, personName, payloadIp ?? requestIp);
          }
        }
      }
    }

    const eventTime = this.parseEventTime(normalizedPayload?.dateTime ?? normalizedPayload?.eventTime ?? normalizedPayload?.time);
    const eventType = this.normalizeEventType(normalizedPayload, eventTypeQuery, knownDevice?.eventType);
    const deviceId = this.normalizeWhitespace(
      knownDevice?.deviceId ??
      deviceIdQuery ??
      normalizedPayload?.deviceId ??
      normalizedPayload?.device_id ??
      normalizedPayload?.terminalId,
    ) || null;
    const deviceName = this.normalizeWhitespace(
      knownDevice?.deviceName ??
      deviceNameQuery ??
      normalizedPayload?.deviceName ??
      normalizedPayload?.device_name ??
      normalizedPayload?.terminalName,
    ) || null;

    const serialFromPayload = this.normalizeWhitespace(
      normalizedPayload?.serialNo ?? normalizedPayload?.eventSerialNo ?? normalizedPayload?.eventId,
    ) || null;
    const eventSerial = serialFromPayload ?? this.createSyntheticSerial({
      eventTime,
      eventType,
      deviceId,
      faceIdHash,
      employeeNo,
      personName,
    });

    if (!faceIdHash && !employeeNo && !personName) {
      return respond({ ok: true, ignored: true, reason: 'no_identity_fields' });
    }

    if (!returnJson && eventTime) {
      const nowMs = Date.now();
      const eventMs = eventTime.getTime();
      const tooOldMs = this.maxEventAgeMinutes * 60 * 1000;
      const tooFutureMs = this.maxFutureSkewMinutes * 60 * 1000;

      if (nowMs - eventMs > tooOldMs) {
        return respond({ ok: true, ignored: true, reason: 'stale_event' });
      }
      if (eventMs - nowMs > tooFutureMs) {
        return respond({ ok: true, ignored: true, reason: 'future_event' });
      }
    }

    const temperatureValue = normalizedPayload?.temperature ?? normalizedPayload?.temp ?? normalizedPayload?.bodyTemp;
    const temperature = temperatureValue != null ? String(temperatureValue) : null;

    if (eventSerial) {
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
    if (eventTime && (faceIdHash || personName)) {
      const eventIso = eventTime.toISOString();

      if (deviceId) {
        const duplicateByIdentityOnDeviceQuery = this.accessRepo
          .createQueryBuilder('log')
          .where('log.device_id = :deviceId', { deviceId })
          .andWhere('log.event_type = :eventType', { eventType })
          .andWhere(`ABS(strftime('%s', log.access_time) - strftime('%s', :eventIso)) <= :dedupSeconds`, {
            eventIso,
            dedupSeconds: this.dedupSeconds,
          });

        this.applyIdentityMatch(duplicateByIdentityOnDeviceQuery, 'log', { faceIdHash, personName });
        const duplicateByIdentityOnDevice = await duplicateByIdentityOnDeviceQuery.orderBy('log.id', 'DESC').getOne();

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

      // Cross-device noise: same person and same action in a tiny window should be a single event.
      const duplicateByIdentityAnyDeviceQuery = this.accessRepo
        .createQueryBuilder('log')
        .where('log.event_type = :eventType', { eventType })
        .andWhere(`ABS(strftime('%s', log.access_time) - strftime('%s', :eventIso)) <= :dedupSeconds`, {
          eventIso,
          dedupSeconds: this.dedupSeconds,
        });
      this.applyIdentityMatch(duplicateByIdentityAnyDeviceQuery, 'log', { faceIdHash, personName });

      const duplicateByIdentityAnyDevice = await duplicateByIdentityAnyDeviceQuery.orderBy('log.id', 'DESC').getOne();
      if (duplicateByIdentityAnyDevice) {
        return respond({
          ok: true,
          duplicate: true,
          id: duplicateByIdentityAnyDevice.id,
          status: this.mapStatus(duplicateByIdentityAnyDevice.status),
          eventType: duplicateByIdentityAnyDevice.event_type,
          accessTime: duplicateByIdentityAnyDevice.access_time,
        });
      }

      // Opposite-direction bounce in a short window is treated as duplicate to avoid double logs.
      const pairByIdentityQuery = this.accessRepo
        .createQueryBuilder('log')
        .where('log.event_type <> :eventType', { eventType })
        .andWhere(`ABS(strftime('%s', log.access_time) - strftime('%s', :eventIso)) <= :pairDedupSeconds`, {
          eventIso,
          pairDedupSeconds: this.pairDedupSeconds,
        });

      this.applyIdentityMatch(pairByIdentityQuery, 'log', { faceIdHash, personName });

      const pairByIdentity = await pairByIdentityQuery.orderBy('log.id', 'DESC').getOne();
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
      (employeeNo ? `ID-${employeeNo}` : null) ||
      (faceIdHash ? `ID-${faceIdHash}` : null);

    const log = this.accessRepo.create({
      driver: driver || null,
      device_id: deviceId,
      device_name: deviceName,
      event_type: eventType,
      temperature,
      person_name: resolvedPersonName,
      face_id_hash: faceIdHash,
      event_serial: eventSerial,
      status: driver || resolvedPersonName ? CheckStatus.PASSED : CheckStatus.FAILED,
      access_time: eventTime ?? undefined,
      raw_payload: {
        ...normalizedPayload,
        sourceRequestIp: requestIp,
        sourcePayloadIp: payloadIp,
        sourceDeviceMapped: knownDevice ? true : false,
      },
    });

    const saved = await this.accessRepo.save(log);

    if (normalizedExternalId && this.isLikelyValidPersonName(resolvedPersonName)) {
      await this.upsertIdentity(normalizedExternalId, resolvedPersonName, payloadIp ?? requestIp);
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
          source_ip: sourceIp ?? null,
          last_seen: new Date(),
        }));
        created += 1;
      } else {
        const preferredName = this.pickPreferredPersonName(existing.full_name, fullName);
        const shouldUpdate =
          preferredName !== this.normalizePersonName(existing.full_name) ||
          !!(sourceIp && sourceIp !== existing.source_ip);

        existing.full_name = preferredName;
        existing.source_ip = sourceIp ?? existing.source_ip;
        existing.last_seen = new Date();
        await this.identityRepo.save(existing);

        if (shouldUpdate) {
          updated += 1;
        }
      }

      if (applyToLogs) {
        const updateResult = await this.accessRepo
          .createQueryBuilder()
          .update(AccessLog)
          .set({ person_name: fullName })
          .where("(CASE WHEN ltrim(face_id_hash, '0') = '' THEN '0' ELSE ltrim(face_id_hash, '0') END) = :externalId", { externalId })
          .andWhere("(person_name IS NULL OR TRIM(person_name) = '' OR person_name LIKE 'ID-%' OR LOWER(person_name) <> LOWER(:fullName))", {
            fullName,
          })
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
  ) {
    const parsedLimit = Number.parseInt(limit ?? '50', 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 500))
      : 50;
    const parsedPage = Number.parseInt(page ?? '', 10);
    const safePage = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : null;
    const normalizedSearch = this.normalizeWhitespace(search).toLowerCase();

    const rows = await this.accessRepo.find({
      relations: ['driver'],
      order: { access_time: 'DESC' },
    });

    const dedupedRows = this.dedupeRows(rows);

    const rowIds = dedupedRows.map((row) => (
      row.face_id_hash || this.extractIdFromFallbackName(row.person_name)
    ));
    const identityCandidates = this.buildIdentityCandidates(rowIds);

    const knownNameByNormalizedId = await this.buildIdentityNameMap(identityCandidates.normalized);
    if (identityCandidates.raw.length > 0 || identityCandidates.normalized.length > 0) {
      const knownRows = await this.accessRepo
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
        .getMany();

      for (const knownRow of knownRows) {
        const norm = this.normalizeExternalId(knownRow.face_id_hash);
        const knownName = this.normalizePersonName(knownRow.person_name);
        if (!norm || !knownName || knownNameByNormalizedId.has(norm)) continue;
        knownNameByNormalizedId.set(norm, knownName);
      }
    }

    const mappedRows = dedupedRows.map((row) => {
      const fallbackId = row.face_id_hash || this.extractIdFromFallbackName(row.person_name);
      const normalizedId = this.normalizeExternalId(fallbackId);
      const canonicalName = normalizedId ? knownNameByNormalizedId.get(normalizedId) : undefined;
      const rawPayloadName = this.normalizePersonName(this.getNameFromRawPayload(row.raw_payload));

      return {
        id: row.id,
        name:
          this.normalizePersonName(row.driver?.full_name) ||
          canonicalName ||
          (row.person_name && !this.isFallbackIdName(row.person_name) ? this.normalizePersonName(row.person_name) : null) ||
          rawPayloadName ||
          (fallbackId ? `ID-${fallbackId}` : 'Unknown'),
        time: row.access_time,
        type: row.event_type || 'entrance',
        temp: row.temperature || 'N/A',
        status: row.event_type === 'exit' ? 'exited' : 'entered',
        verificationStatus: this.mapStatus(row.status),
        device: row.device_name || row.device_id || 'Unknown Device',
        deviceIp: this.resolveDeviceIp(row.device_id, row.device_name, row.raw_payload),
        driverId: row.driver?.id ?? null,
      };
    });

    const finalRows: typeof mappedRows = [];
    const recentByName = new Map<string, typeof mappedRows>();
    const maxWindowSeconds = Math.max(this.dedupSeconds, this.pairDedupSeconds);

    for (const row of mappedRows) {
      const normalizedName = this.normalizeWhitespace(row.name).toLowerCase();
      if (!normalizedName) {
        finalRows.push(row);
        continue;
      }

      const rowSeconds = this.toUnixSeconds(row.time);
      if (rowSeconds == null) {
        finalRows.push(row);
        continue;
      }

      const recentRows = recentByName.get(normalizedName) ?? [];
      let duplicate = false;

      for (const recentRow of recentRows) {
        const recentSeconds = this.toUnixSeconds(recentRow.time);
        if (recentSeconds == null) continue;
        const diff = Math.abs(rowSeconds - recentSeconds);

        if (row.type === recentRow.type && diff <= this.dedupSeconds) {
          duplicate = true;
          break;
        }

        if (row.type !== recentRow.type && diff <= this.pairDedupSeconds) {
          duplicate = true;
          break;
        }
      }

      if (duplicate) {
        continue;
      }

      finalRows.push(row);
      recentRows.push(row);

      const filtered = recentRows.filter((recentRow) => {
        const recentSeconds = this.toUnixSeconds(recentRow.time);
        if (recentSeconds == null) return false;
        return Math.abs(rowSeconds - recentSeconds) <= maxWindowSeconds;
      });
      recentByName.set(normalizedName, filtered);
    }

    const searchedRows = normalizedSearch
      ? finalRows.filter((row) => String(row.name ?? '').toLowerCase().includes(normalizedSearch))
      : finalRows;

    // Backward compatibility for existing callers that expect array shape.
    if (safePage === null) {
      return searchedRows.slice(0, safeLimit);
    }

    const total = searchedRows.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const clampedPage = Math.min(safePage, totalPages);
    const start = (clampedPage - 1) * safeLimit;
    const items = searchedRows.slice(start, start + safeLimit);

    return {
      items,
      total,
      page: clampedPage,
      limit: safeLimit,
      totalPages,
    };
  }

  @Get('summary')
  async getSummary() {
    const todayRows = await this.accessRepo
      .createQueryBuilder('log')
      .where(`DATE(log.access_time, 'localtime') = DATE('now', 'localtime')`)
      .orderBy('log.access_time', 'DESC')
      .getMany();

    const dedupedTodayRows = this.dedupeRows(todayRows);
    const total = dedupedTodayRows.filter((row) => row.event_type === 'entrance').length;
    const exits = dedupedTodayRows.filter((row) => row.event_type === 'exit').length;
    const flagged = dedupedTodayRows.filter((row) => row.status === CheckStatus.FAILED).length;

    return {
      totalToday: total,
      flaggedToday: flagged,
      exitsToday: exits,
      systemStatus: 'online',
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AccessLog, Driver, TurnstileIdentity])],
  controllers: [HikvisionController],
})
export class IntegrationsModule {}

















