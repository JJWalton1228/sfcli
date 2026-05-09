import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCache } from '../../src/utils/cache.js';
import { createCacheAwareSearch } from '../../src/utils/cache-search.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('equipment list uses cache when warm', () => {
  let dir, db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-equip-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns equipment for a customer from cache without calling API', async () => {
    db.putMany('equipment', [
      { id: 1, customer_id: 42, type: 'HVAC', make: 'Trane', model: 'XR16' },
      { id: 2, customer_id: 42, type: 'Furnace', make: 'Lennox', model: 'SL280' },
      { id: 3, customer_id: 99, type: 'HVAC', make: 'Carrier', model: 'Infinity' },
    ]);

    let apiCalled = false;
    const apiFetcher = async () => { apiCalled = true; return []; };

    const search = createCacheAwareSearch(db, 'equipment', apiFetcher);
    const results = await search({ customer_id: 42 });

    expect(apiCalled).toBe(false);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.customer_id === 42)).toBe(true);
  });

  it('falls back to API fetcher when cache is empty', async () => {
    let apiCalled = false;
    const apiFetcher = async () => {
      apiCalled = true;
      return [
        { id: 10, customer_id: 7, type: 'Boiler', make: 'Weil-McLain' },
      ];
    };

    const search = createCacheAwareSearch(db, 'equipment', apiFetcher);
    const results = await search({ customer_id: 7 });

    expect(apiCalled).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].make).toBe('Weil-McLain');
  });

  it('bypasses cache when noCache option is set', async () => {
    db.putMany('equipment', [
      { id: 1, customer_id: 42, type: 'HVAC', make: 'Old Cached' },
    ]);

    let apiCalled = false;
    const apiFetcher = async () => {
      apiCalled = true;
      return [{ id: 1, customer_id: 42, type: 'HVAC', make: 'Fresh From API' }];
    };

    const search = createCacheAwareSearch(db, 'equipment', apiFetcher);
    const results = await search({ customer_id: 42 }, { noCache: true });

    expect(apiCalled).toBe(true);
    expect(results[0].make).toBe('Fresh From API');
  });
});
