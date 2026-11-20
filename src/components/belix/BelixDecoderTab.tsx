import React, { useEffect, useState } from 'react';
import { Code2, Cpu, FileCode2, Info, Loader2, Play } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  BelixApiEndpoint,
  BelixAppExternalUrl,
  BelixCodeFileNode,
  BelixDecodeResult,
  BelixDynamicRoute,
} from './belixTypes';

interface BelixDecoderTabProps {
  lang: AppLanguage;
  initialInput?: string;
  apiEndpoints: BelixApiEndpoint[];
  apiParams: string[];
  dynamicRoutes: BelixDynamicRoute[];
  streamingNotes: string[];
  appExternalUrls: BelixAppExternalUrl[];
  codeFiles: BelixCodeFileNode[];
  limitations: string[];
}

const SAMPLE_INPUTS = [
  '/player_api.php?action=get_live_streams&category_id=12',
  'https://iptv-portal.ejemplo.com/live/demo/secret/8841.ts',
  'https://iptv-portal.ejemplo.com/get.php?username=demo&password=secret&output=ts&type=m3u_plus',
  'https://t.me/shadeedtv',
  'GetSharedInfo.smali',
];

export const BelixDecoderTab: React.FC<BelixDecoderTabProps> = ({
  lang,
  initialInput = '',
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

  return (
    <div className="space-y-6">
      {/* DECODER INPUT */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#818CF8]" />
            <span>
              {pickLang(lang, {
                es: 'Decodificador de Rutas Xtream & Referencias Smali',
                ca: 'Descodificador de Rutes Xtream i Referències Smali',
                en: 'Xtream Route & Smali Reference Decoder',
              })}
            </span>
          </h2>
          <p className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Analiza cualquier URL Xtream (/live/, /movie/, /series/, /player_api.php, /get.php), dominio Belix o clase Java/Smali.',
              ca: 'Analitza qualsevol URL Xtream, domini Belix o classe Java/Smali.',
              en: 'Inspect any Xtream URL (/live/, /movie/, /series/, /player_api.php, /get.php), Belix host or Smali class.',
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
            placeholder="/player_api.php?action=get_vod_info&vod_id=501"
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

      {/* ARCHITECTURE NODES: 5 KEY SMALI CLASSES + 3 APP EXTERNAL URLS */}
      <section className="space-y-3">
        <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-[#F43F5E]" />
          <span>
            {pickLang(lang, {
              es: 'Arquitectura Smali com.ibopro.ultra (5 Clases + 3 URLs Externas)',
              ca: 'Arquitectura Smali com.ibopro.ultra (5 Classes + 3 URLs Externes)',
              en: 'com.ibopro.ultra Smali Architecture (5 Key Classes + 3 App URLs)',
            })}
          </span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {codeFiles.map((node) => (
            <div
              key={node.file}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">{node.component}</h3>
                <button
                  type="button"
                  onClick={() => {
                    setInputValue(node.component);
                    void runDecode(node.component);
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

          {appExternalUrls.map((appUrl) => (
            <div
              key={appUrl.url}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-1.5"
            >
              <h3 className="text-sm font-bold text-white">{appUrl.role}</h3>
              <p className="font-mono text-[11px] text-[#F43F5E] break-all">{appUrl.url}</p>
              <p className="font-mono text-[10px] text-zinc-500 break-all">
                Orígenes: {appUrl.origins.join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FULL 15 XTREAM API ENDPOINTS + 6 PARAMS + 4 DYNAMIC ROUTES */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#818CF8]" />
            <span>
              {pickLang(lang, {
                es: 'Catálogo Completo: 15 Endpoints API & 4 Rutas Dinámicas',
                ca: 'Catàleg Complet: 15 Endpoints API i 4 Rutes Dinàmiques',
                en: 'Full Spec: 15 API Endpoints & 4 Dynamic Stream Templates',
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

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-zinc-400">
                <th className="py-2 pr-3 font-semibold">Función</th>
                <th className="py-2 pr-3 font-semibold">Ruta Relativa</th>
                <th className="py-2 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {apiEndpoints.map((ep) => (
                <tr key={ep.id} className="hover:bg-white/[0.02]">
                  <td className="py-2 pr-3 text-white font-medium">{ep.label}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-zinc-300">{ep.path}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setInputValue(ep.path);
                        void runDecode(ep.path);
                      }}
                      className="text-[11px] font-semibold text-[#818CF8] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      Decodificar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3 & 8: STREAMING ENGINE NOTES & LIMITATIONS */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-3">
        <h2 className="font-display font-bold text-sm text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-zinc-400" />
          <span>Notas del Motor de Streaming y Alcance Estático</span>
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
