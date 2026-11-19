import { canUserChangeRoomMedia } from '../../services/roomSync.ts';
import { computeAuthoritativeVideoState, type RoomChatMessageRecord } from '../roomHubHelpers.ts';
import { wsPollStartSchema } from '../wsSchemas.ts';
import type { WsMessageHandler } from './types.ts';

export const handleRoomCloudAndPollMessage: WsMessageHandler = async (type, payload, ws, ctx) => {
  const {
    rooms,
    cloudSessions,
    roomPollTimers,
    clients,
    schedulePersistRoom,
    broadcastToRoom,
    scheduleBroadcastOnlineUsers,
    finalizeRoomPoll,
    stopCloudSession,
    startCloudSession,
  } = ctx;

  if (type === 'TRANSFER_HOST') {
    const roomId = String(payload?.roomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const hostMember = room?.participants.find((p) => p.id === (room.creatorId || room.hostId));
    ws.send(
      JSON.stringify({
        type: 'HOST_LOCK_REJECTED',
        payload: {
          videoState: room ? computeAuthoritativeVideoState(room) : undefined,
          hostName: hostMember?.name || 'el creador',
          reason:
            'Solo el creador de la sala puede ser anfitrión. Asigna a un participante como Co-anfitrión para compartir el control.',
        },
      })
    );
    return true;
  }

  if (type === 'UPDATE_PROFILE') {
    const { roomId: rawRoomId, userId, userName, userAvatar, userColor } = payload || {};
    const currentMeta = clients.get(ws);
    const effectiveUid = currentMeta?.userId || userId;
    if (currentMeta && effectiveUid) {
      if (userName) currentMeta.userName = String(userName).slice(0, 40);
      if (userAvatar) currentMeta.userAvatar = String(userAvatar).slice(0, 16);
      if (userColor) currentMeta.userColor = String(userColor).slice(0, 16);
      currentMeta.lastSeen = Date.now();
      scheduleBroadcastOnlineUsers();
    }
    const roomId = String(rawRoomId || currentMeta?.roomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    if (!room) return true;
    const member = room.participants.find((p) => p.id === effectiveUid);
    if (member) {
      if (userName) member.name = String(userName).slice(0, 40);
      if (userAvatar) member.avatar = String(userAvatar).slice(0, 16);
      if (userColor) member.color = String(userColor).slice(0, 16);
      broadcastToRoom(roomId, {
        type: 'PARTICIPANTS_UPDATED',
        payload: { participants: room.participants, hostId: room.hostId },
      });
    }
    return true;
  }

  if (type === 'WEBRTC_SIGNAL') {
    const { roomId: rawRoomId, signalData, targetId, senderId } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    if (!roomId) return true;
    broadcastToRoom(roomId, { type: 'WEBRTC_SIGNAL', payload: { signalData, targetId, senderId } }, ws);
    return true;
  }

  if (type === 'CLOUD_BROWSER_START') {
    const { roomId: rawRoomId, url, updatedBy } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    if (!room || typeof url !== 'string' || !url) return true;

    const senderMeta = clients.get(ws);
    if (
      !canUserChangeRoomMedia({
        creatorId: room.creatorId,
        hostId: room.hostId,
        userId: senderMeta?.userId,
        participants: room.participants,
      })
    ) {
      const hostMember = room.participants.find((p) => p.id === (room.creatorId || room.hostId));
      ws.send(
        JSON.stringify({
          type: 'HOST_LOCK_REJECTED',
          payload: {
            videoState: computeAuthoritativeVideoState(room),
            hostName: hostMember?.name || 'el anfitrión',
            reason: 'Solo el anfitrión o un Co-anfitrión puede abrir enlaces o canales.',
          },
        })
      );
      return true;
    }

    room.videoState = {
      mode: 'cloud',
      url,
      rawSourceUrl: url,
      title: `Navegador remoto · ${url}`,
      subtitle: 'Sesión web aislada sin ventanas emergentes',
      currentTime: 0,
      isPlaying: true,
      isLive: true,
      tracks: [],
      activeTrackIndex: 0,
      lastUpdated: Date.now(),
      updatedBy: String(updatedBy || senderMeta?.userName || 'Anfitrión'),
    };

    broadcastToRoom(roomId, {
      type: 'VIDEO_STATE_UPDATED',
      payload: { videoState: room.videoState, action: 'change_url' },
    });

    await startCloudSession(roomId, url);
    return true;
  }

  if (type === 'CLOUD_BROWSER_INPUT') {
    const { roomId: rawRoomId, input } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const session = cloudSessions.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room || !session || session.closed || !input) return true;
    if (
      !canUserChangeRoomMedia({
        creatorId: room.creatorId,
        hostId: room.hostId,
        userId: senderMeta?.userId,
        participants: room.participants,
      })
    ) {
      return true;
    }

    try {
      if (input.type === 'navigate' && typeof input.url === 'string') {
        await startCloudSession(roomId, input.url);
      } else if (input.type === 'reload') {
        await startCloudSession(roomId, session.url);
      }
    } catch {
      // ignore
    }
    return true;
  }

  if (type === 'CLOUD_BROWSER_STOP') {
    const roomId = String(payload?.roomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (
      room &&
      !canUserChangeRoomMedia({
        creatorId: room.creatorId,
        hostId: room.hostId,
        userId: senderMeta?.userId,
        participants: room.participants,
      })
    ) {
      return true;
    }
    await stopCloudSession(roomId);
    return true;
  }

  if (type === 'SET_HOST_LOCK') {
    const { roomId: rawRoomId, hostOnlyControl } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return true;

    room.hostOnlyControl = Boolean(hostOnlyControl);
    const sysMsg: RoomChatMessageRecord = {
      id: `lock-${Date.now()}`,
      senderId: 'system',
      senderName: 'RiffanTV',
      senderAvatar: room.hostOnlyControl ? '🔒' : '🔓',
      senderColor: '#f59e0b',
      text: room.hostOnlyControl
        ? `${senderMeta.userName || 'El anfitrión'} activó el Modo Cineasta (solo el anfitrión controla el reproductor)`
        : `${senderMeta.userName || 'El anfitrión'} permitió control compartido en la sala`,
      timestamp: Date.now(),
      isSystem: true,
      systemType: 'lock',
    };
    room.messages.push(sysMsg);
    if (room.messages.length > 150) room.messages.shift();
    schedulePersistRoom(roomId);

    broadcastToRoom(roomId, {
      type: 'HOST_LOCK_UPDATED',
      payload: {
        hostOnlyControl: room.hostOnlyControl,
        message: sysMsg,
      },
    });
    return true;
  }

  if (type === 'POLL_START') {
    const valid = wsPollStartSchema.safeParse(payload);
    if (!valid.success) return true;
    const { roomId: rawRoomId, question, options, durationSec } = valid.data;
    const roomId = rawRoomId.toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room) return true;
    if (
      !canUserChangeRoomMedia({
        creatorId: room.creatorId,
        hostId: room.hostId,
        userId: senderMeta?.userId,
        participants: room.participants,
      })
    ) {
      return true;
    }

    const existingTimer = roomPollTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      roomPollTimers.delete(roomId);
    }

    const clampedSec = Math.max(12, Math.min(90, Number(durationSec) || 25));
    const now = Date.now();
    const pollId = `poll-${now}-${Math.random().toString(36).slice(2, 6)}`;
    room.activePoll = {
      id: pollId,
      question: question.slice(0, 100),
      createdBy: senderMeta?.userName || 'Anfitrión',
      createdAt: now,
      endsAt: now + clampedSec * 1000,
      isClosed: false,
      options: options.slice(0, 5).map((item, idx) => ({
        id: `opt-${idx + 1}`,
        item: item as Record<string, unknown>,
        voterIds: [],
      })),
    };

    const sysMsg: RoomChatMessageRecord = {
      id: `poll-start-${now}`,
      senderId: 'system',
      senderName: 'RiffanTV',
      senderAvatar: '🗳️',
      senderColor: '#38bdf8',
      text: `${room.activePoll.createdBy} inició una votación en vivo (${clampedSec}s)`,
      timestamp: now,
      isSystem: true,
      systemType: 'poll',
    };
    room.messages.push(sysMsg);
    if (room.messages.length > 150) room.messages.shift();

    const t = setTimeout(() => {
      finalizeRoomPoll(roomId, pollId);
    }, clampedSec * 1000);
    roomPollTimers.set(roomId, t);

    broadcastToRoom(roomId, {
      type: 'POLL_UPDATED',
      payload: {
        poll: room.activePoll,
        justFinished: false,
        message: sysMsg,
      },
    });
    return true;
  }

  if (type === 'POLL_VOTE') {
    const { roomId: rawRoomId, pollId, optionId } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (
      !room ||
      !room.activePoll ||
      room.activePoll.id !== pollId ||
      room.activePoll.isClosed ||
      !senderMeta?.userId
    ) {
      return true;
    }

    const voterId = senderMeta.userId;
    for (const opt of room.activePoll.options) {
      opt.voterIds = opt.voterIds.filter((id) => id !== voterId);
      if (opt.id === optionId) {
        opt.voterIds.push(voterId);
      }
    }

    broadcastToRoom(roomId, {
      type: 'POLL_UPDATED',
      payload: {
        poll: room.activePoll,
        justFinished: false,
      },
    });
    return true;
  }

  if (type === 'POLL_CLOSE') {
    const { roomId: rawRoomId, pollId } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room || !room.activePoll || room.activePoll.id !== pollId) return true;
    if (
      !canUserChangeRoomMedia({
        creatorId: room.creatorId,
        hostId: room.hostId,
        userId: senderMeta?.userId,
        participants: room.participants,
      })
    ) {
      return true;
    }
    finalizeRoomPoll(roomId, String(pollId));
    return true;
  }

  if (type === 'SET_ROOM_PIN') {
    const { roomId: rawRoomId, pinCode } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return true;

    const cleanPin = typeof pinCode === 'string' ? pinCode.trim() : '';
    if (cleanPin && !/^[0-9]{4}$/.test(cleanPin)) return true;

    room.pinCode = cleanPin || undefined;
    schedulePersistRoom(roomId);

    const sysMsg: RoomChatMessageRecord = {
      id: `pin-${Date.now()}`,
      senderId: 'system',
      senderName: 'RiffanTV',
      senderAvatar: room.pinCode ? '🔐' : '🔓',
      senderColor: '#f59e0b',
      text: room.pinCode
        ? `${senderMeta.userName || 'El anfitrión'} protegió la sala con un PIN privado de 4 dígitos`
        : `${senderMeta.userName || 'El anfitrión'} quitó el PIN de la sala (acceso libre con enlace)`,
      timestamp: Date.now(),
      isSystem: true,
      systemType: 'lock',
    };
    room.messages.push(sysMsg);
    if (room.messages.length > 150) room.messages.shift();

    broadcastToRoom(roomId, {
      type: 'ROOM_PIN_UPDATED',
      payload: {
        hasPin: Boolean(room.pinCode),
        message: sysMsg,
      },
    });
    return true;
  }

  if (type === 'RENAME_ROOM') {
    const { roomId: rawRoomId, roomName } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return true;
    const cleanName = typeof roomName === 'string' ? roomName.trim().slice(0, 60) : '';
    if (!cleanName) return true;

    room.name = cleanName;
    schedulePersistRoom(roomId);
    broadcastToRoom(roomId, {
      type: 'ROOM_RENAMED',
      payload: { roomName: room.name },
    });
    return true;
  }

  return false;
};
