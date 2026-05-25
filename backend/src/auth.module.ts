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
import { randomBytes } from 'crypto';
import { User, UserRole } from './user.entity';
import { hashPassword, verifyPassword } from './password.util';
import { buildFullPermissions, sanitizePermissionMap, type PermissionMap } from './permissions';

const SUPERADMIN_USERNAME = (process.env.SUPERADMIN_USERNAME ?? 'superadmin').trim().toLowerCase() || 'superadmin';
const SUPERADMIN_PASSWORD = String(process.env.SUPERADMIN_PASSWORD ?? '').trim();
const SUPERADMIN_EMAIL = String(process.env.SUPERADMIN_EMAIL ?? 'superadmin@example.local').trim();
const SUPERADMIN_FULL_NAME = String(process.env.SUPERADMIN_FULL_NAME ?? 'Super Admin').trim() || 'Super Admin';

type SessionState = {
  userId: number;
  issuedAt: number;
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
  createdAt: new Date(user.created_at).toISOString(),
});

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
    const session = this.sessions.get(token);
    if (!session) {
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
