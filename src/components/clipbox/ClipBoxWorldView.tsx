import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Code2,
  Database,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { ClipBoxSearchTab } from './ClipBoxSearchTab';
import { ClipBoxHostsVaultTab } from './ClipBoxHostsVaultTab';
import { ClipBoxDecoderTab } from './ClipBoxDecoderTab';
import type {
  ClipboxInventoryResponse,
  ClipboxPlayerTrack,
  ClipboxSearchItem,
  ClipboxTitleStreamsResult,
} from './clipboxTypes';

export type ClipBoxSubTab = 'search' | 'vault' | 'decoder';

interface ClipBoxWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlayCustomUrl: (url: string) => void;
  onPlayMovie: (movie: CatalogMovie, preferLang: string) => void;
  onPlayClipboxMedia?: (
    item: ClipboxSearchItem,
    track: ClipboxPlayerTrack,
    streamsData: ClipboxTitleStreamsResult,
    epOpts?: { season?: number; episode?: number }
  ) => void;
}

export const ClipBoxWorldView: React.FC<ClipBoxWorldViewProps> = ({
  lang,
  externalSearchQuery = '',
  onPlayCustomUrl,
  onPlayMovie,
  onPlayClipboxMedia,
}) => {
  const [activeTab, setActiveTab] = useState<ClipBoxSubTab>('search');
  const [inventory, setInventory] = useState<ClipboxInventoryResponse | null>(null);
  const [loadingInventory, setLoadingInventory] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vaultFilterQuery, setVaultFilterQuery] = useState<string>('');
  const [decoderInitialInput, setDecoderInitialInput] = useState<string>('');

  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/clipbox/inventory');
      const json = (await res.json().catch(() => null)) as
        | (ClipboxInventoryResponse & { error?: string })
        | null;
      if (!res.ok || !json?.success) {
        setLoadError(
          json?.error ||
            pickLang(lang, {
              es: 'No se pudo cargar la bóveda ClipBox.',
              ca: 'No s’ha pogut carregar la volta ClipBox.',
              en: 'Could not load the ClipBox vault.',
            })
        );
        return;
      }
      setInventory(json);
    } catch {
      setLoadError(
        pickLang(lang, {
          es: 'Error de red al cargar rutas y motores ClipBox.',
          ca: 'Error de xarxa en carregar rutes i motors ClipBox.',
          en: 'Network error loading ClipBox routes and engines.',
        })
      );
    } finally {
      setLoadingInventory(false);
    }
  }, [lang]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  // Sub-tab Back navigation hierarchy: vault/decoder -> search -> entry home
  useBackInterceptor(
    activeTab !== 'search',
    'clipbox-subtab-return',
    () => {
      setActiveTab('search');
    },
    { priority: 4 }
  );

  const handleSendToDecoder = useCallback((value: string) => {
    setDecoderInitialInput(value);
    setActiveTab('decoder');
  }, []);

  const handleInspectHostInVault = useCallback((host: string) => {
    setVaultFilterQuery(host);
    setActiveTab('vault');
  }, []);

  const totalUrls = inventory?.actualCounts.literalUrls ?? 574;
  const totalHosts = inventory?.actualCounts.hosts ?? 440;
  const totalRoutes = inventory?.actualCounts.routePatterns ?? 954;
  const streamingHosts = inventory?.actualCounts.streamingHosts ?? 0;

  return (
    <div className="w-full space-y-4">
      {/* HEADER SUMMARY BAND + SEGMENTED CONTROL */}
      <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight">
              {pickLang(lang, {
                es: 'Bóveda y Motores ClipBox',
                ca: 'Volta i Motors ClipBox',
                en: 'ClipBox Vault & Engines',
              })}
            </h1>
            <p className="text-xs sm:text-[13px] text-zinc-400">
              {pickLang(lang, {
                es: 'Búsqueda unificada, motores multi-servidor, subtítulos OpenSubtitles, AniSkip/IntroDB y descifrado completo.',
                ca: 'Cerca unificada, motors multi-servidor, subtítols OpenSubtitles, AniSkip/IntroDB i desxifrat complet.',
                en: 'Unified search, multi-provider stream engines, OpenSubtitles, AniSkip/IntroDB & full payload decoder.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-zinc-300 tabular-nums shrink-0">
            <span>
              <strong className="text-white font-bold">{totalUrls}</strong> URLs
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#06B6D4] font-bold">{totalHosts}</strong> Hosts
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#A78BFA] font-bold">{totalRoutes}</strong>{' '}
              {pickLang(lang, { es: 'Rutas', ca: 'Rutes', en: 'Routes' })}
            </span>
            {streamingHosts > 0 && (
              <>
                <span className="text-zinc-600">·</span>
                <span>
                  <strong className="text-emerald-400 font-bold">{streamingHosts}</strong>{' '}
                  {pickLang(lang, { es: 'Activos', ca: 'Actius', en: 'Active' })}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 3 SEGMENTED SUB-TABS (>=44px touch height) */}
        <div
          role="tablist"
          aria-label={pickLang(lang, {
            es: 'Secciones de ClipBox',
            ca: 'Seccions de ClipBox',
            en: 'ClipBox sections',
          })}
          className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-[#000000] border border-white/[0.08]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'search'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('search');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'search'
                ? 'bg-[#7C3AED] text-white shadow-[0_6px_18px_rgba(124,58,237,0.35)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, { es: 'Buscar y Ver', ca: 'Cercar i Veure', en: 'Search & Play' })}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'vault'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('vault');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all tabular-nums ${
              activeTab === 'vault'
                ? 'bg-[#7C3AED] text-white shadow-[0_6px_18px_rgba(124,58,237,0.35)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, {
                es: `Hosts (${totalHosts})`,
                ca: `Hosts (${totalHosts})`,
                en: `Hosts (${totalHosts})`,
              })}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'decoder'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('decoder');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all tabular-nums ${
              activeTab === 'decoder'
                ? 'bg-[#7C3AED] text-white shadow-[0_6px_18px_rgba(124,58,237,0.35)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Code2 className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, {
                es: `Descifrador (${totalRoutes})`,
                ca: `Desxifrador (${totalRoutes})`,
                en: `Decoder (${totalRoutes})`,
              })}
            </span>
          </button>
        </div>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'search' ? (
        <ClipBoxSearchTab
          lang={lang}
          externalQuery={externalSearchQuery}
          onPlayCustomUrl={onPlayCustomUrl}
          onPlayMovie={onPlayMovie}
          onPlayClipboxMedia={onPlayClipboxMedia}
          onInspectHostInVault={handleInspectHostInVault}
        />
      ) : loadingInventory && !inventory ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-6 space-y-3">
          <div className="h-5 w-48 rounded-lg bg-white/[0.08] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-24 rounded-2xl bg-white/[0.04] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : loadError && !inventory ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-red-500/30 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-white">
                {pickLang(lang, {
                  es: 'No pudimos leer el catálogo ClipBox',
                  ca: 'No hem pogut llegir el catàleg ClipBox',
                  en: 'Could not load ClipBox inventory',
                })}
              </h2>
              <p className="text-xs text-zinc-400">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchInventory()}
            className="min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}</span>
          </button>
        </div>
      ) : activeTab === 'vault' && inventory ? (
        <ClipBoxHostsVaultTab
          lang={lang}
          hosts={inventory.hosts}
          categoryCounts={inventory.categoryCounts}
          initialFilterQuery={vaultFilterQuery}
          onSendToDecoder={handleSendToDecoder}
          onPlayCustomUrl={onPlayCustomUrl}
        />
      ) : inventory ? (
        <ClipBoxDecoderTab
          lang={lang}
          initialInput={decoderInitialInput}
          decodedTokens={inventory.decodedTokens}
          decodedProviders={inventory.decodedProviders}
          decodedExtractors={inventory.decodedExtractors}
          routePatterns={inventory.routePatterns}
          totalFilteredRoutes={inventory.totalFilteredRoutes}
          mediaRefs={inventory.mediaRefs}
          onPlayCustomUrl={onPlayCustomUrl}
        />
      ) : null}
    </div>
  );
};
