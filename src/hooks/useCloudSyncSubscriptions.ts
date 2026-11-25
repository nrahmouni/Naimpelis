import { useEffect } from 'react';
import type { User } from 'firebase/auth';
import { auth } from '../firebase';
import type {
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  SavedFriend,
  WatchHistoryItem,
} from '../types';
import type { CatalogSection } from '../components/MediaCatalogHub';
import type { SessionMode } from '../store/useAppStore';
import { isDedicatedAppPath } from '../shared/dedicatedRoutes';
import {
  checkGoogleRedirectSignInResult,
  deleteCloudWatchHistoryItem,
  ensureCloudUserProfile,
  migrateLocalStateToCloud,
  pushCloudMusicLibrary,
  subscribeAuthState,
  subscribeCloudMusicLibrary,
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
  sessionModeRef: React.MutableRefObject<SessionMode>;
  hasEnteredAppRef: React.MutableRefObject<boolean>;
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
  onRedirectAuthError?: (errorCode: string, hostname: string) => void;
}) {
  const {
    savedRoomsCacheKey,
    loadCachedSavedRooms,
    rememberSessionPin,
    inRoomRef,
    sessionModeRef,
    hasEnteredAppRef,
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
    onRedirectAuthError,
  } = params;

  useEffect(() => {
    let detachCloudListeners: (() => void) | null = null;
    let detachMusicCloudListener: (() => void) | null = null;
    let musicSyncTimer: ReturnType<typeof setTimeout> | null = null;
    let migrationTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    let latestFirebaseUser: User | null = auth.currentUser;

    // Resolve any pending Google signInWithRedirect result cleanly on app boot
    void checkGoogleRedirectSignInResult().then((res) => {
      if (!active) return;
      if (res.errorCode) {
        onRedirectAuthError?.(res.errorCode, res.hostname || '');
      }
    });

    let detachOnlineHandler: (() => void) | null = null;

    const clearSessionResources = () => {
      if (detachOnlineHandler) {
        detachOnlineHandler();
        detachOnlineHandler = null;
      }
      if (detachCloudListeners) {
        detachCloudListeners();
        detachCloudListeners = null;
      }
      if (detachMusicCloudListener) {
        detachMusicCloudListener();
        detachMusicCloudListener = null;
      }
      if (musicSyncTimer) {
        clearTimeout(musicSyncTimer);
        musicSyncTimer = null;
      }
      if (migrationTimer) {
        clearTimeout(migrationTimer);
        migrationTimer = null;
      }
    };

    const handleEffectiveSessionChange = async () => {
      clearSessionResources();
      void import('../store/useMusicStore')
        .then(({ registerMusicCloudSyncHook }) => {
          registerMusicCloudSyncHook(null);
        })
        .catch(() => undefined);

      if (!active) return;

      const verifiedFbUser =
        latestFirebaseUser && !latestFirebaseUser.isAnonymous ? latestFirebaseUser : null;
      const effectiveUser: User | null = verifiedFbUser;

      setAuthUser(effectiveUser);

      if (!effectiveUser) {
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
        const cloudProfile = await ensureCloudUserProfile(effectiveUser, resolvedProfile);
        if (!active) return;
        resolvedProfile = cloudProfile;
        saveStoredProfile(cloudProfile, resolvedProfile.isCustomized !== false);
        setProfile(cloudProfile);
        if (effectiveUser.emailVerified) {
          setShowGuestPopup(false);
        }
      } catch {
        // Error already logged cleanly
      } finally {
        if (active) setAuthLoading(false);
      }

      if (!active) return;

      const isOnDedicatedPath =
        typeof window !== 'undefined' && isDedicatedAppPath(window.location.pathname);

      if (
        effectiveUser.emailVerified &&
        sessionModeRef.current !== 'solo' &&
        !hasEnteredAppRef.current &&
        !inRoomRef.current &&
        !manualLobbyStayRef.current &&
        !isTvPairLobbyRef.current &&
        !isOnDedicatedPath
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
          effectiveUser.displayName?.split(' ')[0] ||
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

      const attachLiveCloudSync = () => {
        if (!active || !verifiedFbUser || !verifiedFbUser.emailVerified) return;
        if (auth.currentUser?.uid !== verifiedFbUser.uid) return;
        if (detachCloudListeners) return;

        detachCloudListeners = subscribeUserCloudCollections(verifiedFbUser.uid, {
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
        // Also wire bidirectional Riffan Music library/taste sync to /musicLibraries/{uid}
        void Promise.all([
          import('../store/useMusicStore'),
          import('../services/cloudSync/cloudMusicSync'),
        ])
          .then(([{ registerMusicCloudSyncHook, useMusicStore }, { buildCloudMusicPayload }]) => {
            if (!active || auth.currentUser?.uid !== verifiedFbUser.uid) return;
            detachMusicCloudListener = subscribeCloudMusicLibrary(
              verifiedFbUser.uid,
              (payload) => {
                useMusicStore.getState().hydrateFromCloud(payload);
              },
              () => {
                const snap = useMusicStore.getState().getPersistedSnapshot();
                const hasLocalData =
                  snap.likedTracks.length > 0 ||
                  snap.userPlaylists.length > 0 ||
                  snap.tasteProfile.favoriteArtists.length > 0 ||
                  snap.listeningStats.totalPlays > 0;
                if (hasLocalData) {
                  void pushCloudMusicLibrary(buildCloudMusicPayload(snap));
                }
              }
            );
            registerMusicCloudSyncHook((lib) => {
              if (musicSyncTimer) clearTimeout(musicSyncTimer);
              musicSyncTimer = setTimeout(() => {
                void pushCloudMusicLibrary(buildCloudMusicPayload(lib));
              }, 1400);
            });
          })
          .catch(() => undefined);

        // 3. Merge guest local history / favorites / channels / friends into Cloud (both SQL & Firestore)
        migrationTimer = setTimeout(() => {
          migrateLocalStateToCloud({
            localHistory: localHistorySnapshot,
            localWatchlist: localWatchlistSnapshot,
            localChannels: localChannelsSnapshot,
            localFriends: localFriendsSnapshot,
          }).catch(() => {});
        }, 900);
      };

      // 2. Attach Firestore real-time listeners when Firebase SDK session is verified & online
      if (verifiedFbUser && verifiedFbUser.emailVerified) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false && typeof window !== 'undefined') {
          const onOnline = () => {
            attachLiveCloudSync();
          };
          window.addEventListener('online', onOnline, { once: true });
          detachOnlineHandler = () => window.removeEventListener('online', onOnline);
        } else {
          attachLiveCloudSync();
        }
      }
    };

    const unsubAuth = subscribeAuthState((fbUser) => {
      latestFirebaseUser = fbUser;
      void handleEffectiveSessionChange();
    });

    return () => {
      active = false;
      unsubAuth();
      clearSessionResources();
    };
  }, [rememberSessionPin]); // eslint-disable-line react-hooks/exhaustive-deps
}
