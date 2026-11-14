import React, { useEffect, useRef, useState } from 'react';
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
import { SegmentedControl } from './ui/DesignSystem';
import { PosterImage } from './ui/PosterImage';
import { pickLang } from '../utils/i18n';
import { useFocusTrap } from '../utils/useFocusTrap';

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
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(isOpen, onClose, dialogRef);

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
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={pickLang(lang, {
          es: 'Mi Perfil NAIM CINE',
          ca: 'El meu Perfil NAIM CINE',
          en: 'My Profile',
        })}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[880px] max-h-[92dvh] sm:max-h-[86dvh] rounded-t-3xl sm:rounded-3xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border-t sm:border border-white/[0.1] shadow-[0_32px_110px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden animate-sheet-up outline-none"
      >
        {/* Mobile iOS Sheet Grab Handle */}
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div className="sheet-handle" />
        </div>

        {/* ================================================================ */}
        {/* HEADER: USER IDENTITY + CLOSE                                    */}
        {/* ================================================================ */}
        <div className="px-4 sm:px-6 pt-3.5 sm:pt-5 pb-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
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
                  pickLang(lang, {
                    es: 'Perfil local · Conecta Google para sincronizar entre dispositivos',
                    ca: 'Perfil local · Connecta Google per sincronitzar entre dispositius',
                    en: 'Local profile · Sign in to sync across devices',
                  })}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={pickLang(lang, {
              es: 'Cerrar mi perfil',
              ca: 'Tancar el meu perfil',
              en: 'Close profile',
            })}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ================================================================ */}
        {/* NAVIGATION TABS (SEGMENTED CONTROL: CONTINUAR · GUARDADOS · CUENTA) */}
        {/* ================================================================ */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-white/[0.08] shrink-0">
          <SegmentedControl
            value={activeTab}
            onChange={(nextTab) => {
              triggerHaptic('light');
              setActiveTab(nextTab);
            }}
            className="w-full"
            options={[
              {
                id: 'history',
                label: pickLang(lang, {
                  es: `Continuar Viendo (${watchHistory.length})`,
                  ca: `Continuar Veient (${watchHistory.length})`,
                  en: `History (${watchHistory.length})`,
                }),
              },
              {
                id: 'favorites',
                label: pickLang(lang, {
                  es: `Guardados (${totalSavedCount})`,
                  ca: `Desats (${totalSavedCount})`,
                  en: `Saved (${totalSavedCount})`,
                }),
              },
              {
                id: 'account',
                label: pickLang(lang, {
                  es: 'Cuenta y Salas',
                  ca: 'Compte i Sales',
                  en: 'Account & Rooms',
                }),
              },
            ]}
          />
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
                  <div className="relative rounded-2xl overflow-hidden border border-white/[0.09] bg-white/[0.04] nc-specular-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <PosterImage
                        src={latestWatched.poster}
                        alt={latestWatched.title}
                        aspect="poster"
                        className="w-16 rounded-xl border border-white/10 shrink-0"
                        fallbackIcon={<Film className="w-6 h-6 text-zinc-500" />}
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="text-[11px] font-medium text-[#BF94FF]">
                          {pickLang(lang, {
                            es: 'Última reproducción',
                            ca: 'Última reproducció',
                            en: 'Last watched',
                          })}
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
                              {pickLang(lang, {
                                es: 'Punto guardado:',
                                ca: 'Punt desat:',
                                en: 'Saved at:',
                              })}{' '}
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
                            ? pickLang(lang, {
                                es: `Seguir en ${formatResumeClock(latestWatched.resumeTimeSec)}`,
                                ca: `Continuar a ${formatResumeClock(latestWatched.resumeTimeSec)}`,
                                en: `Resume ${formatResumeClock(latestWatched.resumeTimeSec)}`,
                              })
                            : pickLang(lang, {
                                es: 'Reproducir',
                                ca: 'Reproduir',
                                en: 'Play',
                              })}
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
                          title={pickLang(lang, {
                            es: 'Empezar desde 00:00',
                            ca: 'Començar des de 00:00',
                            en: 'Start from 00:00',
                          })}
                          aria-label={pickLang(lang, {
                            es: 'Empezar desde 00:00',
                            ca: 'Començar des de 00:00',
                            en: 'Start from 00:00',
                          })}
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
                      {pickLang(lang, {
                        es: 'Todo tu historial de visualización',
                        ca: 'Tot el teu historial de visualització',
                        en: 'Complete watch history',
                      })}
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
                          if (span) {
                            span.textContent = pickLang(lang, {
                              es: '¿Confirmar borrar?',
                              ca: 'Confirmes esborrar?',
                              en: 'Confirm clear?',
                            });
                          }
                          setTimeout(() => {
                            btn.dataset.confirm = '0';
                            if (span) {
                              span.textContent = pickLang(lang, {
                                es: 'Borrar todo',
                                ca: 'Esborrar tot',
                                en: 'Clear all',
                              });
                            }
                          }, 3000);
                        }
                      }}
                      className="min-h-[36px] px-2.5 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {pickLang(lang, {
                          es: 'Borrar todo',
                          ca: 'Esborrar tot',
                          en: 'Clear all',
                        })}
                      </span>
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
                          className="rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:border-[#9146FF]/40 p-3 flex items-center gap-3 transition-colors"
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
                              <PosterImage
                                src={item.poster}
                                alt={item.title}
                                aspect="none"
                                className="w-full h-full"
                                fallbackIcon={<Film className="w-4 h-4 text-zinc-500" />}
                              />
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
                                  ? `${pickLang(lang, {
                                      es: 'Seguir en',
                                      ca: 'Continuar a',
                                      en: 'Resume',
                                    })} ${formatResumeClock(item.resumeTimeSec)}`
                                  : pickLang(lang, {
                                      es: 'Volver a ver',
                                      ca: 'Tornar a veure',
                                      en: 'Watch again',
                                    })}
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onRemoveHistoryItem(item.id);
                            }}
                            aria-label={pickLang(lang, {
                              es: 'Eliminar del historial',
                              ca: "Eliminar de l'historial",
                              en: 'Remove from history',
                            })}
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
                    {pickLang(lang, {
                      es: 'Aún no tienes películas ni series en tu historial',
                      ca: 'Encara no tens pel·lícules ni sèries al teu historial',
                      en: 'Your watch history is empty',
                    })}
                  </p>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    {pickLang(lang, {
                      es: 'Cualquier película o episodio que reproduzcas se guardará aquí automáticamente con el segundo exacto donde lo dejaste.',
                      ca: 'Qualsevol pel·lícula o episodi que reprodueixis es desarà aquí automàticament amb el segon exacte on ho vas deixar.',
                      en: 'Movies and episodes you play will automatically appear here with your exact resume timestamp.',
                    })}
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
                      label: pickLang(lang, {
                        es: `Todo (${totalSavedCount})`,
                        ca: `Tot (${totalSavedCount})`,
                        en: `All (${totalSavedCount})`,
                      }),
                    },
                    {
                      id: 'movie',
                      label: pickLang(lang, {
                        es: `Películas (${watchlist.filter((w) => w.mediaType !== 'tv').length})`,
                        ca: `Pel·lícules (${watchlist.filter((w) => w.mediaType !== 'tv').length})`,
                        en: `Movies (${watchlist.filter((w) => w.mediaType !== 'tv').length})`,
                      }),
                    },
                    {
                      id: 'tv',
                      label: pickLang(lang, {
                        es: `Series (${watchlist.filter((w) => w.mediaType === 'tv').length})`,
                        ca: `Sèries (${watchlist.filter((w) => w.mediaType === 'tv').length})`,
                        en: `Series (${watchlist.filter((w) => w.mediaType === 'tv').length})`,
                      }),
                    },
                    {
                      id: 'channels',
                      label: pickLang(lang, {
                        es: `Canales TV (${favoriteChannels.length})`,
                        ca: `Canals TV (${favoriteChannels.length})`,
                        en: `Channels (${favoriteChannels.length})`,
                      }),
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
                        <span>
                          {pickLang(lang, {
                            es: `Canales y Partidos Guardados (${favoriteChannels.length})`,
                            ca: `Canals i Partits Desats (${favoriteChannels.length})`,
                            en: `Saved Channels & Matches (${favoriteChannels.length})`,
                          })}
                        </span>
                      </h4>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {favoriteChannels.map((ch) => (
                        <div
                          key={ch.favId}
                          className="rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:border-[#9146FF]/40 p-3.5 flex items-center justify-between gap-3 transition-colors"
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
                              <span>
                                {pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onRemoveFavoriteChannel(ch);
                              }}
                              title={pickLang(lang, {
                                es: 'Quitar canal favorito',
                                ca: 'Treure canal favorit',
                                en: 'Remove favorite channel',
                              })}
                              aria-label={pickLang(lang, {
                                es: 'Quitar canal favorito',
                                ca: 'Treure canal favorit',
                                en: 'Remove favorite channel',
                              })}
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
                      <span>
                        {pickLang(lang, {
                          es: `Películas y Series en Mi Lista (${filteredWatchlist.length})`,
                          ca: `Pel·lícules i Sèries a La meva llista (${filteredWatchlist.length})`,
                          en: `Movies & Series in My List (${filteredWatchlist.length})`,
                        })}
                      </span>
                    </h4>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    {filteredWatchlist.map((item) => {
                      const isSeries = item.mediaType === 'tv';
                      return (
                        <div
                          key={`${item.mediaType || 'movie'}-${item.tmdbId || item.id}`}
                          className="group relative rounded-2xl overflow-hidden bg-white/[0.04] nc-card-sheen border border-white/[0.08] hover:border-[#9146FF]/50 flex flex-col transition-all"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onPlayCatalogItem(item);
                              onClose();
                            }}
                            aria-label={item.title}
                            className="relative aspect-[2/3] w-full overflow-hidden bg-[#26262C] text-left cursor-pointer"
                          >
                            <PosterImage
                              src={item.poster}
                              alt={item.title}
                              aspect="none"
                              className="w-full h-full"
                              imgClassName="group-hover:scale-105 transition-transform duration-300"
                              fallbackIcon={
                                isSeries ? (
                                  <Tv className="w-7 h-7 text-zinc-600" />
                                ) : (
                                  <Film className="w-7 h-7 text-zinc-600" />
                                )
                              }
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent flex flex-col justify-end p-3">
                              <div className="text-[10px] text-zinc-300">
                                {isSeries
                                  ? pickLang(lang, {
                                      es: 'Serie TV',
                                      ca: 'Sèrie TV',
                                      en: 'TV Series',
                                    })
                                  : pickLang(lang, {
                                      es: 'Película',
                                      ca: 'Pel·lícula',
                                      en: 'Movie',
                                    })}
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
                            title={pickLang(lang, {
                              es: 'Quitar de favoritos',
                              ca: 'Treure de favorits',
                              en: 'Remove favorite',
                            })}
                            aria-label={pickLang(lang, {
                              es: 'Quitar de favoritos',
                              ca: 'Treure de favorits',
                              en: 'Remove favorite',
                            })}
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
                    {pickLang(lang, {
                      es: 'No tienes elementos guardados en esta sección',
                      ca: 'No tens elements desats en aquesta secció',
                      en: 'No saved items in this section',
                    })}
                  </p>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    {pickLang(lang, {
                      es: 'Pulsa el corazón (♥) en cualquier película o serie, o la estrella (★) en los canales de fútbol para tenerlos siempre a mano aquí.',
                      ca: 'Prem el cor (♥) a qualsevol pel·lícula o sèrie, o l’estrella (★) als canals de futbol per tenir-los sempre a mà aquí.',
                      en: 'Tap the heart on movies/series or the star on sports channels to save them here.',
                    })}
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
              <div className="rounded-2xl bg-white/[0.04] nc-specular-surface border border-white/[0.08] p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-zinc-400">
                      {pickLang(lang, {
                        es: 'Sala actual',
                        ca: 'Sala actual',
                        en: 'Current room',
                      })}
                    </div>
                    <div className="font-display font-bold text-sm sm:text-base text-white">
                      {roomName ||
                        pickLang(lang, {
                          es: `Sala ${roomId.toUpperCase()}`,
                          ca: `Sala ${roomId.toUpperCase()}`,
                          en: `Room ${roomId.toUpperCase()}`,
                        })}{' '}
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
                        <span>
                          {pickLang(lang, {
                            es: 'Copiado',
                            ca: 'Copiat',
                            en: 'Copied',
                          })}
                        </span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-[#BF94FF]" />
                        <span>
                          {pickLang(lang, {
                            es: 'Copiar link',
                            ca: 'Copiar enllaç',
                            en: 'Copy link',
                          })}
                        </span>
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
                      {pickLang(lang, {
                        es: 'Nueva sala',
                        ca: 'Nova sala',
                        en: 'New room',
                      })}
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
                          ? pickLang(lang, {
                              es: 'Sala Permanente ✓',
                              ca: 'Sala Permanent ✓',
                              en: 'Permanent Room ✓',
                            })
                          : pickLang(lang, {
                              es: 'Hacer Permanente',
                              ca: 'Fer Permanent',
                              en: 'Save Permanent',
                            })}
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
                        {pickLang(lang, {
                          es: 'Salir al Inicio',
                          ca: "Sortir a l'Inici",
                          en: 'Exit to Home',
                        })}
                      </span>
                    </button>
                  )}
                </div>

                <form onSubmit={handleJoinRoomSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder={pickLang(lang, {
                      es: 'Unirse a código o link de amigo...',
                      ca: "Unir-se a codi o enllaç d'amic...",
                      en: 'Join friend code or link...',
                    })}
                    className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#26262C] border border-white/10 focus:border-[#9146FF] text-base sm:text-xs font-mono text-white placeholder:text-zinc-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!joinCode.trim()}
                    className="h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-40 border border-white/12 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>
                      {pickLang(lang, { es: 'Ir', ca: 'Anar', en: 'Join' })}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                {savedRooms.length > 0 && (
                  <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
                    <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5" />
                      <span>
                        {pickLang(lang, {
                          es: `Salas permanentes en la nube (${savedRooms.length})`,
                          ca: `Sales permanents al núvol (${savedRooms.length})`,
                          en: `Permanent cloud rooms (${savedRooms.length})`,
                        })}
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
                                  ? ` · ${sr.queueItems.length} ${pickLang(lang, {
                                      es: 'en cola',
                                      ca: 'a la cua',
                                      en: 'in queue',
                                    })}`
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
                                title={pickLang(lang, {
                                  es: 'Quitar de salas permanentes',
                                  ca: 'Treure de sales permanents',
                                  en: 'Remove permanent room',
                                })}
                                aria-label={pickLang(lang, {
                                  es: 'Quitar de salas permanentes',
                                  ca: 'Treure de sales permanents',
                                  en: 'Remove permanent room',
                                })}
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
                      {pickLang(lang, {
                        es: 'Otras salas recientes',
                        ca: 'Altres sales recents',
                        en: 'Other recent rooms',
                      })}
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
                      {pickLang(lang, {
                        es: 'Programar sesión en sala',
                        ca: 'Programar sessió a la sala',
                        en: 'Schedule watch session',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={scheduleTitle}
                      onChange={(e) => setScheduleTitle(e.target.value)}
                      placeholder={pickLang(lang, {
                        es: 'Película o partido hoy...',
                        ca: 'Pel·lícula o partit avui...',
                        en: 'Movie or match tonight...',
                      })}
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
                      aria-label={pickLang(lang, {
                        es: 'Añadir recordatorio',
                        ca: 'Afegir recordatori',
                        en: 'Add reminder',
                      })}
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
                            aria-label={pickLang(lang, {
                              es: 'Eliminar recordatorio',
                              ca: 'Eliminar recordatori',
                              en: 'Delete reminder',
                            })}
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
              <div className="rounded-2xl bg-white/[0.04] nc-specular-surface border border-white/[0.08] p-4 space-y-4">
                <form onSubmit={handleSaveName} className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-400">
                    {pickLang(lang, {
                      es: 'Tu nombre visible en sala',
                      ca: 'El teu nom visible a la sala',
                      en: 'Display name',
                    })}
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
                        ? pickLang(lang, { es: 'Guardado', ca: 'Desat', en: 'Saved' })
                        : pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
                    </button>
                  </div>
                </form>

                {/* View Mode Toggle + PWA Install */}
                <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-white">
                        {pickLang(lang, {
                          es: 'Vista de la aplicación',
                          ca: "Vista de l'aplicació",
                          en: 'Application view',
                        })}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {effectiveView === 'desktop'
                          ? pickLang(lang, {
                              es: 'Actualmente en modo Escritorio',
                              ca: "Actualment en mode d'Escriptori",
                              en: 'Currently in Desktop mode',
                            })
                          : pickLang(lang, {
                              es: 'Actualmente en modo Móvil',
                              ca: 'Actualment en mode Mòbil',
                              en: 'Currently in Mobile mode',
                            })}
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
                          <span>
                            {pickLang(lang, {
                              es: 'Ver como móvil',
                              ca: 'Veure com a mòbil',
                              en: 'Mobile view',
                            })}
                          </span>
                        </>
                      ) : (
                        <>
                          <Monitor className="w-3.5 h-3.5 text-zinc-300" />
                          <span>
                            {pickLang(lang, {
                              es: 'Ver como PC',
                              ca: 'Veure com a PC',
                              en: 'Desktop view',
                            })}
                          </span>
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
                      {pickLang(lang, {
                        es: 'Apariencia, Rendimiento e Idioma',
                        ca: 'Aparença, Rendiment i Idioma',
                        en: 'Appearance, Performance & Language',
                      })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(
                      [
                        {
                          id: 'light',
                          label: pickLang(lang, { es: 'Tema Claro', ca: 'Tema Clar', en: 'Light Theme' }),
                        },
                        {
                          id: 'dark',
                          label: pickLang(lang, { es: 'Tema Oscuro', ca: 'Tema Fosc', en: 'Dark Theme' }),
                        },
                        {
                          id: 'oled',
                          label: pickLang(lang, { es: 'OLED Negro', ca: 'OLED Negre', en: 'OLED Black' }),
                        },
                        {
                          id: 'soft-dark',
                          label: pickLang(lang, { es: 'Noche Suave', ca: 'Nit Suau', en: 'Soft Night' }),
                        },
                        {
                          id: 'high-contrast',
                          label: pickLang(lang, { es: 'Alto Contraste', ca: 'Alt Contrast', en: 'High Contrast' }),
                        },
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
                          {d === 'comfortable'
                            ? pickLang(lang, { es: 'Cómoda', ca: 'Còmoda', en: 'Comfortable' })
                            : pickLang(lang, { es: 'Compacta', ca: 'Compacta', en: 'Compact' })}
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
                      {pickLang(lang, {
                        es: `🎬 ${watchHistory.length} vistos · ♥ ${watchlist.length} guardados · ⭐ ${favoriteChannels.length} canales`,
                        ca: `🎬 ${watchHistory.length} vistos · ♥ ${watchlist.length} desats · ⭐ ${favoriteChannels.length} canals`,
                        en: `🎬 ${watchHistory.length} watched · ♥ ${watchlist.length} saved · ⭐ ${favoriteChannels.length} channels`,
                      })}
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
                          title={pickLang(lang, {
                            es: 'Sistema de diseño y tokens',
                            ca: 'Sistema de disseny i tokens',
                            en: 'Design System & Tokens',
                          })}
                          aria-label={pickLang(lang, {
                            es: 'Sistema de diseño y tokens',
                            ca: 'Sistema de disseny i tokens',
                            en: 'Design System & Tokens',
                          })}
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
                          title={pickLang(lang, {
                            es: 'Privacidad y RGPD',
                            ca: 'Privacitat i RGPD',
                            en: 'Privacy & GDPR',
                          })}
                          aria-label={pickLang(lang, {
                            es: 'Privacidad y RGPD',
                            ca: 'Privacitat i RGPD',
                            en: 'Privacy & GDPR',
                          })}
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
                        ? pickLang(lang, {
                            es: 'Cuenta de Google vinculada',
                            ca: 'Compte de Google vinculat',
                            en: 'Google account linked',
                          })
                        : pickLang(lang, {
                            es: 'Sincronización con Google',
                            ca: 'Sincronització amb Google',
                            en: 'Google Cloud Sync',
                          })}
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
                        <span>
                          {pickLang(lang, {
                            es: 'Cerrar sesión',
                            ca: 'Tancar sessió',
                            en: 'Sign out',
                          })}
                        </span>
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
                          {pickLang(lang, {
                            es: 'Iniciar sesión con Google',
                            ca: 'Iniciar sessió amb Google',
                            en: 'Sign in with Google',
                          })}
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
