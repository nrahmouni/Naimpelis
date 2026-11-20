import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Server,
  Tv,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel, SportsMatch } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  BelixApiEndpoint,
  BelixDynamicRoute,
  BelixLiveOverviewResponse,
  BelixXtreamInspectResult,
} from './belixTypes';

interface BelixLiveTabProps {
  lang: AppLanguage;
  externalQuery?: string;
  apiEndpoints: BelixApiEndpoint[];
  dynamicRoutes: BelixDynamicRoute[];
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onPlayCustomUrl: (url: string) => void;
  onSendToDecoder: (input: string) => void;
}

const STREAM_EXTENSIONS = ['ts', 'm3u8', 'mp4', 'mkv'] as const;

export const BelixLiveTab: React.FC<BelixLiveTabProps> = ({
  lang,
  externalQuery = '',
  apiEndpoints,
  dynamicRoutes,
  onPlaySportsMatch,
  onPlayTdtChannel,
  onPlayCustomUrl,
  onSendToDecoder,
}) => {
  const [overview, setOverview] = useState<BelixLiveOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState(externalQuery);

  // Xtream Codes interactive builder & server inspector (kept in session memory only)
  const [serverUrl, setServerUrl] = useState('https://iptv-portal.ejemplo.com:8080');
  const [username, setUsername] = useState('usuario_demo');
  const [password, setPassword] = useState('clave_demo');
  const [streamId, setStreamId] = useState('1042');
  const [ext, setExt] = useState<(typeof STREAM_EXTENSIONS)[number]>('ts');
  const [selectedEndpointIdx, setSelectedEndpointIdx] = useState(3);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<BelixXtreamInspectResult | null>(null);

  useEffect(() => {
    setFilterText(externalQuery);
  }, [externalQuery]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/belix/live-overview');
      const json = (await res.json().catch(() => null)) as BelixLiveOverviewResponse | null;
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

  const cleanOrigin = useMemo(() => {
    const raw = serverUrl.trim().replace(/\/+$/, '');
    return raw || 'https://iptv-portal.ejemplo.com:8080';
  }, [serverUrl]);

  const activeEndpoint = apiEndpoints[selectedEndpointIdx] || apiEndpoints[0];

  const builtApiUrl = useMemo(() => {
    if (!activeEndpoint) return '';
    const u = encodeURIComponent(username.trim() || 'usuario');
    const p = encodeURIComponent(password.trim() || 'clave');
    if (activeEndpoint.path.startsWith('/xmltv.php')) {
      return `${cleanOrigin}/xmltv.php?username=${u}&password=${p}`;
    }
    const base = `${cleanOrigin}/player_api.php?username=${u}&password=${p}`;
    if (activeEndpoint.action === 'auth_account_info') return base;
    let extra = `&action=${activeEndpoint.action}`;
    if (activeEndpoint.requiresCategoryId) extra += '&category_id=1';
    if (activeEndpoint.requiresStreamOrVodOrSeriesId) {
      extra += `&${activeEndpoint.requiresStreamOrVodOrSeriesId}=${encodeURIComponent(streamId.trim() || '1042')}`;
    }
    return `${base}${extra}`;
  }, [activeEndpoint, cleanOrigin, username, password, streamId]);

  const builtStreamUrls = useMemo(() => {
    const u = encodeURIComponent(username.trim() || 'usuario');
    const p = encodeURIComponent(password.trim() || 'clave');
    const id = encodeURIComponent(streamId.trim() || '1042');
    return {
      live: `${cleanOrigin}/live/${u}/${p}/${id}.${ext}`,
      movie: `${cleanOrigin}/movie/${u}/${p}/${id}.${ext}`,
      series: `${cleanOrigin}/series/${u}/${p}/${id}.${ext}`,
      playlist: `${cleanOrigin}/get.php?username=${u}&password=${p}&output=ts&type=m3u_plus`,
    };
  }, [cleanOrigin, username, password, streamId, ext]);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      triggerHaptic('light');
      window.setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1600);
    } catch {
      // ignore
    }
  };

  const handleInspectServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl.trim() || !username.trim() || !password.trim()) return;
    setInspecting(true);
    setInspection(null);
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/belix/xtream-inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: serverUrl.trim(),
          username: username.trim(),
          password: password.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { inspection?: BelixXtreamInspectResult; error?: string }
        | null;
      if (json?.inspection) {
        setInspection(json.inspection);
      } else {
        setInspection({
          ok: false,
          status: res.status,
          latencyMs: 0,
          serverOrigin: cleanOrigin,
          maskedPlaylistUrl: '',
          error: json?.error || 'No se pudo consultar el servidor Xtream.',
        });
      }
    } finally {
      setInspecting(false);
    }
  };

  const q = filterText.trim().toLowerCase();

  const filteredTdt = useMemo(() => {
    const list = overview?.featuredTdt || [];
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)
    );
  }, [overview, q]);

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

  return (
    <div className="space-y-6">
      {/* SEARCH + REFRESH BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={pickLang(lang, {
              es: 'Filtrar canales TDT, partidos o señales 24/7...',
              ca: 'Filtrar canals TDT, partits o senyals 24/7...',
              en: 'Filter DTT channels, live fixtures or 24/7 streams...',
            })}
            className="w-full min-h-11 pl-10 pr-4 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-[#F43F5E]/60 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            void fetchOverview();
          }}
          disabled={loading}
          className="min-h-11 px-4 rounded-2xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-zinc-200 inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#F43F5E]" />
          ) : (
            <RefreshCw className="w-4 h-4 text-[#F43F5E]" />
          )}
          <span>
            {pickLang(lang, {
              es: 'Actualizar directos',
              ca: 'Actualitzar directes',
              en: 'Refresh live',
            })}
          </span>
        </button>
      </div>

      {/* SECTION A: XTREAM CODES INTERACTIVE STUDIO (GetSharedInfo / APIService) */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-[#F43F5E]" />
              <span>
                {pickLang(lang, {
                  es: 'Motor Xtream Codes de Belix TV (APIService & GetSharedInfo)',
                  ca: 'Motor Xtream Codes de Belix TV (APIService i GetSharedInfo)',
                  en: 'Belix TV Xtream Codes Engine (APIService & GetSharedInfo)',
                })}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              {pickLang(lang, {
                es: 'Genera rutas reales idénticas al código Smali de com.ibopro.ultra o consulta tu propio servidor IPTV sin guardar credenciales.',
                ca: 'Genera rutes reals idèntiques al codi Smali de com.ibopro.ultra o consulta el teu propi servidor IPTV.',
                en: 'Generate exact URLs mirroring com.ibopro.ultra Smali code or test your own Xtream portal without storing credentials.',
              })}
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400 tabular-nums whitespace-nowrap shrink-0">
            {dynamicRoutes.length} rutas · {apiEndpoints.length} APIs
          </span>
        </div>

        <form onSubmit={handleInspectServer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              {pickLang(lang, { es: 'Servidor / Portal URL', ca: 'Servidor / Portal URL', en: 'Server URL' })}
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://servidor-iptv.com:8080"
              className="w-full min-h-11 px-3 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#F43F5E]/60 text-xs font-mono text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full min-h-11 px-3 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#F43F5E]/60 text-xs font-mono text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              className="w-full min-h-11 px-3 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#F43F5E]/60 text-xs font-mono text-white focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">stream_id</label>
              <input
                type="text"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                placeholder="1042"
                className="w-full min-h-11 px-3 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#F43F5E]/60 text-xs font-mono text-white tabular-nums focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">ext</label>
              <select
                value={ext}
                onChange={(e) => setExt(e.target.value as (typeof STREAM_EXTENSIONS)[number])}
                aria-label="Stream extension"
                className="min-h-11 px-2.5 rounded-xl bg-[#000000] border border-white/[0.08] text-xs font-mono text-white focus:outline-none"
              >
                {STREAM_EXTENSIONS.map((item) => (
                  <option key={item} value={item}>
                    .{item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              {pickLang(lang, { es: 'Endpoint API Retrofit', ca: 'Endpoint API Retrofit', en: 'Retrofit API Endpoint' })}
            </label>
            <select
              value={selectedEndpointIdx}
              onChange={(e) => setSelectedEndpointIdx(Number(e.target.value))}
              aria-label="Xtream endpoint"
              className="w-full min-h-11 px-3 rounded-xl bg-[#000000] border border-white/[0.08] text-xs text-white focus:outline-none"
            >
              {apiEndpoints.map((ep, idx) => (
                <option key={ep.id} value={idx}>
                  {ep.label} — {ep.path}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-2 flex items-end gap-2">
            <button
              type="submit"
              disabled={inspecting}
              className="flex-1 min-h-11 px-4 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {inspecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
              <span>
                {pickLang(lang, {
                  es: 'Consultar Portal',
                  ca: 'Consultar Portal',
                  en: 'Query Portal',
                })}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSendToDecoder(builtStreamUrls.live)}
              className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Code2 className="w-4 h-4 text-[#818CF8]" />
              <span>{pickLang(lang, { es: 'Decodificar', ca: 'Desxifrar', en: 'Decode' })}</span>
            </button>
          </div>
        </form>

        {/* GENERATED GETSHAREDINFO ROUTES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          {[
            { id: 'api', label: `API (${activeEndpoint?.action || 'player_api'})`, url: builtApiUrl, playable: false },
            { id: 'live', label: 'TV en directo (/live/...)', url: builtStreamUrls.live, playable: true },
            { id: 'movie', label: 'VOD / Película (/movie/...)', url: builtStreamUrls.movie, playable: true },
            { id: 'playlist', label: 'Playlist M3U Plus (/get.php)', url: builtStreamUrls.playlist, playable: false },
          ].map((row) => (
            <div
              key={row.id}
              className="rounded-xl bg-[#000000] border border-white/[0.08] px-3 py-2.5 flex items-center justify-between gap-2 min-w-0"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-zinc-400">{row.label}</p>
                <p className="font-mono text-[11px] text-zinc-200 truncate">{row.url}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopy(row.id, row.url)}
                  aria-label="Copiar ruta"
                  className="min-w-9 min-h-9 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 flex items-center justify-center cursor-pointer"
                >
                  {copiedId === row.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {row.playable && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onPlayCustomUrl(row.url);
                    }}
                    aria-label="Abrir stream"
                    className="min-w-9 min-h-9 rounded-lg bg-[#F43F5E]/20 hover:bg-[#F43F5E]/35 border border-[#F43F5E]/40 text-rose-200 flex items-center justify-center cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* LIVE INSPECTION RESULT */}
        {inspection && (
          <div
            className={`rounded-2xl border p-4 space-y-3 ${
              inspection.ok
                ? 'bg-emerald-500/[0.06] border-emerald-500/30'
                : 'bg-red-500/[0.06] border-red-500/30'
            }`}
          >
            {inspection.ok ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-emerald-300">
                    Xtream activo ({inspection.userStatus || 'Active'}) · {inspection.serverOrigin}
                  </span>
                  <span className="font-mono text-zinc-300 tabular-nums">
                    {inspection.latencyMs}ms · {inspection.activeConnections}/{inspection.maxConnections} conex. · Live {inspection.liveCategoriesCount} / VOD {inspection.vodCategoriesCount} / Series {inspection.seriesCategoriesCount}
                  </span>
                </div>
                {inspection.sampleLiveStreams && inspection.sampleLiveStreams.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {inspection.sampleLiveStreams.map((ch) => (
                      <button
                        key={ch.streamId}
                        type="button"
                        onClick={() => {
                          const realUrl = `${inspection.serverOrigin}/live/${encodeURIComponent(username.trim())}/${encodeURIComponent(password.trim())}/${ch.streamId}.${ext}`;
                          onPlayCustomUrl(realUrl);
                        }}
                        className="min-h-11 px-3 py-2 rounded-xl bg-[#000000] hover:bg-white/[0.06] border border-white/[0.08] text-left flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{ch.name}</p>
                          <p className="font-mono text-[10px] text-zinc-400 tabular-nums">ID {ch.streamId}</p>
                        </div>
                        <Play className="w-3.5 h-3.5 text-[#F43F5E] shrink-0 fill-current" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-start gap-2.5 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{inspection.error}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* SECTION B: RIFFANTV TDT CHANNELS READY TO PLAY */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Tv className="w-4 h-4 text-[#818CF8]" />
            <span>
              {pickLang(lang, {
                es: 'Canales TV y TDT en Directo (Listos para Ver)',
                ca: 'Canals TV i TDT en Directe (Llestos per Veure)',
                en: 'Live TV & DTT Channels (Ready to Watch)',
              })}
            </span>
          </h2>
          <span className="text-xs text-zinc-400 tabular-nums">{filteredTdt.length}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredTdt.map((ch) => (
            <div
              key={ch.id}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-[#F43F5E]/45 p-3.5 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-rose-200 bg-white/[0.06] shrink-0 border border-white/10">
                  {ch.shortMark || ch.name.slice(0, 3).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-white truncate">{ch.name}</p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {ch.network || ch.category} · {(ch.channels || []).length} señal(es)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onPlayTdtChannel(ch, 0);
                }}
                className="min-h-10 px-3.5 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION C: LIVE SPORTS & 24/7 FEEDS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#F43F5E]" />
            <span>
              {pickLang(lang, {
                es: 'Partidos y Canales 24/7 Activos',
                ca: 'Partits i Canals 24/7 Actius',
                en: 'Active Fixtures & 24/7 Feeds',
              })}
            </span>
          </h2>
          <span className="text-xs text-zinc-400 tabular-nums">
            {filteredMatches.length + filtered247.length}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredMatches.slice(0, 8).map((match) => (
            <div
              key={match.id}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-[#F43F5E]/45 p-4 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                  <span className={match.isLive ? 'text-red-400 font-bold' : 'tabular-nums'}>
                    {match.isLive ? 'EN VIVO' : match.time}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{match.competition}</span>
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
                className="min-h-11 px-4 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}</span>
              </button>
            </div>
          ))}

          {filtered247.slice(0, 6).map((ch) => (
            <div
              key={ch.id}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-emerald-500/45 p-4 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-bold text-white truncate">{ch.title}</p>
                <p className="text-[11px] text-zinc-400 truncate">
                  {ch.competition || 'Canal 24/7'} · {ch.channels.length} señal(es)
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onPlaySportsMatch(ch, 0);
                }}
                className="min-h-11 px-4 rounded-xl bg-white/[0.08] hover:bg-[#F43F5E] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{pickLang(lang, { es: 'Abrir', ca: 'Obrir', en: 'Open' })}</span>
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
