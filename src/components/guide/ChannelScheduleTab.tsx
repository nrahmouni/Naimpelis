import React from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Radio, Sparkles } from 'lucide-react';
import type {
  AppLanguage,
  ChannelLiveEpg,
  EpgProgramItem,
  SpanishTdtChannel,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { cleanEpgDescription } from './channelGuideUtils';

interface ChannelScheduleTabProps {
  lang: AppLanguage;
  headerChannel: SpanishTdtChannel | null;
  activeChannelTitle: string;
  inspectedEpg: ChannelLiveEpg | null;
  activeNow: EpgProgramItem | null;
  activeNext: EpgProgramItem | null;
  upcomingList: EpgProgramItem[];
  clockMs: number;
  spotlightDescExpanded: boolean;
  onToggleSpotlightDesc: () => void;
  expandedProgKey: string | null;
  onToggleProgKey: (key: string | null) => void;
  onBrowseAllChannels: () => void;
}

export const ChannelScheduleTab: React.FC<ChannelScheduleTabProps> = ({
  lang,
  headerChannel,
  activeChannelTitle,
  inspectedEpg,
  activeNow,
  activeNext,
  upcomingList,
  clockMs,
  spotlightDescExpanded,
  onToggleSpotlightDesc,
  expandedProgKey,
  onToggleProgKey,
  onBrowseAllChannels,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded-2xl bg-[#161822]/90 border border-white/[0.08] p-3.5 sm:p-4 flex flex-col sm:flex-row gap-3.5 relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-25"
            style={{
              backgroundColor: headerChannel?.brandTone || '#9146FF',
            }}
          />

          <div className="relative w-full sm:w-36 aspect-video sm:aspect-[4/3] rounded-xl overflow-hidden bg-[#0B0C12] border border-white/[0.08] shrink-0 flex items-center justify-center">
            {activeNow?.icon ? (
              <img
                src={activeNow.icon}
                alt={activeNow.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center pointer-events-none"
              style={{
                opacity: activeNow?.icon ? 0.16 : 1,
                background: headerChannel?.brandTone
                  ? `radial-gradient(circle at 50% 35%, ${headerChannel.brandTone}35, rgba(11,12,18,0.95) 80%)`
                  : undefined,
              }}
            >
              <span className="font-display font-black text-2xl text-white tracking-tight">
                {headerChannel?.shortMark || 'TV'}
              </span>
              <span className="text-[10px] font-semibold text-zinc-400 mt-0.5 truncate max-w-full">
                {headerChannel?.network || ''}
              </span>
            </div>

            <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EB0400] text-white text-[10px] font-extrabold tracking-wide shadow">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {pickLang(lang, { es: 'AHORA', ca: 'ARA', en: 'LIVE' })}
            </span>
          </div>

          <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-between gap-2.5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {activeNow ? (
                  <>
                    <span className="font-mono font-bold text-[#BF94FF] tabular-nums">
                      {activeNow.startLabel} — {activeNow.stopLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#9146FF]/20 border border-[#9146FF]/35 text-[#E9D5FF] font-semibold tabular-nums">
                      {pickLang(lang, {
                        es: `Quedan ${inspectedEpg?.remainingMin || 1} min`,
                        ca: `Queden ${inspectedEpg?.remainingMin || 1} min`,
                        en: `${inspectedEpg?.remainingMin || 1}m left`,
                      })}
                    </span>
                    {activeNow.category && (
                      <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-300 font-medium">
                        {activeNow.category}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-300 font-semibold">
                    {headerChannel?.quality || 'HD Directo'} ·{' '}
                    {headerChannel?.network || 'TV'}
                  </span>
                )}
              </div>

              <h4 className="font-display font-extrabold text-base sm:text-lg text-white leading-snug">
                {activeNow?.title || headerChannel?.name || activeChannelTitle}
              </h4>

              {activeNow?.subtitle && (
                <p className="text-xs font-medium text-zinc-400">{activeNow.subtitle}</p>
              )}

              {activeNow?.description ? (
                <div className="space-y-1">
                  <p
                    className={`text-xs text-zinc-300 leading-relaxed ${
                      spotlightDescExpanded ? '' : 'line-clamp-2'
                    }`}
                  >
                    {cleanEpgDescription(activeNow.description)}
                  </p>
                  {activeNow.description.length > 110 && (
                    <button
                      type="button"
                      onClick={onToggleSpotlightDesc}
                      className="text-[11px] font-semibold text-[#BF94FF] hover:text-white cursor-pointer"
                    >
                      {spotlightDescExpanded
                        ? pickLang(lang, { es: 'Ocultar sinopsis', ca: 'Amagar sinopsi', en: 'Less' })
                        : pickLang(lang, { es: 'Leer sinopsis', ca: 'Llegir sinopsi', en: 'Read more' })}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {headerChannel?.description ||
                    pickLang(lang, {
                      es: 'Emisión continua en directo. Consulta otros canales en la pestaña "Todos los canales".',
                      ca: 'Emissió contínua en directe. Consulta altres canals a "Tots els canals".',
                      en: 'Continuous live feed. Browse all channel schedules in "All Channels".',
                    })}
                </p>
              )}
            </div>

            {activeNow && (
              <div className="space-y-1 pt-1">
                <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#9146FF] to-[#BF94FF] transition-all duration-500"
                    style={{ width: `${inspectedEpg?.progressPct || 10}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-[#161822]/75 border border-white/[0.07] p-3.5 sm:p-4 flex flex-col justify-between gap-2.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#BF94FF]">
                <Sparkles className="w-3.5 h-3.5" />
                {pickLang(lang, {
                  es: 'A continuación',
                  ca: 'A continuació',
                  en: 'Up Next',
                })}
              </span>
              {activeNext && (
                <span className="font-mono text-xs font-bold text-white tabular-nums px-2 py-0.5 rounded-md bg-white/[0.07]">
                  {activeNext.startLabel}
                </span>
              )}
            </div>

            {activeNext ? (
              <>
                <h5 className="font-display font-bold text-sm sm:text-base text-white leading-snug line-clamp-2">
                  {activeNext.title}
                </h5>
                {activeNext.category && (
                  <span className="inline-block px-2 py-0.5 rounded-md bg-white/[0.06] text-[11px] text-zinc-300 font-medium">
                    {activeNext.category}
                  </span>
                )}
                {activeNext.description && (
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                    {cleanEpgDescription(activeNext.description)}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2 py-1">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {pickLang(lang, {
                    es: 'Este canal internacional no publica parrilla por horas. Explora la programación en vivo del resto de canales.',
                    ca: 'Aquest canal internacional no publica graella horària. Explora la programació de la resta de canals.',
                    en: 'Hourly guide is unavailable for this international feed. Explore the full guide across all channels.',
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onBrowseAllChannels();
                  }}
                  className="min-h-8 px-3 rounded-xl bg-[#9146FF]/20 hover:bg-[#9146FF]/35 border border-[#9146FF]/45 text-xs font-bold text-[#E9D5FF] cursor-pointer transition-colors"
                >
                  {pickLang(lang, {
                    es: 'Explorar todos los canales',
                    ca: 'Explorar tots els canals',
                    en: 'Browse all channels',
                  })}
                </button>
              </div>
            )}
          </div>

          {activeNext && (
            <div className="text-[11px] font-mono text-zinc-400 tabular-nums pt-1 border-t border-white/[0.06] flex items-center justify-between">
              <span>
                {activeNext.startLabel} — {activeNext.stopLabel}
              </span>
              <span>
                {Math.max(5, Math.round((activeNext.stopMs - activeNext.startMs) / 60_000))} min
              </span>
            </div>
          )}
        </div>
      </div>

      {upcomingList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-[#BF94FF]" />
              {pickLang(lang, {
                es: 'Programación completa de hoy',
                ca: "Programació completa d'avui",
                en: 'Full Schedule Today',
              })}
            </span>
            <span className="text-[11px] text-zinc-500">
              {pickLang(lang, {
                es: 'Toca un programa para ver su detalle',
                ca: 'Toca un programa per veure el detall',
                en: 'Tap a show for details',
              })}
            </span>
          </div>

          <div className="space-y-1.5">
            {upcomingList.slice(0, 18).map((prog, index) => {
              const key = `${headerChannel?.id || 'ch'}-${prog.startMs}-${index}`;
              const isLiveNow = prog.startMs <= clockMs && prog.stopMs > clockMs;
              const isExpanded = expandedProgKey === key;
              const durationMin = Math.max(5, Math.round((prog.stopMs - prog.startMs) / 60_000));
              const desc = cleanEpgDescription(prog.description);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onToggleProgKey(isExpanded ? null : key);
                  }}
                  className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all cursor-pointer ${
                    isLiveNow
                      ? 'bg-[#9146FF]/16 border-[#9146FF]/55'
                      : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="shrink-0 pt-0.5 text-left">
                        <span
                          className={`font-mono text-xs font-bold tabular-nums block ${
                            isLiveNow ? 'text-[#D8B4FE]' : 'text-zinc-300'
                          }`}
                        >
                          {prog.startLabel}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                          {durationMin}m
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isLiveNow && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EB0400] text-white text-[9px] font-extrabold uppercase">
                              <Radio className="w-2.5 h-2.5" />
                              {pickLang(lang, { es: 'En directo', ca: 'En directe', en: 'Live' })}
                            </span>
                          )}
                          <span className="text-xs sm:text-sm font-bold text-white leading-snug">
                            {prog.title}
                          </span>
                        </div>
                        {prog.category && (
                          <span className="text-[11px] text-zinc-400">
                            {prog.category}
                            {prog.subtitle ? ` · ${prog.subtitle}` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {desc && (
                      <span className="text-zinc-400 shrink-0 pt-0.5">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    )}
                  </div>

                  {isExpanded && desc && (
                    <p className="mt-2 pt-2 border-t border-white/[0.06] text-xs text-zinc-300 leading-relaxed">
                      {desc}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
