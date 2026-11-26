/**
 * @module GlobalVodModals
 * @description Single cross-world host for MediaDetailsModal (movies) and
 * SeriesEpisodePickerModal (unified TV series screen), driven directly by
 * useAppStore so Portada search, Cine, Profile, and Deep Links all share the
 * exact same detail/series flow and PlaybackReturnContext restoration.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppLanguage,
  CatalogMovie,
  RoomQueueItem,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { isSameCatalogItem } from '../../utils/storage';
import { useAppStore, type PlaybackReturnContext } from '../../store/useAppStore';
import { MediaDetailsModal } from '../MediaDetailsModal';
import { SeriesEpisodePickerModal } from './SeriesEpisodePickerModal';

interface GlobalVodModalsProps {
  lang: AppLanguage;
  shareRoomId?: string;
  loadingItemId: string | null;
  watchHistory: WatchHistoryItem[];
  watchlist: CatalogMovie[];
  worldSearchQuery: string;
  effectiveCineCastellano: boolean;
  onToggleCatalogFavorite: (item: CatalogMovie) => void;
  onPlayMovie: (
    movie: CatalogMovie,
    preferLang: string,
    opts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: string,
    opts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
}

export const GlobalVodModals: React.FC<GlobalVodModalsProps> = ({
  lang,
  shareRoomId,
  loadingItemId,
  watchHistory,
  watchlist,
  worldSearchQuery,
  effectiveCineCastellano,
  onToggleCatalogFavorite,
  onPlayMovie,
  onPlaySeriesEpisode,
  onReplayHistoryItem,
  onAddToQueue,
}) => {
  const requestedMovieModal = useAppStore((s) => s.requestedMovieModal);
  const requestedSeriesModal = useAppStore((s) => s.requestedSeriesModal);
  const setRequestedMovieModal = useAppStore((s) => s.setRequestedMovieModal);
  const setRequestedSeriesModal = useAppStore((s) => s.setRequestedSeriesModal);

  const [selectedSeries, setSelectedSeries] = useState<TvSeriesDetails | null>(null);
  const [highlightedEpisodeNumber, setHighlightedEpisodeNumber] = useState<number | null>(null);
  const [initialSeriesScrollTop, setInitialSeriesScrollTop] = useState<number>(0);
  const [seriesModalLang, setSeriesModalLang] = useState<string>(
    effectiveCineCastellano ? 'ES' : 'VOSE'
  );
  const [forceSpanishSeriesActive, setForceSpanishSeriesActive] = useState(false);
  const [loadingSeriesDetails, setLoadingSeriesDetails] = useState(false);
  const [probingSeriesLangs, setProbingSeriesLangs] = useState(false);

  const seriesFetchSeqRef = useRef(0);
  const selectedSeriesRef = useRef<TvSeriesDetails | null>(null);
  selectedSeriesRef.current = selectedSeries;
  const detailsReturnPreviewRef = useRef<CatalogMovie | null>(null);

  const openSeriesDetails = useCallback(
    (
      tmdbId: number,
      seasonNum = 1,
      seedShow?: Partial<CatalogMovie>,
      forceSpanishProbe = false
    ) => {
      const reqSeq = ++seriesFetchSeqRef.current;
      setLoadingSeriesDetails(true);
      const curr = selectedSeriesRef.current;
      if (forceSpanishProbe) {
        setSeriesModalLang('ES');
        setForceSpanishSeriesActive(true);
      } else if (!curr || curr.tmdbId !== tmdbId) {
        setSeriesModalLang(effectiveCineCastellano ? 'ES' : 'VOSE');
        setForceSpanishSeriesActive(false);
      }

      setSelectedSeries((prev) => {
        if (prev && prev.tmdbId === tmdbId) {
          return { ...prev, activeSeason: seasonNum };
        }
        return {
          tmdbId,
          title:
            seedShow?.title ||
            pickLang(lang, {
              es: 'Cargando serie...',
              ca: 'Carregant sèrie...',
              en: 'Loading series...',
            }),
          originalTitle: seedShow?.originalTitle || seedShow?.title || '',
          year: seedShow?.year || 'TV',
          rating: seedShow?.rating || '',
          overview: seedShow?.overview || '',
          poster: seedShow?.poster || '',
          backdrop: seedShow?.backdrop || seedShow?.poster || '',
          seasons: [
            {
              seasonNumber: seasonNum,
              name: pickLang(lang, {
                es: `Temporada ${seasonNum}`,
                ca: `Temporada ${seasonNum}`,
                en: `Season ${seasonNum}`,
              }),
              episodeCount: 0,
            },
          ],
          activeSeason: seasonNum,
          episodes: [],
        };
      });

      const apiLang = forceSpanishProbe ? 'es' : lang === 'en' ? 'en' : 'es';
      fetch(
        `/api/catalog/tv/${tmdbId}?season=${seasonNum}&lang=${apiLang}${
          forceSpanishProbe ? '&force=1&forceSpanish=1' : ''
        }`
      )
        .then((r) => r.json())
        .then((data) => {
          if (reqSeq !== seriesFetchSeqRef.current) return;
          if (data?.success && data?.details) {
            const nextSeries: TvSeriesDetails = data.details;
            setSelectedSeries(nextSeries);
            setLoadingSeriesDetails(false);

            if (
              !forceSpanishProbe &&
              Array.isArray(nextSeries.availableLanguages) &&
              nextSeries.availableLanguages.length > 0
            ) {
              setProbingSeriesLangs(false);
              const avail = nextSeries.availableLanguages;
              setSeriesModalLang((prev) =>
                avail.includes('ES')
                  ? 'ES'
                  : avail.includes(prev as 'ES' | 'LAT' | 'VOSE' | 'EN')
                  ? prev
                  : avail[0]
              );
            } else {
              setProbingSeriesLangs(true);
              const firstEp = nextSeries.episodes[0]?.episodeNumber || 1;
              fetch(
                `/api/catalog/tv/${tmdbId}/languages?season=${nextSeries.activeSeason}&episode=${firstEp}&title=${encodeURIComponent(
                  nextSeries.title || ''
                )}&origTitle=${encodeURIComponent(nextSeries.originalTitle || '')}${
                  forceSpanishProbe ? '&force=1&forceSpanish=1' : ''
                }`
              )
                .then((r2) => r2.json())
                .then((langData) => {
                  if (reqSeq !== seriesFetchSeqRef.current) return;
                  const avail: ('ES' | 'LAT' | 'VOSE' | 'EN')[] = Array.isArray(
                    langData?.availableLanguages
                  )
                    ? langData.availableLanguages
                    : [];
                  if (avail.length > 0) {
                    setSelectedSeries((currSeries) =>
                      currSeries && currSeries.tmdbId === tmdbId
                        ? { ...currSeries, availableLanguages: avail }
                        : currSeries
                    );
                    setSeriesModalLang((prev) =>
                      forceSpanishProbe
                        ? avail.includes('ES')
                          ? 'ES'
                          : avail[0]
                        : avail.includes('ES')
                        ? 'ES'
                        : avail.includes(prev as 'ES' | 'LAT' | 'VOSE' | 'EN')
                        ? prev
                        : avail[0]
                    );
                  }
                })
                .catch(() => {})
                .finally(() => {
                  if (reqSeq === seriesFetchSeqRef.current) {
                    setProbingSeriesLangs(false);
                  }
                });
            }
          } else {
            setLoadingSeriesDetails(false);
          }
        })
        .catch(() => {
          if (reqSeq === seriesFetchSeqRef.current) {
            setLoadingSeriesDetails(false);
          }
        });
    },
    [lang, effectiveCineCastellano]
  );

  useEffect(() => {
    if (!requestedSeriesModal) {
      seriesFetchSeqRef.current += 1;
      setSelectedSeries(null);
      setHighlightedEpisodeNumber(null);
      setInitialSeriesScrollTop(0);
      setLoadingSeriesDetails(false);
      setProbingSeriesLangs(false);
      detailsReturnPreviewRef.current = null;
      return;
    }

    const rawSeries = requestedSeriesModal.series;
    const reqSeason =
      requestedSeriesModal.season ||
      ('activeSeason' in rawSeries ? rawSeries.activeSeason : undefined) ||
      1;
    setHighlightedEpisodeNumber(requestedSeriesModal.episode || null);
    setInitialSeriesScrollTop(requestedSeriesModal.initialScrollTop || 0);
    if (requestedSeriesModal.fromPreviewItem !== undefined) {
      detailsReturnPreviewRef.current = requestedSeriesModal.fromPreviewItem || null;
    }
    if (typeof requestedSeriesModal.forceSpanish === 'boolean') {
      setForceSpanishSeriesActive(requestedSeriesModal.forceSpanish);
    }
    if (requestedSeriesModal.lang) {
      setSeriesModalLang(requestedSeriesModal.lang);
    }

    if (
      'episodes' in rawSeries &&
      Array.isArray(rawSeries.episodes) &&
      rawSeries.episodes.length > 0 &&
      rawSeries.activeSeason === reqSeason
    ) {
      setSelectedSeries(rawSeries);
      setLoadingSeriesDetails(false);
      if (Array.isArray(rawSeries.availableLanguages) && rawSeries.availableLanguages.length > 0) {
        const avail = rawSeries.availableLanguages;
        if (!requestedSeriesModal.lang) {
          setSeriesModalLang(avail.includes('ES') ? 'ES' : avail[0]);
        }
        setProbingSeriesLangs(false);
      } else if (rawSeries.tmdbId) {
        openSeriesDetails(
          Number(rawSeries.tmdbId),
          reqSeason,
          rawSeries,
          Boolean(requestedSeriesModal.forceSpanish)
        );
      }
      return;
    }

    if (rawSeries.tmdbId) {
      openSeriesDetails(
        Number(rawSeries.tmdbId),
        reqSeason,
        rawSeries,
        Boolean(requestedSeriesModal.forceSpanish)
      );
    }
  }, [requestedSeriesModal, openSeriesDetails]);

  const captureOriginContext = useCallback(
    (extra?: Partial<PlaybackReturnContext>) => {
      const store = useAppStore.getState();
      const prev = store.playbackReturnContext;
      store.setPlaybackReturnContext({
        world: store.activeWorld,
        cineTab: store.cineTab,
        cineSpecialPortal: store.cineSpecialPortal,
        futbolTab: store.futbolTab,
        searchQuery: worldSearchQuery,
        homeSearchQuery: store.homeSearchQuery,
        homeSearchCategory: store.homeSearchCategory,
        scrollTopMain: prev?.scrollTopMain,
        scrollTopCatalog: prev?.scrollTopCatalog,
        ...extra,
      });
    },
    [worldSearchQuery]
  );

  const isBookmarked = useCallback(
    (item: CatalogMovie) => watchlist.some((x) => isSameCatalogItem(x, item)),
    [watchlist]
  );

  const handleToggleBookmark = useCallback(
    (item: CatalogMovie, e: React.MouseEvent) => {
      e.stopPropagation();
      triggerHaptic('light');
      onToggleCatalogFavorite(item);
    },
    [onToggleCatalogFavorite]
  );

  const clearSeriesUiOnly = useCallback(() => {
    seriesFetchSeqRef.current += 1;
    detailsReturnPreviewRef.current = null;
    setSelectedSeries(null);
    setHighlightedEpisodeNumber(null);
    setInitialSeriesScrollTop(0);
    setRequestedSeriesModal(null);
  }, [setRequestedSeriesModal]);

  return (
    <>
      <MediaDetailsModal
        item={requestedMovieModal}
        lang={lang}
        shareRoomId={shareRoomId}
        defaultAudioLang={effectiveCineCastellano ? 'ES' : 'VOSE'}
        isBookmarked={requestedMovieModal ? isBookmarked(requestedMovieModal) : false}
        onClose={() => {
          setRequestedMovieModal(null);
        }}
        onPlayMovie={(m, pLang, opts) => {
          setRequestedMovieModal(null);
          captureOriginContext({ movieModal: m });
          onPlayMovie(m, pLang, opts);
        }}
        onOpenSeriesEpisodes={(tmdbId, forceSpanish) => {
          const seed = requestedMovieModal || undefined;
          setRequestedMovieModal(null);
          setRequestedSeriesModal({
            series: seed
              ? { ...seed, tmdbId, mediaType: 'tv' }
              : {
                  id: `tv-${tmdbId}`,
                  tmdbId,
                  mediaType: 'tv',
                  title: '',
                  poster: '',
                  backdrop: '',
                  year: '',
                  rating: '',
                  overview: '',
                  languages: [],
                },
            season: seed?.seasonNumber || 1,
            forceSpanish: Boolean(forceSpanish),
            fromPreviewItem: seed || null,
          });
        }}
        onToggleBookmark={(m) => onToggleCatalogFavorite(m)}
        onAddToQueue={onAddToQueue}
        onSelectSimilar={(sim) => {
          const resolvedId = Number(sim.tmdbId || String(sim.id || '').replace(/[^\d]/g, '') || 0);
          if (sim.mediaType === 'tv' && resolvedId > 0) {
            setRequestedMovieModal(null);
            setRequestedSeriesModal({
              series: { ...sim, tmdbId: resolvedId, mediaType: 'tv' },
              season: sim.seasonNumber || 1,
            });
            return;
          }
          setRequestedMovieModal(sim);
        }}
      />

      <SeriesEpisodePickerModal
        lang={lang}
        selectedSeries={selectedSeries}
        highlightedEpisodeNumber={highlightedEpisodeNumber}
        initialScrollTop={initialSeriesScrollTop}
        shareRoomId={shareRoomId}
        seriesModalLang={seriesModalLang}
        forceSpanishSeriesActive={forceSpanishSeriesActive}
        loadingSeriesDetails={loadingSeriesDetails}
        probingSeriesLangs={probingSeriesLangs}
        loadingItemId={loadingItemId}
        watchHistory={watchHistory}
        isBookmarked={isBookmarked}
        onBack={() => {
          const returnPreview = detailsReturnPreviewRef.current;
          clearSeriesUiOnly();
          if (returnPreview) {
            setRequestedMovieModal(returnPreview);
          }
        }}
        onCloseAll={() => {
          clearSeriesUiOnly();
          setRequestedMovieModal(null);
        }}
        onSeriesModalLangChange={setSeriesModalLang}
        onOpenSeriesDetails={openSeriesDetails}
        onToggleBookmark={handleToggleBookmark}
        onReplayHistoryItem={(histItem, forceRestart, scrollTop) => {
          const returnPreview = detailsReturnPreviewRef.current;
          if (selectedSeries) {
            captureOriginContext({
              seriesModal: {
                series: selectedSeries,
                season: histItem.season || selectedSeries.activeSeason,
                episode: histItem.episode || null,
                lang: seriesModalLang,
                forceSpanish: forceSpanishSeriesActive,
                fromPreviewItem: returnPreview,
                pageScrollTop: scrollTop,
              },
            });
          }
          clearSeriesUiOnly();
          onReplayHistoryItem(histItem, forceRestart);
        }}
        onPlaySeriesEpisode={(series, ep, pLang, opts) => {
          const returnPreview = detailsReturnPreviewRef.current;
          captureOriginContext({
            seriesModal: {
              series,
              season: series.activeSeason,
              episode: ep.episodeNumber,
              lang: pLang,
              forceSpanish: Boolean(opts?.forceSpanish ?? forceSpanishSeriesActive),
              fromPreviewItem: returnPreview,
              pageScrollTop: opts?.scrollTop,
            },
          });
          clearSeriesUiOnly();
          onPlaySeriesEpisode(series, ep, pLang, opts);
        }}
        onAddToQueue={onAddToQueue}
      />
    </>
  );
};
