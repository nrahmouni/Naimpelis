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

export async function extractLiveStreamWithFallbacks(opts: {
  sourceUrl: string;
  fallbackUrls?: string[];
  title: string;
  signal?: AbortSignal;
}): Promise<{
  url: string;
  rawSourceUrl: string;
  mode: 'hls' | 'direct';
}> {
  const candidates = Array.from(
    new Set([opts.sourceUrl, ...(opts.fallbackUrls || [])].map((u) => String(u || '').trim()).filter(Boolean))
  );

  let lastError = 'No hay señal activa para esta retransmisión.';

  for (const candidateUrl of candidates) {
    if (opts.signal?.aborted) {
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

    const perAttemptCtrl = new AbortController();
    const timeoutId = setTimeout(() => perAttemptCtrl.abort(), 10_000);
    const onParentAbort = () => perAttemptCtrl.abort();
    opts.signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const params = new URLSearchParams({
        url: candidateUrl,
        resolverType: resolver,
        title: opts.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, {
        signal: perAttemptCtrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.streamUrl) {
        return {
          url: String(data.streamUrl),
          rawSourceUrl: candidateUrl,
          mode: data.mode === 'direct' ? 'direct' : 'hls',
        };
      }
      if (data?.error) lastError = String(data.error);
    } catch (err: unknown) {
      if (opts.signal?.aborted) {
        throw err;
      }
      if (err instanceof Error && err.name !== 'AbortError') {
        lastError = err.message || lastError;
      }
    } finally {
      clearTimeout(timeoutId);
      opts.signal?.removeEventListener('abort', onParentAbort);
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
