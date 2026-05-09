import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';

/**
 * Tests for enhanced customer search filters.
 * Uses the cache.search('customers', filters) interface.
 */
describe('customer enhanced filters', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-cf-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });

    db.putMany('customers', [
      {
        id: 1, customer_name: 'Acme Corp',
        contacts: [
          { id: 10, fname: 'John', lname: 'Doe', is_primary: true, phones: [], emails: [] },
        ],
        locations: [
          { id: 50, street_1: '123 Main St', city: 'Austin', state_prov: 'TX', postal_code: '78701', is_primary: true },
          { id: 51, street_1: '456 Oak Ave', city: 'Dallas', state_prov: 'TX', postal_code: '75201', is_primary: false },
        ],
      },
      {
        id: 2, customer_name: 'Beta Inc',
        contacts: [
          { id: 20, fname: 'Jane', lname: 'Smith', is_primary: true, phones: [], emails: [] },
        ],
        locations: [
          { id: 60, street_1: '789 Elm St', city: 'Houston', state_prov: 'TX', postal_code: '77001', is_primary: true },
        ],
      },
    ]);

    // Add some jobs for date-based filters
    db.putMany('jobs', [
      { id: 100, customer_id: 1, status: 'Completed', start_date: '2025-06-15', total: 500 },
      { id: 101, customer_id: 1, status: 'Completed', start_date: '2024-01-10', total: 300 },
      { id: 102, customer_id: 2, status: 'Completed', start_date: '2024-01-05', total: 200 },
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds customers by city across all locations (not just primary)', () => {
    const results = db.search('customers', { city: 'Dallas' });
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Acme Corp');
  });

  it('finds customers by street substring', () => {
    const results = db.search('customers', { street: 'Oak' });
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Acme Corp');
  });

  it('finds customers by contact name', () => {
    const results = db.search('customers', { contactName: 'Jane' });
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Beta Inc');
  });

  it('finds customers with jobs since a date', () => {
    const results = db.search('customers', { hasJobsSince: '2025-01-01' });
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Acme Corp');
  });

  it('finds customers with no jobs since a date', () => {
    const results = db.search('customers', { noJobsSince: '2025-01-01' });
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Beta Inc');
  });

  it('deduplicates when multiple locations match', () => {
    // Both Austin and Dallas are in TX
    const results = db.search('customers', { state: 'TX' });
    // Should get 2 customers, not 3 (Acme has 2 TX locations)
    expect(results).toHaveLength(2);
  });

  it('combines location and job filters', () => {
    const results = db.search('customers', { city: 'Austin', hasJobsSince: '2025-01-01' });
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Acme Corp');
  });
});
