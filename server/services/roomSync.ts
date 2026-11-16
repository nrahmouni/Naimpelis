import type { RoomChatMessage, RoomParticipant, RoomRole } from '../../src/shared/protocol.ts';

const JOIN_SPAM_COOLDOWN_MS = 180_000; // 3 minutes per room+user

const recentJoinTimestamps = new Map<string, number>();

export interface QueueEntryWithVotes {
  id: string;
  title: string;
  voterIds?: string[];
  [key: string]: unknown;
}

/**
 * Prevents the audited "6x duplicate '<user> se ha unido a la sala'" spam when sockets reconnect,
 * StrictMode remounts, or a viewer refreshes within a 3-minute window.
 */
export function shouldEmitJoinSystemMessage(params: {
  roomId: string;
  userId: string;
  userName: string;
  alreadyInRoom: boolean;
  existingMessages: RoomChatMessage[];
  now?: number;
}): boolean {
  const now = params.now ?? Date.now();
  if (params.alreadyInRoom) return false;
  if (params.userName.includes('(TV)')) return false;

  const cooldownKey = `${params.roomId}::${params.userId}`;
  const lastJoinedAt = recentJoinTimestamps.get(cooldownKey) ?? 0;
  if (now - lastJoinedAt < JOIN_SPAM_COOLDOWN_MS) {
    return false;
  }

  // Also guard against recent chat messages already announcing this exact user joining (by userId or userName)
  const recentDuplicate = params.existingMessages.slice(-20).some(
    (m) =>
      m.isSystem &&
      m.systemType === 'join' &&
      ((typeof (m as { systemUserId?: string }).systemUserId === 'string' &&
        (m as { systemUserId?: string }).systemUserId === params.userId) ||
        m.text.includes(params.userName)) &&
      now - m.timestamp < JOIN_SPAM_COOLDOWN_MS
  );
  if (recentDuplicate) {
    recentJoinTimestamps.set(cooldownKey, now);
    return false;
  }

  recentJoinTimestamps.set(cooldownKey, now);
  return true;
}

/**
 * Cleanly trims old cooldown markers so memory stays bounded.
 */
export function pruneJoinCooldownCache(now = Date.now()): void {
  for (const [k, ts] of recentJoinTimestamps.entries()) {
    if (now - ts > JOIN_SPAM_COOLDOWN_MS * 2) {
      recentJoinTimestamps.delete(k);
    }
  }
}

/**
 * Checks whether a participant holds moderation/playback privileges (creator/host or co-host).
 */
export function canUserControlRoom(params: {
  hostOnlyControl: boolean;
  hostId: string;
  creatorId?: string;
  userId?: string;
  participants: RoomParticipant[];
}): boolean {
  if (!params.hostOnlyControl) return true;
  if (!params.userId) return false;
  if (params.creatorId && params.userId === params.creatorId) return true;
  if (params.hostId && params.userId === params.hostId) return true;
  const member = params.participants.find((p) => p.id === params.userId);
  return member?.role === 'host' || member?.role === 'mod';
}

/**
 * Checks whether a participant is authorized to change channels, movies, or room media.
 * Strictly restricted to the room creator (host) and assigned co-hosts (mod).
 */
export function canUserChangeRoomMedia(params: {
  hostId: string;
  creatorId?: string;
  userId?: string;
  participants: RoomParticipant[];
}): boolean {
  return canUserControlRoom({
    hostOnlyControl: true,
    hostId: params.hostId,
    creatorId: params.creatorId,
    userId: params.userId,
    participants: params.participants,
  });
}

/**
 * Picks the next host automatically when the active host leaves/disconnects.
 * Kept for backwards compatibility in unit tests; live rooms preserve creatorId as exclusive host.
 */
export function selectNextHostOnLeave(
  participants: RoomParticipant[],
  leavingUserId: string
): RoomParticipant | null {
  const candidates = participants.filter(
    (p) => p.id !== leavingUserId && !p.name.includes('(TV)') && p.avatar !== '📺'
  );
  if (candidates.length === 0) return null;

  const modCandidate = candidates.find((p) => p.role === 'mod');
  if (modCandidate) return modCandidate;

  return [...candidates].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0] ?? null;
}

/**
 * Applies or removes a user's upvote on a queued item and re-sorts the queue descending by votes
 * while keeping stable order for ties.
 */
export function toggleQueueItemVote<T extends QueueEntryWithVotes>(
  queue: T[],
  itemId: string,
  userId: string
): T[] {
  const updated = queue.map((item) => {
    if (item.id !== itemId) return item;
    const prevVotes = Array.isArray(item.voterIds) ? item.voterIds : [];
    const hasVoted = prevVotes.includes(userId);
    const nextVotes = hasVoted
      ? prevVotes.filter((id) => id !== userId)
      : [...prevVotes, userId];
    return {
      ...item,
      voterIds: nextVotes,
    };
  });

  return [...updated].sort((a, b) => {
    const votesA = Array.isArray(a.voterIds) ? a.voterIds.length : 0;
    const votesB = Array.isArray(b.voterIds) ? b.voterIds.length : 0;
    return votesB - votesA;
  });
}

/**
 * Updates a participant's co-host/viewer role cleanly (creator/host-only action).
 * Never transfers exclusive 'host' ownership to another participant.
 */
export function assignParticipantRole(
  participants: RoomParticipant[],
  targetUserId: string,
  role: RoomRole
): RoomParticipant[] {
  const safeRole: RoomRole = role === 'mod' ? 'mod' : 'viewer';
  return participants.map((p) =>
    p.id === targetUserId && !p.isHost ? { ...p, role: safeRole, isHost: false } : p
  );
}
