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
import { extractTrackHostKey } from '../../utils/customTdtSources';

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
    commitVideoStateSync('change_url', promotedMain);
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
    handleSwapSecondaryStream,
    handleToggleSecondaryLayout,
    handleCloseSecondaryStream,
    handlePromoteCloudStreamToNative,
  };
}
