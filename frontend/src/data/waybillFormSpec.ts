export const WAYBILL_FIELD_KEYS = {
    date1: 'date1',
    date2: 'date2',
    yearPart: 'yearPart',
    stampTop: 'stampTop',
    ishRejim: 'ishRejim',
    kolonna: 'kolonna',
    avtomobil: 'avtomobil',
    haydovchi: 'haydovchi',
    tabNo: 'tabNo',
    tirkama: 'tirkama',
    yarimtirkama: 'yarimtirkama',
    hamkorlik: 'hamkorlik',
} as const;

export const FUEL_COLS = [
    "Yonilg'i markasi",
    'Marka kodi',
    'Berildi',
    'Qoldiq chiqishda',
    'Qoldiq qaytishda',
    'Norma koeff.',
    'Maxsus uskuna',
    'Dvigatel',
] as const;

export const TASK_COLS = [
    'Kimning ixtiyoriga',
    'Kelish vaqti',
    'Yuk qayerdan olinadi',
    'Yuk qayerga yetkaziladi',
    'Yuk nomi',
    'Yuk bilan qatnovlar soni',
    'Masofa, km',
    'Yuk hajmi, tonna',
] as const;

export function createInitialWaybillFields(): Record<string, string> {
    const f: Record<string, string> = {};
    for (const k of Object.values(WAYBILL_FIELD_KEYS)) f[k] = '';
    for (let r = 0; r < 2; r += 1) {
        for (let c = 0; c < 4; c += 1) {
            f[`gar_${r}_${c}`] = '';
        }
    }
    for (let i = 0; i < 8; i += 1) f[`fuel_${i}`] = '';
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            f[`task_${r}_${c}`] = '';
        }
    }
    return f;
}
