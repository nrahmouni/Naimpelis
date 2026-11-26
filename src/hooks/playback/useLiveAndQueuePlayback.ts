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
import { useAppStore } from '../../store/useAppStore';

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
  if (
    /^\/api\/(?:hls-proxy|iptv\/live|vod-manifest|providers\/stream|belix\/stream|xtream\/stream|xtream\/vod)\/?/i.test(
      sourceUrl
    ) ||
    /^\/api\/stream\?/i.test(sourceUrl)
  ) {
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

  const collectMatchBroadcasters = (match: SportsMatch): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    const pushHint = (val?: string | null) => {
      const trimmed = String(val || '').trim();
      if (trimmed.length >= 3 && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        out.push(trimmed);
      }
    };
    pushHint(match.matchMeta?.spanishBroadcaster?.name);
    for (const h of match.matchMeta?.verifiedTvGuide?.es || []) pushHint(h);
    for (const h of match.matchMeta?.verifiedTvGuide?.en || []) pushHint(h);
    return out;
  };

  const enrichLiveTracksInBackground = (params: {
    playedUrl: string;
    channelId: string;
    title: string;
    broadcasters?: string[];
    competition?: string;
    tracks: StreamTrack[];
    isTdtLabelPrefix?: string;
  }) => {
    const runAttempt = async (delayMs: number, retryOnEmpty: boolean) => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (videoStateUrlRef.current !== params.playedUrl) return;
      try {
        const res = await fetch('/api/live/fast-resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: params.channelId,
            title: params.title,
            titleHint: params.title,
            competition: params.competition,
            broadcasters: params.broadcasters,
            preferLang: 'ES',
            preferQualityFirst: useAppStore.getState().playbackPriorityMode === 'best_quality',
            tracks: params.tracks.slice(0, 14).map((tr) => ({
              id: tr.id,
              label: tr.label,
              lang: tr.lang || 'ES',
              quality: tr.quality,
              providerId: tr.providerId,
              providerName: tr.providerName,
              sourceUrl: tr.sourceUrl,
              resolverType: tr.resolverType || 'tdt_hls',
              health: tr.health,
            })),
          }),
        });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as {
          extraTracks?: StreamTrack[];
        } | null;
        const extras = Array.isArray(json?.extraTracks) ? json.extraTracks : [];
        if (extras.length === 0) {
          if (retryOnEmpty && videoStateUrlRef.current === params.playedUrl) {
            void runAttempt(2400, false);
          }
          return;
        }
        if (videoStateUrlRef.current !== params.playedUrl) return;
        setVideoState((prev) => {
          if (!prev.isLive || prev.url !== params.playedUrl) return prev;
          const seen = new Set(prev.tracks.map((t) => String(t.sourceUrl || '').trim()).filter(Boolean));
          const merged = [...prev.tracks];
          let added = 0;
          for (const extra of extras) {
            const u = String(extra.sourceUrl || '').trim();
            if (!u || seen.has(u)) continue;
            seen.add(u);
            merged.push({
              ...extra,
              label:
                extra.label ||
                `${params.isTdtLabelPrefix || params.title} · ${extra.providerName || 'Señal'}`,
              lang: (extra.lang || 'ES').toUpperCase(),
              resolverType: extra.resolverType || 'direct_hls',
            });
            added += 1;
          }
          if (added === 0) return prev;
          return {
            ...prev,
            tracks: merged,
          };
        });
      } catch {
        // non-blocking background enrichment
      }
    };
    void runAttempt(750, true);
  };

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

    const matchBroadcasters = collectMatchBroadcasters(match);

    try {
      const sportsResolver = channel.resolverType || 'sports_channel';
      type SportsExtractData = {
        success?: boolean;
        streamUrl?: string;
        mode?: VideoState['mode'] | 'cloud';
        canUseCloudBrowser?: boolean;
        error?: string;
      };
      const resolveState: {
        data: SportsExtractData | null;
        resOk: boolean;
      } = {
        data: null,
        resOk: false,
      };
      let activeChannelIndex = channelIndex;
      let activeChannel = channel;

      let fastExtraTracks: StreamTrack[] = [];
      let fastWinningUrl = '';
      let fastBackupUrl = '';
      let fastWinningIdx = 0;
      let fastWinningTrack: StreamTrack | null = null;
      let fastWinningMode: VideoState['mode'] = 'hls';

      const runFastResolve = async () => {
        if (failedIndices.size !== 0 || match.channels.length < 1) return;
        const fastCtrl = new AbortController();
        const onFastAbort = () => fastCtrl.abort();
        if (signal.aborted) {
          fastCtrl.abort();
        } else {
          signal.addEventListener('abort', onFastAbort, { once: true });
        }
        const fastTimeout = setTimeout(() => fastCtrl.abort(), 4600);
        try {
          const fastRes = await fetch('/api/live/fast-resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: fastCtrl.signal,
            body: JSON.stringify({
              channelId: match.id,
              title: match.title,
              titleHint: match.title,
              competition: match.competition,
              broadcasters: matchBroadcasters,
              preferLang: 'ES',
              preferQualityFirst: useAppStore.getState().playbackPriorityMode === 'best_quality',
              tracks: match.channels.slice(0, 14).map((ch) => ({
                id: ch.id,
                label: ch.label,
                lang: ch.lang || 'ES',
                quality: ch.quality,
                providerId: ch.providerId,
                providerName: ch.providerName,
                sourceUrl: ch.sourceUrl,
                referer: (ch as { referer?: string }).referer,
                resolverType: ch.resolverType || 'sports_channel',
                health: ch.health,
              })),
            }),
          });
          if (fastRes.ok) {
            const fastJson = (await fastRes.json().catch(() => null)) as {
              ok?: boolean;
              winningIndex?: number;
              winningTrack?: StreamTrack | null;
              streamUrl?: string;
              backupStreamUrl?: string;
              mode?: VideoState['mode'];
              extraTracks?: StreamTrack[];
            } | null;
            if (Array.isArray(fastJson?.extraTracks)) {
              fastExtraTracks = fastJson.extraTracks;
            }
            if (fastJson?.backupStreamUrl) {
              fastBackupUrl = fastJson.backupStreamUrl;
            }
            if (fastJson?.ok && fastJson.streamUrl) {
              const allKnown = [...match.channels, ...fastExtraTracks];
              const winIdx =
                typeof fastJson.winningIndex === 'number' &&
                fastJson.winningIndex >= 0 &&
                fastJson.winningIndex < allKnown.length
                  ? fastJson.winningIndex
                  : 0;
              fastWinningUrl = fastJson.streamUrl;
              fastWinningIdx = winIdx;
              fastWinningTrack = fastJson.winningTrack || allKnown[winIdx] || null;
              fastWinningMode = fastJson.mode || 'hls';

              // If user clicked default primary (0), use the winning fast-resolved stream immediately
              if (channelIndex === 0 && !channel.resolvedStreamUrl) {
                activeChannelIndex = winIdx;
                activeChannel = fastWinningTrack || channel;
                resolveState.resOk = true;
                resolveState.data = {
                  success: true,
                  streamUrl: fastWinningUrl,
                  mode: fastWinningMode,
                };
              }
            }
          }
        } catch {
          // fall back seamlessly to single-signal resolver below
        } finally {
          clearTimeout(fastTimeout);
          signal.removeEventListener('abort', onFastAbort);
        }
      };

      const runSingleSignalExtract = async () => {
        if (activeChannel.resolvedStreamUrl) {
          resolveState.data = { success: true, streamUrl: activeChannel.resolvedStreamUrl, mode: 'hls' };
          resolveState.resOk = true;
          return;
        }
        const cachedSports = getCachedClientExtract(sportsResolver, activeChannel.sourceUrl);
        if (cachedSports) {
          resolveState.data = {
            success: true,
            streamUrl: cachedSports.streamUrl,
            mode: cachedSports.mode || 'hls',
          };
          resolveState.resOk = true;
          return;
        }
        const params = new URLSearchParams({
          url: activeChannel.sourceUrl,
          resolverType: activeChannel.resolverType || sportsResolver,
          title: match.title,
          channelLabel: activeChannel.label || '',
        });
        const reqCtrl = new AbortController();
        const onParentAbort = () => reqCtrl.abort();
        if (signal.aborted) {
          reqCtrl.abort();
        } else {
          signal.addEventListener('abort', onParentAbort, { once: true });
        }
        const reqTimeout = setTimeout(() => reqCtrl.abort(), 4_200);
        try {
          const res = await fetch(`/api/extract/stream?${params.toString()}`, {
            signal: reqCtrl.signal,
          });
          resolveState.resOk = res.ok;
          const parsed = (await res.json().catch(() => null)) as SportsExtractData | null;
          resolveState.data = parsed;
          if (
            resolveState.resOk &&
            parsed?.success &&
            parsed.streamUrl &&
            parsed.mode !== 'cloud' &&
            parsed.mode !== 'embed'
          ) {
            setCachedClientExtract(
              activeChannel.resolverType || sportsResolver,
              activeChannel.sourceUrl,
              parsed.streamUrl,
              parsed.mode
            );
          }
        } catch {
          // handled by failover logic below
        } finally {
          clearTimeout(reqTimeout);
          signal.removeEventListener('abort', onParentAbort);
        }
      };

      if (channelIndex === 0 && !channel.resolvedStreamUrl) {
        await runFastResolve();
        if (!resolveState.data) {
          await runSingleSignalExtract();
        }
      } else {
        await Promise.all([runFastResolve(), runSingleSignalExtract()]);
      }
      if (reqSeq !== extractionReqSeqRef.current) return;

      const totalCandidateCount = match.channels.length + fastExtraTracks.length;
      const isDeadSportsEmbed =
        resolveState.data?.mode === 'embed' &&
        (activeChannel.resolverType || sportsResolver) === 'sports_channel' &&
        allowSameMatchMirrorFallback &&
        (totalCandidateCount > failedIndices.size + 1 || Boolean(fastWinningUrl));

      if (!resolveState.resOk || !resolveState.data?.success || !resolveState.data?.streamUrl || isDeadSportsEmbed) {
        // Immediate failover to the already-proven fast-resolve winner when a clicked track (e.g. Señal Directo 5) failed
        if (allowSameMatchMirrorFallback && fastWinningUrl) {
          activeChannelIndex = fastWinningIdx;
          activeChannel = fastWinningTrack || channel;
          resolveState.resOk = true;
          resolveState.data = {
            success: true,
            streamUrl: fastWinningUrl,
            mode: fastWinningMode,
          };
        } else {
          const mergedChannels: StreamTrack[] = [...match.channels];
          const knownUrls = new Set(mergedChannels.map((c) => String(c.sourceUrl || '').trim()).filter(Boolean));
          for (const extra of fastExtraTracks) {
            const u = String(extra.sourceUrl || '').trim();
            if (!u || knownUrls.has(u)) continue;
            knownUrls.add(u);
            mergedChannels.push({
              ...extra,
              resolverType: extra.resolverType || 'direct_hls',
            });
          }
          const enrichedMatch: SportsMatch =
            mergedChannels.length > match.channels.length ? { ...match, channels: mergedChannels } : match;

          if (allowSameMatchMirrorFallback && failedIndices.size < 2 && enrichedMatch.channels.length > 1) {
            const nextFailed = new Set(failedIndices);
            nextFailed.add(channelIndex);
            const remaining = enrichedMatch.channels
              .map((ch, idx) => ({ ch, idx }))
              .filter(({ idx }) => !nextFailed.has(idx));
            const satCandidate = remaining.find(({ ch }) =>
              ch.resolverType === 'direct_hls' ||
              ch.resolverType === 'tdt_hls' ||
              /^\/api\/(?:providers\/stream|belix|hls-proxy|dvb-live|xtream\/stream)/i.test(ch.sourceUrl || '') ||
              /sat|1080p|dazn|\.m3u8|pig\.footunder/i.test(`${ch.label || ''} ${ch.sourceUrl || ''}`)
            );
            const nextIdx = satCandidate ? satCandidate.idx : (remaining[0]?.idx ?? -1);
            if (nextIdx !== -1) {
              await handlePlaySportsMatch(enrichedMatch, nextIdx, nextFailed, extraction, true);
              return;
            }
          }

          if (
            resolveState.data?.canUseCloudBrowser === false ||
            /footunder\.online|tilinhd|streamxhd|rojadirectv/i.test(channel.sourceUrl)
          ) {
            setExtractionError(
              resolveState.data?.error ||
                `La señal "${channel.label}" de ${match.title} no está disponible en este momento. Elige otra opción del partido o canal.`
            );
            return;
          }

          setExtractionError(
            resolveState.data?.error ||
              `La señal "${channel.label}" no responde en este instante. Prueba otra opción disponible.`
          );
          return;
        }
      }

      const data = resolveState.data;
      const finalStreamUrl = data?.streamUrl || '';
      if (!finalStreamUrl) {
        setExtractionError(`La señal "${activeChannel.label}" no está disponible en este momento.`);
        return;
      }

      if (data?.mode === 'cloud') {
        if (/footunder\.online|tilinhd|streamxhd/i.test(finalStreamUrl || channel.sourceUrl)) {
          setExtractionError('Señal temporalmente fuera de servicio.');
          return;
        }
        clearExtractionSnapshot();
        if (sessionMode === 'solo') {
          setExtractionError('Esta señal web requiere sala en vivo. Pulsa «Ver con amigos» o prueba otra señal.');
          return;
        }
        socketService.startCloudBrowser(finalStreamUrl, profileName);
        return;
      }

      const seenSportUrls = new Set<string>();
      const healthyChannels: StreamTrack[] = [];
      match.channels.forEach((c, idx) => {
        if (failedIndices.has(idx) && !(fastWinningUrl && c.sourceUrl === activeChannel.sourceUrl)) return;
        const u = String(c.sourceUrl || '').trim();
        if (u) seenSportUrls.add(u);
        const isWinner =
          idx === activeChannelIndex || (fastWinningUrl && c.sourceUrl === activeChannel.sourceUrl);
        healthyChannels.push(isWinner ? { ...c, resolvedStreamUrl: finalStreamUrl } : c);
      });
      for (const extra of fastExtraTracks) {
        const u = String(extra.sourceUrl || '').trim();
        if (!u || seenSportUrls.has(u)) continue;
        seenSportUrls.add(u);
        const isWinner =
          extra.sourceUrl === activeChannel.sourceUrl || extra.id === activeChannel.id;
        healthyChannels.push({
          ...extra,
          resolverType: extra.resolverType || 'direct_hls',
          ...(isWinner ? { resolvedStreamUrl: finalStreamUrl } : {}),
        });
      }
      const matchedSportIdx = healthyChannels.findIndex(
        (c) =>
          (activeChannel.sourceUrl && c.sourceUrl === activeChannel.sourceUrl) ||
          c.id === activeChannel.id
      );
      const activeIdxInHealthy = matchedSportIdx >= 0 ? matchedSportIdx : 0;

      const nextState: VideoState = {
        mode: (data?.mode as VideoState['mode']) || 'hls',
        url: finalStreamUrl,
        ...(fastBackupUrl && fastBackupUrl !== finalStreamUrl ? { backupStreamUrl: fastBackupUrl } : {}),
        rawSourceUrl: activeChannel.sourceUrl,
        title: match.title,
        subtitle: `${match.competition} · ${activeChannel.label}`,
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

      if (healthyChannels.length < 4) {
        enrichLiveTracksInBackground({
          playedUrl: nextState.url,
          channelId: match.id,
          title: match.title,
          broadcasters: matchBroadcasters,
          competition: match.competition,
          tracks: healthyChannels,
        });
      }
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

    const isVodOrSeriesItem =
      effectiveTdtCh.id.startsWith('xtream-vod-') ||
      effectiveTdtCh.id.startsWith('xtream-ser-') ||
      String(effectiveTdtCh.category || '') === 'cine_vod' ||
      /[?&]type=(?:vod|series)(?:&|$)/i.test(String(chosenSignal.sourceUrl || '')) ||
      /^\/api\/(?:providers\/stream\/[^/]+\/(?:movie|series)\/|xtream\/vod\/)/i.test(
        String(chosenSignal.sourceUrl || '')
      ) ||
      /\.(mp4|mkv|webm|avi|mov|m4v)(\?|$)/i.test(String(chosenSignal.sourceUrl || ''));

    const extraction = activeExtraction || beginMediaExtraction();
    const { reqSeq, signal } = extraction;

    if (allowSameChannelBackup) {
      setActiveMovieContext(null);
      setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
      const progParts = isVodOrSeriesItem
        ? []
        : (liveProgramHint || '')
            .replace(/\s+·\s+.*$/, '')
            .split(/\s+(?:vs\.?|v)\s+/i);
      if (
        !isVodOrSeriesItem &&
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
      isVodOrSeriesItem
        ? `${effectiveTdtCh.name} · Preparando vídeo...`
        : liveProgramHint
          ? `${effectiveTdtCh.name} · ${liveProgramHint}...`
          : `${effectiveTdtCh.name} · Conectando ${chosenSignal.label}...`
    );
    activeHistoryIdRef.current = null;

    const signalResolver = chosenSignal.resolverType || 'tdt_hls';
    const getNextFailedSet = (curFailed: Set<number>, channelsList: typeof effectiveTdtCh.channels): Set<number> => {
      const nextFailed = new Set(curFailed);
      nextFailed.add(signalIndex);
      const deadHostKey = extractTrackHostKey(chosenSignal.sourceUrl);
      if (deadHostKey) {
        channelsList.forEach((sig, idx) => {
          if (extractTrackHostKey(sig.sourceUrl) === deadHostKey) {
            nextFailed.add(idx);
          }
        });
      }
      return nextFailed;
    };

    try {
      let resOk = false;
      let data: {
        success?: boolean;
        streamUrl?: string;
        mode?: VideoState['mode'];
        error?: string;
      } | null = null;

      let activeSignalIdx = signalIndex;
      let activeSignal = chosenSignal;
      let fastExtraSignals: StreamTrack[] = [];
      let fastWinningUrl = '';
      let fastBackupTdtUrl = '';
      let fastWinningIdx = 0;
      let fastWinningSignal: typeof chosenSignal | null = null;
      let fastWinningMode: VideoState['mode'] = 'hls';

      if (
        !isVodOrSeriesItem &&
        failedSignals.size === 0 &&
        effectiveTdtCh.channels.length >= 1
      ) {
        const fastCtrl = new AbortController();
        const onFastAbort = () => fastCtrl.abort();
        if (signal.aborted) {
          fastCtrl.abort();
        } else {
          signal.addEventListener('abort', onFastAbort, { once: true });
        }
        const fastTimeout = setTimeout(() => fastCtrl.abort(), 8_500);
        try {
          const fastRes = await fetch('/api/live/fast-resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: fastCtrl.signal,
            body: JSON.stringify({
              channelId: effectiveTdtCh.id,
              title: effectiveTdtCh.name,
              titleHint: effectiveTdtCh.name,
              preferLang: 'ES',
              preferQualityFirst: useAppStore.getState().playbackPriorityMode === 'best_quality',
              tracks: effectiveTdtCh.channels.map((sig) => ({
                id: sig.id,
                label: sig.label,
                lang: sig.lang || 'ES',
                quality: sig.quality,
                providerId: sig.providerId,
                providerName: sig.providerName,
                sourceUrl: sig.sourceUrl,
                referer: (sig as { referer?: string }).referer,
                resolverType: sig.resolverType || 'tdt_hls',
                health: sig.health,
              })),
            }),
          });
          if (fastRes.ok) {
            const fastJson = (await fastRes.json().catch(() => null)) as {
              ok?: boolean;
              winningIndex?: number;
              winningTrack?: StreamTrack | null;
              streamUrl?: string;
              backupStreamUrl?: string;
              mode?: VideoState['mode'];
              extraTracks?: StreamTrack[];
            } | null;
            if (Array.isArray(fastJson?.extraTracks)) {
              fastExtraSignals = fastJson.extraTracks;
            }
            if (fastJson?.backupStreamUrl) {
              fastBackupTdtUrl = fastJson.backupStreamUrl;
            }
            if (fastJson?.ok && fastJson.streamUrl) {
              const allCandidates = [...effectiveTdtCh.channels, ...fastExtraSignals];
              const winIdx =
                typeof fastJson.winningIndex === 'number' &&
                fastJson.winningIndex >= 0 &&
                fastJson.winningIndex < allCandidates.length
                  ? fastJson.winningIndex
                  : 0;
              fastWinningUrl = fastJson.streamUrl;
              fastWinningIdx = winIdx;
              fastWinningSignal =
                (fastJson.winningTrack as typeof chosenSignal | undefined) ||
                (allCandidates[winIdx] as typeof chosenSignal | undefined) ||
                chosenSignal;
              fastWinningMode = fastJson.mode || 'hls';

              if (signalIndex === 0) {
                activeSignalIdx = winIdx;
                activeSignal = fastWinningSignal;
                resOk = true;
                data = {
                  success: true,
                  streamUrl: fastWinningUrl,
                  mode: fastWinningMode,
                };
              }
            }
          }
        } catch {
          // fall back seamlessly to single-signal resolver below
        } finally {
          clearTimeout(fastTimeout);
          signal.removeEventListener('abort', onFastAbort);
        }
      }

      if (!data) {
        if (isInstantDirectTdtStream(activeSignal.sourceUrl, activeSignal.resolverType || signalResolver)) {
          resOk = true;
          data = {
            success: true,
            streamUrl: activeSignal.sourceUrl,
            mode:
              isVodOrSeriesItem || /\.(mp4|mkv|webm|avi|mov|m4v)(\?|$)/i.test(activeSignal.sourceUrl)
                ? 'direct'
                : 'hls',
          };
        } else {
          const activeRes = activeSignal.resolverType || signalResolver;
          const cachedTdt = getCachedClientExtract(activeRes, activeSignal.sourceUrl);
          if (cachedTdt) {
            resOk = true;
            data = {
              success: true,
              streamUrl: cachedTdt.streamUrl,
              mode: cachedTdt.mode || (isVodOrSeriesItem ? 'direct' : 'hls'),
            };
          }
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
        const timeoutId = setTimeout(() => ctrl.abort(), 8_500);
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
        if (allowSameChannelBackup && fastWinningUrl && fastWinningSignal) {
          activeSignalIdx = fastWinningIdx;
          activeSignal = fastWinningSignal;
          resOk = true;
          data = {
            success: true,
            streamUrl: fastWinningUrl,
            mode: fastWinningMode,
          };
        } else {
          const mergedChannels = [...effectiveTdtCh.channels];
          const seenSrc = new Set(mergedChannels.map((c) => String(c.sourceUrl || '').trim()).filter(Boolean));
          for (const extra of fastExtraSignals) {
            const u = String(extra.sourceUrl || '').trim();
            if (!u || seenSrc.has(u)) continue;
            seenSrc.add(u);
            mergedChannels.push({
              ...extra,
              resolverType: extra.resolverType || 'direct_hls',
            } as typeof chosenSignal);
          }
          const enrichedTdtCh: SpanishTdtChannel =
            mergedChannels.length > effectiveTdtCh.channels.length
              ? { ...effectiveTdtCh, channels: mergedChannels }
              : effectiveTdtCh;

          if (allowSameChannelBackup && enrichedTdtCh.channels.length > 1) {
            const nextFailed = getNextFailedSet(failedSignals, enrichedTdtCh.channels);
            const nextIdx = enrichedTdtCh.channels.findIndex((_, idx) => !nextFailed.has(idx));
            if (nextIdx !== -1) {
              await handlePlayTdtChannel(
                enrichedTdtCh,
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
            `Ninguna señal disponible en este instante para ${effectiveTdtCh.name}. Prueba recargar o activar VPN España.`
          );
          return;
        }
      }

      const finalTdtUrl = data?.streamUrl || '';
      if (!finalTdtUrl) {
        setExtractionError(`Ninguna señal disponible en este instante para ${effectiveTdtCh.name}.`);
        return;
      }

      const seenTrackUrls = new Set<string>();
      const mappedTracks: StreamTrack[] = [];
      effectiveTdtCh.channels.forEach((sig, idx) => {
        const u = String(sig.sourceUrl || '').trim();
        if (u) seenTrackUrls.add(u);
        mappedTracks.push({
          id: sig.id,
          label: `${effectiveTdtCh.name} · ${sig.label}`,
          lang: (sig.lang || 'ES').toUpperCase(),
          quality: sig.quality,
          providerId: sig.providerId,
          providerName: sig.providerName,
          health: sig.health,
          sourceUrl: sig.sourceUrl,
          resolverType: sig.resolverType || 'tdt_hls',
          resolvedStreamUrl: idx === activeSignalIdx ? finalTdtUrl : undefined,
        });
      });

      for (const extra of fastExtraSignals) {
        const u = String(extra.sourceUrl || '').trim();
        if (!u || seenTrackUrls.has(u)) continue;
        seenTrackUrls.add(u);
        const isWinner =
          extra.sourceUrl === activeSignal.sourceUrl || extra.id === activeSignal.id;
        mappedTracks.push({
          id: extra.id,
          label: extra.label || `${effectiveTdtCh.name} · ${extra.providerName || 'Señal'}`,
          lang: (extra.lang || 'ES').toUpperCase(),
          quality: extra.quality,
          providerId: extra.providerId,
          providerName: extra.providerName,
          health: extra.health,
          sourceUrl: extra.sourceUrl,
          resolverType: extra.resolverType || 'direct_hls',
          ...(isWinner ? { resolvedStreamUrl: finalTdtUrl } : {}),
        });
      }

      const resolvedTrackIndex = mappedTracks.findIndex(
        (t) =>
          (activeSignal.sourceUrl && t.sourceUrl === activeSignal.sourceUrl) ||
          t.id === activeSignal.id
      );

      const nextState: VideoState = {
        mode: isVodOrSeriesItem ? 'direct' : (data?.mode || 'hls'),
        url: finalTdtUrl,
        ...(!isVodOrSeriesItem && fastBackupTdtUrl && fastBackupTdtUrl !== finalTdtUrl
          ? { backupStreamUrl: fastBackupTdtUrl }
          : {}),
        rawSourceUrl: activeSignal.sourceUrl,
        title: effectiveTdtCh.name,
        subtitle: isVodOrSeriesItem
          ? `VOD · ${effectiveTdtCh.network || effectiveTdtCh.quality || 'Alta Calidad'}`
          : liveProgramHint
            ? `En emisión: ${liveProgramHint} · ${effectiveTdtCh.network}`
            : `TV en Directo · ${effectiveTdtCh.network} · ${activeSignal.label}`,
        currentTime: 0,
        isPlaying: true,
        isLive: !isVodOrSeriesItem,
        tracks: mappedTracks,
        activeTrackIndex: resolvedTrackIndex >= 0 ? resolvedTrackIndex : activeSignalIdx,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      playCinemaSound('play');

      if (!isVodOrSeriesItem && mappedTracks.length <= 2) {
        enrichLiveTracksInBackground({
          playedUrl: nextState.url,
          channelId: effectiveTdtCh.id,
          title: effectiveTdtCh.name,
          tracks: mappedTracks,
          isTdtLabelPrefix: effectiveTdtCh.name,
        });
      }
    } catch {
      if (signal.aborted || reqSeq !== extractionReqSeqRef.current) return;
      if (allowSameChannelBackup && effectiveTdtCh.channels.length > 1) {
        const nextFailed = getNextFailedSet(failedSignals, effectiveTdtCh.channels);
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
