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
  slot?: 1 | 2;
  joinedAt: number;
}

const gyroPeersByRoom = new Map<string, Map<WebSocket, GyroPeerEntry>>();

function resolveAvailableControllerSlot(
  peerMap: Map<WebSocket, GyroPeerEntry>,
  excludeWs: WebSocket,
  preferredSlot?: 1 | 2
): 1 | 2 {
  let slot1Busy = false;
  let slot2Busy = false;
  for (const [peerWs, info] of peerMap.entries()) {
    if (peerWs === excludeWs || info.role !== 'controller') continue;
    if (peerWs.readyState !== WebSocket.OPEN) continue;
    if (info.slot === 1) slot1Busy = true;
    else if (info.slot === 2) slot2Busy = true;
  }
  if (preferredSlot === 1 && !slot1Busy) return 1;
  if (preferredSlot === 2 && !slot2Busy) return 2;
  if (!slot1Busy) return 1;
  if (!slot2Busy) return 2;
  return preferredSlot || 2;
}

function pruneAndSummarizeGyroPeers(roomId: string, ctx: RoomHubContext) {
  const peerMap = gyroPeersByRoom.get(roomId);
  if (!peerMap) {
    return {
      roomId,
      controllers: [] as Array<{ userId: string; deviceName: string; slot: 1 | 2 }>,
      displays: 0,
      hasController: false,
    };
  }
  const controllers: Array<{ userId: string; deviceName: string; slot: 1 | 2 }> = [];
  let displays = 0;

  for (const [peerWs, info] of peerMap.entries()) {
    const meta = ctx.clients.get(peerWs);
    if (peerWs.readyState !== WebSocket.OPEN || meta?.roomId !== roomId) {
      peerMap.delete(peerWs);
      continue;
    }
    if (info.role === 'controller') {
      const slot: 1 | 2 = info.slot === 2 ? 2 : 1;
      info.slot = slot;
      controllers.push({ userId: info.userId, deviceName: info.deviceName, slot });
    } else {
      displays += 1;
    }
  }

  controllers.sort((a, b) => a.slot - b.slot);

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

    const { roomId, role, deviceName, preferredSlot } = parsed.data;
    const meta = clients.get(ws);
    if (!meta || meta.roomId !== roomId || !rooms.has(roomId)) {
      return true;
    }

    let peerMap = gyroPeersByRoom.get(roomId);
    if (!peerMap) {
      peerMap = new Map();
      gyroPeersByRoom.set(roomId, peerMap);
    }

    const existing = peerMap.get(ws);
    const assignedSlot: 1 | 2 | undefined =
      role === 'controller'
        ? existing?.role === 'controller' && existing.slot && !preferredSlot
          ? existing.slot
          : resolveAvailableControllerSlot(peerMap, ws, preferredSlot)
        : undefined;

    peerMap.set(ws, {
      role,
      deviceName: deviceName || (role === 'controller' ? 'Mando Móvil' : 'Pantalla TV'),
      userId: meta.userId || 'guest',
      slot: assignedSlot,
      joinedAt: existing?.joinedAt || Date.now(),
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

    const peerMap = gyroPeersByRoom.get(roomId);
    const peerEntry = peerMap?.get(ws);
    const resolvedSlot: 1 | 2 = peerEntry?.slot || input.playerSlot || 1;

    broadcastToRoom(
      roomId,
      {
        type: 'GYRO_INPUT_RELAY',
        payload: {
          roomId,
          senderId: meta.userId || 'controller',
          playerSlot: resolvedSlot,
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
