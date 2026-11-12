# Firestore Zero-Trust Security Specification — NAIMCINE

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched under `/userProfiles/{userId}`, `/watchHistory/{historyId}`, `/favorites/{favoriteId}`, `/savedRooms/{savedRoomId}`, or `/friends/{friendDocId}` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Gate**: Every read (`get`, `list`) and write (`create`, `update`, `delete`) requires `request.auth != null && request.auth.token.email_verified == true`. Unauthenticated and unverified-email tokens are rejected everywhere.
3. **Zero PII & Strict Owner Isolation**: `/userProfiles/{userId}` stores zero PII (no email/phone/address), forbids `list` scraping (`allow list: if false`), and restricts `get`, `create`, `update`, and `delete` strictly to `userId == request.auth.uid`. Similarly, `/savedRooms/{savedRoomId}` and `/friends/{friendDocId}` isolate room PINs and friend lists strictly to `existing().uid == request.auth.uid`.
4. **Composite Key Anti-Squatting & Safe Non-Existent `getDoc` Probes**:
   - On `create`: `docId == request.auth.uid + '_' + incoming().itemId` (or `favId` / `roomCode` / `friendId`) and `incoming().uid == request.auth.uid`.
   - On `get` and `delete`: When `resource == null` (document does not yet exist or was already deleted on another device), access is permitted **only** if `docId` strictly matches `^<request.auth.uid>_[a-zA-Z0-9_\-]+$`, preventing cross-user existence probing while enabling clean client upsert checks. When `resource != null`, `existing().uid == request.auth.uid` and exact composite ID equality are enforced.
5. **Immutable Identity & Temporal Integrity**:
   - On `create`: `uid == request.auth.uid`, `createdAt == request.time`, `updatedAt == request.time`.
   - On `update`: `uid`, `createdAt`, `itemId`/`favId`/`roomCode`/`friendId`, and `mediaType`/`kind` are strictly immutable (`incoming().field == existing().field`), and `updatedAt == request.time`.
6. **Secure List Queries (No Client Delegation)**: `/watchHistory`, `/favorites`, `/savedRooms`, and `/friends` enforce `resource.data.uid == request.auth.uid` inside `allow list` with zero `get()`/`exists()` calls, preventing cross-user scraping and O(n) read-cost amplification.
7. **Volumetric, Array & PIN Invariants**: Every path ID on single-document operations passes `isValidId()` (`<= 160` chars, `^[a-zA-Z0-9_\-]+$`), `SavedRoom.queueItems` is bounded to `<= 12` map entries, and `SavedRoom.pinCode` must match `^[0-9]{4}$` iff `hasPin == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Payload 1 (Identity Spoofing on Create)**: Authenticated `userA` creates `/watchHistory/userB_movie-1` with `{ uid: "userB", ... }` -> `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Token)**: Authenticated `userA` with `email_verified: false` writes `/userProfiles/userA` -> `PERMISSION_DENIED`.
3. **Payload 3 (Shadow / Ghost Field Injection on Create)**: `userA` creates `/favorites/userA_movie-1` including `{ ..., isAdmin: true }` -> `PERMISSION_DENIED` (`hasOnly` rejects ghost key).
4. **Payload 4 (Update-Gap Value Poisoning)**: `userA` updates whitelisted key `resumeTimeSec` on `/watchHistory/userA_movie-1` with `"9999999"` (string instead of bounded number) -> `PERMISSION_DENIED` (`isValidWatchHistoryItem(incoming())` wraps `allow update`).
5. **Payload 5 (Ownership Transfer on Update)**: `userA` updates `uid` on `/savedRooms/userA_k8x4` to `"userB"` -> `PERMISSION_DENIED` (`affectedKeys().hasOnly` + `incoming().uid == existing().uid`).
6. **Payload 6 (Forged Client Timestamp)**: `userA` creates `/favorites/userA_ch-1` with `createdAt: Timestamp(2020-01-01)` -> `PERMISSION_DENIED` (`createdAt == request.time`).
7. **Payload 7 (Immortal `createdAt` Mutation)**: `userA` updates `/userProfiles/userA` altering `createdAt` -> `PERMISSION_DENIED`.
8. **Payload 8 (Cross-User SavedRoom PIN Read / Probe)**: `userA` performs `getDoc(/savedRooms/userB_k8x4)` (existing or non-existent) to steal `pinCode` -> `PERMISSION_DENIED`.
9. **Payload 9 (Unfiltered Collection Scrape)**: `userA` runs `getDocs(collection('friends'))` without `where('uid', '==', 'userA')` -> `PERMISSION_DENIED`.
10. **Payload 10 (Composite Key Anti-Squatting Mismatch)**: `userA` creates `/friends/userA_friend-999` where payload `friendId` is `"friend-1"` -> `PERMISSION_DENIED` (`friendDocId == request.auth.uid + '_' + incoming().friendId`).
11. **Payload 11 (Malformed PIN / Unbounded Queue Array)**: `userA` creates `/savedRooms/userA_k8x4` with `hasPin: true, pinCode: "abcd"` or `queueItems` of length 50 -> `PERMISSION_DENIED`.
12. **Payload 12 (Denial-of-Wallet Oversized String)**: `userA` writes a 50KB `friendName` string into `/friends/userA_friend-5` -> `PERMISSION_DENIED` (`friendName.size() <= 40`).
