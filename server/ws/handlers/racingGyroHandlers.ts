import { WebSocket } from 'ws';
import {
  wsGyroInputSchema,
  wsGyroJoinSchema,
  wsRacingTelemetrySchema,
} from '../wsSchemas.ts';
import type { RoomHubContext, WsMessageHandler } from './types.ts';

interface GyroPeerEntry {
  role: 'controller' | 'display';
  deviceName: string;
  userId: string;
  joinedAt: number;
}

const gyroPeersByRoom = new Map<string, Map<WebSocket, GyroPeerEntry>>();

function pruneAndSummarizeGyroPeers(roomId: string, ctx: RoomHubContext) {
  const peerMap = gyroPeersByRoom.get(roomId);
  if (!peerMap) {
    return {
      roomId,
      controllers: [] as Array<{ userId: string; deviceName: string }>,
      displays: 0,
      hasController: false,
    };
  }
  const controllers: Array<{ userId: string; deviceName: string }> = [];
  let displays = 0;

  for (const [peerWs, info] of peerMap.entries()) {
    const meta = ctx.clients.get(peerWs);
    if (peerWs.readyState !== WebSocket.OPEN || meta?.roomId !== roomId) {
      peerMap.delete(peerWs);
      continue;
    }
    if (info.role === 'controller') {
      controllers.push({ userId: info.userId, deviceName: info.deviceName });
    } else {
      displays += 1;
    }
  }

  if (peerMap.size === 0) {
    gyroPeersByRoom.delete(roomId);
  }

  return {
    roomId,
    controllers,
    displays,
    hasController: controllers.length > 0,
  };
}

export function cleanupRacingGyroPeer(ws: WebSocket, ctx: RoomHubContext): void {
  for (const [roomId, peerMap] of gyroPeersByRoom.entries()) {
    if (!peerMap.has(ws)) continue;
    peerMap.delete(ws);
    const summary = pruneAndSummarizeGyroPeers(roomId, ctx);
    ctx.broadcastToRoom(roomId, {
      type: 'GYRO_PEER_STATUS',
      payload: summary,
    });
  }
}

export const handleRacingGyroMessage: WsMessageHandler = (type, payload, ws, ctx) => {
  const { rooms, clients, broadcastToRoom } = ctx;

  if (type === 'GYRO_CONTROLLER_JOIN') {
    const parsed = wsGyroJoinSchema.safeParse(payload);
    if (!parsed.success) return true;

    const { roomId, role, deviceName } = parsed.data;
    const meta = clients.get(ws);
    if (!meta || meta.roomId !== roomId || !rooms.has(roomId)) {
      return true;
    }

    let peerMap = gyroPeersByRoom.get(roomId);
    if (!peerMap) {
      peerMap = new Map();
      gyroPeersByRoom.set(roomId, peerMap);
    }
    peerMap.set(ws, {
      role,
      deviceName: deviceName || (role === 'controller' ? 'Volante Móvil' : 'Pantalla TV'),
      userId: meta.userId || 'guest',
      joinedAt: Date.now(),
    });

    const summary = pruneAndSummarizeGyroPeers(roomId, ctx);
    broadcastToRoom(roomId, {
      type: 'GYRO_PEER_STATUS',
      payload: summary,
    });
    return true;
  }

  if (type === 'GYRO_INPUT_UPDATE') {
    const parsed = wsGyroInputSchema.safeParse(payload);
    if (!parsed.success) return true;

    const { roomId, ...input } = parsed.data;
    const meta = clients.get(ws);
    if (!meta || meta.roomId !== roomId || !rooms.has(roomId)) {
      return true;
    }

    broadcastToRoom(
      roomId,
      {
        type: 'GYRO_INPUT_RELAY',
        payload: {
          roomId,
          senderId: meta.userId || 'controller',
          ...input,
        },
      },
      ws
    );
    return true;
  }

  if (type === 'RACING_TV_TELEMETRY') {
    const parsed = wsRacingTelemetrySchema.safeParse(payload);
    if (!parsed.success) return true;

    const { roomId, ...telemetry } = parsed.data;
    const meta = clients.get(ws);
    if (!meta || meta.roomId !== roomId || !rooms.has(roomId)) {
      return true;
    }

    broadcastToRoom(
      roomId,
      {
        type: 'RACING_TELEMETRY_RELAY',
        payload: {
          roomId,
          ...telemetry,
        },
      },
      ws
    );
    return true;
  }

  return false;
};
