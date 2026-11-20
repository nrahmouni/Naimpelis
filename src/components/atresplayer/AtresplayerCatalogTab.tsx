import React, { useEffect, useMemo, useState } from 'react';
import { Code2, Cpu, Info, KeyRound, Loader2, Play, Search } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  AtresplayerDecodeResult,
  AtresplayerServiceDef,
  AtresplayerServiceGroup,
} from './atresplayerTypes';

interface AtresplayerCatalogTabProps {
  lang: AppLanguage;
  initialInput?: string;
  services: AtresplayerServiceDef[];
  serviceGroupCounts: Record<AtresplayerServiceGroup, number>;
  propertiesKeys: string[];
  portNotes: string[];
  limitations: string[];
}

const SAMPLE_INPUTS = [
  '//client/v1/page/live',
  'getPlayerVideo',
  'checkVersion',
  'pc/v1/play/closewithuser',
  'application/dash4K+xml',
  'drm.android.tv',
];

const GROUP_LABELS: Record<AtresplayerServiceGroup, string> = {
  playback_catalog: 'Reproducción y Catálogo',
  config_drm: 'Configuración y DRM',
  account_auth: 'Cuenta y Autenticación',
  billing_offers: 'Suscripciones y Checkout',
  profile_ads_links: 'Perfil, Notificaciones y Ads',
};

export const AtresplayerCatalogTab: React.FC<AtresplayerCatalogTabProps> = ({
  lang,
  initialInput = '',
  services,
  serviceGroupCounts,
  propertiesKeys,
  portNotes,
  limitations,
}) => {
  const [inputValue, setInputValue] = useState(initialInput || SAMPLE_INPUTS[0]);
  const [decoding, setDecoding] = useState(false);
  const [decoded, setDecoded] = useState<AtresplayerDecodeResult | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<'all' | AtresplayerServiceGroup>('all');
  const [serviceQuery, setServiceQuery] = useState('');

  const runDecode = async (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    setDecoding(true);
    triggerHaptic('light');
    try {
      const res = await fetch('/api/atresplayer/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: clean }),
      });
      const json = (await res.json().catch(() => null)) as { decoded?: AtresplayerDecodeResult } | null;
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

  const filteredServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    return services.filter((s) => {
      if (selectedGroup !== 'all' && s.group !== selectedGroup) return false;
      if (!q) return true;
      return (
        s.service.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.highlightMethods.some((m) => m.toLowerCase().includes(q)) ||
        s.routePatterns.some((rp) => rp.toLowerCase().includes(q))
      );
    });
  }, [services, selectedGroup, serviceQuery]);

  const totalDeclarations = useMemo(
    () => services.reduce((acc, s) => acc + s.declarationCount, 0),
    [services]
  );

  return (
    <div className="space-y-6">
      {/* DECODER */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#FF5E1A]" />
            <span>
              {pickLang(lang, {
                es: 'Decodificador Atresplayer · Retrofit, DRM, MIME y Rutas //',
                ca: 'Descodificador Atresplayer · Retrofit, DRM, MIME i Rutes //',
                en: 'Atresplayer Decoder · Retrofit, DRM, MIME & // Routes',
              })}
            </span>
          </h2>
          <p className="text-xs text-zinc-400">
            Inspecciona URLs de api/properties/account, variantes //client/v1/, métodos Retrofit, claves Widevine o MIME HLS/DASH.
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
            placeholder="//client/v1/page/live, getPlayerVideo, checkVersion..."
            className="flex-1 min-h-11 px-4 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#FF5E1A]/60 text-xs font-mono text-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={decoding}
            className="min-h-11 px-5 rounded-xl bg-[#FF5E1A] hover:bg-[#EA580C] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
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
              <span className="text-xs font-bold text-[#FF5E1A]">{decoded.detectedType}</span>
              {decoded.matchedService && (
                <span className="font-mono text-[11px] text-zinc-300">
                  {decoded.matchedService.packageScope} · {decoded.matchedService.service}
                </span>
              )}
            </div>

            {decoded.breakdown && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Host</p>
                  <p className="font-mono text-zinc-200 truncate">{decoded.breakdown.host}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Puerto / Proto</p>
                  <p className="font-mono text-zinc-200 truncate">
                    {decoded.breakdown.protocol} · {decoded.breakdown.port}
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Ruta</p>
                  <p className="font-mono text-zinc-200 truncate">{decoded.breakdown.path}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Tipo</p>
                  <p className="font-mono text-zinc-200 truncate">{decoded.breakdown.routeKind}</p>
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

      {/* CATALOG OF 36 RETROFIT SERVICES / 177 DECLARATIONS */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#FF5E1A]" />
            <span>
              Catálogo Retrofit Completo ({services.length} servicios · {totalDeclarations} declaraciones)
            </span>
          </h2>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={serviceQuery}
              onChange={(e) => setServiceQuery(e.target.value)}
              placeholder="Filtrar servicio o método..."
              className="w-full min-h-10 pl-9 pr-3 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#FF5E1A]/60 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedGroup('all')}
            className={`min-h-10 px-3 rounded-xl text-xs font-semibold cursor-pointer tabular-nums whitespace-nowrap ${
              selectedGroup === 'all'
                ? 'bg-white text-black'
                : 'bg-[#000000] text-zinc-400 hover:text-white border border-white/[0.08]'
            }`}
          >
            Todos ({services.length})
          </button>
          {(Object.keys(GROUP_LABELS) as AtresplayerServiceGroup[]).map((grp) => (
            <button
              key={grp}
              type="button"
              onClick={() => setSelectedGroup(grp)}
              className={`min-h-10 px-3 rounded-xl text-xs font-semibold cursor-pointer tabular-nums whitespace-nowrap ${
                selectedGroup === grp
                  ? 'bg-white text-black'
                  : 'bg-[#000000] text-zinc-400 hover:text-white border border-white/[0.08]'
              }`}
            >
              {GROUP_LABELS[grp]} ({serviceGroupCounts[grp] || 0})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredServices.map((svc) => (
            <article
              key={svc.id}
              className="rounded-2xl bg-[#000000] border border-white/[0.08] p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{svc.service}</h3>
                  <p className="text-[11px] font-mono text-zinc-400 tabular-nums">
                    {svc.packageScope} · {svc.host} · {svc.declarationCount} decl.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInputValue(svc.service);
                    void runDecode(svc.service);
                  }}
                  className="text-xs font-semibold text-[#FF8A4C] hover:underline cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Analizar
                </button>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{svc.summary}</p>
              <p className="font-mono text-[11px] text-[#FF8A4C] break-words">
                Métodos: {svc.highlightMethods.join(', ')}
              </p>
              <p className="font-mono text-[11px] text-zinc-500 break-words">
                Rutas: {svc.routePatterns.join(' · ')}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 36 PROPERTIES KEYS */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#FF5E1A]" />
            <span>PropertiesService · {propertiesKeys.length} Parámetros Remotos ({'{PROPS}'})</span>
          </h2>
          <span className="text-xs font-mono text-zinc-400">/properties/v1/find/properties?key=...</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {propertiesKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setInputValue(key);
                void runDecode(key);
              }}
              className="min-h-10 px-3 rounded-xl bg-[#000000] hover:bg-white/[0.05] border border-white/[0.08] text-left font-mono text-[11px] text-zinc-300 hover:text-white cursor-pointer truncate"
            >
              {key}
            </button>
          ))}
        </div>
      </section>

      {/* PORT NOTES & 5 TECHNICAL LIMITATIONS */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-3">
        <h2 className="font-display font-bold text-sm text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-zinc-400" />
          <span>Notas de Puertos y 5 Limitaciones del Análisis Estático</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
          <ul className="space-y-1.5">
            {portNotes.map((note, idx) => (
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
