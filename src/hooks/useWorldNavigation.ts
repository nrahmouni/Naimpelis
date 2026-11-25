import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CatalogSection } from '../components/MediaCatalogHub';
import type { PortalOriginRect, WorldPortalKind } from '../components/home/WorldPortalTransition';
import { useAppStore, type PrimaryWorldId, type SessionMode, type WorldId } from '../store/useAppStore';
import type { MobileNavTab } from '../utils/appSessionHelpers';
import { playWorldPortalSound } from '../utils/haptics';
import { runWithViewTransition } from '../lib/viewTransition';
import type { RoomGameInviteType } from '../shared/protocol';
import { isXtreamServerWorldId } from '../config/defaultProviders';

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
    (nextWorld: WorldId, opts?: { skipScrollReset?: boolean; restoreScroll?: boolean }) => {
      const store = useAppStore.getState();
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

      if (opts?.restoreScroll) {
        const savedPos = store.worldScrollPositions[nextWorld];
        if (savedPos && (savedPos.mainTop > 0 || savedPos.catalogTop > 0)) {
          store.setPendingScrollRestore(savedPos);
          return;
        }
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
    } else if (world === 'clipbox') {
      void import('../components/clipbox/ClipBoxWorldView').catch(noop);
    } else if (world === 'rbtv') {
      void import('../components/rbtv/RbtvWorldView').catch(noop);
    } else if (world === 'belix') {
      void import('../components/belix/BelixWorldView').catch(noop);
    } else if (world === 'danaactive') {
      void import('../components/dana/DanaActiveWorldView').catch(noop);
    } else if (world === 'atresplayer') {
      void import('../components/atresplayer/AtresplayerWorldView').catch(noop);
    } else if (world === 'movistardazn') {
      void import('../components/movistardazn/DaznMovistarWorldView').catch(noop);
    } else if (world === 'champions') {
      void import('../components/champions/ChampionsWorldView').catch(noop);
    } else if (world === 'music') {
      void import('../components/music/RiffanMusicWorldView').catch(noop);
    } else if (isXtreamServerWorldId(world)) {
      void import('../components/belix/XtreamServerWorldView').catch(noop);
    }
  }, []);

  const enterWorld = useCallback(
    (
      nextWorld: WorldId,
      opts?: {
        withPortal?: boolean;
        originRect?: PortalOriginRect;
        isBack?: boolean;
        restoreScroll?: boolean;
        clearHistory?: boolean;
      }
    ) => {
      if (nextWorld === 'sala' && sessionMode === 'solo' && onUpgradeSoloToPartyRef.current) {
        onUpgradeSoloToPartyRef.current({ targetWorld: 'sala' });
        return;
      }

      setShowWatchlistOnly(false);
      const navStore = useAppStore.getState();
      const prevWorld = navStore.activeWorld;

      if (prevWorld !== nextWorld) {
        navStore.saveWorldScrollPosition(prevWorld, {
          mainTop: mainScrollRef.current?.scrollTop ?? 0,
          catalogTop: catalogScrollRef.current?.scrollTop ?? 0,
        });
        if (opts?.clearHistory) {
          navStore.clearWorldHistory();
        } else if (!opts?.isBack) {
          if (nextWorld === 'entry') {
            navStore.clearWorldHistory();
          } else {
            navStore.pushWorldHistory(prevWorld);
          }
        }
      } else if (opts?.clearHistory) {
        navStore.clearWorldHistory();
      }

      navStore.setRequestedMovieModal(null);
      navStore.setRequestedSeriesModal(null);
      if (nextWorld === 'entry') {
        navStore.setCineSpecialPortal('none');
      }
      clearPortalTimers();

      const applyOpts = {
        skipScrollReset: Boolean(opts?.restoreScroll),
        restoreScroll: Boolean(opts?.restoreScroll),
      };

      if (
        opts?.withPortal &&
        !reducedMotion &&
        (nextWorld === 'cine' ||
          nextWorld === 'futbol' ||
          nextWorld === 'tv' ||
          nextWorld === 'juegos' ||
          nextWorld === 'sala' ||
          nextWorld === 'clipbox' ||
          nextWorld === 'rbtv' ||
          nextWorld === 'belix' ||
          nextWorld === 'danaactive' ||
          nextWorld === 'atresplayer' ||
          nextWorld === 'movistardazn' ||
          nextWorld === 'champions' ||
          nextWorld === 'music' ||
          isXtreamServerWorldId(nextWorld))
      ) {
        if (nextWorld !== 'sala') preloadWorld(nextWorld);
        playWorldPortalSound(nextWorld);
        setPortalLandingActive(false);
        setPortalOriginRect(opts.originRect ?? null);
        setActivePortalTransition(nextWorld);
        const swapTimer = window.setTimeout(() => {
          applyWorldChange(nextWorld, applyOpts);
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
        applyWorldChange(nextWorld, applyOpts);
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
      mainScrollRef,
      catalogScrollRef,
    ]
  );

  const goBackWorld = useCallback(() => {
    const navStore = useAppStore.getState();
    const prev = navStore.popWorldHistory();
    const target: WorldId = prev && prev !== navStore.activeWorld ? prev : 'entry';
    enterWorld(target, { isBack: true, restoreScroll: true });
  }, [enterWorld]);

  const goHome = useCallback(() => {
    enterWorld('entry', { clearHistory: true, restoreScroll: true });
  }, [enterWorld]);

  return {
    activePortalTransition,
    portalOriginRect,
    portalLandingActive,
    preloadWorld,
    enterWorld,
    goBackWorld,
    goHome,
    applyWorldChange,
  };
}
