import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AuthModule, AuthService } from './auth.module';
import { MechanicalInspection } from '../entities/mechanical.entity';
import { CheckStatus } from '../entities/medical.entity';
import { FuelType, Vehicle, VehicleCategory } from '../entities/vehicle.entity';

type InspectionStatus = 'passed' | 'pending' | 'failed';

@Injectable()
export class MechanicService {
  constructor(
    @InjectRepository(MechanicalInspection)
    private readonly mechanicalRepo: Repository<MechanicalInspection>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  private normalizeWhitespace(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  private normalizePlate(value: unknown): string {
    const normalized = this.normalizeWhitespace(value).toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Davlat raqami kiritilishi shart');
    }
    return normalized;
  }

  private toPlateKey(value: string): string {
    return value.replace(/[^A-Z0-9]/g, '');
  }

  private normalizeModel(value: unknown): string {
    const normalized = this.normalizeWhitespace(value);
    return normalized || "Ma'lumot kiritilmagan";
  }

  private normalizeNotes(value: unknown): string | null {
    const normalized = this.normalizeWhitespace(value);
    return normalized || null;
  }

  private normalizeStatus(value: unknown, fallback: CheckStatus = CheckStatus.PENDING): CheckStatus {
    const normalized = this.normalizeWhitespace(value).toLowerCase();
    if (!normalized) return fallback;

    if (normalized === 'passed' || normalized === 'ok' || normalized === 'soz') {
      return CheckStatus.PASSED;
    }
    if (
      normalized === 'pending' ||
      normalized === 'review' ||
      normalized === 'conditional' ||
      normalized === 'warning' ||
      normalized === "ko'rik" ||
      normalized === 'korik'
    ) {
      return CheckStatus.PENDING;
    }
    if (normalized === 'failed' || normalized === 'rejected' || normalized === 'nosoz') {
      return CheckStatus.FAILED;
    }

    throw new BadRequestException('Noto\'g\'ri status qiymati');
  }

  private parseDate(value: unknown, fallback: Date = new Date()): Date {
    const raw = this.normalizeWhitespace(value);
    if (!raw) return fallback;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Noto\'g\'ri sana formati');
    }
    return parsed;
  }

  private statusToClient(status: CheckStatus): InspectionStatus {
    if (status === CheckStatus.PASSED) return 'passed';
    if (status === CheckStatus.FAILED) return 'failed';
    return 'pending';
  }

  private getCurrentDayBoundsTashkent() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';

    const dayKey = `${year}-${month}-${day}`;
    const start = new Date(`${dayKey}T00:00:00+05:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { dayKey, start, end };
  }

  private async findVehicleByPlate(plate: string): Promise<Vehicle | null> {
    const plateKey = this.toPlateKey(plate);
    return this.vehicleRepo
      .createQueryBuilder('vehicle')
      .where("UPPER(REPLACE(vehicle.plate_number, ' ', '')) = :plateKey", { plateKey })
      .getOne();
  }

  private buildSyntheticVin(plate: string): string {
    const plateKey = this.toPlateKey(plate);
    const seed = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    return `AUTO-${plateKey || 'VEH'}-${seed}`.slice(0, 100);
  }

  private async findOrCreateVehicle(plateRaw: unknown, modelRaw?: unknown): Promise<Vehicle> {
    const plate = this.normalizePlate(plateRaw);
    const model = this.normalizeModel(modelRaw);
    const existing = await this.findVehicleByPlate(plate);
    if (existing) {
      if (!existing.model || existing.model === "Ma'lumot kiritilmagan") {
        existing.model = model;
        await this.vehicleRepo.save(existing);
      }
      return existing;
    }

    // Mechanical checks should still work even if Fleet table is empty.
    const created = this.vehicleRepo.create({
      plate_number: plate,
      vin_code: this.buildSyntheticVin(plate),
      model,
      category: VehicleCategory.TRUCK,
      fuel_type: FuelType.DIESEL,
      is_active: true,
      current_odometer: 0,
    });

    try {
      return await this.vehicleRepo.save(created);
    } catch {
      const fallback = await this.findVehicleByPlate(plate);
      if (fallback) return fallback;
      throw new BadRequestException('Transport yaratib bo\'lmadi');
    }
  }

  private serializeInspection(row: MechanicalInspection) {
    return {
      id: row.id,
      vehicleId: row.vehicle?.id ?? null,
      plate: row.vehicle?.plate_number ?? '-',
      model: row.vehicle?.model ?? "Ma'lumot kiritilmagan",
      status: this.statusToClient(row.status),
      notes: row.notes || '',
      inspectionTime: row.inspection_time ? new Date(row.inspection_time).toISOString() : null,
      mechanicName: row.mechanic?.full_name || row.mechanic?.username || null,
    };
  }

  async getSummary(dateFromRaw?: string, dateToRaw?: string, scopeRaw?: string) {
    const scope = this.normalizeWhitespace(scopeRaw).toLowerCase();
    const showAllByDefault = scope === 'all';
    const dayBounds = this.getCurrentDayBoundsTashkent();
    const start = dateFromRaw ? this.parseDate(dateFromRaw, dayBounds.start) : (showAllByDefault ? null : dayBounds.start);
    const end = dateToRaw ? new Date(this.parseDate(dateToRaw, dayBounds.end).getTime() + 24 * 60 * 60 * 1000) : (showAllByDefault ? null : dayBounds.end);

    let query = this.mechanicalRepo.createQueryBuilder('inspection');
    if (start) {
      query = query.andWhere('datetime(inspection.inspection_time) >= datetime(:start)', { start: start.toISOString() });
    }
    if (end) {
      query = query.andWhere('datetime(inspection.inspection_time) < datetime(:end)', { end: end.toISOString() });
    }

    const rows = await query.getMany();

    let passedToday = 0;
    let pendingToday = 0;
    let failedToday = 0;
    for (const row of rows) {
      if (row.status === CheckStatus.PASSED) passedToday += 1;
      else if (row.status === CheckStatus.FAILED) failedToday += 1;
      else pendingToday += 1;
    }

    return {
      day: showAllByDefault && !dateFromRaw && !dateToRaw ? '' : dayBounds.dayKey,
      totalToday: rows.length,
      passedToday,
      pendingToday,
      failedToday,
    };
  }

  async listInspections(params: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    pageSize?: string;
  }) {
    const search = this.normalizeWhitespace(params.search).toLowerCase();
    const statusRaw = this.normalizeWhitespace(params.status).toLowerCase();
    const hasStatusFilter = statusRaw && statusRaw !== 'all';

    const page = Math.max(1, Number.parseInt(String(params.page ?? '1'), 10) || 1);
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(String(params.pageSize ?? '100'), 10) || 100));

    let query = this.mechanicalRepo
      .createQueryBuilder('inspection')
      .leftJoinAndSelect('inspection.vehicle', 'vehicle')
      .leftJoinAndSelect('inspection.mechanic', 'mechanic');

    if (params.dateFrom) {
      const start = this.parseDate(params.dateFrom);
      query = query.andWhere('datetime(inspection.inspection_time) >= datetime(:start)', { start: start.toISOString() });
    }
    if (params.dateTo) {
      const end = this.parseDate(params.dateTo);
      const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      query = query.andWhere('datetime(inspection.inspection_time) < datetime(:end)', { end: endExclusive.toISOString() });
    }

    if (search) {
      query = query.andWhere(
        '(LOWER(vehicle.plate_number) LIKE :q OR LOWER(vehicle.model) LIKE :q OR LOWER(COALESCE(inspection.notes, \'\')) LIKE :q)',
        { q: `%${search}%` },
      );
    }

    if (hasStatusFilter) {
      query = query.andWhere('inspection.status = :status', { status: this.normalizeStatus(statusRaw) });
    }

    const total = await query.getCount();
    const rows = await query
      .orderBy('inspection.inspection_time', 'DESC')
      .addOrderBy('inspection.id', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany();

    return {
      items: rows.map((row) => this.serializeInspection(row)),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async createInspection(payload: any, actorUserId?: number) {
    const vehicle = await this.findOrCreateVehicle(payload?.plate, payload?.model);
    const status = this.normalizeStatus(payload?.status, CheckStatus.PENDING);
    const notes = this.normalizeNotes(payload?.notes);
    const inspectionTime = this.parseDate(payload?.inspectionTime, new Date());

    const entity = this.mechanicalRepo.create({
      vehicle,
      status,
      notes,
      mechanic: actorUserId ? ({ id: actorUserId } as any) : null,
      inspection_time: inspectionTime,
    });

    const saved = await this.mechanicalRepo.save(entity);
    const hydrated = await this.mechanicalRepo.findOne({
      where: { id: saved.id },
      relations: ['vehicle', 'mechanic'],
    });
    if (!hydrated) {
      throw new NotFoundException('Yangi texnik ko\'rik topilmadi');
    }
    return this.serializeInspection(hydrated);
  }

  async updateInspection(id: number, payload: any, actorUserId?: number) {
    const row = await this.mechanicalRepo.findOne({
      where: { id },
      relations: ['vehicle', 'mechanic'],
    });
    if (!row) {
      throw new NotFoundException('Texnik ko\'rik topilmadi');
    }

    if (payload?.plate !== undefined || payload?.model !== undefined) {
      const nextPlate = payload?.plate ?? row.vehicle?.plate_number;
      const nextModel = payload?.model ?? row.vehicle?.model;
      row.vehicle = await this.findOrCreateVehicle(nextPlate, nextModel);
    }

    if (payload?.status !== undefined) {
      row.status = this.normalizeStatus(payload.status, row.status || CheckStatus.PENDING);
    }
    if (payload?.notes !== undefined) {
      row.notes = this.normalizeNotes(payload.notes);
    }
    if (payload?.inspectionTime !== undefined) {
      row.inspection_time = this.parseDate(payload.inspectionTime, row.inspection_time || new Date());
    }
    if (actorUserId) {
      row.mechanic = { id: actorUserId } as any;
    }

    const saved = await this.mechanicalRepo.save(row);
    const hydrated = await this.mechanicalRepo.findOne({
      where: { id: saved.id },
      relations: ['vehicle', 'mechanic'],
    });
    if (!hydrated) {
      throw new NotFoundException('Yangilangan texnik ko\'rik topilmadi');
    }
    return this.serializeInspection(hydrated);
  }

  async deleteInspection(id: number) {
    const row = await this.mechanicalRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Texnik ko\'rik topilmadi');
    }

    try {
      await this.mechanicalRepo.remove(row);
      return { ok: true };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new BadRequestException('Bu texnik ko\'rik safar yozuviga bog\'langanligi uchun o\'chirib bo\'lmaydi');
      }
      throw error;
    }
  }
}

@Controller('mechanic')
export class MechanicController {
  constructor(
    private readonly mechanicService: MechanicService,
    private readonly authService: AuthService,
  ) {}

  private parseId(idRaw: string): number {
    const id = Number.parseInt(String(idRaw), 10);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Noto\'g\'ri ID');
    }
    return id;
  }

  @Get('summary')
  async summary(
    @Headers('authorization') authorization: string | undefined,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('scope') scope?: string,
  ) {
    await this.authService.requireUserFromAuthorization(authorization);
    return this.mechanicService.getSummary(dateFrom, dateTo, scope);
  }

  @Get('inspections')
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    await this.authService.requireUserFromAuthorization(authorization);
    return this.mechanicService.listInspections({ search, status, dateFrom, dateTo, page, pageSize });
  }

  @Post('inspections')
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    const actor = await this.authService.requireUserFromAuthorization(authorization);
    return this.mechanicService.createInspection(body, actor.id);
  }

  @Patch('inspections/:id')
  async update(
    @Param('id') idRaw: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    const actor = await this.authService.requireUserFromAuthorization(authorization);
    return this.mechanicService.updateInspection(this.parseId(idRaw), body, actor.id);
  }

  @Delete('inspections/:id')
  async remove(
    @Param('id') idRaw: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.authService.requireUserFromAuthorization(authorization);
    return this.mechanicService.deleteInspection(this.parseId(idRaw));
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([MechanicalInspection, Vehicle]), AuthModule],
  controllers: [MechanicController],
  providers: [MechanicService],
})
export class MechanicModule {}
