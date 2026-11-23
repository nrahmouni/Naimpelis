export interface PenaltyCountry {
  id: string;
  name: string;
  flag: string;
  code: string;
  jersey: string;
  trim: string;
  shorts: string;
  gkJersey: string;
  gkTrim: string;
}

export const PENALTY_COUNTRIES: PenaltyCountry[] = [
  {
    id: 'ESP',
    name: 'España',
    flag: '🇪🇸',
    code: 'ESP',
    jersey: '#dc2626',
    trim: '#facc15',
    shorts: '#1d4ed8',
    gkJersey: '#06b6d4',
    gkTrim: '#0f172a',
  },
  {
    id: 'ARG',
    name: 'Argentina',
    flag: '🇦🇷',
    code: 'ARG',
    jersey: '#38bdf8',
    trim: '#ffffff',
    shorts: '#0f172a',
    gkJersey: '#10b981',
    gkTrim: '#064e3b',
  },
  {
    id: 'FRA',
    name: 'Francia',
    flag: '🇫🇷',
    code: 'FRA',
    jersey: '#1d4ed8',
    trim: '#ffffff',
    shorts: '#1e3a8a',
    gkJersey: '#f59e0b',
    gkTrim: '#1e293b',
  },
  {
    id: 'BRA',
    name: 'Brasil',
    flag: '🇧🇷',
    code: 'BRA',
    jersey: '#facc15',
    trim: '#16a34a',
    shorts: '#1d4ed8',
    gkJersey: '#334155',
    gkTrim: '#38bdf8',
  },
  {
    id: 'GER',
    name: 'Alemania',
    flag: '🇩🇪',
    code: 'GER',
    jersey: '#f8fafc',
    trim: '#18181b',
    shorts: '#09090b',
    gkJersey: '#8b5cf6',
    gkTrim: '#e9d5ff',
  },
  {
    id: 'ENG',
    name: 'Inglaterra',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    code: 'ENG',
    jersey: '#ffffff',
    trim: '#dc2626',
    shorts: '#1e3a8a',
    gkJersey: '#22c55e',
    gkTrim: '#052e16',
  },
  {
    id: 'POR',
    name: 'Portugal',
    flag: '🇵🇹',
    code: 'POR',
    jersey: '#991b1b',
    trim: '#16a34a',
    shorts: '#14532d',
    gkJersey: '#0ea5e9',
    gkTrim: '#ffffff',
  },
  {
    id: 'MAR',
    name: 'Marruecos',
    flag: '🇲🇦',
    code: 'MAR',
    jersey: '#b91c1c',
    trim: '#15803d',
    shorts: '#166534',
    gkJersey: '#eab308',
    gkTrim: '#1e293b',
  },
  {
    id: 'NED',
    name: 'Países Bajos',
    flag: '🇳🇱',
    code: 'NED',
    jersey: '#f97316',
    trim: '#ffffff',
    shorts: '#0f172a',
    gkJersey: '#0284c7',
    gkTrim: '#e0f2fe',
  },
  {
    id: 'ITA',
    name: 'Italia',
    flag: '🇮🇹',
    code: 'ITA',
    jersey: '#2563eb',
    trim: '#ffffff',
    shorts: '#ffffff',
    gkJersey: '#e11d48',
    gkTrim: '#ffe4e6',
  },
];
