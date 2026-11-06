import { ChatMessage, FloatingReaction, Participant, RemoteBrowserInput, RoomData, VideoState } from '../types';

type MessageHandler = (data: { type: string; payload: any }) => void;

class SocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private roomId: string | null = null;
  private userId: string | null = null;
  private hostToken: string | null = null;
  private isConnected: boolean = false;
  private reconnectTimer: any = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('watch2gether_channel');
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.roomId === this.roomId) {
          this.notifyListeners(event.data.type, event.data.payload);
        }
      };
    }
  }

  public connect(roomId: string, user: { id: string; name: string; avatar: string; color: string }, hostToken?: string) {
    this.roomId = roomId;
    this.userId = user.id;
    this.hostToken = hostToken || sessionStorage.getItem(`watch2gether-host:${roomId}`);
    if (hostToken) sessionStorage.setItem(`watch2gether-host:${roomId}`, hostToken);

    if (this.ws) {
      this.ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.ws?.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            payload: {
              roomId,
              userName: user.name,
              userAvatar: user.avatar,
              userColor: user.color,
              hostToken: this.hostToken,
            },
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notifyListeners(data.type, data.payload);
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        // Schedule auto-reconnect if room is active
        if (this.roomId) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.roomId && !this.isConnected) {
              this.connect(this.roomId, user, this.hostToken || undefined);
            }
          }, 3000);
        }
      };
    } catch (err) {
      console.warn('WebSocket connection failed, using BroadcastChannel fallback', err);
    }
  }

  public subscribe(handler: MessageHandler) {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  public ping() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'PING', payload: { sentAt: performance.now() } }));
    }
  }

  public startRemoteBrowser(url: string) {
    if (!this.roomId || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'START_REMOTE_BROWSER',
      payload: { roomId: this.roomId, url },
    }));
  }

  public stopRemoteBrowser() {
    if (!this.roomId || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'STOP_REMOTE_BROWSER', payload: { roomId: this.roomId } }));
  }

  public sendRemoteBrowserInput(input: RemoteBrowserInput) {
    if (!this.roomId || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'REMOTE_BROWSER_INPUT',
      payload: { roomId: this.roomId, input },
    }));
  }

  private notifyListeners(type: string, payload: any) {
    this.listeners.forEach((handler) => handler({ type, payload }));
  }

  public syncVideoState(action: 'play' | 'pause' | 'seek' | 'change_url', videoState: Partial<VideoState>, updatedBy: string) {
    if (!this.roomId) return;

    const payload = {
      roomId: this.roomId,
      action,
      videoUrl: videoState.url,
      videoTitle: videoState.title,
      sourceType: videoState.sourceType,
      currentTime: videoState.currentTime,
      isPlaying: videoState.isPlaying,
      poster: videoState.poster,
      overview: videoState.overview,
      releaseYear: videoState.releaseYear,
      originalPortalUrl: videoState.originalPortalUrl,
      altEmbeds: videoState.altEmbeds,
      trailerUrl: videoState.trailerUrl,
      updatedBy,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SYNC_VIDEO_STATE', payload }));
    }

    // Broadcast fallback for local multi-tab testing
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        roomId: this.roomId,
        type: 'VIDEO_STATE_UPDATED',
        payload: {
          videoState: {
            url: videoState.url || '',
            title: videoState.title || '',
            sourceType: videoState.sourceType || 'direct',
            currentTime: videoState.currentTime || 0,
            isPlaying: videoState.isPlaying ?? false,
            poster: videoState.poster,
            overview: videoState.overview,
            releaseYear: videoState.releaseYear,
            originalPortalUrl: videoState.originalPortalUrl,
            altEmbeds: videoState.altEmbeds,
            trailerUrl: videoState.trailerUrl,
            lastUpdated: Date.now(),
            updatedBy,
          },
          action,
        },
      });
    }
  }

  public sendChatMessage(user: { id: string; name: string; avatar: string; color: string }, text: string) {
    if (!this.roomId || !text.trim()) return;

    const payload = {
      roomId: this.roomId,
      text: text.trim(),
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatar,
      senderColor: user.color,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SEND_CHAT', payload }));
    } else {
      // Local broadcast fallback
      const msg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        senderId: user.id,
        senderName: user.name,
        senderAvatar: user.avatar,
        senderColor: user.color,
        text: text.trim(),
        timestamp: Date.now(),
      };
      this.notifyListeners('NEW_CHAT_MESSAGE', msg);
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          roomId: this.roomId,
          type: 'NEW_CHAT_MESSAGE',
          payload: msg,
        });
      }
    }
  }

  public sendReaction(user: { name: string; color: string }, emoji: string) {
    if (!this.roomId) return;

    const payload = {
      roomId: this.roomId,
      emoji,
      senderName: user.name,
      senderColor: user.color,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SEND_REACTION', payload }));
    }

    const reaction: FloatingReaction = {
      id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      emoji,
      senderName: user.name,
      senderColor: user.color,
      timestamp: Date.now(),
    };
    this.notifyListeners('FLOATING_REACTION', reaction);

    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        roomId: this.roomId,
        type: 'FLOATING_REACTION',
        payload: reaction,
      });
    }
  }

  public sendWebRTCSignal(roomId: string, signalData: any, targetId: string, senderId: string) {
    if (!this.roomId) return;
    const payload = { roomId, signalData, targetId, senderId };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'WEBRTC_SIGNAL', payload }));
    }
  }

  public transferHost(newHostId: string) {
    if (!this.roomId) return;
    const payload = { roomId: this.roomId, newHostId };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'TRANSFER_HOST', payload }));
    }
  }

  public updateProfile(user: { name: string; avatar: string; color: string }) {
    if (!this.roomId || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'UPDATE_PROFILE',
      payload: {
        roomId: this.roomId,
        userName: user.name,
        userAvatar: user.avatar,
        userColor: user.color,
      },
    }));
  }

  public disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.roomId = null;
    this.userId = null;
    this.isConnected = false;
  }
}

export const socketService = new SocketService();
