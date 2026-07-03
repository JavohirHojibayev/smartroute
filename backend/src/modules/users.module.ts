import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthModule, AuthService, toPublicUser } from './auth.module';
import { EimzoAuthModule, EimzoAuthService, type SignerInfo } from './eimzo-auth.module';
import { hashPassword } from '../utils/password.util';
import { User, UserRole } from '../entities/user.entity';
import { RolePermission } from '../entities/role-permission.entity';
import {
  buildFullPermissions,
  buildRoleDefaultPermissions,
  sanitizePermissionMap,
  type PermissionMap,
} from '../utils/permissions';

const SUPERADMIN_USERNAME = (process.env.SUPERADMIN_USERNAME ?? 'superadmin').trim().toLowerCase() || 'superadmin';
const ALLOWED_ROLES = new Set<string>(Object.values(UserRole));
const ROLE_ORDER: UserRole[] = [UserRole.ADMIN, UserRole.DISPATCHER, UserRole.USER];

type EimzoBinding = {
  pinfl: string | null;
  inn: string | null;
  certificateSerial: string | null;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    private readonly eimzoAuthService: EimzoAuthService,
  ) {}

  private normalizeUsername(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private normalizeOptionalString(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private normalizeEmail(value: unknown): string | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized || null;
  }

  private normalizeDigits(value: unknown, maxLength: number): string | null {
    const normalized = String(value ?? '').replace(/\D+/g, '').slice(0, maxLength);
    return normalized || null;
  }

  private normalizeCertificateSerial(value: unknown): string | null {
    const normalized = String(value ?? '').replace(/[^0-9a-fA-F]/g, '').replace(/^0+/, '').toUpperCase();
    return normalized || null;
  }

  private parseCertificateObject(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object') return value as Record<string, any>;
    if (typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }

  private extractEimzoBinding(payload: any): EimzoBinding {
    const source = this.parseCertificateObject(payload?.key ?? payload?.certificate ?? payload);
    const pinfl = this.normalizeDigits(
      source.PINFL ?? source.pinfl ?? source.signerPinfl ?? source.UID ?? source.uid,
      14,
    );
    const inn = this.normalizeDigits(
      source.TIN ?? source.tin ?? source.INN ?? source.inn ?? source.signerInn,
      20,
    );
    const certificateSerial = this.normalizeCertificateSerial(
      source.serialNumber ??
      source.serial ??
      source.certificateSerial ??
      source.certificate_serial ??
      source.SERIALNUMBER,
    );

    if (!pinfl && !inn && !certificateSerial) {
      throw new BadRequestException('Tanlangan E-IMZO kalitidan PINFL, INN yoki sertifikat seriali olinmadi');
    }

    return {
      pinfl,
      inn,
      certificateSerial,
    };
  }

  private signerToEimzoBinding(signer: SignerInfo): EimzoBinding {
    return {
      pinfl: signer.pinfl,
      inn: signer.inn,
      certificateSerial: signer.certificateSerial,
    };
  }

  private ensureEimzoBindingsMatch(selected: EimzoBinding, signed: EimzoBinding): void {
    const mismatches = [
      selected.pinfl && signed.pinfl && selected.pinfl !== signed.pinfl,
      selected.inn && signed.inn && selected.inn !== signed.inn,
      selected.certificateSerial &&
        signed.certificateSerial &&
        selected.certificateSerial !== signed.certificateSerial,
    ];

    if (mismatches.some(Boolean)) {
      throw new BadRequestException('Tanlangan E-IMZO kaliti imzo bilan mos emas');
    }
  }

  private parseEimzoEnabled(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    const raw = String(value ?? '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled'].includes(raw)) return true;
    if (['false', '0', 'no', 'off', 'disabled'].includes(raw)) return false;
    return fallback;
  }

  private parseRole(value: unknown, fallback: UserRole): UserRole {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }

    if (!ALLOWED_ROLES.has(normalized)) {
      throw new BadRequestException('Noto\'g\'ri rol qiymati yuborildi');
    }

    return normalized as UserRole;
  }

  private parseActiveState(payload: any, fallback: boolean): boolean {
    if (typeof payload?.isActive === 'boolean') {
      return payload.isActive;
    }

    const statusRaw = String(payload?.status ?? '').trim().toLowerCase();
    if (statusRaw === 'active') return true;
    if (statusRaw === 'inactive') return false;

    return fallback;
  }

  private parsePermissions(value: unknown, role: UserRole): PermissionMap {
    return sanitizePermissionMap(value, role);
  }

  private async getPersistedRolePermission(role: UserRole): Promise<PermissionMap | null> {
    const entity = await this.rolePermissionRepo.findOne({ where: { role } });
    if (!entity) {
      return null;
    }
    return this.parsePermissions(entity.permissions, role);
  }

  private async upsertRolePermission(role: UserRole, permissions: PermissionMap): Promise<void> {
    const existing = await this.rolePermissionRepo.findOne({ where: { role } });
    if (existing) {
      existing.permissions = permissions;
      await this.rolePermissionRepo.save(existing);
      return;
    }

    const created = this.rolePermissionRepo.create({
      role,
      permissions,
    });
    await this.rolePermissionRepo.save(created);
  }

  private async resolveRolePermissions(role: UserRole, value?: unknown): Promise<PermissionMap> {
    if (value !== undefined) {
      return this.parsePermissions(value, role);
    }

    const persisted = await this.getPersistedRolePermission(role);
    if (persisted) {
      return persisted;
    }

    const roleUser = await this.userRepo.findOne({
      where: { role },
      order: { updated_at: 'DESC' },
    });

    if (roleUser) {
      return this.parsePermissions(roleUser.permissions, role);
    }

    return buildRoleDefaultPermissions(role);
  }

  private async ensureUsernameUnique(username: string, exceptId?: number): Promise<void> {
    const query = this.userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.username) = :username', { username });

    if (exceptId) {
      query.andWhere('user.id <> :exceptId', { exceptId });
    }

    const found = await query.getOne();
    if (found) {
      throw new BadRequestException('Bunday login allaqachon mavjud');
    }
  }

  private async ensureEmailUnique(email: string | null, exceptId?: number): Promise<void> {
    if (!email) return;

    const query = this.userRepo
      .createQueryBuilder('user')
      .where("LOWER(COALESCE(user.email, '')) = :email", { email });

    if (exceptId) {
      query.andWhere('user.id <> :exceptId', { exceptId });
    }

    const found = await query.getOne();
    if (found) {
      throw new BadRequestException('Bunday email allaqachon mavjud');
    }
  }

  async listUsers() {
    const users = await this.userRepo.find({
      order: {
        created_at: 'ASC',
      },
    });

    return users.map(toPublicUser);
  }

  async createUser(payload: any) {
    const username = this.normalizeUsername(payload?.username ?? payload?.login);
    const password = String(payload?.password ?? '').trim();
    const email = this.normalizeEmail(payload?.email);
    const fullName = this.normalizeOptionalString(payload?.fullName ?? payload?.full_name ?? payload?.name);
    const pinfl = this.normalizeDigits(payload?.pinfl, 14);
    const inn = this.normalizeDigits(payload?.inn, 20);
    const certificateSerial = this.normalizeCertificateSerial(payload?.certificateSerial ?? payload?.certificate_serial);
    const eimzoEnabled = this.parseEimzoEnabled(payload?.eimzoEnabled ?? payload?.eimzo_enabled, false);

    if (!username) {
      throw new BadRequestException('Login bo\'sh bo\'lishi mumkin emas');
    }

    if (!password || password.length < 6) {
      throw new BadRequestException('Parol kamida 6 ta belgidan iborat bo\'lishi kerak');
    }

    await this.ensureUsernameUnique(username);
    await this.ensureEmailUnique(email);

    const role = username === SUPERADMIN_USERNAME
      ? UserRole.ADMIN
      : this.parseRole(payload?.role, UserRole.USER);

    const permissions = username === SUPERADMIN_USERNAME
      ? buildFullPermissions()
      : await this.resolveRolePermissions(role, payload?.permissions);

    const isActive = username === SUPERADMIN_USERNAME
      ? true
      : this.parseActiveState(payload, true);

    const entity = this.userRepo.create({
      username,
      email,
      full_name: fullName,
      role,
      permissions,
      is_active: isActive,
      pinfl,
      inn,
      certificate_serial: certificateSerial,
      eimzo_enabled: eimzoEnabled,
      password_hash: hashPassword(password),
    });

    const saved = await this.userRepo.save(entity);
    return toPublicUser(saved);
  }

  async updateUser(id: number, payload: any) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const nextUsername = this.normalizeUsername(payload?.username ?? payload?.login ?? user.username);
    if (!nextUsername) {
      throw new BadRequestException('Login bo\'sh bo\'lishi mumkin emas');
    }

    const nextEmail = payload?.email === undefined ? this.normalizeEmail(user.email) : this.normalizeEmail(payload?.email);
    const nextFullName = payload?.fullName === undefined && payload?.full_name === undefined && payload?.name === undefined
      ? this.normalizeOptionalString(user.full_name)
      : this.normalizeOptionalString(payload?.fullName ?? payload?.full_name ?? payload?.name);
    const currentRole = user.role;

    await this.ensureUsernameUnique(nextUsername, user.id);
    await this.ensureEmailUnique(nextEmail, user.id);

    user.username = nextUsername;
    user.email = nextEmail;
    user.full_name = nextFullName;
    if (payload?.pinfl !== undefined) user.pinfl = this.normalizeDigits(payload?.pinfl, 14);
    if (payload?.inn !== undefined) user.inn = this.normalizeDigits(payload?.inn, 20);
    if (payload?.certificateSerial !== undefined || payload?.certificate_serial !== undefined) {
      user.certificate_serial = this.normalizeCertificateSerial(payload?.certificateSerial ?? payload?.certificate_serial);
    }
    if (payload?.eimzoEnabled !== undefined || payload?.eimzo_enabled !== undefined) {
      user.eimzo_enabled = this.parseEimzoEnabled(payload?.eimzoEnabled ?? payload?.eimzo_enabled, user.eimzo_enabled);
    }

    if (payload?.password !== undefined) {
      const password = String(payload.password ?? '').trim();
      if (!password || password.length < 6) {
        throw new BadRequestException('Parol kamida 6 ta belgidan iborat bo\'lishi kerak');
      }
      user.password_hash = hashPassword(password);
    }

    const isSuperAdmin = this.normalizeUsername(user.username) === SUPERADMIN_USERNAME;
    const targetRole = isSuperAdmin ? UserRole.ADMIN : this.parseRole(payload?.role, user.role);
    const hasPermissionsPayload = payload?.permissions !== undefined;

    if (isSuperAdmin) {
      user.username = SUPERADMIN_USERNAME;
      user.role = UserRole.ADMIN;
      user.permissions = buildFullPermissions();
      user.is_active = true;
    } else {
      user.role = targetRole;
      user.is_active = this.parseActiveState(payload, user.is_active);

      if (hasPermissionsPayload) {
        user.permissions = this.parsePermissions(payload?.permissions, user.role);
      } else if (user.role !== currentRole) {
        user.permissions = await this.resolveRolePermissions(user.role);
      } else {
        user.permissions = this.parsePermissions(user.permissions, user.role);
      }
    }

    const saved = await this.userRepo.save(user);
    return toPublicUser(saved);
  }

  async bindEimzo(id: number, payload: any) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const selectedBinding = this.extractEimzoBinding(payload);
    if (!String(payload?.challenge ?? '').trim() || !String(payload?.signature ?? '').trim()) {
      throw new BadRequestException('E-IMZO kalitni biriktirish uchun kalit paroli bilan imzo tasdiqlanishi kerak');
    }

    const signer = await this.eimzoAuthService.verifyChallengeSignature(payload);
    const signedBinding = this.signerToEimzoBinding(signer);
    this.ensureEimzoBindingsMatch(selectedBinding, signedBinding);

    const binding = {
      pinfl: signedBinding.pinfl ?? selectedBinding.pinfl,
      inn: signedBinding.inn ?? selectedBinding.inn,
      certificateSerial: signedBinding.certificateSerial ?? selectedBinding.certificateSerial,
    };

    if (binding.pinfl) user.pinfl = binding.pinfl;
    if (binding.inn) user.inn = binding.inn;
    if (binding.certificateSerial) user.certificate_serial = binding.certificateSerial;
    user.eimzo_enabled = true;

    const saved = await this.userRepo.save(user);
    return toPublicUser(saved);
  }

  async listRolePermissions() {
    const items = await Promise.all(
      ROLE_ORDER.map(async (role) => {
        const permissions = await this.resolveRolePermissions(role);

        return {
          role,
          permissions,
        };
      }),
    );

    return items;
  }

  async updateRolePermissions(roleRaw: string, permissionsPayload: unknown) {
    const role = this.parseRole(roleRaw, UserRole.USER);
    const nextPermissions = this.parsePermissions(permissionsPayload, role);
    await this.upsertRolePermission(role, nextPermissions);
    const roleUsers = await this.userRepo.find({ where: { role } });

    if (roleUsers.length > 0) {
      const updatedUsers = roleUsers.map((user) => {
        const username = this.normalizeUsername(user.username);
        if (username === SUPERADMIN_USERNAME) {
          user.permissions = buildFullPermissions();
          return user;
        }

        user.permissions = nextPermissions;
        return user;
      });

      await this.userRepo.save(updatedUsers);
    }

    return {
      role,
      permissions: nextPermissions,
    };
  }

  async deleteUser(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    if (this.normalizeUsername(user.username) === SUPERADMIN_USERNAME) {
      throw new BadRequestException('Superadmin foydalanuvchisini o\'chirish mumkin emas');
    }

    await this.userRepo.remove(user);
    return { ok: true };
  }
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  private parseUserId(rawId: string): number {
    const parsed = Number.parseInt(rawId, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Noto\'g\'ri foydalanuvchi ID');
    }
    return parsed;
  }

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    await this.authService.requireAdminFromAuthorization(authorization);
    return { items: await this.usersService.listUsers() };
  }

  @Get('role-permissions')
  async listRolePermissions(@Headers('authorization') authorization?: string) {
    await this.authService.requireAdminFromAuthorization(authorization);
    return { items: await this.usersService.listRolePermissions() };
  }

  @Post()
  async create(@Headers('authorization') authorization: string | undefined, @Body() body: any) {
    await this.authService.requireAdminFromAuthorization(authorization);
    return { user: await this.usersService.createUser(body) };
  }

  @Patch('role-permissions/:role')
  async updateRolePermissions(
    @Param('role') role: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    await this.authService.requireAdminFromAuthorization(authorization);
    return await this.usersService.updateRolePermissions(role, body?.permissions ?? body);
  }

  @Patch(':id/eimzo')
  async bindEimzo(
    @Param('id') idRaw: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    const actor = await this.authService.requireUserFromAuthorization(authorization);
    const id = this.parseUserId(idRaw);
    if (actor.id !== id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Faqat o\'z E-IMZO kalitingizni biriktirishingiz mumkin');
    }

    return { user: await this.usersService.bindEimzo(id, body) };
  }

  @Patch(':id')
  async update(
    @Param('id') idRaw: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    await this.authService.requireAdminFromAuthorization(authorization);
    const id = this.parseUserId(idRaw);
    return { user: await this.usersService.updateUser(id, body) };
  }

  @Delete(':id')
  async remove(@Param('id') idRaw: string, @Headers('authorization') authorization: string | undefined) {
    const actor = await this.authService.requireAdminFromAuthorization(authorization);
    const id = this.parseUserId(idRaw);

    if (actor.id === id) {
      throw new BadRequestException('O\'zingizni o\'chirish mumkin emas');
    }

    return this.usersService.deleteUser(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User, RolePermission]), AuthModule, EimzoAuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
