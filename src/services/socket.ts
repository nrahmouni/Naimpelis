import { ChatMessage, FloatingReaction, Participant, VideoState } from '../types';

type Listener = (event: { type: string; payload: any }) => void;

class SocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private roomId: string = '';
  private user: Participant | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;

  connect(roomId: string, user: Participant) {
    this.roomId = roomId;
    this.user = user;

    if (this.ws) {
      this.ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.send('JOIN_ROOM', { roomId, user });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.notifyListeners(message);
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        // Attempt automatic reconnection if disconnected unexpectedly
        if (this.reconnectAttempts < 5) {
          this.reconnectAttempts++;
          setTimeout(() => {
            if (this.roomId && this.user) {
              this.connect(this.roomId, this.user);
            }
          }, 1500 * this.reconnectAttempts);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error:', err);
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(data: { type: string; payload: any }) {
    this.listeners.forEach((listener) => listener(data));
  }

  private send(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  syncVideoState(action: 'play' | 'pause' | 'seek' | 'change_url', state: VideoState, userName: string) {
    this.send('SYNC_VIDEO_STATE', {
      roomId: this.roomId,
      action,
      videoUrl: state.url,
      videoTitle: state.title,
      sourceType: state.sourceType,
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      updatedBy: userName,
      poster: state.poster,
      overview: state.overview,
      releaseYear: state.releaseYear,
      originalPortalUrl: state.originalPortalUrl,
      altEmbeds: state.altEmbeds,
      trailerUrl: state.trailerUrl,
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

  updateProfile(userName: string, userAvatar: string, userColor: string) {
    this.send('UPDATE_PROFILE', {
      roomId: this.roomId,
      userName,
      userAvatar,
      userColor,
    });
  }
}

export const socketService = new SocketService();
