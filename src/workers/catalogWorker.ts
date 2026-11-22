/**
 * @module catalogWorker
 * @description Phase 3 Web Worker offloading heavy catalog filtering, M3U playlist parsing,
 * and channel relevance ranking from the main browser UI thread so 60fps scrolling & video stay locked.
 */

export interface WorkerChannelItem {
  id: string;
  name?: string;
  title?: string;
  category?: string;
  country?: string;
  group?: string;
}

export interface CatalogWorkerRequest {
  id: number;
  type: 'FILTER_ITEMS' | 'PARSE_M3U';
  payload: {
    items?: WorkerChannelItem[];
    query?: string;
    category?: string;
    m3uText?: string;
  };
}

function normalizeStr(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterCatalogItemsSync<T extends WorkerChannelItem>(
  items: T[],
  query = '',
  category = 'all'
): T[] {
  const q = normalizeStr(query);
  const cat = normalizeStr(category);
  if (!q && (!cat || cat === 'all')) return items;

  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const itemCat = normalizeStr(String(item.category || item.group || ''));
    if (cat && cat !== 'all' && itemCat !== cat) continue;

    if (!q) {
      scored.push({ item, score: 1 });
      continue;
    }

    const label = normalizeStr(String(item.name || item.title || item.id || ''));
    if (label === q) scored.push({ item, score: 100 });
    else if (label.startsWith(q)) scored.push({ item, score: 80 });
    else if (label.includes(q)) scored.push({ item, score: 60 });
    else if (itemCat.includes(q)) scored.push({ item, score: 30 });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

export function parseM3uTextSync(m3uText: string): Array<{
  name: string;
  url: string;
  group?: string;
  logo?: string;
}> {
  const lines = String(m3uText || '').split(/\r?\n/);
  const entries: Array<{ name: string; url: string; group?: string; logo?: string }> = [];
  let pendingMeta: { name: string; group?: string; logo?: string } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.lastIndexOf(',');
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : 'Canal';
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      pendingMeta = {
        name: name || 'Canal',
        group: groupMatch?.[1],
        logo: logoMatch?.[1],
      };
    } else if (!line.startsWith('#') && /^https?:\/\//i.test(line)) {
      entries.push({
        name: pendingMeta?.name || 'Stream',
        url: line,
        group: pendingMeta?.group,
        logo: pendingMeta?.logo,
      });
      pendingMeta = null;
    }
  }
  return entries;
}

if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<CatalogWorkerRequest>) => {
    const req = event.data;
    if (!req) return;
    if (req.type === 'FILTER_ITEMS') {
      const result = filterCatalogItemsSync(
        req.payload.items || [],
        req.payload.query || '',
        req.payload.category || 'all'
      );
      self.postMessage({ id: req.id, ok: true, result });
      return;
    }
    if (req.type === 'PARSE_M3U') {
      const result = parseM3uTextSync(req.payload.m3uText || '');
      self.postMessage({ id: req.id, ok: true, result });
    }
  };
}
