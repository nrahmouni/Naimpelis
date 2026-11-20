import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  curlGetText,
  normalizeTitleForMatch,
} from '../extractors/httpHelpers.ts';
import { resolveDailymotionVideoToM3u8 } from '../extractors/dailymotionExtractor.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import { loadSpanishEpgSchedule } from './epgService.ts';
import { fetchTmdbItemsByIds, resolveTmdbIdByTitle } from './tmdbCatalogHelpers.ts';
import { resolveOfficialChannelLogoUrl } from '../../src/shared/channelLogos.ts';

export type AtresmediaCategory =
  | 'all'
  | 'concursos'
  | 'entretenimiento'
  | 'series'
  | 'actualidad';

export interface AtresmediaLiveChannelItem {
  id: string;
  tdtId: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  logoUrl: string;
  nowTitle: string;
  nextTitle: string;
  description: string;
  startLabel: string;
  stopLabel: string;
  progressPct: number;
  programArtwork: string;
  showLogoUrl: string;
  formatId?: string;
  tdtChannel: (typeof SPANISH_TDT_CHANNELS)[number];
}

export interface AtresmediaCatalogEntry {
  id: string;
  formatId: string;
  title: string;
  channelId: string;
  channelName: string;
  category: Exclude<AtresmediaCategory, 'all'>;
  kind: 'program' | 'series';
  genre: string;
  description: string;
  claim?: string;
  imageUrl: string;
  logoUrl?: string;
  tmdbId?: number;
  featured?: boolean;
}

export interface AtresmediaPlayableEpisode {
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

export interface AtresmediaOfficialEpisode {
  id: string;
  title: string;
  subTitle: string;
  description: string;
  thumbnail: string;
  visibility: string;
  url: string;
}

const ATRESPLAYER_CHANNEL_MAP: Record<
  string,
  { tdtId: string; name: string; color: string }
> = {
  '5a6a165a7ed1a834493ebf6a': { tdtId: 'tdt-antena3', name: 'Antena 3', color: '#FF5E1A' },
  '5a6a172c7ed1a834493ebf6b': { tdtId: 'tdt-lasexta', name: 'laSexta', color: '#16A34A' },
  '5a6a183f7ed1a834493ebf6c': { tdtId: 'tdt-neox', name: 'Neox', color: '#F59E0B' },
  '5a6a18977ed1a834493ebf6d': { tdtId: 'tdt-nova', name: 'Nova', color: '#EC4899' },
  '5a6a18f37ed1a834493ebf6e': { tdtId: 'tdt-mega', name: 'Mega', color: '#DC2626' },
  '5a6a194a7ed1a834493ebf6f': { tdtId: 'tdt-atreseries', name: 'Atreseries', color: '#E11D48' },
};

const ATRESMEDIA_TDT_IDS = [
  'tdt-antena3',
  'tdt-lasexta',
  'tdt-neox',
  'tdt-nova',
  'tdt-mega',
  'tdt-atreseries',
];

// Curated TMDB IDs for iconic Atresmedia series so episodes resolve cleanly in Castellano HD
const KNOWN_SERIES_TMDB_IDS: Record<string, number> = {
  'la casa de papel': 71446,
  'vis a vis': 62455,
  'aqui no hay quien viva': 4236,
  'fisica o quimica': 3180,
  'los hombres de paco': 12361,
  'el internado': 10203,
  'el barco': 38534,
  velvet: 61139,
  'velvet coleccion': 73913,
  'gran hotel': 44260,
  'suenos de libertad': 244140,
  'entre tierras': 234806,
  veneno: 97886,
  farina: 77581,
  'la cocinera de castamar': 116818,
  'cristo y rey': 209386,
  alba: 121325,
  'mar de plastico': 64014,
  'la valla': 97048,
  'un paso adelante': 11393,
  'amar es para siempre': 46950,
  'el secreto de puente viejo': 40504,
  'la catedral del mar': 77681,
  cardenal: 69788,
  perdida: 96993,
  luimelia: 99749,
  'foq la nueva generacion': 279207,
  'a muerte': 246141,
  'eva y nicole': 244572,
  'santuario': 241898,
};

// High-priority curated Atresmedia showcase programs & series guaranteed to appear
const CURATED_PINNED_PROGRAMS: Omit<AtresmediaCatalogEntry, 'id'>[] = [
  {
    formatId: '5a789465986b28066d9ce148',
    title: 'Pasapalabra',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3',
    category: 'concursos',
    kind: 'program',
    genre: 'Concurso · El Rosco',
    description:
      'Presentado por Roberto Leal, dos concursantes compiten cada tarde superando pruebas lingüísticas hasta enfrentarse al mítico Rosco final.',
    claim: 'Programas diarios y mejores Roscos',
    imageUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages02/2023/07/03/F28A8A5D-C3CC-422E-BE0A-A96ABEC75797/1280x720.jpg',
    logoUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages02/2023/07/03/DCB795B6-7B08-479A-9EA7-811A0861EA74.png',
    featured: true,
  },
  {
    formatId: '5a7875d5986b28066d9cdd9e',
    title: 'El Hormiguero',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3',
    category: 'entretenimiento',
    kind: 'program',
    genre: 'Talk show · Entrevistas',
    description:
      'Presentado por Pablo Motos junto a Trancas y Barrancas. Entrevistas, humor, ciencia y los invitados más destacados de cada noche.',
    claim: 'El programa líder de la noche',
    imageUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages02/2026/09/03/FC47A62F-1E07-42CF-9E69-1DB519E7D414/1280x720.jpg',
    logoUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages02/2023/06/06/8F5C253E-805D-4389-8F0E-BBE7FF8298B3.png',
    featured: true,
  },
  {
    formatId: '5b2a1ea77ed1a8d4dff91a40',
    title: 'La Voz',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3',
    category: 'concursos',
    kind: 'program',
    genre: 'Talent show musical',
    description:
      'Audiciones a ciegas, batallas y galas en directo con Eva González y los grandes coaches musicales del panorama nacional e internacional.',
    claim: 'Audiciones, Batallas y Directos',
    imageUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages01/2026/07/31/B7386DE3-F5B6-4C03-814E-2F5406BDE0FE/1280x720.jpg',
    logoUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages02/2023/06/06/6C7B663A-2E7B-4A46-BE71-810E327FCFB1.png',
    featured: true,
  },
  {
    formatId: '5a78772b986b28066d9cdeab',
    title: 'La Ruleta de la Suerte',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3',
    category: 'concursos',
    kind: 'program',
    genre: 'Concurso familiar',
    description:
      'Jorge Fernández y Laura Moure conducen los paneles, la música en directo y los premios de cada mediodía en Antena 3.',
    imageUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages01/2023/07/04/4B3B962A-34EB-43E1-B65A-E3CE11D9A02F/1280x720.jpg',
    featured: true,
  },
  {
    formatId: '5a787611986b28066d9cde66',
    title: 'Equipo de Investigación',
    channelId: '5a6a172c7ed1a834493ebf6b',
    channelName: 'laSexta',
    category: 'actualidad',
    kind: 'program',
    genre: 'Reportajes · Periodismo',
    description:
      'Gloria Serra analiza a fondo los casos de actualidad, investigaciones policiales y tramas sociales en reportajes completos.',
    imageUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages02/2026/09/07/EFD7CD04-405C-44F7-A376-9DF422E52F3F/1280x720.jpg',
    logoUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages01/2023/07/03/62555AD0-260F-4DF3-8CE5-6143E73A3672.png',
    featured: true,
  },
  {
    formatId: '5a78770b986b28066d9cde9f',
    title: 'Tu cara me suena',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3',
    category: 'concursos',
    kind: 'program',
    genre: 'Talent musical · Humor',
    description:
      'Manel Fuentes al frente del gran espectáculo de imitaciones musicales donde celebridades se transforman en iconos de la música.',
    imageUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages01/2024/03/21/6A7CD06C-4C3A-47F5-89A8-DA95B698AD53/1280x720.jpg',
  },
  {
    formatId: '65bf92b0e91e523ec3e8104b',
    title: 'Sueños de libertad',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3',
    category: 'series',
    kind: 'series',
    genre: 'Drama · Serie diaria',
    description:
      'Ambientada en la España de 1958, Begoña Montes lucha por su libertad y la verdad en el seno de la poderosa familia De la Reina.',
    imageUrl: '',
    tmdbId: 244140,
    featured: true,
  },
  {
    formatId: '5a6a1f367ed1a834493ec005',
    title: 'La casa de papel',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3',
    category: 'series',
    kind: 'series',
    genre: 'Thriller · Atracos',
    description:
      'El Profesor recluta a ocho atracadores para ejecutar el mayor asalto de la historia en la Fábrica Nacional de Moneda y Timbre.',
    imageUrl: '',
    tmdbId: 71446,
    featured: true,
  },
  {
    formatId: '5a7873f8986b28066d9cdd12',
    title: 'Aquí no hay quien viva',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3 · Neox',
    category: 'series',
    kind: 'series',
    genre: 'Comedia clásica',
    description:
      'La mítica comunidad de vecinos de Desengaño 21 en su versión completa remasterizada en Castellano HD.',
    imageUrl: '',
    tmdbId: 4236,
  },
  {
    formatId: '5a787478986b28066d9cdd3d',
    title: 'El Intermedio',
    channelId: '5a6a172c7ed1a834493ebf6b',
    channelName: 'laSexta',
    category: 'actualidad',
    kind: 'program',
    genre: 'Sátira · Actualidad',
    description:
      'El Gran Wyoming y Sandra Sabatés repasan cada noche la actualidad política y social con humor mordaz en laSexta.',
    imageUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages02/2023/09/04/1F2483E9-4F03-4B01-9EC1-1D2C5105B00D/1280x720.jpg',
  },
  {
    formatId: '5a7874d8986b28066d9cdd5e',
    title: 'El Chiringuito de Jugones',
    channelId: '5a6a18f37ed1a834493ebf6e',
    channelName: 'Mega',
    category: 'entretenimiento',
    kind: 'program',
    genre: 'Deportes · Tertulia',
    description:
      'Josep Pedrerol y su equipo debaten toda la actualidad de LaLiga, Champions League y el mercado de fichajes cada madrugada.',
    imageUrl:
      'https://imagenes.atresplayer.com/atp/clipping/cmsimages02/2023/08/16/090CE57D-84CD-49DF-A5DA-653ED38748B7/1280x720.jpg',
  },
  {
    formatId: '5a7873a1986b28066d9cdcf5',
    title: 'Vis a vis',
    channelId: '5a6a165a7ed1a834493ebf6a',
    channelName: 'Antena 3 · Atreseries',
    category: 'series',
    kind: 'series',
    genre: 'Thriller carcelario',
    description:
      'Macarena Ferreiro ingresa en prisión engañada por su jefe y deberá sobrevivir en la cárcel de Cruz del Sur.',
    imageUrl: '',
    tmdbId: 62455,
  },
];

const homeCache = new LruTtlCache<string, { data: any; ts: number }>(4, 4 * 60 * 1000);
const programDetailCache = new LruTtlCache<string, { data: any; ts: number }>(
  80,
  8 * 60 * 1000
);
const playResolveCache = new LruTtlCache<string, { data: any; ts: number }>(120, 10 * 60 * 1000);

function toAtresImageUrl(imageObj: any, fallbackUrl = ''): string {
  const base =
    imageObj?.images?.HORIZONTAL?.path ||
    imageObj?.pathHorizontal ||
    imageObj?.images?.HORIZONTAL_CLEAN?.path ||
    imageObj?.images?.HORIZONTAL_CLEAN_LEFT_MARGIN?.path ||
    imageObj?.pathVertical ||
    '';
  if (!base) return fallbackUrl;
  const clean = String(base).trim();
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(clean)) return clean;
  return `${clean.replace(/\/+$/, '')}/1280x720.jpg`;
}

async function fetchJsonFast<T>(url: string, timeoutMs = 4500): Promise<T | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': CHROME_UA,
        Accept: 'application/json',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.ok) {
      return (await resp.json()) as T;
    }
  } catch {
    // fallback to curl
  }
  try {
    const res = await curlGetText(url, { 'User-Agent': CHROME_UA }, 5, true, true);
    if (res.text && res.text.trim().startsWith('{')) {
      return JSON.parse(res.text) as T;
    }
  } catch {
    // ignore
  }
  return null;
}

function classifyAtresCategory(
  apiCategory: string,
  genre: string,
  title: string
): Exclude<AtresmediaCategory, 'all'> {
  const joined = `${apiCategory} ${genre} ${title}`.toLowerCase();
  if (
    /pasapalabra|ruleta|voz|cara me suena|mask singer|millonario|atrapa|desaf[ií]o|concurso|talent|1%|boom/i.test(
      joined
    )
  ) {
    return 'concursos';
  }
  if (
    /serie|novela|telenovela|ficci[oó]n|libertad|tierras|papel|vis a vis|internado|barco|velvet|quimica|viva|paco|castamar|veneno/i.test(
      joined
    ) ||
    /series|telenovelas/i.test(apiCategory)
  ) {
    return 'series';
  }
  if (
    /investigaci[oó]n|rojo vivo|intermedio|salvados|[eé]vole|xplica|columna|espejo|vale tarde|noticias|debate|documental|reportaje|actualidad|informativo/i.test(
      joined
    )
  ) {
    return 'actualidad';
  }
  return 'entretenimiento';
}

function lookupKnownSeriesTmdbId(title: string): number | undefined {
  const norm = normalizeTitleForMatch(title);
  if (!norm) return undefined;
  if (KNOWN_SERIES_TMDB_IDS[norm]) return KNOWN_SERIES_TMDB_IDS[norm];
  for (const [k, v] of Object.entries(KNOWN_SERIES_TMDB_IDS)) {
    if (norm.includes(k) || k.includes(norm)) return v;
  }
  return undefined;
}

function formatClockEs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  try {
    return new Date(ms).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Madrid',
    });
  } catch {
    return '';
  }
}

function mapApiFormatRow(
  row: any,
  defaultKind: 'program' | 'series'
): AtresmediaCatalogEntry | null {
  const formatId = String(row?.formatId || row?.contentId || '').trim();
  const title = String(row?.title || '').trim();
  if (!formatId || !title) return null;

  const chId = String(row?.mainChannel || '5a6a165a7ed1a834493ebf6a');
  const chMeta = ATRESPLAYER_CHANNEL_MAP[chId] || {
    tdtId: 'tdt-antena3',
    name: 'Atresmedia',
    color: '#FF5E1A',
  };
  const apiCat = String(row?.category || '');
  const genre = String(row?.genre || apiCat || 'Atresmedia').trim();
  const category = classifyAtresCategory(apiCat, genre, title);
  const kind: 'program' | 'series' =
    category === 'series' || defaultKind === 'series' ? 'series' : 'program';
  const imageUrl = toAtresImageUrl(row?.image);
  if (!imageUrl) return null;

  const tmdbId = kind === 'series' ? lookupKnownSeriesTmdbId(title) : undefined;
  return {
    id: `a3-${formatId}`,
    formatId,
    title,
    channelId: chId,
    channelName: chMeta.name,
    category,
    kind,
    genre,
    description: String(row?.description || '').trim() || `${title} en ${chMeta.name}.`,
    claim: row?.claim ? String(row.claim).trim() : undefined,
    imageUrl,
    logoUrl: row?.logoURL ? String(row.logoURL) : undefined,
    tmdbId,
  };
}

export async function getAtresmediaHome(): Promise<{
  liveChannels: AtresmediaLiveChannelItem[];
  catalog: AtresmediaCatalogEntry[];
  updatedAt: number;
}> {
  const cached = homeCache.get('home');
  const now = Date.now();

  // Always refresh live guide quickly (EPG cache is already memory-backed)
  const [liveApi, epgStore] = await Promise.all([
    fetchJsonFast<{ itemRows?: any[] }>('https://api.atresplayer.com/client/v1/row/live', 3500),
    loadSpanishEpgSchedule().catch(() => new Map<string, any[]>()),
  ]);

  const liveByTdtId = new Map<string, any>();
  for (const row of liveApi?.itemRows || []) {
    const chId = String(row?.mainChannel || row?.contentId || '').trim();
    const mapped = ATRESPLAYER_CHANNEL_MAP[chId];
    if (mapped) {
      liveByTdtId.set(mapped.tdtId, row);
    }
  }

  const liveChannels: AtresmediaLiveChannelItem[] = ATRESMEDIA_TDT_IDS.map((tdtId) => {
    const tdtCh = SPANISH_TDT_CHANNELS.find((c) => c.id === tdtId)!;
    const apiLive = liveByTdtId.get(tdtId);
    const events: any[] = epgStore.get(tdtId) || [];
    let nowIdx = events.findIndex((e) => e.startMs <= now && e.stopMs > now);
    if (nowIdx === -1) {
      nowIdx = events.findIndex((e) => e.startMs > now);
      if (nowIdx > 0) nowIdx = nowIdx - 1;
    }
    const activeEv =
      nowIdx >= 0 && events[nowIdx] && events[nowIdx].stopMs > now ? events[nowIdx] : null;
    const nextIdx = activeEv ? nowIdx + 1 : events.findIndex((e) => e.startMs > now);
    const nextEv = nextIdx >= 0 && nextIdx < events.length ? events[nextIdx] : null;

    const startMs = Number(apiLive?.startTime || activeEv?.startMs || 0);
    const stopMs = Number(apiLive?.endTime || activeEv?.stopMs || 0);
    let progressPct = 0;
    if (startMs > 0 && stopMs > startMs && now >= startMs && now <= stopMs) {
      progressPct = Math.round(((now - startMs) / (stopMs - startMs)) * 100);
    }

    return {
      id: `live-${tdtId}`,
      tdtId,
      dial: tdtCh.dial,
      name: tdtCh.name,
      shortMark: tdtCh.shortMark,
      brandTone: tdtCh.brandTone,
      logoUrl: tdtCh.logoUrl || resolveOfficialChannelLogoUrl(tdtCh) || '',
      nowTitle: String(apiLive?.title || activeEv?.title || `${tdtCh.name} en directo`),
      nextTitle: String(apiLive?.nextProgram || nextEv?.title || ''),
      description: String(apiLive?.description || activeEv?.description || tdtCh.description),
      startLabel: formatClockEs(startMs),
      stopLabel: formatClockEs(stopMs),
      progressPct: Math.max(0, Math.min(100, progressPct)),
      programArtwork: toAtresImageUrl(apiLive?.image),
      showLogoUrl: apiLive?.logoURL ? String(apiLive.logoURL) : '',
      formatId: apiLive?.formatId ? String(apiLive.formatId) : undefined,
      tdtChannel: {
        ...tdtCh,
        logoUrl: tdtCh.logoUrl || resolveOfficialChannelLogoUrl(tdtCh) || undefined,
      },
    };
  });

  if (cached && now - cached.ts < 4 * 60 * 1000) {
    return {
      liveChannels,
      catalog: cached.data,
      updatedAt: now,
    };
  }

  // Fetch official Atresplayer categories & real TMDB artwork for flagship series concurrently
  const BASE_SEARCH =
    'https://api.atresplayer.com/client/v1/row/search?entityType=ATPFormat&sectionCategory=true&mainChannelId=5a6b32667ed1a834493ec03b&defaultSortType=THE_MOST';
  const [programsRes, programsPage2, seriesRes, telenovelasRes, docsRes, tmdbSeries] =
    await Promise.all([
      fetchJsonFast<{ itemRows?: any[] }>(
        `${BASE_SEARCH}&categoryId=5a6a1ba0986b281d18a512b9&page=0&size=36`,
        4500
      ),
      fetchJsonFast<{ itemRows?: any[] }>(
        `${BASE_SEARCH}&categoryId=5a6a1ba0986b281d18a512b9&page=1&size=24`,
        4500
      ),
      fetchJsonFast<{ itemRows?: any[] }>(
        `${BASE_SEARCH}&categoryId=5a6a1b22986b281d18a512b8&page=0&size=28`,
        4500
      ),
      fetchJsonFast<{ itemRows?: any[] }>(
        `${BASE_SEARCH}&categoryId=5a6a2313986b281d18a512be&page=0&size=14`,
        4500
      ),
      fetchJsonFast<{ itemRows?: any[] }>(
        `${BASE_SEARCH}&categoryId=5b067bf3986b28b0a27c2f42&page=0&size=12`,
        4500
      ),
      fetchTmdbItemsByIds(
        [244140, 71446, 4236, 62455, 3180, 12361, 10203, 38534, 61139, 44260, 234806, 97886],
        'tv',
        'es-ES'
      ).catch(() => []),
    ]);

  const tmdbById = new Map<number, any>();
  for (const s of tmdbSeries) {
    if (s?.id) tmdbById.set(Number(s.id), s);
  }

  const byNormTitle = new Map<string, AtresmediaCatalogEntry>();

  const upsertEntry = (entry: AtresmediaCatalogEntry, preferIncoming = false) => {
    const key = normalizeTitleForMatch(entry.title);
    if (!key) return;
    const existing = byNormTitle.get(key);
    if (!existing) {
      byNormTitle.set(key, entry);
      return;
    }
    if (preferIncoming) {
      byNormTitle.set(key, {
        ...existing,
        ...entry,
        imageUrl: entry.imageUrl || existing.imageUrl,
        logoUrl: entry.logoUrl || existing.logoUrl,
        tmdbId: existing.tmdbId || entry.tmdbId,
        featured: existing.featured || entry.featured,
      });
    } else {
      byNormTitle.set(key, {
        ...entry,
        ...existing,
        imageUrl: existing.imageUrl || entry.imageUrl,
        logoUrl: existing.logoUrl || entry.logoUrl,
        tmdbId: existing.tmdbId || entry.tmdbId,
        featured: existing.featured || entry.featured,
      });
    }
  };

  // Seed pinned showcase entries first so Pasapalabra, El Hormiguero, La Voz, Ruleta, etc. lead the grid
  for (const pinned of CURATED_PINNED_PROGRAMS) {
    const tm = pinned.tmdbId ? tmdbById.get(pinned.tmdbId) : undefined;
    const tmdbBackdrop = tm?.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${tm.backdrop_path}`
      : tm?.poster_path
      ? `https://image.tmdb.org/t/p/w780${tm.poster_path}`
      : '';
    upsertEntry(
      {
        id: `a3-${pinned.formatId}`,
        ...pinned,
        imageUrl: pinned.imageUrl || tmdbBackdrop,
        description: pinned.description || tm?.overview || '',
      },
      true
    );
  }

  for (const row of [...(programsRes?.itemRows || []), ...(programsPage2?.itemRows || [])]) {
    const mapped = mapApiFormatRow(row, 'program');
    if (mapped) upsertEntry(mapped, true);
  }
  for (const row of [...(seriesRes?.itemRows || []), ...(telenovelasRes?.itemRows || [])]) {
    const mapped = mapApiFormatRow(row, 'series');
    if (mapped) upsertEntry(mapped, true);
  }
  for (const row of docsRes?.itemRows || []) {
    const mapped = mapApiFormatRow(row, 'program');
    if (mapped) upsertEntry(mapped, false);
  }

  // Ensure verified flagship Atresmedia TMDB series are always present with clean images
  for (const tm of tmdbSeries) {
    const name = String(tm?.name || tm?.original_name || '').trim();
    if (!name) continue;
    const img = tm?.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${tm.backdrop_path}`
      : tm?.poster_path
      ? `https://image.tmdb.org/t/p/w780${tm.poster_path}`
      : '';
    if (!img) continue;
    upsertEntry(
      {
        id: `a3-tmdb-${tm.id}`,
        formatId: `tmdb-${tm.id}`,
        title: name,
        channelId: '5a6a165a7ed1a834493ebf6a',
        channelName: 'Atresmedia Series',
        category: 'series',
        kind: 'series',
        genre: tm?.genres?.[0]?.name || 'Serie Atresmedia',
        description: String(tm?.overview || '').trim() || `${name} completa en Castellano HD.`,
        imageUrl: img,
        tmdbId: Number(tm.id),
      },
      false
    );
  }

  // Also ensure any live channel show is surfaced in the catalog with fresh artwork
  for (const live of liveChannels) {
    if (live.formatId && live.programArtwork) {
      const existingByFmt = Array.from(byNormTitle.values()).find(
        (x) => x.formatId === live.formatId
      );
      if (existingByFmt) {
        existingByFmt.imageUrl = live.programArtwork || existingByFmt.imageUrl;
      }
    }
  }

  const catalog = Array.from(byNormTitle.values()).filter((x) => Boolean(x.imageUrl));
  homeCache.set('home', { data: catalog, ts: now });

  return {
    liveChannels,
    catalog,
    updatedAt: now,
  };
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

async function searchYouTubePlayable(
  queries: string[],
  programTitle: string,
  limit = 48
): Promise<AtresmediaPlayableEpisode[]> {
  try {
    const normProg = normalizeTitleForMatch(programTitle);
    const progTokens = normProg.split(' ').filter((w) => w.length >= 3);

    const htmlList = await Promise.all(
      queries.map((q) =>
        fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`, {
          headers: {
            'User-Agent': CHROME_UA,
            'Accept-Language': 'es-ES,es;q=0.9',
          },
          signal: AbortSignal.timeout(5000),
        })
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => '')
      )
    );

    const out: AtresmediaPlayableEpisode[] = [];
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
            if (!title || durationSec < 180) continue;
            if (/\b(reacci[oó]n|reaction|tiktok|roblox|minecraft|tutorial)\b/i.test(title)) {
              continue;
            }
            const normVid = normalizeTitleForMatch(title);
            if (
              progTokens.length > 0 &&
              !progTokens.every((tok) => normVid.includes(tok)) &&
              !normVid.includes(normProg)
            ) {
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

    // Prioritize full programs (>= 15 min) first, keeping official Atresmedia channels boosted
    out.sort((a, b) => {
      const aFull = a.durationSec >= 900 ? 1 : 0;
      const bFull = b.durationSec >= 900 ? 1 : 0;
      if (aFull !== bFull) return bFull - aFull;
      const aOff = /antena 3|lasexta|atresmedia|pasapalabra|hormiguero|la voz|chiringuito/i.test(
        a.channel
      )
        ? 1
        : 0;
      const bOff = /antena 3|lasexta|atresmedia|pasapalabra|hormiguero|la voz|chiringuito/i.test(
        b.channel
      )
        ? 1
        : 0;
      if (aOff !== bOff) return bOff - aOff;
      return b.durationSec - a.durationSec;
    });

    return out.slice(0, limit);
  } catch {
    return [];
  }
}

async function searchDailymotionPlayable(
  queries: string[],
  programTitle: string,
  opts?: { limit?: number; extraUserIds?: string[] }
): Promise<AtresmediaPlayableEpisode[]> {
  try {
    const limit = opts?.limit ?? 48;
    const dmHeaders = { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' };
    const urls = [
      ...queries.map(
        (q) =>
          `https://api.dailymotion.com/videos?search=${encodeURIComponent(
            q
          )}&fields=id,title,duration,thumbnail_720_url,owner.screenname&limit=100`
      ),
      ...(opts?.extraUserIds || []).map(
        (uid) =>
          `https://api.dailymotion.com/user/${encodeURIComponent(
            uid
          )}/videos?fields=id,title,duration,thumbnail_720_url,owner.screenname&limit=100`
      ),
    ];

    const responses = await Promise.all(
      urls.map((u) => curlGetText(u, dmHeaders, 4, true, true).catch(() => ({ text: '' })))
    );

    const normProg = normalizeTitleForMatch(programTitle);
    const progTokens = normProg.split(' ').filter((w) => w.length >= 3);
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
          if (!id || seen.has(id) || dur < 600 || dur > 14400) continue;
          const normVid = normalizeTitleForMatch(title);
          if (
            progTokens.length > 0 &&
            !normVid.includes(normProg) &&
            !progTokens.every((tok) => normVid.includes(tok))
          ) {
            continue;
          }
          if (/\b(reacci[oó]n|promo|teaser)\b/i.test(title)) continue;
          seen.add(id);
          candidates.push(item);
        }
      } catch {
        // ignore invalid json
      }
    }

    // Put full-length broadcasts (>= 25m) ahead of shorter clips
    candidates.sort((a, b) => {
      const aFull = Number(a.duration || 0) >= 1500 ? 1 : 0;
      const bFull = Number(b.duration || 0) >= 1500 ? 1 : 0;
      if (aFull !== bFull) return bFull - aFull;
      return Number(b.duration || 0) - Number(a.duration || 0);
    });

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

export async function getAtresmediaProgramDetail(
  formatId: string,
  titleHint = ''
): Promise<{
  format: AtresmediaCatalogEntry | null;
  officialEpisodes: AtresmediaOfficialEpisode[];
  playablePrograms: AtresmediaPlayableEpisode[];
}> {
  const cleanFmtId = String(formatId || '').trim();
  const cacheKey = `${cleanFmtId}|${normalizeTitleForMatch(titleHint)}`;
  const cached = programDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 8 * 60 * 1000) {
    return cached.data;
  }

  const [formatPage, epsRes] = await Promise.all([
    cleanFmtId
      ? fetchJsonFast<any>(`https://api.atresplayer.com/client/v1/page/format/${cleanFmtId}`, 4000)
      : Promise.resolve(null),
    cleanFmtId
      ? fetchJsonFast<{ itemRows?: any[]; pageInfo?: { totalPages?: number } }>(
          `https://api.atresplayer.com/client/v1/row/search?entityType=ATPEpisode&formatId=${encodeURIComponent(
            cleanFmtId
          )}&progress=true&hidePretitle=true&page=0&size=50`,
          4500
        )
      : Promise.resolve(null),
  ]);

  let allEpisodeRows: any[] = Array.isArray(epsRes?.itemRows) ? [...epsRes.itemRows] : [];
  const totalEpPages = Math.min(4, Math.max(1, Number(epsRes?.pageInfo?.totalPages || 1)));
  if (cleanFmtId && totalEpPages > 1) {
    const extraPages = await Promise.all(
      Array.from({ length: totalEpPages - 1 }, (_, idx) =>
        fetchJsonFast<{ itemRows?: any[] }>(
          `https://api.atresplayer.com/client/v1/row/search?entityType=ATPEpisode&formatId=${encodeURIComponent(
            cleanFmtId
          )}&progress=true&hidePretitle=true&page=${idx + 1}&size=50`,
          4500
        ).catch(() => null)
      )
    );
    for (const p of extraPages) {
      if (Array.isArray(p?.itemRows)) allEpisodeRows.push(...p.itemRows);
    }
  }

  let format: AtresmediaCatalogEntry | null = null;
  if (formatPage?.title) {
    format = mapApiFormatRow(
      { ...formatPage, formatId: cleanFmtId, contentId: cleanFmtId },
      'program'
    );
  }
  if (!format) {
    const home = await getAtresmediaHome().catch(() => null);
    format =
      home?.catalog.find((c) => c.formatId === cleanFmtId) ||
      (titleHint
        ? {
            id: `a3-${cleanFmtId || 'custom'}`,
            formatId: cleanFmtId,
            title: titleHint,
            channelId: '5a6a165a7ed1a834493ebf6a',
            channelName: 'Atresmedia',
            category: classifyAtresCategory('', '', titleHint),
            kind: 'program',
            genre: 'Programa Atresmedia',
            description: `${titleHint} en Atresmedia.`,
            imageUrl: '',
          }
        : null);
  }

  const resolvedTitle = format?.title || titleHint || 'Atresmedia';

  if (format && format.kind === 'series' && !format.tmdbId) {
    const foundTmdb = await resolveTmdbIdByTitle(resolvedTitle, 'tv').catch(() => null);
    if (foundTmdb) format.tmdbId = foundTmdb;
  }

  const seenOfficial = new Set<string>();
  const officialEpisodes: AtresmediaOfficialEpisode[] = allEpisodeRows
    .map((ep: any) => ({
      id: String(ep?.contentId || ep?.link?.url || ''),
      title: String(ep?.title || 'Programa'),
      subTitle: String(ep?.subTitle || resolvedTitle),
      description: String(ep?.description || ''),
      thumbnail: toAtresImageUrl(ep?.image, format?.imageUrl || ''),
      visibility: String(ep?.visibility || 'FREE'),
      url: String(ep?.link?.url || ''),
    }))
    .filter((ep) => {
      if (!ep.id || !ep.title || seenOfficial.has(ep.id)) return false;
      seenOfficial.add(ep.id);
      return true;
    });

  // Skip slow YT/DM searches if it's a scripted series with a verified TMDB ID
  let playablePrograms: AtresmediaPlayableEpisode[] = [];
  if (!format?.tmdbId) {
    const isPasapalabra =
      cleanFmtId === '5a789465986b28066d9ce148' || /pasapalabra/i.test(resolvedTitle);
    const ytQueries = isPasapalabra
      ? [
          'Pasapalabra programa completo',
          'Pasapalabra Antena 3 programa completo',
          'Pasapalabra El Rosco completo',
          'Pasapalabra bote completo',
        ]
      : [`${resolvedTitle} programa completo`, `${resolvedTitle} completo`];

    const dmQueries = isPasapalabra
      ? ['pasapalabra', 'pasapalabra completo', 'pasapalabra programa', 'rosco pasapalabra']
      : [`${resolvedTitle} completo`, resolvedTitle];

    const [ytResults, dmResults] = await Promise.all([
      searchYouTubePlayable(ytQueries, resolvedTitle, isPasapalabra ? 60 : 28),
      searchDailymotionPlayable(dmQueries, resolvedTitle, {
        limit: isPasapalabra ? 60 : 18,
        extraUserIds: isPasapalabra ? ['x2lvtk8'] : [],
      }),
    ]);

    // Validate all discovered Dailymotion candidates concurrently so every HLS 1080p item is 100% alive
    const dmVerifyLimit = isPasapalabra ? 60 : 12;
    const checkedDm = (
      await Promise.all(
        dmResults.slice(0, dmVerifyLimit).map(async (item) => {
          const m3u = await resolveDailymotionVideoToM3u8(item.videoId).catch(() => null);
          return m3u ? item : null;
        })
      )
    ).filter((x): x is AtresmediaPlayableEpisode => Boolean(x));

    playablePrograms = [...checkedDm, ...ytResults];
  }

  const payload = { format, officialEpisodes, playablePrograms };
  programDetailCache.set(cacheKey, { data: payload, ts: Date.now() });
  return payload;
}

export async function resolveAtresmediaPlayVideo(opts: {
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
      : episodeTitle || programTitle || 'Programa Atresmedia';

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
        subtitle: 'Atresmedia · Programa completo HLS 1080p',
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
      subtitle: 'Atresmedia · YouTube HD',
    };
    playResolveCache.set(cacheKey, { data: payload, ts: Date.now() });
    return payload;
  }

  // Dynamic episode resolution (e.g. clicking an official Atresplayer broadcast item)
  const dateMatch = episodeTitle.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  const progNumMatch = episodeTitle.match(/programa\s*(\d+)/i);
  const cleanEp = episodeTitle
    .replace(/\(\d{1,2}-\d{1,2}-\d{2,4}\)/g, '')
    .replace(/\bprograma\s*\d+\b/gi, '')
    .trim();
  const searchQuery = [
    programTitle,
    cleanEp || (dateMatch ? dateMatch[0].replace(/-/g, '/') : progNumMatch?.[0] || 'programa completo'),
  ]
    .filter(Boolean)
    .join(' ');
  const targetName = programTitle || episodeTitle;

  const [dmHits, ytHits] = await Promise.all([
    searchDailymotionPlayable([searchQuery, `${targetName} completo`], targetName, {
      limit: 12,
      extraUserIds: /pasapalabra/i.test(targetName) ? ['x2lvtk8'] : [],
    }),
    searchYouTubePlayable([`${searchQuery} completo`, `${targetName} programa completo`], targetName, 16),
  ]);

  for (const dm of dmHits) {
    const m3u = await resolveDailymotionVideoToM3u8(dm.videoId).catch(() => null);
    if (m3u) {
      const payload = {
        success: true,
        mode: 'hls' as const,
        streamUrl: buildHlsProxyUrl(m3u, 'https://www.dailymotion.com/'),
        rawStreamUrl: m3u,
        title: fullTitle,
        subtitle: `${dm.title} · HLS 1080p`,
        thumbnail: dm.thumbnail,
      };
      playResolveCache.set(cacheKey, { data: payload, ts: Date.now() });
      return payload;
    }
  }

  if (ytHits.length > 0) {
    const pick = ytHits[0];
    const payload = {
      success: true,
      mode: 'youtube' as const,
      streamUrl: pick.videoId,
      rawStreamUrl: `https://www.youtube.com/watch?v=${pick.videoId}`,
      title: fullTitle,
      subtitle: `${pick.title} · ${pick.duration}`,
      thumbnail: pick.thumbnail,
    };
    playResolveCache.set(cacheKey, { data: payload, ts: Date.now() });
    return payload;
  }

  return {
    success: false,
    error: `No se encontró un programa completo reproducible para "${fullTitle}". Prueba otro programa de la lista.`,
  };
}
