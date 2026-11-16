import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  assignParticipantRole,
  canUserChangeRoomMedia,
  canUserControlRoom,
  shouldEmitJoinSystemMessage,
} from '../server/services/roomSync.ts';
import {
  assertSafeProxyUrl,
  isPrivateOrMetadataIp,
  isPrivateOrMetadataIpv4,
} from '../server/utils/ssrfGuard.ts';
import type { RoomParticipant } from '../src/shared/protocol.ts';

describe('SSRF Guard for Streaming & Image Proxies', () => {
  it('blocks private, loopback, link-local, CGNAT, and metadata IPv4 ranges', () => {
    expect(isPrivateOrMetadataIpv4('127.0.0.1')).toBe(true);
    expect(isPrivateOrMetadataIpv4('169.254.169.254')).toBe(true);
    expect(isPrivateOrMetadataIpv4('10.0.0.1')).toBe(true);
    expect(isPrivateOrMetadataIpv4('172.16.5.10')).toBe(true);
    expect(isPrivateOrMetadataIpv4('192.168.1.50')).toBe(true);
    expect(isPrivateOrMetadataIpv4('100.64.0.1')).toBe(true);
    expect(isPrivateOrMetadataIpv4('0.0.0.0')).toBe(true);
  });

  it('blocks IPv6 loopback, ULA, link-local, and IPv4-mapped metadata addresses', () => {
    expect(isPrivateOrMetadataIp('::1')).toBe(true);
    expect(isPrivateOrMetadataIp('fe80::1')).toBe(true);
    expect(isPrivateOrMetadataIp('fd00::1')).toBe(true);
    expect(isPrivateOrMetadataIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrMetadataIp('::ffff:169.254.169.254')).toBe(true);
  });

  it('rejects blocked hosts and non-http protocols while preserving public streaming IPs', async () => {
    await expect(assertSafeProxyUrl('http://127.0.0.1:3000/secret')).rejects.toThrow();
    await expect(assertSafeProxyUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
    await expect(assertSafeProxyUrl('http://10.20.30.40/internal.m3u8')).rejects.toThrow();
    await expect(assertSafeProxyUrl('http://localhost/test')).rejects.toThrow();
    await expect(assertSafeProxyUrl('http://metadata.google.internal/')).rejects.toThrow();
    await expect(assertSafeProxyUrl('file:///etc/passwd')).rejects.toThrow();

    // Legitimate public DVB / TDT headend IP and public CDN URLs must pass untouched
    const tdtParsed = await assertSafeProxyUrl('http://90.163.85.113:8093/channel/master.m3u8');
    expect(tdtParsed.hostname).toBe('90.163.85.113');

    const imgParsed = await assertSafeProxyUrl('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(imgParsed.hostname).toBe('image.tmdb.org');
  });
});

describe('Creator-Only Host & Co-anfitrión Room Permissions', () => {
  const sampleParticipants: RoomParticipant[] = [
    {
      id: 'creator-1',
      name: 'Naim',
      avatar: '🎬',
      color: '#9146FF',
      isHost: true,
      role: 'host',
      joinedAt: 1000,
    },
    {
      id: 'friend-cohost',
      name: 'Alex',
      avatar: '🍿',
      color: '#10B981',
      isHost: false,
      role: 'mod',
      joinedAt: 2000,
    },
    {
      id: 'guest-viewer',
      name: 'Invitado',
      avatar: '🎭',
      color: '#F59E0B',
      isHost: false,
      role: 'viewer',
      joinedAt: 3000,
    },
  ];

  it('allows only creator/host and assigned co-hosts to change channels or movies', () => {
    expect(
      canUserChangeRoomMedia({
        hostId: 'creator-1',
        creatorId: 'creator-1',
        userId: 'creator-1',
        participants: sampleParticipants,
      })
    ).toBe(true);

    expect(
      canUserChangeRoomMedia({
        hostId: 'creator-1',
        creatorId: 'creator-1',
        userId: 'friend-cohost',
        participants: sampleParticipants,
      })
    ).toBe(true);

    expect(
      canUserChangeRoomMedia({
        hostId: 'creator-1',
        creatorId: 'creator-1',
        userId: 'guest-viewer',
        participants: sampleParticipants,
      })
    ).toBe(false);
  });

  it('never transfers host ownership via assignParticipantRole and toggles co-host cleanly', () => {
    const attemptHostTransfer = assignParticipantRole(sampleParticipants, 'guest-viewer', 'host');
    const targetAfter = attemptHostTransfer.find((p) => p.id === 'guest-viewer');
    expect(targetAfter?.isHost).toBe(false);
    expect(targetAfter?.role).toBe('viewer');

    const promoted = assignParticipantRole(attemptHostTransfer, 'guest-viewer', 'mod');
    expect(promoted.find((p) => p.id === 'guest-viewer')?.role).toBe('mod');
    expect(promoted.find((p) => p.id === 'guest-viewer')?.isHost).toBe(false);
    expect(promoted.find((p) => p.id === 'creator-1')?.isHost).toBe(true);

    expect(
      canUserControlRoom({
        hostOnlyControl: true,
        hostId: 'creator-1',
        creatorId: 'creator-1',
        userId: 'guest-viewer',
        participants: promoted,
      })
    ).toBe(true);
  });
});

describe('Room Side Panel Architecture, Copyable Code & Join Deduplication', () => {
  it('deduplicates consecutive join system events by systemUserId within cooldown window', () => {
    const now = 1_750_000_000_000;
    const shouldSkip = shouldEmitJoinSystemMessage({
      roomId: 'jxz9',
      userId: 'guest-neon-90',
      userName: 'Invitado_Neon_90_New',
      alreadyInRoom: false,
      now,
      existingMessages: [
        {
          id: 'join-1',
          senderId: 'system',
          senderName: 'RiffanTV',
          senderAvatar: '🎬',
          senderColor: '#10b981',
          text: 'Invitado_Neon_90 se ha unido a la sala',
          timestamp: now - 3000,
          isSystem: true,
          systemUserId: 'guest-neon-90',
          systemType: 'join',
        },
      ],
    });
    expect(shouldSkip).toBe(false);
  });

  it('keeps 3 non-redundant sidebar tabs, 1-tap code copy, red-accent leave CTA, members voice copy, and mobile drawer sizing', () => {
    const sidebarSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/PartySidebar.tsx'),
      'utf8'
    );
    expect(sidebarSrc).toContain('grid-cols-3');
    expect(sidebarSrc).toContain('handleCopyRoomCode');
    expect(sidebarSrc).toContain('bg-red-500/10');
    expect(sidebarSrc).toContain('break-words leading-snug');

    const bubbleSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/FloatingRoomBubble.tsx'),
      'utf8'
    );
    expect(bubbleSrc).toContain('w-[96vw]');
    expect(bubbleSrc).toContain('bg-black/75 backdrop-blur-md');
    expect(bubbleSrc).toContain('bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.14]');

    const queueSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/party/PartyQueuePanel.tsx'),
      'utf8'
    );
    expect(queueSrc).toContain('onBrowseCatalog');
    expect(queueSrc).toContain('roomQueue.length > 0 &&');

    const voiceSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/games/GameVoiceBar.tsx'),
      'utf8'
    );
    expect(voiceSrc).toContain('Habla en directo con los miembros de la sala');
    expect(voiceSrc).not.toContain('jugadores de la sala');
  });
});
