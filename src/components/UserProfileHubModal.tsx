import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  X,
  Play,
  RotateCcw,
  Trash2,
  Heart,
  Star,
  Plus,
  ArrowRight,
  Clock,
  Share2,
  Check,
  Cloud,
  LogIn,
  LogOut,
  Monitor,
  Smartphone,
  Tv,
  Film,
  Trophy,
  Lock,
  Bookmark,
  Palette,
  Sparkles,
  Scale,
  CalendarPlus,
} from 'lucide-react';
import {
  AppLanguage,
  AppTheme,
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  WatchHistoryItem,
} from '../types';
import { RecentRoomEntry } from '../utils/storage';
import { triggerHaptic } from '../utils/haptics';
import { buildShortInviteUrl, extractRoomCodeFromInput } from '../utils/shortLink';
import { EffectiveViewMode, getMonogramInitials } from './MobileViewportGuard';
import { PWAInstallButton } from './PWAInstallPrompt';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';

function formatResumeClock(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export type ProfileHubTab = 'history' | 'favorites' | 'channels' | 'account';

interface UserProfileHubModalProps {
  isOpen: boolean;
  initialTab?: ProfileHubTab;
  onClose: () => void;
  lang: AppLanguage;
  onChangeLang?: (lang: AppLanguage) => void;
  onOpenLegalModal?: () => void;
  onOpenDesignSystem?: () => void;
  authUser: User | null;
  authLoading: boolean;
  displayName: string;
  roomId: string;
  roomName: string;
  recentRooms: RecentRoomEntry[];
  watchHistory: WatchHistoryItem[];
  watchlist: CatalogMovie[];
  favoriteChannels: FavoriteChannelItem[];
  effectiveView: EffectiveViewMode;
  onToggleViewMode: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onUpdateDisplayName: (newName: string) => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onRemoveHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onPlayCatalogItem: (item: CatalogMovie) => void;
  onToggleCatalogFavorite: (item: CatalogMovie) => void;
  onPlayFavoriteChannel: (ch: FavoriteChannelItem) => void;
  onRemoveFavoriteChannel: (ch: FavoriteChannelItem) => void;
  onCreateNewRoom: () => void;
  onSwitchRoom: (targetRoomId: string, targetRoomName?: string) => void;
  savedRooms?: CloudSavedRoom[];
  isCurrentRoomPermanent?: boolean;
  onToggleCurrentRoomPermanent?: () => void;
  onDeleteSavedRoom?: (roomCode: string) => void;
  onLeaveRoom?: () => void;
}

export const UserProfileHubModal: React.FC<UserProfileHubModalProps> = ({
  isOpen,
  initialTab = 'history',
  onClose,
  lang,
  onChangeLang,
  onOpenLegalModal,
  onOpenDesignSystem,
  authUser,
  authLoading,
  displayName,
  roomId,
  roomName,
  recentRooms,
  watchHistory,
  watchlist,
  favoriteChannels,
  effectiveView,
  onToggleViewMode,
  onSignIn,
  onSignOut,
  onUpdateDisplayName,
  onReplayHistoryItem,
  onRemoveHistoryItem,
  onClearHistory,
  onPlayCatalogItem,
  onToggleCatalogFavorite,
  onPlayFavoriteChannel,
  onRemoveFavoriteChannel,
  onCreateNewRoom,
  onSwitchRoom,
  savedRooms = [],
  isCurrentRoomPermanent = false,
  onToggleCurrentRoomPermanent,
  onDeleteSavedRoom,
  onLeaveRoom,
}) => {
  const { theme, setTheme, density, setDensity, liteMode, setLiteMode } = useThemeStore();
  const { scheduledRooms, addScheduledRoom, removeScheduledRoom } = useAppStore();
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleTime, setScheduleTime] = useState('22:00');
  const [activeTab, setActiveTab] = useState<ProfileHubTab>(
    initialTab === 'channels' ? 'favorites' : initialTab
  );
  const [favFilter, setFavFilter] = useState<'all' | 'tv' | 'movie' | 'channels'>(
    initialTab === 'channels' ? 'channels' : 'all'
  );
  const [draftName, setDraftName] = useState(displayName);
  const [savedNameFeedback, setSavedNameFeedback] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab === 'channels' ? 'favorites' : initialTab);
      if (initialTab === 'channels') setFavFilter('channels');
      setDraftName(displayName);
    }
  }, [isOpen, initialTab, displayName]);

  useEffect(() => {
    setPhotoBroken(false);
  }, [authUser?.photoURL]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const latestWatched = watchHistory[0] || null;
  const filteredWatchlist = watchlist.filter((item) => {
    if (favFilter === 'channels') return false;
    if (favFilter === 'all') return true;
    const type = item.mediaType === 'tv' ? 'tv' : 'movie';
    return type === favFilter;
  });
  const totalSavedCount = watchlist.length + favoriteChannels.length;

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    triggerHaptic('success');
    onUpdateDisplayName(trimmed.slice(0, 24));
    setSavedNameFeedback(true);
    setTimeout(() => setSavedNameFeedback(false), 1800);
  };

  const handleJoinRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractRoomCodeFromInput(joinCode);
    if (!clean) return;
    triggerHaptic('success');
    setJoinCode('');
    onSwitchRoom(clean);
    onClose();
  };

  const handleCopyCurrentInvite = async () => {
    if (!roomId) return;
    triggerHaptic('success');
    const url = buildShortInviteUrl(roomId, false);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'es' ? 'Mi Perfil NAIM CINE' : 'My Profile'}
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[880px] max-h-[92dvh] sm:max-h-[86dvh] rounded-t-3xl sm:rounded-3xl bg-[#18181B]/95 backdrop-blur-2xl border-t sm:border border-white/[0.08] shadow-[0_32px_110px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden"
      >
        {/* Mobile iOS Sheet Grab Handle */}
        <div className="sm:hidden pt-2.5 flex justify-center bg-[#0E0E10]">
          <div className="sheet-handle" />
        </div>

        {/* ================================================================ */}
        {/* HEADER: USER IDENTITY + QUICK ROOM SWITCHER + CLOSE              */}
        {/* ================================================================ */}
        <div className="px-4 sm:px-6 pt-3.5 sm:pt-5 pb-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 bg-[#0E0E10]">
          <div className="flex items-center gap-3 min-w-0">
            {authUser?.photoURL && !photoBroken ? (
              <img
                src={authUser.photoURL}
                alt={displayName}
                referrerPolicy="no-referrer"
                onError={() => setPhotoBroken(true)}
                className="w-11 h-11 rounded-2xl object-cover border border-white/15 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-[#9146FF]/20 border border-[#9146FF]/45 flex items-center justify-center font-display font-bold text-sm text-white shrink-0">
                {getMonogramInitials(displayName)}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base sm:text-lg text-white truncate">
                  {displayName}
                </h2>
                {authUser && (
                  <span className="text-[11px] font-medium text-emerald-400 whitespace-nowrap">
                    · Cloud Sync
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-400 truncate">
                {authUser?.email ||
                  (lang === 'es'
                    ? 'Perfil local · Conecta Google para sincronizar entre dispositivos'
                    : 'Local profile · Sign in to sync across devices')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                onCreateNewRoom();
                onClose();
              }}
              className="hidden sm:flex min-h-[38px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>{lang === 'es' ? 'Nueva sala' : 'New room'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={lang === 'es' ? 'Cerrar mi perfil' : 'Close profile'}
              className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* NAVIGATION TABS (3 CLEAN TABS: CONTINUAR VIENDO · GUARDADOS · CUENTA) */}
        {/* ================================================================ */}
        <div className="px-4 sm:px-6 bg-[#0E0E10] border-b border-white/[0.08] flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar shrink-0">
          {(
            [
              {
                id: 'history',
                label:
                  lang === 'es'
                    ? `Continuar Viendo (${watchHistory.length})`
                    : `History (${watchHistory.length})`,
              },
              {
                id: 'favorites',
                label:
                  lang === 'es'
                    ? `Guardados (${totalSavedCount})`
                    : `Saved (${totalSavedCount})`,
              },
              {
                id: 'account',
                label: lang === 'es' ? 'Cuenta y Salas' : 'Account & Rooms',
              },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(tab.id);
                }}
                className={`min-h-[44px] px-3 sm:px-4 border-b-2 text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'border-[#9146FF] text-[#BF94FF]'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ================================================================ */}
        {/* SCROLLABLE BODY                                                  */}
        {/* ================================================================ */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 min-h-0">
          {/* -------------------------------------------------------------- */}
          {/* TAB 1: SEGUIR VIENDO & HISTORIAL                               */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'history' && (
            <div className="space-y-5">
              {latestWatched ? (
                <>
                  {/* Spotlight Resume Card */}
                  <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#1F1F23] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {latestWatched.poster ? (
                        <img
                          src={latestWatched.poster}
                          alt={latestWatched.title}
                          referrerPolicy="no-referrer"
                          className="w-16 h-24 rounded-xl object-cover border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-24 rounded-xl bg-[#26262C] flex items-center justify-center shrink-0">
                          <Film className="w-6 h-6 text-zinc-500" />
                        </div>
                      )}
                      <div className="min-w-0 space-y-1">
                        <div className="text-[11px] font-medium text-[#BF94FF]">
                          {lang === 'es' ? 'Última reproducción' : 'Last watched'}
                        </div>
                        <h3 className="font-display font-bold text-base sm:text-lg text-white truncate">
                          {latestWatched.title}
                        </h3>
                        <p className="text-xs text-zinc-400 truncate">
                          {latestWatched.subtitle}
                        </p>
                        {latestWatched.resumeTimeSec && latestWatched.resumeTimeSec > 5 ? (
                          <div className="pt-1 space-y-1 max-w-[240px]">
                            <div className="text-[11px] font-mono tabular-nums text-zinc-300">
                              {lang === 'es' ? 'Punto guardado:' : 'Saved at:'}{' '}
                              {formatResumeClock(latestWatched.resumeTimeSec)}
                              {latestWatched.durationSec
                                ? ` / ${formatResumeClock(latestWatched.durationSec)}`
                                : ''}
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
                              <div
                                className="h-full bg-[#9146FF] rounded-full"
                                style={{
                                  width: `${
                                    latestWatched.durationSec && latestWatched.durationSec > 0
                                      ? Math.min(
                                          98,
                                          Math.max(
                                            6,
                                            Math.round(
                                              (latestWatched.resumeTimeSec /
                                                latestWatched.durationSec) *
                                                100
                                            )
                                          )
                                        )
                                      : 35
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onReplayHistoryItem(latestWatched, false);
                          onClose();
                        }}
                        className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>
                          {latestWatched.resumeTimeSec && latestWatched.resumeTimeSec > 5
                            ? lang === 'es'
                              ? `Seguir en ${formatResumeClock(latestWatched.resumeTimeSec)}`
                              : `Resume ${formatResumeClock(latestWatched.resumeTimeSec)}`
                            : lang === 'es'
                            ? 'Reproducir'
                            : 'Play'}
                        </span>
                      </button>

                      {latestWatched.resumeTimeSec && latestWatched.resumeTimeSec > 5 ? (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onReplayHistoryItem(latestWatched, true);
                            onClose();
                          }}
                          title={lang === 'es' ? 'Empezar desde 00:00' : 'Start from 00:00'}
                          className="w-11 h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Full History List */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-zinc-400">
                      {lang === 'es'
                        ? 'Todo tu historial de visualización'
                        : 'Complete watch history'}
                    </h4>
                    <button
                      type="button"
                      onClick={(e) => {
                        const btn = e.currentTarget;
                        triggerHaptic('medium');
                        if (btn.dataset.confirm === '1') {
                          btn.dataset.confirm = '0';
                          onClearHistory();
                        } else {
                          btn.dataset.confirm = '1';
                          const span = btn.querySelector('span');
                          if (span) span.textContent = lang === 'es' ? '¿Confirmar borrar?' : 'Confirm clear?';
                          setTimeout(() => {
                            btn.dataset.confirm = '0';
                            if (span) span.textContent = lang === 'es' ? 'Borrar todo' : 'Clear all';
                          }, 3000);
                        }
                      }}
                      className="min-h-[36px] px-2.5 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{lang === 'es' ? 'Borrar todo' : 'Clear all'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {watchHistory.map((item) => {
                      const pct =
                        item.resumeTimeSec && item.durationSec && item.durationSec > 0
                          ? Math.min(
                              98,
                              Math.max(
                                5,
                                Math.round((item.resumeTimeSec / item.durationSec) * 100)
                              )
                            )
                          : item.resumeTimeSec && item.resumeTimeSec > 5
                          ? 30
                          : 0;

                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl bg-[#1F1F23] border border-white/[0.08] hover:border-[#9146FF]/40 p-3 flex items-center gap-3 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onReplayHistoryItem(item, false);
                              onClose();
                            }}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-[#26262C] shrink-0">
                              {item.poster ? (
                                <img
                                  src={item.poster}
                                  alt={item.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Film className="w-4 h-4 text-zinc-500" />
                                </div>
                              )}
                              {pct > 0 && (
                                <div className="absolute bottom-0 inset-x-0 h-1 bg-black/70">
                                  <div
                                    className="h-full bg-[#9146FF]"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-xs sm:text-sm font-semibold text-white truncate">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                                {item.subtitle}
                              </div>
                              <div className="text-[11px] font-mono tabular-nums text-[#BF94FF] mt-1">
                                {item.resumeTimeSec && item.resumeTimeSec > 5
                                  ? `${
                                      lang === 'es' ? 'Seguir en' : 'Resume'
                                    } ${formatResumeClock(item.resumeTimeSec)}`
                                  : lang === 'es'
                                  ? 'Volver a ver'
                                  : 'Watch again'}
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onRemoveHistoryItem(item.id);
                            }}
                            aria-label="Eliminar del historial"
                            className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center space-y-2">
                  <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="font-display font-semibold text-sm sm:text-base text-white">
                    {lang === 'es'
                      ? 'Aún no tienes películas ni series en tu historial'
                      : 'Your watch history is empty'}
                  </p>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    {lang === 'es'
                      ? 'Cualquier película o episodio que reproduzcas se guardará aquí automáticamente con el segundo exacto donde lo dejaste.'
                      : 'Movies and episodes you play will automatically appear here with your exact resume timestamp.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* TAB 2: UNIFIED GUARDADOS (PELÍCULAS, SERIES Y CANALES TV)      */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'favorites' && (
            <div className="space-y-5">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {(
                  [
                    {
                      id: 'all',
                      label: lang === 'es' ? `Todo (${totalSavedCount})` : `All (${totalSavedCount})`,
                    },
                    {
                      id: 'movie',
                      label:
                        lang === 'es'
                          ? `Películas (${watchlist.filter((w) => w.mediaType !== 'tv').length})`
                          : 'Movies',
                    },
                    {
                      id: 'tv',
                      label:
                        lang === 'es'
                          ? `Series (${watchlist.filter((w) => w.mediaType === 'tv').length})`
                          : 'Series',
                    },
                    {
                      id: 'channels',
                      label:
                        lang === 'es'
                          ? `Canales TV (${favoriteChannels.length})`
                          : `Channels (${favoriteChannels.length})`,
                    },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFavFilter(f.id)}
                    className={`min-h-9 px-3.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                      favFilter === f.id
                        ? 'bg-[#9146FF] text-white shadow-sm'
                        : 'bg-[#1F1F23] hover:bg-[#26262C] border border-white/[0.08] text-zinc-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Saved Live Sports Channels Section */}
              {(favFilter === 'all' || favFilter === 'channels') &&
                favoriteChannels.length > 0 && (
                  <div className="space-y-2.5">
                    {favFilter === 'all' && (
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        <span>Canales y Partidos Guardados ({favoriteChannels.length})</span>
                      </h4>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {favoriteChannels.map((ch) => (
                        <div
                          key={ch.favId}
                          className="rounded-2xl bg-[#1F1F23] border border-white/[0.08] hover:border-[#9146FF]/40 p-3.5 flex items-center justify-between gap-3 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('success');
                              onPlayFavoriteChannel(ch);
                              onClose();
                            }}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                              <Trophy className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs sm:text-sm font-semibold text-white truncate">
                                {ch.channelLabel}
                              </div>
                              <div className="text-[11px] text-zinc-400 truncate">
                                {ch.competition} · {ch.title}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('success');
                                onPlayFavoriteChannel(ch);
                                onClose();
                              }}
                              className="min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>{lang === 'es' ? 'Ver' : 'Watch'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onRemoveFavoriteChannel(ch);
                              }}
                              title={lang === 'es' ? 'Quitar canal favorito' : 'Remove channel'}
                              aria-label="Quitar canal favorito"
                              className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-amber-400 hover:text-rose-300 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Star className="w-4 h-4 fill-current" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Saved Movies & TV Series Grid */}
              {favFilter !== 'channels' && filteredWatchlist.length > 0 && (
                <div className="space-y-2.5">
                  {favFilter === 'all' && favoriteChannels.length > 0 && (
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-[#9146FF]" />
                      <span>Películas y Series en Mi Lista ({filteredWatchlist.length})</span>
                    </h4>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    {filteredWatchlist.map((item) => {
                      const isSeries = item.mediaType === 'tv';
                      return (
                        <div
                          key={`${item.mediaType || 'movie'}-${item.tmdbId || item.id}`}
                          className="group relative rounded-2xl overflow-hidden bg-[#1F1F23] border border-white/[0.08] hover:border-[#9146FF]/50 flex flex-col transition-all"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onPlayCatalogItem(item);
                              onClose();
                            }}
                            className="relative aspect-[2/3] w-full overflow-hidden bg-[#26262C] text-left cursor-pointer"
                          >
                            {item.poster ? (
                              <img
                                src={item.poster}
                                alt={item.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                {isSeries ? (
                                  <Tv className="w-7 h-7 text-zinc-600" />
                                ) : (
                                  <Film className="w-7 h-7 text-zinc-600" />
                                )}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent flex flex-col justify-end p-3">
                              <div className="text-[10px] text-zinc-300">
                                {isSeries
                                  ? lang === 'es'
                                    ? 'Serie TV'
                                    : 'TV Series'
                                  : lang === 'es'
                                  ? 'Película'
                                  : 'Movie'}
                                {item.year ? ` · ${item.year}` : ''}
                              </div>
                              <div className="font-display font-semibold text-xs sm:text-sm text-white line-clamp-2 mt-0.5">
                                {item.title}
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onToggleCatalogFavorite(item);
                            }}
                            title={lang === 'es' ? 'Quitar de favoritos' : 'Remove favorite'}
                            aria-label="Quitar de favoritos"
                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-[#9146FF] flex items-center justify-center text-[#BF94FF] hover:text-white cursor-pointer transition-colors"
                          >
                            <Heart className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state when nothing saved matches filter */}
              {((favFilter === 'channels' && favoriteChannels.length === 0) ||
                (favFilter !== 'channels' &&
                  filteredWatchlist.length === 0 &&
                  (favFilter !== 'all' || favoriteChannels.length === 0))) && (
                <div className="py-12 text-center space-y-2">
                  <Heart className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="font-display font-semibold text-sm sm:text-base text-white">
                    {lang === 'es'
                      ? 'No tienes elementos guardados en esta sección'
                      : 'No saved items in this section'}
                  </p>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    {lang === 'es'
                      ? 'Pulsa el corazón (♥) en cualquier película o serie, o la estrella (★) en los canales de fútbol para tenerlos siempre a mano aquí.'
                      : 'Tap the heart on movies/series or the star on sports channels to save them here.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* TAB 4: SALAS, IDENTIDAD, VISTA Y CUENTA                        */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'account' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Room Control Card */}
              <div className="rounded-2xl bg-[#1F1F23] border border-white/[0.08] p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-zinc-400">
                      {lang === 'es' ? 'Sala actual' : 'Current room'}
                    </div>
                    <div className="font-display font-bold text-sm sm:text-base text-white">
                      {roomName || `Sala ${roomId.toUpperCase()}`}{' '}
                      <span className="font-mono text-xs text-zinc-400">#{roomId}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCurrentInvite}
                    className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#00F593]" />
                        <span>{lang === 'es' ? 'Copiado' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-[#BF94FF]" />
                        <span>{lang === 'es' ? 'Copiar link' : 'Copy link'}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onCreateNewRoom();
                      onClose();
                    }}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {lang === 'es' ? 'Nueva sala' : 'New room'}
                    </span>
                  </button>

                  {authUser && onToggleCurrentRoomPermanent && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onToggleCurrentRoomPermanent();
                      }}
                      className={`flex-1 min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                        isCurrentRoomPermanent
                          ? 'bg-emerald-500/18 border-emerald-400/45 text-emerald-200'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/12 text-zinc-200'
                      }`}
                    >
                      <Bookmark className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {isCurrentRoomPermanent
                          ? lang === 'es'
                            ? 'Sala Permanente ✓'
                            : 'Permanent Room ✓'
                          : lang === 'es'
                          ? 'Hacer Permanente'
                          : 'Save Permanent'}
                      </span>
                    </button>
                  )}

                  {onLeaveRoom && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onClose();
                        onLeaveRoom();
                      }}
                      className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-[#9146FF]/15 border border-white/12 hover:border-[#9146FF]/35 text-xs font-semibold text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                    >
                      <LogOut className="w-4 h-4 text-[#BF94FF]" />
                      <span>
                        {lang === 'es' ? 'Salir al Inicio' : 'Exit to Home'}
                      </span>
                    </button>
                  )}
                </div>

                <form onSubmit={handleJoinRoomSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder={
                      lang === 'es'
                        ? 'Unirse a código o link de amigo...'
                        : 'Join friend code or link...'
                    }
                    className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#26262C] border border-white/10 focus:border-[#9146FF] text-base sm:text-xs font-mono text-white placeholder:text-zinc-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!joinCode.trim()}
                    className="h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-40 border border-white/12 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>{lang === 'es' ? 'Ir' : 'Join'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                {savedRooms.length > 0 && (
                  <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
                    <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5" />
                      <span>
                        {lang === 'es'
                          ? `Salas permanentes en la nube (${savedRooms.length})`
                          : `Permanent cloud rooms (${savedRooms.length})`}
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-[168px] overflow-y-auto pr-1">
                      {savedRooms.map((sr) => {
                        const isCurrent =
                          sr.roomCode.toLowerCase() === roomId.toLowerCase();
                        return (
                          <div
                            key={sr.roomCode}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                              isCurrent
                                ? 'bg-[#9146FF]/15 border-[#9146FF]/45'
                                : 'bg-[#26262C] border-white/[0.08]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (!isCurrent) {
                                  triggerHaptic('light');
                                  onSwitchRoom(sr.roomCode, sr.roomName);
                                  onClose();
                                }
                              }}
                              className="min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                                <span className="truncate">{sr.roomName}</span>
                                {sr.hasPin && (
                                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono truncate">
                                #{sr.roomCode}
                                {sr.queueItems.length > 0
                                  ? ` · ${sr.queueItems.length} en cola`
                                  : ''}
                              </div>
                            </button>

                            {onDeleteSavedRoom && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  onDeleteSavedRoom(sr.roomCode);
                                }}
                                title={
                                  lang === 'es'
                                    ? 'Quitar de salas permanentes'
                                    : 'Remove permanent room'
                                }
                                className="w-8 h-8 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {recentRooms.filter((r) => r.id.toLowerCase() !== roomId.toLowerCase()).length > 0 && (
                  <div className="pt-2 border-t border-white/[0.06] space-y-2">
                    <div className="text-[11px] font-medium text-zinc-400">
                      {lang === 'es' ? 'Otras salas recientes' : 'Other recent rooms'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentRooms
                        .filter((r) => r.id.toLowerCase() !== roomId.toLowerCase())
                        .slice(0, 5)
                        .map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onSwitchRoom(r.id, r.name);
                              onClose();
                            }}
                            className="h-9 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors bg-[#26262C] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300"
                          >
                            <span className="truncate max-w-[130px]">{r.name}</span>
                            <span className="font-mono text-[10px] text-zinc-500">
                              #{r.id}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Scheduled Room Reminder Builder */}
                <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
                  <div className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                    <CalendarPlus className="w-3.5 h-3.5 text-[#BF94FF]" />
                    <span>
                      {lang === 'es'
                        ? 'Programar sesión en sala'
                        : lang === 'ca'
                        ? 'Programar sessió a la sala'
                        : 'Schedule watch session'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={scheduleTitle}
                      onChange={(e) => setScheduleTitle(e.target.value)}
                      placeholder={
                        lang === 'es' ? 'Película o partido hoy...' : 'Movie or match tonight...'
                      }
                      className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-[#26262C] border border-white/10 focus:border-[#9146FF] text-xs text-white placeholder:text-zinc-500 outline-none"
                    />
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="h-9 px-2 rounded-xl bg-[#26262C] border border-white/10 text-xs text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!scheduleTitle.trim()) return;
                        triggerHaptic('success');
                        const [hh, mm] = scheduleTime.split(':').map(Number);
                        const dt = new Date();
                        dt.setHours(Number.isFinite(hh) ? hh : 22, Number.isFinite(mm) ? mm : 0, 0, 0);
                        addScheduledRoom({
                          roomId,
                          roomName: roomName || `Sala ${roomId.toUpperCase()}`,
                          title: scheduleTitle.trim(),
                          scheduledForIso: dt.toISOString(),
                          createdAt: Date.now(),
                        });
                        setScheduleTitle('');
                      }}
                      className="h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white cursor-pointer shrink-0"
                    >
                      +
                    </button>
                  </div>
                  {scheduledRooms.length > 0 && (
                    <div className="space-y-1.5">
                      {scheduledRooms.slice(0, 3).map((sr) => (
                        <div
                          key={sr.id}
                          className="px-2.5 py-2 rounded-xl bg-[#26262C] border border-white/[0.08] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-white truncate block">{sr.title}</span>
                            <span className="text-[11px] text-zinc-400">
                              {new Date(sr.scheduledForIso).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              · #{sr.roomId}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeScheduledRoom(sr.id)}
                            className="p-1 text-zinc-400 hover:text-rose-400 cursor-pointer"
                            aria-label="Eliminar recordatorio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Profile Name, View Mode & Cloud Auth Card */}
              <div className="rounded-2xl bg-[#1F1F23] border border-white/[0.08] p-4 space-y-4">
                <form onSubmit={handleSaveName} className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-400">
                    {lang === 'es' ? 'Tu nombre visible en sala' : 'Display name'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={24}
                      className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#26262C] border border-white/12 focus:border-[#9146FF] text-base sm:text-xs text-white outline-none"
                    />
                    <button
                      type="submit"
                      className="h-11 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-xs font-semibold text-white shrink-0 cursor-pointer"
                    >
                      {savedNameFeedback
                        ? lang === 'es'
                          ? 'Guardado'
                          : 'Saved'
                        : lang === 'es'
                        ? 'Guardar'
                        : 'Save'}
                    </button>
                  </div>
                </form>

                {/* View Mode Toggle + PWA Install */}
                <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-white">
                        {lang === 'es' ? 'Vista de la aplicación' : 'Application view'}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {effectiveView === 'desktop'
                          ? lang === 'es'
                            ? 'Actualmente en modo Escritorio'
                            : 'Currently in Desktop mode'
                          : lang === 'es'
                          ? 'Actualmente en modo Móvil'
                          : 'Currently in Mobile mode'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onToggleViewMode();
                      }}
                      className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {effectiveView === 'desktop' ? (
                        <>
                          <Smartphone className="w-3.5 h-3.5 text-zinc-300" />
                          <span>{lang === 'es' ? 'Ver como móvil' : 'Mobile view'}</span>
                        </>
                      ) : (
                        <>
                          <Monitor className="w-3.5 h-3.5 text-zinc-300" />
                          <span>{lang === 'es' ? 'Ver como PC' : 'Desktop view'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-end">
                    <PWAInstallButton lang={lang} />
                  </div>
                </div>

                {/* Theme, Density, Lite Mode & Language Preferences */}
                <div className="pt-3 border-t border-white/[0.06] space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                    <Palette className="w-4 h-4 text-[#BF94FF]" />
                    <span>
                      {lang === 'es'
                        ? 'Apariencia, Rendimiento e Idioma'
                        : lang === 'ca'
                        ? 'Aparença, Rendiment i Idioma'
                        : 'Appearance, Performance & Language'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'light', label: 'Tema Claro' },
                        { id: 'dark', label: 'Tema Oscuro' },
                        { id: 'oled', label: 'OLED Negro' },
                        { id: 'soft-dark', label: 'Noche Suave' },
                        { id: 'high-contrast', label: 'Alto Contraste' },
                      ] as { id: AppTheme; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setTheme(opt.id);
                        }}
                        className={`min-h-9 px-2.5 rounded-xl text-[11px] font-semibold border cursor-pointer transition-colors ${
                          theme === opt.id
                            ? 'bg-[#9146FF] text-white border-[#9146FF]'
                            : 'bg-[#26262C] hover:bg-white/[0.1] border-white/[0.08] text-zinc-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {(['comfortable', 'compact'] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDensity(d)}
                          className={`min-h-8 px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                            density === d
                              ? 'bg-[#9146FF] text-white border-[#9146FF]'
                              : 'bg-[#26262C] border-white/[0.08] text-zinc-300'
                          }`}
                        >
                          {d === 'comfortable' ? 'Cómoda' : 'Compacta'}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setLiteMode(!liteMode)}
                        className={`min-h-8 px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                          liteMode
                            ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                            : 'bg-[#26262C] border-white/[0.08] text-zinc-300'
                        }`}
                      >
                        Lite: {liteMode ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {onChangeLang && (
                      <div className="flex items-center gap-1">
                        {(['es', 'ca', 'en'] as AppLanguage[]).map((code) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() => onChangeLang(code)}
                            className={`min-h-8 px-2.5 rounded-lg text-[11px] font-bold uppercase border cursor-pointer ${
                              lang === code
                                ? 'bg-[#9146FF] text-white border-[#9146FF]'
                                : 'bg-[#26262C] border-white/[0.08] text-zinc-300'
                            }`}
                          >
                            {code}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Annual Stats Snapshot + Design System / GDPR links */}
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between gap-2 text-[11px] text-zinc-300">
                    <span>
                      🎬 {watchHistory.length} vistos · ♥ {watchlist.length} guardados · ⭐ {favoriteChannels.length} canales
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onOpenDesignSystem && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenDesignSystem();
                          }}
                          className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 cursor-pointer"
                          title="Design System & Tokens"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onOpenLegalModal && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenLegalModal();
                          }}
                          className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 cursor-pointer"
                          title="Privacidad y RGPD"
                        >
                          <Scale className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Google Cloud Account */}
                <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-white">
                    <Cloud
                      className={`w-4 h-4 ${
                        authUser ? 'text-[#00F593]' : 'text-zinc-400'
                      }`}
                    />
                    <span>
                      {authUser
                        ? lang === 'es'
                          ? 'Cuenta de Google vinculada'
                          : 'Google account linked'
                        : lang === 'es'
                        ? 'Sincronización con Google'
                        : 'Google Cloud Sync'}
                    </span>
                  </div>
                  {!authLoading &&
                    (authUser ? (
                      <button
                        type="button"
                        onClick={async () => {
                          triggerHaptic('light');
                          await onSignOut();
                          onClose();
                        }}
                        className="w-full min-h-[42px] px-4 rounded-xl bg-white/[0.05] hover:bg-rose-500/20 border border-white/10 text-xs font-semibold text-zinc-200 hover:text-rose-200 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{lang === 'es' ? 'Cerrar sesión' : 'Sign out'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          triggerHaptic('medium');
                          await onSignIn();
                        }}
                        className="w-full min-h-[42px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>
                          {lang === 'es'
                            ? 'Iniciar sesión con Google'
                            : 'Sign in with Google'}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
