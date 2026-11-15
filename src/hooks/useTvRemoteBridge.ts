import type { VideoState } from '../types';
import type { CatalogSection } from '../components/MediaCatalogHub';
import { useTvSpatialRemote } from '../utils/tvSpatialNav';

export function useTvRemoteBridge(params: {
  isAdsPageOpen: boolean;
  setIsAdsPageOpen: (v: boolean) => void;
  smartTvModalOpen: boolean;
  setSmartTvModalOpen: (v: boolean) => void;
  friendsModalOpen: boolean;
  setFriendsModalOpen: (v: boolean) => void;
  profileHubOpen: boolean;
  setProfileHubOpen: (v: boolean) => void;
  floatingChatOpen: boolean;
  setFloatingChatOpen: (v: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  videoState: VideoState;
  isExtracting: boolean;
  isPlayerClosedLocally: boolean;
  setIsPlayerClosedLocally: (v: boolean) => void;
  setIsExtracting: (v: boolean) => void;
  inRoom: boolean;
  catalogSection: CatalogSection;
  setCatalogSection: (sec: CatalogSection) => void;
  setMobileTab: (tab: 'home' | 'movies' | 'tdt' | 'sports' | 'youtube' | 'games' | 'chat' | 'room') => void;
  handleSelectTrack: (idx: number, currentTimeSec: number) => void;
}) {
  const {
    isAdsPageOpen,
    setIsAdsPageOpen,
    smartTvModalOpen,
    setSmartTvModalOpen,
    friendsModalOpen,
    setFriendsModalOpen,
    profileHubOpen,
    setProfileHubOpen,
    floatingChatOpen,
    setFloatingChatOpen,
    sidebarOpen,
    setSidebarOpen,
    videoState,
    isExtracting,
    isPlayerClosedLocally,
    setIsPlayerClosedLocally,
    setIsExtracting,
    inRoom,
    catalogSection,
    setCatalogSection,
    setMobileTab,
    handleSelectTrack,
  } = params;

  useTvSpatialRemote({
    onBackStep: () => {
      if (isAdsPageOpen) {
        setIsAdsPageOpen(false);
        if (typeof window !== 'undefined') window.history.replaceState({}, '', '/');
        return true;
      }
      if (smartTvModalOpen) {
        setSmartTvModalOpen(false);
        return true;
      }
      if (friendsModalOpen) {
        setFriendsModalOpen(false);
        return true;
      }
      if (profileHubOpen) {
        setProfileHubOpen(false);
        return true;
      }
      if (floatingChatOpen) {
        setFloatingChatOpen(false);
        return true;
      }
      if (sidebarOpen) {
        setSidebarOpen(false);
        return true;
      }
      if (
        (videoState.mode !== 'idle' || isExtracting) &&
        !isPlayerClosedLocally
      ) {
        setIsPlayerClosedLocally(true);
        setIsExtracting(false);
        return true;
      }
      if (inRoom && catalogSection !== 'home') {
        setCatalogSection('home');
        setMobileTab('home');
        return true;
      }
      return false;
    },
    onChannelStep: (delta) => {
      if (videoState.isLive && videoState.tracks.length > 1) {
        const len = videoState.tracks.length;
        const nextIdx = (videoState.activeTrackIndex + delta + len) % len;
        handleSelectTrack(nextIdx, 0);
        return true;
      }
      return false;
    },
  });
}
