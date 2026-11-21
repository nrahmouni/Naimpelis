import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleDot, Crosshair, Shield } from 'lucide-react';
import type { AppLanguage, FootballMatchDetails } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type { TacticalPlayerNode, TacticalVisionAnalysis } from './tacticalVisionTypes';

interface SportsbookPitchDiagramProps {
  lang: AppLanguage;
  analysis: TacticalVisionAnalysis;
  homeTeamLabel: string;
  awayTeamLabel: string;
  details?: FootballMatchDetails | null;
}

export const SportsbookPitchDiagram: React.FC<SportsbookPitchDiagramProps> = ({
  lang,
  analysis,
  homeTeamLabel,
  awayTeamLabel,
  details,
}) => {
  const [selectedDotId, setSelectedDotId] = useState<string | null>(null);
  const [showShotsLayer, setShowShotsLayer] = useState<boolean>(false);

  const homeColor = analysis.homeKitColor || '#00F593';
  const awayColor = analysis.awayKitColor || '#9146FF';
  const attackDir = analysis.attackDirection || 'neutral';
  const attackIntensity = Math.max(0, Math.min(100, analysis.attackIntensity ?? 45));
  const ballX = analysis.ballZone?.x ?? 500;
  const ballY = analysis.ballZone?.y ?? 500;

  const selectedPlayer: TacticalPlayerNode | null = useMemo(() => {
    if (!selectedDotId) return null;
    return analysis.players.find((p) => p.id === selectedDotId) || null;
  }, [analysis.players, selectedDotId]);

  const activeVector = analysis.attacks?.[0] || null;
  const shots = useMemo(() => (details?.shotsMap || []).slice(-18), [details?.shotsMap]);

  const activeTeamName =
    attackDir === 'home'
      ? homeTeamLabel
      : attackDir === 'away'
        ? awayTeamLabel
        : pickLang(lang, { es: 'Disputa', ca: 'Disputa', en: 'Contested' });

  const phaseHeadline =
    analysis.phaseType === 'goal_kick'
      ? pickLang(lang, { es: 'Saque de puerta', ca: 'Servei de porteria', en: 'Goal Kick' })
      : analysis.phaseType === 'shot_threat'
        ? pickLang(lang, { es: 'Ocasión en área', ca: 'Ocasió a l’àrea', en: 'Box Shot Threat' })
        : analysis.phaseType === 'dangerous_attack'
          ? pickLang(lang, { es: 'Ataque peligroso', ca: 'Atac perillós', en: 'Dangerous Attack' })
          : analysis.phaseType === 'counter'
            ? pickLang(lang, { es: 'Contraataque', ca: 'Contraatac', en: 'Counter Attack' })
            : analysis.phaseType === 'corner'
              ? pickLang(lang, { es: 'Saque de esquina', ca: 'Córner', en: 'Corner Kick' })
              : analysis.phaseType === 'free_kick'
                ? pickLang(lang, { es: 'Falta táctica', ca: 'Falta tàctica', en: 'Free Kick' })
                : analysis.phaseType === 'attack'
                  ? pickLang(lang, { es: 'Ataque', ca: 'Atac', en: 'Attack' })
                  : pickLang(lang, { es: 'Posesión en juego', ca: 'Possessió en joc', en: 'Active Possession' });

  const attackAccent =
    attackDir === 'home' ? homeColor : attackDir === 'away' ? awayColor : '#E4E4E7';

  const isGoalKickHome = analysis.phaseType === 'goal_kick' && ballX <= 500;
  const isGoalKickAway = analysis.phaseType === 'goal_kick' && ballX > 500;
  const isCorner = analysis.phaseType === 'corner';
  const ballSvgX = 30 + (ballX / 1000) * 940;
  const ballSvgY = 34 + (ballY / 1000) * 552;

  return (
    <div className="space-y-1.5">
      {/* Live Pitch Top Action Ribbon ("Para dónde tira el partido / Saque de puerta / Ataque") */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-[#080B12] border border-white/[0.08]">
        <div className="flex items-center gap-1.5 min-w-0">
          {attackDir === 'away' ? (
            <ArrowLeft className="w-3.5 h-3.5 shrink-0 animate-pulse" style={{ color: attackAccent }} />
          ) : attackDir === 'home' ? (
            <ArrowRight className="w-3.5 h-3.5 shrink-0 animate-pulse" style={{ color: attackAccent }} />
          ) : (
            <CircleDot className="w-3.5 h-3.5 text-[#00F593] shrink-0" />
          )}
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-white truncate">
            {phaseHeadline}
          </span>
          <span className="text-zinc-500 text-[11px]" aria-hidden="true">·</span>
          <span className="text-[11px] font-extrabold truncate" style={{ color: attackAccent }}>
            {activeTeamName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono tabular-nums text-zinc-400">
            {analysis.possession.zoneLabel}
          </span>
          {shots.length > 0 && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowShotsLayer((v) => !v);
              }}
              aria-pressed={showShotsLayer}
              className={`h-6 px-2 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer border transition-colors ${
                showShotsLayer
                  ? 'bg-amber-400/15 border-amber-400/45 text-amber-300'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Tiros', ca: 'Tirs', en: 'Shots' })}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2D Bookmaker Tactical Field SVG (Always-Visible Smooth-Gliding 11v11 + Attacks & Set Pieces) */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[16/10] rounded-xl overflow-hidden border border-white/[0.14] bg-[#0B1E17] select-none shadow-inner">
        {/* Top Goal Labels Inside Pitch Margins */}
        <div className="pointer-events-none absolute top-1 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/45 text-[10px] font-bold tracking-tight text-white">
          <span
            className="w-2 h-2 rounded-full border border-black/50"
            style={{ backgroundColor: homeColor }}
          />
          <span>{homeTeamLabel}</span>
          {details?.homeLineup?.formation && (
            <span className="font-mono text-[9px] text-zinc-300">
              {details.homeLineup.formation}
            </span>
          )}
        </div>
        <div className="pointer-events-none absolute top-1 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/45 text-[10px] font-bold tracking-tight text-white">
          {details?.awayLineup?.formation && (
            <span className="font-mono text-[9px] text-zinc-300">
              {details.awayLineup.formation}
            </span>
          )}
          <span>{awayTeamLabel}</span>
          <span
            className="w-2 h-2 rounded-full border border-black/50"
            style={{ backgroundColor: awayColor }}
          />
        </div>

        <svg viewBox="0 0 1000 620" className="w-full h-full block" role="img" aria-label="2D Live Match Pitch">
          <defs>
            <linearGradient id="sb-attack-right" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={homeColor} stopOpacity="0" />
              <stop offset="60%" stopColor={homeColor} stopOpacity={attackIntensity > 60 ? '0.28' : '0.16'} />
              <stop offset="100%" stopColor={homeColor} stopOpacity={attackIntensity > 60 ? '0.48' : '0.3'} />
            </linearGradient>
            <linearGradient id="sb-attack-left" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor={awayColor} stopOpacity="0" />
              <stop offset="60%" stopColor={awayColor} stopOpacity={attackIntensity > 60 ? '0.28' : '0.16'} />
              <stop offset="100%" stopColor={awayColor} stopOpacity={attackIntensity > 60 ? '0.48' : '0.3'} />
            </linearGradient>
            <marker id="sb-arrow-home" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,1 L7,4 L0,7 Z" fill={homeColor} />
            </marker>
            <marker id="sb-arrow-away" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,1 L7,4 L0,7 Z" fill={awayColor} />
            </marker>
          </defs>

          {/* Alternating Mowed Pitch Stripes */}
          {Array.from({ length: 10 }).map((_, i) => (
            <rect
              key={`stripe-${i}`}
              x={30 + i * 94}
              y={34}
              width={94}
              height={552}
              fill={i % 2 === 0 ? '#0F2A20' : '#0B2118'}
            />
          ))}

          {/* Directional Attacking Territory Sweep */}
          {attackDir === 'home' && !isGoalKickHome && (
            <rect
              x={Math.max(30, Math.min(620, (ballX / 1000) * 940 - 40))}
              y={34}
              width={970 - Math.max(30, Math.min(620, (ballX / 1000) * 940 - 40))}
              height={552}
              fill="url(#sb-attack-right)"
            />
          )}
          {attackDir === 'away' && !isGoalKickAway && (
            <rect
              x={30}
              y={34}
              width={Math.max(320, Math.min(940, (ballX / 1000) * 940 + 70)) - 30}
              height={552}
              fill="url(#sb-attack-left)"
            />
          )}

          {/* Active Goal Kick 6-Yard Highlight + Launch Zone */}
          {(isGoalKickHome || isGoalKickAway) && (
            <g>
              <rect
                x={isGoalKickHome ? 30 : 880}
                y={200}
                width={90}
                height={220}
                rx="6"
                fill={isGoalKickHome ? homeColor : awayColor}
                fillOpacity="0.28"
                stroke={isGoalKickHome ? homeColor : awayColor}
                strokeWidth="3"
                strokeDasharray="8 6"
              />
              <path
                d={
                  isGoalKickHome
                    ? 'M 72 310 Q 320 210 580 310'
                    : 'M 928 310 Q 680 210 420 310'
                }
                fill="none"
                stroke={isGoalKickHome ? homeColor : awayColor}
                strokeWidth="4"
                strokeDasharray="10 7"
                markerEnd={isGoalKickHome ? 'url(#sb-arrow-home)' : 'url(#sb-arrow-away)'}
              />
            </g>
          )}

          {/* Active Corner Quadrant Arc + Delivery Sweep */}
          {isCorner && (
            <g>
              <circle
                cx={ballX >= 500 ? 970 : 30}
                cy={ballY <= 500 ? 34 : 586}
                r="62"
                fill={attackAccent}
                fillOpacity="0.28"
                stroke={attackAccent}
                strokeWidth="3"
                strokeDasharray="6 5"
              />
              <path
                d={`M ${ballX >= 500 ? 970 : 30} ${ballY <= 500 ? 34 : 586} Q ${
                  ballX >= 500 ? 910 : 90
                } 240 ${ballX >= 500 ? 878 : 122} 310`}
                fill="none"
                stroke={attackAccent}
                strokeWidth="4"
                strokeDasharray="9 6"
                markerEnd={ballX >= 500 ? 'url(#sb-arrow-home)' : 'url(#sb-arrow-away)'}
              />
            </g>
          )}

          {/* Crisp Regulatory White Field Markings */}
          <g stroke="#FFFFFF" strokeOpacity="0.34" strokeWidth="2.3" fill="none">
            <rect x="30" y="34" width="940" height="552" rx="4" />
            <line x1="500" y1="34" x2="500" y2="586" />
            <circle cx="500" cy="310" r="68" />
            <circle cx="500" cy="310" r="4" fill="#FFFFFF" fillOpacity="0.45" />
            <rect x="30" y="148" width="134" height="324" />
            <rect x="30" y="228" width="46" height="164" />
            <circle cx="122" cy="310" r="3" fill="#FFFFFF" fillOpacity="0.45" />
            <path d="M 164 252 A 64 64 0 0 1 164 368" />
            <rect x="836" y="148" width="134" height="324" />
            <rect x="924" y="228" width="46" height="164" />
            <circle cx="878" cy="310" r="3" fill="#FFFFFF" fillOpacity="0.45" />
            <path d="M 836 252 A 64 64 0 0 0 836 368" />
            <path d="M 30 48 A 14 14 0 0 0 44 34" />
            <path d="M 956 34 A 14 14 0 0 0 970 48" />
            <path d="M 30 572 A 14 14 0 0 1 44 586" />
            <path d="M 956 586 A 14 14 0 0 1 970 572" />
            <rect x="14" y="264" width="16" height="92" strokeOpacity="0.5" fill="#FFFFFF" fillOpacity="0.08" />
            <rect x="970" y="264" width="16" height="92" strokeOpacity="0.5" fill="#FFFFFF" fillOpacity="0.08" />
          </g>

          {/* Animated Directional Attack Chevrons along Ball Corridor */}
          {attackDir !== 'neutral' && !isGoalKickHome && !isGoalKickAway && (
            <g opacity={attackIntensity >= 60 ? 0.94 : 0.7}>
              {[0, 1, 2].map((step) => {
                const isHome = attackDir === 'home';
                const px = isHome
                  ? Math.min(935, ballSvgX + 44 + step * 48)
                  : Math.max(65, ballSvgX - 44 - step * 48);
                const py = ballSvgY;
                const d = isHome
                  ? `M ${px - 9} ${py - 13} L ${px + 8} ${py} L ${px - 9} ${py + 13}`
                  : `M ${px + 9} ${py - 13} L ${px - 8} ${py} L ${px + 9} ${py + 13}`;
                return (
                  <path
                    key={`chev-${step}`}
                    d={d}
                    fill="none"
                    stroke={attackAccent}
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </g>
          )}

          {/* Active Curved Attacking Corridor Arrow */}
          {activeVector && !isGoalKickHome && !isGoalKickAway && !isCorner && (
            <path
              d={`M ${30 + (activeVector.fromX / 1000) * 940} ${34 + (activeVector.fromY / 1000) * 552} Q ${
                30 + ((activeVector.fromX + activeVector.toX) / 2000) * 940
              } ${34 + (Math.min(activeVector.fromY, activeVector.toY) / 1000) * 552 - 24} ${
                30 + (activeVector.toX / 1000) * 940
              } ${34 + (activeVector.toY / 1000) * 552}`}
              fill="none"
              stroke={activeVector.team === 'away' ? awayColor : homeColor}
              strokeWidth="4"
              strokeDasharray="11 8"
              strokeLinecap="round"
              markerEnd={activeVector.team === 'away' ? 'url(#sb-arrow-away)' : 'url(#sb-arrow-home)'}
            />
          )}

          {/* Optional Shots Overlay from Live Stats */}
          {showShotsLayer &&
            shots.map((sh, i) => {
              const sx = 30 + (sh.x / 100) * 940;
              const sy = 34 + (sh.y / 100) * 552;
              return (
                <circle
                  key={`shot-${sh.id || i}`}
                  cx={sx}
                  cy={sy}
                  r={sh.isGoal ? 7 : 5}
                  fill={sh.isGoal ? '#10B981' : sh.onTarget ? '#F59E0B' : 'transparent'}
                  stroke={sh.isGoal ? '#FFFFFF' : sh.home ? homeColor : awayColor}
                  strokeWidth="2"
                  opacity="0.88"
                />
              );
            })}

          {/* Smooth-Gliding 22 Live Player Lineup Dots via CSS translate() */}
          {analysis.players.map((p) => {
            const px = Math.round((30 + (p.x / 1000) * 940) * 10) / 10;
            const py = Math.round((34 + (p.y / 1000) * 552) * 10) / 10;
            const teamClr = p.team === 'away' ? awayColor : homeColor;
            const fillClr = p.isGk ? '#F59E0B' : teamClr;
            const isSelected = selectedDotId === p.id;
            const shortName = (p.shortName || p.name || '').slice(0, 10);

            return (
              <g
                key={p.id}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedDotId((cur) => (cur === p.id ? null : p.id));
                }}
                className="cursor-pointer"
                style={{
                  transform: `translate(${px}px, ${py}px)`,
                  transition: 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                {(p.hasBall || isSelected) && (
                  <circle
                    cx={0}
                    cy={0}
                    r={isSelected ? 21 : 18}
                    fill="none"
                    stroke={isSelected ? '#FFFFFF' : '#FACC15'}
                    strokeWidth={isSelected ? '3' : '2.5'}
                    strokeOpacity="0.95"
                  />
                )}
                <circle
                  cx={0}
                  cy={0}
                  r={13}
                  fill={fillClr}
                  stroke="#090C14"
                  strokeWidth="2.6"
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill="#05070B"
                  fontSize="11"
                  fontWeight="800"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {p.jersey || ''}
                </text>
                {p.goals ? (
                  <circle cx={10} cy={-10} r="5" fill="#10B981" stroke="#090C14" strokeWidth="1.5" />
                ) : null}
                {p.redCard ? (
                  <rect x={-14} y={-14} width="6.5" height="8.5" rx="1.5" fill="#EF4444" stroke="#090C14" strokeWidth="1" />
                ) : p.yellowCard ? (
                  <rect x={-14} y={-14} width="6.5" height="8.5" rx="1.5" fill="#FACC15" stroke="#090C14" strokeWidth="1" />
                ) : null}
                <text
                  x={0}
                  y={23}
                  textAnchor="middle"
                  fill="#F4F4F5"
                  fontSize="9.5"
                  fontWeight="700"
                  paintOrder="stroke"
                  stroke="#07110D"
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                >
                  {shortName}
                </text>
              </g>
            );
          })}

          {/* Smooth-Gliding Live Ball Marker via CSS translate() */}
          <g
            style={{
              transform: `translate(${Math.round(ballSvgX * 10) / 10}px, ${Math.round(ballSvgY * 10) / 10}px)`,
              transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <circle cx={0} cy={0} r="17" fill={attackAccent} fillOpacity="0.24" />
            <circle cx={0} cy={0} r="6.5" fill="#FFFFFF" stroke="#090C14" strokeWidth="2.4" />
          </g>
        </svg>

        {/* Bottom Live Callout Pill Overlay (e.g. SAQUE DE PUERTA / ATAQUE / CÓRNER) */}
        <div className="pointer-events-none absolute bottom-1.5 inset-x-2 flex items-center justify-between gap-2 text-[10px]">
          <span className="px-2 py-0.5 rounded bg-black/65 text-zinc-100 font-semibold">
            {phaseHeadline} · {activeTeamName}
          </span>
          <span className="px-2 py-0.5 rounded bg-black/65 text-zinc-300 font-mono tabular-nums">
            {pickLang(lang, { es: 'Empuje', ca: 'Empenta', en: 'Pressure' })}: {attackIntensity}%
          </span>
        </div>
      </div>

      {/* Selected Player Single-Line Inspector Strip */}
      {selectedPlayer && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#141A29] border border-white/[0.1] text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Shield
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: selectedPlayer.team === 'away' ? awayColor : homeColor }}
            />
            <span className="font-mono font-bold text-zinc-300">#{selectedPlayer.jersey}</span>
            <span className="font-bold text-white truncate">{selectedPlayer.name}</span>
            {selectedPlayer.roleHint && (
              <span className="text-[11px] text-zinc-400">· {selectedPlayer.roleHint}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-[11px]">
            {selectedPlayer.rating && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                {selectedPlayer.rating}
              </span>
            )}
            {selectedPlayer.goals ? <span className="text-emerald-400">⚽ {selectedPlayer.goals}</span> : null}
            {selectedPlayer.yellowCard ? <span className="text-amber-300">🟨</span> : null}
            {selectedPlayer.redCard ? <span className="text-rose-400">🟥</span> : null}
            <button
              type="button"
              onClick={() => setSelectedDotId(null)}
              className="text-zinc-400 hover:text-white cursor-pointer px-1"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
