/**
 * @module src/config/defaultProviders
 * @description Preconfigured multi-provider Xtream Codes registry (`DEFAULT_PROVIDERS`)
 * for automatic out-of-the-box catalog loading plus credential-free UI navigation metadata.
 * Server-side services read `DEFAULT_PROVIDERS` and encode all credentials via
 * `encodeURIComponent()`. UI components only consume `XTREAM_PROVIDER_UI_SPECS` and never
 * render or log raw server URLs, usernames, or passwords.
 */

export interface DefaultProviderAccount {
  user: string;
  pass: string;
  label?: string;
}

export interface DefaultProviderEntry {
  id:
    | 'primary'
    | 'vod4k'
    | '24tv'
    | '2m2h'
    | '2m2h-alt'
    | 'dana4k'
    | 'activecdns'
    | 'octopus'
    | 'adtupac'
    | 'ultra-vip'
    | 'sult-vo';
  name: string;
  serverUrl: string;
  accounts: DefaultProviderAccount[];
  defaultMediaFocus: 'live' | 'vod' | 'series';
}

export type XtreamServerWorldId =
  | 'sharkpro'
  | 'vod4k'
  | 'srv24tv'
  | 'srv2m2h'
  | 'srv2m2halt'
  | 'dana4k'
  | 'activecdns'
  | 'octopus'
  | 'adtupac'
  | 'ultravip'
  | 'sultvo';

export interface XtreamProviderUiSpec {
  providerId: DefaultProviderEntry['id'];
  worldId: XtreamServerWorldId;
  slug: string;
  name: string;
  shortLabel: string;
  accent: string;
  secondary: string;
  glowRgb: string;
  tagline: string;
  defaultMediaFocus: 'live' | 'vod' | 'series';
}

/**
 * Credential-free UI metadata used to dynamically generate dedicated navigation shortcuts
 * and themed server headers without touching any URL, username, or password.
 */
export const XTREAM_PROVIDER_UI_SPECS: readonly XtreamProviderUiSpec[] = [
  {
    providerId: 'primary',
    worldId: 'sharkpro',
    slug: 'shark-pro',
    name: 'Shark Pro',
    shortLabel: 'Shark Pro',
    accent: '#F43F5E',
    secondary: '#FB7185',
    glowRgb: '244,63,94',
    tagline: 'TV en vivo, cine y series con rotación multi-cuenta',
    defaultMediaFocus: 'live',
  },
  {
    providerId: 'vod4k',
    worldId: 'vod4k',
    slug: 'vod-4k',
    name: 'VOD 4K',
    shortLabel: 'VOD 4K',
    accent: '#8B5CF6',
    secondary: '#C084FC',
    glowRgb: '139,92,246',
    tagline: 'Estrenos 4K UHD, películas y series bajo demanda',
    defaultMediaFocus: 'vod',
  },
  {
    providerId: '24tv',
    worldId: 'srv24tv',
    slug: '24tv',
    name: '24TV',
    shortLabel: '24TV',
    accent: '#F59E0B',
    secondary: '#FBBF24',
    glowRgb: '245,158,11',
    tagline: 'Canales internacionales 24/7, deportes y cine',
    defaultMediaFocus: 'live',
  },
  {
    providerId: '2m2h',
    worldId: 'srv2m2h',
    slug: '2m2h',
    name: '2M2H',
    shortLabel: '2M2H',
    accent: '#6366F1',
    secondary: '#818CF8',
    glowRgb: '99,102,241',
    tagline: 'Emisión continua multi-región, VOD y series',
    defaultMediaFocus: 'live',
  },
  {
    providerId: 'dana4k',
    worldId: 'dana4k',
    slug: 'dana-4k-pro',
    name: 'Dana 4K Pro',
    shortLabel: 'Dana 4K Pro',
    accent: '#0EA5E9',
    secondary: '#38BDF8',
    glowRgb: '14,165,233',
    tagline: 'Directos HD/4K, cine y series con respaldo activo',
    defaultMediaFocus: 'live',
  },
  {
    providerId: 'activecdns',
    worldId: 'activecdns',
    slug: 'active-cdns',
    name: 'Active CDNS',
    shortLabel: 'Active CDNS',
    accent: '#10B981',
    secondary: '#34D399',
    glowRgb: '16,185,129',
    tagline: 'CDN dedicada para directos estables, VOD y series',
    defaultMediaFocus: 'live',
  },
  {
    providerId: 'octopus',
    worldId: 'octopus',
    slug: 'octopus-tv',
    name: 'Octopus TV',
    shortLabel: 'Octopus TV',
    accent: '#06B6D4',
    secondary: '#22D3EE',
    glowRgb: '6,182,212',
    tagline: 'Parrilla completa en directo, películas y series',
    defaultMediaFocus: 'live',
  },
  {
    providerId: '2m2h-alt',
    worldId: 'srv2m2halt',
    slug: '2m2h-alt',
    name: '2M2H Alt',
    shortLabel: '2M2H Alt',
    accent: '#38BDF8',
    secondary: '#7DD3FC',
    glowRgb: '56,189,248',
    tagline: 'Espejo alternativo multi-idioma en directo, cine y series',
    defaultMediaFocus: 'live',
  },
  {
    providerId: 'adtupac',
    worldId: 'adtupac',
    slug: 'adtupac',
    name: 'Adtupac',
    shortLabel: 'Adtupac',
    accent: '#10B981',
    secondary: '#6EE7B7',
    glowRgb: '16,185,129',
    tagline: 'Canales España, cine castellano y deportes HD',
    defaultMediaFocus: 'live',
  },
  {
    providerId: 'ultra-vip',
    worldId: 'ultravip',
    slug: 'ultra-vip',
    name: 'Ultra VIP',
    shortLabel: 'Ultra VIP',
    accent: '#F59E0B',
    secondary: '#FDE68A',
    glowRgb: '245,158,11',
    tagline: 'Emisiones VIP de alta tasa de bits, fútbol 4K y VOD',
    defaultMediaFocus: 'live',
  },
  {
    providerId: 'sult-vo',
    worldId: 'sultvo',
    slug: 'sult-vo',
    name: 'Sult-Vo',
    shortLabel: 'Sult-Vo',
    accent: '#EC4899',
    secondary: '#F9A8D4',
    glowRgb: '236,72,153',
    tagline: 'Triple cuenta en rotación para directos, cine y series 4K',
    defaultMediaFocus: 'live',
  },
] as const;

export const XTREAM_WORLD_TO_PROVIDER_ID: Record<
  XtreamServerWorldId,
  DefaultProviderEntry['id']
> = {
  sharkpro: 'primary',
  vod4k: 'vod4k',
  srv24tv: '24tv',
  srv2m2h: '2m2h',
  srv2m2halt: '2m2h-alt',
  dana4k: 'dana4k',
  activecdns: 'activecdns',
  octopus: 'octopus',
  adtupac: 'adtupac',
  ultravip: 'ultra-vip',
  sultvo: 'sult-vo',
};

export const PROVIDER_ID_TO_XTREAM_WORLD: Record<
  DefaultProviderEntry['id'],
  XtreamServerWorldId
> = {
  primary: 'sharkpro',
  vod4k: 'vod4k',
  '24tv': 'srv24tv',
  '2m2h': 'srv2m2h',
  '2m2h-alt': 'srv2m2halt',
  dana4k: 'dana4k',
  activecdns: 'activecdns',
  octopus: 'octopus',
  adtupac: 'adtupac',
  'ultra-vip': 'ultravip',
  'sult-vo': 'sultvo',
};

export function isXtreamServerWorldId(world: string): world is XtreamServerWorldId {
  return world in XTREAM_WORLD_TO_PROVIDER_ID;
}

export function getXtreamProviderUiSpecByWorld(
  world: string
): XtreamProviderUiSpec | undefined {
  return XTREAM_PROVIDER_UI_SPECS.find((spec) => spec.worldId === world);
}

export function getXtreamProviderUiSpecByProviderId(
  providerId: string
): XtreamProviderUiSpec | undefined {
  return XTREAM_PROVIDER_UI_SPECS.find((spec) => spec.providerId === providerId);
}

/**
 * Default preconfigured server and account definitions (server-side proxy use only).
 * Never exposed to React UI components, error messages, or logs.
 */
export const DEFAULT_PROVIDERS: readonly DefaultProviderEntry[] = [
  {
    id: 'primary',
    name: 'Shark Pro',
    serverUrl: 'http://1.sharkpro.ink:80',
    defaultMediaFocus: 'live',
    accounts: [
      { user: '17518770', pass: '98488775', label: 'Cuenta 1' },
      { user: '2C6B3523', pass: '2377241482', label: 'Cuenta 2' },
      { user: '8996754342', pass: '4228202130', label: 'Cuenta 3' },
      { user: '7561512170', pass: '5952254616', label: 'Cuenta 4' },
    ],
  },
  {
    id: 'vod4k',
    name: 'VOD 4K',
    serverUrl: 'http://vod4k.cc:80',
    defaultMediaFocus: 'vod',
    accounts: [{ user: '3143047387607546', pass: '7791912648', label: 'VOD 4K' }],
  },
  {
    id: '24tv',
    name: '24TV',
    serverUrl: 'http://a1.24tv.tn:2052',
    defaultMediaFocus: 'live',
    accounts: [{ user: '2456431909037474', pass: '8742359848318788', label: '24TV' }],
  },
  {
    id: '2m2h',
    name: '2M2H',
    serverUrl: 'http://2kzbmq.2m2h.im:80',
    defaultMediaFocus: 'live',
    accounts: [{ user: 'rA591kp61 W', pass: 'R50oaYrEk C', label: '2M2H' }],
  },
  {
    id: 'dana4k',
    name: 'Dana 4K Pro',
    serverUrl: 'http://dana4kpro.com:8080',
    defaultMediaFocus: 'live',
    accounts: [
      { user: 'heshamxyo ussefx1', pass: 'da945184f', label: 'Cuenta 1' },
      { user: 'imane2026', pass: '3b06216cc', label: 'Cuenta 2' },
    ],
  },
  {
    id: 'activecdns',
    name: 'Active CDNS',
    serverUrl: 'http://active.cdns.today:80',
    defaultMediaFocus: 'live',
    accounts: [{ user: 'abdoali2024', pass: 'abdoali2024', label: 'Active CDNS' }],
  },
  {
    id: 'octopus',
    name: 'Octopus TV',
    serverUrl: 'http://octopustv.xyz:80',
    defaultMediaFocus: 'live',
    accounts: [{ user: 'C974BC33', pass: 'CD7AC7C2', label: 'Octopus TV' }],
  },
];

export function encodeXtreamCredential(value: string): string {
  return encodeURIComponent(String(value ?? ''));
}

export function buildEncodedPlayerApiUrl(
  serverUrl: string,
  user: string,
  pass: string,
  action?: string,
  extraParams?: Record<string, string | undefined>
): string {
  const origin = String(serverUrl || '').trim().replace(/\/+$/, '');
  const parts = [
    `username=${encodeXtreamCredential(user)}`,
    `password=${encodeXtreamCredential(pass)}`,
  ];
  if (action && action !== 'account_info') {
    parts.push(`action=${encodeURIComponent(action)}`);
  }
  if (extraParams) {
    for (const [key, val] of Object.entries(extraParams)) {
      if (val !== undefined && val !== '') {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
      }
    }
  }
  return `${origin}/player_api.php?${parts.join('&')}`;
}

export function getDefaultProvidersForServer(): DefaultProviderEntry[] {
  if (typeof process !== 'undefined' && process.env?.XTREAM_DISABLE_DEFAULTS === '1') {
    return [];
  }
  return DEFAULT_PROVIDERS.map((entry) => ({
    ...entry,
    accounts: entry.accounts.map((acc) => ({ ...acc })),
  }));
}

export function getDefaultProviderPublicSummaries() {
  return XTREAM_PROVIDER_UI_SPECS.map((spec) => {
    const def = DEFAULT_PROVIDERS.find((d) => d.id === spec.providerId);
    return {
      id: spec.providerId,
      name: spec.name,
      configured: Boolean(def && def.accounts.length > 0),
      totalAccounts: def?.accounts.length || 0,
      defaultMediaFocus: spec.defaultMediaFocus,
    };
  });
}
