# Firestore Zero-Trust Security Specification — NAIMCINE

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched under `/userProfiles/{userId}`, `/watchHistory/{historyId}`, or `/favorites/{favoriteId}` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Gate**: Every read (`get`, `list`) and write (`create`, `update`, `delete`) requires `request.auth != null && request.auth.token.email_verified == true`. Unauthenticated and unverified-email tokens are rejected everywhere.
3. **Zero PII & Strict Owner Isolation**: `/userProfiles/{userId}` stores zero PII (no email/phone/address), forbids `list` scraping (`allow list: if false`), and restricts `get`, `create`, `update`, and `delete` strictly to `userId == request.auth.uid`.
4. **Relational Consistency (No Orphaned Records)**: A `WatchHistoryItem` or `FavoriteItem` can only be created if its owner `/userProfiles/$(request.auth.uid)` exists (`exists(...) || existsAfter(...)` for atomic first-login batch migration).
5. **Immutable Identity & Temporal Integrity**:
   - On `create`: `uid == request.auth.uid`, `createdAt == request.time`, `updatedAt == request.time`.
   - On `update`: `uid`, `createdAt`, `itemId`/`favId`, and `mediaType`/`kind` are strictly immutable (`incoming().field == existing().field`), and `updatedAt == request.time`.
6. **Secure List Queries (No Client Delegation)**: Both `/watchHistory` and `/favorites` enforce `resource.data.uid == request.auth.uid` inside `allow list` with zero `get()`/`exists()` calls, preventing cross-user scraping and O(n) read-cost amplification.
7. **Volumetric & Regex Hardening**: Every path ID on single-document operations passes `isValidId()` (`<= 128` chars, `^[a-zA-Z0-9_\-]+$`), and every string/number field is bounded by strict type and `.size()` limits.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Payload 1 (Identity Spoofing on Create)**: Authenticated `userA` creates `/watchHistory/userB_movie-1` with `{ uid: "userB", ... }` -> `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Token)**: Authenticated `userA` with `email_verified: false` writes `/userProfiles/userA` -> `PERMISSION_DENIED`.
3. **Payload 3 (Shadow / Ghost Field Injection on Create)**: `userA` creates `/favorites/userA_movie-1` including `{ ..., isAdmin: true }` -> `PERMISSION_DENIED` (`hasOnly` rejects ghost key).
4. **Payload 4 (Update-Gap Value Poisoning)**: `userA` updates whitelisted key `resumeTimeSec` on `/watchHistory/userA_movie-1` with `"9999999"` (string instead of bounded number) -> `PERMISSION_DENIED` (`isValidWatchHistoryItem(incoming())` wraps `allow update`).
5. **Payload 5 (Ownership Transfer on Update)**: `userA` updates `uid` on `/watchHistory/userA_movie-1` to `"userB"` -> `PERMISSION_DENIED` (`affectedKeys().hasOnly` + `incoming().uid == existing().uid`).
6. **Payload 6 (Forged Client Timestamp)**: `userA` creates `/favorites/userA_ch-1` with `createdAt: Timestamp(2020-01-01)` -> `PERMISSION_DENIED` (`createdAt == request.time`).
7. **Payload 7 (Immortal `createdAt` Mutation)**: `userA` updates `/userProfiles/userA` altering `createdAt` -> `PERMISSION_DENIED`.
8. **Payload 8 (Cross-User Profile Read)**: `userA` performs `getDoc(/userProfiles/userB)` or `getDocs(collection('userProfiles'))` -> `PERMISSION_DENIED`.
9. **Payload 9 (Unfiltered Collection Scrape)**: `userA` runs `getDocs(collection('watchHistory'))` without `where('uid', '==', 'userA')` -> `PERMISSION_DENIED`.
10. **Payload 10 (Orphaned Write Without UserProfile)**: `userC` (who has no `/userProfiles/userC` doc and does not create it in batch) creates `/favorites/userC_series-10` -> `PERMISSION_DENIED`.
11. **Payload 11 (ID Poisoning / 2KB Path Variable)**: `userA` writes `/favorites/userA_...2000chars...` or `/favorites/bad$id!` -> `PERMISSION_DENIED` (`isValidId` guard).
12. **Payload 12 (Denial-of-Wallet Oversized String)**: `userA` writes a 50KB `title` string into `/watchHistory/userA_movie-5` -> `PERMISSION_DENIED` (`title.size() <= 200`).
