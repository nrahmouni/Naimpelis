export interface IndexableSearchEntry {
  id: string;
  kind: 'movie' | 'series' | 'tdt' | 'sports' | 'catala';
  title: string;
  subtitle?: string;
  tags?: string;
}

export interface WorkerSearchRequest {
  requestId: number;
  query: string;
  items: IndexableSearchEntry[];
  limit?: number;
}

export interface WorkerSearchResponse {
  requestId: number;
  matchedIds: string[];
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

self.onmessage = (event: MessageEvent<WorkerSearchRequest>) => {
  const { requestId, query, items, limit = 24 } = event.data;
  const q = normalizeText(query);
  if (!q) {
    const res: WorkerSearchResponse = { requestId, matchedIds: items.slice(0, limit).map((i) => i.id) };
    self.postMessage(res);
    return;
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ id: string; score: number }> = [];

  for (const item of items) {
    const titleNorm = normalizeText(item.title);
    const subNorm = normalizeText(`${item.subtitle || ''} ${item.tags || ''}`);
    const fullNorm = `${titleNorm} ${subNorm}`;

    let matchesAll = true;
    for (const tk of tokens) {
      if (!fullNorm.includes(tk)) {
        matchesAll = false;
        break;
      }
    }
    if (!matchesAll) continue;

    let score = 0;
    if (titleNorm === q) score += 100;
    else if (titleNorm.startsWith(q)) score += 60;
    else if (titleNorm.includes(q)) score += 40;
    else score += 15;

    scored.push({ id: item.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const res: WorkerSearchResponse = {
    requestId,
    matchedIds: scored.slice(0, limit).map((s) => s.id),
  };
  self.postMessage(res);
};
