import React from 'react';
import { ArrowLeft, Clock, Sparkles, Swords, Users } from 'lucide-react';
import type {
  AppLanguage,
  BoardClockMinutes,
  BoardGameState,
  BoardGameType,
  BoardSide,
  Participant,
} from '../../types';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { GameVoiceBar, VoiceSpeakerIndicator } from './GameVoiceBar';
import { BOARD_CLOCK_OPTIONS, formatBoardClockMs } from './ChessCheckersPieces';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';

export function computeChessMaterial(gameState: BoardGameState | null) {
  if (!gameState || gameState.gameType !== 'chess') return null;
  const initialCounts: Record<string, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
  const values: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
  const currentCounts: { w: Record<string, number>; b: Record<string, number> } = {
    w: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 },
    b: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 },
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p: string | null | undefined = gameState.board[r]?.[c];
      if (p && (p[0] === 'w' || p[0] === 'b')) {
        const s = p[0] as 'w' | 'b';
        const k = p[1];
        if (currentCounts[s][k] !== undefined) {
          currentCounts[s][k]++;
        }
      }
    }
  }

  const capturedFromBlack: { kind: string; count: number }[] = [];
  const capturedFromWhite: { kind: string; count: number }[] = [];
  let scoreDiff = 0;

  (['Q', 'R', 'B', 'N', 'P'] as const).forEach((kind) => {
    const lostW = Math.max(0, (initialCounts[kind] || 0) - (currentCounts.w[kind] || 0));
    const lostB = Math.max(0, (initialCounts[kind] || 0) - (currentCounts.b[kind] || 0));
    if (lostB > 0) capturedFromBlack.push({ kind, count: lostB });
    if (lostW > 0) capturedFromWhite.push({ kind, count: lostW });
    scoreDiff += ((currentCounts.w[kind] || 0) - (currentCounts.b[kind] || 0)) * (values[kind] || 0);
  });

  return { capturedFromBlack, capturedFromWhite, scoreDiff };
}

export function computeCheckersCaptured(gameState: BoardGameState | null) {
  if (!gameState || gameState.gameType !== 'checkers') return null;
  let wCount = 0;
  let bCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = gameState.board[r]?.[c];
      if (p === 'w' || p === 'W') wCount++;
      if (p === 'b' || p === 'B') bCount++;
    }
  }
  return {
    whiteLost: Math.max(0, 12 - wCount),
    blackLost: Math.max(0, 12 - bCount),
  };
}

interface BoardLauncherViewProps {
  lang: AppLanguage;
  onBack?: () => void;
  isOnlineRoom: boolean;
  hideVoiceBar: boolean;
  voiceChat?: GameVoiceChatState;
  selectedClockMin: BoardClockMinutes;
  setSelectedClockMin: (mins: BoardClockMinutes) => void;
  onStartGame: (gameType: BoardGameType, soloLocal?: boolean, clockMinutes?: BoardClockMinutes) => void;
}

export const BoardLauncherView: React.FC<BoardLauncherViewProps> = ({
  lang,
  onBack,
  isOnlineRoom,
  hideVoiceBar,
  voiceChat,
  selectedClockMin,
  setSelectedClockMin,
  onStartGame,
}) => (
  <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}</span>
      </button>
    )}

    {isOnlineRoom && !hideVoiceBar && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} />}

    <div className="p-3.5 rounded-2xl nc-specular-surface border border-white/[0.1] space-y-2.5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#BF94FF]">
        <Swords className="w-4 h-4" />
        <span>
          {pickLang(lang, {
            es: 'Juegos de Tablero 1v1',
            ca: 'Jocs de Tauler 1v1',
            en: '1v1 Board Games',
          })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1 mr-1">
          <Clock className="w-3.5 h-3.5 text-[#BF94FF]" />
        </span>
        {BOARD_CLOCK_OPTIONS.map((mins) => (
          <button
            key={mins}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSelectedClockMin(mins);
            }}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              selectedClockMin === mins
                ? 'bg-[#9146FF] text-white'
                : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300'
            }`}
          >
            {mins === 0
              ? pickLang(lang, { es: '15s/turno', ca: '15s/torn', en: '15s/turn' })
              : `${mins} min`}
          </button>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-1 gap-2.5">
      {([
        { gt: 'chess' as BoardGameType, titleEs: 'Ajedrez', titleEn: 'Chess', icon: '♟️' },
        { gt: 'checkers' as BoardGameType, titleEs: 'Damas', titleEn: 'Checkers', icon: '🔴' },
        { gt: 'connect4' as BoardGameType, titleEs: 'Conecta 4', titleEn: 'Connect 4', icon: '🟡' },
      ]).map((item) => (
        <div
          key={item.gt}
          className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg shrink-0">{item.icon}</span>
            <span className="text-sm font-bold text-white truncate">
              {pickLang(lang, { es: item.titleEs, ca: item.titleEs, en: item.titleEn })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onStartGame(item.gt, false, selectedClockMin);
              }}
              className="min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Online</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onStartGame(item.gt, true, selectedClockMin);
              }}
              className="min-h-9 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>Libre</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

interface BoardPlayerSeatsRowProps {
  lang: AppLanguage;
  gameState: BoardGameState;
  currentUser: Participant;
  voiceChat?: GameVoiceChatState;
  voicePeerMap: Map<string, { isMuted: boolean }>;
  chessMaterial: { scoreDiff: number } | null;
  checkersCaptured: { whiteLost: number; blackLost: number } | null;
  getSideLabel: (side: BoardSide) => string;
  getSideClockMs: (side: BoardSide) => number | null;
  onJoinSeat: (side: 'w' | 'b' | 'spectate') => void;
}

export const BoardPlayerSeatsRow: React.FC<BoardPlayerSeatsRowProps> = ({
  lang,
  gameState,
  currentUser,
  voiceChat,
  voicePeerMap,
  chessMaterial,
  checkersCaptured,
  getSideLabel,
  getSideClockMs,
  onJoinSeat,
}) => (
  <div className="grid grid-cols-2 gap-2 shrink-0">
    {(['w', 'b'] as BoardSide[]).map((side) => {
      const seat = gameState.players[side];
      const isTurn = gameState.status === 'playing' && gameState.turn === side;
      const isMe = seat?.userId === currentUser.id;
      const sideLabel = getSideLabel(side);
      const clockMs = getSideClockMs(side);
      const isLowClock = clockMs !== null && clockMs < 30_000;
      const voiceInfo = seat && !seat.isBot ? voicePeerMap.get(seat.userId) : undefined;
      const voiceLevel = seat && !seat.isBot ? voiceChat?.audioLevels?.[seat.userId] ?? 0 : 0;
      const isSpeaking = Boolean(
        seat &&
          !seat.isBot &&
          !voiceInfo?.isMuted &&
          (voiceLevel > 0.06 || voiceChat?.speakingUserIds.includes(seat.userId))
      );
      const canPickSeat = !seat && !gameState.soloLocal && gameState.status === 'waiting';

      return (
        <div
          key={side}
          className={`p-2 rounded-xl border transition-colors flex items-center justify-between gap-1.5 min-w-0 ${
            isSpeaking
              ? 'ring-2 ring-emerald-400 bg-emerald-500/15 border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
              : isTurn
              ? 'bg-[#9146FF]/15 border-[#9146FF]/60 shadow-[0_0_16px_rgba(145,70,255,0.2)]'
              : 'bg-white/[0.03] border-white/[0.08]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-3.5 h-3.5 rounded-full shrink-0 border ${
                gameState.gameType === 'connect4'
                  ? side === 'w'
                    ? 'bg-amber-400 border-amber-200'
                    : 'bg-rose-500 border-rose-300'
                  : side === 'w'
                  ? 'bg-[#F8F3E6] border-amber-900/40'
                  : gameState.gameType === 'checkers'
                  ? 'bg-rose-600 border-rose-300'
                  : 'bg-zinc-900 border-zinc-400'
              }`}
            />
            {seat ? (
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                  <span className="truncate">{seat.name}</span>
                  {isMe && <span className="text-[10px] text-[#BF94FF] shrink-0">· Tú</span>}
                  {!seat.isBot && (
                    <VoiceSpeakerIndicator
                      inVoice={Boolean(voiceInfo)}
                      isSpeaking={isSpeaking}
                      isMuted={Boolean(voiceInfo?.isMuted)}
                      audioLevel={voiceLevel}
                    />
                  )}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono tabular-nums whitespace-nowrap flex items-center gap-1.5">
                  <span>{sideLabel} · {seat.score} pts</span>
                  {gameState.gameType === 'chess' && chessMaterial && (
                    <>
                      {side === 'w' && chessMaterial.scoreDiff > 0 && (
                        <span className="px-1 rounded bg-emerald-500/25 text-emerald-300 font-bold text-[9px]">
                          +{chessMaterial.scoreDiff}
                        </span>
                      )}
                      {side === 'b' && chessMaterial.scoreDiff < 0 && (
                        <span className="px-1 rounded bg-emerald-500/25 text-emerald-300 font-bold text-[9px]">
                          +{Math.abs(chessMaterial.scoreDiff)}
                        </span>
                      )}
                    </>
                  )}
                  {gameState.gameType === 'checkers' && checkersCaptured && (
                    <span className="text-[9px] text-zinc-300 opacity-80">
                      {side === 'w' && checkersCaptured.blackLost > 0
                        ? `+${checkersCaptured.blackLost} fichas`
                        : side === 'b' && checkersCaptured.whiteLost > 0
                        ? `+${checkersCaptured.whiteLost} fichas`
                        : ''}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-zinc-200 whitespace-nowrap">
                  {sideLabel}
                </div>
                <div className="text-[10px] text-zinc-400 whitespace-nowrap">
                  {pickLang(lang, { es: 'Libre · Bot IA', ca: 'Lliure · Bot IA', en: 'Open · AI Bot' })}
                </div>
              </div>
            )}
          </div>

          {clockMs !== null ? (
            <span
              className={`px-1.5 py-0.5 rounded-md font-mono text-[11px] font-bold tabular-nums shrink-0 ${
                isLowClock
                  ? 'bg-rose-500/25 text-rose-200 animate-pulse'
                  : isTurn
                  ? 'bg-[#9146FF]/35 text-white'
                  : 'bg-white/[0.06] text-zinc-300'
              }`}
            >
              {formatBoardClockMs(clockMs)}
            </span>
          ) : (
            canPickSeat && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onJoinSeat(side);
                }}
                className="h-7 px-2.5 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] text-[10px] font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                {pickLang(lang, { es: 'Elegir', ca: 'Triar', en: 'Pick' })}
              </button>
            )
          )}
        </div>
      );
    })}
  </div>
);
