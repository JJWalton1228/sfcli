import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';
import { createEntityCache } from '../../src/cache/entity-cache.js';

/**
 * Integration tests for the entity-cache deep module. Uses a real (temp) SQLite
 * cache and a stub SF client factory to assert end-to-end behavior across the
 * SWR decision matrix and lifecycle rules.
 */
describe('entity-cache', () => {
  let dir;
  let cacheFactory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-ec-'));
    cacheFactory = () => createCache({ dbPath: join(dir, 'cache.db') });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns cached items without constructing a client on fresh-cache hit', async () => {
    // Pre-populate cache so it is fresh
    const seed = cacheFactory();
    seed.putMany('customers', [
      { id: 1, customer_name: 'Acme' },
      { id: 2, customer_name: 'Globex' },
    ]);
    seed.close();

    const clientFactory = vi.fn(() => { throw new Error('client must not be constructed on fresh hit'); });
    const ec = createEntityCache({ cacheFactory, clientFactory });

    const items = await ec.findCached('customers', {});

    expect(items).toHaveLength(2);
    expect(items.map(i => i.customer_name).sort()).toEqual(['Acme', 'Globex']);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('fetches from client, stores, and returns when cache is empty', async () => {
    const client = stubCustomersClient([
      { id: 1, customer_name: 'Acme', contacts: [], locations: [] },
      { id: 2, customer_name: 'Globex', contacts: [], locations: [] },
    ]);
    const clientFactory = vi.fn(() => client);
    const ec = createEntityCache({ cacheFactory, clientFactory });

    const items = await ec.findCached('customers', {});

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(items.map(i => i.customer_name).sort()).toEqual(['Acme', 'Globex']);

    // Verify the cache was populated
    const verify = cacheFactory();
    expect(verify.status('customers').count).toBe(2);
    verify.close();
  });

  it('bypasses cache and fetches when noCache option is set, even for fresh cache', async () => {
    const seed = cacheFactory();
    seed.putMany('customers', [{ id: 1, customer_name: 'Stale Name' }]);
    seed.close();

    const client = stubCustomersClient([
      { id: 1, customer_name: 'Fresh Name', contacts: [], locations: [] },
    ]);
    const clientFactory = vi.fn(() => client);
    const ec = createEntityCache({ cacheFactory, clientFactory });

    const items = await ec.findCached('customers', {}, { noCache: true });

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(items[0].customer_name).toBe('Fresh Name');
  });

  it('returns stale data immediately and refreshes in background in swr mode', async () => {
    // Use TTL=0 so any cached data is immediately considered stale
    const staleCacheFactory = () => createCache({ dbPath: join(dir, 'cache.db'), ttlSeconds: 0 });
    const seed = staleCacheFactory();
    seed.putMany('customers', [{ id: 1, customer_name: 'Stale' }]);
    seed.close();

    const client = stubCustomersClient([
      { id: 1, customer_name: 'Refreshed', contacts: [], locations: [] },
    ]);
    const clientFactory = vi.fn(() => client);
    const ec = createEntityCache({ cacheFactory: staleCacheFactory, clientFactory });

    const items = await ec.findCached('customers', {}, { mode: 'swr' });

    // Foreground returned stale data immediately
    expect(items[0].customer_name).toBe('Stale');

    // Background refresh should be awaitable
    await ec.pendingRefreshes();

    // After background settles, cache has fresh data
    const verify = staleCacheFactory();
    const refreshed = verify.search('customers', {});
    expect(refreshed[0].customer_name).toBe('Refreshed');
    verify.close();

    expect(clientFactory).toHaveBeenCalledTimes(1);
  });

  it('fetches blocking when cache is stale in auto mode', async () => {
    const staleCacheFactory = () => createCache({ dbPath: join(dir, 'cache.db'), ttlSeconds: 0 });
    const seed = staleCacheFactory();
    seed.putMany('customers', [{ id: 1, customer_name: 'Old' }]);
    seed.close();

    const client = stubCustomersClient([
      { id: 1, customer_name: 'New', contacts: [], locations: [] },
    ]);
    const ec = createEntityCache({ cacheFactory: staleCacheFactory, clientFactory: () => client });

    const items = await ec.findCached('customers', {});

    expect(items[0].customer_name).toBe('New');
  });

  it('falls back to stale cache when blocking fetch fails', async () => {
    const staleCacheFactory = () => createCache({ dbPath: join(dir, 'cache.db'), ttlSeconds: 0 });
    const seed = staleCacheFactory();
    seed.putMany('customers', [{ id: 1, customer_name: 'Stale But Usable' }]);
    seed.close();

    const failingClient = {
      get: vi.fn(async () => { throw new Error('network down'); }),
    };
    const ec = createEntityCache({ cacheFactory: staleCacheFactory, clientFactory: () => failingClient });

    const items = await ec.findCached('customers', {});

    expect(items[0].customer_name).toBe('Stale But Usable');
  });

  it('throws when fetch fails and no cache is available', async () => {
    const failingClient = {
      get: vi.fn(async () => { throw new Error('network down'); }),
    };
    const ec = createEntityCache({ cacheFactory, clientFactory: () => failingClient });

    await expect(ec.findCached('customers', {})).rejects.toThrow(/network down/);
  });

  it('refreshCached forces a blocking refresh and returns the item count', async () => {
    // Seed with 1 item, then refresh with 3 items
    const seed = cacheFactory();
    seed.putMany('customers', [{ id: 1, customer_name: 'Existing' }]);
    seed.close();

    const client = stubCustomersClient([
      { id: 1, customer_name: 'A', contacts: [], locations: [] },
      { id: 2, customer_name: 'B', contacts: [], locations: [] },
      { id: 3, customer_name: 'C', contacts: [], locations: [] },
    ]);
    const ec = createEntityCache({ cacheFactory, clientFactory: () => client });

    const count = await ec.refreshCached('customers');

    expect(count).toBe(3);
    const verify = cacheFactory();
    expect(verify.status('customers').count).toBe(3);
    verify.close();
  });

  it('withCache provides a scoped ctx sharing one db handle across operations', async () => {
    const seed = cacheFactory();
    seed.putMany('customers', [{ id: 1, customer_name: 'Existing' }]);
    seed.close();

    const client = stubCustomersClient([
      { id: 1, customer_name: 'Updated', contacts: [], locations: [] },
    ]);
    const ec = createEntityCache({ cacheFactory, clientFactory: () => client });

    const result = await ec.withCache(async (ctx) => {
      // ctx exposes db + refresh
      const before = ctx.db.search('customers', {});
      await ctx.refresh('customers');
      const after = ctx.db.search('customers', {});
      return { before, after };
    });

    expect(result.before[0].customer_name).toBe('Existing');
    expect(result.after[0].customer_name).toBe('Updated');
  });
});

/**
 * Build a stub SF client that returns a single-page customers response.
 * Shape matches what the paginator expects: { data: { items, _meta } }.
 */
function stubCustomersClient(items) {
  return {
    get: vi.fn(async (path, { params } = {}) => {
      return {
        data: {
          items,
          _meta: { totalCount: items.length, pageCount: 1, currentPage: 1, perPage: 10 },
        },
      };
    }),
  };
}
