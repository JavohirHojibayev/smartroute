import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { motion } from 'framer-motion';
import { Table2, FileText, PlusCircle, X, Save, LogOut } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { downloadXlsSections } from '../../utils/exportXls';
import { resolveApiBaseUrl } from '../../utils/apiBase';
import { useI18n } from '../../i18n';
import { LocalizedDateInput } from '../../components/shared/LocalizedDateInput';

const API_BASE = resolveApiBaseUrl();

type BrigadeKey = 'A' | 'B' | 'V' | 'G';

type RosterRow = {
    index: number;
    brigadeA: string;
    brigadeB: string;
    brigadeV: string;
    brigadeG: string;
    role: string;
};

type BrigadeTotals = {
    totalWorkDays: string;
    totalNightPrimary: string;
    totalNightSecondary: string;
    totalDaytime: string;
    holiday: string;
};

type YearlyStatKey = 'totalWorkDays' | 'totalDaytime' | 'totalNight';

const BRIGADES: BrigadeKey[] = ['A', 'B', 'V', 'G'];

const createDefaultRosterRows = (): RosterRow[] => ([
    { index: 1, brigadeA: '', brigadeB: '', brigadeV: '', brigadeG: '', role: '' },
    { index: 2, brigadeA: '', brigadeB: '', brigadeV: '', brigadeG: '', role: '' },
]);

const normalizeLoadedRosterRows = (rows: RosterRow[]): RosterRow[] => {
    const normalized = rows.map((row, idx) => ({
        index: idx + 1,
        brigadeA: String(row?.brigadeA ?? ''),
        brigadeB: String(row?.brigadeB ?? ''),
        brigadeV: String(row?.brigadeV ?? ''),
        brigadeG: String(row?.brigadeG ?? ''),
        role: String(row?.role ?? ''),
    }));

    let lastFilledIndex = -1;
    normalized.forEach((row, idx) => {
        const hasValue =
            row.brigadeA.trim() ||
            row.brigadeB.trim() ||
            row.brigadeV.trim() ||
            row.brigadeG.trim() ||
            row.role.trim();
        if (hasValue) lastFilledIndex = idx;
    });

    if (normalized.length === 0) return createDefaultRosterRows();

    if (lastFilledIndex < 0) {
        const kept = Math.max(normalized.length, 2);
        return normalized.slice(0, kept).map((row, idx) => ({ ...row, index: idx + 1 }));
    }

    const minLength = Math.max(normalized.length, lastFilledIndex + 1, 2);
    return normalized.slice(0, minLength).map((row, idx) => ({ ...row, index: idx + 1 }));
};

const VACATION_BASE: string[] = ['', ''];
const MEDICAL_BASE: string[] = ['', ''];
const BUSINESS_TRIP_BASE: string[] = ['', ''];

const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const UZ_MONTH_NAMES = [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentyabr',
    'oktyabr',
    'noyabr',
    'dekabr',
];
const SHIFT_TOTAL_HEADERS = ['Jami ish kuni', 'Jami tungi', 'Jami tungi', 'Jami kunduzgi', 'Bayram'];
const ROSTER_TABLE_HEADERS = ['#', 'Brigada A', 'Brigada B', 'Brigada V', 'Brigada G', 'Lavozimi'];
const LIST_TABLE_HEADERS = ['Dendagilar', 'Mexnat tatiliga chiqqanlar', 'Bulitinga chiqganlar'];
const SHIFT_SCHEDULE_DRAFT_KEY = 'smartroute_shift_schedule_draft';
const SHIFT_SCHEDULE_BACKUP_KEY = 'smartroute_shift_schedule_draft_backup_v1';
const LEGACY_SHIFT_SCHEDULE_KEYS = [
    'smartroute_shift_schedule',
    'smartroute_shift_schedule_v1',
    'smartroute_shift_schedule_backup',
    'smartroute.smena.grafigi.draft',
    'smartroute.smena.grafigi',
];

const getCurrentMonthValue = () => new Date().toISOString().slice(0, 7);

const getMonthBounds = (monthValue: string) => {
    const [yearRaw, monthRaw] = monthValue.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!year || !month) {
        const fallbackMonth = getCurrentMonthValue();
        return {
            from: `${fallbackMonth}-01`,
            to: `${fallbackMonth}-${String(new Date().getDate()).padStart(2, '0')}`,
        };
    }
    const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, '0');
    return {
        from: `${monthValue}-01`,
        to: `${monthValue}-${lastDay}`,
    };
};

const getMonthSerial = (monthValue: string): number | null => {
    const [yearRaw, monthRaw] = monthValue.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!year || !month || month < 1 || month > 12) return null;
    return year * 12 + (month - 1);
};

const getMonthIndex = (monthValue: string): number => {
    const monthRaw = monthValue.split('-')[1] ?? '';
    const month = Number(monthRaw);
    return month >= 1 && month <= 12 ? month - 1 : -1;
};

const buildDefaultMatrix = (dayCount: number): Record<BrigadeKey, string[]> => {
    return BRIGADES.reduce((acc, brigade) => {
        acc[brigade] = Array.from({ length: dayCount }, () => '');
        return acc;
    }, {} as Record<BrigadeKey, string[]>);
};

const buildDefaultTotals = (): Record<BrigadeKey, BrigadeTotals> => {
    return BRIGADES.reduce((acc, brigade) => {
        acc[brigade] = {
            totalWorkDays: '',
            totalNightPrimary: '',
            totalNightSecondary: '',
            totalDaytime: '',
            holiday: '',
        };
        return acc;
    }, {} as Record<BrigadeKey, BrigadeTotals>);
};

const buildDefaultYearlyStats = (): Record<YearlyStatKey, string[]> => ({
    // Mart andozasi asosida demo qiymatlar (yanvar-fevral) va mart tasdiqlangan ko'rsatkichlari.
    totalWorkDays: ['15', '15', '16', '', '', '', '', '', '', '', '', ''],
    totalDaytime: ['118', '121', '124', '', '', '', '', '', '', '', '', ''],
    totalNight: ['58', '60', '62', '', '', '', '', '', '', '', '', ''],
});

type ShiftDraftPayload = {
    scheduleMonth?: string;
    dateFrom?: string;
    dateTo?: string;
    isMonthScheduleCreated?: boolean;
    matrixByBrigade?: Record<BrigadeKey, string[]>;
    totalsByBrigade?: Record<BrigadeKey, BrigadeTotals>;
    yearlyStats?: Record<YearlyStatKey, string[]>;
    rosterRows?: RosterRow[];
    vacationList?: string[];
    medicalList?: string[];
    businessTripList?: string[];
    savedAt?: string;
};

const isValidMonthValue = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);

const countFilledStrings = (values: unknown): number => {
    if (!Array.isArray(values)) return 0;
    return values.reduce((acc, value) => {
        const normalized = String(value ?? '').trim();
        return normalized !== '' && normalized !== '-' ? acc + 1 : acc;
    }, 0);
};

const scoreShiftDraft = (draft: ShiftDraftPayload): number => {
    const matrixScore = BRIGADES.reduce((acc, brigade) => acc + countFilledStrings(draft.matrixByBrigade?.[brigade]), 0);
    const totalsScore = BRIGADES.reduce((acc, brigade) => {
        const totals = draft.totalsByBrigade?.[brigade];
        if (!totals) return acc;
        return (
            acc +
            countFilledStrings([
                totals.totalWorkDays,
                totals.totalNightPrimary,
                totals.totalNightSecondary,
                totals.totalDaytime,
                totals.holiday,
            ])
        );
    }, 0);
    const yearlyScore =
        countFilledStrings(draft.yearlyStats?.totalWorkDays) +
        countFilledStrings(draft.yearlyStats?.totalDaytime) +
        countFilledStrings(draft.yearlyStats?.totalNight);
    const rosterScore = Array.isArray(draft.rosterRows)
        ? draft.rosterRows.reduce((acc, row) => {
              return (
                  acc +
                  countFilledStrings([row.brigadeA, row.brigadeB, row.brigadeV, row.brigadeG, row.role])
              );
          }, 0)
        : 0;
    const listScore =
        countFilledStrings(draft.vacationList) +
        countFilledStrings(draft.medicalList) +
        countFilledStrings(draft.businessTripList);

    const createdBonus = draft.isMonthScheduleCreated ? 10 : 0;
    return matrixScore * 3 + totalsScore * 2 + yearlyScore * 2 + rosterScore + listScore + createdBonus;
};

const extractShiftDraftShape = (value: unknown): ShiftDraftPayload | null => {
    if (!value || typeof value !== 'object') return null;
    const shape = value as Record<string, unknown>;
    if (
        'matrixByBrigade' in shape ||
        'totalsByBrigade' in shape ||
        'yearlyStats' in shape ||
        'rosterRows' in shape ||
        'scheduleMonth' in shape
    ) {
        return shape as ShiftDraftPayload;
    }

    for (const key of ['draft', 'payload', 'data', 'state', 'value']) {
        const nested = shape[key];
        const candidate = extractShiftDraftShape(nested);
        if (candidate) return candidate;
    }

    return null;
};

const parseSavedAt = (value: unknown) => {
    if (typeof value !== 'string') return 0;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
};

type ShiftDraftCandidate = {
    key: string;
    draft: ShiftDraftPayload;
    score: number;
    savedAt: number;
};

const buildShiftCandidate = (key: string): ShiftDraftCandidate | null => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    const draft = extractShiftDraftShape(parsed);
    if (!draft) return null;
    const root = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const outerSavedAt = root ? parseSavedAt(root.savedAt) : 0;
    const innerSavedAt = parseSavedAt(draft.savedAt);
    return {
        key,
        draft,
        score: scoreShiftDraft(draft),
        savedAt: Math.max(outerSavedAt, innerSavedAt),
    };
};

const compareShiftCandidates = (a: ShiftDraftCandidate, b: ShiftDraftCandidate) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return b.savedAt - a.savedAt;
};

const pickDraftBetweenLocalAndServer = (
    localBest: ShiftDraftCandidate | null,
    serverDraft: ShiftDraftPayload | null,
    serverUpdatedAt: string | null,
): ShiftDraftPayload | null => {
    if (!serverDraft) return localBest?.draft ?? null;
    if (!localBest) return serverDraft;

    const sScore = scoreShiftDraft(serverDraft);
    const lScore = scoreShiftDraft(localBest.draft);
    const sTime = parseSavedAt(serverUpdatedAt);
    const lTime = localBest.savedAt;

    if (lScore > sScore) return localBest.draft;
    if (sScore > lScore) return serverDraft;
    return lTime >= sTime ? localBest.draft : serverDraft;
};

const collectShiftRecoveryKeys = () => {
    const keys = new Set<string>([
        SHIFT_SCHEDULE_BACKUP_KEY,
        ...LEGACY_SHIFT_SCHEDULE_KEYS,
    ]);

    for (let idx = 0; idx < localStorage.length; idx += 1) {
        const key = localStorage.key(idx);
        if (!key) continue;
        const normalized = key.toLowerCase();
        if (
            normalized.includes('smartroute') &&
            (normalized.includes('shift') || normalized.includes('smena') || normalized.includes('grafik'))
        ) {
            keys.add(key);
        }
    }

    return [...keys];
};

const parseNumeric = (value: string): number | null => {
    const normalized = String(value ?? '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '')
        .trim();
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
};

const averageFrom = (values: Array<number | null>): number | null => {
    const numeric = values.filter((v): v is number => v != null);
    if (numeric.length === 0) return null;
    const sum = numeric.reduce((acc, current) => acc + current, 0);
    return Math.round(sum / numeric.length);
};

const buildMonthlyStatsFromTotals = (totalsByBrigade: Record<BrigadeKey, BrigadeTotals>) => {
    const workDays = averageFrom(BRIGADES.map((brigade) => parseNumeric(totalsByBrigade[brigade]?.totalWorkDays ?? '')));
    const dayTime = averageFrom(BRIGADES.map((brigade) => parseNumeric(totalsByBrigade[brigade]?.totalDaytime ?? '')));
    const night = averageFrom(BRIGADES.map((brigade) => parseNumeric(totalsByBrigade[brigade]?.totalNightSecondary ?? '')));
    return { workDays, dayTime, night };
};

export const ShiftScheduleManager = () => {
    const { t } = useI18n();
    const initialMonth = getCurrentMonthValue();
    const initialBounds = getMonthBounds(initialMonth);
    const [dateFrom, setDateFrom] = useState(initialBounds.from);
    const [dateTo, setDateTo] = useState(initialBounds.to);
    const [isMonthScheduleCreated, setIsMonthScheduleCreated] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [scheduleMonth, setScheduleMonth] = useState(initialMonth);
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const dayCount = 31;
    const dayNumbers = useMemo(() => Array.from({ length: dayCount }, (_, idx) => idx + 1), [dayCount]);

    const [matrixByBrigade, setMatrixByBrigade] = useState<Record<BrigadeKey, string[]>>(() => buildDefaultMatrix(dayCount));
    const [totalsByBrigade, setTotalsByBrigade] = useState<Record<BrigadeKey, BrigadeTotals>>(() => buildDefaultTotals());
    const [yearlyStats, setYearlyStats] = useState<Record<YearlyStatKey, string[]>>(() => buildDefaultYearlyStats());
    const [rosterRows, setRosterRows] = useState<RosterRow[]>(() => createDefaultRosterRows());
    const [vacationList, setVacationList] = useState<string[]>(VACATION_BASE);
    const [medicalList, setMedicalList] = useState<string[]>(MEDICAL_BASE);
    const [businessTripList, setBusinessTripList] = useState<string[]>(BUSINESS_TRIP_BASE);
    const [isDraftHydrated, setIsDraftHydrated] = useState(false);
    const [remoteSynced, setRemoteSynced] = useState(false);

    const buildDraftPayload = (
        overrideYearlyStats?: Record<YearlyStatKey, string[]>,
        overrideMonthCreated?: boolean,
    ): ShiftDraftPayload => ({
        scheduleMonth,
        dateFrom,
        dateTo,
        isMonthScheduleCreated: overrideMonthCreated ?? isMonthScheduleCreated,
        matrixByBrigade,
        totalsByBrigade,
        yearlyStats: overrideYearlyStats ?? yearlyStats,
        rosterRows,
        vacationList,
        medicalList,
        businessTripList,
        savedAt: new Date().toISOString(),
    });

    const persistShiftDraft = (payload: ShiftDraftPayload) => {
        localStorage.setItem(
            SHIFT_SCHEDULE_DRAFT_KEY,
            JSON.stringify({ savedAt: new Date().toISOString(), draft: payload }),
        );
        localStorage.setItem(
            SHIFT_SCHEDULE_BACKUP_KEY,
            JSON.stringify({ savedAt: new Date().toISOString(), draft: payload }),
        );
    };

    const applyDraftToState = (draft: ShiftDraftPayload) => {
        const draftMonth = isValidMonthValue(draft.scheduleMonth) ? draft.scheduleMonth : initialMonth;
        const monthBounds = getMonthBounds(draftMonth);

        setScheduleMonth(draftMonth);
        setDateFrom(typeof draft.dateFrom === 'string' && draft.dateFrom ? draft.dateFrom : monthBounds.from);
        setDateTo(typeof draft.dateTo === 'string' && draft.dateTo ? draft.dateTo : monthBounds.to);
        // UX talabi: sahifa har doim yopiq (summary-only) holatda ochiladi.
        // Grafik bloklari faqat foydalanuvchi "Grafik yaratish"ni bosganda ko‘rinadi.
        setIsMonthScheduleCreated(false);

        if (draft.matrixByBrigade) setMatrixByBrigade(draft.matrixByBrigade);
        if (draft.totalsByBrigade) setTotalsByBrigade(draft.totalsByBrigade);
        if (draft.yearlyStats) setYearlyStats(draft.yearlyStats);
        if (Array.isArray(draft.rosterRows) && draft.rosterRows.length > 0)
            setRosterRows(normalizeLoadedRosterRows(draft.rosterRows));
        if (Array.isArray(draft.vacationList) && draft.vacationList.length > 0) setVacationList(draft.vacationList);
        if (Array.isArray(draft.medicalList) && draft.medicalList.length > 0) setMedicalList(draft.medicalList);
        if (Array.isArray(draft.businessTripList) && draft.businessTripList.length > 0)
            setBusinessTripList(draft.businessTripList);
    };

    useEffect(() => {
        let cancelled = false;

        const primaryCandidate = buildShiftCandidate(SHIFT_SCHEDULE_DRAFT_KEY);
        const recoveryCandidate = primaryCandidate
            ? null
            : (() => {
                  const recoveryCandidates = collectShiftRecoveryKeys()
                      .map((key) => buildShiftCandidate(key))
                      .filter((candidate): candidate is ShiftDraftCandidate => candidate !== null);
                  return recoveryCandidates.length
                      ? [...recoveryCandidates].sort(compareShiftCandidates)[0]
                      : null;
              })();

        const localBest = primaryCandidate ?? recoveryCandidate;

        (async () => {
            let serverDraft: ShiftDraftPayload | null = null;
            let serverUpdatedAt: string | null = null;
            try {
                const res = await fetch(`${API_BASE}/integrations/shift-schedule`);
                if (res.ok && !cancelled) {
                    const data = (await res.json()) as { draft?: unknown; updatedAt?: string | null };
                    serverDraft = extractShiftDraftShape(data.draft ?? null);
                    serverUpdatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : null;
                }
            } catch {
                /* tarmoq yo‘q — faqat localStorage */
            }

            if (cancelled) return;

            const winner = pickDraftBetweenLocalAndServer(localBest, serverDraft, serverUpdatedAt);

            if (winner) {
                const normalizedDraft: ShiftDraftPayload = {
                    ...winner,
                    rosterRows:
                        Array.isArray(winner.rosterRows) && winner.rosterRows.length > 0
                            ? normalizeLoadedRosterRows(winner.rosterRows)
                            : winner.rosterRows,
                };
                applyDraftToState(normalizedDraft);
                persistShiftDraft(normalizedDraft);

                const shouldPushLocal = localBest != null && winner === localBest.draft;
                if (shouldPushLocal) {
                    try {
                        await fetch(`${API_BASE}/integrations/shift-schedule`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ draft: normalizedDraft }),
                        });
                    } catch {
                        /* keyinroq avto-saqlash urinadi */
                    }
                }
            }

            setIsDraftHydrated(true);
            setRemoteSynced(true);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const matrixRows = useMemo(() => {
        return BRIGADES.map((brigade) => {
            const source = matrixByBrigade[brigade] ?? [];
            const codes = source.length >= dayCount ? source.slice(0, dayCount) : [...source, ...Array(dayCount - source.length).fill('')];
            const totals = totalsByBrigade[brigade] ?? {
                totalWorkDays: '',
                totalNightPrimary: '',
                totalNightSecondary: '',
                totalDaytime: '',
                holiday: '',
            };
            return { brigade, codes, totals };
        });
    }, [matrixByBrigade, totalsByBrigade, dayCount]);

    const yearlySummaryYear = useMemo(() => {
        if (!scheduleMonth) return String(new Date().getFullYear());
        return scheduleMonth.split('-')[0] || String(new Date().getFullYear());
    }, [scheduleMonth]);

    const workTimeTableTitle = useMemo(() => {
        const sourceMonth = scheduleMonth || new Date().toISOString().slice(0, 7);
        const [yearRaw, monthRaw] = sourceMonth.split('-');
        const year = Number(yearRaw) || new Date().getFullYear();
        const monthDigits = (monthRaw || '').replace(/\D/g, '');
        const parsedMonth = Number(monthDigits);
        const monthIndex = parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth - 1 : new Date().getMonth();
        const monthName = UZ_MONTH_NAMES[monthIndex];
        return `"DKZ"AJ Avtotransport sexi ishchi xodimlarining ${year} yil ${monthName} oyi smena bo'yicha ish vaqti`;
    }, [scheduleMonth]);

    const scheduleMonthIndex = useMemo(() => getMonthIndex(scheduleMonth), [scheduleMonth]);
    const currentMonthSerial = useMemo(() => getMonthSerial(getCurrentMonthValue()) ?? 0, []);
    const selectedMonthSerial = useMemo(() => getMonthSerial(scheduleMonth) ?? currentMonthSerial, [scheduleMonth, currentMonthSerial]);
    const isPastScheduleMonth = selectedMonthSerial < currentMonthSerial;

    const effectiveYearlyStats = useMemo(() => {
        const computed = buildMonthlyStatsFromTotals(totalsByBrigade);
        const next: Record<YearlyStatKey, string[]> = {
            totalWorkDays: [...yearlyStats.totalWorkDays],
            totalDaytime: [...yearlyStats.totalDaytime],
            totalNight: [...yearlyStats.totalNight],
        };

        if (isMonthScheduleCreated && scheduleMonthIndex >= 0) {
            if (computed.workDays != null) next.totalWorkDays[scheduleMonthIndex] = String(computed.workDays);
            if (computed.dayTime != null) next.totalDaytime[scheduleMonthIndex] = String(computed.dayTime);
            if (computed.night != null) next.totalNight[scheduleMonthIndex] = String(computed.night);
        }

        return next;
    }, [yearlyStats, totalsByBrigade, scheduleMonthIndex, isMonthScheduleCreated]);

    const visibleMonthIndexes = useMemo(() => {
        const indexes = MONTH_LABELS.map((_, idx) => idx).filter((idx) => {
            const work = (effectiveYearlyStats.totalWorkDays[idx] ?? '').trim();
            const day = (effectiveYearlyStats.totalDaytime[idx] ?? '').trim();
            const night = (effectiveYearlyStats.totalNight[idx] ?? '').trim();
            return work !== '' || day !== '' || night !== '';
        });
        if (indexes.length > 0) return indexes;
        return scheduleMonthIndex >= 0 ? [scheduleMonthIndex] : [];
    }, [effectiveYearlyStats, scheduleMonthIndex]);

    const yearlyChartData = useMemo(
        () =>
            visibleMonthIndexes.map((index) => ({
                month: MONTH_LABELS[index],
                totalWorkDays: Number(effectiveYearlyStats.totalWorkDays[index] || 0),
                totalDaytime: Number(effectiveYearlyStats.totalDaytime[index] || 0),
                totalNight: Number(effectiveYearlyStats.totalNight[index] || 0),
            })),
        [effectiveYearlyStats, visibleMonthIndexes],
    );

    useEffect(() => {
        if (!isDraftHydrated) return;
        const payload = buildDraftPayload();
        persistShiftDraft(payload);
    }, [
        isDraftHydrated,
        scheduleMonth,
        dateFrom,
        dateTo,
        isMonthScheduleCreated,
        matrixByBrigade,
        totalsByBrigade,
        yearlyStats,
        rosterRows,
        vacationList,
        medicalList,
        businessTripList,
    ]);

    useEffect(() => {
        if (!isDraftHydrated || !remoteSynced) return;
        const payload = buildDraftPayload();
        const handle = window.setTimeout(() => {
            void fetch(`${API_BASE}/integrations/shift-schedule`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ draft: payload }),
            }).catch(() => {});
        }, 700);
        return () => window.clearTimeout(handle);
    }, [
        isDraftHydrated,
        remoteSynced,
        scheduleMonth,
        dateFrom,
        dateTo,
        isMonthScheduleCreated,
        matrixByBrigade,
        totalsByBrigade,
        yearlyStats,
        rosterRows,
        vacationList,
        medicalList,
        businessTripList,
    ]);

    const updateShiftCell = (brigade: BrigadeKey, dayIndex: number, value: string) => {
        if (isPastScheduleMonth) return;
        setMatrixByBrigade((prev) => {
            const nextCodes = [...(prev[brigade] ?? [])];
            nextCodes[dayIndex] = value.toUpperCase();
            return { ...prev, [brigade]: nextCodes };
        });
    };

    const updateTotalCell = (brigade: BrigadeKey, field: keyof BrigadeTotals, value: string) => {
        if (isPastScheduleMonth) return;
        setTotalsByBrigade((prev) => ({
            ...prev,
            [brigade]: {
                ...(prev[brigade] ?? buildDefaultTotals()[brigade]),
                [field]: value,
            },
        }));
    };

    const updateRosterCell = (rowIndex: number, field: keyof Omit<RosterRow, 'index'>, value: string) => {
        if (isPastScheduleMonth) return;
        setRosterRows((prev) => prev.map((row) => (row.index === rowIndex ? { ...row, [field]: value } : row)));
    };

    const addRosterRow = () => {
        if (isPastScheduleMonth) return;
        setRosterRows((prev) => [
            ...prev,
            {
                index: prev.length + 1,
                brigadeA: '',
                brigadeB: '',
                brigadeV: '',
                brigadeG: '',
                role: '',
            },
        ]);
    };

    const updateStringListItem = (
        setter: Dispatch<SetStateAction<string[]>>,
        index: number,
        value: string,
    ) => {
        if (isPastScheduleMonth) return;
        setter((prev) => prev.map((item, idx) => (idx === index ? value : item)));
    };

    const addStringListItem = (setter: Dispatch<SetStateAction<string[]>>) => {
        if (isPastScheduleMonth) return;
        setter((prev) => [...prev, '']);
    };

    const updateYearlyStatCell = (key: YearlyStatKey, monthIndex: number, value: string) => {
        if (isPastScheduleMonth) return;
        setYearlyStats((prev) => {
            const current = prev[key] ?? Array.from({ length: 12 }, () => '');
            const next = [...current];
            next[monthIndex] = value;
            return { ...prev, [key]: next };
        });
    };

    const openCreateModal = () => {
        const currentMonth = getCurrentMonthValue();
        setScheduleMonth((prev) => {
            const prevSerial = getMonthSerial(prev);
            const currentSerial = getMonthSerial(currentMonth);
            if (prev && prevSerial != null && currentSerial != null && prevSerial >= currentSerial) return prev;
            return currentMonth;
        });
        setIsCreateModalOpen(true);
    };

    const applySelectedMonth = () => {
        if (!scheduleMonth) return;
        const [yearRaw, monthRaw] = scheduleMonth.split('-');
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        if (!year || !month) return;

        const from = `${scheduleMonth}-01`;
        const toDay = String(new Date(year, month, 0).getDate()).padStart(2, '0');
        const to = `${scheduleMonth}-${toDay}`;

        setDateFrom(from);
        setDateTo(to);
        setIsMonthScheduleCreated(true);
        setIsCreateModalOpen(false);
    };

    const buildExportFileName = (ext: 'xls' | 'pdf') => {
        const datePart = new Date().toISOString().split('T')[0];
        return `smena_grafigi_${datePart}.${ext}`;
    };

    const handleSaveSchedule = () => {
        if (isPastScheduleMonth) return;
        const monthIndex = scheduleMonthIndex;
        const computed = buildMonthlyStatsFromTotals(totalsByBrigade);
        const nextYearlyStats: Record<YearlyStatKey, string[]> =
            monthIndex >= 0
                ? {
                      totalWorkDays: yearlyStats.totalWorkDays.map((value, idx) =>
                          idx === monthIndex ? (computed.workDays != null ? String(computed.workDays) : value) : value,
                      ),
                      totalDaytime: yearlyStats.totalDaytime.map((value, idx) =>
                          idx === monthIndex ? (computed.dayTime != null ? String(computed.dayTime) : value) : value,
                      ),
                      totalNight: yearlyStats.totalNight.map((value, idx) =>
                          idx === monthIndex ? (computed.night != null ? String(computed.night) : value) : value,
                      ),
                  }
                : yearlyStats;

        setYearlyStats(nextYearlyStats);
        const payload = buildDraftPayload(nextYearlyStats, false);
        persistShiftDraft(payload);
        setIsMonthScheduleCreated(false);
        setIsCreateModalOpen(false);
    };

    const handleClosePage = () => {
        setIsCreateModalOpen(false);
        setIsMonthScheduleCreated(false);
    };

    const handleExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            downloadXlsSections(
                [
                    {
                        title: 'Jami ish kuni',
                        headers: visibleMonthIndexes.map((index) => MONTH_LABELS[index]),
                        rows: [visibleMonthIndexes.map((index) => effectiveYearlyStats.totalWorkDays[index] || '-')],
                    },
                    {
                        title: 'Jami kunduzgi',
                        headers: visibleMonthIndexes.map((index) => MONTH_LABELS[index]),
                        rows: [visibleMonthIndexes.map((index) => effectiveYearlyStats.totalDaytime[index] || '-')],
                    },
                    {
                        title: 'Jami tungi',
                        headers: visibleMonthIndexes.map((index) => MONTH_LABELS[index]),
                        rows: [visibleMonthIndexes.map((index) => effectiveYearlyStats.totalNight[index] || '-')],
                    },
                ],
                buildExportFileName('xls'),
            );
        } finally {
            setExportingXls(false);
        }
    };

    const handleExportPdf = async () => {
        if (exportingPdf || exportingXls) return;
        setExportingPdf(true);
        try {
            const doc = new jsPDF({ orientation: 'landscape' });

            try {
                const fontRes = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf');
                const buf = await fontRes.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                doc.addFileToVFS('Roboto.ttf', base64);
                doc.addFont('Roboto.ttf', 'Roboto', 'normal');
                doc.setFont('Roboto');
            } catch {
                // Use default font when CDN is unavailable.
            }

            doc.setFontSize(14);
            doc.text(t('shiftSchedule'), 14, 16);

            let nextY = 22;

            const yearlyPdfSections = [
                { title: 'Jami ish kuni', row: visibleMonthIndexes.map((index) => effectiveYearlyStats.totalWorkDays[index] || '-') },
                { title: 'Jami kunduzgi', row: visibleMonthIndexes.map((index) => effectiveYearlyStats.totalDaytime[index] || '-') },
                { title: 'Jami tungi', row: visibleMonthIndexes.map((index) => effectiveYearlyStats.totalNight[index] || '-') },
            ];

            yearlyPdfSections.forEach((section, index) => {
                doc.setFontSize(12);
                doc.text(section.title, 14, nextY);
                nextY += 4;
                autoTable(doc, {
                    startY: nextY,
                    head: [visibleMonthIndexes.map((index) => MONTH_LABELS[index])],
                    body: [section.row],
                    theme: 'grid',
                    headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                    styles: { fontSize: 8, font: 'Roboto' },
                });
                nextY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? nextY;
                if (index < yearlyPdfSections.length - 1) {
                    nextY += 10;
                }
            });

            doc.save(buildExportFileName('pdf'));
        } finally {
            setExportingPdf(false);
        }
    };

    const handleBottomExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            const shiftHeaders = ['Brigada', ...dayNumbers.map(String), ...SHIFT_TOTAL_HEADERS];
            const shiftRows = matrixRows.map((row) => [
                row.brigade,
                ...row.codes.map((code) => code || '-'),
                row.totals.totalWorkDays || '',
                row.totals.totalNightPrimary || '',
                row.totals.totalNightSecondary || '',
                row.totals.totalDaytime || '',
                row.totals.holiday || '',
            ]);
            const rosterRowsForExport = rosterRows.map((row) => [
                row.index,
                row.brigadeA || '',
                row.brigadeB || '',
                row.brigadeV || '',
                row.brigadeG || '',
                row.role || '',
            ]);
            const listRowsCount = Math.max(vacationList.length, medicalList.length, businessTripList.length, 1);
            const listRows = Array.from({ length: listRowsCount }, (_, idx) => [
                vacationList[idx] || '',
                medicalList[idx] || '',
                businessTripList[idx] || '',
            ]);

            downloadXlsSections(
                [
                    {
                        title: workTimeTableTitle,
                        headers: shiftHeaders,
                        rows: shiftRows,
                    },
                    {
                        title: 'Brigadalar tarkibi va lavozimlar',
                        headers: ROSTER_TABLE_HEADERS,
                        rows: rosterRowsForExport,
                    },
                    {
                        title: 'Dendagilar / Mexnat tatiliga chiqqanlar / Bulitinga chiqganlar',
                        headers: LIST_TABLE_HEADERS,
                        rows: listRows,
                    },
                ],
                buildExportFileName('xls'),
            );
        } finally {
            setExportingXls(false);
        }
    };

    const handleBottomExportPdf = async () => {
        if (exportingPdf || exportingXls) return;
        setExportingPdf(true);
        try {
            const shiftHeaders = ['Brigada', ...dayNumbers.map(String), ...SHIFT_TOTAL_HEADERS];
            const shiftRows = matrixRows.map((row) => [
                row.brigade,
                ...row.codes.map((code) => code || '-'),
                row.totals.totalWorkDays || '',
                row.totals.totalNightPrimary || '',
                row.totals.totalNightSecondary || '',
                row.totals.totalDaytime || '',
                row.totals.holiday || '',
            ]);
            const rosterRowsForExport = rosterRows.map((row) => [
                row.index,
                row.brigadeA || '',
                row.brigadeB || '',
                row.brigadeV || '',
                row.brigadeG || '',
                row.role || '',
            ]);
            const listRowsCount = Math.max(vacationList.length, medicalList.length, businessTripList.length, 1);
            const listRows = Array.from({ length: listRowsCount }, (_, idx) => [
                vacationList[idx] || '',
                medicalList[idx] || '',
                businessTripList[idx] || '',
            ]);

            const doc = new jsPDF({ orientation: 'landscape' });

            try {
                const fontRes = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf');
                const buf = await fontRes.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                doc.addFileToVFS('Roboto.ttf', base64);
                doc.addFont('Roboto.ttf', 'Roboto', 'normal');
                doc.setFont('Roboto');
            } catch {
                // Use default font when CDN is unavailable.
            }

            doc.setFontSize(14);
            doc.text('Smena grafigi', 14, 16);

            let nextY = 22;

            doc.setFontSize(12);
            doc.text(workTimeTableTitle, 14, nextY);
            nextY += 4;
            autoTable(doc, {
                startY: nextY,
                head: [shiftHeaders],
                body: shiftRows,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 8, font: 'Roboto' },
            });
            nextY = ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? nextY) + 10;

            doc.setFontSize(12);
            doc.text('Brigadalar tarkibi va lavozimlar', 14, nextY);
            nextY += 4;
            autoTable(doc, {
                startY: nextY,
                head: [ROSTER_TABLE_HEADERS],
                body: rosterRowsForExport,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 9, font: 'Roboto' },
            });
            nextY = ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? nextY) + 10;

            doc.setFontSize(12);
            doc.text('Dendagilar / Mexnat tatiliga chiqqanlar / Bulitinga chiqganlar', 14, nextY);
            nextY += 4;
            autoTable(doc, {
                startY: nextY,
                head: [LIST_TABLE_HEADERS],
                body: listRows,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 9, font: 'Roboto' },
            });

            doc.save(buildExportFileName('pdf'));
        } finally {
            setExportingPdf(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-5">
                <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                    <div className="p-6 bg-slate-800/20 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h3 className="app-module-heading">
                                {t('shiftSchedule')}
                            </h3>
                        </div>

                        <div className="flex w-full xl:w-auto items-stretch sm:items-center gap-2 sm:gap-3 flex-wrap">
                            <button
                                type="button"
                                onClick={openCreateModal}
                                className="inline-flex w-full sm:w-auto justify-center items-center gap-2 h-10 rounded-lg px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                            >
                                <PlusCircle size={16} />
                                Grafik yaratish
                            </button>
                            {isMonthScheduleCreated && (
                                <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <LocalizedDateInput
                                        label={t('dateFromSanadan')}
                                        value={dateFrom}
                                        maxDate={dateTo || undefined}
                                        minWidth={132}
                                        onChange={(v) => {
                                            setDateFrom(v);
                                            if (dateTo && v > dateTo) setDateTo(v);
                                        }}
                                    />
                                    <span className="text-slate-500 text-sm hidden sm:inline">-</span>
                                    <LocalizedDateInput
                                        label={t('dateToSanagacha')}
                                        value={dateTo}
                                        minDate={dateFrom || undefined}
                                        minWidth={132}
                                        onChange={(v) => {
                                            setDateTo(v);
                                            if (dateFrom && v < dateFrom) setDateFrom(v);
                                        }}
                                    />
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={exportingPdf || exportingXls}
                                className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Table2 size={16} />
                                {exportingXls ? t('exportingXls') : 'Export XLS'}
                            </button>
                            <button
                                type="button"
                                onClick={handleExportPdf}
                                disabled={exportingPdf || exportingXls}
                                className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <FileText size={16} />
                                {exportingPdf ? t('exportingPdf') : 'Export PDF'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {[
                        { key: 'totalWorkDays' as const, title: 'Jami ish kuni', stroke: '#22d3ee', fillFrom: '#22d3ee' },
                        { key: 'totalDaytime' as const, title: 'Jami kunduzgi', stroke: '#60a5fa', fillFrom: '#3b82f6' },
                        { key: 'totalNight' as const, title: 'Jami tungi', stroke: '#a78bfa', fillFrom: '#8b5cf6' },
                    ].map((metric) => (
                        <div key={metric.key} className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                            <div className="px-5 py-3 border-b border-slate-700/40 bg-slate-900/20 flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-slate-200">{metric.title}</h4>
                                <span className="text-xs text-slate-400">{yearlySummaryYear}</span>
                            </div>
                            <div className="h-[210px] px-3 pt-3">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={yearlyChartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id={`${metric.key}-gradient`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={metric.fillFrom} stopOpacity={0.38} />
                                                <stop offset="95%" stopColor={metric.fillFrom} stopOpacity={0.04} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke="#26374f" strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="month" stroke="#7b95bb" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis
                                            stroke="#7b95bb"
                                            tick={{ fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                            allowDecimals={false}
                                            width={36}
                                            tickMargin={6}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0b1324', border: '1px solid #2e4469', borderRadius: '12px' }}
                                            labelStyle={{ color: '#9fb7db' }}
                                            formatter={(value) => [String(value ?? 0), metric.title]}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey={metric.key}
                                            stroke={metric.stroke}
                                            fill={`url(#${metric.key}-gradient)`}
                                            strokeWidth={2.5}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="px-3 pb-3 overflow-x-auto dark-scrollbar">
                                <div className="flex gap-2 min-w-[640px]">
                                    {visibleMonthIndexes.map((index) => (
                                        <div key={`${metric.key}-${MONTH_LABELS[index]}`} className="w-12 shrink-0">
                                            <p className="text-[9px] text-slate-500 text-center mb-1">{MONTH_LABELS[index]}</p>
                                            <input
                                                type="text"
                                                value={effectiveYearlyStats[metric.key][index] ?? ''}
                                                onChange={(event) => updateYearlyStatCell(metric.key, index, event.target.value)}
                                                disabled={isPastScheduleMonth}
                                                aria-label={`${metric.title}, ${MONTH_LABELS[index]}`}
                                                className="w-full text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[10px] text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {isMonthScheduleCreated && (
                    <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                    <div className="px-6 py-3 border-b border-slate-700/40 bg-slate-900/20">
                        <h4 className="text-sm font-semibold text-slate-200">{workTimeTableTitle}</h4>
                    </div>

                    <div className="overflow-x-auto dark-scrollbar">
                        <table className="min-w-[1700px] w-full text-left">
                            <thead>
                                <tr className="bg-slate-900/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="px-4 py-3 sticky left-0 bg-slate-900/70 z-10">Brigada</th>
                                    {dayNumbers.map((day) => (
                                        <th key={day} className="px-2 py-3 text-center w-12">
                                            {day}
                                        </th>
                                    ))}
                                    <th className="px-3 py-3 text-center">Jami ish kuni</th>
                                    <th className="px-3 py-3 text-center">Jami tungi</th>
                                    <th className="px-3 py-3 text-center">Jami tungi</th>
                                    <th className="px-3 py-3 text-center">Jami kunduzgi</th>
                                    <th className="px-3 py-3 text-center">Bayram</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                {matrixRows.map((row) => (
                                    <motion.tr key={row.brigade} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-800/40 transition-all">
                                        <td className="px-4 py-3 sticky left-0 bg-slate-900/70 font-semibold text-slate-200 z-10">
                                            {row.brigade}
                                        </td>
                                        {row.codes.map((code, idx) => (
                                            <td key={`${row.brigade}-${idx}`} className="px-1 py-1">
                                                <input
                                                    type="text"
                                                    value={code}
                                                    onChange={(event) => updateShiftCell(row.brigade, idx, event.target.value)}
                                                    disabled={isPastScheduleMonth}
                                                    placeholder="-"
                                                    aria-label={`Brigada ${row.brigade}, ${idx + 1}-kun`}
                                                    className="w-full min-w-[42px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                                                />
                                            </td>
                                        ))}
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.totalWorkDays}
                                                onChange={(event) => updateTotalCell(row.brigade, 'totalWorkDays', event.target.value)}
                                                disabled={isPastScheduleMonth}
                                                aria-label={`Brigada ${row.brigade}, jami ish kuni`}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.totalNightPrimary}
                                                onChange={(event) => updateTotalCell(row.brigade, 'totalNightPrimary', event.target.value)}
                                                disabled={isPastScheduleMonth}
                                                aria-label={`Brigada ${row.brigade}, jami tungi (birinchi)`}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.totalNightSecondary}
                                                onChange={(event) => updateTotalCell(row.brigade, 'totalNightSecondary', event.target.value)}
                                                disabled={isPastScheduleMonth}
                                                aria-label={`Brigada ${row.brigade}, jami tungi (ikkinchi)`}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.totalDaytime}
                                                onChange={(event) => updateTotalCell(row.brigade, 'totalDaytime', event.target.value)}
                                                disabled={isPastScheduleMonth}
                                                aria-label={`Brigada ${row.brigade}, jami kunduzgi`}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.holiday}
                                                onChange={(event) => updateTotalCell(row.brigade, 'holiday', event.target.value)}
                                                disabled={isPastScheduleMonth}
                                                aria-label={`Brigada ${row.brigade}, bayram`}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                                            />
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    </div>
                )}
            </div>

            {isMonthScheduleCreated && (
                <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                <div className="p-5 border-b border-slate-700/50 bg-slate-800/20 flex items-center justify-between">
                    <h4 className="font-semibold text-slate-200">Brigadalar tarkibi va lavozimlar</h4>
                    <button
                        type="button"
                        onClick={addRosterRow}
                        disabled={isPastScheduleMonth}
                        className="text-xs text-blue-300 hover:text-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        + Qator
                    </button>
                </div>
                <div className="overflow-x-auto dark-scrollbar">
                    <table className="w-full min-w-[1100px] text-left">
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">Brigada A</th>
                                <th className="px-4 py-3">Brigada B</th>
                                <th className="px-4 py-3">Brigada V</th>
                                <th className="px-4 py-3">Brigada G</th>
                                <th className="px-4 py-3">Lavozimi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {rosterRows.map((row) => (
                                <tr key={row.index} className="hover:bg-slate-800/40 transition-all text-sm">
                                    <td className="px-4 py-2 text-slate-500">{row.index}</td>
                                    <td className="px-4 py-2"><input value={row.brigadeA} onChange={(e) => updateRosterCell(row.index, 'brigadeA', e.target.value)} disabled={isPastScheduleMonth} aria-label={`Qator ${row.index}, brigada A`} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed" /></td>
                                    <td className="px-4 py-2"><input value={row.brigadeB} onChange={(e) => updateRosterCell(row.index, 'brigadeB', e.target.value)} disabled={isPastScheduleMonth} aria-label={`Qator ${row.index}, brigada B`} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed" /></td>
                                    <td className="px-4 py-2"><input value={row.brigadeV} onChange={(e) => updateRosterCell(row.index, 'brigadeV', e.target.value)} disabled={isPastScheduleMonth} aria-label={`Qator ${row.index}, brigada V`} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed" /></td>
                                    <td className="px-4 py-2"><input value={row.brigadeG} onChange={(e) => updateRosterCell(row.index, 'brigadeG', e.target.value)} disabled={isPastScheduleMonth} aria-label={`Qator ${row.index}, brigada G`} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed" /></td>
                                    <td className="px-4 py-2"><input value={row.role} onChange={(e) => updateRosterCell(row.index, 'role', e.target.value)} disabled={isPastScheduleMonth} aria-label={`Qator ${row.index}, lavozim`} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-blue-300 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed" /></td>
                                </tr>
                            ))}
                            {rosterRows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                                        {t('dataNotFound')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                </div>
            )}

            {isMonthScheduleCreated && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="glass-panel rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs uppercase tracking-wider text-slate-400">Dendagilar</h5>
                        <button type="button" onClick={() => addStringListItem(setVacationList)} disabled={isPastScheduleMonth} className="text-xs text-blue-300 hover:text-blue-200 disabled:opacity-50 disabled:cursor-not-allowed">+ Qo'shish</button>
                    </div>
                    <div className="space-y-2">
                        {vacationList.map((name, idx) => (
                            <input
                                key={`vac-${idx}`}
                                value={name}
                                onChange={(e) => updateStringListItem(setVacationList, idx, e.target.value)}
                                disabled={isPastScheduleMonth}
                                aria-label={`Dendagilar, ${idx + 1}-qator`}
                                className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                        ))}
                    </div>
                </div>
                <div className="glass-panel rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs uppercase tracking-wider text-slate-400">Mexnat tatiliga chiqqanlar</h5>
                        <button type="button" onClick={() => addStringListItem(setMedicalList)} disabled={isPastScheduleMonth} className="text-xs text-blue-300 hover:text-blue-200 disabled:opacity-50 disabled:cursor-not-allowed">+ Qo'shish</button>
                    </div>
                    <div className="space-y-2">
                        {medicalList.map((name, idx) => (
                            <input
                                key={`med-${idx}`}
                                value={name}
                                onChange={(e) => updateStringListItem(setMedicalList, idx, e.target.value)}
                                disabled={isPastScheduleMonth}
                                aria-label={`Mexnat tatiliga chiqqanlar, ${idx + 1}-qator`}
                                className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                        ))}
                    </div>
                </div>
                <div className="glass-panel rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs uppercase tracking-wider text-slate-400">Bulitinga chiqganlar</h5>
                        <button type="button" onClick={() => addStringListItem(setBusinessTripList)} disabled={isPastScheduleMonth} className="text-xs text-blue-300 hover:text-blue-200 disabled:opacity-50 disabled:cursor-not-allowed">+ Qo'shish</button>
                    </div>
                    <div className="space-y-2">
                        {businessTripList.map((name, idx) => (
                            <input
                                key={`trip-${idx}`}
                                value={name}
                                onChange={(e) => updateStringListItem(setBusinessTripList, idx, e.target.value)}
                                disabled={isPastScheduleMonth}
                                aria-label={`Bulitinga chiqganlar, ${idx + 1}-qator`}
                                className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                        ))}
                    </div>
                </div>
                </div>
            )}

            {isMonthScheduleCreated && (
                <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3">
                <button
                    type="button"
                    onClick={handleSaveSchedule}
                    disabled={isPastScheduleMonth}
                    className="inline-flex flex-1 sm:flex-none min-w-[140px] sm:min-w-0 justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:bg-slate-500 disabled:hover:bg-slate-500 disabled:cursor-not-allowed disabled:opacity-80"
                >
                    <Save size={16} />
                    Saqlash
                </button>
                <button
                    type="button"
                    onClick={handleClosePage}
                    className="inline-flex flex-1 sm:flex-none min-w-[140px] sm:min-w-0 justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-red-600 hover:bg-red-500 transition-colors"
                >
                    <LogOut size={16} />
                    Sahifani yopish
                </button>
                <button
                    type="button"
                    onClick={handleBottomExportExcel}
                    disabled={exportingPdf || exportingXls}
                    className="inline-flex flex-1 sm:flex-none min-w-[140px] sm:min-w-0 justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Table2 size={16} />
                    {exportingXls ? t('exportingXls') : t('exportXls')}
                </button>
                <button
                    type="button"
                    onClick={handleBottomExportPdf}
                    disabled={exportingPdf || exportingXls}
                    className="inline-flex flex-1 sm:flex-none min-w-[140px] sm:min-w-0 justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <FileText size={16} />
                    {exportingPdf ? t('exportingPdf') : t('exportPdf')}
                </button>
                </div>
            )}

            {isCreateModalOpen && (
                <div
                    className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center px-4"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) {
                            setIsCreateModalOpen(false);
                        }
                    }}
                >
                    <div className="w-full max-w-md glass-panel rounded-2xl border border-slate-700/60 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-800/30 flex items-center justify-between">
                            <h4 className="font-semibold text-slate-100">Grafik yaratish</h4>
                            <button
                                type="button"
                                onClick={() => setIsCreateModalOpen(false)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                                aria-label="Yopish"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="space-y-2">
                                <LocalizedDateInput
                                    variant="month"
                                    label={t('pickMonthYearLabel')}
                                    value={scheduleMonth}
                                    minWidth={200}
                                    onChange={setScheduleMonth}
                                />
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="h-10 px-4 rounded-lg border border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-500 transition-colors text-sm font-semibold"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    type="button"
                                    onClick={applySelectedMonth}
                                    disabled={!scheduleMonth}
                                    className="h-10 px-4 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Yaratish
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
