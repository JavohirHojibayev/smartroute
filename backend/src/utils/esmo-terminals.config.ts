/**
 * SmartRoute bilan sinxronlangan ESMO terminal ro‘yxati.
 * Jurnal / summary / qurilmalar kartasi shu nomlar bo‘yicha filtrlashadi.
 */
export type EsmoTerminalConfig = {
  name: string;
  host: string;
  model: string;
  serial: string;
  apiKey: string;
  /** Integratsiya / qurilma kodlari (masalan ESMO_TKM_1) — jurnal qatorlarida bo‘lishi mumkin */
  deviceCode?: string;
};

function readEnv(name: string): string {
  return String(process.env[name] ?? '').trim();
}

export const SMARTROUTE_ESMO_TERMINALS: EsmoTerminalConfig[] = [
  {
    name: 'ATX 1-terminal',
    host: readEnv('ESMO_ATX_1_HOST'),
    model: readEnv('ESMO_ATX_1_MODEL') || 'MT-02',
    serial: readEnv('ESMO_ATX_1_SERIAL'),
    apiKey: readEnv('ESMO_ATX_1_API_KEY'),
  },
  {
    name: 'ATX 2-terminal',
    host: readEnv('ESMO_ATX_2_HOST'),
    model: readEnv('ESMO_ATX_2_MODEL') || 'MT-02',
    serial: readEnv('ESMO_ATX_2_SERIAL'),
    apiKey: readEnv('ESMO_ATX_2_API_KEY'),
  },
  {
    name: 'TKM 1-terminal',
    host: readEnv('ESMO_TKM_1_HOST'),
    model: readEnv('ESMO_TKM_1_MODEL') || 'MT-02',
    serial: readEnv('ESMO_TKM_1_SERIAL'),
    apiKey: readEnv('ESMO_TKM_1_API_KEY'),
    deviceCode: 'ESMO_TKM_1',
  },
  {
    name: 'TKM 2-terminal',
    host: readEnv('ESMO_TKM_2_HOST'),
    model: readEnv('ESMO_TKM_2_MODEL') || 'MT-02',
    serial: readEnv('ESMO_TKM_2_SERIAL'),
    apiKey: readEnv('ESMO_TKM_2_API_KEY'),
    deviceCode: 'ESMO_TKM_2',
  },
  {
    name: 'TKM 3-terminal',
    host: readEnv('ESMO_TKM_3_HOST'),
    model: readEnv('ESMO_TKM_3_MODEL') || 'MT',
    serial: readEnv('ESMO_TKM_3_SERIAL'),
    apiKey: readEnv('ESMO_TKM_3_API_KEY'),
    deviceCode: 'ESMO_TKM_3',
  },
  {
    name: 'TKM 4-terminal',
    host: readEnv('ESMO_TKM_4_HOST'),
    model: readEnv('ESMO_TKM_4_MODEL') || 'MT-02',
    serial: readEnv('ESMO_TKM_4_SERIAL'),
    apiKey: readEnv('ESMO_TKM_4_API_KEY'),
    deviceCode: 'ESMO_TKM_4',
  },
];

/** Dashboard va tibbiy so‘rovlarda `IN (...)` uchun */
export const SMARTROUTE_ESMO_TERMINAL_NAMES: string[] = SMARTROUTE_ESMO_TERMINALS.map((t) => t.name);

let smartRouteTerminalInlineRegex: RegExp | null = null;

function normalizeTerminalHintForMatch(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[т]/g, 't')
    .replace(/[к]/g, 'k')
    .replace(/[м]/g, 'm')
    .replace(/[а]/g, 'a')
    .replace(/[х]/g, 'x')
    .replace(/[о]/g, 'o')
    .replace(/[е]/g, 'e')
    .replace(/[р]/g, 'r')
    .replace(/[и]/g, 'i')
    .replace(/[н]/g, 'n')
    .replace(/[л]/g, 'l')
    .replace(/[ь]/g, '')
    .replace(/[ъ]/g, '')
    .replace(/терминал/g, 'terminal')
    .replace(/\btmk\b/g, 'tkm')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ESMO detal / jurnal HTML dan `ATX 1-terminal`, `TKM 3-terminal` kabi qatorni ajratish.
 * Prefikslar ro‘yxatdan — yangi terminal qo‘shilganda regex avtomatik kengayadi (nom: `PREFIX raqam-terminal`).
 */
export function getSmartRouteTerminalInlineRegex(): RegExp {
  if (smartRouteTerminalInlineRegex) return smartRouteTerminalInlineRegex;
  const prefixes = [
    ...new Set(
      SMARTROUTE_ESMO_TERMINALS.flatMap((t) => {
        const first = t.name.trim().split(/\s+/)[0] || '';
        const lowered = first.toLowerCase();
        const extra: string[] = [];
        if (lowered === 'tkm') extra.push('tmk', 'ТКМ', 'ТМК');
        if (lowered === 'atx') extra.push('axt', 'АТХ', 'АХТ');
        return [first, ...extra].filter(Boolean);
      }),
    ),
  ];
  const escaped = prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  smartRouteTerminalInlineRegex = new RegExp(
    `\\b(?:${escaped})\\s*\\d+\\s*-\\s*(?:terminal|терминал)(?:\\s*\\[\\d+\\])?`,
    'i',
  );
  return smartRouteTerminalInlineRegex;
}

function normalizeWs(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Eski jurnal: `Terminal [N]` / `"N"` -> SmartRoute terminallari.
 *
 * ESMO terminal ro'yxatida slotlar:
 * 1-2 = ATX, 3-6 = Tibbiy punkt, 7-10 = TKM.
 * 3-6 ni TKMga bog'lamaymiz, aks holda Tibbiy punkt ma'lumotlari TKM sifatida chiqadi.
 */
const TERMINAL_BY_LEGACY_NUMERIC_SLOT: Record<string, EsmoTerminalConfig> = {
  '1': SMARTROUTE_ESMO_TERMINALS[0],
  '2': SMARTROUTE_ESMO_TERMINALS[1],
  '7': SMARTROUTE_ESMO_TERMINALS[2],
  '8': SMARTROUTE_ESMO_TERMINALS[3],
  '9': SMARTROUTE_ESMO_TERMINALS[4],
  '10': SMARTROUTE_ESMO_TERMINALS[5],
};

export function isSmartRouteEsmoTerminalHint(rawTerminal: string | null | undefined): boolean {
  const raw = normalizeTerminalHintForMatch(normalizeWs(rawTerminal));
  if (!raw) return false;

  for (const terminal of SMARTROUTE_ESMO_TERMINALS) {
    if (raw.includes(normalizeTerminalHintForMatch(terminal.name))) return true;
    if (terminal.host && raw.includes(terminal.host)) return true;
    const code = normalizeTerminalHintForMatch(terminal.deviceCode ?? '');
    if (code && raw.includes(code)) return true;
  }

  if (raw.includes('atx-1') || raw.includes('atx-2') || raw.includes('axt-1') || raw.includes('axt-2')) return true;
  if (/^(tkm|tmk)-[1-9]\d*$/i.test(raw)) return true;
  if (/^\d{1,3}$/.test(raw) && Boolean(TERMINAL_BY_LEGACY_NUMERIC_SLOT[raw])) return true;
  const slotFromTerminal = raw.match(/(?:terminal|терминал)\s*\[(\d{1,3})\]/i)?.[1] ?? '';
  if (slotFromTerminal && Boolean(TERMINAL_BY_LEGACY_NUMERIC_SLOT[slotFromTerminal])) return true;

  return false;
}

/** Jurnal / sinxron: `terminalRaw` → SmartRoute konfigidagi terminal */
export function resolveSmartRouteEsmoTerminal(rawTerminal: string | null | undefined): EsmoTerminalConfig | null {
  const raw = normalizeWs(rawTerminal);
  if (!raw) return null;
  if (!isSmartRouteEsmoTerminalHint(raw)) return null;
  const lower = normalizeTerminalHintForMatch(raw);

  for (const terminal of SMARTROUTE_ESMO_TERMINALS) {
    if (lower.includes(normalizeTerminalHintForMatch(terminal.name))) return terminal;
    if (terminal.host && lower.includes(terminal.host)) return terminal;
    const code = normalizeTerminalHintForMatch(terminal.deviceCode ?? '');
    if (code && lower.includes(code)) return terminal;
  }

  const tkmShort = lower.match(/^(?:tkm|tmk)-([1-9]\d*)$/i);
  if (tkmShort) {
    const want = `tkm ${tkmShort[1]}-terminal`;
    const hit = SMARTROUTE_ESMO_TERMINALS.find((t) => t.name.toLowerCase() === want);
    if (hit) return hit;
  }

  const tkmMatch = lower.match(/\btkm\s*([1-9]\d*)\s*-?\s*terminal\b/i);
  if (tkmMatch) {
    const want = `tkm ${tkmMatch[1]}-terminal`;
    const hit = SMARTROUTE_ESMO_TERMINALS.find((t) => t.name.toLowerCase() === want);
    if (hit) return hit;
  }

  const atxMatch = lower.match(/\batx\s*([12])\b/i);
  if (atxMatch && TERMINAL_BY_LEGACY_NUMERIC_SLOT[atxMatch[1]]) {
    return TERMINAL_BY_LEGACY_NUMERIC_SLOT[atxMatch[1]];
  }

  const slotMatch = lower.match(/\bterminal\s*\[(\d{1,3})\]/i);
  if (slotMatch && TERMINAL_BY_LEGACY_NUMERIC_SLOT[slotMatch[1]]) {
    return TERMINAL_BY_LEGACY_NUMERIC_SLOT[slotMatch[1]];
  }

  if (/^\d{1,3}$/.test(lower) && TERMINAL_BY_LEGACY_NUMERIC_SLOT[lower]) {
    return TERMINAL_BY_LEGACY_NUMERIC_SLOT[lower];
  }

  return null;
}
