import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';

interface WSMessage {
  type: string;
  payload: any;
}

const SERVER_WS_URL = 'ws://127.0.0.1:3000/ws';

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_WS_URL);
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

describe('F0.3 Critical Characterization Suite: Room Lifecycle & Playback Sync', () => {
  it('creates room, joins participants, synchronizes video playback state, exchanges chat and reactions', async () => {
    const roomId = `char-room-${Date.now()}`;
    const userA = { id: `user-a-${Date.now()}`, name: 'Alice (Host)', avatar: '🎬', color: '#E11D48' };
    const userB = { id: `user-b-${Date.now()}`, name: 'Bob (Guest)', avatar: '🍿', color: '#0284C7' };

    // 1. User A connects & joins as host
    const wsA = await connectWs();
    const joinAPromise = waitForMessage(wsA, 'ROOM_STATE');
    wsA.send(JSON.stringify({
      type: 'JOIN_ROOM',
      payload: { roomId, roomName: 'Sala Alice', user: userA },
    }));
    const roomStateA = await joinAPromise;
    expect(roomStateA.payload).toBeDefined();
    expect(roomStateA.payload.id).toBe(roomId);
    expect(roomStateA.payload.hostId).toBe(userA.id);

    // 2. User B connects & joins
    const wsB = await connectWs();
    const joinBPromise = waitForMessage(wsB, 'ROOM_STATE');
    const userASeesBPromise = waitForMessage(wsA, 'PARTICIPANTS_UPDATED');
    wsB.send(JSON.stringify({
      type: 'JOIN_ROOM',
      payload: { roomId, roomName: 'Sala Alice', user: userB },
    }));

    const roomStateB = await joinBPromise;
    expect(roomStateB.payload.id).toBe(roomId);
    const joinedEventOnA = await userASeesBPromise;
    expect(joinedEventOnA.payload.participants.some((p: any) => p.id === userB.id)).toBe(true);

    // 3. User A updates video state (PLAY)
    const bReceivesSyncPromise = waitForMessage(wsB, 'VIDEO_STATE_UPDATED');
    wsA.send(JSON.stringify({
      type: 'SYNC_VIDEO_STATE',
      payload: {
        roomId,
        action: 'play',
        updatedBy: userA.name,
        videoState: {
          url: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
          playing: true,
          currentTime: 42.5,
          mediaType: 'movie',
          title: 'Película de Prueba',
        },
      },
    }));

    const syncOnB = await bReceivesSyncPromise;
    expect(syncOnB.payload.videoState.playing).toBe(true);
    expect(syncOnB.payload.videoState.currentTime).toBe(42.5);
    expect(syncOnB.payload.action).toBe('play');

    // 4. Chat exchange
    const aReceivesChatPromise = waitForMessage(wsA, 'NEW_CHAT_MESSAGE');
    wsB.send(JSON.stringify({
      type: 'SEND_CHAT',
      payload: {
        roomId,
        text: '¡Hola Alice, se ve genial!',
        user: userB,
      },
    }));

    const chatOnA = await aReceivesChatPromise;
    expect(chatOnA.payload.text).toBe('¡Hola Alice, se ve genial!');
    expect(chatOnA.payload.senderId).toBe(userB.id);

    // 5. Reaction exchange
    const aReceivesReactionPromise = waitForMessage(wsA, 'FLOATING_REACTION');
    wsB.send(JSON.stringify({
      type: 'SEND_REACTION',
      payload: {
        roomId,
        emoji: '🔥',
        user: userB,
      },
    }));
    const reactionOnA = await aReceivesReactionPromise;
    expect(reactionOnA.payload.emoji).toBe('🔥');

    // Cleanup
    wsA.close();
    wsB.close();
  });
});
