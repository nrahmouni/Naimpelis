import { MAX_MULTI_SCREENS, type SecondaryStreamState, type StreamTrack } from '../../types';

export const MAX_SECONDARY_STREAMS = MAX_MULTI_SCREENS - 1; // 3 secondary + 1 primary = 4 screens max

export function isInstantDirectMultiStream(sourceUrl: string, resolverType: string): boolean {
  if (!sourceUrl) return false;
  if (/^\/api\/(?:hls-proxy|iptv\/live|dvb-live|vod-manifest|providers\/stream|belix\/stream)/i.test(sourceUrl)) {
    return true;
  }
  if (
    resolverType === 'tdt_hls' &&
    /^https:\/\/([^/]*\.)?(rtvelivestream\.rtve\.es|3catdirectes\.cat|eitb\.eus)\//i.test(
      sourceUrl
    )
  ) {
    return true;
  }
  return false;
}

export function inferResolverType(sourceUrl: string): StreamTrack['resolverType'] {
  if (/\.m3u8(\?|$)/i.test(sourceUrl)) return 'tdt_hls';
  if (/\.mp4(\?|$)/i.test(sourceUrl)) return 'direct_mp4';
  return 'sports_channel';
}

const multiExtractCache = new Map<
  string,
  { url: string; rawSourceUrl: string; mode: 'hls' | 'direct'; expiresAt: number }
>();

export function prioritizeFastMultiCandidates(urls: string[]): string[] {
  const unique = Array.from(new Set(urls.map((u) => String(u || '').trim()).filter(Boolean)));
  const rankUrl = (u: string): number => {
    const resolver = inferResolverType(u);
    if (isInstantDirectMultiStream(u, resolver)) return 0;
    if (/\.m3u8(\?|$)/i.test(u)) return 1;
    if (/streamxhd\.|futlivehd\./i.test(u)) return 2;
    if (/footunder\.online|tilinhd\./i.test(u)) return 4;
    return 3;
  };
  return unique
    .map((u, idx) => ({ u, idx, rank: rankUrl(u) }))
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
    .map((x) => x.u);
}

async function attemptExtractCandidate(opts: {
  candidateUrl: string;
  title: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{
  url: string;
  rawSourceUrl: string;
  mode: 'hls' | 'direct';
}> {
  const { candidateUrl, title, signal, timeoutMs = 15_000 } = opts;
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const resolver = inferResolverType(candidateUrl);
  if (isInstantDirectMultiStream(candidateUrl, resolver)) {
    return {
      url: candidateUrl,
      rawSourceUrl: candidateUrl,
      mode: resolver === 'direct_mp4' ? 'direct' : 'hls',
    };
  }

  const cached = multiExtractCache.get(candidateUrl);
  if (cached && cached.expiresAt > Date.now() && cached.url) {
    return {
      url: cached.url,
      rawSourceUrl: cached.rawSourceUrl,
      mode: cached.mode,
    };
  }

  const perAttemptCtrl = new AbortController();
  const timeoutId = setTimeout(() => perAttemptCtrl.abort(), timeoutMs);
  const onParentAbort = () => perAttemptCtrl.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const params = new URLSearchParams({
      url: candidateUrl,
      resolverType: resolver,
      title,
    });
    const res = await fetch(`/api/extract/stream?${params.toString()}`, {
      signal: perAttemptCtrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && data?.streamUrl) {
      const mode: 'hls' | 'direct' = data.mode === 'direct' ? 'direct' : 'hls';
      if (data.mode !== 'cloud') {
        if (multiExtractCache.size > 120) multiExtractCache.clear();
        multiExtractCache.set(candidateUrl, {
          url: String(data.streamUrl),
          rawSourceUrl: candidateUrl,
          mode,
          expiresAt: Date.now() + 90_000,
        });
      }
      return {
        url: String(data.streamUrl),
        rawSourceUrl: candidateUrl,
        mode,
      };
    }
    throw new Error(String(data?.error || 'No hay señal activa para esta retransmisión.'));
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

export async function extractLiveStreamWithFallbacks(opts: {
  sourceUrl: string;
  fallbackUrls?: string[];
  title: string;
  signal?: AbortSignal;
  hedgeDelayMs?: number;
}): Promise<{
  url: string;
  rawSourceUrl: string;
  mode: 'hls' | 'direct';
}> {
  const candidates = prioritizeFastMultiCandidates([opts.sourceUrl, ...(opts.fallbackUrls || [])]);
  if (candidates.length === 0) {
    throw new Error('No hay señal activa para esta retransmisión.');
  }

  const hedgeDelayMs = opts.hedgeDelayMs ?? 1400;
  let lastError = 'No hay señal activa para esta retransmisión.';

  if (candidates.length >= 2) {
    const hedgeCtrl = new AbortController();
    const onParentAbort = () => hedgeCtrl.abort();
    opts.signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const p0 = attemptExtractCandidate({
        candidateUrl: candidates[0],
        title: opts.title,
        signal: hedgeCtrl.signal,
      });

      const quickWin = await new Promise<
        | { kind: 'win'; value: { url: string; rawSourceUrl: string; mode: 'hls' | 'direct' } }
        | { kind: 'hedge'; p0Settled: boolean; p0Err?: unknown }
      >((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve({ kind: 'hedge', p0Settled: false });
          }
        }, hedgeDelayMs);

        p0.then(
          (value) => {
            clearTimeout(timer);
            if (!settled) {
              settled = true;
              resolve({ kind: 'win', value });
            }
          },
          (err) => {
            clearTimeout(timer);
            if (!settled) {
              settled = true;
              resolve({ kind: 'hedge', p0Settled: true, p0Err: err });
            }
          }
        );
      });

      if (quickWin.kind === 'win') {
        hedgeCtrl.abort();
        return quickWin.value;
      }

      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (quickWin.p0Err instanceof Error && quickWin.p0Err.message) {
        lastError = quickWin.p0Err.message;
      }

      const p1 = attemptExtractCandidate({
        candidateUrl: candidates[1],
        title: opts.title,
        signal: hedgeCtrl.signal,
      });

      const racers = quickWin.p0Settled ? [p1] : [p0, p1];
      try {
        const winner = await Promise.any(racers);
        hedgeCtrl.abort();
        return winner;
      } catch (aggErr: unknown) {
        if (opts.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const firstErr =
          aggErr instanceof AggregateError && aggErr.errors.length > 0
            ? aggErr.errors[aggErr.errors.length - 1]
            : aggErr;
        if (firstErr instanceof Error && firstErr.message && firstErr.name !== 'AbortError') {
          lastError = firstErr.message;
        }
      }
    } finally {
      opts.signal?.removeEventListener('abort', onParentAbort);
    }
  } else {
    try {
      return await attemptExtractCandidate({
        candidateUrl: candidates[0],
        title: opts.title,
        signal: opts.signal,
      });
    } catch (err: unknown) {
      if (opts.signal?.aborted) throw err;
      if (err instanceof Error && err.message && err.name !== 'AbortError') {
        lastError = err.message;
      }
    }
  }

  for (const candidateUrl of candidates.slice(2)) {
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await attemptExtractCandidate({
        candidateUrl,
        title: opts.title,
        signal: opts.signal,
      });
    } catch (err: unknown) {
      if (opts.signal?.aborted) throw err;
      if (err instanceof Error && err.message && err.name !== 'AbortError') {
        lastError = err.message;
      }
    }
  }

  throw new Error(lastError);
}

/**
 * Adds or updates a secondary stream slot (max 3 secondary screens => 4 total).
 * Forces 'split' grid mode whenever 2+ secondary streams exist (3+ total screens).
 */
export function upsertSecondaryStreamList(
  prev: SecondaryStreamState[],
  nextStream: SecondaryStreamState,
  opts?: {
    preferredSlotIndex?: number; // 1, 2, or 3 (screen #2, #3, or #4)
    activeAudioSlot?: number;
  }
): { list: SecondaryStreamState[]; assignedSlot: number; duplicateFound: boolean } {
  const existingIdx = prev.findIndex((s) => {
    if (s.matchId && nextStream.matchId) {
      return s.matchId === nextStream.matchId;
    }
    return Boolean(s.rawSourceUrl && nextStream.rawSourceUrl && s.rawSourceUrl === nextStream.rawSourceUrl);
  });

  if (existingIdx >= 0) {
    const updated = prev.map((item, idx) =>
      idx === existingIdx
        ? {
            ...nextStream,
            id: item.id,
            layout: prev.length >= 2 ? 'split' : nextStream.layout,
          }
        : item
    );
    return {
      list: updated,
      assignedSlot: existingIdx + 1,
      duplicateFound: true,
    };
  }

  let nextList = [...prev];
  let assignedSecIdx: number;

  if (
    typeof opts?.preferredSlotIndex === 'number' &&
    opts.preferredSlotIndex >= 1 &&
    opts.preferredSlotIndex <= MAX_SECONDARY_STREAMS
  ) {
    const requestedSecIdx = opts.preferredSlotIndex - 1;
    if (requestedSecIdx < nextList.length) {
      nextList[requestedSecIdx] = nextStream;
      assignedSecIdx = requestedSecIdx;
    } else {
      nextList.push(nextStream);
      assignedSecIdx = nextList.length - 1;
    }
  } else if (nextList.length < MAX_SECONDARY_STREAMS) {
    nextList.push(nextStream);
    assignedSecIdx = nextList.length - 1;
  } else {
    // Full (already 4 screens total): replace the last slot unless audio is focused on slot 3
    const replaceIdx = opts?.activeAudioSlot === 3 ? 1 : MAX_SECONDARY_STREAMS - 1;
    nextList[replaceIdx] = nextStream;
    assignedSecIdx = replaceIdx;
  }

  nextList = nextList.slice(0, MAX_SECONDARY_STREAMS);
  if (nextList.length >= 2 || nextStream.layout === 'split') {
    nextList = nextList.map((s) => ({ ...s, layout: 'split' }));
  }

  return {
    list: nextList,
    assignedSlot: assignedSecIdx + 1,
    duplicateFound: false,
  };
}

export function removeSecondaryStreamAt(
  prev: SecondaryStreamState[],
  slotIdx: number | undefined,
  currentAudioSlot: number
): { list: SecondaryStreamState[]; nextAudioSlot: number } {
  if (slotIdx === undefined) {
    return { list: [], nextAudioSlot: 0 };
  }
  if (slotIdx < 0 || slotIdx >= prev.length) {
    return { list: prev, nextAudioSlot: currentAudioSlot };
  }
  const nextList = prev.filter((_, idx) => idx !== slotIdx);
  const removedHumanSlot = slotIdx + 1;
  let nextAudioSlot = currentAudioSlot;
  if (currentAudioSlot === removedHumanSlot) {
    nextAudioSlot = 0;
  } else if (currentAudioSlot > removedHumanSlot) {
    nextAudioSlot = currentAudioSlot - 1;
  }
  if (nextAudioSlot > nextList.length) {
    nextAudioSlot = 0;
  }
  return { list: nextList, nextAudioSlot };
}
