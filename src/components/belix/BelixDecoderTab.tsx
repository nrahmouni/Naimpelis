import React, { useEffect, useMemo, useState } from 'react';
import { Code2, Cpu, FileCode2, Info, Loader2, Play, Server, ShieldCheck } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  BelixApiEndpoint,
  BelixAppExternalUrl,
  BelixCodeFileNode,
  BelixDecodeResult,
  BelixDynamicRoute,
  BelixReverseEngineeringUpdate,
} from './belixTypes';

interface BelixDecoderTabProps {
  lang: AppLanguage;
  initialInput?: string;
  reverseEngineeringUpdate?: BelixReverseEngineeringUpdate;
  apiEndpoints: BelixApiEndpoint[];
  apiParams: string[];
  dynamicRoutes: BelixDynamicRoute[];
  streamingNotes: string[];
  appExternalUrls: BelixAppExternalUrl[];
  codeFiles: BelixCodeFileNode[];
  limitations: string[];
}

const SAMPLE_INPUTS = [
  'http://1.sharkpro.ink:80/get.php?username=demo&password=secret&type=m3u_plus',
  'http://1.sharkpro.ink:80/player_api.php?username=demo&password=secret',
  'Lcom/rtx/niceibo/mURL;->weblink',
  'com.rtx.niceibo.activity.aaaaaaaaaaLogin',
  'https://activation.iboplayer.com',
];

const ENDPOINT_GROUP_LABELS: Record<BelixApiEndpoint['group'], string> = {
  auth_epg: 'Autenticación y EPG',
  live: 'TV en Directo (Live)',
  vod: 'Películas (VOD)',
  series: 'Series',
};

const CODE_LAYER_LABELS: Record<BelixCodeFileNode['layer'], string> = {
  auth_native: '1. Activación IBO RTX y Capa Nativa (.so)',
  api_builder: '2. Clientes Retrofit API y Constructor Xtream',
  playback_model: '3. Reproducción ExoPlayer y Modelos Realm',
};

export const BelixDecoderTab: React.FC<BelixDecoderTabProps> = ({
  lang,
  initialInput = '',
  reverseEngineeringUpdate,
  apiEndpoints,
  apiParams,
  dynamicRoutes,
  streamingNotes,
  appExternalUrls,
  codeFiles,
  limitations,
}) => {
  const [inputValue, setInputValue] = useState(initialInput || SAMPLE_INPUTS[0]);
  const [decoding, setDecoding] = useState(false);
  const [decoded, setDecoded] = useState<BelixDecodeResult | null>(null);

  const runDecode = async (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    setDecoding(true);
    triggerHaptic('light');
    try {
      const res = await fetch('/api/belix/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: clean }),
      });
      const json = (await res.json().catch(() => null)) as { decoded?: BelixDecodeResult } | null;
      if (json?.decoded) setDecoded(json.decoded);
    } finally {
      setDecoding(false);
    }
  };

  useEffect(() => {
    if (initialInput) {
      setInputValue(initialInput);
      void runDecode(initialInput);
    } else {
      void runDecode(SAMPLE_INPUTS[0]);
    }
  }, [initialInput]);

  const groupedCodeLayers = useMemo(() => {
    const order: BelixCodeFileNode['layer'][] = ['auth_native', 'api_builder', 'playback_model'];
    return order
      .map((layer) => ({
        layer,
        label: CODE_LAYER_LABELS[layer],
        items: codeFiles.filter((c) => c.layer === layer),
      }))
      .filter((g) => g.items.length > 0);
  }, [codeFiles]);

  const groupedEndpoints = useMemo(() => {
    const order: BelixApiEndpoint['group'][] = ['auth_epg', 'live', 'vod', 'series'];
    return order
      .map((group) => ({
        group,
        label: ENDPOINT_GROUP_LABELS[group],
        items: apiEndpoints.filter((ep) => ep.group === group),
      }))
      .filter((g) => g.items.length > 0);
  }, [apiEndpoints]);

  return (
    <div className="space-y-6">
      {/* SECTION 0: REVERSE ENGINEERING REPORT UPDATE */}
      {reverseEngineeringUpdate && (
        <section className="rounded-[24px] bg-[#0D0D12] border border-[#F43F5E]/30 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="space-y-1">
              <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#F43F5E]" />
                <span>
                  {pickLang(lang, {
                    es: 'Actualización de Ingeniería Inversa · Origen y Host Verificado',
                    ca: 'Actualització d’Enginyeria Inversa · Origen i Host Verificat',
                    en: 'Reverse Engineering Update · Verified Base App & Host',
                  })}
                </span>
              </h2>
              <p className="text-xs text-zinc-300">{reverseEngineeringUpdate.summaryText}</p>
            </div>
            <span className="font-mono text-[11px] font-bold text-[#F43F5E] shrink-0">
              {reverseEngineeringUpdate.forkPackage}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 space-y-1">
              <p className="text-[11px] font-semibold text-zinc-400">Framework Base (Reskin)</p>
              <p className="font-bold text-white">{reverseEngineeringUpdate.baseFramework}</p>
              <p className="font-mono text-[11px] text-[#818CF8]">
                {reverseEngineeringUpdate.originalPackages.join(' · ')}
              </p>
              <p className="text-[11px] text-zinc-400">
                Reskin compilado por {reverseEngineeringUpdate.developerAlias}.
              </p>
            </div>

            <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 space-y-1">
              <p className="text-[11px] font-semibold text-zinc-400">Host IPTV Inyectado</p>
              <p className="font-bold text-white">{reverseEngineeringUpdate.panelName}</p>
              <p className="font-mono text-[11px] text-emerald-400 break-all">
                {reverseEngineeringUpdate.injectedEndpoint}
              </p>
              <p className="text-[11px] text-zinc-400">
                Inyectado dinámicamente en runtime al validar la licencia.
              </p>
            </div>

            <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 space-y-1">
              <p className="text-[11px] font-semibold text-zinc-400">Licencias IBO Player</p>
              <ul className="space-y-0.5 font-mono text-[11px] text-zinc-200">
                {reverseEngineeringUpdate.activationDomains.map((dom) => (
                  <li key={dom}>· {dom}</li>
                ))}
              </ul>
              <p className="text-[11px] text-zinc-400">
                Validan dispositivos y códigos numéricos originales.
              </p>
            </div>

            <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 space-y-1">
              <p className="text-[11px] font-semibold text-zinc-400">Ofuscación y Evidencia</p>
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                {reverseEngineeringUpdate.obfuscationMethod}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px] font-mono">
            <div className="rounded-xl bg-[#000000] border border-white/[0.08] px-3.5 py-2.5 space-y-1">
              <p className="font-sans text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#F43F5E]" />
                <span>Playlist M3U Plus (Shark Pro)</span>
              </p>
              <p className="text-zinc-200 break-all">{reverseEngineeringUpdate.playlistTemplate}</p>
            </div>
            <div className="rounded-xl bg-[#000000] border border-white/[0.08] px-3.5 py-2.5 space-y-1">
              <p className="font-sans text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-[#818CF8]" />
                <span>Player API Xtream (Shark Pro)</span>
              </p>
              <p className="text-zinc-200 break-all">{reverseEngineeringUpdate.playerApiTemplate}</p>
            </div>
          </div>
        </section>
      )}

      {/* DECODER INPUT */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#818CF8]" />
            <span>
              {pickLang(lang, {
                es: 'Decodificador de Rutas Shark Pro, Licencias IBO & Smali',
                ca: 'Descodificador de Rutes Shark Pro, Llicències IBO i Smali',
                en: 'Shark Pro Route, IBO Licensing & Smali Decoder',
              })}
            </span>
          </h2>
          <p className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Analiza URLs Xtream de 1.sharkpro.ink, dominios iboplayer, rutas /live/, /movie/, /series/ o descriptores Dalvik.',
              ca: 'Analitza URLs Xtream de 1.sharkpro.ink, dominis iboplayer o descriptors Dalvik.',
              en: 'Inspect 1.sharkpro.ink Xtream URLs, iboplayer domains, /live/, /movie/, /series/ paths or Dalvik descriptors.',
            })}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runDecode(inputValue);
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="http://1.sharkpro.ink:80/player_api.php?username=demo&password=secret"
            className="flex-1 min-h-11 px-4 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#818CF8]/60 text-xs font-mono text-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={decoding}
            className="min-h-11 px-5 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
          >
            {decoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{pickLang(lang, { es: 'Decodificar', ca: 'Desxifrar', en: 'Decode' })}</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {SAMPLE_INPUTS.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => {
                setInputValue(sample);
                void runDecode(sample);
              }}
              className="min-h-9 px-3 rounded-lg bg-[#000000] hover:bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-zinc-300 cursor-pointer truncate max-w-full"
            >
              {sample}
            </button>
          ))}
        </div>

        {decoded && (
          <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#F43F5E]">{decoded.detectedType}</span>
              {decoded.smaliOriginRef && (
                <span className="font-mono text-[11px] text-[#818CF8] break-all">
                  {decoded.smaliOriginRef}
                </span>
              )}
            </div>

            {decoded.xtreamBreakdown && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Host Base</p>
                  <p className="font-mono text-zinc-200 truncate">{decoded.xtreamBreakdown.baseHost}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Tipo de Ruta</p>
                  <p className="font-mono text-zinc-200">{decoded.xtreamBreakdown.routeKind}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-zinc-500">ID / Acción</p>
                  <p className="font-mono text-zinc-200 truncate">
                    {decoded.xtreamBreakdown.streamId || decoded.xtreamBreakdown.action || '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Extensión</p>
                  <p className="font-mono text-zinc-200">
                    {decoded.xtreamBreakdown.extension || 'JSON / XML'}
                  </p>
                </div>
              </div>
            )}

            <ul className="space-y-1 text-xs text-zinc-300">
              {decoded.notes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ORDERED ARCHITECTURE LAYERS: IBO RTX AUTH / NATIVE .SO + API + PLAYBACK */}
      <section className="space-y-4">
        <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-[#F43F5E]" />
          <span>
            {pickLang(lang, {
              es: `Arquitectura Ordenada por Capas (${codeFiles.length} Módulos + ${appExternalUrls.length} URLs Externas)`,
              ca: `Arquitectura Ordenada per Capes (${codeFiles.length} Mòduls + ${appExternalUrls.length} URLs Externes)`,
              en: `Layered Architecture (${codeFiles.length} Modules + ${appExternalUrls.length} External URLs)`,
            })}
          </span>
        </h2>

        <div className="space-y-4">
          {groupedCodeLayers.map((group) => (
            <div key={group.layer} className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {group.label}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.items.map((node) => (
                  <div
                    key={node.file}
                    className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-white">{node.component}</h4>
                      <button
                        type="button"
                        onClick={() => {
                          setInputValue(node.file);
                          void runDecode(node.file);
                        }}
                        className="text-[11px] font-semibold text-[#818CF8] hover:underline cursor-pointer"
                      >
                        Inspeccionar
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-zinc-400 break-all">{node.file}</p>
                    <p className="text-xs text-zinc-300">{node.role}</p>
                    <p className="text-[11px] text-zinc-400">{node.mechanism}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              4. Derivación a Reproductores y Tráilers Externos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {appExternalUrls.map((appUrl) => (
                <div
                  key={appUrl.url}
                  className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-1.5"
                >
                  <h4 className="text-sm font-bold text-white">{appUrl.role}</h4>
                  <p className="font-mono text-[11px] text-[#F43F5E] break-all">{appUrl.url}</p>
                  <p className="font-mono text-[10px] text-zinc-500 break-all">
                    Orígenes: {appUrl.origins.join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FULL 15 XTREAM API ENDPOINTS ORDERED BY FUNCTIONAL GROUP */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#818CF8]" />
            <span>
              {pickLang(lang, {
                es: `Catálogo Ordenado: ${apiEndpoints.length} Endpoints API & ${dynamicRoutes.length} Rutas Dinámicas`,
                ca: `Catàleg Ordenat: ${apiEndpoints.length} Endpoints API i ${dynamicRoutes.length} Rutes Dinàmiques`,
                en: `Ordered Spec: ${apiEndpoints.length} API Endpoints & ${dynamicRoutes.length} Dynamic Routes`,
              })}
            </span>
          </h2>
          <span className="font-mono text-[11px] text-zinc-400">
            Parámetros: {apiParams.join(' · ')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {dynamicRoutes.map((dyn) => (
            <div
              key={dyn.id}
              className="rounded-xl bg-[#000000] border border-white/[0.08] px-3.5 py-3 space-y-1"
            >
              <p className="text-xs font-bold text-white">{dyn.label}</p>
              <p className="font-mono text-[11px] text-[#F43F5E] break-all">{dyn.template}</p>
              <p className="text-[11px] text-zinc-400">{dyn.notes}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groupedEndpoints.map((group) => (
            <div
              key={group.group}
              className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                <h3 className="text-xs font-bold text-white">{group.label}</h3>
                <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                  {group.items.length} endpoints
                </span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {group.items.map((ep) => (
                  <div
                    key={ep.id}
                    className="py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{ep.label}</p>
                      <p className="font-mono text-[11px] text-zinc-400 truncate">{ep.path}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInputValue(ep.path);
                        void runDecode(ep.path);
                      }}
                      className="text-[11px] font-semibold text-[#818CF8] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Decodificar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3 & 8: STREAMING ENGINE NOTES & LIMITATIONS */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-3">
        <h2 className="font-display font-bold text-sm text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-zinc-400" />
          <span>Notas del Motor de Streaming y Alcance del Análisis</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
          <ul className="space-y-1.5">
            {streamingNotes.map((note, idx) => (
              <li key={idx}>· {note}</li>
            ))}
          </ul>
          <ul className="space-y-1.5 text-zinc-400">
            {limitations.map((lim, idx) => (
              <li key={idx}>· {lim}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};
