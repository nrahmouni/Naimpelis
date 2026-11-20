import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Code2,
  Database,
  Radio,
  RefreshCw,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel, SportsMatch } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { RbtvLiveTab } from './RbtvLiveTab';
import { RbtvHostsVaultTab } from './RbtvHostsVaultTab';
import { RbtvDecoderTab } from './RbtvDecoderTab';
import type { RbtvInventoryResponse } from './rbtvTypes';

export type RbtvSubTab = 'live' | 'vault' | 'decoder';

interface RbtvWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onPlayCustomUrl?: (url: string) => void;
}

export const RbtvWorldView: React.FC<RbtvWorldViewProps> = ({
  lang,
  externalSearchQuery = '',
  onPlaySportsMatch,
  onPlayTdtChannel,
}) => {
  const [activeTab, setActiveTab] = useState<RbtvSubTab>('live');
  const [inventory, setInventory] = useState<RbtvInventoryResponse | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decoderInitialInput, setDecoderInitialInput] = useState('');

  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/rbtv/inventory');
      const json = (await res.json().catch(() => null)) as
        | (RbtvInventoryResponse & { error?: string })
        | null;
      if (!res.ok || !json?.success) {
        setLoadError(
          json?.error ||
            pickLang(lang, {
              es: 'No se pudo cargar el inventario RBTV+.',
              ca: 'No s’ha pogut carregar l’inventari RBTV+.',
              en: 'Could not load RBTV+ inventory.',
            })
        );
        return;
      }
      setInventory(json);
    } catch {
      setLoadError(
        pickLang(lang, {
          es: 'Error de red al cargar los nodos RBTV+.',
          ca: 'Error de xarxa en carregar els nodes RBTV+.',
          en: 'Network error loading RBTV+ inventory.',
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
    'rbtv-subtab-return',
    () => {
      setActiveTab('live');
    },
    { priority: 4 }
  );

  const handleSendToDecoder = useCallback((value: string) => {
    setDecoderInitialInput(value);
    setActiveTab('decoder');
  }, []);

  const coreHosts = useMemo(
    () => (inventory?.hosts || []).filter((h) => h.isCoreAppDomain),
    [inventory]
  );

  const totalUrls = inventory?.actualCounts.absoluteUrls ?? 61;
  const totalHosts = inventory?.actualCounts.hosts ?? 47;
  const totalCore = inventory?.actualCounts.coreDomains ?? 10;
  const totalDoh = inventory?.actualCounts.dohResolvers ?? 13;
  const totalFormats = inventory?.actualCounts.mediaFormats ?? 14;

  return (
    <div className="w-full space-y-4">
      {/* HEADER SUMMARY BAND + SEGMENTED CONTROL */}
      <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight">
              {pickLang(lang, {
                es: 'RBTV+ · Cluster Deportivo, DoH y P2P',
                ca: 'RBTV+ · Clúster Esportiu, DoH i P2P',
                en: 'RBTV+ · Sports Cluster, DoH & P2P Engine',
              })}
            </h1>
            <p className="text-xs sm:text-[13px] text-zinc-400">
              {pickLang(lang, {
                es: 'Deportes y canales 24/7 en directo, monitor de nodos RBTV77, 13 resolvers DoH y arquitectura Java/Smali descifrada.',
                ca: 'Esports i canals 24/7 en directe, monitor de nodes RBTV77, 13 resolvers DoH i arquitectura descifrada.',
                en: 'Live sports & 24/7 streams, RBTV77 cluster monitor, 13 DoH resolvers & decoded Java/Smali map.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-zinc-300 tabular-nums shrink-0">
            <span>
              <strong className="text-white font-bold">{totalUrls}</strong> URLs
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#F59E0B] font-bold">{totalHosts}</strong> Hosts
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              <strong className="text-emerald-400 font-bold">{totalCore}</strong> Core
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#06B6D4] font-bold">{totalDoh}</strong> DoH
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              <strong className="text-[#A78BFA] font-bold">{totalFormats}</strong>{' '}
              {pickLang(lang, { es: 'Formatos', ca: 'Formats', en: 'Formats' })}
            </span>
          </div>
        </div>

        {/* 3 SEGMENTED SUB-TABS (>=44px height) */}
        <div
          role="tablist"
          aria-label={pickLang(lang, {
            es: 'Secciones de RBTV+',
            ca: 'Seccions de RBTV+',
            en: 'RBTV+ sections',
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
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'live'
                ? 'bg-[#F59E0B] text-black shadow-[0_6px_18px_rgba(245,158,11,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Radio className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, { es: 'Directos y Nodos', ca: 'Directes i Nodes', en: 'Live & Nodes' })}
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
                ? 'bg-[#F59E0B] text-black shadow-[0_6px_18px_rgba(245,158,11,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span className="truncate">Hosts ({totalHosts})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'decoder'}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('decoder');
            }}
            className={`min-h-11 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'decoder'
                ? 'bg-[#F59E0B] text-black shadow-[0_6px_18px_rgba(245,158,11,0.32)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Code2 className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {pickLang(lang, { es: 'Arquitectura', ca: 'Arquitectura', en: 'Decoder' })}
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
                  es: 'No pudimos leer el inventario RBTV+',
                  ca: 'No hem pogut llegir l’inventari RBTV+',
                  en: 'Could not load RBTV+ inventory',
                })}
              </h2>
              <p className="text-xs text-zinc-400">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchInventory()}
            className="min-h-11 px-4 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-black text-xs font-bold inline-flex items-center gap-2 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}</span>
          </button>
        </div>
      ) : activeTab === 'live' && inventory ? (
        <RbtvLiveTab
          lang={lang}
          externalQuery={externalSearchQuery}
          coreHosts={coreHosts}
          onPlaySportsMatch={onPlaySportsMatch}
          onPlayTdtChannel={onPlayTdtChannel}
          onSendToDecoder={handleSendToDecoder}
        />
      ) : activeTab === 'vault' && inventory ? (
        <RbtvHostsVaultTab
          lang={lang}
          hosts={inventory.hosts}
          categoryCounts={inventory.categoryCounts}
          onSendToDecoder={handleSendToDecoder}
        />
      ) : inventory ? (
        <RbtvDecoderTab
          lang={lang}
          initialInput={decoderInitialInput}
          architectureNodes={inventory.architectureNodes}
          pathsByHost={inventory.pathsByHost}
          mediaFormats={inventory.mediaFormats}
        />
      ) : null}
    </div>
  );
};
