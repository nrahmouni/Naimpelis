import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CatalogSection } from '../components/MediaCatalogHub';
import type { PortalOriginRect, WorldPortalKind } from '../components/home/WorldPortalTransition';
import { useAppStore, type PrimaryWorldId, type SessionMode, type WorldId } from '../store/useAppStore';
import type { MobileNavTab } from '../utils/appSessionHelpers';
import { playWorldPortalSound } from '../utils/haptics';
import { runWithViewTransition } from '../lib/viewTransition';
import type { RoomGameInviteType } from '../shared/protocol';

interface UseWorldNavigationParams {
  sessionMode: SessionMode;
  roomId: string;
  reducedMotion: boolean;
  effectiveInitialRoom: string;
  initialDeepLinkGame: RoomGameInviteType | null;
  inRoomRef: MutableRefObject<boolean>;
  mainScrollRef: MutableRefObject<HTMLDivElement | null>;
  catalogScrollRef: MutableRefObject<HTMLDivElement | null>;
  setActiveWorld: (w: WorldId) => void;
  setCatalogSection: Dispatch<SetStateAction<CatalogSection>>;
  setMobileTab: Dispatch<SetStateAction<MobileNavTab>>;
  setUnreadChatCount: Dispatch<SetStateAction<number>>;
  setIsInActiveGame: Dispatch<SetStateAction<boolean>>;
  setWorldSearchQuery: Dispatch<SetStateAction<string>>;
  setShowWatchlistOnly: Dispatch<SetStateAction<boolean>>;
  onUpgradeSoloToParty?: (opts?: { targetWorld?: WorldId }) => void;
}

export function useWorldNavigation({
  sessionMode,
  roomId,
  reducedMotion,
  effectiveInitialRoom,
  initialDeepLinkGame,
  inRoomRef,
  mainScrollRef,
  catalogScrollRef,
  setActiveWorld,
  setCatalogSection,
  setMobileTab,
  setUnreadChatCount,
  setIsInActiveGame,
  setWorldSearchQuery,
  setShowWatchlistOnly,
  onUpgradeSoloToParty,
}: UseWorldNavigationParams) {
  const [activePortalTransition, setActivePortalTransition] =
    useState<WorldPortalKind | null>(null);
  const [portalOriginRect, setPortalOriginRect] =
    useState<PortalOriginRect | null>(null);
  const [portalLandingActive, setPortalLandingActive] = useState<boolean>(false);
  const portalTimersRef = useRef<number[]>([]);
  const onUpgradeSoloToPartyRef = useRef(onUpgradeSoloToParty);
  onUpgradeSoloToPartyRef.current = onUpgradeSoloToParty;

  const clearPortalTimers = useCallback(() => {
    portalTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    portalTimersRef.current = [];
  }, []);

  useEffect(() => () => clearPortalTimers(), [clearPortalTimers]);

  const applyWorldChange = useCallback(
    (nextWorld: WorldId, opts?: { skipScrollReset?: boolean }) => {
      setActiveWorld(nextWorld);
      if (nextWorld === 'cine') {
        setCatalogSection('movies');
        setMobileTab('movies');
      } else if (nextWorld === 'futbol') {
        setCatalogSection('sports');
        setMobileTab('sports');
      } else if (nextWorld === 'tv') {
        setCatalogSection('tdt');
        setMobileTab('tdt');
      } else if (nextWorld === 'youtube') {
        setCatalogSection('youtube');
        setMobileTab('youtube');
      } else if (nextWorld === 'juegos') {
        setCatalogSection('games');
        setMobileTab('games');
      } else if (nextWorld === 'sala') {
        setMobileTab('room');
        setUnreadChatCount(0);
      } else {
        setCatalogSection('home');
        setMobileTab('home');
        setIsInActiveGame(false);
      }

      if (!opts?.skipScrollReset) {
        mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
        catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [
      setActiveWorld,
      setCatalogSection,
      setMobileTab,
      setUnreadChatCount,
      setIsInActiveGame,
      mainScrollRef,
      catalogScrollRef,
    ]
  );

  useEffect(() => {
    if (!effectiveInitialRoom || !initialDeepLinkGame) return;
    applyWorldChange('juegos');
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('game')) {
          url.searchParams.delete('game');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preloadWorld = useCallback((world: PrimaryWorldId) => {
    const noop = () => {};
    if (world === 'futbol') {
      void import('../components/catalog/FootballWorldView').catch(noop);
      void import('../components/FootballMatchboard').catch(noop);
    } else if (world === 'tv') {
      void import('../components/catalog/LiveTvWorldView').catch(noop);
    } else if (world === 'juegos') {
      void import('../components/GamesHubSection').catch(noop);
    } else if (world === 'cine') {
      void import('../components/ExpandedDiscoverySection').catch(noop);
    }
  }, []);

  const enterWorld = useCallback(
    (nextWorld: WorldId, opts?: { withPortal?: boolean; originRect?: PortalOriginRect }) => {
      if (nextWorld === 'sala' && sessionMode === 'solo' && onUpgradeSoloToPartyRef.current) {
        onUpgradeSoloToPartyRef.current({ targetWorld: 'sala' });
        return;
      }

      setWorldSearchQuery('');
      setShowWatchlistOnly(false);
      const navStore = useAppStore.getState();
      navStore.setHomeSearchQuery('');
      navStore.setRequestedMovieModal(null);
      navStore.setRequestedSeriesModal(null);
      if (nextWorld === 'entry') {
        navStore.setCineSpecialPortal('none');
      }
      clearPortalTimers();

      if (
        opts?.withPortal &&
        !reducedMotion &&
        (nextWorld === 'cine' ||
          nextWorld === 'futbol' ||
          nextWorld === 'tv' ||
          nextWorld === 'juegos' ||
          nextWorld === 'sala')
      ) {
        if (nextWorld !== 'sala') preloadWorld(nextWorld);
        playWorldPortalSound(nextWorld);
        setPortalLandingActive(false);
        setPortalOriginRect(opts.originRect ?? null);
        setActivePortalTransition(nextWorld);
        const swapTimer = window.setTimeout(() => {
          applyWorldChange(nextWorld);
          setPortalLandingActive(true);
        }, 110);
        const exitTimer = window.setTimeout(() => {
          setActivePortalTransition(null);
          setPortalOriginRect(null);
        }, 210);
        const landingTimer = window.setTimeout(() => {
          setPortalLandingActive(false);
        }, 320);
        portalTimersRef.current = [swapTimer, exitTimer, landingTimer];
        return;
      }

      setActivePortalTransition(null);
      setPortalOriginRect(null);
      setPortalLandingActive(false);
      runWithViewTransition(() => {
        applyWorldChange(nextWorld);
      });
    },
    [
      sessionMode,
      setWorldSearchQuery,
      setShowWatchlistOnly,
      clearPortalTimers,
      reducedMotion,
      preloadWorld,
      applyWorldChange,
    ]
  );

  return {
    activePortalTransition,
    portalOriginRect,
    portalLandingActive,
    preloadWorld,
    enterWorld,
    applyWorldChange,
  };
}
