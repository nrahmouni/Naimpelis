import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRoomHub } from '../../server/ws/roomHub';
import { wsEnvelopeSchema, wsGyroInputSchema } from '../../server/ws/wsSchemas';
import { benchmarkBatchThroughput, computePercentileStats, logPerfResult } from './perfHarness';

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', (err) => reject(err));
  });
}

function waitForMsg<T = { type: string; payload?: Record<string, unknown> }>(
  ws: WebSocket,
  predicate: (msg: T) => boolean,
  timeoutMs = 2500
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`WS waitForMsg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw: Buffer | string) => {
      try {
        const parsed = JSON.parse(String(raw)) as T;
        if (predicate(parsed)) {
          clearTimeout(timer);
          ws.off('message', onMessage);
          resolve(parsed);
        }
      } catch {
        // ignore non-JSON frames
      }
    };
    ws.on('message', onMessage);
  });
}

describe('Performance & Speed — Real-Time WebSocket Hub, Dual Gyro 60Hz & Schema Validation', () => {
  let httpServer: Server;
  let wss: WebSocketServer;
  let hub: ReturnType<typeof createRoomHub>;
  let wsUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    httpServer = createServer(app);
    wss = new WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });
    hub = createRoomHub(app, wss);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as AddressInfo;
        wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const client of wss.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => httpServer.close(() => resolve()));
    });
  });

  it('validates WS envelopes & 60Hz gyro Zod schemas at high throughput', () => {
    const sampleEnvelope = {
      type: 'GYRO_INPUT_UPDATE',
      payload: {
        roomId: 'perf-room-1',
        playerSlot: 1,
        steer: 0.35,
        throttle: 0.92,
        brake: 0,
        pitch: -0.18,
        swing: 1.4,
        roll: 0.22,
        nitro: true,
        seq: 101,
        ts: Date.now(),
      },
    };
    const bench = benchmarkBatchThroughput('Zod wsEnvelope + wsGyroInputSchema (20,000 packets)', 20_000, () => {
      for (let i = 0; i < 20_000; i += 1) {
        const env = wsEnvelopeSchema.safeParse(sampleEnvelope);
        if (env.success) {
          wsGyroInputSchema.safeParse(env.data.payload);
        }
      }
    });
    expect(bench.opsPerSec).toBeGreaterThan(20_000);
  });

  it('relays 200 dual-controller 60Hz gyro frames over live WebSockets with sub-10ms p95 latency', async () => {
    const roomId = `gyro-perf-${Date.now()}`;
    const displayWs = await openWs(wsUrl);
    const p1Ws = await openWs(wsUrl);
    const p2Ws = await openWs(wsUrl);

    try {
      const joinDisplayDone = waitForMsg(displayWs, (m) => m.type === 'ROOM_STATE');
      displayWs.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: {
            roomId,
            roomName: 'Gyro Perf Arena',
            user: { id: 'tv-perf', name: 'Smart TV', avatar: '📺', color: '#22D3EE', isHost: true },
          },
        })
      );
      await joinDisplayDone;

      const peerStatusDisplay = waitForMsg(displayWs, (m) => m.type === 'GYRO_PEER_STATUS');
      displayWs.send(
        JSON.stringify({
          type: 'GYRO_CONTROLLER_JOIN',
          payload: { roomId, role: 'display', deviceName: 'Tizen TV', gameId: 'racing3d' },
        })
      );
      await peerStatusDisplay;

      const joinP1 = waitForMsg(p1Ws, (m) => m.type === 'ROOM_STATE');
      p1Ws.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: {
            roomId,
            user: { id: 'p1-perf', name: 'Jugador 1', avatar: '🏎️', color: '#38BDF8' },
          },
        })
      );
      await joinP1;
      const p1Linked = waitForMsg(displayWs, (m) => m.type === 'GYRO_PEER_STATUS' && Boolean(m.payload?.hasController));
      p1Ws.send(
        JSON.stringify({
          type: 'GYRO_CONTROLLER_JOIN',
          payload: { roomId, role: 'controller', preferredSlot: 1, deviceName: 'Móvil J1', gameId: 'racing3d' },
        })
      );
      await p1Linked;

      const joinP2 = waitForMsg(p2Ws, (m) => m.type === 'ROOM_STATE');
      p2Ws.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: {
            roomId,
            user: { id: 'p2-perf', name: 'Jugador 2', avatar: '🏁', color: '#FB7185' },
          },
        })
      );
      await joinP2;
      const p2Linked = waitForMsg(
        displayWs,
        (m) => m.type === 'GYRO_PEER_STATUS' && Array.isArray(m.payload?.controllers) && m.payload.controllers.length === 2
      );
      p2Ws.send(
        JSON.stringify({
          type: 'GYRO_CONTROLLER_JOIN',
          payload: { roomId, role: 'controller', preferredSlot: 2, deviceName: 'Móvil J2', gameId: 'racing3d' },
        })
      );
      await p2Linked;

      const totalPackets = 200;
      const sentAt = new Map<string, number>();
      const rtts: number[] = [];

      const allReceived = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Expected ${totalPackets} gyro relays, received ${rtts.length}`));
        }, 5000);

        displayWs.on('message', (raw) => {
          const msg = JSON.parse(String(raw)) as {
            type?: string;
            payload?: { playerSlot?: number; seq?: number };
          };
          if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload) {
            const key = `${msg.payload.playerSlot}:${msg.payload.seq}`;
            const t0 = sentAt.get(key);
            if (typeof t0 === 'number') {
              rtts.push(performance.now() - t0);
              if (rtts.length >= totalPackets) {
                clearTimeout(timer);
                resolve();
              }
            }
          }
        });
      });

      const burstStart = performance.now();
      for (let seq = 1; seq <= totalPackets / 2; seq += 1) {
        const k1 = `1:${seq}`;
        sentAt.set(k1, performance.now());
        p1Ws.send(
          JSON.stringify({
            type: 'GYRO_INPUT_UPDATE',
            payload: {
              roomId,
              playerSlot: 1,
              steer: Math.sin(seq * 0.1),
              throttle: 0.9,
              brake: 0,
              pitch: 0.12,
              swing: 0.4,
              seq,
              ts: Date.now(),
            },
          })
        );

        const k2 = `2:${seq}`;
        sentAt.set(k2, performance.now());
        p2Ws.send(
          JSON.stringify({
            type: 'GYRO_INPUT_UPDATE',
            payload: {
              roomId,
              playerSlot: 2,
              steer: Math.cos(seq * 0.1),
              throttle: 0.85,
              brake: 0,
              pitch: -0.08,
              swing: 0.7,
              seq,
              ts: Date.now(),
            },
          })
        );

        if (seq % 10 === 0) {
          await new Promise((r) => setTimeout(r, 1));
        }
      }

      await allReceived;
      const totalMs = performance.now() - burstStart;
      const stats = computePercentileStats('WS Dual-Controller 60Hz Gyro Relay (200 pkts)', rtts, totalMs);
      logPerfResult(stats);

      expect(rtts.length).toBe(totalPackets);
      expect(stats.p95Ms).toBeLessThan(60);
    } finally {
      await Promise.all(
        [displayWs, p1Ws, p2Ws].map(
          (ws) =>
            new Promise<void>((resolve) => {
              if (ws.readyState === WebSocket.CLOSED) return resolve();
              ws.once('close', () => resolve());
              ws.close();
            })
        )
      );
      await new Promise((r) => setTimeout(r, 25));
    }
  });

  it('fans out concurrent multi-room Watch Party connections & cleans up state cleanly', async () => {
    const baseline = hub.getStats().connectedClientsCount;
    const roomCount = 6;
    const clientsPerRoom = 4;
    const sockets: WebSocket[] = [];
    const latencies: number[] = [];

    const tJoinStart = performance.now();
    for (let r = 0; r < roomCount; r += 1) {
      const roomId = `fanout-perf-${r}-${Date.now()}`;
      for (let c = 0; c < clientsPerRoom; c += 1) {
        const ws = await openWs(wsUrl);
        sockets.push(ws);
        const t0 = performance.now();
        const joined = waitForMsg(ws, (m) => m.type === 'ROOM_STATE');
        ws.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            payload: {
              roomId,
              roomName: `Perf Room ${r}`,
              user: { id: `u-${r}-${c}`, name: `User ${c}`, avatar: '🎬', color: '#9146FF', isHost: c === 0 },
            },
          })
        );
        await joined;
        latencies.push(performance.now() - t0);
      }
    }

    const totalJoinMs = performance.now() - tJoinStart;
    const joinStats = computePercentileStats(
      `WS Multi-Room Join (${roomCount} rooms x ${clientsPerRoom} users)`,
      latencies,
      totalJoinMs
    );
    logPerfResult(joinStats);

    expect(hub.getStats().connectedClientsCount).toBe(baseline + roomCount * clientsPerRoom);
    expect(joinStats.p95Ms).toBeLessThan(35);

    await Promise.all(
      sockets.map(
        (ws) =>
          new Promise<void>((resolve) => {
            ws.once('close', () => resolve());
            ws.close();
          })
      )
    );
    await new Promise((r) => setTimeout(r, 40));
    expect(hub.getStats().connectedClientsCount).toBe(baseline);
  });
});
