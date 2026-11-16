import { QueryClient, useQuery } from '@tanstack/react-query';
import type { ChannelLiveEpg, LiveScoreMatch, SpanishTdtChannel } from '../types';

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
