import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';
import { searchLocations } from '../../src/commands/locations.js';

/**
 * Integration tests for the locations command search logic.
 * Seeds a real SQLite cache, then asserts searchLocations() returns correct results.
 */
describe('locations command', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-loc-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });

    // Seed two customers with multiple locations
    db.putMany('customers', [
      {
        id: 1, customer_name: 'Acme Corp',
        contacts: [],
        locations: [
          { id: 50, street_1: '123 Main St', street_2: 'Suite 100', city: 'Austin', state_prov: 'TX', postal_code: '78701', is_primary: true },
          { id: 51, street_1: '456 Oak Ave', city: 'Dallas', state_prov: 'TX', postal_code: '75201', is_primary: false },
        ],
      },
      {
        id: 2, customer_name: 'Beta Inc',
        contacts: [],
        locations: [
          { id: 60, street_1: '789 Elm St', city: 'Austin', state_prov: 'TX', postal_code: '78702', is_primary: true },
          { id: 61, street_1: '321 Pine Rd', city: 'Houston', state_prov: 'TX', postal_code: '77001', is_primary: false },
        ],
      },
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists all locations with customer_name', () => {
    const results = searchLocations(db, {});
    expect(results).toHaveLength(4);
    expect(results[0]).toHaveProperty('customer_name');
  });

  it('filters by city', () => {
    const results = searchLocations(db, { city: 'Austin' });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.city === 'Austin')).toBe(true);
  });

  it('filters by state', () => {
    const results = searchLocations(db, { state: 'TX' });
    expect(results).toHaveLength(4);
  });

  it('filters by zip', () => {
    const results = searchLocations(db, { zip: '78701' });
    expect(results).toHaveLength(1);
    expect(results[0].street_1).toBe('123 Main St');
  });

  it('filters by street substring', () => {
    const results = searchLocations(db, { street: 'Oak' });
    expect(results).toHaveLength(1);
    expect(results[0].city).toBe('Dallas');
  });

  it('filters by customer name', () => {
    const results = searchLocations(db, { customer: 'Beta' });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.customer_name === 'Beta Inc')).toBe(true);
  });

  it('filters by customer ID', () => {
    const results = searchLocations(db, { customer: '1' });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.customer_name === 'Acme Corp')).toBe(true);
  });

  it('filters by is_primary', () => {
    const results = searchLocations(db, { isPrimary: true });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.is_primary === 1)).toBe(true);
  });

  it('combines filters', () => {
    const results = searchLocations(db, { city: 'Austin', customer: 'Acme' });
    expect(results).toHaveLength(1);
    expect(results[0].street_1).toBe('123 Main St');
  });

  it('returns empty array when no match', () => {
    const results = searchLocations(db, { city: 'Chicago' });
    expect(results).toEqual([]);
  });
});
