import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCache } from '../../src/utils/cache.js';

describe('jobs enhanced filters', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sfcli-jf-'));
    db = createCache({ dbPath: join(dir, 'cache.db') });

    db.putMany('techs', [
      { id: 5, first_name: 'Mike', last_name: 'Johnson', department: 'HVAC' },
      { id: 8, first_name: 'Dan', last_name: 'Lee', department: 'Plumbing' },
    ]);

    db.putMany('customers', [
      { id: 1, customer_name: 'Acme Corp', contacts: [], locations: [] },
      { id: 2, customer_name: 'Beta Inc', contacts: [], locations: [] },
    ]);

    db.putMany('jobs', [
      { id: 100, customer_id: 1, customer_name: 'Acme Corp', status: 'Completed',
        description: 'Fix HVAC unit', start_date: '2025-03-15', total: 500,
        city: 'Austin', state_prov: 'TX', postal_code: '78701',
        techs_assigned: [{ id: 5, first_name: 'Mike' }] },
      { id: 101, customer_id: 1, customer_name: 'Acme Corp', status: 'Open',
        description: 'Install thermostat', start_date: '2025-06-01', total: 200,
        city: 'Dallas', state_prov: 'TX', postal_code: '75201',
        techs_assigned: [{ id: 8, first_name: 'Dan' }] },
      { id: 102, customer_id: 2, customer_name: 'Beta Inc', status: 'Completed',
        description: 'Plumbing repair', start_date: '2025-01-10', total: 1500,
        city: 'Houston', state_prov: 'TX', postal_code: '77001',
        techs_assigned: [{ id: 5 }, { id: 8 }] },
    ]);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('filters by status', () => {
    const results = db.search('jobs', { status: 'Completed' });
    expect(results).toHaveLength(2);
  });

  it('filters by customer_id', () => {
    const results = db.search('jobs', { customer_id: 1 });
    expect(results).toHaveLength(2);
  });

  it('filters by tech name', () => {
    const results = db.search('jobs', { tech: 'Mike' });
    expect(results).toHaveLength(2); // jobs 100 and 102
  });

  it('filters by customer name', () => {
    const results = db.search('jobs', { customerName: 'Beta' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(102);
  });

  it('filters by city', () => {
    const results = db.search('jobs', { city: 'Austin' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(100);
  });

  it('filters by date range', () => {
    const results = db.search('jobs', { dateFrom: '2025-03-01', dateTo: '2025-04-01' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(100);
  });

  it('filters by min and max total', () => {
    const results = db.search('jobs', { minTotal: 400, maxTotal: 600 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(100);
  });

  it('combines filters', () => {
    const results = db.search('jobs', { status: 'Completed', tech: 'Dan' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(102);
  });
});
