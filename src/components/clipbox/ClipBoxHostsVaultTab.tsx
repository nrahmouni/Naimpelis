import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  KeyRound,
  Loader2,
  Play,
  Search,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  ClipboxCategoryId,
  ClipboxHostEntry,
  ClipboxProbeResult,
} from './clipboxTypes';

interface ClipBoxHostsVaultTabProps {
  lang: AppLanguage;
  hosts: ClipboxHostEntry[];
  categoryCounts: Record<ClipboxCategoryId, number>;
  initialFilterQuery?: string;
  onSendToDecoder: (value: string) => void;
  onPlayCustomUrl: (url: string) => void;
}

const CATEGORY_TABS: Array<{ id: 'all' | ClipboxCategoryId; label: string }> = [
  { id: 'all', label: 'Activos' },
  { id: 'core', label: 'ClipBox Core' },
  { id: 'decoding', label: 'APIs y Keys' },
  { id: 'cinema_es', label: 'Cine ES / LAT' },
  { id: 'cinema_intl', label: 'Cine Global' },
  { id: 'anime', label: 'Anime' },
  { id: 'extractors', label: 'Extractores' },
  { id: 'subtitles', label: 'Subtítulos' },
  { id: 'sdk', label: 'SDK / Técnico' },
];

export const ClipBoxHostsVaultTab: React.FC<ClipBoxHostsVaultTabProps> = ({
  lang,
  hosts,
  categoryCounts,
  initialFilterQuery = '',
  onSendToDecoder,
  onPlayCustomUrl,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | ClipboxCategoryId>('all');
  const [searchText, setSearchText] = useState(initialFilterQuery);
  const [expandedHost, setExpandedHost] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, ClipboxProbeResult>>({});
  const [probingHost, setProbingHost] = useState<string | null>(null);
  const [batchProbing, setBatchProbing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(60);

  React.useEffect(() => {
    if (initialFilterQuery) {
      setSearchText(initialFilterQuery);
      setSelectedCategory('all');
    }
  }, [initialFilterQuery]);

  const filteredHosts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return hosts.filter((h) => {
      if (selectedCategory === 'all') {
        if (!q && h.isBoilerplate) return false;
      } else if (h.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        h.host.toLowerCase().includes(q) ||
        h.role.toLowerCase().includes(q) ||
        h.language.toLowerCase().includes(q) ||
        (h.decodedNote || '').toLowerCase().includes(q) ||
        h.urls.some((u) => u.toLowerCase().includes(q))
      );
    });
  }, [hosts, selectedCategory, searchText]);

  const displayedHosts = useMemo(
    () => filteredHosts.slice(0, visibleLimit),
    [filteredHosts, visibleLimit]
  );

  const probeSingleHost = async (host: string) => {
    triggerHaptic('light');
    setProbingHost(host);
    try {
      const res = await fetch(`/api/clipbox/probe?host=${encodeURIComponent(host)}`);
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        probe?: ClipboxProbeResult;
      } | null;
      if (json?.success && json.probe) {
        setProbes((prev) => ({ ...prev, [host]: json.probe! }));
      }
    } finally {
      setProbingHost(null);
    }
  };

  const probeVisibleBatch = async () => {
    const candidates = displayedHosts
      .filter((h) => h.probeAllowed && !probes[h.host])
      .slice(0, 12)
      .map((h) => h.host);
    if (candidates.length === 0) return;

    triggerHaptic('medium');
    setBatchProbing(true);
    try {
      const res = await fetch('/api/clipbox/probe-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hosts: candidates }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        probes?: ClipboxProbeResult[];
      } | null;
      if (json?.success && Array.isArray(json.probes)) {
        setProbes((prev) => {
          const next = { ...prev };
          for (const p of json.probes!) {
            next[p.host] = p;
            // also map original requested host if www-prefixed or stripped
            const matchingOrig = candidates.find(
              (c) => c.toLowerCase() === p.host || c.toLowerCase() === `www.${p.host}`
            );
            if (matchingOrig) next[matchingOrig] = p;
          }
          return next;
        });
      }
    } finally {
      setBatchProbing(false);
    }
  };

  const copyText = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedUrl(txt);
      window.setTimeout(() => setCopiedUrl((p) => (p === txt ? null : p)), 1600);
    } catch {
      // ignore
    }
  };

  const isPlayableUrl = (url: string) =>
    /\.(mp4|m3u8)(\?|$)|vidlink\.pro|videasy\.net|vidzee\.wtf|vixsrc\.to|vidrock\.net|vidnest\.io|moviesapi\.club|2embed\.cc|megaplay\.buzz|youtube\.com/i.test(
      url
    );

  return (
    <div className="space-y-4">
      {/* Search + Batch Probe Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setVisibleLimit(60);
            }}
            placeholder={pickLang(lang, {
              es: 'Filtrar por host, idioma, extractor o ruta (ej. enc-dec, animeflv, .sbs)...',
              ca: 'Filtrar per host, idioma, extractor o ruta...',
              en: 'Filter by host, language, extractor or URL...',
            })}
            className="w-full min-h-11 pl-10 pr-4 rounded-xl bg-[#0D0D12] border border-white/[0.1] focus:border-[#06B6D4] text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => void probeVisibleBatch()}
          disabled={batchProbing}
          className="min-h-11 px-4 rounded-xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.12] text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-60"
        >
          {batchProbing ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#22D3EE]" />
          ) : (
            <Activity className="w-4 h-4 text-[#22D3EE]" />
          )}
          <span>Comprobar estado (12)</span>
        </button>
      </div>

      {/* Category Filter Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {CATEGORY_TABS.map((cat) => {
          const count =
            cat.id === 'all'
              ? hosts.filter((h) => !h.isBoilerplate).length
              : categoryCounts[cat.id] || 0;
          const active = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedCategory(cat.id);
                setVisibleLimit(60);
              }}
              className={`min-h-11 px-3.5 rounded-xl border text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 ${
                active
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                  : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-[11px] opacity-75 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Hosts Grid */}
      <div className="space-y-2.5">
        {displayedHosts.map((h) => {
          const isOpen = expandedHost === h.host;
          const probe = probes[h.host];
          const isProbingThis = probingHost === h.host;
          return (
            <div
              key={h.host}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-white/[0.16] transition-colors overflow-hidden"
            >
              <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setExpandedHost(isOpen ? null : h.host)}
                  className="text-left min-w-0 flex-1 space-y-1 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-display font-bold text-sm sm:text-base text-white truncate">
                      {h.host}
                    </span>
                    <span className="text-[11px] font-medium text-[#22D3EE] shrink-0 tabular-nums">
                      {h.urls.length} {h.urls.length === 1 ? 'URL' : 'URLs'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-snug">
                    {h.categoryLabel} · {h.language} · {h.role}
                  </p>
                  {h.decodedNote && (
                    <p className="text-[11px] text-amber-300/90 leading-snug">
                      {h.decodedNote}
                    </p>
                  )}
                </button>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {probe && (
                    <span
                      className={`text-xs font-semibold tabular-nums px-2.5 py-1 rounded-lg ${
                        probe.ok
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {probe.ok
                        ? `${probe.status} OK · ${probe.latencyMs}ms`
                        : probe.status > 0
                        ? `HTTP ${probe.status} · ${probe.latencyMs}ms`
                        : 'Sin respuesta'}
                    </span>
                  )}

                  {h.probeAllowed && (
                    <button
                      type="button"
                      onClick={() => void probeSingleHost(h.host)}
                      disabled={isProbingThis}
                      className="min-h-11 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      {isProbingThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#22D3EE]" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-[#22D3EE]" />
                      )}
                      <span>Probar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onSendToDecoder(h.urls[0] || h.host)}
                    className="min-h-11 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>Descifrar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpandedHost(isOpen ? null : h.host)}
                    aria-label={isOpen ? 'Contraer URLs' : 'Expandir URLs'}
                    className="min-w-11 min-h-11 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] flex items-center justify-center text-zinc-300 cursor-pointer"
                  >
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-white/[0.06] bg-black/45 px-3.5 sm:px-4 py-3 space-y-2">
                  {h.urls.map((u) => (
                    <div
                      key={u}
                      className="flex items-center justify-between gap-2 text-xs text-zinc-300 py-1.5 border-b last:border-b-0 border-white/[0.04]"
                    >
                      <span className="truncate flex-1 font-mono text-[11px]">{u}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void copyText(u)}
                          className="min-h-10 min-w-10 px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-300 cursor-pointer"
                          title="Copiar URL"
                        >
                          {copiedUrl === u ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSendToDecoder(u)}
                          className="min-h-10 px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 cursor-pointer"
                        >
                          <Code2 className="w-3.5 h-3.5 text-[#A78BFA]" />
                          <span>Analizar</span>
                        </button>
                        {isPlayableUrl(u) && (
                          <button
                            type="button"
                            onClick={() => onPlayCustomUrl(u)}
                            className="min-h-10 px-3 rounded-lg bg-[#7C3AED] hover:bg-[#8B5CF6] text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Abrir</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredHosts.length > visibleLimit && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleLimit((n) => n + 80)}
            className="min-h-11 px-5 rounded-xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.12] text-xs font-semibold text-white cursor-pointer tabular-nums"
          >
            Mostrar más ({filteredHosts.length - visibleLimit} restantes)
          </button>
        </div>
      )}
    </div>
  );
};
