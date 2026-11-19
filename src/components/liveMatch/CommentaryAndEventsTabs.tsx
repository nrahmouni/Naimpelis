import React from 'react';
import { Activity, Clock, TrendingUp } from 'lucide-react';
import type { AppLanguage, FootballMatchDetails } from '../../types';
import { pickLang } from '../../utils/i18n';

interface CommentaryTabProps {
  lang: AppLanguage;
  details: FootballMatchDetails | null;
  resolvedState: 'live' | 'upcoming' | 'finished';
  homeShort?: string;
  awayShort?: string;
}

export const CommentaryTab: React.FC<CommentaryTabProps> = ({
  lang,
  details,
  resolvedState,
  homeShort,
  awayShort,
}) => {
  return (
    <div className="space-y-4">
      {details?.momentum && details.momentum.length > 0 && (
        <div className="rounded-2xl bg-[#1A1E29] border border-white/[0.07] p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {pickLang(lang, {
                  es: 'Ritmo de Ataque en Directo',
                  ca: 'Ritme d’Atac en Directe',
                  en: 'Live Attack Momentum',
                })}
              </span>
            </span>
            <span className="text-[11px] text-zinc-400">
              <span className="text-emerald-400 font-semibold">
                {homeShort || pickLang(lang, { es: 'Local', ca: 'Local', en: 'Home' })}
              </span>
              {' vs '}
              <span className="text-indigo-400 font-semibold">
                {awayShort || pickLang(lang, { es: 'Visit.', ca: 'Visit.', en: 'Away' })}
              </span>
            </span>
          </div>
          <div className="relative h-14 flex items-center gap-[1px] bg-black/25 rounded-lg px-1.5 overflow-hidden">
            <div className="absolute inset-x-0 top-1/2 h-[1px] bg-white/15 pointer-events-none" />
            {details.momentum.slice(0, 95).map((pt) => {
              const pct = Math.min(48, Math.max(4, Math.abs(pt.value) * 0.48));
              const isHome = pt.value >= 0;
              return (
                <div
                  key={pt.minute}
                  title={`Min ${pt.minute}'`}
                  className="flex-1 h-full relative"
                >
                  <div
                    style={{
                      height: `${pct}%`,
                      bottom: isHome ? '50%' : undefined,
                      top: isHome ? undefined : '50%',
                    }}
                    className={`absolute inset-x-0 rounded-[1px] ${
                      isHome ? 'bg-emerald-500/85' : 'bg-indigo-400/85'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-rose-400" />
          <span>
            {pickLang(lang, {
              es: 'Minuto a Minuto en Directo',
              ca: 'Minut a Minut en Directe',
              en: 'Live Play-by-Play',
            })}
          </span>
        </h4>

        {details?.commentary && details.commentary.length > 0 ? (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {details.commentary.map((com) => (
              <div
                key={com.id}
                className={`p-3 rounded-xl text-xs flex items-start gap-3 border ${
                  com.isImportant
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                    : 'bg-[#1A1E29] border-white/[0.06] text-zinc-200'
                }`}
              >
                <span className="min-w-[44px] px-1.5 py-0.5 rounded bg-black/35 font-mono font-bold tabular-nums text-[#22C55E] text-center shrink-0">
                  {com.minute}
                </span>
                <p className="flex-1 leading-relaxed">{com.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-400 p-4 rounded-2xl bg-[#1A1E29] border border-white/[0.06]">
            {resolvedState === 'upcoming'
              ? pickLang(lang, {
                  es: 'La narración minuto a minuto comenzará cuando el árbitro pite el inicio.',
                  ca: 'La narració minut a minut començarà quan l’àrbitre xiuli l’inici.',
                  en: 'Live commentary will begin at kickoff.',
                })
              : pickLang(lang, {
                  es: 'Sin comentarios minuto a minuto disponibles para esta competición.',
                  ca: 'Sense comentaris minut a minut disponibles per a aquesta competició.',
                  en: 'No minute-by-minute commentary available for this competition.',
                })}
          </p>
        )}
      </div>
    </div>
  );
};

interface EventsTabProps {
  lang: AppLanguage;
  details: FootballMatchDetails | null;
  resolvedState: 'live' | 'upcoming' | 'finished';
  resolvedHomeTeam: string;
  resolvedAwayTeam: string;
  homeShort?: string;
  awayShort?: string;
}

export const EventsTab: React.FC<EventsTabProps> = ({
  lang,
  details,
  resolvedState,
  resolvedHomeTeam,
  resolvedAwayTeam,
  homeShort,
  awayShort,
}) => {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-[#9146FF]" />
        <span>
          {pickLang(lang, {
            es: 'Incidencias del Partido',
            ca: 'Incidències del Partit',
            en: 'Match Events',
          })}
        </span>
      </h4>

      {details?.events && details.events.length > 0 ? (
        <div className="divide-y divide-white/[0.06] rounded-2xl bg-[#1A1E29] border border-white/[0.07] max-h-80 overflow-y-auto">
          {details.events.map((ev) => (
            <div
              key={ev.id}
              className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="min-w-[38px] font-mono font-bold tabular-nums text-[#22C55E] shrink-0">
                  {ev.clock}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    ev.type === 'goal'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                      : ev.type === 'red-card'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35'
                      : ev.type === 'yellow-card'
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/35'
                      : 'bg-white/10 text-zinc-200'
                  }`}
                >
                  {ev.typeLabel}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">
                    {ev.playerName}
                  </div>
                  {ev.assistOrSubName && (
                    <div className="text-[11px] text-zinc-400 truncate">
                      {ev.type === 'goal'
                        ? `${pickLang(lang, { es: 'Asistencia:', ca: 'Assistència:', en: 'Assist:' })} ${ev.assistOrSubName}`
                        : `${pickLang(lang, { es: 'Sale:', ca: 'Surt:', en: 'Out:' })} ${ev.assistOrSubName}`}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-xs text-zinc-300 shrink-0 font-mono font-bold">
                {ev.side === 'home'
                  ? homeShort || resolvedHomeTeam.slice(0, 3).toUpperCase()
                  : ev.side === 'away'
                  ? awayShort || resolvedAwayTeam.slice(0, 3).toUpperCase()
                  : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-400 p-4 rounded-2xl bg-[#1A1E29] border border-white/[0.06]">
          {resolvedState === 'upcoming'
            ? pickLang(lang, {
                es: 'Aún no ha comenzado el encuentro.',
                ca: 'Encara no ha començat el partit.',
                en: 'Match has not kicked off yet.',
              })
            : pickLang(lang, {
                es: 'Sin goles, tarjetas ni sustituciones registradas todavía.',
                ca: 'Sense gols, targetes ni substitucions registrades encara.',
                en: 'No goals, cards, or substitutions recorded yet.',
              })}
        </p>
      )}
    </div>
  );
};
