import type { SpanishTdtChannel, StreamTrack } from '../types';

const CUSTOM_TDT_STORAGE_KEY = 'riffan_custom_tdt_sources_v1';

export interface CustomTdtBackupEntry {
  channelId: string;
  label: string;
  url: string;
  updatedAt: number;
}

function safeReadStore(): Record<string, CustomTdtBackupEntry[]> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_TDT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CustomTdtBackupEntry[]>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function safeWriteStore(data: Record<string, CustomTdtBackupEntry[]>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(CUSTOM_TDT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota failures
  }
}

export function normalizeCustomTdtStreamUrl(rawUrl: string): string | null {
  const clean = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(clean)) return null;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function getCustomTdtBackups(channelId: string): CustomTdtBackupEntry[] {
  const store = safeReadStore();
  const list = store[channelId];
  return Array.isArray(list) ? list.filter((e) => Boolean(e?.url)) : [];
}

export function saveCustomTdtBackup(
  channelId: string,
  rawUrl: string,
  label = 'Señal Privada HD (España / Respaldo)'
): { ok: boolean; entries: CustomTdtBackupEntry[]; error?: string } {
  const cleanUrl = normalizeCustomTdtStreamUrl(rawUrl);
  if (!cleanUrl) {
    return {
      ok: false,
      entries: getCustomTdtBackups(channelId),
      error: 'Introduce una URL http:// o https:// válida (.m3u8, HDHomeRun, TVHeadend o VPS).',
    };
  }
  const store = safeReadStore();
  const existing = Array.isArray(store[channelId]) ? store[channelId] : [];
  const filtered = existing.filter((e) => e.url !== cleanUrl);
  const next: CustomTdtBackupEntry[] = [
    {
      channelId,
      label: label.trim() || 'Señal Privada HD',
      url: cleanUrl,
      updatedAt: Date.now(),
    },
    ...filtered,
  ].slice(0, 4);
  store[channelId] = next;
  safeWriteStore(store);
  return { ok: true, entries: next };
}

export function removeCustomTdtBackup(channelId: string, urlToRemove: string): CustomTdtBackupEntry[] {
  const store = safeReadStore();
  const existing = Array.isArray(store[channelId]) ? store[channelId] : [];
  const next = existing.filter((e) => e.url !== urlToRemove);
  if (next.length === 0) {
    delete store[channelId];
  } else {
    store[channelId] = next;
  }
  safeWriteStore(store);
  return next;
}

export function mergeCustomTdtTracks(tdtCh: SpanishTdtChannel): SpanishTdtChannel {
  const customEntries = getCustomTdtBackups(tdtCh.id);
  if (customEntries.length === 0) return tdtCh;

  const customTracks: StreamTrack[] = customEntries.map((entry, idx) => ({
    id: `${tdtCh.id}-custom-${idx}`,
    label: entry.label || `Respaldo Privado ${idx + 1}`,
    lang: 'ES',
    quality: '1080p',
    sourceUrl: entry.url,
    resolverType: 'tdt_hls',
  }));

  const seenUrls = new Set(customTracks.map((t) => t.sourceUrl));
  const baseRemaining = (tdtCh.channels || []).filter((t) => !seenUrls.has(t.sourceUrl));
  return {
    ...tdtCh,
    channels: [...customTracks, ...baseRemaining],
  };
}

/**
 * Unwraps `/api/hls-proxy?url=...` and strips query profile tags so tracks pointing
 * to the same dead upstream DVB host/port fail over in 0ms without redundant timeouts.
 */
export function extractTrackHostKey(sourceUrl: string): string {
  const raw = String(sourceUrl || '').trim();
  if (!raw) return '';
  let target = raw;
  if (raw.startsWith('/api/hls-proxy')) {
    try {
      const inner = new URL(raw, 'http://localhost').searchParams.get('url');
      if (inner) target = inner;
    } catch {
      // ignore
    }
  }
  if (target.startsWith('/api/belix/stream/')) {
    return 'belix://xtream';
  }
  if (!/^https?:\/\//i.test(target)) return '';
  try {
    const parsed = new URL(target);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}`;
  } catch {
    return '';
  }
}
