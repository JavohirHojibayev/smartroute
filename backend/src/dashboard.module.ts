import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { Trip, TripStatus } from './trip.entity';
import { MechanicalInspection } from './mechanical.entity';
import { CheckStatus, MedicalCheck } from './medical.entity';
import { AccessLog } from './integrations.module';

type ServicePriority = 'high' | 'medium';
type FleetTone = 'emerald' | 'blue' | 'amber' | 'red';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(MechanicalInspection)
    private readonly mechanicalRepo: Repository<MechanicalInspection>,
    @InjectRepository(MedicalCheck)
    private readonly medicalRepo: Repository<MedicalCheck>,
    @InjectRepository(AccessLog)
    private readonly accessRepo: Repository<AccessLog>,
  ) {}

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

  private normalizeEsmoResult(value: string | null | undefined): 'passed' | 'review' | 'failed' {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'passed') return 'passed';
    if (normalized === 'review' || normalized === 'manual_review' || normalized === "ko'rik" || normalized === 'korik') {
      return 'review';
    }
    return 'failed';
  }

  private toPercent(count: number, total: number) {
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((count / total) * 100)));
  }

  private toIsoHourLabel(hour: number) {
    const safe = Math.max(0, Math.min(23, hour));
    return `${String(safe).padStart(2, '0')}:00`;
  }

  private buildDemoLikeOverview() {
    const matrixRows = [
      { label: "Yo'lda", count: 108, percent: 76, tone: 'emerald' as FleetTone },
      { label: 'Navbatda', count: 21, percent: 15, tone: 'blue' as FleetTone },
      { label: "Ko'rikda", count: 9, percent: 6, tone: 'amber' as FleetTone },
      { label: "Ta'mirda", count: 4, percent: 3, tone: 'red' as FleetTone },
    ];

    return {
      generatedAt: new Date().toISOString(),
      mode: 'demo_like',
      kpis: {
        totalVehicles: 142,
        activeTrips: 93,
        totalMovementToday: 1240,
        utilizationPercent: 94.2,
      },
      access: {
        entrancesToday: 706,
        exitsToday: 158,
        failedToday: 3,
      },
      medical: {
        totalToday: 27,
        passedToday: 25,
        reviewToday: 0,
        failedToday: 2,
      },
      pulse: {
        fleetReadinessPercent: 91,
        flowToday: 1240,
        checksPassed: 126,
        checksTotal: 132,
        serviceQueue: [
          { plate: '10 O 001 OO', issue: 'Dvigatel moy sizishi', eta: '2 soat', priority: 'high' as ServicePriority },
          { plate: '40 L 444 LL', issue: 'Old tormoz diski', eta: '4 soat', priority: 'high' as ServicePriority },
          { plate: '01 K 888 KK', issue: 'Shina bosimi kalibrovka', eta: 'Bugun', priority: 'medium' as ServicePriority },
        ],
      },
      fleetMatrix: matrixRows,
      insight: {
        efficiencyPercent: 94,
        activeVehicles: 108,
        criticalRisk: 2,
        nextRefreshSeconds: 30,
      },
      telemetrySeries: [
        { time: '08:00', fuel: 4100, efficiency: 2400 },
        { time: '10:00', fuel: 3050, efficiency: 1398 },
        { time: '12:00', fuel: 2000, efficiency: 1800 },
        { time: '14:00', fuel: 2750, efficiency: 2100 },
        { time: '16:00', fuel: 1880, efficiency: 1700 },
        { time: '18:00', fuel: 2390, efficiency: 2000 },
        { time: '20:00', fuel: 3520, efficiency: 2450 },
      ],
    };
  }

  async getOverview() {
    const { start, end, dayKey } = this.getCurrentDayBoundsTashkent();

    const [
      totalVehicles,
      activeVehicles,
      activeTrips,
      pendingTrips,
      completedTripsToday,
      accessRowsToday,
      medicalRowsToday,
      mechanicalRowsToday,
    ] = await Promise.all([
      this.vehicleRepo.count(),
      this.vehicleRepo.count({ where: { is_active: true } }),
      this.tripRepo.count({ where: { status: TripStatus.ACTIVE } }),
      this.tripRepo.count({ where: { status: TripStatus.PENDING } }),
      this.tripRepo
        .createQueryBuilder('trip')
        .where('trip.status = :status', { status: TripStatus.COMPLETED })
        .andWhere('datetime(trip.created_at) >= datetime(:start)', { start: start.toISOString() })
        .andWhere('datetime(trip.created_at) < datetime(:end)', { end: end.toISOString() })
        .getCount(),
      this.accessRepo
        .createQueryBuilder('log')
        .where('datetime(log.access_time) >= datetime(:start)', { start: start.toISOString() })
        .andWhere('datetime(log.access_time) < datetime(:end)', { end: end.toISOString() })
        .orderBy('log.access_time', 'DESC')
        .getMany(),
      this.medicalRepo
        .createQueryBuilder('med')
        .where('COALESCE(med.exam_time, med.check_time) >= :start', { start: start.toISOString() })
        .andWhere('COALESCE(med.exam_time, med.check_time) < :end', { end: end.toISOString() })
        .orderBy('COALESCE(med.exam_time, med.check_time)', 'DESC')
        .addOrderBy('med.id', 'DESC')
        .getMany(),
      this.mechanicalRepo
        .createQueryBuilder('mech')
        .leftJoinAndSelect('mech.vehicle', 'vehicle')
        .where('datetime(mech.inspection_time) >= datetime(:start)', { start: start.toISOString() })
        .andWhere('datetime(mech.inspection_time) < datetime(:end)', { end: end.toISOString() })
        .orderBy('mech.inspection_time', 'DESC')
        .getMany(),
    ]);

    const entrancesToday = accessRowsToday.filter((row) => row.event_type === 'entrance').length;
    const exitsToday = accessRowsToday.filter((row) => row.event_type === 'exit').length;
    const accessFailedToday = accessRowsToday.filter((row) => row.status === CheckStatus.FAILED).length;

    let passedMedical = 0;
    let reviewMedical = 0;
    let failedMedical = 0;
    for (const row of medicalRowsToday) {
      const result = this.normalizeEsmoResult(row.esmo_result || row.status);
      if (result === 'passed') passedMedical += 1;
      else if (result === 'review') reviewMedical += 1;
      else failedMedical += 1;
    }

    let passedMechanical = 0;
    let warningMechanical = 0;
    let failedMechanical = 0;
    const failedVehicleIds = new Set<number>();

    for (const row of mechanicalRowsToday) {
      if (row.status === CheckStatus.PASSED) {
        passedMechanical += 1;
      } else if (row.status === CheckStatus.FAILED) {
        failedMechanical += 1;
        if (row.vehicle?.id) failedVehicleIds.add(row.vehicle.id);
      } else {
        warningMechanical += 1;
      }
    }

    const checksTotal = passedMechanical + warningMechanical + failedMechanical;
    const inactiveVehicles = Math.max(0, totalVehicles - activeVehicles);
    const vehiclesInRepair = Math.max(inactiveVehicles, failedVehicleIds.size);
    const inspectionCount = warningMechanical + reviewMedical;

    const matrixRows: Array<{ label: string; count: number; tone: FleetTone }> = [
      { label: "Yo'lda", count: activeTrips, tone: 'emerald' },
      { label: 'Navbatda', count: pendingTrips, tone: 'blue' },
      { label: "Ko'rikda", count: inspectionCount, tone: 'amber' },
      { label: "Ta'mirda", count: vehiclesInRepair, tone: 'red' },
    ];

    const matrixTotalBase = Math.max(
      1,
      totalVehicles,
      matrixRows.reduce((acc, row) => acc + row.count, 0),
    );

    const serviceQueue = mechanicalRowsToday
      .filter((row) => row.status !== CheckStatus.PASSED)
      .slice(0, 5)
      .map((row) => {
        const priority: ServicePriority = row.status === CheckStatus.FAILED ? 'high' : 'medium';
        const rawNote = String(row.notes || '').trim();
        return {
          plate: row.vehicle?.plate_number || `#${row.vehicle?.id ?? row.id}`,
          issue: rawNote || (row.status === CheckStatus.FAILED ? 'Texnik nosozlik aniqlandi' : "Qo'shimcha texnik ko'rik"),
          eta: row.status === CheckStatus.FAILED ? '2 soat' : 'Bugun',
          priority,
        };
      });

    const fleetReadinessPercent = totalVehicles > 0
      ? this.toPercent(Math.max(activeVehicles - failedVehicleIds.size, 0), totalVehicles)
      : 0;

    const efficiencyPercent = checksTotal > 0
      ? this.toPercent(passedMechanical, checksTotal)
      : medicalRowsToday.length > 0
        ? this.toPercent(passedMedical, medicalRowsToday.length)
        : 0;

    const totalMovementToday = completedTripsToday > 0
      ? completedTripsToday
      : entrancesToday + exitsToday;

    const telemetrySeries = Array.from({ length: 7 }, (_, idx) => 8 + idx * 2).map((hour) => {
      const windowStart = new Date(`${dayKey}T${String(hour).padStart(2, '0')}:00:00+05:00`);
      const windowEnd = new Date(windowStart.getTime() + 2 * 60 * 60 * 1000);

      const accessCount = accessRowsToday.filter((row) => {
        const ms = new Date(row.access_time).getTime();
        return !Number.isNaN(ms) && ms >= windowStart.getTime() && ms < windowEnd.getTime();
      }).length;

      const medicalPassedInWindow = medicalRowsToday.filter((row) => {
        const ts = row.exam_time || row.check_time;
        const ms = ts ? new Date(ts).getTime() : NaN;
        if (Number.isNaN(ms) || ms < windowStart.getTime() || ms >= windowEnd.getTime()) return false;
        return this.normalizeEsmoResult(row.esmo_result || row.status) === 'passed';
      }).length;

      return {
        time: this.toIsoHourLabel(hour),
        fuel: accessCount,
        efficiency: medicalPassedInWindow,
      };
    });

    const dataVolume =
      totalVehicles +
      activeTrips +
      pendingTrips +
      completedTripsToday +
      accessRowsToday.length +
      medicalRowsToday.length +
      mechanicalRowsToday.length;

    const sparseForInvestorDemo = dataVolume < 30;
    if (sparseForInvestorDemo) {
      return this.buildDemoLikeOverview();
    }

    return {
      generatedAt: new Date().toISOString(),
      mode: 'live',
      kpis: {
        totalVehicles,
        activeTrips,
        totalMovementToday,
        utilizationPercent: totalVehicles > 0 ? Number(((activeTrips / totalVehicles) * 100).toFixed(1)) : 0,
      },
      access: {
        entrancesToday,
        exitsToday,
        failedToday: accessFailedToday,
      },
      medical: {
        totalToday: passedMedical + reviewMedical + failedMedical,
        passedToday: passedMedical,
        reviewToday: reviewMedical,
        failedToday: failedMedical,
      },
      pulse: {
        fleetReadinessPercent,
        flowToday: totalMovementToday,
        checksPassed: passedMechanical,
        checksTotal,
        serviceQueue,
      },
      fleetMatrix: matrixRows.map((row) => ({
        ...row,
        percent: this.toPercent(row.count, matrixTotalBase),
      })),
      insight: {
        efficiencyPercent,
        activeVehicles,
        criticalRisk: failedMechanical + failedMedical,
        nextRefreshSeconds: 30,
      },
      telemetrySeries,
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async overview() {
    return this.dashboardService.getOverview();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, Trip, MechanicalInspection, MedicalCheck, AccessLog])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
