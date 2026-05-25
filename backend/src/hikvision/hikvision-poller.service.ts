import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { getEffectiveTurnstileDeviceIpMap } from '../turnstile-daily-access-kpis.util';
import { fetchLatestAcsEvents, type AcsEventRow } from './hikvision-acsevent-fetcher';

/**
 * Webhookdan tashqari ISAPI orqali oxirgi hodisalarni o‘qib, shu backenddagi
 * `POST /integrations/hikvision/webhook` ga yuboradi — dedup va filtrlash bitta yo‘lda.
 *
 * Yoqish: HIKVISION_POLLER_ENABLED=true va HIKVISION_POLLER_PASSWORD (tizimda `curl` bo‘lishi kerak).
 */
@Injectable()
export class HikvisionPollerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HikvisionPollerService.name);
  private interval: NodeJS.Timeout | null = null;
  private running = false;
  private readonly recentPostedEventKeys = new Map<string, number>();
  private readonly initializedDeviceIps = new Set<string>();
  private readonly initializedDeviceAt = new Map<string, number>();

  private get enabled(): boolean {
    return String(process.env.HIKVISION_POLLER_ENABLED ?? '').toLowerCase() === 'true';
  }

  private get username(): string {
    return (process.env.HIKVISION_POLLER_USERNAME ?? '').trim();
  }

  private get password(): string {
    return (process.env.HIKVISION_POLLER_PASSWORD ?? '').trim();
  }

  private get intervalMs(): number {
    const sec = Math.max(Number.parseInt(process.env.HIKVISION_POLLER_INTERVAL_SECONDS ?? '120', 10) || 120, 5);
    return sec * 1000;
  }

  private get lookbackMinutes(): number {
    return Math.max(Number.parseInt(process.env.HIKVISION_POLLER_LOOKBACK_MINUTES ?? '45', 10) || 45, 1);
  }

  private get maxPerDevice(): number {
    return Math.min(
      200,
      Math.max(1, Number.parseInt(process.env.HIKVISION_POLLER_MAX_EVENTS_PER_DEVICE ?? '50', 10) || 50),
    );
  }

  private get devicePort(): number {
    return Math.max(1, Math.min(65535, Number.parseInt(process.env.HIKVISION_POLLER_DEVICE_PORT ?? '80', 10) || 80));
  }

  private get listenPort(): number {
    return Math.max(1, Math.min(65535, Number.parseInt(process.env.PORT ?? '3000', 10) || 3000));
  }

  private get eventKeyTtlMs(): number {
    const minutes = Math.max(Number.parseInt(process.env.HIKVISION_POLLER_EVENT_KEY_TTL_MINUTES ?? '360', 10) || 360, 30);
    return minutes * 60 * 1000;
  }

  private get configuredDeviceIps(): string[] {
    const raw = (process.env.HIKVISION_POLLER_DEVICE_IPS ?? '').trim();
    if (!raw) return [];
    return Array.from(
      new Set(
        raw
          .split(/[,;]/g)
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    );
  }

  private get mineOnlyMode(): boolean {
    return String(process.env.HIKVISION_POLLER_MINE_ONLY ?? 'false').toLowerCase() === 'true';
  }

  private get recordAllEvents(): boolean {
    return String(process.env.HIKVISION_RECORD_ALL_EVENTS ?? 'false').toLowerCase() === 'true';
  }

  private get importEvents(): boolean {
    return String(process.env.HIKVISION_POLLER_IMPORT_EVENTS ?? 'false').toLowerCase() === 'true';
  }

  private get realtimeWarmupMs(): number {
    const seconds = Number.parseInt(process.env.HIKVISION_POLLER_REALTIME_WARMUP_SECONDS ?? '30', 10) || 30;
    return Math.max(0, seconds) * 1000;
  }

  private get maxEventAgeMs(): number {
    const minutes = Number.parseInt(process.env.HIKVISION_MAX_EVENT_AGE_MINUTES ?? '5', 10) || 5;
    return Math.max(1, minutes) * 60 * 1000;
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private isMineMappedDevice(mapped: { key?: string; deviceId?: string; deviceName?: string }): boolean {
    const key = this.normalizeText(mapped?.key).toLowerCase();
    const deviceId = this.normalizeText(mapped?.deviceId).toUpperCase();
    const deviceName = this.normalizeText(mapped?.deviceName).toLowerCase();
    return (
      key.includes('mine') ||
      key.includes('shaxta') ||
      key.includes('shahta') ||
      deviceId.includes('MINE') ||
      deviceName.includes('shaxta') ||
      deviceName.includes('shahta')
    );
  }

  private resolveTargetDeviceEntries(): Array<[string, ReturnType<typeof getEffectiveTurnstileDeviceIpMap>[string]]> {
    const allEntries = Object.entries(getEffectiveTurnstileDeviceIpMap());
    const configuredIps = this.configuredDeviceIps;

    if (configuredIps.length > 0) {
      const configuredSet = new Set(configuredIps);
      const resolved = allEntries.filter(([ip]) => configuredSet.has(ip));
      const missing = configuredIps.filter((ip) => !allEntries.some(([knownIp]) => knownIp === ip));
      if (missing.length > 0) {
        this.logger.warn(`HIKVISION_POLLER_DEVICE_IPS unknown in map: ${missing.join(', ')}`);
      }
      return resolved;
    }

    if (this.mineOnlyMode) {
      return allEntries.filter(([, mapped]) => this.isMineMappedDevice(mapped));
    }

    return allEntries;
  }

  private buildEventKey(deviceIp: string, row: AcsEventRow): string | null {
    const serial = this.normalizeText(row?.serialNo);
    const employeeNo = this.normalizeText(row?.employeeNoString);
    const time = this.normalizeText(row?.time);
    const doorNo = this.normalizeText(row?.doorNo);
    const minor = this.normalizeText(row?.minor);
    const name = this.normalizeText(row?.name).toLowerCase();
    if (serial) return `${deviceIp}|serial:${serial}|time:${time}|door:${doorNo}|minor:${minor}|id:${employeeNo || name}`;
    if (!employeeNo && !name) return null;
    if (!time) return `${deviceIp}|id:${employeeNo || name}|door:${doorNo}`;
    return `${deviceIp}|id:${employeeNo || name}|time:${time}|door:${doorNo}`;
  }

  private hasRecentEventKey(key: string): boolean {
    const expiresAt = this.recentPostedEventKeys.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.recentPostedEventKeys.delete(key);
      return false;
    }
    return true;
  }

  private rememberEventKey(key: string): void {
    this.recentPostedEventKeys.set(key, Date.now() + this.eventKeyTtlMs);
  }

  private cleanupExpiredEventKeys(): void {
    if (this.recentPostedEventKeys.size === 0) return;
    const now = Date.now();
    for (const [key, expiresAt] of this.recentPostedEventKeys.entries()) {
      if (expiresAt <= now) this.recentPostedEventKeys.delete(key);
    }
  }

  private parseRowTimeMs(row: AcsEventRow): number | null {
    const raw = this.normalizeText(row?.time);
    if (!raw) return null;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Hikvision ISAPI poller o‘chiq (HIKVISION_POLLER_ENABLED≠true).');
      return;
    }
    if (!this.password) {
      this.logger.warn('HIKVISION_POLLER_ENABLED=true, lekin HIKVISION_POLLER_PASSWORD bo‘sh — poller ishlamaydi.');
      return;
    }

    const targetEntries = this.resolveTargetDeviceEntries();
    if (targetEntries.length === 0) {
      this.logger.warn('Hikvision ISAPI poller: target qurilmalar topilmadi (xarita/sozlama tekshiring).');
      return;
    }

    this.logger.log(
      `Hikvision ISAPI poller yoqildi: interval=${this.intervalMs}ms, lookback=${this.lookbackMinutes}m, max/device=${this.maxPerDevice}, targets=${targetEntries.map(([ip]) => ip).join(', ')}`,
    );

    this.interval = setInterval(() => {
      void this.runSafe();
    }, this.intervalMs);

    setTimeout(() => {
      void this.runSafe();
    }, 3000);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async runSafe(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runTick();
    } catch (e) {
      this.logger.warn(`Poller tick xatosi: ${String((e as Error)?.message ?? e)}`);
    } finally {
      this.running = false;
    }
  }

  private async runTick(): Promise<void> {
    this.cleanupExpiredEventKeys();
    const end = new Date();
    const start = new Date(end.getTime() - this.lookbackMinutes * 60 * 1000);
    const targetEntries = this.resolveTargetDeviceEntries();
    if (targetEntries.length === 0) return;

    if (!this.importEvents) {
      await Promise.all(targetEntries.map(([ip, mapped]) => this.pushHeartbeatToWebhook(ip, mapped)));
      return;
    }

    const results = await Promise.all(
      targetEntries.map(async ([ip, mapped]) => {
        let posted = 0;
        let dup = 0;
        let skipped = 0;
        let errors = 0;

      try {
        const rows = await fetchLatestAcsEvents({
          deviceIp: ip,
          devicePort: this.devicePort,
          username: this.username,
          password: this.password,
          start,
          end,
          maxResults: this.maxPerDevice,
        });

        if (!this.initializedDeviceIps.has(ip)) {
          this.initializedDeviceAt.set(ip, Date.now());
          for (const row of rows) {
            const eventKey = this.buildEventKey(ip, row);
            if (eventKey) this.rememberEventKey(eventKey);
          }
          this.initializedDeviceIps.add(ip);
          skipped += rows.length;
          await this.pushHeartbeatToWebhook(ip, mapped);
          return { posted, dup, skipped, errors };
        }

        for (const row of rows) {
          const initializedAt = this.initializedDeviceAt.get(ip);
          const rowTimeMs = this.parseRowTimeMs(row);
          if (initializedAt && rowTimeMs != null && rowTimeMs <= initializedAt + this.realtimeWarmupMs) {
            const eventKey = this.buildEventKey(ip, row);
            if (eventKey) this.rememberEventKey(eventKey);
            skipped += 1;
            continue;
          }

          if (rowTimeMs != null) {
            const now = Date.now();
            if (rowTimeMs < now - this.maxEventAgeMs || rowTimeMs > now + 2 * 60 * 1000) {
              const eventKey = this.buildEventKey(ip, row);
              if (eventKey) this.rememberEventKey(eventKey);
              skipped += 1;
              continue;
            }
          }

          if (!this.recordAllEvents) {
            const minor = Number.parseInt(String(row?.minor ?? ''), 10);
            if (!Number.isFinite(minor) || minor !== 75) {
              skipped += 1;
              continue;
            }
          }

          const eventKey = this.buildEventKey(ip, row);
          if (eventKey && this.hasRecentEventKey(eventKey)) {
            skipped += 1;
            continue;
          }

          const r = await this.pushToWebhook(ip, row);
          if (r === 'posted') posted += 1;
          else if (r === 'duplicate') dup += 1;
          else if (r === 'ignored') skipped += 1;
          else errors += 1;

          // Whether posted or identified as duplicate by webhook handler, do not replay this raw event again.
          if (eventKey && (r === 'posted' || r === 'duplicate' || r === 'ignored')) {
            this.rememberEventKey(eventKey);
          }
        }

        // Qurilma tirikligini pass hodisasi bo'lmasa ham status jadvalida ushlab turamiz.
        // Webhook bu payloadni `no_identity_fields` bilan rad etadi, lekin heartbeat yangilanadi.
        await this.pushHeartbeatToWebhook(ip, mapped);
      } catch {
        errors += 1;
      }

        return { posted, dup, skipped, errors };
      }),
    );

    const totals = results.reduce(
      (acc, item) => ({
        posted: acc.posted + item.posted,
        dup: acc.dup + item.dup,
        skipped: acc.skipped + item.skipped,
        errors: acc.errors + item.errors,
      }),
      { posted: 0, dup: 0, skipped: 0, errors: 0 },
    );

    if (totals.posted || totals.dup || totals.errors) {
      this.logger.debug(
        `Poller: posted=${totals.posted} duplicate=${totals.dup} skipped=${totals.skipped} errors=${totals.errors}`,
      );
    }
  }

  private async pushToWebhook(
    sourceIp: string,
    row: AcsEventRow,
  ): Promise<'posted' | 'duplicate' | 'ignored' | 'error'> {
    const port = this.listenPort;
    const qs = new URLSearchParams({
      response: 'json',
    });
    const url = `http://localhost:${port}/integrations/hikvision/webhook?${qs.toString()}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-smartroute-sync': '1',
    };
    const token = (process.env.HIKVISION_WEBHOOK_TOKEN ?? '').trim();
    if (token) {
      headers['x-webhook-token'] = token;
    }

    const payload = {
      eventType: 'AccessControllerEvent',
      employeeNo: row.employeeNoString ?? '',
      employeeName: row.name ?? '',
      personName: row.name ?? '',
      dateTime: row.time ?? '',
      serialNo: row.serialNo ?? '',
      cardNo: row.cardNo ?? '',
      doorNo: row.doorNo ?? '',
      minor: row.minor ?? 75,
      ipAddress: sourceIp,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = null;
      }

      if (!res.ok) {
        this.logger.warn(`Webhook self-POST ${res.status} for ${sourceIp}: ${text.slice(0, 200)}`);
        return 'error';
      }

      if (json?.duplicate === true) return 'duplicate';
      if (json?.ignored === true) return 'ignored';
      if (json?.ok === true) return 'posted';
      return 'error';
    } catch (e) {
      this.logger.warn(`Webhook self-POST tarmoq xatosi (${sourceIp}): ${String((e as Error)?.message ?? e)}`);
      return 'error';
    }
  }

  private async pushHeartbeatToWebhook(
    sourceIp: string,
    mapped: ReturnType<typeof getEffectiveTurnstileDeviceIpMap>[string],
  ): Promise<boolean> {
    const port = this.listenPort;
    const qs = new URLSearchParams({
      response: 'json',
    });
    const url = `http://localhost:${port}/integrations/hikvision/webhook?${qs.toString()}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-smartroute-sync': '1',
    };
    const token = (process.env.HIKVISION_WEBHOOK_TOKEN ?? '').trim();
    if (token) {
      headers['x-webhook-token'] = token;
    }

    const heartbeatSerial = `poll-heartbeat-${sourceIp}-${Date.now()}`;
    const payload = {
      eventType: 'AccessControllerEvent',
      dateTime: new Date().toISOString(),
      serialNo: heartbeatSerial,
      minor: 75,
      ipAddress: sourceIp,
      deviceId: mapped?.deviceId ?? '',
      deviceName: mapped?.deviceName ?? '',
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) return false;
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = null;
      }
      return json?.ok === true || json?.ignored === true;
    } catch {
      return false;
    }
  }
}
