export {
  shouldSkipStaleCloudWrite,
  buildHistoryDocId,
  buildFavoriteDocId,
  buildSavedRoomDocId,
} from './cloudSync/cloudSyncSanitizers';

export {
  type GoogleSignInResult,
  type GoogleSignInOptions,
  checkGoogleRedirectSignInResult,
  signInWithGoogleAccountDetailed,
  signInWithGoogleAccount,
  signOutGoogleAccount,
  subscribeAuthState,
  ensureCloudUserProfile,
  updateCloudUserProfile,
} from './cloudSync/cloudAuthAndProfile';

export {
  type SqlAccountState,
  fetchSqlAccountState,
  toCloudUserLike,
} from './cloudSync/cloudSqlSync';

export {
  upsertCloudWatchHistory,
  updateCloudWatchProgressOnly,
  flushPendingCloudWatchProgress,
  deleteCloudWatchHistoryItem,
  clearCloudWatchHistoryItems,
  upsertCloudCatalogFavorite,
  upsertCloudChannelFavorite,
  deleteCloudFavoriteById,
  deleteCloudCatalogFavoriteAndDuplicates,
} from './cloudSync/cloudMediaSync';

export {
  upsertCloudSavedRoom,
  deleteCloudSavedRoom,
  upsertCloudFriend,
  deleteCloudFriend,
  subscribeUserCloudCollections,
  migrateLocalStateToCloud,
} from './cloudSync/cloudRoomsAndFriendsSync';
