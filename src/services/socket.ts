import { Participant, VideoState } from '../types';

export interface SocketEvent {
  type: string;
  payload: any;
}

type Listener = (event: SocketEvent) => void;

class SocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private roomId = '';
  private roomName = '';
  private user: Participant | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  public latencyMs = 24;

  connect(roomId: string, user: Participant, roomName?: string) {
    this.intentionalClose = false;
    this.roomId = roomId.trim().toLowerCase();
    this.roomName = roomName || `Sala ${this.roomId.toUpperCase()}`;
    this.user = user;

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

      socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.send('JOIN_ROOM', {
          roomId: this.roomId,
          roomName: this.roomName,
          user: this.user,
        });
        this.notifyListeners({ type: 'CONNECTION_STATUS', payload: { connected: true } });
        this.startHeartbeat();
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as SocketEvent;
          if (message.type === 'PONG' && message.payload?.clientTs) {
            this.latencyMs = Math.max(4, Date.now() - Number(message.payload.clientTs));
            this.notifyListeners({ type: 'LATENCY_UPDATED', payload: { latencyMs: this.latencyMs } });
            return;
          }
          this.notifyListeners(message);
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      socket.onclose = () => {
        this.stopHeartbeat();
        this.notifyListeners({ type: 'CONNECTION_STATUS', payload: { connected: false } });
        if (!this.intentionalClose && this.reconnectAttempts < 8) {
          this.reconnectAttempts += 1;
          const delay = Math.min(6000, 1000 * this.reconnectAttempts);
          this.reconnectTimer = setTimeout(() => {
            if (this.roomId && this.user) {
              this.connect(this.roomId, this.user, this.roomName);
            }
          }, delay);
        }
      };

      socket.onerror = () => {
        // Handled by onclose reconnection
      };
    } catch (err) {
      console.error('Failed to open WebSocket:', err);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.send('PING', { clientTs: Date.now() });
    this.pingTimer = setInterval(() => {
      this.send('PING', { clientTs: Date.now() });
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

  private notifyListeners(event: SocketEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  private send(type: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
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
}

export const socketService = new SocketService();
