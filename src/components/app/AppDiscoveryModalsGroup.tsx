import React from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { WorldId } from '../../store/useAppStore';
import type { CatalogSection } from '../MediaCatalogHub';
import type { StoredProfile } from '../../utils/storage';
import type { NativeApkUpdateAvailable } from '../../utils/versionSync';
import { triggerApkDownload } from '../../utils/apkDownload';
import { clearStaleCachesAndReload } from '../../utils/versionSync';
import { pickLang } from '../../utils/i18n';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
  TvEpisodeItem,
  TvSeriesDetails,
  VideoState,
  WatchHistoryItem,
} from '../../types';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const NotificationCenterSheet = lazyWithRetry(() =>
  import('../NotificationCenterSheet').then((m) => ({ default: m.NotificationCenterSheet }))
);
const CommandSearchModal = lazyWithRetry(() =>
  import('../CommandSearchModal').then((m) => ({ default: m.CommandSearchModal }))
);
const SurpriseMeModal = lazyWithRetry(() =>
  import('../SurpriseMeModal').then((m) => ({ default: m.SurpriseMeModal }))
);
const VoiceAssistantModal = lazyWithRetry(() =>
  import('../VoiceAssistantModal').then((m) => ({ default: m.VoiceAssistantModal }))
);
const LegalPrivacyModal = lazyWithRetry(() =>
  import('../LegalPrivacyModal').then((m) => ({ default: m.LegalPrivacyModal }))
);

interface AppDiscoveryModalsGroupProps {
  lang: AppLanguage;
  roomId: string;
  profile: StoredProfile;
  videoState: VideoState;
  watchHistory: WatchHistoryItem[];
  quickPool: {
    movies: CatalogMovie[];
    series: CatalogMovie[];
    tdt: SpanishTdtChannel[];
  };
  quickPoolLoading: boolean;
  loadQuickPool: () => Promise<void>;
  cineCastellano: boolean;
  swUpdate: boolean;
  applySwUpdateNow: () => void;
  deferredAppUpdateVersion: string | null;
  nativeApkUpdate: NativeApkUpdateAvailable | null;
  setNativeApkUpdate: (u: NativeApkUpdateAvailable | null) => void;
  showNotificationCenter: boolean;
  setShowNotificationCenter: (open: boolean) => void;
  showCommandSearch: boolean;
  setShowCommandSearch: (open: boolean) => void;
  showSurpriseModal: boolean;
  setShowSurpriseModal: (open: boolean) => void;
  aiSearchLaunch: {
    query: string;
    mediaType?: 'all' | 'movie' | 'tv';
    mode?: 'surprise' | 'request';
    seq: number;
  } | null;
  setAiSearchLaunch: React.Dispatch<
    React.SetStateAction<{
      query: string;
      mediaType?: 'all' | 'movie' | 'tv';
      mode?: 'surprise' | 'request';
      seq: number;
    } | null>
  >;
  showVoiceAssistant: boolean;
  setShowVoiceAssistant: (open: boolean) => void;
  showLegalModal: boolean;
  setShowLegalModal: (open: boolean) => void;
  setFriendsModalOpen: (open: boolean) => void;
  onSwitchRoom: (code: string, name?: string) => void;
  onPlayMovie: (movie: CatalogMovie, preferLang?: string) => Promise<void>;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    ep: TvEpisodeItem,
    preferLang: string
  ) => Promise<void>;
  onPlayChannel: (ch: SpanishTdtChannel) => void;
  onPlayMatch: (m: SportsMatch) => void;
  onSyncPlayerAction: (
    action: 'play' | 'pause' | 'seek' | 'change_url',
    patch: Partial<VideoState>
  ) => void;
  onNextEpisode: () => void;
  setCatalogSection: (sec: CatalogSection) => void;
  enterWorld: (world: WorldId, opts?: { withPortal?: boolean }) => void;
}

export const AppDiscoveryModalsGroup: React.FC<AppDiscoveryModalsGroupProps> = ({
  lang,
  roomId,
  profile,
  videoState,
  watchHistory,
  quickPool,
  quickPoolLoading,
  loadQuickPool,
  cineCastellano,
  swUpdate,
  applySwUpdateNow,
  deferredAppUpdateVersion,
  nativeApkUpdate,
  setNativeApkUpdate,
  showNotificationCenter,
  setShowNotificationCenter,
  showCommandSearch,
  setShowCommandSearch,
  showSurpriseModal,
  setShowSurpriseModal,
  aiSearchLaunch,
  setAiSearchLaunch,
  showVoiceAssistant,
  setShowVoiceAssistant,
  showLegalModal,
  setShowLegalModal,
  setFriendsModalOpen,
  onSwitchRoom,
  onPlayMovie,
  onPlaySeriesEpisode,
  onPlayChannel,
  onPlayMatch,
  onSyncPlayerAction,
  onNextEpisode,
  setCatalogSection,
  enterWorld,
}) => (
  <>
    {(swUpdate || nativeApkUpdate || deferredAppUpdateVersion) && (
      <div className="fixed bottom-20 sm:bottom-6 right-4 z-[70] max-w-xs px-4 py-3 rounded-2xl bg-[#18181B]/95 backdrop-blur-xl border border-[#9146FF]/40 shadow-2xl flex items-center justify-between gap-3">
        <div className="text-xs text-white font-semibold">
          {nativeApkUpdate
            ? pickLang(lang, {
                es: `Nueva APK v${nativeApkUpdate.versionName} lista`,
                ca: `Nova APK v${nativeApkUpdate.versionName} llesta`,
                en: `New APK v${nativeApkUpdate.versionName} ready`,
              })
            : pickLang(lang, {
                es: `Nueva versión ${deferredAppUpdateVersion || ''} lista`.trim(),
                ca: `Nova versió ${deferredAppUpdateVersion || ''} llesta`.trim(),
                en: `Update ${deferredAppUpdateVersion || ''} ready`.trim(),
              })}
        </div>
        {nativeApkUpdate ? (
          <button
            type="button"
            onClick={() => {
              const filename =
                nativeApkUpdate.flavor === 'tv' ? 'RIFFAN-TV-TV.apk' : 'RIFFAN-TV.apk';
              void triggerApkDownload(nativeApkUpdate.apkUrl, filename);
              setNativeApkUpdate(null);
            }}
            className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Instalar', ca: 'Instal·lar', en: 'Install' })}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (swUpdate) {
                applySwUpdateNow();
              } else if (deferredAppUpdateVersion) {
                void clearStaleCachesAndReload();
              }
            }}
            className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Actualizar', ca: 'Actualitzar', en: 'Update' })}</span>
          </button>
        )}
      </div>
    )}

    <React.Suspense fallback={null}>
      <NotificationCenterSheet
        isOpen={showNotificationCenter}
        onClose={() => setShowNotificationCenter(false)}
        lang={lang}
        onActionNotification={(item) => {
          setShowNotificationCenter(false);
          if (item.roomId && item.roomId !== roomId) {
            onSwitchRoom(item.roomId);
          }
        }}
      />

      <CommandSearchModal
        isOpen={showCommandSearch}
        onClose={() => setShowCommandSearch(false)}
        lang={lang}
        movies={quickPool.movies}
        series={quickPool.series}
        tdtChannels={quickPool.tdt}
        onSelectCatalogItem={async (item) => {
          if (item.mediaType === 'tv' && item.tmdbId) {
            setCatalogSection('series');
            try {
              const seasonNum = item.seasonNumber || 1;
              const res = await fetch(
                `/api/catalog/tv/${item.tmdbId}?season=${seasonNum}&lang=${lang}`
              );
              const data = await res.json();
              if (data?.details?.episodes?.length > 0) {
                await onPlaySeriesEpisode(
                  data.details as TvSeriesDetails,
                  data.details.episodes[0] as TvEpisodeItem,
                  'ES'
                );
              }
            } catch {
              // fallback already focused series section
            }
          } else {
            await onPlayMovie(item, 'ES');
          }
        }}
        onSelectChannel={onPlayChannel}
        onSearchWithAi={(query, mediaType = 'all') => {
          setShowCommandSearch(false);
          setAiSearchLaunch((prev) => ({
            query,
            mediaType,
            mode: 'request',
            seq: (prev?.seq || 0) + 1,
          }));
          setShowSurpriseModal(true);
        }}
      />

      <SurpriseMeModal
        isOpen={showSurpriseModal}
        onClose={() => setShowSurpriseModal(false)}
        lang={lang}
        movies={quickPool.movies}
        series={quickPool.series}
        isLoading={quickPoolLoading}
        initialRequest={aiSearchLaunch}
        onRetryLoad={() => {
          void loadQuickPool();
        }}
        onPlayItem={async (item) => {
          if (item.mediaType === 'tv' && item.tmdbId) {
            setCatalogSection('series');
            try {
              const seasonNum = item.seasonNumber || 1;
              const res = await fetch(
                `/api/catalog/tv/${item.tmdbId}?season=${seasonNum}&lang=${lang}`
              );
              const data = await res.json();
              if (data?.details?.episodes?.length > 0) {
                await onPlaySeriesEpisode(
                  data.details as TvSeriesDetails,
                  data.details.episodes[0] as TvEpisodeItem,
                  'ES'
                );
              }
            } catch {
              // keep series tab focused
            }
          } else {
            await onPlayMovie(item, 'ES');
          }
        }}
      />

      <VoiceAssistantModal
        isOpen={showVoiceAssistant}
        onClose={() => setShowVoiceAssistant(false)}
        lang={lang}
        userName={profile.name}
        activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : ''}
        watchHistory={watchHistory}
        onPlayMovie={(movieItem, preferLang = 'ES') => {
          void onPlayMovie(movieItem, preferLang);
        }}
        onPlaySeries={async (seriesItem, targetSeason, targetEpisode) => {
          if (seriesItem.tmdbId) {
            setCatalogSection('series');
            try {
              const seasonNum = targetSeason || seriesItem.seasonNumber || 1;
              const res = await fetch(
                `/api/catalog/tv/${seriesItem.tmdbId}?season=${seasonNum}&lang=${lang}`
              );
              const data = await res.json();
              const episodes = (data?.details?.episodes || []) as TvEpisodeItem[];
              if (episodes.length > 0) {
                const episodeNum = targetEpisode || seriesItem.episodeNumber || 1;
                const targetEp =
                  episodes.find((ep) => ep.episodeNumber === episodeNum) ||
                  episodes[episodeNum - 1] ||
                  episodes[0];
                await onPlaySeriesEpisode(
                  data.details as TvSeriesDetails,
                  targetEp,
                  cineCastellano ? 'ES' : 'VOSE'
                );
                return;
              }
            } catch {
              // fallback below
            }
          }
          enterWorld('cine');
        }}
        onPlayChannel={onPlayChannel}
        onPlayMatch={onPlayMatch}
        onAppAction={(action) => {
          if (action.type === 'open_world' && action.payload) {
            const target = action.payload as WorldId;
            enterWorld(target, {
              withPortal:
                target === 'cine' ||
                target === 'futbol' ||
                target === 'tv' ||
                target === 'juegos' ||
                target === 'sala',
            });
          } else if (action.type === 'open_friends') {
            setFriendsModalOpen(true);
          } else if (action.type === 'surprise_me') {
            setAiSearchLaunch((prev) => ({
              query: '',
              mediaType: 'all',
              mode: 'surprise',
              seq: (prev?.seq || 0) + 1,
            }));
            setShowSurpriseModal(true);
          } else if (action.type === 'player_control') {
            const cmd = action.payload;
            if (cmd === 'play' || cmd === 'pause') {
              onSyncPlayerAction(cmd, { isPlaying: cmd === 'play' });
            } else if (cmd === 'next_episode') {
              onNextEpisode();
            } else if (cmd === 'mute' || cmd === 'unmute') {
              const vid = document.querySelector('video');
              if (vid) vid.muted = cmd === 'mute';
            } else if (cmd === 'fullscreen') {
              if (document.fullscreenElement) {
                void document.exitFullscreen?.();
              } else {
                void document.documentElement.requestFullscreen?.();
              }
            }
          }
        }}
      />

      <LegalPrivacyModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        lang={lang}
      />
    </React.Suspense>
  </>
);
