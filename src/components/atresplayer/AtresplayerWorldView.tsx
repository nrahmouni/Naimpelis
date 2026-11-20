import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Code2,
  Database,
  PlayCircle,
  RefreshCw,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { AtresplayerOverviewTab } from './AtresplayerOverviewTab';
import { AtresplayerHostsTab } from './AtresplayerHostsTab';
import { AtresplayerCatalogTab } from './AtresplayerCatalogTab';
import type {
  AtresplayerInventoryResponse,
  AtresplayerOverviewResponse,
} from './atresplayerTypes';

export type AtresplayerSubTab = 'overview' | 'hosts' | 'catalog';

interface AtresplayerWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
}

export const AtresplayerWorldView: React.FC<AtresplayerWorldViewProps> = ({
  lang,
  externalSearchQuery = '',
  onPlayTdtChannel,
}) => {
  const [activeTab, setActiveTab] = useState<AtresplayerSubTab>('overview');
  const [inventory, setInventory] = useState<AtresplayerInventoryResponse | null>(null);
  const [overview, setOverview] = useState<AtresplayerOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decoderInitialInput, setDecoderInitialInput] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [invRes, ovRes] = await Promise.all([
        fetch('/api/atresplayer/inventory'),
        fetch('/api/atresplayer/overview'),
      ]);
      const invJson = (await invRes.json().catch(() => null)) as
        | (AtresplayerInventoryResponse & { error?: string })
        | null;
      const ovJson = (await ovRes.json().catch(() => null)) as AtresplayerOverviewResponse | null;

      if (!invRes.ok || !invJson?.success) {
        setLoadError(
          invJson?.error ||
            pickLang(lang, {
              es: 'No se pudo cargar el inventario técnico de Atresplayer.',
              ca: 'No s’ha pogut carregar l’inventari tècnic d’Atresplayer.',
              en: 'Could not load Atresplayer technical inventory.',
            })
        );
        return;
      }
      setInventory(invJson);
      if (ovJson?.success) setOverview(ovJson);
    } catch {
      setLoadError(
        pickLang(lang, {
          es: 'Error de red cargando la sección Atresplayer.',
          ca: 'Error de xarxa carregant la secció Atresplayer.',
          en: 'Network error loading Atresplayer section.',
        })
      );
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useBackInterceptor(
    activeTab !== 'overview',
    'atresplayer-subtab-return',
    () => {
      setActiveTab('overview');
    },
    { priority: 4 }
  );

  const handleSendToDecoder = useCallback((value: string) => {
    setDecoderInitialInput(value);
    setActiveTab('catalog');
  }, []);

  const totalUrls = inventory?.declaredSummary.literalUrls ?? 55;
  const totalHosts = inventory?.actualCounts.hosts ?? 13;
  const totalDecls = inventory?.declaredSummary.retrofitDeclarations ?? 177;
  const totalServices = inventory?.actualCounts.retrofitServices ?? 36;
  const totalJava = inventory?.javaFiles ?? 2943;

  return (
    <div className="w-full space-y-4">
      {/* HEADER SUMMARY BAND + SEGMENTED CONTROL */}
      <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight">
              {pickLang(lang, {
                es: 'Atresplayer · Arquitectura VOD, DRM & Directo TDT',
                ca: 'Atresplayer · Arquitectura VOD, DRM i Directe TDT',
                en: 'Atresplayer · VOD, DRM & Live DTT Architecture',
              })}
            </h1>
            <p className="text-xs sm:text-[13px] text-zinc-400">
              {pickLang(lang, {
                es: 'Inventario completo com.a3 / com.atresmedia (rutas_atresplayer_completo-1.txt), cadena de reproducción y señales TDT Atresmedia.',
                ca: 'Inventari complet com.a3 / com.atresmedia, cadena de reproducció i senyals TDT Atresmedia.',
                en: 'Full com.a3 / com.atresmedia inventory, 4-step playback chain, Widevine specs, and live Atresmedia DTT.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-zinc-300 tabular-nums shrink-0">
            <span>
              <strong className="text-white font-bold">{totalUrls}</strong> URLs
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#FF5E1A] font-bold">{totalHosts}</strong> Hosts
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#FF8A4C] font-bold">{totalDecls}</strong> APIs
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>
              <strong className="text-emerald-400 font-bold">{totalServices}</strong> Servicios
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>
              <strong className="text-zinc-100 font-bold">{totalJava.toLocaleString('es-ES')}</strong> Java
            </span>
          </div>
        </div>

        {/* 3 SEGMENTED SUB-TABS (>=44px height) */}
        <div
          role="tablist"
          aria-label={pickLang(lang, {
            es: 'Secciones de Atresplayer',
            ca: 'Seccions d’Atresplayer',
            en: 'Atresplayer sections',
          })}
          className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-[#000000] border border-white/[0.08]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('overview');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-[#FF5E1A] text-white shadow-[0_6px_18px_rgba(255,94,26,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <PlayCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, {
                es: 'Cadena, DRM y TDT',
                ca: 'Cadena, DRM i TDT',
                en: 'Chain, DRM & DTT',
              })}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'hosts'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('hosts');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all tabular-nums whitespace-nowrap ${
              activeTab === 'hosts'
                ? 'bg-[#FF5E1A] text-white shadow-[0_6px_18px_rgba(255,94,26,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span className="truncate">Servidores y {totalUrls} URLs</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'catalog'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('catalog');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all tabular-nums whitespace-nowrap ${
              activeTab === 'catalog'
                ? 'bg-[#FF5E1A] text-white shadow-[0_6px_18px_rgba(255,94,26,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Code2 className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, {
                es: `${totalDecls} APIs y Decodificador`,
                ca: `${totalDecls} APIs i Descodificador`,
                en: `${totalDecls} APIs & Decoder`,
              })}
            </span>
          </button>
        </div>
      </div>

      {/* TAB BODY */}
      {loading && !inventory ? (
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
                No pudimos cargar el inventario de Atresplayer
              </h2>
              <p className="text-xs text-zinc-400">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="min-h-11 px-4 rounded-xl bg-[#FF5E1A] hover:bg-[#EA580C] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reintentar</span>
          </button>
        </div>
      ) : activeTab === 'overview' && inventory ? (
        <AtresplayerOverviewTab
          lang={lang}
          externalQuery={externalSearchQuery}
          inventory={inventory}
          overview={overview}
          onPlayTdtChannel={onPlayTdtChannel}
          onSendToDecoder={handleSendToDecoder}
        />
      ) : activeTab === 'hosts' && inventory ? (
        <AtresplayerHostsTab
          lang={lang}
          externalQuery={externalSearchQuery}
          hosts={inventory.hosts}
          categoryCounts={inventory.categoryCounts}
          baseUrls={inventory.baseUrls}
          literalUrls={inventory.literalUrls}
          onSendToDecoder={handleSendToDecoder}
        />
      ) : inventory ? (
        <AtresplayerCatalogTab
          lang={lang}
          initialInput={decoderInitialInput}
          services={inventory.retrofitServices}
          serviceGroupCounts={inventory.serviceGroupCounts}
          propertiesKeys={inventory.propertiesKeys}
          portNotes={inventory.portNotes}
          limitations={inventory.limitations}
        />
      ) : null}
    </div>
  );
};
