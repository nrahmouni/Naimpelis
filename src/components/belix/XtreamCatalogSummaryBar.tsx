/**
 * @module src/components/belix/XtreamCatalogSummaryBar
 * @description Clean credential-free multi-provider catalog summary bar displaying
 * per-server item counts and accumulated totals across Live TV, Movies, and Series.
 */
import React, { useMemo } from 'react';
import { ChevronRight, Layers } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import {
  PROVIDER_ID_TO_XTREAM_WORLD,
  XTREAM_PROVIDER_UI_SPECS,
  type DefaultProviderEntry,
  type XtreamServerWorldId,
} from '../../config/defaultProviders';
import {
  computeProviderBreakdownCounts,
  type XtreamFullCatalogPayload,
} from '../../services/xtreamClientService';

interface XtreamCatalogSummaryBarProps {
  lang: AppLanguage;
  catalog: XtreamFullCatalogPayload | null;
  scopeProviderIds?: DefaultProviderEntry['id'][];
  mode?: 'all' | 'live' | 'vod' | 'series';
  onOpenServerWorld?: (worldId: XtreamServerWorldId) => void;
}

export const XtreamCatalogSummaryBar: React.FC<XtreamCatalogSummaryBarProps> = ({
  lang,
  catalog,
  scopeProviderIds,
  mode = 'all',
  onOpenServerWorld,
}) => {
  const { perServer, totals } = useMemo(
    () => computeProviderBreakdownCounts(catalog, scopeProviderIds),
    [catalog, scopeProviderIds]
  );

  const countById = useMemo(() => {
    const map = new Map<string, (typeof perServer)[number]>();
    for (const srv of perServer) map.set(srv.id, srv);
    return map;
  }, [perServer]);

  const visibleServers = useMemo(
    () =>
      XTREAM_PROVIDER_UI_SPECS.filter(
        (spec) => !scopeProviderIds || scopeProviderIds.includes(spec.providerId)
      ).map((spec) => {
        const hit = countById.get(spec.providerId);
        return {
          id: spec.providerId,
          name: spec.name,
          accent: spec.accent,
          worldId: spec.worldId,
          liveChannels: hit?.liveChannels ?? 0,
          vodMovies: hit?.vodMovies ?? 0,
          series: hit?.series ?? 0,
          total: hit?.total ?? 0,
        };
      }),
    [countById, scopeProviderIds]
  );

  return (
    <div className="rounded-2xl bg-[#0B0C12] border border-white/[0.08] p-3.5 sm:p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 truncate">
            {pickLang(lang, {
              es: 'Resumen sincronizado de servidores',
              ca: 'Resum sincronitzat de servidors',
              en: 'Synced servers summary',
            })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          {(mode === 'all' || mode === 'live') && (
            <span className="text-zinc-300">
              <strong className="text-white font-bold">
                {totals.liveChannels.toLocaleString('es-ES')}
              </strong>{' '}
              TV
            </span>
          )}
          {(mode === 'all' || mode === 'vod') && (
            <span className="text-zinc-300">
              <strong className="text-white font-bold">
                {totals.vodMovies.toLocaleString('es-ES')}
              </strong>{' '}
              Películas
            </span>
          )}
          {(mode === 'all' || mode === 'series') && (
            <span className="text-zinc-300">
              <strong className="text-white font-bold">
                {totals.series.toLocaleString('es-ES')}
              </strong>{' '}
              Series
            </span>
          )}
          {catalog && totals.total > 0 && (
            <span className="text-emerald-300 font-bold">
              Total: {totals.total.toLocaleString('es-ES')}
            </span>
          )}
        </div>
      </div>

      {visibleServers.length > 0 && (
        <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {visibleServers.map((srv) => {
            const worldId =
              srv.worldId ||
              PROVIDER_ID_TO_XTREAM_WORLD[srv.id as DefaultProviderEntry['id']] ||
              undefined;
            const modeCount =
              mode === 'live'
                ? srv.liveChannels
                : mode === 'vod'
                  ? srv.vodMovies
                  : mode === 'series'
                    ? srv.series
                    : srv.total;
            const subLabel =
              mode === 'all'
                ? srv.total > 0
                  ? `${srv.liveChannels} TV · ${srv.vodMovies} VOD · ${srv.series} Ser.`
                  : 'Conectado'
                : modeCount > 0
                  ? `${modeCount.toLocaleString('es-ES')} ${
                      mode === 'live' ? 'canales' : mode === 'vod' ? 'películas' : 'series'
                    }`
                  : 'Conectado';

            const content = (
              <div className="flex items-center justify-between gap-2.5 min-w-[144px]">
                <div className="min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: srv.accent || '#10B981' }}
                    />
                    <span className="text-xs font-bold text-white truncate">{srv.name}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 tabular-nums mt-0.5 truncate">
                    {subLabel}
                  </p>
                </div>
                {onOpenServerWorld && worldId && (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                )}
              </div>
            );

            if (onOpenServerWorld && worldId) {
              return (
                <button
                  key={`summary-srv-${srv.id}`}
                  type="button"
                  onClick={() => onOpenServerWorld(worldId)}
                  className="shrink-0 min-h-11 px-3 py-2 rounded-xl bg-black/50 hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.16] transition-colors cursor-pointer"
                >
                  {content}
                </button>
              );
            }

            return (
              <div
                key={`summary-srv-${srv.id}`}
                className="shrink-0 min-h-11 px-3 py-2 rounded-xl bg-black/50 border border-white/[0.07] flex items-center"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
