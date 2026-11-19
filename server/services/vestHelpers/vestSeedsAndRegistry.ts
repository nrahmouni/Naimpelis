import type { VestCatalogEntry } from './vestTypesAndUtils.ts';

const vestCatalogRegistry = new Map<string, VestCatalogEntry>();

const INITIAL_VEST_SEEDS: VestCatalogEntry[] = [
  {
    key: 'vdXAbbyiZgaslQlAZ9Z6H',
    websiteParam: 'vdXAbbyiZgaslQlAZ9Z6H-One-Piece',
    mediaType: 'tv',
    tmdbId: 37854,
    title: 'One Piece',
    originalTitle: 'One Piece',
    year: '1999',
    rating: '8.9',
    overview:
      'Monkey D. Luffy se lanza a la mar para encontrar el tesoro legendario One Piece y convertirse en el Rey de los Piratas. Disponible en Doblaje Español y Sub Español (720p HLS + subtítulos multiidioma).',
    poster:
      'https://img.321moviesfree.com/cover/20260519/1779176008983_b032a8f6de28e5a88036819840a8da11uiIB9ctqZFbfRXXimtpmZb5dusi.webp',
    backdrop: 'https://image.tmdb.org/t/p/w1280/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg',
    vestUrl: 'https://ww20.321moviesfree.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
      'https://es.cuevana4br.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
      'https://flixlat.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
      'https://ver.123pelicula.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 1188,
    discoveredAt: Date.now(),
  },
  {
    key: 'MdpUkP2oMneAfFppRBkY4',
    websiteParam: 'MdpUkP2oMneAfFppRBkY4-One-Piece',
    mediaType: 'tv',
    tmdbId: 37854,
    title: 'One Piece (Doblaje Español)',
    originalTitle: 'One Piece',
    year: '1999',
    rating: '8.9',
    overview:
      'One Piece en Doblaje Español completo (1.180 episodios en streaming HLS directo 720p/540p sin anuncios en 321moviesfree, Cuevana4br, FlixLat y 123pelicula).',
    poster:
      'https://img.321moviesfree.com/cover/20260518/1779082523894_b032a8f6de28e5a88036819840a8da11ONE%20PIECE.webp',
    backdrop: 'https://image.tmdb.org/t/p/w1280/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg',
    vestUrl: 'https://ww20.321moviesfree.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
      'https://es.cuevana4br.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
      'https://flixlat.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
      'https://ver.123pelicula.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
    ],
    languages: ['Castellano'],
    episodeCount: 1180,
    discoveredAt: Date.now(),
  },
  // Jujutsu Kaisen (TMDB 95479) — Temporadas 1, 2 y 3 (DramasFree / 321Movies)
  {
    key: 'gCt2oc0DFw51NrR5EAVrx',
    websiteParam: 'gCt2oc0DFw51NrR5EAVrx-Jujutsu-Kaisen',
    mediaType: 'tv',
    tmdbId: 95479,
    seasonNumber: 1,
    title: 'Jujutsu Kaisen · Temporada 1',
    originalTitle: 'Jujutsu Kaisen',
    year: '2020',
    rating: '8.6',
    overview:
      'Yuji Itadori se adentra en el mundo de los hechiceros jujutsu tras ingerir un dedo maldito de Ryomen Sukuna. Temporada 1 completa en Doblaje Español y VOSE.',
    poster:
      'https://img.dramasfree.com/cover/20260518/1779098925895_cb5aae9815e76914bbe111173fb547d0Jujutsu%20Kaisen.webp',
    backdrop: 'https://image.tmdb.org/t/p/w1280/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg',
    vestUrl: 'https://www3.dramasfree.com/es/detail/drama/gCt2oc0DFw51NrR5EAVrx-Jujutsu-Kaisen/1/',
    mirrorUrls: [
      'https://www3.dramasfree.com/es/detail/drama/gCt2oc0DFw51NrR5EAVrx-Jujutsu-Kaisen/1/',
      'https://ww20.321moviesfree.com/es/detail/drama/gCt2oc0DFw51NrR5EAVrx-Jujutsu-Kaisen/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 24,
    discoveredAt: Date.now(),
  },
  {
    key: '3r6P9qNezGIHi5KaUglFH',
    websiteParam: '3r6P9qNezGIHi5KaUglFH-Jujutsu-Kaisen-Season-2',
    mediaType: 'tv',
    tmdbId: 95479,
    seasonNumber: 2,
    title: 'Jujutsu Kaisen · Temporada 2 (Shibuya)',
    originalTitle: 'Jujutsu Kaisen Season 2',
    year: '2023',
    rating: '8.8',
    overview:
      'El pasado de Satoru Gojo y Geto seguido del Incidente de Shibuya. Temporada 2 completa en Doblaje Español y Sub Español.',
    poster:
      'https://img.dramasfree.com/cover/20260518/1779099350450_23a174129837f4db7af067e2a948910cJujutsu%20Kaisen%20Season%202.png',
    backdrop: 'https://image.tmdb.org/t/p/w1280/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg',
    vestUrl:
      'https://www3.dramasfree.com/es/detail/drama/3r6P9qNezGIHi5KaUglFH-Jujutsu-Kaisen-Season-2/1/',
    mirrorUrls: [
      'https://www3.dramasfree.com/es/detail/drama/3r6P9qNezGIHi5KaUglFH-Jujutsu-Kaisen-Season-2/1/',
      'https://ww20.321moviesfree.com/es/detail/drama/3r6P9qNezGIHi5KaUglFH-Jujutsu-Kaisen-Season-2/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 23,
    discoveredAt: Date.now(),
  },
  {
    key: '48BzZjCCHYX5ZQvFviD9V',
    websiteParam: '48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3',
    mediaType: 'tv',
    tmdbId: 95479,
    seasonNumber: 3,
    title: 'Jujutsu Kaisen · Temporada 3 (Culling Game)',
    originalTitle: 'Jujutsu Kaisen Season 3',
    year: '2026',
    rating: '9.0',
    overview:
      'El Juego del Sacrificio comienza tras el Incidente de Shibuya. Temporada 3 completa (12 episodios) en Doblaje Español y Sub Español HD.',
    poster:
      'https://img.dramasfree.com/cover/20251230/1767080544319_4eb5f2c10b0df3bd35bca2f45b23390c5TmWcu2Gs0uhyCQXle3cCvgrbIA.webp',
    backdrop: 'https://image.tmdb.org/t/p/w1280/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg',
    vestUrl:
      'https://www3.dramasfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/',
    mirrorUrls: [
      'https://www3.dramasfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/',
      'https://ww20.321moviesfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 12,
    discoveredAt: Date.now(),
  },
  // From (TMDB 124364) — Temporadas 1, 2, 3 y 4 (321MoviesFree / DramasFree)
  {
    key: 'v3HBgSbGMGBfDZO6EzXza',
    websiteParam: 'v3HBgSbGMGBfDZO6EzXza-From',
    mediaType: 'tv',
    tmdbId: 124364,
    seasonNumber: 1,
    title: 'From · Temporada 1',
    originalTitle: 'From',
    year: '2022',
    rating: '8.2',
    overview:
      'Un pueblo de pesadilla en América atrapa a todo el que entra mientras criaturas nocturnas acechan en el bosque.',
    poster: 'https://image.tmdb.org/t/p/w500/7pHMZ6EsZfs2qZu0Lv2UGtTo5MU.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/m7eiSGHFzr584zFmetGqkqaU6BN.jpg',
    vestUrl: 'https://ww20.321moviesfree.com/es/detail/drama/v3HBgSbGMGBfDZO6EzXza-From/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/v3HBgSbGMGBfDZO6EzXza-From/1/',
      'https://www3.dramasfree.com/es/detail/drama/v3HBgSbGMGBfDZO6EzXza-From/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 10,
    discoveredAt: Date.now(),
  },
  {
    key: '5D00Ra6GMcEITfE8DfE2d',
    websiteParam: '5D00Ra6GMcEITfE8DfE2d-From-Season-2',
    mediaType: 'tv',
    tmdbId: 124364,
    seasonNumber: 2,
    title: 'From · Temporada 2',
    originalTitle: 'From Season 2',
    year: '2023',
    rating: '8.2',
    overview: 'Nuevas verdades ocultas salen a la luz en el pueblo mientras el terror escala.',
    poster: 'https://image.tmdb.org/t/p/w500/7pHMZ6EsZfs2qZu0Lv2UGtTo5MU.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/m7eiSGHFzr584zFmetGqkqaU6BN.jpg',
    vestUrl:
      'https://ww20.321moviesfree.com/es/detail/drama/5D00Ra6GMcEITfE8DfE2d-From-Season-2/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/5D00Ra6GMcEITfE8DfE2d-From-Season-2/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 10,
    discoveredAt: Date.now(),
  },
  {
    key: 'wsUcgDlN09vM0f3AUIoJD',
    websiteParam: 'wsUcgDlN09vM0f3AUIoJD-From-Season-3',
    mediaType: 'tv',
    tmdbId: 124364,
    seasonNumber: 3,
    title: 'From · Temporada 3',
    originalTitle: 'From Season 3',
    year: '2024',
    rating: '8.3',
    overview: 'La lucha por escapar se vuelve más desesperada que nunca.',
    poster: 'https://image.tmdb.org/t/p/w500/7pHMZ6EsZfs2qZu0Lv2UGtTo5MU.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/m7eiSGHFzr584zFmetGqkqaU6BN.jpg',
    vestUrl:
      'https://ww20.321moviesfree.com/es/detail/drama/wsUcgDlN09vM0f3AUIoJD-From-Season-3/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/wsUcgDlN09vM0f3AUIoJD-From-Season-3/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 10,
    discoveredAt: Date.now(),
  },
  {
    key: '8JsoLCi6DNWXexKol4WnR',
    websiteParam: '8JsoLCi6DNWXexKol4WnR-From-Season-4',
    mediaType: 'tv',
    tmdbId: 124364,
    seasonNumber: 4,
    title: 'From · Temporada 4 (Español)',
    originalTitle: 'From Season 4',
    year: '2026',
    rating: '8.4',
    overview:
      'Nueva Temporada 4 completa (10 episodios) en Doblaje Español y Sub Español HD con subtítulos sincronizados.',
    poster:
      'https://img.321moviesfree.com/cover/20260518/1779099655641_9b678d1469ec7cc0b2e3a72dff432890From%20Season%204.webp',
    backdrop:
      'https://img.321moviesfree.com/cover/20260518/1779099661401_5580672950692c6fda24472c9a072868From%20Season%204.webp',
    vestUrl:
      'https://ww20.321moviesfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/',
      'https://ww20.321moviesfree.com/es/detail/drama/MKkK0ZMtYN54vJuysYznp-From-Season-4/1/',
      'https://www3.dramasfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 10,
    discoveredAt: Date.now(),
  },
  {
    key: 'MKkK0ZMtYN54vJuysYznp',
    websiteParam: 'MKkK0ZMtYN54vJuysYznp-From-Season-4',
    mediaType: 'tv',
    tmdbId: 124364,
    seasonNumber: 4,
    title: 'From · Temporada 4 (VOSE)',
    originalTitle: 'From Season 4',
    year: '2026',
    rating: '8.4',
    overview:
      'Desvela el misterio de un pueblo de pesadilla que atrapa a todos los que entran. Temporada 4 completa en Sub Español y Doblaje Español.',
    poster:
      'https://img.321moviesfree.com/cover/20260518/1779099655641_9b678d1469ec7cc0b2e3a72dff432890From%20Season%204.webp',
    backdrop:
      'https://img.321moviesfree.com/cover/20260518/1779099661401_5580672950692c6fda24472c9a072868From%20Season%204.webp',
    vestUrl:
      'https://ww20.321moviesfree.com/es/detail/drama/MKkK0ZMtYN54vJuysYznp-From-Season-4/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/MKkK0ZMtYN54vJuysYznp-From-Season-4/1/',
      'https://ww20.321moviesfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/',
    ],
    languages: ['VOSE', 'Castellano'],
    episodeCount: 10,
    discoveredAt: Date.now(),
  },
];

for (const seed of INITIAL_VEST_SEEDS) {
  vestCatalogRegistry.set(seed.key, seed);
}

export function registerDiscoveredVestEntry(entry: VestCatalogEntry) {
  const prev = vestCatalogRegistry.get(entry.key);
  if (!prev) {
    vestCatalogRegistry.set(entry.key, entry);
    return;
  }
  vestCatalogRegistry.set(entry.key, {
    ...prev,
    ...entry,
    tmdbId: prev.tmdbId || entry.tmdbId,
    poster: entry.poster || prev.poster,
    backdrop: prev.backdrop || prev.backdrop || prev.poster,
    overview: entry.overview || prev.overview,
    languages: Array.from(new Set([...(prev.languages || []), ...(entry.languages || [])])),
    mirrorUrls: Array.from(new Set([...(prev.mirrorUrls || []), ...(entry.mirrorUrls || [])])),
  });
}

export function findVestSeedWithEpisode(opts: {
  tmdbId?: string | number | null;
  mediaType?: 'movie' | 'tv';
  yearHint?: string;
  titleHints?: string[];
  preferLang?: string;
  season?: number;
  episode?: number;
}): { seed: VestCatalogEntry; mappedEpisode?: number } | null {
  const numTmdb = opts.tmdbId ? Number(String(opts.tmdbId).replace(/\D/g, '')) : 0;
  const reqSeason = Math.max(1, opts.season || 1);
  const reqEpisode = Math.max(1, opts.episode || 1);
  const prefUpper = String(opts.preferLang || 'ES').toUpperCase();
  const expYear =
    opts.yearHint && /^\d{4}$/.test(opts.yearHint.trim()) ? Number(opts.yearHint.trim()) : 0;

  const pickPreferred = (list: VestCatalogEntry[]): VestCatalogEntry => {
    if (prefUpper === 'VOSE' || prefUpper === 'EN') {
      return (
        list.find((m) => m.languages[0] === 'VOSE' || m.key === 'MKkK0ZMtYN54vJuysYznp') ||
        list[0]
      );
    }
    return (
      list.find(
        (m) =>
          m.languages[0] === 'Castellano' ||
          m.key === 'MdpUkP2oMneAfFppRBkY4' ||
          m.key === '8JsoLCi6DNWXexKol4WnR'
      ) || list[0]
    );
  };

  if (numTmdb) {
    const matches: VestCatalogEntry[] = [];
    for (const entry of vestCatalogRegistry.values()) {
      if (opts.mediaType && entry.mediaType !== opts.mediaType) continue;
      if (entry.tmdbId === numTmdb) matches.push(entry);
    }

    if (matches.length > 0) {
      if (numTmdb === 95479) {
        let targetSeason = reqSeason;
        let mappedEp = reqEpisode;
        if (reqSeason === 1 && reqEpisode >= 48) {
          targetSeason = 3;
          mappedEp = reqEpisode - 47;
        } else if (reqSeason === 1 && reqEpisode >= 25) {
          targetSeason = 2;
          mappedEp = reqEpisode - 24;
        }
        const seasonMatches = matches.filter((m) => m.seasonNumber === targetSeason);
        if (seasonMatches.length > 0) {
          return { seed: pickPreferred(seasonMatches), mappedEpisode: mappedEp };
        }
      }

      const exactSeasonMatches = matches.filter((m) => m.seasonNumber === reqSeason);
      if (exactSeasonMatches.length > 0) {
        return { seed: pickPreferred(exactSeasonMatches), mappedEpisode: reqEpisode };
      }

      return { seed: pickPreferred(matches) };
    }
  }

  const normalizedHints = (opts.titleHints || [])
    .map((t) =>
      String(t || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    )
    .filter((h) => h.length >= 3);

  for (const entry of vestCatalogRegistry.values()) {
    if (opts.mediaType && entry.mediaType !== opts.mediaType) continue;
    if (numTmdb && entry.tmdbId && entry.tmdbId !== numTmdb) continue;
    const entryYear = /^\d{4}$/.test(String(entry.year || '').trim())
      ? Number(entry.year.trim())
      : 0;
    if (expYear > 1900) {
      if (entryYear > 1900 && Math.abs(entryYear - expYear) > 1) continue;
      if (numTmdb && !entry.tmdbId && entryYear === 0) continue;
    } else if (numTmdb && !entry.tmdbId) {
      continue;
    }

    const entryNorm = entry.title
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (normalizedHints.some((h) => h === entryNorm)) {
      return {
        seed: entry,
        mappedEpisode: entry.seasonNumber !== undefined ? reqEpisode : undefined,
      };
    }
  }

  return null;
}

export function findVestSeedForMedia(opts: {
  tmdbId?: string | number | null;
  mediaType?: 'movie' | 'tv';
  yearHint?: string;
  titleHints?: string[];
  preferLang?: string;
  season?: number;
  episode?: number;
}): VestCatalogEntry | null {
  return findVestSeedWithEpisode(opts)?.seed || null;
}

export function listVestCatalogEntries(opts?: {
  mediaType?: 'movie' | 'tv' | 'all';
  query?: string;
}): any[] {
  const mType = opts?.mediaType || 'all';
  const qNorm = String(opts?.query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const out: any[] = [];
  for (const entry of vestCatalogRegistry.values()) {
    if (mType !== 'all' && entry.mediaType !== mType) continue;
    if (qNorm) {
      const hay = `${entry.title} ${entry.originalTitle} ${entry.overview}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (!hay.includes(qNorm)) continue;
    }
    out.push({
      id: `vest-${entry.key}`,
      tmdbId: entry.tmdbId,
      mediaType: entry.mediaType,
      title: entry.title,
      originalTitle: entry.originalTitle,
      year: entry.year,
      rating: entry.rating,
      overview: entry.overview,
      poster: entry.poster
        ? `/api/img-proxy?url=${encodeURIComponent(entry.poster)}`
        : '',
      backdrop: entry.backdrop || entry.poster,
      vestUrl: entry.vestUrl,
      languages: entry.languages,
      seasonNumber: entry.seasonNumber,
      platform: 'DramasFree · 321Movies · Cuevana4 · FlixLat',
    });
  }
  return out;
}
