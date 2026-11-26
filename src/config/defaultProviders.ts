export interface XtreamAccountCredential {
  username: string;
  password: string;
}

export interface DefaultProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  accounts: XtreamAccountCredential[];
  accentColor: string;
}

export interface PublicProviderSummary {
  id: string;
  name: string;
  accentColor: string;
  accountCount: number;
}

export const DEFAULT_PROVIDERS: DefaultProviderConfig[] = [
  {
    id: 'shark-pro',
    name: 'Shark Pro',
    baseUrl: 'http://1.sharkpro.ink:80',
    accentColor: '#F43F5E',
    accounts: [
      { username: '17518770', password: '98488775' },
      { username: '2C6B3523', password: '2377241482' },
      { username: '8996754342', password: '4228202130' },
      { username: '7561512170', password: '5952254616' },
    ],
  },
  {
    id: 'vod-4k',
    name: 'VOD 4K',
    baseUrl: 'http://vod4k.cc:80',
    accentColor: '#8B5CF6',
    accounts: [
      { username: '3143047387607546', password: '7791912648' },
      { username: '4413658251491390', password: '4413658251491390' },
      { username: '3178886199166690', password: '8242297241' },
    ],
  },
  {
    id: '24tv',
    name: '24TV',
    baseUrl: 'http://a1.24tv.tn:2052',
    accentColor: '#38BDF8',
    accounts: [
      { username: '2456431909037474', password: '8742359848318788' },
    ],
  },
  {
    id: '2m2h',
    name: '2M2H',
    baseUrl: 'http://2kzbmq.2m2h.im:80',
    accentColor: '#10B981',
    accounts: [
      { username: 'rA591kp61 W', password: 'R50oaYrEk C' },
    ],
  },
  {
    id: '2m2h-alt',
    name: '2M2H Alt',
    baseUrl: 'http://3jrg5v.2m2h.im:80',
    accentColor: '#06B6D4',
    accounts: [
      { username: 'NBA00382', password: '9100177277' },
    ],
  },
  {
    id: 'dana-4k-pro',
    name: 'Dana 4K Pro',
    baseUrl: 'http://dana4kpro.com:8080',
    accentColor: '#F59E0B',
    accounts: [
      { username: 'heshamxyo ussefx1', password: 'da945184f' },
      { username: 'imane2026', password: '3b06216cc' },
    ],
  },
  {
    id: 'active-cdns',
    name: 'Active CDNS',
    baseUrl: 'http://active.cdns.today:80',
    accentColor: '#6366F1',
    accounts: [
      { username: 'abdoali2024', password: 'abdoali2024' },
    ],
  },
  {
    id: 'octopus-tv',
    name: 'Octopus TV',
    baseUrl: 'http://octopustv.xyz:80',
    accentColor: '#EC4899',
    accounts: [
      { username: 'C974BC33', password: 'CD7AC7C2' },
    ],
  },
  {
    id: 'adtupac',
    name: 'Adtupac',
    baseUrl: 'http://a.adtupac.top:80',
    accentColor: '#EAB308',
    accounts: [
      { username: 'Ricardo-alves@2023@R', password: '7X4EuvXdEdYr2C' },
    ],
  },
  {
    id: 'ultra-vip',
    name: 'Ultra VIP',
    baseUrl: 'http://ultra-vip.net:8080',
    accentColor: '#A855F7',
    accounts: [
      { username: 'GzheRdD6J', password: 'c78sXxk15' },
    ],
  },
  {
    id: 'sult-vo',
    name: 'Sult-Vo',
    baseUrl: 'http://sult-vo.xyz:80',
    accentColor: '#14B8A6',
    accounts: [
      { username: '4426530274896970', password: '4426530274896970' },
      { username: '2225190801115579', password: '2225190801115579' },
      { username: '4453758394245202', password: '4453758394245202' },
    ],
  },
];

export const DEFAULT_PROVIDER_SUMMARIES: PublicProviderSummary[] = DEFAULT_PROVIDERS.map((p) => ({
  id: p.id,
  name: p.name,
  accentColor: p.accentColor,
  accountCount: p.accounts.length,
}));

export function getDefaultProviderById(providerId: string): DefaultProviderConfig | undefined {
  return DEFAULT_PROVIDERS.find((p) => p.id === providerId);
}

/**
 * Builds an Xtream player_api.php request URL, always applying encodeURIComponent()
 * to usernames and passwords so whitespace and special characters (@, -) are preserved safely.
 */
export function buildXtreamPlayerApiUrl(
  baseUrl: string,
  account: XtreamAccountCredential,
  action?: string,
  extraParams?: Record<string, string | number>
): string {
  const cleanOrigin = String(baseUrl || '').trim().replace(/\/+$/, '');
  const encodedUser = encodeURIComponent(account.username);
  const encodedPass = encodeURIComponent(account.password);
  const parts = [`username=${encodedUser}`, `password=${encodedPass}`];
  if (action) {
    parts.push(`action=${encodeURIComponent(action)}`);
  }
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return `${cleanOrigin}/player_api.php?${parts.join('&')}`;
}
