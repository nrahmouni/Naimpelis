import { socketService } from '../../services/socket';
import { playCinemaSound } from '../../utils/haptics';
import {
  addWatchHistoryItem,
  canonicalizeHistoryItemId,
  sanitizeItemKey,
} from '../../utils/storage';
import { upsertCloudWatchHistory } from '../../services/userCloudSync';
import { isAbortError } from '../../utils/appSessionHelpers';
import type { ActiveMovieContext } from '../../components/MoviePlaybackDock';
import type {
  CatalogMovie,
  StreamTrack,
  TvEpisodeItem,
  TvSeriesDetails,
  VideoState,
  WatchHistoryItem,
} from '../../types';
import type { PlaybackCoreContext } from './playbackTypes';

import { useEpisodeAndCatalaPlayback } from './useEpisodeAndCatalaPlayback';

export function useVodAndCatalaPlayback(ctx: PlaybackCoreContext) {
  const {
    opts,
    extractionReqSeqRef,
    activeHistoryIdRef,
    beginMediaExtraction,
    clearExtractionSnapshot,
    showLanguageNotice,
    setExtractionLabel,
    setExtractionError,
    setLoadingItemId,
    findSavedResumeSec,
    commitVideoStateSync,
  } = ctx;

  const {
    sessionMode,
    profileName,
    canChangeMedia,
    hostId,
    participants,
    isNestedSandboxFrame,
    setVideoState,
    videoStateUrlRef,
    watchHistoryRef,
    setWatchHistory,
    setIsExtracting,
    isExtractingRef,
    setActiveSportsMatch,
    setActiveMatchDetails,
    setActiveMovieContext,
    setCatalogSection,
    setMobileTab,
    showHostLockNotice,
    scrollDesktopToPlayer,
  } = opts;

  const episodeAndCatala = useEpisodeAndCatalaPlayback(ctx);

  const handlePlayMovie = async (
    movie: CatalogMovie,
    preferLang: string = 'ES',
    startOrOpts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const startAtOverrideSec =
      typeof startOrOpts === 'number' ? startOrOpts : startOrOpts?.startAtSec;
    const forceSpanish =
      typeof startOrOpts === 'object' && startOrOpts !== null
        ? Boolean(startOrOpts.forceSpanish)
        : false;
    const langFullLabelMap: Record<string, string> = {
      ES: 'Castellano (España)', CAT: 'Català', LAT: 'Español Latino', VOSE: 'Subtitulado (VOSE)',
      EN: 'Inglés Original (EN)', NL: 'Flamenco (Vlaams)', FR: 'Francés (FR)',
      AR: 'Árabe (AR)', ZH: 'Chino (中文)', RIF: 'Tarifit (Riffian)',
    };
    const requestedLangName = langFullLabelMap[preferLang] || preferLang || 'Español HD';

    const histId = canonicalizeHistoryItemId({
      id: movie.id,
      mediaType: 'movie',
      tmdbId: movie.tmdbId,
    });
    const resumeAtSec =
      startAtOverrideSec !== undefined ? startAtOverrideSec : findSavedResumeSec(histId);

    const { reqSeq, signal } = beginMediaExtraction();

    const isKidsLive =
      movie.id.startsWith('kids-live-') ||
      movie.platform === 'Riffan Kids Live' ||
      (movie.bingetrixUrl && movie.bingetrixUrl.endsWith('.m3u8'));
    if (isKidsLive) {
      const liveStreamUrl = movie.bingetrixUrl || '';
      if (liveStreamUrl) {
        clearExtractionSnapshot();
        const nextState: VideoState = {
          mode: 'hls',
          url: liveStreamUrl,
          rawSourceUrl: liveStreamUrl,
          title: movie.title,
          subtitle: `${movie.year || '2025'} · En Directo HD Kids`,
          poster: movie.poster,
          backdrop: movie.backdrop,
          currentTime: 0,
          isPlaying: true,
          isLive: true,
          tracks: [
            {
              id: 'live-0',
              label: movie.title,
              lang: 'ES',
              sourceUrl: liveStreamUrl,
              resolverType: 'tdt_hls',
              resolvedStreamUrl: liveStreamUrl,
            },
          ],
          activeTrackIndex: 0,
          lastUpdated: Date.now(),
          updatedBy: profileName,
        };
        setVideoState(nextState);
        commitVideoStateSync('change_url', nextState);
        playCinemaSound('play');
        setIsExtracting(false);
        setLoadingItemId(null);
        return;
      }
    }

    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
    setActiveMovieContext({
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      poster: movie.poster,
      backdrop: movie.backdrop,
      overview: movie.overview,
      preferLang: preferLang as ActiveMovieContext['preferLang'],
    });
    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(movie.id);
    setExtractionError(null);
    setExtractionLabel(
      forceSpanish
        ? `${movie.title} · Forzando búsqueda en Castellano (ES)...`
        : resumeAtSec > 5
        ? `${movie.title} · Reanudando en ${requestedLangName}...`
        : `${movie.title} · Preparando ${requestedLangName}...`
    );

    try {
      const params = new URLSearchParams({
        mediaType: 'movie',
        tmdbId: movie.tmdbId ? String(movie.tmdbId) : '',
        url: movie.bingetrixUrl || movie.movidyUrl || movie.gnulaUrl || movie.vestUrl || '',
        movidyUrl: movie.movidyUrl || '',
        gnulaUrl: movie.gnulaUrl || '',
        vestUrl: movie.vestUrl || '',
        preferLang,
        title: movie.title,
        ...(movie.originalTitle ? { origTitle: movie.originalTitle } : {}),
        ...(movie.year && /^\d{4}$/.test(movie.year) ? { year: movie.year } : {}),
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
        ...(forceSpanish ? { force: '1', forceSpanish: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        if (movie.platform === 'Riffan Kids' || movie.id.startsWith('kids-showcase-')) {
          const fallbackUrl =
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
          const nextState: VideoState = {
            mode: 'direct',
            url: fallbackUrl,
            rawSourceUrl: fallbackUrl,
            title: movie.title,
            subtitle: `${movie.year || '2025'} · Animación HD Kids`,
            poster: movie.poster,
            backdrop: movie.backdrop,
            currentTime: resumeAtSec,
            isPlaying: true,
            isLive: false,
            tracks: [
              {
                id: 'kids-fallback-0',
                label: movie.title,
                lang: 'ES',
                sourceUrl: fallbackUrl,
                resolverType: 'direct_mp4',
                resolvedStreamUrl: fallbackUrl,
              },
            ],
            activeTrackIndex: 0,
            lastUpdated: Date.now(),
            updatedBy: profileName,
          };
          clearExtractionSnapshot();
          videoStateUrlRef.current = nextState.url;
          setVideoState(nextState);
          commitVideoStateSync('change_url', nextState);
          playCinemaSound('play');
          setIsExtracting(false);
          setLoadingItemId(null);
          return;
        }
        const errMsg = data?.error || 'No se pudo cargar esta película en este momento.';
        setExtractionError(errMsg);
        showLanguageNotice({
          type: 'error',
          title: `⚠️ Película no disponible en ${requestedLangName} ahora mismo`,
          subtitle: errMsg,
        });
        return;
      }

      if (data.mode === 'cloud') {
        clearExtractionSnapshot();
        if (sessionMode === 'solo') {
          setExtractionError('Esta fuente externa requiere sala en directo. Pulsa «Ver con amigos» o cambia de pista.');
          return;
        }
        socketService.startCloudBrowser(data.streamUrl, profileName);
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );
      const activeTrack = tracks[activeIdx];
      const activeLabel = activeTrack?.label || data.resolvedLabel || requestedLangName;

      if (data.languageFallbackUsed) {
        showLanguageNotice({
          type: 'warning',
          title: `⚠️ Idioma ${requestedLangName} no disponible en esta película`,
          subtitle: `Reproduciendo automáticamente en: ${activeLabel}`,
        });
      } else {
        showLanguageNotice({
          type: 'success',
          title: `🔊 Idioma activo: ${activeLabel}`,
          subtitle:
            tracks.length > 1
              ? `${tracks.length} opciones de idioma disponibles en la barra del reproductor`
              : `${movie.title} · Señal HD lista`,
        });
      }

      activeHistoryIdRef.current = histId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl:
          movie.bingetrixUrl || movie.movidyUrl || movie.gnulaUrl || movie.vestUrl || movie.id,
        title: movie.title,
        subtitle: `${movie.year || 'HD'} · ${activeLabel}`,
        poster: movie.poster,
        backdrop: movie.backdrop,
        currentTime: resumeAtSec,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
        subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      const { list, item } = addWatchHistoryItem({
        id: histId,
        mediaType: 'movie',
        tmdbId: movie.tmdbId,
        title: movie.title,
        subtitle: `${movie.year || 'HD'} · ${activeLabel}`,
        poster: movie.poster,
        backdrop: movie.backdrop || movie.poster,
        year: movie.year,
        preferLang: preferLang as WatchHistoryItem['preferLang'],
        bingetrixUrl: movie.bingetrixUrl,
        movidyUrl: movie.movidyUrl,
        gnulaUrl: movie.gnulaUrl,
        vestUrl: movie.vestUrl,
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('Error de red al conectar con el motor RiffanTV.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handlePlaySeriesEpisode = async (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: string,
    startOrOpts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const startAtOverrideSec =
      typeof startOrOpts === 'number' ? startOrOpts : startOrOpts?.startAtSec;
    const forceSpanish =
      typeof startOrOpts === 'object' && startOrOpts !== null
        ? Boolean(startOrOpts.forceSpanish)
        : false;
    const epLoadId = sanitizeItemKey(
      `tv-${series.tmdbId}-${episode.seasonNumber}-${episode.episodeNumber}`
    );
    const resumeAtSec =
      startAtOverrideSec !== undefined ? startAtOverrideSec : findSavedResumeSec(epLoadId);

    const { reqSeq, signal } = beginMediaExtraction();

    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(epLoadId);
    setExtractionError(null);

    const epCode = `${episode.seasonNumber}x${String(episode.episodeNumber).padStart(2, '0')}`;
    const optimisticTitle = `${series.title} · ${epCode}${
      episode.title ? ` · ${episode.title}` : ''
    }`;
    const currentSeasonSummary = series.seasons?.find(
      (s) => s.seasonNumber === episode.seasonNumber
    );

    setVideoState((prev) => ({
      ...prev,
      title: optimisticTitle,
      seriesMeta: {
        tmdbId: series.tmdbId,
        seriesTitle: series.title,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        episodeTitle: episode.title,
        overview: episode.overview,
        totalEpisodesInSeason:
          currentSeasonSummary?.episodeCount || series.episodes?.length || 1,
        totalSeasons: series.seasons?.length || 1,
        poster: episode.still || series.poster,
        backdrop: episode.still || series.backdrop,
      },
      url: '',
      mode: 'idle',
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      poster: episode.still || series.poster || prev.poster,
      backdrop: episode.still || series.backdrop || prev.backdrop,
    }));

    setExtractionLabel(
      forceSpanish
        ? `${series.title} (${episode.seasonNumber}x${String(episode.episodeNumber).padStart(
            2,
            '0'
          )}) · Forzando búsqueda en Castellano (ES)...`
        : `${series.title} (${episode.seasonNumber}x${String(episode.episodeNumber).padStart(
            2,
            '0'
          )}) · ${resumeAtSec > 5 ? 'Reanudando...' : 'Preparando HD...'}`
    );

    try {
      const params = new URLSearchParams({
        mediaType: 'tv',
        tmdbId: String(series.tmdbId),
        season: String(episode.seasonNumber),
        episode: String(episode.episodeNumber),
        preferLang,
        title: series.title,
        ...(series.originalTitle ? { origTitle: series.originalTitle } : {}),
        ...(series.year && /^\d{4}$/.test(series.year) ? { year: series.year } : {}),
        episodeTitle: episode.title || '',
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
        ...(forceSpanish ? { force: '1', forceSpanish: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(data?.error || 'Este episodio aún no tiene señal directa disponible.');
        return;
      }

      if (data.mode === 'cloud') {
        clearExtractionSnapshot();
        if (sessionMode === 'solo') {
          setExtractionError('Este episodio requiere sala en directo. Pulsa «Ver con amigos» o prueba otra fuente.');
          return;
        }
        socketService.startCloudBrowser(data.streamUrl, profileName);
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );
      const activeEpLabel = tracks[activeIdx]?.label || data.resolvedLabel || preferLang;

      if (data.languageFallbackUsed) {
        const reqLabel =
          preferLang === 'ES'
            ? 'Castellano'
            : preferLang === 'LAT'
            ? 'Español Latino'
            : preferLang === 'VOSE'
            ? 'VOSE'
            : 'Inglés / VOSE';
        showLanguageNotice({
          type: 'warning',
          title: `⚠️ Idioma ${reqLabel} no disponible en este episodio`,
          subtitle: `Reproduciendo en: ${activeEpLabel}`,
        });
      } else {
        showLanguageNotice({
          type: 'success',
          title: `🔊 Idioma activo: ${activeEpLabel}`,
          subtitle: `${series.title} · ${episode.seasonNumber}x${String(
            episode.episodeNumber
          ).padStart(2, '0')}`,
        });
      }

      activeHistoryIdRef.current = epLoadId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: epLoadId,
        title: `${series.title} · ${episode.seasonNumber}x${String(episode.episodeNumber).padStart(
          2,
          '0'
        )}`,
        subtitle: `${episode.title} · ${tracks[activeIdx]?.label || preferLang}`,
        poster: series.poster,
        backdrop: episode.still || series.backdrop,
        currentTime: resumeAtSec,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
        subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
        seriesMeta: {
          tmdbId: series.tmdbId,
          seriesTitle: series.title,
          season: episode.seasonNumber,
          episode: episode.episodeNumber,
          episodeTitle: episode.title,
          totalEpisodesInSeason: currentSeasonSummary?.episodeCount || series.episodes.length,
          totalSeasons: series.seasons.length,
          poster: series.poster,
          backdrop: series.backdrop,
        },
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      const { list, item } = addWatchHistoryItem({
        id: epLoadId,
        mediaType: 'tv',
        tmdbId: series.tmdbId,
        title: series.title,
        subtitle: `${episode.seasonNumber}x${String(episode.episodeNumber).padStart(2, '0')} · ${
          episode.title
        }`,
        poster: series.poster,
        backdrop: episode.still || series.backdrop || series.poster,
        year: series.year,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        episodeTitle: episode.title,
        preferLang: preferLang as WatchHistoryItem['preferLang'],
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('Error al conectar con el episodio seleccionado.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handleReplayHistoryItem = async (item: WatchHistoryItem, forceRestart = false) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const resumeAtSec = forceRestart ? 0 : Math.floor(item.resumeTimeSec || 0);

    if (item.mediaType === 'tv' && item.tmdbId && item.season && item.episode) {
      const epLoadId = sanitizeItemKey(`tv-${item.tmdbId}-${item.season}-${item.episode}`);
      const { reqSeq, signal } = beginMediaExtraction();
      scrollDesktopToPlayer();
      setIsExtracting(true);
      isExtractingRef.current = true;
      setLoadingItemId(item.id);
      setExtractionError(null);
      setExtractionLabel(
        `${item.title} (${item.season}x${String(item.episode).padStart(2, '0')}) · ${
          resumeAtSec > 5 ? 'Reanudando en el punto exacto...' : 'Cargando...'
        }`
      );

      try {
        const params = new URLSearchParams({
          mediaType: 'tv',
          tmdbId: String(item.tmdbId),
          season: String(item.season),
          episode: String(item.episode),
          preferLang: item.preferLang || 'ES',
          title: item.title,
          episodeTitle: item.episodeTitle || '',
          ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
        });
        const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
        const data = await res.json();
        if (reqSeq !== extractionReqSeqRef.current) return;
        if (!res.ok || !data?.success || !data?.streamUrl) {
          setExtractionError('Este episodio no está disponible en este momento.');
          return;
        }
        if (data.mode === 'cloud') {
          clearExtractionSnapshot();
          if (sessionMode === 'solo') {
            setExtractionError('Este episodio requiere sala en directo. Pulsa «Ver con amigos» para verlo en Cloud HD.');
            return;
          }
          socketService.startCloudBrowser(data.streamUrl, profileName);
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
          title: `${item.title} · ${item.season}x${String(item.episode).padStart(2, '0')}`,
          subtitle: item.episodeTitle || tracks[activeIdx]?.label || item.preferLang,
          poster: item.poster,
          backdrop: item.backdrop || item.poster,
          currentTime: resumeAtSec,
          isPlaying: true,
          isLive: false,
          tracks,
          activeTrackIndex: activeIdx,
          subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
          seriesMeta: {
            tmdbId: item.tmdbId,
            seriesTitle: item.title,
            season: item.season,
            episode: item.episode,
            episodeTitle: item.episodeTitle,
            poster: item.poster,
            backdrop: item.backdrop,
          },
          lastUpdated: Date.now(),
          updatedBy: profileName,
        };

        const { list, item: updatedHist } = addWatchHistoryItem({
          ...item,
          id: epLoadId,
          resumeTimeSec: resumeAtSec,
        });
        setWatchHistory(list);
        upsertCloudWatchHistory(updatedHist).catch(() => {});

        clearExtractionSnapshot();
        videoStateUrlRef.current = nextState.url;
        setVideoState(nextState);
        commitVideoStateSync('change_url', nextState);
        playCinemaSound('play');
      } catch (err: unknown) {
        if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
        setExtractionError('Error al reanudar el episodio del historial.');
      } finally {
        if (reqSeq === extractionReqSeqRef.current) {
          isExtractingRef.current = false;
          setIsExtracting(false);
          setLoadingItemId(null);
        }
      }
      return;
    }

    await handlePlayMovie(
      {
        id: item.id,
        tmdbId: item.tmdbId,
        title: item.title,
        year: item.year || 'HD',
        rating: '',
        overview: '',
        poster: item.poster,
        backdrop: item.backdrop || item.poster,
        bingetrixUrl: item.bingetrixUrl,
        movidyUrl: item.movidyUrl,
        gnulaUrl: item.gnulaUrl,
        vestUrl: item.vestUrl,
        languages: [],
      },
      item.preferLang || 'ES',
      resumeAtSec
    );
  };

  const handlePlayFromProfileCatalog = async (item: CatalogMovie) => {
    if (item.mediaType === 'tv') {
      const savedSeriesEp = watchHistoryRef.current.find(
        (h) => h.mediaType === 'tv' && h.tmdbId && h.tmdbId === item.tmdbId
      );
      if (savedSeriesEp) {
        await handleReplayHistoryItem(savedSeriesEp, false);
        return;
      }
      if (item.tmdbId) {
        await handleReplayHistoryItem(
          {
            id: sanitizeItemKey(`tv-${item.tmdbId}-1-1`),
            mediaType: 'tv',
            tmdbId: item.tmdbId,
            title: item.title,
            subtitle: '1x01 · Episodio 1',
            poster: item.poster,
            backdrop: item.backdrop || item.poster,
            year: item.year,
            season: 1,
            episode: 1,
            episodeTitle: 'Episodio 1',
            preferLang: 'ES',
            watchedAt: Date.now(),
          },
          true
        );
        return;
      }
      setCatalogSection('series');
      setMobileTab('movies');
      return;
    }
    await handlePlayMovie(item, 'ES');
  };

  return {
    handlePlayMovie,
    handlePlaySeriesEpisode,
    handleReplayHistoryItem,
    handlePlayFromProfileCatalog,
    ...episodeAndCatala,
  };
}
