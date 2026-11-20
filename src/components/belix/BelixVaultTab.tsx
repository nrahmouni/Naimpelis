import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Code2,
  Copy,
  Database,
  Loader2,
  Search,
  ShieldAlert,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  BelixHostCategoryId,
  BelixHostEntry,
  BelixProbeResult,
} from './belixTypes';

interface BelixVaultTabProps {
  lang: AppLanguage;
  hosts: BelixHostEntry[];
  categoryCounts: Record<BelixHostCategoryId, number>;
  onSendToDecoder: (value: string) => void;
}

export const BelixVaultTab: React.FC<BelixVaultTabProps> = ({
  lang,
  hosts,
  categoryCounts,
  onSendToDecoder,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | BelixHostCategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [probeMap, setProbeMap] = useState<Record<string, BelixProbeResult>>({});
  const [probingHost, setProbingHost] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const filteredHosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return hosts.filter((h) => {
      if (selectedCategory !== 'all' && h.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        h.host.toLowerCase().includes(q) ||
        h.role.toLowerCase().includes(q) ||
        h.urls.some((u) => u.toLowerCase().includes(q)) ||
        h.origins.some((o) => o.toLowerCase().includes(q))
      );
    });
  }, [hosts, selectedCategory, searchQuery]);

  const probeSingle = async (host: string) => {
    setProbingHost(host);
    triggerHaptic('light');
    try {
      const res = await fetch(`/api/belix/probe?host=${encodeURIComponent(host)}`);
      const json = (await res.json().catch(() => null)) as { probe?: BelixProbeResult } | null;
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
      .slice(0, 10)
      .map((h) => h.host);
    if (candidates.length === 0) return;
    setBatchLoading(true);
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/belix/probe-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hosts: candidates }),
      });
      const json = (await res.json().catch(() => null)) as { probes?: BelixProbeResult[] } | null;
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

  const categories: Array<{ id: 'all' | BelixHostCategoryId; label: string; count: number }> = [
    { id: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }), count: hosts.length },
    { id: 'app_players', label: 'App com.ibopro.ultra', count: categoryCounts.app_players },
    { id: 'community', label: 'Telegram / Comunidad', count: categoryCounts.community },
    { id: 'streaming_specs', label: 'ExoPlayer / Local', count: categoryCounts.streaming_specs },
    { id: 'sdk_docs', label: 'SDK & Docs', count: categoryCounts.sdk_docs },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={pickLang(lang, {
                es: 'Buscar dominio, URL, t.me/shadeedtv o clase .smali...',
                ca: 'Cercar domini, URL o classe .smali...',
                en: 'Search domain, URL or .smali origin...',
              })}
              className="w-full min-h-11 pl-10 pr-4 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#F43F5E]/60 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => void probeBatchVisible()}
            disabled={batchLoading}
            className="min-h-11 px-4 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50 whitespace-nowrap"
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

      {filteredHosts.length === 0 ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-6 text-xs text-zinc-400 flex items-center gap-2">
          <Database className="w-4 h-4 text-zinc-500" />
          <span>No hay hosts con este filtro en el inventario Belix TV.</span>
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
                      {item.isAppCodeHost && (
                        <span className="text-[11px] font-semibold text-[#F43F5E]">App Code</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{item.role}</p>
                    <p className="text-[11px] text-zinc-500 tabular-nums">
                      {item.categoryLabel} · {item.urls.length} URL(s)
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.probeAllowed ? (
                      <button
                        type="button"
                        onClick={() => void probeSingle(item.host)}
                        disabled={probingHost === item.host}
                        className="min-h-9 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {probingHost === item.host ? (
                          <Loader2 className="w-3 h-3 animate-spin text-[#F43F5E]" />
                        ) : (
                          <Activity className="w-3 h-3 text-[#F43F5E]" />
                        )}
                        <span>Probar</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 px-2">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Local/Spec</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onSendToDecoder(item.urls[0] || item.host)}
                      className="min-h-9 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-[#818CF8] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Code2 className="w-3 h-3" />
                      <span>Decodificar</span>
                    </button>
                  </div>
                </div>

                {item.decodedNote && (
                  <p className="text-[11px] text-zinc-300 bg-[#000000] border border-white/[0.06] rounded-xl px-3 py-2">
                    {item.decodedNote}
                  </p>
                )}

                {probe && (
                  <div className="flex items-center justify-between text-[11px] font-mono px-3 py-1.5 rounded-lg bg-[#000000] border border-white/[0.06] tabular-nums">
                    <span className={probe.ok ? 'text-emerald-400' : 'text-red-400'}>
                      {probe.ok ? 'OK' : 'BLOQUEADO / ERR'} · HTTP {probe.status}
                    </span>
                    <span className="text-zinc-400">{probe.latencyMs}ms</span>
                  </div>
                )}

                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {item.urls.map((u) => (
                    <div
                      key={u}
                      className="flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-300 bg-[#000000]/80 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="truncate">{u}</span>
                      <button
                        type="button"
                        onClick={() => void copyText(u)}
                        aria-label="Copiar URL"
                        className="text-zinc-400 hover:text-white shrink-0 cursor-pointer"
                      >
                        {copiedUrl === u ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {item.origins.length > 0 && (
                  <p className="text-[10px] font-mono text-zinc-500 break-all">
                    Smali: {item.origins.join(' · ')}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
