import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CatalogSection } from '../components/MediaCatalogHub';
import type { PortalOriginRect, WorldPortalKind } from '../components/home/WorldPortalTransition';
import type { PrimaryWorldId, WorldId } from '../store/useAppStore';
import type { MobileNavTab } from '../utils/appSessionHelpers';
import { playWorldPortalSound } from '../utils/haptics';
import { runWithViewTransition } from '../lib/viewTransition';
import type { RoomGameInviteType } from '../shared/protocol';

interface UseWorldNavigationParams {
  roomId: string;
  reducedMotion: boolean;
  effectiveInitialRoom: string;
  initialIsKidsMode?: boolean;
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
}

export function useWorldNavigation({
  roomId,
  reducedMotion,
  effectiveInitialRoom,
  initialIsKidsMode,
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
}: UseWorldNavigationParams) {
  const [activePortalTransition, setActivePortalTransition] =
    useState<WorldPortalKind | null>(null);
  const [portalOriginRect, setPortalOriginRect] =
    useState<PortalOriginRect | null>(null);
  const [portalLandingActive, setPortalLandingActive] = useState<boolean>(false);
  const portalTimersRef = useRef<number[]>([]);

  const clearPortalTimers = useCallback(() => {
    portalTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    portalTimersRef.current = [];
  }, []);

  useEffect(() => () => clearPortalTimers(), [clearPortalTimers]);

  const applyWorldChange = useCallback(
    (nextWorld: WorldId) => {
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
      } else if (nextWorld === 'kids') {
        setCatalogSection('home');
        setMobileTab('home');
      } else if (nextWorld === 'sala') {
        setMobileTab('room');
        setUnreadChatCount(0);
      } else {
        setCatalogSection('home');
        setMobileTab('home');
        setIsInActiveGame(false);
      }

      if (typeof window !== 'undefined' && inRoomRef.current) {
        try {
          const currentPath = window.location.pathname.toLowerCase();
          if (nextWorld === 'kids') {
            if (currentPath !== '/kids') {
              window.history.replaceState({}, '', '/kids');
            }
          } else if (currentPath === '/kids' && roomId) {
            window.history.replaceState({}, '', `/${encodeURIComponent(roomId)}`);
          }
        } catch {
          // ignore
        }
      }

      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    },
    [
      setActiveWorld,
      setCatalogSection,
      setMobileTab,
      setUnreadChatCount,
      setIsInActiveGame,
      inRoomRef,
      roomId,
      mainScrollRef,
      catalogScrollRef,
    ]
  );

  useEffect(() => {
    if (effectiveInitialRoom && initialIsKidsMode) {
      applyWorldChange('kids');
      return;
    }
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
    if (world === 'futbol') {
      void import('../components/FootballMatchboard');
    } else if (world === 'juegos') {
      void import('../components/GamesHubSection');
    } else if (world === 'kids') {
      void import('../components/kids/RiffanKidsHub');
    } else if (world === 'cine' || world === 'tv') {
      void import('../components/ExpandedDiscoverySection');
    }
  }, []);

  const enterWorld = useCallback(
    (nextWorld: WorldId, opts?: { withPortal?: boolean; originRect?: PortalOriginRect }) => {
      setWorldSearchQuery('');
      setShowWatchlistOnly(false);
      clearPortalTimers();

      if (
        opts?.withPortal &&
        !reducedMotion &&
        (nextWorld === 'cine' ||
          nextWorld === 'futbol' ||
          nextWorld === 'tv' ||
          nextWorld === 'juegos' ||
          nextWorld === 'kids' ||
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
        }, 760);
        const exitTimer = window.setTimeout(() => {
          setActivePortalTransition(null);
          setPortalOriginRect(null);
        }, 980);
        const landingTimer = window.setTimeout(() => {
          setPortalLandingActive(false);
        }, 1280);
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
  };
}
