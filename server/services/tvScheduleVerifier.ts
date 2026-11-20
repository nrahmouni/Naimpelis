import { LruTtlCache } from '../utils/lruCache.ts';
import {
  findEpgVerifiedBroadcastersForFixture,
  getCachedEpgStore,
  loadSpanishEpgSchedule,
  type EpgVerifiedBroadcast,
} from './epgService.ts';
import { FOTMOB_HEADERS } from './footballHelpers/teamMatchingAndFotmobDay.ts';

export interface VerifiedMatchTvSchedule {
  checked: boolean;
  esBroadcasterNames: string[];
  enBroadcasterNames: string[];
  zhBroadcasterNames: string[];
  espnBroadcasts?: string[];
  epgMatches: EpgVerifiedBroadcast[];
}

interface CntvProgramItem {
  title: string;
  startMs: number;
  stopMs: number;
}

const fotmobTvCache = new LruTtlCache<string, string[] | null>(600, 30 * 60 * 1000);
const cntvDayCache = new LruTtlCache<string, CntvProgramItem[]>(60, 45 * 60 * 1000);

const BEIJING_DATE_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
});

const TEAM_CN_ALIASES: Record<string, string[]> = {
  barcelona: ['巴塞罗那', '巴萨'],
  fc_barcelona: ['巴塞罗那', '巴萨'],
  barca: ['巴塞罗那', '巴萨'],
  real_madrid: ['皇家马德里', '皇马'],
  atletico_madrid: ['马德里竞技', '马竞'],
  sevilla: ['塞维利亚'],
  real_betis: ['皇家贝蒂斯', '贝蒂斯'],
  betis: ['皇家贝蒂斯', '贝蒂斯'],
  valencia: ['瓦伦西亚', '巴伦西亚'],
  athletic_club: ['毕尔巴鄂'],
  real_sociedad: ['皇家社会'],
  villarreal: ['比利亚雷亚尔'],
  celta_vigo: ['塞尔塔'],
  celta: ['塞尔塔'],
  rayo_vallecano: ['巴列卡诺', '巴列卡斯'],
  osasuna: ['奥萨苏纳'],
  girona: ['赫罗纳'],
  espanyol: ['西班牙人'],
  rcd_espanyol: ['西班牙人'],
  mallorca: ['马洛卡'],
  getafe: ['赫塔菲'],
  alaves: ['阿拉维斯'],
  deportivo_alaves: ['阿拉维斯'],
  deportivo_a_coruna: ['拉科鲁尼亚', '拉科'],
  deportivo_la_coruna: ['拉科鲁尼亚', '拉科'],
  arsenal: ['阿森纳'],
  chelsea: ['切尔西'],
  liverpool: ['利物浦'],
  manchester_city: ['曼城'],
  manchester_united: ['曼联'],
  tottenham_hotspur: ['热刺', '托特纳姆'],
  tottenham: ['热刺'],
  newcastle_united: ['纽卡斯尔', '纽卡'],
  newcastle: ['纽卡斯尔', '纽卡'],
  aston_villa: ['阿斯顿维拉', '维拉'],
  brighton: ['布莱顿'],
  fulham: ['富勒姆'],
  leeds_united: ['利兹联'],
  leeds: ['利兹联'],
  everton: ['埃弗顿'],
  nottingham_forest: ['诺丁汉森林'],
  bournemouth: ['伯恩茅斯'],
  crystal_palace: ['水晶宫'],
  paris_saint_germain: ['巴黎圣日耳曼', '大巴黎', '巴黎'],
  psg: ['巴黎圣日耳曼', '大巴黎'],
  nice: ['尼斯'],
  lyon: ['里昂'],
  marseille: ['马赛'],
  bayern_munich: ['拜仁慕尼黑', '拜仁'],
  bayern_munchen: ['拜仁慕尼黑', '拜仁'],
  borussia_dortmund: ['多特蒙德', '多特'],
  dortmund: ['多特蒙德', '多特'],
  bayer_leverkusen: ['勒沃库森', '药厂'],
  eintracht_frankfurt: ['法兰克福'],
  hoffenheim: ['霍芬海姆'],
  tsg_hoffenheim: ['霍芬海姆'],
  rb_leipzig: ['莱比锡'],
  stuttgart: ['斯图加特'],
  inter: ['国际米兰', '国米'],
  inter_milan: ['国际米兰', '国米'],
  ac_milan: ['AC米兰', '米兰'],
  milan: ['AC米兰', '米兰'],
  juventus: ['尤文图斯', '尤文'],
  napoli: ['那不勒斯'],
  roma: ['罗马'],
  as_roma: ['罗马'],
  lazio: ['拉齐奥'],
  atalanta: ['亚特兰大'],
  sporting_cp: ['葡萄牙体育'],
  benfica: ['本菲卡'],
  porto: ['波尔图'],
  psv_eindhoven: ['埃因霍温'],
  psv: ['埃因霍温'],
  feyenoord: ['费耶诺德'],
  espana: ['西班牙'],
  spain: ['西班牙'],
  france: ['法国'],
  francia: ['法国'],
  germany: ['德国'],
  alemania: ['德国'],
  england: ['英格兰'],
  inglaterra: ['英格兰'],
  italy: ['意大利'],
  italia: ['意大利'],
  portugal: ['葡萄牙'],
  netherlands: ['荷兰'],
  paises_bajos: ['荷兰'],
  brazil: ['巴西'],
  brasil: ['巴西'],
  argentina: ['阿根廷'],
  china: ['中国'],
  serbia: ['塞尔维亚'],
  honduras: ['洪都拉斯'],
};

function normSlug(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCnAliasesForTeam(teamName: string): string[] {
  const slug = normSlug(teamName);
  if (!slug) return [];
  if (TEAM_CN_ALIASES[slug]) return TEAM_CN_ALIASES[slug];
  for (const [key, list] of Object.entries(TEAM_CN_ALIASES)) {
    if (slug.includes(key) || key.includes(slug)) {
      return list;
    }
  }
  return [];
}

export async function ensureEpgScheduleReady(timeoutMs = 3800): Promise<void> {
  const cached = getCachedEpgStore();
  if (cached && cached.size > 0) return;
  try {
    await Promise.race([
      loadSpanishEpgSchedule().catch(() => new Map()),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // non-fatal timeout fallback
  }
}

export async function fetchFotmobMatchTvListing(
  fotmobMatchId: string,
  countryCode: 'ES' | 'GB'
): Promise<string[]> {
  const id = String(fotmobMatchId || '').trim();
  if (!id) return [];
  const cacheKey = `${id}:${countryCode}`;
  const cached = fotmobTvCache.get(cacheKey);
  if (cached !== undefined) {
    return cached || [];
  }

  try {
    const res = await fetch(
      `https://www.fotmob.com/api/data/tvlisting?matchId=${encodeURIComponent(id)}&countryCode=${countryCode}`,
      {
        headers: FOTMOB_HEADERS,
        signal: AbortSignal.timeout(2600),
      }
    );
    if (!res.ok) {
      fotmobTvCache.set(cacheKey, null, 10 * 60 * 1000);
      return [];
    }
    const json: any = await res.json();
    const rawName = String(json?.name || '').trim();
    if (!rawName) {
      fotmobTvCache.set(cacheKey, null, 10 * 60 * 1000);
      return [];
    }
    const parsed = rawName
      .split(/\s+\/\s+/)
      .map((s) => s.trim())
      .filter((s) => Boolean(s) && !/^replay(?:\s+youtube)?$/i.test(s));
    fotmobTvCache.set(cacheKey, parsed, 30 * 60 * 1000);
    return parsed;
  } catch {
    return [];
  }
}

async function fetchCntvChannelDayEpg(
  channelCode: 'cctv5' | 'cctv5plus' | 'cctv16',
  beijingDateKey: string
): Promise<CntvProgramItem[]> {
  const cacheKey = `${channelCode}:${beijingDateKey}`;
  const cached = cntvDayCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.cntv.cn/epg/getEpgInfoByChannelNew?c=${channelCode}&serviceId=tvcctv&d=${beijingDateKey}&t=json`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return [];
    const json: any = await res.json();
    const rawList: any[] = Array.isArray(json?.data?.[channelCode]?.list)
      ? json.data[channelCode].list
      : [];
    const parsed: CntvProgramItem[] = rawList
      .map((p) => ({
        title: String(p?.title || '').trim(),
        startMs: Number(p?.startTime || 0) * 1000,
        stopMs: Number(p?.endTime || 0) * 1000,
      }))
      .filter((p) => p.title && p.startMs > 0 && p.stopMs > p.startMs);
    cntvDayCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return [];
  }
}

export async function findVerifiedChineseBroadcastersForFixture(
  homeTeam: string,
  awayTeam: string,
  kickoffMs: number
): Promise<string[]> {
  if (!kickoffMs || kickoffMs <= 0) return [];
  const diffDays = (kickoffMs - Date.now()) / 86_400_000;
  // CNTV EPG only publishes today +/- ~3 days
  if (diffDays < -1 || diffDays > 4) return [];

  const homeCn = getCnAliasesForTeam(homeTeam);
  const awayCn = getCnAliasesForTeam(awayTeam);
  if (homeCn.length === 0 || awayCn.length === 0) return [];

  const beijingDateKey = BEIJING_DATE_KEY_FMT.format(new Date(kickoffMs)).replace(/-/g, '');
  const channels: Array<{ code: 'cctv5' | 'cctv5plus' | 'cctv16'; name: string }> = [
    { code: 'cctv5', name: 'CCTV-5' },
    { code: 'cctv5plus', name: 'CCTV-5+' },
    { code: 'cctv16', name: 'CCTV-16' },
  ];

  const results = await Promise.all(
    channels.map(async (ch) => {
      const list = await fetchCntvChannelDayEpg(ch.code, beijingDateKey);
      const hit = list.find((prog) => {
        if (prog.startMs > kickoffMs + 45 * 60_000 || prog.stopMs < kickoffMs + 25 * 60_000) {
          return false;
        }
        if (/实况录像|集锦|精彩一刻|体育新闻|体坛快讯/.test(prog.title)) return false;
        const matchHome = homeCn.some((tok) => prog.title.includes(tok));
        const matchAway = awayCn.some((tok) => prog.title.includes(tok));
        return matchHome && matchAway;
      });
      return hit ? ch.name : null;
    })
  );

  return results.filter((x): x is string => Boolean(x));
}

export function extractEspnCompBroadcastNames(comp: any): string[] {
  const names = new Set<string>();
  const addFromArr = (arr: any[]) => {
    for (const b of arr) {
      if (Array.isArray(b?.names)) {
        for (const n of b.names) {
          if (typeof n === 'string' && n.trim()) names.add(n.trim());
        }
      }
      if (typeof b?.media?.shortName === 'string' && b.media.shortName.trim()) {
        names.add(b.media.shortName.trim());
      }
      if (typeof b?.media?.name === 'string' && b.media.name.trim()) {
        names.add(b.media.name.trim());
      }
    }
  };
  if (Array.isArray(comp?.broadcasts)) addFromArr(comp.broadcasts);
  if (Array.isArray(comp?.geoBroadcasts)) addFromArr(comp.geoBroadcasts);
  return Array.from(names);
}

export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]);
    }
  });
  await Promise.all(workers);
}

export async function verifySingleFixtureTvSchedule(params: {
  homeTeam: string;
  awayTeam: string;
  kickoffMs: number;
  fotmobMatchId?: string;
  espnBroadcasts?: string[];
  queryExternalListings?: boolean;
}): Promise<VerifiedMatchTvSchedule> {
  const {
    homeTeam,
    awayTeam,
    kickoffMs,
    fotmobMatchId,
    espnBroadcasts = [],
    queryExternalListings = true,
  } = params;

  const epgMatches = findEpgVerifiedBroadcastersForFixture(homeTeam, awayTeam, kickoffMs);
  const diffDays = kickoffMs > 0 ? (kickoffMs - Date.now()) / 86_400_000 : 0;
  const withinListingHorizon = diffDays >= -1 && diffDays <= 14;

  let fotmobEs: string[] = [];
  let fotmobEn: string[] = [];
  let zhNames: string[] = [];

  if (queryExternalListings && withinListingHorizon) {
    const [esList, gbList, cnList] = await Promise.all([
      fotmobMatchId ? fetchFotmobMatchTvListing(fotmobMatchId, 'ES') : Promise.resolve([]),
      fotmobMatchId ? fetchFotmobMatchTvListing(fotmobMatchId, 'GB') : Promise.resolve([]),
      findVerifiedChineseBroadcastersForFixture(homeTeam, awayTeam, kickoffMs),
    ]);
    fotmobEs = esList;
    fotmobEn = gbList;
    zhNames = cnList;
  }

  const esSet = new Set<string>(fotmobEs);
  const enSet = new Set<string>(fotmobEn);

  for (const epg of epgMatches) {
    if (epg.lang === 'EN') {
      enSet.add(epg.channelLabel);
    } else {
      esSet.add(epg.channelLabel);
    }
  }

  // Filter ESPN broadcasts into ES or EN if unambiguous
  for (const eb of espnBroadcasts) {
    if (/dazn|movistar|m\+|laliga|la 1|teledeporte|rtve|vamos|esport3|cuatro|telecinco/i.test(eb)) {
      esSet.add(eb);
    } else if (/sky sports|tnt sports|bbc|itv|channel 4|premier sports|cbs|espn\+|fifa\+/i.test(eb)) {
      enSet.add(eb);
    }
  }

  return {
    checked: true,
    esBroadcasterNames: Array.from(esSet),
    enBroadcasterNames: Array.from(enSet),
    zhBroadcasterNames: zhNames,
    espnBroadcasts,
    epgMatches,
  };
}
