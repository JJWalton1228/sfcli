import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCache } from '../../src/utils/cache.js';
import { refreshEntity, ENTITY_NAMES } from '../../src/cache/refreshers.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * refreshEntity is the shared helper both `sfcli cache refresh` and
 * post-sync cache refresh use to populate the SQLite cache from the SF API.
 */
describe('refreshEntity', () => {
  let dir, db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-ref-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('exposes the canonical entity list', () => {
    expect(ENTITY_NAMES).toEqual(['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment']);
  });

  it('throws on unknown entity', async () => {
    const client = { get: vi.fn() };
    await expect(refreshEntity(client, db, 'widgets')).rejects.toThrow(/unknown/i);
  });

  it('fetches jobs via the paginator and stores them in the cache', async () => {
    // Stub the SF client to look like a paged response
    const client = {
      get: vi.fn(async (path, { params } = {}) => {
        if (params?.page === 1 || !params?.page) {
          return {
            data: {
              items: [
                { id: 1, status: 'Completed' },
                { id: 2, status: 'Scheduled' },
              ],
              _meta: { totalCount: 2, pageCount: 1, currentPage: 1, perPage: 10 },
            },
          };
        }
        return { data: { items: [], _meta: { totalCount: 2, pageCount: 1, currentPage: 1, perPage: 10 } } };
      }),
    };

    const count = await refreshEntity(client, db, 'jobs');

    expect(count).toBe(2);
    expect(db.status('jobs').count).toBe(2);
    expect(db.search('jobs', {}).map(j => j.id).sort()).toEqual([1, 2]);
  });
});
