import { socketService } from '../../services/socket';
import { playCinemaSound, triggerHaptic } from '../../utils/haptics';
import { sanitizeItemKey } from '../../utils/storage';
import { isAbortError } from '../../utils/appSessionHelpers';
import type {
  CatalogMovie,
  PlaybackEngineMode,
  RoomQueueItem,
  SportsMatch,
  StreamTrack,
  VideoState,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../../types';
import type { PlaybackCoreContext } from './playbackTypes';
import { pickBestCleanSatelliteTrackIndex } from '../../components/player/hlsHealthWatchdog';

const failedRuntimeUrlsByStream = new Map<string, Set<string>>();

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
    beginMediaExtraction,
    clearExtractionSnapshot,
    showLanguageNotice,
    setExtractionLabel,
    setExtractionError,
    setLoadingItemId,
  } = ctx;

  const {
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
    secondaryStream,
    setSecondaryStream,
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
      socketService.syncVideoState('change_url', instantState, profileName);
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
      socketService.syncVideoState('change_url', nextState, profileName);
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

  const handleAutoSwitchBackupTrack = async (reason = 'h264_recovery') => {
    if (!canChangeMedia || !videoState.isLive || videoState.tracks.length <= 1) return;

    const streamKey = videoState.title || 'live-stream';
    let failedSet = failedRuntimeUrlsByStream.get(streamKey);
    if (!failedSet) {
      failedSet = new Set<string>();
      failedRuntimeUrlsByStream.set(streamKey, failedSet);
    }

    const currentTrack = videoState.tracks[videoState.activeTrackIndex];
    const currentRawUrl = currentTrack?.sourceUrl || videoState.rawSourceUrl;
    if (currentRawUrl) {
      failedSet.add(currentRawUrl);
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

    const nextIdx = pickBestCleanSatelliteTrackIndex(
      videoState.tracks,
      videoState.activeTrackIndex,
      failedSet
    );
    if (nextIdx === -1) return;

    const backupTrack = videoState.tracks[nextIdx];
    showLanguageNotice({
      type: 'warning',
      title: `⚡ Pista 1080p alternativa activada`,
      subtitle: `Conmutando a ${backupTrack.label} para evitar cortes H.264.`,
    });

    await handleSelectTrack(nextIdx, 0);
  };

  const handlePlayCustomUrl = async (rawUrl: string) => {
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
    setExtractionLabel('Analizando enlace y extrayendo flujo limpio...');

    try {
      const params = new URLSearchParams({
        url: rawUrl,
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (res.ok && data?.success && data?.streamUrl) {
        if (data.mode === 'cloud') {
          clearExtractionSnapshot();
          socketService.startCloudBrowser(data.streamUrl, profileName);
          return;
        }
        const nextState: VideoState = {
          mode: data.mode || 'hls',
          url: data.streamUrl,
          rawSourceUrl: rawUrl,
          title: data.title || 'Reproducción Directa HD',
          subtitle:
            data.mode === 'youtube'
              ? 'YouTube Sincronizado'
              : data.mode === 'embed'
              ? 'Reproductor Web Integrado'
              : data.resolvedLabel || 'Flujo Nativo Sin Anuncios',
          poster: data.poster || undefined,
          backdrop: data.backdrop || data.poster || undefined,
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
        socketService.syncVideoState('change_url', nextState, profileName);
        playCinemaSound('play');
      } else {
        clearExtractionSnapshot();
        socketService.startCloudBrowser(rawUrl, profileName);
      }
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      clearExtractionSnapshot();
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
    socketService.removeFromQueue(qItem.id);
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

  const handlePlaySecondaryChannel = async (optsArg: {
    sourceUrl: string;
    title: string;
    subtitle?: string;
  }) => {
    const mvResolver: StreamTrack['resolverType'] = /\.m3u8(\?|$)/i.test(optsArg.sourceUrl)
      ? 'tdt_hls'
      : 'sports_channel';

    if (videoState.mode === 'idle') {
      if (!canChangeMedia) {
        showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
        return;
      }
      await deps.handlePlaySportsMatch(
        {
          id: `mv-init-${Date.now()}`,
          time: 'EN VIVO',
          sport: 'soccer',
          isLive: true,
          competition: optsArg.subtitle || 'Multicanal HD',
          title: optsArg.title,
          channels: [
            {
              id: 'mv-ch-0',
              label: optsArg.title,
              lang: 'ES',
              sourceUrl: optsArg.sourceUrl,
              resolverType: mvResolver,
            },
          ],
        },
        0
      );
      return;
    }

    scrollDesktopToPlayer();
    setLoadingItemId(`mv-${optsArg.sourceUrl}`);
    setExtractionError(null);

    try {
      const params = new URLSearchParams({
        url: optsArg.sourceUrl,
        resolverType: mvResolver,
        title: optsArg.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(
          data?.error || 'Esta señal secundaria no está emitiendo en este momento.'
        );
        return;
      }

      setSecondaryStream((prev) => ({
        url: data.streamUrl,
        rawSourceUrl: optsArg.sourceUrl,
        title: optsArg.title,
        subtitle: optsArg.subtitle,
        mode: data.mode === 'direct' ? 'direct' : 'hls',
        layout: prev?.layout || 'corner',
      }));
      playCinemaSound('play');
    } catch {
      setExtractionError('Error al conectar la 2ª pantalla Multiview.');
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleSwapSecondaryStream = () => {
    if (!secondaryStream) return;
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    triggerHaptic('medium');

    const prevMain = videoState;
    const prevSec = secondaryStream;

    const promotedMain: VideoState = {
      mode: prevSec.mode,
      url: prevSec.url,
      rawSourceUrl: prevSec.rawSourceUrl,
      title: prevSec.title,
      subtitle: prevSec.subtitle || 'Multiview · Señal Principal',
      currentTime: 0,
      isPlaying: true,
      isLive: true,
      tracks: [],
      activeTrackIndex: 0,
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profileName,
    };

    if (prevMain.mode === 'hls' || prevMain.mode === 'direct') {
      setSecondaryStream({
        url: prevMain.url,
        rawSourceUrl: prevMain.rawSourceUrl,
        title: prevMain.title,
        subtitle: prevMain.subtitle,
        mode: prevMain.mode,
        layout: prevSec.layout,
      });
    } else {
      setSecondaryStream(null);
    }

    setVideoState(promotedMain);
    socketService.syncVideoState('change_url', promotedMain, profileName);
  };

  const handleToggleSecondaryLayout = () => {
    triggerHaptic('light');
    setSecondaryStream((prev) =>
      prev
        ? {
            ...prev,
            layout: prev.layout === 'split' ? 'corner' : 'split',
          }
        : null
    );
  };

  const handleCloseSecondaryStream = () => {
    triggerHaptic('light');
    setSecondaryStream(null);
  };

  const handlePromoteCloudStreamToNative = (proxiedStreamUrl: string) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    triggerHaptic('success');
    socketService.stopCloudBrowser();
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
    socketService.syncVideoState('change_url', nextState, profileName);
  };

  return {
    handleSelectTrack,
    handleAutoSwitchBackupTrack,
    handlePlayCustomUrl,
    handlePlayQueueItem,
    handlePlaySecondaryChannel,
    handleSwapSecondaryStream,
    handleToggleSecondaryLayout,
    handleCloseSecondaryStream,
    handlePromoteCloudStreamToNative,
  };
}
