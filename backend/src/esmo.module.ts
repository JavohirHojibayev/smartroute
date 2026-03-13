import { Controller, Get, Logger, Module, Post, Query } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { URL } from 'url';
import { load } from 'cheerio';

import { Driver } from './driver.entity';
import { CheckStatus, MedicalCheck } from './medical.entity';

type EsmoTerminalConfig = {
  name: string;
  host: string;
  model: string;
  serial: string;
  apiKey: string;
};

type EsmoExamRow = {
  esmoId: number;
  timestamp: string;
  terminalRaw: string;
  employeeName: string;
  employeePassId: string | null;
  result: string | null;
  pressureSystolic: number | null;
  pressureDiastolic: number | null;
  pulse: number | null;
  temperature: number | null;
  alcoholTestResult: number | null;
  alcoholDetected: boolean | null;
};

type EsmoTerminalStateRow = {
  name: string;
  host: string;
  serial: string;
  statusText: string;
  isReady: boolean;
};

const SMARTROUTE_ESMO_TERMINALS: EsmoTerminalConfig[] = [
  {
    name: 'ATX 1-terminal',
    host: '192.168.8.11',
    model: 'MT-02',
    serial: 'SN020245000',
    apiKey: 'e2df608d3e5aba9372e88217f24bd9ba',
  },
  {
    name: 'ATX 2-terminal',
    host: '192.168.8.12',
    model: 'MT-02',
    serial: 'SN020245005',
    apiKey: 'a6e74ff12cd121490a6d03eacdb82eea',
  },
];

const TERMINAL_BY_NUM: Record<string, EsmoTerminalConfig> = {
  '1': SMARTROUTE_ESMO_TERMINALS[0],
  '2': SMARTROUTE_ESMO_TERMINALS[1],
};

class EsmoPortalClient {
  public lastError: string | null = null;

  private readonly logger = new Logger(EsmoPortalClient.name);
  private readonly cookieJar = new Map<string, string>();
  private readonly examDetailCache = new Map<number, Partial<EsmoExamRow>>();
  private isLoggedIn = false;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly timeoutMs: number,
    private readonly loginRetries: number,
  ) {}

  private normalizeWhitespace(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  private storeCookies(rawSetCookie: string[] | string | undefined): void {
    if (!rawSetCookie) return;
    const list = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie];
    for (const row of list) {
      const [first] = String(row).split(';');
      const [key, ...rest] = first.split('=');
      const name = key.trim();
      if (!name) continue;
      const value = rest.join('=').trim();
      this.cookieJar.set(name, value);
    }
  }

  private buildCookieHeader(): string {
    if (this.cookieJar.size === 0) return '';
    return Array.from(this.cookieJar.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  private decodeBody(chunks: Buffer[], contentEncoding: string | undefined): string {
    const buffer = Buffer.concat(chunks);
    if (!contentEncoding) return buffer.toString('utf8');

    try {
      const enc = contentEncoding.toLowerCase();
      if (enc.includes('gzip')) return zlib.gunzipSync(buffer).toString('utf8');
      if (enc.includes('deflate')) return zlib.inflateSync(buffer).toString('utf8');
      if (enc.includes('br')) return zlib.brotliDecompressSync(buffer).toString('utf8');
      return buffer.toString('utf8');
    } catch {
      return buffer.toString('utf8');
    }
  }

  private async request(
    pathOrUrl: string,
    method: 'GET' | 'POST' = 'GET',
    formData?: Record<string, string>,
  ): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    const url = pathOrUrl.startsWith('http') ? new URL(pathOrUrl) : new URL(pathOrUrl, this.baseUrl);
    const isHttps = url.protocol === 'https:';
    const formBody = formData ? new URLSearchParams(formData).toString() : '';

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: `${this.baseUrl}personal/`,
      Origin: `${url.protocol}//${url.host}`,
    };

    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) headers.Cookie = cookieHeader;

    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      headers['Content-Length'] = Buffer.byteLength(formBody).toString();
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    const requestOptions: https.RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : isHttps ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method,
      headers,
      timeout: this.timeoutMs,
      rejectUnauthorized: false,
    };

    return new Promise((resolve, reject) => {
      const transport = isHttps ? https : http;
      const req = transport.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          this.storeCookies(res.headers['set-cookie']);
          const body = this.decodeBody(chunks, String(res.headers['content-encoding'] || ''));
          resolve({ status: res.statusCode || 0, body, headers: res.headers });
        });
      });

      req.on('timeout', () => req.destroy(new Error(`ESMO request timeout: ${method} ${url.toString()}`)));
      req.on('error', reject);

      if (formBody) req.write(formBody);
      req.end();
    });
  }

  private looksAuthenticated(html: string): boolean {
    const text = html.toLowerCase();
    if (text.includes("name='user_login'") || text.includes('name="user_login"')) return false;
    if (text.includes("name='user_pass'") || text.includes('name="user_pass"')) return false;
    return true;
  }

  private async sessionIsAuthenticated(): Promise<boolean> {
    try {
      const res = await this.request(`${this.baseUrl}personal/`);
      return res.status >= 200 && res.status < 400 && this.looksAuthenticated(res.body);
    } catch (error) {
      this.lastError = `ESMO session check failed: ${String(error)}`;
      this.logger.warn(this.lastError);
      return false;
    }
  }

  private async loginOnce(): Promise<boolean> {
    try {
      await this.request(`${this.baseUrl}personal/`);

      await this.request(`${this.baseUrl}ajax.php?cmd=account/account_login`, 'POST', {
        user_login: this.username,
        user_pass: this.password,
        remember: '1',
        cmd: 'account/account_login',
      });

      if (await this.sessionIsAuthenticated()) {
        this.isLoggedIn = true;
        this.lastError = null;
        return true;
      }

      await this.request(`${this.baseUrl}personal/`, 'POST', {
        user_login: this.username,
        user_pass: this.password,
        cmd: 'account/account_login',
      });

      if (await this.sessionIsAuthenticated()) {
        this.isLoggedIn = true;
        this.lastError = null;
        return true;
      }

      this.lastError = 'ESMO login failed (credentials or auth flow mismatch)';
      return false;
    } catch (error) {
      this.lastError = `ESMO login request failed: ${String(error)}`;
      return false;
    }
  }

  async login(): Promise<boolean> {
    this.isLoggedIn = false;
    this.lastError = null;

    for (let attempt = 1; attempt <= this.loginRetries; attempt += 1) {
      if (await this.loginOnce()) return true;
    }

    return false;
  }

  private extractTotalPages(html: string): number {
    const $ = load(html);
    const pages = new Set<number>();

    $('div.list_pages a[href]').each((_idx, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/page_(\d+)\.html/i);
      if (match) {
        pages.add(Number(match[1]));
      }
    });

    return Math.max(1, ...Array.from(pages.values()));
  }

  private parseEsmoId(idAttr: string, rowText: string, moHref?: string | null): number | null {
    if (moHref) {
      const hrefMatch = String(moHref).match(/\/mo\/(\d+)\//i);
      if (hrefMatch) return Number(hrefMatch[1]);
    }

    const attrMatch = idAttr.match(/(\d+)$/);
    if (attrMatch) return Number(attrMatch[1]);

    const textMatch = rowText.match(/\b(\d{5,10})\b/);
    if (textMatch) return Number(textMatch[1]);

    return null;
  }

  private parseTimestamp(text: string): string {
    const match = text.match(/\b\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}(?::\d{2})?\b/);
    return match ? match[0] : '';
  }

  private parseVitals(text: string): {
    pressureSystolic: number | null;
    pressureDiastolic: number | null;
    pulse: number | null;
    temperature: number | null;
    alcoholTestResult: number | null;
    alcoholDetected: boolean | null;
  } {
    const src = this.normalizeWhitespace(text).replace(/,/g, '.');

    let pressureSystolic: number | null = null;
    let pressureDiastolic: number | null = null;
    let pulse: number | null = null;
    let temperature: number | null = null;
    let alcoholTestResult: number | null = null;
    let alcoholDetected: boolean | null = null;

    const pressureMatch = src.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
    if (pressureMatch) {
      pressureSystolic = Number(pressureMatch[1]);
      pressureDiastolic = Number(pressureMatch[2]);
    }

    const pulseMatch = src.match(/(?:пульс|РїСѓР»СЊСЃ|pulse|puls)[^\d]{0,20}(\d{2,3})\b/i);
    if (pulseMatch) {
      pulse = Number(pulseMatch[1]);
    } else {
      const candidates = (src.match(/\b\d{2,3}\b/g) || []).map((v) => Number(v));
      for (const candidate of candidates) {
        if (candidate >= 40 && candidate <= 200) {
          if (candidate !== pressureSystolic && candidate !== pressureDiastolic) {
            pulse = candidate;
            break;
          }
        }
      }
    }

    const tempMatch = src.match(/(?:температур\S*|С‚РµРјРїРµСЂР°С‚СѓСЂ\S*|temperature|temp|harorat)[^\d]{0,20}(\d{2}(?:\.\d)?)\b/i)
      || src.match(/\b(3\d(?:\.\d)?)\b/);
    if (tempMatch) {
      temperature = Number(tempMatch[1]);
    }

    const alcoholMatch = src.match(/(?:алког|Р°Р»РєРѕРі|alcohol|alkogol|bac|этанол|СЌС‚Р°РЅРѕР»|ethanol)[^\d]{0,20}(\d+(?:\.\d+)?)/i)
      || src.match(/\b(\d+(?:\.\d+)?)\s*(?:mg\/l|мг\/л|РјРі\/Р»|‰|вЂ°|%|bac)\b/i);
    if (alcoholMatch) {
      alcoholTestResult = Number(alcoholMatch[1]);
      alcoholDetected = alcoholTestResult > 0;
    } else {
      const detectedFromText = this.parseAlcoholDetected(src);
      if (detectedFromText != null) {
        alcoholDetected = detectedFromText;
        alcoholTestResult = detectedFromText ? 1 : 0;
      }
    }

    return {
      pressureSystolic,
      pressureDiastolic,
      pulse,
      temperature,
      alcoholTestResult,
      alcoholDetected,
    };
  }

  private parseAlcoholDetected(value: unknown): boolean | null {
    const text = this.normalizeWhitespace(value).toLowerCase();
    if (!text) return null;

    if (/(^|[^A-Za-zА-Яа-яЁё0-9])(да|ha|yes|обнаруж(?:ен|ено|ены)?|aniqlandi|РґР°)($|[^A-Za-zА-Яа-яЁё0-9])/i.test(text)) {
      return true;
    }

    if (/(^|[^A-Za-zА-Яа-яЁё0-9])(нет|yo'?q|yoq|no|aniqlanmadi|отсут(?:ствует)?|РЅРµС‚)($|[^A-Za-zА-Яа-яЁё0-9])/i.test(text)) {
      return false;
    }

    return null;
  }

  private parseEmployeeIdFromDetail(rawHtml: string, text: string): string | null {
    const passMatch = this.normalizeWhitespace(text).match(/(?:РїСЂРѕРїСѓСЃРє|pass|badge)[^\d]{0,20}(\d{1,10})/i);
    if (passMatch?.[1]) return passMatch[1];

    const hrefMatch = String(rawHtml || '').match(/\/cab\/personal\/person\/(\d+)\//i);
    if (hrefMatch?.[1]) return hrefMatch[1];

    const tabNoMatch = this.normalizeWhitespace(text).match(/(?:С‚Р°Р±РµР»СЊРЅ\S*|employee\s*id|id\s*СЃРѕС‚СЂСѓРґРЅРёРє\S*)[^\d]{0,20}(\d{3,10})/i);
    if (tabNoMatch?.[1]) return tabNoMatch[1];

    return null;
  }

  private detectResult(
    rowText: string,
    commentText: string,
    admittanceText: string,
    admittanceClasses: string,
  ): string | null {
    const blob = this.normalizeWhitespace(`${rowText} ${commentText} ${admittanceText} ${admittanceClasses}`).toLowerCase();
    const limitedBlob = this.normalizeWhitespace(`${commentText} ${admittanceText} ${admittanceClasses}`).toLowerCase();

    if (/(Р°РЅРЅСѓР»РёСЂ|annulled|РѕС‚РјРµРЅРµРЅ РјРѕ|РѕС‚РјРµРЅР° РјРѕ)/i.test(limitedBlob)) return 'annulled';
    if (/(СЂСѓС‡РЅР°СЏ РїСЂРѕРІРµСЂРєР°|manual check|manual review|review|ko'rik|korik)/i.test(blob)) return 'review';

    const positive = /(РѕСЃРјРѕС‚СЂ РѕРєРѕРЅС‡РµРЅ, РїРѕР»РѕР¶|РґРѕРїСѓСЃРє СЂР°Р·СЂРµС€|РґРѕРїСѓСЃРє СЂР°Р·СЂРµС€С‘РЅ|dopusk_1|dopusk_state_1)/i.test(blob);
    const negative = /(РЅРµРґРѕРїСѓСЃРє|РґРѕРїСѓСЃРє Р·Р°РїСЂРµС‰|РЅРµ РґРѕРїСѓС‰|РѕСЃРјРѕС‚СЂ РЅРµ РїСЂРѕР№РґРµРЅ|dopusk_0|dopusk_state_0|РѕС‚РєР°Р·|РѕС‚РєР»РѕРЅ)/i.test(blob);

    if (positive && !negative) return 'passed';
    if (negative && !positive) return 'failed';
    if (/dopusk_1|dopusk_state_1/i.test(admittanceClasses)) return 'passed';
    if (/dopusk_0|dopusk_state_0/i.test(admittanceClasses)) return 'failed';

    return null;
  }

  async fetchExamDetail(esmoId: number): Promise<Partial<EsmoExamRow>> {
    const cached = this.examDetailCache.get(esmoId);
    if (cached) return cached;

    const detail: Partial<EsmoExamRow> = {
      terminalRaw: '',
      result: null,
      employeeName: '',
      employeePassId: null,
      timestamp: '',
      pressureSystolic: null,
      pressureDiastolic: null,
      pulse: null,
      temperature: null,
      alcoholTestResult: null,
      alcoholDetected: null,
    };

    try {
      const res = await this.request(`${this.baseUrl}mo/${esmoId}/`);
      if (res.status < 200 || res.status >= 400) {
        this.examDetailCache.set(esmoId, detail);
        return detail;
      }

      const $ = load(res.body);
      const text = this.normalizeWhitespace($.root().text());

      const h1Title = this.normalizeWhitespace($('#page_title h1').first().text());
      const nameFromTitle = h1Title.replace(/^РїСЂРѕРІРµСЂРєР° СЃРѕС‚СЂСѓРґРЅРёРєР°\s*/i, '').trim();
      if (nameFromTitle) {
        detail.employeeName = nameFromTitle;
      }

      detail.employeePassId = this.parseEmployeeIdFromDetail(res.body, text);

      const extractFirstNumber = (value: string): number | null => {
        const match = value.replace(/,/g, '.').match(/(\d+(?:\.\d+)?)/);
        if (!match) return null;
        const parsed = Number(match[1]);
        return Number.isFinite(parsed) ? parsed : null;
      };

      let resultFromCard: string | null = null;
      const infoTable = $('table.info[reffer]').first();
      const infoRows: Array<{ label: string; value: string }> = [];
      if (infoTable.length > 0) {
        infoTable.find('tr').each((_idx, tr) => {
          const cells = $(tr).find('td');
          if (cells.length < 2) return;

          const label = this.normalizeWhitespace(cells.eq(0).text());
          const value = this.normalizeWhitespace(cells.eq(1).text());
          infoRows.push({ label, value });
          const labelLower = label.toLowerCase();
          const combined = this.normalizeWhitespace(`${label} ${value}`);

          if (!detail.timestamp) {
            const timeMatch = combined.match(/\b\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}(?::\d{2})?\b/);
            if (timeMatch) detail.timestamp = timeMatch[0];
          }

          if (/систол|СЃРёСЃС‚РѕР»|systolic/i.test(labelLower)) {
            detail.pressureSystolic = extractFirstNumber(value);
          } else if (/диастол|РґРёР°СЃС‚РѕР»|diastolic/i.test(labelLower)) {
            detail.pressureDiastolic = extractFirstNumber(value);
          } else if (/артериал|давлен|blood pressure|qon bosim|pressure|Р°СЂС‚РµСЂ|РґР°РІР»РµРЅ/i.test(labelLower)) {
            const bpMatch = value.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/) || combined.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
            if (bpMatch) {
              detail.pressureSystolic = Number(bpMatch[1]);
              detail.pressureDiastolic = Number(bpMatch[2]);
            }
          } else if (/пульс|РїСѓР»СЊСЃ|pulse|puls/i.test(labelLower)) {
            detail.pulse = extractFirstNumber(value);
          } else if (/температур|С‚РµРјРїРµСЂР°С‚СѓСЂ|temperature|temp|harorat/i.test(labelLower)) {
            detail.temperature = extractFirstNumber(value);
          } else if (/алког|Р°Р»РєРѕРі|alcohol|alkogol|ethanol|bac/i.test(labelLower)) {
            const detectedFromText = this.parseAlcoholDetected(value);
            if (detectedFromText != null) {
              detail.alcoholDetected = detectedFromText;
            }
            const alcoholNumber = extractFirstNumber(value);
            if (alcoholNumber != null) {
              detail.alcoholTestResult = alcoholNumber;
              if (detail.alcoholDetected == null) {
                detail.alcoholDetected = alcoholNumber > 0;
              }
            } else if (detectedFromText != null) {
              detail.alcoholTestResult = detectedFromText ? 1 : 0;
            }
          } else if (/РїСЂРѕРІРµСЂРєР° РЅР° С‚РµСЂРјРёРЅР°Р»Рµ|terminal/i.test(labelLower)) {
            const terminalMatch = combined.match(/\b(?:ATX|TKM)\s*\d+\s*-\s*terminal(?:\s*\[\d+\])?/i)
              || combined.match(/\bterminal\s*\[\d{1,3}\]/i);
            if (terminalMatch) {
              detail.terminalRaw = terminalMatch[0];
            }

            const resultBlob = combined.toLowerCase();
            if (/(РѕСЃРјРѕС‚СЂ РѕРєРѕРЅС‡РµРЅ,\s*РїРѕР»РѕР¶|РґРѕРїСѓСЃРє СЂР°Р·СЂРµС€)/i.test(resultBlob)) {
              resultFromCard = 'passed';
            } else if (/(РЅРµРґРѕРїСѓСЃРє|РґРѕРїСѓСЃРє Р·Р°РїСЂРµС‰|РЅРµ РґРѕРїСѓС‰|РѕСЃРјРѕС‚СЂ РЅРµ РїСЂРѕР№РґРµРЅ|РѕС‚РєР°Р·|РѕС‚РєР»РѕРЅ)/i.test(resultBlob)) {
              resultFromCard = 'failed';
            } else if (/(СЂСѓС‡РЅ|review|ko'rik|korik)/i.test(resultBlob)) {
              resultFromCard = 'review';
            }
          }
        });
      }

      // Secondary pass on table rows without fixed indexes.
      for (const row of infoRows) {
        const labelLower = this.normalizeWhitespace(row.label).toLowerCase();
        const value = this.normalizeWhitespace(row.value);

        if (detail.pressureSystolic == null || detail.pressureDiastolic == null) {
          const bpMatch = value.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
          if (bpMatch) {
            const systolic = Number(bpMatch[1]);
            const diastolic = Number(bpMatch[2]);
            if (systolic >= 70 && systolic <= 260 && diastolic >= 40 && diastolic <= 180) {
              detail.pressureSystolic = systolic;
              detail.pressureDiastolic = diastolic;
            }
          }
        }

        if (detail.pulse == null && /пульс|РїСѓР»СЊСЃ|pulse|puls/i.test(labelLower)) {
          const parsedPulse = extractFirstNumber(value);
          if (parsedPulse != null && parsedPulse >= 30 && parsedPulse <= 220) {
            detail.pulse = parsedPulse;
          }
        }

        if (detail.temperature == null && /температур|С‚РµРјРїРµСЂР°С‚СѓСЂ|temperature|temp|harorat/i.test(labelLower)) {
          const parsedTemperature = extractFirstNumber(value);
          if (parsedTemperature != null && parsedTemperature >= 25 && parsedTemperature <= 45) {
            detail.temperature = parsedTemperature;
          }
        }

        if ((detail.alcoholTestResult == null || detail.alcoholDetected == null)
          && /алког|Р°Р»РєРѕРі|alcohol|alkogol|ethanol|bac/i.test(labelLower)) {
          const detectedFromText = this.parseAlcoholDetected(value);
          if (detectedFromText != null) {
            detail.alcoholDetected = detectedFromText;
            if (detail.alcoholTestResult == null) {
              detail.alcoholTestResult = detectedFromText ? 1 : 0;
            }
          }

          if (detail.alcoholTestResult == null) {
            const parsedAlcohol = extractFirstNumber(value);
            if (parsedAlcohol != null) {
              detail.alcoholTestResult = parsedAlcohol;
              if (detail.alcoholDetected == null) {
                detail.alcoholDetected = parsedAlcohol > 0;
              }
            }
          }
        }
      }
      if (!detail.terminalRaw) {
        const terminalFallbackBlob = this.normalizeWhitespace(`${infoRows[15]?.label || ''} ${infoRows[15]?.value || ''}`);
        const terminalFallbackMatch = terminalFallbackBlob.match(/\b(?:ATX|TKM)\s*\d+\s*-\s*terminal(?:\s*\[\d+\])?/i)
          || terminalFallbackBlob.match(/\bterminal\s*\[\d{1,3}\]/i);
        if (terminalFallbackMatch) detail.terminalRaw = terminalFallbackMatch[0];
      }

      if (!detail.terminalRaw) {
        const terminalMatch = text.match(/\b(?:ATX|TKM)\s*\d+\s*-\s*terminal(?:\s*\[\d+\])?/i)
          || text.match(/\bterminal\s*\[\d{1,3}\]/i);
        if (terminalMatch) detail.terminalRaw = terminalMatch[0];
      }

      const cardButtons = $('#card_mo_buttons');
      if (cardButtons.find('.dopusk_state_1, .dopusk_1').length > 0) {
        detail.result = 'passed';
      } else if (cardButtons.find('.dopusk_state_0, .dopusk_0').length > 0) {
        detail.result = 'failed';
      } else if (resultFromCard) {
        detail.result = resultFromCard;
      } else {
        detail.result = this.detectResult(
          text,
          this.normalizeWhitespace($('div.dopusk_comment, td.comment').text()),
          this.normalizeWhitespace($('div.mo_status_2, td.admittance').text()),
          this.normalizeWhitespace($('div.dopusk_state_1, div.dopusk_state_0, td.dopusk_1, td.dopusk_0').attr('class') || ''),
        );
      }

      const fallbackVitals = this.parseVitals(text);
      if (detail.pressureSystolic == null) detail.pressureSystolic = fallbackVitals.pressureSystolic;
      if (detail.pressureDiastolic == null) detail.pressureDiastolic = fallbackVitals.pressureDiastolic;
      if (detail.pulse == null) detail.pulse = fallbackVitals.pulse;
      if (detail.temperature == null) detail.temperature = fallbackVitals.temperature;
      if (detail.alcoholTestResult == null) detail.alcoholTestResult = fallbackVitals.alcoholTestResult;
      if (detail.alcoholDetected == null) detail.alcoholDetected = fallbackVitals.alcoholDetected;
      if (detail.alcoholDetected == null && detail.alcoholTestResult != null) {
        detail.alcoholDetected = detail.alcoholTestResult > 0;
      }
    } catch (error) {
      this.logger.debug(`ESMO detail fetch failed for ${esmoId}: ${String(error)}`);
    }

    this.examDetailCache.set(esmoId, detail);
    return detail;
  }

  private parseExamRows(html: string): EsmoExamRow[] {
    const $ = load(html);
    const output: EsmoExamRow[] = [];

    $('tr.item, tr[class*="item"], table tbody tr').each((_idx, rowEl) => {
      const row = $(rowEl);
      const rowText = this.normalizeWhitespace(row.text());
      const cells = row.find('td');
      if (cells.length < 4) return;

      const moHref = row.find('a[href*="/mo/"]').first().attr('href') || null;
      const esmoId = this.parseEsmoId(String(row.attr('id') || ''), rowText, moHref);
      if (!esmoId) return;

      const timestamp = this.parseTimestamp(rowText);

      let terminalRaw = this.normalizeWhitespace(row.find('td.terminal').first().text());
      if (!terminalRaw && cells.length >= 4) {
        terminalRaw = this.normalizeWhitespace(cells.eq(3).text());
      }

      let employeeName = this.normalizeWhitespace(row.find('td.name a').first().text());
      let employeeBlock = this.normalizeWhitespace(row.find('td.name').first().text());
      if (!employeeBlock && cells.length >= 5) {
        employeeBlock = this.normalizeWhitespace(cells.eq(4).text());
      }
      if (!employeeName) {
        employeeName = employeeBlock;
      }

      const passMatches = employeeBlock.match(/\b\d{3,10}\b/g) || [];
      const employeePassId = passMatches.length > 0 ? passMatches[passMatches.length - 1] : null;

      const commentText = this.normalizeWhitespace(row.find('td.comment').text());
      const admittanceCell = row.find('td.admittance').first();
      const admittanceText = this.normalizeWhitespace(admittanceCell.text());
      const admittanceClasses = this.normalizeWhitespace(admittanceCell.attr('class') || '');
      const result = this.detectResult(rowText, commentText, admittanceText, admittanceClasses);

      output.push({
        esmoId,
        timestamp,
        terminalRaw,
        employeeName,
        employeePassId,
        result,
        pressureSystolic: null,
        pressureDiastolic: null,
        pulse: null,
        temperature: null,
        alcoholTestResult: null,
        alcoholDetected: null,
      });
    });

    return output;
  }

  private mergeExam(base: EsmoExamRow, detail: Partial<EsmoExamRow>): EsmoExamRow {
    return {
      ...base,
      timestamp: base.timestamp || detail.timestamp || '',
      terminalRaw: detail.terminalRaw || base.terminalRaw || '',
      employeeName: detail.employeeName || base.employeeName || '',
      employeePassId: detail.employeePassId || base.employeePassId || null,
      result: detail.result || base.result || null,
      pressureSystolic: detail.pressureSystolic ?? base.pressureSystolic ?? null,
      pressureDiastolic: detail.pressureDiastolic ?? base.pressureDiastolic ?? null,
      pulse: detail.pulse ?? base.pulse ?? null,
      temperature: detail.temperature ?? base.temperature ?? null,
      alcoholTestResult: detail.alcoholTestResult ?? base.alcoholTestResult ?? null,
      alcoholDetected: detail.alcoholDetected ?? base.alcoholDetected ?? null,
    };
  }

  private shouldFetchDetail(row: EsmoExamRow): boolean {
    const terminalHint = this.normalizeWhitespace(row.terminalRaw).replace(/^0+/, '');
    const atxCandidate = /^(1|2)$/.test(terminalHint) || /\batx\s*[12]\b/i.test(terminalHint);

    // Skip expensive detail requests for non-SmartRoute terminals.
    if (terminalHint && !atxCandidate) {
      return false;
    }

    if (!row.result) return true;
    if (!row.terminalRaw) return true;
    if (!row.employeeName) return true;
    if (!row.employeePassId) return true;
    if (this.normalizeWhitespace(row.employeePassId) === '30000') return true;
    if (row.pressureSystolic == null || row.pressureDiastolic == null) return true;
    if (row.pulse == null) return true;

    return false;
  }

  async fetchExamsSince(sinceEsmoId: number | null, maxPages: number): Promise<EsmoExamRow[]> {
    if (!this.isLoggedIn && !(await this.login())) {
      return [];
    }

    const sources = [
      {
        firstCandidates: [
          `${this.baseUrl}pp/journal/`,
          `${this.baseUrl}pp/journal/page_1.html`,
        ],
        pageUrl: (pageNo: number) => `${this.baseUrl}pp/journal/page_${pageNo}.html`,
      },
      {
        firstCandidates: [
          `${this.baseUrl}esmo_setting/mo/`,
          `${this.baseUrl}esmo_setting/mo/page_1.html`,
        ],
        pageUrl: (pageNo: number) => `${this.baseUrl}esmo_setting/mo/page_${pageNo}.html`,
      },
      {
        firstCandidates: [
          `${this.baseUrl}mo/`,
          `${this.baseUrl}mo/page_1.html`,
        ],
        pageUrl: (pageNo: number) => `${this.baseUrl}mo/page_${pageNo}.html`,
      },
    ];

    let firstHtml = '';
    let pageUrlBuilder: ((pageNo: number) => string) | null = null;
    let firstPageRows: EsmoExamRow[] = [];

    for (const source of sources) {
      for (const url of source.firstCandidates) {
        try {
          const response = await this.request(url);
          if (response.status < 200 || response.status >= 400 || !response.body.includes('<tr')) {
            continue;
          }

          const parsedRows = this.parseExamRows(response.body);
          if (parsedRows.length > 0) {
            firstHtml = response.body;
            firstPageRows = parsedRows;
            pageUrlBuilder = source.pageUrl;
            break;
          }
        } catch (error) {
          this.logger.debug(`ESMO journal fetch failed for ${url}: ${String(error)}`);
        }
      }
      if (firstHtml && pageUrlBuilder) break;
    }

    if (!firstHtml || !pageUrlBuilder) {
      this.lastError = 'ESMO journal is unavailable or no rows detected';
      return [];
    }

    const totalPages = this.extractTotalPages(firstHtml);
    const pagesToFetch = Math.max(1, Math.min(maxPages, totalPages));

    const seen = new Set<number>();
    const rows: EsmoExamRow[] = [];
    let reachedKnown = false;

    for (let pageNo = 1; pageNo <= pagesToFetch; pageNo += 1) {
      if (reachedKnown) break;

      let html = '';
      let pageRows: EsmoExamRow[] = [];
      if (pageNo === 1) {
        html = firstHtml;
        pageRows = firstPageRows;
      } else {
        try {
          const pageRes = await this.request(pageUrlBuilder(pageNo));
          if (pageRes.status >= 200 && pageRes.status < 400) {
            html = pageRes.body;
            pageRows = this.parseExamRows(html);
          }
        } catch (error) {
          this.logger.debug(`ESMO journal page_${pageNo} error: ${String(error)}`);
          continue;
        }
      }

      if (pageNo !== 1 && pageRows.length === 0 && html) {
        pageRows = this.parseExamRows(html);
      }
      for (const row of pageRows) {
        if (sinceEsmoId !== null && row.esmoId <= sinceEsmoId) {
          reachedKnown = true;
          break;
        }
        if (seen.has(row.esmoId)) continue;
        seen.add(row.esmoId);

        const needsDetail = this.shouldFetchDetail(row);
        if (needsDetail) {
          const detail = await this.fetchExamDetail(row.esmoId);
          rows.push(this.mergeExam(row, detail));
        } else {
          rows.push(row);
        }
      }
    }

    this.lastError = null;
    return rows;
  }

  private parseTerminalStates(html: string): EsmoTerminalStateRow[] {
    const $ = load(html);
    const table = $('#list_terminals').first();
    if (!table.length) return [];

    const rows: EsmoTerminalStateRow[] = [];
    table.find('tr.term_tr').each((_idx, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 8) return;

      const nameCell = cells.eq(2);
      const ipCell = cells.eq(3);
      const serialCell = cells.eq(5);
      const stateCell = cells.eq(7);

      const nameFromAnchor = this.normalizeWhitespace(nameCell.find('a').first().text());
      const nameFromCell = this.normalizeWhitespace(nameCell.text());
      const name = nameFromAnchor || nameFromCell;

      const host = (this.normalizeWhitespace(ipCell.text()).match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/) || [])[0] || '';
      const serial = this.normalizeWhitespace(serialCell.text());

      const statusText = this.normalizeWhitespace(stateCell.text());
      const statusLower = statusText.toLowerCase();
      const hasGreenState = stateCell.find('span.green').length > 0;
      const hasRedState = stateCell.find('span.red').length > 0;
      const isReadyByText = /готов\s+к\s+работе/i.test(statusLower);
      const isReady = isReadyByText || (hasGreenState && !hasRedState);

      if (!name && !host && !serial) return;
      rows.push({ name, host, serial, statusText, isReady });
    });

    return rows;
  }

  async fetchTerminalStates(): Promise<EsmoTerminalStateRow[]> {
    if (!this.isLoggedIn && !(await this.login())) {
      return [];
    }

    const urls = [
      `${this.baseUrl}esmo_setting/terminal/`,
      `${this.baseUrl}esmo_setting/terminal/page_1.html`,
      `${this.baseUrl}rmv/terminals/`,
    ];

    for (const url of urls) {
      try {
        let res = await this.request(url);

        // Session could expire; retry once after relogin.
        if (!this.looksAuthenticated(res.body)) {
          this.isLoggedIn = false;
          if (await this.login()) {
            res = await this.request(url);
          }
        }

        if (res.status < 200 || res.status >= 400) continue;
        if (!res.body.includes('list_terminals') && !res.body.includes('term_tr')) continue;

        const parsed = this.parseTerminalStates(res.body);
        if (parsed.length > 0) {
          this.lastError = null;
          return parsed;
        }
      } catch (error) {
        this.logger.debug(`ESMO terminal status fetch failed for ${url}: ${String(error)}`);
      }
    }

    this.lastError = this.lastError || 'ESMO terminal status is unavailable';
    return [];
  }
}

@Controller('integrations/esmo')
export class EsmoController {
  private readonly logger = new Logger(EsmoController.name);
  private syncInFlight: Promise<any> | null = null;
  private lastSyncAt = 0;

  private readonly esmoEnabled = String(process.env.ESMO_ENABLED ?? 'true').toLowerCase() !== 'false';
  private readonly esmoBaseUrl = String(process.env.ESMO_BASE_URL || 'https://192.168.8.10/cab/')
    .replace(/\s+/g, '')
    .replace(/\/+$/, '') + '/';
  private readonly esmoUser = String(process.env.ESMO_USER || 'admin').trim();
  private readonly esmoPass = String(process.env.ESMO_PASS || 'change_me').trim();
  private readonly esmoTimeoutMs = Math.max(Number.parseInt(process.env.ESMO_REQUEST_TIMEOUT_MS || '20000', 10) || 20000, 5000);
  private readonly esmoLoginRetries = Math.max(Number.parseInt(process.env.ESMO_LOGIN_RETRIES || '2', 10) || 2, 1);
  private readonly esmoMaxPages = Math.max(Number.parseInt(process.env.ESMO_SYNC_MAX_PAGES || '2', 10) || 2, 1);
  private readonly esmoRecentPages = Math.max(Number.parseInt(process.env.ESMO_RECENT_BACKFILL_PAGES || '2', 10) || 2, 1);
  private readonly autoSyncEveryMs = Math.max(Number.parseInt(process.env.ESMO_AUTO_SYNC_SECONDS || '45', 10) || 45, 10) * 1000;
  private readonly deviceOfflineMinutes = Math.max(Number.parseInt(process.env.ESMO_DEVICE_OFFLINE_MINUTES || '180', 10) || 180, 5);

  constructor(
    @InjectRepository(MedicalCheck)
    private readonly medicalRepo: Repository<MedicalCheck>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
  ) {}

  private normalizeWhitespace(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  private normalizeDriverKey(value: string | null | undefined): string {
    const raw = this.normalizeWhitespace(value);
    if (!raw) return '';
    if (/^\d+$/.test(raw)) {
      const stripped = raw.replace(/^0+/, '');
      return stripped || '0';
    }
    return raw.toLowerCase();
  }

  private normalizeSummaryPersonName(value: unknown): string {
    const raw = this.normalizeWhitespace(value).toLowerCase();
    if (!raw) return '';
    return raw
      .replace(/^проверка\s+сотрудника\s+/i, '')
      .replace(/^proverka\s+sotrudnika\s+/i, '')
      .replace(/^employee\s+check\s+/i, '')
      .replace(/^xodim\s+tekshiruvi\s+/i, '')
      .trim();
  }

  private resolveSummaryPersonKeys(row: MedicalCheck): string[] {
    const payload = (row.source_payload as any) || {};
    const keys: string[] = [];
    const pushKey = (key: string) => {
      if (!key || keys.includes(key)) return;
      keys.push(key);
    };

    const passCandidates = [
      payload?.employeePassId,
      payload?.employeeNo,
      payload?.employeeNoString,
      (row.driver as any)?.license_number,
    ];
    for (const candidate of passCandidates) {
      const passId = this.normalizeDriverKey(candidate);
      if (passId) pushKey(`id:${passId}`);
    }

    const nameCandidates = [
      payload?.employeeName,
      (row.driver as any)?.full_name,
    ];
    for (const candidate of nameCandidates) {
      const normalizedName = this.normalizeSummaryPersonName(candidate);
      if (normalizedName) pushKey(`name:${normalizedName}`);
    }

    const driverId = Number((row.driver as any)?.id);
    if (Number.isFinite(driverId) && driverId > 0) {
      pushKey(`driver:${driverId}`);
    }

    if (keys.length === 0) {
      pushKey(`row:${row.id}`);
    }
    return keys;
  }

  private normalizeResult(value: string | null | undefined): string {
    const normalized = this.normalizeWhitespace(value).toLowerCase();
    if (!normalized) return 'pending';
    if (normalized === 'passed') return 'passed';
    if (normalized === 'failed' || normalized === 'fail' || normalized === 'rejected') return 'failed';
    if (normalized === 'annulled' || normalized === 'canceled' || normalized === 'cancelled') return 'annulled';
    if (normalized === 'review' || normalized === 'manual_review' || normalized === "ko'rik" || normalized === 'korik') return 'review';
    return normalized;
  }

  private resultRank(value: string): number {
    const normalized = this.normalizeResult(value);
    if (normalized === 'passed') return 4;
    if (normalized === 'review') return 3;
    if (normalized === 'failed') return 2;
    if (normalized === 'annulled') return 1;
    return 0;
  }

  private mapResultToStatus(value: string): CheckStatus {
    const normalized = this.normalizeResult(value);
    if (normalized === 'passed') return CheckStatus.PASSED;
    if (normalized === 'review') return CheckStatus.PENDING;
    return CheckStatus.FAILED;
  }

  private parseEsmoTimestamp(rawValue: string | null | undefined): Date | null {
    const text = this.normalizeWhitespace(rawValue);
    const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const [, dd, mm, yyyy, hh, min, sec] = match;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(sec || '0'), 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private currentTzDayBounds(dayParam?: string): { day: string; start: Date; end: Date } {
    const tzOffsetHours = 5;
    const tzOffsetMs = tzOffsetHours * 60 * 60 * 1000;

    let year: number;
    let month: number;
    let day: number;

    if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
      const [y, m, d] = dayParam.split('-').map((v) => Number(v));
      year = y;
      month = m;
      day = d;
    } else {
      const nowShifted = new Date(Date.now() + tzOffsetMs);
      year = nowShifted.getUTCFullYear();
      month = nowShifted.getUTCMonth() + 1;
      day = nowShifted.getUTCDate();
    }

    const startUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - tzOffsetMs;
    const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;

    const y = String(year).padStart(4, '0');
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');

    return {
      day: `${y}-${m}-${d}`,
      start: new Date(startUtcMs),
      end: new Date(endUtcMs),
    };
  }

  private normalizeDateOnly(value: string | null | undefined): string | null {
    const normalized = this.normalizeWhitespace(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
  }

  private resolveDateRangeBounds(
    day?: string,
    dateFrom?: string,
    dateTo?: string,
  ): { day: string; start: Date | null; end: Date | null } {
    const singleDay = this.normalizeDateOnly(day);
    if (singleDay) {
      const bounds = this.currentTzDayBounds(singleDay);
      return { day: bounds.day, start: bounds.start, end: bounds.end };
    }

    const fromDay = this.normalizeDateOnly(dateFrom);
    const toDay = this.normalizeDateOnly(dateTo);
    if (!fromDay && !toDay) {
      const today = this.currentTzDayBounds();
      return { day: today.day, start: null, end: null };
    }

    const left = fromDay || toDay || '';
    const right = toDay || fromDay || '';
    const leftBounds = this.currentTzDayBounds(left);
    const rightBounds = this.currentTzDayBounds(right);

    const inNaturalOrder = leftBounds.start.getTime() <= rightBounds.start.getTime();
    const start = inNaturalOrder ? leftBounds.start : rightBounds.start;
    const end = inNaturalOrder ? rightBounds.end : leftBounds.end;
    const label = `${inNaturalOrder ? leftBounds.day : rightBounds.day}..${inNaturalOrder ? rightBounds.day : leftBounds.day}`;

    return { day: label, start, end };
  }

  private isAtxTerminalHint(rawTerminal: string | null | undefined): boolean {
    const raw = this.normalizeWhitespace(rawTerminal).toLowerCase();
    if (!raw) return false;

    if (raw.includes('atx 1-terminal') || raw.includes('atx 2-terminal')) return true;
    if (raw.includes('192.168.8.11') || raw.includes('192.168.8.12')) return true;
    if (/^(1|2)$/.test(raw)) return true;
    if (/terminal\s*\[(1|2)\]/i.test(raw)) return true;

    return false;
  }

  private resolveTerminal(rawTerminal: string | null | undefined): EsmoTerminalConfig | null {
    const raw = this.normalizeWhitespace(rawTerminal);
    if (!raw) return null;
    if (!this.isAtxTerminalHint(raw)) return null;
    const lower = raw.toLowerCase();

    for (const terminal of SMARTROUTE_ESMO_TERMINALS) {
      if (lower.includes(terminal.name.toLowerCase())) return terminal;
      if (lower.includes(terminal.host)) return terminal;
    }

    const atxMatch = lower.match(/\batx\s*([12])\b/i);
    if (atxMatch && TERMINAL_BY_NUM[atxMatch[1]]) {
      return TERMINAL_BY_NUM[atxMatch[1]];
    }

    const slotMatch = lower.match(/\bterminal\s*\[(\d{1,3})\]/i);
    if (slotMatch && TERMINAL_BY_NUM[slotMatch[1]]) {
      return TERMINAL_BY_NUM[slotMatch[1]];
    }

    if (/^\d{1,3}$/.test(lower) && TERMINAL_BY_NUM[lower]) {
      return TERMINAL_BY_NUM[lower];
    }

    return null;
  }

  private splitFullName(fullNameRaw: string): { firstName: string; lastName: string } {
    const fullName = this.normalizeWhitespace(fullNameRaw);
    if (!fullName) {
      return { firstName: "Noma'lum", lastName: 'Haydovchi' };
    }

    const parts = fullName.split(' ');
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: 'ESMO' };
    }

    return {
      firstName: parts.slice(1).join(' ') || parts[0],
      lastName: parts[0],
    };
  }

  private async findOrCreateDriver(passIdRaw: string | null | undefined, fullNameRaw: string): Promise<Driver | null> {
    const passId = this.normalizeWhitespace(passIdRaw);
    const fullName = this.normalizeWhitespace(fullNameRaw);

    if (passId) {
      const byLicense = await this.driverRepo.findOne({ where: { license_number: passId } });
      if (byLicense) return byLicense;

      const normalizedPassId = this.normalizeDriverKey(passId);
      if (normalizedPassId) {
        const byNormalized = await this.driverRepo
          .createQueryBuilder('driver')
          .where("(CASE WHEN ltrim(driver.license_number, '0') = '' THEN '0' ELSE ltrim(driver.license_number, '0') END) = :normalized", {
            normalized: normalizedPassId,
          })
          .getOne();
        if (byNormalized) return byNormalized;
      }
    }

    if (fullName) {
      const byName = await this.driverRepo
        .createQueryBuilder('driver')
        .where('LOWER(driver.full_name) = :fullName', { fullName: fullName.toLowerCase() })
        .getOne();
      if (byName) return byName;

      const [primaryToken, secondaryToken] = fullName.toLowerCase().split(' ');
      if (primaryToken && secondaryToken) {
        const byNameLike = await this.driverRepo
          .createQueryBuilder('driver')
          .where('LOWER(driver.full_name) LIKE :p1', { p1: `%${primaryToken}%` })
          .andWhere('LOWER(driver.full_name) LIKE :p2', { p2: `%${secondaryToken}%` })
          .getOne();
        if (byNameLike) return byNameLike;
      }
    }

    if (!passId) return null;

    const split = this.splitFullName(fullName);
    const created = this.driverRepo.create({
      full_name: fullName || `${split.lastName} ${split.firstName}`.trim(),
      license_number: passId.slice(0, 100),
      license_categories: null,
      license_expiry: null,
      face_id_hash: null,
      is_active: true,
    });

    try {
      return await this.driverRepo.save(created);
    } catch {
      return this.driverRepo.findOne({ where: { license_number: passId.slice(0, 100) } });
    }
  }

  private buildClient(): EsmoPortalClient {
    return new EsmoPortalClient(
      this.esmoBaseUrl,
      this.esmoUser,
      this.esmoPass,
      this.esmoTimeoutMs,
      this.esmoLoginRetries,
    );
  }

  private async repairSuspiciousEmployeeIds(client: EsmoPortalClient): Promise<number> {
    const bounds = this.currentTzDayBounds();
    const suspiciousPattern = '%"employeePassId":"30000"%';

    const suspiciousRows = await this.medicalRepo
      .createQueryBuilder('med')
      .leftJoinAndSelect('med.driver', 'driver')
      .where('med.terminal_name IN (:...names)', { names: SMARTROUTE_ESMO_TERMINALS.map((t) => t.name) })
      .andWhere('med.esmo_id IS NOT NULL')
      .andWhere('COALESCE(med.exam_time, med.check_time) >= :start', { start: bounds.start.toISOString() })
      .andWhere('COALESCE(med.exam_time, med.check_time) < :end', { end: bounds.end.toISOString() })
      .andWhere('med.source_payload LIKE :pattern', { pattern: suspiciousPattern })
      .orderBy('med.esmo_id', 'DESC')
      .limit(150)
      .getMany();

    let repaired = 0;

    for (const row of suspiciousRows) {
      if (!row.esmo_id) continue;

      const detail = await client.fetchExamDetail(row.esmo_id);
      const resolvedPassId = this.normalizeWhitespace(detail.employeePassId || '');
      if (!resolvedPassId || resolvedPassId === '30000') continue;

      const payload = {
        ...(row.source_payload as any || {}),
        employeePassId: resolvedPassId,
        employeeName: this.normalizeWhitespace((row.source_payload as any)?.employeeName || detail.employeeName || ''),
      };

      row.source_payload = payload;

      const driver = await this.findOrCreateDriver(resolvedPassId, payload.employeeName || '');
      if (driver) {
        row.driver = driver;
      }

      await this.medicalRepo.save(row);
      repaired += 1;
    }

    return repaired;
  }

  private async cleanupMisclassifiedTerminals(): Promise<number> {
    const bounds = this.currentTzDayBounds();

    const rows = await this.medicalRepo
      .createQueryBuilder('med')
      .where('med.terminal_name IN (:...names)', { names: SMARTROUTE_ESMO_TERMINALS.map((t) => t.name) })
      .andWhere('COALESCE(med.exam_time, med.check_time) >= :start', { start: bounds.start.toISOString() })
      .andWhere('COALESCE(med.exam_time, med.check_time) < :end', { end: bounds.end.toISOString() })
      .andWhere('med.source_payload IS NOT NULL')
      .limit(3000)
      .getMany();

    let cleaned = 0;

    for (const row of rows) {
      const payload = (row.source_payload as any) || {};
      const terminalRaw = this.normalizeWhitespace(payload?.terminalRaw);
      if (!terminalRaw) continue;
      if (this.isAtxTerminalHint(terminalRaw)) continue;

      row.terminal_name = null;
      row.terminal_ip = null;
      row.source_payload = {
        ...payload,
        terminalFilteredOut: true,
      };

      await this.medicalRepo.save(row);
      cleaned += 1;
    }

    return cleaned;
  }

  private async runSync(maxPages?: number): Promise<{
    ok: boolean;
    fetched: number;
    saved: number;
    updated: number;
    repairedEmployeeIds: number;
    cleanedMisclassifiedTerminals: number;
    skippedUnknownTerminal: number;
    skippedNoDriver: number;
    error?: string;
  }> {
    if (!this.esmoEnabled) {
      return {
        ok: false,
        fetched: 0,
        saved: 0,
        updated: 0,
        repairedEmployeeIds: 0,
        cleanedMisclassifiedTerminals: 0,
        skippedUnknownTerminal: 0,
        skippedNoDriver: 0,
        error: 'ESMO integration is disabled',
      };
    }

    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = (async () => {
      const rawMax = await this.medicalRepo
        .createQueryBuilder('med')
        .select('MAX(med.esmo_id)', 'max')
        .where('med.esmo_id IS NOT NULL')
        .getRawOne();

      const lastKnownEsmoId = rawMax?.max != null ? Number(rawMax.max) : null;

      const client = this.buildClient();
      let fetchedRows: EsmoExamRow[] = [];
      let saved = 0;
      let updated = 0;
      let repairedEmployeeIds = 0;
      let cleanedMisclassifiedTerminals = 0;
      let skippedUnknownTerminal = 0;
      let skippedNoDriver = 0;

      try {
        const pages = Math.max(1, Math.min(maxPages ?? this.esmoMaxPages, this.esmoMaxPages));
        const incrementalRows = await client.fetchExamsSince(lastKnownEsmoId, pages);
        const backfillRows = await client.fetchExamsSince(null, this.esmoRecentPages);

        const merged = new Map<number, EsmoExamRow>();
        for (const row of backfillRows) merged.set(row.esmoId, row);
        for (const row of incrementalRows) merged.set(row.esmoId, row);

        fetchedRows = Array.from(merged.values()).sort((a, b) => b.esmoId - a.esmoId);
        if (fetchedRows.length === 0 && client.lastError) {
          return {
            ok: false,
            fetched: 0,
            saved: 0,
            updated: 0,
            repairedEmployeeIds: 0,
            cleanedMisclassifiedTerminals: 0,
            skippedUnknownTerminal: 0,
            skippedNoDriver: 0,
            error: client.lastError,
          };
        }

        for (const row of fetchedRows) {
          const terminal = this.resolveTerminal(row.terminalRaw);
          if (!terminal) {
            skippedUnknownTerminal += 1;
            continue;
          }

          const driver = await this.findOrCreateDriver(row.employeePassId, row.employeeName);
          if (!driver) {
            skippedNoDriver += 1;
            continue;
          }

          const examTime = this.parseEsmoTimestamp(row.timestamp) || new Date();
          const normalizedResult = this.normalizeResult(row.result);
          const status = this.mapResultToStatus(normalizedResult);
          const bp = row.pressureSystolic && row.pressureDiastolic
            ? `${row.pressureSystolic}/${row.pressureDiastolic}`
            : null;

          let entity = await this.medicalRepo.findOne({
            where: { esmo_id: row.esmoId },
            relations: ['driver'],
          });

          if (!entity) {
            entity = this.medicalRepo.create();
            entity.esmo_id = row.esmoId;
            saved += 1;
          } else {
            updated += 1;
          }

          entity.driver = driver;
          entity.blood_pressure = bp;
          entity.pulse = row.pulse;
          entity.temperature = row.temperature;
          entity.alcohol_test_result = row.alcoholTestResult;
          entity.status = status;
          entity.esmo_result = normalizedResult;
          entity.terminal_name = terminal.name;
          entity.terminal_ip = terminal.host;
          entity.source_payload = {
            ...row,
            terminalResolved: terminal.name,
            terminalHost: terminal.host,
          };
          entity.check_time = examTime;
          entity.exam_time = examTime;

          await this.medicalRepo.save(entity);
        }

        repairedEmployeeIds = await this.repairSuspiciousEmployeeIds(client);
        cleanedMisclassifiedTerminals = await this.cleanupMisclassifiedTerminals();
        this.lastSyncAt = Date.now();

        return {
          ok: true,
          fetched: fetchedRows.length,
          saved,
          updated,
          repairedEmployeeIds,
          cleanedMisclassifiedTerminals,
          skippedUnknownTerminal,
          skippedNoDriver,
        };
      } catch (error) {
        this.logger.warn(`ESMO sync failed: ${String(error)}`);
        return {
          ok: false,
          fetched: fetchedRows.length,
          saved,
          updated,
          repairedEmployeeIds,
          cleanedMisclassifiedTerminals,
          skippedUnknownTerminal,
          skippedNoDriver,
          error: client.lastError || String(error),
        };
      }
    })();

    try {
      return await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async ensureFreshData(): Promise<void> {
    if (!this.esmoEnabled) return;
    if (Date.now() - this.lastSyncAt < this.autoSyncEveryMs) return;

    try {
      await this.runSync();
    } catch (error) {
      this.logger.debug(`ESMO ensureFreshData warning: ${String(error)}`);
    }
  }

  @Post('sync')
  async syncNow(@Query('maxPages') maxPagesRaw?: string) {
    const maxPages = maxPagesRaw ? Number.parseInt(maxPagesRaw, 10) : undefined;
    return this.runSync(Number.isFinite(maxPages as number) ? maxPages : undefined);
  }

  @Get('devices')
  async getDevices() {
    await this.ensureFreshData();

    const rows = await this.medicalRepo
      .createQueryBuilder('med')
      .select('med.terminal_name', 'terminal_name')
      .addSelect('MAX(COALESCE(med.exam_time, med.check_time))', 'last_seen')
      .where('med.terminal_name IN (:...names)', { names: SMARTROUTE_ESMO_TERMINALS.map((t) => t.name) })
      .groupBy('med.terminal_name')
      .getRawMany();

    const lastSeenMap = new Map<string, string>();
    for (const row of rows) {
      const terminalName = this.normalizeWhitespace(row?.terminal_name);
      const lastSeen = row?.last_seen ? new Date(row.last_seen).toISOString() : null;
      if (terminalName && lastSeen) {
        lastSeenMap.set(terminalName, lastSeen);
      }
    }

    const client = new EsmoPortalClient(
      this.esmoBaseUrl,
      this.esmoUser,
      this.esmoPass,
      this.esmoTimeoutMs,
      this.esmoLoginRetries,
    );

    let terminalStates: EsmoTerminalStateRow[] = [];
    try {
      terminalStates = await client.fetchTerminalStates();
    } catch (error) {
      this.logger.debug(`ESMO terminal states warning: ${String(error)}`);
    }

    const stateByHost = new Map<string, EsmoTerminalStateRow>();
    const stateBySerial = new Map<string, EsmoTerminalStateRow>();
    const stateByName = new Map<string, EsmoTerminalStateRow>();

    for (const row of terminalStates) {
      const hostKey = this.normalizeWhitespace(row.host);
      const serialKey = this.normalizeWhitespace(row.serial).toUpperCase();
      const nameKey = this.normalizeWhitespace(row.name).toLowerCase();
      if (hostKey) stateByHost.set(hostKey, row);
      if (serialKey) stateBySerial.set(serialKey, row);
      if (nameKey) stateByName.set(nameKey, row);
    }

    return SMARTROUTE_ESMO_TERMINALS.map((terminal) => {
      const lastSeenIso = lastSeenMap.get(terminal.name) || null;
      const state =
        stateByHost.get(terminal.host)
        || stateBySerial.get(this.normalizeWhitespace(terminal.serial).toUpperCase())
        || stateByName.get(this.normalizeWhitespace(terminal.name).toLowerCase())
        || null;

      return {
        name: terminal.name,
        host: terminal.host,
        model: terminal.model,
        serial: terminal.serial,
        apiKey: terminal.apiKey,
        // ESMO logic: online only when terminal state is "Готов к работе".
        isOnline: Boolean(state?.isReady),
        lastSeen: lastSeenIso,
        statusText: state?.statusText || null,
      };
    });
  }

  @Get('summary')
  async getSummary(
    @Query('day') day?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    await this.ensureFreshData();

    const range = this.resolveDateRangeBounds(day, dateFrom, dateTo);
    const fallbackToday = this.currentTzDayBounds();
    const effectiveStart = range.start || fallbackToday.start;
    const effectiveEnd = range.end || fallbackToday.end;
    const effectiveDay = range.start && range.end ? range.day : fallbackToday.day;

    const rows = await this.medicalRepo
      .createQueryBuilder('med')
      .leftJoinAndSelect('med.driver', 'driver')
      .where('med.terminal_name IN (:...names)', { names: SMARTROUTE_ESMO_TERMINALS.map((t) => t.name) })
      .andWhere('COALESCE(med.exam_time, med.check_time) >= :start', { start: effectiveStart.toISOString() })
      .andWhere('COALESCE(med.exam_time, med.check_time) < :end', { end: effectiveEnd.toISOString() })
      .orderBy('COALESCE(med.exam_time, med.check_time)', 'DESC')
      .addOrderBy('med.esmo_id', 'DESC')
      .addOrderBy('med.id', 'DESC')
      .getMany();

    let passedToday = 0;
    let reviewToday = 0;
    let failedToday = 0;
    const canonicalByAlias = new Map<string, string>();
    const bestResultByCanonical = new Map<string, string>();

    // Summary rule: count each employee once by their best outcome in selected range.
    // Priority: passed > review > failed/annulled.
    // Journal still keeps all events as-is.
    for (const row of rows) {
      const personKeys = this.resolveSummaryPersonKeys(row);
      let canonicalKey: string | null = null;

      for (const key of personKeys) {
        const existingCanonical = canonicalByAlias.get(key);
        if (existingCanonical) {
          canonicalKey = existingCanonical;
          break;
        }
      }

      if (!canonicalKey) canonicalKey = personKeys[0];

      for (const key of personKeys) {
        canonicalByAlias.set(key, canonicalKey);
      }

      const result = this.normalizeResult(row.esmo_result || row.status);
      const previousBest = bestResultByCanonical.get(canonicalKey);
      if (!previousBest || this.resultRank(result) > this.resultRank(previousBest)) {
        bestResultByCanonical.set(canonicalKey, result);
      }
    }

    for (const bestResult of bestResultByCanonical.values()) {
      if (bestResult === 'passed') {
        passedToday += 1;
      } else if (bestResult === 'review') {
        reviewToday += 1;
      } else {
        failedToday += 1;
      }
    }

    return {
      day: effectiveDay,
      totalToday: passedToday + reviewToday + failedToday,
      passedToday,
      reviewToday,
      failedToday,
      systemStatus: this.esmoEnabled ? 'online' : 'offline',
    };
  }

  @Get('journal')
  async getJournal(
    @Query('limit') limitRaw?: string,
    @Query('search') searchRaw?: string,
    @Query('day') day?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    await this.ensureFreshData();

    const limit = Math.max(1, Math.min(Number.parseInt(limitRaw || '500', 10) || 500, 5000));
    const search = this.normalizeWhitespace(searchRaw).toLowerCase();
    const range = this.resolveDateRangeBounds(day, dateFrom, dateTo);

    let query = this.medicalRepo
      .createQueryBuilder('med')
      .leftJoinAndSelect('med.driver', 'driver')
      .where('med.terminal_name IN (:...names)', { names: SMARTROUTE_ESMO_TERMINALS.map((t) => t.name) });

    if (range.start && range.end) {
      query = query
        .andWhere('COALESCE(med.exam_time, med.check_time) >= :start', { start: range.start.toISOString() })
        .andWhere('COALESCE(med.exam_time, med.check_time) < :end', { end: range.end.toISOString() });
    }

    if (search) {
      query = query.andWhere(
        '(LOWER(driver.full_name) LIKE :q OR LOWER(driver.license_number) LIKE :q OR LOWER(med.terminal_name) LIKE :q)',
        { q: `%${search}%` },
      );
    }

    const rows = await query
      .orderBy('COALESCE(med.exam_time, med.check_time)', 'DESC')
      .addOrderBy('med.esmo_id', 'DESC')
      .addOrderBy('med.id', 'DESC')
      .limit(limit)
      .getMany();

    return rows.map((row) => {
      const time = row.exam_time || row.check_time;
      const result = this.normalizeResult(row.esmo_result || row.status);
      const status = result === 'passed'
        ? 'passed'
        : result === 'review'
          ? 'review'
          : result === 'annulled'
            ? 'annulled'
            : 'failed';

      return {
        id: row.id,
        esmoId: row.esmo_id,
        // Show the exact name from ESMO journal/detail first to avoid local driver-name drift.
        name: this.normalizeWhitespace((row.source_payload as any)?.employeeName) || this.normalizeWhitespace(row.driver?.full_name) || "Noma'lum xodim",
        passId: this.normalizeWhitespace((row.source_payload as any)?.employeePassId) || this.normalizeWhitespace(row.driver?.license_number) || '',
        time,
        pulse: row.pulse,
        bp: row.blood_pressure,
        temperature: row.temperature,
        alcohol: row.alcohol_test_result,
        alcoholDetected:
          typeof (row.source_payload as any)?.alcoholDetected === 'boolean'
            ? Boolean((row.source_payload as any).alcoholDetected)
            : null,
        status,
        statusCode: row.status,
        device: row.terminal_name,
        deviceIp: row.terminal_ip,
      };
    });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([MedicalCheck, Driver])],
  controllers: [EsmoController],
})
export class EsmoModule {}

