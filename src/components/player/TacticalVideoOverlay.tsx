import React, { useMemo, useState } from 'react';
import { Activity, Eye, Navigation, RefreshCw, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type {
  TacticalCaptureStatus,
  TacticalPlayerNode,
  TacticalVisionAnalysis,
} from './tacticalVisionTypes';

interface TacticalVideoOverlayProps {
  lang: AppLanguage;
  enabled: boolean;
  isMinimized: boolean;
  isCompressed: boolean;
  showRadar?: boolean;
  showFieldFlow?: boolean;
  analysis: TacticalVisionAnalysis | null;
}

export const TacticalVideoOverlay: React.FC<TacticalVideoOverlayProps> = ({
  lang,
  enabled,
  isMinimized,
  isCompressed,
  showRadar = true,
  showFieldFlow = true,
  analysis,
}) => {
  const playerMap = useMemo(() => {
    const m = new Map<string, TacticalPlayerNode>();
    for (const p of analysis?.players || []) {
      m.set(p.id, p);
    }
    return m;
  }, [analysis?.players]);

  const activePlayer = useMemo(() => {
    const list = analysis?.players || [];
    return list.find((p) => p.hasBall) || list[0] || null;
  }, [analysis?.players]);

  if (!enabled || isMinimized || isCompressed || !analysis) return null;

  const homeColor = analysis.homeKitColor || '#00F593';
  const awayColor = analysis.awayKitColor || '#9146FF';
  const isPitchVisible = analysis.isMatchPitchVisible;
  const activeAttack = analysis.attacks?.[0] || null;
  const activeColor =
    analysis.possession.team === 'away'
      ? awayColor
      : analysis.possession.team === 'home'
        ? homeColor
        : '#00F593';

  return (
    <div
      aria-label={pickLang(lang, {
        es: 'Radar táctico y flujo sobre el partido',
        ca: 'Radar tàctic i flux sobre el partit',
        en: 'Non-invasive Tactical Radar & Flow',
      })}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      {/* 1. Ultra-subtle Perimeter Territorial Pressure Hairline (Zero Center Obstruction) */}
      <div className="absolute top-0 inset-x-0 h-[3px] flex bg-black/20">
        <div
          style={{
            width: `${Math.max(15, Math.min(85, analysis.possession.homePct))}%`,
            backgroundColor: homeColor,
          }}
          className="h-full opacity-65 transition-all duration-700"
        />
        <div
          style={{
            width: `${Math.max(15, Math.min(85, analysis.possession.awayPct))}%`,
            backgroundColor: awayColor,
          }}
          className="h-full opacity-65 transition-all duration-700"
        />
      </div>

      {/* 2. Optional Ultra-Light Translucent Field Flow Vector (Edge-safe, never covers faces/ball with boxes) */}
      {showFieldFlow && isPitchVisible && activeAttack && (
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full opacity-40"
        >
          <defs>
            <marker
              id="rtv-flow-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="5.5"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,1 L6,3.5 L0,6 Z" fill={activeColor} fillOpacity="0.9" />
            </marker>
          </defs>
          <path
            d={`M ${activeAttack.fromX} ${activeAttack.fromY} Q ${(activeAttack.fromX + activeAttack.toX) / 2} ${Math.min(activeAttack.fromY, activeAttack.toY) - 28} ${activeAttack.toX} ${activeAttack.toY}`}
            fill="none"
            stroke={activeColor}
            strokeWidth="2.8"
            strokeDasharray="10 7"
            strokeLinecap="round"
            markerEnd="url(#rtv-flow-arrow)"
          />
          {analysis.ballZone && (
            <circle
              cx={analysis.ballZone.x}
              cy={analysis.ballZone.y}
              r="22"
              fill={activeColor}
              fillOpacity="0.12"
              stroke={activeColor}
              strokeOpacity="0.55"
              strokeWidth="1.6"
            />
          )}
        </svg>
      )}

      {/* 3. Pro Broadcast Corner 2D Tactical Radar (Translucent, Stationary Pitch, Players & Passing Network) */}
      {showRadar && (
        <div className="absolute bottom-2.5 right-2.5 sm:bottom-3.5 sm:right-3.5 w-[138px] sm:w-[192px] rounded-xl bg-[#070B12]/50 backdrop-blur-[3px] border border-white/15 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-opacity duration-300">
          <div className="relative w-full aspect-[16/10] rounded-md overflow-hidden bg-emerald-950/30">
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="w-full h-full">
              {/* Minimalist 2D Pitch Markings */}
              <g stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="6" fill="none">
                <rect x="28" y="36" width="944" height="928" rx="10" />
                <line x1="500" y1="36" x2="500" y2="964" />
                <circle cx="500" cy="500" r="118" />
                <rect x="28" y="255" width="136" height="490" />
                <rect x="836" y="255" width="136" height="490" />
              </g>

              {/* Active Ball / Play Zone Heat Pulse */}
              {isPitchVisible && analysis.ballZone && (
                <circle
                  cx={analysis.ballZone.x}
                  cy={analysis.ballZone.y}
                  r="64"
                  fill={activeColor}
                  fillOpacity="0.22"
                />
              )}

              {/* Passing Network Lines Inside Corner Radar */}
              {isPitchVisible &&
                analysis.passingLines.map((line, idx) => {
                  const from = playerMap.get(line.fromId);
                  const to = playerMap.get(line.toId);
                  if (!from || !to) return null;
                  const strokeColor = line.team === 'away' ? awayColor : homeColor;
                  return (
                    <line
                      key={`radar-line-${idx}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={strokeColor}
                      strokeOpacity="0.72"
                      strokeWidth="9"
                      strokeDasharray={line.kind === 'compact_line' ? '16 12' : undefined}
                      strokeLinecap="round"
                    />
                  );
                })}

              {/* Attack Vector Arrow Inside Corner Radar */}
              {isPitchVisible && activeAttack && (
                <line
                  x1={activeAttack.fromX}
                  y1={activeAttack.fromY}
                  x2={activeAttack.toX}
                  y2={activeAttack.toY}
                  stroke="#FACC15"
                  strokeOpacity="0.88"
                  strokeWidth="12"
                  strokeDasharray="18 10"
                  strokeLinecap="round"
                />
              )}

              {/* Player Dots on the 2D Pitch */}
              {isPitchVisible &&
                analysis.players.map((p) => {
                  const color = p.team === 'away' ? awayColor : homeColor;
                  return (
                    <g key={`radar-p-${p.id}`}>
                      {p.hasBall && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="42"
                          fill="none"
                          stroke="#FACC15"
                          strokeWidth="10"
                          strokeOpacity="0.9"
                        />
                      )}
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={p.hasBall ? '26' : '20'}
                        fill={color}
                        stroke="#070B12"
                        strokeWidth="8"
                      />
                    </g>
                  );
                })}
            </svg>

            {!isPitchVisible && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#070B12]/45 text-[9px] font-medium text-zinc-200 text-center px-1.5">
                {pickLang(lang, {
                  es: 'Plano cerrado',
                  ca: 'Pla tancat',
                  en: 'Close-up shot',
                })}
              </div>
            )}
          </div>

          {/* Ultra-compact 1-line active player tag inside radar */}
          {isPitchVisible && activePlayer && (
            <div className="mt-1 flex items-center justify-between gap-1 px-0.5 text-[9px] text-zinc-200/95 leading-none">
              <span className="truncate font-semibold">
                {activePlayer.jersey ? `#${activePlayer.jersey} ` : ''}
                {activePlayer.name}
              </span>
              <span className="font-mono tabular-nums text-[#00F593] shrink-0">
                {analysis.possession.homePct}-{analysis.possession.awayPct}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface TacticalTelemetryPanelProps {
  lang: AppLanguage;
  enabled: boolean;
  analysis: TacticalVisionAnalysis | null;
  isAnalyzing: boolean;
  errorMsg: string | null;
  captureStatus: TacticalCaptureStatus;
  homeTeamLabel: string;
  awayTeamLabel: string;
  showRadar: boolean;
  showFieldFlow: boolean;
  onToggleRadar: () => void;
  onToggleFieldFlow: () => void;
  onDisable: () => void;
  onRefreshNow: () => void;
}

export const TacticalTelemetryPanel: React.FC<TacticalTelemetryPanelProps> = ({
  lang,
  enabled,
  analysis,
  isAnalyzing,
  errorMsg,
  captureStatus,
  homeTeamLabel,
  awayTeamLabel,
  showRadar,
  showFieldFlow,
  onToggleRadar,
  onToggleFieldFlow,
  onDisable,
  onRefreshNow,
}) => {
  const [showTip, setShowTip] = useState(false);
  if (!enabled) return null;

  const homeColor = analysis?.homeKitColor || '#00F593';
  const awayColor = analysis?.awayKitColor || '#9146FF';

  return (
    <div
      aria-label={pickLang(lang, {
        es: 'Panel de telemetría táctica del partido',
        ca: 'Panell de telemetria tàctica del partit',
        en: 'Live Tactical Telemetry Panel',
      })}
      className="px-2.5 sm:px-4 pt-2 pb-1 bg-[#07090F] border-t border-white/[0.08]"
    >
      <div className="rounded-xl bg-[#101420] border border-white/[0.1] px-3 py-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Activity className={`w-3.5 h-3.5 text-[#00F593] shrink-0 ${isAnalyzing ? 'animate-pulse' : ''}`} />
            <span className="text-[11px] font-display font-bold text-white truncate">
              {pickLang(lang, {
                es: 'Radar Táctico',
                ca: 'Radar Tàctic',
                en: 'Tactical Radar',
              })}
            </span>
            {analysis?.attacksSummary?.phaseLabel && (
              <>
                <span className="text-zinc-500 text-[10px]" aria-hidden="true">·</span>
                <span className="text-[10px] text-zinc-300 truncate">
                  {analysis.attacksSummary.phaseLabel}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onToggleRadar();
              }}
              aria-pressed={showRadar}
              className={`h-7 px-2 rounded-lg text-[10px] font-semibold border flex items-center gap-1 cursor-pointer transition-colors ${
                showRadar
                  ? 'bg-[#00F593]/15 border-[#00F593]/40 text-[#00F593]'
                  : 'bg-white/[0.05] border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Radar 2D</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onToggleFieldFlow();
              }}
              aria-pressed={showFieldFlow}
              className={`h-7 px-2 rounded-lg text-[10px] font-semibold border flex items-center gap-1 cursor-pointer transition-colors ${
                showFieldFlow
                  ? 'bg-[#9146FF]/18 border-[#9146FF]/45 text-[#BF94FF]'
                  : 'bg-white/[0.05] border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
            >
              <Navigation className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Vector', ca: 'Vector', en: 'Flow' })}</span>
            </button>
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => {
                triggerHaptic('light');
                onRefreshNow();
              }}
              aria-label={pickLang(lang, {
                es: 'Actualizar radar táctico',
                ca: 'Actualitzar radar tàctic',
                en: 'Refresh tactical radar',
              })}
              className="w-7 h-7 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-zinc-200 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isAnalyzing ? 'animate-spin text-[#00F593]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onDisable();
              }}
              aria-label={pickLang(lang, {
                es: 'Desactivar Radar Táctico',
                ca: 'Desactivar Radar Tàctic',
                en: 'Disable Tactical Radar',
              })}
              className="h-7 px-2 rounded-lg bg-white/[0.08] hover:bg-rose-500/30 text-[10px] font-semibold text-zinc-200 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Ocultar', ca: 'Amagar', en: 'Hide' })}</span>
            </button>
          </div>
        </div>

        {errorMsg ? (
          <p className="text-[11px] text-amber-300 leading-snug">{errorMsg}</p>
        ) : !analysis ? (
          <p className="text-[11px] text-zinc-300 leading-snug">
            {captureStatus === 'waiting_frame'
              ? pickLang(lang, {
                  es: 'Esperando fotograma estable del partido…',
                  ca: 'Esperant fotograma estable del partit…',
                  en: 'Waiting for stable match video frame…',
                })
              : pickLang(lang, {
                  es: 'Sincronizando radar 2D, zonas de ataque y posesión en directo…',
                  ca: 'Sincronitzant radar 2D, zones d’atac i possessió en directe…',
                  en: 'Syncing 2D tactical radar, attack lanes and live possession…',
                })}
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px]">
                <span className="font-semibold text-white truncate max-w-[38%]">
                  {homeTeamLabel}{' '}
                  <span className="font-mono tabular-nums text-[#00F593]">
                    {analysis.possession.homePct}%
                  </span>
                </span>
                <span className="text-[10px] text-zinc-400 font-mono tabular-nums shrink-0">
                  {pickLang(lang, { es: 'Posesión · Ataques', ca: 'Possessió · Atacs', en: 'Poss · Atk' })}{' '}
                  {analysis.attacksSummary.homeAttacks}-{analysis.attacksSummary.awayAttacks}
                </span>
                <span className="font-semibold text-white truncate max-w-[38%] text-right">
                  <span className="font-mono tabular-nums text-[#BF94FF]">
                    {analysis.possession.awayPct}%
                  </span>{' '}
                  {awayTeamLabel}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex gap-0.5">
                <div
                  style={{
                    width: `${Math.max(12, Math.min(88, analysis.possession.homePct))}%`,
                    backgroundColor: homeColor,
                  }}
                  className="h-full transition-all duration-500"
                />
                <div
                  style={{
                    width: `${Math.max(12, Math.min(88, analysis.possession.awayPct))}%`,
                    backgroundColor: awayColor,
                  }}
                  className="h-full transition-all duration-500"
                />
              </div>
            </div>

            {analysis.laneActivity && (
              <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400 bg-white/[0.03] rounded-lg px-2 py-1">
                <span>
                  {pickLang(lang, { es: 'Banda Sup.', ca: 'Banda Sup.', en: 'Far Flank' })}:{' '}
                  <strong className="font-mono tabular-nums text-zinc-200">{analysis.laneActivity.leftPct}%</strong>
                </span>
                <span>
                  {pickLang(lang, { es: 'Centro', ca: 'Centre', en: 'Center' })}:{' '}
                  <strong className="font-mono tabular-nums text-[#00F593]">{analysis.laneActivity.centerPct}%</strong>
                </span>
                <span>
                  {pickLang(lang, { es: 'Banda Inf.', ca: 'Banda Inf.', en: 'Near Flank' })}:{' '}
                  <strong className="font-mono tabular-nums text-zinc-200">{analysis.laneActivity.rightPct}%</strong>
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] sm:text-[11px] text-zinc-300 leading-snug">
                {!analysis.isMatchPitchVisible
                  ? pickLang(lang, {
                      es: 'Plano sin campo visible · En espera de cámara táctica.',
                      ca: 'Pla sense camp visible · Esperant càmera tàctica.',
                      en: 'Non-pitch camera angle · Waiting for wide tactical shot.',
                    })
                  : analysis.tacticalNote || analysis.possession.summary}
              </p>
              <button
                type="button"
                onClick={() => setShowTip((v) => !v)}
                className="text-[10px] text-zinc-400 hover:text-white shrink-0 underline cursor-pointer"
              >
                {showTip
                  ? pickLang(lang, { es: 'Menos', ca: 'Menys', en: 'Less' })
                  : pickLang(lang, { es: 'Cómo lee', ca: 'Com llegeix', en: 'How it works' })}
              </button>
            </div>
            {showTip && (
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                {pickLang(lang, {
                  es: 'El radar 2D en la esquina mantiene los jugadores y pases estables sin tapar el centro del campo aunque la cámara se mueva; puedes activar o apagar el Vector sobre el césped cuando quieras.',
                  ca: 'El radar 2D a la cantonada manté els jugadors i passades estables sense tapar el centre del camp encara que la càmera es mogui.',
                  en: 'The corner 2D radar keeps players and passing lines stable without blocking the center pitch as the camera pans.',
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
