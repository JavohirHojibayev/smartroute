import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Activity, BarChart3, Table2, FileText, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXlsSections } from '../utils/exportXls';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from './LocalizedDateInput';

type ReportsManagerProps = {
  authToken: string;
};

type DatePreset = 'today' | 'week' | 'month' | 'custom';

type FuelSummaryResponse = {
  health?: {
    status?: 'online' | 'offline' | 'disabled' | string;
    lastSyncAt?: string | null;
  };
  window?: {
    records?: number;
    totalLiters?: number;
  };
  chart?: Array<{ day: string; consumption: number; cost: number }>;
};

type CargoSummaryCargo = {
  cargoType: string;
  count: number;
  totalNet: number;
  totalGross: number;
};

type CargoSummaryResponse = {
  source?: string;
  totalRecords?: number;
  totalNet?: number;
  byCargo?: CargoSummaryCargo[];
  lastSyncAt?: string | null;
  systemStatus?: 'online' | 'offline' | string;
  syncError?: string | null;
};

type EsmoSummaryResponse = {
  day?: string;
  totalToday?: number;
  passedToday?: number;
  reviewToday?: number;
  failedToday?: number;
  systemStatus?: 'online' | 'offline' | string;
};

type MechanicSummaryResponse = {
  day?: string;
  totalToday?: number;
  passedToday?: number;
  pendingToday?: number;
  failedToday?: number;
};

type TrendRow = {
  date: string;
  consumption: number;
  cost: number;
};

type CompositionRow = {
  label: string;
  percent: number;
  totalNet: number;
  color: string;
};

const API_BASE = resolveApiBaseUrl();
const COMPOSITION_COLORS = ['#0ea5e9', '#6366f1', '#14b8a6', '#f97316', '#a855f7', '#ec4899'];

const normalizeIntlSpaces = (value: string) => value.replace(/\u00A0/g, ' ');

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildExportFileName = (ext: 'xls' | 'pdf') => {
  const day = new Date().toISOString().slice(0, 10);
  return `hisobotlar_${day}.${ext}`;
};

const formatInt = (value: number) =>
  normalizeIntlSpaces(Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 }));

const formatDecimal = (value: number, maxFractionDigits = 1) =>
  normalizeIntlSpaces(
    Number(value || 0).toLocaleString('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFractionDigits,
    }),
  );

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDayLabel = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${pad(parsed.getDate())}.${pad(parsed.getMonth() + 1)}`;
  }
  return value;
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const compositionColorClassByHex: Record<string, string> = {
  '#0ea5e9': 'fill-sky-500',
  '#6366f1': 'fill-indigo-500',
  '#14b8a6': 'fill-teal-500',
  '#f97316': 'fill-orange-500',
  '#a855f7': 'fill-purple-500',
  '#ec4899': 'fill-pink-500',
};

const getCompositionFillClass = (hexColor: string) =>
  compositionColorClassByHex[hexColor.toLowerCase()] ?? 'fill-blue-500';

const getPresetRange = (preset: Exclude<DatePreset, 'custom'>) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'today') {
    const date = toDateInput(today);
    return { dateFrom: date, dateTo: date };
  }

  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { dateFrom: toDateInput(start), dateTo: toDateInput(today) };
  }

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return { dateFrom: toDateInput(startOfMonth), dateTo: toDateInput(today) };
};

export const ReportsManager = ({ authToken }: ReportsManagerProps) => {
  const { t } = useI18n();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('custom');
  const [exportingXls, setExportingXls] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuelSummary, setFuelSummary] = useState<FuelSummaryResponse | null>(null);
  const [cargoSummary, setCargoSummary] = useState<CargoSummaryResponse | null>(null);
  const [esmoSummary, setEsmoSummary] = useState<EsmoSummaryResponse | null>(null);
  const [mechanicSummary, setMechanicSummary] = useState<MechanicSummaryResponse | null>(null);

  const applyPreset = (preset: Exclude<DatePreset, 'custom'>) => {
    const range = getPresetRange(preset);
    setDatePreset(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  };

  const loadReports = async (showLoading = false) => {
    if (!authToken) {
      setError('Token topilmadi');
      return;
    }

    if (showLoading) setLoading(true);

    const failedSources: string[] = [];
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const paramsText = params.toString();

    const safeFetch = async <T,>(
      label: string,
      url: string,
      init?: RequestInit,
    ): Promise<T | null> => {
      try {
        const response = await fetch(url, init);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          failedSources.push(label);
          return null;
        }
        return payload as T;
      } catch {
        failedSources.push(label);
        return null;
      }
    };

    try {
      const fuelParams = new URLSearchParams(paramsText);
      fuelParams.set('recentLimit', '500');

      const [fuelData, cargoData, esmoData, mechanicData] = await Promise.all([
        safeFetch<FuelSummaryResponse>(
          "Yoqilg'i",
          `${API_BASE}/integrations/fuel/azs/summary?${fuelParams.toString()}`,
        ),
        safeFetch<CargoSummaryResponse>(
          '1C tarozi',
          `${API_BASE}/integrations/1c/weights/summary${paramsText ? `?${paramsText}` : ''}`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        ),
        safeFetch<EsmoSummaryResponse>(
          'ESMO',
          `${API_BASE}/integrations/esmo/summary${paramsText ? `?${paramsText}` : ''}`,
        ),
        safeFetch<MechanicSummaryResponse>(
          "Texnik ko'rik",
          `${API_BASE}/mechanic/summary${paramsText ? `?${paramsText}` : ''}`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        ),
      ]);

      if (fuelData) setFuelSummary(fuelData);
      if (cargoData) setCargoSummary(cargoData);
      if (esmoData) setEsmoSummary(esmoData);
      if (mechanicData) setMechanicSummary(mechanicData);

      setError(
        failedSources.length > 0
          ? `Ba'zi manbalar yuklanmadi: ${failedSources.join(', ')}`
          : null,
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports(true);
    const timer = setInterval(() => {
      void loadReports(false);
    }, 15000);
    return () => clearInterval(timer);
  }, [authToken, dateFrom, dateTo]);

  const trendData = useMemo<TrendRow[]>(
    () =>
      (fuelSummary?.chart ?? []).map((row) => ({
        date: row.day,
        consumption: toNumber(row.consumption),
        cost: toNumber(row.cost),
      })),
    [fuelSummary],
  );

  const totalFuelLiters = useMemo(() => {
    const fromWindow = toNumber(fuelSummary?.window?.totalLiters);
    if (fromWindow > 0) return fromWindow;
    return trendData.reduce((sum, row) => sum + row.consumption, 0);
  }, [fuelSummary, trendData]);

  const averageCost = useMemo(() => {
    if (trendData.length === 0) return 0;
    const totalCost = trendData.reduce((sum, row) => sum + row.cost, 0);
    return Math.round(totalCost / trendData.length);
  }, [trendData]);

  const growthPercent = useMemo(() => {
    if (trendData.length < 2) return 0;
    const first = trendData[0].consumption;
    const last = trendData[trendData.length - 1].consumption;
    if (!first) return 0;
    return ((last - first) / first) * 100;
  }, [trendData]);

  const totalCargoNet = toNumber(cargoSummary?.totalNet);
  const cargoRows = cargoSummary?.byCargo ?? [];
  const compositionData = useMemo<CompositionRow[]>(() => {
    const total = cargoRows.reduce((sum, row) => sum + toNumber(row.totalNet), 0);
    if (total <= 0) return [];
    return cargoRows.slice(0, 6).map((row, index) => {
      const net = toNumber(row.totalNet);
      return {
        label: row.cargoType || "Noma'lum",
        percent: Number(((net / total) * 100).toFixed(1)),
        totalNet: net,
        color: COMPOSITION_COLORS[index % COMPOSITION_COLORS.length],
      };
    });
  }, [cargoRows]);

  const esmoTotal = toNumber(esmoSummary?.totalToday);
  const esmoPassed = toNumber(esmoSummary?.passedToday);
  const esmoPassRate = esmoTotal > 0 ? (esmoPassed / esmoTotal) * 100 : 0;

  const mechanicTotal = toNumber(mechanicSummary?.totalToday);
  const mechanicPassed = toNumber(mechanicSummary?.passedToday);
  const readiness = mechanicTotal > 0 ? (mechanicPassed / mechanicTotal) * 100 : 0;

  const hasFuelData =
    trendData.length > 0 || toNumber(fuelSummary?.window?.records) > 0 || totalFuelLiters > 0;
  const hasCargoData =
    totalCargoNet > 0 || cargoRows.length > 0 || toNumber(cargoSummary?.totalRecords) > 0;
  const hasEsmoData =
    esmoTotal > 0 ||
    toNumber(esmoSummary?.reviewToday) > 0 ||
    toNumber(esmoSummary?.failedToday) > 0;
  const hasMechanicData =
    mechanicTotal > 0 ||
    toNumber(mechanicSummary?.pendingToday) > 0 ||
    toNumber(mechanicSummary?.failedToday) > 0;

  const hasReportData =
    hasFuelData || hasCargoData || hasEsmoData || hasMechanicData || compositionData.length > 0;

  const exportTrendRows = useMemo(
    () =>
      trendData.map((row) => [
        formatDayLabel(row.date),
        Math.round(row.consumption),
        Math.round(row.cost),
      ]),
    [trendData],
  );

  const periodLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return 'Barcha davr';
    if (dateFrom && dateTo) return `${dateFrom} - ${dateTo}`;
    return dateFrom || dateTo || 'Barcha davr';
  }, [dateFrom, dateTo]);

  const handleExportXls = async () => {
    if (exportingXls || exportingPdf || !hasReportData) return;
    setExportingXls(true);
    try {
      const sections = [];

      sections.push({
        title: 'Umumiy KPI',
        headers: ["Ko'rsatkich", 'Qiymat'],
        rows: [
          ["Jami yoqilg'i (l)", Math.round(totalFuelLiters)],
          ["Jami netto yuk (kg)", Math.round(totalCargoNet)],
          ['ESMO ruxsat darajasi (%)', esmoPassRate.toFixed(1)],
          ["Texnik tayyorgarlik (%)", readiness.toFixed(1)],
          ["Yoqilg'i o'rtacha xarajati (UZS)", Math.round(averageCost)],
        ],
      });

      if (exportTrendRows.length > 0) {
        sections.push({
          title: "Yoqilg'i sarfi dinamikasi",
          headers: ['Kun', 'Sarf (l)', 'Xarajat (UZS)'],
          rows: exportTrendRows,
        });
      }

      if (compositionData.length > 0) {
        sections.push({
          title: 'Yuk tarkibi (netto)',
          headers: ['Yuk turi', 'Ulushi (%)', 'Netto (kg)'],
          rows: compositionData.map((row) => [row.label, row.percent, Math.round(row.totalNet)]),
        });
      }

      downloadXlsSections(sections, buildExportFileName('xls'));
    } finally {
      setExportingXls(false);
    }
  };

  const handleExportPdf = async () => {
    if (exportingPdf || exportingXls || !hasReportData) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape' });

      try {
        const fontRes = await fetch(
          'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf',
        );
        const buf = await fontRes.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        doc.addFileToVFS('Roboto.ttf', base64);
        doc.addFont('Roboto.ttf', 'Roboto', 'normal');
        doc.setFont('Roboto');
      } catch {
        // Keep default font if loading fails.
      }

      doc.setFontSize(16);
      doc.text('Analitika va Hisobotlar', 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Davr: ${periodLabel}`, 14, 25);

      autoTable(doc, {
        head: [["Ko'rsatkich", 'Qiymat']],
        body: [
          ["Jami yoqilg'i (l)", Math.round(totalFuelLiters)],
          ["Jami netto yuk (kg)", Math.round(totalCargoNet)],
          ['ESMO ruxsat darajasi (%)', esmoPassRate.toFixed(1)],
          ["Texnik tayyorgarlik (%)", readiness.toFixed(1)],
          ["Yoqilg'i o'rtacha xarajati (UZS)", Math.round(averageCost)],
        ],
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], font: 'Roboto' },
        styles: { fontSize: 9, font: 'Roboto' },
      });

      let nextY = ((doc as any).lastAutoTable?.finalY || 30) + 8;

      if (exportTrendRows.length > 0) {
        autoTable(doc, {
          head: [['Kun', 'Sarf (l)', 'Xarajat (UZS)']],
          body: exportTrendRows,
          startY: nextY,
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], font: 'Roboto' },
          styles: { fontSize: 8, font: 'Roboto' },
        });
        nextY = ((doc as any).lastAutoTable?.finalY || nextY) + 8;
      }

      if (compositionData.length > 0) {
        autoTable(doc, {
          head: [['Yuk turi', 'Ulushi (%)', 'Netto (kg)']],
          body: compositionData.map((row) => [row.label, row.percent, Math.round(row.totalNet)]),
          startY: nextY,
          theme: 'grid',
          headStyles: { fillColor: [8, 47, 73], font: 'Roboto' },
          styles: { fontSize: 8, font: 'Roboto' },
        });
      }

      doc.save(buildExportFileName('pdf'));
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap justify-between items-start sm:items-center gap-3 bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-700/50">
        <h3 className="app-module-heading">
          Analitika va Hisobotlar
        </h3>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <LocalizedDateInput
            label={t('dateFromSanadan')}
            value={dateFrom}
            maxDate={dateTo || undefined}
            onChange={(v) => {
              setDatePreset('custom');
              setDateFrom(v);
            }}
            minWidth={168}
          />
          <LocalizedDateInput
            label={t('dateToSanagacha')}
            value={dateTo}
            minDate={dateFrom || undefined}
            onChange={(v) => {
              setDatePreset('custom');
              setDateTo(v);
            }}
            minWidth={168}
          />

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/40 p-1">
            {([
              { id: 'today', label: 'Kunlik' },
              { id: 'week', label: 'Hafta' },
              { id: 'month', label: 'Oy' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPreset(item.id)}
                className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors ${
                  datePreset === item.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleExportXls()}
            disabled={!hasReportData || exportingXls || exportingPdf}
            className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Table2 size={16} />
            {exportingXls ? 'Export XLS...' : 'Export XLS'}
          </button>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={!hasReportData || exportingPdf || exportingXls}
            className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText size={16} />
            {exportingPdf ? 'Export PDF...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      {loading && !hasReportData ? (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          Hisobot ma'lumotlari yuklanmoqda...
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-2xl space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-sm">Jami yoqilg'i</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><TrendingUp size={16} /></div>
          </div>
          <p className="text-3xl font-bold">{formatDecimal(totalFuelLiters, 2)} l</p>
          <p className="text-emerald-400 text-xs flex items-center gap-1">
            <TrendingUp size={12} /> {growthPercent >= 0 ? '+' : ''}{growthPercent.toFixed(1)}% davr bo'yicha
          </p>
        </div>

        <div className="glass-panel p-6 rounded-2xl space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-sm">O'rtacha xarajat</span>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg"><BarChart3 size={16} /></div>
          </div>
          <p className="text-3xl font-bold">{formatInt(averageCost)} UZS</p>
          <p className="text-slate-400 text-xs">Yoqilg'i xarajatining kunlik o'rtachasi</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-sm">ESMO ruxsat darajasi</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Activity size={16} /></div>
          </div>
          <p className="text-3xl font-bold">{esmoPassRate.toFixed(1)}%</p>
          <p className="text-xs text-slate-400">{formatInt(esmoPassed)} / {formatInt(esmoTotal)} ruxsat</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-sm">Texnik tayyorgarlik</span>
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg"><BarChart3 size={16} /></div>
          </div>
          <p className="text-3xl font-bold">{readiness.toFixed(1)}%</p>
          <p className="text-xs text-slate-400">{formatInt(mechanicPassed)} / {formatInt(mechanicTotal)} soz</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="font-bold">Yoqilg'i sarfi dinamikasi</h4>
            <span className="text-xs text-slate-400">
              {fuelSummary?.health?.status ? String(fuelSummary.health.status).toUpperCase() : 'UNKNOWN'}
            </span>
          </div>
          {trendData.length > 0 ? (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDayLabel} stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    cursor={{ fill: 'transparent', stroke: 'transparent' }}
                    wrapperStyle={{ outline: 'none' }}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                    }}
                    labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 600 }}
                    formatter={(value: unknown, name?: string | number) => {
                      if (String(name || '') === 'consumption') return [`${formatInt(toNumber(value))} l`, "Yoqilg'i sarfi"];
                      return [`${formatInt(toNumber(value))} UZS`, 'Xarajat'];
                    }}
                    labelFormatter={(label) => `Sana: ${formatDayLabel(String(label))}`}
                  />
                  <Bar dataKey="consumption" radius={[6, 6, 0, 0]} activeBar={false}>
                    {trendData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COMPOSITION_COLORS[index % COMPOSITION_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] w-full rounded-xl border border-slate-700/50 bg-slate-900/30 px-5 py-6 text-sm text-slate-400 flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-800/60 text-slate-300">
                  <AlertCircle size={16} />
                </div>
                <p>Tanlangan davrda yoqilg'i sarfi ma'lumoti topilmadi</p>
              </div>
            </div>
          )}
          <div className="text-xs text-slate-500">
            Oxirgi sync: {formatDateTime(fuelSummary?.health?.lastSyncAt)}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl space-y-6">
          <h4 className="font-bold">Yuk tarkibi (netto)</h4>
          {compositionData.length === 0 ? (
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-800/60 text-slate-300 mb-2">
                <AlertCircle size={16} />
              </div>
              <p>Tanlangan davr uchun yuk tarkibi ma'lumoti topilmadi</p>
              <p className="mt-2 text-xs text-slate-500">
                1C holati: {cargoSummary?.systemStatus ? String(cargoSummary.systemStatus).toUpperCase() : 'UNKNOWN'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {compositionData.map((item) => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="font-bold">{item.percent}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <svg className="h-full w-full" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
                      <rect
                        x="0"
                        y="0"
                        rx="4"
                        ry="4"
                        width={Math.max(0, Math.min(item.percent, 100))}
                        height="8"
                        className={getCompositionFillClass(item.color)}
                      />
                    </svg>
                  </div>
                  <div className="text-xs text-slate-500">{formatInt(item.totalNet)} kg</div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-4 border-t border-slate-700/50 text-xs text-slate-500">
            Manba: {cargoSummary?.source ? String(cargoSummary.source).toUpperCase() : '1C'} | Holat:{' '}
            {cargoSummary?.systemStatus ? String(cargoSummary.systemStatus).toUpperCase() : 'UNKNOWN'}
          </div>
        </div>
      </div>

    </div>
  );
};
