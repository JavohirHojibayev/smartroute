import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { EimzoKeySelect } from './EimzoKeySelect';
import { getEimzoKeys, loginWithEimzo } from './eimzo/eimzo.service';
import type { EimzoKey, EimzoLoginResponse } from './eimzo/eimzo.types';

type EimzoLoginFormProps = {
  isSubmitting: boolean;
  onSubmittingChange: (value: boolean) => void;
  onLogin: (payload: EimzoLoginResponse) => Promise<void> | void;
  onError: (message: string | null) => void;
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
      setSelectedIndex(nextKeys.length > 0 ? 0 : -1);
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
      if (!selectedKey) onError('Kalit topilmadi');
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
