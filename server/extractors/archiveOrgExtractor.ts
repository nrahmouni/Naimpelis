import { LruTtlCache } from '../utils/lruCache.ts';
import { CHROME_UA, curlGetText, normalizeTitleForMatch, type TrackRecord } from './httpHelpers.ts';

interface ArchiveFileEntry {
  name: string;
  format?: string;
}

const archiveMetaCache = new LruTtlCache<string, ArchiveFileEntry[]>(120, 30 * 60 * 1000);
const archiveTrackCache = new LruTtlCache<string, TrackRecord[]>(200, 25 * 60 * 1000);

// Verified Archive.org collections & standalone episode items for La que se avecina (TMDB 35338)
const LQSA_ARCHIVE_SEASON_MAP: Record<number, string[]> = {
  1: ['spanish-neighborhood-sitcom-s01-remaster', 'lqsa_20260416'],
  2: ['spanish-neighborhood-sitcom-s02-remaster'],
  3: ['spanish-neighborhood-sitcom-s03-remaster'],
  4: ['spanish-neighborhood-sitcom-s04-remaster'],
  5: ['spanish-neighborhood-sitcom-s05-remaster_202611'],
  11: ['temporada-11-LQSA'],
};

const LQSA_ARCHIVE_EPISODE_MAP: Record<string, string[]> = {
  '8x5': ['lqsa_hotmail_LQSA'],
  '11x8': ['lqsat11x08'],
  '11x12': ['lqsa11x12'],
};

export function normalizeArchiveHomoglyphs(input: string): string {
  return String(input || '')
    .replace(/[аА]/g, 'a')
    .replace(/[еЕ]/g, 'e')
    .replace(/[оО]/g, 'o')
    .replace(/[рР]/g, 'p')
    .replace(/[сС]/g, 'c')
    .replace(/[хХ]/g, 'x')
    .replace(/[іІ]/g, 'i')
    .replace(/[ѕЅ]/g, 's')
    .replace(/[Тт]/g, 'T')
    .replace(/[Нн]/g, 'H')
    .replace(/[Мм]/g, 'M')
    .replace(/[Кк]/g, 'K')
    .replace(/[Вв]/g, 'B')
    .replace(/[јЈ]/g, 'j');
}

function encodeArchivePath(fileName: string): string {
  return fileName
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function fetchArchiveItemFiles(identifier: string): Promise<ArchiveFileEntry[]> {
  const cleanId = String(identifier || '').trim();
  if (!cleanId) return [];
  const cached = archiveMetaCache.get(cleanId);
  if (cached) return cached;

  try {
    const url = `https://archive.org/metadata/${encodeURIComponent(cleanId)}`;
    const headers = { 'User-Agent': CHROME_UA, Accept: 'application/json' };
    let res = await curlGetText(url, headers, 4, true, true).catch(() => ({ text: '', effectiveUrl: url }));
    if (!res.text) {
      res = await curlGetText(url, headers, 4, false, false).catch(() => ({ text: '', effectiveUrl: url }));
    }
    if (!res.text) return [];
    const json: any = JSON.parse(res.text);
    const rawFiles: any[] = Array.isArray(json?.files) ? json.files : [];
    const videoFiles: ArchiveFileEntry[] = rawFiles
      .filter((f) => f?.name && /\.(mp4|mkv)$/i.test(String(f.name)))
      .map((f) => ({
        name: String(f.name),
        format: String(f.format || ''),
      }));
    if (videoFiles.length > 0) {
      archiveMetaCache.set(cleanId, videoFiles);
    }
    return videoFiles;
  } catch {
    return [];
  }
}

export function matchArchiveEpisodeFile(
  files: ArchiveFileEntry[],
  season: number,
  episode: number,
  itemIdentifier = ''
): ArchiveFileEntry[] {
  const epPad = String(episode).padStart(2, '0');
  const sPad = String(season).padStart(2, '0');

  const explicitPairRe = [
    new RegExp(`\\b0*${season}\\s*[xX×]\\s*0*${episode}\\b`),
    new RegExp(`\\b[TS]\\s*0*${season}[_\\s.-]*E\\s*0*${episode}\\b`, 'i'),
    new RegExp(`temporada\\s*0*${season}[^a-z0-9]{0,16}(?:cap[ií]tulo|cap|ep)\\s*0*${episode}\\b`, 'i'),
    new RegExp(`(?:^|/)${season}${epPad}\\.(?:ia\\.)?mp4$`, 'i'),
  ];

  // Collections scoped strictly to one season (e.g. t1/01.ia.mp4 or 805.mp4)
  const seasonScopedRe =
    itemIdentifier === 'lqsa_20260416'
      ? new RegExp(`t${season}/0*${episode}(?:\\.ia)?\\.mp4$`, 'i')
      : LQSA_ARCHIVE_EPISODE_MAP[`${season}x${episode}`]?.includes(itemIdentifier)
      ? /\.(?:mp4|mkv)$/i
      : null;

  const matched = files.filter((f) => {
    const cleanName = normalizeArchiveHomoglyphs(f.name);
    if (explicitPairRe.some((re) => re.test(cleanName))) return true;
    if (seasonScopedRe && seasonScopedRe.test(cleanName)) return true;
    if (
      itemIdentifier === 'temporada-11-LQSA' &&
      season === 11 &&
      new RegExp(`Temporada\\s*11\\s*Cap[ií]tulo\\s*0*${episode}\\b`, 'i').test(cleanName)
    ) {
      return true;
    }
    if (
      sPad &&
      new RegExp(`S${sPad}E${epPad}\\b`, 'i').test(cleanName)
    ) {
      return true;
    }
    return false;
  });

  // Sort browser-compatible H.264 `.ia.mp4` first, then `.mp4`, then `.mkv`
  return matched.sort((a, b) => {
    const score = (name: string) => {
      const lower = name.toLowerCase();
      if (lower.endsWith('.ia.mp4')) return 0;
      if (lower.endsWith('.mp4')) return 1;
      return 2;
    };
    return score(a.name) - score(b.name);
  });
}

async function searchArchiveOrgIdentifiers(query: string): Promise<string[]> {
  try {
    const res = await curlGetText(
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
        `(${query}) AND mediatype:movies`
      )}&fl[]=identifier,title&rows=12&output=json`,
      { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      4,
      true,
      false
    );
    if (!res.text) return [];
    const json: any = JSON.parse(res.text);
    const docs: any[] = Array.isArray(json?.response?.docs) ? json.response.docs : [];
    return docs
      .filter((d) => {
        const cleanTitle = normalizeTitleForMatch(normalizeArchiveHomoglyphs(String(d?.title || '')));
        const normQ = normalizeTitleForMatch(query);
        return cleanTitle && normQ && cleanTitle.includes(normQ);
      })
      .map((d) => String(d.identifier || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function extractArchiveOrgTracks(opts: {
  tmdbId?: string | number | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints: string[];
  originalLanguage?: string;
}): Promise<TrackRecord[]> {
  const { tmdbId, mediaType, season = 1, episode = 1, titleHints, originalLanguage = '' } = opts;
  if (mediaType !== 'tv') return [];

  const mainTitle = String(titleHints[0] || '').trim();
  if (!mainTitle) return [];

  const cacheKey = `${String(tmdbId || mainTitle)}:${season}x${episode}`;
  const cached = archiveTrackCache.get(cacheKey);
  if (cached) return cached;

  const isLqsa =
    String(tmdbId || '') === '35338' ||
    titleHints.some((h) => normalizeTitleForMatch(h).includes('la que se avecina'));

  const candidateIdentifiers: string[] = [];
  if (isLqsa) {
    for (const id of LQSA_ARCHIVE_EPISODE_MAP[`${season}x${episode}`] || []) {
      if (!candidateIdentifiers.includes(id)) candidateIdentifiers.push(id);
    }
    for (const id of LQSA_ARCHIVE_SEASON_MAP[season] || []) {
      if (!candidateIdentifiers.includes(id)) candidateIdentifiers.push(id);
    }
  } else if (originalLanguage === 'es') {
    const foundIds = await searchArchiveOrgIdentifiers(mainTitle);
    for (const id of foundIds.slice(0, 3)) {
      if (!candidateIdentifiers.includes(id)) candidateIdentifiers.push(id);
    }
  }

  if (candidateIdentifiers.length === 0) return [];

  const epPad = String(episode).padStart(2, '0');
  const tracks: TrackRecord[] = [];
  const metaResults = await Promise.all(
    candidateIdentifiers.slice(0, 4).map(async (id) => ({
      id,
      files: await fetchArchiveItemFiles(id),
    }))
  );

  for (const { id, files } of metaResults) {
    const matched = matchArchiveEpisodeFile(files, season, episode, id);
    // Pick up to 2 formats per item: prefer .ia.mp4 (H.264) and .mp4 (excluding .mkv when an MP4 exists)
    const mp4Only = matched.filter((f) => /\.mp4$/i.test(f.name));
    const chosen = (mp4Only.length > 0 ? mp4Only : matched).slice(0, 2);

    for (const file of chosen) {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.mkv')) continue;
      const directUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeArchivePath(file.name)}`;
      const isIaH264 = lowerName.endsWith('.ia.mp4');
      tracks.push({
        id: `ia-${id}-${isIaH264 ? 'h264' : lowerName.endsWith('.mkv') ? 'mkv' : 'mp4'}`,
        label: isIaH264
          ? `Archive HD (H.264) · T${season}x${epPad} (Español)`
          : lowerName.endsWith('.mp4')
          ? `Archive MP4 · T${season}x${epPad} (Español)`
          : `Archive MKV · T${season}x${epPad} (Español)`,
        lang: 'ES',
        quality: isIaH264 ? '720p' : '1080p',
        sourceUrl: directUrl,
        referer: 'https://archive.org/',
        resolverType: 'direct_mp4',
        resolvedStreamUrl: directUrl,
      });
    }
  }

  // Prefer `.ia.mp4` tracks globally ahead of HEVC `.mp4` for maximum browser video compatibility
  tracks.sort((a, b) => {
    const aH264 = a.id.endsWith('-h264') ? 0 : 1;
    const bH264 = b.id.endsWith('-h264') ? 0 : 1;
    return aH264 - bH264;
  });

  if (tracks.length > 0) {
    archiveTrackCache.set(cacheKey, tracks);
  }
  return tracks;
}
