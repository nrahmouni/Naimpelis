import React, { useMemo } from 'react';
import { Film, Lock, Play, Radio, ShieldCheck, Tv } from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  AtresplayerInventoryResponse,
  AtresplayerOverviewResponse,
} from './atresplayerTypes';

interface AtresplayerOverviewTabProps {
  lang: AppLanguage;
  externalQuery?: string;
  inventory: AtresplayerInventoryResponse;
  overview: AtresplayerOverviewResponse | null;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onSendToDecoder: (value: string) => void;
}

export const AtresplayerOverviewTab: React.FC<AtresplayerOverviewTabProps> = ({
  lang,
  externalQuery = '',
  inventory,
  overview,
  onPlayTdtChannel,
  onSendToDecoder,
}) => {
  const q = externalQuery.trim().toLowerCase();

  const tdtChannels = useMemo(() => {
    const list = overview?.atresmediaTdtChannels || [];
    if (!q) return list;
    return list.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        (ch.description || '').toLowerCase().includes(q)
    );
  }, [overview?.atresmediaTdtChannels, q]);

  return (
    <div className="space-y-6">
      {/* SECTION 1: LIVE ATRESMEDIA OPEN TDT SIGNALS */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#FF5E1A]" />
              <span>
                {pickLang(lang, {
                  es: 'Canales Atresmedia en Directo (Señal TDT Autorizada)',
                  ca: 'Canals Atresmedia en Directe (Senyal TDT Autoritzada)',
                  en: 'Live Atresmedia Channels (Authorized DTT Signals)',
                })}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              {pickLang(lang, {
                es: 'Reproducción inmediata en abierto mediante el registro TDT integrado de RiffanTV; separado del DRM Widevine de VOD.',
                ca: 'Reproducció immediata en obert mitjançant el registre TDT integrat de RiffanTV.',
                en: 'Instant open DTT playback through RiffanTV live registry, separate from private VOD Widevine DRM.',
              })}
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400 tabular-nums shrink-0">
            {tdtChannels.length} {pickLang(lang, { es: 'canales', ca: 'canals', en: 'channels' })}
          </span>
        </div>

        {tdtChannels.length === 0 ? (
          <p className="text-xs text-zinc-400 py-2">
            No hay canales TDT que coincidan con «{externalQuery}».
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tdtChannels.map((ch) => (
              <article
                key={ch.id}
                className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-extrabold text-white shrink-0 border border-white/10"
                    style={{ backgroundColor: ch.brandTone || '#EA580C' }}
                  >
                    {ch.shortMark || ch.name.slice(0, 3).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{ch.name}</h3>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {ch.network || 'Atresmedia'} · {ch.channels?.length || 1} señal(es)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onPlayTdtChannel(ch, 0);
                  }}
                  className="min-h-11 px-4 rounded-xl bg-[#FF5E1A] hover:bg-[#EA580C] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: 4-STEP PLAYBACK CHAIN */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-[#FF5E1A]" />
              <span>
                {pickLang(lang, {
                  es: 'Cadena de Reproducción VOD / Directo en 4 Pasos',
                  ca: 'Cadena de Reproducció VOD / Directe en 4 Passos',
                  en: '4-Step VOD & Live Playback Chain',
                })}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Flujo completo en runtime desde href de navegación hasta URLs firmadas "src" y control de concurrencia.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400 tabular-nums shrink-0">
            4 pasos · SourceBO + PlayerVideoBO
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {inventory.playbackChain.map((step) => (
            <article
              key={step.step}
              className="rounded-2xl bg-[#000000] border border-white/[0.08] p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">
                  {String(step.step).padStart(2, '0')}. {step.service}
                </h3>
                <button
                  type="button"
                  onClick={() => onSendToDecoder(step.service)}
                  className="text-xs font-semibold text-[#FF8A4C] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                >
                  Inspeccionar
                </button>
              </div>
              <p className="font-mono text-[11px] text-zinc-300 break-words">
                {step.methods.join(' · ')}
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">{step.role}</p>
              <p className="font-mono text-[11px] text-zinc-500">{step.endpointHint}</p>
            </article>
          ))}
        </div>
      </section>

      {/* SECTION 3: SOURCEBO FIELDS, MIME TYPES & WIDEVINE DRM */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#FF5E1A]" />
              <span>Tipos MIME Declarados & SourceBO</span>
            </h2>
            <span className="text-xs font-mono text-zinc-400 tabular-nums">
              {inventory.mimeTypes.length} formatos
            </span>
          </div>

          <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 space-y-1.5 text-xs">
            <p className="font-semibold text-zinc-200">Campos de respuesta SourceBO & PlayerVideoBO</p>
            <p className="font-mono text-[11px] text-[#FF8A4C]">
              SourceBO: {inventory.sourceFields.sourceBo.join(' · ')}
            </p>
            <p className="font-mono text-[11px] text-zinc-400">
              PlayerVideoBO: {inventory.sourceFields.playerVideoBo.join(' · ')}
            </p>
          </div>

          <div className="divide-y divide-white/[0.06] rounded-2xl bg-[#000000] border border-white/[0.08] px-3.5">
            {inventory.mimeTypes.map((item) => (
              <div
                key={item.mime}
                className="py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-mono text-zinc-100 truncate">
                    {item.family} · {item.mime}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">{item.notes}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSendToDecoder(item.mime)}
                  className="text-xs font-semibold text-[#FF8A4C] hover:underline cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Decodificar
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#FF5E1A]" />
              <span>DRM Widevine & Estadísticas del APK</span>
            </h2>
            <span className="text-xs font-mono text-zinc-400 tabular-nums">
              {inventory.declaredSummary.hlsDashDrmMatches} refs DRM/Stream
            </span>
          </div>

          <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-white">Esquema: {inventory.sourceFields.drmSpecs.scheme}</span>
              <button
                type="button"
                onClick={() => onSendToDecoder('Widevine')}
                className="text-xs font-semibold text-[#FF8A4C] hover:underline cursor-pointer"
              >
                Analizar DRM
              </button>
            </div>
            <p className="font-mono text-[11px] text-zinc-300">
              Clases: {inventory.sourceFields.drmSpecs.javaClasses.join(' · ')}
            </p>
            <p className="font-mono text-[11px] text-amber-300">
              Claves: {inventory.sourceFields.drmSpecs.propertyKeys.join(' · ')}
            </p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {inventory.sourceFields.drmSpecs.notes}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs tabular-nums">
            <div className="rounded-xl bg-[#000000] border border-white/[0.08] p-3">
              <p className="text-[11px] text-zinc-500">URLs literales</p>
              <p className="font-mono font-bold text-base text-white">
                {inventory.declaredSummary.literalUrls}
              </p>
              <p className="text-[11px] text-zinc-400">
                {inventory.declaredSummary.ownLiteralUrls} propias · {inventory.declaredSummary.externalLiteralUrls} ext.
              </p>
            </div>
            <div className="rounded-xl bg-[#000000] border border-white/[0.08] p-3">
              <p className="text-[11px] text-zinc-500">Declaraciones Retrofit</p>
              <p className="font-mono font-bold text-base text-[#FF5E1A]">
                {inventory.declaredSummary.retrofitDeclarations}
              </p>
              <p className="text-[11px] text-zinc-400">
                {inventory.actualCounts.retrofitServices} servicios Java
              </p>
            </div>
            <div className="rounded-xl bg-[#000000] border border-white/[0.08] p-3 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-zinc-500">Código Decompilado</p>
              <p className="font-mono font-bold text-base text-white">
                {inventory.javaFiles.toLocaleString('es-ES')}
              </p>
              <p className="text-[11px] text-zinc-400">
                {inventory.zipEntries.toLocaleString('es-ES')} entradas ZIP
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-3.5 space-y-1 text-xs text-zinc-300">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Notas sobre vídeo y puertos</span>
            </p>
            {inventory.videoNotes.map((note, idx) => (
              <p key={idx} className="text-[11px] text-zinc-400">· {note}</p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
