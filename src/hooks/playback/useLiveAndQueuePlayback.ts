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

interface LiveQueueExtras {
  handlePlayMovie: (
    movie: CatalogMovie,
    preferLang?: string,
    startOrOpts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => Promise<void>;
  handleReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => Promise<void>;
  handlePlayYouTubeVideo: (item: YouTubeSearchItem) => void;
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

    try {
      const params = new URLSearchParams({
        url: channel.sourceUrl,
        resolverType: channel.resolverType || 'sports_channel',
        title: match.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json().catch(() => null);
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
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

      const healthyChannels = match.channels
        .map((c, idx) => (idx === channelIndex ? { ...c, resolvedStreamUrl: data.streamUrl } : c))
        .filter((_, idx) => !failedIndices.has(idx));
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
    const chosenSignal = tdtCh.channels[signalIndex] || tdtCh.channels[0];
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
        ? `${tdtCh.name} · ${liveProgramHint}...`
        : `${tdtCh.name} · Conectando ${chosenSignal.label}...`
    );
    activeHistoryIdRef.current = null;

    const signalResolver = chosenSignal.resolverType || 'tdt_hls';

    try {
      const params = new URLSearchParams({
        url: chosenSignal.sourceUrl,
        resolverType: signalResolver,
        title: tdtCh.name,
      });
      const ctrl = new AbortController();
      const onParentAbort = () => ctrl.abort();
      if (signal.aborted) {
        ctrl.abort();
      } else {
        signal.addEventListener('abort', onParentAbort, { once: true });
      }
      const timeoutId = setTimeout(() => ctrl.abort(), 16_000);
      let res: Response | null = null;
      let data: {
        success?: boolean;
        streamUrl?: string;
        mode?: VideoState['mode'];
        error?: string;
      } | null = null;
      try {
        res = await fetch(`/api/extract/stream?${params.toString()}`, { signal: ctrl.signal });
        data = await res.json().catch(() => null);
      } finally {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onParentAbort);
      }

      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res || !res.ok || !data?.success || !data?.streamUrl) {
        if (allowSameChannelBackup && tdtCh.channels.length > 1) {
          const nextFailed = new Set(failedSignals);
          nextFailed.add(signalIndex);
          const nextIdx = tdtCh.channels.findIndex((_, idx) => !nextFailed.has(idx));
          if (nextIdx !== -1) {
            await handlePlayTdtChannel(
              tdtCh,
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
          data?.error ||
            `La emisión de ${tdtCh.name} (${chosenSignal.label}) no responde en este instante.`
        );
        return;
      }

      const mappedTracks: StreamTrack[] = tdtCh.channels.map((sig, idx) => ({
        id: sig.id,
        label: `${tdtCh.name} · ${sig.label}`,
        lang: 'ES',
        quality: sig.quality,
        sourceUrl: sig.sourceUrl,
        resolverType: sig.resolverType || 'tdt_hls',
        resolvedStreamUrl: idx === signalIndex ? data.streamUrl : undefined,
      }));

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: chosenSignal.sourceUrl,
        title: tdtCh.name,
        subtitle: liveProgramHint
          ? `En emisión: ${liveProgramHint} · ${tdtCh.network}`
          : `TV en Directo · ${tdtCh.network} · ${chosenSignal.label}`,
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
      if (allowSameChannelBackup && tdtCh.channels.length > 1) {
        const nextFailed = new Set(failedSignals);
        nextFailed.add(signalIndex);
        const nextIdx = tdtCh.channels.findIndex((_, idx) => !nextFailed.has(idx));
        if (nextIdx !== -1) {
          await handlePlayTdtChannel(
            tdtCh,
            nextIdx,
            liveProgramHint,
            extraction,
            true,
            nextFailed
          );
          return;
        }
      }
      setExtractionError(`No se pudo conectar con ${tdtCh.name}.`);
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
