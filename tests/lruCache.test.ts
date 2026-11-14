import { describe, it, expect, vi } from 'vitest';
import { LruTtlCache } from '../src/shared/lruCache';

describe('LruTtlCache Unit Tests (F1.9)', () => {
  it('stores and retrieves cached items within TTL', () => {
    const cache = new LruTtlCache<string, number>(3, 5000);
    cache.set('a', 100);
    expect(cache.get('a')).toBe(100);
    expect(cache.has('a')).toBe(true);
  });

  it('evicts oldest entries when reaching maxSize', () => {
    const cache = new LruTtlCache<string, string>(3, 10000);
    cache.set('a', 'one');
    cache.set('b', 'two');
    cache.set('c', 'three');
    cache.get('a'); // access 'a' so 'b' becomes oldest
    cache.set('d', 'four'); // causes eviction of 'b'

    expect(cache.get('a')).toBe('one');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('three');
    expect(cache.get('d')).toBe('four');
  });

  it('expires items past TTL', () => {
    vi.useFakeTimers();
    const cache = new LruTtlCache<string, string>(5, 1000);
    cache.set('token', 'abc');
    expect(cache.get('token')).toBe('abc');

    vi.advanceTimersByTime(1500);
    expect(cache.get('token')).toBeUndefined();
    vi.useRealTimers();
  });
});
