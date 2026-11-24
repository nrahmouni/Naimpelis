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
  gameId?: string;
}

interface GyroRoomMeta {
  gameId: string;
  updatedAt: number;
}

export interface ActiveGyroRoomSummary {
  roomId: string;
  gameId: string;
  controllersCount: number;
  hasP1: boolean;
  hasP2: boolean;
  displays: number;
  updatedAt: number;
}

const gyroPeersByRoom = new Map<string, Map<WebSocket, GyroPeerEntry>>();
const gyroRoomMeta = new Map<string, GyroRoomMeta>();

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

function pruneAndSummarizeGyroPeers(roomId: string, ctx?: RoomHubContext) {
  const peerMap = gyroPeersByRoom.get(roomId);
  const metaRec = gyroRoomMeta.get(roomId);
  if (!peerMap) {
    gyroRoomMeta.delete(roomId);
    return {
      roomId,
      gameId: metaRec?.gameId || 'racing3d',
      controllers: [] as Array<{ userId: string; deviceName: string; slot: 1 | 2 }>,
      displays: 0,
      hasController: false,
    };
  }
  const controllers: Array<{ userId: string; deviceName: string; slot: 1 | 2 }> = [];
  let displays = 0;

  for (const [peerWs, info] of peerMap.entries()) {
    const meta = ctx?.clients.get(peerWs);
    if (peerWs.readyState !== WebSocket.OPEN || (ctx && meta?.roomId !== roomId)) {
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
    gyroRoomMeta.delete(roomId);
  }

  return {
    roomId,
    gameId: gyroRoomMeta.get(roomId)?.gameId || 'racing3d',
    controllers,
    displays,
    hasController: controllers.length > 0,
  };
}

export function getLatestActiveGyroRoom(validRoomIds?: Set<string>): ActiveGyroRoomSummary | null {
  const candidates: ActiveGyroRoomSummary[] = [];

  for (const roomId of Array.from(gyroPeersByRoom.keys())) {
    if (validRoomIds && !validRoomIds.has(roomId)) continue;
    const summary = pruneAndSummarizeGyroPeers(roomId);
    if (summary.displays <= 0) continue;
    const metaRec = gyroRoomMeta.get(roomId);
    const hasP1 = summary.controllers.some((c) => c.slot === 1);
    const hasP2 = summary.controllers.some((c) => c.slot === 2);
    candidates.push({
      roomId,
      gameId: summary.gameId || metaRec?.gameId || 'racing3d',
      controllersCount: summary.controllers.length,
      hasP1,
      hasP2,
      displays: summary.displays,
      updatedAt: metaRec?.updatedAt || 0,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aNeedsCtrl = a.controllersCount < 2 ? 1 : 0;
    const bNeedsCtrl = b.controllersCount < 2 ? 1 : 0;
    if (aNeedsCtrl !== bNeedsCtrl) return bNeedsCtrl - aNeedsCtrl;
    return b.updatedAt - a.updatedAt;
  });

  return candidates[0];
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

    const { roomId, role, deviceName, preferredSlot, gameId } = parsed.data;
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

    if (role === 'display' || gameId) {
      const prevMeta = gyroRoomMeta.get(roomId);
      gyroRoomMeta.set(roomId, {
        gameId: gameId || prevMeta?.gameId || 'racing3d',
        updatedAt: Date.now(),
      });
    } else if (!gyroRoomMeta.has(roomId)) {
      gyroRoomMeta.set(roomId, {
        gameId: 'racing3d',
        updatedAt: Date.now(),
      });
    } else {
      const prevMeta = gyroRoomMeta.get(roomId)!;
      prevMeta.updatedAt = Date.now();
    }

    peerMap.set(ws, {
      role,
      deviceName: deviceName || (role === 'controller' ? 'Mando Móvil' : 'Pantalla TV'),
      userId: meta.userId || 'guest',
      slot: assignedSlot,
      joinedAt: existing?.joinedAt || Date.now(),
      gameId: gameId || existing?.gameId,
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
