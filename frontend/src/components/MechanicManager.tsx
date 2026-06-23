import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Filter,
  Pencil,
  PlusCircle,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { resolveApiBaseUrl } from '../utils/apiBase';
import type { PermissionLevel } from '../permissions';
import { type TransportRecord } from '../data/transportRegistry';
import { loadTransportRegistry } from '../data/transportStore';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from './LocalizedDateInput';

type InspectionStatus = 'passed' | 'pending' | 'failed';

type MechanicInspectionRow = {
  id: number;
  vehicleId: number | null;
  plate: string;
  model: string;
  status: InspectionStatus;
  notes: string;
  inspectionTime: string | null;
  mechanicName: string | null;
};

type MechanicSummary = {
  day: string;
  totalToday: number;
  passedToday: number;
  pendingToday: number;
  failedToday: number;
};

type FormState = {
  plate: string;
  model: string;
  status: InspectionStatus;
  notes: string;
  inspectionTime: string;
};

type TransportOption = {
  plate: string;
  model: string;
};

type MechanicManagerProps = {
  authToken: string;
  accessLevel: PermissionLevel;
};

const API_BASE = resolveApiBaseUrl();

const normalizePlateValue = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();

const toTransportOptions = (records: TransportRecord[]): TransportOption[] => {
  const byPlate = new Map<string, TransportOption>();

  for (const record of records) {
    const plate = normalizePlateValue(String(record?.plate || ''));
    if (!plate) continue;

    const model = String(record?.model || '').trim();
    const existing = byPlate.get(plate);
    if (!existing) {
      byPlate.set(plate, { plate, model });
      continue;
    }

    if (!existing.model && model) {
      byPlate.set(plate, { plate, model });
    }
  }

  return [...byPlate.values()].sort((a, b) => a.plate.localeCompare(b.plate));
};

const emptyForm: FormState = {
  plate: '',
  model: '',
  status: 'pending',
  notes: '',
  inspectionTime: '',
};

const statusLabel = (status: InspectionStatus): string => {
  if (status === 'failed') return 'NOSOZ';
  return 'KO\'RIKDA';
};

const statusBadgeClass = (status: InspectionStatus): string => {
  if (status === 'failed') {
    return 'bg-red-500/10 text-red-400 border-red-500/30';
  }
  return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
};

const formatInspectionDate = (iso: string | null): string => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

const toInputDate = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toInspectionDateIso = (inputDate: string): string | undefined => {
  if (!inputDate) return undefined;
  const match = inputDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0).toISOString();
};

const normalizeErrorMessage = (payload: any, fallback: string): string => {
  const message = payload?.message;
  if (Array.isArray(message) && message.length > 0) return String(message[0]);
  if (typeof message === 'string' && message.trim()) return message;
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
  return fallback;
};

export const MechanicManager = ({ authToken, accessLevel }: MechanicManagerProps) => {
  const { t } = useI18n();
  const [rows, setRows] = useState<MechanicInspectionRow[]>([]);
  const [summary, setSummary] = useState<MechanicSummary>({
    day: '',
    totalToday: 0,
    passedToday: 0,
    pendingToday: 0,
    failedToday: 0,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InspectionStatus>('all');
  const [topFilterDropdownOpen, setTopFilterDropdownOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<MechanicInspectionRow | null>(null);
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const [transportOptions, setTransportOptions] = useState<TransportOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const canManage = accessLevel === 'full';

  const refreshTransportOptions = () => {
    setTransportOptions(toTransportOptions(loadTransportRegistry()));
  };

  useEffect(() => {
    refreshTransportOptions();
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      refreshTransportOptions();
    }
  }, [isModalOpen]);

  const loadData = async (showLoading = false) => {
    if (!authToken) {
      setError('Token topilmadi');
      return;
    }

    if (showLoading) setLoading(true);
    try {
      const listParams = new URLSearchParams({
        page: '1',
        pageSize: '5000',
      });
      if (dateFrom) listParams.set('dateFrom', dateFrom);
      if (dateTo) listParams.set('dateTo', dateTo);

      const summaryParams = new URLSearchParams();
      summaryParams.set('scope', 'all');
      if (dateFrom) summaryParams.set('dateFrom', dateFrom);
      if (dateTo) summaryParams.set('dateTo', dateTo);

      const [listRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/mechanic/inspections?${listParams.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch(`${API_BASE}/mechanic/summary${summaryParams.toString() ? `?${summaryParams.toString()}` : ''}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ]);

      const [listPayload, summaryPayload] = await Promise.all([
        listRes.json().catch(() => null),
        summaryRes.json().catch(() => null),
      ]);

      if (!listRes.ok) {
        throw new Error(normalizeErrorMessage(listPayload, 'Texnik ko\'rik jurnalini olishda xatolik'));
      }
      if (!summaryRes.ok) {
        throw new Error(normalizeErrorMessage(summaryPayload, 'Texnik ko\'rik statistikasi olishda xatolik'));
      }

      const listItems = Array.isArray(listPayload?.items) ? listPayload.items : [];
      setRows(
        listItems.map((item: any) => ({
          id: Number(item?.id),
          vehicleId: item?.vehicleId == null ? null : Number(item?.vehicleId),
          plate: String(item?.plate || '-'),
          model: String(item?.model || "Ma'lumot kiritilmagan"),
          status: String(item?.status || 'pending') as InspectionStatus,
          notes: String(item?.notes || ''),
          inspectionTime: item?.inspectionTime ? String(item.inspectionTime) : null,
          mechanicName: item?.mechanicName ? String(item.mechanicName) : null,
        })),
      );

      setSummary({
        day: String(summaryPayload?.day || ''),
        totalToday: Number(summaryPayload?.totalToday ?? 0),
        passedToday: Number(summaryPayload?.passedToday ?? 0),
        pendingToday: Number(summaryPayload?.pendingToday ?? 0),
        failedToday: Number(summaryPayload?.failedToday ?? 0),
      });

      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Texnik ko\'rik bo\'limida xatolik');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
    const timer = setInterval(() => {
      void loadData(false);
    }, 3000);
    return () => clearInterval(timer);
  }, [authToken, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!query) return true;
      return (
        row.plate.toLowerCase().includes(query) ||
        row.model.toLowerCase().includes(query) ||
        row.notes.toLowerCase().includes(query) ||
        (row.mechanicName || '').toLowerCase().includes(query)
      );
    });
  }, [rows, searchQuery, statusFilter]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const repairQueue = useMemo(() => {
    return filteredRows
      .filter((row) => row.status !== 'passed')
      .slice(0, 8);
  }, [filteredRows]);

  const openCreateModal = () => {
    if (!canManage) return;
    setEditingRow(null);
    setFormState(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (row: MechanicInspectionRow) => {
    if (!canManage) return;
    setEditingRow(row);
    setFormState({
      plate: normalizePlateValue(row.plate),
      model: row.model || '',
      status: row.status,
      notes: row.notes || '',
      inspectionTime: toInputDate(row.inspectionTime),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingRow(null);
    setFormState(emptyForm);
    setFormError(null);
  };

  const findTransportByPlate = (plateRaw: string) => {
    const normalized = normalizePlateValue(plateRaw);
    if (!normalized) return null;
    return transportOptions.find((item) => normalizePlateValue(item.plate) === normalized) || null;
  };

  const handlePlateInputChange = (rawPlate: string) => {
    const plateDraft = rawPlate.toUpperCase();
    const selected = findTransportByPlate(plateDraft);
    setFormState((prev) => ({
      ...prev,
      plate: plateDraft,
      model: selected ? selected.model : prev.model,
    }));
  };

  const handlePlateInputBlur = () => {
    const plate = normalizePlateValue(formState.plate);
    const selected = findTransportByPlate(plate);
    setFormState((prev) => ({
      ...prev,
      plate,
      model: selected ? selected.model : prev.model,
    }));
  };

  const submitInspection = async () => {
    if (!canManage) return;
    if (!authToken) {
      setFormError('Token topilmadi');
      return;
    }

    const plate = normalizePlateValue(formState.plate);
    if (!plate) {
      setFormError('Davlat raqami majburiy');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const payload = {
        plate,
        model: formState.model.trim(),
        status: formState.status,
        notes: formState.notes.trim(),
        inspectionTime: toInspectionDateIso(formState.inspectionTime),
      };

      const isEdit = Boolean(editingRow);
      const endpoint = isEdit
        ? `${API_BASE}/mechanic/inspections/${editingRow?.id}`
        : `${API_BASE}/mechanic/inspections`;
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(result, 'Texnik ko\'rikni saqlashda xatolik'));
      }

      closeModal();
      await loadData(true);
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Texnik ko\'rikni saqlashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  const deleteInspection = async (row: MechanicInspectionRow) => {
    if (!canManage || !authToken) return;
    const confirmed = window.confirm(`"${row.plate}" uchun texnik ko'rik yozuvini o'chirmoqchimisiz?`);
    if (!confirmed) return;

    setDeletingId(row.id);
    try {
      const response = await fetch(`${API_BASE}/mechanic/inspections/${row.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, 'Texnik ko\'rikni o\'chirishda xatolik'));
      }
      await loadData(true);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Texnik ko\'rikni o\'chirishda xatolik');
    } finally {
      setDeletingId(null);
    }
  };

  const plateSelectOptions = useMemo(() => {
    const currentPlate = normalizePlateValue(formState.plate);
    if (!currentPlate) return transportOptions;
    const exists = transportOptions.some((item) => item.plate === currentPlate);
    if (exists) return transportOptions;
    return [{ plate: currentPlate, model: formState.model || '' }, ...transportOptions];
  }, [formState.model, formState.plate, transportOptions]);

  if (accessLevel === 'none') {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
        Bu bo'lim uchun ruxsatingiz yo'q.
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
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Davlat raqami, model yoki izoh bo'yicha..."
              className="pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-amber-500 transition-all w-full sm:w-72 uppercase"
            />
          </div>

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

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setTopFilterDropdownOpen(!topFilterDropdownOpen)}
              className={`flex h-[42px] w-[42px] items-center justify-center rounded-lg border transition-colors ${
                statusFilter !== 'all' || topFilterDropdownOpen
                  ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                  : 'border-slate-700/60 bg-slate-900/50 text-yellow-500 hover:text-yellow-400'
              }`}
            >
              <Filter size={18} />
            </button>

            {topFilterDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setTopFilterDropdownOpen(false)}
                />
                <div className="absolute top-full right-0 mt-2 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50 text-sm font-normal text-slate-300">
                  <button
                    className={`w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors ${statusFilter === 'all' ? 'text-yellow-400 bg-slate-900/50 font-medium' : ''}`}
                    onClick={() => { setStatusFilter('all'); setTopFilterDropdownOpen(false); setCurrentPage(1); }}
                  >
                    Barcha holatlar
                  </button>
                  <button
                    className={`w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors ${statusFilter === 'pending' ? 'text-yellow-400 bg-slate-900/50 font-medium' : ''}`}
                    onClick={() => { setStatusFilter('pending'); setTopFilterDropdownOpen(false); setCurrentPage(1); }}
                  >
                    KO'RIKDA
                  </button>
                  <button
                    className={`w-full text-left px-4 py-2 hover:bg-slate-700 transition-colors ${statusFilter === 'failed' ? 'text-yellow-400 bg-slate-900/50 font-medium' : ''}`}
                    onClick={() => { setStatusFilter('failed'); setTopFilterDropdownOpen(false); setCurrentPage(1); }}
                  >
                    NOSOZ
                  </button>
                </div>
              </>
            )}
          </div>

        </div>

        <button
          type="button"
          onClick={openCreateModal}
          disabled={!canManage}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-all shadow-lg shadow-amber-500/20 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PlusCircle size={16} />
          Yangi tekshiruv
        </button>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Read rejimi: texnik ko'rik ma'lumotlarini ko'rishingiz mumkin, lekin qo'shish/tahrirlash/o'chirish bloklangan.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
          <div className="p-4 sm:p-6 border-b border-slate-700/50 flex items-center justify-between gap-3 bg-slate-800/20">
            <h3 className="app-module-heading">
              Texnik ko'rik jurnali
            </h3>
            {summary.day ? <div className="text-xs text-slate-400">Sana: {summary.day}</div> : null}
          </div>

          <div className="overflow-x-auto dark-scrollbar">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/70">
                <tr className="text-slate-400 uppercase text-xs tracking-wider">
                  <th className="px-4 py-3 text-left">Davlat raqami</th>
                  <th className="px-4 py-3 text-left">Model</th>
                  <th className="px-4 py-3 text-left">Sana</th>
                  <th className="px-4 py-3 text-left">Holat</th>
                  <th className="px-4 py-3 text-left">Mas'ul</th>
                  <th className="px-4 py-3 text-left">Izoh</th>
                  <th className="px-4 py-3 text-left">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {!loading && totalRows === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm">
                      Ma'lumot topilmadi
                    </td>
                  </tr>
                )}
                {pagedRows.map((row) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-t border-slate-800/80 hover:bg-slate-900/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-100 font-semibold">{row.plate}</td>
                    <td className="px-4 py-3 text-slate-300">{row.model}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatInspectionDate(row.inspectionTime)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border inline-flex items-center gap-1 ${statusBadgeClass(row.status)}`}>
                        {row.status === 'passed' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{row.mechanicName || '-'}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-[320px]">
                      <div className="line-clamp-2 break-words">{row.notes || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => openEditModal(row)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Tahrirlash"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={!canManage || deletingId === row.id}
                          onClick={() => void deleteInspection(row)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="O'chirish"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-pagination-bar px-4 py-3 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <span>Rows/page</span>
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
              {totalRows === 0
                ? '0 / 0'
                : `${(currentPage - 1) * rowsPerPage + 1}-${Math.min(currentPage * rowsPerPage, totalRows)} / ${totalRows}`}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-md border border-slate-700/60 text-sm text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Oldingi
              </button>
              <span className="text-sm text-slate-300">{currentPage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-md border border-slate-700/60 text-sm text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Keyingi
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-2xl border border-slate-700/50 p-5 space-y-3">
            <h4 className="text-xs uppercase tracking-wider text-slate-400 font-bold">Umumiy statistika</h4>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Jami</span>
              <span className="font-bold text-white">{summary.totalToday}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-amber-300">KO'RIKDA</span>
              <span className="font-bold text-amber-200">{summary.pendingToday}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-red-400">NOSOZ</span>
              <span className="font-bold text-red-300">{summary.failedToday}</span>
            </div>
          </div>

          <div className="glass-panel rounded-2xl border border-slate-700/50 p-5">
            <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-4">
              <Wrench size={16} className="text-amber-400" />
              Ta'mirlash navbati
            </h4>
            {repairQueue.length === 0 ? (
              <div className="text-sm text-slate-500">Navbat bo'sh</div>
            ) : (
              <div className="space-y-3">
                {repairQueue.map((row) => (
                  <div key={row.id} className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-200">{row.plate}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{row.model}</div>
                    <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {row.notes || "Qo'shimcha izoh kiritilmagan"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={closeModal}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            aria-label="close"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-slate-900 p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-slate-100">
                {editingRow ? 'Texnik ko\'rikni tahrirlash' : 'Yangi texnik ko\'rik'}
              </h3>
              <button type="button" onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-800 text-slate-300">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label>
                <span className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Davlat raqami</span>
                <input
                  list="mechanic-plate-options"
                  value={formState.plate}
                  onChange={(event) => handlePlateInputChange(event.target.value)}
                  onBlur={handlePlateInputBlur}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500 uppercase"
                  placeholder="Masalan: 70 946 LBA"
                />
                <datalist id="mechanic-plate-options">
                  {plateSelectOptions.map((option) => (
                    <option key={option.plate} value={option.plate}>
                      {option.model}
                    </option>
                  ))}
                </datalist>
              </label>

              <label>
                <span className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Model</span>
                <input
                  value={formState.model}
                  onChange={(event) => setFormState((prev) => ({ ...prev, model: event.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                  placeholder="Masalan: SHACMAN SX3258"
                />
              </label>

              <label>
                <span className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Holat</span>
                <select
                  value={formState.status}
                  onChange={(event) => setFormState((prev) => ({ ...prev, status: event.target.value as InspectionStatus }))}
                  aria-label="Tekshiruv holati"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="pending">KO'RIKDA</option>
                  <option value="failed">NOSOZ</option>
                </select>
              </label>

              <label>
                <span className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Tekshiruv sanasi</span>
                <input
                  type="date"
                  value={formState.inspectionTime}
                  onChange={(event) => setFormState((prev) => ({ ...prev, inspectionTime: event.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </label>

              <label className="md:col-span-2">
                <span className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Izoh</span>
                <textarea
                  value={formState.notes}
                  onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                  className="w-full h-24 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
                  placeholder="Topilgan texnik holat yoki ta'mirlash bo'yicha izoh..."
                />
              </label>
            </div>

            {formError ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {formError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void submitInspection()}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saqlanmoqda...' : editingRow ? 'Yangilash' : 'Saqlash'}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
};
