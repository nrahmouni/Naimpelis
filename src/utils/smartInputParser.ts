/**
 * Universal Smart Input Parser (F1 / F5)
 * Auto-detects whether pasted input is:
 * - Room invite URL or 4-6 char room code
 * - YouTube video/short/live URL or 11-char ID
 * - Direct HLS (.m3u8) / MP4 / WebM video stream URL
 * - General web page URL (routed through isolated extraction or cloud session)
 * - Plain catalog search query
 */

export type ParsedSmartInput =
  | { kind: 'room_code'; roomId: string }
  | { kind: 'youtube'; videoId: string; url: string }
  | { kind: 'direct_stream'; url: string; streamFormat: 'hls' | 'mp4' }
  | { kind: 'web_url'; url: string }
  | { kind: 'search_query'; query: string };

const YOUTUBE_URL_RE =
  /(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

export function parseSmartUserInput(rawInput: string): ParsedSmartInput {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { kind: 'search_query', query: '' };
  }

  // 1. Check YouTube link first
  const ytMatch = trimmed.match(YOUTUBE_URL_RE);
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return {
      kind: 'youtube',
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  // 2. Check Direct Stream URL (.m3u8 / .mp4 / .webm / stream_tv=)
  if (/^https?:\/\//i.test(trimmed)) {
    if (/\.m3u8(\?|$|#)|stream_tv=/i.test(trimmed)) {
      return { kind: 'direct_stream', url: trimmed, streamFormat: 'hls' };
    }
    if (/\.(mp4|webm|m4v)(\?|$|#)/i.test(trimmed)) {
      return { kind: 'direct_stream', url: trimmed, streamFormat: 'mp4' };
    }

    // 3. Check if it's an invite link to a NAIM CINE room
    try {
      const parsed = new URL(trimmed);
      const roomParam = parsed.searchParams.get('room');
      if (roomParam && /^[a-z0-9-_]{2,32}$/i.test(roomParam)) {
        return { kind: 'room_code', roomId: roomParam.toLowerCase() };
      }
      const segments = parsed.pathname.split('/').filter(Boolean);
      const lastSeg = segments[segments.length - 1] || '';
      if (
        (parsed.hostname.includes('naimcine') ||
          parsed.hostname.includes('run.app') ||
          parsed.hostname === 'localhost') &&
        lastSeg &&
        lastSeg !== 'tv' &&
        lastSeg !== 'ads' &&
        /^[a-z0-9-_]{3,16}$/i.test(lastSeg)
      ) {
        return { kind: 'room_code', roomId: lastSeg.toLowerCase() };
      }
    } catch {
      // fall through
    }

    return { kind: 'web_url', url: trimmed };
  }

  // 4. Short plain room code token like "#k8x4" or "a8f2" (only when 4 chars alphanumeric or starts with #)
  if (/^#[a-z0-9-_]{3,12}$/i.test(trimmed)) {
    return { kind: 'room_code', roomId: trimmed.slice(1).toLowerCase() };
  }

  return { kind: 'search_query', query: trimmed };
}
