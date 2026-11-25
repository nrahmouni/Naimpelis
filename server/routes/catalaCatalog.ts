/**
 * @module server/routes/catalaCatalog
 * @description Catalan anime/cinema hub (`/api/catalog/catala`, episodes loader from Archive.org & 3Cat CCMA, and `/api/extract/catala-3cat`).
 */
import type { Express } from 'express';
import { ENV } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import { resolveOfficialChannelLogoUrl } from '../../src/shared/channelLogos.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  normalizeTitleForMatch,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';
import {
  CATALA_ANIME_REGISTRY,
  CATALA_LIVE_CHANNELS,
  type CatalaAnimeEntryDef,
} from '../data/catalaRegistry.ts';

const catalaArtHydrationCache = new LruTtlCache<
  string,
  { poster: string; backdrop: string; year: string; rating: string; ts: number }
>(150, 12 * 60 * 60 * 1000);

const archiveMetadataCache = new LruTtlCache<string, { episodes: any[]; ts: number }>(
  120,
  30 * 60 * 1000
);

function nameToArchivePath(fileName: string): string {
  return String(fileName || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function hydrateCatalaArtwork(entry: CatalaAnimeEntryDef) {
  const cached = catalaArtHydrationCache.get(entry.id);
  if (cached && Date.now() - cached.ts < 12 * 60 * 60 * 1000) {
    return cached;
  }
  let poster = entry.fallbackPoster || '';
  let backdrop = '';
  let year = 'CAT';
  let rating = '';

  if (entry.tmdbId && entry.tmdbType) {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/${entry.tmdbType}/${entry.tmdbId}?api_key=${ENV.tmdbApiKey}&language=es-ES`,
        { signal: AbortSignal.timeout(3200) }
      );
      if (res.ok) {
        const m: any = await res.json();
        if (m?.poster_path) poster = `https://image.tmdb.org/t/p/w500${m.poster_path}`;
        if (m?.backdrop_path) backdrop = `https://image.tmdb.org/t/p/w1280${m.backdrop_path}`;
        const d = String(m?.first_air_date || m?.release_date || '');
        if (d) year = d.split('-')[0] || year;
        if (m?.vote_average) rating = Number(m.vote_average).toFixed(1);
      }
    } catch {
      // fallback to archive thumbnail if needed
    }
  }

  if (!poster && entry.seasons[0]?.archiveId) {
    poster = `https://archive.org/services/img/${entry.seasons[0].archiveId}`;
  }

  const art = { poster, backdrop: backdrop || poster, year, rating, ts: Date.now() };
  catalaArtHydrationCache.set(entry.id, art);
  return art;
}

async function fetchArchivePackEpisodes(
  archiveId: string,
  seasonNumber: number,
  audioNote?: string
): Promise<any[]> {
  const cacheKey = `${archiveId}:${seasonNumber}:${audioNote || ''}`;
  const cached = archiveMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60 * 60 * 1000) {
    return cached.episodes;
  }

  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return [];
    const meta: any = await res.json();
    const files: any[] = Array.isArray(meta?.files) ? meta.files : [];

    const byStem = new Map<
      string,
      { iaMp4?: any; origMp4?: any; mkvFile?: any; rawTitle?: string; thumb?: string }
    >();

    const thumbsByStem = new Map<string, string>();
    for (const f of files) {
      const name = String(f?.name || '');
      if (/\.(jpg|jpeg|png)$/i.test(name) && !name.includes('__ia_thumb')) {
        const stem = name.replace(/\.(thumbs\/.*|jpg|jpeg|png)$/i, '').trim();
        if (stem) {
          thumbsByStem.set(
            stem,
            `https://archive.org/download/${encodeURIComponent(archiveId)}/${encodeURIComponent(
              name
            )}`
          );
        }
      }
    }

    for (const f of files) {
      const name = String(f?.name || '');
      if (!name || name.startsWith('__')) continue;
      if (/\.ia\.mp4$/i.test(name)) {
        const stem = name.replace(/\.ia\.mp4$/i, '');
        const cur = byStem.get(stem) || {};
        cur.iaMp4 = f;
        if (f.title) cur.rawTitle = String(f.title);
        byStem.set(stem, cur);
      } else if (/\.mp4$/i.test(name)) {
        const stem = name.replace(/\.mp4$/i, '');
        const cur = byStem.get(stem) || {};
        cur.origMp4 = f;
        if (f.title) cur.rawTitle = String(f.title);
        byStem.set(stem, cur);
      }
    }

    const rawEntries = Array.from(byStem.entries()).filter(
      ([, v]) => Boolean(v.iaMp4 || v.origMp4)
    );

    rawEntries.sort(([stemA], [stemB]) =>
      stemA.localeCompare(stemB, 'ca', { numeric: true, sensitivity: 'base' })
    );

    const defaultThumb = `https://archive.org/services/img/${encodeURIComponent(archiveId)}`;

    const episodes = rawEntries.map(([stem, val], idx) => {
      const cleanName = stem
        .replace(/^.*\//, '')
        .replace(/[_]+/g, ' ')
        .replace(/\b(BDMV|DVDrip|1080p|720p|480p|x264|h264|AC3|CAT-JAP|by\s+.*)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const epNumMatch =
        cleanName.match(/(?:episodi|cap[ií]tol|ep\.?|cap\.?)\s*0*(\d{1,4})/i) ||
        cleanName.match(/(?:^|\s|-)0*(\d{1,3})(?:\s|-|\.)/);
      const epNumber = idx + 1;
      const displayTitle = val.rawTitle
        ? String(val.rawTitle).trim()
        : cleanName || `Capítol ${epNumber}`;

      const iaUrl = val.iaMp4
        ? `https://archive.org/download/${encodeURIComponent(archiveId)}/${nameToArchivePath(
            val.iaMp4.name
          )}`
        : '';
      const origUrl = val.origMp4
        ? `https://archive.org/download/${encodeURIComponent(archiveId)}/${nameToArchivePath(
            val.origMp4.name
          )}`
        : '';

      const primaryUrl = iaUrl || origUrl;
      const tracks: TrackRecord[] = [];
      if (iaUrl) {
        tracks.push({
          id: `cat-ia-${seasonNumber}-${epNumber}`,
          label: 'Català · Web HD (Compatible)',
          lang: 'CAT',
          quality: 'HD',
          sourceUrl: iaUrl,
          resolverType: 'direct_mp4',
          resolvedStreamUrl: iaUrl,
        });
      }
      if (origUrl && origUrl !== iaUrl) {
        tracks.push({
          id: `cat-orig-${seasonNumber}-${epNumber}`,
          label: 'Català · Màxima Qualitat Original',
          lang: 'CAT',
          quality: '1080p',
          sourceUrl: origUrl,
          resolverType: 'direct_mp4',
          resolvedStreamUrl: origUrl,
        });
      }

      const lenSec = Number(val.origMp4?.length || val.iaMp4?.length || 0);
      const runtimeMin = lenSec > 60 ? Math.round(lenSec / 60) : undefined;

      return {
        id: `cat-ep-${archiveId}-${epNumber}`,
        episodeNumber: epNumber,
        detectedNumber: epNumMatch?.[1] ? Number(epNumMatch[1]) : epNumber,
        seasonNumber,
        title: displayTitle,
        overview: audioNote || 'Àudio en català · Reproducció directa sense anuncis.',
        still: thumbsByStem.get(stem) || defaultThumb,
        runtime: runtimeMin,
        streamUrl: primaryUrl,
        audioNote,
        sourceType: 'archive_mp4',
        tracks,
      };
    });

    archiveMetadataCache.set(cacheKey, { episodes, ts: Date.now() });
    return episodes;
  } catch (err) {
    logger.warn({ err, archiveId }, 'Archive metadata error');
    return [];
  }
}

async function fetchCcmaProgramEpisodes(programId: string, seasonNumber: number): Promise<any[]> {
  const cacheKey = `ccma:${programId}:${seasonNumber}`;
  const cached = archiveMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 20 * 60 * 1000) {
    return cached.episodes;
  }
  try {
    const apiUrl = `https://api.3cat.cat/videos?_format=json&origen=llistat&programatv_id=${encodeURIComponent(
      programId
    )}&tipus_contingut=PPD&items_pagina=100&pagina=1&ordre=capitol&perfil=pc`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const rawItems = json?.resposta?.items?.item;
    const list: any[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const episodes = list.map((it, idx) => {
      const vidId = String(it?.id || '');
      const capNum = Number(it?.capitol || idx + 1);
      const title = String(it?.titol || `Capítol ${capNum}`).trim();
      const synopsis = String(it?.entradeta || 'Emissió oficial SX3 / 3Cat en català.').trim();
      const imgs: any[] = Array.isArray(it?.imatges?.imatge)
        ? it.imatges.imatge
        : it?.imatges?.imatge
        ? [it.imatges.imatge]
        : [];
      const still = String(imgs[0]?.text || '');

      return {
        id: `3cat-${programId}-${vidId || idx}`,
        episodeNumber: idx + 1,
        detectedNumber: capNum,
        seasonNumber,
        title: capNum ? `Cap. ${capNum} · ${title}` : title,
        overview: synopsis,
        still,
        ccmaVideoId: vidId,
        sourceType: 'ccma_3cat',
      };
    });

    archiveMetadataCache.set(cacheKey, { episodes, ts: Date.now() });
    return episodes;
  } catch {
    return [];
  }
}

export function registerCatalaCatalogRoutes(app: Express): void {
  app.get('/api/catalog/catala', async (req, res) => {
    try {
      const category = String(req.query.category || 'all').toLowerCase();
      const query = String(req.query.query || '').trim();
      const normalizeCatalaSearch = (s: string) =>
        normalizeTitleForMatch(s)
          .replace(/\bxaolin\b/g, 'xiaolin')
          .replace(/xao/g, 'xiao');
      const normQ = normalizeCatalaSearch(query);

      let baseEntries = CATALA_ANIME_REGISTRY;
      if (category === 'classics' || category === 'shonen' || category === 'movies') {
        baseEntries = baseEntries.filter((e) => e.category === category);
      }
      if (normQ) {
        baseEntries = baseEntries.filter((e) => {
          const hay = normalizeCatalaSearch(
            `${e.titleCat} ${e.originalTitle} ${e.aliases || ''} ${e.overviewCat} ${e.eraTag}`
          );
          return hay.includes(normQ);
        });
      }

      const hydratedItems = await Promise.all(
        baseEntries.map(async (entry) => {
          const art = await hydrateCatalaArtwork(entry);
          return {
            id: entry.id,
            title: entry.titleCat,
            originalTitle: entry.originalTitle,
            tmdbId: entry.tmdbId,
            mediaType: entry.tmdbType || 'tv',
            category: entry.category,
            eraTag: entry.eraTag,
            episodeHint: entry.episodeHint,
            year: art.year,
            rating: art.rating,
            overview: entry.overviewCat,
            poster: art.poster,
            backdrop: art.backdrop,
            seasonCount: entry.seasons.length,
          };
        })
      );

      let dynamicArchiveItems: any[] = [];
      if (query.length >= 2) {
        try {
          const cleanArchQ = query.replace(/xaol[ií]n/gi, 'xiaolin');
          const advQ = `(${cleanArchQ}) AND (catala OR català OR valencia OR 3xl OR super3 OR totsrucs OR "tots rucs" OR mecanoscrit OR trobanime) AND mediatype:(movies)`;
          const advUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
            advQ
          )}&fl[]=identifier,title,description&sort[]=downloads+desc&rows=12&page=1&output=json`;
          const advRes = await fetch(advUrl, { signal: AbortSignal.timeout(4200) });
          if (advRes.ok) {
            const advJson: any = await advRes.json();
            const docs: any[] = Array.isArray(advJson?.response?.docs)
              ? advJson.response.docs
              : [];
            const knownArchiveIds = new Set(
              CATALA_ANIME_REGISTRY.flatMap((e) => e.seasons.map((s) => s.archiveId).filter(Boolean))
            );
            dynamicArchiveItems = docs
              .filter((d) => d?.identifier && !knownArchiveIds.has(String(d.identifier)))
              .map((d) => {
                const ident = String(d.identifier);
                const img = `https://archive.org/services/img/${encodeURIComponent(ident)}`;
                return {
                  id: `arch-${ident}`,
                  title: String(d.title || ident),
                  originalTitle: ident,
                  mediaType: 'tv',
                  category: 'all',
                  eraTag: 'Arxiu Català / TotsRucs',
                  episodeHint: 'Vídeo directe',
                  year: 'CAT',
                  rating: '',
                  overview:
                    typeof d.description === 'string'
                      ? d.description.replace(/<[^>]+>/g, '').slice(0, 220)
                      : 'Contingut en català trobat a l’arxiu comunitari.',
                  poster: img,
                  backdrop: img,
                  seasonCount: 1,
                };
              });
          }
        } catch {
          // ignore dynamic search timeout
        }
      }

      res.json({
        success: true,
        items: [...hydratedItems, ...dynamicArchiveItems],
        liveChannels: channelHealthMonitor.prioritizeChannels(CATALA_LIVE_CHANNELS).map((ch) => ({
          ...ch,
          logoUrl: resolveOfficialChannelLogoUrl(ch) || undefined,
        })),
        communityLinks: [
          {
            id: 'totsrucs-cat',
            label: 'TotsRucs.cat (Índex P2P Català)',
            url: 'https://web.totsrucs.cat/',
            desc: 'Arxiu històric eMule/ed2k de sèries i cinema en català (packs directes ja integrats aquí)',
          },
          {
            id: 'mecanoscrit-cat',
            label: 'Mecanoscrit.cat',
            url: 'https://mecanoscrit.cat/',
            desc: 'Preservació de cinema i ciència-ficció doblada o subtitulada en català',
          },
          {
            id: 'tg-animecatala',
            label: 'Telegram @animecatala',
            url: 'https://t.me/s/animecatala',
            desc: 'Canal comunitari amb avisos i novetats en català',
          },
          {
            id: 'fansubs-cat',
            label: 'Anime Fansubs.cat',
            url: 'https://anime.fansubs.cat/',
            desc: 'Enciclopèdia i índex del doblatge i fansub en català',
          },
          {
            id: 'sx3-portal',
            label: 'SX3 / 3Cat Anime Oficial',
            url: 'https://www.3cat.cat/tv3/sx3/',
            desc: 'Portal públic oficial amb estrenes d’anime en català',
          },
        ],
      });
    } catch (err) {
      logger.error({ err }, 'Catala catalog error');
      res.status(500).json({ success: false, items: [], liveChannels: [] });
    }
  });

  app.get('/api/catalog/catala/:itemId/episodes', async (req, res) => {
    try {
      const itemId = String(req.params.itemId || '').trim();
      const requestedSeason = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);

      if (itemId.startsWith('arch-')) {
        const archiveId = itemId.slice(5);
        const episodes = await fetchArchivePackEpisodes(archiveId, 1);
        const img = `https://archive.org/services/img/${encodeURIComponent(archiveId)}`;
        return res.json({
          success: true,
          details: {
            id: itemId,
            title: archiveId.replace(/[-_]+/g, ' '),
            eraTag: 'Arxiu Català',
            overview: ' Reproducció directa en català sense anuncis.',
            poster: img,
            backdrop: img,
            activeSeason: 1,
            seasons: [{ seasonNumber: 1, name: 'Capítols i Vídeos', episodeCount: episodes.length }],
            episodes,
          },
        });
      }

      const entry = CATALA_ANIME_REGISTRY.find((e) => e.id === itemId);
      if (!entry) {
        return res.status(404).json({ success: false, error: 'Anime en català no trobat.' });
      }

      const art = await hydrateCatalaArtwork(entry);
      const chosenSeason =
        entry.seasons.find((s) => s.seasonNumber === requestedSeason) || entry.seasons[0];

      const episodes = Array.isArray(chosenSeason.customEpisodes)
        ? chosenSeason.customEpisodes
        : chosenSeason.archiveId
        ? await fetchArchivePackEpisodes(
            chosenSeason.archiveId,
            chosenSeason.seasonNumber,
            chosenSeason.audioNote
          )
        : chosenSeason.ccmaProgramId
        ? await fetchCcmaProgramEpisodes(chosenSeason.ccmaProgramId, chosenSeason.seasonNumber)
        : [];

      return res.json({
        success: true,
        details: {
          id: entry.id,
          title: entry.titleCat,
          originalTitle: entry.originalTitle,
          eraTag: entry.eraTag,
          year: art.year,
          rating: art.rating,
          overview: entry.overviewCat,
          poster: art.poster,
          backdrop: art.backdrop,
          activeSeason: chosenSeason.seasonNumber,
          seasons: entry.seasons.map((s) => ({
            seasonNumber: s.seasonNumber,
            name: s.name,
            episodeCount:
              s.seasonNumber === chosenSeason.seasonNumber
                ? episodes.length
                : Array.isArray(s.customEpisodes)
                ? s.customEpisodes.length
                : 0,
          })),
          episodes,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Catala episodes error');
      res.status(500).json({ success: false });
    }
  });

  app.get('/api/extract/catala-3cat', async (req, res) => {
    try {
      const vidId = String(req.query.vidId || '').replace(/\D/g, '');
      if (!vidId) return res.status(400).json({ success: false });

      const mediaApi = `https://dinamics.ccma.cat/pvideo/media.jsp?media=video&version=0s&idint=${vidId}&profile=pc`;
      const mRes = await fetch(mediaApi, {
        headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
      });
      const officialWebUrl = `https://www.3cat.cat/3cat/video/${vidId}/`;

      if (mRes.ok) {
        const mJson: any = await mRes.json();
        const urlsRaw = mJson?.media?.url;
        const urlList: any[] = Array.isArray(urlsRaw) ? urlsRaw : urlsRaw ? [urlsRaw] : [];
        const sorted = [...urlList].sort(
          (a, b) =>
            parseInt(String(b?.label || '0'), 10) - parseInt(String(a?.label || '0'), 10)
        );
        const bestUrl = String(sorted[0]?.file || '').trim();
        if (bestUrl) {
          const tracks: TrackRecord[] = sorted
            .filter((u) => u?.file)
            .map((u, idx) => ({
              id: `3cat-mp4-${vidId}-${idx}`,
              label: `Català Oficial 3Cat · ${u.label || 'HD'}`,
              lang: 'CAT',
              quality: String(u.label || 'HD'),
              sourceUrl: String(u.file),
              resolverType: 'direct_mp4',
              resolvedStreamUrl: String(u.file),
            }));
          tracks.push({
            id: `3cat-cloud-${vidId}`,
            label: 'Obrir al Cloud Browser (3Cat Oficial)',
            lang: 'CAT',
            quality: 'HD',
            sourceUrl: officialWebUrl,
            resolverType: 'cloud_browser',
          });
          return res.json({
            success: true,
            mode: 'direct',
            streamUrl: bestUrl,
            tracks,
            officialWebUrl,
          });
        }
      }

      return res.json({
        success: true,
        mode: 'cloud',
        streamUrl: officialWebUrl,
        tracks: [],
        officialWebUrl,
      });
    } catch {
      return res.status(500).json({ success: false });
    }
  });
}
