import type { MusicTrack } from '../types/music';
import { resolvePublicLinkOrigin } from './shortLink';

export function normalizeMusicText(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const VARIANT_PAREN_RE =
  /\(([^)]*(?:\bremaster(?:ed)?\b|\blive\b|\ben vivo\b|\bacoustic\b|\bacustico\b|\bdeluxe\b|\bradio\s*edit\b|\bclean\b|\bexplicit\b|\balbum\s*version\b|\bsingle\s*version\b|\boriginal\s*mix\b|\bofficial(?:\s+(?:audio|video|lyric\s*video|mv))?\b|\bvisualizer\b|\bbonus\s*track\b|\bversion\b|\bedit\b|\bmono\b|\bstereo\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)[^)]*)\)/gi;

const VARIANT_BRACKET_RE =
  /\[([^\]]*(?:\bremaster(?:ed)?\b|\blive\b|\ben vivo\b|\bacoustic\b|\bdeluxe\b|\bradio\s*edit\b|\bclean\b|\bexplicit\b|\bofficial(?:\s+(?:audio|video|lyric\s*video|mv))?\b|\bvisualizer\b|\bbonus\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)[^\]]*)\]/gi;

export function stripTrackVariantTags(rawTitle: string): string {
  let cleaned = String(rawTitle || '').trim();
  if (!cleaned) return '';
  cleaned = cleaned
    .replace(VARIANT_PAREN_RE, ' ')
    .replace(VARIANT_BRACKET_RE, ' ')
    .replace(/\s+-\s+(?:remaster(?:ed)?(?:\s+\d{4})?|live(?:\s+at.*)?|en\s+vivo.*|acoustic|radio\s*edit|clean|explicit|deluxe(?:\s+edition)?|album\s*version|single\s*version|mono|stereo)\b.*$/i, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizeMusicText(cleaned);
}

export function getPrimaryMusicArtist(rawArtist: string): string {
  const firstSegment = String(rawArtist || '')
    .split(/,|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\s+&\s+|\s+x\s+|\//i)[0]
    .trim();
  return normalizeMusicText(firstSegment || rawArtist);
}

export function getTrackDedupeKey(track: Pick<MusicTrack, 'title' | 'artist'>): string {
  const canonicalTitle = stripTrackVariantTags(track.title);
  const canonicalArtist = getPrimaryMusicArtist(track.artist?.name || '');
  return `${canonicalTitle}|${canonicalArtist}`;
}

export function isSameMusicTrackVariant(a: MusicTrack, b: MusicTrack): boolean {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.spotifyId && b.spotifyId && a.spotifyId === b.spotifyId) return true;
  if (a.isrc && b.isrc && a.isrc.trim().toLowerCase() === b.isrc.trim().toLowerCase()) {
    return true;
  }
  const keyA = getTrackDedupeKey(a);
  const keyB = getTrackDedupeKey(b);
  const [titleA, artistA] = keyA.split('|');
  const [titleB, artistB] = keyB.split('|');
  if (!titleA || !titleB) return false;
  if (titleA !== titleB) return false;
  if (artistA && artistB && artistA !== artistB) return false;
  return true;
}

function trackMetadataScore(t: MusicTrack): number {
  let score = 0;
  if (t.album?.coverXl) score += 3;
  else if (t.album?.cover) score += 2;
  if (t.previewUrl) score += 2;
  if (t.durationSec > 0) score += 1;
  if (t.isrc) score += 1;
  if (t.youtubeVideoId) score += 1;
  return score;
}

export function dedupeMusicTracks(tracks: MusicTrack[]): MusicTrack[] {
  const result: MusicTrack[] = [];
  const indexByKey = new Map<string, number>();
  const indexById = new Map<string, number>();

  for (const track of tracks) {
    if (!track || !track.title?.trim()) continue;
    const idIdx = track.id ? indexById.get(track.id) : undefined;
    const key = getTrackDedupeKey(track);
    const keyIdx = key !== '|' ? indexByKey.get(key) : undefined;
    const existingIdx = idIdx ?? keyIdx;

    if (existingIdx !== undefined) {
      const existing = result[existingIdx];
      if (trackMetadataScore(track) > trackMetadataScore(existing)) {
        result[existingIdx] = track;
      }
      continue;
    }

    const pos = result.length;
    result.push(track);
    if (track.id) indexById.set(track.id, pos);
    if (key !== '|') indexByKey.set(key, pos);
  }

  return result;
}

function toBase64UrlUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64UrlUtf8(encoded: string): string {
  const norm = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? norm : norm + '='.repeat(4 - (norm.length % 4));
  if (typeof atob === 'function') {
    const bin = atob(pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(pad, 'base64').toString('utf8');
}

interface CompactSharedTrack {
  id: string;
  t: string;
  a: string;
  al?: string;
  d?: number;
  c?: string;
  yt?: string;
  au?: string;
  sc?: string;
  sp?: string;
}

export function encodeMusicTrackShare(track: MusicTrack): string {
  const payload: CompactSharedTrack = {
    id: track.id,
    t: track.title,
    a: track.artist?.name || 'Artista',
  };
  if (track.album?.title) payload.al = track.album.title;
  if (track.durationSec > 0) payload.d = Math.round(track.durationSec);
  const cover = track.album?.coverXl || track.album?.cover;
  if (cover) payload.c = cover;
  if (track.youtubeVideoId) payload.yt = track.youtubeVideoId;
  if (track.audiusId) payload.au = track.audiusId;
  if (track.soundcloudId) payload.sc = track.soundcloudId;
  if (track.spotifyId) payload.sp = track.spotifyId;
  return toBase64UrlUtf8(JSON.stringify(payload));
}

export function decodeMusicTrackShare(rawParam: string): MusicTrack | null {
  const clean = String(rawParam || '').trim();
  if (!clean) return null;
  try {
    const json = fromBase64UrlUtf8(clean);
    const parsed = JSON.parse(json) as Partial<CompactSharedTrack>;
    if (!parsed || typeof parsed.t !== 'string' || !parsed.t.trim()) return null;
    const cover = typeof parsed.c === 'string' ? parsed.c : '';
    return {
      id: typeof parsed.id === 'string' && parsed.id ? parsed.id : `share-${Date.now().toString(36)}`,
      title: parsed.t.trim(),
      artist: {
        id: 'shared-artist',
        name: typeof parsed.a === 'string' && parsed.a.trim() ? parsed.a.trim() : 'Artista',
        picture: cover,
      },
      album: {
        id: 'shared-album',
        title: typeof parsed.al === 'string' ? parsed.al : '',
        cover,
        coverXl: cover,
      },
      durationSec: typeof parsed.d === 'number' && parsed.d > 0 ? parsed.d : 0,
      youtubeVideoId: typeof parsed.yt === 'string' ? parsed.yt : undefined,
      audiusId: typeof parsed.au === 'string' ? parsed.au : undefined,
      soundcloudId: typeof parsed.sc === 'string' ? parsed.sc : undefined,
      spotifyId: typeof parsed.sp === 'string' ? parsed.sp : undefined,
    };
  } catch {
    return null;
  }
}

export function buildMusicTrackShareUrl(track: MusicTrack, origin?: string): string {
  const base = (origin || resolvePublicLinkOrigin()).replace(/\/+$/, '');
  const encoded = encodeMusicTrackShare(track);
  return `${base}/musica?track=${encodeURIComponent(encoded)}`;
}

export function buildMusicQueryShareUrl(query: string, origin?: string): string {
  const base = (origin || resolvePublicLinkOrigin()).replace(/\/+$/, '');
  return `${base}/musica?musicq=${encodeURIComponent(query.trim())}`;
}

export async function shareMusicLink(opts: {
  url: string;
  title: string;
  text?: string;
}): Promise<{ url: string; shared: boolean; copied: boolean }> {
  const isTouchMobile =
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    Boolean(
      window.matchMedia?.('(pointer: coarse)').matches &&
        window.matchMedia?.('(max-width: 768px)').matches &&
        typeof navigator.share === 'function'
    );

  if (isTouchMobile) {
    try {
      await navigator.share({
        title: opts.title,
        text: opts.text || opts.title,
        url: opts.url,
      });
      return { url: opts.url, shared: true, copied: true };
    } catch (err) {
      if (err && typeof err === 'object' && (err as Error).name === 'AbortError') {
        return { url: opts.url, shared: false, copied: false };
      }
    }
  }

  let copied = false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(opts.url);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied && typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = opts.url;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      copied = false;
    }
  }
  return { url: opts.url, shared: false, copied };
}
