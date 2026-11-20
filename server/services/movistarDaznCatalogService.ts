import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  curlGetText,
  normalizeTitleForMatch,
} from '../extractors/httpHelpers.ts';
import { resolveDailymotionVideoToM3u8 } from '../extractors/dailymotionExtractor.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import type { SpanishTdtChannelDef } from '../data/tdtTypes.ts';
import { loadSpanishEpgSchedule } from './epgService.ts';
import { fetchTmdbItemsByIds } from './tmdbCatalogHelpers.ts';
import { resolveOfficialChannelLogoUrl } from '../../src/shared/channelLogos.ts';
import { getFootballBoardMatches } from '../routes/sports.ts';

export type MovistarDaznOperator = 'movistar' | 'dazn' | 'both';

export type MovistarDaznCategory =
  | 'all'
  | 'futbol'
  | 'motor'
  | 'deportes'
  | 'entretenimiento'
  | 'series';

export interface MovistarDaznLiveChannelItem {
  id: string;
  tdtId: string;
  dial: number;
  name: string;
  shortMark: string;
  operator: 'movistar' | 'dazn';
  brandTone: string;
  logoUrl: string;
  nowTitle: string;
  nextTitle: string;
  description: string;
  startLabel: string;
  stopLabel: string;
  progressPct: number;
  isLiveSport: boolean;
  programArtwork: string;
  signalCount: number;
  tdtChannel: SpanishTdtChannelDef;
}

export interface MovistarDaznCatalogEntry {
  id: string;
  programId: string;
  title: string;
  operator: MovistarDaznOperator;
  channelId: string;
  channelName: string;
  category: Exclude<MovistarDaznCategory, 'all'>;
  kind: 'program' | 'series';
  genre: string;
  description: string;
  claim?: string;
  imageUrl: string;
  themeKey: 'stadium' | 'motor' | 'basketball' | 'cinema';
  tmdbId?: number;
  featured?: boolean;
  liveTdtId?: string;
}

export interface MovistarDaznPlayableEpisode {
  id: string;
  source: 'dailymotion' | 'youtube';
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  durationSec: number;
  thumbnail: string;
  quality: string;
}

export interface MovistarDaznLiveMatchSummary {
  id: string;
  title: string;
  competition: string;
  sport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other';
  time: string;
  isLive: boolean;
  broadcaster: string;
  operator: MovistarDaznOperator;
  channels: any[];
  matchMeta: {
    eventId?: string;
    fotmobMatchId?: string;
    leagueSlug?: string;
    homeTeam: string;
    awayTeam: string;
    homeShort?: string;
    awayShort?: string;
    homeLogo?: string;
    awayLogo?: string;
    homeScore?: string;
    awayScore?: string;
    statusState?: 'live' | 'upcoming' | 'finished';
    statusLabel?: string;
  };
}

interface CuratedProgramSeed {
  programId: string;
  title: string;
  operator: MovistarDaznOperator;
  channelId: string;
  channelName: string;
  category: Exclude<MovistarDaznCategory, 'all'>;
  genre: string;
  description: string;
  claim: string;
  themeKey: 'stadium' | 'motor' | 'basketball' | 'cinema';
  ytQueries: string[];
  dmQueries: string[];
  liveTdtId: string;
  featured?: boolean;
}

const CURATED_PROGRAMS: CuratedProgramSeed[] = [
  {
    programId: 'el-dia-despues',
    title: 'El Día Después',
    operator: 'movistar',
    channelId: 'mplus-vamos',
    channelName: 'Movistar Vamos',
    category: 'futbol',
    genre: 'Fútbol · Crónica de Jornada',
    description:
      'El clásico programa semanal de Movistar Plus+ con los detalles, imágenes inéditas, sonidos del vestuario y las historias humanas de cada jornada de LaLiga.',
    claim: 'Programas completos y reportajes de la jornada',
    themeKey: 'stadium',
    ytQueries: ['El Dia Despues Movistar programa completo', 'El Dia Despues lo mejor jornada'],
    dmQueries: ['El Dia Despues Movistar', 'El Dia Despues'],
    liveTdtId: 'mplus-vamos',
    featured: true,
  },
  {
    programId: 'informe-plus',
    title: 'Informe Plus+',
    operator: 'movistar',
    channelId: 'mplus-canal',
    channelName: 'Movistar Plus+',
    category: 'deportes',
    genre: 'Documentales Deportivos',
    description:
      'La serie documental de referencia de Movistar Plus+ dirigida por el equipo de Informe Robinson: leyendas, gestas olímpicas y relatos únicos del deporte mundial.',
    claim: 'Documentales completos en HD',
    themeKey: 'stadium',
    ytQueries: ['Informe Plus documental completo Movistar', 'Informe Robinson documental completo'],
    dmQueries: ['Informe Plus Movistar', 'Informe Robinson'],
    liveTdtId: 'mplus-canal',
    featured: true,
  },
  {
    programId: 'codigo-f1-dazn',
    title: 'Código F1 · DAZN',
    operator: 'dazn',
    channelId: 'dazn-f1',
    channelName: 'DAZN F1',
    category: 'motor',
    genre: 'Fórmula 1 · Análisis Técnico',
    description:
      'Antonio Lobato, Pedro de la Rosa y Toni Cuquerella analizan al detalle cada Gran Premio, telemetrías, adelantamientos y estrategias del Mundial de Fórmula 1.',
    claim: 'Fórmula 1 24/7, análisis y carreras',
    themeKey: 'motor',
    ytQueries: ['DAZN F1 analisis carrera Formula 1 completo', 'Codigo F1 DAZN programa'],
    dmQueries: ['DAZN F1 carrera completa', 'Formula 1 DAZN'],
    liveTdtId: 'dazn-f1',
    featured: true,
  },
  {
    programId: 'universo-valdano',
    title: 'Universo Valdano',
    operator: 'movistar',
    channelId: 'mplus-vamos',
    channelName: 'Movistar Plus+',
    category: 'futbol',
    genre: 'Entrevistas de Fútbol',
    description:
      'Jorge Valdano conversa en profundidad con los grandes futbolistas, entrenadores y referentes internacionales sobre táctica, carrera y liderazgo.',
    claim: 'Entrevistas completas en profundidad',
    themeKey: 'stadium',
    ytQueries: ['Universo Valdano Movistar entrevista completa', 'Universo Valdano completo'],
    dmQueries: ['Universo Valdano', 'Universo Valdano Movistar'],
    liveTdtId: 'mplus-vamos',
  },
  {
    programId: 'dazn-motogp',
    title: 'DAZN MotoGP · Paddock',
    operator: 'dazn',
    channelId: 'dazn-1',
    channelName: 'DAZN España',
    category: 'motor',
    genre: 'MotoGP · Mundial de Motociclismo',
    description:
      'Todas las citas de MotoGP, Moto2 y Moto3 en DAZN: carreras completas, sprints del sábado, declaraciones de Marc Márquez, Jorge Martín y Pecco Bagnaia.',
    claim: 'Carreras, sprints y paddock MotoGP',
    themeKey: 'motor',
    ytQueries: ['DAZN MotoGP resumen carrera completo', 'MotoGP DAZN España'],
    dmQueries: ['MotoGP DAZN carrera completa', 'MotoGP DAZN'],
    liveTdtId: 'dazn-1',
  },
  {
    programId: 'el-tercer-tiempo',
    title: 'El Tercer Tiempo',
    operator: 'movistar',
    channelId: 'mplus-vamos',
    channelName: 'Movistar Vamos',
    category: 'futbol',
    genre: 'Tertulia y Análisis LaLiga',
    description:
      'El debate postjornada de Movistar Plus+ con análisis táctico, polémica arbitral, resúmenes de Primera División y previa europea.',
    claim: 'Postpartido y tertulia en vivo',
    themeKey: 'stadium',
    ytQueries: ['El Tercer Tiempo Movistar analisis LaLiga', 'Deporte Plus Movistar LaLiga'],
    dmQueries: ['El Tercer Tiempo Movistar', 'Movistar LaLiga'],
    liveTdtId: 'mplus-laliga',
  },
  {
    programId: 'la-resistencia-mplus',
    title: 'La Resistencia · M+',
    operator: 'movistar',
    channelId: 'mplus-canal',
    channelName: 'Movistar Plus+',
    category: 'entretenimiento',
    genre: 'Late Night · Humor y Entrevistas',
    description:
      'Los programas completos, entrevistas virales y mejores momentos de David Broncano y su equipo en el teatro de Movistar Plus+.',
    claim: 'Entrevistas completas y monólogos',
    themeKey: 'cinema',
    ytQueries: ['La Resistencia Movistar entrevista completa', 'La Resistencia programa completo'],
    dmQueries: ['La Resistencia Movistar', 'La Resistencia completo'],
    liveTdtId: 'mplus-canal',
  },
  {
    programId: 'laliga-dazn-mplus',
    title: 'LaLiga EA Sports · Resúmenes',
    operator: 'both',
    channelId: 'dazn-laliga',
    channelName: 'DAZN & M+ LaLiga',
    category: 'futbol',
    genre: 'Primera División · Goles HD',
    description:
      'Cobertura conjunta de DAZN LaLiga y Movistar LaLiga TV con todos los goles, jugadas decisivas y resúmenes extendidos de la temporada.',
    claim: 'Goles y resúmenes extendidos 1080p',
    themeKey: 'stadium',
    ytQueries: ['LaLiga EA Sports resumen partido goles DAZN', 'LaLiga resumen jornada completo'],
    dmQueries: ['LaLiga resumen partido', 'DAZN LaLiga'],
    liveTdtId: 'dazn-laliga',
  },
  {
    programId: 'champions-mplus',
    title: 'UEFA Champions League · M+',
    operator: 'movistar',
    channelId: 'mplus-champions',
    channelName: 'M+ Liga de Campeones',
    category: 'futbol',
    genre: 'Europa · Liga de Campeones',
    description:
      'Las noches mágicas de la Champions League en Movistar Plus+: resúmenes completos, análisis con Maldini y grandes remontadas europeas.',
    claim: 'Resúmenes Champions y partidos históricos',
    themeKey: 'stadium',
    ytQueries: ['Champions League resumen partido Movistar', 'UEFA Champions League goles resumen'],
    dmQueries: ['Champions League Movistar', 'Liga de Campeones resumen'],
    liveTdtId: 'mplus-champions',
  },
  {
    programId: 'premier-league-dazn',
    title: 'Premier League · DAZN',
    operator: 'dazn',
    channelId: 'dazn-1',
    channelName: 'DAZN España',
    category: 'futbol',
    genre: 'Fútbol Inglés · DAZN 1–4',
    description:
      'Lo mejor de la Premier League en DAZN España: partidazos del Manchester City, Arsenal, Liverpool y Chelsea con narración en castellano.',
    claim: 'Resúmenes y programas Premier Corner',
    themeKey: 'stadium',
    ytQueries: ['Premier League DAZN España resumen goles', 'Premier Corner DAZN completo'],
    dmQueries: ['Premier League DAZN', 'DAZN Premier'],
    liveTdtId: 'dazn-1',
  },
  {
    programId: 'nba-euroliga-mplus',
    title: 'Generación NBA y Euroliga',
    operator: 'movistar',
    channelId: 'mplus-deportes',
    channelName: 'Movistar Deportes',
    category: 'deportes',
    genre: 'Baloncesto · NBA, ACB y Euroliga',
    description:
      'Toda la actualidad de la Liga Endesa ACB, la Euroliga con Real Madrid y Barça, y los programas especiales de Generación NBA en Movistar Deportes.',
    claim: 'Euroliga, ACB y NBA en HD',
    themeKey: 'basketball',
    ytQueries: ['Generacion NBA Movistar completo', 'Euroliga Liga Endesa Movistar resumen'],
    dmQueries: ['Movistar Deportes NBA Euroliga', 'Euroliga Movistar'],
    liveTdtId: 'mplus-deportes',
  },
  {
    programId: 'ufc-boxeo-dazn',
    title: 'Boxeo Mundial & MMA · DAZN',
    operator: 'dazn',
    channelId: 'dazn-combat',
    channelName: 'DAZN Combat',
    category: 'deportes',
    genre: 'Combate · Veladas DAZN PPV',
    description:
      'Veladas completas de boxeo internacional, Matchroom Boxing, Golden Boy y grandes combates de MMA emitidos en DAZN Combat.',
    claim: 'Combates completos y highlights HD',
    themeKey: 'basketball',
    ytQueries: ['DAZN Boxing fight highlights completo', 'DAZN Boxeo combate completo español'],
    dmQueries: ['DAZN Boxing', 'DAZN Combat'],
    liveTdtId: 'dazn-combat',
  },
  {
    programId: 'fiebre-maldini',
    title: 'Fiebre Maldini',
    operator: 'movistar',
    channelId: 'mplus-vamos',
    channelName: 'Movistar Plus+',
    category: 'futbol',
    genre: 'Fútbol Internacional e Historia',
    description:
      'Julio Maldonado Maldini repasa ligas internacionales, jóvenes promesas, mundiales clásicos y análisis táctico en el archivo histórico de Movistar.',
    claim: 'Especiales y fútbol internacional',
    themeKey: 'stadium',
    ytQueries: ['Fiebre Maldini Movistar programa completo', 'Maldini futbol internacional analisis'],
    dmQueries: ['Fiebre Maldini', 'Maldini Movistar'],
    liveTdtId: 'mplus-vamos',
  },
  {
    programId: 'ilustres-ignorantes',
    title: 'Ilustres Ignorantes · M+',
    operator: 'movistar',
    channelId: 'mplus-canal',
    channelName: 'Movistar Plus+',
    category: 'entretenimiento',
    genre: 'Comedia · Movistar Plus+',
    description:
      'Javier Coronas, Javier Cansado y Pepe Colubi debaten junto a invitados especiales en el longevo formato de humor original de Movistar Plus+.',
    claim: 'Programas completos de humor M+',
    themeKey: 'cinema',
    ytQueries: ['Ilustres Ignorantes Movistar programa completo', 'Ilustres Ignorantes completo'],
    dmQueries: ['Ilustres Ignorantes', 'Ilustres Ignorantes Movistar'],
    liveTdtId: 'mplus-canal',
  },
];

// Verified TMDB TV IDs for flagship Movistar Plus+ Original Series (Castellano)
const MOVISTAR_SERIES_TMDB_IDS: number[] = [
  96005, // Antidisturbios
  96687, // La Unidad
  89586, // Hierro
  195946, // Rapa
  201420, // La Mesías
  238480, // Querer
  155548, // Apagón
  197929, // El Inmortal
  128327, // Bellas Artes
  238106, // Los años nuevos
];

const HOME_CACHE_TTL_MS = 3 * 60 * 1000;
const homeCache = new LruTtlCache<
  string,
  {
    liveChannels: MovistarDaznLiveChannelItem[];
    liveMatches: MovistarDaznLiveMatchSummary[];
    catalog: MovistarDaznCatalogEntry[];
    updatedAt: number;
  }
>(4, HOME_CACHE_TTL_MS);

const programThumbsCache = new LruTtlCache<string, string>(64, 30 * 60 * 1000);
const programDetailCache = new LruTtlCache<string, any>(80, 8 * 60 * 1000);
const playResolveCache = new LruTtlCache<string, any>(160, 8 * 60 * 1000);

function formatMadridHHMM(ms: number): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

function parseYouTubeDurationSec(label: string): number {
  const clean = String(label || '').trim();
  if (!clean || /live|directo/i.test(clean)) return 0;
  const parts = clean.split(':').map((p) => Number(p.replace(/[^\d]/g, '') || 0));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatDurationSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

async function searchYouTubeSportsPrograms(
  queries: string[],
  programTitle: string,
  limit = 40
): Promise<MovistarDaznPlayableEpisode[]> {
  try {
    const cleanTopic = programTitle
      .replace(/\b(m\+|dazn|res[uú]menes|y|de|en)\b/gi, ' ')
      .trim();
    const normProg = normalizeTitleForMatch(cleanTopic || programTitle);
    const progTokens = normProg.split(' ').filter((w) => w.length >= 3);

    const htmlList = await Promise.all(
      queries.map((q) =>
        fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`, {
          headers: {
            'User-Agent': CHROME_UA,
            'Accept-Language': 'es-ES,es;q=0.9',
          },
          signal: AbortSignal.timeout(4800),
        })
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => '')
      )
    );

    const out: MovistarDaznPlayableEpisode[] = [];
    const seen = new Set<string>();
    for (const html of htmlList) {
      if (!html) continue;
      const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
      if (!initMatch) continue;
      try {
        const data = JSON.parse(initMatch[1]);
        const sections =
          data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
            ?.contents || [];
        for (const sec of sections) {
          for (const item of sec?.itemSectionRenderer?.contents || []) {
            const vr = item?.videoRenderer;
            if (!vr?.videoId || seen.has(vr.videoId)) continue;
            const title = vr.title?.runs?.map((r: any) => r.text).join('') || '';
            const duration = vr.lengthText?.simpleText || '';
            const durationSec = parseYouTubeDurationSec(duration);
            if (!title || durationSec < 120) continue;
            if (/\b(tiktok|roblox|minecraft|fortnite|fifa 2[0-9]|fc 2[456]|gameplay)\b/i.test(title)) {
              continue;
            }
            const normVid = normalizeTitleForMatch(title);
            const matchedTokens = progTokens.filter((tok) => normVid.includes(tok));
            if (progTokens.length >= 2 && matchedTokens.length === 0) {
              continue;
            }

            seen.add(vr.videoId);
            const channel =
              vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube';
            out.push({
              id: `yt-${vr.videoId}`,
              source: 'youtube',
              videoId: vr.videoId,
              title,
              channel,
              duration: duration || 'HD',
              durationSec,
              thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
              quality: '1080p HD',
            });
          }
        }
      } catch {
        // skip malformed payload
      }
    }

    out.sort((a, b) => {
      const aOfficial = /movistar|dazn|vamos|laliga|champions|f1|motogp|ufc|nba|euroliga/i.test(
        a.channel
      )
        ? 1
        : 0;
      const bOfficial = /movistar|dazn|vamos|laliga|champions|f1|motogp|ufc|nba|euroliga/i.test(
        b.channel
      )
        ? 1
        : 0;
      if (aOfficial !== bOfficial) return bOfficial - aOfficial;
      const aFull = a.durationSec >= 720 ? 1 : 0;
      const bFull = b.durationSec >= 720 ? 1 : 0;
      if (aFull !== bFull) return bFull - aFull;
      return b.durationSec - a.durationSec;
    });

    return out.slice(0, limit);
  } catch {
    return [];
  }
}

async function searchDailymotionSportsPrograms(
  queries: string[],
  programTitle: string,
  limit = 16
): Promise<MovistarDaznPlayableEpisode[]> {
  try {
    const dmHeaders = { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' };
    const responses = await Promise.all(
      queries.map((q) =>
        curlGetText(
          `https://api.dailymotion.com/videos?search=${encodeURIComponent(
            q
          )}&fields=id,title,duration,thumbnail_720_url,owner.screenname&limit=40`,
          dmHeaders,
          4,
          true,
          true
        ).catch(() => ({ text: '' }))
      )
    );

    const cleanTopic = programTitle.replace(/\b(m\+|dazn|res[uú]menes)\b/gi, ' ').trim();
    const progTokens = normalizeTitleForMatch(cleanTopic || programTitle)
      .split(' ')
      .filter((w) => w.length >= 3);
    const seen = new Set<string>();
    const candidates: any[] = [];

    for (const res of responses) {
      if (!res.text) continue;
      try {
        const data = JSON.parse(res.text);
        const list: any[] = Array.isArray(data?.list) ? data.list : [];
        for (const item of list) {
          const id = String(item?.id || '').trim();
          const dur = Number(item?.duration || 0);
          const title = String(item?.title || '');
          if (!id || seen.has(id) || dur < 180 || dur > 14400) continue;
          const normVid = normalizeTitleForMatch(title);
          if (progTokens.length > 0 && !progTokens.some((tok) => normVid.includes(tok))) {
            continue;
          }
          seen.add(id);
          candidates.push(item);
        }
      } catch {
        // ignore invalid json
      }
    }

    candidates.sort((a, b) => Number(b.duration || 0) - Number(a.duration || 0));

    return candidates.slice(0, limit).map((item) => ({
      id: `dm-${item.id}`,
      source: 'dailymotion' as const,
      videoId: String(item.id),
      title: String(item.title || programTitle),
      channel: String(item['owner.screenname'] || 'Dailymotion HD'),
      duration: formatDurationSec(Number(item.duration || 0)),
      durationSec: Number(item.duration || 0),
      thumbnail: String(item.thumbnail_720_url || ''),
      quality: 'HLS 1080p',
    }));
  } catch {
    return [];
  }
}

async function resolveQuickProgramThumb(seed: CuratedProgramSeed): Promise<string> {
  const cached = programThumbsCache.get(seed.programId);
  if (cached !== undefined) return cached;

  try {
    const q = seed.ytQueries[0] || seed.title;
    const html = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
      {
        headers: { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' },
        signal: AbortSignal.timeout(3200),
      }
    )
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '');
    const m = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    const thumb = m?.[1] ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : '';
    programThumbsCache.set(seed.programId, thumb);
    return thumb;
  } catch {
    programThumbsCache.set(seed.programId, '');
    return '';
  }
}

export async function getMovistarDaznHome(): Promise<{
  liveChannels: MovistarDaznLiveChannelItem[];
  liveMatches: MovistarDaznLiveMatchSummary[];
  catalog: MovistarDaznCatalogEntry[];
  updatedAt: number;
}> {
  const now = Date.now();
  const cached = homeCache.get('home');
  if (cached && now - cached.ts < HOME_CACHE_TTL_MS) {
    return {
      liveChannels: cached.liveChannels,
      liveMatches: cached.liveMatches,
      catalog: cached.catalog,
      updatedAt: cached.ts,
    };
  }

  const targetDefs = SPANISH_TDT_CHANNELS.filter(
    (ch) => ch.category === 'movistar' || ch.category === 'dazn'
  );

  const [epgStore, boardRes, tmdbSeries, programThumbs] = await Promise.all([
    loadSpanishEpgSchedule().catch(() => new Map()),
    getFootballBoardMatches({ lang: 'ES' }).catch(() => ({ matches: [] as any[] })),
    fetchTmdbItemsByIds(MOVISTAR_SERIES_TMDB_IDS, 'tv', 'es-ES').catch(() => []),
    Promise.all(CURATED_PROGRAMS.map((seed) => resolveQuickProgramThumb(seed))),
  ]);

  const liveChannels: MovistarDaznLiveChannelItem[] = targetDefs.map((tdt) => {
    const operator: 'movistar' | 'dazn' = tdt.category === 'dazn' ? 'dazn' : 'movistar';
    const events: any[] = epgStore.get(tdt.id) || [];
    const activeEv = events.find((e) => e.startMs <= now && e.stopMs > now) || events[0] || null;
    const nextEv = activeEv ? events.find((e) => e.startMs >= activeEv.stopMs) || null : null;

    let progressPct = 0;
    if (activeEv && activeEv.stopMs > activeEv.startMs) {
      progressPct = Math.max(
        6,
        Math.min(
          98,
          Math.round(((now - activeEv.startMs) / (activeEv.stopMs - activeEv.startMs)) * 100)
        )
      );
    }

    return {
      id: tdt.id,
      tdtId: tdt.id,
      dial: tdt.dial,
      name: tdt.name,
      shortMark: tdt.shortMark,
      operator,
      brandTone: operator === 'dazn' ? '#D4FF00' : '#00A9E0',
      logoUrl: resolveOfficialChannelLogoUrl({ id: tdt.id }) || '',
      nowTitle: activeEv?.title || tdt.description,
      nextTitle: nextEv?.title || '',
      description: activeEv?.description || tdt.description,
      startLabel: activeEv ? formatMadridHHMM(activeEv.startMs) : '',
      stopLabel: activeEv ? formatMadridHHMM(activeEv.stopMs) : '',
      progressPct,
      isLiveSport: Boolean(activeEv?.isLiveSport || tdt.category === 'dazn'),
      programArtwork: String(activeEv?.icon || '').trim(),
      signalCount: tdt.channels.length,
      tdtChannel: tdt,
    };
  });

  // Sort live channels so flagship dials come first inside their groups
  const PRIORITY_CHANNEL_ORDER = [
    'dazn-laliga',
    'mplus-laliga',
    'mplus-champions',
    'dazn-f1',
    'mplus-canal',
    'mplus-vamos',
    'dazn-1',
    'mplus-deportes',
    'dazn-2',
    'mplus-hypermotion',
    'dazn-3',
    'dazn-4',
    'dazn-combat',
    'mplus-deportes2',
    'mplus-golf',
    'mplus-eurosport1',
    'mplus-eurosport2',
  ];
  liveChannels.sort((a, b) => {
    const ia = PRIORITY_CHANNEL_ORDER.indexOf(a.id);
    const ib = PRIORITY_CHANNEL_ORDER.indexOf(b.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.dial - b.dial;
  });

  // Extract top live/today broadcast matches mapped to DAZN & Movistar+
  const rawMatches: any[] = Array.isArray(boardRes?.matches) ? boardRes.matches : [];
  const relevantMatches = rawMatches
    .filter((m) => {
      if (!m || !Array.isArray(m.channels) || m.channels.length === 0) return false;
      const broadcasterStr = String(
        m.spanishBroadcaster?.label ||
          m.verifiedTvGuide?.summary ||
          m.channels.map((c: any) => c.label).join(' ')
      );
      return (
        /dazn|movistar|m\+|laliga|campeones|vamos|hypermotion/i.test(broadcasterStr) ||
        /esp\.|champions|premier|uefa/i.test(String(m.leagueSlug || ''))
      );
    })
    .slice(0, 8);

  const liveMatches: MovistarDaznLiveMatchSummary[] = relevantMatches.map((m) => {
    const bLabel =
      String(m.spanishBroadcaster?.label || '').trim() ||
      String(
        m.channels.find((c: any) => /dazn|movistar|m\+/i.test(String(c.label || '')))?.label ||
          m.channels[0]?.label ||
          'DAZN · Movistar+'
      );
    const isDazn = /dazn/i.test(bLabel);
    const isMovistar = /movistar|m\+|campeones|vamos|laliga tv/i.test(bLabel);
    const operator: MovistarDaznOperator =
      isDazn && isMovistar ? 'both' : isDazn ? 'dazn' : 'movistar';

    return {
      id: String(m.id || `md-match-${m.homeTeam}-${m.awayTeam}`),
      title: `${m.homeTeam} vs ${m.awayTeam}`,
      competition: String(m.leagueName || 'Fútbol HD'),
      sport: 'soccer',
      time: String(m.kickoffTime || 'Directo'),
      isLive: m.statusState === 'live',
      broadcaster: bLabel,
      operator,
      channels: m.channels,
      matchMeta: {
        eventId: m.eventId,
        fotmobMatchId: m.fotmobMatchId,
        leagueSlug: m.leagueSlug,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeShort: m.homeShort,
        awayShort: m.awayShort,
        homeLogo: m.homeLogo,
        awayLogo: m.awayLogo,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        statusState: m.statusState,
        statusLabel: m.statusLabel,
      },
    };
  });

  const programEntries: MovistarDaznCatalogEntry[] = CURATED_PROGRAMS.map((seed, idx) => ({
    id: `md-prog-${seed.programId}`,
    programId: seed.programId,
    title: seed.title,
    operator: seed.operator,
    channelId: seed.channelId,
    channelName: seed.channelName,
    category: seed.category,
    kind: 'program',
    genre: seed.genre,
    description: seed.description,
    claim: seed.claim,
    imageUrl: programThumbs[idx] || '',
    themeKey: seed.themeKey,
    featured: seed.featured,
    liveTdtId: seed.liveTdtId,
  }));

  const seriesEntries: MovistarDaznCatalogEntry[] = tmdbSeries.map((tm: any) => {
    const name = String(tm?.name || tm?.original_name || '').trim();
    const img = tm?.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${tm.backdrop_path}`
      : tm?.poster_path
      ? `https://image.tmdb.org/t/p/w780${tm.poster_path}`
      : '';
    return {
      id: `md-tmdb-${tm.id}`,
      programId: `tmdb-${tm.id}`,
      title: name,
      operator: 'movistar',
      channelId: 'mplus-canal',
      channelName: 'Movistar Plus+ Original',
      category: 'series',
      kind: 'series',
      genre: tm?.genres?.[0]?.name || 'Serie Original M+',
      description: String(tm?.overview || '').trim() || `${name} completa en Castellano HD.`,
      claim: 'Temporadas completas en Castellano',
      imageUrl: img,
      themeKey: 'cinema',
      tmdbId: Number(tm.id),
      liveTdtId: 'mplus-canal',
    };
  });

  const catalog = [...programEntries, ...seriesEntries];
  homeCache.set('home', { liveChannels, liveMatches, catalog, ts: now });

  return {
    liveChannels,
    liveMatches,
    catalog,
    updatedAt: now,
  };
}

export async function getMovistarDaznProgramDetail(
  programId: string,
  titleHint = ''
): Promise<{
  program: MovistarDaznCatalogEntry | null;
  playablePrograms: MovistarDaznPlayableEpisode[];
  relatedChannel: MovistarDaznLiveChannelItem | null;
}> {
  const cleanId = String(programId || '').trim();
  const cacheKey = `${cleanId}|${normalizeTitleForMatch(titleHint)}`;
  const cached = programDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 8 * 60 * 1000) {
    return cached.data;
  }

  const seed = CURATED_PROGRAMS.find((p) => p.programId === cleanId) || null;
  const home = await getMovistarDaznHome().catch(() => null);
  const program =
    home?.catalog.find((c) => c.programId === cleanId) ||
    (seed
      ? {
          id: `md-prog-${seed.programId}`,
          programId: seed.programId,
          title: seed.title,
          operator: seed.operator,
          channelId: seed.channelId,
          channelName: seed.channelName,
          category: seed.category,
          kind: 'program' as const,
          genre: seed.genre,
          description: seed.description,
          claim: seed.claim,
          imageUrl: '',
          themeKey: seed.themeKey,
          liveTdtId: seed.liveTdtId,
        }
      : titleHint
      ? {
          id: `md-custom-${cleanId}`,
          programId: cleanId,
          title: titleHint,
          operator: 'both' as const,
          channelId: 'mplus-canal',
          channelName: 'DAZN · Movistar+',
          category: 'deportes' as const,
          kind: 'program' as const,
          genre: 'Programa Deportivo',
          description: `${titleHint} en DAZN & Movistar+.`,
          imageUrl: '',
          themeKey: 'stadium' as const,
        }
      : null);

  const resolvedTitle = program?.title || titleHint || 'Movistar Plus+ DAZN';
  const ytQueries = seed?.ytQueries || [`${resolvedTitle} completo`, `${resolvedTitle} Movistar DAZN`];
  const dmQueries = seed?.dmQueries || [resolvedTitle];

  const [ytResults, dmResults] = await Promise.all([
    searchYouTubeSportsPrograms(ytQueries, resolvedTitle, 42),
    searchDailymotionSportsPrograms(dmQueries, resolvedTitle, 14),
  ]);

  const checkedDm = (
    await Promise.all(
      dmResults.slice(0, 12).map(async (item) => {
        const m3u = await resolveDailymotionVideoToM3u8(item.videoId).catch(() => null);
        return m3u ? item : null;
      })
    )
  ).filter((x): x is MovistarDaznPlayableEpisode => Boolean(x));

  const relatedChannel =
    home?.liveChannels.find(
      (c) => c.id === (seed?.liveTdtId || program?.liveTdtId || program?.channelId)
    ) || null;

  const payload = {
    program,
    playablePrograms: [...checkedDm, ...ytResults],
    relatedChannel,
  };
  programDetailCache.set(cacheKey, { data: payload, ts: Date.now() });
  return payload;
}

export async function resolveMovistarDaznPlayVideo(opts: {
  source?: string;
  id?: string;
  programTitle?: string;
  episodeTitle?: string;
}): Promise<{
  success: boolean;
  mode?: 'hls' | 'youtube';
  streamUrl?: string;
  rawStreamUrl?: string;
  title?: string;
  subtitle?: string;
  thumbnail?: string;
  error?: string;
}> {
  const source = String(opts.source || '').trim().toLowerCase();
  const id = String(opts.id || '').trim();
  const programTitle = String(opts.programTitle || '').trim();
  const episodeTitle = String(opts.episodeTitle || '').trim();
  const fullTitle =
    programTitle && episodeTitle
      ? `${programTitle} · ${episodeTitle}`
      : episodeTitle || programTitle || 'DAZN & Movistar+';

  const cacheKey = `${source}|${id}|${normalizeTitleForMatch(fullTitle)}`;
  const cached = playResolveCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 8 * 60 * 1000) {
    return cached.data;
  }

  if (source === 'dailymotion' && id) {
    const m3uUrl = await resolveDailymotionVideoToM3u8(id);
    if (m3uUrl) {
      const payload = {
        success: true,
        mode: 'hls' as const,
        streamUrl: buildHlsProxyUrl(m3uUrl, 'https://www.dailymotion.com/'),
        rawStreamUrl: m3uUrl,
        title: fullTitle,
        subtitle: 'DAZN · Movistar+ · HLS 1080p',
      };
      playResolveCache.set(cacheKey, { data: payload, ts: Date.now() });
      return payload;
    }
  }

  if (source === 'youtube' && id) {
    const payload = {
      success: true,
      mode: 'youtube' as const,
      streamUrl: id,
      rawStreamUrl: `https://www.youtube.com/watch?v=${id}`,
      title: fullTitle,
      subtitle: 'DAZN · Movistar+ · YouTube HD',
    };
    playResolveCache.set(cacheKey, { data: payload, ts: Date.now() });
    return payload;
  }

  return {
    success: false,
    error: `No pudimos conectar con el vídeo "${fullTitle}". Prueba otra emisión.`,
  };
}
