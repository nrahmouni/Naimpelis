import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { BottomSheet, PrimaryButton, SecondaryButton } from '../ui/DesignSystem';
import {
  clearCachedXtreamCatalog,
  runXtreamConnectionTest,
  type XtreamDiagnosticReport,
} from '../../services/xtreamClientService';
import { XtreamPrivateVaultModal } from './XtreamPrivateVaultModal';

interface XtreamDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
}

export const XtreamDiagnosticsModal: React.FC<XtreamDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<XtreamDiagnosticReport | null>(null);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);

  const runProbe = useCallback(async () => {
    setLoading(true);
    try {
      clearCachedXtreamCatalog();
      const res = await runXtreamConnectionTest(true);
      setReport(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void runProbe();
    }
  }, [isOpen, runProbe]);

  const totalUnified = report
    ? report.catalogCounts.liveChannels +
      report.catalogCounts.vodMovies +
      report.catalogCounts.series
    : 0;
  const activeProvidersCount = report?.providers
    ? report.providers.filter((p) => p.connected).length
    : 0;
  const totalProvidersCount = report?.providers ? report.providers.length : 0;

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        lang={lang}
        maxWidth="sm:max-w-lg"
        icon={<Activity className="w-5 h-5 text-emerald-400" />}
        title={pickLang(lang, {
          es: 'Panel de Resumen y Auditoría',
          ca: 'Panell de Resum i Auditoria',
          en: 'Summary & Audit Panel',
        })}
        subtitle={pickLang(lang, {
          es: 'Verifica todos los proveedores activos y recalcula el conteo exacto de canales, películas y series',
          ca: 'Verifica tots els proveïdors actius i recalcula el recompte exacte de canals, pel·lícules i sèries',
          en: 'Checks all active providers and recalculates exact TV, movie & series counts',
        })}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#14141C] border border-white/[0.08] p-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-zinc-200 truncate">
                {report?.serverLabel || 'Auditando proveedores activos...'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SecondaryButton
                onClick={() => {
                  triggerHaptic('light');
                  setVaultModalOpen(true);
                }}
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Claves Privadas</span>
              </SecondaryButton>

              <PrimaryButton
                onClick={() => {
                  triggerHaptic('medium');
                  void runProbe();
                }}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>Auditar ahora</span>
              </PrimaryButton>
            </div>
          </div>

          {loading && !report ? (
            <div className="rounded-2xl bg-[#14141C] border border-white/[0.08] p-5 flex items-center gap-3 text-xs text-zinc-300">
              <Loader2 className="w-4 h-4 animate-spin text-[#F43F5E]" />
              <span>Verificando conexiones, rotación y recalculando catálogo total...</span>
            </div>
          ) : report ? (
            <>
              {report.connected && report.activeAccountSummary ? (
                <div className="rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/25 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{report.activeAccountSummary.label}</span>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-200 tabular-nums">
                      {activeProvidersCount}/{totalProvidersCount} activos
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="rounded-xl bg-black/40 p-2.5 border border-white/[0.06]">
                      <p className="text-[11px] text-zinc-400">Expiración</p>
                      <p className="font-semibold text-white mt-0.5">
                        {report.activeAccountSummary.expDateReadable}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/40 p-2.5 border border-white/[0.06]">
                      <p className="text-[11px] text-zinc-400">Conexiones máx.</p>
                      <p className="font-semibold text-white tabular-nums mt-0.5">
                        {report.activeAccountSummary.activeConnections} /{' '}
                        {report.activeAccountSummary.maxConnections}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-amber-500/[0.08] border border-amber-500/25 p-4 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-200">Sin cuenta activa</p>
                    <p className="text-xs text-zinc-300">
                      {report.error ||
                        'Configura las credenciales en las variables de entorno o en Claves Privadas.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-2xl bg-[#14141C] border border-white/[0.08] p-3">
                  <p className="text-base font-extrabold text-white tabular-nums">
                    {report.catalogCounts.liveChannels.toLocaleString('es-ES')}
                  </p>
                  <p className="text-[11px] text-zinc-400">Canales TV</p>
                </div>
                <div className="rounded-2xl bg-[#14141C] border border-white/[0.08] p-3">
                  <p className="text-base font-extrabold text-white tabular-nums">
                    {report.catalogCounts.vodMovies.toLocaleString('es-ES')}
                  </p>
                  <p className="text-[11px] text-zinc-400">Películas VOD</p>
                </div>
                <div className="rounded-2xl bg-[#14141C] border border-white/[0.08] p-3">
                  <p className="text-base font-extrabold text-white tabular-nums">
                    {report.catalogCounts.series.toLocaleString('es-ES')}
                  </p>
                  <p className="text-[11px] text-zinc-400">Series</p>
                </div>
                <div className="rounded-2xl bg-[#14141C] border border-emerald-500/25 p-3">
                  <p className="text-base font-extrabold text-emerald-300 tabular-nums">
                    {totalUnified.toLocaleString('es-ES')}
                  </p>
                  <p className="text-[11px] text-zinc-400">Total añadido</p>
                </div>
              </div>

              {report.providers && report.providers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
                    Auditoría por proveedor ({report.providers.length})
                  </p>
                  <div className="space-y-1.5">
                    {report.providers.map((prov) => {
                      const totalChannels =
                        prov.counts.liveChannels + prov.counts.vodMovies + prov.counts.series;
                      return (
                        <div
                          key={prov.id}
                          className="rounded-xl bg-[#14141C] border border-white/[0.08] px-3.5 py-2.5 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-white truncate">{prov.name}</p>
                                {prov.totalAccounts > 1 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.07] text-zinc-300 tabular-nums">
                                    {prov.activeAccountNumber
                                      ? `Cuenta ${prov.activeAccountNumber}/${prov.totalAccounts}`
                                      : `${prov.totalAccounts} cuentas`}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                                {prov.connected
                                  ? `${totalChannels.toLocaleString('es-ES')} totales (${prov.counts.liveChannels} TV · ${prov.counts.vodMovies} VOD · ${prov.counts.series} Series)`
                                  : `${prov.state} · 0 canales`}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-lg font-bold shrink-0 ${
                                prov.connected
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : prov.state === 'Error'
                                    ? 'bg-red-500/15 text-red-300'
                                    : 'bg-white/[0.07] text-zinc-300'
                              }`}
                            >
                              {prov.connected
                                ? 'Conectado'
                                : prov.state === 'Error'
                                  ? 'Desconectado'
                                  : 'Sin configurar'}
                            </span>
                          </div>

                          {prov.accounts.length > 1 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {prov.accounts.map((acc) => (
                                <span
                                  key={`${prov.id}-acc-${acc.accountNumber}`}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border tabular-nums ${
                                    acc.statusLabel === 'Activa'
                                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                                      : acc.statusLabel === 'Error'
                                        ? 'bg-red-500/15 border-red-500/35 text-red-300'
                                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-400'
                                  }`}
                                >
                                  Cuenta {acc.accountNumber} (••••••••): {acc.statusLabel}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </BottomSheet>

      <XtreamPrivateVaultModal
        isOpen={vaultModalOpen}
        onClose={() => setVaultModalOpen(false)}
        lang={lang}
        onVaultUpdated={() => {
          void runProbe();
        }}
      />
    </>
  );
};
