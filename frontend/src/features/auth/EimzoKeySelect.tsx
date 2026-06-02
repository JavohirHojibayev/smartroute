import type { EimzoKey } from './eimzo/eimzo.types';

type EimzoKeySelectProps = {
  keys: EimzoKey[];
  selectedIndex: number;
  disabled?: boolean;
  onChange: (index: number) => void;
};

const formatDisplayName = (value: string): string =>
  value
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('uz-UZ')
    .replace(/(^|\s)(\S)/g, (match) => match.toLocaleUpperCase('uz-UZ'));

const getKeyOwnerName = (key: EimzoKey): string => {
  const directName = key.CN || key.alias;
  if (directName?.trim()) return formatDisplayName(directName);

  const rawName = key.name?.trim();
  if (rawName) {
    const afterUnderscore = rawName.split('_').slice(1).join(' ').trim();
    return formatDisplayName(afterUnderscore || rawName);
  }

  return 'E-IMZO kalit';
};

export const EimzoKeySelect = ({ keys, selectedIndex, disabled, onChange }: EimzoKeySelectProps) => (
  <label className="block">
    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">Sertifikatni tanlang</span>
    <select
      value={selectedIndex}
      disabled={disabled || keys.length === 0}
      onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
      className="w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-3 text-sm font-semibold text-slate-100 outline-none transition-colors [color-scheme:dark] focus:border-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60"
      style={{ colorScheme: 'dark' }}
    >
      {keys.length === 0 ? (
        <option value={-1} style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>
          Kalit topilmadi
        </option>
      ) : (
        <>
          <option value={-1} disabled style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>
            Sertifikatni tanlang
          </option>
          {keys.map((key, index) => (
            <option
              key={`${key.serialNumber ?? key.alias ?? index}-${index}`}
              value={index}
              style={{
                backgroundColor: selectedIndex === index ? '#2563eb' : '#ffffff',
                color: selectedIndex === index ? '#ffffff' : '#0f172a',
              }}
            >
              {getKeyOwnerName(key)}
            </option>
          ))}
        </>
      )}
    </select>
  </label>
);
