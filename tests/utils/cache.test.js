import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// We'll create the cache module at src/utils/cache.js
import { createCache } from '../../src/utils/cache.js';

let cacheDir;
let cache;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'sfcli-cache-test-'));
  cache = createCache({ dbPath: join(cacheDir, 'cache.db') });
});

afterEach(() => {
  cache.close();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe('Cache — basic operations', () => {
  it('should store and retrieve a record by entity and ID', () => {
    const customer = { id: 1, customer_name: 'Acme Corp', city: 'Dublin' };
    cache.put('customers', 1, customer);
    const result = cache.get('customers', 1);
    expect(result).toEqual(customer);
  });

  it('should return null for a missing record', () => {
    const result = cache.get('customers', 999);
    expect(result).toBeNull();
  });

  it('should upsert — overwrite existing record', () => {
    cache.put('customers', 1, { id: 1, customer_name: 'Old Name' });
    cache.put('customers', 1, { id: 1, customer_name: 'New Name' });
    const result = cache.get('customers', 1);
    expect(result.customer_name).toBe('New Name');
  });

  it('should store and retrieve raw nested JSON data', () => {
    const customer = {
      id: 1,
      customer_name: 'Kaiser',
      contacts: [
        { fname: 'David', lname: 'Faraone', phones: [{ phone: '4088510060' }], emails: [{ email: 'dave@kp.org' }] },
        { fname: 'Adam', lname: 'Kayhoor', phones: [{ phone: '4088510673' }], emails: [] },
      ],
      locations: [
        { street_1: '710 Lawrence Expy', city: 'SANTA CLARA', state_prov: 'Ca' },
      ],
    };
    cache.put('customers', 1, customer);
    const result = cache.get('customers', 1);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].fname).toBe('David');
    expect(result.locations[0].city).toBe('SANTA CLARA');
  });
});

describe('Cache — search', () => {
  beforeEach(() => {
    cache.putMany('customers', [
      { id: 1, customer_name: 'Kaiser Santa Clara', city: 'SANTA CLARA', state: 'Ca', phone: '4088510060', email: 'dave@kp.org' },
      { id: 2, customer_name: 'Golden Gate Glass', city: 'SAN FRANCISCO', state: 'Ca', phone: '4155520220', email: 'brian@gg.com' },
      { id: 3, customer_name: 'Kaiser Roseville', city: 'ROSEVILLE', state: 'Ca', phone: '9167845920', email: 'aaron@kp.org' },
    ]);
  });

  it('should search by text query matching customer_name', () => {
    const results = cache.search('customers', { q: 'Kaiser' });
    expect(results).toHaveLength(2);
    expect(results.map(r => r.id).sort()).toEqual([1, 3]);
  });

  it('should search case-insensitively', () => {
    const results = cache.search('customers', { q: 'kaiser' });
    expect(results).toHaveLength(2);
  });

  it('should search by city filter', () => {
    const results = cache.search('customers', { city: 'SANTA CLARA' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(1);
  });

  it('should search by partial phone match', () => {
    const results = cache.search('customers', { phone: '408' });
    expect(results).toHaveLength(1); // Only Kaiser SC has 408 prefix
  });

  it('should return all records when no filters provided', () => {
    const results = cache.search('customers', {});
    expect(results).toHaveLength(3);
  });
});

describe('Cache — staleness', () => {
  it('should report entity as fresh within TTL', () => {
    cache.put('customers', 1, { id: 1, customer_name: 'Test' });
    const status = cache.status('customers');
    expect(status.count).toBe(1);
    expect(status.stale).toBe(false);
  });

  it('should report entity as stale when TTL exceeded', () => {
    const shortTtlCache = createCache({
      dbPath: join(cacheDir, 'short-ttl.db'),
      ttlSeconds: 0, // immediately stale
    });
    shortTtlCache.put('customers', 1, { id: 1, customer_name: 'Test' });
    const status = shortTtlCache.status('customers');
    expect(status.stale).toBe(true);
    shortTtlCache.close();
  });

  it('should report null status for uncached entity', () => {
    const status = cache.status('jobs');
    expect(status.count).toBe(0);
    expect(status.stale).toBe(true);
  });
});

describe('Cache — clear', () => {
  it('should clear a specific entity', () => {
    cache.put('customers', 1, { id: 1, customer_name: 'Test' });
    cache.put('jobs', 1, { id: 1, status: 'Scheduled' });
    cache.clear('customers');
    expect(cache.get('customers', 1)).toBeNull();
    expect(cache.get('jobs', 1)).not.toBeNull();
  });

  it('should clear all entities when no entity specified', () => {
    cache.put('customers', 1, { id: 1, customer_name: 'Test' });
    cache.put('jobs', 1, { id: 1, status: 'Scheduled' });
    cache.clear();
    expect(cache.get('customers', 1)).toBeNull();
    expect(cache.get('jobs', 1)).toBeNull();
  });
});

describe('Cache — putMany (bulk insert)', () => {
  it('should insert multiple records efficiently', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      customer_name: `Customer ${i + 1}`,
    }));
    cache.putMany('customers', items);
    expect(cache.status('customers').count).toBe(100);
    expect(cache.get('customers', 50).customer_name).toBe('Customer 50');
  });
});
