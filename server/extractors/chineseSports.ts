import { CN_IPTV_UA, TrackRecord, curlGetText } from './httpHelpers.ts';

export interface ChineseFootballChannelDef {
  id: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category: 'china_football';
  quality: string;
  description: string;
  channels: TrackRecord[];
}

/**
 * Native Chinese (Mandarin 中文 & Cantonese 粤语) Football & Sports Channels.
 * Every upstream feed below is verified to serve live H.264/AAC MPEG-TS segments
 * when proxied via `/api/hls-proxy` & `/api/ts-proxy` with `okhttp/4.12.0` UA.
 */
export const CHINESE_FOOTBALL_CHANNELS: ChineseFootballChannelDef[] = [
  {
    id: 'cn-cctv5',
    dial: 150,
    name: 'CCTV-5 体育 (中文 HD)',
    shortMark: 'CCTV5',
    brandTone: '#DC2626',
    network: '央视体育 · 中文',
    category: 'china_football',
    quality: '1080p 中文',
    description:
      'CCTV-5 体育频道 · Emisión nativa en chino: UEFA Champions League (欧冠), LaLiga (西甲), Premier League (英超) y Mundial',
    channels: [
      {
        id: 'cn-cctv5-1',
        label: 'CCTV-5 HD · Señal Principal (中文)',
        lang: 'ZH',
        quality: '720p/1080p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5hd.m3u8?auth=test20251009',
        resolverType: 'tdt_hls',
      },
      {
        id: 'cn-cctv5-2',
        label: 'CCTV-5 1080p · Respaldo P2 (中文)',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/cctv5p.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cn-fengyun-football',
    dial: 151,
    name: 'CCTV 风云足球 HD (欧冠/西甲/英超)',
    shortMark: '风云足球',
    brandTone: '#16A34A',
    network: '央视风云 · 中文',
    category: 'china_football',
    quality: '1080p 中文',
    description:
      'Canal temático 24/7 de fútbol europeo en chino: 欧冠 Champions League, 西甲 LaLiga, 英超 Premier League y clásicos',
    channels: [
      {
        id: 'cn-fyzq-1',
        label: '风云足球 1080p · Señal Principal (中文)',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/fyzq.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
      {
        id: 'cn-fyzq-2',
        label: '风云足球 1080p · Respaldo Node 2 (中文)',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'http://63.141.230.178:82/gslb/zbdq5.m3u8?id=fyzq',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cn-guangdong-sports',
    dial: 152,
    name: '广东体育 HD (英超/西甲/欧冠 粤语/中文)',
    shortMark: '广东体育',
    brandTone: '#2563EB',
    network: '广东广播 · 粤/中文',
    category: 'china_football',
    quality: '720p 粤/中文',
    description:
      'Guangdong Sports en directo: Premier League (英超), LaLiga (西甲) y Champions League (欧冠) con narración en cantonés/mandarín',
    channels: [
      {
        id: 'cn-gdty-1',
        label: '广东体育 HD · Señal Principal (粤语/中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/gdty.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cn-btv6-sports',
    dial: 153,
    name: '北京体育休闲 BTV-6 HD (英超/欧冠/西甲)',
    shortMark: 'BTV体育',
    brandTone: '#9333EA',
    network: '北京广播 · 中文',
    category: 'china_football',
    quality: '720p 中文',
    description:
      'Beijing Sports BTV-6 en directo en chino: Premier League (英超), Champions League (欧冠), LaLiga (西甲) y Superliga China',
    channels: [
      {
        id: 'cn-btv6-1',
        label: '北京体育 BTV-6 HD · Señal Principal (中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/btv6.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cn-cctv5plus',
    dial: 154,
    name: 'CCTV-5+ 体育赛事 (中文 HD)',
    shortMark: 'CCTV5+',
    brandTone: '#B91C1C',
    network: '央视体育+ · 中文',
    category: 'china_football',
    quality: '720p 中文',
    description:
      'CCTV-5+ 体育赛事频道 · Segunda señal de la televisión estatal china para Champions League (欧冠), 西甲, 英超 y torneos internacionales',
    channels: [
      {
        id: 'cn-cctv5p-1',
        label: 'CCTV-5+ HD · Señal Principal (中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5p.m3u8?auth=test20251009',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cn-tianjin-sports',
    dial: 155,
    name: '天津体育 HD (中超/欧冠/英超 中文)',
    shortMark: '天津体育',
    brandTone: '#0284C7',
    network: '天津广播 · 中文',
    category: 'china_football',
    quality: '720p 中文',
    description:
      'Tianjin TV-5 Sports en directo: Champions League (欧冠), Premier League (英超), LaLiga (西甲) y Superliga China (中超)',
    channels: [
      {
        id: 'cn-tjty-1',
        label: '天津体育 HD · Señal Principal (中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/tjtv5.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
      {
        id: 'cn-tjty-2',
        label: '天津体育 HD · Respaldo Node 2 (中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://63.141.230.178:82/gslb/zbdq5.m3u8?id=tjtv5',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cn-cctv16',
    dial: 156,
    name: 'CCTV-16 奥林匹克 HD (中文)',
    shortMark: 'CCTV16',
    brandTone: '#E11D48',
    network: '央视奥林匹克 · 中文',
    category: 'china_football',
    quality: '720p 中文',
    description:
      'CCTV-16 央视奥林匹克频道 · Competiciones olímpicas, torneos FIFA/UEFA y multideporte 24/7 en chino',
    channels: [
      {
        id: 'cn-cctv16-1',
        label: 'CCTV-16 HD · Señal Principal (中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv16hd.m3u8?auth=test20251009',
        resolverType: 'tdt_hls',
      },
    ],
  },
];

export function getChineseFootballMultiplexCard() {
  return {
    id: 'mux-china-football',
    title: '中国体育直播 · 欧冠 · 西甲 · 英超 (CCTV-5 / 风云足球 / 广东体育 / BTV体育)',
    competition: 'Champions · LaLiga · Premier League (中文)',
    sport: 'soccer' as const,
    time: '直播 · 中文',
    isLive: true,
    is247Channel: true,
    channels: [
      {
        id: 'ch-cn-cctv5',
        label: 'CCTV-5 体育 HD (中文)',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5hd.m3u8?auth=test20251009',
        resolverType: 'tdt_hls' as const,
      },
      {
        id: 'ch-cn-fyzq',
        label: 'CCTV 风云足球 1080p (欧冠/西甲/英超)',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/fyzq.m3u8?auth=testpub',
        resolverType: 'tdt_hls' as const,
      },
      {
        id: 'ch-cn-gdty',
        label: '广东体育 HD (英超/西甲 粤/中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/gdty.m3u8?auth=testpub',
        resolverType: 'tdt_hls' as const,
      },
      {
        id: 'ch-cn-btv6',
        label: '北京体育 BTV-6 HD (英超/欧冠 中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/btv6.m3u8?auth=testpub',
        resolverType: 'tdt_hls' as const,
      },
      {
        id: 'ch-cn-cctv5p',
        label: 'CCTV-5+ 体育赛事 (中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5p.m3u8?auth=test20251009',
        resolverType: 'tdt_hls' as const,
      },
      {
        id: 'ch-cn-tjty',
        label: '天津体育 HD (中文)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/tjtv5.m3u8?auth=testpub',
        resolverType: 'tdt_hls' as const,
      },
    ],
  };
}

/**
 * Returns ordered native Chinese (`ZH`) football broadcast tracks for major football
 * competitions (UEFA Champions League, LaLiga, Premier League, Europa, FIFA/UEFA).
 */
export function getChineseFootballMatchTracks(
  leagueSlug: string,
  matchId: string
): TrackRecord[] {
  const slug = String(leagueSlug || '').toLowerCase();
  const isMajorEuropeanOrIntl =
    slug === 'uefa.champions' ||
    slug === 'uefa.europa' ||
    slug === 'uefa.europa.conf' ||
    slug === 'esp.1' ||
    slug === 'eng.1' ||
    slug === 'ita.1' ||
    slug === 'ger.1' ||
    slug === 'fra.1' ||
    slug.startsWith('uefa.') ||
    slug.startsWith('fifa.');

  if (!isMajorEuropeanOrIntl) return [];

  if (slug === 'eng.1') {
    // Premier League (英超): 广东体育 (粤/中文) + CCTV 风云足球 + 北京体育 BTV-6 + CCTV-5
    return [
      {
        id: `${matchId}-zh-gdty`,
        label: '粤/中文 · 广东体育 HD (英超)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/gdty.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
      {
        id: `${matchId}-zh-fyzq`,
        label: '中文直播 · 风云足球 1080p (英超)',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/fyzq.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
      {
        id: `${matchId}-zh-btv6`,
        label: '中文直播 · 北京体育 BTV-6 HD',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/btv6.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
    ];
  }

  if (slug === 'esp.1') {
    // LaLiga (西甲): CCTV-5 + 广东体育 + 风云足球
    return [
      {
        id: `${matchId}-zh-cctv5`,
        label: '中文直播 · CCTV-5 体育 HD (西甲)',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5hd.m3u8?auth=test20251009',
        resolverType: 'tdt_hls',
      },
      {
        id: `${matchId}-zh-gdty`,
        label: '粤/中文 · 广东体育 HD (西甲)',
        lang: 'ZH',
        quality: '720p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/gdty.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
      {
        id: `${matchId}-zh-fyzq`,
        label: '中文直播 · 风云足球 1080p',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/fyzq.m3u8?auth=testpub',
        resolverType: 'tdt_hls',
      },
    ];
  }

  // UEFA Champions League (欧冠) & International
  return [
    {
      id: `${matchId}-zh-cctv5`,
      label: '中文直播 · CCTV-5 体育 HD (欧冠)',
      lang: 'ZH',
      quality: '1080p',
      sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5hd.m3u8?auth=test20251009',
      resolverType: 'tdt_hls',
    },
    {
      id: `${matchId}-zh-cctv5p`,
      label: '中文直播 · CCTV-5+ 体育赛事',
      lang: 'ZH',
      quality: '720p',
      sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5p.m3u8?auth=test20251009',
      resolverType: 'tdt_hls',
    },
    {
      id: `${matchId}-zh-fyzq`,
      label: '中文直播 · 风云足球 1080p (欧冠)',
      lang: 'ZH',
      quality: '1080p',
      sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/fyzq.m3u8?auth=testpub',
      resolverType: 'tdt_hls',
    },
  ];
}

export interface KanqiuMatchSummary {
  time: string;
  competition: string;
  matchTitle: string;
  isLive: boolean;
}

let cachedKanqiu: { items: KanqiuMatchSummary[]; ts: number } | null = null;

export async function fetch88KanqiuSchedule(): Promise<KanqiuMatchSummary[]> {
  if (cachedKanqiu && Date.now() - cachedKanqiu.ts < 5 * 60 * 1000) {
    return cachedKanqiu.items;
  }
  try {
    const res = await curlGetText(
      'https://www.88kanqiu.one/',
      { 'User-Agent': CN_IPTV_UA },
      4,
      true
    );
    const html = res.text || '';
    const rows = html.match(/<li[^>]*class="[^"]*list-group-item[^"]*"[\s\S]*?<\/li>/gi) || [];
    const items: KanqiuMatchSummary[] = [];
    for (const r of rows) {
      const text = r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const m = text.match(/^(\d{2}:\d{2})\s+(\S+)\s+(.+?)(?:\s+(直播中|未开始))?$/);
      if (!m) continue;
      if (!/(英超|西甲|欧冠|欧联|欧协|意甲|德甲|法甲|中超|欧国联|世预赛|足球|女足)/.test(m[2])) {
        continue;
      }
      items.push({
        time: m[1],
        competition: m[2],
        matchTitle: m[3].trim(),
        isLive: m[4] === '直播中',
      });
    }
    cachedKanqiu = { items, ts: Date.now() };
    return items;
  } catch {
    return cachedKanqiu?.items || [];
  }
}
