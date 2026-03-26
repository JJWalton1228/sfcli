import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';
import { createCacheAwareSearch } from '../../src/utils/cache-search.js';

let cacheDir;
let cache;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'sfcli-csearch-test-'));
  cache = createCache({ dbPath: join(cacheDir, 'cache.db'), ttlSeconds: 3600 });
});

afterEach(() => {
  cache.close();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe('Cache-aware search', () => {
  it('should return cached results when cache is fresh', async () => {
    cache.putMany('customers', [
      { id: 1, customer_name: 'Kaiser Santa Clara', city: 'SANTA CLARA', state: 'Ca' },
      { id: 2, customer_name: 'Golden Gate Glass', city: 'SAN FRANCISCO', state: 'Ca' },
    ]);

    let apiFetchCalled = false;
    const apiFetcher = async () => {
      apiFetchCalled = true;
      return [];
    };

    const search = createCacheAwareSearch(cache, 'customers', apiFetcher);
    const results = await search({ q: 'Kaiser' });

    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Kaiser Santa Clara');
    expect(apiFetchCalled).toBe(false); // Should NOT hit API
  });

  it('should fall back to API when cache is stale', async () => {
    const staleCache = createCache({
      dbPath: join(cacheDir, 'stale.db'),
      ttlSeconds: 0, // immediately stale
    });
    staleCache.putMany('customers', [
      { id: 1, customer_name: 'Old Data' },
    ]);

    const freshData = [
      { id: 1, customer_name: 'Kaiser Fresh', city: 'SANTA CLARA' },
      { id: 2, customer_name: 'Golden Gate Glass', city: 'SF' },
    ];
    const apiFetcher = async () => freshData;

    const search = createCacheAwareSearch(staleCache, 'customers', apiFetcher);
    const results = await search({ q: 'Kaiser' });

    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Kaiser Fresh');

    // Cache should now be updated
    const cached = staleCache.get('customers', 1);
    expect(cached.customer_name).toBe('Kaiser Fresh');

    staleCache.close();
  });

  it('should use stale cache as fallback when API fails', async () => {
    const staleCache = createCache({
      dbPath: join(cacheDir, 'stale-fallback.db'),
      ttlSeconds: 0,
    });
    staleCache.putMany('customers', [
      { id: 1, customer_name: 'Kaiser Stale', city: 'SANTA CLARA' },
    ]);

    const apiFetcher = async () => { throw new Error('Network error'); };

    const search = createCacheAwareSearch(staleCache, 'customers', apiFetcher);
    const results = await search({ q: 'Kaiser' });

    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Kaiser Stale');

    staleCache.close();
  });

  it('should bypass cache when noCache option is true', async () => {
    cache.putMany('customers', [
      { id: 1, customer_name: 'Cached Data' },
    ]);

    const freshData = [{ id: 1, customer_name: 'Fresh Data' }];
    let apiFetchCalled = false;
    const apiFetcher = async () => {
      apiFetchCalled = true;
      return freshData;
    };

    const search = createCacheAwareSearch(cache, 'customers', apiFetcher);
    const results = await search({ q: 'Fresh' }, { noCache: true });

    expect(apiFetchCalled).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Fresh Data');
  });

  it('should throw when API fails and no cache exists', async () => {
    const apiFetcher = async () => { throw new Error('Network error'); };
    const search = createCacheAwareSearch(cache, 'customers', apiFetcher);

    await expect(search({ q: 'anything' })).rejects.toThrow('Network error');
  });
});
