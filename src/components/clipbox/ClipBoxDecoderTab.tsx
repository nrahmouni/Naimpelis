import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Cpu,
  FileVideo,
  KeyRound,
  Loader2,
  Play,
  Search,
  Sparkles,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  ClipboxDecodeResponse,
  ClipboxDecodedToken,
  ClipboxMediaRef,
  ClipboxRouteKind,
  ClipboxRoutePattern,
} from './clipboxTypes';

interface ClipBoxDecoderTabProps {
  lang: AppLanguage;
  initialInput?: string;
  decodedTokens: ClipboxDecodedToken[];
  decodedProviders: Array<{ name: string; rawPattern: string; region: string }>;
  decodedExtractors: Array<{ name: string; rawPattern: string; family: string }>;
  routePatterns: ClipboxRoutePattern[];
  totalFilteredRoutes: number;
  mediaRefs: ClipboxMediaRef[];
  onPlayCustomUrl: (url: string) => void;
}

const PRESETS = [
  {
    label: 'Config Base64 (hdhub)',
    value:
      'https://hdhub.thevolecitor.qzz.io/eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAsNDgwcCIsInNvcnQiOiJkZXNjIn0=',
    fetchLive: false,
  },
  {
    label: 'VidSrc Keys (Live)',
    value: 'https://raw.githubusercontent.com/Ciarands/vidsrc-keys/main/keys.json',
    fetchLive: true,
  },
  {
    label: 'ClipBox App Settings (Live)',
    value: 'https://clipbox.mov/api/go/zoog/app-settings',
    fetchLive: true,
  },
  {
    label: 'EncDec Videasy API',
    value: 'https://enc-dec.app/api/dec-videasy',
    fetchLive: false,
  },
  {
    label: 'Mirror StreamWish .sbs',
    value: 'https://ajmidyad.sbs',
    fetchLive: false,
  },
];

export const ClipBoxDecoderTab: React.FC<ClipBoxDecoderTabProps> = ({
  lang,
  initialInput = '',
  decodedTokens,
  decodedProviders,
  decodedExtractors,
  routePatterns,
  totalFilteredRoutes,
  mediaRefs,
  onPlayCustomUrl,
}) => {
  const [inputValue, setInputValue] = useState(
    initialInput || PRESETS[0].value
  );
  const [fetchLiveKeys, setFetchLiveKeys] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [decodedResult, setDecodedResult] = useState<ClipboxDecodeResponse | null>(null);
  const [routeKindFilter, setRouteKindFilter] = useState<'all' | ClipboxRouteKind>('all');
  const [routeSearch, setRouteSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [routeLimit, setRouteLimit] = useState(80);

  const runDecode = async (val: string, liveFlag: boolean) => {
    const clean = val.trim();
    if (!clean) return;
    setDecoding(true);
    try {
      const res = await fetch('/api/clipbox/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: clean, fetchLiveSample: liveFlag }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        decoded?: ClipboxDecodeResponse;
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
      void runDecode(initialInput, false);
    } else if (!decodedResult) {
      void runDecode(PRESETS[0].value, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput]);


  const filteredRoutes = useMemo(() => {
    const q = routeSearch.trim().toLowerCase();
    return routePatterns.filter((rp) => {
      if (routeKindFilter === 'all') {
        if (!q && rp.kind === 'app_internal') return false;
      } else if (rp.kind !== routeKindFilter) {
        return false;
      }
      if (!q) return true;
      return (
        rp.pattern.toLowerCase().includes(q) ||
        (rp.decodedName || '').toLowerCase().includes(q) ||
        (rp.description || '').toLowerCase().includes(q)
      );
    });
  }, [routePatterns, routeKindFilter, routeSearch]);

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((p) => (p === id ? null : p)), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. LIVE INTERACTIVE DECODER */}
      <section className="rounded-3xl bg-[#0D0D12] border border-white/[0.1] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-base sm:text-lg text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#22D3EE]" />
              <span>
                {pickLang(lang, {
                  es: 'Descifrador de Rutas, Base64 y Extractores',
                  ca: 'Desxifrador de Rutes, Base64 i Extractors',
                  en: 'ClipBox Route, Base64 & Extractor Decoder',
                })}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Pega cualquier URL, token Base64 o clase extractora para decodificar su payload y origen.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setInputValue(p.value);
                setFetchLiveKeys(p.fetchLive);
                void runDecode(p.value, p.fetchLive);
              }}
              className="min-h-10 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-200 cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runDecode(inputValue, fetchLiveKeys);
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="https://... o cadena Base64"
            className="flex-1 min-h-11 px-3.5 rounded-xl bg-black/60 border border-white/[0.12] focus:border-[#06B6D4] text-xs sm:text-sm text-white font-mono focus:outline-none"
          />
          <button
            type="submit"
            disabled={decoding}
            className="min-h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-60"
          >
            {decoding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>Descifrar</span>
          </button>
        </form>

        {decodedResult && (
          <div className="rounded-2xl bg-black/55 border border-white/[0.08] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-[#22D3EE]">{decodedResult.detectedType}</span>
              {decodedResult.extractorFamily && (
                <span className="text-amber-300 font-medium">{decodedResult.extractorFamily}</span>
              )}
            </div>

            {decodedResult.notes.length > 0 && (
              <ul className="space-y-1 text-xs text-zinc-300">
                {decodedResult.notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            )}

            {decodedResult.base64Decoded && decodedResult.base64Decoded.length > 0 && (
              <div className="space-y-2">
                {decodedResult.base64Decoded.map((b, i) => (
                  <pre
                    key={i}
                    className="p-3 rounded-xl bg-[#090B11] border border-emerald-500/25 text-[11px] text-emerald-300 overflow-x-auto font-mono"
                  >
                    {b.json ? JSON.stringify(b.json, null, 2) : b.text}
                  </pre>
                ))}
              </div>
            )}

            {decodedResult.liveKeysPreview !== undefined && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Respuesta en vivo del endpoint remoto
                </p>
                <pre className="p-3 rounded-xl bg-[#090B11] border border-cyan-500/25 text-[11px] text-cyan-200 overflow-x-auto max-h-56 font-mono">
                  {typeof decodedResult.liveKeysPreview === 'string'
                    ? decodedResult.liveKeysPreview
                    : JSON.stringify(decodedResult.liveKeysPreview, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. AUTOMATICALLY DECODED CONFIGS & KEY REPOS FROM FILE */}
      <section className="space-y-2.5">
        <h3 className="font-display font-bold text-sm sm:text-base text-white">
          APIs de Descifrado, Keys y Payloads Hallados ({decodedTokens.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {decodedTokens.map((tok) => (
            <div
              key={tok.rawUrl}
              className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-3.5 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-white truncate">{tok.label}</p>
                  <p className="text-[11px] text-zinc-400">{tok.decodedSummary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyText(tok.rawUrl, tok.rawUrl)}
                  className="min-w-10 min-h-10 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
                >
                  {copiedId === tok.rawUrl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[11px] font-mono text-zinc-300 break-all bg-black/40 p-2 rounded-lg">
                {tok.rawUrl}
              </p>
              {tok.decodedPayload !== undefined && tok.decodedPayload !== null && (
                <pre className="text-[11px] font-mono text-emerald-300 bg-black/50 p-2.5 rounded-lg overflow-x-auto">
                  {JSON.stringify(tok.decodedPayload, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 3. RECONSTRUCTED SMALI PROVIDERS & EXTRACTORS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-3">
          <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#A78BFA]" />
            <span>Proveedores Reconstruidos (Smali/Kotlin · {decodedProviders.length})</span>
          </h3>
          <div className="space-y-1.5">
            {decodedProviders.map((prov) => (
              <div
                key={prov.name}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/45 border border-white/[0.06] text-xs"
              >
                <span className="font-semibold text-white">{prov.name}</span>
                <span className="text-zinc-400">{prov.region}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-3">
          <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#22D3EE]" />
            <span>Extractores Reconstruidos (Smali · {decodedExtractors.length})</span>
          </h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
            {decodedExtractors.map((ext) => (
              <div
                key={ext.name}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/45 border border-white/[0.06] text-xs"
              >
                <span className="font-semibold text-white">{ext.name}</span>
                <span className="text-[#22D3EE]">{ext.family}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. SECTION 3: HLS & MP4 DIRECT REFERENCES */}
      <section className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-3">
        <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
          <FileVideo className="w-4 h-4 text-emerald-400" />
          <span>Referencias Directas HLS / MP4 ({mediaRefs.length})</span>
        </h3>
        <div className="space-y-2">
          {mediaRefs.map((ref, idx) => (
            <div
              key={`${ref.url}-${idx}`}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-black/45 border border-white/[0.06] text-xs"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold text-white">{ref.note}</p>
                <p className="font-mono text-[11px] text-zinc-400 break-all">{ref.url}</p>
                {ref.sources.length > 0 && (
                  <p className="text-[11px] text-zinc-500 truncate">
                    Origen: {ref.sources.join(' · ')}
                  </p>
                )}
              </div>
              {ref.kind === 'mp4' && ref.url.endsWith('.mp4') && (
                <button
                  type="button"
                  onClick={() => onPlayCustomUrl(ref.url)}
                  className="min-h-10 px-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-semibold text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Probar MP4</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 5. SECTION 2: 954 ROUTE & ENDPOINT PATTERNS */}
      <section className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-sm sm:text-base text-white">
              Patrones de Rutas y Bytecode ({totalFilteredRoutes})
            </h3>
            <p className="text-xs text-zinc-400">
              Rutas m3u8/embed, firmas Kotlin/Smali y endpoints detectados en el ZIP.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={routeSearch}
              onChange={(e) => {
                setRouteSearch(e.target.value);
                setRouteLimit(80);
              }}
              placeholder="Filtrar patrón (.m3u8, Wish...)"
              className="w-full min-h-10 pl-9 pr-3 rounded-xl bg-black/55 border border-white/[0.1] text-xs text-white placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {(
            [
              { id: 'all', label: 'Relevantes (Sin SDK)' },
              { id: 'hls_mp4', label: 'HLS / MP4' },
              { id: 'player_embed', label: 'Players / Embeds' },
              { id: 'provider_smali', label: 'Providers' },
              { id: 'extractor_smali', label: 'Extractores' },
              { id: 'app_internal', label: 'Smali / ExoPlayer' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setRouteKindFilter(tab.id);
                setRouteLimit(80);
              }}
              className={`min-h-10 px-3 rounded-xl border text-xs font-semibold whitespace-nowrap cursor-pointer ${
                routeKindFilter === tab.id
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                  : 'bg-black/45 border-white/[0.08] text-zinc-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-96 overflow-y-auto custom-scrollbar pr-1">
          {filteredRoutes.slice(0, routeLimit).map((rp, idx) => (
            <div
              key={`${rp.pattern}-${idx}`}
              className="px-3 py-2 rounded-xl bg-black/45 border border-white/[0.05] text-xs flex items-center justify-between gap-2"
            >
              <span className="font-mono text-[11px] text-zinc-200 truncate">{rp.pattern}</span>
              {rp.decodedName && (
                <span className="text-[11px] text-[#22D3EE] shrink-0">{rp.decodedName}</span>
              )}
            </div>
          ))}
        </div>

        {filteredRoutes.length > routeLimit && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setRouteLimit((n) => n + 100)}
              className="min-h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-white cursor-pointer tabular-nums"
            >
              Cargar más rutas ({filteredRoutes.length - routeLimit} restantes)
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
