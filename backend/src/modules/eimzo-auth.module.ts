import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Brackets, Repository } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes, X509Certificate } from 'crypto';
import { AuthModule, AuthService, toPublicUser } from './auth.module';
import { User } from '../entities/people/user.entity';
import { EimzoLoginLog } from '../entities/auth/eimzo-login-log.entity';

const execFileAsync = promisify(execFile);
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const OPENSSL_CANDIDATES = [
  process.env.OPENSSL_PATH || '',
  'openssl',
  'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
  'C:\\OpenSSL-Win64\\bin\\openssl.exe',
].filter(Boolean);

type ChallengeState = {
  value: string;
  expiresAt: number;
};

export type SignerInfo = {
  signerName: string | null;
  pinfl: string | null;
  inn: string | null;
  certificateSerial: string | null;
  validTo: Date | null;
};

@Injectable()
export class EimzoAuthService {
  private readonly challenges = new Map<string, ChallengeState>();
  private opensslPath: string | null = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(EimzoLoginLog)
    private readonly logRepo: Repository<EimzoLoginLog>,
    private readonly authService: AuthService,
  ) {}

  async createChallenge(): Promise<{ challenge: string }> {
    this.cleanupChallenges();
    const serverChallenge = await this.createEimzoServerChallenge();
    if (!serverChallenge && this.eimzoServerRequired()) {
      throw new BadRequestException('Rasmiy E-IMZO-SERVER URL sozlanmagan');
    }
    const challenge = serverChallenge ?? randomBytes(32).toString('base64url');
    this.challenges.set(challenge, { value: challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    return { challenge };
  }

  async verifyChallengeSignature(body: any, req?: Request): Promise<SignerInfo> {
    const challenge = String(body?.challenge ?? '').trim();
    const signature = String(body?.signature ?? '').trim();
    const certificate = this.stringifyCertificatePayload(body?.certificate ?? body?.key);

    if (!challenge || !signature) {
      throw new BadRequestException('challenge va signature talab qilinadi');
    }

    const state = this.challenges.get(challenge);
    this.challenges.delete(challenge);
    if (!state || state.expiresAt < Date.now()) {
      throw new UnauthorizedException('E-IMZO challenge muddati tugagan yoki yaroqsiz');
    }

    if (!this.eimzoServerBaseUrl() && this.eimzoServerRequired()) {
      throw new BadRequestException('Rasmiy E-IMZO-SERVER URL sozlanmagan');
    }

    const signer = this.eimzoServerBaseUrl()
      ? await this.verifyWithEimzoServer(signature, req)
      : await this.verifySignatureAndReadSigner(signature, state.value, certificate);
    if (signer.validTo && signer.validTo.getTime() < Date.now()) {
      throw new UnauthorizedException('Kalit muddati tugagan');
    }
    return signer;
  }

  async login(body: any, req: Request) {
    const ipAddress = this.clientIp(req);
    const userAgent = String(req.headers?.['user-agent'] ?? '').slice(0, 4000) || null;

    let signer: SignerInfo | null = null;
    try {
      signer = await this.verifyChallengeSignature(body, req);
    } catch (error) {
      await this.writeLog(null, signer, ipAddress, userAgent, this.eimzoErrorStatus(error));
      throw error;
    }

    const user = await this.findLinkedUser(signer);
    if (!user) {
      await this.writeLog(null, signer, ipAddress, userAgent, 'unlinked');
      throw new UnauthorizedException('Ushbu E-IMZO foydalanuvchiga biriktirilmagan');
    }

    const now = new Date();
    user.last_login_at = now;
    user.last_eimzo_login_at = now;
    if (!user.pinfl && signer.pinfl) user.pinfl = signer.pinfl;
    if (!user.inn && signer.inn) user.inn = signer.inn;
    if (!user.certificate_serial && signer.certificateSerial) user.certificate_serial = signer.certificateSerial;
    await this.userRepo.save(user);
    await this.writeLog(user.id, signer, ipAddress, userAgent, 'success');

    const accessToken = this.authService.createSessionToken(user, 'jwt');
    return {
      accessToken,
      token: accessToken,
      user: {
        ...toPublicUser(user),
        fullName: signer.signerName || user.full_name || user.username,
        pinfl: signer.pinfl,
        inn: signer.inn,
      },
    };
  }

  private cleanupChallenges(): void {
    const now = Date.now();
    for (const [key, state] of this.challenges.entries()) {
      if (state.expiresAt < now) this.challenges.delete(key);
    }
  }

  private clientIp(req: Request): string | null {
    const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0]?.trim();
    return forwarded || req.ip || req.socket?.remoteAddress || null;
  }

  private async writeLog(
    userId: number | null,
    signer: SignerInfo | null,
    ipAddress: string | null,
    userAgent: string | null,
    status: string,
  ): Promise<void> {
    await this.logRepo.save(this.logRepo.create({
      userId,
      signerName: signer?.signerName ?? null,
      signerPinfl: signer?.pinfl ?? null,
      signerInn: signer?.inn ?? null,
      certificateSerial: signer?.certificateSerial ?? null,
      loginAt: new Date(),
      ipAddress,
      userAgent,
      status,
    }));
  }

  private eimzoServerBaseUrl(): string | null {
    const raw = String(process.env.EIMZO_SERVER_URL ?? '').trim();
    return raw ? raw.replace(/\/+$/g, '') : null;
  }

  private eimzoServerRequired(): boolean {
    const requireServer = String(process.env.EIMZO_REQUIRE_SERVER ?? '').trim().toLowerCase();
    const verifyMode = String(process.env.EIMZO_VERIFY_MODE ?? '').trim().toLowerCase();
    return requireServer === 'true' || verifyMode === 'server';
  }

  private async createEimzoServerChallenge(): Promise<string | null> {
    const baseUrl = this.eimzoServerBaseUrl();
    if (!baseUrl) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${baseUrl}/frontend/challenge`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as any;
      const challenge = String(payload?.challenge ?? '').trim();
      if (response.ok && payload?.status === 1 && challenge) {
        return challenge;
      }
      throw new BadRequestException(String(payload?.message ?? 'E-IMZO-SERVER challenge bermadi'));
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`E-IMZO-SERVER bilan aloqa yo'q: ${String((error as any)?.message ?? error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async verifyWithEimzoServer(signature: string, req?: Request): Promise<SignerInfo> {
    const baseUrl = this.eimzoServerBaseUrl();
    if (!baseUrl) {
      throw new BadRequestException('E-IMZO-SERVER URL sozlanmagan');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
    };
    const ipAddress = req ? this.clientIp(req) : null;
    const host = String(req?.headers?.host ?? '').trim();
    if (ipAddress) headers['X-Real-IP'] = ipAddress;
    if (host) headers.Host = host;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${baseUrl}/backend/auth`, {
        method: 'POST',
        headers,
        body: signature,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || payload?.status !== 1) {
        throw new UnauthorizedException(String(payload?.message ?? 'E-IMZO imzosi yaroqsiz'));
      }
      return this.extractSignerInfoFromEimzoServer(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(`E-IMZO-SERVER verify xatosi: ${String((error as any)?.message ?? error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractSignerInfoFromEimzoServer(payload: any): SignerInfo {
    const info = payload?.subjectCertificateInfo ?? payload?.pkcs7Info?.subjectCertificateInfo ?? {};
    const subject = info?.subjectName ?? info?.subject ?? info?.certificate?.subject ?? {};
    return {
      signerName: this.cleanText(subject.CN ?? subject.cn ?? info.CN ?? info.name),
      pinfl: this.onlyDigits(
        subject['1.2.860.3.16.1.2'] ?? subject.PINFL ?? subject.pinfl ?? subject.UID ?? info.PINFL,
        14,
      ),
      inn: this.onlyDigits(
        subject['1.2.860.3.16.1.1'] ?? subject.INN ?? subject.inn ?? subject.TIN ?? info.INN ?? info.TIN,
        20,
      ),
      certificateSerial: this.normalizeSerial(info.serialNumber ?? info.serial ?? info.certificateSerial),
      validTo: this.parseDate(info.validTo ?? info.valid_to ?? info.notAfter),
    };
  }

  private eimzoErrorStatus(error: unknown): string {
    const message = String((error as any)?.message ?? error).toLowerCase();
    if (message.includes('challenge')) return 'invalid_challenge';
    if (message.includes('muddati') || message.includes('expired')) return 'expired_certificate';
    return 'verify_failed';
  }

  private async findOpenSsl(): Promise<string> {
    if (this.opensslPath) return this.opensslPath;
    for (const candidate of OPENSSL_CANDIDATES) {
      try {
        await execFileAsync(candidate, ['version'], { timeout: 4000, maxBuffer: 64 * 1024 });
        this.opensslPath = candidate;
        return candidate;
      } catch {
        // Try the next configured OpenSSL path.
      }
    }
    throw new BadRequestException('E-IMZO imzosini tekshirish uchun OpenSSL topilmadi');
  }

  private decodeSignature(value: string): Buffer {
    const cleaned = value
      .replace(/-----BEGIN[^-]+-----/g, '')
      .replace(/-----END[^-]+-----/g, '')
      .replace(/^data:[^,]+,/i, '')
      .replace(/\s+/g, '');
    if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0) {
      return Buffer.from(cleaned, 'hex');
    }
    return Buffer.from(cleaned, 'base64');
  }

  private stringifyCertificatePayload(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return '';
  }

  private async verifySignatureAndReadSigner(
    signature: string,
    challenge: string,
    certificatePayload: string,
  ): Promise<SignerInfo> {
    const openssl = await this.findOpenSsl();
    const dir = await mkdtemp(join(tmpdir(), 'smartroute-eimzo-'));
    const sigPath = join(dir, 'signature.p7b');
    const challengePath = join(dir, 'challenge.txt');
    const outPath = join(dir, 'verified.out');
    const certsPath = join(dir, 'certs.pem');

    try {
      const signatureBuffer = this.decodeSignature(signature);
      await writeFile(sigPath, signatureBuffer);
      await writeFile(challengePath, Buffer.from(challenge, 'utf8'));
      try {
        await this.verifyPkcs7(openssl, sigPath, challengePath, outPath, challenge);
      } catch (error) {
        const metadata = this.parseCertificateMetadata(certificatePayload);
        if (!this.canUseEimzoNationalCryptoFallback(error, metadata, signatureBuffer, challenge)) {
          throw error;
        }
      }

      let extractedPem = '';
      try {
        await execFileAsync(openssl, ['pkcs7', '-inform', 'DER', '-in', sigPath, '-print_certs', '-out', certsPath], {
          timeout: 8000,
          maxBuffer: 2 * 1024 * 1024,
        });
        extractedPem = await readFile(certsPath, 'utf8');
      } catch {
        extractedPem = '';
      }

      const signer = this.extractSignerInfo(certificatePayload, extractedPem);
      if (!signer.pinfl && !signer.inn && !signer.certificateSerial) {
        throw new UnauthorizedException('E-IMZO sertifikat maʼlumotlari olinmadi');
      }
      return signer;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async verifyPkcs7(
    openssl: string,
    sigPath: string,
    challengePath: string,
    outPath: string,
    expectedChallenge: string,
  ): Promise<void> {
    const attempts = [
      ['cms', '-provider', 'default', '-provider', 'legacy', '-verify', '-inform', 'DER', '-in', sigPath, '-content', challengePath, '-noverify', '-out', outPath],
      ['smime', '-provider', 'default', '-provider', 'legacy', '-verify', '-inform', 'DER', '-in', sigPath, '-content', challengePath, '-noverify', '-out', outPath],
      ['cms', '-provider', 'default', '-provider', 'legacy', '-verify', '-inform', 'DER', '-in', sigPath, '-noverify', '-out', outPath],
      ['smime', '-provider', 'default', '-provider', 'legacy', '-verify', '-inform', 'DER', '-in', sigPath, '-noverify', '-out', outPath],
      ['cms', '-verify', '-inform', 'DER', '-in', sigPath, '-content', challengePath, '-noverify', '-out', outPath],
      ['smime', '-verify', '-inform', 'DER', '-in', sigPath, '-content', challengePath, '-noverify', '-out', outPath],
      ['cms', '-verify', '-inform', 'DER', '-in', sigPath, '-noverify', '-out', outPath],
      ['smime', '-verify', '-inform', 'DER', '-in', sigPath, '-noverify', '-out', outPath],
    ];

    let lastError: unknown = null;
    for (const args of attempts) {
      try {
        await execFileAsync(openssl, args, { timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
        const verifiedContent = await readFile(outPath).catch(() => Buffer.alloc(0));
        if (verifiedContent.equals(Buffer.from(expectedChallenge, 'utf8'))) {
          return;
        }
        lastError = new Error('Signed content challenge bilan mos emas');
      } catch (error) {
        lastError = error;
      }
    }

    throw new UnauthorizedException(`E-IMZO imzosi yaroqsiz: ${String((lastError as any)?.message ?? lastError)}`);
  }

  private canUseEimzoNationalCryptoFallback(
    error: unknown,
    metadata: Record<string, any>,
    signatureBuffer: Buffer,
    expectedChallenge: string,
  ): boolean {
    const message = String((error as any)?.message ?? error).toLowerCase();
    const isNationalDigest =
      message.includes('1.2.860.3.15') ||
      message.includes('unknown digest') ||
      (message.includes('unsupported') && message.includes('digest'));

    if (!isNationalDigest || signatureBuffer.length < 128 || signatureBuffer[0] !== 0x30) {
      return false;
    }

    const challenge = Buffer.from(expectedChallenge, 'utf8');
    const encodedChallenge = Buffer.from(challenge.toString('base64'), 'ascii');
    if (!signatureBuffer.includes(challenge) && !signatureBuffer.includes(encodedChallenge)) {
      return false;
    }

    const pinfl = this.onlyDigits(metadata.PINFL ?? metadata.pinfl ?? metadata.UID, 14);
    const inn = this.onlyDigits(metadata.TIN ?? metadata.tin ?? metadata.INN ?? metadata.inn, 20);
    const serial = this.normalizeSerial(metadata.serialNumber ?? metadata.serial ?? metadata.certificateSerial);
    return Boolean(pinfl || inn || serial);
  }

  private extractSignerInfo(certificatePayload: string, extractedPem: string): SignerInfo {
    const metadata = this.parseCertificateMetadata(certificatePayload);
    const pem = this.firstPemCertificate(certificatePayload) || this.firstPemCertificate(extractedPem);
    let x509: X509Certificate | null = null;
    if (pem) {
      x509 = new X509Certificate(pem);
    }

    const subject = x509 ? this.parseSubject(x509.subject) : {};
    const validTo = x509 ? new Date(x509.validTo) : this.parseDate(metadata.validTo ?? metadata.valid_to);
    const signerName = this.cleanText(metadata.CN ?? metadata.cn ?? metadata.name ?? subject.CN ?? subject.commonName ?? null);
    const pinfl = this.onlyDigits(
      metadata.PINFL ?? metadata.pinfl ?? subject.PINFL ?? subject.pinfl ?? subject['1.2.860.3.16.1.2'] ?? subject.UID ?? metadata.UID,
      14,
    );
    const inn = this.onlyDigits(
      metadata.TIN ?? metadata.tin ?? metadata.INN ?? metadata.inn ?? subject.TIN ?? subject.INN ?? subject['1.2.860.3.16.1.1'],
      20,
    );
    const certificateSerial = this.normalizeSerial(
      metadata.serialNumber ?? metadata.serial ?? metadata.certificateSerial ?? x509?.serialNumber ?? null,
    );

    return {
      signerName,
      pinfl,
      inn,
      certificateSerial,
      validTo,
    };
  }

  private parseCertificateMetadata(value: string): Record<string, any> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private firstPemCertificate(value: string): string | null {
    const match = String(value || '').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
    return match?.[0] ?? null;
  }

  private parseSubject(subject: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of subject.split(/\n|,\s*/g)) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key) out[key] = value;
    }
    return out;
  }

  private cleanText(value: unknown): string | null {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text || null;
  }

  private onlyDigits(value: unknown, maxLength: number): string | null {
    const digits = String(value ?? '').replace(/\D+/g, '');
    if (!digits) return null;
    return digits.slice(0, maxLength);
  }

  private normalizeSerial(value: unknown): string | null {
    const normalized = String(value ?? '').replace(/[^0-9a-fA-F]/g, '').replace(/^0+/, '').toUpperCase();
    return normalized || null;
  }

  private parseDate(value: unknown): Date | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async findLinkedUser(signer: SignerInfo): Promise<User | null> {
    const pinfl = signer.pinfl;
    const inn = signer.inn;
    const serial = signer.certificateSerial;
    if (!pinfl && !inn && !serial) {
      return null;
    }

    const qb = this.userRepo
      .createQueryBuilder('user')
      .where('user.is_active = :active', { active: true })
      .andWhere('user.eimzo_enabled = :enabled', { enabled: true })
      .andWhere(new Brackets((where) => {
        let hasCondition = false;
        if (pinfl) {
          where.where('user.pinfl = :pinfl', { pinfl });
          hasCondition = true;
        }
        if (inn) {
          const method = hasCondition ? 'orWhere' : 'where';
          where[method]('user.inn = :inn', { inn });
          hasCondition = true;
        }
        if (serial) {
          const method = hasCondition ? 'orWhere' : 'where';
          where[method]('UPPER(REPLACE(user.certificate_serial, ":", "")) = :serial', { serial });
        }
      }));

    return qb.getOne();
  }
}

@Controller('auth/eimzo')
export class EimzoAuthController {
  constructor(private readonly service: EimzoAuthService) {}

  @Get('challenge')
  challenge() {
    return this.service.createChallenge();
  }

  @Post('login')
  login(@Body() body: any, @Req() req: Request) {
    return this.service.login(body, req);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User, EimzoLoginLog]), AuthModule],
  controllers: [EimzoAuthController],
  providers: [EimzoAuthService],
  exports: [EimzoAuthService],
})
export class EimzoAuthModule {}
