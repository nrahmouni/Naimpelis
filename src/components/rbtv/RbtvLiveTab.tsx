import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Code2,
  Globe,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Tv,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel, SportsMatch } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  RbtvDohResolveResult,
  RbtvHostEntry,
  RbtvLiveOverviewResponse,
  RbtvProbeResult,
} from './rbtvTypes';

interface RbtvLiveTabProps {
  lang: AppLanguage;
  externalQuery?: string;
  coreHosts: RbtvHostEntry[];
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onSendToDecoder: (input: string) => void;
}

export const RbtvLiveTab: React.FC<RbtvLiveTabProps> = ({
  lang,
  externalQuery = '',
  coreHosts,
  onPlaySportsMatch,
  onPlayTdtChannel,
  onSendToDecoder,
}) => {
  const [filterText, setFilterText] = useState(externalQuery);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<RbtvLiveOverviewResponse | null>(null);
  const [dohByDomain, setDohByDomain] = useState<Record<string, RbtvDohResolveResult>>({});
  const [resolvingDomain, setResolvingDomain] = useState<string | null>(null);

  useEffect(() => {
    if (externalQuery && externalQuery !== filterText) {
      setFilterText(externalQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rbtv/live-overview');
      const json = (await res.json().catch(() => null)) as RbtvLiveOverviewResponse | null;
      if (res.ok && json?.success) {
        setOverview(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const probeMap = useMemo(() => {
    const map = new Map<string, RbtvProbeResult>();
    for (const st of overview?.coreStatuses || []) {
      map.set(st.host.toLowerCase(), st);
    }
    return map;
  }, [overview]);

  const runDohLookup = async (domain: string) => {
    triggerHaptic('light');
    setResolvingDomain(domain);
    try {
      const res = await fetch(
        `/api/rbtv/doh-resolve?domain=${encodeURIComponent(domain)}&provider=cloudflare`
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        resolution?: RbtvDohResolveResult;
      } | null;
      if (json?.success && json.resolution) {
        setDohByDomain((prev) => ({ ...prev, [domain]: json.resolution! }));
      }
    } finally {
      setResolvingDomain(null);
    }
  };

  const q = filterText.trim().toLowerCase();

  const filteredMatches = useMemo(() => {
    const list = overview?.liveMatches || [];
    if (!q) return list;
    return list.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.competition || '').toLowerCase().includes(q) ||
        m.channels.some((c) => c.label.toLowerCase().includes(q))
    );
  }, [overview, q]);

  const filtered247 = useMemo(() => {
    const list = overview?.sports247Channels || [];
    if (!q) return list;
    return list.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.channels.some((c) => c.label.toLowerCase().includes(q))
    );
  }, [overview, q]);

  const filteredCuratedChannels = useMemo(() => {
    const list = overview?.curatedChannels || [];
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.network.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [overview, q]);

  return (
    <div className="space-y-6">
      {/* FILTER + REFRESH BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={pickLang(lang, {
              es: 'Filtrar partidos, canales 24/7 o nodos .cfd/.bond...',
              ca: 'Filtrar partits, canals 24/7 o nodes .cfd/.bond...',
              en: 'Filter matches, 24/7 channels or .cfd/.bond nodes...',
            })}
            className="w-full min-h-11 pl-10 pr-4 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-[#F59E0B]/60 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            void fetchOverview();
          }}
          disabled={loading}
          className="min-h-11 px-4 rounded-2xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-zinc-200 inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#F59E0B]" />
          ) : (
            <RefreshCw className="w-4 h-4 text-[#F59E0B]" />
          )}
          <span>
            {pickLang(lang, {
              es: 'Actualizar cluster',
              ca: 'Actualitzar clúster',
              en: 'Refresh cluster',
            })}
          </span>
        </button>
      </div>

      {/* SECTION A: LIVE SPORTS FIXTURES & 24/7 CHANNELS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#EF4444]" />
            <span>
              {pickLang(lang, {
                es: 'Señales Deportivas y Canales 24/7 en Directo',
                ca: 'Senyals Esportius i Canals 24/7 en Directe',
                en: 'Live Sports Feeds & 24/7 Channels',
              })}
            </span>
          </h2>
          <span className="text-xs text-zinc-400 tabular-nums">
            {filteredMatches.length + filtered247.length}{' '}
            {pickLang(lang, { es: 'emisiones', ca: 'emissions', en: 'streams' })}
          </span>
        </div>

        {loading && !overview ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-[#0D0D12] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : filteredMatches.length === 0 && filtered247.length === 0 ? (
          <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-5 text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Sin coincidencias directas en este filtro. Prueba otro equipo o explora los nodos del cluster abajo.',
              ca: 'Sense coincidències directes amb aquest filtre.',
              en: 'No matches for this filter. Try another query or inspect the cluster nodes below.',
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredMatches.slice(0, 12).map((match) => (
              <div
                key={match.id}
                className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-[#F59E0B]/50 p-4 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-[11px] font-semibold">
                    {match.isLive ? (
                      <span className="inline-flex items-center gap-1.5 text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        EN VIVO
                      </span>
                    ) : (
                      <span className="text-zinc-400 tabular-nums">{match.time}</span>
                    )}
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-400 truncate">{match.competition}</span>
                  </div>
                  <p className="text-sm font-bold text-white truncate">{match.title}</p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {match.channels.slice(0, 3).map((c) => c.label).join(' · ') || 'Multi-señal HD'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onPlaySportsMatch(match, 0);
                  }}
                  disabled={match.channels.length === 0}
                  className="min-h-11 px-4 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-40 active:scale-95 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}</span>
                </button>
              </div>
            ))}

            {filtered247.slice(0, 10).map((ch) => (
              <div
                key={ch.id}
                className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-emerald-500/45 p-4 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-emerald-400 shrink-0">
                    <Tv className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-bold text-white truncate">{ch.title}</p>
                    <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                      24/7 · {ch.channels.length} {ch.channels.length === 1 ? 'señal' : 'señales'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onPlaySportsMatch(ch, 0);
                  }}
                  className="min-h-11 px-4 rounded-xl bg-white/[0.07] hover:bg-[#10B981] hover:text-black text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{pickLang(lang, { es: 'Abrir', ca: 'Obrir', en: 'Open' })}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {filteredCuratedChannels.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#10B981]" />
              <span>
                {pickLang(lang, {
                  es: 'Canales Estables RBTV+ (Reproducción Directa)',
                  ca: 'Canals Estables RBTV+ (Reproducció Directa)',
                  en: 'Stable RBTV+ Channels (Direct Playback)',
                })}
              </span>
            </h2>
            <span className="text-xs text-zinc-400 tabular-nums">
              {filteredCuratedChannels.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCuratedChannels.map((ch) => (
              <div
                key={ch.id}
                className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-[#F59E0B]/45 p-3.5 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-amber-200 bg-white/[0.06] shrink-0 border border-white/10">
                    {ch.shortMark || ch.name.slice(0, 3).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-white truncate">{ch.name}</p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {ch.network} · {ch.channels.length} {ch.channels.length === 1 ? 'señal' : 'señales'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onPlayTdtChannel(ch, 0);
                  }}
                  className="min-h-11 px-3.5 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SECTION B: 10 RBTV+ CORE NODES & LIVE DOH HEALTH */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#F59E0B]" />
            <span>
              {pickLang(lang, {
                es: `Nodos Principales RBTV+ (Sección 5 · ${coreHosts.length})`,
                ca: `Nodes Principals RBTV+ (Secció 5 · ${coreHosts.length})`,
                en: `RBTV+ Core Nodes (Section 5 · ${coreHosts.length})`,
              })}
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {coreHosts.map((node) => {
            const probe = probeMap.get(node.host.toLowerCase());
            const doh = dohByDomain[node.host];
            const firstUrl = node.urls[0] || `https://${node.host}`;
            return (
              <div
                key={node.host}
                className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          probe?.ok
                            ? 'bg-emerald-400'
                            : probe && probe.status >= 400
                            ? 'bg-amber-400'
                            : probe
                            ? 'bg-red-400'
                            : 'bg-zinc-600'
                        }`}
                      />
                      <span className="text-xs sm:text-sm font-mono font-bold text-white truncate">
                        {node.host}
                      </span>
                      {probe && (
                        <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                          {probe.status > 0 ? `HTTP ${probe.status}` : 'Sin respuesta'} ·{' '}
                          {probe.latencyMs}ms
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 mt-1">{node.role}</p>
                    {node.decodedNote && (
                      <p className="text-[11px] text-zinc-400 mt-0.5">{node.decodedNote}</p>
                    )}
                  </div>
                </div>

                {doh && (
                  <div className="rounded-xl bg-black/50 border border-white/[0.06] px-3 py-2 text-[11px] font-mono text-emerald-300 space-y-0.5">
                    <div>
                      DoH ({doh.provider}) · {doh.latencyMs}ms
                    </div>
                    {doh.answers.length > 0 ? (
                      <div>
                        {doh.answers.map((a, idx) => (
                          <span key={idx} className="mr-3">
                            {a.data} (TTL {a.ttl}s)
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-amber-300">
                        {doh.error || 'Sin registros A activos (NXDOMAIN/expirado)'}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void runDohLookup(node.host)}
                    disabled={resolvingDomain === node.host}
                    className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {resolvingDomain === node.host ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#06B6D4]" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-[#06B6D4]" />
                    )}
                    <span>DoH DNS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSendToDecoder(firstUrl);
                    }}
                    className="min-h-11 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>Descifrar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
