/**
 * @module server/services/podcastExtractorService
 * @description Live iTunes Podcast directory + SSRF-guarded RSS <enclosure> MP3 extractor
 * providing full-length online podcast episodes for Riffan Music.
 */
import crypto from 'node:crypto';
import { LruTtlCache } from '../utils/lruCache.ts';
import { safeFetchFollowingRedirects, validateSafeOutboundUrl } from '../utils/ssrfGuard.ts';
import type { MusicTrack } from '../../src/types/music.ts';

const UA = 'RiffanMusic-PodcastExtractor/1.0 (+https://riffantv.app)';

export interface PodcastShow {
  id: string;
  title: string;
  author: string;
  artwork: string;
  artworkXl: string;
  feedUrl: string;
  genre: string;
  trackCount: number;
  country: string;
}

const searchCache = new LruTtlCache<string, PodcastShow[]>(120, 20 * 60 * 1000);
const episodesCache = new LruTtlCache<string, MusicTrack[]>(180, 15 * 60 * 1000);
const homeCache = new LruTtlCache<string, { featured: PodcastShow[]; techAndScience: PodcastShow[] }>(
  4,
  30 * 60 * 1000
);

function decodeXmlEntities(text: string): string {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n) || 32))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseItunesDurationSec(raw: string): number {
  const clean = String(raw || '').trim();
  if (!clean) return 1800;
  if (/^\d+$/.test(clean)) return Math.max(30, Number(clean) || 1800);
  const parts = clean.split(':').map((p) => Number(p) || 0);
  if (parts.length === 3) return Math.max(30, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 2) return Math.max(30, parts[0] * 60 + parts[1]);
  return 1800;
}

function extractTag(block: string, tagName: string): string {
  const rx = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i');
  const m = block.match(rx);
  return m?.[1] ? decodeXmlEntities(m[1]) : '';
}

function extractAttr(tagHtml: string, attrName: string): string {
  const rx = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');
  const m = tagHtml.match(rx);
  return m?.[1] ? m[1].trim() : '';
}

export async function searchPodcasts(query: string, country = 'ES', limit = 16): Promise<PodcastShow[]> {
  const cleanQ = String(query || '').trim();
  if (!cleanQ) return [];
  const safeCountry = /^[A-Z]{2}$/i.test(country) ? country.toUpperCase() : 'ES';
  const safeLimit = Math.min(25, Math.max(1, limit));
  const key = `${safeCountry}:${safeLimit}:${cleanQ.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&country=${safeCountry}&limit=${safeLimit}&term=${encodeURIComponent(cleanQ)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        collectionId?: number;
        trackId?: number;
        collectionName?: string;
        trackName?: string;
        artistName?: string;
        feedUrl?: string;
        artworkUrl100?: string;
        artworkUrl600?: string;
        primaryGenreName?: string;
        trackCount?: number;
        country?: string;
      }>;
    };

    const shows: PodcastShow[] = [];
    const seenFeeds = new Set<string>();
    for (const item of data?.results || []) {
      const feedUrl = String(item.feedUrl || '').trim();
      if (!/^https?:\/\//i.test(feedUrl) || seenFeeds.has(feedUrl)) continue;
      seenFeeds.add(feedUrl);
      const art = String(item.artworkUrl600 || item.artworkUrl100 || '').trim();
      if (!art) continue;
      shows.push({
        id: `pod-${item.collectionId || item.trackId || crypto.createHash('md5').update(feedUrl).digest('hex').slice(0, 8)}`,
        title: String(item.collectionName || item.trackName || 'Podcast').trim(),
        author: String(item.artistName || 'Podcast Online').trim(),
        artwork: art,
        artworkXl: String(item.artworkUrl600 || art).trim(),
        feedUrl,
        genre: String(item.primaryGenreName || 'Podcast').trim(),
        trackCount: Number(item.trackCount || 0),
        country: String(item.country || safeCountry),
      });
    }
    if (shows.length > 0) {
      searchCache.set(key, shows);
    }
    return shows;
  } catch {
    return [];
  }
}

export async function getPodcastHomeSections(): Promise<{
  featured: PodcastShow[];
  techAndScience: PodcastShow[];
}> {
  const cached = homeCache.get('home');
  if (cached) return cached;

  const featuredTerms = [
    'The Wild Project',
    'Nadie Sabe Nada',
    'Estirando el chicle',
    'La Ruina',
    'El Partidazo de COPE',
    'Territorio Revival',
    'XRey',
    'Hotel Jorge Juan',
  ];
  const techTerms = [
    'Lex Fridman Podcast',
    'Joe Rogan Experience',
    'BBC Global News Podcast',
    'Mixx.io',
    'Cuonda Tecnologia',
    'Coffee Break Senal y Ruido',
  ];

  const collectFromTerms = async (terms: string[], country: string): Promise<PodcastShow[]> => {
    const settled = await Promise.allSettled(terms.map((t) => searchPodcasts(t, country, 2)));
    const out: PodcastShow[] = [];
    const seen = new Set<string>();
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      const first = r.value[0];
      if (!first || seen.has(first.feedUrl)) continue;
      seen.add(first.feedUrl);
      out.push(first);
    }
    return out;
  };

  const [featured, techAndScience] = await Promise.all([
    collectFromTerms(featuredTerms, 'ES'),
    collectFromTerms(techTerms, 'US'),
  ]);

  const payload = { featured, techAndScience };
  if (featured.length > 0 || techAndScience.length > 0) {
    homeCache.set('home', payload);
  }
  return payload;
}

export async function fetchPodcastEpisodes(params: {
  feedUrl: string;
  showTitle?: string;
  author?: string;
  cover?: string;
  limit?: number;
}): Promise<MusicTrack[]> {
  const rawFeed = String(params.feedUrl || '').trim();
  if (!rawFeed) return [];

  const check = await validateSafeOutboundUrl(rawFeed);
  if (!check.safe) {
    throw new Error(check.reason || 'Feed RSS bloqueado por seguridad SSRF');
  }

  const limit = Math.min(60, Math.max(1, params.limit || 25));
  const cacheKey = `${check.url.toString()}::${limit}`;
  const cached = episodesCache.get(cacheKey);
  if (cached) return cached;

  const { response } = await safeFetchFollowingRedirects(check.url.toString(), {
    headers: {
      'User-Agent': UA,
      Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
    signal: AbortSignal.timeout(7500),
  });

  if (!response.ok) {
    void response.body?.cancel?.().catch(() => {});
    return [];
  }

  const xml = await response.text();
  const channelHead = xml.split(/<item[\s>]/i)[0] || '';
  const showTitle = params.showTitle || extractTag(channelHead, 'title') || 'Podcast Online';
  const showAuthor =
    params.author || extractTag(channelHead, 'itunes:author') || showTitle;

  let showCover = params.cover || '';
  if (!showCover) {
    const itunesImgTag = channelHead.match(/<itunes:image\b[^>]*>/i)?.[0] || '';
    showCover = extractAttr(itunesImgTag, 'href') || extractTag(channelHead, 'url');
  }

  const feedHash = crypto.createHash('md5').update(check.url.toString()).digest('hex').slice(0, 10);
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const tracks: MusicTrack[] = [];

  for (let i = 0; i < itemMatches.length && tracks.length < limit; i++) {
    const block = itemMatches[i];
    const encMatch = block.match(/<enclosure\b[^>]*>/i);
    if (!encMatch) continue;
    const enclosureUrl = extractAttr(encMatch[0], 'url');
    if (!/^https?:\/\//i.test(enclosureUrl)) continue;

    const encType = extractAttr(encMatch[0], 'type').toLowerCase();
    if (encType && !encType.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|opus)(\?|$)/i.test(enclosureUrl)) {
      continue;
    }

    const epTitle = extractTag(block, 'title') || `Episodio ${i + 1}`;
    const durationRaw = extractTag(block, 'itunes:duration');
    const epImgTag = block.match(/<itunes:image\b[^>]*>/i)?.[0] || '';
    const epCover = extractAttr(epImgTag, 'href') || showCover;
    const epHash = crypto
      .createHash('md5')
      .update(`${feedHash}:${enclosureUrl}`)
      .digest('hex')
      .slice(0, 10);

    tracks.push({
      id: `pod-ep-${feedHash}-${epHash}`,
      title: epTitle,
      artist: {
        id: `pod-artist-${feedHash}`,
        name: showAuthor,
        picture: showCover || epCover || undefined,
      },
      album: {
        id: `pod-show-${feedHash}`,
        title: showTitle,
        cover: epCover || showCover,
        coverXl: epCover || showCover,
      },
      durationSec: parseItunesDurationSec(durationRaw),
      source: 'podcast',
      streamUrl: enclosureUrl,
      previewUrl: enclosureUrl,
    });
  }

  if (tracks.length > 0) {
    episodesCache.set(cacheKey, tracks);
  }
  return tracks;
}
