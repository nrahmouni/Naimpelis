/**
 * Fast in-memory LRU Cache with TTL expiry and size bounds.
 * Prevents memory leaks and unbound growth across long-running node processes.
 */
export class LruTtlCache<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;

  constructor(maxSize = 250, defaultTtlMs = 5 * 60 * 1000) {
    this.maxSize = Math.max(1, maxSize);
    this.defaultTtlMs = Math.max(1000, defaultTtlMs);
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Re-insert to refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest item
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  *entries(): IterableIterator<[K, V]> {
    const now = Date.now();
    for (const [k, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(k);
        continue;
      }
      yield [k, entry.value];
    }
  }

  get size(): number {
    return this.cache.size;
  }
}
