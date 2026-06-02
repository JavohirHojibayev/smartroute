import { IdCard, UserRound } from 'lucide-react';

export type AuthMode = 'password' | 'eimzo';

type AuthModeSwitcherProps = {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
};

export const AuthModeSwitcher = ({ mode, onChange }: AuthModeSwitcherProps) => (
  <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-slate-700/55 bg-slate-950/35 p-1.5">
    <button
      type="button"
      onClick={() => onChange('password')}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-black uppercase tracking-[0.08em] transition-colors sm:text-xs ${
        mode === 'password'
          ? 'bg-blue-500/20 text-blue-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
          : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
      }`}
    >
      <UserRound size={17} />
      <span>USERNAME PASSWORD</span>
    </button>
    <button
      type="button"
      onClick={() => onChange('eimzo')}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-black uppercase tracking-[0.08em] transition-colors sm:text-xs ${
        mode === 'eimzo'
          ? 'bg-emerald-500/18 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
          : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
      }`}
    >
      <IdCard size={18} />
      <span>E-IMZO</span>
    </button>
  </div>
);
