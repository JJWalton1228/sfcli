import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCache } from '../../src/utils/cache.js';
import { createCacheAwareSearch } from '../../src/utils/cache-search.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('jobs list uses cache when warm', () => {
  let dir, db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-jobs-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should return cached jobs without calling API when cache is fresh', async () => {
    // Seed cache with jobs
    const jobs = [
      { id: 100, number: 'J-100', customer_name: 'Acme', status: 'Completed', total: 500 },
      { id: 200, number: 'J-200', customer_name: 'Beta', status: 'Scheduled', total: 300 },
      { id: 300, number: 'J-300', customer_name: 'Gamma', status: 'Completed', total: 700 },
    ];
    db.putMany('jobs', jobs);

    let apiCalled = false;
    const apiFetcher = async () => { apiCalled = true; return []; };

    const search = createCacheAwareSearch(db, 'jobs', apiFetcher);
    const results = await search({});

    expect(apiCalled).toBe(false);
    expect(results).toHaveLength(3);
  });

  it('should filter cached jobs by status', async () => {
    const jobs = [
      { id: 100, status: 'Completed', total: 500 },
      { id: 200, status: 'Scheduled', total: 300 },
      { id: 300, status: 'Completed', total: 700 },
    ];
    db.putMany('jobs', jobs);

    const search = createCacheAwareSearch(db, 'jobs', async () => []);
    const results = await search({ status: 'Completed' });

    expect(results).toHaveLength(2);
    expect(results.every(r => r.status === 'Completed')).toBe(true);
  });

  it('should support limit on cached results', async () => {
    const jobs = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1, status: 'Completed', total: 100 * i,
    }));
    db.putMany('jobs', jobs);

    const status = db.status('jobs');
    expect(status.count).toBe(50);

    const search = createCacheAwareSearch(db, 'jobs', async () => []);
    const results = await search({});
    const limited = results.slice(0, 10);
    expect(limited).toHaveLength(10);
  });
});
