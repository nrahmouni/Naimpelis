import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCheck,
  CloudCog,
  Copy,
  Download,
  FileCode2,
  Gamepad2,
  KeyRound,
  Monitor,
  ShieldCheck,
  Terminal,
  Tv,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import {
  PUBLISHED_RIFFAN_ORIGIN,
  generateWebOsAppInfoJson,
  resolvePublishedRiffanOrigin,
  WEBOS_COMPATIBILITY_MATRIX,
} from '../../utils/webosConfigGenerator';
import { mapKeyboardEventToTvAction, type TvRemoteAction } from '../../utils/tvSpatialNav';
import { triggerWebOsDownload } from '../../utils/webosIpkBuilder';
import { LgWebOsExportPanel } from './LgWebOsExportPanel';

interface LgWebOsTvGuidePageProps {
  onBack: () => void;
  onOpenTvReceiver?: () => void;
}

type GuideTab = 'export' | 'guide' | 'github' | 'remote';

const WORKFLOW_SUMMARY_SNIPPET = `name: Build LG webOS TV (.ipk) — Antiguas y Nuevas
on: [workflow_dispatch, push]
jobs:
  build-webos-ipk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm install --legacy-peer-deps && npx vite build --base=./
      - run: npm exec -- tsx server/routes/webosRoutes.ts || true
      - uses: actions/upload-artifact@v4
        with: { name: riffantv-lg-webos-ipk, path: release-ipk/*.ipk }`;

export const LgWebOsTvGuidePage: React.FC<LgWebOsTvGuidePageProps> = ({
  onBack,
  onOpenTvReceiver,
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('export');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastKeyInfo, setLastKeyInfo] = useState<{
    action: TvRemoteAction | string;
    key: string;
    code: number;
  } | null>(null);

  useBackInterceptor(true, 'lg-webos-tv-guide-page', onBack, { priority: 65 });

  useEffect(() => {
    if (activeTab !== 'remote') return undefined;
    const handleKey = (e: KeyboardEvent) => {
      const action = mapKeyboardEventToTvAction(e);
      setLastKeyInfo({
        action: action || e.key || 'UNKNOWN',
        key: e.key || '—',
        code: e.keyCode || e.which || 0,
      });
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeTab]);

  const canonicalJson = generateWebOsAppInfoJson();
  const liveTvUrl = `${resolvePublishedRiffanOrigin()}/tvlg`;

  const handleCopy = async (text: string, id: string) => {
    triggerHaptic('light');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2200);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleDownloadFullWorkflow = async () => {
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/tv/webos-workflow.yml');
      if (res.ok) {
        const text = await res.text();
        triggerWebOsDownload(
          new Blob([text], { type: 'text/yaml;charset=utf-8' }),
          'build-webos-ipk.yml'
        );
        return;
      }
    } catch {
      // fallback to snippet
    }
    triggerWebOsDownload(
      new Blob([WORKFLOW_SUMMARY_SNIPPET], { type: 'text/yaml;charset=utf-8' }),
      'build-webos-ipk.yml'
    );
  };

  const tabs: Array<{ id: GuideTab; label: string; icon: React.ReactNode }> = [
    { id: 'export', label: 'Exportar .ipk', icon: <Download className="w-4 h-4" /> },
    { id: 'guide', label: 'Guía LG (Antiguas y Nuevas)', icon: <KeyRound className="w-4 h-4" /> },
    { id: 'github', label: 'Auto-Build Nube', icon: <CloudCog className="w-4 h-4" /> },
    { id: 'remote', label: 'Test Magic Remote', icon: <Gamepad2 className="w-4 h-4" /> },
  ];

  const remoteButtons: Array<{ label: string; keyCode: string; action: string }> = [
    { label: 'Cruceta / Puntero Magic Remote', keyCode: '37–40', action: 'Navegación espacial 10-Foot + cursor' },
    { label: 'Rueda OK / Enter', keyCode: '13 / 23', action: 'SELECT (Abrir / Reproducir)' },
    { label: 'Back / Volver (LG)', keyCode: '461', action: 'BACK (Volver atrás / webOS.platformBack)' },
    { label: 'Play / Pause', keyCode: '415 / 19', action: 'PLAY / PAUSE multimedia' },
    { label: 'Stop', keyCode: '413', action: 'STOP (Detener vídeo y volver)' },
    { label: 'Rewind / Fast Forward', keyCode: '412 / 417', action: 'Salto -15s / +15s directo' },
    { label: 'Programa + / Programa -', keyCode: '427 / 428 / 33 / 34', action: 'Zapping TDT / Fútbol en vivo' },
  ];

  return (
    <div className="min-h-[100dvh] w-full bg-[#000000] text-white tv-10foot-stage overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-6">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                onBack();
              }}
              className="min-h-11 px-4 rounded-xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-bold text-white flex items-center gap-2 cursor-pointer transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-[#A78BFA]" />
              <span>Volver a RiffanTV</span>
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#00F593]">
                LG Smart TV · webOS 3.0 – 24+ (Antiguas y Nuevas)
              </p>
              <h1 className="text-xl sm:text-3xl font-display font-black tracking-tight text-white truncate">
                Instalación y Empaquetado .ipk
              </h1>
            </div>
          </div>

          {onOpenTvReceiver && (
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('medium');
                onOpenTvReceiver();
              }}
              className="min-h-11 px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-bold text-white flex items-center gap-2 cursor-pointer transition-colors shrink-0"
            >
              <Tv className="w-4 h-4 text-[#00F593]" />
              <span>Abrir Receptor Web /tv</span>
            </button>
          )}
        </header>

        {/* Sub-navigation tabs */}
        <nav
          aria-label="Secciones de LG webOS TV"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-2xl bg-[#0A0A0E] border border-white/[0.08]"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(tab.id);
                }}
                className={`min-h-11 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ${
                  active
                    ? 'bg-[#7C3AED] text-white shadow-lg'
                    : 'text-zinc-300 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* TAB 1: BROWSER .IPK PACKAGER + COMPATIBILITY MATRIX */}
        {activeTab === 'export' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <section className="lg:col-span-7 p-5 sm:p-6 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-display font-bold text-white">
                    Generador .ipk directo para LG webOS (Antiguas y Nuevas)
                  </h2>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Genera un paquete binario Debian estándar{' '}
                    <code className="text-zinc-200">.ipk</code> listo para instalar en cualquier LG TV (desde webOS 3.0 de 2016 hasta webOS 24 OLED/QNED), con{' '}
                    <code className="text-zinc-200">appinfo.json</code>, iconos y lanzador ES5/moderno.
                  </p>
                </div>
                <LgWebOsExportPanel />
              </section>

              <section className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-[#07070A] border border-white/[0.09] flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-[#A78BFA]" />
                      <span>Manifiesto appinfo.json</span>
                    </h3>
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => void handleCopy(canonicalJson, 'json')}
                      className="min-h-9 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedId === 'json' ? (
                        <>
                          <CheckCheck className="w-3.5 h-3.5 text-[#00F593]" />
                          <span className="text-[#00F593]">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="p-3.5 rounded-2xl bg-[#000000] border border-white/[0.08] text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-72 leading-relaxed">
                    {canonicalJson}
                  </pre>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#0A0A0E] border border-white/[0.08] text-xs text-zinc-300 space-y-1.5">
                  <p className="font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#00F593]" />
                    <span>Soporte Antiguas + Nuevas</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Incluye <code className="text-zinc-200">disableBackHistoryAPI</code>, soporte de puntero Magic Remote y lanzador ES5 puro compatible con Chromium 38 (webOS 3.0) hasta Chromium 120+ (webOS 24).
                  </p>
                </div>
              </section>
            </div>

            {/* Matrix for old vs new LG models */}
            <section className="p-5 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-3">
              <h3 className="text-sm font-bold text-white">
                Matriz de compatibilidad LG TV (Antiguas vs Nuevas)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {WEBOS_COMPATIBILITY_MATRIX.map((row) => (
                  <div
                    key={row.era}
                    className="p-4 rounded-2xl bg-[#000000] border border-white/[0.08] space-y-1.5"
                  >
                    <div className="text-xs font-bold text-[#00F593]">{row.era}</div>
                    <div className="text-sm font-bold text-white">{row.webOsVersions}</div>
                    <div className="text-[11px] font-mono text-[#A78BFA]">{row.chromiumEngine}</div>
                    <p className="text-xs text-zinc-300 pt-1 leading-relaxed">{row.notes}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: STEP-BY-STEP VISUAL GUIDE FOR OLD AND NEW LG TVs */}
        {activeTab === 'guide' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <article className="p-5 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-3">
              <div className="text-xs font-mono font-bold text-[#00F593]">
                PASO 1 · ACTIVAR DEV MODE (MUY FÁCIL)
              </div>
              <h2 className="text-base font-display font-bold text-white">
                En tu tele LG (Antiguas webOS 3–5 y Nuevas 6–24+)
              </h2>
              <ol className="text-xs text-zinc-300 space-y-2.5 pl-5 list-decimal leading-relaxed">
                <li>
                  <strong className="text-white">Cuenta gratis:</strong> regístrate desde el móvil o PC en{' '}
                  <code className="text-[#A78BFA]">webostv.developer.lge.com</code>.
                </li>
                <li>
                  <strong className="text-white">Baja la app en la TV:</strong> abre{' '}
                  <strong className="text-white">LG Content Store / Apps</strong>, busca{' '}
                  <strong className="text-white">Developer Mode</strong> e instálala.
                </li>
                <li>
                  <strong className="text-white">Inicia sesión y activa:</strong> abre{' '}
                  <strong className="text-white">Developer Mode</strong> en la tele, inicia sesión y pon{' '}
                  <strong className="text-[#00F593]">Dev Mode Status → ON</strong> (la TV se reiniciará sola).
                </li>
                <li>
                  <strong className="text-white">Activa la llave:</strong> vuelve a abrir{' '}
                  <strong className="text-white">Developer Mode</strong> y activa{' '}
                  <strong className="text-[#00F593]">Key Server → ON</strong>. Apunta la{' '}
                  <strong className="text-white">IP</strong> y la <strong className="text-white">Passphrase</strong> (6 letras/números) que ves en pantalla.
                </li>
              </ol>
            </article>

            <article className="p-5 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-3">
              <div className="text-xs font-mono font-bold text-[#60A5FA]">
                PASO 2 · INSTALAR EL .IPK O ABRIR EN PUBLISH
              </div>
              <h2 className="text-base font-display font-bold text-white">
                Conectado a tu Publish ({PUBLISHED_RIFFAN_ORIGIN})
              </h2>
              <ul className="text-xs text-zinc-300 space-y-2.5 leading-relaxed">
                <li>
                  <strong className="text-white">Opción A — Directo en el navegador de la tele (Sin PC y sin descargar nada):</strong>{' '}
                  Abre el navegador web de tu LG TV y entra directo a{' '}
                  <span className="inline-flex items-center gap-1.5 flex-wrap mt-1">
                    <code className="text-[#00F593] bg-black px-2 py-0.5 rounded border border-white/10 break-all">{liveTvUrl}</code>
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => void handleCopy(liveTvUrl, 'live-webos-url')}
                      className="px-2 py-0.5 rounded bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-bold text-white cursor-pointer"
                    >
                      {copiedId === 'live-webos-url' ? 'Copiado' : 'Copiar URL'}
                    </button>
                  </span>{' '}
                  y guárdalo en Favoritos / Acceso rápido.
                </li>
                <li>
                  <strong className="text-white">Opción B — Instalar icono nativo .ipk desde PC (webOS Dev Manager):</strong>{' '}
                  Descarga tu <code className="text-[#A78BFA]">.ipk</code> aquí en el PC (o desde <code className="text-zinc-200">/tvlg.ipk</code>), abre <strong className="text-white">webOS Dev Manager</strong>, añade la <strong className="text-white">IP + Passphrase</strong> y pulsa <strong className="text-white">Install</strong>.{' '}
                  <span className="text-zinc-400">(LG webOS no permite instalar archivos .ipk descargados directamente desde el navegador de la TV, como sí ocurre en Android).</span>
                </li>
                <li>
                  <strong className="text-white">Consejo LG Antiguas (2016–2020):</strong>{' '}
                  El modo Dev caduca cada 999h si no pulsas <em>Extend</em>; si instalas <strong className="text-white">webOS Homebrew Channel</strong> una vez desde Dev Manager, te queda <strong className="text-[#00F593]">permanente</strong>.
                </li>
              </ul>
            </article>

            <article className="md:col-span-2 p-5 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#A78BFA]" />
                  <span>Comandos rápidos webOS CLI (@webosose/ares-cli)</span>
                </h3>
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() =>
                    void handleCopy(
                      'ares-setup-device\nares-install --device lgtv com.riffantv.webos_1.0.0_universal.ipk\nares-launch --device lgtv com.riffantv.webos',
                      'ares'
                    )
                  }
                  className="min-h-9 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'ares' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-[#00F593]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedId === 'ares' ? 'Copiado' : 'Copiar comandos'}</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-2xl bg-[#000000] border border-white/[0.08] text-xs font-mono text-zinc-200 overflow-x-auto">
{`ares-setup-device
ares-install --device lgtv com.riffantv.webos_1.0.0_universal.ipk
ares-launch --device lgtv com.riffantv.webos`}
              </pre>
            </article>
          </div>
        )}

        {/* TAB 3: GITHUB ACTIONS WORKFLOW */}
        {activeTab === 'github' && (
          <div className="p-5 sm:p-6 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 max-w-2xl">
                <h2 className="text-lg font-display font-bold text-white">
                  Compilación automática en la nube (.github/workflows/build-webos-ipk.yml)
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Al lanzar el workflow en GitHub Actions genera automáticamente dos archivos{' '}
                  <code className="text-zinc-200">.ipk</code>: uno <strong className="text-white">Universal (webOS 3–24+)</strong> para TVs antiguas y nuevas, y otro <strong className="text-white">Modern Offline (webOS 6–24+)</strong> con el bundle completo.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => void handleDownloadFullWorkflow()}
                  className="min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar workflow completo</span>
                </button>
              </div>
            </div>

            <pre className="p-4 rounded-2xl bg-[#000000] border border-white/[0.08] text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed">
              {WORKFLOW_SUMMARY_SNIPPET}
            </pre>
          </div>
        )}

        {/* TAB 4: LIVE LG MAGIC REMOTE INSPECTOR */}
        {activeTab === 'remote' && (
          <div className="p-5 sm:p-6 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-display font-bold text-white">
                  Inspector de LG Magic Remote & Mando Clásico
                </h2>
                <p className="text-xs text-zinc-400">
                  Pulsa cualquier botón del mando o teclado para verificar la señal reconocida en webOS 3.0–24+.
                </p>
              </div>

              <div className="px-4 py-2.5 rounded-2xl bg-[#000000] border border-white/[0.12] min-w-[220px] text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Última señal recibida
                </div>
                <div className="text-sm font-mono font-bold text-[#00F593] tabular-nums">
                  {lastKeyInfo
                    ? `${lastKeyInfo.action} · keyCode ${lastKeyInfo.code}`
                    : 'Esperando pulsación...'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {remoteButtons.map((item) => {
                const isActive =
                  lastKeyInfo &&
                  item.action.toLowerCase().includes(String(lastKeyInfo.action).toLowerCase());
                return (
                  <button
                    key={item.label}
                    type="button"
                    data-tv-focusable="true"
                    onClick={() => triggerHaptic('light')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#7C3AED]/20 border-[#8B5CF6]'
                        : 'bg-[#000000] border-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{item.label}</span>
                      <span className="text-[11px] font-mono text-[#A78BFA] tabular-nums">
                        {item.keyCode}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">{item.action}</p>
                  </button>
                );
              })}
            </div>

            <div className="p-3.5 rounded-2xl bg-[#000000] border border-white/[0.08] flex items-center gap-3 text-xs text-zinc-300">
              <Monitor className="w-4 h-4 text-[#A78BFA] shrink-0" />
              <span>
                La tecla Back de LG (keyCode 461) retrocede paso a paso y en la raíz invoca{' '}
                <code className="text-zinc-200">webOS.platformBack()</code> sin cerrar la app por accidente.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
