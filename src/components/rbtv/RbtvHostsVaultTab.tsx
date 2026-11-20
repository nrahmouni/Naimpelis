import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  FileCode2,
  Loader2,
  Search,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type { RbtvCategoryId, RbtvHostEntry, RbtvProbeResult } from './rbtvTypes';

interface RbtvHostsVaultTabProps {
  lang: AppLanguage;
  hosts: RbtvHostEntry[];
  categoryCounts: Record<RbtvCategoryId, number>;
  initialFilterQuery?: string;
  onSendToDecoder: (value: string) => void;
}

const CATEGORY_TABS: Array<{ id: 'all' | RbtvCategoryId; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'core', label: 'RBTV+ Core' },
  { id: 'doh', label: 'Resolvers DoH' },
  { id: 'streaming_specs', label: 'P2P / ExoPlayer' },
  { id: 'sdk', label: 'SDK y Enlaces' },
];

export const RbtvHostsVaultTab: React.FC<RbtvHostsVaultTabProps> = ({
  lang,
  hosts,
  categoryCounts,
  initialFilterQuery = '',
  onSendToDecoder,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | RbtvCategoryId>('all');
  const [searchText, setSearchText] = useState(initialFilterQuery);
  const [expandedHost, setExpandedHost] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, RbtvProbeResult>>({});
  const [probingHost, setProbingHost] = useState<string | null>(null);
  const [batchProbing, setBatchProbing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (initialFilterQuery) {
      setSearchText(initialFilterQuery);
      setSelectedCategory('all');
    }
  }, [initialFilterQuery]);

  const filteredHosts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return hosts.filter((h) => {
      if (selectedCategory !== 'all' && h.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        h.host.toLowerCase().includes(q) ||
        h.role.toLowerCase().includes(q) ||
        (h.decodedNote || '').toLowerCase().includes(q) ||
        h.urls.some((u) => u.toLowerCase().includes(q)) ||
        h.urlItems.some((u) => u.references.some((r) => r.toLowerCase().includes(q)))
      );
    });
  }, [hosts, selectedCategory, searchText]);

  const probeSingleHost = async (host: string) => {
    triggerHaptic('light');
    setProbingHost(host);
    try {
      const res = await fetch(`/api/rbtv/probe?host=${encodeURIComponent(host)}`);
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        probe?: RbtvProbeResult;
      } | null;
      if (json?.success && json.probe) {
        setProbes((prev) => ({ ...prev, [host]: json.probe! }));
      }
    } finally {
      setProbingHost(null);
    }
  };

  const probeVisibleBatch = async () => {
    const candidates = filteredHosts
      .filter((h) => h.probeAllowed)
      .slice(0, 12)
      .map((h) => h.host);
    if (candidates.length === 0) return;
    triggerHaptic('medium');
    setBatchProbing(true);
    try {
      const res = await fetch('/api/rbtv/probe-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hosts: candidates }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        probes?: RbtvProbeResult[];
      } | null;
      if (json?.success && Array.isArray(json.probes)) {
        const next: Record<string, RbtvProbeResult> = {};
        for (const p of json.probes) {
          const matchedHost =
            candidates.find((c) => c.toLowerCase() === p.host.toLowerCase()) || p.host;
          next[matchedHost] = p;
        }
        setProbes((prev) => ({ ...prev, ...next }));
      }
    } finally {
      setBatchProbing(false);
    }
  };

  const copyText = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      triggerHaptic('light');
      window.setTimeout(() => setCopiedUrl((c) => (c === url ? null : c)), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      {/* CATEGORY FILTER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={pickLang(lang, {
              es: 'Filtrar por host, clase Java/Smali (ParamsManager, FallbackDns, AbsProxy)...',
              ca: 'Filtrar per host o classe Java/Smali...',
              en: 'Filter by host, URL or Java/Smali reference...',
            })}
            className="w-full min-h-11 pl-10 pr-4 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-[#F59E0B]/60 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => void probeVisibleBatch()}
          disabled={batchProbing}
          className="min-h-11 px-4 rounded-2xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
        >
          {batchProbing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Activity className="w-4 h-4" />
          )}
          <span>
            {pickLang(lang, {
              es: 'Comprobar 12 visibles',
              ca: 'Comprovar 12 visibles',
              en: 'Probe 12 visible',
            })}
          </span>
        </button>
      </div>

      {/* CATEGORIES */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {CATEGORY_TABS.map((cat) => {
          const count = cat.id === 'all' ? hosts.length : categoryCounts[cat.id] || 0;
          const active = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedCategory(cat.id);
              }}
              className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all tabular-nums ${
                active
                  ? 'bg-[#F59E0B] text-black shadow-[0_6px_18px_rgba(245,158,11,0.3)]'
                  : 'bg-[#0D0D12] text-zinc-300 border border-white/[0.08] hover:border-white/25 hover:text-white'
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* HOSTS LIST WITH FULL JAVA/SMALI PROVENANCE */}
      <div className="space-y-2.5">
        {filteredHosts.map((h) => {
          const probe = probes[h.host];
          const isExpanded = expandedHost === h.host;
          return (
            <div
              key={h.host}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-white/20 p-4 space-y-2.5 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono font-bold text-white truncate">
                      {h.host}
                    </span>
                    <span className="text-[11px] font-medium text-[#FBBF24]">
                      {h.categoryLabel}
                    </span>
                    {probe && (
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          probe.ok ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {probe.status > 0 ? `HTTP ${probe.status}` : 'Error'} · {probe.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-300">{h.role}</p>
                  {h.decodedNote && (
                    <p className="text-[11px] text-emerald-300/90">{h.decodedNote}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {h.probeAllowed && (
                    <button
                      type="button"
                      onClick={() => void probeSingleHost(h.host)}
                      disabled={probingHost === h.host}
                      className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {probingHost === h.host ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#06B6D4]" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-[#06B6D4]" />
                      )}
                      <span>Probar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onSendToDecoder(h.urls[0] || h.host)}
                    className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>Descifrar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpandedHost(isExpanded ? null : h.host)}
                    className="min-h-10 px-3 rounded-xl bg-black/50 border border-white/[0.08] text-xs font-semibold text-zinc-300 inline-flex items-center gap-1 cursor-pointer tabular-nums"
                  >
                    <span>
                      {h.urlItems.length} {h.urlItems.length === 1 ? 'URL' : 'URLs'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="pt-2 border-t border-white/[0.06] space-y-2">
                  {h.urlItems.map((item) => (
                    <div
                      key={item.url}
                      className="rounded-xl bg-black/50 border border-white/[0.06] p-3 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-mono text-zinc-100 break-all">{item.url}</p>
                        <button
                          type="button"
                          onClick={() => void copyText(item.url)}
                          aria-label="Copiar URL"
                          className="min-w-9 min-h-9 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
                        >
                          {copiedUrl === item.url ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      {item.references.length > 0 && (
                        <div className="flex items-start gap-1.5 text-[11px] font-mono text-zinc-400">
                          <FileCode2 className="w-3.5 h-3.5 text-[#A78BFA] shrink-0 mt-0.5" />
                          <span className="break-all">{item.references.join(' · ')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
