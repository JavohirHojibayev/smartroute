import { useState, useRef, useEffect } from 'react';
import { ChevronDown, BadgeCheck, KeyRound } from 'lucide-react';
import { dicts, type Language } from '../../i18n';
import type { EimzoKey } from './eimzo/eimzo.types';

type EimzoKeySelectProps = {
  lang: Language;
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

const getKeyOwnerName = (key: EimzoKey, fallback: string): string => {
  const directName = key.CN || key.alias;
  if (directName?.trim()) return formatDisplayName(directName);

  const rawName = key.name?.trim();
  if (rawName) {
    const afterUnderscore = rawName.split('_').slice(1).join(' ').trim();
    return formatDisplayName(afterUnderscore || rawName);
  }

  return fallback;
};

export const EimzoKeySelect = ({ lang, keys, selectedIndex, disabled, onChange }: EimzoKeySelectProps) => {
  const t = dicts[lang];
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (index: number) => {
    onChange(index);
    setIsOpen(false);
  };

  const selectedKey = selectedIndex >= 0 ? keys[selectedIndex] : null;

  return (
    <div className="block relative" ref={dropdownRef}>
      <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500 font-semibold">{t.eimzoSelectLabel}</span>
      
      <button
        type="button"
        disabled={disabled || keys.length === 0}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-3.5 text-sm font-medium text-slate-200 outline-none transition-all hover:bg-slate-800 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {selectedKey ? (
            <BadgeCheck className="text-emerald-400 shrink-0" size={18} />
          ) : (
            <KeyRound className="text-slate-400 shrink-0" size={18} />
          )}
          <span className="truncate">
            {keys.length === 0 
              ? t.eimzoKeyNotFound 
              : selectedKey 
                ? getKeyOwnerName(selectedKey, t.eimzoKeyFallback) 
                : t.eimzoSelectPlaceholder}
          </span>
        </div>
        <ChevronDown 
          className={`shrink-0 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          size={16} 
        />
      </button>

      {isOpen && keys.length > 0 && (
        <div className="absolute top-[calc(100%+8px)] left-0 w-full z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-60 overflow-y-auto overscroll-contain py-1">
            {keys.map((key, index) => {
              const isSelected = selectedIndex === index;
              return (
                <div
                  key={`${key.serialNumber ?? key.alias ?? index}-${index}`}
                  onClick={() => handleSelect(index)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                    ${isSelected ? 'bg-blue-500/10 text-blue-400' : 'text-slate-300 hover:bg-slate-700/50'}
                  `}
                >
                  <BadgeCheck 
                    className={`shrink-0 transition-opacity ${isSelected ? 'opacity-100 text-blue-400' : 'opacity-0'}`} 
                    size={16} 
                  />
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium">
                      {getKeyOwnerName(key, t.eimzoKeyFallback)}
                    </span>
                    {(key.PINFL || key.TIN || key.INN) && (
                      <span className="text-[10px] text-slate-500 mt-0.5">
                        {key.PINFL ? `JSHSHIR: ${key.PINFL}` : `STIR: ${key.TIN || key.INN}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
