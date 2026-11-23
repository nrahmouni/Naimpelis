import React, { useState } from 'react';
import {
  Check,
  Download,
  FileArchive,
  FileCode2,
  FolderArchive,
  Loader2,
  Monitor,
  Settings2,
  ShieldCheck,
  Tv,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import {
  PUBLISHED_RIFFAN_ORIGIN,
  generateWebOsAppInfoJson,
  normalizeWebOsAppId,
  resolvePublishedRiffanOrigin,
  type WebOsTargetTier,
} from '../../utils/webosConfigGenerator';
import {
  buildWebOsPackageArchive,
  triggerWebOsDownload,
  type BuildWebOsPackageResult,
} from '../../utils/webosIpkBuilder';

interface LgWebOsExportPanelProps {
  compact?: boolean;
  onOpenFullGuide?: () => void;
}

export const LgWebOsExportPanel: React.FC<LgWebOsExportPanelProps> = ({
  compact = false,
  onOpenFullGuide,
}) => {
  const currentOrigin =
    typeof window !== 'undefined' && window.location?.origin?.startsWith('http')
      ? window.location.origin.replace(/\/+$/, '')
      : '';
  const defaultOrigin = resolvePublishedRiffanOrigin();

  const [appName, setAppName] = useState('RiffanTV');
  const [appId, setAppId] = useState('com.riffantv.webos');
  const [version, setVersion] = useState('1.0.0');
  const [targetOrigin, setTargetOrigin] = useState(defaultOrigin);
  const [targetTier, setTargetTier] = useState<WebOsTargetTier>('universal');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [building, setBuilding] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [lastResult, setLastResult] = useState<BuildWebOsPackageResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBuildAndDownload = async (archiveFormat: 'ipk' | 'zip' = 'ipk') => {
    if (building) return;
    triggerHaptic('medium');
    setBuilding(true);
    setErrorMsg(null);
    setProgressPct(5);
    setStatusLabel(`Preparando paquete LG webOS (.${archiveFormat})...`);

    try {
      const normalizedId = normalizeWebOsAppId(appId);
      setAppId(normalizedId);
      const result = await buildWebOsPackageArchive({
        appName,
        appId: normalizedId,
        version,
        targetOrigin,
        targetTier,
        packageMode: targetTier === 'modern' ? 'modern_bundle' : 'universal_launcher',
        archiveFormat,
        onProgress: (label, pct) => {
          setStatusLabel(label);
          setProgressPct(pct);
        },
      });
      setLastResult(result);
      triggerWebOsDownload(result.blob, result.filename);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : `No se pudo generar el archivo .${archiveFormat} en este navegador.`
      );
    } finally {
      setBuilding(false);
    }
  };

  const handleDownloadAppInfoOnly = () => {
    triggerHaptic('light');
    const json = generateWebOsAppInfoJson({
      appName,
      appId,
      version,
      targetTier,
    });
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    triggerWebOsDownload(blob, 'appinfo.json');
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const tierCards: Array<{
    tier: WebOsTargetTier;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      tier: 'universal',
      title: 'Universal (webOS 3 – 24+)',
      subtitle: 'Recomendada para LG antiguas (2016+) y nuevas OLED/QNED sin bloqueos.',
      icon: <Tv className="w-4 h-4 text-[#00F593] shrink-0" />,
    },
    {
      tier: 'legacy',
      title: 'LG Antiguas (webOS 3.0 – 5.0)',
      subtitle: 'Modo ES5 puro + XHR + CSS flex clásico (Chromium 38–68, 2016–2020).',
      icon: <ShieldCheck className="w-4 h-4 text-[#60A5FA] shrink-0" />,
    },
    {
      tier: 'modern',
      title: 'Nuevas Offline (webOS 6 – 24+)',
      subtitle: 'Incluye dist/ completo en el .ipk (TVs LG 2021–2025+ modernas).',
      icon: <FileArchive className="w-4 h-4 text-[#A78BFA] shrink-0" />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Tier selector for old & new LG TVs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {tierCards.map((card) => {
          const selected = targetTier === card.tier;
          return (
            <button
              key={card.tier}
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                setTargetTier(card.tier);
              }}
              className={`min-h-[76px] p-3.5 rounded-2xl border text-left transition-all duration-150 cursor-pointer ${
                selected
                  ? 'bg-[#7C3AED]/18 border-[#8B5CF6] text-white'
                  : 'bg-[#0A0A0E] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  {card.icon}
                  <span>{card.title}</span>
                </span>
                {selected && <Check className="w-4 h-4 text-[#00F593] shrink-0" />}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1.5 leading-snug">{card.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* Destination server selector (defaults to Publish riffan.ai.studio) */}
      <div className="p-3 rounded-2xl bg-[#0A0A0E] border border-white/[0.08] flex items-center justify-between gap-2.5 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Servidor al que abrirá tu LG TV
          </div>
          <div className="text-xs font-mono font-bold text-[#00F593] truncate">{targetOrigin}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <button
            type="button"
            data-tv-focusable="true"
            onClick={() => {
              triggerHaptic('light');
              setTargetOrigin(PUBLISHED_RIFFAN_ORIGIN);
            }}
            className={`min-h-8 px-2.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
              targetOrigin === PUBLISHED_RIFFAN_ORIGIN
                ? 'bg-[#7C3AED] border-[#A78BFA] text-white'
                : 'bg-black border-white/10 text-zinc-300 hover:text-white'
            }`}
          >
            Publish (riffan.ai.studio)
          </button>
          {currentOrigin && currentOrigin !== PUBLISHED_RIFFAN_ORIGIN && (
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                setTargetOrigin(currentOrigin);
              }}
              className={`min-h-8 px-2.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
                targetOrigin === currentOrigin
                  ? 'bg-[#7C3AED] border-[#A78BFA] text-white'
                  : 'bg-black border-white/10 text-zinc-300 hover:text-white'
              }`}
            >
              URL Actual
            </button>
          )}
        </div>
      </div>

      {/* Advanced options toggle */}
      <div className="rounded-2xl bg-[#0A0A0E] border border-white/[0.08] overflow-hidden">
        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => {
            triggerHaptic('light');
            setShowAdvanced((v) => !v);
          }}
          className="w-full min-h-11 px-4 flex items-center justify-between gap-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.03] cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-[#A78BFA]" />
            <span>Parámetros de appinfo.json (App ID LG, nombre y servidor)</span>
          </span>
          <span className="font-mono text-zinc-400 truncate max-w-[160px]">{appId}</span>
        </button>

        {showAdvanced && (
          <div className="p-4 pt-2 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400">Nombre en LG Launcher</span>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full min-h-11 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-semibold text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400">LG App ID (minúsculas)</span>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
                className="w-full min-h-11 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400">Versión</span>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full min-h-11 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400">URL del servidor</span>
              <input
                type="url"
                value={targetOrigin}
                onChange={(e) => setTargetOrigin(e.target.value)}
                className="w-full min-h-11 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </label>
          </div>
        )}
      </div>

      {/* Main CTAs */}
      <div className="space-y-2.5">
        <button
          type="button"
          data-tv-focusable="true"
          disabled={building}
          onClick={() => void handleBuildAndDownload('ipk')}
          className="w-full min-h-[52px] px-5 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98] transition-all duration-150 shadow-[0_12px_36px_-6px_rgba(124,58,237,0.55)]"
        >
          {building ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="tabular-nums">Empaquetando LG webOS ({progressPct}%)</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Descargar paquete LG webOS (.ipk)</span>
            </>
          )}
        </button>

        {building && (
          <div className="space-y-1.5 px-1">
            <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-[#8B5CF6] transition-all duration-150"
                style={{ width: `${Math.max(5, Math.min(100, progressPct))}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-400 font-mono truncate">{statusLabel}</p>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-500/30 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {lastResult && !building && (
          <div className="p-3.5 rounded-2xl bg-[#0B1210] border border-emerald-500/30 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Generado: {lastResult.filename}</span>
              </p>
              <p className="text-[11px] text-zinc-300 mt-0.5 tabular-nums">
                {lastResult.fileCount} archivos · {formatBytes(lastResult.byteSize)} · perfil{' '}
                {lastResult.targetTier} · appinfo.json +{' '}
                {lastResult.usedFallbackCanvasIcon ? 'iconos Canvas PNG' : 'iconos PNG'}
              </p>
            </div>
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => triggerWebOsDownload(lastResult.blob, lastResult.filename)}
              className="min-h-10 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-semibold text-white cursor-pointer transition-colors shrink-0"
            >
              Guardar otra vez
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            data-tv-focusable="true"
            disabled={building}
            onClick={() => void handleBuildAndDownload('zip')}
            className="min-h-10 px-3.5 rounded-xl bg-[#0A0A0E] hover:bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <FolderArchive className="w-3.5 h-3.5 text-[#00F593]" />
            <span>Descargar .zip (Ares CLI)</span>
          </button>

          <button
            type="button"
            data-tv-focusable="true"
            onClick={handleDownloadAppInfoOnly}
            className="min-h-10 px-3.5 rounded-xl bg-[#0A0A0E] hover:bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <FileCode2 className="w-3.5 h-3.5 text-[#A78BFA]" />
            <span>Descargar appinfo.json</span>
          </button>

          {onOpenFullGuide && (
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                onOpenFullGuide();
              }}
              className="min-h-10 px-3.5 rounded-xl bg-[#0A0A0E] hover:bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Monitor className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span>Abrir guía completa /webos</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact inline quick visual steps */}
      {compact && (
        <div className="p-4 rounded-2xl bg-[#0A0A0E] border border-white/[0.08] space-y-2.5">
          <h5 className="text-xs font-bold uppercase tracking-wider text-[#00F593]">
            Guía fácil: Activar Dev Mode e instalar en LG (Antiguas y Nuevas)
          </h5>
          <ol className="text-xs text-zinc-300 space-y-2 pl-5 list-decimal leading-relaxed">
            <li>
              <strong className="text-white">En la tele LG:</strong> abre{' '}
              <strong className="text-white">LG Content Store / Apps</strong>, busca{' '}
              <strong className="text-white">Developer Mode</strong> e instálala.
            </li>
            <li>
              <strong className="text-white">Inicia sesión:</strong> entra con tu cuenta gratis de{' '}
              <code className="text-[#A78BFA]">webostv.developer.lge.com</code> dentro de la app.
            </li>
            <li>
              <strong className="text-white">Activa 2 interruptores:</strong> pon{' '}
              <strong className="text-[#00F593]">Dev Mode Status: ON</strong> (la TV reinicia) y vuelve para activar{' '}
              <strong className="text-[#00F593]">Key Server: ON</strong>. Copia la <strong className="text-white">IP</strong> y la <strong className="text-white">Passphrase</strong>.
            </li>
            <li>
              <strong className="text-white">Descarga e instala desde PC:</strong> abre{' '}
              <code className="text-[#00F593]">{PUBLISHED_RIFFAN_ORIGIN}/webos</code> en tu PC/Mac para bajar el{' '}
              <code className="text-white">.ipk</code> y envíalo a la tele con <strong className="text-white">webOS Dev Manager</strong>.{' '}
              <span className="text-zinc-400">(El navegador de la TV LG no permite instalar archivos .ipk descargados ahí; si no quieres usar PC, abre directo{' '}
              <code className="text-[#A78BFA]">{PUBLISHED_RIFFAN_ORIGIN}/tvlg</code> en la tele sin descargar nada).</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};
