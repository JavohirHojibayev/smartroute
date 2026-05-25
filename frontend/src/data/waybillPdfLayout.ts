/**
 * `yo'l_varaqasi.pdf` (841.89 x 595.28 pt, 2 sahifa) ustiga matn.
 * yFromTop — yuqoridan; koordinatalar namunaviy blankaga yaqinlashtirilgan.
 */

export type WaybillLayoutSpec = {
    key: string;
    page: 0 | 1;
    x: number;
    yFromTop: number;
    size?: number;
    maxWidth?: number;
};

const P0 = 0 as const;
const P1 = 1 as const;

function topFields(): WaybillLayoutSpec[] {
    return [
        { key: 'date1', page: P0, x: 64, yFromTop: 96, size: 9, maxWidth: 72 },
        { key: 'date2', page: P0, x: 188, yFromTop: 96, size: 9, maxWidth: 108 },
        { key: 'yearPart', page: P0, x: 332, yFromTop: 96, size: 9, maxWidth: 44 },
        { key: 'stampTop', page: P0, x: 520, yFromTop: 82, size: 8, maxWidth: 280 },
        { key: 'ishRejim', page: P0, x: 200, yFromTop: 148, size: 9, maxWidth: 360 },
        { key: 'kolonna', page: P0, x: 200, yFromTop: 172, size: 9, maxWidth: 360 },
        { key: 'avtomobil', page: P0, x: 200, yFromTop: 196, size: 9, maxWidth: 360 },
        { key: 'haydovchi', page: P0, x: 200, yFromTop: 220, size: 9, maxWidth: 280 },
        { key: 'tabNo', page: P0, x: 520, yFromTop: 220, size: 9, maxWidth: 72 },
        { key: 'tirkama', page: P0, x: 200, yFromTop: 244, size: 9, maxWidth: 360 },
        { key: 'yarimtirkama', page: P0, x: 200, yFromTop: 268, size: 9, maxWidth: 360 },
        { key: 'hamkorlik', page: P0, x: 200, yFromTop: 292, size: 8, maxWidth: 380 },
    ];
}

function garajFields(): WaybillLayoutSpec[] {
    const baseX = [388, 468, 548, 628];
    const y0 = 248;
    const rowGap = 24;
    const list: WaybillLayoutSpec[] = [];
    for (let r = 0; r < 2; r += 1) {
        for (let c = 0; c < 4; c += 1) {
            list.push({
                key: `gar_${r}_${c}`,
                page: P0,
                x: baseX[c] ?? baseX[0],
                yFromTop: y0 + r * rowGap,
                size: 8,
                maxWidth: 72,
            });
        }
    }
    return list;
}

function fuelFields(): WaybillLayoutSpec[] {
    const list: WaybillLayoutSpec[] = [];
    const y = 318;
    const x0 = 36;
    const step = 98;
    for (let i = 0; i < 8; i += 1) {
        list.push({
            key: `fuel_${i}`,
            page: P0,
            x: x0 + i * step,
            yFromTop: y,
            size: 8,
            maxWidth: 88,
        });
    }
    return list;
}

function taskFields(): WaybillLayoutSpec[] {
    const list: WaybillLayoutSpec[] = [];
    const x0 = 34;
    const y0 = 108;
    const cellW = 92;
    const cellH = 19;
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            list.push({
                key: `task_${r}_${c}`,
                page: P1,
                x: x0 + c * cellW,
                yFromTop: y0 + r * cellH,
                size: 7,
                maxWidth: cellW - 4,
            });
        }
    }
    return list;
}

export const WAYBILL_PDF_LAYOUT: WaybillLayoutSpec[] = [
    ...topFields(),
    ...garajFields(),
    ...fuelFields(),
    ...taskFields(),
];
