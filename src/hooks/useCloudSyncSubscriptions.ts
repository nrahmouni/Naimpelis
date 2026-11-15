import { useEffect } from 'react';
import type { User } from 'firebase/auth';
import type {
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  SavedFriend,
  WatchHistoryItem,
} from '../types';
import type { CatalogSection } from '../components/MediaCatalogHub';
import {
  deleteCloudWatchHistoryItem,
  ensureCloudUserProfile,
  migrateLocalStateToCloud,
  subscribeAuthState,
  subscribeUserCloudCollections,
} from '../services/userCloudSync';
import {
  deduplicateWatchlist,
  getFavoriteChannels,
  getRecentRooms,
  getSavedFriends,
  getStoredProfile,
  getWatchHistory,
  getWatchlist,
  isSameCatalogItem,
  mergeCatalogItemMetadata,
  saveFavoriteChannels,
  saveFriendsList,
  saveStoredProfile,
  saveWatchHistory,
  saveWatchlist,
  type StoredProfile,
} from '../utils/storage';
import { generateShortRoomCode } from '../utils/shortLink';

export function useCloudSyncSubscriptions(params: {
  savedRoomsCacheKey: string;
  loadCachedSavedRooms: () => CloudSavedRoom[];
  rememberSessionPin: (targetCode: string, pinCode: string) => void;
  inRoomRef: React.MutableRefObject<boolean>;
  manualLobbyStayRef: React.MutableRefObject<boolean>;
  isTvPairLobbyRef: React.MutableRefObject<boolean>;
  setAuthUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setSavedRooms: (rooms: CloudSavedRoom[]) => void;
  setProfile: (profile: StoredProfile) => void;
  setShowGuestPopup: (show: boolean) => void;
  setShowIntro: (show: boolean) => void;
  setCatalogSection: (sec: CatalogSection) => void;
  setMobileTab: (tab: 'home' | 'movies' | 'tdt' | 'sports' | 'youtube' | 'games' | 'chat' | 'room') => void;
  setRoomId: (id: string) => void;
  setRoomName: (name: string) => void;
  setInRoom: (inRoom: boolean) => void;
  setWatchHistory: (items: WatchHistoryItem[]) => void;
  setWatchlist: React.Dispatch<React.SetStateAction<CatalogMovie[]>>;
  setFavoriteChannels: (channels: FavoriteChannelItem[]) => void;
  setSavedFriends: (friends: SavedFriend[]) => void;
}) {
  const {
    savedRoomsCacheKey,
    loadCachedSavedRooms,
    rememberSessionPin,
    inRoomRef,
    manualLobbyStayRef,
    isTvPairLobbyRef,
    setAuthUser,
    setAuthLoading,
    setSavedRooms,
    setProfile,
    setShowGuestPopup,
    setShowIntro,
    setCatalogSection,
    setMobileTab,
    setRoomId,
    setRoomName,
    setInRoom,
    setWatchHistory,
    setWatchlist,
    setFavoriteChannels,
    setSavedFriends,
  } = params;

  useEffect(() => {
    let detachCloudListeners: (() => void) | null = null;
    let migrationTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const unsubAuth = subscribeAuthState(async (user) => {
      if (detachCloudListeners) {
        detachCloudListeners();
        detachCloudListeners = null;
      }
      if (migrationTimer) {
        clearTimeout(migrationTimer);
        migrationTimer = null;
      }

      if (!active) return;
      setAuthUser(user);

      if (!user || !user.emailVerified) {
        setAuthLoading(false);
        setSavedRooms([]);
        try {
          localStorage.removeItem(savedRoomsCacheKey);
        } catch {
          // ignore
        }
        return;
      }

      const localHistorySnapshot = getWatchHistory();
      const localWatchlistSnapshot = getWatchlist();
      const localChannelsSnapshot = getFavoriteChannels();
      const localFriendsSnapshot = getSavedFriends();

      let resolvedProfile = getStoredProfile();
      try {
        const cloudProfile = await ensureCloudUserProfile(user, resolvedProfile);
        if (!active) return;
        resolvedProfile = cloudProfile;
        saveStoredProfile(cloudProfile, true);
        setProfile(cloudProfile);
        setShowGuestPopup(false);
      } catch {
        // Error already logged by handleFirestoreError
      } finally {
        if (active) setAuthLoading(false);
      }

      if (!active) return;

      if (
        !inRoomRef.current &&
        !manualLobbyStayRef.current &&
        !isTvPairLobbyRef.current
      ) {
        const cachedCloudRooms = loadCachedSavedRooms();
        const recentLocalRooms = getRecentRooms();
        const primaryCloudRoom = cachedCloudRooms[0];
        const lastLocalRoom = recentLocalRooms[0];
        const targetCode =
          primaryCloudRoom?.roomCode ||
          lastLocalRoom?.id ||
          generateShortRoomCode(4);
        const firstName =
          resolvedProfile.name?.split(' ')[0] ||
          user.displayName?.split(' ')[0] ||
          'Cine';
        const targetRoomTitle =
          primaryCloudRoom?.roomName ||
          lastLocalRoom?.name ||
          `Sala de ${firstName}`;
        setShowIntro(false);
        setCatalogSection('home');
        setMobileTab('home');
        setRoomId(targetCode);
        setRoomName(targetRoomTitle);
        setInRoom(true);
      }

      detachCloudListeners = subscribeUserCloudCollections(user.uid, {
        onWatchHistory: (cloudItems) => {
          const cleanItems = cloudItems.filter((item) => {
            const isArcade =
              String(item.movidyUrl || '').startsWith('arcade://') ||
              String(item.bingetrixUrl || '').startsWith('arcade://') ||
              String(item.id || '').startsWith('arcade');
            if (isArcade) {
              deleteCloudWatchHistoryItem(item.id).catch(() => {});
              return false;
            }
            return true;
          });
          setWatchHistory(cleanItems);
          saveWatchHistory(cleanItems);
        },
        onFavorites: (cloudWatchlist, cloudChannels) => {
          setWatchlist((prev) => {
            const merged = cloudWatchlist.map((cw) => {
              const localMatch = prev.find((p) => isSameCatalogItem(p, cw));
              return localMatch ? mergeCatalogItemMetadata(localMatch, cw) : cw;
            });
            return saveWatchlist(deduplicateWatchlist(merged));
          });
          setFavoriteChannels(cloudChannels);
          saveFavoriteChannels(cloudChannels);
        },
        onSavedRooms: (cloudRooms) => {
          setSavedRooms(cloudRooms);
          try {
            localStorage.setItem(
              savedRoomsCacheKey,
              JSON.stringify(cloudRooms)
            );
          } catch {
            // ignore
          }
          cloudRooms.forEach((cr) => {
            if (cr.hasPin && cr.pinCode) {
              rememberSessionPin(cr.roomCode, cr.pinCode);
            }
          });
        },
        onFriends: (cloudFriends) => {
          setSavedFriends(cloudFriends);
          saveFriendsList(cloudFriends);
        },
      });

      migrationTimer = setTimeout(() => {
        migrateLocalStateToCloud({
          localHistory: localHistorySnapshot,
          localWatchlist: localWatchlistSnapshot,
          localChannels: localChannelsSnapshot,
          localFriends: localFriendsSnapshot,
        }).catch(() => {});
      }, 900);
    });

    return () => {
      active = false;
      unsubAuth();
      if (detachCloudListeners) detachCloudListeners();
      if (migrationTimer) clearTimeout(migrationTimer);
    };
  }, [rememberSessionPin]); // eslint-disable-line react-hooks/exhaustive-deps
}
