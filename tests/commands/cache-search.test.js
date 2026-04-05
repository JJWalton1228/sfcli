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

describe('Stale-while-revalidate', () => {
  let staleDir, staleDb;

  beforeEach(() => {
    staleDir = mkdtempSync(join(tmpdir(), 'sfcli-swr-'));
    staleDb = createCache({ dbPath: join(staleDir, 'cache.db'), ttlSeconds: 0 }); // immediately stale
  });

  afterEach(() => {
    staleDb.close();
    rmSync(staleDir, { recursive: true, force: true });
  });

  it('should return stale data immediately without waiting for API when SWR is enabled', async () => {
    staleDb.putMany('jobs', [
      { id: 1, number: 'J-1', status: 'Completed', customer_name: 'Acme' },
    ]);

    let apiResolved = false;
    const slowFetcher = () => new Promise(resolve => {
      setTimeout(() => {
        apiResolved = true;
        resolve([{ id: 1, number: 'J-1', status: 'Scheduled', customer_name: 'Acme' }]);
      }, 500);
    });

    const search = createCacheAwareSearch(staleDb, 'jobs', slowFetcher, { staleWhileRevalidate: true });
    const results = await search({});

    // Should return stale data immediately, before API resolves
    expect(apiResolved).toBe(false);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('Completed'); // stale data
  });

  it('should update cache in the background after SWR returns', async () => {
    staleDb.putMany('jobs', [
      { id: 1, number: 'J-1', status: 'Completed', customer_name: 'Acme' },
    ]);

    const freshData = [
      { id: 1, number: 'J-1', status: 'Scheduled', customer_name: 'Acme' },
      { id: 2, number: 'J-2', status: 'New', customer_name: 'Beta' },
    ];
    const fetcher = () => Promise.resolve(freshData);

    const search = createCacheAwareSearch(staleDb, 'jobs', fetcher, { staleWhileRevalidate: true });
    await search({});

    // Wait for background refresh to complete
    await new Promise(r => setTimeout(r, 50));

    const cached = staleDb.get('jobs', 2);
    expect(cached).toBeTruthy();
    expect(cached.customer_name).toBe('Beta');
  });

  it('should do blocking fetch when SWR is enabled but cache is empty', async () => {
    const freshDb = createCache({ dbPath: join(staleDir, 'empty.db'), ttlSeconds: 0 });
    const freshData = [{ id: 1, number: 'J-1', status: 'New', customer_name: 'Acme' }];
    const fetcher = () => Promise.resolve(freshData);

    const search = createCacheAwareSearch(freshDb, 'jobs', fetcher, { staleWhileRevalidate: true });
    const results = await search({});

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('New');
    freshDb.close();
  });

  it('should not throw when background refresh fails under SWR', async () => {
    staleDb.putMany('jobs', [
      { id: 1, number: 'J-1', status: 'Completed', customer_name: 'Acme' },
    ]);

    const fetcher = () => Promise.reject(new Error('Network error'));

    const search = createCacheAwareSearch(staleDb, 'jobs', fetcher, { staleWhileRevalidate: true });
    const results = await search({});

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('Completed');

    // Wait to ensure no unhandled rejection
    await new Promise(r => setTimeout(r, 50));
  });

  it('should preserve blocking behavior when SWR is disabled (default)', async () => {
    staleDb.putMany('jobs', [
      { id: 1, number: 'J-1', status: 'Old', customer_name: 'Acme' },
    ]);

    const freshData = [{ id: 1, number: 'J-1', status: 'Fresh', customer_name: 'Acme' }];
    const fetcher = () => Promise.resolve(freshData);

    const search = createCacheAwareSearch(staleDb, 'jobs', fetcher); // no SWR
    const results = await search({});

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('Fresh'); // blocking fetch got fresh data
  });
});
