import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { X } from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  WatchHistoryItem,
} from '../types';
import { RecentRoomEntry } from '../utils/storage';
import { triggerHaptic } from '../utils/haptics';
import { EffectiveViewMode, getMonogramInitials } from './MobileViewportGuard';
import { SegmentedControl } from './ui/DesignSystem';
import { pickLang } from '../utils/i18n';
import { useFocusTrap } from '../utils/useFocusTrap';
import { ProfileHistoryTab } from './profile/ProfileHistoryTab';
import { ProfileSavedTab } from './profile/ProfileSavedTab';
import { ProfileAccountRoomCard } from './profile/ProfileAccountRoomCard';
import { ProfileAccountSettingsCard } from './profile/ProfileAccountSettingsCard';

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
  const [activeTab, setActiveTab] = useState<ProfileHubTab>(
    initialTab === 'channels' ? 'favorites' : initialTab
  );
  const [favFilter, setFavFilter] = useState<'all' | 'tv' | 'movie' | 'channels'>(
    initialTab === 'channels' ? 'channels' : 'all'
  );
  const [photoBroken, setPhotoBroken] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(isOpen, onClose, dialogRef);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab === 'channels' ? 'favorites' : initialTab);
      if (initialTab === 'channels') setFavFilter('channels');
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    setPhotoBroken(false);
  }, [authUser?.photoURL]);

  if (!isOpen) return null;

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
          es: 'Mi Perfil RiffanTV',
          ca: 'El meu Perfil RiffanTV',
          en: 'My Profile',
        })}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[880px] max-h-[92dvh] sm:max-h-[86dvh] rounded-t-3xl sm:rounded-3xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border-t sm:border border-white/[0.1] shadow-[0_32px_110px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden animate-sheet-up outline-none"
      >
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div className="sheet-handle" />
        </div>

        {/* Header */}
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
              </div>
              <div className="text-xs text-zinc-400 truncate">
                {authUser?.email ||
                  pickLang(lang, {
                    es: 'Perfil e historial',
                    ca: 'Perfil i historial',
                    en: 'Profile & history',
                  })}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={pickLang(lang, {
              es: 'Cerrar',
              ca: 'Tancar',
              en: 'Close',
            })}
            className="min-h-12 min-w-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
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
                label: pickLang(lang, { es: 'Historial', ca: 'Historial', en: 'History' }),
              },
              {
                id: 'favorites',
                label: pickLang(lang, { es: 'Guardados', ca: 'Desats', en: 'Saved' }),
              },
              {
                id: 'account',
                label: pickLang(lang, { es: 'Cuenta', ca: 'Compte', en: 'Account' }),
              },
            ]}
          />
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 min-h-0">
          {activeTab === 'history' && (
            <ProfileHistoryTab
              lang={lang}
              watchHistory={watchHistory}
              onReplayHistoryItem={onReplayHistoryItem}
              onRemoveHistoryItem={onRemoveHistoryItem}
              onClearHistory={onClearHistory}
              onClose={onClose}
            />
          )}

          {activeTab === 'favorites' && (
            <ProfileSavedTab
              lang={lang}
              watchlist={watchlist}
              favoriteChannels={favoriteChannels}
              favFilter={favFilter}
              setFavFilter={setFavFilter}
              onPlayCatalogItem={onPlayCatalogItem}
              onToggleCatalogFavorite={onToggleCatalogFavorite}
              onPlayFavoriteChannel={onPlayFavoriteChannel}
              onRemoveFavoriteChannel={onRemoveFavoriteChannel}
              onClose={onClose}
            />
          )}

          {activeTab === 'account' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileAccountRoomCard
                lang={lang}
                authUser={authUser}
                roomId={roomId}
                roomName={roomName}
                recentRooms={recentRooms}
                savedRooms={savedRooms}
                isCurrentRoomPermanent={isCurrentRoomPermanent}
                onCreateNewRoom={onCreateNewRoom}
                onSwitchRoom={onSwitchRoom}
                onToggleCurrentRoomPermanent={onToggleCurrentRoomPermanent}
                onDeleteSavedRoom={onDeleteSavedRoom}
                onLeaveRoom={onLeaveRoom}
                onClose={onClose}
              />

              <ProfileAccountSettingsCard
                lang={lang}
                onChangeLang={onChangeLang}
                onOpenLegalModal={onOpenLegalModal}
                onOpenDesignSystem={onOpenDesignSystem}
                authUser={authUser}
                authLoading={authLoading}
                displayName={displayName}
                watchHistoryCount={watchHistory.length}
                watchlistCount={watchlist.length}
                favoriteChannelsCount={favoriteChannels.length}
                effectiveView={effectiveView}
                onToggleViewMode={onToggleViewMode}
                onSignIn={onSignIn}
                onSignOut={onSignOut}
                onUpdateDisplayName={onUpdateDisplayName}
                onClose={onClose}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
