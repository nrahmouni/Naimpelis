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
import { generateTizenConfigXml } from '../../utils/tizenConfigGenerator';
import { mapKeyboardEventToTvAction, type TvRemoteAction } from '../../utils/tvSpatialNav';
import { triggerWgtBrowserDownload } from '../../utils/tizenWgtBuilder';
import { SamsungWgtExportPanel } from './SamsungWgtExportPanel';

interface SamsungTvGuidePageProps {
  onBack: () => void;
  onOpenTvReceiver?: () => void;
}

type GuideTab = 'export' | 'guide' | 'github' | 'remote';

const WORKFLOW_SUMMARY_SNIPPET = `name: Build & Auto-Sign Samsung Tizen (.wgt)
on: [workflow_dispatch, push]
jobs:
  build-sign-wgt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci && npx vite build --base=./
      - run: cp config.xml dist/ && cp public/pwa-512x512.png dist/icon.png
      - run: tizen package -t wgt -s riffan_tv_profile -o release-wgt -- dist
      - uses: actions/upload-artifact@v4
        with: { name: riffantv-samsung-tizen-wgt, path: release-wgt/*.wgt }`;

export const SamsungTvGuidePage: React.FC<SamsungTvGuidePageProps> = ({
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

  useBackInterceptor(true, 'samsung-tv-guide-page', onBack, { priority: 65 });

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

  const canonicalXml = generateTizenConfigXml();

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
      const res = await fetch('/api/tv/tizen-workflow.yml');
      if (res.ok) {
        const text = await res.text();
        triggerWgtBrowserDownload(
          new Blob([text], { type: 'text/yaml;charset=utf-8' }),
          'build-tizen-wgt.yml'
        );
        return;
      }
    } catch {
      // fallback to snippet
    }
    triggerWgtBrowserDownload(
      new Blob([WORKFLOW_SUMMARY_SNIPPET], { type: 'text/yaml;charset=utf-8' }),
      'build-tizen-wgt.yml'
    );
  };

  const tabs: Array<{ id: GuideTab; label: string; icon: React.ReactNode }> = [
    { id: 'export', label: 'Exportar .wgt', icon: <Download className="w-4 h-4" /> },
    { id: 'guide', label: 'Guía TV (12345)', icon: <KeyRound className="w-4 h-4" /> },
    { id: 'github', label: 'Auto-Firma Nube', icon: <CloudCog className="w-4 h-4" /> },
    { id: 'remote', label: 'Test Mando TV', icon: <Gamepad2 className="w-4 h-4" /> },
  ];

  const remoteButtons: Array<{ label: string; keyCode: string; action: string }> = [
    { label: 'Arriba / Abajo / Izq / Der', keyCode: '37–40', action: 'Navegación espacial 10-Foot' },
    { label: 'OK / Enter', keyCode: '13 / 23 / 66', action: 'SELECT (Abrir / Reproducir)' },
    { label: 'Return / Back', keyCode: '10009', action: 'BACK (Volver atrás paso a paso)' },
    { label: 'Play / Pause', keyCode: '10252 / 415 / 19', action: 'PLAY_PAUSE sin perder foco' },
    { label: 'Stop', keyCode: '413', action: 'STOP (Detener vídeo y volver)' },
    { label: 'Rewind / Fast Forward', keyCode: '412 / 417', action: 'Salto -10s / +10s directo' },
    { label: 'Canal + / Canal -', keyCode: '427 / 428', action: 'Zapping TDT / Fútbol en vivo' },
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
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#A78BFA]">
                Samsung Smart TV · Tizen Web App
              </p>
              <h1 className="text-xl sm:text-3xl font-display font-black tracking-tight text-white truncate">
                Instalación y Empaquetado .wgt
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
          aria-label="Secciones de Samsung TV"
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

        {/* TAB 1: BROWSER .WGT PACKAGER */}
        {activeTab === 'export' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 p-5 sm:p-6 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-display font-bold text-white">
                  Generador .wgt directo desde el navegador
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Empaqueta automáticamente HTML/JS/CSS con rutas relativas para{' '}
                  <code className="text-zinc-200">file://</code>, el manifiesto{' '}
                  <code className="text-zinc-200">config.xml</code> y un{' '}
                  <code className="text-zinc-200">icon.png</code> válido.
                </p>
              </div>
              <SamsungWgtExportPanel />
            </section>

            <section className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-[#07070A] border border-white/[0.09] flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-[#A78BFA]" />
                    <span>Manifiesto config.xml</span>
                  </h3>
                  <button
                    type="button"
                    data-tv-focusable="true"
                    onClick={() => void handleCopy(canonicalXml, 'xml')}
                    className="min-h-9 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === 'xml' ? (
                      <>
                        <CheckCheck className="w-3.5 h-3.5 text-[#00F593]" />
                        <span className="text-[#00F593]">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar XML</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-3.5 rounded-2xl bg-[#000000] border border-white/[0.08] text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-72 leading-relaxed">
                  {canonicalXml}
                </pre>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0A0A0E] border border-white/[0.08] text-xs text-zinc-300 space-y-1.5">
                <p className="font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#00F593]" />
                  <span>Compatibilidad verificada</span>
                </p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Perfil <code className="text-zinc-200">tv-samsung</code>, compilación ES2018/Chrome 69, teclas físicas del mando registradas y salvapantallas desactivado en reproducción.
                </p>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: STEP-BY-STEP VISUAL GUIDE */}
        {activeTab === 'guide' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <article className="p-5 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-3">
              <div className="text-xs font-mono font-bold text-[#A78BFA]">PASO 01</div>
              <h2 className="text-base font-display font-bold text-white">
                Activar Developer Mode en Samsung TV
              </h2>
              <ol className="text-xs text-zinc-300 space-y-2 pl-5 list-decimal leading-relaxed">
                <li>Enciende tu Samsung TV y abre el menú <strong className="text-white">Apps</strong>.</li>
                <li>Con el mando a distancia, marca la secuencia numérica <strong className="text-white font-mono">1 2 3 4 5</strong>.</li>
                <li>En el cuadro emergente, cambia <strong className="text-white">Developer mode</strong> a <strong className="text-[#00F593]">On</strong>.</li>
                <li>Introduce la dirección <strong className="text-white">IP</strong> de tu PC o servidor local y confirma con <strong className="text-white">OK</strong>.</li>
                <li>Mantén pulsado el botón de encendido del mando 3 segundos para <strong className="text-white">reiniciar la TV</strong>.</li>
              </ol>
            </article>

            <article className="p-5 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-3">
              <div className="text-xs font-mono font-bold text-[#60A5FA]">PASO 02</div>
              <h2 className="text-base font-display font-bold text-white">
                Instalar sin Tizen Studio en PC
              </h2>
              <ul className="text-xs text-zinc-300 space-y-2.5 leading-relaxed">
                <li>
                  <strong className="text-white">Opción A — Auto-Firma en GitHub Actions:</strong>{' '}
                  Sube el código a GitHub y ejecuta el workflow incluido; obtienes un <code className="text-[#A78BFA]">.wgt</code> firmado listo para descargar al móvil.
                </li>
                <li>
                  <strong className="text-white">Opción B — Apps2Samsung / Tizen Web Installer:</strong>{' '}
                  Abre la app desde el navegador o Android en la misma Wi-Fi, pon la IP de tu TV y selecciona el archivo <code className="text-white">.wgt</code> generado aquí.
                </li>
                <li>
                  <strong className="text-white">Opción C — Navegador directo 10-Foot:</strong>{' '}
                  Entra a <code className="text-[#00F593]">/tv</code> o añade <code className="text-white">?tizen=1</code> desde el navegador integrado de tu Samsung TV sin instalar nada.
                </li>
              </ul>
            </article>

            <article className="md:col-span-2 p-5 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#A78BFA]" />
                  <span>Comandos rápidos SDB / CLI (si usas ordenador)</span>
                </h3>
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() =>
                    void handleCopy(
                      'sdb connect TU_IP_SAMSUNG_TV:26101\ntizen install -n RiffanTV-RiffanTv01.wgt -t MODELO_TV',
                      'sdb'
                    )
                  }
                  className="min-h-9 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'sdb' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-[#00F593]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedId === 'sdb' ? 'Copiado' : 'Copiar comandos'}</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-2xl bg-[#000000] border border-white/[0.08] text-xs font-mono text-zinc-200 overflow-x-auto">
{`sdb connect TU_IP_SAMSUNG_TV:26101
tizen install -n RiffanTV-RiffanTv01.wgt -t MODELO_TV`}
              </pre>
            </article>
          </div>
        )}

        {/* TAB 3: CLOUD AUTO-SIGNING GITHUB WORKFLOW */}
        {activeTab === 'github' && (
          <div className="p-5 sm:p-6 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 max-w-2xl">
                <h2 className="text-lg font-display font-bold text-white">
                  Auto-firma en la nube (.github/workflows/build-tizen-wgt.yml)
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Al hacer push o lanzar manualmente el workflow en GitHub Actions, un runner Linux compila la app con rutas relativas, genera el certificado de desarrollador y firma el <code className="text-zinc-200">.wgt</code> como artefacto descargable desde cualquier móvil.
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#000000] border border-white/[0.08]">
                <p className="text-[11px] font-bold text-[#A78BFA] uppercase">Secretos opcionales</p>
                <p className="text-xs text-zinc-300 mt-1">
                  <code className="text-white">TIZEN_CERT_PASSWORD</code>,{' '}
                  <code className="text-white">TIZEN_AUTHOR_P12_B64</code> y{' '}
                  <code className="text-white">TIZEN_DIST_P12_B64</code>. Si no existen, genera un certificado de desarrollo automático.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#000000] border border-white/[0.08]">
                <p className="text-[11px] font-bold text-[#60A5FA] uppercase">Compilación base=./</p>
                <p className="text-xs text-zinc-300 mt-1">
                  Construye con <code className="text-white">npx vite build --base=./</code> y reescribe peticiones <code className="text-white">/api/*</code> al origen público configurado.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#000000] border border-white/[0.08]">
                <p className="text-[11px] font-bold text-[#00F593] uppercase">Descarga al móvil</p>
                <p className="text-xs text-zinc-300 mt-1">
                  El <code className="text-white">.wgt</code> firmado aparece en Actions → Artifacts y en GitHub Releases al crear una etiqueta <code className="text-white">v*</code>.
                </p>
              </div>
            </div>

            <pre className="p-4 rounded-2xl bg-[#000000] border border-white/[0.08] text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed">
              {WORKFLOW_SUMMARY_SNIPPET}
            </pre>
          </div>
        )}

        {/* TAB 4: LIVE REMOTE NAVIGATION INSPECTOR */}
        {activeTab === 'remote' && (
          <div className="p-5 sm:p-6 rounded-3xl bg-[#07070A] border border-white/[0.09] space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-display font-bold text-white">
                  Inspector de Mando a Distancia Samsung Tizen
                </h2>
                <p className="text-xs text-zinc-400">
                  Pulsa cualquier flecha o tecla del mando/teclado para comprobar la acción detectada por el motor espacial.
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
                El foco espacial nunca queda huérfano: si un panel se cierra o recarga, el selector recupera el elemento visible más cercano automáticamente.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
