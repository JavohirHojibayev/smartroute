import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  Module,
  OnModuleInit,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { User, UserRole } from '../entities/user.entity';
import { hashPassword, verifyPassword } from '../utils/password.util';
import { buildFullPermissions, sanitizePermissionMap, type PermissionMap } from '../utils/permissions';

const SUPERADMIN_USERNAME = (process.env.SUPERADMIN_USERNAME ?? 'superadmin').trim().toLowerCase() || 'superadmin';
const SUPERADMIN_PASSWORD = String(process.env.SUPERADMIN_PASSWORD ?? '').trim();
const SUPERADMIN_EMAIL = String(process.env.SUPERADMIN_EMAIL ?? 'superadmin@example.local').trim();
const SUPERADMIN_FULL_NAME = String(process.env.SUPERADMIN_FULL_NAME ?? 'Super Admin').trim() || 'Super Admin';
const JWT_ISSUER = 'smartroute';
const JWT_TTL_SECONDS = Math.max(300, Number.parseInt(process.env.AUTH_JWT_TTL_SECONDS ?? '86400', 10) || 86400);
const JWT_SECRET = String(process.env.AUTH_JWT_SECRET || SUPERADMIN_PASSWORD || randomBytes(32).toString('hex'));

type SessionState = {
  userId: number;
  issuedAt: number;
  expiresAt?: number;
};

export type PublicUser = {
  id: number;
  username: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  permissions: PermissionMap;
  status: 'active' | 'inactive';
  lastLoginAt: string | null;
  pinfl: string | null;
  inn: string | null;
  certificateSerial: string | null;
  eimzoEnabled: boolean;
  lastEimzoLoginAt: string | null;
  createdAt: string;
};

const DEMO_USERNAMES = new Set(['akt', 'sherzod', 'javohir', 'ali']);
const DEMO_EMAILS = new Set(['demo-admin@example.local', 'sherzod@example.local', 'javohir@example.local', 'ali@example.local']);

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  username: user.username,
  email: user.email || null,
  fullName: user.full_name || null,
  role: user.role,
  permissions: sanitizePermissionMap(user.permissions, user.role),
  status: user.is_active ? 'active' : 'inactive',
  lastLoginAt: user.last_login_at ? new Date(user.last_login_at).toISOString() : null,
  pinfl: user.pinfl || null,
  inn: user.inn || null,
  certificateSerial: user.certificate_serial || null,
  eimzoEnabled: Boolean(user.eimzo_enabled),
  lastEimzoLoginAt: user.last_eimzo_login_at ? new Date(user.last_eimzo_login_at).toISOString() : null,
  createdAt: new Date(user.created_at).toISOString(),
});

const base64Url = (value: Buffer | string): string =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const decodeBase64Url = (value: string): Buffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.cleanupDemoUsers();
    await this.ensureSuperAdmin();
  }

  private normalizeUsername(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private normalizeEmail(value: unknown): string | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized || null;
  }

  private signJwt(user: User): { token: string; expiresAt: number } {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + JWT_TTL_SECONDS;
    const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({
      iss: JWT_ISSUER,
      sub: String(user.id),
      role: user.role,
      iat: issuedAt,
      exp: expiresAt,
      jti: randomUUID(),
    }));
    const data = `${header}.${payload}`;
    const signature = base64Url(createHmac('sha256', JWT_SECRET).update(data).digest());
    return { token: `${data}.${signature}`, expiresAt: expiresAt * 1000 };
  }

  private verifyJwt(token: string): SessionState | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const data = `${parts[0]}.${parts[1]}`;
    const expected = base64Url(createHmac('sha256', JWT_SECRET).update(data).digest());
    const actualBuffer = Buffer.from(parts[2]);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      return null;
    }

    let payload: any = null;
    try {
      payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8'));
    } catch {
      return null;
    }

    const userId = Number.parseInt(String(payload?.sub ?? ''), 10);
    const exp = Number(payload?.exp);
    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(exp) || Date.now() >= exp * 1000) {
      return null;
    }

    return { userId, issuedAt: Number(payload?.iat ?? 0) * 1000 || Date.now(), expiresAt: exp * 1000 };
  }

  createSessionToken(user: User, tokenMode: 'opaque' | 'jwt' = 'opaque'): string {
    if (tokenMode === 'jwt') {
      const jwt = this.signJwt(user);
      this.sessions.set(jwt.token, { userId: user.id, issuedAt: Date.now(), expiresAt: jwt.expiresAt });
      return jwt.token;
    }

    const token = this.createSessionToken(user);
    return token;
  }

  extractTokenFromAuthorization(authHeader: string | undefined): string | null {
    const raw = String(authHeader ?? '').trim();
    if (!raw) return null;

    const [scheme, token] = raw.split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token.trim() || null;
  }

  private async cleanupDemoUsers(): Promise<void> {
    const users = await this.userRepo.find();

    const removable = users.filter((user) => {
      const username = this.normalizeUsername(user.username);
      if (username === SUPERADMIN_USERNAME) {
        return false;
      }

      const email = this.normalizeEmail(user.email);
      return DEMO_USERNAMES.has(username) || (email ? DEMO_EMAILS.has(email) : false);
    });

    if (removable.length === 0) {
      return;
    }

    await this.userRepo.remove(removable);
  }

  private async ensureSuperAdmin(): Promise<User | null> {
    const existing = await this.userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.username) = :username', { username: SUPERADMIN_USERNAME })
      .getOne();

    if (existing) {
      existing.username = SUPERADMIN_USERNAME;
      existing.email = existing.email || SUPERADMIN_EMAIL;
      existing.full_name = existing.full_name || SUPERADMIN_FULL_NAME;
      existing.role = UserRole.ADMIN;
      existing.permissions = buildFullPermissions();
      existing.is_active = true;
      if (SUPERADMIN_PASSWORD) {
        existing.password_hash = hashPassword(SUPERADMIN_PASSWORD);
      }
      return this.userRepo.save(existing);
    }

    if (!SUPERADMIN_PASSWORD) {
      return null;
    }

    const superadmin = this.userRepo.create({
      username: SUPERADMIN_USERNAME,
      email: SUPERADMIN_EMAIL,
      full_name: SUPERADMIN_FULL_NAME,
      role: UserRole.ADMIN,
      permissions: buildFullPermissions(),
      is_active: true,
      password_hash: hashPassword(SUPERADMIN_PASSWORD),
    });

    return this.userRepo.save(superadmin);
  }

  async login(usernameRaw: string, passwordRaw: string): Promise<{ token: string; user: PublicUser }> {
    const username = this.normalizeUsername(usernameRaw);
    const password = String(passwordRaw ?? '').trim();

    if (!username || !password) {
      throw new UnauthorizedException('Login yoki parol noto\'g\'ri');
    }

    const user = await this.userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.username) = :username', { username })
      .getOne();

    if (!user || !verifyPassword(password, user.password_hash) || !user.is_active) {
      throw new UnauthorizedException('Login yoki parol noto\'g\'ri');
    }

    if (username === SUPERADMIN_USERNAME && user.role !== UserRole.ADMIN) {
      user.role = UserRole.ADMIN;
    }

    if (username === SUPERADMIN_USERNAME) {
      user.permissions = buildFullPermissions();
    }

    user.last_login_at = new Date();
    await this.userRepo.save(user);

    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { userId: user.id, issuedAt: Date.now() });

    return {
      token,
      user: toPublicUser(user),
    };
  }

  async getUserByToken(token: string): Promise<User | null> {
    let session = this.sessions.get(token);
    if (!session) {
      session = this.verifyJwt(token) ?? undefined;
      if (session) {
        this.sessions.set(token, session);
      }
    }
    if (!session) {
      return null;
    }
    if (session.expiresAt && Date.now() >= session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }

    const user = await this.userRepo.findOne({ where: { id: session.userId } });
    if (!user || !user.is_active) {
      this.sessions.delete(token);
      return null;
    }

    return user;
  }

  async requireUserFromAuthorization(authHeader: string | undefined): Promise<User> {
    const token = this.extractTokenFromAuthorization(authHeader);
    if (!token) {
      throw new UnauthorizedException('Token talab qilinadi');
    }

    const user = await this.getUserByToken(token);
    if (!user) {
      throw new UnauthorizedException('Sessiya yaroqsiz yoki tugagan');
    }

    return user;
  }

  async requireAdminFromAuthorization(authHeader: string | undefined): Promise<User> {
    const user = await this.requireUserFromAuthorization(authHeader);
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Bu amal uchun admin huquqi kerak');
    }
    return user;
  }

  logout(authHeader: string | undefined): { ok: true } {
    const token = this.extractTokenFromAuthorization(authHeader);
    if (token) {
      this.sessions.delete(token);
    }

    return { ok: true };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: any) {
    const username = String(body?.username ?? body?.login ?? '').trim();
    const password = String(body?.password ?? '').trim();

    if (!username || !password) {
      throw new BadRequestException('username va password maydonlari talab qilinadi');
    }

    return this.authService.login(username, password);
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const user = await this.authService.requireUserFromAuthorization(authorization);
    return { user: toPublicUser(user) };
  }

  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    return this.authService.logout(authorization);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
