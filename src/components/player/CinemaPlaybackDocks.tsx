import React from 'react';
import { Play, Square } from 'lucide-react';
import type { AppLanguage, VideoState } from '../../types';
import { pickLang } from '../../utils/i18n';
import { resolveTrackLang } from './trackLabelUtils';
import { triggerHaptic } from '../../utils/haptics';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { shouldShowSeriesEpisodesDock } from '../../hooks/appControllerHelpers';

const LiveMatchCenter = lazyWithRetry(() =>
  import('../LiveMatchCenter').then((m) => ({ default: m.LiveMatchCenter }))
);
const SeriesEpisodesDock = lazyWithRetry(() =>
  import('../SeriesEpisodesDock').then((m) => ({ default: m.SeriesEpisodesDock }))
);
const MoviePlaybackDock = lazyWithRetry(() =>
  import('../MoviePlaybackDock').then((m) => ({ default: m.MoviePlaybackDock }))
);
const ChannelGuideDock = lazyWithRetry(() =>
  import('../ChannelGuideDock').then((m) => ({ default: m.ChannelGuideDock }))
);

export interface CinemaPlaybackDocksProps {
  videoState: VideoState;
  lang: AppLanguage;
  isPlayerClosedLocally: boolean;
  isPlayerMinimized: boolean;
  isAutoImmersiveLandscape: boolean;
  isPlayerActive: boolean;
  isExtracting?: boolean;
  extractionError: string | null;
  activeSportsMatch: any;
  showLiveMatchDock: boolean;
  activeMatchDetails: any;
  loadingActiveMatchDetails: boolean;
  loadingItemId: string | null;
  activeMovieContext: any;
  isMoviePlaybackDockVisible: boolean;
  isChannelGuideDockVisible: boolean;
  tdtChannels: any[];
  onSelectTrack: (trackIndex: number, seekSec?: number) => void;
  onRefreshMatchDetails: (force?: boolean) => void;
  onCloseMatchDock: () => void;
  onShowMatchDock: () => void;
  onSelectEpisode: (series: any, episode: any, preferLang?: string) => void;
  onSelectMovie: (movieItem: any, preferLang?: string) => void;
  onSelectChannel: (channel: any, programHint?: string) => void;
  onReopenPlayer: () => void;
  onStopRoomPlayback: () => void;
  onClearExtractionError: () => void;
}

export const CinemaPlaybackDocks: React.FC<CinemaPlaybackDocksProps> = ({
  videoState,
  lang,
  isPlayerClosedLocally,
  isPlayerMinimized,
  isAutoImmersiveLandscape,
  isPlayerActive,
  isExtracting = false,
  extractionError,
  activeSportsMatch,
  showLiveMatchDock,
  activeMatchDetails,
  loadingActiveMatchDetails,
  loadingItemId,
  activeMovieContext,
  isMoviePlaybackDockVisible,
  isChannelGuideDockVisible,
  tdtChannels,
  onSelectTrack,
  onRefreshMatchDetails,
  onCloseMatchDock,
  onShowMatchDock,
  onSelectEpisode,
  onSelectMovie,
  onSelectChannel,
  onReopenPlayer,
  onStopRoomPlayback,
  onClearExtractionError,
}) => {
  const isSeriesDockVisible = shouldShowSeriesEpisodesDock({
    videoState,
    isExtracting,
    isPlayerClosedLocally,
    isPlayerMinimized,
    isAutoImmersiveLandscape,
  });
  const isAnyDockVisible =
    (videoState.mode !== 'idle' &&
      !isPlayerClosedLocally &&
      !isPlayerMinimized &&
      !isAutoImmersiveLandscape &&
      (activeSportsMatch ||
        isMoviePlaybackDockVisible ||
        isChannelGuideDockVisible)) ||
    isSeriesDockVisible ||
    (isPlayerClosedLocally && videoState.mode !== 'idle') ||
    (extractionError && !isPlayerActive);

  if (!isAnyDockVisible) {
    return null;
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-5 pt-3 pb-24 sm:pb-6 space-y-3 shrink-0">
      {/* 1. SPORTS MATCH CENTER / DOCK */}
      {videoState.mode !== 'idle' &&
        !isPlayerClosedLocally &&
        !isPlayerMinimized &&
        !isAutoImmersiveLandscape &&
        activeSportsMatch &&
        (showLiveMatchDock ? (
          <React.Suspense fallback={null}>
            <LiveMatchCenter
              variant="docked"
              lang={lang}
              details={activeMatchDetails}
              loading={loadingActiveMatchDetails}
              homeTeam={activeSportsMatch.homeTeam}
              awayTeam={activeSportsMatch.awayTeam}
              homeShort={activeSportsMatch.homeShort}
              awayShort={activeSportsMatch.awayShort}
              homeLogo={activeSportsMatch.homeLogo}
              awayLogo={activeSportsMatch.awayLogo}
              homeScore={activeSportsMatch.homeScore}
              awayScore={activeSportsMatch.awayScore}
              statusState={activeSportsMatch.statusState}
              statusLabel={activeSportsMatch.statusLabel}
              competition={activeSportsMatch.competition}
              tracks={videoState.tracks}
              activeTrackIndex={videoState.activeTrackIndex}
              onSelectTrack={(idx) => onSelectTrack(idx, 0)}
              onRefresh={() => onRefreshMatchDetails(true)}
              onCloseDock={onCloseMatchDock}
            />
          </React.Suspense>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#161922] border border-white/[0.08]">
            <span className="text-xs font-bold text-zinc-200 truncate">
              {activeMatchDetails?.homeTeam || activeSportsMatch.homeTeam} vs{' '}
              {activeMatchDetails?.awayTeam || activeSportsMatch.awayTeam}
            </span>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onShowMatchDock();
              }}
              className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-xs font-extrabold whitespace-nowrap cursor-pointer transition-colors"
            >
              {pickLang(lang, {
                es: 'Ver estadísticas en vivo',
                ca: 'Veure estadístiques en directe',
                en: 'Show Live Stats',
              })}
            </button>
          </div>
        ))}

      {/* 2. SERIES EPISODES GUIDE DOCK */}
      {isSeriesDockVisible && videoState.seriesMeta && (
          <React.Suspense fallback={null}>
            <SeriesEpisodesDock
              seriesMeta={videoState.seriesMeta}
              lang={lang}
              preferLang={(() => {
                const rawLang = String(
                  videoState.tracks[videoState.activeTrackIndex]?.lang || 'ES'
                ).toUpperCase();
                return rawLang === 'LAT' || rawLang === 'VOSE' || rawLang === 'EN'
                  ? rawLang
                  : 'ES';
              })()}
              loadingItemId={loadingItemId}
              onSelectEpisode={(series, episode, pLang) => {
                onSelectEpisode(series, episode, pLang);
              }}
            />
          </React.Suspense>
        )}

      {/* 3. MOVIE SIMILAR / PLAYBACK DOCK */}
      {isMoviePlaybackDockVisible && (
        <React.Suspense fallback={null}>
          <MoviePlaybackDock
            movie={
              activeMovieContext || {
                title: videoState.title,
                poster: videoState.poster,
                backdrop: videoState.backdrop,
              }
            }
            lang={lang}
            preferLang={resolveTrackLang(videoState.tracks[videoState.activeTrackIndex], {
              subtitle: videoState.subtitle,
              title: videoState.title,
              fallbackLang: activeMovieContext?.preferLang,
            })}
            loadingItemId={loadingItemId}
            onSelectMovie={(movieItem, pLang) => {
              onSelectMovie(movieItem, pLang);
            }}
          />
        </React.Suspense>
      )}

      {/* 4. LIVE TV CHANNEL GUIDE DOCK */}
      {isChannelGuideDockVisible && (
        <React.Suspense fallback={null}>
          <ChannelGuideDock
            lang={lang}
            activeChannelTitle={videoState.title}
            activeChannelSubtitle={videoState.subtitle}
            activeRawSourceUrl={videoState.rawSourceUrl}
            channels={tdtChannels}
            loadingItemId={loadingItemId}
            onSelectChannel={(ch, progHint) => {
              onSelectChannel(ch, progHint);
            }}
          />
        </React.Suspense>
      )}

      {/* 5. LOCALLY CLOSED PLAYER BANNER */}
      {isPlayerClosedLocally && videoState.mode !== 'idle' && (
        <div className="p-3.5 rounded-2xl bg-[#18181B] border border-white/[0.1] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#BF94FF]">
              {pickLang(lang, {
                es: 'Reproduciendo en la sala',
                ca: 'Reproduint a la sala',
                en: 'Playing in room',
              })}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-white truncate">
              {videoState.title}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onReopenPlayer}
              className="min-h-11 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {pickLang(lang, {
                  es: 'Volver a abrir',
                  ca: 'Tornar a obrir',
                  en: 'Reopen',
                })}
              </span>
            </button>
            <button
              type="button"
              onClick={onStopRoomPlayback}
              className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/12 text-xs font-medium text-zinc-300 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>
                {pickLang(lang, {
                  es: 'Detener sala',
                  ca: 'Aturar sala',
                  en: 'Stop room',
                })}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 6. EXTRACTION ERROR BANNER */}
      {extractionError && !isPlayerActive && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between gap-2 animate-fade-in">
          <span>{extractionError}</span>
          <button
            type="button"
            onClick={onClearExtractionError}
            className="min-h-9 px-3 rounded-xl bg-rose-500/20 text-rose-200 font-semibold cursor-pointer"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
};
