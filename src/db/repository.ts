import { and, desc, eq } from 'drizzle-orm';
import { getDb, isCloudSqlConfigured } from './index.ts';
import {
  gameScores,
  savedCinemaPlaces,
  studioCreations,
  userFavorites,
  userFriends,
  userProfiles,
  userSavedRooms,
  users,
  userWatchHistory,
  type DbUser,
  type GameScoreRow,
  type SavedCinemaPlaceRow,
  type StudioCreationRow,
  type UserFavoriteRow,
  type UserFriendRow,
  type UserProfileRow,
  type UserSavedRoomRow,
  type UserWatchHistoryRow,
} from './schema.ts';

export async function getOrCreateUser(params: {
  uid: string;
  email: string;
  displayName?: string | null;
  photoUrl?: string | null;
}): Promise<DbUser | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, params.uid)).limit(1);
  if (existing) {
    if (
      (params.displayName && params.displayName !== existing.displayName) ||
      (params.photoUrl && params.photoUrl !== existing.photoUrl)
    ) {
      const [updated] = await db
        .update(users)
        .set({
          displayName: params.displayName ?? existing.displayName,
          photoUrl: params.photoUrl ?? existing.photoUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, params.uid))
        .returning();
      return updated || existing;
    }
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      id: params.uid,
      email: params.email || `${params.uid}@riffantv.user`,
      displayName: params.displayName || null,
      photoUrl: params.photoUrl || null,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;
  const [refetched] = await db.select().from(users).where(eq(users.id, params.uid)).limit(1);
  return refetched || null;
}

export async function getFullUserAccountState(userId: string): Promise<{
  profile: UserProfileRow | null;
  favorites: UserFavoriteRow[];
  watchHistory: UserWatchHistoryRow[];
  friends: UserFriendRow[];
  savedRooms: UserSavedRoomRow[];
}> {
  if (!isCloudSqlConfigured()) {
    return { profile: null, favorites: [], watchHistory: [], friends: [], savedRooms: [] };
  }
  const db = getDb();
  const [profileRows, favorites, watchHistory, friends, savedRooms] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
    db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.updatedAt))
      .limit(100),
    db
      .select()
      .from(userWatchHistory)
      .where(eq(userWatchHistory.userId, userId))
      .orderBy(desc(userWatchHistory.watchedAt))
      .limit(50),
    db
      .select()
      .from(userFriends)
      .where(eq(userFriends.userId, userId))
      .orderBy(desc(userFriends.addedAt))
      .limit(80),
    db
      .select()
      .from(userSavedRooms)
      .where(eq(userSavedRooms.userId, userId))
      .orderBy(desc(userSavedRooms.updatedAt))
      .limit(30),
  ]);

  return {
    profile: profileRows[0] || null,
    favorites,
    watchHistory,
    friends,
    savedRooms,
  };
}

export async function upsertUserProfileSql(input: {
  userId: string;
  displayName: string;
  avatar: string;
  color: string;
  friendCode?: string | null;
  photoUrl?: string | null;
}): Promise<UserProfileRow | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const [row] = await db
    .insert(userProfiles)
    .values({
      userId: input.userId,
      displayName: input.displayName.slice(0, 64) || 'Cineasta',
      avatar: input.avatar.slice(0, 16) || '🍿',
      color: input.color.slice(0, 16) || '#9146FF',
      friendCode: input.friendCode?.slice(0, 32) || null,
      photoUrl: input.photoUrl || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userProfiles.userId],
      set: {
        displayName: input.displayName.slice(0, 64) || 'Cineasta',
        avatar: input.avatar.slice(0, 16) || '🍿',
        color: input.color.slice(0, 16) || '#9146FF',
        friendCode: input.friendCode?.slice(0, 32) || null,
        photoUrl: input.photoUrl || null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row || null;
}

export async function upsertUserFavoriteSql(input: {
  userId: string;
  favKey: string;
  kind: 'movie' | 'series' | 'channel';
  tmdbId?: number | null;
  title: string;
  subtitle?: string | null;
  poster?: string | null;
  backdrop?: string | null;
  year?: string | null;
  rating?: string | null;
  mediaUrl?: string | null;
  channelLabel?: string | null;
  competition?: string | null;
  sport?: string | null;
}): Promise<UserFavoriteRow | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const [row] = await db
    .insert(userFavorites)
    .values({
      userId: input.userId,
      favKey: input.favKey.slice(0, 128),
      kind: input.kind,
      tmdbId: input.tmdbId ?? null,
      title: input.title.slice(0, 200),
      subtitle: input.subtitle?.slice(0, 240) || null,
      poster: input.poster || null,
      backdrop: input.backdrop || null,
      year: input.year?.slice(0, 16) || null,
      rating: input.rating?.slice(0, 16) || null,
      mediaUrl: input.mediaUrl || null,
      channelLabel: input.channelLabel?.slice(0, 120) || null,
      competition: input.competition?.slice(0, 120) || null,
      sport: input.sport?.slice(0, 24) || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userFavorites.userId, userFavorites.favKey],
      set: {
        kind: input.kind,
        tmdbId: input.tmdbId ?? null,
        title: input.title.slice(0, 200),
        subtitle: input.subtitle?.slice(0, 240) || null,
        poster: input.poster || null,
        backdrop: input.backdrop || null,
        year: input.year?.slice(0, 16) || null,
        rating: input.rating?.slice(0, 16) || null,
        mediaUrl: input.mediaUrl || null,
        channelLabel: input.channelLabel?.slice(0, 120) || null,
        competition: input.competition?.slice(0, 120) || null,
        sport: input.sport?.slice(0, 24) || null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row || null;
}

export async function deleteUserFavoriteSql(userId: string, favKey: string): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  const db = getDb();
  const deleted = await db
    .delete(userFavorites)
    .where(and(eq(userFavorites.userId, userId), eq(userFavorites.favKey, favKey.slice(0, 128))))
    .returning({ id: userFavorites.id });
  return deleted.length > 0;
}

export async function upsertUserWatchHistorySql(input: {
  userId: string;
  itemKey: string;
  mediaType: 'movie' | 'tv';
  tmdbId?: number | null;
  title: string;
  subtitle?: string | null;
  poster?: string | null;
  backdrop?: string | null;
  year?: string | null;
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
  preferLang?: string;
  bingetrixUrl?: string | null;
  movidyUrl?: string | null;
  resumeTimeSec?: number;
  durationSec?: number;
}): Promise<UserWatchHistoryRow | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const safeResume = Math.max(0, Math.round(input.resumeTimeSec || 0));
  const safeDuration = Math.max(0, Math.round(input.durationSec || 0));
  const [row] = await db
    .insert(userWatchHistory)
    .values({
      userId: input.userId,
      itemKey: input.itemKey.slice(0, 128),
      mediaType: input.mediaType === 'tv' ? 'tv' : 'movie',
      tmdbId: input.tmdbId ?? null,
      title: input.title.slice(0, 200),
      subtitle: input.subtitle?.slice(0, 240) || null,
      poster: input.poster || null,
      backdrop: input.backdrop || null,
      year: input.year?.slice(0, 16) || null,
      season: input.season ?? null,
      episode: input.episode ?? null,
      episodeTitle: input.episodeTitle?.slice(0, 200) || null,
      preferLang: (input.preferLang || 'ES').slice(0, 8),
      bingetrixUrl: input.bingetrixUrl || null,
      movidyUrl: input.movidyUrl || null,
      resumeTimeSec: safeResume,
      durationSec: safeDuration,
      watchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userWatchHistory.userId, userWatchHistory.itemKey],
      set: {
        tmdbId: input.tmdbId ?? null,
        title: input.title.slice(0, 200),
        subtitle: input.subtitle?.slice(0, 240) || null,
        poster: input.poster || null,
        backdrop: input.backdrop || null,
        year: input.year?.slice(0, 16) || null,
        season: input.season ?? null,
        episode: input.episode ?? null,
        episodeTitle: input.episodeTitle?.slice(0, 200) || null,
        preferLang: (input.preferLang || 'ES').slice(0, 8),
        bingetrixUrl: input.bingetrixUrl || null,
        movidyUrl: input.movidyUrl || null,
        resumeTimeSec: safeResume,
        durationSec: safeDuration,
        watchedAt: new Date(),
      },
    })
    .returning();
  return row || null;
}

export async function updateUserWatchProgressSql(
  userId: string,
  itemKey: string,
  resumeTimeSec: number,
  durationSec: number
): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  const db = getDb();
  const updated = await db
    .update(userWatchHistory)
    .set({
      resumeTimeSec: Math.max(0, Math.round(resumeTimeSec)),
      durationSec: Math.max(0, Math.round(durationSec)),
      watchedAt: new Date(),
    })
    .where(and(eq(userWatchHistory.userId, userId), eq(userWatchHistory.itemKey, itemKey.slice(0, 128))))
    .returning({ id: userWatchHistory.id });
  return updated.length > 0;
}

export async function deleteUserWatchHistorySql(userId: string, itemKey: string): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  const db = getDb();
  const deleted = await db
    .delete(userWatchHistory)
    .where(and(eq(userWatchHistory.userId, userId), eq(userWatchHistory.itemKey, itemKey.slice(0, 128))))
    .returning({ id: userWatchHistory.id });
  return deleted.length > 0;
}

export async function clearUserWatchHistorySql(userId: string): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  const db = getDb();
  await db.delete(userWatchHistory).where(eq(userWatchHistory.userId, userId));
}

export async function upsertUserFriendSql(input: {
  userId: string;
  friendId: string;
  name: string;
  avatar: string;
  color: string;
  friendCode?: string | null;
}): Promise<UserFriendRow | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const [row] = await db
    .insert(userFriends)
    .values({
      userId: input.userId,
      friendId: input.friendId.slice(0, 128),
      name: input.name.slice(0, 64) || 'Amigo',
      avatar: input.avatar.slice(0, 16) || '🍿',
      color: input.color.slice(0, 16) || '#9146FF',
      friendCode: input.friendCode?.slice(0, 32) || null,
      addedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userFriends.userId, userFriends.friendId],
      set: {
        name: input.name.slice(0, 64) || 'Amigo',
        avatar: input.avatar.slice(0, 16) || '🍿',
        color: input.color.slice(0, 16) || '#9146FF',
        friendCode: input.friendCode?.slice(0, 32) || null,
        addedAt: new Date(),
      },
    })
    .returning();
  return row || null;
}

export async function deleteUserFriendSql(userId: string, friendId: string): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  const db = getDb();
  const deleted = await db
    .delete(userFriends)
    .where(and(eq(userFriends.userId, userId), eq(userFriends.friendId, friendId.slice(0, 128))))
    .returning({ id: userFriends.id });
  return deleted.length > 0;
}

export async function upsertUserSavedRoomSql(input: {
  userId: string;
  roomCode: string;
  roomName: string;
  hasPin: boolean;
  pinCode?: string | null;
  hostOnlyControl: boolean;
  lastActiveTitle?: string | null;
  queueItems: Record<string, unknown>[];
}): Promise<UserSavedRoomRow | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const cleanCode = input.roomCode.trim().toLowerCase().slice(0, 32);
  const [row] = await db
    .insert(userSavedRooms)
    .values({
      userId: input.userId,
      roomCode: cleanCode,
      roomName: input.roomName.slice(0, 80) || `Sala ${cleanCode.toUpperCase()}`,
      hasPin: Boolean(input.hasPin && input.pinCode),
      pinCode: input.hasPin && input.pinCode ? input.pinCode.slice(0, 8) : null,
      hostOnlyControl: Boolean(input.hostOnlyControl),
      lastActiveTitle: input.lastActiveTitle?.slice(0, 200) || null,
      queueItems: Array.isArray(input.queueItems) ? input.queueItems.slice(0, 12) : [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userSavedRooms.userId, userSavedRooms.roomCode],
      set: {
        roomName: input.roomName.slice(0, 80) || `Sala ${cleanCode.toUpperCase()}`,
        hasPin: Boolean(input.hasPin && input.pinCode),
        pinCode: input.hasPin && input.pinCode ? input.pinCode.slice(0, 8) : null,
        hostOnlyControl: Boolean(input.hostOnlyControl),
        lastActiveTitle: input.lastActiveTitle?.slice(0, 200) || null,
        queueItems: Array.isArray(input.queueItems) ? input.queueItems.slice(0, 12) : [],
        updatedAt: new Date(),
      },
    })
    .returning();
  return row || null;
}

export async function deleteUserSavedRoomSql(userId: string, roomCode: string): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  const db = getDb();
  const cleanCode = roomCode.trim().toLowerCase().slice(0, 32);
  const deleted = await db
    .delete(userSavedRooms)
    .where(and(eq(userSavedRooms.userId, userId), eq(userSavedRooms.roomCode, cleanCode)))
    .returning({ id: userSavedRooms.id });
  return deleted.length > 0;
}

export async function listUserCreations(userId: string, limit = 30): Promise<StudioCreationRow[]> {
  if (!isCloudSqlConfigured()) return [];
  const db = getDb();
  return db
    .select()
    .from(studioCreations)
    .where(eq(studioCreations.userId, userId))
    .orderBy(desc(studioCreations.createdAt))
    .limit(Math.min(Math.max(limit, 1), 60));
}

export async function insertUserCreation(input: {
  userId: string;
  kind: 'image' | 'music' | 'video' | 'transcript';
  title: string;
  prompt: string;
  model: string;
  mimeType: string;
  mediaDataUrl: string;
  metadataJson?: Record<string, unknown> | null;
}): Promise<StudioCreationRow | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const [row] = await db
    .insert(studioCreations)
    .values({
      userId: input.userId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      prompt: input.prompt,
      model: input.model.slice(0, 80),
      mimeType: input.mimeType.slice(0, 80),
      mediaDataUrl: input.mediaDataUrl,
      metadataJson: input.metadataJson || null,
    })
    .returning();
  return row || null;
}

export async function deleteUserCreation(userId: string, creationId: number): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  const db = getDb();
  const deleted = await db
    .delete(studioCreations)
    .where(and(eq(studioCreations.id, creationId), eq(studioCreations.userId, userId)))
    .returning({ id: studioCreations.id });
  return deleted.length > 0;
}

export async function listGameLeaderboard(gameId: string, limit = 20): Promise<GameScoreRow[]> {
  if (!isCloudSqlConfigured()) return [];
  const db = getDb();
  return db
    .select()
    .from(gameScores)
    .where(eq(gameScores.gameId, gameId))
    .orderBy(desc(gameScores.score), desc(gameScores.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

export async function insertGameScore(input: {
  userId?: string | null;
  playerName: string;
  gameId: string;
  score: number;
  wave?: number;
}): Promise<GameScoreRow | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const [row] = await db
    .insert(gameScores)
    .values({
      userId: input.userId || null,
      playerName: input.playerName.slice(0, 80) || 'Jugador',
      gameId: input.gameId.slice(0, 64),
      score: Math.max(0, Math.round(input.score)),
      wave: Math.max(1, Math.round(input.wave || 1)),
    })
    .returning();
  return row || null;
}

export async function listUserSavedPlaces(userId: string): Promise<SavedCinemaPlaceRow[]> {
  if (!isCloudSqlConfigured()) return [];
  const db = getDb();
  return db
    .select()
    .from(savedCinemaPlaces)
    .where(eq(savedCinemaPlaces.userId, userId))
    .orderBy(desc(savedCinemaPlaces.createdAt))
    .limit(50);
}

export async function upsertUserSavedPlace(input: {
  userId: string;
  placeId: string;
  name: string;
  formattedAddress?: string | null;
  category?: string;
  notes?: string | null;
  googleMapsUri?: string | null;
}): Promise<SavedCinemaPlaceRow | null> {
  if (!isCloudSqlConfigured()) return null;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(savedCinemaPlaces)
    .where(
      and(
        eq(savedCinemaPlaces.userId, input.userId),
        eq(savedCinemaPlaces.placeId, input.placeId)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(savedCinemaPlaces)
      .set({
        name: input.name.slice(0, 200),
        formattedAddress: input.formattedAddress?.slice(0, 400) || existing.formattedAddress,
        category: input.category || existing.category,
        notes: input.notes ?? existing.notes,
        googleMapsUri: input.googleMapsUri ?? existing.googleMapsUri,
      })
      .where(eq(savedCinemaPlaces.id, existing.id))
      .returning();
    return updated || existing;
  }

  const [created] = await db
    .insert(savedCinemaPlaces)
    .values({
      userId: input.userId,
      placeId: input.placeId.slice(0, 256),
      name: input.name.slice(0, 200),
      formattedAddress: input.formattedAddress?.slice(0, 400) || null,
      category: (input.category || 'cinema').slice(0, 64),
      notes: input.notes || null,
      googleMapsUri: input.googleMapsUri || null,
    })
    .returning();
  return created || null;
}

export async function deleteUserSavedPlace(userId: string, placeRecordId: number): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  const db = getDb();
  const deleted = await db
    .delete(savedCinemaPlaces)
    .where(
      and(eq(savedCinemaPlaces.id, placeRecordId), eq(savedCinemaPlaces.userId, userId))
    )
    .returning({ id: savedCinemaPlaces.id });
  return deleted.length > 0;
}
