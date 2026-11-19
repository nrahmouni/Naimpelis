import {
  assignParticipantRole,
  canUserChangeRoomMedia,
  canUserControlRoom,
  toggleQueueItemVote,
} from '../../services/roomSync.ts';
import {
  computeAuthoritativeVideoState,
  type RoomChatMessageRecord,
} from '../roomHubHelpers.ts';
import {
  wsPinChatSchema,
  wsPollStartSchema,
  wsQueueReorderSchema,
  wsSendChatSchema,
  wsTypingStateSchema,
} from '../wsSchemas.ts';
import type { WsMessageHandler } from './types.ts';

export const handleSyncAndChatMessage: WsMessageHandler = async (
  type,
  payload,
  ws,
  ctx
) => {
  const {
    rooms,
    cloudSessions,
    roomPollTimers,
    clients,
    schedulePersistRoom,
    serializeRoomForClient,
    broadcastToRoom,
    scheduleBroadcastOnlineUsers,
    finalizeRoomPoll,
    stopCloudSession,
    startCloudSession,
  } = ctx;

  if (type === 'SYNC_REQUEST') {
    const senderMeta = clients.get(ws);
    const roomId = String(payload?.roomId || senderMeta?.roomId || '')
      .trim()
      .toLowerCase();
    if (!roomId) return true;
    const room = rooms.get(roomId);
    if (!room) return true;
    ws.send(
      JSON.stringify({
        type: 'ROOM_STATE',
        payload: { ...serializeRoomForClient(room, senderMeta?.userId || ''), serverTime: Date.now() },
      })
    );
    return true;
  }

  if (type === 'SYNC_VIDEO_STATE') {
    const { roomId: rawRoomId, action, videoState: incomingState, updatedBy } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    if (!room || !incomingState) return true;

    const senderMeta = clients.get(ws);
    const isMediaChange =
      action === 'change_url' ||
      (typeof incomingState.url === 'string' && incomingState.url !== room.videoState.url);

    const isAuthorized = isMediaChange
      ? canUserChangeRoomMedia({
          creatorId: room.creatorId,
          hostId: room.hostId,
          userId: senderMeta?.userId,
          participants: room.participants,
        })
      : canUserControlRoom({
          hostOnlyControl: room.hostOnlyControl,
          creatorId: room.creatorId,
          hostId: room.hostId,
          userId: senderMeta?.userId,
          participants: room.participants,
        });

    if (!isAuthorized) {
      const hostMember = room.participants.find(
        (p) => p.id === (room.creatorId || room.hostId)
      );
      ws.send(
        JSON.stringify({
          type: 'HOST_LOCK_REJECTED',
          payload: {
            videoState: computeAuthoritativeVideoState(room),
            hostName: hostMember?.name || 'el anfitrión',
            reason: isMediaChange
              ? 'Solo el anfitrión o un Co-anfitrión puede cambiar de canal o película.'
              : undefined,
          },
        })
      );
      return true;
    }

    room.videoState = {
      ...room.videoState,
      ...incomingState,
      lastUpdated: Date.now(),
      updatedBy: String(updatedBy || senderMeta?.userName || 'Anfitrión'),
    };

    if (room.videoState.mode !== 'cloud') {
      await stopCloudSession(roomId);
    }

    let sysMsg: RoomChatMessageRecord | null = null;
    if (action === 'change_url') {
      sysMsg = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderId: 'system',
        senderName: 'RiffanTV',
        senderAvatar: '🎬',
        senderColor: '#e11d48',
        text: `${room.videoState.updatedBy} puso "${room.videoState.title}"`,
        timestamp: Date.now(),
        isSystem: true,
        systemType: 'video_change',
      };
      room.messages.push(sysMsg);
      if (room.messages.length > 150) room.messages.shift();
    }

    schedulePersistRoom(roomId);

    broadcastToRoom(
      roomId,
      {
        type: 'VIDEO_STATE_UPDATED',
        payload: {
          videoState: room.videoState,
          action,
          message: sysMsg,
        },
      },
      action === 'play' || action === 'pause' || action === 'seek' ? ws : undefined
    );
    if (action === 'change_url') {
      scheduleBroadcastOnlineUsers();
    }
    return true;
  }

  if (type === 'QUEUE_ADD') {
    const { roomId: rawRoomId, item } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    if (!room || !item || typeof item.id !== 'string') return true;
    room.queue = [...room.queue, item].slice(0, 30);
    const sysMsg: RoomChatMessageRecord = {
      id: `qmsg-${Date.now()}`,
      senderId: 'system',
      senderName: 'RiffanTV',
      senderAvatar: '➕',
      senderColor: '#f59e0b',
      text: `${item.addedBy || 'Un amigo'} añadió "${item.title}" a la cola`,
      timestamp: Date.now(),
      isSystem: true,
    };
    room.messages.push(sysMsg);
    schedulePersistRoom(roomId);
    broadcastToRoom(roomId, {
      type: 'QUEUE_UPDATED',
      payload: { queue: room.queue, message: sysMsg },
    });
    return true;
  }

  if (type === 'QUEUE_REMOVE') {
    const { roomId: rawRoomId, itemId } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room || !itemId) return true;
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
    room.queue = room.queue.filter((q) => q.id !== itemId);
    schedulePersistRoom(roomId);
    broadcastToRoom(roomId, {
      type: 'QUEUE_UPDATED',
      payload: { queue: room.queue },
    });
    return true;
  }

  if (type === 'QUEUE_PROMOTE') {
    const { roomId: rawRoomId, itemId } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room || !itemId) return true;
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
    const target = room.queue.find((q) => q.id === itemId);
    if (!target) return true;
    room.queue = [target, ...room.queue.filter((q) => q.id !== itemId)];
    schedulePersistRoom(roomId);
    broadcastToRoom(roomId, {
      type: 'QUEUE_UPDATED',
      payload: { queue: room.queue },
    });
    return true;
  }

  if (type === 'QUEUE_REORDER') {
    const valid = wsQueueReorderSchema.safeParse(payload);
    if (!valid.success) return true;
    const { roomId: rawRoomId, itemId, direction, targetIndex } = valid.data;
    const roomId = rawRoomId.toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room) return true;
    if (
      !canUserControlRoom({
        hostOnlyControl: true,
        hostId: room.hostId,
        userId: senderMeta?.userId,
        participants: room.participants,
      })
    ) {
      return true;
    }
    const curIdx = room.queue.findIndex((q) => q.id === itemId);
    if (curIdx === -1) return true;
    let nextIdx = curIdx;
    if (typeof targetIndex === 'number') {
      nextIdx = Math.max(0, Math.min(room.queue.length - 1, targetIndex));
    } else if (direction === 'up') {
      nextIdx = Math.max(0, curIdx - 1);
    } else if (direction === 'down') {
      nextIdx = Math.min(room.queue.length - 1, curIdx + 1);
    }
    if (nextIdx === curIdx) return true;
    const nextQueue = [...room.queue];
    const [moved] = nextQueue.splice(curIdx, 1);
    nextQueue.splice(nextIdx, 0, moved);
    room.queue = nextQueue;
    schedulePersistRoom(roomId);
    broadcastToRoom(roomId, {
      type: 'QUEUE_UPDATED',
      payload: { queue: room.queue },
    });
    return true;
  }

  if (type === 'QUEUE_VOTE') {
    const { roomId: rawRoomId, itemId, userId } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    const voterId = senderMeta?.userId || userId;
    if (!room || !itemId || !voterId) return true;
    room.queue = toggleQueueItemVote(room.queue, String(itemId), String(voterId));
    schedulePersistRoom(roomId);
    broadcastToRoom(roomId, {
      type: 'QUEUE_UPDATED',
      payload: { queue: room.queue },
    });
    return true;
  }

  if (type === 'SET_PARTICIPANT_ROLE') {
    const { roomId: rawRoomId, targetUserId, role } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    const effectiveCreatorId = room?.creatorId || room?.hostId;
    if (!room || !senderMeta?.userId || senderMeta.userId !== effectiveCreatorId) return true;
    const cleanTargetId = String(targetUserId || '').trim();
    if (!cleanTargetId || cleanTargetId === effectiveCreatorId) return true;
    if (role !== 'mod' && role !== 'viewer') return true;

    room.participants = assignParticipantRole(
      room.participants as never,
      cleanTargetId,
      role
    );
    const prevCoHosts = Array.isArray(room.coHostIds) ? room.coHostIds : [];
    room.coHostIds =
      role === 'mod'
        ? Array.from(new Set([...prevCoHosts, cleanTargetId]))
        : prevCoHosts.filter((id) => id !== cleanTargetId);

    const targetMember = room.participants.find((p) => p.id === cleanTargetId);
    const sysMsg: RoomChatMessageRecord = {
      id: `cohost-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: 'system',
      senderName: 'RiffanTV',
      senderAvatar: role === 'mod' ? '🛡️' : '👤',
      senderColor: role === 'mod' ? '#10b981' : '#71717a',
      text:
        role === 'mod'
          ? `${senderMeta.userName || 'El anfitrión'} asignó a ${targetMember?.name || 'un participante'} como Co-anfitrión (puede cambiar canales y películas)`
          : `${senderMeta.userName || 'El anfitrión'} retiró el permiso de Co-anfitrión a ${targetMember?.name || 'un participante'}`,
      timestamp: Date.now(),
      isSystem: true,
      systemType: 'host_change',
    };
    room.messages.push(sysMsg);
    if (room.messages.length > 150) room.messages.shift();
    schedulePersistRoom(roomId);

    broadcastToRoom(roomId, {
      type: 'PARTICIPANTS_UPDATED',
      payload: { participants: room.participants, hostId: room.hostId, message: sysMsg },
    });
    return true;
  }

  if (type === 'TYPING_STATE') {
    const valid = wsTypingStateSchema.safeParse(payload);
    if (!valid.success) return true;
    const senderMeta = clients.get(ws);
    const roomId = valid.data.roomId.toLowerCase();
    const uid = senderMeta?.userId || valid.data.userId;
    const room = rooms.get(roomId);
    if (!room || !uid) return true;
    broadcastToRoom(
      roomId,
      {
        type: 'TYPING_UPDATED',
        payload: {
          userId: uid,
          userName: senderMeta?.userName || valid.data.userName || 'Amigo',
          isTyping: Boolean(valid.data.isTyping),
        },
      },
      ws
    );
    return true;
  }

  if (type === 'SEND_CHAT') {
    const valid = wsSendChatSchema.safeParse(payload);
    if (!valid.success) return true;
    const roomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(roomId);
    if (!room) return true;

    const senderMeta = clients.get(ws);
    const msg: RoomChatMessageRecord = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: senderMeta?.userId || valid.data.user?.id || 'anon',
      senderName: senderMeta?.userName || valid.data.user?.name || 'Invitado',
      senderAvatar: senderMeta?.userAvatar || valid.data.user?.avatar || '🍿',
      senderColor: senderMeta?.userColor || valid.data.user?.color || '#e11d48',
      text: valid.data.text,
      timestamp: Date.now(),
    };

    room.messages.push(msg);
    if (room.messages.length > 150) room.messages.shift();
    schedulePersistRoom(roomId);
    broadcastToRoom(roomId, { type: 'NEW_CHAT_MESSAGE', payload: msg });
    return true;
  }

  if (type === 'PIN_CHAT_MESSAGE' || type === 'UNPIN_CHAT_MESSAGE') {
    const valid = wsPinChatSchema.safeParse(payload);
    if (!valid.success) return true;
    const roomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room) return true;
    if (
      !canUserControlRoom({
        hostOnlyControl: true,
        hostId: room.hostId,
        userId: senderMeta?.userId,
        participants: room.participants,
      })
    ) {
      return true;
    }

    if (type === 'UNPIN_CHAT_MESSAGE' || !valid.data.messageId) {
      room.pinnedMessage = null;
    } else {
      const targetMsg = room.messages.find((m) => m.id === valid.data.messageId);
      if (!targetMsg) return true;
      room.pinnedMessage = targetMsg;
    }

    schedulePersistRoom(roomId);
    broadcastToRoom(roomId, {
      type: 'PINNED_MESSAGE_UPDATED',
      payload: { pinnedMessage: room.pinnedMessage ?? null },
    });
    return true;
  }

  if (type === 'SEND_REACTION') {
    const { roomId: rawRoomId, emoji, user } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    if (!rooms.has(roomId) || typeof emoji !== 'string' || !emoji) return true;
    const senderMeta = clients.get(ws);
    broadcastToRoom(roomId, {
      type: 'FLOATING_REACTION',
      payload: {
        id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        emoji: emoji.slice(0, 16),
        senderName: senderMeta?.userName || user?.name || 'Invitado',
        senderColor: senderMeta?.userColor || user?.color || '#e11d48',
        xOffset: 12 + Math.floor(Math.random() * 76),
        timestamp: Date.now(),
      },
    });
    return true;
  }

  if (type === 'TRANSFER_HOST') {
    const { roomId: rawRoomId } = payload || {};
    const roomId = String(rawRoomId || '').trim().toLowerCase();
    const room = rooms.get(roomId);
    const hostMember = room?.participants.find(
      (p) => p.id === (room.creatorId || room.hostId)
    );
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
      const hostMember = room.participants.find(
        (p) => p.id === (room.creatorId || room.hostId)
      );
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
