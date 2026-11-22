import React from 'react';
import { Bot, RotateCcw, Timer, Trophy, X } from 'lucide-react';
import type { AppLanguage, Participant } from '../../types';
import {
  PARTY_COLORS,
  PARCHIS_SAFE_SQUARES,
  PARCHIS_START_OFFSETS,
  getLegalParchisPieceIds,
  type ParchisGameState,
  type PartyColor,
  type PartySeatPlayer,
} from '../../shared/partyGames';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { GameVoiceBar, VoiceSpeakerIndicator } from './GameVoiceBar';
import {
  GameMuteButton,
  GameReactionButton,
  VictoryCelebrationOverlay,
} from './GameEffects';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  Interactive3DDice,
  PARCHIS_68_COORDS,
  PARCHIS_HOME_COLUMNS,
  PARTY_COLOR_STYLES,
  getParchisPieceCoord,
  type BoardBurstEvent,
  type PartyOnlineAction,
} from './partyBoardConstants';

interface ParchisMovePreview {
  pieceId: number;
  fromCoord: [number, number];
  toCoord: [number, number];
  wasInBase: boolean;
  reachesGoal: boolean;
  canCapture: boolean;
}

interface ParchisBoardViewProps {
  lang: AppLanguage;
  currentUser: Participant;
  pState: ParchisGameState;
  activeSeat?: PartySeatPlayer;
  winnerSeat: PartySeatPlayer | null;
  isMyTurn: boolean;
  remainingSec: number;
  isOffline: boolean;
  fullScreenMode: boolean;
  hideHeaderChrome: boolean;
  hideVoiceBar: boolean;
  muted: boolean;
  toggleMute: () => void;
  voiceChat?: GameVoiceChatState;
  voicePeerMap: Map<string, { isMuted: boolean }>;
  diceAnimSeq: number;
  hopProgressMap: Record<string, number>;
  burstEvents: BoardBurstEvent[];
  hoveredPieceId: number | null;
  setHoveredPieceId: React.Dispatch<React.SetStateAction<number | null>>;
  parchisMovePreviews: ParchisMovePreview[];
  sendReaction: (user: Participant, emoji: string) => void;
  dispatchAction: (
    action: PartyOnlineAction,
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) => void;
  closeActiveGame: () => void;
}

export const ParchisBoardView: React.FC<ParchisBoardViewProps> = ({
  lang,
  currentUser,
  pState,
  activeSeat,
  winnerSeat,
  isMyTurn,
  remainingSec,
  isOffline,
  fullScreenMode,
  hideHeaderChrome,
  hideVoiceBar,
  muted,
  toggleMute,
  voiceChat,
  voicePeerMap,
  diceAnimSeq,
  hopProgressMap,
  burstEvents,
  hoveredPieceId,
  setHoveredPieceId,
  parchisMovePreviews,
  sendReaction,
  dispatchAction,
  closeActiveGame,
}) => {
  const stepsNeeded = pState.bonusSteps > 0 ? pState.bonusSteps : pState.dice || 0;
  const legalIds =
    pState.phase === 'move' && isMyTurn ? getLegalParchisPieceIds(pState, stepsNeeded) : [];
  const previewColor = activeSeat?.color;

  const positionedPieces: Array<{
    color: PartyColor;
    id: number;
    progress: number;
    row: number;
    col: number;
    legal: boolean;
    hopping: boolean;
    stackIndex: number;
    stackTotal: number;
  }> = [];

  const coordBuckets = new Map<
    string,
    Array<{ color: PartyColor; id: number; progress: number; row: number; col: number; hopping: boolean }>
  >();
  for (const c of PARTY_COLORS) {
    for (const piece of pState.pieces[c]) {
      const key = `${c}-${piece.id}`;
      const animProg = hopProgressMap[key];
      const effectiveProgress = typeof animProg === 'number' ? animProg : piece.progress;
      const [row, col] = getParchisPieceCoord(c, piece.id, effectiveProgress);
      const bucketKey = `${row.toFixed(1)},${col.toFixed(1)}`;
      const arr = coordBuckets.get(bucketKey) || [];
      arr.push({
        color: c,
        id: piece.id,
        progress: piece.progress,
        row,
        col,
        hopping: typeof animProg === 'number',
      });
      coordBuckets.set(bucketKey, arr);
    }
  }

  coordBuckets.forEach((group) => {
    group.forEach((entry, idx) => {
      const isCurrentColor = activeSeat?.color === entry.color;
      const legal = isCurrentColor && legalIds.includes(entry.id);
      positionedPieces.push({
        ...entry,
        legal,
        stackIndex: idx,
        stackTotal: group.length,
      });
    });
  });

  const boardSizeClass = fullScreenMode
    ? 'w-[min(88vw,52dvh)] max-w-[440px] aspect-square'
    : 'w-full max-w-[440px] aspect-square';

  return (
    <div
      className={`flex-1 flex flex-col ${
        fullScreenMode
          ? 'min-h-full justify-between overflow-y-auto touch-pan-y custom-scrollbar p-1.5 sm:p-2 gap-1.5'
          : 'overflow-y-auto touch-pan-y p-3 space-y-2.5 custom-scrollbar'
      }`}
    >
      {!hideHeaderChrome && (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-extrabold text-white truncate">
              🎲 {pickLang(lang, { es: 'Parchís 68 Casillas', ca: 'Parxís 68 Caselles', en: 'Spanish Parchís' })}
            </span>
            {pState.status === 'playing' && (
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tabular-nums flex items-center gap-1 shrink-0 ${
                  remainingSec <= 4
                    ? 'bg-rose-500/25 border border-rose-400/50 text-rose-200'
                    : 'bg-white/[0.08] text-zinc-200'
                }`}
              >
                <Timer className="w-3 h-3" />
                <span>{remainingSec}s</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <GameReactionButton
              lang={lang}
              compact
              onSelectEmoji={(emoji) => sendReaction(currentUser, emoji)}
            />
            <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
            <button
              type="button"
              onClick={() => dispatchAction('rematch')}
              className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Nueva', ca: 'Nova', en: 'New' })}</span>
            </button>
            <button
              type="button"
              onClick={closeActiveGame}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {!isOffline && !hideVoiceBar && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} compact />}

      {/* 4 Player Seats */}
      <div className="grid grid-cols-4 gap-1.5 shrink-0">
        {pState.players.map((pl) => {
          const isTurn = pState.status === 'playing' && pState.turnSeat === pl.seatIndex;
          const cs = PARTY_COLOR_STYLES[pl.color];
          const finishedCount = pState.pieces[pl.color].filter((p) => p.progress === 71).length;
          const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
          const voiceLevel = !pl.isBot ? voiceChat?.audioLevels?.[pl.userId] ?? 0 : 0;
          const isSpeaking =
            !pl.isBot &&
            !voiceInfo?.isMuted &&
            (voiceLevel > 0.06 || Boolean(voiceChat?.speakingUserIds.includes(pl.userId)));
          return (
            <div
              key={pl.seatIndex}
              className={`p-1.5 sm:p-2 rounded-xl border text-left transition-all min-w-0 ${
                isSpeaking
                  ? 'ring-2 ring-emerald-400 bg-emerald-500/15 border-emerald-400/60'
                  : isTurn
                  ? `${cs.badgeClass} ring-1 ${cs.ringClass}`
                  : 'bg-white/[0.03] border-white/[0.07] text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-1 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cs.bgClass}`} />
                <span className="text-[10px] sm:text-[11px] font-bold truncate">{pl.name}</span>
                {!pl.isBot ? (
                  <VoiceSpeakerIndicator
                    inVoice={Boolean(voiceInfo)}
                    isSpeaking={isSpeaking}
                    isMuted={Boolean(voiceInfo?.isMuted)}
                    audioLevel={voiceLevel}
                  />
                ) : (
                  <Bot className="w-3 h-3 opacity-70 shrink-0 ml-auto" />
                )}
              </div>
              <div className="text-[9px] sm:text-[10px] opacity-80 font-mono tabular-nums mt-0.5 flex items-center justify-between">
                <span>🏁 {finishedCount}/4</span>
                {isTurn && pState.status === 'playing' && (
                  <span className={remainingSec <= 4 ? 'text-rose-300 font-bold' : ''}>{remainingSec}s</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive 3D Dice + Turn Prompt Bar */}
      <div className="p-2 rounded-xl nc-tabletop-slate border border-white/[0.09] flex items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Interactive3DDice
            value={pState.dice}
            rollingKey={diceAnimSeq}
            accentHex={activeSeat ? PARTY_COLOR_STYLES[activeSeat.color].hex : '#9146FF'}
            canRoll={pState.status === 'playing' && isMyTurn && pState.phase === 'roll'}
            onRoll={() => dispatchAction('roll_dice')}
          />
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white truncate">
              {pState.status === 'finished' && winnerSeat
                ? `🏆 ${winnerSeat.name}`
                : isMyTurn
                ? pState.phase === 'roll'
                  ? pickLang(lang, {
                      es: 'Tu turno · Toca el dado para tirar',
                      ca: 'El teu torn · Toca el dau',
                      en: 'Your turn · Tap the die',
                    })
                  : pState.bonusSteps > 0
                  ? pickLang(lang, {
                      es: `Bonus +${pState.bonusSteps} · Elige ficha`,
                      ca: `Bonus +${pState.bonusSteps} · Tria fitxa`,
                      en: `Bonus +${pState.bonusSteps} · Pick piece`,
                    })
                  : pickLang(lang, {
                      es: `Sacaste ${pState.dice} · Elige ficha`,
                      ca: `Has tret ${pState.dice} · Tria fitxa`,
                      en: `Rolled ${pState.dice} · Move piece`,
                    })
                : pickLang(lang, {
                    es: `Turno de ${activeSeat?.name || '...'}`,
                    ca: `Torn de ${activeSeat?.name || '...'}`,
                    en: `${activeSeat?.name || '...'}'s turn`,
                  })}
            </div>
            {pState.log.length > 0 && (
              <div className="text-[10px] text-zinc-400 truncate">{pState.log[pState.log.length - 1]}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => dispatchAction('rematch')}
            title={pickLang(lang, { es: 'Nueva partida', ca: 'Nova partida', en: 'New match' })}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] flex items-center justify-center text-zinc-200 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 19x19 Interactive Spanish 68-Square Parchís Tabletop */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div
          className={`relative mx-auto rounded-2xl p-2 nc-tabletop-slate border border-white/[0.14] select-none touch-manipulation ${boardSizeClass}`}
        >
          <div className="relative w-full h-full rounded-xl overflow-hidden bg-[#12141c] border border-white/15">
            {/* 4 Corner Casa Quadrants */}
            <div className="absolute top-0 left-0 w-[42.105%] h-[42.105%] bg-red-600/20 border-r border-b border-white/15 p-1.5">
              <div className="w-full h-full rounded-xl bg-[#0e1017]/90 border border-red-400/45 flex items-end justify-start p-1.5">
                <span className="text-[9px] font-black uppercase text-red-300/85">Rojo</span>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-[42.105%] h-[42.105%] bg-blue-600/20 border-l border-b border-white/15 p-1.5">
              <div className="w-full h-full rounded-xl bg-[#0e1017]/90 border border-blue-400/45 flex items-end justify-end p-1.5">
                <span className="text-[9px] font-black uppercase text-blue-300/85">Azul</span>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-[42.105%] h-[42.105%] bg-yellow-500/20 border-l border-t border-white/15 p-1.5">
              <div className="w-full h-full rounded-xl bg-[#0e1017]/90 border border-yellow-400/45 flex items-start justify-end p-1.5">
                <span className="text-[9px] font-black uppercase text-yellow-300/85">Amarillo</span>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 w-[42.105%] h-[42.105%] bg-emerald-600/20 border-r border-t border-white/15 p-1.5">
              <div className="w-full h-full rounded-xl bg-[#0e1017]/90 border border-emerald-400/45 flex items-start justify-start p-1.5">
                <span className="text-[9px] font-black uppercase text-emerald-300/85">Verde</span>
              </div>
            </div>

            {/* Center Meta with Radiant Rayburst and 3D Golden Trophy */}
            <div className="absolute top-[42.105%] left-[42.105%] w-[15.79%] h-[15.79%] border border-amber-300/40 bg-gradient-to-br from-amber-500/35 via-[#9146FF]/30 to-emerald-500/30 flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.45)]">
              <div className="absolute inset-0 nc-ray-spin opacity-35 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.65)_0%,transparent_70%)] pointer-events-none" />
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)] relative z-10" />
            </div>

            {/* 68 Outer Ring Squares */}
            {PARCHIS_68_COORDS.map(([r, c], sqIdx) => {
              const isStartYellow = sqIdx === PARCHIS_START_OFFSETS.yellow;
              const isStartBlue = sqIdx === PARCHIS_START_OFFSETS.blue;
              const isStartRed = sqIdx === PARCHIS_START_OFFSETS.red;
              const isStartGreen = sqIdx === PARCHIS_START_OFFSETS.green;
              const isSafe = PARCHIS_SAFE_SQUARES.has(sqIdx);

              const bgCls = isStartRed
                ? 'bg-red-500/45'
                : isStartBlue
                ? 'bg-blue-500/45'
                : isStartYellow
                ? 'bg-yellow-500/45'
                : isStartGreen
                ? 'bg-emerald-500/45'
                : isSafe
                ? 'bg-amber-400/20 border-amber-300/40'
                : 'bg-white/[0.03]';

              return (
                <div
                  key={`ring-${sqIdx}`}
                  style={{
                    top: `${(r / 19) * 100}%`,
                    left: `${(c / 19) * 100}%`,
                    width: `${100 / 19}%`,
                    height: `${100 / 19}%`,
                  }}
                  className={`absolute border-[0.5px] border-white/15 flex items-center justify-center text-[7px] text-white/55 font-mono ${bgCls}`}
                >
                  {isSafe ? (
                    <span className="text-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.95)] font-bold text-[8px]">
                      ★
                    </span>
                  ) : (
                    ''
                  )}
                </div>
              );
            })}

            {/* Colored Home Columns */}
            {PARTY_COLORS.map((col) =>
              PARCHIS_HOME_COLUMNS[col].map(([r, c], idx) => (
                <div
                  key={`hc-${col}-${idx}`}
                  style={{
                    top: `${(r / 19) * 100}%`,
                    left: `${(c / 19) * 100}%`,
                    width: `${100 / 19}%`,
                    height: `${100 / 19}%`,
                  }}
                  className={`absolute border-[0.5px] border-white/20 ${PARTY_COLOR_STYLES[col].bgClass}/35`}
                />
              ))
            )}

            {/* Dashed Movement Preview Lines */}
            {previewColor && parchisMovePreviews.length > 0 && (
              <svg viewBox="0 0 19 19" className="absolute inset-0 w-full h-full pointer-events-none z-[15]">
                {parchisMovePreviews.map((pv) => {
                  const isEmphasized = hoveredPieceId === null || hoveredPieceId === pv.pieceId;
                  const hex = PARTY_COLOR_STYLES[previewColor].hex;
                  return (
                    <g key={`pv-${pv.pieceId}`} opacity={isEmphasized ? 0.95 : 0.25}>
                      <line
                        x1={pv.fromCoord[1] + 0.5}
                        y1={pv.fromCoord[0] + 0.5}
                        x2={pv.toCoord[1] + 0.5}
                        y2={pv.toCoord[0] + 0.5}
                        stroke={hex}
                        strokeWidth={hoveredPieceId === pv.pieceId ? 0.22 : 0.14}
                        strokeDasharray="0.32 0.22"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={pv.toCoord[1] + 0.5}
                        cy={pv.toCoord[0] + 0.5}
                        r={0.44}
                        fill={`${hex}35`}
                        stroke={hex}
                        strokeWidth={0.14}
                      />
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Clickable Destination Ghosts */}
            {previewColor &&
              parchisMovePreviews.map((pv) => {
                const cs = PARTY_COLOR_STYLES[previewColor];
                const isEmphasized = hoveredPieceId === null || hoveredPieceId === pv.pieceId;
                return (
                  <button
                    key={`dest-${pv.pieceId}`}
                    type="button"
                    disabled={!isMyTurn}
                    onClick={() => {
                      if (!isMyTurn) return;
                      triggerHaptic('light');
                      dispatchAction('move_piece', { pieceId: pv.pieceId });
                    }}
                    style={{
                      top: `${((pv.toCoord[0] + 0.5) / 19) * 100}%`,
                      left: `${((pv.toCoord[1] + 0.5) / 19) * 100}%`,
                      width: '5.5%',
                      height: '5.5%',
                      transform: 'translate(-50%, -50%)',
                      borderColor: cs.hex,
                      backgroundColor: `${cs.hex}35`,
                    }}
                    className={`absolute z-[18] rounded-full border-2 border-dashed flex items-center justify-center text-[7px] font-black text-white shadow-md transition-opacity ${
                      isEmphasized ? 'opacity-100' : 'opacity-30'
                    } ${isMyTurn ? 'cursor-pointer' : 'pointer-events-none'}`}
                  >
                    {pv.canCapture ? '⚔️' : pv.reachesGoal ? '🏁' : `+${pv.wasInBase ? 5 : stepsNeeded}`}
                  </button>
                );
              })}

            {/* Burst Particles on Captures & Gold Goal Sparks */}
            {burstEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  top: `${((ev.row + 0.5) / 19) * 100}%`,
                  left: `${((ev.col + 0.5) / 19) * 100}%`,
                }}
                className="absolute z-[25] pointer-events-none"
                aria-hidden="true"
              >
                {Array.from({ length: 10 }).map((_, idx) => {
                  const angle = (idx / 10) * Math.PI * 2;
                  const dist = ev.kind === 'goal' ? 30 : 24;
                  const bx = `${Math.round(Math.cos(angle) * dist)}px`;
                  const by = `${Math.round(Math.sin(angle) * dist)}px`;
                  return (
                    <span
                      key={idx}
                      style={
                        {
                          '--bx': bx,
                          '--by': by,
                          backgroundColor:
                            ev.kind === 'goal' ? (idx % 2 === 0 ? '#FACC15' : '#FEF08A') : ev.colorHex,
                        } as React.CSSProperties
                      }
                      className="nc-particle-burst absolute w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                    />
                  );
                })}
              </div>
            ))}

            {/* 16 Glossy 3D Resin Tokens */}
            {positionedPieces.map((item) => {
              const offsetX = item.stackTotal > 1 ? ((item.stackIndex % 2) - 0.5) * 1.4 : 0;
              const offsetY = item.stackTotal > 2 ? (Math.floor(item.stackIndex / 2) - 0.5) * 1.4 : 0;
              const cs = PARTY_COLOR_STYLES[item.color];

              return (
                <button
                  key={`piece-${item.color}-${item.id}`}
                  type="button"
                  disabled={!item.legal}
                  onMouseEnter={() => {
                    if (item.legal) setHoveredPieceId(item.id);
                  }}
                  onMouseLeave={() => setHoveredPieceId((prev) => (prev === item.id ? null : prev))}
                  onClick={() => {
                    if (!item.legal) return;
                    triggerHaptic('light');
                    dispatchAction('move_piece', { pieceId: item.id });
                  }}
                  style={{
                    top: `${((item.row + 0.5) / 19) * 100 + offsetY}%`,
                    left: `${((item.col + 0.5) / 19) * 100 + offsetX}%`,
                    width: `${item.legal ? 5.6 : 4.7}%`,
                    height: `${item.legal ? 5.6 : 4.7}%`,
                    transform: 'translate(-50%, -50%)',
                    background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.88) 0%, ${cs.hex} 40%, ${cs.darkHex} 92%)`,
                    boxShadow: item.legal
                      ? `0 0 12px ${cs.hex}, 0 4px 8px rgba(0,0,0,0.85), inset 0 -2px 3px rgba(0,0,0,0.45)`
                      : '0 3px 6px rgba(0,0,0,0.8), inset 0 -2px 3px rgba(0,0,0,0.45)',
                  }}
                  aria-label={`${item.color} #${item.id + 1}`}
                  className={`absolute z-10 rounded-full border border-white/85 flex items-center justify-center text-[8px] font-black text-white drop-shadow transition-[top,left,width,height] duration-100 ${
                    item.hopping ? 'nc-parchis-hop z-30' : ''
                  } ${
                    item.legal ? 'ring-2 ring-white cursor-pointer hover:scale-125 z-20' : 'cursor-default'
                  }`}
                >
                  {item.progress === 71 ? '★' : item.id + 1}
                </button>
              );
            })}

            {pState.status === 'finished' && winnerSeat && (
              <VictoryCelebrationOverlay
                lang={lang}
                title={pickLang(lang, {
                  es: `¡${winnerSeat.name} gana el Parchís!`,
                  ca: `${winnerSeat.name} guanya el Parxís!`,
                  en: `${winnerSeat.name} wins Parchís!`,
                })}
                subtitle={pickLang(lang, {
                  es: '4 fichas en Meta',
                  ca: '4 fitxes a Meta',
                  en: 'All 4 tokens reached Goal',
                })}
                primaryLabel={pickLang(lang, { es: 'Jugar otra vez', ca: 'Tornar a jugar', en: 'Play Again' })}
                onPrimaryAction={() => dispatchAction('rematch')}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
