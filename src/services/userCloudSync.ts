export {
  shouldSkipStaleCloudWrite,
  buildHistoryDocId,
  buildFavoriteDocId,
  buildSavedRoomDocId,
} from './cloudSync/cloudSyncSanitizers';

export {
  type GoogleSignInResult,
  signInWithGoogleAccountDetailed,
  signInWithGoogleAccount,
  signOutGoogleAccount,
  subscribeAuthState,
  ensureCloudUserProfile,
  updateCloudUserProfile,
} from './cloudSync/cloudAuthAndProfile';

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
