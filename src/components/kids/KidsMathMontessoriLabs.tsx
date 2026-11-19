import React from 'react';
import { CheckCircle2, Trophy } from 'lucide-react';
import type { KidsAgeGroup } from '../../types';
import { playKidsSound } from './kidsAudioEngine';
import {
  generateAdaptiveMathQuestion,
  type MathQuestion,
  type MathSubMode,
} from './kidsMathEngine';
import { KidsSquishButton } from './KidsPrimitives';

interface KidsMathMontessoriLabsProps {
  subMode: Exclude<MathSubMode, 'bubbles'>;
  ageGroup: KidsAgeGroup;
  soundEnabled: boolean;
  recordDomainResult: (domain: 'math' | 'lang' | 'logic', ok: boolean, itemId?: string) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
  setConfettiActive: (v: boolean) => void;
  // Scale
  scaleBase: number;
  scaleTarget: number;
  scaleAdded: number;
  scaleStatus: 'playing' | 'ok' | 'high';
  nextScaleChallenge: () => void;
  handleAddScaleWeight: (delta: number) => void;
  // Fractions
  fracDenom: number;
  fracTargetNum: number;
  selectedSlices: number[];
  fracStatus: 'playing' | 'ok';
  nextFractionChallenge: () => void;
  toggleSlice: (sliceIdx: number) => void;
  // Clock & Coins
  clockTargetHour: number;
  setClockTargetHour: React.Dispatch<React.SetStateAction<number>>;
  coinTargetEur: number;
  setCoinTargetEur: React.Dispatch<React.SetStateAction<number>>;
  coinsTray: number[];
  setCoinsTray: React.Dispatch<React.SetStateAction<number[]>>;
  clockAnswerFeedback: 'ok' | 'retry' | null;
  setClockAnswerFeedback: React.Dispatch<React.SetStateAction<'ok' | 'retry' | null>>;
  // Duel
  duelQuestion: MathQuestion;
  setDuelQuestion: React.Dispatch<React.SetStateAction<MathQuestion>>;
  p1Score: number;
  setP1Score: React.Dispatch<React.SetStateAction<number>>;
  p2Score: number;
  setP2Score: React.Dispatch<React.SetStateAction<number>>;
  duelWinner: 1 | 2 | null;
  setDuelWinner: React.Dispatch<React.SetStateAction<1 | 2 | null>>;
}

export const KidsMathMontessoriLabs: React.FC<KidsMathMontessoriLabsProps> = ({
  subMode,
  ageGroup,
  soundEnabled,
  recordDomainResult,
  onEarnStar,
  onMissionPlay,
  setConfettiActive,
  scaleBase,
  scaleTarget,
  scaleAdded,
  scaleStatus,
  nextScaleChallenge,
  handleAddScaleWeight,
  fracDenom,
  fracTargetNum,
  selectedSlices,
  fracStatus,
  nextFractionChallenge,
  toggleSlice,
  clockTargetHour,
  setClockTargetHour,
  coinTargetEur,
  setCoinTargetEur,
  coinsTray,
  setCoinsTray,
  clockAnswerFeedback,
  setClockAnswerFeedback,
  duelQuestion,
  setDuelQuestion,
  p1Score,
  setP1Score,
  p2Score,
  setP2Score,
  duelWinner,
  setDuelWinner,
}) => {
  const coinTotal = coinsTray.reduce((acc, v) => acc + v, 0);

  if (subMode === 'scale') {
    const left = scaleBase + scaleAdded;
    const tiltDeg = Math.max(-12, Math.min(12, (scaleTarget - left) * 3));
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-between gap-3 p-3 rounded-2xl bg-[#09132B] border border-white/10 overflow-y-auto">
        <div className="text-center space-y-1">
          <h3 className="font-display font-black text-lg sm:text-2xl text-white">
            Equilibra la Báscula: {scaleBase} + <span className="text-amber-300">{scaleAdded}</span> ={' '}
            {scaleTarget}
          </h3>
          <p className="text-xs font-bold text-sky-200/80">
            Pulsa las pesas para igualar ambos lados de la balanza.
          </p>
        </div>

        <div className="w-full max-w-md py-4 flex flex-col items-center gap-2">
          <div
            className="w-full flex items-end justify-between gap-4 transition-transform duration-300"
            style={{ transform: `rotate(${tiltDeg}deg)` }}
          >
            <div className="flex-1 p-3 rounded-2xl bg-[#182756] border-2 border-amber-400/60 text-center">
              <div className="text-[11px] font-bold text-amber-300">IZQUIERDA</div>
              <div className="font-display font-black text-3xl text-white tabular-nums">{left}</div>
            </div>
            <div className="flex-1 p-3 rounded-2xl bg-[#182756] border-2 border-sky-400/60 text-center">
              <div className="text-[11px] font-bold text-sky-300">OBJETIVO</div>
              <div className="font-display font-black text-3xl text-white tabular-nums">
                {scaleTarget}
              </div>
            </div>
          </div>
          <div className="w-4/5 h-2 rounded-full bg-slate-600" />
          <div className="w-8 h-8 bg-slate-700 rounded-t-xl border border-white/20" />
        </div>

        {scaleStatus === 'ok' ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-emerald-300 font-black text-base">
              <CheckCircle2 className="w-5 h-5" /> ¡Equilibrado! +3 estrellas
            </span>
            <KidsSquishButton
              onClick={nextScaleChallenge}
              className="px-5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs"
            >
              Siguiente reto
            </KidsSquishButton>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[-1, 1, 2, 5].map((delta) => (
              <KidsSquishButton
                key={delta}
                onClick={() => handleAddScaleWeight(delta)}
                className="px-5 rounded-2xl bg-[#1E2E68] border-b-4 border-[#0E1638] text-white font-black text-lg tabular-nums"
              >
                {delta > 0 ? `+${delta}` : delta}
              </KidsSquishButton>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (subMode === 'fractions') {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-between gap-3 p-3 rounded-2xl bg-[#09132B] border border-white/10 overflow-y-auto">
        <div className="text-center">
          <h3 className="font-display font-black text-xl sm:text-2xl text-white">
            Toca exactamente <span className="text-amber-300">{fracTargetNum}/{fracDenom}</span> de
            la pizza
          </h3>
          <p className="text-xs font-bold text-sky-200/80">
            Seleccionadas: {selectedSlices.length} de {fracDenom} porciones
          </p>
        </div>

        <svg width="210" height="210" viewBox="0 0 200 200" className="drop-shadow-xl">
          {Array.from({ length: fracDenom }).map((_, i) => {
            const startA = (i / fracDenom) * Math.PI * 2 - Math.PI / 2;
            const endA = ((i + 1) / fracDenom) * Math.PI * 2 - Math.PI / 2;
            const x1 = 100 + Math.cos(startA) * 86;
            const y1 = 100 + Math.sin(startA) * 86;
            const x2 = 100 + Math.cos(endA) * 86;
            const y2 = 100 + Math.sin(endA) * 86;
            const largeArc = endA - startA > Math.PI ? 1 : 0;
            const active = selectedSlices.includes(i);
            return (
              <path
                key={i}
                d={`M 100 100 L ${x1} ${y1} A 86 86 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={active ? '#F59E0B' : '#1E293B'}
                stroke="#0F172A"
                strokeWidth="4"
                className="cursor-pointer transition-colors"
                onClick={() => toggleSlice(i)}
              />
            );
          })}
          <circle
            cx="100"
            cy="100"
            r="88"
            fill="none"
            stroke="#FBBF24"
            strokeWidth="3"
            pointerEvents="none"
          />
        </svg>

        {fracStatus === 'ok' ? (
          <div className="flex items-center gap-3">
            <span className="text-emerald-300 font-black text-base">
              ¡Fracción {fracTargetNum}/{fracDenom} perfecta! +3 estrellas
            </span>
            <KidsSquishButton
              onClick={nextFractionChallenge}
              className="px-5 rounded-xl bg-emerald-400 text-slate-950 font-black text-xs"
            >
              Otra pizza
            </KidsSquishButton>
          </div>
        ) : (
          <KidsSquishButton
            onClick={nextFractionChallenge}
            className="px-4 rounded-xl bg-white/10 text-white text-xs font-black"
          >
            Cambiar fracción
          </KidsSquishButton>
        )}
      </div>
    );
  }

  if (subMode === 'clock_coins') {
    const hAng = (clockTargetHour / 12) * Math.PI * 2 - Math.PI / 2;
    return (
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto p-1">
        {/* Analog Clock Card */}
        <div className="rounded-2xl bg-[#09132B] border border-white/15 p-3.5 flex flex-col items-center justify-between gap-2.5">
          <div className="text-center">
            <div className="text-xs font-black text-sky-300 uppercase">Reloj Analógico</div>
            <div className="font-display font-black text-lg text-white">
              ¿Qué hora marca? {clockAnswerFeedback === 'ok' ? '(¡Correcto!)' : ''}
            </div>
          </div>
          <svg width="136" height="136" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="#17234B" stroke="#38BDF8" strokeWidth="4" />
            {[12, 3, 6, 9].map((n) => {
              const ang = (n / 12) * Math.PI * 2 - Math.PI / 2;
              return (
                <text
                  key={n}
                  x={60 + Math.cos(ang) * 40}
                  y={60 + Math.sin(ang) * 40 + 4}
                  textAnchor="middle"
                  fill="#E2E8F0"
                  fontSize="11"
                  fontWeight="900"
                >
                  {n}
                </text>
              );
            })}
            <line
              x1="60"
              y1="60"
              x2="60"
              y2="22"
              stroke="#94A3B8"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <line
              x1="60"
              y1="60"
              x2={60 + Math.cos(hAng) * 28}
              y2={60 + Math.sin(hAng) * 28}
              stroke="#FBBF24"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="60" cy="60" r="4" fill="#FBBF24" />
          </svg>
          <div className="grid grid-cols-4 gap-1.5 w-full">
            {[
              clockTargetHour,
              (clockTargetHour + 2) % 12 || 12,
              (clockTargetHour + 5) % 12 || 12,
              (clockTargetHour + 8) % 12 || 12,
            ]
              .sort((a, b) => a - b)
              .map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    const ok = h === clockTargetHour;
                    recordDomainResult('math', ok);
                    if (ok) {
                      setClockAnswerFeedback('ok');
                      playKidsSound('success', soundEnabled, true);
                      onEarnStar(2);
                      window.setTimeout(() => {
                        setClockAnswerFeedback(null);
                        setClockTargetHour((prev) => (prev + 3) % 12 || 12);
                      }, 800);
                    } else {
                      setClockAnswerFeedback('retry');
                      playKidsSound('error', soundEnabled, true);
                    }
                  }}
                  className="h-9 rounded-xl bg-[#1C2A5E] hover:bg-sky-400 hover:text-slate-950 text-white font-black text-xs cursor-pointer"
                >
                  {h}:00
                </button>
              ))}
          </div>
        </div>

        {/* Coins Lab Card */}
        <div className="rounded-2xl bg-[#09132B] border border-white/15 p-3.5 flex flex-col items-center justify-between gap-2.5">
          <div className="text-center">
            <div className="text-xs font-black text-amber-300 uppercase">Tienda de Monedas</div>
            <div className="font-display font-black text-lg text-white">
              Paga <span className="text-amber-300">{coinTargetEur}€</span> · Llevas{' '}
              <span className={coinTotal === coinTargetEur ? 'text-emerald-300' : 'text-sky-300'}>
                {coinTotal}€
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 min-h-[60px] flex-wrap">
            {coinsTray.length === 0 ? (
              <span className="text-xs text-sky-200/60">Toca monedas para sumar</span>
            ) : (
              coinsTray.map((val, idx) => (
                <span
                  key={idx}
                  className="w-11 h-11 rounded-full bg-amber-400 border-2 border-amber-200 text-slate-950 font-black text-sm flex items-center justify-center shadow"
                >
                  {val}€
                </span>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 w-full">
            {[1, 2, 5].map((cVal) => (
              <KidsSquishButton
                key={cVal}
                onClick={() => {
                  const nextTray = [...coinsTray, cVal];
                  const nextSum = coinTotal + cVal;
                  setCoinsTray(nextTray);
                  if (nextSum === coinTargetEur) {
                    setConfettiActive(true);
                    playKidsSound('levelUp', soundEnabled, true);
                    recordDomainResult('math', true);
                    onEarnStar(3);
                    window.setTimeout(() => {
                      setCoinsTray([]);
                      setCoinTargetEur(Math.floor(Math.random() * 9) + 3);
                    }, 850);
                  } else if (nextSum > coinTargetEur) {
                    playKidsSound('error', soundEnabled, true);
                    window.setTimeout(() => setCoinsTray([]), 500);
                  } else {
                    playKidsSound('tap', soundEnabled, true);
                  }
                }}
                className="flex-1 rounded-xl bg-amber-400 text-slate-950 font-black text-sm"
              >
                +{cVal}€
              </KidsSquishButton>
            ))}
            <button
              type="button"
              onClick={() => setCoinsTray([])}
              className="h-11 px-3 rounded-xl bg-white/10 text-white text-xs font-black cursor-pointer"
            >
              0
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Duel mode
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5">
      <div className="shrink-0 p-3 rounded-2xl bg-[#081329] border border-amber-400/35 text-center">
        <div className="text-[11px] font-black uppercase text-amber-300">
          Duelo Rápido (primero en 5 puntos)
        </div>
        <div className="font-display font-black text-2xl sm:text-4xl text-white">
          {duelQuestion.prompt}
        </div>
      </div>

      {duelWinner ? (
        <div className="flex-1 rounded-2xl bg-[#0B1533] border border-emerald-400/40 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <Trophy className="w-12 h-12 text-amber-300" />
          <h3 className="font-display font-black text-2xl text-white">
            ¡Gana Jugador {duelWinner}!
          </h3>
          <KidsSquishButton
            onClick={() => {
              setP1Score(0);
              setP2Score(0);
              setDuelWinner(null);
              setDuelQuestion(generateAdaptiveMathQuestion(ageGroup, 1));
            }}
            className="px-6 rounded-2xl bg-emerald-400 text-slate-950 font-black text-sm"
          >
            Revancha
          </KidsSquishButton>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-3">
          {[1, 2].map((playerNum) => {
            const pScore = playerNum === 1 ? p1Score : p2Score;
            const tint =
              playerNum === 1
                ? 'border-sky-400/50 bg-[#122048]'
                : 'border-pink-400/50 bg-[#24163D]';
            return (
              <div
                key={playerNum}
                className={`rounded-2xl border-2 p-3 flex flex-col justify-between gap-2 ${tint}`}
              >
                <div className="flex items-center justify-between font-black text-xs sm:text-sm text-white">
                  <span>Jugador {playerNum}</span>
                  <span className="text-amber-300 tabular-nums">{pScore}/5</span>
                </div>
                <div className="grid grid-cols-2 gap-2 flex-1">
                  {duelQuestion.choices.map((val) => (
                    <KidsSquishButton
                      key={val}
                      onClick={() => {
                        if (val === duelQuestion.answer) {
                          playKidsSound('success', soundEnabled, true);
                          recordDomainResult('math', true);
                          const nextScore = pScore + 1;
                          if (playerNum === 1) setP1Score(nextScore);
                          else setP2Score(nextScore);
                          if (nextScore >= 5) {
                            setDuelWinner(playerNum as 1 | 2);
                            setConfettiActive(true);
                            onEarnStar(4, 'math_wizard');
                            onMissionPlay?.();
                          } else {
                            setDuelQuestion(generateAdaptiveMathQuestion(ageGroup, 2));
                          }
                        } else {
                          playKidsSound('error', soundEnabled, true);
                        }
                      }}
                      className="rounded-xl bg-[#0A1128] hover:bg-amber-400 hover:text-slate-950 text-white font-display font-black text-xl tabular-nums"
                    >
                      {val}
                    </KidsSquishButton>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
