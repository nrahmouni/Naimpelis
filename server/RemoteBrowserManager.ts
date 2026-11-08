import { WebSocket } from 'ws';
import { RemoteBrowserInput } from '../src/types';

export function isAllowedRemoteBrowserUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const url = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

interface RemoteSession {
  userId: string;
  url: string;
  lastFrame?: string;
}

export class RemoteBrowserManager {
  private onMessage: (roomId: string, message: unknown) => void;
  private activeSessions = new Map<string, RemoteSession>();

  constructor(onMessage: (roomId: string, message: unknown) => void) {
    this.onMessage = onMessage;
  }

  sendLatestFrame(roomId: string, ws: WebSocket): void {
    const session = this.activeSessions.get(roomId);
    if (session?.lastFrame) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'REMOTE_BROWSER_FRAME',
          payload: { frame: session.lastFrame, url: session.url }
        }));
      }
    }
  }

  async start(roomId: string, userId: string, url: string): Promise<void> {
    this.activeSessions.set(roomId, { userId, url });
    this.onMessage(roomId, {
      type: 'REMOTE_BROWSER_READY',
      payload: { url, width: 1280, height: 720 }
    });
  }

  async input(roomId: string, userId: string, _input: RemoteBrowserInput): Promise<void> {
    const session = this.activeSessions.get(roomId);
    if (!session || session.userId !== userId) return;
  }

  async stop(roomId: string): Promise<void> {
    this.activeSessions.delete(roomId);
  }

  transferHost(roomId: string, newHostId: string): void {
    const session = this.activeSessions.get(roomId);
    if (session) {
      session.userId = newHostId;
    }
  }

  async close(): Promise<void> {
    this.activeSessions.clear();
  }
}
