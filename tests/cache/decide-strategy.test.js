import { describe, it, expect } from 'vitest';
import { decideStrategy } from '../../src/cache/decide-strategy.js';

describe('decideStrategy', () => {
  it('returns use-cache when cache is fresh in auto mode', () => {
    const action = decideStrategy({
      status: { stale: false, count: 10 },
      mode: 'auto',
      now: 1_000_000,
    });
    expect(action).toBe('use-cache');
  });

  it('returns fetch-or-fail in bypass mode regardless of cache state', () => {
    expect(decideStrategy({ status: { stale: false, count: 99 }, mode: 'bypass', now: 0 })).toBe('fetch-or-fail');
    expect(decideStrategy({ status: { stale: true, count: 5 }, mode: 'bypass', now: 0 })).toBe('fetch-or-fail');
    expect(decideStrategy({ status: { stale: true, count: 0 }, mode: 'bypass', now: 0 })).toBe('fetch-or-fail');
  });

  it('returns fetch-or-fail when cache is empty in auto/fresh/swr modes', () => {
    const empty = { stale: true, count: 0 };
    expect(decideStrategy({ status: empty, mode: 'auto', now: 0 })).toBe('fetch-or-fail');
    expect(decideStrategy({ status: empty, mode: 'fresh', now: 0 })).toBe('fetch-or-fail');
    expect(decideStrategy({ status: empty, mode: 'swr', now: 0 })).toBe('fetch-or-fail');
  });

  it('returns fetch-blocking when cache is stale with items in auto mode', () => {
    const action = decideStrategy({
      status: { stale: true, count: 25 },
      mode: 'auto',
      now: 0,
    });
    expect(action).toBe('fetch-blocking');
  });

  it('returns revalidate-bg when cache is stale with items in swr mode', () => {
    const action = decideStrategy({
      status: { stale: true, count: 25 },
      mode: 'swr',
      now: 0,
    });
    expect(action).toBe('revalidate-bg');
  });

  it('returns fetch-blocking when cache is stale with items in fresh mode (no background)', () => {
    const action = decideStrategy({
      status: { stale: true, count: 25 },
      mode: 'fresh',
      now: 0,
    });
    expect(action).toBe('fetch-blocking');
  });

  it('returns use-cache for fresh cache in swr and fresh modes', () => {
    const fresh = { stale: false, count: 10 };
    expect(decideStrategy({ status: fresh, mode: 'swr', now: 0 })).toBe('use-cache');
    expect(decideStrategy({ status: fresh, mode: 'fresh', now: 0 })).toBe('use-cache');
  });

  it('recomputes stale from ttlSeconds + refreshedAt when ttlSeconds is provided', () => {
    // refreshedAt 2000s ago, ttl 1000s → stale
    const status = { stale: false, count: 10, refreshedAt: 1_000_000 };
    const now = 1_000_000 + 2000 * 1000;
    const action = decideStrategy({ status, mode: 'auto', now, ttlSeconds: 1000 });
    expect(action).toBe('fetch-blocking');
  });

  it('recomputes fresh from ttlSeconds + refreshedAt when within window', () => {
    // refreshedAt 500s ago, ttl 1000s → fresh even if status.stale was true
    const status = { stale: true, count: 10, refreshedAt: 1_000_000 };
    const now = 1_000_000 + 500 * 1000;
    const action = decideStrategy({ status, mode: 'auto', now, ttlSeconds: 1000 });
    expect(action).toBe('use-cache');
  });
});
