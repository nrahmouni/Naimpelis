import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Cpu,
  FileVideo,
  Globe,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  RbtvArchitectureNode,
  RbtvDecodeResult,
  RbtvMediaFormat,
} from './rbtvTypes';

interface RbtvDecoderTabProps {
  lang: AppLanguage;
  initialInput?: string;
  architectureNodes: RbtvArchitectureNode[];
  pathsByHost: Array<{ host: string; paths: string[] }>;
  mediaFormats: RbtvMediaFormat[];
}

const PRESETS = [
  {
    label: 'RBTV77 NetworkInterceptor',
    value: 'https://www.rbtv77.com',
    runDoh: true,
    fetchLive: true,
  },
  {
    label: 'API Directos (.cfd)',
    value: 'https://apis-live.ta2mnt200stayr2.cfd',
    runDoh: true,
    fetchLive: true,
  },
  {
    label: 'API Catálogo (.cfd)',
    value: 'https://apis-data10.tcrbg61levl.cfd',
    runDoh: true,
    fetchLive: false,
  },
  {
    label: 'ParamsManager (.bond/v1)',
    value: 'https://vip1.openaicommunities.bond/v1',
    runDoh: true,
    fetchLive: true,
  },
  {
    label: 'P2P AbsProxy (Smali)',
    value: 'http://%s:%d%s',
    runDoh: false,
    fetchLive: false,
  },
  {
    label: 'Affiliate VPN (Constants)',
    value: 'https://go.nordvpn.net/aff_c?offer_id=15&aff_id=85448',
    runDoh: false,
    fetchLive: false,
  },
];

export const RbtvDecoderTab: React.FC<RbtvDecoderTabProps> = ({
  lang,
  initialInput = '',
  architectureNodes,
  pathsByHost,
  mediaFormats,
}) => {
  const [inputValue, setInputValue] = useState(initialInput || PRESETS[0].value);
  const [runDoh, setRunDoh] = useState(true);
  const [fetchLiveSample, setFetchLiveSample] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [decodedResult, setDecodedResult] = useState<RbtvDecodeResult | null>(null);
  const [pathFilter, setPathFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const runDecode = async (val: string, dohFlag: boolean, liveFlag: boolean) => {
    const clean = val.trim();
    if (!clean) return;
    setDecoding(true);
    try {
      const res = await fetch('/api/rbtv/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: clean,
          runDoh: dohFlag,
          fetchLiveSample: liveFlag,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        decoded?: RbtvDecodeResult;
      } | null;
      if (json?.success && json.decoded) {
        setDecodedResult(json.decoded);
      }
    } finally {
      setDecoding(false);
    }
  };

  useEffect(() => {
    if (initialInput) {
      setInputValue(initialInput);
      void runDecode(initialInput, true, false);
    } else if (!decodedResult) {
      void runDecode(PRESETS[0].value, true, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput]);

  const filteredPaths = useMemo(() => {
    const q = pathFilter.trim().toLowerCase();
    if (!q) return pathsByHost;
    return pathsByHost.filter(
      (item) =>
        item.host.toLowerCase().includes(q) ||
        item.paths.some((p) => p.toLowerCase().includes(q))
    );
  }, [pathsByHost, pathFilter]);

  const copyText = async (id: string, txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedId(id);
      triggerHaptic('light');
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. INTERACTIVE INSPECTOR & DOH RESOLVER */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-base sm:text-lg text-white flex items-center gap-2">
              <Code2 className="w-5 h-5 text-[#F59E0B]" />
              <span>
                {pickLang(lang, {
                  es: 'Inspector RBTV+ y Resolvedor DoH en Vivo',
                  ca: 'Inspector RBTV+ i Resolutor DoH en Directe',
                  en: 'RBTV+ Inspector & Live DoH DNS Resolver',
                })}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              {pickLang(lang, {
                es: 'Analiza cualquier URL, endpoint /v1, clase Smali/Java o dominio .cfd/.bond y resuelve su IP por DNS-over-HTTPS.',
                ca: 'Analitza qualsevol URL o domini RBTV+ i resol la seva IP via DoH.',
                en: 'Inspect any RBTV+ URL, /v1 node or Smali component and check live DNS via DoH.',
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setInputValue(p.value);
                setRunDoh(p.runDoh);
                setFetchLiveSample(p.fetchLive);
                void runDecode(p.value, p.runDoh, p.fetchLive);
              }}
              className="min-h-10 px-3 rounded-xl bg-white/[0.05] hover:bg-[#F59E0B]/20 border border-white/[0.08] text-xs font-semibold text-zinc-200 cursor-pointer transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="https://apis-live.ta2mnt200stayr2.cfd"
            className="flex-1 min-h-11 px-4 rounded-2xl bg-[#000000] border border-white/[0.1] focus:border-[#F59E0B] text-xs sm:text-sm font-mono text-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void runDecode(inputValue, runDoh, fetchLiveSample)}
            disabled={decoding}
            className="min-h-11 px-5 rounded-2xl bg-[#F59E0B] hover:bg-[#D97706] text-black text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
          >
            {decoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{pickLang(lang, { es: 'Analizar', ca: 'Analitzar', en: 'Inspect' })}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={runDoh}
              onChange={(e) => setRunDoh(e.target.checked)}
              className="accent-[#06B6D4] w-4 h-4"
            />
            <span>Consultar DNS vía DoH (`cloudflare-dns.com/dns-query`)</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fetchLiveSample}
              onChange={(e) => setFetchLiveSample(e.target.checked)}
              className="accent-[#F59E0B] w-4 h-4"
            />
            <span>Previsualizar respuesta HTTP del nodo (con cabeceras RBTV77)</span>
          </label>
        </div>

        {decodedResult && (
          <div className="rounded-2xl bg-black/60 border border-white/[0.08] p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-[#FBBF24]">{decodedResult.detectedType}</span>
              {decodedResult.componentRef && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="font-mono text-[#A78BFA]">{decodedResult.componentRef}</span>
                </>
              )}
            </div>

            {decodedResult.notes.length > 0 && (
              <ul className="space-y-1 text-xs text-zinc-300">
                {decodedResult.notes.map((n, idx) => (
                  <li key={idx}>• {n}</li>
                ))}
              </ul>
            )}

            {decodedResult.urlBreakdown && (
              <pre className="text-[11px] font-mono text-sky-300 bg-[#0D0D12] p-3 rounded-xl overflow-x-auto border border-white/[0.06]">
                {JSON.stringify(decodedResult.urlBreakdown, null, 2)}
              </pre>
            )}

            {decodedResult.dohLookup && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  <span>
                    Resolución DoH ({decodedResult.dohLookup.provider} ·{' '}
                    {decodedResult.dohLookup.latencyMs}ms)
                  </span>
                </div>
                <pre className="text-[11px] font-mono text-emerald-300 bg-[#0D0D12] p-3 rounded-xl overflow-x-auto border border-emerald-500/20">
                  {JSON.stringify(decodedResult.dohLookup, null, 2)}
                </pre>
              </div>
            )}

            {decodedResult.livePayloadPreview !== undefined &&
              decodedResult.livePayloadPreview !== null && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-amber-300">
                    Respuesta en vivo del endpoint:
                  </div>
                  <pre className="text-[11px] font-mono text-amber-200 bg-[#0D0D12] p-3 rounded-xl overflow-x-auto max-h-60 border border-amber-500/20">
                    {JSON.stringify(decodedResult.livePayloadPreview, null, 2)}
                  </pre>
                </div>
              )}
          </div>
        )}
      </section>

      {/* 2. RECONSTRUCTED JAVA/SMALI ARCHITECTURE */}
      <section className="space-y-3">
        <h3 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#A78BFA]" />
          <span>Arquitectura Reconstruida de RBTV+ ({architectureNodes.length} componentes)</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {architectureNodes.map((node) => (
            <div
              key={node.component}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{node.component}</p>
                  <p className="text-[11px] font-mono text-[#A78BFA] truncate">{node.javaRef}</p>
                </div>
              </div>
              <p className="text-xs text-zinc-300">{node.role}</p>
              <p className="text-[11px] text-zinc-400">{node.mechanism}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {node.endpoints.map((ep) => (
                  <button
                    key={ep}
                    type="button"
                    onClick={() => void copyText(ep, ep)}
                    className="px-2.5 py-1 rounded-lg bg-black/55 border border-white/[0.08] hover:border-[#F59E0B]/50 text-[11px] font-mono text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="truncate max-w-[230px]">{ep}</span>
                    {copiedId === ep ? (
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <Copy className="w-3 h-3 text-zinc-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. SECTION 3: 14 MEDIA FORMATS */}
      <section className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-3">
        <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
          <FileVideo className="w-4 h-4 text-[#06B6D4]" />
          <span>Formatos Multimedia Soportados (Sección 3 · {mediaFormats.length})</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {mediaFormats.map((fmt) => (
            <div
              key={fmt.ext}
              className="rounded-xl bg-black/45 border border-white/[0.06] px-3 py-2.5 space-y-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-[#06B6D4]">{fmt.ext}</span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {fmt.kind}
                </span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-snug">{fmt.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. SECTION 2: ALL PATHS BY HOST */}
      <section className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="font-display font-bold text-sm text-white">
            Sección 2 · Rutas y Paths Extraídos ({filteredPaths.length} hosts)
          </h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={pathFilter}
              onChange={(e) => setPathFilter(e.target.value)}
              placeholder="Filtrar /dns-query, /v1, /resolve..."
              className="w-full min-h-10 pl-9 pr-3 rounded-xl bg-black/60 border border-white/[0.08] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#F59E0B]/60"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
          {filteredPaths.map((grp) => (
            <div
              key={grp.host}
              className="rounded-xl bg-black/45 border border-white/[0.06] p-3 space-y-1"
            >
              <p className="text-xs font-mono font-bold text-white">{grp.host}</p>
              <div className="space-y-0.5">
                {grp.paths.map((p) => (
                  <p key={p} className="text-[11px] font-mono text-zinc-400 break-all">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
