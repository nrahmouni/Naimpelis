import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Code2,
  Database,
  RefreshCw,
  Tv,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel, SportsMatch } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { BelixLiveTab } from './BelixLiveTab';
import { BelixVaultTab } from './BelixVaultTab';
import { BelixDecoderTab } from './BelixDecoderTab';
import type { BelixInventoryResponse } from './belixTypes';

export type BelixSubTab = 'live' | 'vault' | 'decoder';

interface BelixWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onPlayCustomUrl: (url: string) => void;
}

export const BelixWorldView: React.FC<BelixWorldViewProps> = ({
  lang,
  externalSearchQuery = '',
  onPlaySportsMatch,
  onPlayTdtChannel,
  onPlayCustomUrl,
}) => {
  const [activeTab, setActiveTab] = useState<BelixSubTab>('live');
  const [inventory, setInventory] = useState<BelixInventoryResponse | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decoderInitialInput, setDecoderInitialInput] = useState('');

  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/belix/inventory');
      const json = (await res.json().catch(() => null)) as
        | (BelixInventoryResponse & { error?: string })
        | null;
      if (!res.ok || !json?.success) {
        setLoadError(
          json?.error ||
            pickLang(lang, {
              es: 'No se pudo cargar el inventario de Belix TV.',
              ca: 'No s’ha pogut carregar l’inventari de Belix TV.',
              en: 'Could not load Belix TV inventory.',
            })
        );
        return;
      }
      setInventory(json);
    } catch {
      setLoadError(
        pickLang(lang, {
          es: 'Error de red al cargar los módulos de Belix TV.',
          ca: 'Error de xarxa en carregar els mòduls de Belix TV.',
          en: 'Network error loading Belix TV modules.',
        })
      );
    } finally {
      setLoadingInventory(false);
    }
  }, [lang]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  // Hierarchical Back button: vault/decoder -> live -> entry home
  useBackInterceptor(
    activeTab !== 'live',
    'belix-subtab-return',
    () => {
      setActiveTab('live');
    },
    { priority: 4 }
  );

  const handleSendToDecoder = useCallback((value: string) => {
    setDecoderInitialInput(value);
    setActiveTab('decoder');
  }, []);

  const totalUrls = inventory?.actualCounts.literalUrls ?? 54;
  const totalHosts = inventory?.actualCounts.hosts ?? 25;
  const totalEndpoints = inventory?.actualCounts.apiEndpoints ?? 15;
  const totalDynamic = inventory?.actualCounts.dynamicRoutes ?? 4;
  const totalSmali = inventory?.actualCounts.relevantCodeFiles ?? 8;
  const pkgDisplay = inventory?.packageName || 'com.shadeed.belixtv';

  return (
    <div className="w-full space-y-4">
      {/* HEADER SUMMARY BAND + SEGMENTED CONTROL */}
      <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight">
              {pickLang(lang, {
                es: `Belix TV · Fork IBO Pro / RTX (${pkgDisplay})`,
                ca: `Belix TV · Fork IBO Pro / RTX (${pkgDisplay})`,
                en: `Belix TV · IBO Pro / RTX Fork (${pkgDisplay})`,
              })}
            </h1>
            <p className="text-xs sm:text-[13px] text-zinc-400">
              {pickLang(lang, {
                es: 'Panel Xtream Shark Pro (1.sharkpro.ink:80), licencias IBO Player y arquitectura Smali/nativa ordenada.',
                ca: 'Panell Xtream Shark Pro (1.sharkpro.ink:80), llicències IBO Player i arquitectura Smali/nativa ordenada.',
                en: 'Shark Pro Xtream host (1.sharkpro.ink:80), IBO Player licensing domains, and ordered Smali/native map.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-zinc-300 tabular-nums shrink-0">
            <span>
              <strong className="text-white font-bold">{totalUrls}</strong> URLs
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#F43F5E] font-bold">{totalHosts}</strong> Hosts
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#818CF8] font-bold">{totalEndpoints}</strong> APIs
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>
              <strong className="text-emerald-400 font-bold">{totalDynamic}</strong>{' '}
              {pickLang(lang, { es: 'Rutas', ca: 'Rutes', en: 'Routes' })}
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>
              <strong className="text-zinc-100 font-bold">{totalSmali}</strong> Clases/.so
            </span>
          </div>
        </div>

        {/* 3 SEGMENTED SUB-TABS (>=44px height) */}
        <div
          role="tablist"
          aria-label={pickLang(lang, {
            es: 'Secciones de Belix TV',
            ca: 'Seccions de Belix TV',
            en: 'Belix TV sections',
          })}
          className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-[#000000] border border-white/[0.08]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'live'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('live');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'live'
                ? 'bg-[#F43F5E] text-white shadow-[0_6px_18px_rgba(244,63,94,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Tv className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, { es: 'Directos y Xtream', ca: 'Directes i Xtream', en: 'Live & Xtream' })}
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
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all tabular-nums whitespace-nowrap ${
              activeTab === 'vault'
                ? 'bg-[#F43F5E] text-white shadow-[0_6px_18px_rgba(244,63,94,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span className="truncate">Hosts y Licencias ({totalHosts})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'decoder'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('decoder');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'decoder'
                ? 'bg-[#F43F5E] text-white shadow-[0_6px_18px_rgba(244,63,94,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Code2 className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, { es: 'Reporte y Arquitectura', ca: 'Informe i Arquitectura', en: 'Report & Architecture' })}
            </span>
          </button>
        </div>
      </div>

      {/* TAB BODY */}
      {loadingInventory && !inventory ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-6 space-y-3">
          <div className="h-5 w-48 rounded-lg bg-white/[0.08] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
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
                  es: 'No pudimos leer el inventario de Belix TV',
                  ca: 'No hem pogut llegir l’inventari de Belix TV',
                  en: 'Could not load Belix TV inventory',
                })}
              </h2>
              <p className="text-xs text-zinc-400">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchInventory()}
            className="min-h-11 px-4 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}</span>
          </button>
        </div>
      ) : activeTab === 'live' && inventory ? (
        <BelixLiveTab
          lang={lang}
          externalQuery={externalSearchQuery}
          apiEndpoints={inventory.apiEndpoints}
          dynamicRoutes={inventory.dynamicRoutes}
          reverseEngineeringUpdate={inventory.reverseEngineeringUpdate}
          onPlaySportsMatch={onPlaySportsMatch}
          onPlayTdtChannel={onPlayTdtChannel}
          onPlayCustomUrl={onPlayCustomUrl}
          onSendToDecoder={handleSendToDecoder}
        />
      ) : activeTab === 'vault' && inventory ? (
        <BelixVaultTab
          lang={lang}
          hosts={inventory.hosts}
          categoryCounts={inventory.categoryCounts}
          onSendToDecoder={handleSendToDecoder}
        />
      ) : inventory ? (
        <BelixDecoderTab
          lang={lang}
          initialInput={decoderInitialInput}
          reverseEngineeringUpdate={inventory.reverseEngineeringUpdate}
          apiEndpoints={inventory.apiEndpoints}
          apiParams={inventory.apiParams}
          dynamicRoutes={inventory.dynamicRoutes}
          streamingNotes={inventory.streamingNotes}
          appExternalUrls={inventory.appExternalUrls}
          codeFiles={inventory.codeFiles}
          limitations={inventory.limitations}
        />
      ) : null}
    </div>
  );
};
