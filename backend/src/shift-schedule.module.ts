import { Body, Controller, Get, Logger, Module, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShiftScheduleSnapshot } from './shift-schedule-snapshot.entity';

const SNAPSHOT_ID = 1;
type ShiftDraftLike = {
  matrixByBrigade?: Record<string, unknown[]>;
  totalsByBrigade?: Record<string, Record<string, unknown>>;
  yearlyStats?: Record<string, unknown[]>;
  rosterRows?: unknown[];
  vacationList?: unknown[];
  medicalList?: unknown[];
  businessTripList?: unknown[];
  isMonthScheduleCreated?: boolean;
};

const filledCount = (values: unknown): number => {
  if (!Array.isArray(values)) return 0;
  return values.reduce((acc, value) => {
    const normalized = String(value ?? '').trim();
    return normalized !== '' && normalized !== '-' ? acc + 1 : acc;
  }, 0);
};

const shiftDraftScore = (draft: ShiftDraftLike | null): number => {
  if (!draft) return 0;
  const brigades = ['A', 'B', 'V', 'G'];
  const matrixScore = brigades.reduce((acc, brigade) => acc + filledCount(draft.matrixByBrigade?.[brigade]), 0);
  const totalsScore = brigades.reduce((acc, brigade) => {
    const totals = draft.totalsByBrigade?.[brigade];
    if (!totals) return acc;
    return (
      acc +
      filledCount([
        totals.totalWorkDays,
        totals.totalNightPrimary,
        totals.totalNightSecondary,
        totals.totalDaytime,
        totals.holiday,
      ])
    );
  }, 0);
  const yearlyScore =
    filledCount(draft.yearlyStats?.totalWorkDays) +
    filledCount(draft.yearlyStats?.totalDaytime) +
    filledCount(draft.yearlyStats?.totalNight);
  const rosterScore = Array.isArray(draft.rosterRows)
    ? draft.rosterRows.reduce<number>((acc, row) => {
        if (!row || typeof row !== 'object') return acc;
        const shape = row as Record<string, unknown>;
        return (
          acc +
          filledCount([shape.brigadeA, shape.brigadeB, shape.brigadeV, shape.brigadeG, shape.role])
        );
      }, 0)
    : 0;
  const listScore = filledCount(draft.vacationList) + filledCount(draft.medicalList) + filledCount(draft.businessTripList);
  const createdBonus = draft.isMonthScheduleCreated ? 10 : 0;
  return matrixScore * 3 + totalsScore * 2 + yearlyScore * 2 + rosterScore + listScore + createdBonus;
};

const parseSavedAt = (draft: ShiftDraftLike | null): number => {
  if (!draft || typeof (draft as Record<string, unknown>).savedAt !== 'string') return 0;
  const time = Date.parse(String((draft as Record<string, unknown>).savedAt));
  return Number.isFinite(time) ? time : 0;
};

@Controller('integrations/shift-schedule')
export class ShiftScheduleController {
  private readonly logger = new Logger(ShiftScheduleController.name);

  constructor(
    @InjectRepository(ShiftScheduleSnapshot)
    private readonly repo: Repository<ShiftScheduleSnapshot>,
  ) {}

  @Get()
  async getSnapshot() {
    const row = await this.repo.findOne({ where: { id: SNAPSHOT_ID } });
    if (!row?.payload_json) {
      return { draft: null as unknown, updatedAt: null as string | null };
    }
    try {
      const draft = JSON.parse(row.payload_json) as unknown;
      return {
        draft,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      };
    } catch {
      this.logger.warn('shift_schedule_snapshot: JSON parse xato');
      return { draft: null, updatedAt: null as string | null };
    }
  }

  @Put()
  async putSnapshot(@Body() body: { draft?: unknown }) {
    const incomingDraft = (body?.draft ?? null) as ShiftDraftLike | null;
    const existing = await this.repo.findOne({ where: { id: SNAPSHOT_ID } });
    let existingDraft: ShiftDraftLike | null = null;
    if (existing?.payload_json) {
      try {
        existingDraft = JSON.parse(existing.payload_json) as ShiftDraftLike;
      } catch {
        existingDraft = null;
      }
    }
    const incomingScore = shiftDraftScore(incomingDraft);
    const existingScore = shiftDraftScore(existingDraft);
    const existingSavedAt = parseSavedAt(existingDraft);
    const incomingSavedAt = parseSavedAt(incomingDraft);
    const draftToPersist =
      existingDraft &&
      ((existingScore > incomingScore) ||
        (existingScore === incomingScore && existingSavedAt >= incomingSavedAt))
        ? existingDraft
        : incomingDraft;
    const json = JSON.stringify(draftToPersist);

    if (existing) {
      existing.payload_json = json;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ id: SNAPSHOT_ID, payload_json: json }));
    }
    const saved = await this.repo.findOne({ where: { id: SNAPSHOT_ID } });
    return {
      ok: true,
      updatedAt: saved?.updated_at ? new Date(saved.updated_at).toISOString() : null,
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ShiftScheduleSnapshot])],
  controllers: [ShiftScheduleController],
})
export class ShiftScheduleModule {}
