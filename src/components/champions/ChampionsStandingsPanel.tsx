import React from 'react';
import { Trophy } from 'lucide-react';
import type { AppLanguage, FootballStandingsData } from '../../types';
import { pickLang } from '../../utils/i18n';
import { TeamCrestImg } from '../sports/FootballMatchboardParts';

interface ChampionsStandingsPanelProps {
  lang: AppLanguage;
  standings: FootballStandingsData | null;
  loading?: boolean;
}

export const ChampionsStandingsPanel: React.FC<ChampionsStandingsPanelProps> = ({
  lang,
  standings,
  loading = false,
}) => {
  if (loading && !standings) {
    return (
      <div className="rounded-2xl bg-[#0B1020] border border-sky-400/15 p-4 space-y-2.5">
        <div className="h-4 w-48 rounded bg-white/[0.08] skeleton-shimmer" />
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-10 rounded-xl bg-white/[0.04] skeleton-shimmer" />
        ))}
      </div>
    );
  }

  const groups = standings?.groups?.filter((g) => Array.isArray(g.all) && g.all.length > 0) || [];
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0B1020] border border-white/[0.08] p-6 text-center space-y-1.5">
        <Trophy className="w-5 h-5 text-sky-400 mx-auto" />
        <p className="text-sm font-semibold text-zinc-200">
          {pickLang(lang, {
            es: 'Clasificación de la Champions League no disponible en este momento.',
            ca: 'Classificació de la Champions League no disponible en aquest moment.',
            en: 'Champions League standings are currently unavailable.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((grp, gIdx) => (
        <section
          key={`${grp.groupName}-${gIdx}`}
          className="rounded-2xl overflow-hidden bg-[#0A0F1E] border border-sky-400/20 shadow-[0_12px_36px_rgba(3,10,28,0.5)]"
        >
          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-gradient-to-r from-sky-500/[0.12] via-[#0B1328] to-transparent">
            <div className="flex items-center gap-2 min-w-0">
              <Trophy className="w-4 h-4 text-sky-300 shrink-0" />
              <h3 className="font-display font-bold text-sm text-white truncate">
                {grp.groupName || standings?.leagueName || 'UEFA Champions League'}
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-sky-200/80 shrink-0">
              {pickLang(lang, { es: 'Fase de Liga', ca: 'Fase de Lliga', en: 'League Phase' })}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-wider text-zinc-400">
                  <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                  <th className="py-2.5 px-2">
                    {pickLang(lang, { es: 'Club', ca: 'Club', en: 'Club' })}
                  </th>
                  <th className="py-2.5 px-2 text-center tabular-nums">PJ</th>
                  <th className="py-2.5 px-2 text-center tabular-nums hidden sm:table-cell">G</th>
                  <th className="py-2.5 px-2 text-center tabular-nums hidden sm:table-cell">E</th>
                  <th className="py-2.5 px-2 text-center tabular-nums hidden sm:table-cell">P</th>
                  <th className="py-2.5 px-2 text-center tabular-nums">DG</th>
                  <th className="py-2.5 pl-2 pr-4 text-right font-bold text-white tabular-nums">PTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {grp.all.map((row) => {
                  const defaultAccent =
                    row.rank <= 8
                      ? '#10B981'
                      : row.rank <= 24
                      ? '#38BDF8'
                      : 'transparent';
                  const barColor = row.qualColor || defaultAccent;
                  return (
                    <tr
                      key={`${row.rank}-${row.teamName}`}
                      className="hover:bg-white/[0.04] transition-colors"
                    >
                      <td className="py-2.5 pl-3 pr-2 font-bold tabular-nums text-zinc-200 relative">
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
                          style={{ backgroundColor: barColor }}
                        />
                        <span className="pl-1.5">{row.rank}</span>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <TeamCrestImg
                            src={row.logo}
                            shortCode={row.shortName || row.teamName}
                            alt={row.teamName}
                          />
                          <span className="font-semibold text-white truncate max-w-[160px] sm:max-w-none">
                            {row.teamName}
                          </span>
                          {row.isPlayingLive && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold shrink-0">
                              LIVE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center tabular-nums text-zinc-300">{row.played}</td>
                      <td className="py-2.5 px-2 text-center tabular-nums text-zinc-400 hidden sm:table-cell">
                        {row.wins}
                      </td>
                      <td className="py-2.5 px-2 text-center tabular-nums text-zinc-400 hidden sm:table-cell">
                        {row.draws}
                      </td>
                      <td className="py-2.5 px-2 text-center tabular-nums text-zinc-400 hidden sm:table-cell">
                        {row.losses}
                      </td>
                      <td className="py-2.5 px-2 text-center tabular-nums text-zinc-300">
                        {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-right font-extrabold tabular-nums text-white">
                        {row.pts}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 border-t border-white/[0.06] bg-black/25 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
            {standings?.legend && standings.legend.length > 0 ? (
              standings.legend.map((item) => (
                <span key={item.title} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.color || '#38BDF8' }}
                  />
                  <span>{item.title}</span>
                </span>
              ))
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: '1º–8º Octavos directos',
                      ca: '1r–8è Vuitens directes',
                      en: '1–8 Round of 16 direct',
                    })}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: '9º–24º Play-off eliminatorio',
                      ca: '9è–24è Play-off eliminatori',
                      en: '9–24 Knockout play-offs',
                    })}
                  </span>
                </span>
              </>
            )}
          </div>
        </section>
      ))}
    </div>
  );
};
