import { QueryClient, useQuery } from '@tanstack/react-query';
import type {
  ChannelLiveEpg,
  FootballMatchboardItem,
  LiveScoreMatch,
  SpanishTdtChannel,
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

export function useLiveScoresQuery(enabled = true) {
  return useQuery<LiveScoreMatch[]>({
    queryKey: ['sports', 'live-scores'],
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 45_000 : false,
    queryFn: async () => {
      const res = await fetch('/api/sports/scores');
      if (!res.ok) throw new Error('Failed to load scores');
      const data = await res.json();
      return Array.isArray(data?.matches) ? data.matches : [];
    },
  });
}

export function useFootballBoardQuery(enabled = true) {
  return useQuery<SportsMatch[]>({
    queryKey: ['sports', 'football-board-home'],
    enabled,
    staleTime: 90_000,
    refetchInterval: enabled ? 120_000 : false,
    queryFn: async () => {
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
        .format(new Date())
        .replace(/-/g, '');
      const res = await fetch(`/api/sports/football-board?date=${dateKey}`);
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
        },
      }));
    },
  });
}

export function useTdtChannelsQuery(enabled = true) {
  return useQuery<SpanishTdtChannel[]>({
    queryKey: ['tdt', 'channels'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/tdt/channels');
      if (!res.ok) throw new Error('Failed to load TV channels');
      const data = await res.json();
      return Array.isArray(data?.channels) ? data.channels : [];
    },
  });
}

export function useLiveEpgQuery(enabled = true) {
  return useQuery<Record<string, ChannelLiveEpg>>({
    queryKey: ['tdt', 'epg-live'],
    enabled,
    staleTime: 2 * 60_000,
    refetchInterval: enabled ? 3 * 60_000 : false,
    queryFn: async () => {
      const res = await fetch('/api/tdt/epg/live');
      if (!res.ok) throw new Error('Failed to load TV guide');
      const data = await res.json();
      return data?.epgByChannel && typeof data.epgByChannel === 'object'
        ? data.epgByChannel
        : {};
    },
  });
}

