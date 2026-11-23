import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Share2,
  Shuffle,
  Users,
} from 'lucide-react';
import { PinturilloStage } from './PinturilloStage';
import { Pool8BallStage } from './Pool8BallStage';
import { FutbolChapasStage } from './FutbolChapasStage';
import {
  GameFloatingReactionToast,
  GameMuteButton,
  GameReactionButton,
  useGameFloatingReaction,
  useGameSoundMute,
} from './games/GameEffects';
import { VoiceWaveBars } from './games/GameVoiceBar';
import { GamesHubLobby } from './games/GamesHubLobby';
import { GamesHubSecondaryStages } from './games/GamesHubSecondaryStages';
import type { GamesHubSectionProps } from './games/gamesHubTypes';
import {
  GameSwitcherModal,
  GAME_SIGNATURES,
  getGamesHubTitleMap,
  getGameSwitcherOptions,
} from './games/GameSwitcherModal';
import {
  useGamesHubController,
  isBoardGameId,
  isPartyGame,
} from './games/useGamesHubController';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

export const GamesHubSection: React.FC<GamesHubSectionProps> = ({
  lang,
  roomId = '',
  currentUser,
  participants,
  roomBoardGame,
  roomPartyGame,
  roomPinturilloGame = null,
  roomPoolGame = null,
  roomChapasGame = null,
  roomHeadSoccerGame = null,
  headSoccerSyncSnapshot = null,
  headSoccerPeerInput = null,
  roomPokerGame = null,
  roomBlackjackGame = null,
  matchResponses = null,
  gameMoveError = null,
  isHost = false,
  voiceChat,
  requestedGameOpen = null,
  onSelectedGameChange,
  onSwitchRoomGame,
  onStartRoomBoardGame,
  onJoinBoardSeat,
  onStartBoardMatch,
  onMoveBoardGame,
  onResignBoardGame,
  onResetBoardGame,
  onCloseBoardGame,
  onStartRoomPartyGame,
  onRoomPartyAction,
  onCloseRoomPartyGame,
  onStartRoomPinturillo,
  onStartPinturilloMatch,
  onPinturilloPickWord,
  onPinturilloStroke,
  onPinturilloUndo,
  onPinturilloClear,
  onPinturilloGuess,
  onPinturilloRematch,
  onCloseRoomPinturillo,
  onStartRoomPool,
  onStartPoolMatch,
  onPoolJoinSeat,
  onPoolCallPocket,
  onPoolPlaceCue,
  onPoolTakeShot,
  onPoolSyncChecksum,
  onPoolForfeit,
  onPoolRematch,
  onCloseRoomPool,
  onStartRoomChapas,
  onChapasJoinSeat,
  onChapasUpdateTeam,
  onChapasToggleBots,
  onChapasStartMatch,
  onChapasShoot,
  onChapasForfeit,
  onChapasRematch,
  onCloseRoomChapas,
  onStartRoomHeadSoccer,
  onHeadSoccerJoinSeat,
  onHeadSoccerSelectSkin,
  onHeadSoccerStartMatch,
  onHeadSoccerInput,
  onHeadSoccerSyncState,
  onHeadSoccerRematch,
  onCloseRoomHeadSoccer,
  onStartRoomPoker,
  onPokerJoinSeat,
  onPokerToggleBots,
  onPokerStartMatch,
  onPokerAction,
  onPokerRebuy,
  onCloseRoomPoker,
  onStartRoomBlackjack,
  onBlackjackJoinSeat,
  onBlackjackBet,
  onBlackjackDeal,
  onBlackjackAction,
  onBlackjackNewRound,
  onCloseRoomBlackjack,
}) => {
  const [hubMode, setHubMode] = useState<'offline' | 'online'>('online');
  const [muted, toggleMute] = useGameSoundMute();
  const { floatingReaction, sendReaction } = useGameFloatingReaction(hubMode === 'offline');

  const {
    selectedGame,
    showGameSwitcher,
    setShowGameSwitcher,
    localBoardGame,
    setLocalBoardGame,
    localMoveErr,
    setLocalMoveErr,
    inviteCopied,
    handleInviteGame,
    makeOfflineBoardState,
    handleBackToGames,
    switchModeForActiveGame,
    handleJoinOfflineBoardSeat,
    getActiveSeatedPlayers,
    handleSwitchGameInPlace,
    isLiveGame,
    openGameCard,
  } = useGamesHubController({
    lang,
    roomId,
    currentUser,
    hubMode,
    setHubMode,
    isHost,
    requestedGameOpen,
    roomBoardGame,
    roomPartyGame,
    roomPinturilloGame,
    roomPoolGame,
    roomChapasGame,
    roomHeadSoccerGame,
    roomPokerGame,
    roomBlackjackGame,
    onSelectedGameChange,
    onSwitchRoomGame,
    onStartRoomBoardGame,
    onCloseBoardGame,
    onStartRoomPartyGame,
    onCloseRoomPartyGame,
    onStartRoomPinturillo,
    onCloseRoomPinturillo,
    onStartRoomPool,
    onCloseRoomPool,
    onStartRoomChapas,
    onCloseRoomChapas,
    onStartRoomHeadSoccer,
    onCloseRoomHeadSoccer,
    onStartRoomPoker,
    onCloseRoomPoker,
    onStartRoomBlackjack,
    onCloseRoomBlackjack,
  });

  if (selectedGame) {
    const isParty = isPartyGame(selectedGame);
    const isPinturillo = selectedGame === 'pinturillo';
    const isPool = selectedGame === 'pool';
    const isChapas = selectedGame === 'chapas';
    const isHeadSoccer = selectedGame === 'headsoccer';
    const isPenalty = selectedGame === 'penalty';
    const isRacing3d = selectedGame === 'racing3d';
    const isPoker = selectedGame === 'poker';
    const isBlackjack = selectedGame === 'blackjack';
    const isBoardLike =
      !isParty &&
      !isPinturillo &&
      !isPool &&
      !isChapas &&
      !isHeadSoccer &&
      !isPenalty &&
      !isRacing3d &&
      !isPoker &&
      !isBlackjack &&
      selectedGame !== 'gyrohockey' &&
      selectedGame !== 'gyrospace' &&
      selectedGame !== 'bomberman' &&
      selectedGame !== 'pacman' &&
      selectedGame !== 'tetris' &&
      selectedGame !== 'hextris' &&
      selectedGame !== 'game2048' &&
      selectedGame !== 'flappy' &&
      selectedGame !== 'hexgl' &&
      selectedGame !== 'arkanoid' &&
      selectedGame !== 'invaders' &&
      selectedGame !== 'tvtrivia';
    const activeBoardState = isBoardLike
      ? hubMode === 'offline'
        ? localBoardGame
        : roomBoardGame?.gameType === selectedGame
        ? roomBoardGame
        : null
      : null;

    const titleMap = getGamesHubTitleMap(lang);
    const switcherOptions = getGameSwitcherOptions(titleMap);

    const poolMySeat =
      hubMode === 'online' && roomPoolGame
        ? roomPoolGame.players[0]?.userId === currentUser.id
          ? roomPoolGame.players[0]
          : roomPoolGame.players[1]?.userId === currentUser.id
          ? roomPoolGame.players[1]
          : null
        : null;
    const poolGroupShort =
      poolMySeat?.group === 'solids'
        ? pickLang(lang, { es: 'Lisas', ca: 'Llises', en: 'Solids' })
        : poolMySeat?.group === 'stripes'
        ? pickLang(lang, { es: 'Rayadas', ca: 'Ratllades', en: 'Stripes' })
        : pickLang(lang, { es: 'Abierta', ca: 'Oberta', en: 'Open' });

    const renderVoiceCompact = (ultraCompact = false) => {
      if (!voiceChat) return null;
      const isLocalSpeaking =
        voiceChat.isJoined &&
        !voiceChat.isMuted &&
        (voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0);
      const voicePeerCount = voiceChat.voicePeers.length;

      return (
        <div className="flex items-center gap-1 shrink-0">
          {voiceChat.isJoined ? (
            <>
              <button
                type="button"
                aria-pressed={voiceChat.isMuted}
                onClick={() => {
                  triggerHaptic('light');
                  voiceChat.toggleMute();
                }}
                className={`${
                  ultraCompact ? 'h-7 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]'
                } rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap border cursor-pointer transition-all shrink-0 ${
                  voiceChat.isMuted
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/55 text-rose-200'
                    : isLocalSpeaking
                    ? 'bg-emerald-500/30 hover:bg-emerald-500/40 border-emerald-300 text-emerald-100 ring-2 ring-emerald-400/75 shadow-[0_0_14px_rgba(16,185,129,0.5)]'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50 text-emerald-200'
                }`}
              >
                {voiceChat.isMuted ? (
                  <>
                    <MicOff className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {ultraCompact
                        ? 'Mute'
                        : pickLang(lang, { es: 'Silenciado', ca: 'Silenciat', en: 'Muted' })}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 shrink-0" />
                    <VoiceWaveBars active={isLocalSpeaking} level={voiceChat.localAudioLevel} size="sm" />
                    <span className={ultraCompact ? 'hidden sm:inline' : 'inline'}>
                      {voiceChat.localAudioLevel > 0.08
                        ? pickLang(lang, { es: 'Hablando', ca: 'Parlant', en: 'Speaking' })
                        : pickLang(lang, { es: 'Voz', ca: 'Veu', en: 'Voice' })}
                    </span>
                    {voicePeerCount > 1 && (
                      <span className="px-1 rounded bg-black/30 text-[9px] font-mono tabular-nums text-emerald-100">
                        {voicePeerCount}
                      </span>
                    )}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  voiceChat.leaveVoice();
                }}
                aria-label={pickLang(lang, {
                  es: 'Colgar voz',
                  ca: 'Penjar veu',
                  en: 'Leave voice',
                })}
                title={pickLang(lang, {
                  es: 'Colgar voz',
                  ca: 'Penjar veu',
                  en: 'Leave voice',
                })}
                className="w-7 h-7 rounded-lg bg-white/[0.07] hover:bg-rose-500/25 border border-white/[0.12] flex items-center justify-center text-zinc-200 hover:text-rose-200 cursor-pointer shrink-0 transition-colors"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={voiceChat.status === 'requesting'}
              onClick={() => {
                triggerHaptic('medium');
                void voiceChat.joinVoice();
              }}
              className={`${
                ultraCompact ? 'h-7 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]'
              } rounded-lg bg-[#9146FF] hover:bg-[#772CE8] disabled:opacity-65 font-bold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0`}
            >
              {voiceChat.status === 'requesting' ? (
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              ) : (
                <PhoneCall className="w-3 h-3 shrink-0" />
              )}
              <span>
                {voiceChat.status === 'requesting'
                  ? '...'
                  : ultraCompact
                  ? 'Voz'
                  : pickLang(lang, { es: 'Abrir voz', ca: 'Obrir veu', en: 'Voice' })}
              </span>
            </button>
          )}
        </div>
      );
    };

    const activeSeatedPlayers = showGameSwitcher ? getActiveSeatedPlayers(activeBoardState) : [];

    return (
      <div
        data-game-fullscreen="true"
        className="fixed inset-0 z-[185] h-[100dvh] w-full max-w-[100vw] bg-[#070B14] nc-tabletop-slate overflow-hidden flex flex-col pt-safe pb-safe"
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-1.5 sm:p-3 max-w-5xl w-full mx-auto gap-1.5">
          <div
            className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-2xl nc-arcade-glass border border-white/[0.12] shrink-0 min-w-0"
            style={{
              boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 18px ${GAME_SIGNATURES[selectedGame].color}22`,
            }}
          >
            <button
              type="button"
              onClick={handleBackToGames}
              aria-label={pickLang(lang, { es: 'Volver a Juegos', ca: 'Tornar a Jocs', en: 'Back to Games' })}
              className="h-8 px-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.12] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0 shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
              </span>
            </button>

            <div className="flex items-center gap-1.5 min-w-0 flex-1 px-0.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setShowGameSwitcher((v) => !v);
                }}
                aria-expanded={showGameSwitcher}
                aria-label={pickLang(lang, {
                  es: 'Cambiar de juego sin salir',
                  ca: 'Canviar de joc sense sortir',
                  en: 'Switch game without leaving',
                })}
                className="flex items-center gap-1.5 min-w-0 max-w-full px-2 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] cursor-pointer active:scale-[0.98] transition-all"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                  style={{
                    backgroundColor: GAME_SIGNATURES[selectedGame].color,
                    boxShadow: `0 0 10px ${GAME_SIGNATURES[selectedGame].color}`,
                  }}
                />
                <span className="text-xs sm:text-sm font-extrabold text-white truncate tracking-tight">
                  {titleMap[selectedGame]}
                </span>
                <span className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[10px] font-bold text-zinc-300 shrink-0">
                  <Shuffle className="w-2.5 h-2.5" />
                  {pickLang(lang, { es: 'Cambiar', ca: 'Canviar', en: 'Switch' })}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-zinc-300 shrink-0 transition-transform duration-200 ${
                    showGameSwitcher ? 'rotate-180 text-[#D8B4FE]' : ''
                  }`}
                />
              </button>
              {isPool && hubMode === 'online' && roomPoolGame && (
                <span className="text-[10px] font-bold text-emerald-300 truncate hidden sm:inline">
                  · {poolGroupShort}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center p-0.5 rounded-xl bg-zinc-950/80 border border-white/[0.1] shadow-inner">
                <button
                  type="button"
                  onClick={() => switchModeForActiveGame('online')}
                  className={`h-6.5 px-2 rounded-lg text-[10px] font-extrabold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-all duration-200 ${
                    hubMode === 'online'
                      ? 'bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3 h-3 shrink-0" />
                  <span className="hidden sm:inline">
                    {isPool ? '1v1' : 'Online'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => switchModeForActiveGame('offline')}
                  className={`h-6.5 px-2 rounded-lg text-[10px] font-extrabold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-all duration-200 ${
                    hubMode === 'offline'
                      ? 'bg-gradient-to-r from-[#9146FF] to-[#7E22CE] text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Bot className="w-3 h-3 shrink-0" />
                  <span className="hidden sm:inline">IA</span>
                </button>
              </div>
              {!isChapas && (
                <GameReactionButton
                  lang={lang}
                  compact
                  onSelectEmoji={(emoji) => sendReaction(currentUser, emoji)}
                />
              )}
              <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
              <button
                type="button"
                onClick={() => void handleInviteGame(selectedGame)}
                aria-label={pickLang(lang, { es: 'Compartir juego', ca: 'Compartir joc', en: 'Share game' })}
                className={`h-7 px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0 ${
                  inviteCopied
                    ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100'
                    : 'bg-[#9146FF] hover:bg-[#7C2AE8] border-[#9146FF] text-white shadow-[0_2px_12px_rgba(145,70,255,0.4)]'
                }`}
              >
                {inviteCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{pickLang(lang, { es: 'Copiado', ca: 'Copiat', en: 'Copied' })}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden xs:inline sm:inline">
                      {roomId
                        ? pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })
                        : pickLang(lang, { es: 'Compartir', ca: 'Compartir', en: 'Share' })}
                    </span>
                  </>
                )}
              </button>
              {renderVoiceCompact(true)}
            </div>
          </div>

          {!isChapas && (
            <GameFloatingReactionToast reaction={floatingReaction} className="top-14 right-3" />
          )}

          {voiceChat?.errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-amber-400/45 bg-amber-500/12 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-100 shrink-0"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="leading-snug truncate sm:whitespace-normal">{voiceChat.errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  void voiceChat.joinVoice();
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-400/25 hover:bg-amber-400/35 border border-amber-300/45 text-[10px] font-bold text-amber-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
              </button>
            </div>
          )}

          {hubMode === 'online' &&
            matchResponses &&
            matchResponses.gameType === selectedGame &&
            matchResponses.responses.length > 0 &&
            ((selectedGame === 'chapas' && roomChapasGame?.status === 'waiting') ||
              (selectedGame === 'headsoccer' && roomHeadSoccerGame?.status === 'waiting') ||
              (selectedGame === 'poker' && roomPokerGame?.status === 'waiting') ||
              (selectedGame === 'blackjack' && roomBlackjackGame?.phase === 'betting') ||
              (selectedGame === 'pool' && roomPoolGame?.status === 'waiting') ||
              (selectedGame === 'pinturillo' && roomPinturilloGame?.status === 'waiting') ||
              (isParty && roomPartyGame?.gameType === selectedGame && roomPartyGame.status === 'waiting') ||
              (isBoardGameId(selectedGame) && roomBoardGame?.gameType === selectedGame && roomBoardGame.status === 'waiting')) && (
              <div className="rounded-xl border border-purple-400/35 bg-purple-500/12 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] shrink-0 overflow-x-auto no-scrollbar">
                <span className="font-bold text-purple-200 whitespace-nowrap shrink-0">
                  {pickLang(lang, { es: 'Invitaciones:', ca: 'Invitacions:', en: 'Invites:' })}
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  {matchResponses.responses.map((r) => (
                    <span
                      key={r.userId}
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold whitespace-nowrap ${
                        r.status === 'accepted'
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                          : r.status === 'declined'
                          ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                          : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                      }`}
                    >
                      {r.userName}:{' '}
                      {r.status === 'accepted'
                        ? pickLang(lang, { es: 'Aceptó', ca: 'Acceptat', en: 'Joined' })
                        : r.status === 'declined'
                        ? pickLang(lang, { es: 'No ahora', ca: 'Ara no', en: 'Declined' })
                        : pickLang(lang, { es: 'Esperando…', ca: 'Esperant…', en: 'Waiting…' })}
                    </span>
                  ))}
                </div>
              </div>
            )}

          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto touch-pan-y custom-scrollbar">
            {isChapas ? (
              <FutbolChapasStage
                key={`chapas-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                chapasState={hubMode === 'offline' ? null : roomChapasGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={() => onStartRoomChapas?.()}
                onJoinSeatOnline={onChapasJoinSeat}
                onUpdateTeamOnline={onChapasUpdateTeam}
                onToggleBotsOnline={onChapasToggleBots}
                onStartMatchOnline={onChapasStartMatch}
                onShootOnline={onChapasShoot}
                onForfeitOnline={onChapasForfeit}
                onRematchOnline={onChapasRematch}
              />
            ) : isPool ? (
              <Pool8BallStage
                key={`pool-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                poolState={hubMode === 'offline' ? null : roomPoolGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={onStartRoomPool}
                onStartMatchOnline={onStartPoolMatch}
                onJoinSeatOnline={onPoolJoinSeat}
                onPlaceCueOnline={onPoolPlaceCue}
                onCallPocketOnline={onPoolCallPocket}
                onTakeShotOnline={onPoolTakeShot}
                onForfeitOnline={onPoolForfeit}
                onRematchOnline={onPoolRematch}
                onSyncChecksumOnline={onPoolSyncChecksum}
              />
            ) : isPinturillo ? (
              <PinturilloStage
                key={`pinturillo-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                pinturilloState={hubMode === 'offline' ? null : roomPinturilloGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={onStartRoomPinturillo}
                onStartMatchOnline={onStartPinturilloMatch}
                onPickWordOnline={onPinturilloPickWord}
                onSendStrokeOnline={onPinturilloStroke}
                onUndoOnline={onPinturilloUndo}
                onClearOnline={onPinturilloClear}
                onSendGuessOnline={onPinturilloGuess}
                onRematchOnline={onPinturilloRematch}
              />
            ) : (
              <GamesHubSecondaryStages
                selectedGame={selectedGame}
                hubMode={hubMode}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                isHost={isHost}
                muted={muted}
                toggleMute={toggleMute}
                voiceChat={voiceChat}
                roomHeadSoccerGame={roomHeadSoccerGame}
                headSoccerSyncSnapshot={headSoccerSyncSnapshot}
                headSoccerPeerInput={headSoccerPeerInput}
                roomPokerGame={roomPokerGame}
                roomBlackjackGame={roomBlackjackGame}
                roomPartyGame={roomPartyGame}
                activeBoardState={activeBoardState}
                localBoardGame={localBoardGame}
                setLocalBoardGame={setLocalBoardGame}
                localMoveErr={localMoveErr}
                setLocalMoveErr={setLocalMoveErr}
                gameMoveError={gameMoveError}
                makeOfflineBoardState={makeOfflineBoardState}
                handleJoinOfflineBoardSeat={handleJoinOfflineBoardSeat}
                handleBackToGames={handleBackToGames}
                onStartRoomHeadSoccer={onStartRoomHeadSoccer}
                onHeadSoccerJoinSeat={onHeadSoccerJoinSeat}
                onHeadSoccerSelectSkin={onHeadSoccerSelectSkin}
                onHeadSoccerStartMatch={onHeadSoccerStartMatch}
                onHeadSoccerInput={onHeadSoccerInput}
                onHeadSoccerSyncState={onHeadSoccerSyncState}
                onHeadSoccerRematch={onHeadSoccerRematch}
                onStartRoomPoker={onStartRoomPoker}
                onPokerJoinSeat={onPokerJoinSeat}
                onPokerToggleBots={onPokerToggleBots}
                onPokerStartMatch={onPokerStartMatch}
                onPokerAction={onPokerAction}
                onPokerRebuy={onPokerRebuy}
                onStartRoomBlackjack={onStartRoomBlackjack}
                onBlackjackJoinSeat={onBlackjackJoinSeat}
                onBlackjackBet={onBlackjackBet}
                onBlackjackDeal={onBlackjackDeal}
                onBlackjackAction={onBlackjackAction}
                onBlackjackNewRound={onBlackjackNewRound}
                onStartRoomPartyGame={onStartRoomPartyGame}
                onRoomPartyAction={onRoomPartyAction}
                onStartRoomBoardGame={onStartRoomBoardGame}
                onJoinBoardSeat={onJoinBoardSeat}
                onStartBoardMatch={onStartBoardMatch}
                onMoveBoardGame={onMoveBoardGame}
                onResignBoardGame={onResignBoardGame}
                onResetBoardGame={onResetBoardGame}
              />
            )}
          </div>
        </div>

        {showGameSwitcher && (
          <GameSwitcherModal
            lang={lang}
            selectedGame={selectedGame}
            activeSeatedPlayers={activeSeatedPlayers}
            switcherOptions={switcherOptions}
            onClose={() => setShowGameSwitcher(false)}
            onSelectGame={handleSwitchGameInPlace}
          />
        )}
      </div>
    );
  }

  return (
    <GamesHubLobby
      lang={lang}
      roomId={roomId}
      participants={participants}
      hubMode={hubMode}
      onChangeHubMode={setHubMode}
      isLiveGame={isLiveGame}
      onOpenGame={openGameCard}
      onInviteGame={handleInviteGame}
      inviteCopied={inviteCopied}
    />
  );
};
