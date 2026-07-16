import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Car, Navigation, Wrench, Clock, Pickaxe, FileText, Table2, MapPin } from 'lucide-react';
import { useI18n } from '../i18n';
import { LocalizedDateInput } from '../components/shared/LocalizedDateInput';
import { resolveApiBaseUrl } from '../utils/apiBase';

import { useWaybillStore } from '../store/waybillStore';

const API_BASE = resolveApiBaseUrl();

interface DispatcherRow {
  id: string;
  plate: string;
  type: string;
  driver: string;
  task: string;
  timeRange: {
      dep: string;
      ret: string;
  };
  status: string;
  location: string;
  locationLink?: string;
}

const formatDateTimeStr = (dt: string | undefined | null) => {
  if (!dt) return '--:--';
  const parts = dt.split('T');
  if (parts.length === 2) {
      const [date, time] = parts;
      const [y, m, d] = date.split('-');
      return `${d}.${m}.${y} ${time}`;
  }
  return dt;
};

export const DispatcherDashboard = () => {
  const { t, lang } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { savedDetails } = useWaybillStore();
  const [gpsData, setGpsData] = useState<Record<string, { address: string; lat: number; lng: number }>>({});

  useEffect(() => {
    let mounted = true;
    const fetchGps = async () => {
      try {
        const res = await fetch(`${API_BASE}/integrations/tracking/garvex/vehicles`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.items && Array.isArray(data.items)) {
          const newGps: Record<string, { address: string; lat: number; lng: number }> = {};
          data.items.forEach((item: any) => {
            const name = String(item.name || item.objectCode || '').trim().replace(/\s+/g, '').toLowerCase();
            const address = String(item.point?.a || '').trim();
            const lat = Number(item.point?.y);
            const lng = Number(item.point?.x);
            if (name && lat && lng) {
              newGps[name] = { address, lat, lng };
            }
          });
          if (mounted) setGpsData(newGps);
        }
      } catch (err) {
        // ignore
      }
    };
    void fetchGps();
    const interval = setInterval(fetchGps, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const dispatchData: DispatcherRow[] = useMemo(() => {
    return Object.entries(savedDetails).map(([key, details]) => {
      const normalizedPlate = (details.plate || '').replace(/\s+/g, '').toLowerCase();
      const gps = gpsData[normalizedPlate];
      let location = '';
      let locationLink = undefined;
      
      if (gps) {
        location = gps.address || "Manzil ma'lumoti yo'q";
        locationLink = `https://yandex.uz/maps/?pt=${gps.lng},${gps.lat}&z=16&l=map`;
      }

      const dep = formatDateTimeStr(details.departureTime);
      const ret = formatDateTimeStr(details.expectedReturn);

      return {
        id: key,
        plate: details.plate || '-',
        type: details.type || '-',
        driver: details.driver || '-',
        task: details.cargo || '-',
        timeRange: { dep, ret },
        status: 'в работе',
        location,
        locationLink
      };
    });
  }, [savedDetails, gpsData]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return dispatchData;
      return dispatchData.filter(
        (row) =>
          row.plate.toLowerCase().includes(query) ||
          row.driver.toLowerCase().includes(query) ||
          row.type.toLowerCase().includes(query) ||
          row.task.toLowerCase().includes(query) ||
          row.timeRange.dep.toLowerCase().includes(query) ||
          row.timeRange.ret.toLowerCase().includes(query) ||
          row.location.toLowerCase().includes(query)
      );
  }, [searchTerm, dispatchData]);

  const stats = useMemo(() => {
    return {
      inWork: dispatchData.length,
      onLine: dispatchData.length,
      inMine: 0,
      inRepair: 0,
      idle: 0,
    };
  }, [dispatchData]);

  const statCards = [
    {
      id: 'inWork',
      title: lang === 'uz' ? 'Ishdagi transport' : lang === 'ru' ? 'Транспорт в работе' : 'Transport in work',
      value: stats.inWork,
      color: 'from-blue-500 to-cyan-400',
      icon: <Car />,
    },
    {
      id: 'onLine',
      title: lang === 'uz' ? "Yo'nalishda" : lang === 'ru' ? 'На линии' : 'On line',
      value: stats.onLine,
      color: 'from-emerald-500 to-teal-400',
      icon: <Navigation />,
    },
    {
      id: 'inMine',
      title: lang === 'uz' ? 'Shaxtada' : lang === 'ru' ? 'В шахте' : 'In mine',
      value: stats.inMine,
      color: 'from-amber-500 to-orange-400',
      icon: <Pickaxe />,
    },
    {
      id: 'inRepair',
      title: lang === 'uz' ? "Ta'mirda" : lang === 'ru' ? 'На ремонте' : 'In repair',
      value: stats.inRepair,
      color: 'from-red-500 to-rose-400',
      icon: <Wrench />,
    },
    {
      id: 'idle',
      title: lang === 'uz' ? "To'xtab turgan" : lang === 'ru' ? 'В простое' : 'Idle',
      value: stats.idle,
      color: 'from-slate-500 to-slate-400',
      icon: <Clock />,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'в работе': return 'text-emerald-400';
      case 'в шахте': return 'text-amber-400';
      case 'на ремонте': return 'text-red-400';
      case 'в простое': return 'text-slate-400';
      default: return 'text-slate-100';
    }
  };

  const headers = {
    plate: lang === 'uz' ? 'Davlat raqami' : lang === 'ru' ? 'Гос. номер' : 'Plate',
    type: lang === 'uz' ? 'Turi' : lang === 'ru' ? 'Тип' : 'Type',
    driver: lang === 'uz' ? 'Haydovchi' : lang === 'ru' ? 'Водитель' : 'Driver',
    task: lang === 'uz' ? 'Topshiriq' : lang === 'ru' ? 'Задание' : 'Task',
    timeRange: lang === 'uz' ? 'Vaqt (Chiqish \u2014 Qaytish)' : lang === 'ru' ? 'Время (Выезд \u2014 Возврат)' : 'Time (Out \u2014 In)',
    status: lang === 'uz' ? 'Status' : lang === 'ru' ? 'Статус' : 'Status',
    location: lang === 'uz' ? 'Geopozitsiya' : lang === 'ru' ? 'Геопозиция' : 'Location',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div
            key={card.id}
            className="glass-panel rounded-2xl p-4 border border-slate-700/50 relative overflow-hidden group"
          >
            <div className={`absolute -right-6 -top-6 w-36 h-36 bg-gradient-to-br ${card.color} rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500`}></div>
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">{card.value}</div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-2">{card.title}</div>
              </div>
              <div className={`p-4 rounded-xl bg-gradient-to-br ${card.color} text-white shadow-xl [&>svg]:w-[26px] [&>svg]:h-[26px]`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
        <div className="p-4 sm:p-6 border-b border-slate-700/50 flex flex-col gap-5">
          <h3 className="app-module-heading">
            {t('dispatch')}
          </h3>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-[280px]">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('trackingSearchPlaceholder')}
                  className="h-10 pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 transition-all w-full text-sm text-slate-200"
                />
              </div>

              <div className="flex items-center gap-2">
                  <LocalizedDateInput
                      label={t('dateFromSanadan')}
                      value={dateFrom}
                      maxDate={dateTo || undefined}
                      onChange={(v) => { setDateFrom(v); }}
                      minWidth={140}
                  />
                  <LocalizedDateInput
                      label={t('dateToSanagacha')}
                      value={dateTo}
                      minDate={dateFrom || undefined}
                      onChange={(v) => { setDateTo(v); }}
                      minWidth={140}
                  />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <button
                    type="button"
                    disabled={filteredRows.length === 0}
                    className="inline-flex min-w-0 flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Table2 size={16} />
                    {t('exportXls')}
                </button>
                <button
                    type="button"
                    disabled={filteredRows.length === 0}
                    className="inline-flex min-w-0 flex-1 sm:flex-none justify-center items-center gap-2 h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <FileText size={16} />
                    {t('exportPdf')}
                </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto dark-scrollbar">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr className="text-slate-400 uppercase text-xs tracking-wider">
                <th className="px-4 py-3 text-left">{headers.driver}</th>
                <th className="px-4 py-3 text-left">{headers.plate}</th>
                <th className="px-4 py-3 text-left">{headers.type}</th>
                <th className="px-4 py-3 text-left">{headers.task}</th>
                <th className="px-4 py-3 text-left">{headers.timeRange}</th>
                <th className="px-4 py-3 text-left">{headers.status}</th>
                <th className="px-4 py-3 text-left">{headers.location}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500 text-sm">
                    {t('dataNotFound')}
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-t border-slate-800/80 hover:bg-slate-900/40 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-100 font-semibold">{row.driver}</td>
                  <td className="px-4 py-3 text-slate-100 font-semibold">{row.plate}</td>
                  <td className="px-4 py-3 text-slate-300">{row.type}</td>
                  <td className="px-4 py-3 text-slate-300">{row.task}</td>
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                    {row.timeRange.dep !== '--:--' || row.timeRange.ret !== '--:--' ? (
                      <div className="flex flex-col gap-1.5 text-[13px] sm:text-sm">
                        <span className="text-emerald-400 font-semibold tracking-wide">↑ {row.timeRange.dep}</span>
                        <span className="text-amber-400 font-semibold tracking-wide">↓ {row.timeRange.ret}</span>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className={`px-4 py-3 font-medium ${getStatusColor(row.status)} capitalize`}>{row.status}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {row.locationLink ? (
                      <a 
                        href={row.locationLink} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-blue-500/30 transition-colors inline-flex items-center gap-1.5"
                      >
                        <MapPin size={14} className="text-blue-500/70" />
                        {row.location}
                      </a>
                    ) : (
                      row.location
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
