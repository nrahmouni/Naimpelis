import React from 'react';
import { Activity, RefreshCw, X } from 'lucide-react';
import type { AppLanguage, FootballMatchDetails } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  PlayerMatchContext,
  TacticalCaptureStatus,
  TacticalVisionAnalysis,
} from './tacticalVisionTypes';
import { SportsbookPitchDiagram } from './SportsbookPitchDiagram';
import { SportsbookStatsAndLineups } from './SportsbookStatsAndLineups';

interface SportsbookLiveTrackerPanelProps {
  lang: AppLanguage;
  enabled: boolean;
  analysis: TacticalVisionAnalysis | null;
  isAnalyzing: boolean;
  captureStatus: TacticalCaptureStatus;
  homeTeamLabel: string;
  awayTeamLabel: string;
  homeScore?: string;
  awayScore?: string;
  statusLabel?: string;
  competition?: string;
  matchContext?: PlayerMatchContext | null;
  onDisable: () => void;
  onRefreshNow: () => void;
}

export const SportsbookLiveTrackerPanel: React.FC<SportsbookLiveTrackerPanelProps> = ({
  lang,
  enabled,
  analysis,
  isAnalyzing,
  captureStatus,
  homeTeamLabel,
  awayTeamLabel,
  homeScore = '-',
  awayScore = '-',
  statusLabel = '',
  competition = '',
  matchContext,
  onDisable,
  onRefreshNow,
}) => {
  if (!enabled) return null;

  const details: FootballMatchDetails | null | undefined = matchContext?.details;
  const homeColor = analysis?.homeKitColor || details?.homeColor || '#00F593';
  const awayColor = analysis?.awayKitColor || details?.awayColor || '#9146FF';
  const homeLogo = matchContext?.homeLogo ?? details?.homeLogo;
  const awayLogo = matchContext?.awayLogo ?? details?.awayLogo;

  return (
    <section
      aria-label={pickLang(lang, {
        es: 'Centro táctico en directo estilo casa de apuestas',
        ca: 'Centre tàctic en directe',
        en: 'Live Bookmaker Match Tracker',
      })}
      className="bg-[#07090F] border-t border-white/[0.08] px-2 sm:px-3.5 py-2"
    >
      <div className="max-w-6xl mx-auto rounded-2xl bg-[#0E131F] border border-white/[0.09] p-2 sm:p-3 space-y-2 shadow-[0_12px_34px_rgba(0,0,0,0.6)]">
        {/* Single-Row Slim Sportsbook Scoreboard + AI Status + Refresh/Close Controls */}
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-[#080B12] border border-white/[0.07]">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <span
              className="w-2 h-4 rounded-sm shrink-0"
              style={{ backgroundColor: homeColor }}
            />
            {homeLogo && (
              <img
                src={homeLogo}
                alt={homeTeamLabel}
                referrerPolicy="no-referrer"
                className="w-4 h-4 sm:w-5 sm:h-5 object-contain shrink-0"
              />
            )}
            <span className="font-display font-bold text-[11px] sm:text-xs text-white truncate max-w-[82px] sm:max-w-[140px]">
              {homeTeamLabel}
            </span>

            <span className="px-2 py-0.5 rounded-md bg-[#161E31] border border-white/[0.1] font-mono font-extrabold text-xs sm:text-sm tabular-nums text-white shrink-0">
              {homeScore}:{awayScore}
            </span>

            <span className="font-display font-bold text-[11px] sm:text-xs text-white truncate max-w-[82px] sm:max-w-[140px]">
              {awayTeamLabel}
            </span>
            {awayLogo && (
              <img
                src={awayLogo}
                alt={awayTeamLabel}
                referrerPolicy="no-referrer"
                className="w-4 h-4 sm:w-5 sm:h-5 object-contain shrink-0"
              />
            )}
            <span
              className="w-2 h-4 rounded-sm shrink-0"
              style={{ backgroundColor: awayColor }}
            />

            {(analysis?.tvClock || statusLabel) && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded bg-[#00F593]/15 text-[#00F593] font-mono font-bold text-[10px] tabular-nums shrink-0 flex items-center gap-1">
                <span>{analysis?.tvClock || statusLabel}</span>
                {typeof analysis?.streamDelaySec === 'number' && analysis.streamDelaySec >= 12 && (
                  <span className="text-[9px] text-zinc-300/80 font-normal">
                    TV
                  </span>
                )}
              </span>
            )}
            {competition && (
              <span className="hidden md:inline text-[10px] text-zinc-400 truncate max-w-[140px]">
                · {competition}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#00F593]/10 text-[#00F593] text-[10px] font-bold">
              <Activity className={`w-3 h-3 ${isAnalyzing ? 'animate-pulse' : ''}`} />
              <span>
                {analysis?.engineMode === 'gemini'
                  ? 'IA'
                  : captureStatus === 'cors_blocked'
                    ? '11v11'
                    : 'Óptica 11v11'}
              </span>
            </span>
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => {
                triggerHaptic('light');
                onRefreshNow();
              }}
              aria-label={pickLang(lang, {
                es: 'Recalibrar visión táctica',
                ca: 'Recalibrar visió tàctica',
                en: 'Recalibrate tactical vision',
              })}
              className="min-h-[32px] min-w-[32px] px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-[11px] font-semibold text-zinc-200 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin text-[#00F593]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onDisable();
              }}
              className="min-h-[32px] px-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-[11px] font-bold text-rose-200 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{pickLang(lang, { es: 'Cerrar IA', ca: 'Tancar IA', en: 'Close AI' })}</span>
            </button>
          </div>
        </div>

        {/* Main Responsive Sportsbook Body: 2D Live Pitch IMMEDIATELY First + Flow/Stats/Lineups */}
        {!analysis ? (
          <div className="py-6 text-center text-xs text-zinc-300">
            {pickLang(lang, {
              es: 'Cargando campo 2D, alineación 11v11 y momentum en directo…',
              ca: 'Carregant camp 2D, alineació 11v11 i momentum en directe…',
              en: 'Loading 2D pitch, 11v11 lineups and live match momentum…',
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1.22fr_0.78fr] gap-2.5 items-start">
            <SportsbookPitchDiagram
              lang={lang}
              analysis={analysis}
              homeTeamLabel={homeTeamLabel}
              awayTeamLabel={awayTeamLabel}
              details={details}
            />
            <SportsbookStatsAndLineups
              lang={lang}
              analysis={analysis}
              homeTeamLabel={homeTeamLabel}
              awayTeamLabel={awayTeamLabel}
              details={details}
            />
          </div>
        )}
      </div>
    </section>
  );
};
