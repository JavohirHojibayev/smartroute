import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Table2, FileText, Plus, X, Save, Pencil, Trash2, Car, User, Users, FileBadge2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadXls } from '../utils/exportXls';
import { type DriverIdentity, type TransportRecord } from '../data/transportRegistry';
import { loadTransportRegistry, saveTransportRegistry } from '../data/transportStore';
import { useI18n } from '../i18n';

type DriverSlot = '1-haydovchi' | '2-haydovchi';

interface DriverRow {
  id: number;
  plate: string;
  firstDriverName: string;
  firstIdentity: DriverIdentity | null;
  secondDriverName: string;
  secondIdentity: DriverIdentity | null;
}

interface AddDriverForm {
  plate: string;
  firstDriverName: string;
  firstDocument: string;
  secondDriverName: string;
  secondDocument: string;
}

interface EditDriverForm {
  id: number;
  plate: string;
  firstDriverName: string;
  firstDocument: string;
  firstExpiryDate: string;
  secondDriverName: string;
  secondDocument: string;
  secondExpiryDate: string;
}

const emptyAddDriverForm: AddDriverForm = {
  plate: '',
  firstDriverName: '',
  firstDocument: '',
  secondDriverName: '',
  secondDocument: '',
};

const emptyEditDriverForm: EditDriverForm = {
  id: 0,
  plate: '',
  firstDriverName: '',
  firstDocument: '',
  firstExpiryDate: '',
  secondDriverName: '',
  secondDocument: '',
  secondExpiryDate: '',
};

const fallbackDash = '-';
const normalizePlateValue = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();
const normalizePlateKey = (value: string) => normalizePlateValue(value).replace(/[^A-Z0-9]/g, '');

const findDriverByRole = (transport: TransportRecord, role: DriverSlot) =>
  transport.drivers.find((driver) => driver.role === role);

const mapTransportToDriverRow = (transport: TransportRecord): DriverRow => {
  const first = findDriverByRole(transport, '1-haydovchi');
  const second = findDriverByRole(transport, '2-haydovchi');

  return {
    id: transport.id,
    plate: transport.plate,
    firstDriverName: first?.fullName ?? fallbackDash,
    firstIdentity: first?.identity ?? null,
    secondDriverName: second?.fullName ?? fallbackDash,
    secondIdentity: second?.identity ?? null,
  };
};

const getIdentityDocument = (identity: DriverIdentity | null) =>
  identity?.document?.trim() ? identity.document : fallbackDash;

const getIdentityExpiry = (identity: DriverIdentity | null) =>
  identity?.expiryDate?.trim() ? identity.expiryDate : fallbackDash;

const buildExportFileName = (ext: 'xls' | 'pdf') => {
  const datePart = new Date().toISOString().split('T')[0];
  return `haydovchilar_${datePart}.${ext}`;
};

const toExportRows = (rows: DriverRow[]) =>
  rows.map((row) => [
    row.plate,
    row.firstDriverName,
    getIdentityDocument(row.firstIdentity),
    getIdentityExpiry(row.firstIdentity),
    row.secondDriverName,
    getIdentityDocument(row.secondIdentity),
    getIdentityExpiry(row.secondIdentity),
  ]);

export const DriverManager = () => {
  const { t } = useI18n();
  const [transportRows, setTransportRows] = useState<TransportRecord[]>(() => loadTransportRegistry());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [exportingXls, setExportingXls] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetRow, setDeleteTargetRow] = useState<DriverRow | null>(null);
  const [addForm, setAddForm] = useState<AddDriverForm>(emptyAddDriverForm);
  const [editForm, setEditForm] = useState<EditDriverForm>(emptyEditDriverForm);

  useEffect(() => {
    saveTransportRegistry(transportRows);
  }, [transportRows]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return transportRows
      .map(mapTransportToDriverRow)
      .filter((row) => {
        if (!query) return true;
        return (
          row.plate.toLowerCase().includes(query) ||
          row.firstDriverName.toLowerCase().includes(query) ||
          row.secondDriverName.toLowerCase().includes(query) ||
          getIdentityDocument(row.firstIdentity).toLowerCase().includes(query) ||
          getIdentityDocument(row.secondIdentity).toLowerCase().includes(query) ||
          getIdentityExpiry(row.firstIdentity).toLowerCase().includes(query) ||
          getIdentityExpiry(row.secondIdentity).toLowerCase().includes(query)
        );
      });
  }, [searchTerm, transportRows]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [currentPage, filteredRows, rowsPerPage]);

  const stats = useMemo(() => {
    const firstDrivers = filteredRows.filter((row) => row.firstDriverName !== fallbackDash).length;
    const secondDrivers = filteredRows.filter((row) => row.secondDriverName !== fallbackDash).length;
    const documents = filteredRows.filter(
      (row) => row.firstIdentity?.document || row.secondIdentity?.document,
    ).length;

    return {
      totalTransports: filteredRows.length,
      firstDrivers,
      secondDrivers,
      documents,
    };
  }, [filteredRows]);

  const driverStatCards = [
    {
      id: 'total',
      title: 'Jami transport',
      value: stats.totalTransports,
      color: 'from-blue-500 to-cyan-400',
      icon: <Car />,
    },
    {
      id: 'firstDriver',
      title: t('driverFirst'),
      value: stats.firstDrivers,
      color: 'from-violet-500 to-fuchsia-400',
      icon: <User />,
    },
    {
      id: 'secondDriver',
      title: t('driverSecond'),
      value: stats.secondDrivers,
      color: 'from-sky-500 to-blue-400',
      icon: <Users />,
    },
    {
      id: 'documents',
      title: t('driverIdInfoExists'),
      value: stats.documents,
      color: 'from-emerald-500 to-teal-400',
      icon: <FileBadge2 />,
    },
  ];

  const handleExportExcel = () => {
    if (exportingXls || exportingPdf || filteredRows.length === 0) return;
    setExportingXls(true);
    try {
      const headers = [
        t('fleetHeadersPlate'),
        t('driverFirst'),
        t('driverPassportId'),
        'Berilgan muddati',
        t('driverSecond'),
        t('driverPassportId'),
        'Berilgan muddati',
      ];
      downloadXls(headers, toExportRows(filteredRows), buildExportFileName('xls'));
    } finally {
      setExportingXls(false);
    }
  };

  const handleExportPdf = async () => {
    if (exportingXls || exportingPdf || filteredRows.length === 0) return;
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
      doc.text(t('driverTitle'), 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Yaratilgan vaqt: ${new Date().toLocaleString()}`, 14, 25);

      autoTable(doc, {
        head: [[
          'Davlat raqami',
          '1-haydovchi',
          'Pasport/ID',
          'Berilgan muddati',
          '2-haydovchi',
          'Pasport/ID',
          'Berilgan muddati',
        ]],
        body: toExportRows(filteredRows),
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], font: 'Roboto' },
        styles: { fontSize: 8, font: 'Roboto' },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 55 },
          2: { cellWidth: 42 },
          3: { cellWidth: 35 },
          4: { cellWidth: 55 },
          5: { cellWidth: 42 },
          6: { cellWidth: 35 },
        },
      });

      doc.save(buildExportFileName('pdf'));
    } finally {
      setExportingPdf(false);
    }
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setAddForm(emptyAddDriverForm);
  };

  const openEditModal = (row: DriverRow) => {
    setEditForm({
      id: row.id,
      plate: row.plate,
      firstDriverName: row.firstDriverName === fallbackDash ? '' : row.firstDriverName,
      firstDocument: row.firstIdentity?.document ?? '',
      firstExpiryDate: row.firstIdentity?.expiryDate ?? '',
      secondDriverName: row.secondDriverName === fallbackDash ? '' : row.secondDriverName,
      secondDocument: row.secondIdentity?.document ?? '',
      secondExpiryDate: row.secondIdentity?.expiryDate ?? '',
    });
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditForm(emptyEditDriverForm);
  };

  const openDeleteModal = (row: DriverRow) => {
    setDeleteTargetRow(row);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteTargetRow(null);
    setIsDeleteModalOpen(false);
  };

  const buildIdentity = (document: string, expiryDate: string): DriverIdentity | null => {
    const doc = document.trim();
    if (!doc) return null;
    const expiry = expiryDate.trim();
    return {
      document: doc,
      expiryDate: expiry || null,
      raw: `${doc}${expiry ? ` ${expiry}` : ''}`,
    };
  };

  const saveEditedRow = () => {
    if (!editForm.id) return;

    const firstName = editForm.firstDriverName.trim();
    const secondName = editForm.secondDriverName.trim();

    const nextDrivers: TransportRecord['drivers'] = [];

    if (firstName) {
      nextDrivers.push({
        role: '1-haydovchi',
        fullName: firstName,
        identity: buildIdentity(editForm.firstDocument, editForm.firstExpiryDate),
      });
    }

    if (secondName) {
      nextDrivers.push({
        role: '2-haydovchi',
        fullName: secondName,
        identity: buildIdentity(editForm.secondDocument, editForm.secondExpiryDate),
      });
    }

    setTransportRows((prev) =>
      prev.map((transport) =>
        transport.id === editForm.id
          ? {
              ...transport,
              drivers: nextDrivers,
            }
          : transport,
      ),
    );

    closeEditModal();
  };

  const deleteRow = () => {
    if (!deleteTargetRow) return;
    const targetPlateKey = normalizePlateKey(deleteTargetRow.plate);

    // Driver removal must not remove the transport/certificate record.
    setTransportRows((prev) =>
      prev.map((transport) =>
        normalizePlateKey(transport.plate) === targetPlateKey
          ? {
              ...transport,
              drivers: [],
            }
          : transport,
      ),
    );
    closeDeleteModal();
  };

  const saveNewDriver = () => {
    const targetPlate = normalizePlateValue(addForm.plate);
    const targetPlateKey = normalizePlateKey(targetPlate);
    const firstName = addForm.firstDriverName.trim();
    const secondName = addForm.secondDriverName.trim();

    if (!targetPlateKey || (!firstName && !secondName)) {
      alert(t('driverDeleteRequiredAlert'));
      return;
    }

    const firstIdentity = buildIdentity(addForm.firstDocument, '');
    const secondIdentity = buildIdentity(addForm.secondDocument, '');

    setTransportRows((prev) => {
      const existingIndex = prev.findIndex((row) => normalizePlateKey(row.plate) === targetPlateKey);
      if (existingIndex === -1) {
        const newDrivers: TransportRecord['drivers'] = [];
        if (firstName) {
          newDrivers.push({
            role: '1-haydovchi',
            fullName: firstName,
            identity: firstIdentity,
          });
        }
        if (secondName) {
          newDrivers.push({
            role: '2-haydovchi',
            fullName: secondName,
            identity: secondIdentity,
          });
        }

        const newTransport: TransportRecord = {
          id: Date.now(),
          plate: targetPlate,
          model: "Ma'lumot kiritilmagan",
          color: fallbackDash,
          owner: fallbackDash,
          address: fallbackDash,
          issueDate: fallbackDash,
          issuingAuthority: fallbackDash,
          certificateNumber: fallbackDash,
          completeness: 'partial',
          source: 'xlsx',
          drivers: newDrivers,
        };
        return [newTransport, ...prev];
      }

      return prev.map((transport, idx) => {
        if (idx !== existingIndex) return transport;
        const nextDrivers = [...transport.drivers];

        if (firstName) {
          const firstIndex = nextDrivers.findIndex((driver) => driver.role === '1-haydovchi');
          const firstDriver = {
            role: '1-haydovchi' as const,
            fullName: firstName,
            identity: firstIdentity,
          };
          if (firstIndex >= 0) {
            nextDrivers[firstIndex] = firstDriver;
          } else {
            nextDrivers.push(firstDriver);
          }
        }

        if (secondName) {
          const secondIndex = nextDrivers.findIndex((driver) => driver.role === '2-haydovchi');
          const secondDriver = {
            role: '2-haydovchi' as const,
            fullName: secondName,
            identity: secondIdentity,
          };
          if (secondIndex >= 0) {
            nextDrivers[secondIndex] = secondDriver;
          } else {
            nextDrivers.push(secondDriver);
          }
        }

        return { ...transport, drivers: nextDrivers };
      });
    });

    closeAddModal();
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {driverStatCards.map((card) => (
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
              {t('driverTitle')}
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
                placeholder={t('driverSearchPlaceholder')}
                className="w-full bg-slate-900/50 border border-slate-700/60 rounded-lg pl-11 pr-4 py-3 text-base text-slate-200 placeholder:text-slate-500 outline-none focus:border-blue-500/60"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex w-full sm:w-auto justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              <Plus size={16} />
              {t('driverAdd')}
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap w-full xl:w-auto shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredRows.length === 0 || exportingXls || exportingPdf}
              className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Table2 size={16} />
              {exportingXls ? t('exportingXls') : t('exportXls')}
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredRows.length === 0 || exportingPdf || exportingXls}
              className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-4 text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                <th className="px-4 py-3 text-left">{t('fleetHeadersPlate')}</th>
                <th className="px-4 py-3 text-left">{t('driverFirst')}</th>
                <th className="px-4 py-3 text-left">{t('driverPassportId')}</th>
                <th className="px-4 py-3 text-left">{t('driverSecond')}</th>
                <th className="px-4 py-3 text-left">{t('driverPassportId')}</th>
                <th className="px-4 py-3 text-left">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500 text-sm">
                    {t('dataNotFound')}
                  </td>
                </tr>
              )}
              {pagedRows.map((row) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-t border-slate-800/80 hover:bg-slate-900/40 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-100 font-semibold">{row.plate}</td>
                  <td className="px-4 py-3 text-slate-100 font-semibold">{row.firstDriverName}</td>
                  <td className="px-4 py-3 text-slate-100 font-semibold">{getIdentityDocument(row.firstIdentity)}</td>
                  <td className="px-4 py-3 text-slate-100 font-semibold">{row.secondDriverName}</td>
                  <td className="px-4 py-3 text-slate-100 font-semibold">{getIdentityDocument(row.secondIdentity)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        title="Tahrirlash"
                        aria-label="Tahrirlash"
                        onClick={() => openEditModal(row)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title={t('deleteLabel')}
                        aria-label={t('deleteLabel')}
                        onClick={() => openDeleteModal(row)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white bg-red-600 hover:bg-red-500 transition-colors"
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
            <span>{t('rowsPerPage')}</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
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

      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={closeEditModal}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            aria-label="close"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fleet-cert-modal relative w-full max-w-3xl rounded-2xl border border-slate-700/60 bg-slate-900 p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="fleet-cert-modal-title text-xl font-bold text-slate-100">{t('driverEditTitle')}</h3>
                <p className="text-xs text-slate-400 mt-1">{t('fleetHeadersPlate')}: {editForm.plate}</p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="fleet-cert-modal-close p-2 rounded-lg hover:bg-slate-800 text-slate-300"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('driverFirst')}</label>
                <input
                  value={editForm.firstDriverName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, firstDriverName: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="F.I.Sh"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('driverFirstPassportId')}</label>
                <input
                  value={editForm.firstDocument}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, firstDocument: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Masalan: AB1234567"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('driverSecond')}</label>
                <input
                  value={editForm.secondDriverName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, secondDriverName: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="F.I.Sh"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('driverSecondPassportId')}</label>
                <input
                  value={editForm.secondDocument}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, secondDocument: e.target.value }))}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Masalan: AB1234567"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                className="fleet-cert-modal-cancel px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                {t('cancelLabel')}
              </button>
              <button
                type="button"
                onClick={saveEditedRow}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                <Save size={16} />
                Yangilash
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isDeleteModalOpen && deleteTargetRow && (
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
            className="fleet-cert-modal relative w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900 p-6"
          >
            <h3 className="fleet-cert-modal-title text-lg font-bold text-slate-100">Qatorni o'chirish</h3>
            <p className="mt-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-100">{deleteTargetRow.plate}</span> uchun haydovchilarni
              rostdan ham o'chirmoqchimisiz?
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Transport guvohnoma ma'lumotlari saqlanadi, faqat haydovchi birikmalari tozalanadi.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="fleet-cert-modal-cancel px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                {t('cancelLabel')}
              </button>
              <button
                type="button"
                onClick={deleteRow}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold"
              >
                <Trash2 size={16} />
                {t('deleteLabel')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={closeAddModal}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            aria-label="close"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fleet-cert-modal relative w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-slate-900 p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="fleet-cert-modal-title text-xl font-bold text-slate-100">{t('driverAddTitle')}</h3>
              <button type="button" onClick={closeAddModal} className="fleet-cert-modal-close p-2 rounded-lg hover:bg-slate-800 text-slate-300">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('fleetHeadersPlate')}</label>
                <input
                  value={addForm.plate}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, plate: e.target.value }))}
                  placeholder="Masalan: 70 123 ABC"
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('driverFirst')}</label>
                <input
                  value={addForm.firstDriverName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, firstDriverName: e.target.value }))}
                  placeholder={t('driverFirstPlaceholder')}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('driverFirstPassportId')}</label>
                <input
                  value={addForm.firstDocument}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, firstDocument: e.target.value }))}
                  placeholder="Masalan: AB1234567"
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('driverSecond')}</label>
                <input
                  value={addForm.secondDriverName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, secondDriverName: e.target.value }))}
                  placeholder={t('driverSecondPlaceholder')}
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="fleet-cert-modal-label block text-xs font-semibold text-slate-400 mb-1.5 uppercase">{t('driverSecondPassportId')}</label>
                <input
                  value={addForm.secondDocument}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, secondDocument: e.target.value }))}
                  placeholder="Masalan: AB1234567"
                  className="fleet-cert-modal-input w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAddModal}
                className="fleet-cert-modal-cancel px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                {t('cancelLabel')}
              </button>
              <button
                type="button"
                onClick={saveNewDriver}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                <Save size={16} />
                {t('save')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
