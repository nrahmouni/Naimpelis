import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AppLanguage, Participant, RoomRole, VideoState } from '../types';
import type { WorldId } from '../store/useAppStore';
import type { ActiveSportsMatchMeta } from './useLiveSportsMatchDetails';
import { pickLang } from '../utils/i18n';
import { parseRoomFromWindow } from '../utils/shortLink';
import { getRecentRooms } from '../utils/storage';
import { generateShortRoomCode } from '../utils/shortLink';
import { loadCachedSavedRooms, ROOM_PINS_SESSION_KEY } from '../utils/appSessionHelpers';

export function resolveInitialRoomSetup(
  initialRoute: ReturnType<typeof parseRoomFromWindow>,
  isGoogleTvApp: boolean
): {
  initialUrlRoom: string;
  effectiveInitialRoom: string;
  initialRoomName: string;
} {
  const initialUrlRoom = initialRoute.roomId;
  const initialAutoRoom =
    !initialUrlRoom &&
    isGoogleTvApp &&
    !initialRoute.isTvPairLobby &&
    !initialRoute.isAdsPage
      ? loadCachedSavedRooms()[0]?.roomCode || getRecentRooms()[0]?.id || generateShortRoomCode(4)
      : '';
  const effectiveInitialRoom = initialUrlRoom || initialAutoRoom;
  const initialRoomName = effectiveInitialRoom
    ? isGoogleTvApp && !initialUrlRoom
      ? 'RiffanTV · Google TV'
      : `Sala ${effectiveInitialRoom.toUpperCase()}`
    : '';
  return { initialUrlRoom, effectiveInitialRoom, initialRoomName };
}

export function buildCurrentParticipantAndRole(params: {
  participants: Participant[];
  creatorId?: string;
  hostId?: string;
  profile: { id: string; name: string; avatar?: string; color?: string };
  isTvMode: boolean;
}): {
  isHostUser: boolean;
  selfRole: RoomRole;
  currentUser: Participant;
} {
  const { participants, creatorId, hostId, profile, isTvMode } = params;
  const selfParticipant = participants.find((p) => p.id === profile.id);
  const effectiveHostId = creatorId || hostId;
  const isHostUser = Boolean(effectiveHostId) && effectiveHostId === profile.id;
  const selfRole: RoomRole = isHostUser
    ? 'host'
    : selfParticipant?.role === 'mod'
    ? 'mod'
    : 'viewer';

  const currentUser: Participant = {
    id: profile.id,
    name: isTvMode ? `${profile.name} (TV)` : profile.name,
    avatar: isTvMode ? '📺' : profile.avatar || '🎬',
    color: profile.color || '#9146FF',
    isHost: isHostUser,
    role: selfRole,
    joinedAt: selfParticipant?.joinedAt || Date.now(),
  };

  return { isHostUser, selfRole, currentUser };
}

export function useAppControllerEffects(params: {
  lang: AppLanguage;
  roomId: string;
  inRoom: boolean;
  videoMode: VideoState['mode'];
  isExtracting: boolean;
  hadActivePlaybackRef: MutableRefObject<boolean>;
  lockToastTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setLockNoticeToast: (v: string | null) => void;
  setIncomingGameInvite: (v: null) => void;
  setCinemaModePersist: (next: boolean) => void;
  setSessionPinMap: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const {
    lang,
    roomId,
    inRoom,
    videoMode,
    isExtracting,
    hadActivePlaybackRef,
    lockToastTimerRef,
    setLockNoticeToast,
    setIncomingGameInvite,
    setCinemaModePersist,
    setSessionPinMap,
  } = params;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang =
      lang === 'zh' ? 'zh-CN' : lang === 'ca' ? 'ca' : lang === 'en' ? 'en' : 'es';
  }, [lang]);

  useEffect(() => {
    setIncomingGameInvite(null);
  }, [roomId, inRoom, setIncomingGameInvite]);

  useEffect(() => {
    const activeNow = videoMode !== 'idle' || isExtracting;
    if (activeNow) hadActivePlaybackRef.current = true;
    else if (hadActivePlaybackRef.current) {
      hadActivePlaybackRef.current = false;
      setCinemaModePersist(false);
    }
  }, [videoMode, isExtracting, hadActivePlaybackRef, setCinemaModePersist]);

  const rememberSessionPin = useCallback(
    (targetCode: string, pinCode: string) => {
      const cleanCode = targetCode.trim().toLowerCase();
      if (!cleanCode) return;
      setSessionPinMap((prev) => {
        const next = { ...prev };
        if (pinCode && /^[0-9]{4}$/.test(pinCode)) next[cleanCode] = pinCode;
        else delete next[cleanCode];
        try {
          sessionStorage.setItem(ROOM_PINS_SESSION_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [setSessionPinMap]
  );

  const showHostLockNotice = useCallback(
    (hostDisplayName?: string, reason?: string) => {
      if (lockToastTimerRef.current) clearTimeout(lockToastTimerRef.current);
      const msg =
        reason ||
        pickLang(lang, {
          es: `Solo ${hostDisplayName || 'el anfitrión'} o un Co-anfitrión puede cambiar canales o películas`,
          ca: `Només ${hostDisplayName || 'l’amfitrió'} o un Co-amfitrió pot canviar canals o pel·lícules`,
          en: `Only ${hostDisplayName || 'the host'} or a Co-host can change channels or movies`,
        });
      setLockNoticeToast(msg);
      lockToastTimerRef.current = setTimeout(() => setLockNoticeToast(null), 3400);
    },
    [lang, lockToastTimerRef, setLockNoticeToast]
  );

  return { rememberSessionPin, showHostLockNotice };
}

export function deriveAppControllerLayoutFlags(params: {
  activeWorld: WorldId;
  videoState: VideoState;
  isExtracting: boolean;
  isPlayerClosedLocally: boolean;
  isPlayerMinimized: boolean;
  isAutoMiniByScroll: boolean;
  pinFullPlayerOnChat: boolean;
  isCinemaMode: boolean;
  participants: Participant[];
  isDesktopLayout: boolean;
  isMobileKeyboardOpen: boolean;
  isMobileLandscape: boolean;
  mobileTab: string;
  floatingChatOpen: boolean;
  isFloatingRoomOpen: boolean;
  activeSportsMatch: ActiveSportsMatchMeta | null;
  activeMovieContext: unknown;
  isInActiveGame: boolean;
}) {
  const {
    activeWorld,
    videoState,
    isExtracting,
    isPlayerClosedLocally,
    isPlayerMinimized,
    isAutoMiniByScroll,
    pinFullPlayerOnChat,
    isCinemaMode,
    participants,
    isDesktopLayout,
    isMobileKeyboardOpen,
    isMobileLandscape,
    mobileTab,
    floatingChatOpen,
    isFloatingRoomOpen,
    activeSportsMatch,
    activeMovieContext,
    isInActiveGame,
  } = params;

  const isOnMobileSocialTab = activeWorld === 'sala';
  const isPlayerActive = (videoState.mode !== 'idle' || isExtracting) && !isPlayerClosedLocally;
  const isPlayingMediaReady = videoState.mode !== 'idle' && !isExtracting && !isPlayerClosedLocally;
  const isDockedMini =
    isPlayerActive &&
    (isPlayerMinimized || (isPlayingMediaReady && isOnMobileSocialTab && !pinFullPlayerOnChat));
  const isScrollCompressed = false && Boolean(isAutoMiniByScroll);
  const showCinemaOverlay = isCinemaMode && isPlayerActive && !isDockedMini;
  const hasConnectedSmartTv = participants.some((p) => p.name.includes('(TV)') || p.avatar === '📺');
  const isMobileChatWithKeyboard =
    !isDesktopLayout && isMobileKeyboardOpen && (mobileTab === 'chat' || floatingChatOpen);
  const isAutoImmersiveLandscape =
    !isDesktopLayout && isMobileLandscape && isPlayerActive && !isDockedMini && !isMobileKeyboardOpen;
  const hideBrowseBelowPlayer =
    isPlayerActive &&
    !isDockedMini &&
    !isAutoImmersiveLandscape &&
    activeWorld !== 'sala' &&
    activeWorld !== 'juegos';

  const isMoviePlaybackDockVisible =
    !isFloatingRoomOpen &&
    videoState.mode !== 'idle' &&
    !isPlayerClosedLocally &&
    !isPlayerMinimized &&
    !isAutoImmersiveLandscape &&
    !activeSportsMatch &&
    !videoState.seriesMeta &&
    !videoState.isLive &&
    videoState.mode !== 'youtube' &&
    Boolean(activeMovieContext || videoState.title);

  const isChannelGuideDockVisible =
    !isFloatingRoomOpen &&
    videoState.mode !== 'idle' &&
    !isPlayerClosedLocally &&
    !isPlayerMinimized &&
    !isAutoImmersiveLandscape &&
    !activeSportsMatch &&
    videoState.mode !== 'youtube' &&
    (Boolean(videoState.isLive) ||
      Boolean(videoState.tracks?.some((tr) => tr.resolverType === 'tdt_hls' || tr.resolverType === 'sports_channel')));

  const lockMainWorkspaceScroll =
    activeWorld === 'sala' || (activeWorld === 'juegos' && isInActiveGame);

  return {
    isOnMobileSocialTab,
    isPlayerActive,
    isPlayingMediaReady,
    isDockedMini,
    isScrollCompressed,
    showCinemaOverlay,
    hasConnectedSmartTv,
    isMobileChatWithKeyboard,
    isAutoImmersiveLandscape,
    hideBrowseBelowPlayer,
    isMoviePlaybackDockVisible,
    isChannelGuideDockVisible,
    lockMainWorkspaceScroll,
  };
}

export function shouldShowSeriesEpisodesDock(params: {
  videoState: Pick<VideoState, 'mode' | 'seriesMeta' | 'isLive'>;
  isExtracting: boolean;
  isPlayerClosedLocally: boolean;
  isPlayerMinimized: boolean;
  isAutoImmersiveLandscape: boolean;
}): boolean {
  const {
    videoState,
    isExtracting,
    isPlayerClosedLocally,
    isPlayerMinimized,
    isAutoImmersiveLandscape,
  } = params;
  return (
    (videoState.mode !== 'idle' || isExtracting) &&
    !isPlayerClosedLocally &&
    !isPlayerMinimized &&
    !isAutoImmersiveLandscape &&
    Boolean(videoState.seriesMeta) &&
    !videoState.isLive
  );
}
