import crypto from 'crypto';
import { EventEmitter } from 'events';
import { isDistributedStoreEnabled, loadDistributedKey, saveDistributedKey } from './distributedStore.ts';
import { logger } from '../utils/logger.ts';

export interface RoomSyncEnvelope {
  originNodeId: string;
  roomId: string;
  eventType: string;
  payload: unknown;
  ts: number;
}

const NODE_ID = crypto.randomUUID().slice(0, 8);

class RoomPubSubBridge extends EventEmitter {
  private publishedCount = 0;
  private receivedCount = 0;
  private lastPublishedAt = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeenRemoteTs = 0;

  getNodeId(): string {
    return NODE_ID;
  }

  startSyncLoop(): void {
    if (this.pollTimer || !isDistributedStoreEnabled()) return;
    this.pollTimer = setInterval(() => {
      void this.pullRemoteBusSignals().catch(() => {});
    }, 3500);
    this.pollTimer.unref?.();
  }

  stopSyncLoop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pullRemoteBusSignals(): Promise<void> {
    if (!isDistributedStoreEnabled()) return;
    const latest = await loadDistributedKey<RoomSyncEnvelope>('pubsub:latest-room-event');
    if (!latest || latest.originNodeId === NODE_ID || latest.ts <= this.lastSeenRemoteTs) {
      return;
    }
    this.lastSeenRemoteTs = latest.ts;
    this.receivedCount += 1;
    this.emit('remote_room_event', latest);
  }

  async publishRoomEvent(roomId: string, eventType: string, payload: unknown): Promise<void> {
    this.publishedCount += 1;
    this.lastPublishedAt = Date.now();
    const env: RoomSyncEnvelope = {
      originNodeId: NODE_ID,
      roomId,
      eventType,
      payload,
      ts: this.lastPublishedAt,
    };
    this.emit('local_room_event', env);
    if (isDistributedStoreEnabled()) {
      await saveDistributedKey('pubsub:latest-room-event', env, 120).catch((err) => {
        logger.debug({ err }, 'room_pubsub_remote_publish_failed');
      });
    }
  }

  getStats() {
    return {
      nodeId: NODE_ID,
      mode: isDistributedStoreEnabled() ? 'distributed-redis' : 'single-node-bus',
      publishedCount: this.publishedCount,
      receivedCount: this.receivedCount,
      lastPublishedAt: this.lastPublishedAt,
    };
  }
}

export const roomPubSubBridge = new RoomPubSubBridge();
