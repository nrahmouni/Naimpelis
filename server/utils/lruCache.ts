import { LruTtlCache } from '../../src/shared/lruCache.ts';

export { LruTtlCache };

/**
 * Deduplicates concurrent in-flight async calls sharing the same key so
 * upstream TMDB / Sports / EPG providers are never hammered in bursts.
 */
export class SingleFlightRegistry<V> {
  private inflight = new Map<string, Promise<V>>();

  async run(key: string, fn: () => Promise<V>): Promise<V> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = fn().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  get size(): number {
    return this.inflight.size;
  }
}
