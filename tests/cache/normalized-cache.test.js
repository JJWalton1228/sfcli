import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';

/**
 * Integration tests for the normalized cache layer.
 * Tests that putMany + search + get round-trip through normalized tables.
 */
describe('normalized cache', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-ncache-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  // --- customers ---

  it('stores and retrieves customers via putMany and search', () => {
    db.putMany('customers', [
      { id: 1, customer_name: 'Acme Corp', contacts: [], locations: [] },
      { id: 2, customer_name: 'Globex', contacts: [], locations: [] },
    ]);

    const results = db.search('customers', {});
    expect(results).toHaveLength(2);
    expect(results.map(r => r.customer_name).sort()).toEqual(['Acme Corp', 'Globex']);
  });

  it('stores customer locations and makes them searchable by city', () => {
    db.putMany('customers', [{
      id: 1,
      customer_name: 'Acme Corp',
      contacts: [],
      locations: [
        { id: 50, city: 'Austin', state_prov: 'TX', postal_code: '78701', is_primary: true },
        { id: 51, city: 'Dallas', state_prov: 'TX', postal_code: '75201', is_primary: false },
      ],
    }]);

    // Search by city should match any location, not just primary
    const byAustin = db.search('customers', { city: 'Austin' });
    expect(byAustin).toHaveLength(1);
    expect(byAustin[0].customer_name).toBe('Acme Corp');

    const byDallas = db.search('customers', { city: 'Dallas' });
    expect(byDallas).toHaveLength(1);

    const byHouston = db.search('customers', { city: 'Houston' });
    expect(byHouston).toHaveLength(0);
  });

  it('searches customers by state across all locations', () => {
    db.putMany('customers', [
      { id: 1, customer_name: 'Acme', contacts: [], locations: [
        { id: 50, city: 'Austin', state_prov: 'TX', is_primary: true },
      ]},
      { id: 2, customer_name: 'Globex', contacts: [], locations: [
        { id: 60, city: 'LA', state_prov: 'CA', is_primary: true },
      ]},
    ]);

    const tx = db.search('customers', { state: 'TX' });
    expect(tx).toHaveLength(1);
    expect(tx[0].customer_name).toBe('Acme');
  });

  it('searches customers by phone across all contacts', () => {
    db.putMany('customers', [{
      id: 1,
      customer_name: 'Acme',
      contacts: [
        { id: 10, fname: 'John', lname: 'Doe', is_primary: true, phones: [{ phone: '555-1234' }], emails: [] },
      ],
      locations: [],
    }]);

    const results = db.search('customers', { phone: '5551234' });
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Acme');
  });

  it('searches customers by email', () => {
    db.putMany('customers', [{
      id: 1,
      customer_name: 'Acme',
      contacts: [
        { id: 10, fname: 'John', is_primary: true, phones: [], emails: [{ email: 'john@acme.com' }] },
      ],
      locations: [],
    }]);

    const results = db.search('customers', { email: 'john@acme.com' });
    expect(results).toHaveLength(1);
  });

  it('searches customers with free-text query against name', () => {
    db.putMany('customers', [
      { id: 1, customer_name: 'Acme Corp', contacts: [], locations: [] },
      { id: 2, customer_name: 'Beta Inc', contacts: [], locations: [] },
    ]);

    const results = db.search('customers', { q: 'acme' });
    expect(results).toHaveLength(1);
    expect(results[0].customer_name).toBe('Acme Corp');
  });

  it('deduplicates customers when multiple locations match', () => {
    db.putMany('customers', [{
      id: 1,
      customer_name: 'Acme',
      contacts: [],
      locations: [
        { id: 50, city: 'Austin', state_prov: 'TX', is_primary: true },
        { id: 51, city: 'Austin', state_prov: 'TX', is_primary: false },
      ],
    }]);

    const results = db.search('customers', { city: 'Austin' });
    expect(results).toHaveLength(1);
  });

  it('retrieves a single customer by ID with get()', () => {
    db.putMany('customers', [
      { id: 1, customer_name: 'Acme Corp', contacts: [], locations: [] },
    ]);

    const cust = db.get('customers', 1);
    expect(cust).not.toBeNull();
    expect(cust.customer_name).toBe('Acme Corp');
  });

  // --- jobs ---

  it('stores and retrieves jobs', () => {
    db.putMany('jobs', [
      { id: 100, customer_id: 1, customer_name: 'Acme', status: 'Completed', total: 500 },
      { id: 101, customer_id: 1, customer_name: 'Acme', status: 'Open', total: 200 },
    ]);

    const results = db.search('jobs', {});
    expect(results).toHaveLength(2);
  });

  it('filters jobs by status', () => {
    db.putMany('jobs', [
      { id: 100, status: 'Completed', total: 500 },
      { id: 101, status: 'Open', total: 200 },
    ]);

    const completed = db.search('jobs', { status: 'Completed' });
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe(100);
  });

  it('filters jobs by customer_id', () => {
    db.putMany('jobs', [
      { id: 100, customer_id: 1, status: 'Open' },
      { id: 101, customer_id: 2, status: 'Open' },
    ]);

    const results = db.search('jobs', { customer_id: 1 });
    expect(results).toHaveLength(1);
  });

  // --- invoices ---

  it('stores and retrieves invoices', () => {
    db.putMany('invoices', [
      { id: 300, customer: 'Acme', total: 1000, is_paid: true },
    ]);

    const results = db.search('invoices', {});
    expect(results).toHaveLength(1);
  });

  // --- techs ---

  it('stores and retrieves techs', () => {
    db.putMany('techs', [
      { id: 5, first_name: 'Mike', last_name: 'Johnson', department: 'HVAC' },
    ]);

    const results = db.search('techs', {});
    expect(results).toHaveLength(1);
    expect(results[0].first_name).toBe('Mike');
  });

  // --- equipment ---

  it('stores and retrieves equipment', () => {
    db.putMany('equipment', [
      { id: 400, customer_id: 1, type: 'HVAC', make: 'Carrier', model: '24ACC' },
    ]);

    const results = db.search('equipment', {});
    expect(results).toHaveLength(1);
    expect(results[0].make).toBe('Carrier');
  });

  // --- estimates ---

  it('stores and retrieves estimates', () => {
    db.putMany('estimates', [
      { id: 200, customer_id: 1, customer_name: 'Acme', status: 'Approved', total: 3000 },
    ]);

    const results = db.search('estimates', {});
    expect(results).toHaveLength(1);
  });

  // --- status / clear ---

  it('reports correct status after putMany', () => {
    db.putMany('customers', [
      { id: 1, customer_name: 'A', contacts: [], locations: [] },
      { id: 2, customer_name: 'B', contacts: [], locations: [] },
    ]);

    const status = db.status('customers');
    expect(status.count).toBe(2);
    expect(status.stale).toBe(false);
    expect(status.refreshedAt).not.toBeNull();
  });

  it('clears a single entity', () => {
    db.putMany('customers', [
      { id: 1, customer_name: 'A', contacts: [], locations: [] },
    ]);
    db.putMany('jobs', [{ id: 100, status: 'Open' }]);

    db.clear('customers');

    expect(db.status('customers').count).toBe(0);
    expect(db.status('jobs').count).toBe(1);
  });

  it('clears all entities', () => {
    db.putMany('customers', [{ id: 1, customer_name: 'A', contacts: [], locations: [] }]);
    db.putMany('jobs', [{ id: 100, status: 'Open' }]);

    db.clear();

    expect(db.status('customers').count).toBe(0);
    expect(db.status('jobs').count).toBe(0);
  });
});
