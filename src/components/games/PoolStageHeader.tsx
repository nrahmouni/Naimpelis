import React from 'react';
import { Bot, Timer, Users } from 'lucide-react';
import type { AppLanguage, Pool8BallState, PoolDifficulty } from '../../types';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { pickLang } from '../../utils/i18n';
import { VoiceSpeakerIndicator } from './GameVoiceBar';
import { PoolPocketedChips, poolGroupLabel } from './PoolTableOverlays';

interface PoolStageHeaderProps {
  lang: AppLanguage;
  activeState: Pool8BallState;
  isOffline: boolean;
  difficulty: PoolDifficulty;
  voiceChat?: GameVoiceChatState;
  voicePeerMap: Map<string, { isMuted: boolean }>;
  aiThinking: boolean;
  shotErrorMsg: string | null;
  nowTs: number;
  onChangeDifficulty: (lvl: PoolDifficulty) => void;
  onJoinSeatOnline?: (seatIndex: 0 | 1 | 'spectate') => void;
}

export const PoolStageHeader: React.FC<PoolStageHeaderProps> = ({
  lang,
  activeState,
  isOffline,
  difficulty,
  voiceChat,
  voicePeerMap,
  aiThinking,
  shotErrorMsg,
  nowTs,
  onChangeDifficulty,
  onJoinSeatOnline,
}) => {
  const p0 = activeState.players[0];
  const p1 = activeState.players[1];
  const p0Voice = p0 && !p0.isBot ? voicePeerMap.get(p0.userId) : undefined;
  const p1Voice = p1 && !p1.isBot ? voicePeerMap.get(p1.userId) : undefined;
  const p0Level = p0 && !p0.isBot ? voiceChat?.audioLevels?.[p0.userId] ?? 0 : 0;
  const p1Level = p1 && !p1.isBot ? voiceChat?.audioLevels?.[p1.userId] ?? 0 : 0;
  const p0Speaking = Boolean(
    p0 &&
      !p0.isBot &&
      !p0Voice?.isMuted &&
      (p0Level > 0.06 || voiceChat?.speakingUserIds.includes(p0.userId))
  );
  const p1Speaking = Boolean(
    p1 &&
      !p1.isBot &&
      !p1Voice?.isMuted &&
      (p1Level > 0.06 || voiceChat?.speakingUserIds.includes(p1.userId))
  );
  const turnSecsLeft =
    !isOffline && activeState.status === 'playing' && activeState.turnDeadlineAt > 0
      ? Math.max(0, Math.ceil((activeState.turnDeadlineAt - nowTs) / 1000))
      : null;

  return (
    <div className="px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center justify-between gap-1.5 shrink-0">
      <div
        className={`flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-lg border transition-all ${
          p0Speaking
            ? 'ring-2 ring-emerald-400 bg-emerald-500/20 border-emerald-400/75 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
            : activeState.status === 'playing' && activeState.turnSeat === 0
            ? 'bg-emerald-500/15 border-emerald-400/55'
            : 'bg-black/25 border-white/[0.06]'
        }`}
      >
        <span className="text-sm shrink-0" aria-hidden="true">
          {p0?.avatar || '🎱'}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[11px] font-bold text-white truncate max-w-[92px] sm:max-w-[140px]">
            <span className="truncate">{p0?.name || 'Jugador 1'}</span>
            {p0 && !p0.isBot && (
              <VoiceSpeakerIndicator
                inVoice={Boolean(p0Voice)}
                isSpeaking={p0Speaking}
                isMuted={Boolean(p0Voice?.isMuted)}
                audioLevel={p0Level}
              />
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-300">
            <span>{poolGroupLabel(lang, p0?.group ?? null, activeState.balls)}</span>
            <span className="hidden sm:inline">
              <PoolPocketedChips balls={activeState.balls} group={p0?.group ?? null} />
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center min-w-0 px-1 text-center">
        {isOffline ? (
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#090A10] border border-white/[0.08]">
            {(['easy', 'medium', 'hard'] as PoolDifficulty[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onChangeDifficulty(lvl)}
                className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  difficulty === lvl
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {lvl === 'easy'
                  ? pickLang(lang, { es: 'Fácil', ca: 'Fàcil', en: 'Easy' })
                  : lvl === 'medium'
                  ? pickLang(lang, { es: 'Medio', ca: 'Mitjà', en: 'Med' })
                  : pickLang(lang, { es: 'Difícil', ca: 'Difícil', en: 'Hard' })}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[10px] font-mono tabular-nums text-zinc-200">
            {turnSecsLeft !== null && (
              <span
                className={`flex items-center gap-0.5 font-bold ${
                  turnSecsLeft <= 10 ? 'text-rose-400' : 'text-emerald-300'
                }`}
              >
                <Timer className="w-3 h-3" />
                {turnSecsLeft}s
              </span>
            )}
          </div>
        )}
        <span className="text-[9px] sm:text-[10px] text-zinc-300 truncate max-w-[140px] sm:max-w-[240px]">
          {aiThinking
            ? pickLang(lang, { es: 'Bot calculando tiro…', ca: 'Bot pensant tir…', en: 'AI aiming…' })
            : shotErrorMsg || activeState.statusMessage}
        </span>
      </div>

      <div
        className={`flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-lg border transition-all ${
          p1Speaking
            ? 'ring-2 ring-emerald-400 bg-emerald-500/20 border-emerald-400/75 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
            : activeState.status === 'playing' && activeState.turnSeat === 1
            ? 'bg-emerald-500/15 border-emerald-400/55'
            : 'bg-black/25 border-white/[0.06]'
        }`}
      >
        {p1 ? (
          <>
            <div className="min-w-0 text-right">
              <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-white truncate max-w-[92px] sm:max-w-[140px]">
                {!p1.isBot && (
                  <VoiceSpeakerIndicator
                    inVoice={Boolean(p1Voice)}
                    isSpeaking={p1Speaking}
                    isMuted={Boolean(p1Voice?.isMuted)}
                    audioLevel={p1Level}
                  />
                )}
                {p1.isBot && <Bot className="w-3 h-3 text-emerald-400 shrink-0" />}
                <span className="truncate">{p1.name}</span>
                {p1.connected === false && (
                  <span className="text-[9px] text-amber-400">(offline)</span>
                )}
              </div>
              <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-300">
                <span className="hidden sm:inline">
                  <PoolPocketedChips balls={activeState.balls} group={p1.group} />
                </span>
                <span>{poolGroupLabel(lang, p1.group, activeState.balls)}</span>
              </div>
            </div>
            <span className="text-sm shrink-0" aria-hidden="true">
              {p1.avatar}
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onJoinSeatOnline?.(1)}
            className="px-2 py-1 rounded-md bg-[#E11D48] hover:bg-[#BE123C] text-[10px] font-bold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <Users className="w-3 h-3" />
            <span>{pickLang(lang, { es: 'Unirse', ca: 'Unir-se', en: 'Join' })}</span>
          </button>
        )}
      </div>
    </div>
  );
};
