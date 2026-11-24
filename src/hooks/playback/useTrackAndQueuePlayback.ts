import { socketService } from '../../services/socket';
import { playCinemaSound, triggerHaptic } from '../../utils/haptics';
import { sanitizeItemKey } from '../../utils/storage';
import { isAbortError } from '../../utils/appSessionHelpers';
import type {
  CatalogMovie,
  MultiScreenSourceInput,
  PlaybackEngineMode,
  RoomQueueItem,
  SecondaryStreamState,
  SportsMatch,
  StreamTrack,
  VideoState,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../../types';
import type { PlaybackCoreContext } from './playbackTypes';
import { pickBestCleanSatelliteTrackIndex } from '../../components/player/hlsHealthWatchdog';
import { extractTrackHostKey } from '../../utils/customTdtSources';
import {
  extractLiveStreamWithFallbacks,
  inferResolverType,
  MAX_SECONDARY_STREAMS,
  removeSecondaryStreamAt,
  upsertSecondaryStreamList,
} from './multiScreenHelpers';

const failedRuntimeUrlsByStream = new Map<string, Map<string, number>>();
const LIVE_TRACK_FAILURE_COOLDOWN_MS = 45_000;

interface TrackQueueDeps {
  handlePlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  handleReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => Promise<void>;
  handlePlayMovie: (
    movie: CatalogMovie,
    preferLang?: string,
    startOrOpts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => Promise<void>;
  handlePlaySportsMatch: (
    match: SportsMatch,
    channelIndex: number,
    failedIndices?: Set<number>,
    activeExtraction?: { reqSeq: number; signal: AbortSignal },
    allowSameMatchMirrorFallback?: boolean
  ) => Promise<void>;
}

export function createTrackAndQueuePlaybackHandlers(
  ctx: PlaybackCoreContext,
  deps: TrackQueueDeps
) {
  const {
    opts,
    extractionReqSeqRef,
    multiPresetAbortRef,
    secondaryExtractAbortRef,
    beginMediaExtraction,
    clearExtractionSnapshot,
    showLanguageNotice,
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
    isNestedSandboxFrame,
    cloudState,
    videoState,
    setVideoState,
    videoStateUrlRef,
    setIsExtracting,
    isExtractingRef,
    setActiveSportsMatch,
    setActiveMatchDetails,
    setActiveMovieContext,
    secondaryStreams,
    setSecondaryStreams,
    activeAudioSlot,
    setActiveAudioSlot,
    setIsPlayerClosedLocally,
    setIsPlayerMinimized,
    showHostLockNotice,
    scrollDesktopToPlayer,
  } = opts;

  const resolveTrackPlaybackMode = (
    track: StreamTrack,
    fallbackMode: PlaybackEngineMode
  ): PlaybackEngineMode => {
    if (track.resolverType === 'youtube') return 'youtube';
    if (track.resolverType === 'web_embed') return 'embed';
    if (track.resolverType === 'direct_mp4') return 'direct';
    if (fallbackMode === 'embed' || fallbackMode === 'youtube') return 'hls';
    return fallbackMode || 'hls';
  };

  const handleSelectTrack = async (trackIndex: number, resumeTimeSec: number) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const targetTrack = videoState.tracks[trackIndex];
    if (!targetTrack) return;

    if (targetTrack.resolverType === 'cloud_browser' && targetTrack.sourceUrl) {
      if (sessionMode === 'solo') {
        setExtractionError('El navegador Cloud HD requiere modo sala. Pulsa «Ver con amigos».');
        return;
      }
      socketService.startCloudBrowser(targetTrack.sourceUrl, profileName);
      return;
    }

    const resumeAt = videoState.isLive ? 0 : resumeTimeSec;

    if (targetTrack.resolvedStreamUrl) {
      beginMediaExtraction();
      clearExtractionSnapshot();
      isExtractingRef.current = false;
      setIsExtracting(false);
      const nextMode = resolveTrackPlaybackMode(targetTrack, videoState.mode);
      const instantState: VideoState = {
        ...videoState,
        mode: nextMode,
        url: targetTrack.resolvedStreamUrl,
        rawSourceUrl: targetTrack.sourceUrl,
        subtitle: targetTrack.label,
        currentTime: resumeAt,
        isPlaying: true,
        activeTrackIndex: trackIndex,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };
      videoStateUrlRef.current = instantState.url;
      setVideoState(instantState);
      commitVideoStateSync('change_url', instantState);
      showLanguageNotice({
        type: 'success',
        title: `✓ Fuente activa: ${targetTrack.label}`,
        subtitle:
          resumeAt > 3 && (nextMode === 'hls' || nextMode === 'direct')
            ? `Sincronizado en el segundo exacto (${Math.floor(resumeAt / 60)}:${String(
                Math.floor(resumeAt % 60)
              ).padStart(2, '0')})`
            : 'Reproduciendo señal HD sincronizada',
      });
      return;
    }

    const { reqSeq, signal } = beginMediaExtraction();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setExtractionError(null);
    setExtractionLabel(
      videoState.isLive
        ? `Conectando señal: ${targetTrack.label}...`
        : `Cambiando idioma a ${targetTrack.label}...`
    );
    showLanguageNotice({
      type: 'success',
      title: videoState.isLive
        ? `⏳ Conectando señal: ${targetTrack.label}...`
        : `⏳ Cargando idioma: ${targetTrack.label}...`,
      subtitle: 'Conectando servidor HD...',
    });

    try {
      const params = new URLSearchParams({
        url: targetTrack.sourceUrl,
        resolverType: targetTrack.resolverType,
        preferLang: String(targetTrack.lang || 'ES').toUpperCase(),
        title: videoState.title,
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json().catch(() => null);
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        if (videoState.isLive) {
          showLanguageNotice({
            type: 'warning',
            title: `⚠️ Señal no disponible: ${targetTrack.label}`,
            subtitle: 'Mantenemos tu emisión actual. Puedes elegir otra señal manualmente.',
          });
          return;
        }

        const requestedLang = String(targetTrack.lang || '').toUpperCase();
        const prunedTracks = videoState.tracks.filter((_, idx) => idx !== trackIndex);
        const prunedActiveIdx = Math.max(
          0,
          Math.min(
            prunedTracks.length - 1,
            videoState.activeTrackIndex > trackIndex
              ? videoState.activeTrackIndex - 1
              : videoState.activeTrackIndex
          )
        );
        setVideoState((prev) => ({
          ...prev,
          tracks: prunedTracks,
          activeTrackIndex: prunedActiveIdx,
        }));

        const sameLangIdx = videoState.tracks.findIndex(
          (tr, idx) =>
            idx !== trackIndex && String(tr.lang || '').toUpperCase() === requestedLang
        );
        if (sameLangIdx !== -1) {
          const adjustedBackupIdx = sameLangIdx > trackIndex ? sameLangIdx - 1 : sameLangIdx;
          isExtractingRef.current = false;
          setIsExtracting(false);
          setTimeout(() => {
            void handleSelectTrack(adjustedBackupIdx, resumeAt);
          }, 10);
          return;
        }

        const msg = `El servidor de "${targetTrack.label}" no responde ahora mismo.`;
        setExtractionError(msg);
        showLanguageNotice({
          type: 'warning',
          title: `Servidor caído: ${targetTrack.label}`,
          subtitle: 'Se ha ocultado la pista inactiva automáticamente.',
        });
        return;
      }

      const updatedTracks = videoState.tracks.map((tr, idx) =>
        idx === trackIndex ? { ...tr, resolvedStreamUrl: data.streamUrl } : tr
      );

      const nextState: VideoState = {
        ...videoState,
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: targetTrack.sourceUrl,
        subtitle: targetTrack.label,
        currentTime: resumeAt,
        isPlaying: true,
        tracks: updatedTracks,
        activeTrackIndex: trackIndex,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      showLanguageNotice({
        type: 'success',
        title: `✓ Fuente activa: ${targetTrack.label}`,
        subtitle: videoState.isLive
          ? 'Señal en directo actualizada'
          : 'Audio actualizado correctamente en la sala',
      });
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      if (!videoState.isLive) {
        setExtractionError('Error al cambiar de fuente.');
      }
      showLanguageNotice({
        type: 'error',
        title: `⚠️ Error al conectar ${targetTrack.label}`,
        subtitle: 'No se pudo conectar con ese servidor.',
      });
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
      }
    }
  };

  const handleAutoSwitchBackupTrack = async (reason = 'h264_recovery', atSec?: number) => {
    if (!canChangeMedia || videoState.tracks.length <= 1) return;

    const streamKey = videoState.isLive
      ? videoState.title || 'live-stream'
      : videoState.rawSourceUrl || videoState.title || 'vod-stream';
    let failedMap = failedRuntimeUrlsByStream.get(streamKey);
    if (!failedMap) {
      failedMap = new Map<string, number>();
      failedRuntimeUrlsByStream.set(streamKey, failedMap);
    }

    const nowMs = Date.now();
    if (videoState.isLive) {
      for (const [urlKey, failedAt] of failedMap.entries()) {
        if (nowMs - failedAt > LIVE_TRACK_FAILURE_COOLDOWN_MS) {
          failedMap.delete(urlKey);
        }
      }
    }

    const currentTrack = videoState.tracks[videoState.activeTrackIndex];
    const currentRawUrl = currentTrack?.sourceUrl || videoState.rawSourceUrl;
    if (currentRawUrl) {
      failedMap.set(currentRawUrl, nowMs);
      const deadHostKey = extractTrackHostKey(currentRawUrl);
      if (deadHostKey) {
        for (const tr of videoState.tracks) {
          if (tr.sourceUrl && extractTrackHostKey(tr.sourceUrl) === deadHostKey) {
            failedMap.set(tr.sourceUrl, nowMs);
          }
        }
      }
      fetch('/api/telemetry/qoe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'error',
          sourceUrl: currentRawUrl,
          reason,
        }),
      }).catch(() => {});
    }

    const failedSet = new Set<string>(failedMap.keys());
    let nextIdx = -1;
    if (videoState.isLive) {
      nextIdx = pickBestCleanSatelliteTrackIndex(
        videoState.tracks,
        videoState.activeTrackIndex,
        failedSet
      );
      if (nextIdx === -1 && videoState.tracks.length > 1) {
        const oldestBackup = videoState.tracks
          .map((tr, idx) => ({
            tr,
            idx,
            failedAt: failedMap!.get(tr.sourceUrl) || 0,
          }))
          .filter(
            ({ tr, idx }) =>
              idx !== videoState.activeTrackIndex &&
              Boolean(tr.sourceUrl) &&
              tr.resolverType !== 'cloud_browser'
          )
          .sort((a, b) => a.failedAt - b.failedAt)[0];
        if (oldestBackup) {
          failedMap.delete(oldestBackup.tr.sourceUrl);
          nextIdx = oldestBackup.idx;
        }
      }
    } else {
      const currentLang = String(currentTrack?.lang || '').toUpperCase();
      const isNonNative = (tr: StreamTrack) =>
        tr.resolverType === 'web_embed' ||
        tr.resolverType === 'youtube' ||
        tr.resolverType === 'cloud_browser';
      const isUnfailed = (tr: StreamTrack, idx: number) =>
        idx !== videoState.activeTrackIndex &&
        !failedSet.has(tr.sourceUrl) &&
        !failedSet.has(tr.resolvedStreamUrl || '');

      const candidateIndices = videoState.tracks
        .map((tr, idx) => ({ tr, idx }))
        .filter(({ tr, idx }) => isUnfailed(tr, idx));

      const preferred =
        candidateIndices.find(
          ({ tr }) =>
            !isNonNative(tr) &&
            tr.resolverType !== 'direct_mp4' &&
            String(tr.lang || '').toUpperCase() === currentLang
        ) ||
        candidateIndices.find(
          ({ tr }) => !isNonNative(tr) && tr.resolverType !== 'direct_mp4'
        ) ||
        candidateIndices.find(
          ({ tr }) => !isNonNative(tr) && String(tr.lang || '').toUpperCase() === currentLang
        ) ||
        candidateIndices.find(({ tr }) => !isNonNative(tr));

      nextIdx = preferred ? preferred.idx : -1;
    }

    if (nextIdx === -1) return;

    const backupTrack = videoState.tracks[nextIdx];
    const resumeSec = videoState.isLive
      ? 0
      : Math.max(0, Math.floor(atSec ?? (videoState.currentTime || 0)));

    showLanguageNotice({
      type: 'warning',
      title: videoState.isLive
        ? '⚡ Pista 1080p alternativa activada'
        : '⚡ Servidor alternativo activado',
      subtitle: videoState.isLive
        ? `Conmutando a ${backupTrack.label} para evitar cortes H.264.`
        : `Reintentando automáticamente con ${backupTrack.label}.`,
    });

    await handleSelectTrack(nextIdx, resumeSec);
  };

  const handlePlayCustomUrl = async (
    rawUrl: string,
    meta?: { title?: string; subtitle?: string; poster?: string }
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const { reqSeq, signal } = beginMediaExtraction();
    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId('custom-url');
    setExtractionError(null);
    setExtractionLabel(
      meta?.title
        ? `Cargando ${meta.title}...`
        : 'Analizando enlace y extrayendo flujo limpio...'
    );

    try {
      const params = new URLSearchParams({
        url: rawUrl,
        ...(meta?.title ? { title: meta.title } : {}),
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (res.ok && data?.success && data?.streamUrl) {
        if (data.mode === 'cloud') {
          clearExtractionSnapshot();
          if (sessionMode === 'solo') {
            setExtractionError('Este enlace externo requiere modo sala. Pulsa «Ver con amigos».');
            return;
          }
          socketService.startCloudBrowser(data.streamUrl, profileName);
          return;
        }
        const nextState: VideoState = {
          mode: data.mode || 'hls',
          url: data.streamUrl,
          rawSourceUrl: rawUrl,
          title: meta?.title || data.title || 'Reproducción Directa HD',
          subtitle:
            meta?.subtitle ||
            (data.mode === 'youtube'
              ? 'YouTube Sincronizado'
              : data.mode === 'embed'
              ? 'Reproductor Web Integrado'
              : data.resolvedLabel || 'Flujo Nativo Sin Anuncios'),
          poster: meta?.poster || data.poster || undefined,
          backdrop: meta?.poster || data.backdrop || data.poster || undefined,
          currentTime: 0,
          isPlaying: true,
          isLive: false,
          tracks: data.tracks || [],
          activeTrackIndex: Math.max(
            0,
            Array.isArray(data.tracks)
              ? data.tracks.findIndex((tr: StreamTrack) => tr.resolvedStreamUrl === data.streamUrl)
              : 0
          ),
          subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
          seriesMeta: undefined,
          lastUpdated: Date.now(),
          updatedBy: profileName,
        };
        clearExtractionSnapshot();
        videoStateUrlRef.current = nextState.url;
        setVideoState(nextState);
        commitVideoStateSync('change_url', nextState);
        playCinemaSound('play');
      } else {
        clearExtractionSnapshot();
        if (sessionMode === 'solo') {
          setExtractionError('No se pudo extraer stream directo en modo solitario. Pulsa «Ver con amigos» para usar Cloud HD.');
          return;
        }
        socketService.startCloudBrowser(rawUrl, profileName);
      }
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      clearExtractionSnapshot();
      if (sessionMode === 'solo') {
        setExtractionError('No se pudo cargar este enlace directo.');
        return;
      }
      socketService.startCloudBrowser(rawUrl, profileName);
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handlePlayQueueItem = (qItem: RoomQueueItem) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    if (sessionMode !== 'solo') {
      socketService.removeFromQueue(qItem.id);
    }
    if (qItem.kind === 'youtube' && qItem.youtubeId) {
      deps.handlePlayYouTubeVideo({
        id: qItem.youtubeId,
        videoId: qItem.youtubeId,
        title: qItem.title,
        channel: qItem.addedBy,
        duration: 'HD',
        views: '',
        thumbnail: qItem.poster || '',
        url: qItem.url || `https://youtube.com/watch?v=${qItem.youtubeId}`,
      });
    } else if (qItem.kind === 'tv' && qItem.tmdbId) {
      const season = qItem.season || 1;
      const episode = qItem.episode || 1;
      void deps.handleReplayHistoryItem(
        {
          id: sanitizeItemKey(`tv-${qItem.tmdbId}-${season}-${episode}`),
          mediaType: 'tv',
          tmdbId: qItem.tmdbId,
          title: qItem.title,
          subtitle: qItem.subtitle || `${season}x${String(episode).padStart(2, '0')}`,
          poster: qItem.poster || '',
          backdrop: qItem.poster || '',
          season,
          episode,
          preferLang: qItem.preferLang || 'ES',
          watchedAt: Date.now(),
        },
        true
      );
    } else if (qItem.kind === 'movie') {
      void deps.handlePlayMovie(
        {
          id: qItem.id,
          tmdbId: qItem.tmdbId,
          title: qItem.title,
          year: 'HD',
          rating: '',
          overview: '',
          poster: qItem.poster || '',
          backdrop: qItem.poster || '',
          bingetrixUrl: qItem.url,
          gnulaUrl: qItem.gnulaUrl,
          vestUrl: qItem.vestUrl,
          languages: [],
        },
        qItem.preferLang || 'ES'
      );
    } else if (qItem.url) {
      void handlePlayCustomUrl(qItem.url);
    }
  };

  const handlePlaySecondaryChannel = async (optsArg: MultiScreenSourceInput) => {
    const cleanSourceUrl = String(optsArg.sourceUrl || '').trim();
    if (!cleanSourceUrl) return;

    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }

    const allUrls = Array.from(
      new Set([cleanSourceUrl, ...(optsArg.fallbackUrls || [])].map((u) => String(u || '').trim()).filter(Boolean))
    );

    const isPrimaryNative = videoState.mode === 'hls' || videoState.mode === 'direct';

    if (
      isPrimaryNative &&
      videoState.rawSourceUrl &&
      allUrls.includes(videoState.rawSourceUrl)
    ) {
      setActiveAudioSlot(0);
      scrollDesktopToPlayer();
      return;
    }

    if (isPrimaryNative) {
      const existingSecIdx = secondaryStreams.findIndex(
        (s) =>
          (s.rawSourceUrl && allUrls.includes(s.rawSourceUrl)) ||
          (optsArg.matchId && s.matchId && s.matchId === optsArg.matchId)
      );
      if (existingSecIdx >= 0 && secondaryStreams[existingSecIdx]?.status !== 'error') {
        setActiveAudioSlot(existingSecIdx + 1);
        scrollDesktopToPlayer();
        return;
      }
    }

    if (!isPrimaryNative) {
      const tracks: StreamTrack[] = allUrls.map((u, idx) => ({
        id: `mv-ch-${idx}`,
        label: idx === 0 ? optsArg.title : `${optsArg.title} · Señal ${idx + 1}`,
        lang: 'ES',
        sourceUrl: u,
        resolverType: inferResolverType(u),
      }));
      await deps.handlePlaySportsMatch(
        {
          id: optsArg.matchId || `mv-init-${Date.now()}`,
          time: 'EN VIVO',
          sport: 'soccer',
          isLive: true,
          competition: optsArg.subtitle || 'Multi-Partido HD',
          title: optsArg.title,
          channels: tracks,
        },
        0
      );
      return;
    }

    if (secondaryExtractAbortRef.current) {
      try {
        secondaryExtractAbortRef.current.abort();
      } catch {
        // ignore
      }
    }
    const secCtrl = new AbortController();
    secondaryExtractAbortRef.current = secCtrl;

    setIsPlayerClosedLocally(false);
    setIsPlayerMinimized(false);
    scrollDesktopToPlayer();
    setLoadingItemId(`mv-${cleanSourceUrl}`);
    setExtractionError(null);

    try {
      const resolved = await extractLiveStreamWithFallbacks({
        sourceUrl: cleanSourceUrl,
        fallbackUrls: optsArg.fallbackUrls,
        title: optsArg.title,
        signal: secCtrl.signal,
      });

      if (secCtrl.signal.aborted) return;

      const desiredLayout: 'split' | 'corner' = optsArg.forceLayout || 'split';
      const nextItem: SecondaryStreamState = {
        id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url: resolved.url,
        rawSourceUrl: resolved.rawSourceUrl,
        title: optsArg.title,
        subtitle: optsArg.subtitle,
        mode: resolved.mode,
        layout: desiredLayout,
        fallbackUrls: allUrls.filter((u) => u !== resolved.rawSourceUrl),
        matchId: optsArg.matchId,
        status: 'ready',
      };

      setSecondaryStreams((prev) => {
        const { list } = upsertSecondaryStreamList(prev, nextItem, {
          preferredSlotIndex: optsArg.preferredSlotIndex,
          activeAudioSlot,
        });
        return list;
      });
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || secCtrl.signal.aborted) return;
      const errMsg = err instanceof Error && err.message ? err.message : '';
      setExtractionError(
        errMsg || 'Esta señal secundaria no está emitiendo en este momento.'
      );
    } finally {
      if (secondaryExtractAbortRef.current === secCtrl) {
        secondaryExtractAbortRef.current = null;
      }
      setLoadingItemId(null);
    }
  };

  const handleLaunchMultiMatchPreset = async (sources: MultiScreenSourceInput[]) => {
    const cleanSources = (sources || [])
      .filter((s) => Boolean(s?.sourceUrl?.trim()))
      .slice(0, MAX_SECONDARY_STREAMS + 1);
    if (cleanSources.length === 0) return;

    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }

    if (cleanSources.length === 1) {
      await handlePlaySecondaryChannel(cleanSources[0]);
      return;
    }

    if (multiPresetAbortRef.current) {
      try {
        multiPresetAbortRef.current.abort();
      } catch {
        // ignore
      }
    }
    const ctrl = new AbortController();
    multiPresetAbortRef.current = ctrl;

    triggerHaptic('medium');
    setIsPlayerClosedLocally(false);
    setIsPlayerMinimized(false);
    scrollDesktopToPlayer();
    setExtractionError(null);
    setLoadingItemId('multi-preset');
    setIsExtracting(true);
    isExtractingRef.current = true;
    setExtractionLabel(
      `Conectando Multi-Partido (${cleanSources.length} pantallas simultáneas)...`
    );

    try {
      const settled = await Promise.allSettled(
        cleanSources.map((src) =>
          extractLiveStreamWithFallbacks({
            sourceUrl: src.sourceUrl,
            fallbackUrls: src.fallbackUrls,
            title: src.title,
            signal: ctrl.signal,
          })
        )
      );

      if (ctrl.signal.aborted) return;

      const firstSuccessIdx = settled.findIndex((r) => r.status === 'fulfilled');
      if (firstSuccessIdx === -1) {
        setExtractionError(
          'Ninguna de las señales seleccionadas está respondiendo en este momento. Prueba otro partido o señal alternativa.'
        );
        return;
      }

      const primarySource = cleanSources[firstSuccessIdx];
      const primaryResolved = (
        settled[firstSuccessIdx] as PromiseFulfilledResult<{
          url: string;
          rawSourceUrl: string;
          mode: 'hls' | 'direct';
        }>
      ).value;

      const primaryTracks: StreamTrack[] = Array.from(
        new Set([primarySource.sourceUrl, ...(primarySource.fallbackUrls || [])].filter(Boolean))
      ).map((u, idx) => ({
        id: `mp-0-${idx}`,
        label: idx === 0 ? primarySource.title : `${primarySource.title} · Señal ${idx + 1}`,
        lang: 'ES',
        sourceUrl: u,
        resolverType: inferResolverType(u),
        resolvedStreamUrl: u === primaryResolved.rawSourceUrl ? primaryResolved.url : undefined,
      }));

      const nextMainState: VideoState = {
        mode: primaryResolved.mode,
        url: primaryResolved.url,
        rawSourceUrl: primaryResolved.rawSourceUrl,
        title: primarySource.title,
        subtitle: primarySource.subtitle || `Multi-Partido (${cleanSources.length} pantallas)`,
        currentTime: 0,
        isPlaying: true,
        isLive: true,
        tracks: primaryTracks,
        activeTrackIndex: Math.max(
          0,
          primaryTracks.findIndex((t) => t.sourceUrl === primaryResolved.rawSourceUrl)
        ),
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      const nextSecondary: SecondaryStreamState[] = [];
      cleanSources.forEach((src, idx) => {
        if (idx === firstSuccessIdx) return;
        const result = settled[idx];
        if (result.status === 'fulfilled') {
          nextSecondary.push({
            id: `sec-preset-${idx}-${Date.now()}`,
            url: result.value.url,
            rawSourceUrl: result.value.rawSourceUrl,
            title: src.title,
            subtitle: src.subtitle,
            mode: result.value.mode,
            layout: 'split',
            fallbackUrls: src.fallbackUrls,
            matchId: src.matchId,
            status: 'ready',
          });
        } else {
          nextSecondary.push({
            id: `sec-preset-${idx}-${Date.now()}`,
            url: '',
            rawSourceUrl: src.sourceUrl,
            title: src.title,
            subtitle: src.subtitle,
            mode: 'hls',
            layout: 'split',
            fallbackUrls: src.fallbackUrls,
            matchId: src.matchId,
            status: 'error',
          });
        }
      });

      clearExtractionSnapshot();
      setActiveSportsMatch(null);
      setActiveMatchDetails(null);
      setActiveMovieContext(null);
      videoStateUrlRef.current = nextMainState.url;
      setVideoState(nextMainState);
      setSecondaryStreams(nextSecondary.slice(0, MAX_SECONDARY_STREAMS));
      setActiveAudioSlot(0);
      commitVideoStateSync('change_url', nextMainState);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || ctrl.signal.aborted) return;
      setExtractionError('No se pudo iniciar la sesión Multi-Partido.');
    } finally {
      if (multiPresetAbortRef.current === ctrl) {
        multiPresetAbortRef.current = null;
      }
      isExtractingRef.current = false;
      setIsExtracting(false);
      setLoadingItemId(null);
      setExtractionLabel('');
    }
  };

  const handleRetrySecondarySlot = async (slotIdx: number) => {
    const target = secondaryStreams[slotIdx];
    if (!target) return;

    const dedupPool = Array.from(
      new Set([target.rawSourceUrl, ...(target.fallbackUrls || [])].map((u) => String(u || '').trim()).filter(Boolean))
    );
    const rotated =
      dedupPool.length > 1
        ? [...dedupPool.slice(1), dedupPool[0]]
        : dedupPool;
    const retryPrimary = rotated[0] || target.rawSourceUrl;
    const retryFallbacks = rotated.slice(1);

    setSecondaryStreams((prev) =>
      prev.map((item, i) => (i === slotIdx ? { ...item, status: 'loading' } : item))
    );

    try {
      const resolved = await extractLiveStreamWithFallbacks({
        sourceUrl: retryPrimary,
        fallbackUrls: retryFallbacks,
        title: target.title,
      });
      setSecondaryStreams((prev) =>
        prev.map((item, i) =>
          i === slotIdx
            ? {
                ...item,
                url: resolved.url,
                rawSourceUrl: resolved.rawSourceUrl,
                fallbackUrls: dedupPool.filter((u) => u !== resolved.rawSourceUrl),
                mode: resolved.mode,
                status: 'ready',
              }
            : item
        )
      );
    } catch {
      setSecondaryStreams((prev) =>
        prev.map((item, i) => (i === slotIdx ? { ...item, status: 'error' } : item))
      );
    }
  };

  const handleSetMultiAudioSlot = (slot: number) => {
    triggerHaptic('light');
    if (slot < 0 || slot > secondaryStreams.length) {
      setActiveAudioSlot(0);
      return;
    }
    setActiveAudioSlot(slot);
  };

  const handleSwapSecondaryStream = (slotIdx = 0) => {
    const targetSec = secondaryStreams[slotIdx];
    if (!targetSec) return;
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    triggerHaptic('medium');

    const prevMain = videoState;
    const promotedTrackUrls = Array.from(
      new Set(
        [targetSec.rawSourceUrl, ...(targetSec.fallbackUrls || [])]
          .map((u) => String(u || '').trim())
          .filter(Boolean)
      )
    );
    const promotedTracks: StreamTrack[] = promotedTrackUrls.map((u, idx) => ({
      id: `p1-swap-${idx}`,
      label: idx === 0 ? targetSec.title : `${targetSec.title} · Señal ${idx + 1}`,
      lang: 'ES',
      sourceUrl: u,
      resolverType: inferResolverType(u),
      resolvedStreamUrl: u === targetSec.rawSourceUrl ? targetSec.url : undefined,
    }));

    const promotedMain: VideoState = {
      mode: targetSec.mode,
      url: targetSec.url,
      rawSourceUrl: targetSec.rawSourceUrl,
      title: targetSec.title,
      subtitle: targetSec.subtitle || 'Multi-Partido · Pantalla Principal',
      currentTime: 0,
      isPlaying: true,
      isLive: true,
      tracks: promotedTracks,
      activeTrackIndex: Math.max(
        0,
        promotedTracks.findIndex((t) => t.sourceUrl === targetSec.rawSourceUrl)
      ),
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profileName,
    };

    if (prevMain.mode === 'hls' || prevMain.mode === 'direct') {
      const demoted: SecondaryStreamState = {
        id: `sec-swap-${Date.now()}-${slotIdx}`,
        url: prevMain.url,
        rawSourceUrl: prevMain.rawSourceUrl,
        title: prevMain.title,
        subtitle: prevMain.subtitle,
        mode: prevMain.mode,
        layout: secondaryStreams.length >= 2 ? 'split' : targetSec.layout,
        fallbackUrls: (prevMain.tracks || []).map((t) => t.sourceUrl).filter(Boolean),
        status: 'ready',
      };
      setSecondaryStreams((prev) =>
        prev.map((item, i) => (i === slotIdx ? demoted : item))
      );
    } else {
      setSecondaryStreams((prev) => prev.filter((_, i) => i !== slotIdx));
    }

    setActiveAudioSlot(0);
    videoStateUrlRef.current = promotedMain.url;
    setVideoState(promotedMain);
    commitVideoStateSync('change_url', promotedMain);
  };

  const handleToggleSecondaryLayout = () => {
    triggerHaptic('light');
    setSecondaryStreams((prev) => {
      if (prev.length === 0) return prev;
      if (prev.length >= 2) {
        return prev.map((s) => ({ ...s, layout: 'split' }));
      }
      const nextLayout = prev[0].layout === 'split' ? 'corner' : 'split';
      return prev.map((s) => ({ ...s, layout: nextLayout }));
    });
  };

  const handleCloseSecondaryStream = (slotIdx?: number) => {
    triggerHaptic('light');
    const { list, nextAudioSlot } = removeSecondaryStreamAt(
      secondaryStreams,
      slotIdx,
      activeAudioSlot
    );
    setSecondaryStreams(list);
    setActiveAudioSlot(nextAudioSlot);
  };

  const handleCloseAllSecondaryStreams = () => {
    triggerHaptic('light');
    setSecondaryStreams([]);
    setActiveAudioSlot(0);
  };

  const handlePromoteCloudStreamToNative = (proxiedStreamUrl: string) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    triggerHaptic('success');
    if (sessionMode !== 'solo') {
      socketService.stopCloudBrowser();
    }
    const isMp4 = proxiedStreamUrl.includes('/api/ts-proxy');
    const nextState: VideoState = {
      mode: isMp4 ? 'direct' : 'hls',
      url: proxiedStreamUrl,
      rawSourceUrl: cloudState?.url || proxiedStreamUrl,
      title: cloudState?.title || 'Stream Capturado HD',
      subtitle: 'Reproducción nativa extraída del Cloud Browser',
      currentTime: 0,
      isPlaying: true,
      isLive: false,
      tracks: [],
      activeTrackIndex: 0,
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profileName,
    };
    setVideoState(nextState);
    commitVideoStateSync('change_url', nextState);
  };

  return {
    handleSelectTrack,
    handleAutoSwitchBackupTrack,
    handlePlayCustomUrl,
    handlePlayQueueItem,
    handlePlaySecondaryChannel,
    handleLaunchMultiMatchPreset,
    handleRetrySecondarySlot,
    handleSetMultiAudioSlot,
    handleSwapSecondaryStream,
    handleToggleSecondaryLayout,
    handleCloseSecondaryStream,
    handleCloseAllSecondaryStreams,
    handlePromoteCloudStreamToNative,
  };
}
