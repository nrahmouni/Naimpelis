import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PARTY_TURN_DECISION_MS,
  claimPartyBotSeat,
  createInitialParchisState,
  startPartyMatch,
} from '../src/shared/partyGames';
import {
  BOARD_TURN_DECISION_MS,
  chooseAutoBoardMove,
  createInitialBoardGameState,
  resetBoardGame,
  startBoardMatch,
} from '../src/shared/boardGames';
import {
  CHAPAS_ARENA_W,
  CHAPAS_BALL_RADIUS,
  CHAPAS_PITCH_BOTTOM,
  createInitialChapasState,
  joinChapasSeat,
  shootChapasCap,
  startChapasMatch,
  toggleChapasBots,
} from '../src/shared/futbolChapas';
import { createInitialPoolState, startPoolMatch } from '../src/shared/pool8Ball';
import {
  createInitialPinturilloState,
  joinPinturilloPlayer,
  startPinturilloMatch,
} from '../src/shared/pinturillo';
import {
  wsChapasShootSchema,
  wsChapasToggleBotsSchema,
  wsGameInviteRespondSchema,
  wsPartyGameActionSchema,
  wsVoiceRoomSchema,
  wsVoiceSignalSchema,
  wsVoiceStateSchema,
} from '../server/ws/wsSchemas';
import { buildHostGameInvitePayload } from '../server/ws/roomHub';

const ROOT = process.cwd();

describe('Multiplayer Lobbies, 15s Timer & WebRTC Voice Chat', () => {
  it('validates 15s decision timers, lobby seat/color selection, host play start, and auto-move', () => {
    expect(BOARD_TURN_DECISION_MS).toBe(15_000);
    expect(PARTY_TURN_DECISION_MS).toBe(15_000);

    const waitingParty = createInitialParchisState([{ id: 'host', name: 'Host' }], { waitForHost: true });
    expect(waitingParty.status).toBe('waiting');

    const claimed = claimPartyBotSeat(waitingParty, { id: 'p2', name: 'P2' }, 2);
    expect(claimed.ok).toBe(true);
    if (claimed.ok) {
      expect(claimed.claimedSeat).toBe(2);
      expect(claimed.state.players[2].userId).toBe('p2');
      const started = startPartyMatch(claimed.state);
      expect(started.status).toBe('playing');
      expect(started.turnDeadlineAt).toBeDefined();
    }

    const waitingBoard = createInitialBoardGameState(
      'chess',
      { id: 'host', name: 'Host', avatar: '🎮', color: '#9146FF' },
      false,
      undefined,
      0,
      [],
      true
    );
    expect(waitingBoard.status).toBe('waiting');
    const startedBoard = startBoardMatch(waitingBoard);
    expect(startedBoard.status).toBe('playing');
    expect(startedBoard.players.b?.isBot).toBe(true);
    expect(startedBoard.turnDeadlineAt).toBeDefined();

    const autoMove = chooseAutoBoardMove(startedBoard);
    expect(autoMove).not.toBeNull();
  });

  it('validates WebRTC voice and party lobby WS Zod schemas', () => {
    expect(wsVoiceRoomSchema.safeParse({ roomId: 'sala_vip' }).success).toBe(true);
    expect(wsVoiceStateSchema.safeParse({ roomId: 'sala_vip', isMuted: true }).success).toBe(true);
    expect(
      wsVoiceSignalSchema.safeParse({
        roomId: 'sala_vip',
        targetUserId: 'user-2',
        signalType: 'offer',
        sdp: { type: 'offer', sdp: 'v=0...' },
      }).success
    ).toBe(true);
    expect(
      wsPartyGameActionSchema.safeParse({
        roomId: 'sala_vip',
        action: 'join_seat',
        seatIndex: 2,
      }).success
    ).toBe(true);
    expect(
      wsPartyGameActionSchema.safeParse({
        roomId: 'sala_vip',
        action: 'start_match',
      }).success
    ).toBe(true);
  });

  it('enables microphone permissions in metadata/headers and wires VoiceWaveBars across all 7 games', () => {
    const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf8'));
    expect(metadata.requestFramePermissions).toContain('microphone');

    const errHandlerSrc = fs.readFileSync(
      path.join(ROOT, 'server/middleware/errorHandler.ts'),
      'utf8'
    );
    expect(errHandlerSrc).toContain('microphone=*');

    const hubSrc = fs.readFileSync(path.join(ROOT, 'src/components/GamesHubSection.tsx'), 'utf8');
    expect(hubSrc).toContain('VoiceWaveBars');
    expect(hubSrc).not.toContain('showPartyWaitingColors');

    const poolHeaderSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/games/PoolStageHeader.tsx'),
      'utf8'
    );
    expect(poolHeaderSrc).toContain('VoiceSpeakerIndicator');
    expect(poolHeaderSrc).toContain('audioLevel={p0Level}');

    const voiceHookSrc = fs.readFileSync(path.join(ROOT, 'src/hooks/useGameVoiceChat.ts'), 'utf8');
    expect(voiceHookSrc).toContain('openrelay.metered.ca');
    expect(voiceHookSrc).toContain('primeAudioPoolOnGesture');
    expect(voiceHookSrc).toContain('audioPlaybackBlocked');
    expect(voiceHookSrc).toContain('resumeRemoteAudio');
    expect(voiceHookSrc).not.toContain("el.style.display = 'none'");

    const playerSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/NativeCinemaPlayer.tsx'),
      'utf8'
    );
    expect(playerSrc).toContain('voiceChat');
    expect(playerSrc).toContain('VoiceWaveBars');
  });

  it('builds centered host game invite payloads only when host starts with human companions', () => {
    const baseRoom = {
      id: 'sala-test',
      name: 'Sala VIP',
      hostId: 'u_host',
      creatorId: 'u_host',
      participants: [
        { id: 'u_host', name: 'Anfitrión', avatar: '👑' },
        { id: 'u_guest', name: 'Invitado', avatar: '🍿' },
      ],
    };

    expect(
      buildHostGameInvitePayload({
        room: baseRoom,
        senderUserId: 'u_guest',
        gameType: 'pool',
      })
    ).toBeNull();

    expect(
      buildHostGameInvitePayload({
        room: baseRoom,
        senderUserId: 'u_host',
        gameType: 'chess',
        soloLocal: true,
      })
    ).toBeNull();

    expect(
      buildHostGameInvitePayload({
        room: {
          ...baseRoom,
          participants: [
            { id: 'u_host', name: 'Anfitrión', avatar: '👑' },
            { id: 'tv_1', name: 'Salon (TV)', avatar: '📺' },
          ],
        },
        senderUserId: 'u_host',
        gameType: 'parchis',
      })
    ).toBeNull();

    const allGames = ['pool', 'chapas', 'parchis', 'uno', 'pinturillo', 'chess', 'checkers', 'connect4'] as const;
    for (const gt of allGames) {
      const invite = buildHostGameInvitePayload({
        room: baseRoom,
        senderUserId: 'u_host',
        gameType: gt,
      });
      expect(invite).not.toBeNull();
      expect(invite?.gameType).toBe(gt);
      expect(invite?.inviterId).toBe('u_host');
      expect(invite?.roomName).toBe('Sala VIP');
    }
  });
});

describe('Futbol Chapas Engine & Match Waiting Lobby Flows', () => {
  it('sets up 12 caps + ball, toggles bots cleanly, enforces 3-pass possession and first-to-3 goals', () => {
    const waiting = createInitialChapasState([{ id: 'u1', name: 'Naim' }], { waitForHost: true });
    expect(waiting.status).toBe('waiting');
    expect(waiting.caps.length).toBe(12);
    expect(waiting.players[0]?.userId).toBe('u1');
    expect(waiting.players[2]?.isBot).toBe(true);

    const noBots = toggleChapasBots(waiting, false);
    expect(noBots.botsEnabled).toBe(false);
    expect(noBots.players[2]).toBeNull();

    const joined = joinChapasSeat(noBots, { id: 'u2', name: 'Carlos' }, 2);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    const started = startChapasMatch(joined.state);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.state.status).toBe('playing');
    expect(started.state.activeTeam).toBe('A');

    const capA6 = started.state.caps.find((c) => c.id === 'A-6')!;
    const touchAngle = Math.atan2(started.state.ball.y - capA6.y, started.state.ball.x - capA6.x);
    const pass1 = shootChapasCap(started.state, 'u1', { capId: 'A-6', angle: touchAngle, power: 0.45 });
    expect(pass1.ok).toBe(true);
    if (!pass1.ok) return;
    expect(pass1.state.lastShot?.ballTouched).toBe(true);
    expect(pass1.state.activeTeam).toBe('A');
    expect(pass1.state.passesUsed).toBe(1);

    const miss = shootChapasCap(pass1.state, 'u1', { capId: 'A-1', angle: Math.PI, power: 0.25 });
    expect(miss.ok).toBe(true);
    if (!miss.ok) return;
    expect(miss.state.activeTeam).toBe('B');
    expect(miss.state.passesUsed).toBe(0);

    const goalSetup = {
      ...miss.state,
      activeTeam: 'A' as const,
      activeSeatIndex: 0 as const,
      scores: { A: 2, B: 0 },
      caps: miss.state.caps.map((c) =>
        c.id === 'A-6' ? { ...c, x: CHAPAS_ARENA_W / 2, y: CHAPAS_PITCH_BOTTOM - 58 } : c
      ),
      ball: {
        x: CHAPAS_ARENA_W / 2,
        y: CHAPAS_PITCH_BOTTOM - CHAPAS_BALL_RADIUS - 12,
        vx: 0,
        vy: 0,
        spinAngle: 0,
      },
    };
    const winningGoal = shootChapasCap(goalSetup, 'u1', {
      capId: 'A-6',
      angle: Math.PI / 2,
      power: 0.85,
    });
    expect(winningGoal.ok).toBe(true);
    if (!winningGoal.ok) return;
    expect(winningGoal.state.scores.A).toBe(3);
    expect(winningGoal.state.status).toBe('finished');
    expect(winningGoal.state.winnerTeam).toBe('A');
  });

  it('keeps Pool, Pinturillo, and switched Board games waiting until players respond or host starts', () => {
    const poolWait = createInitialPoolState([{ id: 'u1', name: 'Host' }], { waitForHost: true });
    expect(poolWait.status).toBe('waiting');
    expect(poolWait.awaitingHostStart).toBe(true);
    expect(poolWait.turnDeadlineAt).toBe(0);
    const poolLive = startPoolMatch(poolWait);
    expect(poolLive.status).toBe('playing');
    expect(poolLive.turnDeadlineAt).toBeGreaterThan(0);

    const pintWait = createInitialPinturilloState([{ id: 'u1', name: 'Host' }], { waitForHost: true });
    expect(pintWait.status).toBe('waiting');
    expect(pintWait.phaseDeadlineAt).toBe(0);
    const pintJoined = joinPinturilloPlayer(pintWait, { id: 'u2', name: 'Ana' });
    expect(pintJoined.players.some((p) => p.userId === 'u2')).toBe(true);
    const pintLive = startPinturilloMatch(pintJoined);
    expect(pintLive.status).toBe('choosing');
    expect(pintLive.phaseDeadlineAt).toBeGreaterThan(0);

    const chess = startBoardMatch(createInitialBoardGameState('chess', { id: 'u1', name: 'Host' }));
    const switchedToCheckers = resetBoardGame(chess, { gameType: 'checkers', waitForHost: true });
    expect(switchedToCheckers.gameType).toBe('checkers');
    expect(switchedToCheckers.status).toBe('waiting');
    expect(switchedToCheckers.turnDeadlineAt).toBe(0);
  });

  it('validates game invite response and Chapas WS schemas, and keeps chat sidebar free of games menu', () => {
    expect(
      wsGameInviteRespondSchema.safeParse({
        roomId: 'sala_vip',
        gameType: 'chapas',
        response: 'accepted',
      }).success
    ).toBe(true);
    expect(
      wsChapasToggleBotsSchema.safeParse({
        roomId: 'sala_vip',
        botsEnabled: false,
      }).success
    ).toBe(true);
    expect(
      wsChapasShootSchema.safeParse({
        roomId: 'sala_vip',
        shot: {
          capId: 'A-6',
          angle: 1.57,
          power: 0.7,
        },
      }).success
    ).toBe(true);

    const sidebarSrc = fs.readFileSync(path.join(ROOT, 'src/components/PartySidebar.tsx'), 'utf8');
    expect(sidebarSrc).not.toContain('Juegos Online en Sala');
    expect(sidebarSrc).not.toContain('PartyGamesStage');

    const hubSrc = fs.readFileSync(path.join(ROOT, 'src/components/GamesHubSection.tsx'), 'utf8');
    expect(hubSrc).toContain('FutbolChapasStage');
    expect(hubSrc).toContain('matchResponses');
  });
});
