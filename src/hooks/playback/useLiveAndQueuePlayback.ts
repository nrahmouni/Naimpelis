import { socketService } from '../../services/socket';
import { playCinemaSound } from '../../utils/haptics';
import { isAbortError } from '../../utils/appSessionHelpers';
import type {
  CatalogMovie,
  FavoriteChannelItem,
  SpanishTdtChannel,
  SportsMatch,
  StreamTrack,
  VideoState,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../../types';
import type { PlaybackCoreContext } from './playbackTypes';
import { createTrackAndQueuePlaybackHandlers } from './useTrackAndQueuePlayback';
import { extractTrackHostKey, mergeCustomTdtTracks } from '../../utils/customTdtSources';

interface LiveQueueExtras {
  handlePlayMovie: (
    movie: CatalogMovie,
    preferLang?: string,
    startOrOpts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => Promise<void>;
  handleReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => Promise<void>;
  handlePlayYouTubeVideo: (item: YouTubeSearchItem) => void;
}

interface CachedLiveExtract {
  streamUrl: string;
  mode?: VideoState['mode'];
  expiresAt: number;
}

const liveExtractClientCache = new Map<string, CachedLiveExtract>();

function getClientExtractCacheKey(resolverType: string, sourceUrl: string): string {
  return `${resolverType || 'tdt_hls'}|${sourceUrl || ''}`;
}

function getCachedClientExtract(resolverType: string, sourceUrl: string): CachedLiveExtract | null {
  const key = getClientExtractCacheKey(resolverType, sourceUrl);
  const hit = liveExtractClientCache.get(key);
  if (hit && hit.expiresAt > Date.now() && hit.streamUrl) {
    return hit;
  }
  if (hit) liveExtractClientCache.delete(key);
  return null;
}

function setCachedClientExtract(
  resolverType: string,
  sourceUrl: string,
  streamUrl: string,
  mode?: VideoState['mode']
): void {
  if (!streamUrl) return;
  if (liveExtractClientCache.size > 160) {
    const firstKey = liveExtractClientCache.keys().next().value;
    if (firstKey) liveExtractClientCache.delete(firstKey);
  }
  liveExtractClientCache.set(getClientExtractCacheKey(resolverType, sourceUrl), {
    streamUrl,
    mode,
    expiresAt: Date.now() + 90_000,
  });
}

function isInstantDirectTdtStream(sourceUrl: string, resolverType: string): boolean {
  if (!sourceUrl) return false;
  if (/^\/api\/(?:hls-proxy|iptv\/live|dvb-live|vod-manifest|providers\/live)/i.test(sourceUrl)) {
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

async function fetchFastProviderLiveSignals(
  title: string,
  parentSignal?: AbortSignal,
  timeoutMs = 1800
): Promise<StreamTrack[]> {
  const cleanTitle = String(title || '').trim();
  if (cleanTitle.length < 2) return [];
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (parentSignal) {
    if (parentSignal.aborted) return [];
    parentSignal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = globalThis.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/api/providers/fast-live-signal?title=${encodeURIComponent(cleanTitle)}&limit=4`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; tracks?: StreamTrack[] }
      | null;
    if (!json?.success || !Array.isArray(json.tracks)) return [];
    return json.tracks.filter(
      (t): t is StreamTrack => Boolean(t && typeof t.sourceUrl === 'string' && t.sourceUrl)
    );
  } catch {
    return [];
  } finally {
    globalThis.clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener('abort', onAbort);
  }
}

export function useLiveAndQueuePlayback(
  ctx: PlaybackCoreContext,
  vodHandlers: LiveQueueExtras
) {
  const {
    opts,
    extractionReqSeqRef,
    activeHistoryIdRef,
    beginMediaExtraction,
    clearExtractionSnapshot,
    setExtractionLabel,
    setExtractionError,
    setLoadingItemId,
    commitVideoStateSync,
  } = ctx;

  const {
    sessionMode,
    profileName,
    canChangeMedia,
    hostId,
    participants,
    setVideoState,
    videoStateUrlRef,
    setIsExtracting,
    isExtractingRef,
    setActiveSportsMatch,
    setActiveMatchDetails,
    setShowLiveMatchDock,
    setActiveMovieContext,
    showHostLockNotice,
    scrollDesktopToPlayer,
  } = opts;

  const handlePlaySportsMatch = async (
    match: SportsMatch,
    channelIndex: number,
    failedIndices: Set<number> = new Set(),
    activeExtraction?: { reqSeq: number; signal: AbortSignal },
    allowSameMatchMirrorFallback = true
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const channel = match.channels[channelIndex];
    if (!channel) {
      setExtractionError('Este partido aún no tiene señal directa activa.');
      return;
    }

    const extraction = activeExtraction || beginMediaExtraction();
    const { reqSeq, signal } = extraction;

    if (failedIndices.size === 0) {
      setActiveMovieContext(null);
      setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
      const parsedTeams = (() => {
        if (match.matchMeta) {
          return { ...match.matchMeta, competition: match.competition };
        }
        if (match.sport === 'soccer' && !match.is247Channel) {
          const clean = match.title.replace(/\s+·\s+.*$/, '').trim();
          const parts = clean.split(/\s+(?:vs\.?|v)\s+/i);
          if (parts.length === 2 && parts[0].trim().length >= 2 && parts[1].trim().length >= 2) {
            return {
              homeTeam: parts[0].trim(),
              awayTeam: parts[1].trim(),
              competition: match.competition,
            };
          }
        }
        return null;
      })();
      if (parsedTeams) {
        setActiveSportsMatch(parsedTeams);
        setActiveMatchDetails(null);
        setShowLiveMatchDock(true);
      } else {
        setActiveSportsMatch(null);
        setActiveMatchDetails(null);
      }
    }

    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(`${match.id}-${channelIndex}`);
    setExtractionError(null);
    setExtractionLabel(`${match.title} · Conectando ${channel.label}...`);
    activeHistoryIdRef.current = null;
    const fastLivePromise =
      failedIndices.size === 0
        ? fetchFastProviderLiveSignals(match.title, signal, 1800)
        : Promise.resolve<StreamTrack[]>([]);

    try {
      const sportsResolver = channel.resolverType || 'sports_channel';
      let data: {
        success?: boolean;
        streamUrl?: string;
        mode?: VideoState['mode'] | 'cloud';
        canUseCloudBrowser?: boolean;
        error?: string;
      } | null = null;
      let resOk = false;

      if (channel.resolvedStreamUrl) {
        data = { success: true, streamUrl: channel.resolvedStreamUrl, mode: 'hls' };
        resOk = true;
      } else {
        const cachedSports = getCachedClientExtract(sportsResolver, channel.sourceUrl);
        if (cachedSports) {
          data = { success: true, streamUrl: cachedSports.streamUrl, mode: cachedSports.mode || 'hls' };
          resOk = true;
        } else {
          const params = new URLSearchParams({
            url: channel.sourceUrl,
            resolverType: sportsResolver,
            title: match.title,
          });
          const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
          resOk = res.ok;
          data = await res.json().catch(() => null);
          if (resOk && data?.success && data.streamUrl && data.mode !== 'cloud') {
            setCachedClientExtract(sportsResolver, channel.sourceUrl, data.streamUrl, data.mode);
          }
        }
      }
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!resOk || !data?.success || !data?.streamUrl) {
        if (allowSameMatchMirrorFallback && match.channels.length > 1) {
          const nextFailed = new Set(failedIndices);
          nextFailed.add(channelIndex);
          const remaining = match.channels
            .map((ch, idx) => ({ ch, idx }))
            .filter(({ idx }) => !nextFailed.has(idx));
          const satCandidate = remaining.find(({ ch }) =>
            /sat|1080p|dazn|\.m3u8|pig\.footunder/i.test(`${ch.label || ''} ${ch.sourceUrl || ''}`)
          );
          const nextIdx = satCandidate ? satCandidate.idx : (remaining[0]?.idx ?? -1);
          if (nextIdx !== -1) {
            await handlePlaySportsMatch(match, nextIdx, nextFailed, extraction, true);
            return;
          }
        }

        if (failedIndices.size === 0) {
          const fastFallback = await fastLivePromise;
          if (reqSeq !== extractionReqSeqRef.current) return;
          if (fastFallback.length > 0 && fastFallback[0].sourceUrl) {
            const firstFast = fastFallback[0];
            const nextState: VideoState = {
              mode: 'hls',
              url: firstFast.sourceUrl,
              rawSourceUrl: firstFast.sourceUrl,
              title: match.title,
              subtitle: `${match.competition} · ${firstFast.label}`,
              currentTime: 0,
              isPlaying: true,
              isLive: true,
              tracks: fastFallback,
              activeTrackIndex: 0,
              seriesMeta: undefined,
              lastUpdated: Date.now(),
              updatedBy: profileName,
            };
            clearExtractionSnapshot();
            videoStateUrlRef.current = nextState.url;
            setVideoState(nextState);
            commitVideoStateSync('change_url', nextState);
            playCinemaSound('play');
            return;
          }
        }

        if (
          data?.canUseCloudBrowser === false ||
          /footunder\.online|tilinhd|streamxhd|rojadirectv/i.test(channel.sourceUrl)
        ) {
          setExtractionError(
            data?.error ||
              `La señal "${channel.label}" de ${match.title} no está disponible en este momento. Elige otra opción del partido o canal.`
          );
          return;
        }

        setExtractionError(
          data?.error ||
            `La señal "${channel.label}" no responde en este instante. Prueba otra opción disponible.`
        );
        return;
      }

      if (data.mode === 'cloud') {
        if (/footunder\.online|tilinhd|streamxhd/i.test(data.streamUrl || channel.sourceUrl)) {
          setExtractionError('Señal temporalmente fuera de servicio.');
          return;
        }
        clearExtractionSnapshot();
        if (sessionMode === 'solo') {
          setExtractionError('Esta señal web requiere sala en vivo. Pulsa «Ver con amigos» o prueba otra señal.');
          return;
        }
        socketService.startCloudBrowser(data.streamUrl, profileName);
        return;
      }

      const fastExtras = await Promise.race([
        fastLivePromise,
        new Promise<StreamTrack[]>((r) => globalThis.setTimeout(() => r([]), 150)),
      ]);
      const healthyChannels = [
        ...match.channels
          .map((c, idx) => (idx === channelIndex ? { ...c, resolvedStreamUrl: data.streamUrl } : c))
          .filter((_, idx) => !failedIndices.has(idx)),
        ...fastExtras,
      ];
      const activeIdxInHealthy = Math.max(
        0,
        healthyChannels.findIndex((c) => c.id === channel.id)
      );

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: channel.sourceUrl,
        title: match.title,
        subtitle: `${match.competition} · ${channel.label}`,
        currentTime: 0,
        isPlaying: true,
        isLive: true,
        tracks: healthyChannels,
        activeTrackIndex: activeIdxInHealthy,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('No se pudo conectar con la señal seleccionada.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handlePlayTdtChannel = async (
    tdtCh: SpanishTdtChannel,
    signalIndex = 0,
    liveProgramHint?: string,
    activeExtraction?: { reqSeq: number; signal: AbortSignal },
    allowSameChannelBackup = true,
    failedSignals: Set<number> = new Set()
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const effectiveTdtCh = failedSignals.size === 0 ? mergeCustomTdtTracks(tdtCh) : tdtCh;
    const chosenSignal = effectiveTdtCh.channels[signalIndex] || effectiveTdtCh.channels[0];
    if (!chosenSignal) return;

    const extraction = activeExtraction || beginMediaExtraction();
    const { reqSeq, signal } = extraction;

    if (allowSameChannelBackup) {
      setActiveMovieContext(null);
      setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
      const progParts = (liveProgramHint || '')
        .replace(/\s+·\s+.*$/, '')
        .split(/\s+(?:vs\.?|v)\s+/i);
      if (
        progParts.length === 2 &&
        progParts[0].trim().length >= 2 &&
        progParts[1].trim().length >= 2
      ) {
        setActiveSportsMatch({
          homeTeam: progParts[0].trim(),
          awayTeam: progParts[1].trim(),
          competition: tdtCh.name,
        });
        setActiveMatchDetails(null);
        setShowLiveMatchDock(true);
      } else {
        setActiveSportsMatch(null);
        setActiveMatchDetails(null);
      }
    }

    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(`tdt-${tdtCh.id}-${signalIndex}`);
    setExtractionError(null);
    setExtractionLabel(
      liveProgramHint
        ? `${effectiveTdtCh.name} · ${liveProgramHint}...`
        : `${effectiveTdtCh.name} · Conectando ${chosenSignal.label}...`
    );
    activeHistoryIdRef.current = null;

    const signalResolver = chosenSignal.resolverType || 'tdt_hls';
    const getNextFailedSet = (curFailed: Set<number>): Set<number> => {
      const nextFailed = new Set(curFailed);
      nextFailed.add(signalIndex);
      const deadHostKey = extractTrackHostKey(chosenSignal.sourceUrl);
      if (deadHostKey) {
        effectiveTdtCh.channels.forEach((sig, idx) => {
          if (extractTrackHostKey(sig.sourceUrl) === deadHostKey) {
            nextFailed.add(idx);
          }
        });
      }
      return nextFailed;
    };

    const fastTdtPromise =
      failedSignals.size === 0 && !chosenSignal.sourceUrl.startsWith('/api/providers/')
        ? fetchFastProviderLiveSignals(effectiveTdtCh.name, signal, 1800)
        : Promise.resolve<StreamTrack[]>([]);

    try {
      let resOk = false;
      let data: {
        success?: boolean;
        streamUrl?: string;
        mode?: VideoState['mode'];
        error?: string;
      } | null = null;

      if (isInstantDirectTdtStream(chosenSignal.sourceUrl, signalResolver)) {
        resOk = true;
        data = {
          success: true,
          streamUrl: chosenSignal.sourceUrl,
          mode: /\.(mp4|mkv|webm)(\?|$)/i.test(chosenSignal.sourceUrl) ? 'direct' : 'hls',
        };
      } else {
        const cachedTdt = getCachedClientExtract(signalResolver, chosenSignal.sourceUrl);
        if (cachedTdt) {
          resOk = true;
          data = {
            success: true,
            streamUrl: cachedTdt.streamUrl,
            mode: cachedTdt.mode || 'hls',
          };
        }
      }

      if (!data) {
        const params = new URLSearchParams({
          url: chosenSignal.sourceUrl,
          resolverType: signalResolver,
          title: effectiveTdtCh.name,
        });
        const ctrl = new AbortController();
        const onParentAbort = () => ctrl.abort();
        if (signal.aborted) {
          ctrl.abort();
        } else {
          signal.addEventListener('abort', onParentAbort, { once: true });
        }
        const timeoutId = setTimeout(() => ctrl.abort(), 12_000);
        try {
          const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal: ctrl.signal });
          resOk = res.ok;
          data = await res.json().catch(() => null);
          if (resOk && data?.success && data.streamUrl) {
            setCachedClientExtract(signalResolver, chosenSignal.sourceUrl, data.streamUrl, data.mode);
          }
        } finally {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', onParentAbort);
        }
      }

      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!resOk || !data?.success || !data?.streamUrl) {
        if (allowSameChannelBackup && effectiveTdtCh.channels.length > 1) {
          const nextFailed = getNextFailedSet(failedSignals);
          const nextIdx = effectiveTdtCh.channels.findIndex((_, idx) => !nextFailed.has(idx));
          if (nextIdx !== -1) {
            await handlePlayTdtChannel(
              effectiveTdtCh,
              nextIdx,
              liveProgramHint,
              extraction,
              true,
              nextFailed
            );
            return;
          }
        }
        const fastFallback = await fastTdtPromise;
        if (reqSeq !== extractionReqSeqRef.current) return;
        if (fastFallback.length > 0 && fastFallback[0].sourceUrl) {
          const firstFast = fastFallback[0];
          const nextState: VideoState = {
            mode: 'hls',
            url: firstFast.sourceUrl,
            rawSourceUrl: firstFast.sourceUrl,
            title: effectiveTdtCh.name,
            subtitle: `TV en Directo · ${firstFast.label}`,
            currentTime: 0,
            isPlaying: true,
            isLive: true,
            tracks: fastFallback,
            activeTrackIndex: 0,
            seriesMeta: undefined,
            lastUpdated: Date.now(),
            updatedBy: profileName,
          };
          clearExtractionSnapshot();
          videoStateUrlRef.current = nextState.url;
          setVideoState(nextState);
          commitVideoStateSync('change_url', nextState);
          playCinemaSound('play');
          return;
        }
        setExtractionError(
          `Ninguna señal disponible en este instante para ${effectiveTdtCh.name}. Prueba recargar o activar VPN España.`
        );
        return;
      }

      const fastTdtExtras = await Promise.race([
        fastTdtPromise,
        new Promise<StreamTrack[]>((r) => globalThis.setTimeout(() => r([]), 120)),
      ]);
      const mappedTracks: StreamTrack[] = [
        ...effectiveTdtCh.channels.map((sig, idx) => ({
          id: sig.id,
          label: `${effectiveTdtCh.name} · ${sig.label}`,
          lang: 'ES',
          quality: sig.quality,
          sourceUrl: sig.sourceUrl,
          resolverType: sig.resolverType || 'tdt_hls',
          resolvedStreamUrl: idx === signalIndex ? data.streamUrl : undefined,
        })),
        ...fastTdtExtras,
      ];

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: chosenSignal.sourceUrl,
        title: effectiveTdtCh.name,
        subtitle: liveProgramHint
          ? `En emisión: ${liveProgramHint} · ${effectiveTdtCh.network}`
          : `TV en Directo · ${effectiveTdtCh.network} · ${chosenSignal.label}`,
        currentTime: 0,
        isPlaying: true,
        isLive: true,
        tracks: mappedTracks,
        activeTrackIndex: signalIndex,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      playCinemaSound('play');
    } catch {
      if (signal.aborted || reqSeq !== extractionReqSeqRef.current) return;
      if (allowSameChannelBackup && effectiveTdtCh.channels.length > 1) {
        const nextFailed = getNextFailedSet(failedSignals);
        const nextIdx = effectiveTdtCh.channels.findIndex((_, idx) => !nextFailed.has(idx));
        if (nextIdx !== -1) {
          await handlePlayTdtChannel(
            effectiveTdtCh,
            nextIdx,
            liveProgramHint,
            extraction,
            true,
            nextFailed
          );
          return;
        }
      }
      setExtractionError(
        `No se pudo conectar con ${effectiveTdtCh.name}. Prueba otra señal o activa VPN España.`
      );
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handlePlayFavoriteChannel = async (favCh: FavoriteChannelItem) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const { reqSeq, signal } = beginMediaExtraction();

    const favParts = (favCh.title || '')
      .replace(/\s+·\s+.*$/, '')
      .split(/\s+(?:vs\.?|v)\s+/i);
    setActiveMovieContext(null);
    setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
    if (
      favCh.sport === 'soccer' &&
      favParts.length === 2 &&
      favParts[0].trim().length >= 2 &&
      favParts[1].trim().length >= 2
    ) {
      setActiveSportsMatch({
        homeTeam: favParts[0].trim(),
        awayTeam: favParts[1].trim(),
        competition: favCh.competition,
      });
      setActiveMatchDetails(null);
      setShowLiveMatchDock(true);
    } else {
      setActiveSportsMatch(null);
      setActiveMatchDetails(null);
    }

    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(`favch-${favCh.favId}`);
    setExtractionError(null);
    setExtractionLabel(`${favCh.channelLabel} · Conectando canal favorito...`);
    activeHistoryIdRef.current = null;

    const isDirectTdtHls = /\.m3u8(\?|$)/i.test(favCh.channelUrl);
    const favResolver: StreamTrack['resolverType'] = isDirectTdtHls ? 'tdt_hls' : 'sports_channel';

    try {
      const params = new URLSearchParams({
        url: favCh.channelUrl,
        resolverType: favResolver,
        title: favCh.title || favCh.channelLabel,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json().catch(() => null);
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        if (/footunder\.online|tilinhd|streamxhd|rojadirectv/i.test(favCh.channelUrl)) {
          setExtractionError(
            data?.error || `El canal "${favCh.channelLabel}" no responde en este instante.`
          );
          return;
        }
        clearExtractionSnapshot();
        if (sessionMode === 'solo') {
          setExtractionError('Este canal web requiere sala en directo. Pulsa «Ver con amigos».');
          return;
        }
        socketService.startCloudBrowser(favCh.channelUrl, profileName);
        return;
      }

      if (data.mode === 'cloud') {
        clearExtractionSnapshot();
        if (sessionMode === 'solo') {
          setExtractionError('Este canal web requiere sala en directo. Pulsa «Ver con amigos».');
          return;
        }
        socketService.startCloudBrowser(data.streamUrl, profileName);
        return;
      }

      const singleTrack: StreamTrack = {
        id: favCh.favId,
        label: favCh.channelLabel,
        lang: 'ES',
        sourceUrl: favCh.channelUrl,
        resolverType: favResolver,
        resolvedStreamUrl: data.streamUrl,
      };

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: favCh.channelUrl,
        title: favCh.title || favCh.channelLabel,
        subtitle: `${favCh.competition} · ${favCh.channelLabel}`,
        currentTime: 0,
        isPlaying: true,
        isLive: true,
        tracks: [singleTrack],
        activeTrackIndex: 0,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('No se pudo conectar con el canal favorito.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const trackAndQueueHandlers = createTrackAndQueuePlaybackHandlers(ctx, {
    ...vodHandlers,
    handlePlaySportsMatch,
  });

  return {
    handlePlaySportsMatch,
    handlePlayTdtChannel,
    handlePlayFavoriteChannel,
    ...trackAndQueueHandlers,
  };
}
