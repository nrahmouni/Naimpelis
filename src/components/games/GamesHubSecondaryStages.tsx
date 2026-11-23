import React from 'react';
import type {
  AppLanguage,
  BlackjackGameState,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  ChessPromotionPiece,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
  Participant,
  PokerActionType,
  PokerGameState,
} from '../../types';
import {
  applyBoardMove,
  resetBoardGame,
  resignBoardGame,
  startBoardMatch,
} from '../../shared/boardGames';
import type { PartyColor, PartyGameState, PartyGameType } from '../../shared/partyGames';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { RoomBoardGamePanel } from '../RoomBoardGamePanel';
import { PartyGamesStage, type PartyOnlineAction } from '../PartyGamesStage';
import { HeadSoccerStage } from '../HeadSoccerStage';
import { PokerHoldemStage } from '../PokerHoldemStage';
import { BlackjackStage } from '../BlackjackStage';
import { PenaltyShootoutStage } from './PenaltyShootoutStage';
import { GyroArcadeStage } from './GyroArcadeStage';
import type { UnifiedGameId } from './GameLogos';
import { isPartyGame } from './useGamesHubController';

const Racing3DStage = React.lazy(() =>
  import('./racing/Racing3DStage').then((m) => ({ default: m.Racing3DStage }))
);

interface GamesHubSecondaryStagesProps {
  selectedGame: UnifiedGameId;
  hubMode: 'offline' | 'online';
  lang: AppLanguage;
  roomId?: string;
  currentUser: Participant;
  participants: Participant[];
  isHost: boolean;
  muted: boolean;
  toggleMute: () => void;
  voiceChat?: GameVoiceChatState;
  roomHeadSoccerGame: HeadSoccerOnlineState | null;
  headSoccerSyncSnapshot: { seq: number; sim: HeadSoccerSimulation } | null;
  headSoccerPeerInput: { side: 0 | 1; input: HeadSoccerInput; seq: number } | null;
  roomPokerGame: PokerGameState | null;
  roomBlackjackGame: BlackjackGameState | null;
  roomPartyGame: PartyGameState | null;
  activeBoardState: BoardGameState | null;
  localBoardGame: BoardGameState | null;
  setLocalBoardGame: React.Dispatch<React.SetStateAction<BoardGameState | null>>;
  localMoveErr: string | null;
  setLocalMoveErr: React.Dispatch<React.SetStateAction<string | null>>;
  gameMoveError: string | null;
  makeOfflineBoardState: (gt: BoardGameType, humanColor?: 'w' | 'b') => BoardGameState;
  handleJoinOfflineBoardSeat: (side: 'w' | 'b' | 'spectate') => void;
  handleBackToGames: () => void;
  onStartRoomHeadSoccer?: () => void;
  onHeadSoccerJoinSeat?: (seatIndex: 0 | 1 | 'spectate') => void;
  onHeadSoccerSelectSkin?: (skinId: HeadSoccerSkinId) => void;
  onHeadSoccerStartMatch?: () => void;
  onHeadSoccerInput?: (side: 0 | 1, input: HeadSoccerInput) => void;
  onHeadSoccerSyncState?: (sim: HeadSoccerSimulation) => void;
  onHeadSoccerRematch?: () => void;
  onStartRoomPoker?: (botsEnabled?: boolean) => void;
  onPokerJoinSeat?: (seatIndex?: number | 'spectate') => void;
  onPokerToggleBots?: (botsEnabled: boolean) => void;
  onPokerStartMatch?: () => void;
  onPokerAction?: (action: PokerActionType, raiseTo?: number) => void;
  onPokerRebuy?: () => void;
  onStartRoomBlackjack?: () => void;
  onBlackjackJoinSeat?: (seatIndex?: number | 'spectate') => void;
  onBlackjackBet?: (
    op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' }
  ) => void;
  onBlackjackDeal?: () => void;
  onBlackjackAction?: (action: 'hit' | 'stand' | 'double' | 'split') => void;
  onBlackjackNewRound?: () => void;
  onStartRoomPartyGame?: (gt: PartyGameType) => void;
  onRoomPartyAction?: (
    action: PartyOnlineAction,
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) => void;
  onStartRoomBoardGame?: (
    gt: BoardGameType,
    soloLocal?: boolean,
    clockMinutes?: BoardClockMinutes
  ) => void;
  onJoinBoardSeat?: (side: 'w' | 'b' | 'spectate') => void;
  onStartBoardMatch?: () => void;
  onMoveBoardGame?: (from: BoardCoord, to: BoardCoord, promo?: ChessPromotionPiece) => void;
  onResignBoardGame?: () => void;
  onResetBoardGame?: (opts?: {
    gameType?: BoardGameType;
    swapColors?: boolean;
    clockMinutes?: BoardClockMinutes;
  }) => void;
}

export const GamesHubSecondaryStages: React.FC<GamesHubSecondaryStagesProps> = ({
  selectedGame,
  hubMode,
  lang,
  roomId = '',
  currentUser,
  participants,
  isHost,
  muted,
  toggleMute,
  voiceChat,
  roomHeadSoccerGame,
  headSoccerSyncSnapshot,
  headSoccerPeerInput,
  roomPokerGame,
  roomBlackjackGame,
  roomPartyGame,
  activeBoardState,
  localBoardGame,
  setLocalBoardGame,
  localMoveErr,
  setLocalMoveErr,
  gameMoveError,
  makeOfflineBoardState,
  handleJoinOfflineBoardSeat,
  handleBackToGames,
  onStartRoomHeadSoccer,
  onHeadSoccerJoinSeat,
  onHeadSoccerSelectSkin,
  onHeadSoccerStartMatch,
  onHeadSoccerInput,
  onHeadSoccerSyncState,
  onHeadSoccerRematch,
  onStartRoomPoker,
  onPokerJoinSeat,
  onPokerToggleBots,
  onPokerStartMatch,
  onPokerAction,
  onPokerRebuy,
  onStartRoomBlackjack,
  onBlackjackJoinSeat,
  onBlackjackBet,
  onBlackjackDeal,
  onBlackjackAction,
  onBlackjackNewRound,
  onStartRoomPartyGame,
  onRoomPartyAction,
  onStartRoomBoardGame,
  onJoinBoardSeat,
  onStartBoardMatch,
  onMoveBoardGame,
  onResignBoardGame,
  onResetBoardGame,
}) => {
  if (selectedGame === 'penalty') {
    return <PenaltyShootoutStage lang={lang} onClose={handleBackToGames} />;
  }

  if (selectedGame === 'gyrohockey' || selectedGame === 'gyrospace') {
    return (
      <GyroArcadeStage
        gameId={selectedGame}
        lang={lang}
        roomId={roomId}
        userName={currentUser.name}
        onClose={handleBackToGames}
      />
    );
  }

  if (selectedGame === 'racing3d') {
    return (
      <React.Suspense
        fallback={
          <div className="w-full h-[520px] rounded-3xl bg-[#070a14] border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-300">
            Cargando motor 3D WebGL...
          </div>
        }
      >
        <Racing3DStage
          lang={lang}
          roomId={roomId}
          userName={currentUser.name}
          onClose={handleBackToGames}
        />
      </React.Suspense>
    );
  }

  if (selectedGame === 'headsoccer') {
    return (
      <HeadSoccerStage
        key={`headsoccer-${hubMode}`}
        lang={lang}
        currentUser={currentUser}
        participants={participants}
        headSoccerState={hubMode === 'offline' ? null : roomHeadSoccerGame}
        latestSyncSnapshot={headSoccerSyncSnapshot}
        remotePeerInput={headSoccerPeerInput}
        isOffline={hubMode === 'offline'}
        isHost={isHost}
        voiceChat={voiceChat}
        mutedOverride={muted}
        onStartOnline={() => onStartRoomHeadSoccer?.()}
        onJoinSeatOnline={onHeadSoccerJoinSeat}
        onSelectSkinOnline={onHeadSoccerSelectSkin}
        onStartMatchOnline={onHeadSoccerStartMatch}
        onSendInputOnline={onHeadSoccerInput}
        onSendSyncStateOnline={onHeadSoccerSyncState}
        onRematchOnline={onHeadSoccerRematch}
      />
    );
  }

  if (selectedGame === 'poker') {
    return (
      <PokerHoldemStage
        key={`poker-${hubMode}`}
        lang={lang}
        currentUser={currentUser}
        participants={participants}
        pokerState={hubMode === 'offline' ? null : roomPokerGame}
        isOffline={hubMode === 'offline'}
        isHost={isHost}
        voiceChat={voiceChat}
        mutedOverride={muted}
        onStartOnline={onStartRoomPoker}
        onJoinSeatOnline={onPokerJoinSeat}
        onToggleBotsOnline={onPokerToggleBots}
        onStartMatchOnline={onPokerStartMatch}
        onActionOnline={onPokerAction}
        onRebuyOnline={onPokerRebuy}
      />
    );
  }

  if (selectedGame === 'blackjack') {
    return (
      <BlackjackStage
        key={`blackjack-${hubMode}`}
        lang={lang}
        currentUser={currentUser}
        participants={participants}
        blackjackState={hubMode === 'offline' ? null : roomBlackjackGame}
        isOffline={hubMode === 'offline'}
        isHost={isHost}
        voiceChat={voiceChat}
        mutedOverride={muted}
        onStartOnline={() => onStartRoomBlackjack?.()}
        onJoinSeatOnline={onBlackjackJoinSeat}
        onBetOnline={onBlackjackBet}
        onDealOnline={onBlackjackDeal}
        onActionOnline={onBlackjackAction}
        onNewRoundOnline={onBlackjackNewRound}
      />
    );
  }

  if (isPartyGame(selectedGame)) {
    return (
      <PartyGamesStage
        key={`${selectedGame}-${hubMode}`}
        lang={lang}
        currentUser={currentUser}
        participants={participants}
        partyGameState={hubMode === 'offline' ? null : roomPartyGame}
        isOffline={hubMode === 'offline'}
        isHost={isHost}
        fullScreenMode={true}
        voiceChat={voiceChat}
        initialOfflineGameType={hubMode === 'offline' ? selectedGame : null}
        hideHeaderChrome={true}
        hideVoiceBar={true}
        mutedOverride={muted}
        onToggleMuteOverride={toggleMute}
        onStartOnline={onStartRoomPartyGame}
        onOnlineAction={onRoomPartyAction}
        onCloseOnline={handleBackToGames}
      />
    );
  }

  if (hubMode === 'offline') {
    return (
      <RoomBoardGamePanel
        key={`${selectedGame}-offline`}
        gameState={localBoardGame}
        currentUser={currentUser}
        lang={lang}
        moveError={localMoveErr}
        isOnlineRoom={false}
        isHost={true}
        fullScreenMode={true}
        hideGameSwitcher={true}
        hideVoiceBar={true}
        mutedOverride={muted}
        onToggleMuteOverride={toggleMute}
        onStartGame={(gt) => setLocalBoardGame(makeOfflineBoardState(gt, 'w'))}
        onJoinSeat={handleJoinOfflineBoardSeat}
        onStartMatch={() => setLocalBoardGame((curr) => (curr ? startBoardMatch(curr) : curr))}
        onMove={(from, to, promo) => {
          if (!localBoardGame || localBoardGame.status !== 'playing') return;
          const activeSeat = localBoardGame.players[localBoardGame.turn];
          if (activeSeat?.userId !== currentUser.id) return;
          const res = applyBoardMove(localBoardGame, currentUser.id, from, to, promo || 'Q');
          if (!res.ok) {
            setLocalMoveErr(res.error);
            return;
          }
          setLocalMoveErr(null);
          setLocalBoardGame(res.state);
        }}
        onResign={() => {
          if (!localBoardGame) return;
          const resigned = resignBoardGame(localBoardGame, currentUser.id);
          if (resigned) setLocalBoardGame(resigned);
        }}
        onReset={(opts) => {
          if (!localBoardGame) return;
          setLocalMoveErr(null);
          setLocalBoardGame(resetBoardGame(localBoardGame, opts));
        }}
        onCloseGame={handleBackToGames}
      />
    );
  }

  return (
    <RoomBoardGamePanel
      key={`${selectedGame}-online`}
      gameState={activeBoardState}
      currentUser={currentUser}
      lang={lang}
      moveError={gameMoveError}
      voiceChat={voiceChat}
      isOnlineRoom={true}
      isHost={isHost}
      fullScreenMode={true}
      hideGameSwitcher={true}
      hideVoiceBar={true}
      mutedOverride={muted}
      onToggleMuteOverride={toggleMute}
      onStartGame={(gt, solo, clockMin) => onStartRoomBoardGame?.(gt, solo, clockMin)}
      onJoinSeat={(side) => onJoinBoardSeat?.(side)}
      onStartMatch={onStartBoardMatch}
      onMove={(from, to, promo) => onMoveBoardGame?.(from, to, promo)}
      onResign={() => onResignBoardGame?.()}
      onReset={(opts) => onResetBoardGame?.(opts)}
      onCloseGame={handleBackToGames}
    />
  );
};
