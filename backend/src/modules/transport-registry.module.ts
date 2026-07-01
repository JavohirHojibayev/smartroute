import { Body, Controller, Get, Logger, Module, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransportRegistrySnapshot } from '../entities/transport-registry-snapshot.entity';

const SNAPSHOT_ID = 1;
type TransportRecordLike = {
  id?: number;
  clientRecordId?: string;
  plate?: string;
  model?: string;
  owner?: string;
  issueDate?: string;
  certificateNumber?: string;
  completeness?: string;
  drivers?: unknown[];
};

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizePlateKey = (value: unknown) =>
  normalizeText(value)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9]/g, '');
const isPlaceholderLike = (value: unknown) => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === '' || normalized === '-' || normalized === "ma'lumot kiritilmagan" || normalized === 'malumot kiritilmagan';
};
const valueScore = (record: TransportRecordLike) => {
  const fields = [record.model, record.owner, record.issueDate, record.certificateNumber];
  return fields.reduce((acc, field) => (isPlaceholderLike(field) ? acc : acc + 1), 0);
};
const registryScore = (records: TransportRecordLike[]) =>
  records.reduce((acc, record) => {
    const driversBonus = Array.isArray(record.drivers) ? record.drivers.length * 2 : 0;
    const fullBonus = record.completeness === 'full' ? 3 : 0;
    return acc + valueScore(record) + driversBonus + fullBonus;
  }, 0);
const recordMergeKey = (record: TransportRecordLike, fallback: string) => {
  const cid = normalizeText(record.clientRecordId);
  if (cid) return `cid:${cid}`;
  const plate = normalizePlateKey(record.plate);
  if (plate) return `plate:${plate}`;
  const id = Number(record.id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;
  return `fallback:${fallback}`;
};
const mergePreservingMissing = (existing: TransportRecordLike[], incoming: TransportRecordLike[]) => {
  const byKey = new Map<string, TransportRecordLike>();
  const pickBetter = (left: TransportRecordLike, right: TransportRecordLike) => {
    return valueScore(right) >= valueScore(left) ? right : left;
  };

  existing.forEach((record, index) => {
    byKey.set(recordMergeKey(record, `existing-${index}`), record);
  });
  incoming.forEach((record, index) => {
    const key = recordMergeKey(record, `incoming-${index}`);
    const current = byKey.get(key);
    byKey.set(key, current ? pickBetter(current, record) : record);
  });
  return [...byKey.values()];
};

@Controller('integrations/transport-registry')
export class TransportRegistryController {
  private readonly logger = new Logger(TransportRegistryController.name);

  constructor(
    @InjectRepository(TransportRegistrySnapshot)
    private readonly repo: Repository<TransportRegistrySnapshot>,
  ) {}

  @Get()
  async getSnapshot() {
    const row = await this.repo.findOne({ where: { id: SNAPSHOT_ID } });
    if (!row?.records_json) {
      return { records: [], updatedAt: null as string | null };
    }
    try {
      const records = JSON.parse(row.records_json) as unknown;
      return {
        records: Array.isArray(records) ? records : [],
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      };
    } catch {
      this.logger.warn('transport_registry_snapshot: JSON parse xato');
      return { records: [], updatedAt: null as string | null };
    }
  }

  @Put()
  async putSnapshot(@Body() body: { records?: unknown }) {
    const incomingRecords = Array.isArray(body?.records) ? (body.records as TransportRecordLike[]) : [];
    const existing = await this.repo.findOne({ where: { id: SNAPSHOT_ID } });
    let existingRecords: TransportRecordLike[] = [];
    if (existing?.records_json) {
      try {
        const parsed = JSON.parse(existing.records_json) as unknown;
        existingRecords = Array.isArray(parsed) ? (parsed as TransportRecordLike[]) : [];
      } catch {
        existingRecords = [];
      }
    }

    const incomingScore = registryScore(incomingRecords);
    const existingScore = registryScore(existingRecords);
    const incomingCount = incomingRecords.length;
    const existingCount = existingRecords.length;
    const shouldProtectExisting =
      existingCount > 0 &&
      ((incomingCount === 0 && existingCount > 0) ||
        (incomingCount < existingCount && existingScore >= incomingScore) ||
        (incomingCount === existingCount && existingScore > incomingScore));

    const recordsToPersist = shouldProtectExisting
      ? mergePreservingMissing(existingRecords, incomingRecords)
      : incomingRecords;
    const json = JSON.stringify(recordsToPersist);

    if (existing) {
      existing.records_json = json;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ id: SNAPSHOT_ID, records_json: json }));
    }
    const saved = await this.repo.findOne({ where: { id: SNAPSHOT_ID } });
    return {
      ok: true,
      count: recordsToPersist.length,
      updatedAt: saved?.updated_at ? new Date(saved.updated_at).toISOString() : null,
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([TransportRegistrySnapshot])],
  controllers: [TransportRegistryController],
})
export class TransportRegistryModule {}
