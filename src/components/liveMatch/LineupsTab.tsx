import React from 'react';
import { Users, X } from 'lucide-react';
import type {
  AppLanguage,
  FootballMatchDetails,
  FootballMatchLineupPlayer,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import {
  getRatingBadgeClasses,
  LineupMetric,
  PlayerAvatarImg,
} from './matchCenterUtils';
import { TacticalPitchHalf } from './TacticalPitchHalf';

interface LineupsTabProps {
  lang: AppLanguage;
  details: FootballMatchDetails | null;
  resolvedState: 'live' | 'upcoming' | 'finished';
  homeShort?: string;
  awayShort?: string;
  hasAnyHeight: boolean;
  lineupMetric: LineupMetric;
  setLineupMetric: (metric: LineupMetric) => void;
  lineupTeamView: 'both' | 'home' | 'away';
  setLineupTeamView: (view: 'both' | 'home' | 'away') => void;
  selectedPlayer: FootballMatchLineupPlayer | null;
  setSelectedPlayer: (player: FootballMatchLineupPlayer | null) => void;
}

export const LineupsTab: React.FC<LineupsTabProps> = ({
  lang,
  details,
  resolvedState,
  homeShort,
  awayShort,
  hasAnyHeight,
  lineupMetric,
  setLineupMetric,
  lineupTeamView,
  setLineupTeamView,
  selectedPlayer,
  setSelectedPlayer,
}) => {
  return (
    <div className="space-y-3.5">
      {/* Metric Filter Bar + Team View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {(
            [
              { id: 'rating', es: 'Rendimiento', ca: 'Rendiment', en: 'Rating' },
              { id: 'club', es: 'Club', ca: 'Club', en: 'Club' },
              { id: 'age', es: 'Edad', ca: 'Edat', en: 'Age' },
              { id: 'marketValue', es: 'Valor de mercado', ca: 'Valor de mercat', en: 'Market value' },
              ...(hasAnyHeight ? [{ id: 'height' as const, es: 'Altura', ca: 'Alçada', en: 'Height' }] : []),
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setLineupMetric(m.id);
              }}
              className={`min-h-10 px-3 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                lineupMetric === m.id
                  ? 'bg-[#9146FF] text-white'
                  : 'bg-[#242833] hover:bg-[#313746] text-zinc-300 border border-white/[0.08]'
              }`}
            >
              {pickLang(lang, m)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-[#1D212B] p-1 border border-white/[0.06] shrink-0">
          {(
            [
              { id: 'both', label: pickLang(lang, { es: 'Ambos', ca: 'Ambdós', en: 'Both' }) },
              { id: 'home', label: homeShort || pickLang(lang, { es: 'Local', ca: 'Local', en: 'Home' }) },
              { id: 'away', label: awayShort || pickLang(lang, { es: 'Visit.', ca: 'Visit.', en: 'Away' }) },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setLineupTeamView(v.id)}
              className={`min-h-10 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                lineupTeamView === v.id
                  ? 'bg-[#9146FF] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {details?.homeLineup?.starters.length || details?.awayLineup?.starters.length ? (
        <div
          className={`grid gap-4 ${
            lineupTeamView === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {(lineupTeamView === 'both' || lineupTeamView === 'home') &&
            details?.homeLineup && (
              <TacticalPitchHalf
                lineup={details.homeLineup}
                side="home"
                metric={lineupMetric}
                lang={lang}
                onSelectPlayer={setSelectedPlayer}
              />
            )}
          {(lineupTeamView === 'both' || lineupTeamView === 'away') &&
            details?.awayLineup && (
              <TacticalPitchHalf
                lineup={details.awayLineup}
                side="away"
                metric={lineupMetric}
                lang={lang}
                onSelectPlayer={setSelectedPlayer}
              />
            )}
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-[#1A1E29] border border-white/[0.07] text-center space-y-1.5">
          <Users className="w-6 h-6 text-zinc-500 mx-auto" />
          <p className="text-xs sm:text-sm font-semibold text-zinc-200">
            {resolvedState === 'upcoming'
              ? pickLang(lang, {
                  es: 'Las alineaciones oficiales se publican ~60 minutos antes del inicio.',
                  ca: 'Les alineacions oficials es publiquen ~60 minuts abans de l’inici.',
                  en: 'Official lineups are published ~60 minutes before kickoff.',
                })
              : pickLang(lang, {
                  es: 'No hay alineaciones oficiales publicadas en las fuentes para esta competición.',
                  ca: 'No hi ha alineacions oficials publicades a les fonts per a aquesta competició.',
                  en: 'No official lineups published for this competition.',
                })}
          </p>
        </div>
      )}

      {/* Selected Player Quick Bio Strip */}
      {selectedPlayer && (
        <div className="p-3 rounded-2xl bg-[#1E2330] border border-[#9146FF]/45 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <PlayerAvatarImg
              src={selectedPlayer.photoUrl}
              jersey={selectedPlayer.jersey}
              name={selectedPlayer.name}
              sizeClass="w-11 h-11"
            />
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>
                  #{selectedPlayer.jersey} {selectedPlayer.name}
                </span>
                {selectedPlayer.rating && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${getRatingBadgeClasses(
                      selectedPlayer.rating
                    )}`}
                  >
                    ★ {selectedPlayer.rating}
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2 mt-0.5">
                {selectedPlayer.club && <span>Club: {selectedPlayer.club}</span>}
                {selectedPlayer.age && (
                  <span>
                    · {selectedPlayer.age}{' '}
                    {pickLang(lang, { es: 'años', ca: 'anys', en: 'yrs' })}
                  </span>
                )}
                {selectedPlayer.marketValue && (
                  <span>
                    · {pickLang(lang, { es: 'Valor:', ca: 'Valor:', en: 'Value:' })}{' '}
                    {selectedPlayer.marketValue}
                  </span>
                )}
                {selectedPlayer.country && <span>· {selectedPlayer.country}</span>}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedPlayer(null)}
            aria-label={pickLang(lang, {
              es: 'Cerrar ficha de jugador',
              ca: 'Tancar fitxa de jugador',
              en: 'Close player card',
            })}
            className="p-1.5 rounded-full bg-white/[0.06] text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
