import { useCallback, useRef, useState } from 'react';
import type {
  CatalogMovie,
  FavoriteChannelItem,
  SavedFriend,
  VideoState,
  WatchHistoryItem,
} from '../types';
import {
  addWatchHistoryItem,
  canonicalizeHistoryItemId,
  clearWatchHistory,
  getFavoriteChannels,
  getSavedFriends,
  getWatchHistory,
  getWatchlist,
  removeLocalFriend,
  removeWatchHistoryItem,
  sanitizeItemKey,
  toggleFavoriteChannel,
  toggleWatchlistItem,
  updateWatchHistoryProgress,
  upsertLocalFriend,
} from '../utils/storage';
import {
  clearCloudWatchHistoryItems,
  deleteCloudCatalogFavoriteAndDuplicates,
  deleteCloudFavoriteById,
  deleteCloudFriend,
  deleteCloudWatchHistoryItem,
  updateCloudWatchProgressOnly,
  upsertCloudCatalogFavorite,
  upsertCloudChannelFavorite,
  upsertCloudFriend,
  upsertCloudWatchHistory,
} from '../services/userCloudSync';
import { triggerHaptic } from '../utils/haptics';

export function useFavoritesAndHistory() {
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>(() =>
    getWatchHistory()
  );
  const [watchlist, setWatchlist] = useState<CatalogMovie[]>(() => getWatchlist());
  const [favoriteChannels, setFavoriteChannels] = useState<FavoriteChannelItem[]>(() =>
    getFavoriteChannels()
  );
  const [savedFriends, setSavedFriends] = useState<SavedFriend[]>(() =>
    getSavedFriends()
  );

  const watchHistoryRef = useRef(watchHistory);
  watchHistoryRef.current = watchHistory;

  const findSavedResumeSec = useCallback((rawId: string): number => {
    const cleanId = sanitizeItemKey(rawId);
    const match = watchHistoryRef.current.find(
      (h) => sanitizeItemKey(h.id) === cleanId
    );
    if (!match || !match.resumeTimeSec || match.resumeTimeSec <= 5) return 0;
    return Math.floor(match.resumeTimeSec);
  }, []);

  const recordStateInWatchHistory = useCallback((vState: VideoState) => {
    if (
      (vState.mode !== 'hls' && vState.mode !== 'direct') ||
      !vState.url ||
      !vState.title ||
      vState.isLive
    ) {
      return;
    }

    const currentTrack = vState.tracks[vState.activeTrackIndex];
    const isTvSeries = Boolean(vState.seriesMeta);
    const mediaType: 'movie' | 'tv' = isTvSeries ? 'tv' : 'movie';
    const cleanTitle = (vState.seriesMeta?.seriesTitle || vState.title || 'Contenido').trim();

    const normalizedLang: 'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT' = (() => {
      const trackLang = (currentTrack?.lang || '').toUpperCase();
      if (trackLang.includes('CAT')) return 'CAT';
      if (trackLang.includes('LAT')) return 'LAT';
      if (trackLang.includes('VOSE') || trackLang.includes('SUB')) return 'VOSE';
      if (trackLang.includes('EN') || trackLang.includes('ENG')) return 'EN';
      return 'ES';
    })();

    const rawId = isTvSeries
      ? `series-${vState.seriesMeta?.tmdbId || sanitizeItemKey(cleanTitle)}-s${vState.seriesMeta?.season || 1}-e${vState.seriesMeta?.episode || 1}`
      : `movie-${sanitizeItemKey(cleanTitle)}`;

    const canonicalId = canonicalizeHistoryItemId({
      id: rawId,
      mediaType,
      tmdbId: vState.seriesMeta?.tmdbId,
      season: vState.seriesMeta?.season,
      episode: vState.seriesMeta?.episode,
    });

    const activeTrack = vState.tracks[vState.activeTrackIndex];
    const trackSource = activeTrack?.sourceUrl || vState.rawSourceUrl;

    const histEntry: WatchHistoryItem = {
      id: canonicalId,
      mediaType,
      tmdbId: vState.seriesMeta?.tmdbId,
      title: cleanTitle,
      subtitle: isTvSeries
        ? `T${vState.seriesMeta?.season || 1}:E${vState.seriesMeta?.episode || 1}${
            vState.seriesMeta?.episodeTitle ? ` · ${vState.seriesMeta.episodeTitle}` : ''
          }`
        : vState.subtitle,
      poster: vState.seriesMeta?.poster || vState.poster || '',
      backdrop: vState.seriesMeta?.backdrop || vState.backdrop,
      season: vState.seriesMeta?.season,
      episode: vState.seriesMeta?.episode,
      episodeTitle: vState.seriesMeta?.episodeTitle,
      preferLang: normalizedLang,
      movidyUrl:
        activeTrack?.resolverType === 'movidy_embed' ? trackSource : undefined,
      bingetrixUrl:
        activeTrack?.resolverType === 'bingetrix_en' ? trackSource : undefined,
      resumeTimeSec: Math.max(0, Math.floor(vState.currentTime || 0)),
      watchedAt: Date.now(),
    };

    const { list } = addWatchHistoryItem(histEntry);
    setWatchHistory(list);
    upsertCloudWatchHistory(histEntry).catch(() => {});
  }, []);

  const handleUpdateWatchHistoryProgress = useCallback(
    (historyId: string, currentSec: number, durationSec?: number) => {
      const safeDuration = typeof durationSec === 'number' ? durationSec : 0;
      const { list } = updateWatchHistoryProgress(historyId, currentSec, safeDuration);
      setWatchHistory(list);
      updateCloudWatchProgressOnly(historyId, currentSec, safeDuration);
    },
    []
  );

  const handleRemoveWatchHistoryItem = useCallback((historyId: string) => {
    triggerHaptic('light');
    const nextList = removeWatchHistoryItem(historyId);
    setWatchHistory(nextList);
    deleteCloudWatchHistoryItem(historyId).catch(() => {});
  }, []);

  const handleClearWatchHistory = useCallback(() => {
    triggerHaptic('warning');
    const previousItems = watchHistoryRef.current;
    clearWatchHistory();
    setWatchHistory([]);
    clearCloudWatchHistoryItems(previousItems).catch(() => {});
  }, []);

  const handleToggleCatalogFavorite = useCallback((item: CatalogMovie) => {
    const res = toggleWatchlistItem(item);
    setWatchlist(res.list);
    if (res.added) {
      upsertCloudCatalogFavorite(res.canonicalItem).catch(() => {});
    } else {
      deleteCloudCatalogFavoriteAndDuplicates(
        res.canonicalItem,
        res.removedKeys
      ).catch(() => {});
    }
  }, []);

  const handleToggleChannelFavorite = useCallback(
    (entry: Omit<FavoriteChannelItem, 'addedAt'>) => {
      const res = toggleFavoriteChannel(entry);
      setFavoriteChannels(res.list);
      if (res.added) {
        upsertCloudChannelFavorite(res.item).catch(() => {});
      } else {
        deleteCloudFavoriteById(res.item.favId).catch(() => {});
      }
    },
    []
  );

  const handleAddFriend = useCallback(
    (
      entry: {
        friendId: string;
        name: string;
        avatar: string;
        color: string;
        friendCode?: string;
      },
      opts?: { skipNotify?: boolean }
    ) => {
      triggerHaptic('success');
      const { list, friend } = upsertLocalFriend(entry);
      setSavedFriends(list);
      upsertCloudFriend(friend).catch(() => {});
      return { list, friend, skipNotify: opts?.skipNotify };
    },
    []
  );

  const handleRemoveFriend = useCallback((friendId: string) => {
    triggerHaptic('light');
    const nextList = removeLocalFriend(friendId);
    setSavedFriends(nextList);
    deleteCloudFriend(friendId).catch(() => {});
  }, []);

  return {
    watchHistory,
    setWatchHistory,
    watchlist,
    setWatchlist,
    favoriteChannels,
    setFavoriteChannels,
    savedFriends,
    setSavedFriends,
    findSavedResumeSec,
    recordStateInWatchHistory,
    handleUpdateWatchHistoryProgress,
    handleRemoveWatchHistoryItem,
    handleClearWatchHistory,
    handleToggleCatalogFavorite,
    handleToggleChannelFavorite,
    handleAddFriend,
    handleRemoveFriend,
  };
}
