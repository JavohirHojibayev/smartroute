import type { EimzoKey } from './eimzo/eimzo.types';
import { formatEimzoKeyLabel } from './eimzo/eimzo.service';

type EimzoKeySelectProps = {
  keys: EimzoKey[];
  selectedIndex: number;
  disabled?: boolean;
  onChange: (index: number) => void;
};

export const EimzoKeySelect = ({ keys, selectedIndex, disabled, onChange }: EimzoKeySelectProps) => (
  <label className="block">
    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">DSKEYS / PFX kalit</span>
    <select
      value={selectedIndex}
      disabled={disabled || keys.length === 0}
      onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
      className="w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-3 text-sm font-semibold text-slate-100 outline-none transition-colors focus:border-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {keys.length === 0 ? (
        <option value={-1}>Kalit topilmadi</option>
      ) : (
        keys.map((key, index) => (
          <option key={`${key.serialNumber ?? key.alias ?? index}-${index}`} value={index}>
            {formatEimzoKeyLabel(key)}
          </option>
        ))
      )}
    </select>
  </label>
);
