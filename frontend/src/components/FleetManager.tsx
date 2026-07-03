import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Car,
  Search,
  Users,
  User,
  FileBadge2,
  Building2,
  CalendarCheck2,
  ShieldCheck,
  ShieldAlert,
  Pencil,
  Save,
  X,
  Table2,
  FileText,
  Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { type TransportRecord } from '../data/transportRegistry';
import { hydrateTransportRegistryRecords, loadTransportRegistry, saveTransportRegistry } from '../data/transportStore';
import { useI18n } from '../i18n';

const API_BASE = resolveApiBaseUrl();

const newClientRecordId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `new-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

type CertificateModalMode = 'create' | 'edit';

interface CertificateFormState {
  plate: string;
  model: string;
  color: string;
  owner: string;
  address: string;
  issueDate: string;
  issuingAuthority: string;
  certificateNumber: string;
  manufactureYear: string;
  vehicleType: string;
  chassisNumber: string;
  totalWeightKg: string;
  curbWeightKg: string;
  engineNumber: string;
  enginePower: string;
  fuelType: string;
  seatCount: string;
  standingCapacity: string;
  specialNotes: string;
}

const PLACEHOLDER_DASH = '-';

const emptyFormState: CertificateFormState = {
  plate: '',
  model: '',
  color: '',
  owner: '',
  address: '',
  issueDate: '',
  issuingAuthority: '',
  certificateNumber: '',
  manufactureYear: '',
  vehicleType: '',
  chassisNumber: '',
  totalWeightKg: '',
  curbWeightKg: '',
  engineNumber: '',
  enginePower: '',
  fuelType: '',
  seatCount: '',
  standingCapacity: '',
  specialNotes: '',
};

const normalizeFormValue = (value: string, fallback = PLACEHOLDER_DASH): string => {
  const trimmed = value.trim();
  return trimmed === '' ? fallback : trimmed;
};

const normalizePlateValue = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();
const normalizePlateKey = (value: string) => normalizePlateValue(value).replace(/[^A-Z0-9]/g, '');
const digitsOnly = (value: string) => value.replace(/\D/g, '');
const fieldScore = (vehicle: TransportRecord) => {
  const fields = [vehicle.model, vehicle.owner, vehicle.issueDate, vehicle.certificateNumber];
  return fields.reduce((acc, field) => (isPlaceholderLike(field ?? '') ? acc : acc + 1), 0);
};
const transportScore = (rows: TransportRecord[]) =>
  rows.reduce((acc, row) => {
    const driverScore = (row.drivers?.length ?? 0) * 2;
    const fullBonus = row.completeness === 'full' ? 3 : 0;
    return acc + fieldScore(row) + driverScore + fullBonus;
  }, 0);
const recordMergeKey = (row: TransportRecord, fallback: string) => {
  const cid = String(row.clientRecordId ?? '').trim();
  if (cid) return `cid:${cid}`;
  const plate = normalizePlateKey(row.plate);
  if (plate) return `plate:${plate}`;
  const id = Number(row.id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;
  return `fallback:${fallback}`;
};
const mergeTransportRows = (localRows: TransportRecord[], serverRows: TransportRecord[]) => {
  const byKey = new Map<string, TransportRecord>();

  const upsert = (row: TransportRecord, key: string) => {
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      return;
    }
    byKey.set(key, fieldScore(row) >= fieldScore(existing) ? row : existing);
  };

  localRows.forEach((row, index) => upsert(row, recordMergeKey(row, `local-${index}`)));
  serverRows.forEach((row, index) => upsert(row, recordMergeKey(row, `server-${index}`)));

  return [...byKey.values()];
};


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

const isPlaceholderLike = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized) || MOJIBAKE_DASH_VALUES.has(normalized);
};

const displayValue = (value: string | undefined | null) => {
  if (typeof value !== 'string') return PLACEHOLDER_DASH;
  return isPlaceholderLike(value) ? PLACEHOLDER_DASH : value;
};

const buildExportFileName = (ext: 'xls' | 'pdf') => {
  const datePart = new Date().toISOString().split('T')[0];
  return `transportlar_${datePart}.${ext}`;
};

const mapRecordsToExportRows = (records: TransportRecord[]) =>
  records.map((vehicle) => [
    vehicle.plate,
    displayValue(vehicle.model),
    displayValue(vehicle.owner),
    displayValue(vehicle.certificateNumber),
    vehicle.drivers.length
      ? vehicle.drivers.map((driver) => `${driver.role}: ${driver.fullName}`).join(' | ')
      : '',
    vehicle.completeness === 'full' ? 'full' : 'partial',
  ]);

export const FleetManager = () => {
  const { t } = useI18n();
  const [vehicles, setVehicles] = useState<TransportRecord[]>(() => loadTransportRegistry());
  const [remoteSynced, setRemoteSynced] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedPlate, setSelectedPlate] = useState<string>('');
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [certificateModalMode, setCertificateModalMode] = useState<CertificateModalMode>('create');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetVehicle, setDeleteTargetVehicle] = useState<TransportRecord | null>(null);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  const [certificateForm, setCertificateForm] = useState<CertificateFormState>(emptyFormState);
  const [exportingXls, setExportingXls] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [isSavingCertificate, setIsSavingCertificate] = useState(false);
  const [certificateProcessStatus, setCertificateProcessStatus] = useState('');

  useEffect(() => {
    saveTransportRegistry(vehicles);
  }, [vehicles]);

  /** SQLite bazada doimiy saqlash + serverda ko‘proq yozuv bo‘lsa u yutadi */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/integrations/transport-registry`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { records?: unknown[] };
        const serverRows = Array.isArray(data.records) ? (data.records as TransportRecord[]) : [];
        const local = loadTransportRegistry();
        const hydratedLocal = hydrateTransportRegistryRecords(local);
        const hydratedServer = hydrateTransportRegistryRecords(serverRows);
        const merged = hydrateTransportRegistryRecords(mergeTransportRows(hydratedLocal, hydratedServer));
        setVehicles(merged);
        if (
          merged.length !== hydratedServer.length ||
          transportScore(merged) > transportScore(hydratedServer)
        ) {
          await fetch(`${API_BASE}/integrations/transport-registry`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: merged }),
          });
        }
      } catch {
        /* tarmoq yo‘q — faqat localStorage */
      } finally {
        if (!cancelled) setRemoteSynced(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!remoteSynced) return;
    const handle = window.setTimeout(() => {
      void fetch(`${API_BASE}/integrations/transport-registry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: vehicles }),
      }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(handle);
  }, [vehicles, remoteSynced]);

  const filteredVehicles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const queryPlateKey = normalizePlateKey(searchTerm);
    const queryDigits = digitsOnly(searchTerm);
    return vehicles.filter((vehicle) => {
      const vehiclePlateKey = normalizePlateKey(vehicle.plate);
      const vehiclePlateDigits = digitsOnly(vehicle.plate);
      const matchesSearch =
        !query ||
        vehicle.plate.toLowerCase().includes(query) ||
        (queryPlateKey !== '' && vehiclePlateKey.includes(queryPlateKey)) ||
        (queryDigits.length >= 2 && vehiclePlateDigits.includes(queryDigits)) ||
        vehicle.model.toLowerCase().includes(query) ||
        vehicle.owner.toLowerCase().includes(query) ||
        vehicle.certificateNumber.toLowerCase().includes(query) ||
        vehicle.drivers.some((driver) => driver.fullName.toLowerCase().includes(query));

      return matchesSearch;
    });
  }, [searchTerm, vehicles]);

  useEffect(() => {
    if (filteredVehicles.length === 0) {
      if (selectedPlate !== '') setSelectedPlate('');
      return;
    }
    if (selectedPlate === '') return;
    const hasSelectedVehicle = filteredVehicles.some((vehicle) => vehicle.plate === selectedPlate);
    if (!hasSelectedVehicle) {
      setSelectedPlate('');
    }
  }, [filteredVehicles, selectedPlate]);

  const selectedVehicle =
    selectedPlate.trim() === ''
      ? null
      : filteredVehicles.find((vehicle) => vehicle.plate === selectedPlate) ?? null;

  const totalRows = filteredVehicles.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedVehicles = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredVehicles.slice(start, start + rowsPerPage);
  }, [currentPage, filteredVehicles, rowsPerPage]);

  const stats = useMemo(() => {
    const withTwoDrivers = vehicles.filter((vehicle) => vehicle.drivers.length >= 2).length;
    const withOneDriver = vehicles.filter((vehicle) => vehicle.drivers.length === 1).length;
    const withFullDocs = vehicles.filter((vehicle) => vehicle.completeness === 'full').length;

    return {
      total: vehicles.length,
      withTwoDrivers,
      withOneDriver,
      withFullDocs,
    };
  }, [vehicles]);

  const transportStatCards = [
    {
      id: 'total',
      title: 'Jami transport',
      value: stats.total,
      color: 'from-blue-500 to-cyan-400',
      icon: <Car />,
    },
    {
      id: 'twoDrivers',
      title: '2 ta haydovchili',
      value: stats.withTwoDrivers,
      color: 'from-violet-500 to-fuchsia-400',
      icon: <Users />,
    },
    {
      id: 'oneDriver',
      title: '1 ta haydovchili',
      value: stats.withOneDriver,
      color: 'from-sky-500 to-blue-400',
      icon: <User />,
    },
    {
      id: 'fullDocs',
      title: t('fleetCertificateComplete'),
      value: stats.withFullDocs,
      color: 'from-emerald-500 to-teal-400',
      icon: <FileBadge2 />,
    },
  ];

  const openCreateCertificateModal = () => {
    setEditingVehicleId(null);
    setCertificateModalMode('create');
    setCertificateForm(emptyFormState);
    setIsCertificateModalOpen(true);
  };

  const openEditCertificateModal = (vehicle: TransportRecord) => {
    setEditingVehicleId(vehicle.id);
    setCertificateModalMode('edit');
    setCertificateForm({
      plate: vehicle.plate,
      model: vehicle.model.toLowerCase() === "ma'lumot kiritilmagan" ? '' : vehicle.model,
      color: isPlaceholderLike(vehicle.color) ? '' : vehicle.color,
      owner: isPlaceholderLike(vehicle.owner) ? '' : vehicle.owner,
      address: isPlaceholderLike(vehicle.address) ? '' : vehicle.address,
      issueDate: isPlaceholderLike(vehicle.issueDate) ? '' : vehicle.issueDate,
      issuingAuthority: isPlaceholderLike(vehicle.issuingAuthority) ? '' : vehicle.issuingAuthority,
      certificateNumber: isPlaceholderLike(vehicle.certificateNumber) ? '' : vehicle.certificateNumber,
      manufactureYear: isPlaceholderLike(vehicle.manufactureYear ?? '') ? '' : (vehicle.manufactureYear ?? ''),
      vehicleType: isPlaceholderLike(vehicle.vehicleType ?? '') ? '' : (vehicle.vehicleType ?? ''),
      chassisNumber: isPlaceholderLike(vehicle.chassisNumber ?? '') ? '' : (vehicle.chassisNumber ?? ''),
      totalWeightKg: isPlaceholderLike(vehicle.totalWeightKg ?? '') ? '' : (vehicle.totalWeightKg ?? ''),
      curbWeightKg: isPlaceholderLike(vehicle.curbWeightKg ?? '') ? '' : (vehicle.curbWeightKg ?? ''),
      engineNumber: isPlaceholderLike(vehicle.engineNumber ?? '') ? '' : (vehicle.engineNumber ?? ''),
      enginePower: isPlaceholderLike(vehicle.enginePower ?? '') ? '' : (vehicle.enginePower ?? ''),
      fuelType: isPlaceholderLike(vehicle.fuelType ?? '') ? '' : (vehicle.fuelType ?? ''),
      seatCount: isPlaceholderLike(vehicle.seatCount ?? '') ? '' : (vehicle.seatCount ?? ''),
      standingCapacity: isPlaceholderLike(vehicle.standingCapacity ?? '') ? '' : (vehicle.standingCapacity ?? ''),
      specialNotes: isPlaceholderLike(vehicle.specialNotes ?? '') ? '' : (vehicle.specialNotes ?? ''),
    });
    setIsCertificateModalOpen(true);
  };

  const closeCertificateModal = () => {
    setIsCertificateModalOpen(false);
    setEditingVehicleId(null);
    setCertificateModalMode('create');
    setCertificateForm(emptyFormState);
  };

  const openDeleteModal = (vehicle: TransportRecord) => {
    setDeleteTargetVehicle(vehicle);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteTargetVehicle(null);
    setIsDeleteModalOpen(false);
  };

  const deleteSelectedVehicle = () => {
    if (!deleteTargetVehicle) return;

    setVehicles((previous) => previous.filter((vehicle) => vehicle.id !== deleteTargetVehicle.id));
    closeDeleteModal();
  };

  const saveCertificateData = () => {
    if (isSavingCertificate) return;
    const isEditMode = certificateModalMode === 'edit' && editingVehicleId !== null;
    const normalizedPlate = normalizePlateValue(certificateForm.plate);
    const normalizedPlateKey = normalizePlateKey(normalizedPlate);
    const normalizedCertificateNumber = normalizeFormValue(certificateForm.certificateNumber).replace(/[^0-9A-Z]/gi, '');
    if (!normalizedPlateKey) {
      alert("Davlat raqami majburiy.");
      return;
    }

    const hasMainFields =
      certificateForm.model.trim() !== '' && certificateForm.owner.trim() !== '' && certificateForm.issueDate.trim() !== '';
    const normalizedCompleteness: TransportRecord['completeness'] = hasMainFields ? 'full' : 'partial';

    const payload = {
      plate: normalizedPlate,
      model: normalizeFormValue(certificateForm.model, "Ma'lumot kiritilmagan"),
      color: normalizeFormValue(certificateForm.color),
      owner: normalizeFormValue(certificateForm.owner),
      address: normalizeFormValue(certificateForm.address),
      issueDate: normalizeFormValue(certificateForm.issueDate),
      issuingAuthority: normalizeFormValue(certificateForm.issuingAuthority),
      certificateNumber: normalizeFormValue(certificateForm.certificateNumber),
      manufactureYear: normalizeFormValue(certificateForm.manufactureYear),
      vehicleType: normalizeFormValue(certificateForm.vehicleType),
      chassisNumber: normalizeFormValue(certificateForm.chassisNumber),
      totalWeightKg: normalizeFormValue(certificateForm.totalWeightKg),
      curbWeightKg: normalizeFormValue(certificateForm.curbWeightKg),
      engineNumber: normalizeFormValue(certificateForm.engineNumber),
      enginePower: normalizeFormValue(certificateForm.enginePower),
      fuelType: normalizeFormValue(certificateForm.fuelType),
      seatCount: normalizeFormValue(certificateForm.seatCount),
      standingCapacity: normalizeFormValue(certificateForm.standingCapacity),
      specialNotes: normalizeFormValue(certificateForm.specialNotes),
      completeness: normalizedCompleteness,
    };

    setIsSavingCertificate(true);
    setCertificateProcessStatus("Jarayon: guvohnoma saqlanmoqda...");

    let nextProcessStatus = "Jarayon: guvohnoma saqlandi.";
    setVehicles((previous) => {
      const matchingPlateIndexes = previous
        .map((vehicle, index) => ({ vehicle, index }))
        .filter(({ vehicle }) => normalizePlateKey(vehicle.plate) === normalizedPlateKey)
        .map(({ index }) => index);
      const matchingCertificateIndexes = previous
        .map((vehicle, index) => ({ vehicle, index }))
        .filter(({ vehicle }) => normalizeFormValue(vehicle.certificateNumber).replace(/[^0-9A-Z]/gi, '') === normalizedCertificateNumber)
        .map(({ index }) => index);

      const primaryIndex =
        (isEditMode ? previous.findIndex((vehicle) => vehicle.id === editingVehicleId) : -1) >= 0
          ? previous.findIndex((vehicle) => vehicle.id === editingVehicleId)
          : matchingPlateIndexes[0] ?? matchingCertificateIndexes[0] ?? -1;

      const duplicatedIndexes = new Set<number>([
        ...matchingPlateIndexes,
        ...matchingCertificateIndexes,
      ]);
      if (primaryIndex >= 0) duplicatedIndexes.delete(primaryIndex);

      if (primaryIndex >= 0) {
        const updated = previous.map((vehicle, index) =>
          index !== primaryIndex
            ? vehicle
            : {
                ...vehicle,
                ...payload,
                source: (vehicle.source === 'xlsx' ? 'xlsx' : 'pdf+xlsx') as TransportRecord['source'],
              },
        );
        const deduped = updated.filter((_, index) => !duplicatedIndexes.has(index));
        nextProcessStatus = "Jarayon: eski guvohnoma yangisiga almashtirildi (duplikat yo'q).";
        return deduped;
      }

      const nextId = previous.reduce((maxId, vehicle) => Math.max(maxId, vehicle.id), 0) + 1;
      nextProcessStatus = "Jarayon: yangi guvohnoma qo'shildi.";
      return [
        ...previous,
        {
          id: nextId,
          clientRecordId: newClientRecordId(),
          ...payload,
          source: 'pdf' as TransportRecord['source'],
          drivers: [],
        },
      ];
    });
    setCertificateProcessStatus(nextProcessStatus);

    setSelectedPlate(normalizedPlate);
    closeCertificateModal();
    window.setTimeout(() => setIsSavingCertificate(false), 250);
  };

  const handleExportExcel = () => {
    if (exportingXls || exportingPdf || filteredVehicles.length === 0) return;
    setExportingXls(true);
    try {
      const headers = [t('fleetHeadersPlate'), t('fleetHeadersModel'), t('fleetHeadersOwner'), t('fleetHeadersCertificateNumber'), t('fleetHeadersDrivers'), t('fleetHeadersCertificateStatus')];
      const rows = mapRecordsToExportRows(filteredVehicles).map((row) => [
        row[0],
        row[1],
        row[2],
        row[3],
        row[4] || t('fleetNoDriverAssigned'),
        row[5] === 'full' ? t('fleetCompletenessFull') : t('fleetCompletenessPartial'),
      ]);
      downloadXls(headers, rows, buildExportFileName('xls'));
    } finally {
      setExportingXls(false);
    }
  };

  const handleExportPdf = async () => {
    if (exportingPdf || exportingXls || filteredVehicles.length === 0) return;
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
        // Keep default font if fetch fails.
      }

      doc.setFontSize(16);
      doc.text(t('fleetTitle'), 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Yaratilgan vaqt: ${new Date().toLocaleString()}`, 14, 25);

      autoTable(doc, {
        head: [[t('fleetHeadersPlate'), t('fleetHeadersModel'), t('fleetHeadersOwner'), t('fleetHeadersCertificateNumber'), t('fleetHeadersDrivers'), t('fleetHeadersCertificateStatus')]],
        body: mapRecordsToExportRows(filteredVehicles).map((row) => [
          row[0],
          row[1],
          row[2],
          row[3],
          row[4] || t('fleetNoDriverAssigned'),
          row[5] === 'full' ? t('fleetCompletenessFull') : t('fleetCompletenessPartial'),
        ]),
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], font: 'Roboto' },
        styles: { fontSize: 8, font: 'Roboto' },
        columnStyles: { 4: { cellWidth: 250 } },
      });

      doc.save(buildExportFileName('pdf'));
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {transportStatCards.map((card) => (
          <div
            key={card.id}
            className="glass-panel rounded-2xl p-4 border border-slate-700/50 relative overflow-hidden group"
          >
            <div className={`absolute -right-6 -top-6 w-36 h-36 bg-gradient-to-br ${card.color} rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500`}></div>
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">{card.value}</div>
                <div className="text-xs uppercase tracking-wider text-slate-400 mt-2">{card.title}</div>
              </div>
              <div className={`p-4 rounded-xl bg-gradient-to-br ${card.color} text-white shadow-xl [&>svg]:w-[26px] [&>svg]:h-[26px]`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
        <div className="p-4 sm:p-6 border-b border-slate-700/50 flex flex-col xl:flex-row xl:justify-between xl:items-center gap-4 bg-slate-800/20">
          <div className="flex items-center gap-4 min-w-0 flex-1 flex-wrap w-full">
            <h3 className="app-module-heading">
              {t('fleetTitle')}
            </h3>

            <div className="relative w-full md:max-w-md min-w-0 md:min-w-[260px] ml-0 md:ml-2 lg:ml-auto">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Davlat raqami, model, egasi yoki haydovchini qidiring..."
                className="w-full bg-slate-900/50 border border-slate-700/60 rounded-lg pl-11 pr-4 py-3 text-base text-slate-200 placeholder:text-slate-500 outline-none focus:border-blue-500/60"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap ml-0 md:ml-2">
              <button
                type="button"
                onClick={openCreateCertificateModal}
                className="inline-flex w-full sm:w-auto justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors"
              >
                <Pencil size={15} />
                {t('fleetAddCertificate')}
              </button>
            </div>
            {certificateProcessStatus && (
              <div className="w-full text-xs text-emerald-300">
                {certificateProcessStatus}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap w-full xl:w-auto shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredVehicles.length === 0 || exportingXls || exportingPdf}
              className="inline-flex w-full sm:w-auto justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Table2 size={16} />
              {exportingXls ? t('exportingXls') : t('exportXls')}
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredVehicles.length === 0 || exportingPdf || exportingXls}
              className="inline-flex w-full sm:w-auto justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText size={16} />
              {exportingPdf ? t('exportingPdf') : t('exportPdf')}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto dark-scrollbar">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr className="text-slate-400 uppercase text-xs tracking-wider">
                <th className="px-4 py-3 text-left">Davlat raqami</th>
                <th className="px-4 py-3 text-left">Rusum / model</th>
                <th className="px-4 py-3 text-left">Egasi</th>
                <th className="px-4 py-3 text-left">{t('fleetHeadersCertificateNumber')}</th>
                <th className="px-4 py-3 text-left">{t('fleetHeadersDrivers')}</th>
                <th className="px-4 py-3 text-left">{t('fleetHeadersCertificateStatus')}</th>
                <th className="px-4 py-3 text-left">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm">
                    {t('dataNotFound')}
                  </td>
                </tr>
              )}
              {pagedVehicles.map((vehicle) => {
                const isSelected = selectedPlate !== '' && vehicle.plate === selectedPlate;
                return (
                  <tr
                    key={vehicle.id}
                    onClick={() => setSelectedPlate(vehicle.plate)}
                    className={`border-t border-slate-800/80 cursor-pointer transition-colors ${
                      isSelected ? 'fleet-row-selected' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-100">{vehicle.plate}</td>
                    <td className="px-4 py-3 text-slate-300">{displayValue(vehicle.model)}</td>
                    <td className="px-4 py-3 text-slate-300">{displayValue(vehicle.owner)}</td>
                    <td className="px-4 py-3 text-slate-300">{displayValue(vehicle.certificateNumber)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {vehicle.drivers.length === 0 ? (
                          <span className="text-slate-500">{t('fleetNoDriverAssigned')}</span>
                        ) : (
                          vehicle.drivers.map((driver) => (
                            <span key={`${vehicle.plate}-${driver.role}`} className="text-slate-300">
                              {driver.role}: {driver.fullName}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {vehicle.completeness === 'full' ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 text-xs font-semibold">
                          <ShieldCheck size={14} />
                          {t('fleetCompletenessFull')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 text-xs font-semibold">
                          <ShieldAlert size={14} />
                          {t('fleetCompletenessPartial')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPlate(vehicle.plate);
                            openEditCertificateModal(vehicle);
                          }}
                          title={t('editLabel')}
                          aria-label={t('editLabel')}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPlate(vehicle.plate);
                            openDeleteModal(vehicle);
                          }}
                          title={t('deleteLabel')}
                          aria-label={t('deleteLabel')}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="table-pagination-bar px-4 py-3 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span id="fleet-rows-per-page-label">{t('rowsPerPage')}</span>
            <select
              aria-labelledby="fleet-rows-per-page-label"
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-900/50 border border-slate-700/60 rounded-md px-2 py-1 text-slate-200"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

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
              {t('previous')}
            </button>
            <span className="text-sm text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-md border border-slate-700/60 text-sm text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('next')}
            </button>
          </div>
        </div>
      </div>

      {selectedVehicle && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl border border-slate-700/50 overflow-hidden"
        >
          <div className="p-5 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-100">
                Davlar raqam belgisi: {selectedVehicle.plate}
              </h3>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-slate-300">
                <Car size={16} className="mt-0.5 text-blue-400" />
                <div>
                  <div className="text-xs text-slate-500 uppercase">Rusum / Model</div>
                  <div className="font-medium">{displayValue(selectedVehicle.model)}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <FileBadge2 size={16} className="mt-0.5 text-blue-400" />
                <div>
                  <div className="text-xs text-slate-500 uppercase">Guvohnoma raqami (JSH SHIR / STIR)</div>
                  <div className="font-medium">{displayValue(selectedVehicle.certificateNumber)}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <Building2 size={16} className="mt-0.5 text-blue-400" />
                <div>
                  <div className="text-xs text-slate-500 uppercase">Egasi</div>
                  <div className="font-medium">{displayValue(selectedVehicle.owner)}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <CalendarCheck2 size={16} className="mt-0.5 text-blue-400" />
                <div>
                  <div className="text-xs text-slate-500 uppercase">Berilgan sana</div>
                  <div className="font-medium">{displayValue(selectedVehicle.issueDate)}</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                <div className="text-xs text-slate-500 uppercase mb-2">Rang</div>
                <div className="text-slate-200 font-medium">{displayValue(selectedVehicle.color)}</div>
              </div>
              <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                <div className="text-xs text-slate-500 uppercase mb-2">Manzil</div>
                <div className="text-slate-200 font-medium">{displayValue(selectedVehicle.address)}</div>
              </div>
              <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
                <div className="text-xs text-slate-500 uppercase mb-2">Beruvchi bo'lim</div>
                <div className="text-slate-200 font-medium">{displayValue(selectedVehicle.issuingAuthority)}</div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
              <div className="text-slate-300 font-semibold mb-3">Guvohnoma texnik ma'lumotlari (namuna bo'yicha)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">Ishlab chiqarilgan yili</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.manufactureYear)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">Turi</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.vehicleType)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">Kuzov / Shassi raqami</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.chassisNumber)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">To'la vazni (kg)</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.totalWeightKg)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">Yuksiz vazni (kg)</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.curbWeightKg)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">Dvigatel raqami</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.engineNumber)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">Dvigatel quvvati</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.enginePower)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">Yoqilg'i turi</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.fuelType)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">O'tiradigan joylar soni</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.seatCount)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3">
                  <div className="text-xs uppercase text-slate-500 mb-1">Tik turadigan joylar soni</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.standingCapacity)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-3 md:col-span-2 xl:col-span-2">
                  <div className="text-xs uppercase text-slate-500 mb-1">Alohida belgilar</div>
                  <div className="font-semibold text-slate-200">{displayValue(selectedVehicle.specialNotes)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 text-slate-300 font-semibold mb-3">
                <Users size={16} className="text-blue-400" />
                Biriktirilgan haydovchilar
              </div>
              {selectedVehicle.drivers.length === 0 ? (
                <div className="text-slate-500 text-sm">Bu transport uchun haydovchi ro'yxatga olinmagan.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedVehicle.drivers.map((driver) => (
                    <div key={`${selectedVehicle.plate}-${driver.role}`} className="rounded-lg border border-slate-700/60 p-3">
                      <div className="text-xs uppercase text-slate-500 mb-1">{driver.role}</div>
                      <div className="font-semibold text-slate-200">{driver.fullName}</div>
                      <div className="text-sm text-slate-400 mt-1">
                        {driver.identity ? `${driver.identity.document}${driver.identity.expiryDate ? ` • ${driver.identity.expiryDate}` : ''}` : "ID ma'lumoti yo'q"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {isCertificateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={closeCertificateModal}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            aria-label="close"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fleet-cert-modal relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/60 bg-slate-900 p-6 dark-scrollbar"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="fleet-cert-modal-title text-xl font-bold text-slate-100">
                  {certificateModalMode === 'edit'
                    ? "Guvohnoma ma'lumotini tahrirlash"
                    : "Guvohnoma ma'lumotini qo'lda kiritish"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeCertificateModal}
                className="fleet-cert-modal-close p-2 rounded-lg hover:bg-slate-800 text-slate-300"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Davlat raqami</label>
                <input
                  value={certificateForm.plate}
                  onChange={(e) => setCertificateForm((prev) => ({ ...prev, plate: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Masalan: 70 946 LBA"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Rusum / model</label>
                <input
                  value={certificateForm.model}
                  onChange={(e) => setCertificateForm((prev) => ({ ...prev, model: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Masalan: SHACMAN SX3258DR384"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Rang</label>
                <input
                  value={certificateForm.color}
                  onChange={(e) => setCertificateForm((prev) => ({ ...prev, color: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Masalan: Sariq-jeltiy"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Egasi</label>
                <input
                  value={certificateForm.owner}
                  onChange={(e) => setCertificateForm((prev) => ({ ...prev, owner: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Korxona yoki F.I.Sh"
                />
              </div>
              <div className="md:col-span-2">
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Manzil</label>
                <textarea
                  value={certificateForm.address}
                  onChange={(e) => setCertificateForm((prev) => ({ ...prev, address: e.target.value }))}
                  className="fleet-cert-modal-input w-full h-20 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Ro'yxatdan o'tgan manzil"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Berilgan sana</label>
                <input
                  value={certificateForm.issueDate}
                  onChange={(e) => setCertificateForm((prev) => ({ ...prev, issueDate: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="DD/MM/YYYY"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Beruvchi bo'lim</label>
                <input
                  value={certificateForm.issuingAuthority}
                  onChange={(e) => setCertificateForm((prev) => ({ ...prev, issuingAuthority: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Masalan: 1-TRO va IOB"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Guvohnoma raqami</label>
                <input
                  value={certificateForm.certificateNumber}
                  onChange={(e) => setCertificateForm((prev) => ({ ...prev, certificateNumber: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="JSH SHIR / STIR"
                />
              </div>
            </div>


            <div className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Ishlab chiqarilgan yili</label>
                  <input
                    value={certificateForm.manufactureYear}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, manufactureYear: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: 2020"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Turi</label>
                  <input
                    value={certificateForm.vehicleType}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, vehicleType: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: Yuk o'zi ag'daruvchi"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Kuzov / shassi raqami</label>
                  <input
                    value={certificateForm.chassisNumber}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, chassisNumber: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Raqam"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">To'la vazni (kg)</label>
                  <input
                    value={certificateForm.totalWeightKg}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, totalWeightKg: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: 25000"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Yuksiz vazni (kg)</label>
                  <input
                    value={certificateForm.curbWeightKg}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, curbWeightKg: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: 13500"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Dvigatel raqami</label>
                  <input
                    value={certificateForm.engineNumber}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, engineNumber: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Dvigatel raqami"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Dvigatel quvvati</label>
                  <input
                    value={certificateForm.enginePower}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, enginePower: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: 340"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Yoqilg'i turi</label>
                  <input
                    value={certificateForm.fuelType}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, fuelType: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: Dizel"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">O'tiradigan joylar soni</label>
                  <input
                    value={certificateForm.seatCount}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, seatCount: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: 2"
                  />
                </div>
                <div>
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Tik turadigan joylar soni</label>
                  <input
                    value={certificateForm.standingCapacity}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, standingCapacity: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: 0"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Alohida belgilar</label>
                  <input
                    value={certificateForm.specialNotes}
                    onChange={(e) => setCertificateForm((prev) => ({ ...prev, specialNotes: e.target.value }))}
                    className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="Masalan: auksion bayonnomasi"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeCertificateModal}
                disabled={isSavingCertificate}
                className="fleet-cert-modal-cancel px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                {t('cancelLabel')}
              </button>
              <button
                type="button"
                onClick={saveCertificateData}
                disabled={isSavingCertificate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                {isSavingCertificate ? t('savingLabel') : certificateModalMode === 'edit' ? t('updateLabel') : t('save')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isDeleteModalOpen && deleteTargetVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={closeDeleteModal}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            aria-label="close"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900 p-6"
          >
            <h3 className="text-lg font-bold text-slate-100">{t('fleetDeleteTitle')}</h3>
            <p className="mt-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-100">{deleteTargetVehicle.plate}</span> qatorini rostdan ham
              o'chirmoqchimisiz?
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Bu amal qaytarilmaydi.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                {t('cancelLabel')}
              </button>
              <button
                type="button"
                onClick={deleteSelectedVehicle}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold"
              >
                <Trash2 size={16} />
                {t('deleteLabel')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

