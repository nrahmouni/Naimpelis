import React, { useState } from 'react';
import {
  Check,
  Download,
  FileArchive,
  FileCode2,
  Loader2,
  Monitor,
  Settings2,
  ShieldCheck,
  Tv,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { generateTizenConfigXml, normalizeTizenPackageId } from '../../utils/tizenConfigGenerator';
import {
  buildTizenWgtArchive,
  triggerWgtBrowserDownload,
  type BuildTizenWgtResult,
  type TizenPackageMode,
} from '../../utils/tizenWgtBuilder';

interface SamsungWgtExportPanelProps {
  compact?: boolean;
  onOpenFullGuide?: () => void;
}

export const SamsungWgtExportPanel: React.FC<SamsungWgtExportPanelProps> = ({
  compact = false,
  onOpenFullGuide,
}) => {
  const defaultOrigin = 'https://riffan.ai.studio';

  const [appName, setAppName] = useState('RiffanTV');
  const [packageId, setPackageId] = useState('RiffanTv01');
  const [version, setVersion] = useState('1.0.0');
  const [targetOrigin, setTargetOrigin] = useState(defaultOrigin);
  const [packageMode, setPackageMode] = useState<TizenPackageMode>('full_bundle');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [building, setBuilding] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [lastResult, setLastResult] = useState<BuildTizenWgtResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBuildAndDownload = async () => {
    if (building) return;
    triggerHaptic('medium');
    setBuilding(true);
    setErrorMsg(null);
    setProgressPct(5);
    setStatusLabel('Preparando empaquetado Tizen...');

    try {
      const normalizedPkg = normalizeTizenPackageId(packageId);
      setPackageId(normalizedPkg);
      const result = await buildTizenWgtArchive({
        appName,
        packageId: normalizedPkg,
        version,
        targetOrigin,
        packageMode,
        onProgress: (label, pct) => {
          setStatusLabel(label);
          setProgressPct(pct);
        },
      });
      setLastResult(result);
      triggerWgtBrowserDownload(result.blob, result.filename);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo generar el archivo .wgt en este navegador.'
      );
    } finally {
      setBuilding(false);
    }
  };

  const handleDownloadConfigXmlOnly = () => {
    triggerHaptic('light');
    const xml = generateTizenConfigXml({
      appName,
      packageId,
      version,
    });
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    triggerWgtBrowserDownload(blob, 'config.xml');
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => {
            triggerHaptic('light');
            setPackageMode('full_bundle');
          }}
          className={`min-h-[68px] p-3.5 rounded-2xl border text-left transition-all duration-150 cursor-pointer ${
            packageMode === 'full_bundle'
              ? 'bg-[#7C3AED]/18 border-[#8B5CF6] text-white'
              : 'bg-[#0A0A0E] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white flex items-center gap-2">
              <FileArchive className="w-4 h-4 text-[#A78BFA] shrink-0" />
              <span>App Completa (.wgt)</span>
            </span>
            {packageMode === 'full_bundle' && <Check className="w-4 h-4 text-[#00F593] shrink-0" />}
          </div>
          <p className="text-xs text-zinc-400 mt-1 leading-snug">
            Incluye HTML, CSS/JS, config.xml e icon.png dentro del paquete.
          </p>
        </button>

        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => {
            triggerHaptic('light');
            setPackageMode('hosted_launcher');
          }}
          className={`min-h-[68px] p-3.5 rounded-2xl border text-left transition-all duration-150 cursor-pointer ${
            packageMode === 'hosted_launcher'
              ? 'bg-[#7C3AED]/18 border-[#8B5CF6] text-white'
              : 'bg-[#0A0A0E] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#60A5FA] shrink-0" />
              <span>Lanzador Directo (~80 KB)</span>
            </span>
            {packageMode === 'hosted_launcher' && <Check className="w-4 h-4 text-[#00F593] shrink-0" />}
          </div>
          <p className="text-xs text-zinc-400 mt-1 leading-snug">
            Cliente ligero Tizen que apunta directo a tu servidor desplegado.
          </p>
        </button>
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
            <span>Parámetros de config.xml (ID Tizen, nombre y servidor)</span>
          </span>
          <span className="font-mono text-zinc-400 tabular-nums">{packageId}</span>
        </button>

        {showAdvanced && (
          <div className="p-4 pt-2 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400">Nombre en Smart Hub</span>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full min-h-11 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-semibold text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400">Package ID (10 caracteres)</span>
              <input
                type="text"
                value={packageId}
                maxLength={10}
                onChange={(e) => setPackageId(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                className="w-full min-h-11 px-3 rounded-xl bg-black border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400">Versión widget</span>
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

      {/* Main CTA */}
      <div className="space-y-2.5">
        <button
          type="button"
          data-tv-focusable="true"
          disabled={building}
          onClick={() => void handleBuildAndDownload()}
          className="w-full min-h-[52px] px-5 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98] transition-all duration-150 shadow-[0_12px_36px_-6px_rgba(124,58,237,0.55)]"
        >
          {building ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="tabular-nums">Empaquetando .wgt ({progressPct}%)</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Descargar paquete Samsung TV (.wgt)</span>
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
                {lastResult.fileCount} archivos · {formatBytes(lastResult.byteSize)} · config.xml +{' '}
                {lastResult.usedFallbackCanvasIcon ? 'icon.png (Canvas PNG)' : 'icon.png'}
              </p>
            </div>
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => triggerWgtBrowserDownload(lastResult.blob, lastResult.filename)}
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
            onClick={handleDownloadConfigXmlOnly}
            className="min-h-10 px-3.5 rounded-xl bg-[#0A0A0E] hover:bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <FileCode2 className="w-3.5 h-3.5 text-[#A78BFA]" />
            <span>Descargar config.xml</span>
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
              <span>Abrir guía completa /samsung</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact inline quick visual steps */}
      {compact && (
        <div className="p-3.5 rounded-2xl bg-[#0A0A0E] border border-white/[0.08] space-y-2.5">
          <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Cómo instalar en tu Samsung TV (Developer Mode)
          </h5>
          <ol className="text-xs text-zinc-300 space-y-1.5 pl-5 list-decimal leading-relaxed">
            <li>
              En tu televisor Samsung, abre <strong className="text-white">Apps</strong> y pulsa{' '}
              <strong className="text-[#A78BFA] font-mono">1 2 3 4 5</strong> en el mando.
            </li>
            <li>
              Activa <strong className="text-white">Developer Mode: On</strong>, introduce la IP de tu dispositivo/PC y reinicia la TV.
            </li>
            <li>
              Instala el <code className="text-white">.wgt</code> con{' '}
              <strong className="text-white">Apps2Samsung</strong>,{' '}
              <strong className="text-white">Tizen Device Manager</strong> o usando el flujo de auto-firma en{' '}
              <code className="text-[#A78BFA]">/samsung</code>.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};
