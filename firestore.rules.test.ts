/**
 * Phase 0 Security TDD Specification for firestore.rules
 * Verifies that all "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SECURITY_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on WatchHistory Create',
    collection: 'watchHistory',
    docId: 'userB_movie-100',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userB',
      itemId: 'movie-100',
      mediaType: 'movie',
      title: 'Dune',
      subtitle: 'HD',
      poster: 'https://img.example/p.jpg',
      backdrop: 'https://img.example/b.jpg',
      preferLang: 'ES',
      resumeTimeSec: 120,
      durationSec: 7200,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Token Write',
    collection: 'userProfiles',
    docId: 'userA',
    operation: 'create',
    auth: { uid: 'userA', email_verified: false },
    payload: {
      uid: 'userA',
      displayName: 'Spoofer',
      avatar: '🍿',
      color: '#E11D48',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow / Ghost Field Injection on Favorite Create',
    collection: 'favorites',
    docId: 'userA_movie-1',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      favId: 'movie-1',
      kind: 'movie',
      title: 'Interstellar',
      subtitle: '2014',
      poster: 'https://img.example/p.jpg',
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Update-Gap Value Poisoning on resumeTimeSec',
    collection: 'watchHistory',
    docId: 'userA_movie-1',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      resumeTimeSec: 'INVALID_STRING_TYPE',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Ownership Transfer on WatchHistory Update',
    collection: 'watchHistory',
    docId: 'userA_movie-1',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userB',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Forged Past Client Timestamp on Create',
    collection: 'favorites',
    docId: 'userA_channel-dazn',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      favId: 'channel-dazn',
      kind: 'channel',
      title: 'DAZN LaLiga',
      subtitle: '24/7',
      poster: '/icon.svg',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immortal createdAt Mutation on Profile Update',
    collection: 'userProfiles',
    docId: 'userA',
    operation: 'update',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      displayName: 'Updated',
      createdAt: '2099-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Cross-User Profile Read',
    collection: 'userProfiles',
    docId: 'userB',
    operation: 'get',
    auth: { uid: 'userA', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Unfiltered WatchHistory List Scrape',
    collection: 'watchHistory',
    docId: '*',
    operation: 'list',
    auth: { uid: 'userA', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Orphaned Favorite Without Parent UserProfile',
    collection: 'favorites',
    docId: 'orphanUser_series-55',
    operation: 'create',
    auth: { uid: 'orphanUser', email_verified: true },
    payload: {
      uid: 'orphanUser',
      favId: 'series-55',
      kind: 'series',
      title: 'Severance',
      subtitle: 'TV Series',
      poster: 'https://img.example/s.jpg',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Path Variable ID Poisoning (Special Characters / >128 bytes)',
    collection: 'favorites',
    docId: 'userA_bad$path!injection',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      favId: 'movie-1',
      kind: 'movie',
      title: 'Valid',
      subtitle: 'HD',
      poster: '/icon.svg',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Denial-of-Wallet Oversized String Field',
    collection: 'watchHistory',
    docId: 'userA_movie-9',
    operation: 'create',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      itemId: 'movie-9',
      mediaType: 'movie',
      title: 'X'.repeat(5000),
      subtitle: 'HD',
      poster: '/icon.svg',
      backdrop: '/icon.svg',
      preferLang: 'ES',
      resumeTimeSec: 0,
      durationSec: 100,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
