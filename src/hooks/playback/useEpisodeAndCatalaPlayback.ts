import { useCallback, useRef } from 'react';
import { socketService } from '../../services/socket';
import { playCinemaSound } from '../../utils/haptics';
import { addWatchHistoryItem, sanitizeItemKey } from '../../utils/storage';
import { upsertCloudWatchHistory } from '../../services/userCloudSync';
import { isAbortError } from '../../utils/appSessionHelpers';
import { useAppStore } from '../../store/useAppStore';
import type {
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  StreamTrack,
  VideoState,
  YouTubeSearchItem,
} from '../../types';
import type { PlaybackCoreContext } from './playbackTypes';

export function useEpisodeAndCatalaPlayback(ctx: PlaybackCoreContext) {
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
    lang,
    profileName,
    canChangeMedia,
    hostId,
    participants,
    isNestedSandboxFrame,
    videoState,
    setVideoState,
    videoStateUrlRef,
    setWatchHistory,
    setIsExtracting,
    isExtractingRef,
    setActiveSportsMatch,
    setActiveMatchDetails,
    setActiveMovieContext,
    showHostLockNotice,
    scrollDesktopToPlayer,
  } = opts;

  const inFlightStepKeyRef = useRef<string>('');

  const handleStepEpisode = async (delta: -1 | 1) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const meta = videoState.seriesMeta;
    if (!meta) return;

    let targetSeason = meta.season;
    let targetEp = meta.episode + delta;

    if (delta > 0) {
      if (meta.totalEpisodesInSeason && targetEp > meta.totalEpisodesInSeason) {
        if (!meta.totalSeasons || meta.season < meta.totalSeasons) {
          targetSeason = meta.season + 1;
          targetEp = 1;
        } else {
          return;
        }
      }
    } else if (targetEp < 1) {
      if (meta.season <= 1) return;
      targetSeason = meta.season - 1;
      try {
        const seasonRes = await fetch(
          `/api/catalog/tv/${meta.tmdbId}?season=${targetSeason}&lang=${lang}`
        );
        const seasonData = await seasonRes.json();
        const epsCount = Array.isArray(seasonData?.details?.episodes)
          ? seasonData.details.episodes.length
          : 0;
        targetEp = epsCount > 0 ? epsCount : 1;
      } catch {
        targetEp = 1;
      }
    }

    const activeTrack = videoState.tracks[videoState.activeTrackIndex];
    const rawActiveLang = String(activeTrack?.lang || '').toUpperCase();
    const preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN' =
      rawActiveLang === 'LAT' || rawActiveLang === 'VOSE' || rawActiveLang === 'EN'
        ? rawActiveLang
        : 'ES';

    const epLoadId = sanitizeItemKey(`tv-${meta.tmdbId}-${targetSeason}-${targetEp}`);
    if (isExtractingRef.current && inFlightStepKeyRef.current === epLoadId) {
      return;
    }
    inFlightStepKeyRef.current = epLoadId;
    const { reqSeq, signal } = beginMediaExtraction();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(epLoadId);
    setExtractionError(null);
    setExtractionLabel(
      `${meta.seriesTitle} (${targetSeason}x${String(targetEp).padStart(2, '0')}) · ${
        delta > 0 ? 'Siguiente episodio...' : 'Capítulo anterior...'
      }`
    );
    setVideoState((prev) => ({
      ...prev,
      title: `${meta.seriesTitle} · ${targetSeason}x${String(targetEp).padStart(2, '0')}`,
      url: '',
      mode: prev.mode !== 'idle' ? prev.mode : 'idle',
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      seriesMeta: prev.seriesMeta
        ? {
            ...prev.seriesMeta,
            season: targetSeason,
            episode: targetEp,
            episodeTitle: undefined,
          }
        : undefined,
    }));

    try {
      const params = new URLSearchParams({
        mediaType: 'tv',
        tmdbId: String(meta.tmdbId),
        season: String(targetSeason),
        episode: String(targetEp),
        preferLang,
        title: meta.seriesTitle,
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;
      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(
          delta > 0
            ? 'No hay más episodios disponibles en esta temporada.'
            : 'No se pudo cargar el capítulo anterior.'
        );
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );

      activeHistoryIdRef.current = epLoadId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: epLoadId,
        title: `${meta.seriesTitle} · ${targetSeason}x${String(targetEp).padStart(2, '0')}`,
        subtitle: tracks[activeIdx]?.label || preferLang,
        poster: meta.poster,
        backdrop: meta.backdrop,
        currentTime: 0,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
        subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
        seriesMeta: {
          ...meta,
          season: targetSeason,
          episode: targetEp,
          episodeTitle: undefined,
        },
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      const { list, item } = addWatchHistoryItem({
        id: epLoadId,
        mediaType: 'tv',
        tmdbId: meta.tmdbId,
        title: meta.seriesTitle,
        subtitle: `${targetSeason}x${String(targetEp).padStart(2, '0')}`,
        poster: meta.poster || '',
        backdrop: meta.backdrop || meta.poster || '',
        season: targetSeason,
        episode: targetEp,
        preferLang,
        resumeTimeSec: 0,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      clearExtractionSnapshot();
      const store = useAppStore.getState();
      if (store.playbackReturnContext?.seriesModal) {
        store.setPlaybackReturnContext({
          ...store.playbackReturnContext,
          seriesModal: {
            ...store.playbackReturnContext.seriesModal,
            season: targetSeason,
            episode: targetEp,
          },
        });
      }
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError(
        delta > 0
          ? 'Error al cargar el siguiente episodio.'
          : 'Error al cargar el capítulo anterior.'
      );
    } finally {
      if (inFlightStepKeyRef.current === epLoadId) {
        inFlightStepKeyRef.current = '';
      }
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const stepEpisodeRef = useRef(handleStepEpisode);
  stepEpisodeRef.current = handleStepEpisode;

  const handleNextEpisode = useCallback(() => stepEpisodeRef.current(1), []);
  const handlePrevEpisode = useCallback(() => stepEpisodeRef.current(-1), []);

  const handlePlayYouTubeVideo = (item: YouTubeSearchItem) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    beginMediaExtraction();
    clearExtractionSnapshot();
    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    isExtractingRef.current = false;
    setIsExtracting(false);
    setLoadingItemId(null);
    scrollDesktopToPlayer();
    setExtractionError(null);
    activeHistoryIdRef.current = null;
    const nextState: VideoState = {
      mode: 'youtube',
      url: item.videoId,
      rawSourceUrl: item.url,
      title: item.title,
      subtitle: `YouTube · ${item.channel}`,
      poster: item.thumbnail,
      backdrop: item.thumbnail,
      currentTime: 0,
      isPlaying: true,
      isLive: item.duration === 'LIVE',
      tracks: [],
      activeTrackIndex: 0,
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profileName,
    };
    videoStateUrlRef.current = nextState.url;
    setVideoState(nextState);
    commitVideoStateSync('change_url', nextState);
    playCinemaSound('play');
  };

  const handlePlayCatalaEpisode = async (
    series: CatalaSeriesDetails,
    episode: CatalaEpisodeItem
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }

    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    scrollDesktopToPlayer();
    setExtractionError(null);
    activeHistoryIdRef.current = null;

    if (episode.sourceType === 'ccma_3cat' && episode.ccmaVideoId) {
      const { reqSeq, signal } = beginMediaExtraction();
      setIsExtracting(true);
      isExtractingRef.current = true;
      setLoadingItemId(episode.id);
      setExtractionLabel(`${series.title} · Carregant senyal 3Cat en català...`);
      try {
        const res = await fetch(
          `/api/extract/catala-3cat?vidId=${encodeURIComponent(episode.ccmaVideoId)}`,
          { signal }
        );
        const data = await res.json();
        if (reqSeq !== extractionReqSeqRef.current) return;
        if (!res.ok || !data?.success || !data?.streamUrl) {
          setExtractionError('Aquest capítol de 3Cat no està disponible ara mateix.');
          return;
        }
        if (data.mode === 'cloud') {
          clearExtractionSnapshot();
          if (sessionMode === 'solo') {
            setExtractionError('Aquest capítol requereix sala en directe. Prem «Veure amb amics» per obrir-lo.');
            return;
          }
          socketService.startCloudBrowser(data.streamUrl, profileName);
          return;
        }
        const nextState: VideoState = {
          mode: 'direct',
          url: data.streamUrl,
          rawSourceUrl: episode.id,
          title: `${series.title} · Cap. ${episode.detectedNumber || episode.episodeNumber}`,
          subtitle: `${episode.title} · Català (SX3 / 3Cat)`,
          poster: series.poster,
          backdrop: series.backdrop || series.poster,
          currentTime: 0,
          isPlaying: true,
          isLive: false,
          tracks: (data.tracks || []).map((t: StreamTrack) => ({ ...t, lang: 'CAT' })),
          activeTrackIndex: 0,
          seriesMeta: undefined,
          lastUpdated: Date.now(),
          updatedBy: profileName,
        };
        clearExtractionSnapshot();
        videoStateUrlRef.current = nextState.url;
        setActiveMovieContext({
          title: series.title,
          poster: series.poster,
          backdrop: series.backdrop || series.poster,
          year: series.year,
          overview: series.overview,
          tmdbId: series.tmdbId,
          preferLang: 'CAT',
        });
        setVideoState(nextState);
        commitVideoStateSync('change_url', nextState);
        playCinemaSound('play');
      } catch (err: unknown) {
        if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
        setExtractionError('Error en connectar amb el servidor de 3Cat.');
      } finally {
        if (reqSeq === extractionReqSeqRef.current) {
          isExtractingRef.current = false;
          setIsExtracting(false);
          setLoadingItemId(null);
        }
      }
      return;
    }

    if (episode.sourceType === 'youtube' && (episode.youtubeVideoId || episode.streamUrl)) {
      beginMediaExtraction();
      clearExtractionSnapshot();
      isExtractingRef.current = false;
      setIsExtracting(false);
      setLoadingItemId(null);
      const ytId = episode.youtubeVideoId || episode.streamUrl || '';
      const nextState: VideoState = {
        mode: 'youtube',
        url: ytId,
        rawSourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
        title: `${series.title} · ${episode.title}`,
        subtitle: episode.audioNote || 'Arxiu en Català (K3 / 3XL)',
        poster: episode.still || series.poster,
        backdrop: series.backdrop || series.poster,
        currentTime: 0,
        isPlaying: true,
        isLive: false,
        tracks:
          Array.isArray(episode.tracks) && episode.tracks.length > 0
            ? episode.tracks.map((t) => ({ ...t, lang: 'CAT' }))
            : [
                {
                  id: `cat-yt-${episode.id}`,
                  label: 'Arxiu Català · YouTube HD',
                  lang: 'CAT',
                  quality: 'HD',
                  sourceUrl: ytId,
                  resolverType: 'youtube',
                  resolvedStreamUrl: ytId,
                },
              ],
        activeTrackIndex: 0,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };
      videoStateUrlRef.current = nextState.url;
      setActiveMovieContext({
        title: series.title,
        poster: series.poster,
        backdrop: series.backdrop || series.poster,
        year: series.year,
        overview: series.overview,
        tmdbId: series.tmdbId,
        preferLang: 'CAT',
      });
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      playCinemaSound('play');
      return;
    }

    if (!episode.streamUrl) {
      setExtractionError('Capítol sense flux directe disponible.');
      return;
    }

    beginMediaExtraction();
    clearExtractionSnapshot();
    isExtractingRef.current = false;
    setIsExtracting(false);
    setLoadingItemId(null);

    const tracks: StreamTrack[] =
      Array.isArray(episode.tracks) && episode.tracks.length > 0
        ? episode.tracks.map((t) => ({ ...t, lang: 'CAT' }))
        : [
            {
              id: `cat-direct-${episode.id}`,
              label: 'Català HD · Directe',
              lang: 'CAT',
              quality: 'HD',
              sourceUrl: episode.streamUrl,
              resolverType: 'direct_mp4',
              resolvedStreamUrl: episode.streamUrl,
            },
          ];

    const nextState: VideoState = {
      mode: 'direct',
      url: episode.streamUrl,
      rawSourceUrl: episode.id,
      title: `${series.title} · Cap. ${episode.episodeNumber}`,
      subtitle: `${episode.title} · ${episode.audioNote || 'Àudio en Català'}`,
      poster: series.poster,
      backdrop: series.backdrop || series.poster,
      currentTime: 0,
      isPlaying: true,
      isLive: false,
      tracks,
      activeTrackIndex: 0,
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profileName,
    };

    videoStateUrlRef.current = nextState.url;
    setActiveMovieContext({
      title: series.title,
      poster: series.poster,
      backdrop: series.backdrop || series.poster,
      year: series.year,
      overview: series.overview,
      tmdbId: series.tmdbId,
      preferLang: 'CAT',
    });
    setVideoState(nextState);
    commitVideoStateSync('change_url', nextState);
    playCinemaSound('play');
  };

  return {
    handleNextEpisode,
    handlePrevEpisode,
    handlePlayYouTubeVideo,
    handlePlayCatalaEpisode,
  };
}
