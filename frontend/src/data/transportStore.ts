import { transportRegistry, type TransportRecord } from './transportRegistry';

const TRANSPORT_STORAGE_KEY = 'smartroute.transport.registry.v1';
const TRANSPORT_MIGRATION_KEY = 'smartroute.transport.registry.migration.v23';
const TRANSPORT_BACKUP_KEY = 'smartroute.transport.registry.backup.v1';
const LEGACY_TRANSPORT_STORAGE_KEYS = [
  'smartroute.transport.registry',
  'smartroute_transport_registry',
  'smartroute.transportRegistry',
  'smartroute.transport.registry.v0',
  'smartroute.transport.registry.backup',
  'smartroute.transport.registry.old',
];

type TransportDriver = TransportRecord['drivers'][number];

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const cloneRegistry = (records: TransportRecord[]): TransportRecord[] => deepClone(records);

const getDefaultRegistry = (): TransportRecord[] => cloneRegistry(transportRegistry);

const PLACEHOLDER = '-';
const MODEL_PLACEHOLDER = "Ma'lumot kiritilmagan";

const PLACEHOLDER_VALUES = new Set(
  ['', '-', "ma'lumot kiritilmagan", 'malumot kiritilmagan'].map((value) => value.toLowerCase()),
);

const MOJIBAKE_DASH_VALUES = new Set(
  [
    '\u0432\u0402\u2014',
    '\u0432\u0402\u201d',
    '\u0420\u0406\u0420\u201a\u0432\u0402\u2014',
    '\u0420\u0406\u0420\u201a\u0432\u0402\u201d',
  ].map((value) => value.toLowerCase()),
);

const WIN1251_REVERSE_MAP: Map<string, number> | null = (() => {
  try {
    const decoder = new TextDecoder('windows-1251');
    const reverse = new Map<string, number>();
    for (let i = 0; i < 256; i += 1) {
      reverse.set(decoder.decode(Uint8Array.of(i)), i);
    }
    return reverse;
  } catch {
    return null;
  }
})();

const looksLikeMojibake = (value: string) =>
  /Ð|Ñ|Ã|Â|вЂ|в„|�|[Ѓѓ‚„…†‡€‰Љ‹ЊЋЏ™љ›њћџ]|(?:Р|С)[^а-яёА-ЯЁ]/.test(value);

const mojibakeScore = (value: string) =>
  (value.match(/(?:Р.|С.|Ð|Ñ|Ã|Â|вЂ|в„|�)/g) || []).length;

const decodeMojibakeOnce = (value: string) => {
  if (!WIN1251_REVERSE_MAP) return value;
  if (!looksLikeMojibake(value)) return value;

  const bytes: number[] = [];
  for (const ch of value) {
    const byte = WIN1251_REVERSE_MAP.get(ch);
    if (byte == null) return value;
    bytes.push(byte);
  }

  const decoded = new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
  if (!decoded.trim()) return value;
  if (decoded.includes('�') && !value.includes('�')) return value;

  return mojibakeScore(decoded) < mojibakeScore(value) ? decoded : value;
};

const decodePotentialMojibake = (value: string) => {
  let current = value;
  for (let i = 0; i < 2; i += 1) {
    const next = decodeMojibakeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
};

const normalizeText = (value: unknown) => decodePotentialMojibake(String(value ?? '')).trim();

const normalizePlate = (value: string) => normalizeText(value).replace(/\s+/g, ' ').toUpperCase();
const normalizePlateKey = (value: string) => normalizePlate(value).replace(/[^A-Z0-9]/g, '');

const isPlaceholderLike = (value: unknown) => {
  const normalized = normalizeText(value).toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized) || MOJIBAKE_DASH_VALUES.has(normalized);
};

const normalizeValue = (value: unknown, fallback = PLACEHOLDER) => {
  if (isPlaceholderLike(value)) return fallback;
  return normalizeText(value);
};

const normalizeIdentity = (identity: TransportDriver['identity']): TransportDriver['identity'] => {
  if (!identity) return null;
  const document = normalizeText(identity.document);
  const raw = normalizeText(identity.raw);
  const expiryDateRaw = normalizeText(identity.expiryDate ?? '');
  return {
    document,
    raw,
    expiryDate: expiryDateRaw || null,
  };
};

const normalizeDriver = (driver: TransportDriver): TransportDriver => ({
  ...driver,
  fullName: normalizeText(driver.fullName),
  identity: normalizeIdentity(driver.identity),
});

const inferVehicleType = (model: string) => {
  const normalized = model.toLowerCase();
  if (normalized.includes('shacman') || normalized.includes('shaanxi') || normalized.includes('man tgs')) {
    return "Yuk o'zi ag'daruvchi";
  }
  return PLACEHOLDER;
};

const BACKFILL_FIELDS: Array<
  | 'model'
  | 'color'
  | 'owner'
  | 'address'
  | 'issueDate'
  | 'issuingAuthority'
  | 'certificateNumber'
  | 'manufactureYear'
  | 'vehicleType'
  | 'chassisNumber'
  | 'totalWeightKg'
  | 'curbWeightKg'
  | 'engineNumber'
  | 'enginePower'
  | 'fuelType'
  | 'seatCount'
  | 'standingCapacity'
  | 'specialNotes'
> = [
  'model',
  'color',
  'owner',
  'address',
  'issueDate',
  'issuingAuthority',
  'certificateNumber',
  'manufactureYear',
  'vehicleType',
  'chassisNumber',
  'totalWeightKg',
  'curbWeightKg',
  'engineNumber',
  'enginePower',
  'fuelType',
  'seatCount',
  'standingCapacity',
  'specialNotes',
];

/** Har bir transport yozuvi uchun barqaror kalit — davlat raqami bilan bir xil qilib qotmaslik */
const stableClientRecordId = (record: TransportRecord): string => {
  const raw = typeof record.clientRecordId === 'string' ? record.clientRecordId.trim() : '';
  if (raw) return raw;
  const nid = Number(record.id);
  const pk = normalizePlateKey(record.plate);
  if (Number.isFinite(nid) && nid > 0) return `legacy-${nid}-${pk}`;
  return `legacy-${pk || 'noplate'}-${Math.random().toString(36).slice(2, 11)}`;
};

const mergeWithSeed = (
  record: TransportRecord,
  seedByPlate: Map<string, TransportRecord>,
  seedByPlateKey: Map<string, TransportRecord>,
  seedById: Map<number, TransportRecord>,
): TransportRecord => {
  const seed =
    seedById.get(Number(record.id)) ??
    seedByPlate.get(normalizePlate(record.plate)) ??
    seedByPlateKey.get(normalizePlateKey(record.plate));
  if (!seed) return record;

  const merged: TransportRecord = {
    ...record,
    drivers: Array.isArray(record.drivers) && record.drivers.length > 0 ? record.drivers : deepClone(seed.drivers),
  };

  BACKFILL_FIELDS.forEach((field) => {
    const currentValue = merged[field];
    const seedValue = seed[field];
    if (isPlaceholderLike(currentValue) && !isPlaceholderLike(seedValue)) {
      (merged[field] as string | undefined) = (seedValue as string).trim();
    }
  });

  if (merged.completeness !== 'full' && seed.completeness === 'full') {
    const hasCoreFields =
      !isPlaceholderLike(merged.model) && !isPlaceholderLike(merged.owner) && !isPlaceholderLike(merged.issueDate);
    if (hasCoreFields) {
      merged.completeness = 'full';
    }
  }

  if (merged.source === 'xlsx' && seed.source !== 'xlsx') {
    merged.source = seed.source;
  }

  return merged;
};

const normalizeRecord = (record: TransportRecord): TransportRecord => ({
  ...record,
  id: Number(record.id),
  clientRecordId: stableClientRecordId(record),
  plate: normalizePlate(record.plate),
  model: normalizeValue(record.model, MODEL_PLACEHOLDER),
  color: normalizeValue(record.color),
  owner: normalizeValue(record.owner),
  address: normalizeValue(record.address),
  issueDate: normalizeValue(record.issueDate),
  issuingAuthority: normalizeValue(record.issuingAuthority),
  certificateNumber: normalizeValue(record.certificateNumber),
  manufactureYear: normalizeValue(record.manufactureYear),
  vehicleType: normalizeValue(record.vehicleType, inferVehicleType(record.model)),
  chassisNumber: normalizeValue(record.chassisNumber),
  totalWeightKg: normalizeValue(record.totalWeightKg),
  curbWeightKg: normalizeValue(record.curbWeightKg),
  engineNumber: normalizeValue(record.engineNumber),
  enginePower: normalizeValue(record.enginePower),
  fuelType: normalizeValue(record.fuelType, 'Dizel'),
  seatCount: normalizeValue(record.seatCount, '2'),
  standingCapacity: normalizeValue(record.standingCapacity, '0'),
  specialNotes: normalizeValue(record.specialNotes),
  completeness: record.completeness === 'full' ? 'full' : 'partial',
  source: record.source === 'pdf' || record.source === 'pdf+xlsx' ? record.source : 'xlsx',
  drivers: Array.isArray(record.drivers) ? record.drivers.map(normalizeDriver) : [],
});

const sourceRank = (source: TransportRecord['source']) => {
  if (source === 'pdf+xlsx') return 3;
  if (source === 'pdf') return 2;
  return 1;
};

const hasCoreFields = (record: TransportRecord) =>
  !isPlaceholderLike(record.model) && !isPlaceholderLike(record.owner) && !isPlaceholderLike(record.issueDate);

const vehicleDataScore = (record: TransportRecord) =>
  BACKFILL_FIELDS.reduce((acc, field) => (isPlaceholderLike(record[field]) ? acc : acc + 1), 0);

const transportRegistryScore = (records: TransportRecord[]) =>
  records.reduce((acc, record) => {
    const normalized = normalizeRecord(record);
    const driversScore = (normalized.drivers?.length ?? 0) * 12;
    const fullBonus = normalized.completeness === 'full' ? 8 : 0;
    return acc + vehicleDataScore(normalized) + driversScore + fullBonus;
  }, 0);

const parseSavedAt = (value: unknown) => {
  if (typeof value !== 'string') return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
};

const countUniquePlates = (records: TransportRecord[]) => {
  const seen = new Set(
    records
      .map((record) => normalizePlateKey(record.plate))
      .filter((key) => key !== ''),
  );
  return seen.size;
};

const extractRecordsFromPayload = (payload: unknown): TransportRecord[] | null => {
  if (Array.isArray(payload)) return payload as TransportRecord[];
  if (!payload || typeof payload !== 'object') return null;

  const shape = payload as Record<string, unknown>;
  if (Array.isArray(shape.records)) return shape.records as TransportRecord[];
  if (Array.isArray(shape.registry)) return shape.registry as TransportRecord[];
  if (Array.isArray(shape.items)) return shape.items as TransportRecord[];
  if (Array.isArray(shape.data)) return shape.data as TransportRecord[];
  if (Array.isArray(shape.transportRegistry)) return shape.transportRegistry as TransportRecord[];
  if (shape.draft && typeof shape.draft === 'object') {
    const draftShape = shape.draft as Record<string, unknown>;
    if (Array.isArray(draftShape.records)) return draftShape.records as TransportRecord[];
    if (Array.isArray(draftShape.registry)) return draftShape.registry as TransportRecord[];
    if (Array.isArray(draftShape.items)) return draftShape.items as TransportRecord[];
    if (Array.isArray(draftShape.data)) return draftShape.data as TransportRecord[];
  }

  const nestedCandidateKeys = Object.keys(shape);
  for (const key of nestedCandidateKeys) {
    const value = shape[key];
    if (Array.isArray(value)) {
      const looksLikeTransportArray = value.some((entry) => isLikelyTransportRecord(entry));
      if (looksLikeTransportArray) {
        return value as TransportRecord[];
      }
    }
    if (value && typeof value === 'object') {
      const nested = extractRecordsFromPayload(value);
      if (nested && nested.length > 0) return nested;
    }
  }

  return null;
};

const isLikelyTransportRecord = (value: unknown): value is TransportRecord => {
  if (!value || typeof value !== 'object') return false;
  const shape = value as Record<string, unknown>;
  const hasPlate = typeof shape.plate === 'string' && shape.plate.trim() !== '';
  if (!hasPlate) return false;

  const hasStrongTransportField =
    Array.isArray(shape.drivers) ||
    typeof shape.owner === 'string' ||
    typeof shape.certificateNumber === 'string' ||
    typeof shape.issuingAuthority === 'string' ||
    typeof shape.completeness === 'string' ||
    typeof shape.source === 'string';

  if (hasStrongTransportField) return true;

  const hasModelWithOwnership =
    typeof shape.model === 'string' &&
    (typeof shape.owner === 'string' || typeof shape.certificateNumber === 'string');
  return hasModelWithOwnership;
};

type LegacyDriverPayloadRow = {
  plate: string;
  firstDriverName: string;
  firstDocument: string;
  secondDriverName: string;
  secondDocument: string;
};

const normalizeMaybeString = (value: unknown) => String(value ?? '').trim();

const extractLegacyDriverRowsFromArray = (rows: unknown[]): LegacyDriverPayloadRow[] => {
  const result: LegacyDriverPayloadRow[] = [];

  rows.forEach((rawRow) => {
    if (!rawRow || typeof rawRow !== 'object') return;
    const row = rawRow as Record<string, unknown>;

    const plate = normalizeMaybeString(
      row.plate ??
      row.plate_number ??
      row.plateNumber ??
      row.davlatRaqami ??
      row.stateNumber ??
      row.number,
    );
    if (!plate) return;

    let firstDriverName = normalizeMaybeString(
      row.firstDriverName ??
      row.first_driver_name ??
      row.driver1 ??
      row['1-haydovchi'] ??
      row.firstDriver,
    );
    let secondDriverName = normalizeMaybeString(
      row.secondDriverName ??
      row.second_driver_name ??
      row.driver2 ??
      row['2-haydovchi'] ??
      row.secondDriver,
    );
    let firstDocument = normalizeMaybeString(
      row.firstDocument ??
      row.first_document ??
      row.firstPassport ??
      row.firstId ??
      row.firstPassportId,
    );
    let secondDocument = normalizeMaybeString(
      row.secondDocument ??
      row.second_document ??
      row.secondPassport ??
      row.secondId ??
      row.secondPassportId,
    );

    const nestedDrivers = Array.isArray(row.drivers) ? row.drivers : [];
    nestedDrivers.forEach((rawDriver) => {
      if (!rawDriver || typeof rawDriver !== 'object') return;
      const driver = rawDriver as Record<string, unknown>;
      const roleRaw = normalizeMaybeString(driver.role).toLowerCase();
      const fullName = normalizeMaybeString(driver.fullName ?? driver.name);
      const identityDoc = normalizeMaybeString(
        (driver.identity as Record<string, unknown> | undefined)?.document ??
        driver.document ??
        driver.passport ??
        driver.idDocument,
      );

      const isFirst = roleRaw.includes('1') || roleRaw.includes('bir') || roleRaw.includes('first');
      const isSecond = roleRaw.includes('2') || roleRaw.includes('ikki') || roleRaw.includes('second');

      if (isFirst) {
        if (fullName) firstDriverName = fullName;
        if (identityDoc) firstDocument = identityDoc;
      }
      if (isSecond) {
        if (fullName) secondDriverName = fullName;
        if (identityDoc) secondDocument = identityDoc;
      }
    });

    if (!firstDriverName && !secondDriverName && !firstDocument && !secondDocument) return;

    result.push({
      plate,
      firstDriverName,
      firstDocument,
      secondDriverName,
      secondDocument,
    });
  });

  return result;
};

const extractLegacyDriverRowsFromPayload = (payload: unknown): LegacyDriverPayloadRow[] => {
  if (Array.isArray(payload)) return extractLegacyDriverRowsFromArray(payload);
  if (!payload || typeof payload !== 'object') return [];

  const shape = payload as Record<string, unknown>;
  const candidateArrays: unknown[] = [
    shape.rows,
    shape.items,
    shape.data,
    shape.drivers,
    shape.records,
    shape.registry,
    shape.driverRegistry,
    shape.payload,
    shape.draft,
    shape.state,
  ];

  for (const candidate of candidateArrays) {
    if (Array.isArray(candidate)) {
      const parsed = extractLegacyDriverRowsFromArray(candidate);
      if (parsed.length > 0) return parsed;
    }

    if (candidate && typeof candidate === 'object') {
      const nested = extractLegacyDriverRowsFromPayload(candidate);
      if (nested.length > 0) return nested;
    }
  }

  return [];
};

type RegistryCandidate = {
  key: string;
  records: TransportRecord[];
  uniquePlateCount: number;
  score: number;
  savedAt: number;
};

const readRegistryCandidate = (key: string): RegistryCandidate | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const extracted = extractRecordsFromPayload(parsed);
    if (!extracted || extracted.length === 0) return null;
    const records = extracted.filter(isLikelyTransportRecord);
    if (records.length === 0) return null;

    const savedAt =
      typeof parsed === 'object' && parsed !== null
        ? parseSavedAt((parsed as Record<string, unknown>).savedAt)
        : 0;

    return {
      key,
      records,
      uniquePlateCount: countUniquePlates(records),
      score: transportRegistryScore(records),
      savedAt,
    };
  } catch {
    return null;
  }
};

const compareCandidates = (a: RegistryCandidate, b: RegistryCandidate) => {
  const lengthDiff = b.uniquePlateCount - a.uniquePlateCount;
  if (lengthDiff !== 0) return lengthDiff;
  const scoreDiff = b.score - a.score;
  if (scoreDiff !== 0) return scoreDiff;
  const savedDiff = b.savedAt - a.savedAt;
  if (savedDiff !== 0) return savedDiff;
  return 0;
};

const pickBestCandidate = (keys: string[]): RegistryCandidate | null => {
  const candidates = keys
    .map((key) => readRegistryCandidate(key))
    .filter((candidate): candidate is RegistryCandidate => candidate !== null);
  if (candidates.length === 0) return null;
  candidates.sort(compareCandidates);
  return candidates[0];
};

const collectPotentialRecoveryKeys = () => {
  const keys = new Set<string>([TRANSPORT_BACKUP_KEY, ...LEGACY_TRANSPORT_STORAGE_KEYS]);
  for (let idx = 0; idx < window.localStorage.length; idx += 1) {
    const key = window.localStorage.key(idx);
    if (!key) continue;
    keys.add(key);
  }
  return [...keys];
};

const collectLegacyDriverRows = (keys: string[]): LegacyDriverPayloadRow[] => {
  const mergedRows: LegacyDriverPayloadRow[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      const rows = extractLegacyDriverRowsFromPayload(parsed);
      rows.forEach((row) => {
        const dedupKey = [
          normalizePlateKey(row.plate),
          row.firstDriverName.trim().toLowerCase(),
          row.secondDriverName.trim().toLowerCase(),
          row.firstDocument.trim().toLowerCase(),
          row.secondDocument.trim().toLowerCase(),
        ].join('|');
        if (seen.has(dedupKey)) return;
        seen.add(dedupKey);
        mergedRows.push(row);
      });
    } catch {
      // Ignore non-JSON and malformed payloads.
    }
  }

  return mergedRows;
};

const upsertDriverByRole = (drivers: TransportDriver[], incoming: TransportDriver) => {
  const index = drivers.findIndex((driver) => driver.role === incoming.role);
  if (index < 0) {
    drivers.push(deepClone(incoming));
    return;
  }

  const current = drivers[index];
  const incomingName = incoming.fullName.trim();
  const currentName = current.fullName.trim();
  const incomingDoc = incoming.identity?.document?.trim() ?? '';
  const currentDoc = current.identity?.document?.trim() ?? '';

  if (!currentName && incomingName) {
    drivers[index] = deepClone(incoming);
    return;
  }

  if (!currentDoc && incomingDoc) {
    drivers[index] = deepClone(incoming);
    return;
  }

  if (incomingName || incomingDoc) {
    drivers[index] = deepClone(incoming);
  }
};

const mergeDuplicatePlateGroup = (group: TransportRecord[]): TransportRecord => {
  const sortedByBestVehicle = [...group].sort((a, b) => {
    const scoreDiff = vehicleDataScore(b) - vehicleDataScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    if (a.completeness !== b.completeness) return a.completeness === 'full' ? -1 : 1;
    const sourceDiff = sourceRank(b.source) - sourceRank(a.source);
    if (sourceDiff !== 0) return sourceDiff;
    return a.id - b.id;
  });

  const merged = deepClone(sortedByBestVehicle[0]);

  BACKFILL_FIELDS.forEach((field) => {
    if (!isPlaceholderLike(merged[field])) return;
    const candidate = group.find((record) => !isPlaceholderLike(record[field]));
    if (candidate) {
      (merged[field] as string | undefined) = normalizeValue(candidate[field]);
    }
  });

  const bestSource = [...group].sort((a, b) => sourceRank(b.source) - sourceRank(a.source))[0]?.source;
  if (bestSource) merged.source = bestSource;
  merged.completeness = hasCoreFields(merged) ? 'full' : 'partial';

  const mergedDrivers: TransportDriver[] = [];
  [...group]
    .sort((a, b) => a.id - b.id)
    .forEach((record) => {
      (record.drivers ?? []).forEach((driver) => {
        if (!driver || (typeof driver.fullName !== 'string' && !driver.identity)) return;
        upsertDriverByRole(mergedDrivers, driver);
      });
    });
  merged.drivers = mergedDrivers;

  return normalizeRecord(merged);
};

const buildRecordFingerprint = (record: TransportRecord) => {
  const firstDriver = record.drivers?.find((driver) => driver.role === '1-haydovchi');
  const secondDriver = record.drivers?.find((driver) => driver.role === '2-haydovchi');
  return [
    normalizePlateKey(record.plate),
    normalizeText(record.model).toLowerCase(),
    normalizeText(record.owner).toLowerCase(),
    normalizeText(record.certificateNumber).toLowerCase(),
    normalizeText(firstDriver?.fullName ?? '').toLowerCase(),
    normalizeText(secondDriver?.fullName ?? '').toLowerCase(),
  ].join('|');
};

const getRecordMergeKey = (record: TransportRecord, fallback: string) => {
  const cid = typeof record.clientRecordId === 'string' ? record.clientRecordId.trim() : '';
  if (cid) return `cid:${cid}`;
  const plateKey = normalizePlateKey(record.plate);
  if (plateKey) return `plate:${plateKey}`;
  const numericId = Number(record.id);
  if (Number.isFinite(numericId) && numericId > 0) return `id:${numericId}`;
  return `fp:${buildRecordFingerprint(record) || fallback}`;
};

/** Faqat bir xil `clientRecordId` bo‘lsa birlashtiramiz; turli transportlar davlat raqami o‘xshash bo‘lsa ham saqlanadi */
const collapseDuplicateRecords = (records: TransportRecord[]) => {
  const byCid = new Map<string, TransportRecord>();
  for (const record of records) {
    const normalized = normalizeRecord(record);
    const cid = normalized.clientRecordId ?? stableClientRecordId(normalized);
    const prev = byCid.get(cid);
    if (!prev) {
      byCid.set(cid, normalized);
      continue;
    }
    byCid.set(cid, mergeDuplicatePlateGroup([prev, normalized]));
  }
  return Array.from(byCid.values());
};

const applyOneTimeMigrations = (records: TransportRecord[], defaults: TransportRecord[]) => {
  if (typeof window === 'undefined') return records;

  const alreadyMigrated = window.localStorage.getItem(TRANSPORT_MIGRATION_KEY) === 'done';
  if (alreadyMigrated) return records;

  const byPlateKey = new Map(defaults.map((record) => [normalizePlateKey(record.plate), normalizeRecord(record)]));
  const next = [...records];
  const existingKeys = new Set(next.map((record) => normalizePlateKey(record.plate)));
  const existingIds = new Set(next.map((record) => Number(record.id)));

  // Recovery: in previous migration versions 01 M022335 could be overwritten to 01 M022433.
  // Restore 01 M022335 as a separate row if it is missing now.
  if (!existingKeys.has('01M022335')) {
    const source433 = next.find((record) => normalizePlateKey(record.plate) === '01M022433');
    if (source433) {
      const maxId = next.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0);
      next.push({
        ...deepClone(source433),
        id: maxId + 1,
        plate: '01 M022335',
      });
      existingKeys.add('01M022335');
    }
  }

  // Required seed introduced later; add once if missing.
  const requiredSeedPlates = [
    '01371BGA',
    '01M022433',
    '01M022432',
    '01M022431',
    '01M022332',
    '01M022360',
    '01M022429',
    '01M022333',
    '01M022330',
    '01M022328',
    '01M022331',
    '01M022334',
    '01M022359',
    '01M022329',
    '01M022430',
    '70802UBA',
  ];
  requiredSeedPlates.forEach((plateKey) => {
    if (existingKeys.has(plateKey)) return;
    const seedRecord = byPlateKey.get(plateKey);
    if (!seedRecord) return;
    next.push(seedRecord);
    existingKeys.add(plateKey);
    existingIds.add(Number(seedRecord.id));
  });

  // 01 M022335 was historically reconstructed from 01 M022433; enforce canonical seed values.
  const plate335Key = '01M022335';
  const seed335 = byPlateKey.get(plate335Key);
  if (seed335) {
    const idx335 = next.findIndex((record) => normalizePlateKey(record.plate) === plate335Key);
    if (idx335 >= 0) {
      const prev335 = next[idx335];
      next[idx335] = {
        ...seed335,
        clientRecordId: prev335.clientRecordId,
        drivers: prev335.drivers?.length ? prev335.drivers : seed335.drivers,
      };
    } else {
      next.push(seed335);
      existingKeys.add(plate335Key);
      existingIds.add(Number(seed335.id));
    }
  }

  // Keep canonical certificate values for 70T 838AB (historically edited with conflicting local variants).
  const plate838Key = '70T838AB';
  const seed838 = byPlateKey.get(plate838Key);
  if (seed838) {
    const idx838 = next.findIndex((record) => normalizePlateKey(record.plate) === plate838Key);
    if (idx838 >= 0) {
      const prev838 = next[idx838];
      next[idx838] = {
        ...seed838,
        clientRecordId: prev838.clientRecordId,
        drivers: prev838.drivers?.length ? prev838.drivers : seed838.drivers,
      };
    } else {
      next.push(seed838);
      existingKeys.add(plate838Key);
      existingIds.add(Number(seed838.id));
    }
  }

  // Keep canonical certificate values for 70 947 LBA as well.
  const plate947Key = '70947LBA';
  const seed947 = byPlateKey.get(plate947Key);
  if (seed947) {
    const idx947 = next.findIndex((record) => normalizePlateKey(record.plate) === plate947Key);
    if (idx947 >= 0) {
      const prev947 = next[idx947];
      next[idx947] = {
        ...seed947,
        clientRecordId: prev947.clientRecordId,
        drivers: prev947.drivers?.length ? prev947.drivers : seed947.drivers,
      };
    } else {
      next.push(seed947);
      existingKeys.add(plate947Key);
      existingIds.add(Number(seed947.id));
    }
  }

  // Keep canonical certificate values for 70129RBA.
  const plate129Key = '70129RBA';
  const seed129 = byPlateKey.get(plate129Key);
  if (seed129) {
    const idx129 = next.findIndex((record) => normalizePlateKey(record.plate) === plate129Key);
    if (idx129 >= 0) {
      const prev129 = next[idx129];
      next[idx129] = {
        ...seed129,
        clientRecordId: prev129.clientRecordId,
        drivers: prev129.drivers?.length ? prev129.drivers : seed129.drivers,
      };
    } else {
      next.push(seed129);
      existingKeys.add(plate129Key);
      existingIds.add(Number(seed129.id));
    }
  }

  // Keep canonical certificate values for 70 946 LBA.
  const plate946Key = '70946LBA';
  const seed946 = byPlateKey.get(plate946Key);
  if (seed946) {
    const idx946 = next.findIndex((record) => normalizePlateKey(record.plate) === plate946Key);
    if (idx946 >= 0) {
      const prev946 = next[idx946];
      next[idx946] = {
        ...seed946,
        clientRecordId: prev946.clientRecordId,
        drivers: prev946.drivers?.length ? prev946.drivers : seed946.drivers,
      };
    } else {
      next.push(seed946);
      existingKeys.add(plate946Key);
      existingIds.add(Number(seed946.id));
    }
  }

  window.localStorage.setItem(TRANSPORT_MIGRATION_KEY, 'done');
  return next;
};

const hydrateRegistry = (records: TransportRecord[]) => {
  const defaults = getDefaultRegistry();
  const seedByPlate = new Map(defaults.map((record) => [normalizePlate(record.plate), record]));
  const seedByPlateKey = new Map(defaults.map((record) => [normalizePlateKey(record.plate), record]));
  const seedById = new Map(defaults.map((record) => [Number(record.id), record]));
  const normalized = records.map((record) =>
    normalizeRecord(mergeWithSeed(record, seedByPlate, seedByPlateKey, seedById)),
  );
  const migrated = applyOneTimeMigrations(normalized, defaults);
  const collapsed = collapseDuplicateRecords(migrated);

  return collapsed;
};

/** Serverdan kelgan JSONni lokal format + seed bilan bir xil qilish */
export const hydrateTransportRegistryRecords = (records: TransportRecord[]): TransportRecord[] => hydrateRegistry(records);

const buildIdentityFromDocument = (documentRaw: string): TransportDriver['identity'] => {
  const document = normalizeText(documentRaw);
  if (!document || isPlaceholderLike(document)) return null;
  return {
    document,
    raw: document,
    expiryDate: null,
  };
};

const applyLegacyDriverRows = (
  records: TransportRecord[],
  driverRows: LegacyDriverPayloadRow[],
): TransportRecord[] => {
  if (driverRows.length === 0) return records;

  const legacyByPlate = new Map<string, LegacyDriverPayloadRow[]>();
  driverRows.forEach((row) => {
    const key = normalizePlateKey(row.plate);
    if (!key) return;
    const list = legacyByPlate.get(key) ?? [];
    list.push(row);
    legacyByPlate.set(key, list);
  });

  const merged = records.map((record) => {
    const key = normalizePlateKey(record.plate);
    const legacyRowsForPlate = legacyByPlate.get(key);
    if (!legacyRowsForPlate || legacyRowsForPlate.length === 0) return record;

    const nextDrivers = [...(record.drivers ?? [])];

    legacyRowsForPlate.forEach((legacyRow) => {
      const firstName = normalizeText(legacyRow.firstDriverName);
      const secondName = normalizeText(legacyRow.secondDriverName);
      const firstExisting = nextDrivers.find((driver) => driver.role === '1-haydovchi');
      const secondExisting = nextDrivers.find((driver) => driver.role === '2-haydovchi');
      const firstHasData =
        (firstExisting?.fullName?.trim() ?? '') !== '' ||
        (firstExisting?.identity?.document?.trim() ?? '') !== '';
      const secondHasData =
        (secondExisting?.fullName?.trim() ?? '') !== '' ||
        (secondExisting?.identity?.document?.trim() ?? '') !== '';

      if (firstName && !isPlaceholderLike(firstName) && !firstHasData) {
        upsertDriverByRole(nextDrivers, {
          role: '1-haydovchi',
          fullName: firstName,
          identity: buildIdentityFromDocument(legacyRow.firstDocument),
        });
      }
      if (secondName && !isPlaceholderLike(secondName) && !secondHasData) {
        upsertDriverByRole(nextDrivers, {
          role: '2-haydovchi',
          fullName: secondName,
          identity: buildIdentityFromDocument(legacyRow.secondDocument),
        });
      }
    });

    return {
      ...record,
      drivers: nextDrivers,
    };
  });

  return merged;
};

export const loadTransportRegistry = (): TransportRecord[] => {
  if (typeof window === 'undefined') {
    return hydrateRegistry(getDefaultRegistry());
  }

  const primaryCandidate = readRegistryCandidate(TRANSPORT_STORAGE_KEY);
  const recoveryCandidate = primaryCandidate
    ? null
    : pickBestCandidate(collectPotentialRecoveryKeys());
  const activeCandidate = primaryCandidate ?? recoveryCandidate;
  if (activeCandidate) {
    const legacyDriverRows =
      activeCandidate.key === TRANSPORT_STORAGE_KEY
        ? []
        : collectLegacyDriverRows(LEGACY_TRANSPORT_STORAGE_KEYS);
    const hydrated = applyLegacyDriverRows(hydrateRegistry(activeCandidate.records), legacyDriverRows);
    window.localStorage.setItem(
      TRANSPORT_STORAGE_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), records: hydrated }),
    );
    window.localStorage.setItem(
      TRANSPORT_BACKUP_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), records: hydrated }),
    );
    return hydrated;
  }

  const fallback = applyLegacyDriverRows(
    hydrateRegistry(getDefaultRegistry()),
    collectLegacyDriverRows(LEGACY_TRANSPORT_STORAGE_KEYS),
  );
  window.localStorage.setItem(
    TRANSPORT_STORAGE_KEY,
    JSON.stringify({ savedAt: new Date().toISOString(), records: fallback }),
  );
  window.localStorage.setItem(
    TRANSPORT_BACKUP_KEY,
    JSON.stringify({ savedAt: new Date().toISOString(), records: fallback }),
  );
  return fallback;
};

export const saveTransportRegistry = (records: TransportRecord[]) => {
  if (typeof window === 'undefined') return;

  const mergePreservingMissing = (existing: TransportRecord[], incoming: TransportRecord[]) => {
    const byKey = new Map<string, TransportRecord>();
    existing.forEach((record, index) => {
      byKey.set(getRecordMergeKey(record, `ex:${index}`), record);
    });
    incoming.forEach((record, index) => {
      byKey.set(getRecordMergeKey(record, `in:${index}`), record);
    });
    return [...byKey.values()];
  };

  const uniquePlateCount = (items: TransportRecord[]) => {
    const set = new Set(items.map((record) => normalizePlateKey(record.plate)).filter(Boolean));
    return set.size;
  };

  let safeInput = records;
  let existingHydrated: TransportRecord[] = [];
  try {
    const raw = window.localStorage.getItem(TRANSPORT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const extracted = extractRecordsFromPayload(parsed);
    if (Array.isArray(extracted) && extracted.length > 0) {
      const existing = hydrateRegistry(extracted as TransportRecord[]);
      existingHydrated = existing;
      const existingByPlate = new Map(existing.map((record) => [normalizePlate(record.plate), record]));
      const existingByPlateKey = new Map(existing.map((record) => [normalizePlateKey(record.plate), record]));
      const existingById = new Map(existing.map((record) => [Number(record.id), record]));

      safeInput = records.map((record) =>
        mergeWithSeed(record, existingByPlate, existingByPlateKey, existingById),
      );
    }
  } catch {
    safeInput = records;
  }

  const incomingHydrated = hydrateRegistry(safeInput);
  const incomingCount = uniquePlateCount(incomingHydrated);
  const existingCount = uniquePlateCount(existingHydrated);
  const incomingScore = transportRegistryScore(incomingHydrated);
  const existingScore = transportRegistryScore(existingHydrated);

  let hydrated = incomingHydrated;
  const suspiciousPlateDrop = existingCount > incomingCount + 1 && existingScore >= incomingScore;
  const suspiciousRowDrop =
    existingHydrated.length > incomingHydrated.length + 1 && existingScore >= incomingScore - 2;
  if (suspiciousPlateDrop || suspiciousRowDrop) {
    hydrated = hydrateRegistry(mergePreservingMissing(existingHydrated, incomingHydrated));
  }

  window.localStorage.setItem(
    TRANSPORT_STORAGE_KEY,
    JSON.stringify({ savedAt: new Date().toISOString(), records: hydrated }),
  );
  window.localStorage.setItem(
    TRANSPORT_BACKUP_KEY,
    JSON.stringify({ savedAt: new Date().toISOString(), records: hydrated }),
  );
};
