import { useCallback, useRef, useState } from 'react';
import {
  addWatchHistoryItem,
  canonicalizeHistoryItemId,
  sanitizeItemKey,
  updateWatchHistoryProgress,
} from '../../utils/storage';
import {
  updateCloudWatchProgressOnly,
  upsertCloudWatchHistory,
} from '../../services/userCloudSync';
import { sanitizeSavedResumeSec } from '../../components/player/playerAutoNextGuard';
import type { VideoState, WatchHistoryItem } from '../../types';

interface UseWatchHistorySyncOptions {
  isNestedSandboxFrame: boolean;
  videoStateRef: React.MutableRefObject<VideoState>;
  watchHistoryRef: React.MutableRefObject<WatchHistoryItem[]>;
  setWatchHistory: React.Dispatch<React.SetStateAction<WatchHistoryItem[]>>;
}

export function useWatchHistorySync({
  isNestedSandboxFrame,
  videoStateRef,
  watchHistoryRef,
  setWatchHistory,
}: UseWatchHistorySyncOptions) {
  const [livePlaybackSec, setLivePlaybackSec] = useState<number>(0);
  const livePlaybackSecRef = useRef<number>(0);
  const activeHistoryIdRef = useRef<string | null>(null);
  const lastCloudProgressSyncRef = useRef<number>(0);
  const nextEpPreloadRef = useRef<string>('');

  const findSavedResumeSec = useCallback(
    (rawId: string): number => {
      const cleanId = sanitizeItemKey(rawId);
      const match = watchHistoryRef.current.find((h) => sanitizeItemKey(h.id) === cleanId);
      if (!match) return 0;
      return sanitizeSavedResumeSec(match.resumeTimeSec, match.durationSec);
    },
    [watchHistoryRef]
  );

  const recordStateInWatchHistory = useCallback(
    (vState: VideoState) => {
      if ((vState.mode !== 'hls' && vState.mode !== 'direct') || vState.isLive || !vState.url) {
        activeHistoryIdRef.current = null;
        return;
      }

      if (vState.seriesMeta) {
        const sm = vState.seriesMeta;
        const activeTr = vState.tracks?.[vState.activeTrackIndex];
        const histId = sanitizeItemKey(`tv-${sm.tmdbId}-${sm.season}-${sm.episode}`);
        activeHistoryIdRef.current = histId;
        const { list, item } = addWatchHistoryItem({
          id: histId,
          mediaType: 'tv',
          tmdbId: sm.tmdbId,
          title: sm.seriesTitle,
          subtitle: `${sm.season}x${String(sm.episode).padStart(2, '0')} · ${
            sm.episodeTitle || 'Episodio'
          }`,
          poster: sm.poster || vState.poster || '',
          backdrop: sm.backdrop || vState.backdrop || sm.poster || '',
          season: sm.season,
          episode: sm.episode,
          episodeTitle: sm.episodeTitle,
          preferLang: activeTr?.lang === 'EN' ? 'EN' : 'ES',
          resumeTimeSec: vState.currentTime > 5 ? Math.floor(vState.currentTime) : undefined,
        });
        setWatchHistory(list);
        upsertCloudWatchHistory(item).catch(() => {});
      } else if (vState.poster || vState.backdrop) {
        const activeTr = vState.tracks?.[vState.activeTrackIndex];
        const tmdbMatch = vState.rawSourceUrl?.match(/\/(\d+)(?:\/|$)/);
        const parsedTmdbId = tmdbMatch ? Number(tmdbMatch[1]) : undefined;
        const movidySlugMatch = vState.rawSourceUrl?.match(/movidy\.[a-z]+\/ver\/([^/?#]+)/i);
        const histId = canonicalizeHistoryItemId({
          id: movidySlugMatch
            ? `movidy-${movidySlugMatch[1]}`
            : vState.rawSourceUrl || vState.title,
          mediaType: 'movie',
          tmdbId: parsedTmdbId,
        });
        activeHistoryIdRef.current = histId;

        const isMovidyRaw = vState.rawSourceUrl?.includes('movidy.');
        const isGnulaRaw = vState.rawSourceUrl?.includes('gnulahd.');
        const isBingetrixRaw = vState.rawSourceUrl?.includes('bingetrix');

        const { list, item } = addWatchHistoryItem({
          id: histId,
          mediaType: 'movie',
          tmdbId: parsedTmdbId,
          title: vState.title,
          subtitle: vState.subtitle || 'HD',
          poster: vState.poster || vState.backdrop || '',
          backdrop: vState.backdrop || vState.poster || '',
          preferLang: activeTr?.lang === 'EN' ? 'EN' : 'ES',
          movidyUrl: isMovidyRaw ? vState.rawSourceUrl : undefined,
          gnulaUrl: isGnulaRaw ? vState.rawSourceUrl : undefined,
          bingetrixUrl: isBingetrixRaw ? vState.rawSourceUrl : undefined,
          resumeTimeSec: vState.currentTime > 5 ? Math.floor(vState.currentTime) : undefined,
        });
        setWatchHistory(list);
        upsertCloudWatchHistory(item).catch(() => {});
      }
    },
    [setWatchHistory]
  );

  const handlePlayerProgressUpdate = useCallback(
    (currentTimeSec: number, durationSec: number) => {
      const floored = Math.max(0, Math.floor(currentTimeSec));
      livePlaybackSecRef.current = floored;
      setLivePlaybackSec(floored);
      const activeId = activeHistoryIdRef.current;
      if (!activeId || currentTimeSec <= 4) return;

      // Pre-resolve next episode in background when < 2 minutes remain for instant transitions
      const vs = videoStateRef.current;
      const meta = vs.seriesMeta;
      if (meta && !vs.isLive && durationSec > 120 && durationSec - currentTimeSec <= 120) {
        let nextSeason = meta.season;
        let nextEp = meta.episode + 1;
        if (meta.totalEpisodesInSeason && nextEp > meta.totalEpisodesInSeason) {
          if (!meta.totalSeasons || meta.season < meta.totalSeasons) {
            nextSeason = meta.season + 1;
            nextEp = 1;
          } else {
            nextEp = -1;
          }
        }
        if (nextEp > 0) {
          const preloadKey = `${meta.tmdbId}-${nextSeason}-${nextEp}`;
          if (nextEpPreloadRef.current !== preloadKey) {
            nextEpPreloadRef.current = preloadKey;
            const activeTrackLang = String(vs.tracks[vs.activeTrackIndex]?.lang || '').toUpperCase();
            const preferLang =
              activeTrackLang === 'LAT' || activeTrackLang === 'VOSE' || activeTrackLang === 'EN'
                ? activeTrackLang
                : 'ES';
            const params = new URLSearchParams({
              mediaType: 'tv',
              tmdbId: String(meta.tmdbId),
              season: String(nextSeason),
              episode: String(nextEp),
              preferLang,
              title: meta.seriesTitle,
              ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
            });
            fetch(`/api/extract/stream?${params.toString()}`).catch(() => {});
          }
        }
      }

      const { list, updated } = updateWatchHistoryProgress(activeId, currentTimeSec, durationSec);
      setWatchHistory(list);

      const now = Date.now();
      if (now - lastCloudProgressSyncRef.current >= 12000 && updated) {
        lastCloudProgressSyncRef.current = now;
        updateCloudWatchProgressOnly(
          activeId,
          updated.resumeTimeSec || 0,
          updated.durationSec || 0
        ).catch(() => {});
      }
    },
    [isNestedSandboxFrame, videoStateRef, setWatchHistory]
  );

  const getLivePlaybackSec = useCallback(() => livePlaybackSecRef.current, []);

  return {
    livePlaybackSec,
    getLivePlaybackSec,
    activeHistoryIdRef,
    findSavedResumeSec,
    recordStateInWatchHistory,
    handlePlayerProgressUpdate,
  };
}
