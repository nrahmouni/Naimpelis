import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Bot,
  Layers,
  Megaphone,
  RotateCcw,
  ShieldAlert,
  Timer,
  X,
} from 'lucide-react';
import type { AppLanguage, Participant } from '../../types';
import {
  UNO_TARGET_SCORE,
  isUnoCardPlayable,
  type PartyColor,
  type PartySeatPlayer,
  type UnoGameState,
} from '../../shared/partyGames';
import { UNO_CARD_BACK_SRC, getUnoCardSvgSrc } from '../../assets/uno';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { GameVoiceBar, VoiceSpeakerIndicator } from './GameVoiceBar';
import {
  GameFloatingReactionToast,
  GameMuteButton,
  GameReactionButton,
  VictoryCelebrationOverlay,
  type ActiveGameFloatingReaction,
} from './GameEffects';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PARTY_COLOR_STYLES, type PartyOnlineAction } from './partyBoardConstants';
import { PixiGameFxLayer, type PixiGameFxHandle } from './arcade/PixiGameFxLayer';

interface UnoTableViewProps {
  lang: AppLanguage;
  currentUser: Participant;
  uState: UnoGameState;
  mySeatIndex: number;
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
  unoWaveColor: PartyColor | null;
  unoWaveKey: number;
  drawPileShakeKey: number;
  pendingWildCardId: string | null;
  setPendingWildCardId: React.Dispatch<React.SetStateAction<string | null>>;
  floatingReaction: ActiveGameFloatingReaction | null;
  sendReaction: (user: Participant, emoji: string) => void;
  dispatchAction: (
    action: PartyOnlineAction,
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) => void;
  closeActiveGame: () => void;
}

export const UnoTableView: React.FC<UnoTableViewProps> = ({
  lang,
  currentUser,
  uState,
  mySeatIndex,
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
  unoWaveColor,
  unoWaveKey,
  drawPileShakeKey,
  pendingWildCardId,
  setPendingWildCardId,
  floatingReaction,
  sendReaction,
  dispatchAction,
  closeActiveGame,
}) => {
  const myHand = mySeatIndex >= 0 ? uState.hands[mySeatIndex] || [] : [];
  const topDiscard = uState.discardPile[uState.discardPile.length - 1];
  const prevDiscard1 = uState.discardPile[uState.discardPile.length - 2];
  const prevDiscard2 = uState.discardPile[uState.discardPile.length - 3];
  const activeCs = PARTY_COLOR_STYLES[uState.activeColor];
  const challengePrompt =
    uState.pendingWild4Challenge &&
    mySeatIndex === uState.pendingWild4Challenge.victimSeat &&
    isMyTurn;
  const canCallUno =
    mySeatIndex >= 0 &&
    uState.status === 'playing' &&
    myHand.length <= 2 &&
    !uState.unoCalledSeats.includes(mySeatIndex);
  const canCatchUno =
    mySeatIndex >= 0 &&
    uState.status === 'playing' &&
    uState.vulnerableUnoSeat !== null &&
    uState.vulnerableUnoSeat !== undefined &&
    uState.vulnerableUnoSeat !== mySeatIndex;

  const pixiFxRef = useRef<PixiGameFxHandle | null>(null);
  const prevStatusRef = useRef(uState.status);

  useEffect(() => {
    if (unoWaveKey > 0) {
      pixiFxRef.current?.emitBurst(0.54, 0.5, 'magic', 16);
    }
  }, [unoWaveKey]);

  useEffect(() => {
    if (prevStatusRef.current !== 'finished' && uState.status === 'finished') {
      pixiFxRef.current?.emitBurst(0.5, 0.45, 'victory', 26);
    }
    prevStatusRef.current = uState.status;
  }, [uState.status]);

  const discardRotDeg = ((uState.discardPile.length * 13) % 15) - 7;
  const handLen = myHand.length;
  const fanMid = (handLen - 1) / 2;
  const maxFanDeg = Math.min(4.2, handLen > 1 ? 30 / (handLen - 1) : 0);
  const cardOverlapPx =
    handLen <= 5 ? -6 : handLen <= 8 ? -16 : handLen <= 11 ? -24 : -30;

  return (
    <div
      className={`relative flex-1 flex flex-col ${
        fullScreenMode
          ? 'min-h-full justify-between overflow-y-auto touch-pan-y custom-scrollbar p-1.5 sm:p-2 gap-1.5'
          : 'overflow-y-auto touch-pan-y p-3 space-y-2.5 custom-scrollbar'
      }`}
    >
      {!hideHeaderChrome && (
        <GameFloatingReactionToast reaction={floatingReaction} className="top-12 right-2" />
      )}
      {!hideHeaderChrome && (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-extrabold text-white truncate">
              🃏 UNO Oficial · {uState.deck.length} mazo
            </span>
            <span className="text-[10px] font-semibold text-zinc-300 shrink-0">
              {uState.direction === 1 ? '↻ Horario' : '↺ Antihorario'}
            </span>
            {uState.status === 'playing' && (
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tabular-nums flex items-center gap-1 shrink-0 ${
                  remainingSec <= 4 ? 'bg-rose-500/25 text-rose-200' : 'bg-white/[0.08] text-zinc-200'
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

      {/* 4 Seats Status */}
      <div className="grid grid-cols-4 gap-1.5 shrink-0">
        {uState.players.map((pl) => {
          const isTurn = uState.status === 'playing' && uState.turnSeat === pl.seatIndex;
          const cardCount = (uState.hands[pl.seatIndex] || []).length;
          const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
          const voiceLevel = !pl.isBot ? voiceChat?.audioLevels?.[pl.userId] ?? 0 : 0;
          const isSpeaking =
            !pl.isBot &&
            !voiceInfo?.isMuted &&
            (voiceLevel > 0.06 || Boolean(voiceChat?.speakingUserIds.includes(pl.userId)));
          return (
            <div
              key={pl.seatIndex}
              className={`p-1.5 sm:p-2 rounded-xl border min-w-0 transition-all ${
                isSpeaking
                  ? 'ring-2 ring-emerald-400 bg-emerald-500/15 border-emerald-400/60'
                  : isTurn
                  ? 'bg-[#9146FF]/20 border-[#9146FF]/65 ring-1 ring-[#9146FF]/45'
                  : 'bg-white/[0.03] border-white/[0.07]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-white truncate">{pl.name}</span>
                {!pl.isBot ? (
                  <VoiceSpeakerIndicator
                    inVoice={Boolean(voiceInfo)}
                    isSpeaking={isSpeaking}
                    isMuted={Boolean(voiceInfo?.isMuted)}
                    audioLevel={voiceLevel}
                  />
                ) : (
                  <Bot className="w-3 h-3 opacity-75 shrink-0" />
                )}
              </div>
              <div className="text-[9px] sm:text-[10px] text-zinc-400 font-mono tabular-nums mt-0.5 flex items-center justify-between gap-1">
                <span className="flex items-center gap-0.5">
                  <Layers className="w-2.5 h-2.5" />
                  {cardCount}
                </span>
                <span>
                  {isTurn && uState.status === 'playing' ? `${remainingSec}s` : `${pl.score}/${UNO_TARGET_SCORE}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Matte Slate UNO Felt Tabletop */}
      <div
        className="relative p-3 sm:p-4 rounded-2xl nc-tabletop-slate border border-white/[0.14] flex flex-col items-center justify-center gap-2.5 flex-1 min-h-0 overflow-hidden"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 44%, ${activeCs.hex}2b 0%, rgba(15,17,28,0.45) 56%, rgba(8,9,16,0.85) 100%)`,
          boxShadow: `inset 0 0 46px ${activeCs.hex}2e, inset 0 1px 0 rgba(255,255,255,0.1)`,
        }}
      >
        <PixiGameFxLayer ref={pixiFxRef} />
        {unoWaveColor && unoWaveKey > 0 && (
          <div
            key={`wave-${unoWaveKey}`}
            className="pointer-events-none absolute inset-2 rounded-2xl nc-uno-wave z-10"
            style={{
              border: `3px solid ${PARTY_COLOR_STYLES[unoWaveColor].hex}`,
              boxShadow: `0 0 32px ${PARTY_COLOR_STYLES[unoWaveColor].hex}, inset 0 0 28px ${PARTY_COLOR_STYLES[unoWaveColor].hex}88`,
            }}
          />
        )}

        <div className="relative z-10 flex items-center justify-center gap-5 sm:gap-7">
          {uState.drawnPlayableCardId && isMyTurn ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                dispatchAction('pass_turn');
              }}
              className="w-[74px] h-[111px] sm:w-[86px] sm:h-[129px] rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border-2 border-amber-400/75 flex flex-col items-center justify-center gap-1 shadow-2xl cursor-pointer active:scale-95 transition-all"
            >
              <span className="text-xs font-black text-amber-200 uppercase">Pasar</span>
              <span className="text-[10px] text-zinc-200 text-center px-1.5">Guardar</span>
            </button>
          ) : (
            <div className="relative w-[74px] h-[111px] sm:w-[86px] sm:h-[129px]">
              <div className="absolute inset-0 rounded-xl bg-zinc-800 border border-white/10 translate-y-1.5 translate-x-1 -rotate-2 shadow-sm pointer-events-none" />
              <div className="absolute inset-0 rounded-xl bg-zinc-700 border border-white/10 translate-y-0.5 -translate-x-0.5 rotate-1 shadow-sm pointer-events-none" />
              <button
                key={`draw-${drawPileShakeKey}`}
                type="button"
                disabled={!isMyTurn || Boolean(uState.pendingWild4Challenge)}
                onClick={() => {
                  triggerHaptic('light');
                  dispatchAction('draw_card');
                }}
                aria-label={pickLang(lang, { es: 'Robar 1 carta', ca: 'Robar 1 carta', en: 'Draw 1 card' })}
                className={`relative w-full h-full rounded-xl shadow-[0_12px_28px_rgba(0,0,0,0.75)] transition-transform ${
                  drawPileShakeKey > 0 ? 'nc-uno-shake' : ''
                } ${
                  isMyTurn && !uState.pendingWild4Challenge
                    ? 'cursor-pointer hover:-translate-y-1.5 active:scale-95 ring-2 ring-[#9146FF]/75'
                    : 'opacity-80 cursor-default'
                }`}
              >
                <img
                  src={UNO_CARD_BACK_SRC}
                  alt="Mazo UNO"
                  className="w-full h-full object-contain rounded-xl pointer-events-none select-none"
                  draggable={false}
                />
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-zinc-950/90 border border-white/20 text-[9px] font-bold text-zinc-100 whitespace-nowrap shadow">
                  {pickLang(lang, {
                    es: `Robar (${uState.deck.length})`,
                    ca: `Robar (${uState.deck.length})`,
                    en: `Draw (${uState.deck.length})`,
                  })}
                </span>
              </button>
            </div>
          )}

          {/* Stacked Discard Pile with Arc Flying Animation */}
          <div className="relative w-[78px] h-[117px] sm:w-[90px] sm:h-[135px] flex items-center justify-center">
            {prevDiscard2 && (
              <img
                src={getUnoCardSvgSrc(prevDiscard2.color, prevDiscard2.value)}
                alt=""
                aria-hidden="true"
                style={{ transform: 'rotate(-9deg) translate(-4px, 2px)' }}
                className="absolute inset-0 w-full h-full object-contain opacity-60 pointer-events-none select-none"
                draggable={false}
              />
            )}
            {prevDiscard1 && (
              <img
                src={getUnoCardSvgSrc(prevDiscard1.color, prevDiscard1.value)}
                alt=""
                aria-hidden="true"
                style={{ transform: 'rotate(7deg) translate(3px, -1px)' }}
                className="absolute inset-0 w-full h-full object-contain opacity-85 pointer-events-none select-none"
                draggable={false}
              />
            )}
            {topDiscard && (
              <div
                key={`${topDiscard.id}-${uState.discardPile.length}`}
                style={{ '--uno-rot': `${discardRotDeg}deg` } as React.CSSProperties}
                className={`nc-uno-arc relative w-full h-full rounded-xl overflow-hidden drop-shadow-[0_14px_26px_rgba(0,0,0,0.82)] ${
                  topDiscard.color === 'wild' ||
                  topDiscard.value === 'draw2' ||
                  topDiscard.value === 'skip' ||
                  topDiscard.value === 'reverse'
                    ? 'card-foil-shimmer'
                    : ''
                }`}
              >
                <img
                  src={getUnoCardSvgSrc(topDiscard.color, topDiscard.value)}
                  alt={`${topDiscard.color} ${topDiscard.value}`}
                  className="w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              </div>
            )}
            <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full border border-white/30 bg-zinc-950/90 flex items-center gap-1.5 shadow-md whitespace-nowrap">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: activeCs.hex, boxShadow: `0 0 8px ${activeCs.hex}` }}
              />
              <span className="text-[9px] font-extrabold uppercase text-white">
                {pickLang(lang, { es: activeCs.labelEs, ca: activeCs.labelCa, en: activeCs.labelEn })}
              </span>
            </div>
          </div>
        </div>

        {/* Status Message + Prominent ¡UNO! / Catch UNO actions */}
        <div className="relative z-10 text-center space-y-1 max-w-md pt-1">
          <div className="text-xs font-bold text-white">
            {uState.status === 'finished' && winnerSeat
              ? `🏆 ${winnerSeat.name} (+${uState.roundPointsWon || 0} pts)`
              : uState.drawnPlayableCardId && isMyTurn
              ? pickLang(lang, {
                  es: 'Robaste carta jugable · Tírala o pasa',
                  ca: 'Carta jugable robada · Tira o passa',
                  en: 'Playable card drawn · Play or pass',
                })
              : isMyTurn
              ? pickLang(lang, {
                  es: 'Tu turno · Tira una carta o roba',
                  ca: 'El teu torn · Tira o roba',
                  en: 'Your turn · Play a card or draw',
                })
              : pickLang(lang, {
                  es: `Turno de ${activeSeat?.name || '...'}`,
                  ca: `Torn de ${activeSeat?.name || '...'}`,
                  en: `${activeSeat?.name || '...'}'s turn`,
                })}
          </div>
          {uState.log.length > 0 && (
            <div className="text-[10px] text-zinc-400 truncate max-w-[300px] mx-auto">
              {uState.log[uState.log.length - 1]}
            </div>
          )}

          {(canCallUno || canCatchUno) && (
            <div className="flex items-center justify-center gap-2 pt-1">
              {canCallUno && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    dispatchAction('call_uno');
                  }}
                  className="min-h-9 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:brightness-110 text-xs font-black text-white flex items-center gap-1.5 shadow-[0_0_20px_rgba(225,29,72,0.7)] ring-2 ring-white/80 cursor-pointer active:scale-95"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>¡UNO!</span>
                </button>
              )}
              {canCatchUno && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    dispatchAction('catch_uno');
                  }}
                  className="min-h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-zinc-950 flex items-center gap-1.5 shadow-lg cursor-pointer active:scale-95"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>¡No gritó UNO! (+2)</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Wild +4 Official Challenge Overlay */}
        {challengePrompt && uState.pendingWild4Challenge && (
          <div className="absolute inset-0 z-25 rounded-2xl bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-4 text-center">
            <ShieldAlert className="w-7 h-7 text-amber-400" />
            <div className="text-xs sm:text-sm font-bold text-white max-w-xs">
              {pickLang(lang, {
                es: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} tiró +4. ¿Aceptas o desafías?`,
                ca: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} ha tirat +4. Acceptes o desafies?`,
                en: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} played Wild +4. Accept or Challenge?`,
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => dispatchAction('accept_wild4')}
                className="min-h-10 px-4 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white cursor-pointer"
              >
                {pickLang(lang, { es: 'Aceptar (+4)', ca: 'Acceptar (+4)', en: 'Accept (+4)' })}
              </button>
              <button
                type="button"
                onClick={() => dispatchAction('challenge_wild4')}
                className="min-h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-zinc-950 cursor-pointer"
              >
                {pickLang(lang, { es: '¡Desafiar +4!', ca: 'Desafiar +4!', en: 'Challenge +4!' })}
              </button>
            </div>
          </div>
        )}

        {/* 4-Color Radial Picker Overlay for Wild Cards */}
        {pendingWildCardId && (
          <div className="absolute inset-0 z-25 rounded-2xl bg-black/82 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
            <div className="relative w-44 h-44 rounded-full p-1 bg-white/10 shadow-[0_18px_48px_rgba(0,0,0,0.85)]">
              <div className="grid grid-cols-2 grid-rows-2 w-full h-full rounded-full overflow-hidden gap-1.5">
                {(['red', 'blue', 'green', 'yellow'] as PartyColor[]).map((col, qIdx) => {
                  const corners = [
                    'rounded-tl-full',
                    'rounded-tr-full',
                    'rounded-bl-full',
                    'rounded-br-full',
                  ];
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => {
                        const cardId = pendingWildCardId;
                        setPendingWildCardId(null);
                        triggerHaptic('medium');
                        dispatchAction('play_card', { cardId, chosenColor: col });
                      }}
                      aria-label={col}
                      style={{ backgroundColor: PARTY_COLOR_STYLES[col].hex }}
                      className={`w-full h-full ${corners[qIdx]} hover:brightness-115 active:scale-95 transition-all cursor-pointer border-2 border-white/60 shadow-inner`}
                    />
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setPendingWildCardId(null)}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-[#11131b] border-2 border-white/75 text-[10px] font-extrabold uppercase text-white flex items-center justify-center shadow-xl cursor-pointer hover:bg-zinc-800"
              >
                {pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Cancel' })}
              </button>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              {pickLang(lang, { es: 'Elige color', ca: 'Tria color', en: 'Pick color' })}
            </span>
          </div>
        )}

        {uState.status === 'finished' && winnerSeat && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={
              winnerSeat.score >= UNO_TARGET_SCORE
                ? `${winnerSeat.name} · ¡Campeón ${UNO_TARGET_SCORE} pts!`
                : pickLang(lang, {
                    es: `${winnerSeat.name} gana la ronda`,
                    ca: `${winnerSeat.name} guanya la ronda`,
                    en: `${winnerSeat.name} wins round`,
                  })
            }
            subtitle={`+${uState.roundPointsWon || 0} pts`}
            primaryLabel={
              winnerSeat.score >= UNO_TARGET_SCORE
                ? pickLang(lang, { es: 'Nueva Partida', ca: 'Nova Partida', en: 'New Match' })
                : pickLang(lang, { es: 'Siguiente Ronda', ca: 'Següent Ronda', en: 'Next Round' })
            }
            onPrimaryAction={() => dispatchAction('rematch')}
          />
        )}
      </div>

      {/* Interactive Curved Fan Player Hand */}
      {mySeatIndex >= 0 && (
        <div className="shrink-0 pt-1 pb-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 px-1 mb-1.5">
            <span className="font-semibold text-zinc-200 shrink-0">
              {pickLang(lang, {
                es: `Tu mano (${myHand.length})`,
                ca: `La teva mà (${myHand.length})`,
                en: `Your hand (${myHand.length})`,
              })}
            </span>

            {canCallUno ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  dispatchAction('call_uno');
                }}
                className="min-h-8 px-3.5 rounded-full bg-gradient-to-r from-rose-600 via-red-500 to-amber-500 hover:brightness-110 text-xs font-black text-white flex items-center gap-1.5 shadow-[0_0_22px_rgba(244,63,94,0.85)] ring-2 ring-white/90 animate-pulse cursor-pointer active:scale-95 shrink-0"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>¡UNO!</span>
              </button>
            ) : uState.status === 'playing' && myHand.length <= 2 && uState.unoCalledSeats.includes(mySeatIndex) ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-black text-emerald-200 shrink-0">
                ✓ ¡UNO! cantado
              </span>
            ) : (
              <span className="text-[10px] text-zinc-400 truncate">
                {isMyTurn
                  ? pickLang(lang, { es: 'Toca una carta iluminada', ca: 'Toca una carta', en: 'Tap highlighted card' })
                  : pickLang(lang, { es: 'Esperando turno', ca: 'Esperant torn', en: 'Waiting turn' })}
              </span>
            )}
          </div>

          <div className="relative flex items-end justify-center min-h-[104px] sm:min-h-[120px] px-2 overflow-visible select-none">
            {myHand.map((card, idx) => {
              const playable = isMyTurn && isUnoCardPlayable(uState, card);
              const offset = idx - fanMid;
              const angle = offset * maxFanDeg;
              const arcY = Math.pow(Math.abs(offset), 1.35) * (handLen > 8 ? 1.4 : 2.2);

              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={!playable}
                  onClick={() => {
                    if (!playable) return;
                    triggerHaptic('light');
                    if (card.color === 'wild') {
                      setPendingWildCardId(card.id);
                    } else {
                      dispatchAction('play_card', { cardId: card.id });
                    }
                  }}
                  style={{
                    marginLeft: idx === 0 ? 0 : `${cardOverlapPx}px`,
                    transform: `translateY(${arcY - (playable ? 10 : 0)}px) rotate(${angle}deg)`,
                    zIndex: playable ? 20 + idx : idx,
                  }}
                  aria-label={`${card.color} ${card.value}`}
                  className={`relative w-[58px] h-[87px] sm:w-[68px] sm:h-[102px] rounded-xl shrink-0 transition-transform duration-150 origin-bottom ${
                    playable
                      ? 'cursor-pointer hover:-translate-y-5 hover:scale-115 hover:z-40 active:scale-95 drop-shadow-[0_10px_22px_rgba(255,255,255,0.36)]'
                      : 'opacity-45 grayscale-[70%] cursor-not-allowed brightness-65'
                  }`}
                >
                  <div
                    className={`relative w-full h-full rounded-xl overflow-hidden ${
                      playable &&
                      (card.color === 'wild' ||
                        card.value === 'draw2' ||
                        card.value === 'skip' ||
                        card.value === 'reverse')
                        ? 'card-foil-shimmer'
                        : ''
                    }`}
                  >
                    <img
                      src={getUnoCardSvgSrc(card.color, card.value)}
                      alt={`${card.color} ${card.value}`}
                      className={`w-full h-full object-contain rounded-xl pointer-events-none select-none ${
                        playable
                          ? card.color === 'wild'
                            ? 'ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.65)]'
                            : 'ring-2 ring-white/95 shadow-md'
                          : ''
                      }`}
                      draggable={false}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
