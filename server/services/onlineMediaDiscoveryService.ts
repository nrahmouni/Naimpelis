/**
 * @module server/services/onlineMediaDiscoveryService
 * @description Real-time online discovery & extraction for Archive.org direct MP4
 * feature films / NASA documentaries and Kitsu currently airing anime.
 */
import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA } from '../extractors/httpHelpers.ts';
import type { ClipboxSearchItem } from './clipbox/clipboxCatalogService.ts';

export interface OnlineDiscoveryPayload {
  archiveMovies: ClipboxSearchItem[];
  airingAnime: ClipboxSearchItem[];
  updatedAt: number;
}

const discoveryCache = new LruTtlCache<string, OnlineDiscoveryPayload>(4, 30 * 60 * 1000);

const NSFW_BLOCKLIST_RX =
  /\b(sex|porn|xxx|erotic|nude|nudity|adult|fetish|hentai|nsfw|playboy|strip|orgasm|erotica)\b|sex_madness/i;

function isSafeArchiveDoc(doc: {
  identifier?: string;
  title?: string;
  description?: string | string[];
}): boolean {
  const desc = Array.isArray(doc.description)
    ? doc.description.join(' ')
    : String(doc.description || '');
  const haystack = `${doc.identifier || ''} ${doc.title || ''} ${desc}`;
  return !NSFW_BLOCKLIST_RX.test(haystack);
}

async function fetchArchiveDirectMovies(): Promise<ClipboxSearchItem[]> {
  const searchUrl =
    'https://archive.org/advancedsearch.php?q=mediatype:movies+AND+format:MPEG4+AND+(collection:feature_films+OR+collection:nasa)&fl[]=identifier,title,year,downloads,description&sort[]=downloads+desc&rows=24&output=json';
  try {
    const res = await streamingFetch(searchUrl, {
      headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
      timeoutMs: 6000,
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as {
      response?: {
        docs?: Array<{
          identifier?: string;
          title?: string;
          year?: string | number;
          downloads?: number;
          description?: string | string[];
        }>;
      };
    } | null;

    const candidates = (json?.response?.docs || [])
      .filter((d) => Boolean(d?.identifier && d?.title) && isSafeArchiveDoc(d))
      .slice(0, 12);

    const resolved = await Promise.allSettled(
      candidates.map(async (doc): Promise<ClipboxSearchItem | null> => {
        const id = String(doc.identifier || '').trim();
        if (!id) return null;
        try {
          const metaRes = await streamingFetch(
            `https://archive.org/metadata/${encodeURIComponent(id)}`,
            {
              headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
              timeoutMs: 4500,
            }
          );
          if (!metaRes.ok) return null;
          const meta = (await metaRes.json().catch(() => null)) as {
            files?: Array<{
              name?: string;
              format?: string;
              size?: string | number;
              length?: string;
            }>;
          } | null;

          const mp4Files = (meta?.files || [])
            .filter((f) => {
              const name = String(f?.name || '');
              const size = Number(f?.size || 0);
              return (
                /\.mp4$/i.test(name) &&
                !/512kb/i.test(name) &&
                (size === 0 || size > 2_000_000)
              );
            })
            .sort((a, b) => {
              const aHd = /hd|720|1080|h\.264|mpeg4/i.test(String(a.format || a.name || '')) ? 1 : 0;
              const bHd = /hd|720|1080|h\.264|mpeg4/i.test(String(b.format || b.name || '')) ? 1 : 0;
              if (aHd !== bHd) return bHd - aHd;
              return Number(b.size || 0) - Number(a.size || 0);
            });

          const chosen = mp4Files[0];
          if (!chosen?.name) return null;

          const cleanPath = chosen.name
            .split('/')
            .map((seg) => encodeURIComponent(seg))
            .join('/');
          const directMp4Url = `https://archive.org/download/${encodeURIComponent(id)}/${cleanPath}`;
          const poster = `https://archive.org/services/img/${encodeURIComponent(id)}`;
          const rawDesc = Array.isArray(doc.description)
            ? doc.description.join(' ')
            : String(doc.description || '');

          return {
            id: `archive-${id}`,
            source: 'archive',
            mediaType: 'movie',
            title: String(doc.title || id).trim(),
            year: doc.year ? String(doc.year).slice(0, 4) : '',
            rating: '',
            overview: rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260),
            poster,
            backdrop: poster,
            directMp4Url,
          };
        } catch {
          return null;
        }
      })
    );

    const out: ClipboxSearchItem[] = [];
    for (const r of resolved) {
      if (r.status === 'fulfilled' && r.value) {
        out.push(r.value);
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchKitsuAiringAnime(): Promise<ClipboxSearchItem[]> {
  try {
    const res = await streamingFetch(
      'https://kitsu.io/api/edge/anime?filter[status]=current&sort=-userCount&page[limit]=12',
      {
        headers: {
          Accept: 'application/vnd.api+json',
          'User-Agent': CHROME_UA,
        },
        timeoutMs: 5500,
      }
    );
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as {
      data?: Array<{
        id: string;
        attributes?: {
          canonicalTitle?: string;
          titles?: Record<string, string>;
          synopsis?: string;
          startDate?: string;
          averageRating?: string;
          episodeCount?: number;
          posterImage?: { medium?: string; large?: string };
          coverImage?: { large?: string; original?: string };
        };
      }>;
    } | null;

    const out: ClipboxSearchItem[] = [];
    for (const entry of json?.data || []) {
      const attr = entry.attributes;
      if (!attr?.canonicalTitle) continue;
      const poster = attr.posterImage?.large || attr.posterImage?.medium || '';
      if (!poster) continue;
      const rawScore = Number(attr.averageRating || 0);
      out.push({
        id: `kitsu-${entry.id}`,
        source: 'kitsu',
        mediaType: 'anime',
        title: attr.titles?.en || attr.canonicalTitle,
        originalTitle: attr.titles?.ja_jp || attr.canonicalTitle,
        year: (attr.startDate || '').slice(0, 4),
        rating: rawScore > 0 ? (rawScore / 10).toFixed(1) : '',
        overview: attr.synopsis || '',
        poster,
        backdrop: attr.coverImage?.large || attr.coverImage?.original || poster,
        kitsuId: entry.id,
        episodeCount: attr.episodeCount || 12,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchOnlineTopDiscovery(): Promise<OnlineDiscoveryPayload> {
  const cached = discoveryCache.get('top');
  if (cached) return cached;

  const [archiveMovies, airingAnime] = await Promise.all([
    fetchArchiveDirectMovies(),
    fetchKitsuAiringAnime(),
  ]);

  const payload: OnlineDiscoveryPayload = {
    archiveMovies,
    airingAnime,
    updatedAt: Date.now(),
  };

  if (archiveMovies.length > 0 || airingAnime.length > 0) {
    discoveryCache.set('top', payload);
  }
  return payload;
}
