import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import axios from 'axios';
import { fetchAll } from '../../src/utils/paginator.js';

const BASE = 'http://sf-api.test';

/** Helper: create nock for a paginated SF API response */
function mockPage(path, page, items, totalPages) {
  nock(BASE).get(path).query(q => parseInt(q.page) === page).reply(200, {
    items,
    _meta: { totalCount: totalPages * items.length, pageCount: totalPages, currentPage: page, perPage: items.length },
  });
}

function makeItems(page, count = 10) {
  return Array.from({ length: count }, (_, i) => ({ id: (page - 1) * count + i + 1, page }));
}

describe('fetchAll', () => {
  let client;

  beforeEach(() => {
    client = axios.create({ baseURL: BASE });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should fetch all pages sequentially by default and return items in order', async () => {
    const totalPages = 3;
    for (let p = 1; p <= totalPages; p++) {
      mockPage('/jobs', p, makeItems(p), totalPages);
    }

    const items = await fetchAll(client, '/jobs', {}, { showProgress: false });

    expect(items).toHaveLength(30);
    // Items should be in page order: ids 1-10, 11-20, 21-30
    expect(items[0].id).toBe(1);
    expect(items[9].id).toBe(10);
    expect(items[10].id).toBe(11);
    expect(items[29].id).toBe(30);
  });

  it('should fetch pages concurrently when concurrency > 1 and return items in page order', async () => {
    const totalPages = 5;
    for (let p = 1; p <= totalPages; p++) {
      mockPage('/jobs', p, makeItems(p), totalPages);
    }

    const items = await fetchAll(client, '/jobs', {}, { concurrency: 3, showProgress: false });

    expect(items).toHaveLength(50);
    // Must be in page order regardless of completion order
    for (let i = 0; i < 50; i++) {
      expect(items[i].id).toBe(i + 1);
    }
  });

  it('should respect maxPages when fetching concurrently', async () => {
    const totalPages = 10;
    for (let p = 1; p <= totalPages; p++) {
      mockPage('/jobs', p, makeItems(p), totalPages);
    }

    const items = await fetchAll(client, '/jobs', {}, { concurrency: 3, maxPages: 4, showProgress: false });

    expect(items).toHaveLength(40); // 4 pages * 10 items
    expect(items[39].id).toBe(40);
  });

  it('should propagate errors from any concurrent page fetch', async () => {
    mockPage('/jobs', 1, makeItems(1), 5);
    mockPage('/jobs', 2, makeItems(2), 5);
    nock(BASE).get('/jobs').query(q => parseInt(q.page) === 3).reply(500, 'Server Error');
    mockPage('/jobs', 4, makeItems(4), 5);
    mockPage('/jobs', 5, makeItems(5), 5);

    await expect(
      fetchAll(client, '/jobs', {}, { concurrency: 5, showProgress: false })
    ).rejects.toThrow();
  });

  it('should handle single-page API correctly with concurrency', async () => {
    mockPage('/jobs', 1, makeItems(1, 3), 1);

    const items = await fetchAll(client, '/jobs', {}, { concurrency: 5, showProgress: false });

    expect(items).toHaveLength(3);
    expect(items.map(i => i.id)).toEqual([1, 2, 3]);
  });
});
