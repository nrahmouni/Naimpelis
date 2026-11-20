import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Code2,
  Copy,
  Database,
  Globe,
  Loader2,
  Search,
  ShieldAlert,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  AtresplayerBaseUrlItem,
  AtresplayerHostCategory,
  AtresplayerHostItem,
  AtresplayerLiteralUrlItem,
  AtresplayerProbeResult,
} from './atresplayerTypes';

interface AtresplayerHostsTabProps {
  lang: AppLanguage;
  externalQuery?: string;
  hosts: AtresplayerHostItem[];
  categoryCounts: Record<AtresplayerHostCategory, number>;
  baseUrls: AtresplayerBaseUrlItem[];
  literalUrls: AtresplayerLiteralUrlItem[];
  onSendToDecoder: (value: string) => void;
}

export const AtresplayerHostsTab: React.FC<AtresplayerHostsTabProps> = ({
  lang,
  externalQuery = '',
  hosts,
  categoryCounts,
  baseUrls,
  literalUrls,
  onSendToDecoder,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | AtresplayerHostCategory>('all');
  const [urlScope, setUrlScope] = useState<'all' | 'own' | 'external'>('all');
  const [searchQuery, setSearchQuery] = useState(externalQuery);
  const [probeMap, setProbeMap] = useState<Record<string, AtresplayerProbeResult>>({});
  const [probingHost, setProbingHost] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const effectiveQuery = (searchQuery || externalQuery).trim().toLowerCase();

  const filteredHosts = useMemo(() => {
    return hosts.filter((h) => {
      if (selectedCategory !== 'all' && h.category !== selectedCategory) return false;
      if (!effectiveQuery) return true;
      return (
        h.host.toLowerCase().includes(effectiveQuery) ||
        h.role.toLowerCase().includes(effectiveQuery) ||
        h.categoryLabel.toLowerCase().includes(effectiveQuery) ||
        h.basePaths.some((p) => p.toLowerCase().includes(effectiveQuery)) ||
        h.sampleUrls.some((u) => u.toLowerCase().includes(effectiveQuery))
      );
    });
  }, [hosts, selectedCategory, effectiveQuery]);

  const filteredUrls = useMemo(() => {
    return literalUrls.filter((u) => {
      if (urlScope !== 'all' && u.scope !== urlScope) return false;
      if (!effectiveQuery) return true;
      return (
        u.url.toLowerCase().includes(effectiveQuery) ||
        u.host.toLowerCase().includes(effectiveQuery) ||
        u.category.toLowerCase().includes(effectiveQuery) ||
        u.note.toLowerCase().includes(effectiveQuery)
      );
    });
  }, [literalUrls, urlScope, effectiveQuery]);

  const probeSingle = async (host: string) => {
    setProbingHost(host);
    triggerHaptic('light');
    try {
      const res = await fetch(`/api/atresplayer/probe?host=${encodeURIComponent(host)}`);
      const json = (await res.json().catch(() => null)) as { probe?: AtresplayerProbeResult } | null;
      if (json?.probe) {
        setProbeMap((prev) => ({ ...prev, [host]: json.probe! }));
      }
    } finally {
      setProbingHost(null);
    }
  };

  const probeBatchVisible = async () => {
    const candidates = filteredHosts
      .filter((h) => h.probeAllowed)
      .slice(0, 12)
      .map((h) => h.host);
    if (candidates.length === 0) return;
    setBatchLoading(true);
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/atresplayer/probe-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hosts: candidates }),
      });
      const json = (await res.json().catch(() => null)) as { probes?: AtresplayerProbeResult[] } | null;
      if (json?.probes) {
        setProbeMap((prev) => {
          const next = { ...prev };
          for (const p of json.probes!) {
            next[p.host] = p;
          }
          return next;
        });
      }
    } finally {
      setBatchLoading(false);
    }
  };

  const copyText = async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedUrl(val);
      triggerHaptic('light');
      window.setTimeout(() => setCopiedUrl((prev) => (prev === val ? null : prev)), 1500);
    } catch {
      // ignore
    }
  };

  const categories: Array<{ id: 'all' | AtresplayerHostCategory; label: string; count: number }> = [
    { id: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }), count: hosts.length },
    { id: 'atres_core', label: 'Core API / Props', count: categoryCounts.atres_core || 0 },
    { id: 'atres_portal', label: 'Cuenta / Web / Estáticos', count: categoryCounts.atres_portal || 0 },
    { id: 'atres_ads_identity', label: 'Ads e Identidad', count: categoryCounts.atres_ads_identity || 0 },
    { id: 'store_platform', label: 'Tiendas y Búsqueda', count: categoryCounts.store_platform || 0 },
    { id: 'placeholder', label: 'Placeholder Local', count: categoryCounts.placeholder || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* SEARCH + CATEGORY FILTERS + BATCH PROBE */}
      <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={pickLang(lang, {
                es: 'Buscar host (api.atresplayer.com, properties, rlcdn) o ruta //client/v1/...',
                ca: 'Cercar host o ruta //client/v1/...',
                en: 'Search host (api.atresplayer.com, properties, rlcdn) or //client/v1/ route...',
              })}
              className="w-full min-h-11 pl-10 pr-4 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#FF5E1A]/60 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => void probeBatchVisible()}
            disabled={batchLoading}
            className="min-h-11 px-4 rounded-xl bg-[#FF5E1A] hover:bg-[#EA580C] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50 whitespace-nowrap"
          >
            {batchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            <span>
              {pickLang(lang, {
                es: 'Verificar hosts visibles',
                ca: 'Verificar hosts visibles',
                en: 'Probe visible hosts',
              })}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedCategory(cat.id);
              }}
              className={`min-h-10 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer tabular-nums whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-white text-black'
                  : 'bg-[#000000] text-zinc-400 hover:text-white border border-white/[0.08]'
              }`}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: SERVERS TABLE / CARDS WITH PORTS & PROTOCOLS */}
      {filteredHosts.length === 0 ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-6 text-xs text-zinc-400 flex items-center gap-2">
          <Database className="w-4 h-4 text-zinc-500" />
          <span>No hay hosts con este filtro en el inventario de Atresplayer.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredHosts.map((item) => {
            const probe = probeMap[item.host];
            return (
              <article
                key={item.host}
                className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-white truncate">{item.host}</span>
                    </div>
                    <p className="text-[11px] font-mono text-[#FF8A4C] tabular-nums">
                      {item.protocol} · Puerto {item.port} · {item.categoryLabel}
                    </p>
                    <p className="text-xs text-zinc-400 leading-relaxed">{item.role}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.probeAllowed ? (
                      <button
                        type="button"
                        onClick={() => void probeSingle(item.host)}
                        disabled={probingHost === item.host}
                        className="min-h-10 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {probingHost === item.host ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5E1A]" />
                        ) : (
                          <Activity className="w-3.5 h-3.5 text-[#FF5E1A]" />
                        )}
                        <span>Probar</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 px-2">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Local / Sentinel</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onSendToDecoder(item.sampleUrls[0] || item.host)}
                      className="min-h-10 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-[#FF8A4C] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Analizar</span>
                    </button>
                  </div>
                </div>

                {probe && (
                  <div className="flex items-center justify-between text-[11px] font-mono px-3 py-1.5 rounded-lg bg-[#000000] border border-white/[0.06] tabular-nums">
                    <span className={probe.ok ? 'text-emerald-400' : 'text-red-400'}>
                      {probe.ok ? 'OK' : 'BLOQUEADO / ERR'} · HTTP {probe.status}
                    </span>
                    <span className="text-zinc-400">{probe.latencyMs}ms</span>
                  </div>
                )}

                <div className="space-y-1">
                  {item.basePaths.map((bp) => (
                    <div
                      key={bp}
                      className="text-[11px] font-mono text-zinc-300 bg-[#000000]/80 rounded-lg px-2.5 py-1.5 truncate"
                    >
                      Ruta base: {bp}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* SECTION 2: BASE URLS & // DOUBLE-SLASH LITERALS */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#FF5E1A]" />
            <span>Rutas Base y Variantes Literales con Doble Barra</span>
          </h2>
          <span className="text-xs font-mono text-zinc-400 tabular-nums">{baseUrls.length} bases</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {baseUrls.map((b) => (
            <div
              key={b.id}
              className="rounded-xl bg-[#000000] border border-white/[0.08] p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-[11px] text-zinc-400">{b.kind}</p>
                <p className="font-mono text-xs text-white truncate">{b.value}</p>
                <p className="text-[11px] text-zinc-400 truncate">{b.note}</p>
              </div>
              <button
                type="button"
                onClick={() => onSendToDecoder(b.value)}
                className="text-xs font-semibold text-[#FF8A4C] hover:underline cursor-pointer whitespace-nowrap shrink-0"
              >
                Decodificar
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: ALL 55 LITERAL URLS (45 OWN + 10 EXTERNAL) */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white">
            Inventario Completo de URLs Literales ({filteredUrls.length} / {literalUrls.length})
          </h2>

          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Todas (${literalUrls.length})` },
                { id: 'own', label: `Propias (${literalUrls.filter((u) => u.scope === 'own').length})` },
                { id: 'external', label: `Externas (${literalUrls.filter((u) => u.scope === 'external').length})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setUrlScope(opt.id)}
                className={`min-h-9 px-3 rounded-xl text-xs font-semibold cursor-pointer tabular-nums whitespace-nowrap ${
                  urlScope === opt.id
                    ? 'bg-[#FF5E1A] text-white'
                    : 'bg-[#000000] text-zinc-400 hover:text-white border border-white/[0.08]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-white/[0.06] rounded-2xl bg-[#000000] border border-white/[0.08] px-3.5 max-h-[420px] overflow-y-auto">
          {filteredUrls.map((u) => (
            <div key={u.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0 space-y-0.5">
                <p className="font-mono text-zinc-100 truncate">{u.url}</p>
                <p className="text-[11px] text-zinc-400 truncate">
                  {u.scope === 'own' ? 'Propia' : 'Externa'} · {u.category} · {u.note}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void copyText(u.url)}
                  aria-label="Copiar URL"
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  {copiedUrl === u.url ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSendToDecoder(u.url)}
                  className="text-xs font-semibold text-[#FF8A4C] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Analizar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
