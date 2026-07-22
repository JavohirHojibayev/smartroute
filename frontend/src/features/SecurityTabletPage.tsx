import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Shield, Clock, User, MapPin, FileText, Activity, AlertTriangle } from 'lucide-react';
import { useI18n } from '../i18n';

import { useWaybillStore } from '../store/waybillStore';

type SecurityStatus = 'pending' | 'allowed' | 'denied' | 'returned';

type SecurityLogRow = {
  id: string; plate: string; driver: string; purpose: string;
  direction: string; dispatcher: string; time: string; status: SecurityStatus; denyReason?: string;
};

const playSound = (type: 'new' | 'allow' | 'deny') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const t = ctx.currentTime;

    if (type === 'new') {
      // Soft, crystal-like ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.50, t); // C6
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      
      osc.start(t);
      osc.stop(t + 0.5);
    } 
    else if (type === 'allow') {
      // Elegant upward success chime (A5 -> C#6)
      const playNote = (freq: number, start: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
        osc.start(start);
        osc.stop(start + 0.7);
      };
      playNote(880, t); // A5
      playNote(1108.73, t + 0.12); // C#6
    } 
    else if (type === 'deny') {
      // Deep, soft double-thump (modern error)
      const playThump = (freq: number, start: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        
        // Pitch drop effect
        osc.frequency.setValueAtTime(freq, start);
        osc.frequency.exponentialRampToValueAtTime(freq / 2, start + 0.1);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.4, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
        
        osc.start(start);
        osc.stop(start + 0.2);
      };
      playThump(250, t);
      playThump(250, t + 0.12);
    }
  } catch (e) {
    // Ignore errors
  }
};

const statusBadgeClass = (status: SecurityStatus) => status === 'allowed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : status === 'denied' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-amber-500/10 text-amber-300 border-amber-500/30';

function DataRow({ label, value, icon, highlight = false }: { label: string, value: string, icon?: React.ReactNode, highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-slate-700/40 pb-4 last:border-0 last:pb-0">
      <span className="text-xs sm:text-sm font-medium text-slate-400 flex items-center gap-2 uppercase tracking-wide">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </span>
      <span className={`font-semibold tracking-wide ${highlight ? 'text-2xl sm:text-3xl text-blue-400' : 'text-lg sm:text-xl text-slate-200'}`}>
        {value}
      </span>
    </div>
  );
}



function SummaryWidget({ label, value, colorClass, icon: Icon, onClick }: { label: string, value: number, colorClass: string, icon: any, onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`glass-panel rounded-2xl p-4 border border-slate-700/50 hover:border-slate-600/60 relative overflow-hidden group transition-all duration-300 ${onClick ? 'cursor-pointer' : ''}`}>
      <div className={`absolute -right-6 -top-6 w-36 h-36 bg-gradient-to-br ${colorClass} rounded-full opacity-20 blur-3xl group-hover:opacity-35 transition-opacity duration-500`}></div>
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">{value}</div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mt-2">{label}</div>
        </div>
        <div className={`p-4 rounded-xl bg-gradient-to-br ${colorClass} text-white shadow-xl [&>svg]:w-[26px] [&>svg]:h-[26px]`}>
          <Icon />
        </div>
      </div>
    </div>
  );
}

export function SecurityTabletPage({ onNavigate }: { onNavigate?: (tab: string, id?: string) => void }) {
  const { t } = useI18n();
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [queueFilter, setQueueFilter] = useState<SecurityStatus>('pending');
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [selectedDenyReason, setSelectedDenyReason] = useState('Hujjatlar to\'liq emas');
  const prevPendingLength = useRef(0);

  const { savedDetails, setSavedDetails } = useWaybillStore();

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (isGateOpen) {
      timeoutId = setTimeout(() => {
        setIsGateOpen(false);
      }, 5000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isGateOpen]);
  
  const currentUser = useMemo(() => {
      try {
          const sessionStr = localStorage.getItem('smartroute-auth-session');
          if (sessionStr) {
              const session = JSON.parse(sessionStr);
              return session.user?.fullName || session.user?.username || 'Dispetcher';
          }
      } catch (e) {}
      return 'Dispetcher';
  }, []);

  const realData: SecurityLogRow[] = useMemo(() => {
      return Object.entries(savedDetails).map(([key, details]) => ({
          id: key,
          plate: details.plate || '-',
          driver: details.driver || '-',
          purpose: details.cargo || '-',
          direction: details.route || '-',
          dispatcher: details.dispatcherName || currentUser,
          time: details.departureTime ? details.departureTime.replace('T', ' ') : '--:--',
          status: details.securityStatus || 'pending',
          denyReason: details.denyReason
      })).sort((a, b) => b.time.localeCompare(a.time));
  }, [savedDetails]);

  const pendingQueue = useMemo(() => realData.filter(r => r.status === 'pending'), [realData]);
  
  useEffect(() => {
    if (pendingQueue.length > prevPendingLength.current) {
      playSound('new');
    }
    prevPendingLength.current = pendingQueue.length;
  }, [pendingQueue.length]);
  const displayQueue = useMemo(() => realData.filter(r => r.status === queueFilter), [realData, queueFilter]);
  const summary = useMemo(() => {
    const today = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    
    const todayData = realData.filter(r => r.time.startsWith(todayStr));
    return {
      total: todayData.length, 
      allowed: todayData.filter(r => r.status === 'allowed').length,
      denied: todayData.filter(r => r.status === 'denied').length, 
      pending: todayData.filter(r => r.status === 'pending').length,
    };
  }, [realData]);

  const activeVehicle = pendingQueue.length > 0 ? pendingQueue[0] : null;

  const displayVehicle = activeVehicle || {
      id: 'empty',
      plate: '-',
      driver: '-',
      purpose: '-',
      direction: '-',
      dispatcher: currentUser,
      time: '--:--',
      status: 'pending' as SecurityStatus
  };

  const handleStatusUpdate = (status: SecurityStatus, reason?: string) => {
      if (status === 'denied' && !reason) {
          setDenyModalOpen(true);
          return;
      }
      if (activeVehicle) {
          setSavedDetails(prev => {
              const prevDetails = prev[activeVehicle.id];
              if (!prevDetails) return prev;
              return {
                  ...prev,
                  [activeVehicle.id]: {
                      ...prevDetails,
                      securityStatus: status,
                      denyReason: reason,
                      updatedAt: Date.now()
                  }
              };
          });
      }
      
      if (status === 'allowed') {
          setIsGateOpen(true);
          playSound('allow');
      } else if (status === 'denied') {
          playSound('deny');
      }
  };

  const getStatusLabel = (status: SecurityStatus) => {
    if (status === 'allowed') return t('securityTabletStatusAllowed');
    if (status === 'denied') return t('securityTabletStatusDenied');
    return t('securityTabletStatusPending');
  };

  return (
    <div className="flex flex-col font-sans select-none relative z-10 w-full min-h-[calc(100vh-4rem)] pb-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col w-full">
        
        {/* Top Summary Widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-8 w-full">
          <SummaryWidget label={t('securityTabletTotal')} value={summary.total} colorClass="from-blue-500 to-cyan-400" icon={Activity} onClick={() => setQueueFilter('pending')} />
          <SummaryWidget label={t('securityTabletAllowed')} value={summary.allowed} colorClass="from-emerald-500 to-teal-400" icon={CheckCircle2} onClick={() => setQueueFilter('allowed')} />
          <SummaryWidget label={t('securityTabletPending')} value={summary.pending} colorClass="from-orange-500 to-amber-400" icon={Clock} onClick={() => setQueueFilter('pending')} />
          <SummaryWidget label={t('securityTabletDenied')} value={summary.denied} colorClass="from-red-500 to-rose-400" icon={AlertTriangle} onClick={() => setQueueFilter('denied')} />
        </div>



        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch flex-1">
          
          {/* Left Column: Data Form */}
          <div className="lg:col-span-5 glass-panel rounded-3xl border border-slate-700/50 p-6 sm:p-8 shadow-xl relative overflow-hidden group h-full flex flex-col">
            <div className="absolute -left-20 -top-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors duration-700"></div>
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors duration-700"></div>
            <div className="space-y-6 text-lg relative z-10 flex-1 flex flex-col">
              <>
                <DataRow label={t('securityTabletPlate')} value={displayVehicle.plate} highlight />
                <DataRow label={t('securityTabletDriver')} value={displayVehicle.driver} icon={<User size={20} />} />
                <DataRow label={t('securityTabletPurpose')} value={displayVehicle.purpose} icon={<FileText size={20} />} />
                <DataRow label={t('securityTabletDirection')} value={displayVehicle.direction} icon={<MapPin size={20} />} />
                <DataRow label={t('securityTabletDispatcher')} value={displayVehicle.dispatcher} />
                <DataRow label={t('securityTabletTime')} value={displayVehicle.time} icon={<Clock size={20} />} />
                
                <div className="pt-6 mt-auto border-t border-slate-700/50 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">{t('securityTabletStatus')}</span>
                  <span className={`px-4 py-2 rounded-xl border font-bold text-lg flex items-center gap-2 ${statusBadgeClass(displayVehicle.status)}`}>
                    {displayVehicle.status === 'allowed' ? <CheckCircle2 size={24} /> : displayVehicle.status === 'denied' ? <XCircle size={24} /> : <Clock size={24} />}
                    {getStatusLabel(displayVehicle.status)}
                  </span>
                </div>
              </>
            </div>
          </div>

          {/* Middle Column: Action Buttons & Shlagbaum */}
          <div className="lg:col-span-4 flex flex-col gap-6 h-full">
            <motion.button onClick={() => handleStatusUpdate('allowed')} disabled={!activeVehicle} whileTap={{ scale: 0.96 }} className="group relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-3xl p-6 xl:p-8 flex flex-col items-center justify-center gap-4 shadow-lg hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] border border-emerald-500/50 hover:border-emerald-400/60 transition-all duration-300 h-40 xl:h-44 disabled:opacity-50 disabled:cursor-not-allowed">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20 group-hover:opacity-30"></div>
              <CheckCircle2 size={48} className="text-emerald-100/90 group-hover:scale-110 transition-transform duration-300 drop-shadow-md" />
              <span className="text-xl xl:text-2xl font-bold tracking-wide drop-shadow-md text-center uppercase">{t('securityTabletAllowButton')}</span>
            </motion.button>

            <motion.button onClick={() => handleStatusUpdate('denied')} disabled={!activeVehicle} whileTap={{ scale: 0.96 }} className="group relative overflow-hidden bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-3xl p-6 xl:p-8 flex flex-col items-center justify-center gap-4 shadow-lg hover:shadow-[0_0_30px_rgba(220,38,38,0.4)] border border-red-500/50 hover:border-red-400/60 transition-all duration-300 h-40 xl:h-44 disabled:opacity-50 disabled:cursor-not-allowed">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20 group-hover:opacity-30"></div>
              <XCircle size={48} className="text-red-100/90 group-hover:scale-110 transition-transform duration-300 drop-shadow-md" />
              <span className="text-xl xl:text-2xl font-bold tracking-wide drop-shadow-md text-center uppercase">{t('securityTabletDenyButton')}</span>
            </motion.button>

            <div className="glass-panel rounded-3xl border border-slate-700/50 p-6 flex flex-col items-center justify-end mt-auto h-72 xl:h-80 shadow-lg relative">
               <div className="absolute top-0 right-0 w-32 h-32 bg-slate-500/5 rounded-full blur-2xl"></div>
               <div className="relative w-full max-w-[240px] h-28 xl:h-32 flex items-end justify-start transform translate-y-4 scale-110 xl:scale-125 origin-bottom">
                 <div className="absolute left-0 bottom-0 w-8 h-20 xl:h-24 bg-slate-800 rounded-t-xl border border-slate-600 shadow-[0_0_15px_rgba(0,0,0,0.5)] z-10 flex flex-col items-center pt-3">
                   <div className={`w-3 h-3 rounded-full animate-pulse ${isGateOpen ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'}`} />
                 </div>
                 <div className={`absolute left-4 bottom-12 w-[90%] h-4 bg-gradient-to-r from-red-500 via-white to-red-500 rounded-r-full shadow-lg transform origin-left transition-transform duration-1000 ${isGateOpen ? '-rotate-[60deg]' : 'rotate-0'} border-y border-red-600/50`} style={{ backgroundSize: '30px 100%' }}>
                   <div className="w-full h-full repeating-linear-gradient opacity-90" />
                 </div>
               </div>
            </div>
          </div>

          {/* Right Column: Stats & Queue */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div className="glass-panel rounded-2xl border border-slate-700/50 p-5 space-y-4 shadow-xl">
              <h4 className="text-sm uppercase tracking-wider text-slate-300 font-bold mb-2">{t('securityTabletStatsTitle')}</h4>
              <div className="flex justify-between text-base">
                <span className="text-slate-400 font-medium">{t('total')}</span>
                <span className="font-bold text-white">{summary.total}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-amber-400 font-medium">{t('securityTabletPending')}</span>
                <span className="font-bold text-amber-400">{summary.pending}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-emerald-400 font-medium">{t('securityTabletStatusAllowed')}</span>
                <span className="font-bold text-emerald-400">{summary.allowed}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-red-400 font-medium">{t('securityTabletStatusDenied')}</span>
                <span className="font-bold text-red-400">{summary.denied}</span>
              </div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-700/50 p-5 flex-1 flex flex-col shadow-xl min-h-[300px]">
              <h4 className="text-base font-bold text-slate-200 flex items-center gap-2 mb-4">
                <Shield size={18} className="text-amber-400" />
                {queueFilter === 'pending' ? t('securityTabletQueueTitle') : getStatusLabel(queueFilter)}
              </h4>
              {displayQueue.length === 0 ? (
                <div className="text-sm text-slate-500 m-auto">{t('securityTabletQueueEmpty')}</div>
              ) : (
                <div className="space-y-4 overflow-y-auto max-h-[400px] dark-scrollbar pr-1">
                  {displayQueue.map((row) => (
                    <div key={row.id} onClick={() => onNavigate?.('waybills', row.id)} className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 relative overflow-hidden group hover:bg-slate-800/60 transition-colors cursor-pointer shadow-sm">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-colors"></div>
                      <div className="flex items-center justify-between gap-2 relative z-10 mb-1">
                        <span className="text-base font-bold text-white">{row.plate}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass(row.status)}`}>
                          {getStatusLabel(row.status)}
                        </span>
                      </div>
                      <div className="text-[13px] text-slate-400 flex items-center justify-between relative z-10">
                        <span>{row.driver}</span>
                        <span>{row.time}</span>
                      </div>
                      {row.status === 'denied' && row.denyReason && (
                        <div className="text-[11px] text-red-300/90 font-medium mt-1.5 relative z-10 bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20 shadow-sm leading-tight">
                          Sabab: {row.denyReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
        
        <style>{`
          .repeating-linear-gradient {
            background: repeating-linear-gradient(45deg, #ef4444, #ef4444 15px, #ffffff 15px, #ffffff 30px);
            border-radius: 0 100px 100px 0;
          }
        `}</style>
      </motion.div>

      {/* Deny Modal */}
      {denyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDenyModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-100 mb-4 border-b border-slate-700/50 pb-3 flex items-center gap-2">
              <AlertTriangle className="text-red-500" />
              Rad etish sababini tanlang
            </h3>
            <div className="space-y-3 mb-6">
              {[
                'Hujjatlar to\'liq emas',
                'Yo\'l varaqasi yopilgan',
                'Haydovchi tibbiy ko\'rikdan o\'tmagan',
                'Transport nosoz holatda',
                'Boshqa sabab'
              ].map(r => (
                <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedDenyReason === r ? 'bg-red-500/10 border-red-500/50 text-red-100' : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-800'}`}>
                  <input type="radio" name="denyReason" value={r} checked={selectedDenyReason === r} onChange={(e) => setSelectedDenyReason(e.target.value)} className="w-4 h-4 text-red-500 bg-slate-950 border-slate-700 focus:ring-red-500 focus:ring-offset-slate-900" />
                  <span className="font-medium">{r}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDenyModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors">
                Bekor qilish
              </button>
              <button onClick={() => { setDenyModalOpen(false); handleStatusUpdate('denied', selectedDenyReason); }} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-500 transition-colors shadow-lg shadow-red-500/20">
                Rad etish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
