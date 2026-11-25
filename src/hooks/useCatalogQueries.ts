import { useEffect } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import type {
  FootballMatchboardItem,
  LiveScoreMatch,
  SportsMatch,
} from '../types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

let sharedPushSource: EventSource | null = null;
let sharedPushSubscribers = 0;
let sharedPushConnected = false;

function useLiveCatalogPush(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return undefined;
    }
    sharedPushSubscribers += 1;
    if (!sharedPushSource) {
      try {
        const es = new EventSource('/api/events/stream');
        es.addEventListener('connected', () => {
          sharedPushConnected = true;
        });
        es.addEventListener('scores:update', () => {
          void queryClient.invalidateQueries({ queryKey: ['sports', 'live-scores'] });
        });
        es.addEventListener('football-board:update', () => {
          void queryClient.invalidateQueries({ queryKey: ['sports', 'football-board-home'] });
        });
        es.onerror = () => {
          sharedPushConnected = false;
        };
        sharedPushSource = es;
      } catch {
        sharedPushConnected = false;
      }
    }

    return () => {
      sharedPushSubscribers = Math.max(0, sharedPushSubscribers - 1);
      if (sharedPushSubscribers === 0 && sharedPushSource) {
        sharedPushSource.close();
        sharedPushSource = null;
        sharedPushConnected = false;
      }
    };
  }, [enabled]);
}

export function useLiveScoresQuery(enabled = true) {
  useLiveCatalogPush(enabled);
  return useQuery<LiveScoreMatch[]>({
    queryKey: ['sports', 'live-scores'],
    enabled,
    staleTime: 30_000,
    refetchInterval: () => {
      if (!enabled) return false;
      return sharedPushConnected ? 120_000 : 45_000;
    },
    queryFn: async () => {
      const res = await fetch('/api/sports/scores');
      if (!res.ok) throw new Error('Failed to load scores');
      const data = await res.json();
      return Array.isArray(data?.scores) ? data.scores : [];
    },
  });
}

export function useFootballBoardQuery(enabled = true, lang = 'es') {
  useLiveCatalogPush(enabled);
  return useQuery<SportsMatch[]>({
    queryKey: ['sports', 'football-board-home', lang],
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      if (!enabled) return false;
      const matches = query.state.data;
      if (Array.isArray(matches)) {
        const now = Date.now();
        const nearOrLiveFeatured = matches.some((m) => {
          const home = String(m.matchMeta?.homeTeam || '').toLowerCase();
          const away = String(m.matchMeta?.awayTeam || '').toLowerCase();
          const isFeatured =
            home === 'barcelona' ||
            home === 'fc barcelona' ||
            home === 'real madrid' ||
            away === 'barcelona' ||
            away === 'fc barcelona' ||
            away === 'real madrid';
          if (!isFeatured) return false;
          if (m.matchMeta?.statusState === 'live' || m.isLive) return true;
          const k = Number(m.matchMeta?.kickoffMs || 0);
          return k > 0 && k - now <= 15 * 60 * 1000 && k - now >= -150 * 60 * 1000;
        });
        if (nearOrLiveFeatured) return sharedPushConnected ? 45_000 : 25_000;
      }
      return sharedPushConnected ? 120_000 : 60_000;
    },
    queryFn: async () => {
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
        .format(new Date())
        .replace(/-/g, '');
      const res = await fetch(
        `/api/sports/football-board?date=${dateKey}&lang=${encodeURIComponent(lang)}`
      );
      if (!res.ok) throw new Error('Failed to load football board');
      const data = await res.json();
      const rawItems: FootballMatchboardItem[] = Array.isArray(data?.matches) ? data.matches : [];
      return rawItems.map((item) => ({
        id: item.id,
        title: `${item.homeTeam} vs ${item.awayTeam}`,
        competition: item.groupTitle,
        sport: 'soccer',
        time:
          item.statusState === 'live'
            ? item.statusLabel || 'EN VIVO'
            : item.kickoffTime,
        isLive: item.statusState === 'live',
        is247Channel: false,
        channels: item.channels || [],
        matchMeta: {
          eventId: item.eventId,
          fotmobMatchId: item.fotmobMatchId,
          leagueSlug: item.leagueSlug,
          leagueName: item.leagueName,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          homeShort: item.homeShort,
          awayShort: item.awayShort,
          homeLogo: item.homeLogo,
          awayLogo: item.awayLogo,
          homeScore: item.homeScore,
          awayScore: item.awayScore,
          statusState: item.statusState,
          statusLabel: item.statusLabel,
          kickoffMs: item.kickoffMs,
          kickoffIso: item.kickoffIso,
          kickoffTime: item.kickoffTime,
          spanishBroadcaster: item.spanishBroadcaster,
          verifiedTvGuide: item.verifiedTvGuide,
        },
      }));
    },
  });
}

