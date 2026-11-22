import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  ArrowLeft,
  Cpu,
  Database,
  Download,
  Lock,
  Music2,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
  Tv,
  Users,
  Zap,
} from 'lucide-react';
import type { AdminOverviewSnapshot, AdminTabId } from './adminConsoleTypes';
import {
  formatBytesCompact,
  formatTimeShort,
  formatUptime,
  StatusLabel,
  TelemetryTrendChart,
} from './AdminChartsAndMetrics';

interface AdminConsolePageProps {
  authUser: User | null;
  onGoogleSignIn: () => Promise<void>;
  onExitAdmin: () => void;
}

interface AuthStatusResponse {
  ok: boolean;
  firebaseGoogleEnabled: boolean;
  passcodeConfiguredByEnv: boolean;
  firstRunClaimRequired: boolean;
  passcodeClaimed: boolean;
}

const ADMIN_TABS: Array<{ id: AdminTabId; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Arquitectura y Sistema', icon: <Server className="w-4 h-4" /> },
  { id: 'platforms', label: 'Google TV, Android y PWA', icon: <Tv className="w-4 h-4" /> },
  { id: 'channels', label: 'IPTV, Canales y Media', icon: <Radio className="w-4 h-4" /> },
  { id: 'content_ai', label: 'Fútbol, VOD, Music e IA', icon: <Music2 className="w-4 h-4" /> },
  { id: 'rooms_logs', label: 'Salas, Auditoría y Logs', icon: <Users className="w-4 h-4" /> },
  { id: 'traceability', label: 'Trazabilidad Fases', icon: <ShieldCheck className="w-4 h-4" /> },
];

export const AdminConsolePage: React.FC<AdminConsolePageProps> = ({
  authUser,
  onGoogleSignIn,
  onExitAdmin,
}) => {
  // Bearer token held strictly in React memory (never localStorage/sessionStorage)
  const [adminToken, setAdminToken] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [claimPasscodeInput, setClaimPasscodeInput] = useState<string>('');

  const [activeTab, setActiveTab] = useState<AdminTabId>('overview');
  const [snapshot, setSnapshot] = useState<AdminOverviewSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState<boolean>(false);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [logSeverityFilter, setLogSeverityFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');

  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetch('/api/admin/auth/status')
      .then((r) => r.json())
      .then((d: AuthStatusResponse) => setAuthStatus(d))
      .catch(() => setAuthStatus(null));
  }, []);

  const authenticateWithFirebaseUser = useCallback(async (user: User) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/auth/firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.token) {
        setAuthError(data?.error || 'No autorizado para administración.');
        return;
      }
      setAdminToken(data.token);
      setAdminEmail(data.claims?.email || user.email || 'Admin');
    } catch {
      setAuthError('Error al verificar sesión Google en el servidor.');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/admin/auth/passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.token) {
        setAuthError(data?.error || 'Clave incorrecta.');
        return;
      }
      setAdminToken(data.token);
      setAdminEmail(data.claims?.email || 'Admin');
      setPasscodeInput('');
    } catch {
      setAuthError('Error de conexión al validar clave.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/admin/auth/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode: claimPasscodeInput,
          label: authUser?.email || 'owner-admin',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.token) {
        setAuthError(data?.error || 'No se pudo configurar la clave inicial.');
        return;
      }
      setAdminToken(data.token);
      setAdminEmail(data.claims?.email || 'Admin');
      setClaimPasscodeInput('');
    } catch {
      setAuthError('Error de red al configurar clave admin.');
    } finally {
      setAuthBusy(false);
    }
  };

  const fetchOverviewOnce = useCallback(async (token: string) => {
    if (!token) return;
    setLoadingSnapshot(true);
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setAdminToken('');
        setAuthError('Tu sesión admin ha expirado.');
        return;
      }
      const data = (await res.json()) as AdminOverviewSnapshot & { ok?: boolean };
      if (res.ok && data?.ok) {
        setSnapshot(data);
      }
    } catch {
      // handled gracefully
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  // Authenticated SSE stream via fetch ReadableStream (keeps Bearer token strictly out of URLs)
  useEffect(() => {
    if (!adminToken) return;
    void fetchOverviewOnce(adminToken);

    const ctrl = new AbortController();
    streamAbortRef.current = ctrl;
    let active = true;

    const connectSse = async () => {
      try {
        const res = await fetch('/api/admin/stream', {
          headers: { Authorization: `Bearer ${adminToken}` },
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          setSseConnected(false);
          return;
        }
        setSseConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const lines = frame.split('\n');
            let evName = '';
            let dataLine = '';
            for (const line of lines) {
              if (line.startsWith('event:')) evName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
            }
            if (evName === 'admin:telemetry' && dataLine) {
              try {
                const parsed = JSON.parse(dataLine) as AdminOverviewSnapshot;
                setSnapshot(parsed);
              } catch {
                // ignore malformed frame
              }
            }
          }
        }
      } catch {
        // abort or transient reconnect
      } finally {
        if (active) setSseConnected(false);
      }
    };

    void connectSse();
    return () => {
      active = false;
      ctrl.abort();
      setSseConnected(false);
    };
  }, [adminToken, fetchOverviewOnce]);

  const runAdminAction = async (
    actionKey: 'probe-channels' | 'refresh-catalog' | 'cleanup-dvb' | 'clear-caches',
    label: string
  ) => {
    if (!adminToken || busyAction) return;
    setBusyAction(actionKey);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/actions/${actionKey}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setActionFeedback(data?.error || `Error al ejecutar: ${label}`);
      } else {
        setActionFeedback(`Completado: ${label}`);
        await fetchOverviewOnce(adminToken);
      }
    } catch {
      setActionFeedback(`Error de red en: ${label}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportSnapshotJson = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riffantv-admin-telemetry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredProblemTracks = useMemo(() => {
    const list = snapshot?.verticals.iptvAndChannels.problemTracks || [];
    const q = channelFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.url.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        (t.videoCodec || '').toLowerCase().includes(q)
    );
  }, [snapshot, channelFilter]);

  const filteredRuntimeEvents = useMemo(() => {
    const list = snapshot?.runtimeEvents || [];
    if (logSeverityFilter === 'all') return list;
    return list.filter((e) => e.severity === logSeverityFilter);
  }, [snapshot, logSeverityFilter]);

  if (!adminToken) {
    return (
      <div className="min-h-[100dvh] bg-[#090A0F] text-zinc-100 flex flex-col">
        <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-white/10">
          <span className="text-base font-semibold tracking-tight whitespace-nowrap shrink-0">
            RiffanTV Console
          </span>
          <button
            type="button"
            onClick={onExitAdmin}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-white/15 hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a RiffanTV
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md border border-white/10 bg-[#10121A] rounded-xl p-6 space-y-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-violet-300 text-xs font-medium">
                <Lock className="w-4 h-4" />
                <span>Acceso restringido</span>
              </div>
              <h1 className="text-xl font-semibold text-white">Panel de Administración y Telemetría</h1>
              <p className="text-sm text-zinc-400">
                Supervisa latencia, salud de canales, vertientes Android/Google TV/PWA y acciones operativas en tiempo real.
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
                {authError}
              </div>
            )}

            <div className="space-y-3">
              {authUser ? (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void authenticateWithFirebaseUser(authUser)}
                  className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {authBusy ? 'Verificando...' : `Entrar con Google (${authUser.email || authUser.displayName})`}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void onGoogleSignIn()}
                  className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Iniciar sesión con Google Admin
                </button>
              )}
            </div>

            <div className="border-t border-white/10 pt-5 space-y-3">
              {authStatus?.firstRunClaimRequired ? (
                <form onSubmit={handleClaimSubmit} className="space-y-3">
                  <div className="text-xs text-zinc-300 font-medium">
                    Configuración inicial: establece la clave de administrador del servidor
                  </div>
                  <input
                    type="password"
                    minLength={8}
                    required
                    value={claimPasscodeInput}
                    onChange={(e) => setClaimPasscodeInput(e.target.value)}
                    placeholder="Nueva clave admin (mín. 8 caracteres)"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-[#090A0F] border border-white/15 text-white focus:outline-none focus:border-violet-500"
                  />
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full py-2 px-4 rounded-lg border border-white/15 hover:bg-white/5 text-sm font-medium text-zinc-200 transition-colors"
                  >
                    Guardar clave y entrar
                  </button>
                </form>
              ) : (
                <form onSubmit={handlePasscodeSubmit} className="space-y-3">
                  <div className="text-xs text-zinc-400">O accede con clave de administrador</div>
                  <input
                    type="password"
                    required
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder="Clave de administrador"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-[#090A0F] border border-white/15 text-white focus:outline-none focus:border-violet-500"
                  />
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full py-2 px-4 rounded-lg border border-white/15 hover:bg-white/5 text-sm font-medium text-zinc-200 transition-colors"
                  >
                    Validar clave
                  </button>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const cp = snapshot?.architecture.controlPlane;
  const mp = snapshot?.architecture.mediaPlane;
  const ch = snapshot?.verticals.iptvAndChannels;

  return (
    <div className="min-h-[100dvh] bg-[#090A0F] text-zinc-100 flex flex-col lg:flex-row">
      {/* Left Navigation Sidebar */}
      <aside className="w-full lg:w-[260px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0C0D13] flex flex-col justify-between">
        <div>
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <span className="text-base font-semibold tracking-tight text-white whitespace-nowrap">
              RiffanTV Admin
            </span>
            <button
              type="button"
              onClick={onExitAdmin}
              className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              App
            </button>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {ADMIN_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 text-left ${
                    active
                      ? 'bg-violet-600/20 text-violet-200 border border-violet-500/30'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block p-4 border-t border-white/10 space-y-2 text-xs text-zinc-400">
          <div className="flex items-center justify-between">
            <span>Operador</span>
            <span className="text-zinc-200 truncate max-w-[140px]">{adminEmail}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Stream SSE</span>
            <StatusLabel state={sseConnected ? 'up' : 'degraded'} text={sseConnected ? 'Conectado' : 'Reconectando'} />
          </div>
          <div className="flex items-center justify-between">
            <span>Versión</span>
            <span className="font-mono text-zinc-200 tabular-nums">{snapshot?.version || '3.2.0'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-[#0B0C11]">
          <div className="text-sm text-zinc-400 flex items-center gap-2 whitespace-nowrap">
            <span>Admin</span>
            <span aria-hidden="true">/</span>
            <span className="text-white font-medium">
              {ADMIN_TABS.find((t) => t.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void fetchOverviewOnce(adminToken)}
              disabled={loadingSnapshot}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSnapshot ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={handleExportSnapshotJson}
              disabled={!snapshot}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar JSON
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6 max-w-[1440px]">
          {actionFeedback && (
            <div className="px-4 py-2.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-xs text-violet-200 flex items-center justify-between">
              <span>{actionFeedback}</span>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-zinc-400 hover:text-white ml-4"
              >
                Cerrar
              </button>
            </div>
          )}

          {!snapshot ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 rounded-lg border border-white/10 bg-[#10121A] animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Top KPI Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-xs text-zinc-400 flex items-center justify-between">
                        <span>Event Loop p95</span>
                        <Activity className="w-3.5 h-3.5 text-zinc-500" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-white">
                        {cp?.eventLoop.p95Ms ?? 0} ms
                      </div>
                      <div className="mt-1 text-xs text-zinc-400 tabular-nums">
                        Max {cp?.eventLoop.maxMs ?? 0} ms · HTTP {cp?.http.avgLatencyMs ?? 0} ms
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-xs text-zinc-400 flex items-center justify-between">
                        <span>Memoria y CPU</span>
                        <Cpu className="w-3.5 h-3.5 text-zinc-500" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-white">
                        {cp?.memory.rssMb ?? 0} MB
                      </div>
                      <div className="mt-1 text-xs text-zinc-400 tabular-nums">
                        CPU {cp?.cpuPercent ?? 0}% ({cp?.cpuCores} cores) · Heap {cp?.memory.heapUsedMb} MB
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-xs text-zinc-400 flex items-center justify-between">
                        <span>Canales en Salud</span>
                        <Radio className="w-3.5 h-3.5 text-zinc-500" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-white">
                        {ch?.healthSummary.counts.up ?? 0} / {ch?.healthSummary.totalTracked ?? 0}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400 tabular-nums">
                        Degradados {ch?.healthSummary.counts.degraded ?? 0} · Caídos {ch?.healthSummary.counts.down ?? 0}
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-xs text-zinc-400 flex items-center justify-between">
                        <span>Persistencia y Tiempo Activo</span>
                        <Database className="w-3.5 h-3.5 text-zinc-500" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-white">
                        {formatUptime(cp?.uptimeSec ?? 0)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        Driver: {snapshot.architecture.storage.activeDriver}
                      </div>
                    </div>
                  </div>

                  {/* Quick Operations */}
                  <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg border border-white/10 bg-[#10121A]">
                    <span className="text-xs font-medium text-zinc-300 mr-2">Acciones operativas:</span>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => void runAdminAction('probe-channels', 'Sonda completa IPTV y Deportes')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium whitespace-nowrap"
                    >
                      <Zap className="w-3.5 h-3.5 text-violet-300" />
                      {busyAction === 'probe-channels' ? 'Sondeando...' : 'Sondar Canales Ahora'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => void runAdminAction('refresh-catalog', 'Refresco de Catálogo y Fútbol')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-sky-300" />
                      {busyAction === 'refresh-catalog' ? 'Refrescando...' : 'Refrescar Catálogos y Fútbol'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => void runAdminAction('cleanup-dvb', 'Limpieza FFmpeg DVB')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-amber-300" />
                      Cerrar Sesiones DVB ({mp?.activeDvbSessions ?? 0})
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => void runAdminAction('clear-caches', 'Purgar cachés volátiles')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                      Limpiar Cachés IA/VOD
                    </button>
                  </div>

                  {/* Live Chart */}
                  <TelemetryTrendChart history={snapshot.latencyHistory} />

                  {/* Architecture Planes Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="font-semibold text-white">Plano Media & Streaming</div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Modo</span>
                        <span className="font-mono text-zinc-200">{mp?.deploymentMode}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Direct-Play Eligible</span>
                        <span className="font-mono text-zinc-200 tabular-nums">{mp?.directPlayEligiblePct}%</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Transporte Nativo vs curl</span>
                        <span className="font-mono text-zinc-200 tabular-nums">{mp?.nativeTransportPct}%</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Volumen Proxyado</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {formatBytesCompact(mp?.metrics.totalBytesProxied || 0)}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="font-semibold text-white">Worker & Push en Tiempo Real</div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Worker Aislado</span>
                        <span className="font-mono text-zinc-200">{snapshot.architecture.worker.mode}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Barridos completados</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.architecture.worker.sweepsCompleted}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Clientes SSE Push</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.architecture.sse.publicSseClients} pub · {snapshot.architecture.sse.adminSseClients} admin
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Pub/Sub Nodo</span>
                        <span className="font-mono text-zinc-200">{snapshot.architecture.pubSub.nodeId}</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="font-semibold text-white">Salas & Clientes Live</div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Salas activas</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.verticals.watchParty.roomsCount}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Clientes WebSocket</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.verticals.watchParty.connectedClientsCount}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Muestras QoE Vídeo</span>
                        <span className="font-mono text-zinc-200 tabular-nums">{snapshot.qoe.totalSamples}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Muestras Web Vitals</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.clientVitals.totalSamples}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Service Mesh Table */}
                  <div className="border border-white/10 rounded-lg bg-[#10121A] overflow-x-auto">
                    <div className="px-4 py-3 border-b border-white/10 text-sm font-medium text-white">
                      Malla de Servicios Internos (8 Dominios)
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="text-zinc-400 border-b border-white/10">
                        <tr>
                          <th className="py-2.5 px-4 font-medium">Servicio</th>
                          <th className="py-2.5 px-4 font-medium">Estado</th>
                          <th className="py-2.5 px-4 font-medium text-right">Peticiones</th>
                          <th className="py-2.5 px-4 font-medium text-right">Errores 5xx</th>
                          <th className="py-2.5 px-4 font-medium text-right">Latencia Media</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {snapshot.architecture.servicesMesh.map((svc) => (
                          <tr key={svc.id} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-4 text-zinc-200 font-medium">{svc.name}</td>
                            <td className="py-2.5 px-4">
                              <StatusLabel state={svc.status} />
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-300">
                              {svc.requestsTotal}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-300">
                              {svc.errorsTotal}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-300">
                              {svc.avgLatencyMs} ms
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'platforms' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="flex items-center justify-between text-white font-semibold">
                        <span>RiffanTV Web & PWA</span>
                        <StatusLabel state={snapshot.verticals.riffanTvWeb.status === 'healthy' ? 'up' : 'degraded'} />
                      </div>
                      <div className="text-zinc-400">
                        Requests: <span className="font-mono text-zinc-200 tabular-nums">{snapshot.verticals.riffanTvWeb.httpRequests}</span> · Latencia: <span className="font-mono text-zinc-200 tabular-nums">{snapshot.verticals.riffanTvWeb.avgLatencyMs} ms</span>
                      </div>
                      <div className="text-zinc-400">
                        QoE Arranque p50: <span className="font-mono text-zinc-200 tabular-nums">{snapshot.verticals.riffanTvWeb.qoe?.p50StartupMs ?? 0} ms</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="flex items-center justify-between text-white font-semibold">
                        <span>Google TV & /tv</span>
                        <Tv className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div className="font-mono text-zinc-300">{snapshot.verticals.googleTv.packageName}</div>
                      <div className="text-zinc-400 tabular-nums">
                        v{snapshot.verticals.googleTv.versionName} (code {snapshot.verticals.googleTv.versionCode}) · Ruta {snapshot.verticals.googleTv.receiverRoute}
                      </div>
                      <div className="text-zinc-400 tabular-nums">
                        QoE muestras: {snapshot.verticals.googleTv.qoe?.count ?? 0}
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="flex items-center justify-between text-white font-semibold">
                        <span>Android Mobile APK</span>
                        <Smartphone className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div className="font-mono text-zinc-300">{snapshot.verticals.androidMobile.packageName}</div>
                      <div className="text-zinc-400 tabular-nums">
                        v{snapshot.verticals.androidMobile.versionName} (code {snapshot.verticals.androidMobile.versionCode})
                      </div>
                      <div className="text-zinc-400 tabular-nums">
                        QoE muestras: {snapshot.verticals.androidMobile.qoe?.count ?? 0}
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="flex items-center justify-between text-white font-semibold">
                        <span>Riffan Music APK / PWA</span>
                        <Music2 className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div className="font-mono text-zinc-300">{snapshot.verticals.riffanMusic.packageName}</div>
                      <div className="text-zinc-400 tabular-nums">
                        v{snapshot.verticals.riffanMusic.versionName} (code {snapshot.verticals.riffanMusic.versionCode})
                      </div>
                      <div className="text-zinc-400 tabular-nums">
                        Stream Proxy Audio: {snapshot.verticals.riffanMusic.musicProxyRequests}
                      </div>
                    </div>
                  </div>

                  {/* Client Web Vitals & QoE Table */}
                  <div className="border border-white/10 rounded-lg bg-[#10121A] overflow-x-auto">
                    <div className="px-4 py-3 border-b border-white/10 text-sm font-medium text-white">
                      Telemetría Real por Plataforma (Web Vitals y Arranque de Reproductor)
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="text-zinc-400 border-b border-white/10">
                        <tr>
                          <th className="py-2.5 px-4 font-medium">Plataforma</th>
                          <th className="py-2.5 px-4 font-medium text-right">Muestras Vitals</th>
                          <th className="py-2.5 px-4 font-medium text-right">TTFB Medio</th>
                          <th className="py-2.5 px-4 font-medium text-right">FCP Medio</th>
                          <th className="py-2.5 px-4 font-medium text-right">PWA Standalone</th>
                          <th className="py-2.5 px-4 font-medium text-right">QoE Vídeo p50</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {Object.keys(snapshot.clientVitals.byPlatform).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 px-4 text-center text-zinc-400">
                              Aún no se han recibido beacons de Web Vitals en esta sesión del servidor. Navega por la app para registrar muestras reales.
                            </td>
                          </tr>
                        ) : (
                          Object.entries(snapshot.clientVitals.byPlatform).map(([plat, v]) => (
                            <tr key={plat} className="hover:bg-white/[0.02]">
                              <td className="py-2.5 px-4 font-medium text-zinc-200">{plat}</td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">{v.count}</td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">{v.avgTtfbMs} ms</td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">{v.avgFcpMs} ms</td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">{v.pwaCount}</td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                                {snapshot.qoe.byPlatform[plat]?.p50StartupMs ?? 0} ms
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'channels' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-zinc-400">TDT España</div>
                      <div className="mt-1 text-xl font-mono font-semibold tabular-nums">{ch?.tdtChannelsCount}</div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-zinc-400">Canales Català</div>
                      <div className="mt-1 text-xl font-mono font-semibold tabular-nums">{ch?.catalaChannelsCount}</div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-zinc-400">Belix / RBTV</div>
                      <div className="mt-1 text-xl font-mono font-semibold tabular-nums">
                        {(ch?.belixChannelsCount || 0) + (ch?.rbtvChannelsCount || 0)}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-zinc-400">World IPTV</div>
                      <div className="mt-1 text-xl font-mono font-semibold tabular-nums">{ch?.worldChannelsCount}</div>
                    </div>
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A]">
                      <div className="text-zinc-400">HLS / TS Proxy Req</div>
                      <div className="mt-1 text-xl font-mono font-semibold tabular-nums">
                        {(mp?.metrics.hlsRequests || 0) + (mp?.metrics.tsRequests || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="border border-white/10 rounded-lg bg-[#10121A]">
                    <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">
                        Señales Degradadas, Caídas o Solo-Audio ({filteredProblemTracks.length})
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="search"
                          value={channelFilter}
                          onChange={(e) => setChannelFilter(e.target.value)}
                          placeholder="Filtrar URL o codec..."
                          className="px-3 py-1.5 text-xs rounded-lg bg-[#090A0F] border border-white/15 text-white focus:outline-none focus:border-violet-500"
                        />
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => void runAdminAction('probe-channels', 'Sonda completa IPTV')}
                          className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium whitespace-nowrap"
                        >
                          Sondar Canales
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-zinc-400 border-b border-white/10">
                          <tr>
                            <th className="py-2.5 px-4 font-medium">Stream URL</th>
                            <th className="py-2.5 px-4 font-medium">Estado</th>
                            <th className="py-2.5 px-4 font-medium">Codecs</th>
                            <th className="py-2.5 px-4 font-medium text-right">Latencia</th>
                            <th className="py-2.5 px-4 font-medium text-right">Fallos</th>
                            <th className="py-2.5 px-4 font-medium text-right">Último Check</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredProblemTracks.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 px-4 text-center text-zinc-400">
                                Sin tracks caídos o degradados registrados en la última sonda.
                              </td>
                            </tr>
                          ) : (
                            filteredProblemTracks.map((t) => (
                              <tr key={t.url} className="hover:bg-white/[0.02]">
                                <td className="py-2.5 px-4 font-mono text-zinc-300 max-w-[360px] truncate" title={t.url}>
                                  {t.url}
                                </td>
                                <td className="py-2.5 px-4">
                                  <StatusLabel
                                    state={t.status === 'down' ? 'down' : 'degraded'}
                                    text={t.audioOnly ? 'Solo Audio' : t.status.toUpperCase()}
                                  />
                                </td>
                                <td className="py-2.5 px-4 font-mono text-zinc-400">
                                  {[t.videoCodec, t.audioCodec].filter(Boolean).join(' / ') || '—'}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-300">
                                  {t.latencyMs ? `${t.latencyMs} ms` : '—'}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-300">
                                  {t.failCount || 0}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-400">
                                  {t.checkedAt ? formatTimeShort(t.checkedAt) : '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'content_ai' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="font-semibold text-white">Fútbol y Agenda 24/7</div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Partidos en tablero</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.verticals.sportsAndFootball.cachedMatchesCount}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Eventos agenda live</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.verticals.sportsAndFootball.liveAgendaCount}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Última actualización</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {formatTimeShort(snapshot.verticals.sportsAndFootball.lastBoardRefreshAt)}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="font-semibold text-white">Índice VOD y Catálogos</div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Scheduler activo</span>
                        <StatusLabel
                          state={snapshot.verticals.vodCatalog.schedulerRunning ? 'up' : 'unknown'}
                          text={snapshot.verticals.vodCatalog.schedulerRunning ? 'Activo' : 'Detenido'}
                        />
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Títulos indexados</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.verticals.vodCatalog.totalIndexed}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Último ciclo</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.verticals.vodCatalog.lastCycle
                            ? `${snapshot.verticals.vodCatalog.lastCycle.durationMs} ms`
                            : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                      <div className="font-semibold text-white">Motor IA Gemini & Fallback</div>
                      <div className="flex justify-between text-zinc-400">
                        <span>API Key configurada</span>
                        <StatusLabel
                          state={snapshot.verticals.aiEngine.geminiKeyConfigured ? 'up' : 'warn'}
                          text={snapshot.verticals.aiEngine.geminiKeyConfigured ? 'Configurada' : 'Solo Fallback'}
                        />
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Peticiones / Fallbacks</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.verticals.aiEngine.totalRequests} / {snapshot.verticals.aiEngine.fallbackResponses}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Errores 429 / 503</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {snapshot.verticals.aiEngine.rateLimit429Count} / {snapshot.verticals.aiEngine.overload503Count}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'rooms_logs' && (
                <div className="space-y-6">
                  <div className="border border-white/10 rounded-lg bg-[#10121A]">
                    <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">
                        Eventos Operativos en Tiempo Real ({filteredRuntimeEvents.length})
                      </div>
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090A0F] border border-white/10">
                        {(['all', 'info', 'warn', 'error'] as const).map((sev) => (
                          <button
                            key={sev}
                            type="button"
                            onClick={() => setLogSeverityFilter(sev)}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                              logSeverityFilter === sev
                                ? 'bg-violet-600 text-white'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {sev === 'all' ? 'Todos' : sev.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-zinc-400 border-b border-white/10">
                          <tr>
                            <th className="py-2.5 px-4 font-medium">Hora</th>
                            <th className="py-2.5 px-4 font-medium">Severidad</th>
                            <th className="py-2.5 px-4 font-medium">Dominio</th>
                            <th className="py-2.5 px-4 font-medium">Detalle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredRuntimeEvents.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 px-4 text-center text-zinc-400">
                                No hay eventos registrados con este filtro todavía.
                              </td>
                            </tr>
                          ) : (
                            filteredRuntimeEvents.map((ev) => (
                              <tr key={ev.id} className="hover:bg-white/[0.02]">
                                <td className="py-2.5 px-4 font-mono tabular-nums text-zinc-400">
                                  {formatTimeShort(ev.ts)}
                                </td>
                                <td className="py-2.5 px-4">
                                  <StatusLabel state={ev.severity === 'error' ? 'error' : ev.severity === 'warn' ? 'warn' : 'up'} />
                                </td>
                                <td className="py-2.5 px-4 font-mono text-zinc-300">{ev.category}</td>
                                <td className="py-2.5 px-4 text-zinc-200">{ev.message}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="border border-white/10 rounded-lg bg-[#10121A] overflow-x-auto">
                    <div className="px-4 py-3 border-b border-white/10 text-sm font-medium text-white">
                      Registro Persistente de Auditoría Admin ({snapshot.auditEvents.length})
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="text-zinc-400 border-b border-white/10">
                        <tr>
                          <th className="py-2.5 px-4 font-medium">Hora</th>
                          <th className="py-2.5 px-4 font-medium">Actor</th>
                          <th className="py-2.5 px-4 font-medium">Acción</th>
                          <th className="py-2.5 px-4 font-medium">Objetivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {snapshot.auditEvents.map((a) => (
                          <tr key={a.eventId} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-4 font-mono tabular-nums text-zinc-400">
                              {formatTimeShort(a.createdAt)}
                            </td>
                            <td className="py-2.5 px-4 text-zinc-200">{a.actor}</td>
                            <td className="py-2.5 px-4 font-mono text-violet-300">{a.action}</td>
                            <td className="py-2.5 px-4 text-zinc-300">{a.target}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'traceability' && (
                <div className="space-y-6 text-xs">
                  <div className="p-4 rounded-lg border border-white/10 bg-[#10121A] space-y-2">
                    <div className="text-sm font-medium text-white">
                      Registro de Trazabilidad y Fases Completadas
                    </div>
                    <p className="text-zinc-400">
                      El historial detallado de cada archivo modificado, endpoints, migraciones de arquitectura y validaciones se guarda en <span className="font-mono text-zinc-200">ARCHITECTURE_TRACEABILITY.md</span> y <span className="font-mono text-zinc-200">WORKLOG.md</span>.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(snapshot.improvementsByPhase).map(([phase, count]) => (
                      <div key={phase} className="p-4 rounded-lg border border-white/10 bg-[#10121A] flex items-center justify-between">
                        <span className="text-zinc-200 font-medium">{phase}</span>
                        <span className="font-mono tabular-nums text-violet-300">{count} mejoras</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
