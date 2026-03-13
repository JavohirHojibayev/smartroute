import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { motion } from 'framer-motion';
import { Download, FileDown, CalendarDays, PlusCircle, X, Save, LogOut } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXlsSections } from '../utils/exportXls';
import { useI18n } from '../i18n';

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

const BRIGADES: BrigadeKey[] = ['A', 'B', 'V', 'G'];

const createDefaultRosterRows = (): RosterRow[] => ([
    { index: 1, brigadeA: '', brigadeB: '', brigadeV: '', brigadeG: '', role: '' },
    { index: 2, brigadeA: '', brigadeB: '', brigadeV: '', brigadeG: '', role: '' },
]);

const VACATION_BASE: string[] = ['', ''];
const MEDICAL_BASE: string[] = ['', ''];
const BUSINESS_TRIP_BASE: string[] = ['', ''];

const SHIFT_TABLE_HEADERS = ['Brigada', ...Array.from({ length: 31 }, (_, idx) => String(idx + 1)), 'Jami ish kuni', 'Jami tungi', 'Jami tungi', 'Jami kunduzgi', 'Bayram'];
const ROSTER_TABLE_HEADERS = ['#', 'Brigada A', 'Brigada B', 'Brigada V', 'Brigada G', 'Lavozimi'];
const LIST_TABLE_HEADERS = ['Dendagilar', 'Mexnat tatiliga chiqqanlar', 'Bulitinga chiqganlar'];

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

export const ShiftScheduleManager = () => {
    const { t } = useI18n();
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [scheduleMonth, setScheduleMonth] = useState('');
    const [exportingXls, setExportingXls] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const dateFromRef = useRef<HTMLInputElement | null>(null);
    const dateToRef = useRef<HTMLInputElement | null>(null);
    const scheduleMonthRef = useRef<HTMLInputElement | null>(null);

    const dayCount = 31;
    const dayNumbers = useMemo(() => Array.from({ length: dayCount }, (_, idx) => idx + 1), [dayCount]);

    const [matrixByBrigade, setMatrixByBrigade] = useState<Record<BrigadeKey, string[]>>(() => buildDefaultMatrix(dayCount));
    const [totalsByBrigade, setTotalsByBrigade] = useState<Record<BrigadeKey, BrigadeTotals>>(() => buildDefaultTotals());
    const [rosterRows, setRosterRows] = useState<RosterRow[]>(() => createDefaultRosterRows());
    const [vacationList, setVacationList] = useState<string[]>(VACATION_BASE);
    const [medicalList, setMedicalList] = useState<string[]>(MEDICAL_BASE);
    const [businessTripList, setBusinessTripList] = useState<string[]>(BUSINESS_TRIP_BASE);

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

    const updateShiftCell = (brigade: BrigadeKey, dayIndex: number, value: string) => {
        setMatrixByBrigade((prev) => {
            const nextCodes = [...(prev[brigade] ?? [])];
            nextCodes[dayIndex] = value.toUpperCase();
            return { ...prev, [brigade]: nextCodes };
        });
    };

    const updateTotalCell = (brigade: BrigadeKey, field: keyof BrigadeTotals, value: string) => {
        setTotalsByBrigade((prev) => ({
            ...prev,
            [brigade]: {
                ...(prev[brigade] ?? buildDefaultTotals()[brigade]),
                [field]: value,
            },
        }));
    };

    const updateRosterCell = (rowIndex: number, field: keyof Omit<RosterRow, 'index'>, value: string) => {
        setRosterRows((prev) => prev.map((row) => (row.index === rowIndex ? { ...row, [field]: value } : row)));
    };

    const addRosterRow = () => {
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
        setter((prev) => prev.map((item, idx) => (idx === index ? value : item)));
    };

    const addStringListItem = (setter: Dispatch<SetStateAction<string[]>>) => {
        setter((prev) => [...prev, '']);
    };

    const openDatePicker = (ref: { current: HTMLInputElement | null }) => {
        const input = ref.current;
        if (!input) return;
        const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
        if (typeof pickerInput.showPicker === 'function') {
            pickerInput.showPicker();
            return;
        }
        input.focus();
    };

    const openCreateModal = () => {
        setScheduleMonth((prev) => prev || new Date().toISOString().slice(0, 7));
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
        setIsCreateModalOpen(false);
    };

    const buildExportFileName = (ext: 'xls' | 'pdf') => {
        const datePart = new Date().toISOString().split('T')[0];
        return `smena_grafigi_${datePart}.${ext}`;
    };

    const handleSaveSchedule = () => {
        const payload = {
            dateFrom,
            dateTo,
            matrixByBrigade,
            totalsByBrigade,
            rosterRows,
            vacationList,
            medicalList,
            businessTripList,
            savedAt: new Date().toISOString(),
        };
        localStorage.setItem('smartroute_shift_schedule_draft', JSON.stringify(payload));
    };

    const handleClosePage = () => {
        window.history.back();
    };

    const handleExportExcel = async () => {
        if (exportingXls || exportingPdf) return;
        setExportingXls(true);
        try {
            const shiftRows = matrixRows.map((row) => [
                row.brigade,
                ...row.codes.map((code) => code || '-'),
                row.totals.totalWorkDays,
                row.totals.totalNightPrimary,
                row.totals.totalNightSecondary,
                row.totals.totalDaytime,
                row.totals.holiday,
            ]);
            const rosterRowsExport = rosterRows.map((row) => [
                row.index,
                row.brigadeA,
                row.brigadeB,
                row.brigadeV,
                row.brigadeG,
                row.role,
            ]);
            const listRowsCount = Math.max(vacationList.length, medicalList.length, businessTripList.length, 2);
            const listRowsExport = Array.from({ length: listRowsCount }, (_, idx) => [
                vacationList[idx] ?? '',
                medicalList[idx] ?? '',
                businessTripList[idx] ?? '',
            ]);

            downloadXlsSections(
                [
                    {
                        title: "Smena bo'yicha ish vaqti",
                        headers: SHIFT_TABLE_HEADERS,
                        rows: shiftRows,
                    },
                    {
                        title: 'Brigadalar tarkibi va lavozimlar',
                        headers: ROSTER_TABLE_HEADERS,
                        rows: rosterRowsExport,
                    },
                    {
                        title: 'Dendagilar / Mexnat tatiliga chiqqanlar / Bulitinga chiqganlar',
                        headers: LIST_TABLE_HEADERS,
                        rows: listRowsExport,
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

            const shiftHead = [SHIFT_TABLE_HEADERS];
            const shiftBody = matrixRows.map((row) => [
                row.brigade,
                ...row.codes.map((code) => code || '-'),
                row.totals.totalWorkDays,
                row.totals.totalNightPrimary,
                row.totals.totalNightSecondary,
                row.totals.totalDaytime,
                row.totals.holiday,
            ]);

            autoTable(doc, {
                startY: 22,
                head: shiftHead,
                body: shiftBody,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 6, font: 'Roboto' },
            });

            let nextY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 22;
            nextY += 10;

            doc.setFontSize(12);
            doc.text('Brigadalar tarkibi va lavozimlar', 14, nextY);
            nextY += 4;

            autoTable(doc, {
                startY: nextY,
                head: [ROSTER_TABLE_HEADERS],
                body: rosterRows.map((row) => [
                    row.index,
                    row.brigadeA || '-',
                    row.brigadeB || '-',
                    row.brigadeV || '-',
                    row.brigadeG || '-',
                    row.role || '-',
                ]),
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 8, font: 'Roboto' },
            });

            nextY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? nextY;
            nextY += 10;

            doc.setFontSize(12);
            doc.text('Dendagilar / Mexnat tatiliga chiqqanlar / Bulitinga chiqganlar', 14, nextY);
            nextY += 4;

            const listRowsCount = Math.max(vacationList.length, medicalList.length, businessTripList.length, 2);
            const listBody = Array.from({ length: listRowsCount }, (_, idx) => [
                vacationList[idx] || '-',
                medicalList[idx] || '-',
                businessTripList[idx] || '-',
            ]);

            autoTable(doc, {
                startY: nextY,
                head: [LIST_TABLE_HEADERS],
                body: listBody,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], font: 'Roboto' },
                styles: { fontSize: 8, font: 'Roboto' },
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
                            <h3 className="font-bold text-2xl md:text-[30px] leading-tight pb-1 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                                {t('shiftSchedule')}
                            </h3>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                type="button"
                                onClick={openCreateModal}
                                className="inline-flex items-center gap-2 h-10 rounded-lg px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                            >
                                <PlusCircle size={16} />
                                Grafik yaratish
                            </button>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <input
                                        ref={dateFromRef}
                                        type="date"
                                        value={dateFrom}
                                        max={dateTo || undefined}
                                        onChange={(event) => setDateFrom(event.target.value)}
                                        className="date-input-system w-[170px] bg-slate-900/50 border border-slate-700/60 rounded-lg pl-3 pr-11 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                                        aria-label={t('startDate')}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => openDatePicker(dateFromRef)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-200 hover:text-white transition-colors"
                                        aria-label={t('selectStartDate')}
                                    >
                                        <CalendarDays size={16} />
                                    </button>
                                </div>
                                <span className="text-slate-500 text-sm">-</span>
                                <div className="relative">
                                    <input
                                        ref={dateToRef}
                                        type="date"
                                        value={dateTo}
                                        min={dateFrom || undefined}
                                        onChange={(event) => setDateTo(event.target.value)}
                                        className="date-input-system w-[170px] bg-slate-900/50 border border-slate-700/60 rounded-lg pl-3 pr-11 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                                        aria-label={t('endDate')}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => openDatePicker(dateToRef)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-200 hover:text-white transition-colors"
                                        aria-label={t('selectEndDate')}
                                    >
                                        <CalendarDays size={16} />
                                    </button>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={exportingPdf || exportingXls}
                                className="inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Download size={16} />
                                {exportingXls ? t('exportingXls') : t('exportXls')}
                            </button>
                            <button
                                type="button"
                                onClick={handleExportPdf}
                                disabled={exportingPdf || exportingXls}
                                className="inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <FileDown size={16} />
                                {exportingPdf ? t('exportingPdf') : t('exportPdf')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                    <div className="px-6 py-3 border-b border-slate-700/40 bg-slate-900/20">
                        <h4 className="text-sm font-semibold text-slate-200">Smena bo'yicha ish vaqti</h4>
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
                                                    placeholder="-"
                                                    className="w-full min-w-[42px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60"
                                                />
                                            </td>
                                        ))}
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.totalWorkDays}
                                                onChange={(event) => updateTotalCell(row.brigade, 'totalWorkDays', event.target.value)}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.totalNightPrimary}
                                                onChange={(event) => updateTotalCell(row.brigade, 'totalNightPrimary', event.target.value)}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.totalNightSecondary}
                                                onChange={(event) => updateTotalCell(row.brigade, 'totalNightSecondary', event.target.value)}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.totalDaytime}
                                                onChange={(event) => updateTotalCell(row.brigade, 'totalDaytime', event.target.value)}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={row.totals.holiday}
                                                onChange={(event) => updateTotalCell(row.brigade, 'holiday', event.target.value)}
                                                className="w-full min-w-[54px] text-center bg-slate-900/40 border border-slate-700/50 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none focus:border-blue-500/60"
                                            />
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
                <div className="p-5 border-b border-slate-700/50 bg-slate-800/20 flex items-center justify-between">
                    <h4 className="font-semibold text-slate-200">Brigadalar tarkibi va lavozimlar</h4>
                    <button
                        type="button"
                        onClick={addRosterRow}
                        className="px-3 py-1.5 text-xs rounded-lg border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 transition-colors"
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
                                    <td className="px-4 py-2"><input value={row.brigadeA} onChange={(e) => updateRosterCell(row.index, 'brigadeA', e.target.value)} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500/60" /></td>
                                    <td className="px-4 py-2"><input value={row.brigadeB} onChange={(e) => updateRosterCell(row.index, 'brigadeB', e.target.value)} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500/60" /></td>
                                    <td className="px-4 py-2"><input value={row.brigadeV} onChange={(e) => updateRosterCell(row.index, 'brigadeV', e.target.value)} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500/60" /></td>
                                    <td className="px-4 py-2"><input value={row.brigadeG} onChange={(e) => updateRosterCell(row.index, 'brigadeG', e.target.value)} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500/60" /></td>
                                    <td className="px-4 py-2"><input value={row.role} onChange={(e) => updateRosterCell(row.index, 'role', e.target.value)} className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-blue-300 outline-none focus:border-blue-500/60" /></td>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="glass-panel rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs uppercase tracking-wider text-slate-400">Dendagilar</h5>
                        <button type="button" onClick={() => addStringListItem(setVacationList)} className="text-xs text-blue-300 hover:text-blue-200">+ Qo'shish</button>
                    </div>
                    <div className="space-y-2">
                        {vacationList.map((name, idx) => (
                            <input
                                key={`vac-${idx}`}
                                value={name}
                                onChange={(e) => updateStringListItem(setVacationList, idx, e.target.value)}
                                className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                            />
                        ))}
                    </div>
                </div>
                <div className="glass-panel rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs uppercase tracking-wider text-slate-400">Mexnat tatiliga chiqqanlar</h5>
                        <button type="button" onClick={() => addStringListItem(setMedicalList)} className="text-xs text-blue-300 hover:text-blue-200">+ Qo'shish</button>
                    </div>
                    <div className="space-y-2">
                        {medicalList.map((name, idx) => (
                            <input
                                key={`med-${idx}`}
                                value={name}
                                onChange={(e) => updateStringListItem(setMedicalList, idx, e.target.value)}
                                className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                            />
                        ))}
                    </div>
                </div>
                <div className="glass-panel rounded-2xl border border-slate-700/50 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs uppercase tracking-wider text-slate-400">Bulitinga chiqganlar</h5>
                        <button type="button" onClick={() => addStringListItem(setBusinessTripList)} className="text-xs text-blue-300 hover:text-blue-200">+ Qo'shish</button>
                    </div>
                    <div className="space-y-2">
                        {businessTripList.map((name, idx) => (
                            <input
                                key={`trip-${idx}`}
                                value={name}
                                onChange={(e) => updateStringListItem(setBusinessTripList, idx, e.target.value)}
                                className="w-full bg-slate-900/40 border border-slate-700/50 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-start gap-3">
                <button
                    type="button"
                    onClick={handleSaveSchedule}
                    className="inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
                >
                    <Save size={16} />
                    Saqlash
                </button>
                <button
                    type="button"
                    onClick={handleClosePage}
                    className="inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-slate-700 bg-amber-400 hover:bg-amber-300 hover:text-slate-800 transition-colors"
                >
                    <LogOut size={16} />
                    Sahifani yopish
                </button>
                <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={exportingPdf || exportingXls}
                    className="inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Download size={16} />
                    {exportingXls ? t('exportingXls') : t('exportXls')}
                </button>
                <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={exportingPdf || exportingXls}
                    className="inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <FileDown size={16} />
                    {exportingPdf ? t('exportingPdf') : t('exportPdf')}
                </button>
            </div>

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
                                <p className="text-xs uppercase tracking-wider text-slate-400">Oy va yilni tanlang</p>
                                <div className="relative">
                                    <input
                                        ref={scheduleMonthRef}
                                        type="month"
                                        value={scheduleMonth}
                                        onChange={(event) => setScheduleMonth(event.target.value)}
                                        className="date-input-system w-full bg-slate-900/60 border border-slate-700/60 rounded-lg pl-3 pr-11 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                                        aria-label="Oy va yil"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => openDatePicker(scheduleMonthRef)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-200 hover:text-white transition-colors"
                                        aria-label="Oy va yilni tanlash"
                                    >
                                        <CalendarDays size={16} />
                                    </button>
                                </div>
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
