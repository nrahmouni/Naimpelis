import { playCinemaSound } from '../../utils/haptics';
import {
  addWatchHistoryItem,
  canonicalizeHistoryItemId,
  sanitizeItemKey,
} from '../../utils/storage';
import { upsertCloudWatchHistory } from '../../services/userCloudSync';
import { isAbortError } from '../../utils/appSessionHelpers';
import type {
  ClipboxPlayerTrack,
  ClipboxSearchItem,
  ClipboxTitleStreamsResult,
} from '../../components/clipbox/clipboxTypes';
import type { StreamTrack, SubtitleTrackItem, VideoState } from '../../types';
import type { PlaybackCoreContext } from './playbackTypes';

function toClipboxSubtitleTracks(
  subs: ClipboxTitleStreamsResult['subtitles'] | undefined
): SubtitleTrackItem[] {
  if (!Array.isArray(subs)) return [];
  const seen = new Set<string>();
  const out: SubtitleTrackItem[] = [];
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    const url = String(s?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: `clipbox-sub-${i}-${String(s.lang || 'SUB').toLowerCase()}`,
      lang: String(s.lang || 'SUB').toUpperCase(),
      label: s.label || `${String(s.lang || 'SUB').toUpperCase()} (${s.source || 'ClipBox'})`,
      url,
    });
  }
  return out;
}

function mergeSubtitleLists(
  primary: SubtitleTrackItem[],
  secondary: SubtitleTrackItem[] | undefined
): SubtitleTrackItem[] | undefined {
  const merged = [...primary];
  const seen = new Set(merged.map((s) => s.url || s.id));
  if (Array.isArray(secondary)) {
    for (const s of secondary) {
      const k = s?.url || s?.id;
      if (k && !seen.has(k)) {
        seen.add(k);
        merged.push(s);
      }
    }
  }
  return merged.length > 0 ? merged : undefined;
}

export function useClipboxPlayback(ctx: PlaybackCoreContext) {
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
    profileName,
    canChangeMedia,
    hostId,
    participants,
    isNestedSandboxFrame,
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

  const handlePlayClipboxMedia = async (
    item: ClipboxSearchItem,
    track: ClipboxPlayerTrack,
    streamsData: ClipboxTitleStreamsResult,
    epOpts?: { season?: number; episode?: number }
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }

    const isSeriesLike = item.mediaType === 'tv' || item.mediaType === 'anime';
    const season = Math.max(1, Number(epOpts?.season || streamsData.season || 1));
    const episode = Math.max(1, Number(epOpts?.episode || streamsData.episode || 1));
    const histId = isSeriesLike && item.tmdbId
      ? sanitizeItemKey(`tv-${item.tmdbId}-${season}-${episode}`)
      : canonicalizeHistoryItemId({
          id: item.id,
          mediaType: isSeriesLike ? 'tv' : 'movie',
          tmdbId: item.tmdbId,
        });
    const resumeAtSec = findSavedResumeSec(histId);

    const { reqSeq, signal } = beginMediaExtraction();

    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    if (isSeriesLike) {
      setActiveMovieContext(null);
    } else {
      setActiveMovieContext({
        tmdbId: item.tmdbId,
        title: item.title,
        year: item.year,
        poster: item.poster,
        backdrop: item.backdrop,
        overview: item.overview,
        preferLang: track.lang === 'ES' || track.lang === 'LAT' ? track.lang : 'VOSE',
      });
    }

    scrollDesktopToPlayer();
    setLoadingItemId(item.id);
    setExtractionError(null);

    const baseSubtitleTracks = toClipboxSubtitleTracks(streamsData.subtitles);
    const clipboxTracks: StreamTrack[] = (streamsData.tracks || [])
      .filter((t) => t.mode === 'hls' || t.mode === 'direct')
      .map((t) => ({
        id: `clipbox-trk-${t.id}`,
        label: t.label,
        lang: t.lang || 'VOSE',
        quality: t.quality || 'HD',
        sourceUrl: t.rawUrl || t.url,
        resolverType: t.mode === 'direct' ? 'direct_mp4' : 'direct_hls',
        resolvedStreamUrl: t.url,
      }));

    const seriesMeta =
      isSeriesLike && item.tmdbId
        ? {
            tmdbId: item.tmdbId,
            seriesTitle: item.title,
            season,
            episode,
            episodeTitle: `Episodio ${episode}`,
            totalEpisodesInSeason: item.episodeCount || undefined,
            poster: item.poster,
            backdrop: item.backdrop,
          }
        : undefined;

    const epTag = isSeriesLike ? ` · ${season}x${String(episode).padStart(2, '0')}` : '';
    const displayTitle = `${item.title}${epTag}`;
    const rawSourceKey = `clipbox:${item.mediaType}:${item.tmdbId || item.kitsuId || item.id}`;

    if (track.mode === 'hls' || track.mode === 'direct') {
      const selectedIdx = Math.max(
        0,
        clipboxTracks.findIndex((tr) => tr.resolvedStreamUrl === track.url)
      );
      activeHistoryIdRef.current = histId;
      const nextState: VideoState = {
        mode: track.mode === 'direct' ? 'direct' : 'hls',
        url: track.url,
        rawSourceUrl: rawSourceKey,
        title: displayTitle,
        subtitle: `${track.provider} · ${track.lang || 'VOSE'}`,
        poster: item.poster,
        backdrop: item.backdrop || item.poster,
        currentTime: resumeAtSec,
        isPlaying: true,
        isLive: false,
        tracks: clipboxTracks,
        activeTrackIndex: selectedIdx,
        subtitles: baseSubtitleTracks.length > 0 ? baseSubtitleTracks : undefined,
        tmdbId: item.tmdbId,
        seriesMeta,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      const { list, item: histItem } = addWatchHistoryItem({
        id: histId,
        mediaType: isSeriesLike ? 'tv' : 'movie',
        tmdbId: item.tmdbId,
        title: item.title,
        subtitle: isSeriesLike
          ? `${season}x${String(episode).padStart(2, '0')} · ${track.label}`
          : `${item.year || 'HD'} · ${track.label}`,
        poster: item.poster,
        backdrop: item.backdrop || item.poster,
        year: item.year,
        ...(isSeriesLike ? { season, episode, episodeTitle: `Episodio ${episode}` } : {}),
        preferLang: track.lang === 'ES' || track.lang === 'LAT' ? track.lang : 'VOSE',
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(histItem).catch(() => {});

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      setLoadingItemId(null);
      showLanguageNotice({
        type: 'success',
        title: `🎬 ${displayTitle}`,
        subtitle:
          baseSubtitleTracks.length > 0
            ? `${track.provider} · ${baseSubtitleTracks.length} pistas de subtítulos integradas`
            : `${track.provider} · Reproducción nativa directa`,
      });
      playCinemaSound('play');
      return;
    }

    setIsExtracting(true);
    isExtractingRef.current = true;
    setExtractionLabel(`${displayTitle} · Extrayendo señal directa (ClipBox)...`);

    try {
      const preferLang =
        track.lang === 'ES' || track.lang === 'LAT' || track.lang === 'EN' ? track.lang : 'VOSE';
      const params = new URLSearchParams({
        url: track.url.startsWith('/api/extract/stream') ? '' : track.url,
        mediaType: isSeriesLike ? 'tv' : 'movie',
        ...(item.tmdbId ? { tmdbId: String(item.tmdbId) } : {}),
        ...(isSeriesLike ? { season: String(season), episode: String(episode) } : {}),
        preferLang,
        title: item.title,
        ...(item.originalTitle ? { origTitle: item.originalTitle } : {}),
        ...(item.year && /^\d{4}$/.test(item.year) ? { year: item.year } : {}),
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
        directOnly: '1',
      });

      const fetchUrl = track.url.startsWith('/api/extract/stream')
        ? `${track.url}${track.url.includes('directOnly=') ? '' : '&directOnly=1'}`
        : `/api/extract/stream?${params.toString()}`;
      const res = await fetch(fetchUrl, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl || data.mode === 'cloud' || data.mode === 'embed') {
        const msg =
          data?.error ||
          'No hay señal directa estable en nuestro reproductor para esta opción ahora mismo.';
        setExtractionError(msg);
        showLanguageNotice({
          type: 'warning',
          title: `⚠️ ${displayTitle}`,
          subtitle: msg,
        });
        return;
      }

      const extractedTracks: StreamTrack[] = Array.isArray(data.tracks)
        ? data.tracks.filter((tr: StreamTrack) => tr.resolverType !== 'web_embed')
        : [];
      const mergedTracks = [...clipboxTracks];
      const seenTrackUrls = new Set(mergedTracks.map((t) => t.resolvedStreamUrl || t.sourceUrl));
      for (const tr of extractedTracks) {
        const k = tr.resolvedStreamUrl || tr.sourceUrl;
        if (k && !seenTrackUrls.has(k)) {
          seenTrackUrls.add(k);
          mergedTracks.push(tr);
        }
      }

      const activeIdx = Math.max(
        0,
        mergedTracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );
      const mergedSubtitles = mergeSubtitleLists(baseSubtitleTracks, data.subtitles);

      activeHistoryIdRef.current = histId;
      const nextState: VideoState = {
        mode: data.mode === 'direct' ? 'direct' : 'hls',
        url: data.streamUrl,
        rawSourceUrl: rawSourceKey,
        title: displayTitle,
        subtitle: `${mergedTracks[activeIdx]?.label || data.resolvedLabel || track.provider} · ClipBox`,
        poster: item.poster || data.poster,
        backdrop: item.backdrop || data.backdrop || item.poster,
        currentTime: resumeAtSec,
        isPlaying: true,
        isLive: false,
        tracks: mergedTracks,
        activeTrackIndex: activeIdx,
        subtitles: mergedSubtitles,
        tmdbId: item.tmdbId,
        seriesMeta,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      const { list, item: histItem } = addWatchHistoryItem({
        id: histId,
        mediaType: isSeriesLike ? 'tv' : 'movie',
        tmdbId: item.tmdbId,
        title: item.title,
        subtitle: isSeriesLike
          ? `${season}x${String(episode).padStart(2, '0')} · ${nextState.subtitle}`
          : `${item.year || 'HD'} · ${nextState.subtitle}`,
        poster: item.poster,
        backdrop: item.backdrop || item.poster,
        year: item.year,
        ...(isSeriesLike ? { season, episode, episodeTitle: `Episodio ${episode}` } : {}),
        preferLang,
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(histItem).catch(() => {});

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      commitVideoStateSync('change_url', nextState);
      showLanguageNotice({
        type: 'success',
        title: `🎬 ${displayTitle}`,
        subtitle:
          mergedSubtitles && mergedSubtitles.length > 0
            ? `${mergedTracks[activeIdx]?.label || 'HD'} · ${mergedSubtitles.length} subtítulos listos`
            : `${mergedTracks[activeIdx]?.label || 'HD'} · Señal directa lista`,
      });
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('Error extrayendo fuente directa de ClipBox.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  return { handlePlayClipboxMedia };
}
