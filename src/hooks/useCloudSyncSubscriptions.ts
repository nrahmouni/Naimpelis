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
import {
  checkGoogleRedirectSignInResult,
  deleteCloudWatchHistoryItem,
  ensureCloudUserProfile,
  fetchSqlAccountState,
  migrateLocalStateToCloud,
  subscribeAuthState,
  subscribeUserCloudCollections,
  toCloudUserLike,
} from '../services/userCloudSync';
import {
  getStoredCloudSession,
  subscribeCloudSession,
} from '../utils/cloudSession';
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
  onRedirectAuthError?: (errorCode: string, hostname: string) => void;
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
    onRedirectAuthError,
  } = params;

  useEffect(() => {
    let detachCloudListeners: (() => void) | null = null;
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

    const handleEffectiveSessionChange = async () => {
      if (detachCloudListeners) {
        detachCloudListeners();
        detachCloudListeners = null;
      }
      if (migrationTimer) {
        clearTimeout(migrationTimer);
        migrationTimer = null;
      }

      if (!active) return;

      const cloudSess = getStoredCloudSession();
      const verifiedFbUser =
        latestFirebaseUser && !latestFirebaseUser.isAnonymous ? latestFirebaseUser : null;
      const effectiveUser: User | null = verifiedFbUser
        ? verifiedFbUser
        : cloudSess?.cloudToken
        ? toCloudUserLike(cloudSess)
        : null;

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

      // 1. Hydrate from Cloud SQL PostgreSQL (works for Google Firebase, Chrome Bridge & 6-Char Link Code)
      const sqlState = await fetchSqlAccountState();
      if (!active) return;

      if (sqlState) {
        if (sqlState.profile && (!getStoredProfile().isCustomized || effectiveUser.emailVerified)) {
          saveStoredProfile(sqlState.profile, true);
          setProfile(sqlState.profile);
        }
        if (sqlState.watchlist.length > 0) {
          setWatchlist((prev) => {
            const combined = [...sqlState.watchlist, ...prev];
            return saveWatchlist(deduplicateWatchlist(combined));
          });
        }
        if (sqlState.favoriteChannels.length > 0) {
          const seen = new Set<string>();
          const mergedChannels = [...sqlState.favoriteChannels, ...localChannelsSnapshot].filter(
            (ch) => {
              if (seen.has(ch.favId)) return false;
              seen.add(ch.favId);
              return true;
            }
          );
          setFavoriteChannels(mergedChannels);
          saveFavoriteChannels(mergedChannels);
        }
        if (sqlState.watchHistory.length > 0) {
          const seenHist = new Set<string>();
          const mergedHist = [...sqlState.watchHistory, ...localHistorySnapshot].filter((h) => {
            if (seenHist.has(h.id)) return false;
            seenHist.add(h.id);
            return true;
          });
          setWatchHistory(mergedHist);
          saveWatchHistory(mergedHist);
        }
        if (sqlState.friends.length > 0) {
          const seenFr = new Set<string>();
          const mergedFr = [...sqlState.friends, ...localFriendsSnapshot].filter((f) => {
            if (seenFr.has(f.friendId)) return false;
            seenFr.add(f.friendId);
            return true;
          });
          setSavedFriends(mergedFr);
          saveFriendsList(mergedFr);
        }
        if (sqlState.savedRooms.length > 0) {
          setSavedRooms(sqlState.savedRooms);
          try {
            localStorage.setItem(savedRoomsCacheKey, JSON.stringify(sqlState.savedRooms));
          } catch {
            // ignore
          }
          sqlState.savedRooms.forEach((cr) => {
            if (cr.hasPin && cr.pinCode) {
              rememberSessionPin(cr.roomCode, cr.pinCode);
            }
          });
        }
      }

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

      if (
        effectiveUser.emailVerified &&
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

      // 2. Attach Firestore real-time listeners when Firebase SDK session is verified
      if (verifiedFbUser && verifiedFbUser.emailVerified) {
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
      }

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

    const unsubAuth = subscribeAuthState((fbUser) => {
      latestFirebaseUser = fbUser;
      void handleEffectiveSessionChange();
    });

    const unsubCloudSess = subscribeCloudSession(() => {
      void handleEffectiveSessionChange();
    });

    return () => {
      active = false;
      unsubAuth();
      unsubCloudSess();
      if (detachCloudListeners) detachCloudListeners();
      if (migrationTimer) clearTimeout(migrationTimer);
    };
  }, [rememberSessionPin]); // eslint-disable-line react-hooks/exhaustive-deps
}
