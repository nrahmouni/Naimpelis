import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 128 }),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userProfiles = pgTable('user_profiles', {
  userId: varchar('user_id', { length: 128 })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 64 }).notNull(),
  avatar: varchar('avatar', { length: 16 }).notNull().default('🍿'),
  color: varchar('color', { length: 16 }).notNull().default('#9146FF'),
  friendCode: varchar('friend_code', { length: 32 }),
  photoUrl: text('photo_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userFavorites = pgTable(
  'user_favorites',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    favKey: varchar('fav_key', { length: 128 }).notNull(),
    kind: varchar('kind', { length: 16 }).notNull().default('movie'),
    tmdbId: integer('tmdb_id'),
    title: varchar('title', { length: 200 }).notNull(),
    subtitle: varchar('subtitle', { length: 240 }),
    poster: text('poster'),
    backdrop: text('backdrop'),
    year: varchar('year', { length: 16 }),
    rating: varchar('rating', { length: 16 }),
    mediaUrl: text('media_url'),
    channelLabel: varchar('channel_label', { length: 120 }),
    competition: varchar('competition', { length: 120 }),
    sport: varchar('sport', { length: 24 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_favorites_user_fav_idx').on(table.userId, table.favKey)]
);

export const userWatchHistory = pgTable(
  'user_watch_history',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemKey: varchar('item_key', { length: 128 }).notNull(),
    mediaType: varchar('media_type', { length: 16 }).notNull().default('movie'),
    tmdbId: integer('tmdb_id'),
    title: varchar('title', { length: 200 }).notNull(),
    subtitle: varchar('subtitle', { length: 240 }),
    poster: text('poster'),
    backdrop: text('backdrop'),
    year: varchar('year', { length: 16 }),
    season: integer('season'),
    episode: integer('episode'),
    episodeTitle: varchar('episode_title', { length: 200 }),
    preferLang: varchar('prefer_lang', { length: 8 }).notNull().default('ES'),
    bingetrixUrl: text('bingetrix_url'),
    movidyUrl: text('movidy_url'),
    resumeTimeSec: integer('resume_time_sec').notNull().default(0),
    durationSec: integer('duration_sec').notNull().default(0),
    watchedAt: timestamp('watched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_watch_history_user_item_idx').on(table.userId, table.itemKey)]
);

export const userFriends = pgTable(
  'user_friends',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    friendId: varchar('friend_id', { length: 128 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    avatar: varchar('avatar', { length: 16 }).notNull().default('🍿'),
    color: varchar('color', { length: 16 }).notNull().default('#9146FF'),
    friendCode: varchar('friend_code', { length: 32 }),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_friends_user_friend_idx').on(table.userId, table.friendId)]
);

export const userSavedRooms = pgTable(
  'user_saved_rooms',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roomCode: varchar('room_code', { length: 32 }).notNull(),
    roomName: varchar('room_name', { length: 80 }).notNull(),
    hasPin: boolean('has_pin').notNull().default(false),
    pinCode: varchar('pin_code', { length: 8 }),
    hostOnlyControl: boolean('host_only_control').notNull().default(false),
    lastActiveTitle: varchar('last_active_title', { length: 200 }),
    queueItems: jsonb('queue_items').$type<Record<string, unknown>[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_saved_rooms_user_room_idx').on(table.userId, table.roomCode)]
);

export const studioCreations = pgTable('studio_creations', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 128 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 32 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  prompt: text('prompt').notNull(),
  model: varchar('model', { length: 80 }).notNull(),
  mimeType: varchar('mime_type', { length: 80 }).notNull(),
  mediaDataUrl: text('media_data_url').notNull(),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const gameScores = pgTable('game_scores', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 128 }).references(() => users.id, {
    onDelete: 'set null',
  }),
  playerName: varchar('player_name', { length: 80 }).notNull(),
  gameId: varchar('game_id', { length: 64 }).notNull(),
  score: integer('score').notNull(),
  wave: integer('wave').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const savedCinemaPlaces = pgTable('saved_cinema_places', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 128 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  placeId: varchar('place_id', { length: 256 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  formattedAddress: varchar('formatted_address', { length: 400 }),
  category: varchar('category', { length: 64 }).notNull().default('cinema'),
  notes: text('notes'),
  googleMapsUri: text('google_maps_uri'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type DbUser = typeof users.$inferSelect;
export type UserProfileRow = typeof userProfiles.$inferSelect;
export type UserFavoriteRow = typeof userFavorites.$inferSelect;
export type UserWatchHistoryRow = typeof userWatchHistory.$inferSelect;
export type UserFriendRow = typeof userFriends.$inferSelect;
export type UserSavedRoomRow = typeof userSavedRooms.$inferSelect;
export type StudioCreationRow = typeof studioCreations.$inferSelect;
export type GameScoreRow = typeof gameScores.$inferSelect;
export type SavedCinemaPlaceRow = typeof savedCinemaPlaces.$inferSelect;
