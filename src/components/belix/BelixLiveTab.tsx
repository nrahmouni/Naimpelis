import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Tv,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel, SportsMatch } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  BelixApiEndpoint,
  BelixConnectionStatus,
  BelixDynamicRoute,
  BelixLiveOverviewResponse,
  BelixReverseEngineeringUpdate,
} from './belixTypes';

interface BelixLiveTabProps {
  lang: AppLanguage;
  externalQuery?: string;
  apiEndpoints: BelixApiEndpoint[];
  dynamicRoutes: BelixDynamicRoute[];
  reverseEngineeringUpdate?: BelixReverseEngineeringUpdate;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onPlayCustomUrl?: (url: string) => void;
  onSendToDecoder: (input: string) => void;
}

export const BelixLiveTab: React.FC<BelixLiveTabProps> = ({
  lang,
  externalQuery = '',
  apiEndpoints,
  dynamicRoutes,
  reverseEngineeringUpdate,
  onPlaySportsMatch,
  onPlayTdtChannel,
}) => {
  const [overview, setOverview] = useState<BelixLiveOverviewResponse | null>(null);
  const [belixStatus, setBelixStatus] = useState<BelixConnectionStatus | null>(null);
  const [belixChannels, setBelixChannels] = useState<SpanishTdtChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState(externalQuery);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(60);

  // Default Shark Pro host & suggested credentials for quick 1-click / automatic Belix TV sync (RAM-only)
  const [serverUrl, setServerUrl] = useState('http://1.sharkpro.ink:80');
  const [username, setUsername] = useState('8996754342');
  const [password, setPassword] = useState('4228202130');
  const [connecting, setConnecting] = useState(false);
  const [refreshingBelix, setRefreshingBelix] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [autoConnectTried, setAutoConnectTried] = useState(false);
  const [backupPortals, setBackupPortals] = useState<
    Array<{ id: string; serverOrigin: string; maskedUsername: string }>
  >([]);
  const [showBackupForm, setShowBackupForm] = useState(false);
  const [bkUrl, setBkUrl] = useState('');
  const [bkUser, setBkUser] = useState('');
  const [bkPass, setBkPass] = useState('');
  const [bkStatusMsg, setBkStatusMsg] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/belix/backups');
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        backups?: Array<{ id: string; serverOrigin: string; maskedUsername: string }>;
      } | null;
      if (res.ok && json?.success && Array.isArray(json.backups)) {
        setBackupPortals(json.backups);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setFilterText(externalQuery);
  }, [externalQuery]);

  useEffect(() => {
    setVisibleLimit(60);
  }, [selectedCategoryId, filterText, onlyVerified]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/belix/live-overview');
      const json = (await res.json().catch(() => null)) as BelixLiveOverviewResponse | null;
      if (res.ok && json?.success) {
        setOverview(json);
        if (json.belixStatus) setBelixStatus(json.belixStatus);
        if (Array.isArray(json.belixChannels)) setBelixChannels(json.belixChannels);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
    void fetchBackups();
  }, [fetchOverview, fetchBackups]);

  const connectWithCredentials = useCallback(
    async (srv: string, usr: string, pwd: string) => {
      if (!srv.trim() || !usr.trim() || !pwd.trim()) {
        setConnectError(
          pickLang(lang, {
            es: 'Introduce la URL del portal Belix, tu usuario y tu contraseña.',
            ca: 'Introdueix l’URL del portal Belix, el teu usuari i la teva contrasenya.',
            en: 'Enter the Belix portal URL, your username, and your password.',
          })
        );
        return;
      }
      setConnecting(true);
      setConnectError(null);
      try {
        const res = await fetch('/api/belix/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverUrl: srv.trim(),
            username: usr.trim(),
            password: pwd.trim(),
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          status?: BelixConnectionStatus;
          channels?: SpanishTdtChannel[];
        } | null;
        if (json?.status) {
          setBelixStatus(json.status);
          if (Array.isArray(json.channels)) setBelixChannels(json.channels);
          if (!json.status.connected) {
            setConnectError(json.status.error || 'No se pudo conectar al portal Xtream.');
          } else {
            setSelectedCategoryId('all');
            window.dispatchEvent(new CustomEvent('belix-channels-synced'));
          }
        } else {
          setConnectError('No se pudo conectar con el servidor Belix TV.');
        }
      } catch {
        setConnectError('Error de red conectando con Belix TV.');
      } finally {
        setConnecting(false);
      }
    },
    [lang]
  );

  useEffect(() => {
    if (loading || autoConnectTried) return;
    if (belixStatus?.connected) {
      setAutoConnectTried(true);
      return;
    }
    setAutoConnectTried(true);
    if (serverUrl.trim() && username.trim() && password.trim()) {
      void connectWithCredentials(serverUrl, username, password);
    }
  }, [loading, autoConnectTried, belixStatus?.connected, serverUrl, username, password, connectWithCredentials]);

  // While background stability probing is active, poll stable verified channels cleanly
  useEffect(() => {
    if (!belixStatus?.connected || !belixStatus?.probing) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch('/api/belix/channels?includeAll=1');
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          status?: BelixConnectionStatus;
          channels?: SpanishTdtChannel[];
        } | null;
        if (json?.success) {
          if (json.status) setBelixStatus(json.status);
          if (Array.isArray(json.channels)) setBelixChannels(json.channels);
        }
      } catch {
        // ignore transient poll failure
      }
    }, 3500);
    return () => window.clearInterval(timer);
  }, [belixStatus?.connected, belixStatus?.probing]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('medium');
    await connectWithCredentials(serverUrl, username, password);
  };

  const handleDisconnect = async () => {
    triggerHaptic('light');
    await fetch('/api/belix/disconnect', { method: 'POST' }).catch(() => null);
    setBelixStatus({
      connected: false,
      serverOrigin: '',
      maskedUsername: '',
      totalRawStreams: 0,
      stableCount: 0,
      probing: false,
      categories: [],
    });
    setBelixChannels([]);
    setSelectedCategoryId('all');
    setConnectError(null);
    window.dispatchEvent(new CustomEvent('belix-channels-synced'));
  };

  const handleRefreshBelix = async () => {
    setRefreshingBelix(true);
    triggerHaptic('light');
    try {
      const res = await fetch('/api/belix/refresh', { method: 'POST' });
      const json = (await res.json().catch(() => null)) as {
        status?: BelixConnectionStatus;
        channels?: SpanishTdtChannel[];
      } | null;
      if (json?.status) setBelixStatus(json.status);
      if (Array.isArray(json?.channels)) setBelixChannels(json.channels);
      window.dispatchEvent(new CustomEvent('belix-channels-synced'));
    } finally {
      setRefreshingBelix(false);
    }
  };

  const q = filterText.trim().toLowerCase();

  const filteredBelixChannels = useMemo(() => {
    return belixChannels.filter((ch) => {
      const typed = ch as SpanishTdtChannel & { belixCategoryId?: string; probeOk?: boolean };
      if (onlyVerified && !typed.probeOk) return false;
      const catId = String(typed.belixCategoryId || '');
      if (selectedCategoryId !== 'all' && catId !== selectedCategoryId) return false;
      if (!q) return true;
      return (
        ch.name.toLowerCase().includes(q) ||
        (ch.network || '').toLowerCase().includes(q) ||
        (ch.description || '').toLowerCase().includes(q)
      );
    });
  }, [belixChannels, selectedCategoryId, q, onlyVerified]);

  const activeCategories = useMemo(() => {
    const list = (belixStatus?.categories || []).filter((c) => c.count > 0);
    const scoreCat = (name: string): number => {
      const lower = name.toLowerCase();
      if (/\b(es|esp|spain|espa[ñn]a|tdt|castellano)\b/i.test(lower)) return 0;
      if (/\b(deport|sport|f[uú]tbol|futbol|laliga|champions|dazn|movistar)\b/i.test(lower)) return 1;
      if (/\b(cine|pel[ií]cul|series)\b/i.test(lower)) return 2;
      return 3;
    };
    return [...list].sort((a, b) => scoreCat(a.name) - scoreCat(b.name));
  }, [belixStatus?.categories]);

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
              es: 'Filtrar canales estables Belix, TDT o deportes...',
              ca: 'Filtrar canals estables Belix, TDT o esports...',
              en: 'Filter stable Belix channels, DTT or live sports...',
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
              es: 'Actualizar',
              ca: 'Actualitzar',
              en: 'Refresh',
            })}
          </span>
        </button>
      </div>

      {/* SECTION A: XTREAM CODES SESSION (CREDENTIAL-FREE OPAQUE PROXY) */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-[#F43F5E]" />
              <span>
                {pickLang(lang, {
                  es: 'Sesión Belix TV Xtream (Shark Pro · Solo en RAM)',
                  ca: 'Sessió Belix TV Xtream (Shark Pro · Només en RAM)',
                  en: 'Belix TV Xtream Session (Shark Pro · RAM-Only)',
                })}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              {pickLang(lang, {
                es: `Host identificado: ${reverseEngineeringUpdate?.injectedEndpoint || 'http://1.sharkpro.ink:80'}. Introduce tus credenciales Xtream para verificar canales en directo sin guardarlos en disco.`,
                ca: `Host identificat: ${reverseEngineeringUpdate?.injectedEndpoint || 'http://1.sharkpro.ink:80'}. Introdueix les teves credencials Xtream per verificar canals en directe sense desar-les al disc.`,
                en: `Identified host: ${reverseEngineeringUpdate?.injectedEndpoint || 'http://1.sharkpro.ink:80'}. Enter your Xtream credentials to probe stable channels in RAM only.`,
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!belixStatus?.connected && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    setServerUrl('http://1.sharkpro.ink:80');
                    setUsername('8996754342');
                    setPassword('4228202130');
                    void connectWithCredentials('http://1.sharkpro.ink:80', '8996754342', '4228202130');
                  }}
                  disabled={connecting}
                  className="min-h-10 px-3 rounded-xl border bg-[#F43F5E]/20 border-[#F43F5E]/50 hover:bg-[#F43F5E]/30 text-white text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
                >
                  Sugerido: Conectar 8996754342
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setServerUrl('');
                    setUsername('');
                    setPassword('');
                  }}
                  className="min-h-10 px-3 rounded-xl border bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.08] text-zinc-300 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
                >
                  {pickLang(lang, { es: 'Otro servidor', ca: 'Altre servidor', en: 'Other server' })}
                </button>
              </>
            )}
            <span className="text-xs font-mono text-zinc-400 tabular-nums whitespace-nowrap">
              {dynamicRoutes.length} rutas · {apiEndpoints.length} APIs
            </span>
          </div>
        </div>

        {belixStatus?.connected ? (
          <div className="rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {belixStatus.serverOrigin} · {belixStatus.maskedUsername}
                </span>
              </div>
              <p className="text-xs text-zinc-300 tabular-nums">
                {belixChannels.length} {pickLang(lang, { es: 'canales cargados', ca: 'canals carregats', en: 'channels loaded' })}
                {` · ${belixStatus.stableCount} ${pickLang(lang, { es: 'verificados', ca: 'verificats', en: 'verified' })}`}
                {belixStatus.probing
                  ? ` · ${pickLang(lang, { es: 'Comprobando señales...', ca: 'Comprovant senyals...', en: 'Probing feeds...' })}`
                  : ''}
                {belixStatus.maxConnections
                  ? ` · ${belixStatus.activeConnections || '0'}/${belixStatus.maxConnections} conex.`
                  : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleRefreshBelix()}
                disabled={refreshingBelix}
                className="min-h-11 px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {refreshingBelix ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{pickLang(lang, { es: 'Rescanear', ca: 'Rescanejar', en: 'Rescan' })}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBackupForm((v) => !v)}
                className="min-h-11 px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Respaldo ({backupPortals.length})</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                className="min-h-11 px-3.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-semibold text-red-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{pickLang(lang, { es: 'Desconectar', ca: 'Desconnectar', en: 'Disconnect' })}</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConnect} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                {pickLang(lang, { es: 'Servidor Belix (URL)', ca: 'Servidor Belix (URL)', en: 'Belix Portal URL' })}
              </label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://1.sharkpro.ink:80"
                autoComplete="off"
                className="w-full min-h-11 px-3 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#F43F5E]/60 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                {pickLang(lang, { es: 'Usuario', ca: 'Usuari', en: 'Username' })}
              </label>
              <input
                type="text"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuario Xtream"
                autoComplete="username"
                className="w-full min-h-11 px-3 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#F43F5E]/60 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                {pickLang(lang, { es: 'Contraseña', ca: 'Contrasenya', en: 'Password' })}
              </label>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full min-h-11 px-3 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#F43F5E]/60 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={connecting}
                className="w-full min-h-11 px-4 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>
                  {pickLang(lang, {
                    es: 'Conectar Belix TV',
                    ca: 'Connectar Belix TV',
                    en: 'Connect Belix TV',
                  })}
                </span>
              </button>
            </div>
          </form>
        )}

        {connectError && (
          <div className="rounded-xl bg-red-500/[0.08] border border-red-500/30 p-3 flex items-start gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{connectError}</span>
          </div>
        )}

        {showBackupForm && belixStatus?.connected && (
          <div className="rounded-2xl bg-black/50 border border-white/[0.1] p-4 space-y-3">
            <p className="text-xs text-zinc-300">
              Añade una línea Xtream de respaldo en RAM: si la principal se satura o falla en Antena 3 / TDT, Riffan TV rota automáticamente al servidor de reserva sin cortes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="url"
                value={bkUrl}
                onChange={(e) => setBkUrl(e.target.value)}
                placeholder="http://backup-xtream:80"
                className="min-h-10 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-mono text-white"
              />
              <input
                type="text"
                value={bkUser}
                onChange={(e) => setBkUser(e.target.value)}
                placeholder="Usuario respaldo"
                className="min-h-10 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-mono text-white"
              />
              <input
                type="password"
                value={bkPass}
                onChange={(e) => setBkPass(e.target.value)}
                placeholder="Contraseña"
                className="min-h-10 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-mono text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  setBkStatusMsg(null);
                  const res = await fetch('/api/belix/backups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ serverUrl: bkUrl, username: bkUser, password: bkPass }),
                  });
                  const json = (await res.json().catch(() => null)) as {
                    success?: boolean;
                    backups?: Array<{ id: string; serverOrigin: string; maskedUsername: string }>;
                    error?: string;
                  } | null;
                  if (res.ok && json?.success && Array.isArray(json.backups)) {
                    setBackupPortals(json.backups);
                    setBkUrl('');
                    setBkUser('');
                    setBkPass('');
                    setBkStatusMsg('Línea Xtream de respaldo añadida.');
                  } else {
                    setBkStatusMsg(json?.error || 'Error añadiendo línea de respaldo.');
                  }
                }}
                className="min-h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                Añadir Respaldo
              </button>
            </div>
            {bkStatusMsg && <p className="text-xs text-emerald-300">{bkStatusMsg}</p>}
            {backupPortals.length > 0 && (
              <div className="space-y-1.5">
                {backupPortals.map((bp) => (
                  <div
                    key={bp.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs"
                  >
                    <span className="font-mono text-zinc-200 truncate">
                      {bp.serverOrigin} · {bp.maskedUsername}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch(`/api/belix/backups/${encodeURIComponent(bp.id)}`, {
                          method: 'DELETE',
                        });
                        const json = (await res.json().catch(() => null)) as {
                          backups?: Array<{ id: string; serverOrigin: string; maskedUsername: string }>;
                        } | null;
                        if (Array.isArray(json?.backups)) setBackupPortals(json.backups);
                      }}
                      className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BELIX CHANNELS GRID WHEN CONNECTED */}
        {belixStatus?.connected && (
          <div className="space-y-3 pt-1">
            {(belixStatus.warning || belixStatus.error) && (
              <div className="rounded-xl bg-amber-500/[0.08] border border-amber-500/30 p-3 flex items-start gap-2 text-xs text-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{belixStatus.error || belixStatus.warning}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-zinc-400 tabular-nums">
                {filteredBelixChannels.length} {pickLang(lang, { es: 'canales en esta vista', ca: 'canals en aquesta vista', en: 'channels in view' })}
                {activeCategories.length > 0 ? ` · ${activeCategories.length} categorías` : ''}
              </span>

              {belixStatus.stableCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyVerified((prev) => !prev)}
                  className={`min-h-9 px-3 rounded-xl text-xs font-semibold cursor-pointer transition-colors border whitespace-nowrap ${
                    onlyVerified
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                      : 'bg-black border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  {onlyVerified
                    ? `Solo verificados (${belixStatus.stableCount})`
                    : `Ver todos (${belixChannels.length})`}
                </button>
              )}
            </div>

            {activeCategories.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('all')}
                  className={`min-h-10 px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    selectedCategoryId === 'all'
                      ? 'bg-[#F43F5E] text-white'
                      : 'bg-black border border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  {pickLang(lang, { es: 'Todas', ca: 'Totes', en: 'All' })} ({belixChannels.length})
                </button>
                {activeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`min-h-10 px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      selectedCategoryId === cat.id
                        ? 'bg-[#F43F5E] text-white'
                        : 'bg-black border border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    {cat.name} ({cat.count})
                  </button>
                ))}
              </div>
            )}

            {filteredBelixChannels.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredBelixChannels.slice(0, visibleLimit).map((ch) => {
                    const isVerified = Boolean((ch as SpanishTdtChannel & { probeOk?: boolean }).probeOk);
                    return (
                      <div
                        key={ch.id}
                        className="rounded-2xl bg-[#000000] border border-white/[0.08] hover:border-[#F43F5E]/50 p-3.5 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {ch.logoUrl ? (
                            <img
                              src={ch.logoUrl}
                              alt={ch.name}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-xl object-contain bg-white/[0.06] border border-white/10 p-1 shrink-0"
                            />
                          ) : (
                            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-rose-200 bg-white/[0.06] shrink-0 border border-white/10">
                              {ch.shortMark || 'BLX'}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-white truncate">{ch.name}</p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {ch.network || 'Belix TV'} ·{' '}
                              <span className={isVerified ? 'text-emerald-400' : 'text-zinc-400'}>
                                {isVerified ? 'Verificado' : 'Directo Xtream'}
                              </span>
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('medium');
                            onPlayTdtChannel(ch, 0);
                          }}
                          className="min-h-11 px-3.5 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {filteredBelixChannels.length > visibleLimit && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((prev) => prev + 120)}
                      className="min-h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white cursor-pointer"
                    >
                      Mostrar 120 más ({filteredBelixChannels.length - visibleLimit} restantes)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleLimit(filteredBelixChannels.length)}
                      className="min-h-10 px-4 rounded-xl bg-[#F43F5E]/15 hover:bg-[#F43F5E]/25 border border-[#F43F5E]/40 text-xs font-semibold text-rose-200 cursor-pointer"
                    >
                      Listar todos ({filteredBelixChannels.length})
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 py-2">
                {belixStatus.probing
                  ? pickLang(lang, {
                      es: 'Cargando canales en segundo plano...',
                      ca: 'Carregant canals en segon pla...',
                      en: 'Loading channels in background...',
                    })
                  : pickLang(lang, {
                      es: 'No se encontraron canales reproducibles con este filtro.',
                      ca: 'No s’han trobat canals reproduïbles amb aquest filtre.',
                      en: 'No playable channels found for this filter.',
                    })}
              </p>
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
                className="min-h-11 px-3.5 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 transition-all"
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
