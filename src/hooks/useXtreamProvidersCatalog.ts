import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_PROVIDER_SUMMARIES } from '../config/defaultProviders';
import type { ProviderCatalogData } from '../types/providers';
import {
  syncAllDefaultProvidersProgressively,
  syncSingleProviderCatalog,
} from '../services/xtreamProvidersService';

export interface ProviderSlotState {
  providerId: string;
  providerName: string;
  accentColor: string;
  loading: boolean;
  status: 'loading' | 'ready' | 'error';
  counts: { live: number; movies: number; series: number };
  data: ProviderCatalogData | null;
}

interface ProvidersCatalogStoreState {
  slots: Record<string, ProviderSlotState>;
  isSyncingAny: boolean;
  hasLoadedFullCatalogs: boolean;
}

function createInitialSlots(): Record<string, ProviderSlotState> {
  const initial: Record<string, ProviderSlotState> = {};
  for (const summary of DEFAULT_PROVIDER_SUMMARIES) {
    initial[summary.id] = {
      providerId: summary.id,
      providerName: summary.name,
      accentColor: summary.accentColor,
      loading: true,
      status: 'loading',
      counts: { live: 0, movies: 0, series: 0 },
      data: null,
    };
  }
  return initial;
}

let storeState: ProvidersCatalogStoreState = {
  slots: createInitialSlots(),
  isSyncingAny: false,
  hasLoadedFullCatalogs: false,
};

let activeGeneration = 0;
let activeAbortController: AbortController | null = null;
let hasTriggeredInitialSync = false;
let hasTriggeredStatusWarm = false;
let statusPollTimer: number | null = null;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ProvidersCatalogStoreState {
  return storeState;
}

function stopStatusPolling(): void {
  if (statusPollTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

export function resetProvidersCatalogStoreForTest(): void {
  activeGeneration += 1;
  stopStatusPolling();
  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch {
      // ignore
    }
    activeAbortController = null;
  }
  hasTriggeredInitialSync = false;
  hasTriggeredStatusWarm = false;
  storeState = {
    slots: createInitialSlots(),
    isSyncingAny: false,
    hasLoadedFullCatalogs: false,
  };
  emitChange();
}

async function fetchLightweightProviderStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/providers/status');
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as
      | {
          success?: boolean;
          providers?: Array<{
            providerId: string;
            providerName: string;
            accentColor: string;
            status: 'loading' | 'ready' | 'error';
            counts: { live: number; movies: number; series: number };
          }>;
        }
      | null;
    if (!json?.success || !Array.isArray(json.providers)) return false;

    const nextSlots = { ...storeState.slots };
    let stillLoading = false;
    for (const row of json.providers) {
      const existing = nextSlots[row.providerId];
      if (row.status === 'loading') stillLoading = true;
      nextSlots[row.providerId] = {
        providerId: row.providerId,
        providerName: row.providerName,
        accentColor: existing?.accentColor || row.accentColor || '#7C3AED',
        loading: existing?.data ? false : row.status === 'loading',
        status: existing?.data?.status || row.status,
        counts: existing?.data ? existing.data.counts : row.counts,
        data: existing?.data ?? null,
      };
    }

    const prevReadyCount = Object.values(storeState.slots).filter((s) => s.status === 'ready').length;
    const nextReadyCount = Object.values(nextSlots).filter((s) => s.status === 'ready').length;

    storeState = {
      ...storeState,
      slots: nextSlots,
      isSyncingAny: stillLoading,
    };
    emitChange();
    if (nextReadyCount > prevReadyCount && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('riffan:providers-status-ready'));
    }
    return stillLoading;
  } catch {
    return false;
  }
}

function startLightweightStatusSync(): void {
  if (hasTriggeredStatusWarm) return;
  hasTriggeredStatusWarm = true;

  storeState = { ...storeState, isSyncingAny: true };
  emitChange();

  void fetchLightweightProviderStatus().then((stillLoading) => {
    if (!stillLoading || typeof window === 'undefined') return;
    let attempts = 0;
    statusPollTimer = window.setInterval(() => {
      attempts += 1;
      void fetchLightweightProviderStatus().then((moreLoading) => {
        if (!moreLoading || attempts >= 10) {
          stopStatusPolling();
          if (storeState.isSyncingAny) {
            storeState = { ...storeState, isSyncingAny: false };
            emitChange();
          }
        }
      });
    }, 3200);
  });
}

async function executeProvidersSync(forceRefresh = false): Promise<void> {
  stopStatusPolling();
  activeGeneration += 1;
  const runGen = activeGeneration;

  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch {
      // ignore
    }
  }
  const ctrl = new AbortController();
  activeAbortController = ctrl;

  const nextSlots: Record<string, ProviderSlotState> = {};
  for (const summary of DEFAULT_PROVIDER_SUMMARIES) {
    const existing = storeState.slots[summary.id];
    nextSlots[summary.id] = {
      providerId: summary.id,
      providerName: summary.name,
      accentColor: summary.accentColor,
      loading: true,
      status: existing?.status || 'loading',
      counts: forceRefresh ? { live: 0, movies: 0, series: 0 } : existing?.counts || { live: 0, movies: 0, series: 0 },
      data: forceRefresh ? null : existing?.data ?? null,
    };
  }
  storeState = {
    slots: nextSlots,
    isSyncingAny: true,
    hasLoadedFullCatalogs: true,
  };
  emitChange();

  try {
    await syncAllDefaultProvidersProgressively({
      forceRefresh,
      signal: ctrl.signal,
      onProviderResolved: (catalog) => {
        if (runGen !== activeGeneration || ctrl.signal.aborted) return;
        const prevSlot = storeState.slots[catalog.providerId];
        storeState = {
          ...storeState,
          slots: {
            ...storeState.slots,
            [catalog.providerId]: {
              providerId: catalog.providerId,
              providerName: catalog.providerName,
              accentColor: prevSlot?.accentColor || '#7C3AED',
              loading: false,
              status: catalog.status,
              counts: catalog.counts,
              data: catalog,
            },
          },
        };
        emitChange();
      },
    });
  } finally {
    if (runGen === activeGeneration && !ctrl.signal.aborted) {
      storeState = {
        ...storeState,
        isSyncingAny: false,
      };
      emitChange();
    }
  }
}

async function loadSingleProviderOnDemand(providerId: string): Promise<void> {
  const existing = storeState.slots[providerId];
  if (existing?.data && existing.status === 'ready') return;
  if (existing) {
    storeState = {
      ...storeState,
      slots: {
        ...storeState.slots,
        [providerId]: { ...existing, loading: true },
      },
    };
    emitChange();
  }
  const catalog = await syncSingleProviderCatalog(providerId, { forceRefresh: false });
  const prevSlot = storeState.slots[providerId];
  storeState = {
    ...storeState,
    slots: {
      ...storeState.slots,
      [providerId]: {
        providerId: catalog.providerId,
        providerName: catalog.providerName,
        accentColor: prevSlot?.accentColor || '#7C3AED',
        loading: false,
        status: catalog.status,
        counts: catalog.counts,
        data: catalog,
      },
    },
  };
  emitChange();
}

export function useXtreamProvidersCatalog(autoLoadFullCatalog = false) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (autoLoadFullCatalog) {
      if (hasTriggeredInitialSync) return;
      hasTriggeredInitialSync = true;
      void executeProvidersSync(false);
    } else {
      startLightweightStatusSync();
    }
  }, [autoLoadFullCatalog]);

  const loadFullCatalog = useCallback(() => {
    if (hasTriggeredInitialSync && snapshot.hasLoadedFullCatalogs) return;
    hasTriggeredInitialSync = true;
    void executeProvidersSync(false);
  }, [snapshot.hasLoadedFullCatalogs]);

  const refreshAllProviders = useCallback(() => {
    hasTriggeredInitialSync = true;
    void executeProvidersSync(true);
  }, []);

  const loadSingleProvider = useCallback((providerId: string) => {
    void loadSingleProviderOnDemand(providerId);
  }, []);

  const orderedSlots = useMemo(
    () => DEFAULT_PROVIDER_SUMMARIES.map((s) => snapshot.slots[s.id]).filter(Boolean),
    [snapshot.slots]
  );

  const totals = useMemo(() => {
    let totalLive = 0;
    let totalMovies = 0;
    let totalSeries = 0;
    let readyCount = 0;
    let loadingCount = 0;
    let errorCount = 0;

    for (const slot of orderedSlots) {
      if (slot.loading) loadingCount += 1;
      if (slot.status === 'ready') {
        readyCount += 1;
        totalLive += slot.counts.live;
        totalMovies += slot.counts.movies;
        totalSeries += slot.counts.series;
      } else if (!slot.loading && slot.status === 'error') {
        errorCount += 1;
      }
    }

    return {
      totalLive,
      totalMovies,
      totalSeries,
      readyCount,
      loadingCount,
      errorCount,
      totalProviders: orderedSlots.length,
    };
  }, [orderedSlots]);

  return {
    slots: snapshot.slots,
    orderedSlots,
    totals,
    isSyncingAny: snapshot.isSyncingAny,
    hasLoadedFullCatalogs: snapshot.hasLoadedFullCatalogs,
    loadFullCatalog,
    loadSingleProvider,
    refreshAllProviders,
  };
}
