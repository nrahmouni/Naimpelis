import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  RefreshCw,
  Server,
  ShieldCheck,
  Tv,
  Wifi,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  BottomSheet,
  PrimaryButton,
  SecondaryButton,
  StandardInput,
} from '../ui/DesignSystem';

interface GeoExitInfo {
  ok: boolean;
  ip: string;
  countryCode: string;
  country: string;
  city: string;
  isp: string;
  isSpain: boolean;
  provider: string;
  error?: string;
}

interface UrbanGateway {
  id: string;
  countryCode: string;
  locationName: string;
  hostname: string;
  port: number;
  proto: string;
  cipher: string;
  isSpain: boolean;
}

interface UrbanAuditLimitation {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
}

interface VpnOverviewResponse {
  success: boolean;
  config: {
    enabled: boolean;
    configured: boolean;
    source: string;
    protocol: string;
    maskedProxyUrl: string;
    scope: 'auto_spanish' | 'all_streaming' | 'off';
  };
  directGeo: GeoExitInfo;
  tunneledGeo: GeoExitInfo | null;
  spanishDvbHeadend: {
    host: string;
    antena3Ready: boolean;
    lasextaReady: boolean;
    note: string;
  };
  atresplayerApi: {
    reachable: boolean;
    status: number;
  };
  urbanVpnAudit: {
    packageName: string;
    versionName: string;
    totalGateways: number;
    endpoints: {
      configApi: string;
      cdnBase: string;
      geoLookup: string;
    };
    tunnelProtocol: {
      engine: string;
      port: number;
      proto: string;
      cipher: string;
      authDirective: string;
    };
    limitations: UrbanAuditLimitation[];
  };
  spainUrbanGateways: UrbanGateway[];
}

interface ProbeOutcome {
  hostname: string;
  ok: boolean;
  tcpReachable: boolean;
  tlsHandshakeOk: boolean;
  latencyMs: number;
  error?: string;
}

interface SpainVpnGatewayModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
}

export const SpainVpnGatewayModal: React.FC<SpainVpnGatewayModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [overview, setOverview] = useState<VpnOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [proxyInput, setProxyInput] = useState('');
  const [scope, setScope] = useState<'auto_spanish' | 'all_streaming' | 'off'>('auto_spanish');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [probes, setProbes] = useState<Record<string, ProbeOutcome>>({});
  const [probingHost, setProbingHost] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vpn/overview', { cache: 'no-store' });
      const data = (await res.json()) as VpnOverviewResponse;
      if (data?.success) {
        setOverview(data);
        setScope(data.config.scope);
      }
    } catch {
      // handled in UI state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadOverview();
    }
  }, [isOpen, loadOverview]);

  const handleTestProxy = async () => {
    if (!proxyInput.trim()) return;
    triggerHaptic('light');
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/vpn/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyUrl: proxyInput.trim() }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        geo?: GeoExitInfo;
        error?: string;
      };
      if (data.success && data.geo) {
        setTestResult({
          ok: data.geo.isSpain,
          message: data.geo.isSpain
            ? `España verificada (${data.geo.ip} · ${data.geo.city || 'ES'} · ${data.geo.isp || 'OK'})`
            : `Conectado fuera de España: ${data.geo.countryCode || 'Desconocido'} (${data.geo.ip})`,
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error || 'No se pudo verificar la salida del proxy.',
        });
      }
    } catch {
      setTestResult({ ok: false, message: 'Error de red probando el proxy.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveProxy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proxyInput.trim() && !overview?.config.configured) return;
    triggerHaptic('medium');
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/vpn/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(proxyInput.trim() ? { proxyUrl: proxyInput.trim() } : {}),
          scope,
          enabled: scope !== 'off',
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        tunneledGeo?: GeoExitInfo | null;
      };
      if (!res.ok || !data.success) {
        setTestResult({ ok: false, message: data.error || 'No se pudo activar la pasarela.' });
      } else {
        setProxyInput('');
        setTestResult({
          ok: true,
          message: data.tunneledGeo?.isSpain
            ? `Salida España activa para TV, móvil y web (${data.tunneledGeo.ip})`
            : 'Configuración aplicada en todos los dispositivos.',
        });
        await loadOverview();
      }
    } catch {
      setTestResult({ ok: false, message: 'Error guardando la configuración.' });
    } finally {
      setSaving(false);
    }
  };

  const handleClearProxy = async () => {
    triggerHaptic('light');
    setSaving(true);
    try {
      await fetch('/api/vpn/config', { method: 'DELETE' });
      setProxyInput('');
      setTestResult({ ok: true, message: 'Pasarela VPN desactivada (salida directa).' });
      await loadOverview();
    } finally {
      setSaving(false);
    }
  };

  const handleProbeUrban = async (hostname: string) => {
    triggerHaptic('light');
    setProbingHost(hostname);
    try {
      const res = await fetch(`/api/vpn/probe?host=${encodeURIComponent(hostname)}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as { probe?: ProbeOutcome };
      if (data.probe) {
        setProbes((prev) => ({ ...prev, [hostname]: data.probe! }));
      }
    } finally {
      setProbingHost(null);
    }
  };

  const activeGeo =
    overview?.config.enabled && overview.tunneledGeo?.ok
      ? overview.tunneledGeo
      : overview?.directGeo;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-lg"
      icon={<Globe className="w-5 h-5" />}
      title={pickLang(lang, {
        es: 'Salida España · VPN Gateway',
        ca: 'Sortida Espanya · VPN Gateway',
        en: 'Spain Exit · VPN Gateway',
      })}
      subtitle={pickLang(lang, {
        es: 'Enrutado centralizado para TV Samsung, móvil, tablet y web',
        ca: 'Enrutament centralitzat per a TV Samsung, mòbil, tauleta i web',
        en: 'Centralized routing for Samsung TV, mobile, tablet & web',
      })}
    >
      <div className="space-y-4">
        {/* Live Geo & Cross-Device Status */}
        <div className="rounded-2xl bg-[#14141C] border border-white/[0.08] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {activeGeo?.isSpain ? (
                <ShieldCheck className="w-5 h-5 text-[#00F593] shrink-0" />
              ) : (
                <Server className="w-5 h-5 text-[#A78BFA] shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {activeGeo?.isSpain
                    ? 'IP de salida detectada: España (ES)'
                    : activeGeo?.countryCode
                      ? `Salida actual del servidor: ${activeGeo.country || activeGeo.countryCode} (${activeGeo.countryCode})`
                      : 'Comprobando salida de red...'}
                </div>
                <div className="text-xs text-zinc-400 truncate">
                  {activeGeo?.ip
                    ? `${activeGeo.ip}${activeGeo.city ? ` · ${activeGeo.city}` : ''}`
                    : 'Sin IP detectada aún'}
                </div>
              </div>
            </div>
            <SecondaryButton
              type="button"
              onClick={() => void loadOverview()}
              loading={loading}
              aria-label="Actualizar estado"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </SecondaryButton>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
              <div className="text-zinc-400">TDT España 1080p (Directa)</div>
              <div className="mt-0.5 font-semibold text-white flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-[#00F593] shrink-0" />
                <span>
                  {overview?.spanishDvbHeadend.antena3Ready && overview?.spanishDvbHeadend.lasextaReady
                    ? 'Antena 3 y laSexta HD activas'
                    : overview?.spanishDvbHeadend.antena3Ready
                      ? 'Antena 3 HD activa'
                      : 'Modo respaldo'}
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2">
              <div className="text-zinc-400">API Atresplayer</div>
              <div className="mt-0.5 font-semibold text-white flex items-center gap-1.5">
                <Wifi
                  className={`w-3.5 h-3.5 shrink-0 ${
                    overview?.atresplayerApi.reachable ? 'text-[#00F593]' : 'text-amber-400'
                  }`}
                />
                <span>
                  {overview?.atresplayerApi.reachable
                    ? `Conectada (${overview.atresplayerApi.status})`
                    : 'Sin respuesta'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Configure Spain Egress Proxy (All Devices) */}
        <form
          onSubmit={(e) => void handleSaveProxy(e)}
          className="rounded-2xl bg-[#14141C] border border-white/[0.08] p-4 space-y-3"
        >
          <div>
            <h4 className="text-sm font-bold text-white">
              Conectar Pasarela / Proxy en España (Todos los dispositivos)
            </h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Al activarla aquí en el servidor, tu Samsung Tizen TV, móvil, iPhone y navegador
              saldrán automáticamente con IP española sin instalar apps VPN en la tele.
            </p>
          </div>

          {overview?.config.configured && (
            <div className="rounded-xl bg-[#00F593]/10 border border-[#00F593]/25 px-3 py-2 text-xs text-emerald-200 flex items-center justify-between gap-2">
              <span className="truncate font-mono">{overview.config.maskedProxyUrl}</span>
              <span className="font-bold shrink-0">
                {overview.config.enabled ? 'ACTIVO' : 'PAUSADO'}
              </span>
            </div>
          )}

          <StandardInput
            type="text"
            value={proxyInput}
            onChange={(e) => setProxyInput(e.target.value)}
            placeholder="socks5h://usuario:clave@ip-espana:1080  o  http://ip-espana:3128"
            aria-label="URL de proxy o túnel en España"
          />

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'auto_spanish', label: 'Solo España / TDT' },
                { id: 'all_streaming', label: 'Todo el streaming' },
                { id: 'off', label: 'Desactivado' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScope(opt.id)}
                className={`min-h-10 px-2.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  scope === opt.id
                    ? 'bg-[#7C3AED]/25 border-[#A78BFA]/60 text-white'
                    : 'bg-black/25 border-white/[0.08] text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {testResult && (
            <div
              className={`rounded-xl px-3 py-2 text-xs flex items-start gap-2 border ${
                testResult.ok
                  ? 'bg-[#00F593]/10 border-[#00F593]/30 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#00F593]" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              type="button"
              onClick={() => void handleTestProxy()}
              loading={testing}
              disabled={!proxyInput.trim()}
            >
              Probar IP España
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              loading={saving}
              disabled={!proxyInput.trim() && !overview?.config.configured}
              className="flex-1"
            >
              Aplicar en todos los dispositivos
            </PrimaryButton>
            {overview?.config.configured && (
              <SecondaryButton
                type="button"
                onClick={() => void handleClearProxy()}
                disabled={saving}
              >
                Quitar
              </SecondaryButton>
            )}
          </div>
        </form>

        {/* Urban VPN 1.0.97 Technical Audit & Spain Nodes */}
        <div className="rounded-2xl bg-[#14141C] border border-white/[0.08] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white">
                Análisis Urban VPN 1.0.97 · Nodos España
              </h4>
              <p className="text-xs text-zinc-400">
                {overview?.urbanVpnAudit.totalGateways || 100} pasarelas OpenVPN TCP/443 (AES-256-CBC)
              </p>
            </div>
            <SecondaryButton type="button" onClick={() => setShowAudit((v) => !v)}>
              {showAudit ? 'Ocultar informe' : 'Ver informe'}
            </SecondaryButton>
          </div>

          <div className="space-y-2">
            {(overview?.spainUrbanGateways || []).map((gw) => {
              const p = probes[gw.hostname];
              return (
                <div
                  key={gw.id}
                  className="rounded-xl bg-black/30 border border-white/[0.06] px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {gw.locationName} · {gw.hostname}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {gw.port}/{gw.proto.toUpperCase()} · {gw.cipher}
                      {p ? ` · ${p.tcpReachable ? `TCP OK (${p.latencyMs}ms)` : p.error || 'Sin respuesta'}` : ''}
                    </div>
                  </div>
                  <SecondaryButton
                    type="button"
                    onClick={() => void handleProbeUrban(gw.hostname)}
                    loading={probingHost === gw.hostname}
                  >
                    Probar nodo
                  </SecondaryButton>
                </div>
              );
            })}
          </div>

          {showAudit && overview?.urbanVpnAudit && (
            <div className="space-y-2 pt-2 border-t border-white/[0.07]">
              {overview.urbanVpnAudit.limitations.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-black/30 border border-white/[0.06] p-3 space-y-1"
                >
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <AlertTriangle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        item.severity === 'critical'
                          ? 'text-amber-400'
                          : item.severity === 'warning'
                            ? 'text-[#A78BFA]'
                            : 'text-[#00F593]'
                      }`}
                    />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
};
