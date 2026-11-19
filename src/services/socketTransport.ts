import {
  Participant,
  RoomRole,
  TvRemoteCommandType,
  VideoState,
} from '../types';
import type { VoiceSignalPayload } from '../shared/protocol';
import { auth } from '../firebase';
import {
  type ConnectRoomOptions,
  type Listener,
  NON_QUEUEABLE_TYPES,
  type SocketEvent,
} from './socketTypes';

export class SocketTransport {
  protected ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  protected roomId = '';
  protected roomName = '';
  protected user: Participant | null = null;
  protected connectOptions: ConnectRoomOptions = {};
  private reconnectAttempts = 0;
  private hasConnectedOnce = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingMessages: Array<{ type: string; payload: unknown }> = [];
  private intentionalClose = false;
  public latencyMs = 24;
  public serverClockOffsetMs = 0;

  protected async resolveFirebaseIdToken(): Promise<string | undefined> {
    try {
      const current = auth?.currentUser;
      if (!current) return undefined;
      const token = await current.getIdToken();
      return token || undefined;
    } catch {
      return undefined;
    }
  }

  private flushPendingMessages() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const queued = this.pendingMessages.splice(0, 20);
    for (const item of queued) {
      try {
        this.ws.send(JSON.stringify(item));
      } catch {
        // ignore dropped message
      }
    }
  }

  connect(
    roomId: string,
    user: Participant,
    roomName?: string,
    options?: ConnectRoomOptions
  ) {
    this.intentionalClose = false;
    this.roomId = roomId.trim().toLowerCase();
    this.roomName = roomName || `Sala ${this.roomId.toUpperCase()}`;
    this.user = user;
    if (options) {
      this.connectOptions = options;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = async () => {
        const wasReconnect = this.hasConnectedOnce && this.reconnectAttempts > 0;
        this.hasConnectedOnce = true;
        this.reconnectAttempts = 0;
        const firebaseIdToken = await this.resolveFirebaseIdToken();
        if (!this.ws || this.ws !== socket || socket.readyState !== WebSocket.OPEN) return;

        if (this.roomId) {
          this.sendRaw('JOIN_ROOM', {
            roomId: this.roomId,
            roomName: this.roomName,
            user: this.user,
            pin: this.connectOptions.pin,
            tvAuthToken: this.connectOptions.tvAuthToken,
            firebaseIdToken,
            restoredBlueprint: this.connectOptions.restoredBlueprint,
          });
          if (wasReconnect) {
            this.requestSync();
          }
        } else if (this.user) {
          this.sendRaw('REGISTER_PRESENCE', {
            user: this.user,
            firebaseIdToken,
          });
        }

        this.flushPendingMessages();
        this.notifyListeners({ type: 'CONNECTION_STATUS', payload: { connected: true } });
        this.startHeartbeat();
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as SocketEvent;
          if (message.type === 'PONG' && message.payload?.clientTs) {
            const now = Date.now();
            const rtt = Math.max(4, now - Number(message.payload.clientTs));
            this.latencyMs = Math.min(rtt, 9999);
            if (rtt < 5000 && typeof message.payload.serverTs === 'number') {
              this.serverClockOffsetMs = message.payload.serverTs + Math.round(rtt / 2) - now;
            }
            this.notifyListeners({
              type: 'LATENCY_UPDATED',
              payload: { latencyMs: this.latencyMs, serverClockOffsetMs: this.serverClockOffsetMs },
            });
            return;
          }
          this.notifyListeners(message);
        } catch {
          // Ignore malformed non-JSON frame safely
        }
      };

      socket.onclose = () => {
        this.stopHeartbeat();
        this.notifyListeners({ type: 'CONNECTION_STATUS', payload: { connected: false } });
        if (!this.intentionalClose) {
          this.reconnectAttempts += 1;
          const jitter = Math.floor(Math.random() * 400);
          const delay = Math.min(7000, 1000 * Math.min(this.reconnectAttempts, 7)) + jitter;
          this.reconnectTimer = setTimeout(() => {
            if (this.roomId && this.user) {
              this.connect(this.roomId, this.user, this.roomName, this.connectOptions);
            } else if (this.user) {
              this.connectPresenceOnly(this.user);
            }
          }, delay);
        }
      };

      socket.onerror = () => {
        // Reconnection triggered by onclose
      };
    } catch {
      this.notifyListeners({ type: 'CONNECTION_STATUS', payload: { connected: false } });
    }
  }

  connectPresenceOnly(user: Participant) {
    this.user = user;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      void this.resolveFirebaseIdToken().then((firebaseIdToken) => {
        this.sendRaw('REGISTER_PRESENCE', {
          user,
          roomId: this.roomId || undefined,
          roomName: this.roomName || undefined,
          firebaseIdToken,
        });
      });
      return;
    }
    this.connect('', user, '');
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.sendRaw('PING', { clientTs: Date.now() });
    this.pingTimer = setInterval(() => {
      this.sendRaw('PING', { clientTs: Date.now() });
    }, 6000);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  disconnect() {
    this.intentionalClose = true;
    this.hasConnectedOnce = false;
    this.roomId = '';
    this.roomName = '';
    this.pendingMessages = [];
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isConnected(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  emitLocal(event: SocketEvent) {
    this.notifyListeners(event);
  }

  private notifyListeners(event: SocketEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  protected sendRaw(type: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  protected send(type: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
      return;
    }
    if (!NON_QUEUEABLE_TYPES.has(type) && !this.intentionalClose) {
      this.pendingMessages.push({ type, payload });
      if (this.pendingMessages.length > 20) {
        this.pendingMessages.shift();
      }
    }
  }

  requestSync() {
    if (!this.roomId) return;
    this.sendRaw('SYNC_REQUEST', {
      roomId: this.roomId,
    });
  }

  syncVideoState(
    action: 'play' | 'pause' | 'seek' | 'change_url',
    videoState: VideoState,
    updatedBy: string
  ) {
    this.send('SYNC_VIDEO_STATE', {
      roomId: this.roomId,
      action,
      videoState,
      updatedBy,
    });
  }

  sendChatMessage(user: Participant, text: string) {
    this.send('SEND_CHAT', {
      roomId: this.roomId,
      text,
      user,
    });
  }

  pinChatMessage(messageId: string) {
    if (!this.roomId || !messageId) return;
    this.send('PIN_CHAT_MESSAGE', {
      roomId: this.roomId,
      messageId,
    });
  }

  unpinChatMessage() {
    if (!this.roomId) return;
    this.send('UNPIN_CHAT_MESSAGE', {
      roomId: this.roomId,
    });
  }

  sendTypingState(user: Participant, isTyping: boolean) {
    if (!this.roomId) return;
    this.send('TYPING_STATE', {
      roomId: this.roomId,
      userId: user.id,
      userName: user.name,
      isTyping,
    });
  }

  sendReaction(user: Participant, emoji: string) {
    this.send('SEND_REACTION', {
      roomId: this.roomId,
      emoji,
      user,
    });
  }

  transferHost(newHostId: string) {
    this.send('TRANSFER_HOST', {
      roomId: this.roomId,
      newHostId,
    });
  }

  setParticipantRole(targetUserId: string, role: RoomRole) {
    this.send('SET_PARTICIPANT_ROLE', {
      roomId: this.roomId,
      targetUserId,
      role,
    });
  }

  updateProfile(userId: string, userName: string, userAvatar: string, userColor: string) {
    if (this.user && this.user.id === userId) {
      this.user = {
        ...this.user,
        name: userName,
        avatar: userAvatar,
        color: userColor,
      };
    }
    this.send('UPDATE_PROFILE', {
      roomId: this.roomId,
      userId,
      userName,
      userAvatar,
      userColor,
    });
  }

  startCloudBrowser(url: string, updatedBy: string) {
    this.send('CLOUD_BROWSER_START', {
      roomId: this.roomId,
      url,
      updatedBy,
    });
  }

  sendCloudBrowserInput(
    input:
      | { type: 'click'; x: number; y: number }
      | { type: 'scroll'; deltaY: number }
      | { type: 'type'; text: string }
      | { type: 'key'; key: string }
      | { type: 'navigate'; url: string }
      | { type: 'back' }
      | { type: 'reload' }
  ) {
    this.send('CLOUD_BROWSER_INPUT', {
      roomId: this.roomId,
      input,
    });
  }

  stopCloudBrowser() {
    this.send('CLOUD_BROWSER_STOP', {
      roomId: this.roomId,
    });
  }

  addToQueue(item: unknown) {
    this.send('QUEUE_ADD', {
      roomId: this.roomId,
      item,
    });
  }

  removeFromQueue(itemId: string) {
    this.send('QUEUE_REMOVE', {
      roomId: this.roomId,
      itemId,
    });
  }

  promoteQueueItem(itemId: string) {
    this.send('QUEUE_PROMOTE', {
      roomId: this.roomId,
      itemId,
    });
  }

  reorderQueueItem(itemId: string, direction?: 'up' | 'down', targetIndex?: number) {
    if (!this.roomId || !itemId) return;
    this.send('QUEUE_REORDER', {
      roomId: this.roomId,
      itemId,
      direction,
      targetIndex,
    });
  }

  voteQueueItem(itemId: string, userId: string) {
    this.send('QUEUE_VOTE', {
      roomId: this.roomId,
      itemId,
      userId,
    });
  }

  setHostLock(hostOnlyControl: boolean) {
    this.send('SET_HOST_LOCK', {
      roomId: this.roomId,
      hostOnlyControl,
    });
  }

  startPoll(question: string, options: unknown[], durationSec = 25) {
    this.send('POLL_START', {
      roomId: this.roomId,
      question,
      options,
      durationSec,
    });
  }

  votePoll(pollId: string, optionId: string) {
    this.send('POLL_VOTE', {
      roomId: this.roomId,
      pollId,
      optionId,
    });
  }

  closePoll(pollId: string) {
    this.send('POLL_CLOSE', {
      roomId: this.roomId,
      pollId,
    });
  }

  submitRoomPin(pin: string) {
    this.connectOptions = { ...this.connectOptions, pin };
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.user) {
      void this.resolveFirebaseIdToken().then((firebaseIdToken) => {
        this.sendRaw('JOIN_ROOM', {
          roomId: this.roomId,
          roomName: this.roomName,
          user: this.user,
          pin,
          firebaseIdToken,
        });
      });
    } else if (this.roomId && this.user) {
      this.connect(this.roomId, this.user, this.roomName, this.connectOptions);
    }
  }

  setRoomPin(pinCode: string) {
    if (pinCode && /^[0-9]{4}$/.test(pinCode)) {
      this.connectOptions = { ...this.connectOptions, pin: pinCode };
    }
    this.send('SET_ROOM_PIN', {
      roomId: this.roomId,
      pinCode,
    });
  }

  renameRoom(roomName: string) {
    const trimmed = roomName.trim().slice(0, 60);
    if (!trimmed) return;
    this.roomName = trimmed;
    this.send('RENAME_ROOM', {
      roomId: this.roomId,
      roomName: trimmed,
    });
  }

  claimTvPairingCode(code: string, roomName: string, claimedBy: string) {
    this.send('TV_CLAIM_CODE', {
      code: code.trim(),
      roomId: this.roomId,
      roomName,
      claimedBy,
    });
  }

  sendTvRemoteCommand(command: TvRemoteCommandType, senderName: string) {
    this.send('TV_REMOTE_COMMAND', {
      roomId: this.roomId,
      command,
      senderName,
    });
  }

  sendRoomInvite(params: {
    toUserId: string;
    toFriendCode?: string;
    toUserName?: string;
    fromUser: { id: string; name: string; avatar: string; color: string };
    roomId: string;
    roomName: string;
    mediaTitle?: string;
  }) {
    this.send('SEND_ROOM_INVITE', params);
  }

  notifyFriendAdded(params: {
    toUserId: string;
    toFriendCode?: string;
    fromUser: { id: string; name: string; avatar: string; color: string };
  }) {
    this.send('NOTIFY_FRIEND_ADDED', params);
  }

  joinVoiceCall() {
    if (!this.roomId) return;
    this.send('VOICE_JOIN', { roomId: this.roomId });
  }

  leaveVoiceCall() {
    if (!this.roomId) return;
    this.send('VOICE_LEAVE', { roomId: this.roomId });
  }

  updateVoiceMute(isMuted: boolean) {
    if (!this.roomId) return;
    this.send('VOICE_STATE_UPDATE', { roomId: this.roomId, isMuted });
  }

  sendVoiceSignal(payload: Omit<VoiceSignalPayload, 'roomId'>) {
    if (!this.roomId) return;
    this.send('VOICE_SIGNAL', {
      roomId: this.roomId,
      ...payload,
    });
  }
}
