import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { EimzoKeySelect } from './EimzoKeySelect';
import { formatEimzoKeyLocation, getEimzoKeyIdentity, getEimzoKeys, loginWithEimzo } from './eimzo/eimzo.service';
import type { EimzoKey, EimzoLoginResponse } from './eimzo/eimzo.types';

type EimzoLoginFormProps = {
  isSubmitting: boolean;
  onSubmittingChange: (value: boolean) => void;
  onLogin: (payload: EimzoLoginResponse) => Promise<void> | void;
  onError: (message: string | null) => void;
};

const formatEimzoDate = (value?: Date | string): string => {
  if (!value) return "Noma'lum";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const getEimzoOwnerType = (key: EimzoKey): string => {
  const raw = `${key.O ?? ''} ${key.type ?? ''}`.toLowerCase();
  if (raw.includes('yuridik') || raw.includes('юрид')) return 'YURIDIK SHAXS';
  return 'JISMONIY SHAXS';
};

export const EimzoLoginForm = ({
  isSubmitting,
  onSubmittingChange,
  onLogin,
  onError,
}: EimzoLoginFormProps) => {
  const [keys, setKeys] = useState<EimzoKey[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loadingKeys, setLoadingKeys] = useState(false);

  const selectedKey = useMemo(() => keys[selectedIndex] ?? null, [keys, selectedIndex]);

  const loadKeys = async () => {
    setLoadingKeys(true);
    onError(null);
    try {
      const nextKeys = await getEimzoKeys();
      setKeys(nextKeys);
      setSelectedIndex(-1);
      if (nextKeys.length === 0) onError('Kalit topilmadi');
    } catch (error) {
      setKeys([]);
      setSelectedIndex(-1);
      onError(error instanceof Error ? error.message : 'E-IMZO dasturi topilmadi');
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedKey || isSubmitting || loadingKeys) {
      if (!selectedKey) onError('Kalit tanlanmagan');
      return;
    }

    onSubmittingChange(true);
    onError(null);
    try {
      const payload = await loginWithEimzo(selectedKey);
      await onLogin(payload);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'E-IMZO orqali kirishda xatolik yuz berdi');
    } finally {
      onSubmittingChange(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-1 space-y-5 sm:space-y-6">
      <EimzoKeySelect
        keys={keys}
        selectedIndex={selectedIndex}
        disabled={isSubmitting || loadingKeys}
        onChange={setSelectedIndex}
      />

      {selectedKey ? (
        (() => {
          const identity = getEimzoKeyIdentity(selectedKey);
          const ownerName = selectedKey.CN || selectedKey.alias || "Noma'lum";
          const serial = identity.certificateSerial || selectedKey.serialNumber || selectedKey.serial || "Noma'lum";
          const validity = `${formatEimzoDate(selectedKey.validFrom)} - ${formatEimzoDate(selectedKey.validTo)}`;
          return (
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/25 p-3 text-xs shadow-lg shadow-slate-950/20">
              <div className="grid gap-2">
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                  <span className="font-bold text-slate-200">Seriya:</span>
                  <span className="truncate text-slate-300" title={serial}>{serial}</span>
                </div>
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                  <span className="font-bold text-slate-200">JSHSHIR:</span>
                  <span className="flex min-w-0 items-center gap-2 text-slate-300">
                    <span className="truncate" title={identity.pinfl ?? "Noma'lum"}>{identity.pinfl ?? "Noma'lum"}</span>
                    <span className="shrink-0 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                      {getEimzoOwnerType(selectedKey)}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                  <span className="font-bold text-slate-200">F.I.SH:</span>
                  <span className="truncate text-slate-300" title={ownerName}>{ownerName}</span>
                </div>
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                  <span className="font-bold text-slate-200">Muddat:</span>
                  <span className="truncate text-slate-300">{validity}</span>
                </div>
                <p className="mt-1 truncate border-t border-slate-700/70 pt-2 text-[11px] text-slate-500" title={formatEimzoKeyLocation(selectedKey)}>
                  {formatEimzoKeyLocation(selectedKey)}
                </p>
              </div>
            </div>
          );
        })()
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void loadKeys()}
          disabled={isSubmitting || loadingKeys}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/40 text-slate-300 transition-colors hover:border-blue-500/50 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Kalitlarni yangilash"
        >
          <RefreshCw size={18} className={loadingKeys ? 'animate-spin' : ''} />
        </button>
        <button
          type="submit"
          disabled={isSubmitting || loadingKeys || !selectedKey}
          className="login-submit-btn h-12 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 text-sm font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-emerald-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? 'Kirilmoqda...' : 'ВОЙТИ'}
        </button>
      </div>
    </form>
  );
};
