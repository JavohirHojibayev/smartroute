import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Table2, FileText, Search, ShieldCheck, Weight } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { downloadXls } from '../utils/exportXls';
import type { PermissionLevel } from '../permissions';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from '../components/shared/LocalizedDateInput';

type CargoSummaryVehicle = {
  plate: string;
  count: number;
  totalNet: number;
  totalGross: number;
  totalTare: number;
};

type CargoSummaryCargo = {
  cargoType: string;
  count: number;
  totalNet: number;
  totalGross: number;
};

type CargoSummary = {
  source: string;
  totalRecords: number;
  totalGross: number;
  totalTare: number;
  totalNet: number;
  byVehicle: CargoSummaryVehicle[];
  byCargo: CargoSummaryCargo[];
  lastSyncAt: string | null;
  systemStatus: 'online' | 'offline' | string;
  syncError?: string | null;
};

type CargoJournalRow = {
  id: number;
  externalId: string;
  measuredAt: string | null;
  plate: string | null;
  documentNo: string | null;
  cargoType: string | null;
  grossWeight: number | null;
  tareWeight: number | null;
  netWeight: number | null;
};

type CargoJournalResponse = {
  items: CargoJournalRow[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  lastSyncAt: string | null;
  systemStatus: 'online' | 'offline' | string;
  syncError?: string | null;
};

type CargoManagerProps = {
  authToken: string;
  accessLevel: PermissionLevel;
};

const API_BASE = resolveApiBaseUrl();

const formatDateTime = (value: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const normalizeErrorMessage = (payload: any, fallback: string): string => {
  const message = payload?.message;
  if (Array.isArray(message) && message.length > 0) return String(message[0]);
  if (typeof message === 'string' && message.trim()) return message;
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
  return fallback;
};

const numberOrZero = (value: number | null | undefined): number => {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Number(value);
};

export const CargoManager = ({ authToken, accessLevel }: CargoManagerProps) => {
  const { t } = useI18n();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [exportingXls, setExportingXls] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [summary, setSummary] = useState<CargoSummary>({
    source: '1c',
    totalRecords: 0,
    totalGross: 0,
    totalTare: 0,
    totalNet: 0,
    byVehicle: [],
    byCargo: [],
    lastSyncAt: null,
    systemStatus: 'offline',
    syncError: null,
  });
  const [journal, setJournal] = useState<CargoJournalResponse>({
    items: [],
    pagination: { total: 0, page: 1, pageSize: 10, totalPages: 1 },
    lastSyncAt: null,
    systemStatus: 'offline',
    syncError: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (showLoading = false) => {
    if (!authToken) {
      setError(t('cargoTokenMissing'));
      return;
    }
    if (showLoading) setLoading(true);

    try {
      const summaryParams = new URLSearchParams();
      const journalParams = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(rowsPerPage),
        search: search.trim(),
      });

      if (dateFrom) {
        summaryParams.set('dateFrom', dateFrom);
        journalParams.set('dateFrom', dateFrom);
      }
      if (dateTo) {
        summaryParams.set('dateTo', dateTo);
        journalParams.set('dateTo', dateTo);
      }

      const [summaryRes, journalRes] = await Promise.all([
        fetch(`${API_BASE}/integrations/1c/weights/summary?${summaryParams.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch(`${API_BASE}/integrations/1c/weights/journal?${journalParams.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ]);

      const [summaryPayload, journalPayload] = await Promise.all([
        summaryRes.json().catch(() => null),
        journalRes.json().catch(() => null),
      ]);

      if (!summaryRes.ok) {
        throw new Error(normalizeErrorMessage(summaryPayload, t('cargoSummaryLoadError')));
      }
      if (!journalRes.ok) {
        throw new Error(normalizeErrorMessage(journalPayload, t('cargoJournalLoadError')));
      }

      setSummary({
        source: String(summaryPayload?.source || '1c'),
        totalRecords: Number(summaryPayload?.totalRecords ?? 0),
        totalGross: Number(summaryPayload?.totalGross ?? 0),
        totalTare: Number(summaryPayload?.totalTare ?? 0),
        totalNet: Number(summaryPayload?.totalNet ?? 0),
        byVehicle: Array.isArray(summaryPayload?.byVehicle) ? summaryPayload.byVehicle : [],
        byCargo: Array.isArray(summaryPayload?.byCargo) ? summaryPayload.byCargo : [],
        lastSyncAt: summaryPayload?.lastSyncAt ? String(summaryPayload.lastSyncAt) : null,
        systemStatus: String(summaryPayload?.systemStatus || 'offline'),
        syncError: summaryPayload?.syncError ? String(summaryPayload.syncError) : null,
      });

      setJournal({
        items: Array.isArray(journalPayload?.items) ? journalPayload.items : [],
        pagination: {
          total: Number(journalPayload?.pagination?.total ?? 0),
          page: Number(journalPayload?.pagination?.page ?? 1),
          pageSize: Number(journalPayload?.pagination?.pageSize ?? rowsPerPage),
          totalPages: Number(journalPayload?.pagination?.totalPages ?? 1),
        },
        lastSyncAt: journalPayload?.lastSyncAt ? String(journalPayload.lastSyncAt) : null,
        systemStatus: String(journalPayload?.systemStatus || 'offline'),
        syncError: journalPayload?.syncError ? String(journalPayload.syncError) : null,
      });

      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('cargoDataLoadError'));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, [authToken, currentPage, rowsPerPage, search, dateFrom, dateTo]);

  useEffect(() => {
    if (!authToken) return;
    const timer = window.setInterval(() => {
      void loadData(false);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [authToken, currentPage, rowsPerPage, search, dateFrom, dateTo]);

  const chartData = useMemo(
    () =>
      summary.byVehicle.slice(0, 12).map((row) => ({
        plate: row.plate,
        netto: numberOrZero(row.totalNet),
      })),
    [summary.byVehicle],
  );

  const buildExportFileName = (ext: 'xls' | 'pdf') => {
    const datePart = new Date().toISOString().split('T')[0];
    return `1c_tarozi_jurnali_${datePart}.${ext}`;
  };

  const fetchAllJournalForExport = async (): Promise<CargoJournalRow[]> => {
    if (!authToken) throw new Error(t('cargoTokenMissing'));

    const pageSize = 500;
    let page = 1;
    let totalPages = 1;
    const allRows: CargoJournalRow[] = [];

    while (page <= totalPages) {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search: search.trim(),
      });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const response = await fetch(`${API_BASE}/integrations/1c/weights/journal?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, t('cargoExportLoadError')));
      }

      const items = Array.isArray(payload?.items) ? payload.items : [];
      allRows.push(...items);
      const parsedTotalPages = Number(payload?.pagination?.totalPages ?? 1);
      totalPages = Number.isFinite(parsedTotalPages) ? Math.max(1, parsedTotalPages) : 1;
      page += 1;
    }

    const unique = new Map<number, CargoJournalRow>();
    for (const row of allRows) {
      if (!unique.has(row.id)) unique.set(row.id, row);
    }

    const toMs = (value: string | null) => {
      if (!value) return 0;
      const ms = new Date(value).getTime();
      return Number.isNaN(ms) ? 0 : ms;
    };

    return [...unique.values()].sort((a, b) => toMs(b.measuredAt) - toMs(a.measuredAt));
  };

  const toExportRows = (rows: CargoJournalRow[]) =>
    rows.map((row) => [
      formatDateTime(row.measuredAt),
      (row.plate || '-').toUpperCase(),
      row.documentNo || '-',
      row.cargoType || '-',
      numberOrZero(row.grossWeight),
      numberOrZero(row.tareWeight),
      numberOrZero(row.netWeight),
    ]);

  const handleExportXls = async () => {
    if (exportingXls || exportingPdf) return;
    setExportingXls(true);
    try {
      const rows = await fetchAllJournalForExport();
      if (rows.length === 0) return;
      const headers = [t('cargoHeadersMeasuredAt'), t('fleetHeadersPlate'), t('cargoHeadersDocument'), t('cargoType'), `${t('cargoGross')} (kg)`, 'Tara (kg)', `${t('cargoNet')} (kg)`];
      downloadXls(headers, toExportRows(rows), buildExportFileName('xls'));
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'XLS export xatoligi');
    } finally {
      setExportingXls(false);
    }
  };

  const handleExportPdf = async () => {
    if (exportingPdf || exportingXls) return;
    setExportingPdf(true);
    try {
      const rows = await fetchAllJournalForExport();
      if (rows.length === 0) return;

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
        // Keep default font if loading fails.
      }

      doc.setFontSize(16);
      doc.text('1C ' + t('device'), 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${t('createdAt')}: ${new Date().toLocaleString()}`, 14, 25);

      autoTable(doc, {
        head: [[t('cargoHeadersMeasuredAt'), t('fleetHeadersPlate'), t('cargoHeadersDocument'), t('cargoType'), `${t('cargoGross')} (kg)`, 'Tara (kg)', `${t('cargoNet')} (kg)`]],
        body: toExportRows(rows),
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], font: 'Roboto' },
        styles: { fontSize: 8, font: 'Roboto' },
      });

      doc.save(buildExportFileName('pdf'));
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : t('pdfExportError'));
    } finally {
      setExportingPdf(false);
    }
  };

  if (accessLevel === 'none') {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
        {t('noModulePermission')}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap justify-between items-start sm:items-center gap-3 bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-700/50">
        <div className="flex flex-wrap gap-3 items-center w-full xl:w-auto">
          <div className="relative w-full sm:w-auto sm:min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Raqam, hujjat yoki yuk turi bo'yicha..."
              className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 transition-all w-full sm:w-72"
            />
          </div>

          <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <LocalizedDateInput
              label={t('dateFromSanadan')}
              value={dateFrom}
              maxDate={dateTo || undefined}
              onChange={(v) => {
                setDateFrom(v);
                setCurrentPage(1);
              }}
              minWidth={168}
            />
            <LocalizedDateInput
              label={t('dateToSanagacha')}
              value={dateTo}
              minDate={dateFrom || undefined}
              onChange={(v) => {
                setDateTo(v);
                setCurrentPage(1);
              }}
              minWidth={168}
            />
          </div>

        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full xl:w-auto">
          <button
            type="button"
            onClick={() => void handleExportXls()}
            disabled={journal.pagination.total === 0 || exportingXls || exportingPdf}
            className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Table2 size={16} />
            {exportingXls ? t('exportingXls') : t('exportXls')}
          </button>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={journal.pagination.total === 0 || exportingPdf || exportingXls}
            className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText size={16} />
            {exportingPdf ? t('exportingPdf') : t('exportPdf')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-slate-700/50">
          <div className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            {summary.totalRecords.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mt-2">{t('cargoTotalRecords')}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-slate-700/50">
          <div className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            {summary.totalGross.toLocaleString()} <span className="text-base">kg</span>
          </div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mt-2">{t('cargoGross')}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-slate-700/50">
          <div className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            {summary.totalTare.toLocaleString()} <span className="text-base">kg</span>
          </div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mt-2">Tara</div>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-slate-700/50">
          <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            {summary.totalNet.toLocaleString()} <span className="text-base">kg</span>
          </div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mt-2">{t('cargoNet')}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-panel rounded-2xl border border-slate-700/50 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Weight size={20} className="text-blue-400" />
              Transportlar bo'yicha netto yuk
            </h3>
          </div>

          {chartData.length === 0 ? (
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500">
              Grafik uchun ma'lumot topilmadi
            </div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 16, left: -8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="plate" stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}
                    formatter={(value: any) => [`${Number(value).toLocaleString()} kg`, t('cargoNet')]}
                  />
                  <Bar dataKey="netto" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl border border-slate-700/50 p-5 space-y-4">
          <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
            <ShieldCheck size={15} className="text-blue-400" />
            1C holati
          </h4>
          <div className="text-sm text-slate-400 space-y-2">
            <div className="flex justify-between">
              <span>Manba</span>
              <span className="text-slate-200 font-semibold uppercase">{summary.source}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('cargoStatus')}</span>
              <span className={summary.systemStatus === 'online' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                {summary.systemStatus.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t('cargoLastSync')}</span>
              <span className="text-slate-200 font-semibold">{formatDateTime(summary.lastSyncAt)}</span>
            </div>
            {summary.syncError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 break-all">
                {summary.syncError}
              </div>
            ) : null}
          </div>

          <div className="pt-2 border-t border-slate-700/50">
            <h5 className="text-xs uppercase tracking-wider text-slate-400 mb-2">{t('cargoTypes')}</h5>
            <div className="space-y-2 max-h-[220px] overflow-auto dark-scrollbar pr-1">
              {summary.byCargo.length === 0 ? (
                <div className="text-xs text-slate-500">{t('cargoNoData')}</div>
              ) : (
                summary.byCargo.map((item) => (
                  <div key={item.cargoType} className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-200">{item.cargoType}</span>
                      <span className="text-xs text-slate-400">{item.count} ta</span>
                    </div>
                    <div className="text-xs text-blue-300 mt-1">{Number(item.totalNet || 0).toLocaleString()} kg netto</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
        <div className="p-4 sm:p-6 border-b border-slate-700/50">
          <h3 className="app-module-heading">
            1C tarozi jurnali
          </h3>
        </div>

        <div className="overflow-x-auto dark-scrollbar">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr className="text-slate-400 uppercase text-xs tracking-wider">
                <th className="px-4 py-3 text-left">{t('cargoHeadersMeasuredAt')}</th>
                <th className="px-4 py-3 text-left">{t('fleetHeadersPlate')}</th>
                <th className="px-4 py-3 text-left">{t('cargoHeadersDocument')}</th>
                <th className="px-4 py-3 text-left">{t('cargoType')}</th>
                <th className="px-4 py-3 text-left">{t('cargoGross')} (kg)</th>
                <th className="px-4 py-3 text-left">Tara (kg)</th>
                <th className="px-4 py-3 text-left">{t('cargoNet')} (kg)</th>
              </tr>
            </thead>
            <tbody>
              {journal.items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm">
                    {t('dataNotFound')}
                  </td>
                </tr>
              ) : null}
              {journal.items.map((row) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-t border-slate-800/80 hover:bg-slate-900/40 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-300">{formatDateTime(row.measuredAt)}</td>
                  <td className="px-4 py-3 text-slate-100 font-semibold uppercase">{row.plate || '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{row.documentNo || '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{row.cargoType || '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{numberOrZero(row.grossWeight).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-300">{numberOrZero(row.tareWeight).toLocaleString()}</td>
                  <td className="px-4 py-3 text-blue-300 font-semibold">{numberOrZero(row.netWeight).toLocaleString()}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-pagination-bar px-4 py-3 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <span>{t('rowsPerPage')}</span>
            <select
              value={rowsPerPage}
              onChange={(event) => {
                setRowsPerPage(Number(event.target.value));
                setCurrentPage(1);
              }}
              aria-label="Har bir sahifada qatorlar soni"
              className="bg-slate-900/50 border border-slate-700/60 rounded-md px-2 py-1 text-slate-200"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>

          <div className="text-sm text-slate-400">
            {journal.pagination.total === 0
              ? '0 / 0'
              : `${(journal.pagination.page - 1) * journal.pagination.pageSize + 1}-${Math.min(journal.pagination.page * journal.pagination.pageSize, journal.pagination.total)} / ${journal.pagination.total}`}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={journal.pagination.page <= 1}
              className="px-3 py-1.5 rounded-md border border-slate-700/60 text-sm text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('previous')}
            </button>
            <span className="text-sm text-slate-300">
              {journal.pagination.page} / {journal.pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(journal.pagination.totalPages, prev + 1))}
              disabled={journal.pagination.page >= journal.pagination.totalPages}
              className="px-3 py-1.5 rounded-md border border-slate-700/60 text-sm text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
