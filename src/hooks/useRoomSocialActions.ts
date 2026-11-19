import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import type {
  AppLanguage,
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  RoomQueueItem,
  SavedFriend,
  SpanishTdtChannel,
  VideoState,
  WatchHistoryItem,
} from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import {
  clearWatchHistory,
  dismissGuestPopupForRoom,
  removeLocalFriend,
  removeWatchHistoryItem,
  StoredProfile,
  toggleFavoriteChannel,
  toggleWatchlistItem,
  upsertLocalFriend,
} from '../utils/storage';
import {
  clearCloudWatchHistoryItems,
  deleteCloudCatalogFavoriteAndDuplicates,
  deleteCloudFavoriteById,
  deleteCloudFriend,
  deleteCloudSavedRoom,
  deleteCloudWatchHistoryItem,
  signInWithGoogleAccountDetailed,
  signOutGoogleAccount,
  updateCloudUserProfile,
  upsertCloudCatalogFavorite,
  upsertCloudChannelFavorite,
  upsertCloudFriend,
  upsertCloudSavedRoom,
} from '../services/userCloudSync';
import { socketService } from '../services/socket';
import { useAppStore } from '../store/useAppStore';
import { playCinemaSound } from '../utils/haptics';
import { SAVED_ROOMS_CACHE_KEY } from '../utils/appSessionHelpers';

interface UseRoomSocialActionsParams {
  lang: AppLanguage;
  authUser: User | null;
  profile: StoredProfile;
  setProfile: Dispatch<SetStateAction<StoredProfile>>;
  roomId: string;
  normalizedRoomCode: string;
  roomName: string;
  setRoomName: Dispatch<SetStateAction<string>>;
  inRoom: boolean;
  isCurrentRoomPermanent: boolean;
  currentHostPin?: string;
  currentSavedRoom?: CloudSavedRoom;
  isHostUser: boolean;
  roomHasPin: boolean;
  setRoomHasPin: Dispatch<SetStateAction<boolean>>;
  hostOnlyControl: boolean;
  videoState: VideoState;
  roomQueue: RoomQueueItem[];
  watchHistory: WatchHistoryItem[];
  setWatchHistory: Dispatch<SetStateAction<WatchHistoryItem[]>>;
  setWatchlist: Dispatch<SetStateAction<CatalogMovie[]>>;
  setFavoriteChannels: Dispatch<SetStateAction<FavoriteChannelItem[]>>;
  setSavedFriends: Dispatch<SetStateAction<SavedFriend[]>>;
  setSavedRooms: Dispatch<SetStateAction<CloudSavedRoom[]>>;
  setShowGuestPopup: Dispatch<SetStateAction<boolean>>;
  setInviteSentFeedback: Dispatch<SetStateAction<string | null>>;
  setQuickPool: Dispatch<
    SetStateAction<{
      movies: CatalogMovie[];
      series: CatalogMovie[];
      tdt: SpanishTdtChannel[];
    }>
  >;
  setQuickPoolLoading: Dispatch<SetStateAction<boolean>>;
  quickPoolMoviesLen: number;
  quickPoolSeriesLen: number;
  manualLobbyStayRef: MutableRefObject<boolean>;
  inviteFeedbackTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  rememberSessionPin: (targetCode: string, pinCode: string) => void;
}

export function useRoomSocialActions({
  lang,
  authUser,
  profile,
  setProfile,
  roomId,
  normalizedRoomCode,
  roomName,
  setRoomName,
  inRoom,
  isCurrentRoomPermanent,
  currentHostPin,
  currentSavedRoom,
  isHostUser,
  roomHasPin,
  setRoomHasPin,
  hostOnlyControl,
  videoState,
  roomQueue,
  watchHistory,
  setWatchHistory,
  setWatchlist,
  setFavoriteChannels,
  setSavedFriends,
  setSavedRooms,
  setShowGuestPopup,
  setInviteSentFeedback,
  setQuickPool,
  setQuickPoolLoading,
  quickPoolMoviesLen,
  quickPoolSeriesLen,
  manualLobbyStayRef,
  inviteFeedbackTimerRef,
  rememberSessionPin,
}: UseRoomSocialActionsParams) {
  const loadQuickPool = useCallback(async () => {
    setQuickPoolLoading(true);
    try {
      const apiLang = lang === 'en' ? 'en' : 'es';
      const [mRes, sRes, tRes, lrRes] = await Promise.all([
        fetch('/api/catalog/movies?category=trending&page=1').then((r) =>
          r.ok ? r.json() : null
        ),
        fetch(`/api/catalog/series?category=trending&page=1&lang=${apiLang}`).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch('/api/catalog/tdt').then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/catalog/latest-releases?lang=${apiLang}`).then((r) =>
          r.ok ? r.json() : null
        ),
      ]);

      const rawMovies: CatalogMovie[] = [
        ...(Array.isArray(mRes?.movies) ? (mRes.movies as CatalogMovie[]) : []),
        ...(Array.isArray(lrRes?.cinemaReleases)
          ? (lrRes.cinemaReleases as CatalogMovie[])
          : []),
        ...(Array.isArray(mRes?.results) ? (mRes.results as CatalogMovie[]) : []),
      ];
      const rawSeries: CatalogMovie[] = [
        ...(Array.isArray(sRes?.series) ? (sRes.series as CatalogMovie[]) : []),
        ...(Array.isArray(lrRes?.newSeasons) ? (lrRes.newSeasons as CatalogMovie[]) : []),
        ...(Array.isArray(sRes?.results) ? (sRes.results as CatalogMovie[]) : []),
      ];

      const dedupeById = (items: CatalogMovie[]) => {
        const seen = new Set<string>();
        const out: CatalogMovie[] = [];
        for (const it of items) {
          if (!it || !it.title) continue;
          const key = `${it.mediaType || 'movie'}:${it.tmdbId || it.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(it);
        }
        return out;
      };

      setQuickPool({
        movies: dedupeById(rawMovies),
        series: dedupeById(rawSeries),
        tdt: Array.isArray(tRes?.channels) ? (tRes.channels as SpanishTdtChannel[]) : [],
      });
    } catch {
      // keep existing pool
    } finally {
      setQuickPoolLoading(false);
    }
  }, [lang, setQuickPool, setQuickPoolLoading]);

  useEffect(() => {
    if (quickPoolMoviesLen > 0 && quickPoolSeriesLen > 0) return;
    void loadQuickPool();
  }, [quickPoolMoviesLen, quickPoolSeriesLen, loadQuickPool]);

  const handleGoogleSignIn = async () => {
    manualLobbyStayRef.current = false;
    useAppStore.getState().setAuthNotice(null);
    const res = await signInWithGoogleAccountDetailed();
    if (res.user) {
      useAppStore.getState().setAuthNotice(null);
      return;
    }
    if (res.errorCode) {
      useAppStore.getState().setAuthNotice(
        pickLang(lang, {
          es: '¡Hola! Entra al instante con tu nombre o apodo para disfrutar de RiffanTV con amigos.',
          ca: '¡Hola! Entra a l’instant amb el teu nom o sobrenom per gaudir de RiffanTV amb amics.',
          en: 'Welcome! Enter with your name or nickname to enjoy RiffanTV with friends instantly.',
        })
      );
    }
  };

  const handleGoogleSignOut = async () => {
    setSavedRooms([]);
    try {
      localStorage.removeItem(SAVED_ROOMS_CACHE_KEY);
    } catch {
      // ignore
    }
    await signOutGoogleAccount();
  };

  const handleToggleCatalogFavorite = useCallback(
    (item: CatalogMovie) => {
      const res = toggleWatchlistItem(item);
      setWatchlist(res.list);
      if (res.added) {
        upsertCloudCatalogFavorite(res.canonicalItem).catch(() => {});
      } else {
        deleteCloudCatalogFavoriteAndDuplicates(res.canonicalItem, res.removedKeys).catch(
          () => {}
        );
      }
    },
    [setWatchlist]
  );

  const handleToggleChannelFavorite = useCallback(
    (entry: Omit<FavoriteChannelItem, 'addedAt'>) => {
      const res = toggleFavoriteChannel(entry);
      setFavoriteChannels(res.list);
      if (res.added) {
        upsertCloudChannelFavorite(res.item).catch(() => {});
      } else {
        deleteCloudFavoriteById(res.item.favId).catch(() => {});
      }
    },
    [setFavoriteChannels]
  );

  const handleAddFriend = useCallback(
    (
      entry: {
        friendId: string;
        name: string;
        avatar: string;
        color: string;
        friendCode?: string;
      },
      opts?: { skipNotify?: boolean }
    ) => {
      triggerHaptic('success');
      const { list, friend } = upsertLocalFriend(entry);
      setSavedFriends(list);
      upsertCloudFriend(friend).catch(() => {});
      if (!opts?.skipNotify) {
        socketService.notifyFriendAdded({
          toUserId: friend.friendId,
          toFriendCode: friend.friendCode,
          fromUser: {
            id: profile.id,
            name: profile.name,
            avatar: profile.avatar || '🎬',
            color: profile.color || '#9146FF',
          },
        });
      }
      if (inviteFeedbackTimerRef.current) clearTimeout(inviteFeedbackTimerRef.current);
      setInviteSentFeedback(`✓ ${friend.name} guardado en Mis Amigos`);
      inviteFeedbackTimerRef.current = setTimeout(() => {
        setInviteSentFeedback(null);
      }, 3200);
    },
    [
      profile.id,
      profile.name,
      profile.avatar,
      profile.color,
      setSavedFriends,
      setInviteSentFeedback,
      inviteFeedbackTimerRef,
    ]
  );

  const handleRemoveFriend = useCallback(
    (friendId: string) => {
      triggerHaptic('light');
      const nextList = removeLocalFriend(friendId);
      setSavedFriends(nextList);
      deleteCloudFriend(friendId).catch(() => {});
    },
    [setSavedFriends]
  );

  const handleSendDirectRoomInvite = useCallback(
    (friend: { friendId: string; name: string; friendCode?: string }) => {
      if (!roomId) return;
      triggerHaptic('success');
      playCinemaSound('reaction');
      const activeTitle =
        videoState.mode !== 'idle' && videoState.title ? videoState.title : undefined;
      socketService.sendRoomInvite({
        toUserId: friend.friendId,
        toFriendCode: friend.friendCode,
        toUserName: friend.name,
        roomId,
        roomName: roomName || `Sala ${roomId.toUpperCase()}`,
        mediaTitle: activeTitle,
        fromUser: {
          id: profile.id,
          name: profile.name,
          avatar: profile.avatar || '🎬',
          color: profile.color || '#9146FF',
        },
      });
      if (inviteFeedbackTimerRef.current) clearTimeout(inviteFeedbackTimerRef.current);
      setInviteSentFeedback(`✓ Invitación directa enviada a ${friend.name} en la app`);
      inviteFeedbackTimerRef.current = setTimeout(() => {
        setInviteSentFeedback(null);
      }, 3600);
    },
    [
      roomId,
      roomName,
      videoState.mode,
      videoState.title,
      profile,
      setInviteSentFeedback,
      inviteFeedbackTimerRef,
    ]
  );

  useEffect(() => {
    if (
      !authUser ||
      !authUser.emailVerified ||
      !inRoom ||
      !normalizedRoomCode ||
      !isCurrentRoomPermanent ||
      !isHostUser
    ) {
      return;
    }

    const timer = setTimeout(() => {
      upsertCloudSavedRoom({
        roomCode: normalizedRoomCode,
        roomName: roomName || `Sala ${normalizedRoomCode.toUpperCase()}`,
        hasPin: roomHasPin,
        pinCode: roomHasPin ? currentHostPin : undefined,
        hostOnlyControl,
        lastActiveTitle:
          videoState.mode !== 'idle' ? videoState.title : currentSavedRoom?.lastActiveTitle,
        queueItems: roomQueue,
      }).catch(() => {});
    }, 1100);

    return () => clearTimeout(timer);
  }, [
    authUser,
    inRoom,
    normalizedRoomCode,
    isCurrentRoomPermanent,
    isHostUser,
    roomName,
    roomHasPin,
    currentHostPin,
    hostOnlyControl,
    videoState.mode,
    videoState.title,
    roomQueue,
    currentSavedRoom?.lastActiveTitle,
  ]);

  const handleTogglePermanentRoom = async () => {
    if (!authUser || !authUser.emailVerified || !normalizedRoomCode) return;
    if (isCurrentRoomPermanent) {
      await deleteCloudSavedRoom(normalizedRoomCode);
    } else {
      await upsertCloudSavedRoom({
        roomCode: normalizedRoomCode,
        roomName: roomName || `Sala ${normalizedRoomCode.toUpperCase()}`,
        hasPin: roomHasPin,
        pinCode: roomHasPin ? currentHostPin : undefined,
        hostOnlyControl,
        lastActiveTitle: videoState.mode !== 'idle' ? videoState.title : undefined,
        queueItems: roomQueue,
      });
    }
  };

  const handleDeleteSavedRoom = async (targetRoomCode: string) => {
    await deleteCloudSavedRoom(targetRoomCode);
  };

  const handleSetRoomPin = (nextPinCode: string) => {
    if (!isHostUser) return;
    const trimmed = nextPinCode.trim();
    if (trimmed === '') {
      rememberSessionPin(roomId, '');
      setRoomHasPin(false);
      socketService.setRoomPin('');
    } else if (/^[0-9]{4}$/.test(trimmed)) {
      rememberSessionPin(roomId, trimmed);
      setRoomHasPin(true);
      socketService.setRoomPin(trimmed);
    }
  };

  const handleSubmitGuestPin = (enteredPin: string) => {
    rememberSessionPin(roomId, enteredPin);
    socketService.submitRoomPin(enteredPin);
  };

  const handleRenameRoom = (nextName: string) => {
    if (!isHostUser) return;
    const clean = nextName.trim().slice(0, 60);
    if (!clean) return;
    setRoomName(clean);
    socketService.renameRoom(clean);
  };

  const handleUpdateProfile = (nextName: string, nextAvatar: string, nextColor: string) => {
    const updated: StoredProfile = {
      id: profile.id,
      name: nextName,
      avatar: nextAvatar || profile.avatar || '🎬',
      color: nextColor || profile.color || '#9146FF',
      isCustomized: true,
    };
    import('../utils/storage').then(({ saveStoredProfile }) =>
      saveStoredProfile(updated, true)
    );
    setProfile(updated);
    setShowGuestPopup(false);
    socketService.updateProfile(profile.id, updated.name, updated.avatar, updated.color);
    updateCloudUserProfile(updated).catch(() => {});
  };

  const handleDismissGuestPopup = () => {
    dismissGuestPopupForRoom(roomId);
    setShowGuestPopup(false);
  };

  const handleRemoveHistoryItem = (id: string) => {
    setWatchHistory(removeWatchHistoryItem(id));
    deleteCloudWatchHistoryItem(id).catch(() => {});
  };

  const handleClearAllHistory = () => {
    const prevItems = [...watchHistory];
    setWatchHistory(clearWatchHistory());
    clearCloudWatchHistoryItems(prevItems).catch(() => {});
  };

  return {
    loadQuickPool,
    handleGoogleSignIn,
    handleGoogleSignOut,
    handleToggleCatalogFavorite,
    handleToggleChannelFavorite,
    handleAddFriend,
    handleRemoveFriend,
    handleSendDirectRoomInvite,
    handleTogglePermanentRoom,
    handleDeleteSavedRoom,
    handleSetRoomPin,
    handleSubmitGuestPin,
    handleRenameRoom,
    handleUpdateProfile,
    handleDismissGuestPopup,
    handleRemoveHistoryItem,
    handleClearAllHistory,
  };
}
