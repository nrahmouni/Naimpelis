import express from 'express';
import { createServer, type Server } from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { createRoomHub } from '../server/ws/roomHub';
import {
  computeAuthoritativeVideoState,
  createInitialRoomRecord,
} from '../server/ws/roomHubHelpers';
import { dispatchRoomSocketEvent } from '../src/hooks/roomSocketMessageDispatcher';
import type { VideoState } from '../src/types';

interface WSMessage {
  type: string;
  payload: any;
}

let httpServer: Server;
let wss: WebSocketServer;
let serverWsUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  httpServer = createServer(app);
  wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });
  createRoomHub(app, wss);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address() as { port: number };
  serverWsUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

afterAll(async () => {
  wss?.clients.forEach((c) => c.close());
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(serverWsUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', (err) => reject(err));
  });
}

function waitForMessage(ws: WebSocket, messageType: string, timeoutMs = 4000): Promise<WSMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`Timed out waiting for message of type ${messageType}`));
    }, timeoutMs);

    function onMessage(data: WebSocket.RawData) {
      try {
        const msg = JSON.parse(data.toString()) as WSMessage;
        if (msg.type === messageType) {
          clearTimeout(timer);
          ws.off('message', onMessage);
          resolve(msg);
        }
      } catch {
        // ignore parse error
      }
    }

    ws.on('message', onMessage);
  });
}

function expectNoMessage(ws: WebSocket, forbiddenType: string, windowMs = 350): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      resolve();
    }, windowMs);

    function onMessage(data: WebSocket.RawData) {
      try {
        const msg = JSON.parse(data.toString()) as WSMessage;
        if (msg.type === forbiddenType) {
          clearTimeout(timer);
          ws.off('message', onMessage);
          reject(new Error(`Unexpected ${forbiddenType} received: ${JSON.stringify(msg.payload)}`));
        }
      } catch {
        // ignore
      }
    }

    ws.on('message', onMessage);
  });
}

describe('Backward playback time-jump regression prevention', () => {
  it('computeAuthoritativeVideoState advances lastUpdated atomically with currentTime', () => {
    const room = createInitialRoomRecord('sync-atom-room');
    const threeMinAgo = Date.now() - 180_000;
    room.videoState = {
      mode: 'hls',
      url: 'https://cdn.example.com/movie.m3u8',
      rawSourceUrl: 'tmdb:123',
      title: 'Película Test',
      currentTime: 420, // min 7
      isPlaying: true,
      isLive: false,
      tracks: [],
      activeTrackIndex: 0,
      lastUpdated: threeMinAgo,
      updatedBy: 'Host',
    };

    const before = Date.now();
    const vs = computeAuthoritativeVideoState(room);
    const after = Date.now();

    // Should be ~600s (min 10) AND lastUpdated must be refreshed to ~now so client doesn't double-add 180s
    expect(vs.currentTime).toBeGreaterThanOrEqual(599.5);
    expect(vs.currentTime).toBeLessThanOrEqual(602);
    expect(vs.lastUpdated).toBeGreaterThanOrEqual(before);
    expect(vs.lastUpdated).toBeLessThanOrEqual(after);
    // Original stored state remains untouched
    expect(room.videoState.lastUpdated).toBe(threeMinAgo);
    expect(room.videoState.currentTime).toBe(420);
  });

  it('legacy sync_request and SYNC_REQUEST are strictly read-only and never rewind room videoState', async () => {
    const roomId = `no-rewind-${Date.now()}`;
    const hostUser = { id: `host-${Date.now()}`, name: 'Naim', avatar: '🎬', color: '#E11D48' };
    const guestUser = { id: `guest-${Date.now()}`, name: 'Guest', avatar: '🍿', color: '#0284C7' };

    const wsHost = await connectWs();
    const hostJoin = waitForMessage(wsHost, 'ROOM_STATE');
    wsHost.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomId, user: hostUser } }));
    await hostJoin;

    const wsGuest = await connectWs();
    const guestJoin = waitForMessage(wsGuest, 'ROOM_STATE');
    wsGuest.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomId, user: guestUser } }));
    await guestJoin;

    // Host starts movie at min 7 (420s)
    const guestSeesMovie = waitForMessage(wsGuest, 'VIDEO_STATE_UPDATED');
    wsHost.send(
      JSON.stringify({
        type: 'SYNC_VIDEO_STATE',
        payload: {
          roomId,
          action: 'change_url',
          updatedBy: hostUser.name,
          videoState: {
            mode: 'hls',
            url: 'https://cdn.example.com/series-ep1.m3u8',
            rawSourceUrl: 'tv-1-1-1',
            title: 'Serie 1x01',
            currentTime: 420,
            isPlaying: true,
            isLive: false,
            tracks: [],
            activeTrackIndex: 0,
            lastUpdated: Date.now(),
          },
        },
      })
    );
    await guestSeesMovie;

    // Simulate 1.2s of playback elapsed without any user action
    await new Promise((r) => setTimeout(r, 1200));

    // Legacy action === 'sync_request' MUST NOT broadcast VIDEO_STATE_UPDATED or reset lastUpdated
    const noVideoUpdateOnHost = expectNoMessage(wsHost, 'VIDEO_STATE_UPDATED', 300);
    const noVideoUpdateOnGuest = expectNoMessage(wsGuest, 'VIDEO_STATE_UPDATED', 300);
    const roomStateOnSyncReq = waitForMessage(wsHost, 'ROOM_STATE');
    wsHost.send(
      JSON.stringify({
        type: 'SYNC_VIDEO_STATE',
        payload: {
          roomId,
          action: 'sync_request',
          videoState: {},
          updatedBy: hostUser.name,
        },
      })
    );
    const rsLegacy = await roomStateOnSyncReq;
    await Promise.all([noVideoUpdateOnHost, noVideoUpdateOnGuest]);

    expect(rsLegacy.payload.videoState.currentTime).toBeGreaterThanOrEqual(421.0);
    expect(typeof rsLegacy.payload.serverTime).toBe('number');

    // Standard SYNC_REQUEST must also return advancing authoritative time and be read-only
    await new Promise((r) => setTimeout(r, 600));
    const syncRespPromise = waitForMessage(wsGuest, 'ROOM_STATE');
    const noBroadcastPromise = expectNoMessage(wsHost, 'VIDEO_STATE_UPDATED', 250);
    wsGuest.send(JSON.stringify({ type: 'SYNC_REQUEST', payload: { roomId } }));
    const rsModern = await syncRespPromise;
    await noBroadcastPromise;
    expect(rsModern.payload.videoState.currentTime).toBeGreaterThanOrEqual(421.6);

    wsHost.close();
    wsGuest.close();
  });

  it('dispatchRoomSocketEvent keeps sole/host viewer active playback on reconnect ROOM_STATE and ignores sync_request', () => {
    let currentState: VideoState = {
      mode: 'hls',
      url: 'https://cdn.example.com/movie.m3u8',
      rawSourceUrl: 'tmdb:55',
      title: 'Película Activa',
      currentTime: 420,
      isPlaying: true,
      isLive: false,
      tracks: [],
      activeTrackIndex: 0,
      lastUpdated: Date.now() - 180_000, // watching continuously for 3 min (now at min 10)
      updatedBy: 'Naim',
    };

    const setVideoState: React.Dispatch<React.SetStateAction<VideoState>> = (updater) => {
      currentState = typeof updater === 'function' ? updater(currentState) : updater;
    };

    const ctx: any = {
      roomId: 'sala-naim',
      isTvMode: false,
      lang: 'es',
      profileId: 'u-host',
      profileName: 'Naim',
      mobileTabRef: { current: 'home' },
      hostIdRef: { current: 'u-host' },
      roomQueueRef: { current: [] },
      videoStateUrlRef: { current: currentState.url },
      isExtractingRef: { current: false },
      activeHubGameRef: { current: null },
      catalogSectionRef: { current: 'movies' },
      handlePlayQueueItemRef: { current: vi.fn() },
      tvClaimTimerRef: { current: null },
      recordStateInWatchHistory: vi.fn(),
      rememberSessionPin: vi.fn(),
      showHostLockNotice: vi.fn(),
      setTypingUser: vi.fn(),
      setRoomName: vi.fn(),
      setHostId: vi.fn(),
      setCreatorId: vi.fn(),
      setHostOnlyControl: vi.fn(),
      setRoomHasPin: vi.fn(),
      setPinPromptState: vi.fn(),
      setActivePoll: vi.fn(),
      setRoomGameState: vi.fn(),
      setPartyGameState: vi.fn(),
      setPinturilloState: vi.fn(),
      setPoolGameState: vi.fn(),
      setChapasGameState: vi.fn(),
      setHeadSoccerGameState: vi.fn(),
      setHeadSoccerPeerInput: vi.fn(),
      setHeadSoccerSyncSnapshot: vi.fn(),
      setPokerGameState: vi.fn(),
      setBlackjackGameState: vi.fn(),
      setMatchResponses: vi.fn(),
      setGameMoveError: vi.fn(),
      setParticipants: vi.fn(),
      setMessages: vi.fn(),
      setPinnedMessage: vi.fn(),
      setRoomQueue: vi.fn(),
      setRecentRooms: vi.fn(),
      setVideoState,
      setIsPlayerClosedLocally: vi.fn(),
      setCloudFrame: vi.fn(),
      setCloudState: vi.fn(),
      setUnreadChatCount: vi.fn(),
      setFloatingReactions: vi.fn(),
      setTvClaimStatus: vi.fn(),
      setIncomingGameInvite: vi.fn(),
      setForcedOpenGame: vi.fn(),
    };

    const prevRefSnapshot = currentState;

    // 1. Reconnect ROOM_STATE while sole viewer watching same URL: must NOT replace prevRefSnapshot
    dispatchRoomSocketEvent(
      {
        type: 'ROOM_STATE',
        payload: {
          id: 'sala-naim',
          name: 'Sala Naim',
          creatorId: 'u-host',
          hostId: 'u-host',
          participants: [{ id: 'u-host', name: 'Naim', avatar: '🎬', color: '#E11D48', isHost: true }],
          serverTime: Date.now(),
          videoState: {
            ...prevRefSnapshot,
            currentTime: 420,
            lastUpdated: Date.now(),
          },
        },
      },
      ctx
    );
    expect(currentState).toBe(prevRefSnapshot);

    // 2. Any VIDEO_STATE_UPDATED with action === 'sync_request' must be ignored completely
    dispatchRoomSocketEvent(
      {
        type: 'VIDEO_STATE_UPDATED',
        payload: {
          action: 'sync_request',
          videoState: {
            ...prevRefSnapshot,
            currentTime: 0,
            lastUpdated: Date.now(),
          },
        },
      },
      ctx
    );
    expect(currentState).toBe(prevRefSnapshot);
  });
});
