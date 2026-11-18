import { useCallback, useEffect, useRef, useState } from 'react';
import type { FootballMatchDetails, SportsMatch, VideoState } from '../types';

export type ActiveSportsMatchMeta = NonNullable<SportsMatch['matchMeta']> & {
  competition?: string;
};

interface UseLiveSportsMatchDetailsOptions {
  videoMode: VideoState['mode'];
  videoIsLive: boolean;
  videoTitle: string;
  videoSubtitle?: string;
  isExtracting: boolean;
}

export function useLiveSportsMatchDetails({
  videoMode,
  videoIsLive,
  videoTitle,
  videoSubtitle,
  isExtracting,
}: UseLiveSportsMatchDetailsOptions) {
  const [activeSportsMatch, setActiveSportsMatch] = useState<ActiveSportsMatchMeta | null>(
    null
  );
  const [activeMatchDetails, setActiveMatchDetails] = useState<FootballMatchDetails | null>(
    null
  );
  const [loadingActiveMatchDetails, setLoadingActiveMatchDetails] = useState<boolean>(false);
  const [showLiveMatchDock, setShowLiveMatchDock] = useState<boolean>(true);
  const activeMatchAbortRef = useRef<AbortController | null>(null);

  // Keep live Football Match Center synced with room state (for host + guests joining mid-match)
  useEffect(() => {
    if (videoMode === 'idle' && !isExtracting) {
      setActiveSportsMatch(null);
      setActiveMatchDetails(null);
      return;
    }
    if (videoMode !== 'idle' && videoIsLive && !activeSportsMatch) {
      const cleanedTitle = (videoTitle || '').replace(/\s+·\s+.*$/, '').trim();
      const parts = cleanedTitle.split(/\s+(?:vs\.?|v)\s+/i);
      if (parts.length === 2 && parts[0].trim().length >= 2 && parts[1].trim().length >= 2) {
        setActiveSportsMatch({
          homeTeam: parts[0].trim(),
          awayTeam: parts[1].trim(),
          competition: videoSubtitle || undefined,
        });
        setShowLiveMatchDock(true);
      }
    }
  }, [videoMode, videoIsLive, videoTitle, videoSubtitle, isExtracting, activeSportsMatch]);

  const refreshActiveMatchDetails = useCallback(
    async (showSpinner = false) => {
      if (!activeSportsMatch) return;
      activeMatchAbortRef.current?.abort();
      const ctrl = new AbortController();
      activeMatchAbortRef.current = ctrl;
      if (showSpinner) setLoadingActiveMatchDetails(true);
      try {
        const todayMadrid = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Madrid',
        })
          .format(new Date())
          .replace(/-/g, '');
        const params = new URLSearchParams();
        if (activeSportsMatch.eventId) params.set('eventId', activeSportsMatch.eventId);
        if (activeSportsMatch.fotmobMatchId) {
          params.set('fotmobMatchId', activeSportsMatch.fotmobMatchId);
        }
        if (activeSportsMatch.leagueSlug) {
          params.set('leagueSlug', activeSportsMatch.leagueSlug);
        }
        if (activeSportsMatch.homeTeam) params.set('homeTeam', activeSportsMatch.homeTeam);
        if (activeSportsMatch.awayTeam) params.set('awayTeam', activeSportsMatch.awayTeam);
        params.set('date', todayMadrid);

        const res = await fetch(`/api/sports/match-details?${params.toString()}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          success?: boolean;
          details?: FootballMatchDetails;
        };
        if (!ctrl.signal.aborted && data?.success && data.details) {
          setActiveMatchDetails(data.details);
        }
      } catch {
        // ignore transient errors or aborts
      } finally {
        if (!ctrl.signal.aborted) {
          setLoadingActiveMatchDetails(false);
        }
      }
    },
    [activeSportsMatch]
  );

  // Initial fetch + real-time 15s polling while watching a live football match
  useEffect(() => {
    if (!activeSportsMatch) {
      activeMatchAbortRef.current?.abort();
      setActiveMatchDetails(null);
      setLoadingActiveMatchDetails(false);
      return;
    }

    refreshActiveMatchDetails(true);

    if (videoMode === 'idle' && !isExtracting) return;
    if (activeMatchDetails?.statusState === 'finished') return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshActiveMatchDetails(false);
      }
    }, 15000);

    const onVisChange = () => {
      if (document.visibilityState === 'visible') {
        refreshActiveMatchDetails(false);
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [
    activeSportsMatch,
    videoMode,
    isExtracting,
    activeMatchDetails?.statusState,
    refreshActiveMatchDetails,
  ]);

  return {
    activeSportsMatch,
    setActiveSportsMatch,
    activeMatchDetails,
    setActiveMatchDetails,
    loadingActiveMatchDetails,
    showLiveMatchDock,
    setShowLiveMatchDock,
    refreshActiveMatchDetails,
  };
}
